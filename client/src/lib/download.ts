/* ============================================================
   Client-side file downloads

   The blob-download dance was duplicated verbatim in three places,
   and CSV rows were built by string interpolation of user-controlled
   names — a comma broke the file and a leading `=` turned a cell into
   a live formula when opened in Excel.
   ============================================================ */

export function downloadBlob(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Quote a CSV field and neutralise formula injection. A cell starting
 * with = + - @ (or tab/CR) is executed by Excel and Sheets, so a user
 * named `=cmd|'/c calc'!A1` becomes an attack on whoever opens the
 * export. Prefixing with an apostrophe keeps it inert and readable.
 */
function escapeCsvField(value: string): string {
  const raw = String(value ?? "");
  const needsGuard = /^[=+\-@\t\r]/.test(raw);
  const guarded = needsGuard ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map(row => row.map(escapeCsvField).join(",")),
  ];
  // BOM so Excel opens UTF-8 Hebrew correctly instead of mojibake.
  return `﻿${lines.join("\r\n")}\r\n`;
}
