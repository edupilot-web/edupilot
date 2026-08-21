import mongoose, { Schema, Model, InferSchemaType } from "mongoose";
import { resetModelInDev } from "@/models/model-cache";

/**
 * One fixed window of one rate-limited action — see `src/lib/rate-limit.ts`.
 *
 * Stored in Mongo rather than in a module-level Map because the app runs as
 * several independent instances (and, on a serverless host, as short-lived
 * ones): an in-process counter would reset on every cold start and would be
 * trivially side-stepped by hitting a different instance.
 */
const rateLimitSchema = new Schema(
  {
    /** Action plus subject, e.g. `verify-email:resend:user:64f…`. */
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    /** End of the window. Doubles as the TTL, so spent windows clean themselves up. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;

resetModelInDev("RateLimit");

export const RateLimit: Model<RateLimitDoc> =
  (mongoose.models.RateLimit as Model<RateLimitDoc>) ||
  mongoose.model<RateLimitDoc>("RateLimit", rateLimitSchema);
