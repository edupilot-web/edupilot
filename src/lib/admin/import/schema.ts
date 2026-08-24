import {
  AUTONOMY_STATUSES,
  INSTITUTION_TYPES,
  MANAGEMENT_TYPES,
  MIN_ESTABLISHED_YEAR,
} from "@/lib/admin/institution-fields";
import { isValidPincode } from "@/models/Geo";

/**
 * The fields a college import can populate, and how each is coerced.
 *
 * One declaration drives four things: the sample template, the auto-mapping
 * guesses, per-cell validation, and the write. Four hand-maintained lists would
 * drift, and the symptom would be a column the template offers and the importer
 * silently ignores.
 */
export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  /** Header names, lower-cased, that map to this field without being asked. */
  aliases: string[];
  /** One line for the mapping screen. */
  hint?: string;
  /**
   * Normalises a raw cell. Returns the value to store, plus an optional
   * complaint. A `warning` still imports; an `error` stops that row.
   */
  coerce: (raw: string) => { value: unknown; error?: string; warning?: string };
};

const text = (max: number) => (raw: string) => {
  const value = raw.trim();
  if (value.length > max) {
    return { value: value.slice(0, max), warning: `Trimmed to ${max} characters` };
  }
  return { value: value || null };
};

/** Matches an enum case-insensitively and returns the canonical spelling. */
function enumOf(allowed: readonly string[], label: string) {
  const lookup = new Map(allowed.map((entry) => [entry.toLowerCase(), entry]));
  return (raw: string) => {
    const value = raw.trim();
    if (!value) return { value: null };
    const matched = lookup.get(value.toLowerCase());
    if (!matched) {
      return {
        value: null,
        error: `"${value}" is not a valid ${label}. Use one of: ${allowed.slice(0, 5).join(", ")}${allowed.length > 5 ? "…" : ""}`,
      };
    }
    return { value: matched };
  };
}

/**
 * Yes/no columns. Spreadsheets express these as Yes, Y, TRUE, 1, ✓ and a dozen
 * other things; anything unrecognised is an error rather than a silent "no",
 * because a wrongly-false autonomy flag is invisible once imported.
 */
const TRUTHY = new Set(["yes", "y", "true", "1", "t", "autonomous"]);
const FALSY = new Set(["no", "n", "false", "0", "f", "non-autonomous", "not autonomous"]);

export const COLLEGE_IMPORT_FIELDS: ImportField[] = [
  {
    key: "name",
    label: "College name",
    required: true,
    aliases: ["college name", "name", "institution name", "institute name", "college"],
    coerce: (raw) => {
      const value = raw.trim().replace(/\s+/g, " ");
      if (!value) return { value: null, error: "College name is required" };
      if (value.length < 3) return { value: null, error: "That name is too short to be a college" };
      if (value.length > 200) {
        return { value: value.slice(0, 200), warning: "Name trimmed to 200 characters" };
      }
      return { value };
    },
  },
  {
    key: "code",
    label: "College code",
    aliases: ["college code", "code", "aicte code", "eamcet code", "institution code"],
    hint: "Used to match against existing colleges before names are compared.",
    coerce: (raw) => {
      const value = raw.trim().toUpperCase();
      if (!value) return { value: null };
      if (value.length > 20) return { value: null, error: "Codes are at most 20 characters" };
      return { value };
    },
  },
  {
    key: "officialName",
    label: "Official name",
    aliases: ["official name", "legal name", "full name"],
    coerce: text(250),
  },
  {
    key: "universityName",
    label: "Affiliated university",
    aliases: ["university", "affiliated university", "affiliating university", "parent university"],
    hint: "Matched by name or short code against the universities already in the system.",
    coerce: text(200),
  },
  {
    key: "institutionType",
    label: "Institution type",
    aliases: ["institution type", "type", "college type"],
    coerce: enumOf(INSTITUTION_TYPES, "institution type"),
  },
  {
    key: "managementType",
    label: "Management type",
    aliases: ["management", "management type", "ownership"],
    coerce: enumOf(MANAGEMENT_TYPES, "management type"),
  },
  {
    key: "autonomyStatus",
    label: "Autonomous",
    aliases: ["autonomous", "autonomy", "autonomous status", "is autonomous"],
    hint: "Accepts Yes/No as well as the full status names.",
    coerce: (raw) => {
      const value = raw.trim().toLowerCase();
      if (!value) return { value: null };
      if (TRUTHY.has(value)) return { value: "autonomous" };
      if (FALSY.has(value)) return { value: "non-autonomous" };
      const matched = (AUTONOMY_STATUSES as readonly string[]).find(
        (status) => status.toLowerCase() === value
      );
      if (matched) return { value: matched };
      return {
        value: null,
        error: `"${raw.trim()}" is not a yes/no value or a known autonomy status`,
      };
    },
  },
  {
    key: "stateName",
    label: "State",
    required: true,
    aliases: ["state", "state name"],
    hint: "Must match a state already in the system — use the full name, not an abbreviation.",
    coerce: (raw) => {
      const value = raw.trim();
      if (!value) return { value: null, error: "State is required" };
      // Abbreviations are the single commonest import mistake, and the message
      // has to say what to do rather than just that it is wrong.
      if (value.length <= 3) {
        return {
          value: null,
          error: `Use the full state name rather than "${value}" — for example "Andhra Pradesh", not "AP"`,
        };
      }
      return { value };
    },
  },
  {
    key: "districtName",
    label: "District",
    aliases: ["district", "district name"],
    coerce: text(80),
  },
  {
    key: "cityName",
    label: "City",
    aliases: ["city", "town", "city name", "place"],
    coerce: text(80),
  },
  {
    key: "pincode",
    label: "Pincode",
    aliases: ["pincode", "pin code", "postal code", "zip"],
    coerce: (raw) => {
      const value = raw.trim().replace(/\s+/g, "");
      if (!value) return { value: null };
      if (!isValidPincode(value)) {
        return { value: null, warning: `"${value}" is not a six-digit pincode; it was left blank` };
      }
      return { value };
    },
  },
  {
    key: "address",
    label: "Address",
    aliases: ["address", "street address", "location"],
    coerce: text(400),
  },
  {
    key: "website",
    label: "Website",
    aliases: ["website", "url", "web", "site"],
    coerce: (raw) => {
      const value = raw.trim();
      if (!value) return { value: null };
      // A bare domain is what people paste; adding the scheme is a correction
      // the operator would make by hand for every row otherwise.
      const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
      if (!/^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(withScheme)) {
        return { value: null, warning: `"${value}" does not look like a website; it was left blank` };
      }
      return {
        value: withScheme,
        warning: withScheme === value ? undefined : "Added https:// to the website",
      };
    },
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "email address", "contact email"],
    coerce: (raw) => {
      const value = raw.trim().toLowerCase();
      if (!value) return { value: null };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        return { value: null, warning: `"${value}" is not a valid email; it was left blank` };
      }
      return { value };
    },
  },
  {
    key: "phone",
    label: "Phone",
    aliases: ["phone", "phone number", "contact", "mobile", "telephone"],
    coerce: text(40),
  },
  {
    key: "establishedYear",
    label: "Established year",
    aliases: ["established", "established year", "year established", "founded", "since"],
    coerce: (raw) => {
      const value = raw.trim();
      if (!value) return { value: null };
      const year = Number(value);
      const thisYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < MIN_ESTABLISHED_YEAR || year > thisYear) {
        return {
          value: null,
          warning: `"${value}" is not a year between ${MIN_ESTABLISHED_YEAR} and ${thisYear}; it was left blank`,
        };
      }
      return { value: year };
    },
  },
  {
    key: "accreditationGrade",
    label: "NAAC grade",
    aliases: ["naac", "naac grade", "grade", "accreditation"],
    coerce: (raw) => {
      const value = raw.trim().toUpperCase();
      if (!value) return { value: null };
      if (value.length > 20) return { value: null, warning: "Grade was too long and was ignored" };
      return { value };
    },
  },
];

