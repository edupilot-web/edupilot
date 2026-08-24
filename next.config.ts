import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Enables `forbidden()` and `unauthorized()` from `next/navigation`.
     *
     * The admin app needs a real 403: an administrator who follows a link to
     * something their role does not cover should be told so, not silently
     * bounced to the dashboard — a silent bounce reads as a broken link and
     * turns into a support ticket. `src/app/(admin)/forbidden.tsx` renders it.
     */
    authInterrupts: true,
  },
};

export default nextConfig;
