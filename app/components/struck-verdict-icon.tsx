import { Check, X } from "lucide-react";

export type VerdictMarkVariant = "check" | "x";

/** Plain check or X, drawn larger than `layoutSize` but centered in a fixed layout slot. */
export function VerdictMarkIcon({
  variant,
  color,
  size = 20,
  layoutSize = 14,
}: {
  variant: VerdictMarkVariant;
  color: string;
  size?: number;
  layoutSize?: number;
}) {
  const Mark = variant === "check" ? Check : X;
  return (
    <span
      style={{
        position: "relative",
        width: layoutSize,
        height: layoutSize,
        flexShrink: 0,
        overflow: "visible",
        lineHeight: 0,
      }}
      aria-hidden
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "inline-flex",
        }}
      >
        <Mark size={size} color={color} strokeWidth={2} />
      </span>
    </span>
  );
}

type StruckVerdictIconProps = {
  variant: "check" | "x";
  /** Stroke color for the mark and strike line. */
  color: string;
  /** Rendered mark + strike size (Lucide coordinate space). */
  size?: number;
  /**
   * Box reserved in layout (flex); mark is centered and may draw larger visually
   * without shifting the quiz action bar height.
   */
  layoutSize?: number;
  /** Optional; defaults to `color`. Use a darker stroke if the mark needs more contrast. */
  strikeColor?: string;
  /**
   * “Border” behind the strike so it separates from the mark. Defaults to
   * `var(--color-bg)` so it matches the surface (works when dark mode sets `--color-bg`).
   */
  strikeHaloColor?: string;
};

/**
 * Same Check or X as Lucide, with a horizontal bar through the center (superseded / crossed out).
 */
export function StruckVerdictIcon({
  variant,
  color,
  size = 20,
  layoutSize = 14,
  strikeColor,
  strikeHaloColor = "var(--color-bg)",
}: StruckVerdictIconProps) {
  const strike = strikeColor ?? color;
  const Mark = variant === "check" ? Check : X;
  const strikeInnerW = 2.5;
  const strikeHaloW = 5;

  return (
    <span
      style={{
        position: "relative",
        width: layoutSize,
        height: layoutSize,
        flexShrink: 0,
        overflow: "visible",
        lineHeight: 0,
      }}
      aria-hidden
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "inline-flex",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Mark
          size={size}
          color={color}
          strokeWidth={2}
          style={{ position: "absolute", left: 0, top: 0 }}
        />
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            pointerEvents: "none",
          }}
          aria-hidden
        >
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            stroke={strikeHaloColor}
            strokeWidth={strikeHaloW}
            strokeLinecap="round"
          />
          <line
            x1="4"
            y1="12"
            x2="20"
            y2="12"
            stroke={strike}
            strokeWidth={strikeInnerW}
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
