import ExcelJS from "exceljs";

/**
 * Turning an uploaded file into rows.
 *
 * CSV is parsed here rather than with a library: the format is small enough to
 * implement correctly (quoting, embedded commas, embedded newlines, escaped
 * quotes) and doing so avoids a dependency on the hot path of the most common
 * upload. XLS/XLSX genuinely need one — they are zipped XML — and that is
 * `exceljs`.
 */

export type ParsedFile = {
  /** Header row, in file order, trimmed. */
  columns: string[];
  /** One object per data row, keyed by header. Values are strings. */
  rows: Record<string, string>[];
  /** Rows read before the cap was hit, if it was. */
  truncated: boolean;
};

/**
 * Hard cap on rows read from one file.
 *
 * 50,000 colleges is far more than any real upload and keeps the parse inside
 * a request's memory budget. A larger file is a signal to split it, and the
 * wizard says so rather than falling over halfway.
 */
export const MAX_ROWS = 50_000;

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export class ImportParseError extends Error {}

export function detectFileType(fileName: string): "csv" | "xls" | "xlsx" | null {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "csv") return "csv";
  if (extension === "xls") return "xls";
  if (extension === "xlsx") return "xlsx";
  return null;
}

export async function parseUpload(file: File): Promise<ParsedFile> {
  const type = detectFileType(file.name);
  if (!type) {
    throw new ImportParseError("Upload a .csv, .xls or .xlsx file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportParseError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1024 / 1024} MB — split it and import in batches.`
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return type === "csv" ? parseCsv(buffer.toString("utf8")) : parseWorkbook(buffer);
}

/**
 * RFC 4180-ish CSV.
 *
 * Handles quoted fields, commas and newlines inside quotes, and doubled quotes
 * as an escape. Deliberately does not try to sniff the delimiter: a file that
 * uses semicolons is better rejected with "no columns were found" than silently
 * parsed as one enormous column.
 */
export function parseCsv(text: string): ParsedFile {
  // Strip a UTF-8 BOM. Excel writes one, and it would otherwise become part of
  // the first header name — "﻿College Name" matches nothing.
  const input = text.replace(/^﻿/, "");

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the LF of a CRLF pair rather than emitting an empty record.
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += char;
    }
  }

  // Whatever is left when the input ends is the final record, unless the file
  // ended with a newline and both are empty.
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((entry) => entry.some((value) => value.trim() !== ""));
  if (nonEmpty.length === 0) throw new ImportParseError("That file is empty.");

  const columns = nonEmpty[0].map((value) => value.trim());
  if (columns.every((value) => value === "")) {
    throw new ImportParseError("The first row is blank — it must be the column headers.");
  }

  return buildRows(columns, nonEmpty.slice(1));
}

async function parseWorkbook(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();

  try {
    // `.xls` is a different, older binary format that exceljs cannot read. It
    // is accepted at the picker because operators think of it as "Excel", and
    // refused here with the one instruction that actually resolves it.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportParseError(
      "That file could not be read as a spreadsheet. If it is an older .xls file, open it in Excel and save as .xlsx or .csv."
    );
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportParseError("That workbook has no sheets.");

  const records: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (records.length > MAX_ROWS) return;
    const values: string[] = [];
    // `row.values` is 1-based with a hole at index 0.
    const cells = row.values as unknown[];
    for (let index = 1; index < cells.length; index += 1) {
      values.push(cellToString(cells[index]));
    }
    records.push(values);
  });

  if (records.length === 0) throw new ImportParseError("That sheet is empty.");

  const columns = records[0].map((value) => value.trim());
  if (columns.every((value) => value === "")) {
    throw new ImportParseError("The first row is blank — it must be the column headers.");
  }

  return buildRows(columns, records.slice(1));
}

/** Excel cells arrive as strings, numbers, dates, formulas or rich text. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A formula cell carries both the formula and its last computed result.
    // The result is what the operator sees in Excel, so it is what we import.
    if ("result" in record) return cellToString(record.result);
    if ("text" in record) return String(record.text);
    if ("hyperlink" in record) return String(record.text ?? record.hyperlink);
    if ("richText" in record && Array.isArray(record.richText)) {
      return record.richText.map((part) => String((part as { text?: string }).text ?? "")).join("");
    }
  }

  return String(value);
}

function buildRows(columns: string[], records: string[][]): ParsedFile {
  const named = dedupeColumns(columns);
  const rows: Record<string, string>[] = [];
  let truncated = false;

  for (const record of records) {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    // A row of nothing but empty cells is spacing in a spreadsheet, not data.
    if (record.every((value) => (value ?? "").trim() === "")) continue;

    const row: Record<string, string> = {};
    named.forEach((column, index) => {
      row[column] = (record[index] ?? "").trim();
    });
    rows.push(row);
  }

  return { columns: named, rows, truncated };
}

/**
 * Makes header names unique.
 *
 * Two columns called "Name" would otherwise silently collapse into one, and the
 * operator would see a mapping screen missing a column they can see in Excel.
 * Blank headers become "Column 3" so they can still be mapped or ignored.
 */
function dedupeColumns(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map((raw, index) => {
    const base = raw.trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
}
