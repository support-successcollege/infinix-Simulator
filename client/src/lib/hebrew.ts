/* ============================================================
   Hebrew presentation helpers

   Answer options were labelled with `String.fromCharCode(65 + index)`,
   producing A/B/C/D on an all-Hebrew RTL exam paper. The real Israeli
   licensing exam uses א/ב/ג/ד — and a candidate who sees Latin letters
   reads the product as not built for them.
   ============================================================ */

export const HEBREW_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו"] as const;

/** Option label for a zero-based index. Falls back to a number past ו. */
export function optionLabel(index: number): string {
  return HEBREW_LETTERS[index] ?? String(index + 1);
}
