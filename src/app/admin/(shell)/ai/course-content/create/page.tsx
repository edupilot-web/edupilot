import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/ui";
import { GenerateFlow } from "@/components/admin/ai/generate-flow";
import { can, requirePermission } from "@/lib/admin/current-admin";

export const metadata: Metadata = { title: "Generate Course Content" };

/**
 * The generation flow (spec §37).
 *
 * A page of its own rather than a modal: the flow has seven dependent selections
 * plus configuration, it can take minutes, and it must survive a reload — none
 * of which a dialog does well.
 *
 * `view` is enough to reach the screen so the cascade and subject information can
 * be read; the submit button is gated on `generate` inside the flow (§33).
 */
export default async function GenerateContentPage() {
  const admin = await requirePermission("ai_course_content.view", "/admin/ai/course-content/create");

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        title="Generate Course Content"
        description="Select the academic context, choose what to generate, and review the draft before anyone sees it."
        breadcrumbs={[
          { label: "AI & Learning" },
          { label: "AI Course Content", href: "/admin/ai/course-content" },
          { label: "Generate" },
        ]}
      />
      <GenerateFlow canGenerate={can(admin, "ai_course_content.generate")} />
    </div>
  );
}
