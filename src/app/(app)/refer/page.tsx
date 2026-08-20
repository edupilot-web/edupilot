import type { Metadata } from "next";
import { ComingSoon } from "@/components/app/coming-soon";
import { APP_ROUTES } from "@/lib/app-routes";

export const metadata: Metadata = { title: "Refer & Earn · EduPilot" };

export default function Page() {
  return <ComingSoon href={APP_ROUTES.refer} />;
}
