/**
 * The permission catalogue and the role presets built from it.
 *
 * Plain data, no mongoose — the sidebar, the page guards and the role editor
 * all read the same list, so a permission cannot exist in one place and be
 * unknown in another.
 *
 * Permissions are `<module>.<action>`. The module is what the sidebar groups
 * by; the action is what a guard checks. Nothing in the admin app tests a role
 * name — roles are bundles of permissions and are editable, so a check against
 * `role === "super-admin"` would silently ignore a role someone created.
 */

export type PermissionModule = {
  key: string;
  label: string;
  /** One line for the role editor, explaining what the module covers. */
  blurb: string;
  actions: { key: string; label: string; description: string }[];
};

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: "college",
    label: "Colleges",
    blurb: "College master data, affiliation history and autonomy records.",
    actions: [
      { key: "view", label: "View", description: "See colleges and their details" },
      { key: "create", label: "Create", description: "Add a college by hand" },
      { key: "edit", label: "Edit", description: "Change college details and affiliations" },
      { key: "verify", label: "Verify", description: "Approve or reject college information" },
      { key: "import", label: "Import", description: "Run the bulk import wizard" },
      { key: "export", label: "Export", description: "Download college data" },
      { key: "delete", label: "Delete", description: "Archive or delete a college" },
    ],
  },
  {
    key: "university",
    label: "Universities",
    blurb: "Affiliating bodies and their relationship to colleges.",
    actions: [
      { key: "view", label: "View", description: "See universities" },
      { key: "create", label: "Create", description: "Add a university" },
      { key: "edit", label: "Edit", description: "Change university details" },
      { key: "verify", label: "Verify", description: "Approve university information" },
      { key: "delete", label: "Delete", description: "Archive a university" },
    ],
  },
  {
    key: "academic",
    label: "Academic structure",
    blurb: "Campuses, departments, programs and academic years.",
    actions: [
      { key: "view", label: "View", description: "See the academic hierarchy" },
      { key: "create", label: "Create", description: "Add departments and programs" },
      { key: "edit", label: "Edit", description: "Change the academic hierarchy" },
      { key: "delete", label: "Delete", description: "Remove departments and programs" },
    ],
  },
  {
    key: "geography",
    label: "Geography",
    blurb: "States, districts and cities — the spine of every location field.",
    actions: [
      { key: "view", label: "View", description: "See the geographic master data" },
      { key: "edit", label: "Edit", description: "Add or change states, districts and cities" },
    ],
  },
  {
    key: "student",
    label: "Students",
    blurb: "Student accounts and academic profiles.",
    actions: [
      { key: "view", label: "View", description: "See student records" },
      { key: "view_pii", label: "View contact details", description: "See phone numbers and full email addresses" },
      { key: "edit", label: "Edit", description: "Correct a student profile" },
      { key: "verify", label: "Verify", description: "Approve or reject student verification" },
      { key: "suspend", label: "Suspend", description: "Suspend or reinstate an account" },
      { key: "delete", label: "Delete", description: "Delete a student account" },
      { key: "impersonate", label: "View as user", description: "Open the platform as that student" },
      { key: "export", label: "Export", description: "Download student data" },
    ],
  },
  {
    key: "content",
    label: "Content",
    blurb: "Posts, articles, events, opportunities and announcements.",
    actions: [
      { key: "view", label: "View", description: "See all content" },
      { key: "create", label: "Create", description: "Draft new content" },
      { key: "edit", label: "Edit", description: "Change existing content" },
      { key: "publish", label: "Publish", description: "Publish or schedule content" },
      { key: "delete", label: "Delete", description: "Remove content" },
    ],
  },
  {
    key: "moderation",
    label: "Moderation",
    blurb: "Reports, the moderation queue and enforcement actions.",
    actions: [
      { key: "view", label: "View", description: "See reports and the queue" },
      { key: "action", label: "Take action", description: "Approve, remove, warn or escalate" },
    ],
  },
  {
    key: "notification",
    label: "Notifications",
    blurb: "Templates, campaigns and delivery history.",
    actions: [
      { key: "view", label: "View", description: "See templates and history" },
      { key: "edit", label: "Edit", description: "Change templates" },
      { key: "send", label: "Send", description: "Send a campaign to real recipients" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    blurb: "Platform, student, institution and geographic reporting.",
    actions: [{ key: "view", label: "View", description: "See analytics dashboards" }],
  },
  {
    key: "admin",
    label: "Administrators",
    blurb: "Admin accounts, roles and permissions.",
    actions: [
      { key: "view", label: "View", description: "See admin users and roles" },
      { key: "invite", label: "Invite", description: "Invite a new administrator" },
      { key: "edit", label: "Edit", description: "Change an admin's role or details" },
      { key: "manage_roles", label: "Manage roles", description: "Create roles and change what they grant" },
      { key: "deactivate", label: "Deactivate", description: "Revoke an administrator's access" },
    ],
  },
  {
    key: "audit",
    label: "Audit & security",
    blurb: "The audit trail and login/security logs.",
    actions: [
      { key: "view", label: "View", description: "Read the audit trail" },
      { key: "export", label: "Export", description: "Download audit records" },
    ],
  },
  {
    key: "ai_course_content",
    label: "AI Course Content",
    blurb: "AI-generated curriculum content: generating, reviewing and publishing it.",
    actions: [
      { key: "view", label: "View", description: "See generated content, jobs and the library" },
      { key: "generate", label: "Generate", description: "Request AI generation for a subject" },
      { key: "edit", label: "Edit", description: "Change generated content and save drafts" },
      { key: "review", label: "Review", description: "Move content through review and approve it" },
      { key: "publish", label: "Publish", description: "Release approved content to students" },
      { key: "delete", label: "Delete", description: "Archive or delete generated content" },
    ],
  },
  {
    key: "ai_settings",
    label: "AI Settings",
    blurb: "Provider selection, generation tuning, safety switches and cost monitoring.",
    actions: [
      { key: "view", label: "View", description: "See AI provider settings and usage" },
      { key: "manage", label: "Manage", description: "Change provider, model and generation settings" },
    ],
  },
  {
    key: "system",
    label: "System",
    blurb: "Jobs, health, feature flags and platform configuration.",
    actions: [
      { key: "view", label: "View", description: "See jobs, health and error logs" },
      { key: "manage_jobs", label: "Manage jobs", description: "Retry or cancel background jobs" },
      { key: "manage_flags", label: "Feature flags", description: "Turn features on and off" },
      { key: "configure", label: "Configure", description: "Change platform settings" },
    ],
  },
];

/** Every permission string, e.g. `college.verify`. */
export const ALL_PERMISSIONS: string[] = PERMISSION_MODULES.flatMap((group) =>
  group.actions.map((action) => `${group.key}.${action.key}`)
);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

export function isKnownPermission(permission: string): boolean {
  return PERMISSION_SET.has(permission);
}

/** Human label for a permission string, for the audit log and role editor. */
export function permissionLabel(permission: string): string {
  const [moduleKey, actionKey] = permission.split(".");
  // Named `group`, not `module`: `module` is a reserved identifier in a Next.js
  // module scope and assigning it breaks the bundler's CommonJS interop.
  const group = PERMISSION_MODULES.find((entry) => entry.key === moduleKey);
  const action = group?.actions.find((entry) => entry.key === actionKey);
  if (!group || !action) return permission;
  return `${group.label} · ${action.label}`;
}

/**
 * The wildcard. Held only by Super Admin, and checked explicitly in
 * `hasPermission` rather than expanded into the full list — expanding it would
 * freeze the role at the set of permissions that existed when it was saved, so
 * a new module would silently be denied to the one role that must always have
 * it.
 */
export const SUPER_ADMIN_PERMISSION = "*";

function moduleActions(moduleKey: string, actions: string[]): string[] {
  return actions.map((action) => `${moduleKey}.${action}`);
}

export type RolePreset = {
  slug: string;
  name: string;
  description: string;
  permissions: string[];
  /** Presets are seeded and protected from deletion; custom roles are not. */
  system: true;
};

/**
 * The roles the platform ships with (spec §26).
 *
 * These are *presets*, not hard-coded behaviour: they are written to the
 * `roles` collection by the seed and can be edited afterwards, and nothing in
 * the app branches on a role slug.
 */
export const ROLE_PRESETS: RolePreset[] = [
  {
    slug: "super-admin",
    name: "Super Admin",
    description: "Unrestricted access, including administrator and role management.",
    permissions: [SUPER_ADMIN_PERMISSION],
    system: true,
  },
  {
    slug: "platform-admin",
    name: "Platform Admin",
    description: "Runs the platform day to day. Everything except managing other admins.",
    permissions: [
      ...moduleActions("college", ["view", "create", "edit", "verify", "import", "export"]),
      ...moduleActions("university", ["view", "create", "edit", "verify"]),
      ...moduleActions("academic", ["view", "create", "edit"]),
      ...moduleActions("geography", ["view", "edit"]),
      ...moduleActions("student", ["view", "view_pii", "edit", "verify", "suspend", "export"]),
      ...moduleActions("content", ["view", "create", "edit", "publish"]),
      ...moduleActions("moderation", ["view", "action"]),
      ...moduleActions("notification", ["view", "edit", "send"]),
      "analytics.view",
      "audit.view",
      ...moduleActions("system", ["view", "manage_jobs", "manage_flags"]),
      ...moduleActions("ai_course_content", ["view", "generate", "edit", "review", "publish"]),
      ...moduleActions("ai_settings", ["view", "manage"]),
    ],
    system: true,
  },
  {
    slug: "institution-admin",
    name: "Institution Admin",
    description: "Owns institution master data: colleges, universities, affiliations, imports.",
    permissions: [
      ...moduleActions("college", ["view", "create", "edit", "verify", "import", "export"]),
      ...moduleActions("university", ["view", "create", "edit", "verify"]),
      ...moduleActions("academic", ["view", "create", "edit", "delete"]),
      ...moduleActions("geography", ["view", "edit"]),
      "student.view",
      "analytics.view",
      "audit.view",
      "system.view",
    ],
    system: true,
  },
  {
    slug: "student-admin",
    name: "Student Admin",
    description: "Handles student accounts, verification and support escalations.",
    permissions: [
      ...moduleActions("student", ["view", "view_pii", "edit", "verify", "suspend", "export"]),
      "college.view",
      "university.view",
      "academic.view",
      "analytics.view",
      "audit.view",
    ],
    system: true,
  },
  {
    slug: "content-admin",
    name: "Content Admin",
    description: "Writes and publishes platform content and announcements.",
    permissions: [
      ...moduleActions("content", ["view", "create", "edit", "publish", "delete"]),
      ...moduleActions("ai_course_content", ["view", "generate", "edit", "review"]),
      "ai_settings.view",
      ...moduleActions("notification", ["view", "edit"]),
      "college.view",
      "student.view",
      "analytics.view",
    ],
    system: true,
  },
  {
    slug: "moderation-admin",
    name: "Moderation Admin",
    description: "Works the moderation queue and enforces community rules.",
    permissions: [
      ...moduleActions("moderation", ["view", "action"]),
      ...moduleActions("content", ["view", "edit", "delete"]),
      ...moduleActions("student", ["view", "suspend"]),
      "audit.view",
    ],
    system: true,
  },
  {
    slug: "analytics-admin",
    name: "Analytics Admin",
    description: "Read-only across the platform, with full reporting access.",
    permissions: [
      "analytics.view",
      "college.view",
      "college.export",
      "university.view",
      "academic.view",
      "geography.view",
      "student.view",
      "content.view",
      "notification.view",
      "system.view",
    ],
    system: true,
  },
  {
    slug: "support-admin",
    name: "Support Admin",
    description: "Answers student queries. Can see contact details and act as a user.",
    permissions: [
      ...moduleActions("student", ["view", "view_pii", "edit", "impersonate"]),
      "college.view",
      "university.view",
      "academic.view",
      "notification.view",
      "audit.view",
    ],
    system: true,
  },
  {
    slug: "read-only-admin",
    name: "Read Only Admin",
    description: "Can see the admin app but change nothing. Contact details stay hidden.",
    permissions: [
      "college.view",
      "university.view",
      "academic.view",
      "geography.view",
      "student.view",
      "content.view",
      "moderation.view",
      "notification.view",
      "ai_course_content.view",
      "analytics.view",
      "system.view",
    ],
    system: true,
  },
];

/**
 * Whether `granted` satisfies `required`.
 *
 * `*` matches everything. `college.*` matches every action in the module —
 * useful for a custom role that should keep pace with new actions rather than
 * needing an edit each time one is added.
 */
export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes(SUPER_ADMIN_PERMISSION)) return true;
  if (granted.includes(required)) return true;
  const [moduleKey] = required.split(".");
  return granted.includes(`${moduleKey}.*`);
}

/** True when `granted` satisfies at least one of `required`. Used by the sidebar. */
export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
  if (required.length === 0) return true;
  return required.some((permission) => hasPermission(granted, permission));
}
