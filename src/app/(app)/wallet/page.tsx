import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WalletScreen } from "@/components/app/wallet-screen";
import { getCurrentUser } from "@/lib/current-user";
import { getStatement } from "@/lib/payments/wallet";
import { isPaymentsConfigured, mode } from "@/lib/payments/razorpay";
import { TOP_UP_PRESETS_PAISE, WALLET_LIMITS } from "@/lib/payments/fields";

export const metadata: Metadata = { title: "Campus Wallet · EduPilot" };

/**
 * The campus wallet.
 *
 * Server-rendered from the ledger so the balance is correct on arrival rather
 * than flashing zero — this is the one screen where a wrong number for half a
 * second is alarming rather than cosmetic.
 *
 * The limits and the mode travel with the data so the screen cannot offer a
 * top-up the server would refuse, and cannot look identical in test and live.
 */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const statement = await getStatement(user.id, { limit: 10 });

  return (
    <WalletScreen
      initial={{
        ...statement,
        paymentsEnabled: isPaymentsConfigured(),
        mode: mode(),
        limits: {
          minTopUpPaise: WALLET_LIMITS.minTopUpPaise,
          maxTopUpPaise: WALLET_LIMITS.maxTopUpPaise,
          maxBalancePaise: WALLET_LIMITS.maxBalancePaise,
        },
        presetsPaise: TOP_UP_PRESETS_PAISE,
      }}
    />
  );
}
