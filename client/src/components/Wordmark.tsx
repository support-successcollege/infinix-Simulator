/* ============================================================
   Wordmark — the INFINIX logo, as the brand ships it.

   Two cuts of the same artwork: black lettering for light ground,
   white lettering for dark ground (the sidebar, the mastheads, and
   every surface in dark mode). The X is the brand orange in both.
   ============================================================ */

import logoBlack from "@/assets/infinix-logo-black.png";
import logoWhite from "@/assets/infinix-logo-white.png";

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  /** "onDark" always uses the white cut; "auto" follows the theme. */
  tone?: "auto" | "onDark";
  className?: string;
}

const HEIGHTS: Record<NonNullable<WordmarkProps["size"]>, number> = {
  sm: 11,
  md: 22,
  lg: 34,
};

export default function Wordmark({ size = "md", tone = "auto", className = "" }: WordmarkProps) {
  const height = HEIGHTS[size];
  if (tone === "onDark") {
    return <img src={logoWhite} alt="INFINIX" className={`wordmark-img ${className}`} style={{ height }} />;
  }
  return (
    <span className={`wordmark-auto ${className}`} role="img" aria-label="INFINIX">
      <img src={logoBlack} alt="" aria-hidden="true" className="wordmark-img wordmark-on-light" style={{ height }} />
      <img src={logoWhite} alt="" aria-hidden="true" className="wordmark-img wordmark-on-dark" style={{ height }} />
    </span>
  );
}
