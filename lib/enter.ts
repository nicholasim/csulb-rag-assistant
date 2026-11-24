import type { CSSProperties } from "react";

/**
 * Message entrance timing (Entry 31). Parts of an answer appear in order: the answer text, then each
 * source chip, then each follow-up suggestion, ENTER_STEP_MS apart. Delays stop at ENTER_MAX_DELAY_MS,
 * so with the 0.24s animation (app/globals.css, .enter) the whole sequence ends in about 0.75s.
 */
export const ENTER_STEP_MS = 60;
export const ENTER_MAX_DELAY_MS = 500;
export const CHIPS_START_MS = 100;

/** Style for an element with the `enter` class that should start `ms` after its message appears. */
export function enterDelay(ms: number): CSSProperties {
  return { "--enter-delay": `${Math.min(ms, ENTER_MAX_DELAY_MS)}ms` } as CSSProperties;
}
