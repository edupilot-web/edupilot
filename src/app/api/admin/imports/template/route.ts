import { requirePermission } from "@/lib/admin/current-admin";
import { sampleTemplateRows } from "@/lib/admin/import/schema";

/**
 * The sample import template, as CSV.
 *
 * Generated from `COLLEGE_IMPORT_FIELDS` rather than kept as a static file, so
 * the template can never offer a column the importer does not understand, or
 * miss one it does.
 *
 * CSV rather than XLSX: it opens in Excel, Sheets and Numbers alike, it is
 * legible in a text editor, and generating it needs no library.
 */
export async function GET() {
  await requirePermission("college.import", "/admin/imports/new");

  const { columns, rows } = sampleTemplateRows();
  const lines = [columns, ...rows].map((row) => row.map(escapeCsv).join(","));

  // The BOM makes Excel open it as UTF-8. Without it, a college name with a
  // non-ASCII character is mangled the moment the operator double-clicks.
  const body = `﻿${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="edupilot-college-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}

/** Quotes a field when it contains a comma, quote or newline. */
function escapeCsv(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
