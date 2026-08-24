/**
 * Seeds the admin application: geography, institutions, academic structure,
 * students, administrators, roles, jobs, flags, settings and an audit trail.
 *
 * Destructive for the collections it owns — it clears and rebuilds them — but
 * it never touches `courses`, `lessons` or `enrollments`, which belong to the
 * learning side and are seeded by `npm run seed`.
 *
 * Deterministic throughout: no `Math.random`. Re-running produces the same
 * database, so a screenshot taken today still matches the data tomorrow and two
 * developers comparing a screen are looking at the same rows.
 *
 * Run with:  npm run seed:admin
 */
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { City, District, State } from "../src/models/Geo";
import { College, normalizeCollegeName } from "../src/models/College";
import { University } from "../src/models/University";
import { Affiliation } from "../src/models/Affiliation";
import { AutonomyRecord } from "../src/models/AutonomyRecord";
import { AcademicYear, Campus, Department, Program, canonicalDepartmentKey } from "../src/models/AcademicStructure";
import { AdminLoginEvent, AdminUser } from "../src/models/AdminUser";
import { Role } from "../src/models/Role";
import { AuditLog, severityFor } from "../src/models/AuditLog";
import { ImportJob, ImportRow } from "../src/models/ImportJob";
import {
  BackgroundJob,
  ErrorLog,
  ExportJob,
  FeatureFlag,
  SavedView,
  Setting,
} from "../src/models/SystemModels";
import { StudentProfile } from "../src/models/StudentProfile";
import { User } from "../src/models/User";
import { ROLE_PRESETS } from "../src/lib/admin/permissions";
import { STATES } from "./seed-data/geography";
import {
  DEGREE_DEPARTMENTS,
  ENGINEERING_DEPARTMENTS,
  REAL_COLLEGES,
  UNIVERSITIES,
  syntheticColleges,
  type CollegeSeed,
} from "./seed-data/institutions";

/** How many generated colleges to add on top of the curated ones. */
const SYNTHETIC_COLLEGES = 420;
/** How many student accounts to create. */
const STUDENTS = 640;

const ADMIN_PASSWORD = "Admin@12345";
const STUDENT_PASSWORD = "student123";

/**
 * Deterministic pseudo-randomness.
 *
 * A seeded LCG rather than `Math.random`, so every run produces the same
 * database. "Why does the dashboard say 412 today and 408 yesterday?" is not a
 * question anyone should have to answer about seed data.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260824);

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(9 + Math.floor(random() * 10), Math.floor(random() * 60), 0, 0);
  return date;
}

async function main() {
  await connectDB();
  console.log("connected to", mongoose.connection.name);
  const started = Date.now();

  await clearCollections();

  const geo = await seedGeography();
  const roles = await seedRoles();
  const admins = await seedAdmins(roles);
  const universities = await seedUniversities(geo);
  const colleges = await seedColleges(geo, universities, admins);
  await seedAcademicStructure(colleges);
  await seedAcademicYears();
  const students = await seedStudents(colleges);
  await seedImportHistory(admins, colleges);
  await seedSystem(admins);
  await seedSavedViews(admins);
  await seedAuditTrail(admins, colleges, universities);
  await seedLoginHistory(admins);
  await recountCollegeStudents();

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  console.log(`  states       ${geo.states.size}  districts ${geo.districtsById.size}`);
  console.log(`  universities ${universities.size}`);
  console.log(`  colleges     ${colleges.length}`);
  console.log(`  students     ${students}`);
  console.log(`  admins       ${admins.length}`);
  console.log("\nSign in at /admin/login");
  for (const admin of admins) {
    console.log(`  ${admin.email.padEnd(30)} ${admin.roleName}`);
  }
  console.log(`\n  Password for every admin: ${ADMIN_PASSWORD}`);

  await mongoose.disconnect();
}

async function clearCollections() {
  await Promise.all([
    State.deleteMany({}),
    District.deleteMany({}),
    City.deleteMany({}),
    College.deleteMany({}),
    University.deleteMany({}),
    Affiliation.deleteMany({}),
    AutonomyRecord.deleteMany({}),
    Campus.deleteMany({}),
    Department.deleteMany({}),
    Program.deleteMany({}),
    AcademicYear.deleteMany({}),
    AdminUser.deleteMany({}),
    AdminLoginEvent.deleteMany({}),
    Role.deleteMany({}),
    AuditLog.deleteMany({}),
    ImportJob.deleteMany({}),
    ImportRow.deleteMany({}),
    ExportJob.deleteMany({}),
    BackgroundJob.deleteMany({}),
    ErrorLog.deleteMany({}),
    FeatureFlag.deleteMany({}),
    Setting.deleteMany({}),
    SavedView.deleteMany({}),
    // Students are rebuilt too — their profiles point at college ids that are
    // about to be replaced, and leaving them would produce dangling references.
    User.deleteMany({ role: "student" }),
    StudentProfile.deleteMany({}),
  ]);
  console.log("cleared admin collections");
}

// ── Geography ──────────────────────────────────────────────────────────────

type Geo = {
  states: Map<string, { id: mongoose.Types.ObjectId; name: string }>;
  districtsById: Map<string, { id: mongoose.Types.ObjectId; name: string; stateCode: string }>;
  /** `"AP:Guntur"` → district. */
  districtKey: Map<string, { id: mongoose.Types.ObjectId; name: string }>;
  cityKey: Map<string, { id: mongoose.Types.ObjectId; name: string }>;
  placesByState: Record<"AP" | "TS", { district: string; city: string }[]>;
};

