/* ============================================================
   Wordmark — the INFINIX mark, set rather than drawn.

   The supplied artwork is a white-on-transparent raster with an
   amber X. On the ink panel of the sign-in screen it sits fine,
   but everywhere else it needed a black plate painted behind it
   just to stay visible — a patch stuck onto the page, at a fixed
   resolution, in a colour the palette no longer uses.

   Setting the mark in the app's own type solves all three at
   once: it inherits the current ink, it is crisp at any size, and
   the X picks up the single accent the rest of the system uses.
   ============================================================ */

interface WordmarkProps {
  /** Rendered height of the mark, in rem-ish CSS units. */
  size?: "sm" | "md" | "lg";
  /** Force a specific ink — used on the sign-in plate, which is
      always dark regardless of the active theme. */
  tone?: "auto" | "onDark";
  className?: string;
}

const SIZES: Record<NonNullable<WordmarkProps["size"]>, string> = {
  sm: "0.75rem",
  md: "1.0625rem",
  lg: "1.5rem",
};

export default function Wordmark({ size = "md", tone = "auto", className = "" }: WordmarkProps) {
  const onDark = tone === "onDark";
  return (
    <span
      className={`wordmark ${className}`}
      style={{
        fontSize: SIZES[size],
        color: onDark ? "#f2f1ed" : "var(--foreground)",
      }}
      role="img"
      aria-label="INFINIX"
    >
      {/* The split follows the artwork, where the stroke before the X
          is the second I and is coloured with it. Spelling it "INFIN"
          + "X" would drop a letter — the mark is INFIN-IX. */}
      <span aria-hidden="true">INFIN</span>
      <span aria-hidden="true" style={{ color: onDark ? "#93a6ff" : "var(--accent)" }}>IX</span>
    </span>
  );
}
