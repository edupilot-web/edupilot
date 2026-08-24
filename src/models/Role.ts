import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * A named bundle of permissions.
 *
 * Roles are data, not code. Nothing in the admin app branches on a role slug —
 * every guard asks for a permission — so an operator can create "AP Data
 * Reviewer" with exactly the four permissions that job needs, and it works
 * everywhere without a deploy.
 *
 * The nine presets in `lib/admin/permissions.ts` are seeded here and marked
 * `system`, which protects them from deletion but not from editing: an operator
 * who wants Support Admin to stop seeing phone numbers should be able to say so.
 */
const roleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
    description: { type: String, default: null, maxlength: 400 },

    /**
     * Permission strings, or `*` for unrestricted. Validated against the
     * catalogue on write; unknown strings are rejected rather than stored,
     * because a typo would otherwise look like a granted permission that
     * silently never matches.
     */
    permissions: { type: [String], default: [] },

    /** Seeded presets. Editable, not deletable. */
    system: { type: Boolean, default: false },

    /** Maintained by the admin-user writes, for the roles table. */
    adminCount: { type: Number, default: 0 },

    createdBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "AdminUser", default: null },
  },
  { timestamps: true }
);

export type RoleDoc = InferSchemaType<typeof roleSchema>;

resetModelInDev("Role");

export const Role: Model<RoleDoc> =
  (mongoose.models.Role as Model<RoleDoc>) || mongoose.model<RoleDoc>("Role", roleSchema);
