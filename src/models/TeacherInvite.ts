import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * An invitation to claim a teacher account at one college.
 *
 * The thing that makes `invite_only` mean anything. Without it, "who may teach
 * here" has no answer a college can give in advance — and the administrator
 * approving a pending signup is looking at a name and an address they have
 * never seen, deciding whether to hand over a claim on their students.
 *
 * An invitation moves that decision earlier, to the moment somebody who already
 * knows the answer types a colleague's address.
 */
const teacherInviteSchema = new Schema(
  {
    collegeId: { type: Schema.Types.ObjectId, ref: "College", required: true, index: true },
    collegeName: { type: String, default: null, maxlength: 200 },

    /**
     * The address invited, lower-cased.
     *
     * The invitation is **to an address**, not to a person: signing up with a
     * different one does not consume it. That is the whole control — anybody can
     * be handed the link, and only the mailbox it names can use it.
     */
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 200 },

    /**
     * SHA-256 of the raw token, hex.
     *
     * Never the token itself. A dump of this collection would otherwise be a
     * list of working invitations, and an invitation is a way into a college's
     * teaching staff.
     */
    tokenHash: { type: String, required: true, unique: true },

    /** Prefilled into the form, so a colleague does not have to be told twice. */
    designation: { type: String, default: null, maxlength: 120 },
    departmentId: { type: Schema.Types.ObjectId, ref: "Department", default: null },

    invitedByAdminId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    invitedByName: { type: String, default: null, maxlength: 200 },

    expiresAt: { type: Date, required: true },

    /**
     * Set when it is spent. Kept rather than deleted, so a second click can say
     * "already used" instead of "invalid" — a real difference to somebody who
     * has just signed up in another tab and is wondering whether it worked.
     */
    acceptedAt: { type: Date, default: null },
    acceptedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    /** Withdrawn before it was used. */
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/**
 * One live invitation per address per college.
 *
 * Partial, so the uniqueness only binds while it is outstanding: an address
 * that was invited, used it and later left can be invited again, and one that
 * was revoked can be re-sent. A plain unique index would make both of those a
 * duplicate-key error an administrator cannot act on.
 */
teacherInviteSchema.index(
  { collegeId: 1, email: 1 },
  { unique: true, partialFilterExpression: { acceptedAt: null, revokedAt: null } }
);

/** The college's list of who has been asked. */
teacherInviteSchema.index({ collegeId: 1, createdAt: -1 });

/**
 * Expiry sweep.
 *
 * Deliberately long after `expiresAt`: an accepted invitation is the record of
 * how somebody got in, and dropping it the moment it lapses would remove that
 * from the audit trail. A fortnight past expiry keeps the answer available for
 * the conversation that asks it.
 */
teacherInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

export type TeacherInviteDoc = InferSchemaType<typeof teacherInviteSchema>;

resetModelInDev("TeacherInvite");

export const TeacherInvite: Model<TeacherInviteDoc> =
  (mongoose.models.TeacherInvite as Model<TeacherInviteDoc>) ||
  mongoose.model<TeacherInviteDoc>("TeacherInvite", teacherInviteSchema);
