import { redirect } from "next/navigation";

/**
 * Teacher sign-up now lives on `/signup?role=teacher`.
 *
 * Kept as a redirect rather than deleted: this path is in the landing page's
 * history, in the docs, and quite possibly in an email somebody sent a
 * colleague. A 404 would tell them the product had removed teacher accounts.
 *
 * `?invite=` is carried through, because an invitation link issued before the
 * move points here.
 */
export default async function Page(props: PageProps<"/teacher/signup">) {
  const { invite, next } = await props.searchParams;

  const params = new URLSearchParams({ role: "teacher" });
  if (typeof invite === "string") params.set("invite", invite);
  if (typeof next === "string") params.set("next", next);

  redirect(`/signup?${params}`);
}
