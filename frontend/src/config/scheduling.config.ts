/**
 * Scheduling UI configuration — single source of truth for all display
 * thresholds and constants used across the scheduling module.
 *
 * Keep numeric thresholds in sync with the corresponding
 * `scheduling_*` fields in backend/app/config.py so that the
 * backend scoring and frontend colouring always agree.
 */
export const SCHEDULING_CONFIG = {
  // ── Slot list pagination ──────────────────────────────────────────────────
  /** Number of SlotCards shown before the "Show more" button appears. */
  PAGE_SIZE: 3,

  // ── Score-bar colour thresholds ───────────────────────────────────────────
  // Must mirror backend scheduling_confidence_* score values so the
  // colour bands reflect how the backend actually grades each slot.
  /** rank_score ≥ this → emerald (strong) bar colour. */
  SCORE_HIGH_THRESHOLD: 85,
  /** rank_score ≥ this (but < HIGH_THRESHOLD) → indigo bar colour. Below → amber. */
  SCORE_MEDIUM_THRESHOLD: 70,

  // ── Slot display defaults ─────────────────────────────────────────────────
  /** Fallback meeting duration (minutes) when slot.duration_minutes is absent. */
  DEFAULT_DURATION_MINUTES: 60,
} as const

export type SchedulingConfig = typeof SCHEDULING_CONFIG
