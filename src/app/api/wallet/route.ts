import { handleError, ok, requireAuth } from "@/lib/api";
import { getStatement } from "@/lib/payments/wallet";
import { isPaymentsConfigured, mode } from "@/lib/payments/razorpay";
import { TOP_UP_PRESETS_PAISE, WALLET_LIMITS } from "@/lib/payments/fields";

/**
 * GET /api/wallet — balance, recent movements, and what the screen may offer.
 *
 * The limits travel with the data for the same reason the notification
 * preferences carry their own vocabulary: the screen renders from one request
 * and cannot offer a top-up the server would refuse. A minimum hard-coded in the
 * UI is a minimum that drifts from the one actually enforced.
 *
 * `paymentsEnabled` is what lets the screen say "not set up yet" instead of
 * showing a button that fails on tap.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const statement = await getStatement(session.sub, { limit: 10 });

    return ok({
      ...statement,
      paymentsEnabled: isPaymentsConfigured(),
      /**
       * Surfaced so a test deployment says so on screen. A wallet that looks
       * identical in test and live is one where somebody eventually demonstrates
       * a "payment" to a student using a real card.
       */
      mode: mode(),
      limits: {
        minTopUpPaise: WALLET_LIMITS.minTopUpPaise,
        maxTopUpPaise: WALLET_LIMITS.maxTopUpPaise,
        maxBalancePaise: WALLET_LIMITS.maxBalancePaise,
      },
      presetsPaise: TOP_UP_PRESETS_PAISE,
    });
  } catch (err) {
    return handleError(err);
  }
}
