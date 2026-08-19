const ENDPOINTS = [
  { group: "Auth", routes: [
    { method: "POST", path: "/api/auth/register", desc: "Create an account and start a session" },
    { method: "POST", path: "/api/auth/login", desc: "Sign in" },
    { method: "POST", path: "/api/auth/logout", desc: "Sign out" },
    { method: "GET", path: "/api/auth/me", desc: "Current user" },
  ]},
  { group: "Courses", routes: [
    { method: "GET", path: "/api/courses", desc: "Catalogue — ?q= &level= &tag= &page= &limit=" },
    { method: "POST", path: "/api/courses", desc: "Create a course (instructor)" },
    { method: "GET", path: "/api/courses/:idOrSlug", desc: "Course detail with lesson list" },
    { method: "PATCH", path: "/api/courses/:id", desc: "Update a course (owner)" },
    { method: "DELETE", path: "/api/courses/:id", desc: "Delete a course (owner)" },
  ]},
  { group: "Lessons", routes: [
    { method: "GET", path: "/api/courses/:id/lessons", desc: "Lessons in a course" },
    { method: "POST", path: "/api/courses/:id/lessons", desc: "Add a lesson (owner)" },
    { method: "GET", path: "/api/lessons/:id", desc: "Lesson body (enrolled or free preview)" },
    { method: "PATCH", path: "/api/lessons/:id", desc: "Update a lesson (owner)" },
    { method: "DELETE", path: "/api/lessons/:id", desc: "Delete a lesson (owner)" },
  ]},
  { group: "Enrollments", routes: [
    { method: "GET", path: "/api/enrollments", desc: "My enrolled courses" },
    { method: "POST", path: "/api/enrollments", desc: "Enroll in a course" },
    { method: "PATCH", path: "/api/enrollments/:id/progress", desc: "Mark a lesson complete" },
  ]},
];

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  POST: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  PATCH: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  DELETE: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
};

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">EduPilot</h1>
      <p className="mt-3 text-black/60 dark:text-white/60">
        Learning platform API — Next.js route handlers backed by MongoDB.
      </p>

      <div className="mt-12 space-y-10">
        {ENDPOINTS.map((section) => (
          <section key={section.group}>
            <h2 className="text-sm font-medium uppercase tracking-wider text-black/40 dark:text-white/40">
              {section.group}
            </h2>
            <ul className="mt-3 divide-y divide-black/5 dark:divide-white/10">
              {section.routes.map((r) => (
                <li key={r.method + r.path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ring-1 ring-inset ${METHOD_COLORS[r.method]}`}
                  >
                    {r.method}
                  </span>
                  <code className="font-mono text-sm">{r.path}</code>
                  <span className="text-sm text-black/50 dark:text-white/50">{r.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