async function seedGeography(): Promise<Geo> {
  const states = new Map<string, { id: mongoose.Types.ObjectId; name: string }>();
  const districtsById = new Map<string, { id: mongoose.Types.ObjectId; name: string; stateCode: string }>();
  const districtKey = new Map<string, { id: mongoose.Types.ObjectId; name: string }>();
  const cityKey = new Map<string, { id: mongoose.Types.ObjectId; name: string }>();
  const placesByState: Record<"AP" | "TS", { district: string; city: string }[]> = { AP: [], TS: [] };

  for (const seed of STATES) {
    const state = await State.create({
      name: seed.name,
      code: seed.code,
      kind: seed.kind ?? "state",
      displayOrder: seed.displayOrder,
      active: true,
    });
    states.set(seed.code, { id: state._id, name: state.name });

    for (const districtSeed of seed.districts ?? []) {
      const district = await District.create({
        name: districtSeed.name,
        stateId: state._id,
        stateCode: seed.code,
        active: true,
      });
      districtsById.set(String(district._id), {
        id: district._id,
        name: district.name,
        stateCode: seed.code,
      });
      districtKey.set(`${seed.code}:${districtSeed.name}`, { id: district._id, name: district.name });

      for (const cityName of districtSeed.cities ?? []) {
        const city = await City.create({
          name: cityName,
          districtId: district._id,
          stateId: state._id,
          active: true,
        });
        cityKey.set(`${seed.code}:${cityName}`, { id: city._id, name: city.name });
        if (seed.code === "AP" || seed.code === "TS") {
          placesByState[seed.code].push({ district: districtSeed.name, city: cityName });
        }
      }
    }
  }

  console.log(`seeded ${states.size} states, ${districtsById.size} districts, ${cityKey.size} cities`);
  return { states, districtsById, districtKey, cityKey, placesByState };
}

// ── Roles and admins ───────────────────────────────────────────────────────

async function seedRoles(): Promise<Map<string, { id: mongoose.Types.ObjectId; name: string }>> {
  const roles = new Map<string, { id: mongoose.Types.ObjectId; name: string }>();

  for (const preset of ROLE_PRESETS) {
    const role = await Role.create({
      name: preset.name,
      slug: preset.slug,
      description: preset.description,
      permissions: preset.permissions,
      system: true,
    });
    roles.set(preset.slug, { id: role._id, name: role.name });
  }

  // One custom role, to demonstrate that roles are data rather than an enum.
  const custom = await Role.create({
    name: "AP Data Reviewer",
    slug: "ap-data-reviewer",
    description: "Verifies Andhra Pradesh college submissions. Cannot edit or delete.",
    permissions: ["college.view", "college.verify", "university.view", "academic.view", "audit.view"],
    system: false,
  });
  roles.set("ap-data-reviewer", { id: custom._id, name: custom.name });

  console.log(`seeded ${roles.size} roles`);
  return roles;
}

type SeededAdmin = {
  id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  roleName: string;
  roleSlug: string;
};

async function seedAdmins(
  roles: Map<string, { id: mongoose.Types.ObjectId; name: string }>
): Promise<SeededAdmin[]> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const definitions = [
    { name: "Rajesh Kolluri", email: "rajesh@edupilot.dev", roleSlug: "super-admin", team: "Platform", title: "Founder" },
    { name: "Sneha Vardhan", email: "sneha@edupilot.dev", roleSlug: "platform-admin", team: "Platform", title: "Operations Lead" },
    { name: "Praveen Reddy", email: "praveen@edupilot.dev", roleSlug: "institution-admin", team: "Institution Data", title: "Data Manager" },
    { name: "Lakshmi Prasanna", email: "lakshmi@edupilot.dev", roleSlug: "student-admin", team: "Student Success", title: "Verification Lead" },
    { name: "Arun Teja", email: "arun@edupilot.dev", roleSlug: "support-admin", team: "Support", title: "Support Specialist" },
    { name: "Divya Sharma", email: "divya@edupilot.dev", roleSlug: "content-admin", team: "Content", title: "Content Editor" },
    { name: "Kiran Kumar", email: "kiran@edupilot.dev", roleSlug: "ap-data-reviewer", team: "Institution Data", title: "Reviewer (AP)" },
    { name: "Meera Nair", email: "meera@edupilot.dev", roleSlug: "analytics-admin", team: "Growth", title: "Analyst" },
    { name: "Vikram Rao", email: "vikram@edupilot.dev", roleSlug: "read-only-admin", team: "Leadership", title: "Advisor" },
  ];

  const admins: SeededAdmin[] = [];
  // The id of the first administrator, used as the inviter for the rest. Read
  // from `admins` rather than from a variable the `create()` call also feeds,
  // which TypeScript cannot type without chasing its own tail.
  const inviter = () => (admins.length ? admins[0].id : null);

  for (const [index, definition] of definitions.entries()) {
    const role = roles.get(definition.roleSlug);
    if (!role) continue;

    // The last two are left in non-active states so the admin list shows more
    // than a column of identical green badges.
    const status =
      index === definitions.length - 1
        ? "deactivated"
        : index === definitions.length - 2
          ? "invited"
          : "active";

    const admin = await AdminUser.create({
      name: definition.name,
      email: definition.email,
      passwordHash: status === "invited" ? null : passwordHash,
      roleId: role.id,
      roleName: role.name,
      team: definition.team,
      title: definition.title,
      status,
      twoFactorEnabled: index < 3,
      lastLoginAt: status === "active" ? daysAgo(index % 5) : null,
      lastLoginIp: status === "active" ? "103.21.58.14" : null,
      invitedAt: status === "invited" ? daysAgo(2) : null,
      invitedBy: inviter(),
      createdBy: inviter(),
      deactivatedAt: status === "deactivated" ? daysAgo(40) : null,
    });

    await Role.updateOne({ _id: role.id }, { $inc: { adminCount: 1 } });

    admins.push({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      roleName: role.name,
      roleSlug: definition.roleSlug,
    });
  }

  console.log(`seeded ${admins.length} administrators`);
  return admins;
}

