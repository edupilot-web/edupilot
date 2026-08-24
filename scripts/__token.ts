import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { signAdminSession } from "../src/lib/admin/session";
import { AdminUser } from "../src/models/AdminUser";
import { Role } from "../src/models/Role";

async function main() {
  await connectDB();
  const email = process.argv[2] ?? "rajesh@edupilot.dev";
  const admin = await AdminUser.findOne({ email }).select("+passwordHash");
  if (!admin) throw new Error("no such admin");

  // Prove the seeded credentials are what the sign-in action will check.
  const valid = await bcrypt.compare("Admin@12345", admin.passwordHash ?? "");
  const role = await Role.findById(admin.roleId).select("slug").lean();
  const token = await signAdminSession({
    sub: admin._id.toString(),
    email: admin.email,
    roleSlug: role?.slug ?? "unknown",
  });
  console.log(`PASSWORD_OK=${valid}`);
  console.log(`ROLE=${role?.slug}`);
  console.log(`TOKEN=${token}`);
  await mongoose.disconnect();
}
main().catch(async (e) => { console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
