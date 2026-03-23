"use client";

import type { CSSProperties } from "react";

export type CommandJumpKey = "J" | "K";

export function CommandJumpHint({
  keys,
  style,
}: {
  keys: CommandJumpKey[];
  style?: CSSProperties;
}) {
  if (keys.length === 0) return null;
  const ordered = [...keys].sort();
  return (
    <span className="command-jump-hint" aria-hidden style={style}>
      {ordered.join("\u00a0")}
    </span>
  );
}