// ── Universities ───────────────────────────────────────────────────────────

type SeededUniversity = { id: mongoose.Types.ObjectId; name: string; code: string; shortName: string };

async function seedUniversities(geo: Geo): Promise<Map<string, SeededUniversity>> {
  const universities = new Map<string, SeededUniversity>();

  for (const seed of UNIVERSITIES) {
    const state = geo.states.get(seed.stateCode);
    const district = geo.districtKey.get(`${seed.stateCode}:${seed.district}`);
    const city = geo.cityKey.get(`${seed.stateCode}:${seed.city}`);

    const university = await University.create({
      name: seed.name,
      normalizedName: normalizeCollegeName(seed.name),
      shortName: seed.shortName ?? null,
      code: seed.code,
      type: seed.type,
      managementType: seed.managementType,
      stateId: state?.id,
      districtId: district?.id ?? null,
      cityId: city?.id ?? null,
      stateName: state?.name ?? null,
      districtName: district?.name ?? null,
      cityName: city?.name ?? seed.city,
      website: seed.website ?? null,
      establishedYear: seed.established,
      accreditations: seed.naac ? [{ body: "NAAC", grade: seed.naac }] : [],
      recognitions: seed.type.includes("Institute of National Importance")
        ? ["Institute of National Importance (Act of Parliament)"]
        : ["UGC 2(f)", "UGC 12(B)"],
      verificationStatus: "verified",
      verifiedAt: daysAgo(60),
      status: "active",
      collegeCount: 0,
    });

    universities.set(seed.code, {
      id: university._id,
      name: university.name,
      code: seed.code,
      shortName: seed.shortName ?? seed.code,
    });
  }

  console.log(`seeded ${universities.size} universities`);
  return universities;
}

// ── Colleges ───────────────────────────────────────────────────────────────

type SeededCollege = {
  id: mongoose.Types.ObjectId;
  name: string;
  stateCode: "AP" | "TS";
  isEngineering: boolean;
  universityId: mongoose.Types.ObjectId | null;
};