const FIELD_BY_KEY = new Map(COLLEGE_IMPORT_FIELDS.map((field) => [field.key, field]));

export function importField(key: string): ImportField | undefined {
  return FIELD_BY_KEY.get(key);
}

/**
 * Guesses a mapping from the uploaded headers.
 *
 * Exact alias match first, then a contains match, so "College Name (English)"
 * still finds `name`. A header that matches nothing maps to "" — ignored —
 * which is shown on the mapping screen rather than assumed.
 */
export function autoMapColumns(columns: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();

  for (const column of columns) {
    const needle = column.trim().toLowerCase();

    const exact = COLLEGE_IMPORT_FIELDS.find(
      (field) => !taken.has(field.key) && field.aliases.includes(needle)
    );
    if (exact) {
      mapping[column] = exact.key;
      taken.add(exact.key);
      continue;
    }

    const partial = COLLEGE_IMPORT_FIELDS.find(
      (field) =>
        !taken.has(field.key) &&
        field.aliases.some((alias) => needle.includes(alias) || alias.includes(needle))
    );
    if (partial) {
      mapping[column] = partial.key;
      taken.add(partial.key);
      continue;
    }

    mapping[column] = "";
  }

  return mapping;
}

/** The sample template offered on the upload step. */
export function sampleTemplateRows(): { columns: string[]; rows: string[][] } {
  const columns = COLLEGE_IMPORT_FIELDS.map((field) => field.label);
  return {
    columns,
    rows: [
      [
        "Andhra Loyola College",
        "ALC",
        "Andhra Loyola College, Vijayawada",
        "Krishna University",
        "Autonomous College",
        "Private Aided",
        "Yes",
        "Andhra Pradesh",
        "NTR",
        "Vijayawada",
        "520008",
        "Gunadala, Vijayawada",
        "www.andhraloyolacollege.ac.in",
        "principal@andhraloyolacollege.ac.in",
        "+91 866 2474999",
        "1953",
        "A+",
      ],
      [
        "Vasavi College of Engineering",
        "VCE",
        "",
        "Osmania University",
        "Autonomous College",
        "Private Unaided",
        "Yes",
        "Telangana",
        "Hyderabad",
        "Hyderabad",
        "500031",
        "Ibrahimbagh, Hyderabad",
        "https://www.vce.ac.in",
        "principal@vce.ac.in",
        "",
        "1981",
        "A++",
      ],
    ],
  };
}
