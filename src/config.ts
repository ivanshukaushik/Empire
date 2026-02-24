// ============================================================
// ANCIENT WARRING STATES — Game Configuration
// ============================================================

/**
 * How the seed is chosen when starting a new game.
 *  'time'  — use Date.now() (different every game, no UI exposure)
 *  'fixed' — always use FIXED_SEED (useful for repeatable runs)
 */
export const SEED_MODE: 'time' | 'fixed' = 'time';

/** Seed used when SEED_MODE = 'fixed'. Change for a different fixed run. */
export const FIXED_SEED = 42069;

/**
 * When true, a `?seed=NNN` query-string param overrides the seed.
 * Safe for dev; set false (or leave in config) for production since
 * the setup UI no longer shows the seed field.
 */
export const DEV_QUERY_SEED_OVERRIDE = true;

/**
 * Number of Orders (command capacity) per season.
 * Each campaign action (Move, Attack, Diplomacy, Espionage, Reform) costs 1 Order.
 * Domestic actions (Build, Recruit) do NOT cost Orders but use the province's
 * domestic slot (one per province per season).
 */
export const DEFAULT_MAX_ORDERS = 2;

/** Helper: resolve the seed to use for a new game. */
export function resolveSeed(): number {
  if (DEV_QUERY_SEED_OVERRIDE) {
    const params = new URLSearchParams(window.location.search);
    const qs = params.get('seed');
    if (qs) {
      const n = parseInt(qs, 10);
      if (!isNaN(n)) return n;
    }
  }
  if (SEED_MODE === 'fixed') return FIXED_SEED;
  return Math.floor(Math.random() * 2_000_000);
}