async function seedColleges(
  geo: Geo,
  universities: Map<string, SeededUniversity>,
  admins: SeededAdmin[]
): Promise<SeededCollege[]> {
  const universityCodesByState: Record<"AP" | "TS", string[]> = {
    AP: UNIVERSITIES.filter((entry) => entry.stateCode === "AP").map((entry) => entry.code),
    TS: UNIVERSITIES.filter((entry) => entry.stateCode === "TS").map((entry) => entry.code),
  };

  const seeds: CollegeSeed[] = [
    ...REAL_COLLEGES,
    ...syntheticColleges(SYNTHETIC_COLLEGES, geo.placesByState, universityCodesByState),
  ];

  const seeded: SeededCollege[] = [];
  const collegeDocs: Record<string, unknown>[] = [];
  const affiliationDocs: Record<string, unknown>[] = [];
  const autonomyDocs: Record<string, unknown>[] = [];
  const collegeCountByUniversity = new Map<string, number>();
  const usedNames = new Set<string>();

  for (const [index, seed] of seeds.entries()) {
    const normalizedName = normalizeCollegeName(seed.name);
    // The generator can collide with a curated entry. Skipping is the honest
    // resolution: the curated row has real data attached.
    if (usedNames.has(normalizedName)) continue;
    usedNames.add(normalizedName);

    const state = geo.states.get(seed.stateCode);
    const district = geo.districtKey.get(`${seed.stateCode}:${seed.district}`);
    const city = geo.cityKey.get(`${seed.stateCode}:${seed.city}`);
    const university = universities.get(seed.universityCode);

    const collegeId = new mongoose.Types.ObjectId();
    const affiliationId = new mongoose.Types.ObjectId();
    const createdAt = daysAgo(400 - Math.floor((index / seeds.length) * 360));
    const isEngineering = /engineering|technology|technical|polytechnic/i.test(seed.name);
    const verification = seed.verification ?? "not-verified";
    const verifier = admins[index % Math.max(1, admins.length)];

    collegeDocs.push({
      _id: collegeId,
      name: seed.name,
      normalizedName,
      code: seed.code,
      institutionType: seed.institutionType,
      managementType: seed.managementType,
      autonomyStatus: seed.autonomy,
      autonomousSince: seed.autonomy === "autonomous" ? daysAgo(900 + index) : null,
      universityId: university?.id ?? null,
      universityName: university?.name ?? null,
      universityCode: university?.code ?? null,
      currentAffiliationId: university ? affiliationId : null,
      stateId: state?.id ?? null,
      districtId: district?.id ?? null,
      cityId: city?.id ?? null,
      stateName: state?.name ?? null,
      districtName: district?.name ?? null,
      cityName: city?.name ?? seed.city,
      address: `${seed.city}, ${seed.district}`,
      // A deliberate gap: roughly one row in nine has no pincode, so the Data
      // Quality screen has something real to find.
      pincode: index % 9 === 0 ? null : `5${String(10000 + ((index * 37) % 89999))}`,
      website: seed.website ?? (index % 5 === 0 ? null : `https://www.${slug(seed.name)}.ac.in`),
      email: index % 7 === 0 ? null : `principal@${slug(seed.name)}.ac.in`,
      phone: index % 6 === 0 ? null : `+91 ${9000000000 + ((index * 137) % 999999999)}`,
      establishedYear: seed.established ?? null,
      accreditations: seed.naac ? [{ body: "NAAC", grade: seed.naac }] : [],
      verificationStatus: verification,
      verifiedAt: verification === "verified" ? daysAgo(30 + (index % 120)) : null,
      verifiedBy: verification === "verified" ? verifier.id : null,
      verificationRequestedAt: verification === "pending" ? daysAgo(3 + (index % 20)) : null,
      status: index % 61 === 0 ? "inactive" : "active",
      source: index < REAL_COLLEGES.length ? "seed" : index % 23 === 0 ? "student" : "seed",
      studentCount: 0,
      createdBy: verifier.id,
      updatedBy: verifier.id,
      createdAt,
      updatedAt: daysAgo(Math.floor((index * 13) % 90)),
    });

    if (university) {
      collegeCountByUniversity.set(
        String(university.id),
        (collegeCountByUniversity.get(String(university.id)) ?? 0) + 1
      );

      affiliationDocs.push({
        _id: affiliationId,
        collegeId,
        universityId: university.id,
        collegeName: seed.name,
        universityName: university.name,
        universityCode: university.code,
        type: seed.autonomy === "autonomous" ? "autonomous" : "affiliated",
        status: "active",
        startDate: createdAt,
        endDate: null,
        referenceNumber: `${university.code}/AFF/${2015 + (index % 10)}/${1000 + index}`,
        verificationStatus: verification === "verified" ? "verified" : "not-verified",
        createdAt,
      });

      // Every twelfth college gets a *previous* affiliation to another
      // university, so the timeline on the detail page has something to show
      // and the "historical affiliation" model is visible rather than theoretical.
      if (index % 12 === 5) {
        const others = universityCodesByState[seed.stateCode].filter(
          (code) => code !== seed.universityCode
        );
        const previous = universities.get(others[index % others.length]);
        if (previous) {
          const start = new Date(createdAt);
          start.setFullYear(start.getFullYear() - 6);
          const end = new Date(createdAt);
          end.setFullYear(end.getFullYear() - 1);

          affiliationDocs.push({
            collegeId,
            universityId: previous.id,
            collegeName: seed.name,
            universityName: previous.name,
            universityCode: previous.code,
            type: "affiliated",
            status: "expired",
            startDate: start,
            endDate: end,
            referenceNumber: `${previous.code}/AFF/${start.getFullYear()}/${500 + index}`,
            note: "Reallocated when the state reorganised university jurisdictions.",
            verificationStatus: "verified",
            createdAt: start,
          });
        }
      }
    }

    if (seed.autonomy !== "non-autonomous") {
      const granted = daysAgo(1400 + (index % 400));
      autonomyDocs.push({
        collegeId,
        status: "autonomous",
        event: "granted",
        validFrom: granted,
        validUntil: null,
        approvalAuthority: index % 3 === 0 ? "University Grants Commission" : university?.name ?? "UGC",
        approvalReference: `UGC/AUT/${granted.getFullYear()}/${2000 + index}`,
        approvalDate: granted,
        verificationStatus: seed.autonomy === "autonomous" ? "verified" : "pending",
        createdAt: granted,
      });

      // A renewal a few years later, so the timeline reads as a history.
      if (index % 3 === 0) {
        const renewed = daysAgo(400 + (index % 200));
        autonomyDocs.push({
          collegeId,
          status: "autonomous",
          event: "renewed",
          validFrom: renewed,
          validUntil: (() => {
            const until = new Date(renewed);
            until.setFullYear(until.getFullYear() + 6);
            return until;
          })(),
          approvalAuthority: "University Grants Commission",
          approvalReference: `UGC/AUT/REN/${renewed.getFullYear()}/${3000 + index}`,
          approvalDate: renewed,
          verificationStatus: "verified",
          createdAt: renewed,
        });
      }
    }

    seeded.push({
      id: collegeId,
      name: seed.name,
      stateCode: seed.stateCode,
      isEngineering,
      universityId: university?.id ?? null,
    });
  }

  // `insertMany` in batches rather than one `create` per row: 450 sequential
  // round trips to Atlas is most of a minute of waiting.
  await College.insertMany(collegeDocs, { ordered: false });
  await Affiliation.insertMany(affiliationDocs, { ordered: false });
  if (autonomyDocs.length) await AutonomyRecord.insertMany(autonomyDocs, { ordered: false });

  await Promise.all(
    [...collegeCountByUniversity.entries()].map(([id, count]) =>
      University.updateOne({ _id: id }, { $set: { collegeCount: count } })
    )
  );

  console.log(
    `seeded ${seeded.length} colleges, ${affiliationDocs.length} affiliations, ${autonomyDocs.length} autonomy records`
  );
  return seeded;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

// ── Academic structure ─────────────────────────────────────────────────────

async function seedAcademicStructure(colleges: SeededCollege[]) {
  const departments: Record<string, unknown>[] = [];
  const programs: Record<string, unknown>[] = [];
  const campuses: Record<string, unknown>[] = [];
  const departmentCountByCollege = new Map<string, number>();
  const programCountByCollege = new Map<string, number>();

  // Only the first 120 colleges get a full structure. Giving all 450 the same
  // eight departments would be 3,600 rows of identical filler that make the
  // department screen look busy and mean nothing.
  for (const [index, college] of colleges.slice(0, 120).entries()) {
    const list = college.isEngineering ? ENGINEERING_DEPARTMENTS : DEGREE_DEPARTMENTS;
    const take = 3 + (index % (list.length - 2));

    campuses.push({
      collegeId: college.id,
      name: "Main Campus",
      isPrimary: true,
      status: "active",
    });

    for (const seed of list.slice(0, take)) {
      const departmentId = new mongoose.Types.ObjectId();
      departments.push({
        _id: departmentId,
        collegeId: college.id,
        collegeName: college.name,
        name: seed.name,
        code: seed.code,
        canonicalKey: canonicalDepartmentKey(seed.name),
        headOfDepartment: index % 4 === 0 ? null : `Dr. ${pick(SURNAMES)} ${pick(SURNAMES)}`,
        status: "active",
        programCount: 0,
        studentCount: 0,
      });

      const degree = college.isEngineering ? "B.Tech" : DEGREE_FOR_DEPARTMENT[seed.code] ?? "B.Sc";
      programs.push({
        collegeId: college.id,
        departmentId,
        collegeName: college.name,
        departmentName: seed.name,
        name: `${degree} in ${seed.name}`,
        code: `${degree.replace(/\./g, "")}-${seed.code}`,
        degree,
        specialization: seed.name,
        level: "Undergraduate",
        mode: "Regular",
        durationYears: college.isEngineering ? 4 : 3,
        intake: 60 + ((index * 30) % 120),
        status: "active",
      });

      programCountByCollege.set(
        String(college.id),
        (programCountByCollege.get(String(college.id)) ?? 0) + 1
      );
    }

    departmentCountByCollege.set(String(college.id), take);
  }

  await Campus.insertMany(campuses, { ordered: false });
  await Department.insertMany(departments, { ordered: false });
  await Program.insertMany(programs, { ordered: false });

  await Promise.all(
    [...departmentCountByCollege.entries()].map(([id, count]) =>
      College.updateOne(
        { _id: id },
        { $set: { departmentCount: count, programCount: programCountByCollege.get(id) ?? 0 } }
      )
    )
  );

  console.log(`seeded ${departments.length} departments, ${programs.length} programs`);
}

const DEGREE_FOR_DEPARTMENT: Record<string, string> = {
  COM: "B.Com",
  BCA: "BCA",
  BBA: "BBA",
  MATHS: "B.Sc",
  PHY: "B.Sc",
  ENG: "B.A.",
};

async function seedAcademicYears() {
  const thisYear = new Date().getFullYear();
  const years = [-2, -1, 0, 1].map((offset) => {
    const start = thisYear + offset;
    return {
      label: `${start}-${String((start + 1) % 100).padStart(2, "0")}`,
      startDate: new Date(start, 5, 1),
      endDate: new Date(start + 1, 3, 30),
      isCurrent: offset === 0,
      status: offset < 0 ? "closed" : offset === 0 ? "active" : "upcoming",
    };
  });
  await AcademicYear.insertMany(years);
  console.log(`seeded ${years.length} academic years`);
}

// ── Students ───────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Aarav", "Vihaan", "Ananya", "Sai", "Harika", "Rohith", "Sravani", "Karthik", "Divya", "Manoj",
  "Pravalika", "Naveen", "Sindhu", "Yaswanth", "Keerthi", "Charan", "Bhavana", "Sandeep", "Nikhitha",
  "Teja", "Sushma", "Abhinav", "Sowmya", "Vamsi", "Deepika", "Lokesh", "Anusha", "Ravi", "Meghana",
  "Srikanth", "Pooja", "Chaitanya", "Swathi", "Bhargav", "Lavanya", "Akhil", "Ramya", "Nithin",
];

