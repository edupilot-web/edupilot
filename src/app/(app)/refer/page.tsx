import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReferScreen } from "@/components/app/refer-screen";
import { getCurrentUser } from "@/lib/current-user";
import { getSummary } from "@/lib/referrals/service";
import { shareUrlFor } from "@/lib/referrals/fields";
import { appUrl } from "@/lib/app-url";

export const metadata: Metadata = { title: "Refer & Earn · EduPilot" };

/**
 * Refer & Earn.
 *
 * The share link is built **server-side** from the configured app URL rather
 * than from `window.location`. A link built in the browser carries whatever
 * host the student happened to be on — a preview deployment, a tunnel, an IP
 * address — and a referral link that points at a URL their friend cannot reach
 * fails silently and looks like the programme not working.
 *
 * Issuing the code is a side effect of opening this page, which is the right
 * moment: nobody needs one until they look.
 */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const summary = await getSummary(user.id);

  return (
    <ReferScreen
      summary={{ ...summary, shareUrl: shareUrlFor(appUrl(), summary.code) }}
    />
  );
}
