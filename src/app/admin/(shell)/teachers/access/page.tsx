import type { Metadata } from "next";
import { Cell, Column, DataTable, PrimaryCell, Row } from "@/components/admin/data-table";
import { Badge, Card, EmptyState, InfoNote, PageHeader, type BadgeTone } from "@/components/admin/ui";
import {
  InviteForm,
  RevokeInviteButton,
  SignupPolicyForm,
} from "@/components/admin/teacher-access";
import { requirePermission } from "@/lib/admin/current-admin";
import { formatRelative, formatUntil } from "@/lib/admin/format";
import { hasPermission } from "@/lib/admin/permissions";
import { listInvites, policyFor } from "@/lib/teaching/invites";
import { teacherAutoApproveEnabled } from "@/lib/teaching/fields";

export const metadata: Metadata = { title: "Teacher access" };

const BASE = "/admin/teachers/access";

const COLUMNS: Column[] = [
  { key: "email", label: "Invited" },
  { key: "designation", label: "Designation", secondary: true },
  { key: "by", label: "Sent by", secondary: true },
  { key: "status", label: "Status" },
  { key: "expires", label: "Expires", secondary: true },
  { key: "actions", label: "" },
];

/**
 * Who may become a teacher here (§6.13a).
 *
 * The gate landed with teacher sign-up; this screen is the half that was
 * missing. A college changed its policy by a database edit, which meant in
 * practice that none of them ever did — every institution stayed on the
 * invite-only default, including the large ones where inviting staff one at a
 * time is not a real option.
 *
 * Scoped to the administrator's own college when they have one, like every
 * other teacher screen: the scope comes from their record, so there is no
 * college parameter for a college admin to tamper with. A platform admin with
 * no college of their own has nothing to configure here — the policy belongs to
 * an institution, not to the platform — so they are told that rather than shown
 * an empty form.
 */
export default async function TeacherAccessPage() {
  const admin = await requirePermission("teacher.view", BASE);
  const canEdit = hasPermission(admin.permissions, "teacher.approve");

  if (!admin.collegeId) {
    return (
      <>
        <Header collegeName={null} />
        <Card>
          <EmptyState
            title="Pick a college first"
            description="Teacher access is set per institution. Open a college from Colleges to see and change its policy."
          />
        </Card>
      </>
    );
  }

  const [policy, invites] = await Promise.all([
    policyFor(admin.collegeId),
    listInvites({ collegeId: admin.collegeId, limit: 100 }),
  ]);

  if (!policy) {
    return (
      <>
        <Header collegeName={admin.collegeName ?? null} />
        <Card>
          <EmptyState
            title="That college could not be loaded"
            description="Its record may have been removed. Ask a platform administrator to check."
          />
        </Card>
      </>
    );
  }

  const outstanding = invites.filter((row) => row.status === "pending").length;

  return (
    <>
      <Header collegeName={policy.collegeName} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card
          title="Who may register"
          description="This decides who can create a teacher account against your college. It does not approve anybody."
        >
          <SignupPolicyForm
            policy={{
              collegeId: policy.collegeId,
              collegeName: policy.collegeName,
              mode: policy.mode,
              allowedDomains: policy.allowedDomains,
              autoApprove: policy.autoApprove,
            }}
            canEdit={canEdit}
            autoApproveForcedByEnv={teacherAutoApproveEnabled()}
          />
        </Card>

        <div className="space-y-5">
          {canEdit && (
            <Card
              title="Invite a teacher"
              description="Works whatever the setting above says — an invitation always lets that one address through."
            >
              <InviteForm collegeId={policy.collegeId} />
            </Card>
          )}

          <InfoNote>
            An invitation is issued to an <strong>address</strong>, not to a person. The link can be
            forwarded, but only that mailbox can use it, and it works once. Creating the account is
            not the same as being approved — a new teacher still appears in the queue on{" "}
            <strong>Teachers</strong>.
          </InfoNote>
        </div>
      </div>

      <Card
        className="mt-5"
        padded={false}
        title="Invitations"
        description={
          outstanding > 0
            ? `${outstanding} outstanding. An unused one expires on its own.`
            : "Nothing outstanding."
        }
      >
        <DataTable
          columns={COLUMNS}
          basePath={BASE}
          params={{}}
          rowCount={invites.length}
          empty={
            <EmptyState
              title="Nobody has been invited"
              description={
                policy.mode === "invite_only"
                  ? "Your college is invite-only, so no teacher can register until somebody is invited here."
                  : "Teachers can register themselves under the current setting. Invitations are still the way to let in anyone it would not cover."
              }
            />
          }
        >
          {invites.map((row) => (
            <Row key={row.id} highlighted={row.status === "pending"}>
              <PrimaryCell title={row.email} subtitle={formatRelative(new Date(row.createdAt))} />
              <Cell secondary muted>
                {row.designation ?? "—"}
              </Cell>
              <Cell secondary muted>
                {row.invitedByName ?? "—"}
              </Cell>
              <Cell>
                <StatusBadge status={row.status} />
              </Cell>
              <Cell secondary muted nowrap>
                {/* Future-tense: `formatRelative` counts backwards and would
                    render a live invitation as "-14 days ago". */}
                {row.status === "pending" ? formatUntil(row.expiresAt) : "—"}
              </Cell>
              <Cell>
                {canEdit && row.status === "pending" && (
                  <RevokeInviteButton inviteId={row.id} email={row.email} />
                )}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </Card>
    </>
  );
}

function Header({ collegeName }: { collegeName: string | null }) {
  return (
    <PageHeader
      title="Teacher access"
      description="Who may create a teacher account against your college, and who has been invited. Approving them is on Teachers."
      breadcrumbs={[
        { label: "Institution Management" },
        { label: "Teachers", href: "/admin/teachers" },
        { label: "Access" },
      ]}
      meta={collegeName ? <Badge tone="neutral">{collegeName}</Badge> : null}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, BadgeTone> = {
    pending: "warning",
    accepted: "success",
    revoked: "neutral",
    expired: "neutral",
  };

  const labels: Record<string, string> = {
    pending: "Waiting",
    accepted: "Signed up",
    revoked: "Withdrawn",
    expired: "Expired",
  };

  return <Badge tone={tones[status] ?? "neutral"}>{labels[status] ?? status}</Badge>;
}