const SURNAMES = [
  "Reddy", "Naidu", "Rao", "Sharma", "Kumar", "Prasad", "Varma", "Chowdary", "Goud", "Yadav",
  "Sastry", "Murthy", "Raju", "Babu", "Krishna", "Mohan", "Bhaskar", "Srinivas", "Venkat", "Anand",
];

const BRANCHES = [
  "Computer Science and Engineering",
  "Information Technology",
  "Electronics and Communication Engineering",
  "Electrical and Electronics Engineering",
  "Mechanical Engineering",
  "Civil Engineering",
  "Artificial Intelligence and Machine Learning",
  "Data Science",
  "Commerce",
  "Business Administration",
];

async function seedStudents(colleges: SeededCollege[]): Promise<number> {
  const passwordHash = await bcrypt.hash(STUDENT_PASSWORD, 12);
  const users: Record<string, unknown>[] = [];
  const profiles: Record<string, unknown>[] = [];
  const thisYear = new Date().getFullYear();

  for (let index = 0; index < STUDENTS; index += 1) {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = SURNAMES[(index * 3) % SURNAMES.length];
    const userId = new mongoose.Types.ObjectId();

    // Registrations are weighted towards recent months, which is what a growing
    // platform's curve actually looks like — an even spread would make the
    // growth chart a flat line and tell nobody anything.
    const age = Math.floor(365 * (1 - Math.sqrt(random())));
    const createdAt = daysAgo(age);

    // Four states, in the proportions a real funnel produces.
    const stage = index % 10;
    const emailVerified = stage > 0;
    const hasProfile = stage > 1;
    const profileCompleted = stage > 3;

    users.push({
      _id: userId,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${index}@example.com`,
      passwordHash,
      authProvider: index % 5 === 0 ? "google" : "email",
      googleId: index % 5 === 0 ? `google-seed-${index}` : undefined,
      emailVerified,
      role: "student",
      city: null,
      phone: index % 3 === 0 ? `+91 9${String(100000000 + ((index * 971) % 899999999))}` : null,
      createdAt,
      updatedAt: daysAgo(Math.max(0, age - Math.floor(random() * age))),
    });

    if (!hasProfile) continue;

    const college = colleges[Math.floor(random() * Math.min(colleges.length, 220))];
    const branch = BRANCHES[index % BRANCHES.length];
    const currentYear = 1 + (index % 4);
    const graduated = index % 17 === 0;

    profiles.push({
      userId,
      collegeId: college.id,
      collegeName: college.name,
      degree: college.isEngineering ? "B.Tech" : pick(["B.Com", "BBA", "BCA", "B.Sc", "B.A."]),
      specialization: profileCompleted ? branch : branch,
      studyStatus: graduated ? "graduated" : "studying",
      currentYear: graduated ? null : currentYear,
      graduationYear: graduated ? thisYear - (index % 3) : thisYear + (5 - currentYear),
      profileCompleted,
      createdAt,
      updatedAt: daysAgo(Math.floor(random() * 45)),
    });
  }

  await User.insertMany(users, { ordered: false });
  await StudentProfile.insertMany(profiles, { ordered: false });

  console.log(`seeded ${users.length} students (${profiles.length} with a profile)`);
  return users.length;
}

/**
 * Recomputes `College.studentCount` from the profiles.
 *
 * The same aggregation the `recount-college-students` background job runs, and
 * the reason that counter is described as maintained by a job rather than
 * incremented per signup.
 */
async function recountCollegeStudents() {
  const counts = await StudentProfile.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { collegeId: { $ne: null } } },
    { $group: { _id: "$collegeId", count: { $sum: 1 } } },
  ]);

  if (counts.length === 0) return;

  await College.bulkWrite(
    counts.map((row) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: { studentCount: row.count } } },
    })),
    { ordered: false }
  );

  console.log(`recounted students across ${counts.length} colleges`);
}

// ── Import history ─────────────────────────────────────────────────────────

async function seedImportHistory(admins: SeededAdmin[], colleges: SeededCollege[]) {
  const importer = admins.find((admin) => admin.roleSlug === "institution-admin") ?? admins[0];

  const jobs = [
    {
      fileName: "ap-engineering-colleges-2026.xlsx",
      fileType: "xlsx" as const,
      stage: "completed" as const,
      total: 248,
      created: 231,
      updated: 12,
      skipped: 5,
      failed: 0,
      invalid: 0,
      duplicates: 12,
      warnings: 9,
      days: 21,
      duration: 42_000,
    },
    {
      fileName: "telangana-degree-colleges.csv",
      fileType: "csv" as const,
      stage: "completed-with-warnings" as const,
      total: 1250,
      created: 1100,
      updated: 75,
      skipped: 42,
      failed: 33,
      invalid: 22,
      duplicates: 42,
      warnings: 64,
      days: 9,
      duration: 118_000,
    },
    {
      fileName: "affiliations-jntuh-batch3.csv",
      fileType: "csv" as const,
      stage: "failed" as const,
      total: 480,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      invalid: 0,
      duplicates: 0,
      warnings: 0,
      days: 4,
      duration: 3_100,
      error: "The file has no header row, so no column could be mapped.",
    },
  ];

  for (const job of jobs) {
    const createdAt = daysAgo(job.days);
    const doc = await ImportJob.create({
      entity: "college",
      stage: job.stage,
      fileName: job.fileName,
      fileType: job.fileType,
      fileSize: job.total * 180,
      sourceColumns: ["College Name", "College Code", "University", "District", "State", "Autonomous", "Website"],
      columnMapping: {
        "College Name": "name",
        "College Code": "code",
        University: "universityName",
        District: "districtName",
        State: "stateName",
        Autonomous: "autonomyStatus",
        Website: "website",
      },
      totalRows: job.total,
      validRows: job.total - job.invalid - job.duplicates,
      invalidRows: job.invalid,
      warningRows: job.warnings,
      duplicateRows: job.duplicates,
      createdCount: job.created,
      updatedCount: job.updated,
      skippedCount: job.skipped,
      failedCount: job.failed,
      progress: job.stage === "failed" ? 0 : 100,
      options: { duplicateStrategy: "update", ignoreWarnings: true, createMissingUniversities: false, dryRun: false },
      startedAt: createdAt,
      completedAt: new Date(createdAt.getTime() + job.duration),
      durationMs: job.duration,
      errorMessage: job.error ?? null,
      uploadedBy: importer.id,
      uploadedByName: importer.name,
      createdAt,
    });

    // A representative slice of rows rather than all 1,250 — enough for the
    // per-row inspector to be real, without a seed that writes 2,000 documents
    // nobody will read.
    const sampleRows: Record<string, unknown>[] = [];
    for (let index = 0; index < Math.min(40, job.total); index += 1) {
      const college = colleges[(index * 7) % colleges.length];
      const status =
        index % 11 === 0 ? "invalid" : index % 7 === 0 ? "duplicate" : index % 5 === 0 ? "updated" : "created";

      sampleRows.push({
        jobId: doc._id,
        rowNumber: index + 1,
        raw: {
          "College Name": college.name,
          "College Code": `C${1000 + index}`,
          University: "JNTUH",
          District: "Rangareddy",
          State: index % 11 === 0 ? "AP" : "Telangana",
          Autonomous: index % 4 === 0 ? "Yes" : "No",
        },
        mapped: { name: college.name, code: `C${1000 + index}`, stateName: "Telangana" },
        status,
        rowErrors:
          status === "invalid"
            ? [{ field: "stateName", value: "AP", message: "Use the full state name, not an abbreviation" }]
            : [],
        rowWarnings:
          index % 6 === 0
            ? [{ field: "website", value: "", message: "No website supplied" }]
            : [],
        matchedEntityId: status === "duplicate" ? college.id : null,
        matchedEntityLabel: status === "duplicate" ? college.name : null,
        matchScore: status === "duplicate" ? 92 - (index % 8) : null,
        matchReasons: status === "duplicate" ? ["Name is a near-exact match", "Same district"] : [],
        resultEntityId: status === "created" || status === "updated" ? college.id : null,
      });
    }

    await ImportRow.insertMany(sampleRows, { ordered: false });
  }

  console.log(`seeded ${jobs.length} import jobs with sample rows`);
}

// ── System ─────────────────────────────────────────────────────────────────

async function seedSystem(admins: SeededAdmin[]) {
  const owner = admins[0];

  await ExportJob.insertMany([
    {
      entity: "college",
      format: "xlsx",
      filters: { state: "Andhra Pradesh", verification: "verified" },
      scope: "filtered",
      status: "completed",
      progress: 100,
      rowCount: 186,
      fileName: "colleges-andhra-pradesh-verified.xlsx",
      fileSize: 96_400,
      requestedBy: owner.id,
      requestedByName: owner.name,
      completedAt: daysAgo(3),
      durationMs: 4_200,
      expiresAt: (() => {
        const date = new Date();
        date.setDate(date.getDate() + 4);
        return date;
      })(),
      createdAt: daysAgo(3),
    },
    {
      entity: "student",
      format: "csv",
      filters: { profile: "incomplete" },
      scope: "filtered",
      status: "completed",
      progress: 100,
      rowCount: 128,
      fileName: "students-incomplete-profiles.csv",
      fileSize: 22_800,
      requestedBy: owner.id,
      requestedByName: owner.name,
      completedAt: daysAgo(11),
      durationMs: 1_900,
      // Expired: the row stays as the record that the export happened even
      // though the file is long gone.
      expiresAt: daysAgo(4),
      createdAt: daysAgo(11),
    },
  ]);

  await BackgroundJob.insertMany([
    {
      type: "recount-college-students",
      label: "Recount students per college",
      status: "completed",
      progress: 100,
      result: { collegesUpdated: 218 },
      attempts: 1,
      startedAt: daysAgo(1),
      finishedAt: daysAgo(1),
      durationMs: 8_400,
      createdAt: daysAgo(1),
    },
    {
      type: "data-quality-scan",
      label: "Scan institution data for gaps and duplicates",
      status: "completed",
      progress: 100,
      result: { issues: 96 },
      attempts: 1,
      startedAt: daysAgo(1),
      finishedAt: daysAgo(1),
      durationMs: 15_100,
      createdAt: daysAgo(1),
    },
    {
      type: "send-verification-reminders",
      label: "Remind students with unconfirmed addresses",
      status: "failed",
      progress: 34,
      errorMessage: "The mail transport refused the batch: rate limit exceeded.",
      attempts: 3,
      maxAttempts: 3,
      startedAt: daysAgo(2),
      finishedAt: daysAgo(2),
      durationMs: 61_000,
      createdAt: daysAgo(2),
    },
    {
      type: "rebuild-search-index",
      label: "Rebuild the college search index",
      status: "queued",
      progress: 0,
      attempts: 0,
      createdAt: daysAgo(0),
    },
  ]);

  await ErrorLog.insertMany([
    {
      level: "error",
      source: "import",
      message: "Cannot read column mapping for a file with no header row",
      fingerprint: "import:no-header",
      occurrences: 3,
      lastSeenAt: daysAgo(4),
      createdAt: daysAgo(9),
    },
    {
      level: "warn",
      source: "email",
      message: "Postal responded 429: too many messages for this credential",
      fingerprint: "email:rate-limit",
      occurrences: 41,
      lastSeenAt: daysAgo(2),
      createdAt: daysAgo(14),
    },
    {
      level: "error",
      source: "api",
      message: "College search regex timed out after 5000ms",
      fingerprint: "api:college-search-timeout",
      occurrences: 2,
      lastSeenAt: daysAgo(6),
      createdAt: daysAgo(6),
    },
  ]);

  await FeatureFlag.insertMany([
    { key: "student-communities", name: "Student Communities", description: "Groups students can join and post in.", state: "enabled", updatedByName: owner.name },
    { key: "college-verification", name: "College Verification", description: "Shows the verified badge on college profiles.", state: "enabled", updatedByName: owner.name },
    { key: "events", name: "Events", description: "Campus and platform event listings.", state: "disabled", updatedByName: owner.name },
    { key: "ai-recommendations", name: "AI Recommendations", description: "Personalised content suggestions.", state: "beta", enabledForRoles: ["super-admin", "platform-admin"], updatedByName: owner.name },
    { key: "placements-module", name: "Placements", description: "Opportunity listings and applications.", state: "rollout", rolloutPercentage: 25, updatedByName: owner.name },
    { key: "peer-connections", name: "Peer Connections", description: "Student-to-student connection requests.", state: "rollout", rolloutPercentage: 60, updatedByName: owner.name },
  ]);

  await Setting.insertMany([
    { key: "general.platformName", group: "general", value: "EduPilot", valueType: "string", label: "Platform name", description: "Shown in the browser tab, emails and the student app header." },
    { key: "general.supportEmail", group: "general", value: "support@edupilot.dev", valueType: "string", label: "Support email", description: "Where students are told to write." },
    { key: "general.timezone", group: "general", value: "Asia/Kolkata", valueType: "string", label: "Timezone", description: "Used for scheduling and for every date shown in the admin." },
    { key: "general.defaultLanguage", group: "general", value: "en-IN", valueType: "string", label: "Default language" },
    { key: "academic.currentYear", group: "academic", value: `${new Date().getFullYear()}-${String((new Date().getFullYear() + 1) % 100).padStart(2, "0")}`, valueType: "string", label: "Current academic year" },
    { key: "academic.maxStudyYear", group: "academic", value: 5, valueType: "number", label: "Highest study year", description: "The largest value the onboarding year selector offers." },
    { key: "institution.requireVerification", group: "institution", value: true, valueType: "boolean", label: "Require verification before a college is shown as verified" },
    { key: "institution.allowStudentSubmissions", group: "institution", value: true, valueType: "boolean", label: "Let students add a college that is missing", description: "Submissions land in Data Quality for review." },
    { key: "security.sessionTimeoutMinutes", group: "security", value: 480, valueType: "number", label: "Admin session lifetime (minutes)" },
    { key: "security.idleTimeoutMinutes", group: "security", value: 120, valueType: "number", label: "Admin idle timeout (minutes)" },
    { key: "security.require2FA", group: "security", value: false, valueType: "boolean", label: "Require two-factor authentication for all administrators" },
    { key: "security.loginLockoutThreshold", group: "security", value: 8, valueType: "number", label: "Failed sign-ins before an account locks" },
    { key: "communication.fromName", group: "communication", value: "EduPilot", valueType: "string", label: "Email sender name" },
    { key: "communication.fromEmail", group: "communication", value: "no-reply@edupilot.dev", valueType: "string", label: "Email sender address" },
  ]);

  console.log("seeded exports, jobs, error log, feature flags and settings");
}

async function seedSavedViews(admins: SeededAdmin[]) {
  await SavedView.insertMany([
    { name: "Pending AP colleges", resource: "colleges", filters: { state: "Andhra Pradesh", verification: "pending" }, shared: true, system: true },
    { name: "Telangana autonomous", resource: "colleges", filters: { state: "Telangana", autonomy: "autonomous" }, shared: true, system: true },
    { name: "Unverified", resource: "colleges", filters: { verification: "not-verified" }, shared: true, system: true },
    { name: "Student-added colleges", resource: "colleges", filters: { source: "student" }, shared: true, system: true },
    { name: "Incomplete profiles", resource: "students", filters: { profile: "incomplete" }, shared: true, system: true },
    { name: "My drafts", resource: "colleges", filters: { source: "admin" }, ownerId: admins[0].id, shared: false, system: false },
  ]);
  console.log("seeded saved views");
}

// ── Audit and login history ────────────────────────────────────────────────

async function seedAuditTrail(
  admins: SeededAdmin[],
  colleges: SeededCollege[],
  universities: Map<string, SeededUniversity>
) {
  const entries: Record<string, unknown>[] = [];

  const templates = [
    { action: "college.verify", before: { verificationStatus: "pending" }, after: { verificationStatus: "verified" } },
    { action: "college.update", before: { autonomyStatus: "non-autonomous" }, after: { autonomyStatus: "autonomous" } },
    { action: "college.update", before: { website: null }, after: { website: "https://example.ac.in" } },
    { action: "college.create", before: null, after: { name: "New college" } },
    { action: "college.reject", before: { verificationStatus: "pending" }, after: { verificationStatus: "rejected" } },
  ];

  for (let index = 0; index < 90; index += 1) {
    const admin = admins[index % Math.min(admins.length, 6)];
    const college = colleges[(index * 13) % colleges.length];
    const template = templates[index % templates.length];

    entries.push({
      actorId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      actorRole: admin.roleName,
      actorType: "admin",
      action: template.action,
      entityType: "College",
      entityId: college.id,
      entityLabel: college.name,
      before: template.before,
      after: template.after,
      severity: severityFor(template.action),
      ip: `103.21.58.${10 + (index % 200)}`,
      source: "admin-ui",
      createdAt: daysAgo(Math.floor(index / 2)),
    });
  }

  const firstUniversity = [...universities.values()][0];
  const owner = admins[0];

  entries.push(
    {
      actorId: owner.id,
      actorName: owner.name,
      actorEmail: owner.email,
      actorRole: owner.roleName,
      actorType: "admin",
      action: "role.permissions.update",
      entityType: "Role",
      entityLabel: "AP Data Reviewer",
      before: { permissions: ["college.view"] },
      after: { permissions: ["college.view", "college.verify"] },
      severity: "critical",
      ip: "103.21.58.14",
      createdAt: daysAgo(12),
    },
    {
      actorId: owner.id,
      actorName: owner.name,
      actorEmail: owner.email,
      actorRole: owner.roleName,
      actorType: "admin",
      action: "admin.invite",
      entityType: "AdminUser",
      entityLabel: "Meera Nair",
      after: { email: "meera@edupilot.dev", roleName: "Analytics Admin" },
      severity: "critical",
      createdAt: daysAgo(2),
    },
    {
      actorType: "import",
      actorName: "Bulk import",
      action: "import.commit",
      entityType: "ImportJob",
      entityLabel: "telangana-degree-colleges.csv",
      after: { created: 1100, updated: 75, skipped: 42 },
      severity: "critical",
      source: "import-job",
      createdAt: daysAgo(9),
    },
    {
      actorType: "system",
      actorName: "System",
      action: "system.job.run",
      entityType: "BackgroundJob",
      entityLabel: "recount-college-students",
      after: { collegesUpdated: 218 },
      severity: "info",
      source: "job",
      createdAt: daysAgo(1),
    },
    {
      actorId: owner.id,
      actorName: owner.name,
      actorEmail: owner.email,
      actorRole: owner.roleName,
      actorType: "admin",
      action: "university.update",
      entityType: "University",
      entityId: firstUniversity?.id ?? null,
      entityLabel: firstUniversity?.name ?? "University",
      before: { verificationStatus: "pending" },
      after: { verificationStatus: "verified" },
      severity: "info",
      createdAt: daysAgo(15),
    }
  );

  await AuditLog.insertMany(entries, { ordered: false });
  console.log(`seeded ${entries.length} audit entries`);
}

async function seedLoginHistory(admins: SeededAdmin[]) {
  const events: Record<string, unknown>[] = [];

  for (let index = 0; index < 60; index += 1) {
    const admin = admins[index % Math.min(admins.length, 5)];
    events.push({
      adminId: admin.id,
      email: admin.email,
      outcome: index % 13 === 0 ? "bad-password" : "success",
      ip: `103.21.58.${10 + (index % 60)}`,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      createdAt: daysAgo(Math.floor(index / 3)),
    });
  }

  // Probing against an address that has no account — the kind of thing the
  // security screen exists to surface.
  for (let index = 0; index < 6; index += 1) {
    events.push({
      adminId: null,
      email: "admin@edupilot.dev",
      outcome: "unknown-account",
      ip: "45.132.9.201",
      userAgent: "python-requests/2.31.0",
      createdAt: daysAgo(1),
    });
  }

  await AdminLoginEvent.insertMany(events, { ordered: false });
  console.log(`seeded ${events.length} login events`);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
