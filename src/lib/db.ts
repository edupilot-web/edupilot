import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// The dev server hot-reloads modules, which would otherwise open a new
// connection on every reload. Cache it on the global object instead.
const globalWithMongoose = global as typeof globalThis & {
  _mongoose?: MongooseCache;
};

const cached: MongooseCache = globalWithMongoose._mongoose ?? {
  conn: null,
  promise: null,
};
globalWithMongoose._mongoose = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  // Read the env at call time, not import time, so the check does not fire
  // during a build or before a script has loaded its .env file.
  // Trimmed: values pasted into a dashboard often arrive with a trailing
  // newline, and a name ending in one would quietly become a different database.
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable. Add it to .env.local");
  }

  const dbName = process.env.MONGODB_DB?.trim() || "edupilot";
  // Catch the connection string being pasted into the wrong variable. Without
  // this the driver reports "Database names cannot contain the character '.'",
  // which does not point at the variable that is actually wrong. The value is
  // never echoed — it may hold credentials.
  if (dbName.includes("://") || dbName.includes("@")) {
    throw new Error(
      "MONGODB_DB looks like a connection string. It must be only the database name, e.g. `edupilot`. The connection string belongs in MONGODB_URI."
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      dbName,
      // The driver default is 30s, which is longer than a serverless function
      // is allowed to live (10s on Vercel Hobby). Left at the default, an
      // unreachable cluster kills the invocation before the error surfaces and
      // the caller sees a dead request instead of a message it can show.
      serverSelectionTimeoutMS: Number(process.env.MONGODB_TIMEOUT_MS ?? 8000),
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
