import mongoose from "mongoose";

/**
 * Drops a cached model in development so the next compile picks up schema edits.
 *
 * `next dev` re-evaluates modules on hot reload, and mongoose throws if a model
 * is compiled twice — hence the usual `mongoose.models.X || mongoose.model(...)`
 * guard. But keeping the *old* compiled model after a schema edit is worse than
 * the error it avoids: the new paths are unknown to it, so mongoose strips them
 * from inserts and updates and the write silently becomes a no-op.
 *
 * Takes only the model name: passing the schema through a generic helper makes
 * TypeScript structurally compare mongoose's recursive Schema type, which is
 * enough to exhaust tsc's heap.
 */
export function resetModelInDev(name: string): void {
  if (process.env.NODE_ENV !== "production" && mongoose.models[name]) {
    mongoose.deleteModel(name);
  }
}
