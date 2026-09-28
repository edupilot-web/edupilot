/**
 * Makes every cached wallet balance agree with its ledger, then exits.
 *
 * Two jobs, and the first is why this must actually be scheduled:
 *
 * 1. **Apply stranded rows.** Crediting a wallet is two writes — insert the
 *    ledger row, then move the balance — and a process that dies between them
 *    leaves money recorded but not landed. That window is deliberate: the order
 *    means a crash *under*-credits, which is detectable and fixable, rather than
 *    double-crediting, which is neither. This is the fix.
 * 2. **Re-sum.** The ledger is authoritative, so any disagreement is resolved by
 *    recomputing the cache from it. It should find nothing. Its finding
 *    something is the only way we would ever know.
 *
 * Idempotent and lock-free, so running it twice costs two queries and changes
 * nothing the second time. Run it every 15–30 minutes.
 *
 * Also ages out abandoned payment orders, which is cosmetic but keeps the
 * student's payment history meaning something.
 *
 *   npm run reconcile:wallets
 */
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { reconcileWallets } from "../src/lib/payments/wallet";
import { expireStaleOrders } from "../src/lib/payments/orders";
import { formatPaise } from "../src/lib/payments/fields";

async function main() {
  await connectDB();
  console.log("connected to", mongoose.connection.name);

  const report = await reconcileWallets({ graceMinutes: 10 });
  const expired = await expireStaleOrders();

  console.log(`wallets checked:  ${report.walletsChecked}`);
  console.log(`stranded applied: ${report.applied}`);
  console.log(`orders expired:   ${expired}`);

  if (report.corrected.length) {
    /**
     * Loud on purpose.
     *
     * A cached balance that disagreed with its ledger means a write did not
     * complete, and while the correction is automatic the *cause* is not
     * something to discover from a silent log line.
     */
    console.error(`\n${report.corrected.length} balance(s) did not match the ledger:`);
    for (const entry of report.corrected) {
      console.error(
        `  user ${entry.userId}: cached ${formatPaise(entry.cachedPaise)} -> ledger ${formatPaise(entry.ledgerPaise)}`
      );
    }
  } else {
    console.log("\nEvery balance matches its ledger.");
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
