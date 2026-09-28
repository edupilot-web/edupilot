/**
 * The admin sidebar (spec §45).
 *
 * Plain data with no React imports, so the sidebar, the command palette, the
 * breadcrumb builder and the "not built yet" placeholder all read one list. A
 * second copy anywhere is how a menu entry and its page drift apart.
 *
 * Every item declares the permissions that make it reachable. The sidebar hides
 * what an admin cannot open — a menu full of links that 403 is worse than a
 * shorter menu — but hiding is presentation, not protection: each page calls
 * `requirePermission` itself.
 *
 * `built: false` marks a destination whose screen is not written yet. Those
 * render a placeholder that says so, rather than 404ing or, worse, showing an
 * empty table that reads as "no data".
 */
export type AdminNavItem = {
  label: string;
  href: string;
  /** Any one of these grants access. Empty means "any signed-in admin". */
  permissions: string[];
  /** One line describing the screen. Shown on placeholders and in the palette. */
  blurb: string;
  built?: boolean;
  /** Keeps the parent highlighted on nested routes like /admin/colleges/:id. */
  matchPrefix?: boolean;
  /** Extra terms the command palette should match on. */
  keywords?: string[];
};

export type AdminNavSection = {
  key: string;
  heading: string;
  /** Icon name resolved in `admin-nav-icons.tsx`. Kept as a string so this file stays data. */
  icon: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavSection[] = [
  {
    key: "dashboard",
    heading: "Dashboard",
    icon: "dashboard",
    items: [
      {
        label: "Overview",
        href: "/admin",
        permissions: [],
        blurb: "Platform KPIs, growth, the registration funnel and what needs attention.",
        built: true,
        keywords: ["home", "kpi", "summary"],
      },
      {
        label: "Platform Health",
        href: "/admin/health",
        permissions: ["system.view"],
        blurb: "Database, email, jobs and API status at a glance.",
        built: true,
        keywords: ["status", "uptime", "monitoring"],
      },
      {
        label: "Activity Summary",
        href: "/admin/activity",
        permissions: ["audit.view"],
        blurb: "What administrators and the platform have done recently.",
        built: true,
        keywords: ["recent", "feed"],
      },
    ],
  },
  {
    key: "institutions",
    heading: "Institution Management",
    icon: "building",
    items: [
      {
        label: "Colleges",
        href: "/admin/colleges",
        permissions: ["college.view"],
        blurb: "The college directory: search, filter, verify and bulk-edit.",
        built: true,
        matchPrefix: true,
        keywords: ["institution", "campus", "engineering", "degree college"],
      },
      {
        label: "Universities",
        href: "/admin/universities",
        permissions: ["university.view"],
        blurb: "Affiliating bodies and the colleges under each.",
        built: true,
        matchPrefix: true,
        keywords: ["jntu", "affiliating", "deemed"],
      },
      {
        label: "Affiliations",
        href: "/admin/affiliations",
        permissions: ["college.view"],
        blurb: "Every college–university relationship, including historical ones.",
        built: true,
        matchPrefix: true,
        keywords: ["history", "transfer"],
      },
      {
        label: "Campuses",
        href: "/admin/campuses",
        permissions: ["academic.view"],
        blurb: "Additional campuses belonging to a college.",
        keywords: ["branch", "location"],
      },
      {
        label: "Departments",
        href: "/admin/departments",
        permissions: ["academic.view"],
        blurb: "Departments across every college, and the branches they map to.",
        built: true,
        matchPrefix: true,
        keywords: ["branch", "cse", "ece", "hod"],
      },
      {
        label: "Teachers",
        href: "/admin/teachers",
        permissions: ["teacher.view"],
        blurb: "Approve teacher accounts and decide which subjects each one may publish to.",
        built: true,
        matchPrefix: true,
        keywords: ["teacher", "staff", "faculty", "approve", "assign", "subject"],
      },
      {
        label: "Courses / Programs",
        href: "/admin/programs",
        permissions: ["academic.view"],
        blurb: "Degrees and specializations offered, with duration and intake.",
        built: true,
        matchPrefix: true,
        keywords: ["btech", "mba", "degree", "program", "course"],
      },
      {
        label: "Academic Years",
        href: "/admin/academic-years",
        permissions: ["academic.view"],
        blurb: "The academic calendar that admissions and progression are keyed to.",
        keywords: ["session", "calendar"],
      },
      {
        label: "Verification",
        href: "/admin/verification",
        permissions: ["college.verify", "university.verify", "student.verify"],
        blurb: "One queue for everything waiting on an administrator's decision.",
        built: true,
        matchPrefix: true,
        keywords: ["approve", "reject", "queue", "pending"],
      },
      {
        label: "Import / Export",
        href: "/admin/imports",
        permissions: ["college.import", "college.export"],
        blurb: "Bulk import from CSV or Excel, and exports of filtered data.",
        built: true,
        matchPrefix: true,
        keywords: ["csv", "excel", "xlsx", "upload", "bulk", "download"],
      },
      {
        label: "Data Quality",
        href: "/admin/data-quality",
        permissions: ["college.view"],
        blurb: "Duplicates, gaps and conflicts, ranked by how much they matter.",
        built: true,
        matchPrefix: true,
        keywords: ["duplicate", "missing", "cleanup", "hygiene"],
      },
      {
        label: "Geography",
        href: "/admin/geography",
        permissions: ["geography.view"],
        blurb: "States, districts and cities — the spine of every location field.",
        built: true,
        matchPrefix: true,
        keywords: ["state", "district", "city", "pincode"],
      },
    ],
  },
  {
    key: "students",
    heading: "Student Management",
    icon: "users",
    items: [
      {
        label: "Students",
        href: "/admin/students",
        permissions: ["student.view"],
        blurb: "Every registered student, their college and their profile state.",
        built: true,
        matchPrefix: true,
        keywords: ["user", "account", "learner"],
      },
      {
        label: "Pending Verification",
        href: "/admin/students?verification=pending",
        permissions: ["student.verify"],
        blurb: "Students waiting on an identity or college check.",
        built: true,
      },
      {
        label: "Incomplete Profiles",
        href: "/admin/students?profile=incomplete",
        permissions: ["student.view"],
        blurb: "Registered but never finished onboarding.",
        built: true,
      },
      {
        label: "Suspended",
        href: "/admin/students?status=suspended",
        permissions: ["student.view"],
        blurb: "Accounts an administrator has suspended.",
        built: true,
      },
      {
        label: "Student Activity",
        href: "/admin/students/activity",
        permissions: ["student.view"],
        blurb: "Sign-ins, profile changes and engagement over time.",
      },
    ],
  },
  {
    key: "content",
    heading: "Content",
    icon: "file",
    items: [
      { label: "Posts", href: "/admin/content/posts", permissions: ["content.view"], blurb: "Student and platform posts." },
      { label: "Articles", href: "/admin/content/articles", permissions: ["content.view"], blurb: "Long-form resources and guides." },
      { label: "Events", href: "/admin/content/events", permissions: ["content.view"], blurb: "Campus and platform events." },
      { label: "Opportunities", href: "/admin/content/opportunities", permissions: ["content.view"], blurb: "Internships, jobs and competitions." },
      { label: "Announcements", href: "/admin/content/announcements", permissions: ["content.view"], blurb: "Platform-wide notices." },
      { label: "Categories", href: "/admin/content/categories", permissions: ["content.view"], blurb: "The taxonomy content is filed under." },
      { label: "Tags", href: "/admin/content/tags", permissions: ["content.view"], blurb: "Free-form labels across content types." },
    ],
  },
  {
    key: "community",
    heading: "Community",
    icon: "chat",
    items: [
      { label: "Connections", href: "/admin/community/connections", permissions: ["moderation.view"], blurb: "Who is connected to whom." },
      { label: "Groups", href: "/admin/community/groups", permissions: ["moderation.view"], blurb: "Student-run communities." },
      { label: "Reports", href: "/admin/community/reports", permissions: ["moderation.view"], blurb: "Content and accounts students have reported." },
      { label: "Moderation", href: "/admin/community/moderation", permissions: ["moderation.view"], blurb: "The queue of things awaiting a decision." },
    ],
  },
  {
    key: "notifications",
    heading: "Notifications",
    icon: "bell",
    items: [
      { label: "Templates", href: "/admin/notifications/templates", permissions: ["notification.view"], blurb: "Email, push and in-app message templates." },
      { label: "Campaigns", href: "/admin/notifications/campaigns", permissions: ["notification.view"], blurb: "Scheduled and sent broadcasts." },
      { label: "History", href: "/admin/notifications/history", permissions: ["notification.view"], blurb: "Every message sent, and what happened to it." },
      { label: "Failed", href: "/admin/notifications/failed", permissions: ["notification.view"], blurb: "Deliveries that bounced or errored." },
    ],
  },
  {
    key: "analytics",
    heading: "Analytics",
    icon: "chart",
    items: [
      {
        label: "Overview",
        href: "/admin/analytics",
        permissions: ["analytics.view"],
        blurb: "Growth, engagement and the registration funnel.",
        built: true,
        keywords: ["report", "metrics", "stats"],
      },
      {
        label: "Students",
        href: "/admin/analytics/students",
        permissions: ["analytics.view"],
        blurb: "Registration, completion and retention by cohort.",
        built: true,
      },
      {
        label: "Institutions",
        href: "/admin/analytics/institutions",
        permissions: ["analytics.view"],
        blurb: "Colleges by type, university and verification state.",
        built: true,
      },
      {
        label: "Geography",
        href: "/admin/analytics/geography",
        permissions: ["analytics.view"],
        blurb: "State → district → city drill-down for students and colleges.",
        built: true,
        keywords: ["map", "state", "district"],
      },
      {
        label: "Engagement",
        href: "/admin/analytics/engagement",
        permissions: ["analytics.view"],
        blurb: "Posts, connections, events and content interaction.",
      },
    ],
  },
  {
    key: "ai-learning",
    heading: "AI & Learning",
    icon: "spark",
    items: [
      {
        label: "AI Course Content",
        href: "/admin/ai/course-content",
        permissions: ["ai_course_content.view"],
        blurb: "Generate curriculum-aligned learning content for a subject.",
        built: true,
        matchPrefix: true,
        keywords: ["ai", "generate", "syllabus", "curriculum", "subject", "gemini"],
      },
      {
        label: "AI Content Library",
        href: "/admin/ai/content-library",
        permissions: ["ai_course_content.view"],
        blurb: "Every piece of generated content, with its status and version.",
        built: true,
        matchPrefix: true,
        keywords: ["library", "generated", "published", "drafts"],
      },
      {
        label: "AI Generation Jobs",
        href: "/admin/ai/generation-jobs",
        permissions: ["ai_course_content.view"],
        blurb: "Queued, running and failed generation runs.",
        built: true,
        matchPrefix: true,
        keywords: ["jobs", "queue", "retry", "failed", "tokens"],
      },
      {
        label: "Topic Content",
        href: "/admin/ai/topic-content",
        permissions: ["topic_content.view"],
        blurb: "The prepared explanation students read on each topic, and its review queue.",
        built: true,
        matchPrefix: true,
        keywords: ["topic", "explanation", "review", "publish", "tutor", "learning"],
      },
      {
        label: "AI Settings",
        href: "/admin/ai/settings",
        permissions: ["ai_settings.view"],
        blurb: "Provider, model, generation tuning, safety and cost monitoring.",
        built: true,
        matchPrefix: true,
        keywords: ["provider", "gemini", "ollama", "model", "temperature", "cost"],
      },
    ],
  },
  {
    key: "administration",
    heading: "Administration",
    icon: "shield",
    items: [
      {
        label: "Admin Users",
        href: "/admin/team",
        permissions: ["admin.view"],
        blurb: "Who has administrative access, and what they can do.",
        built: true,
        matchPrefix: true,
        keywords: ["staff", "team", "invite"],
      },
      {
        label: "Roles & Permissions",
        href: "/admin/roles",
        permissions: ["admin.view"],
        blurb: "The permission bundles administrators are assigned.",
        built: true,
        matchPrefix: true,
        keywords: ["rbac", "access", "grant"],
      },
      {
        label: "Audit Logs",
        href: "/admin/audit",
        permissions: ["audit.view"],
        blurb: "Every administrative action, with before and after values.",
        built: true,
        matchPrefix: true,
        keywords: ["history", "trail", "who changed"],
      },
      {
        label: "Security",
        href: "/admin/security",
        permissions: ["audit.view"],
        blurb: "Sign-in history, failed attempts and locked accounts.",
        built: true,
        keywords: ["login", "2fa", "lockout"],
      },
    ],
  },
  {
    key: "system",
    heading: "System",
    icon: "settings",
    items: [
      {
        label: "Import Jobs",
        href: "/admin/system/imports",
        permissions: ["system.view", "college.import"],
        blurb: "Every import run, with per-row results kept for inspection.",
        built: true,
        matchPrefix: true,
      },
      {
        label: "Export Jobs",
        href: "/admin/system/exports",
        permissions: ["system.view", "college.export"],
        blurb: "Generated files, who asked for them and what they contained.",
        built: true,
      },
      {
        label: "Background Jobs",
        href: "/admin/system/jobs",
        permissions: ["system.view"],
        blurb: "Queued, running and failed work.",
        built: true,
      },
      {
        label: "Error Logs",
        href: "/admin/system/errors",
        permissions: ["system.view"],
        blurb: "Grouped application errors, most recent first.",
        built: true,
      },
      {
        label: "Feature Flags",
        href: "/admin/system/flags",
        permissions: ["system.view"],
        blurb: "Turn platform features on, off or on for a percentage.",
        built: true,
        keywords: ["toggle", "rollout", "beta"],
      },
      {
        label: "Settings",
        href: "/admin/settings",
        permissions: ["system.view"],
        blurb: "Platform, academic, institution, geographic and security configuration.",
        built: true,
        matchPrefix: true,
        keywords: ["configuration", "preferences", "config"],
      },
    ],
  },
];

/** Flattened, for the command palette and the breadcrumb builder. */
export const ADMIN_NAV_ITEMS: (AdminNavItem & { section: string })[] = ADMIN_NAV.flatMap(
  (section) => section.items.map((item) => ({ ...item, section: section.heading }))
);

/**
 * The nav item a path belongs to.
 *
 * Longest match wins, so `/admin/colleges/123` resolves to Colleges rather than
 * to Overview, whose href is a prefix of every admin path.
 */
export function navItemForPath(pathname: string): (AdminNavItem & { section: string }) | null {
  let best: (AdminNavItem & { section: string }) | null = null;

  for (const item of ADMIN_NAV_ITEMS) {
    const href = item.href.split("?")[0];
    const matches = href === pathname || (item.matchPrefix && pathname.startsWith(`${href}/`));
    if (!matches) continue;
    if (!best || href.length > best.href.split("?")[0].length) best = item;
  }

  return best;
}
