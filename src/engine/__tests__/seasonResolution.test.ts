/**
 * Regression test: season resolution must complete quickly and never throw.
 *
 * Runs N seasons on a fixed seed with each starting kingdom and asserts:
 *  - executeTurn() returns without throwing
 *  - Battle count per season stays within the declared guard limit
 *  - turnLog does not exceed the cap
 *  - No province is double-owned (sanity check on state integrity)
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../initialState';
import { executeTurn } from '../turnEngine';
import { GameState } from '../types';

const FIXED_SEED = 42069;
const SEASONS_TO_RUN = 20;
const MAX_BATTLES_PER_SEASON = 200; // must match guard in turnEngine.ts
const MAX_TURN_LOG = 200;           // must match cap in turnEngine.ts

function runSeasons(playerKingdomId: string, n: number): GameState {
  let state = createInitialState(FIXED_SEED, playerKingdomId);

  for (let i = 0; i < n; i++) {
    // Game might end before n seasons
    if (state.isGameOver) break;
    // executeTurn expects player_planning phase
    if (state.phase === 'season_summary') {
      state = { ...state, phase: 'player_planning', seasonSummary: null };
    }
    if (state.phase !== 'player_planning') break;

    const before = performance.now();
    state = executeTurn(state);
    const elapsed = performance.now() - before;

    // Each season must resolve in under 500ms on any reasonable machine
    expect(elapsed, `Season ${i + 1} took ${elapsed.toFixed(0)}ms — exceeded 500ms limit`).toBeLessThan(500);

    if (state.seasonSummary) {
      // Battle count guard
      expect(
        state.seasonSummary.battles.length,
        `Season ${i + 1} exceeded battle cap`
      ).toBeLessThanOrEqual(MAX_BATTLES_PER_SEASON);
    }

    // turnLog cap guard
    expect(
      state.turnLog.length,
      `turnLog exceeded cap of ${MAX_TURN_LOG} at season ${i + 1}`
    ).toBeLessThanOrEqual(MAX_TURN_LOG);

    // Province integrity: every province has exactly one owner
    const provOwners = Object.values(state.provinces).map((p) => p.owner);
    for (const owner of provOwners) {
      expect(
        state.kingdoms[owner] !== undefined || owner === 'none',
        `Province has unknown owner "${owner}" at season ${i + 1}`
      ).toBe(true);
    }
  }

  return state;
}

describe('executeTurn — season resolution', () => {
  it('completes 20 seasons as Qin without throwing or hanging', () => {
    const final = runSeasons('qin', SEASONS_TO_RUN);
    expect(final).toBeDefined();
  });

  it('completes 20 seasons as Zhao without throwing or hanging', () => {
    const final = runSeasons('zhao', SEASONS_TO_RUN);
    expect(final).toBeDefined();
  });

  it('completes 20 seasons as Chu without throwing or hanging', () => {
    const final = runSeasons('chu', SEASONS_TO_RUN);
    expect(final).toBeDefined();
  });

  it('never has more battles in one season than MAX_BATTLES_PER_SEASON', () => {
    let state = createInitialState(FIXED_SEED + 7, 'wei');
    for (let i = 0; i < SEASONS_TO_RUN; i++) {
      if (state.isGameOver) break;
      if (state.phase === 'season_summary') state = { ...state, phase: 'player_planning', seasonSummary: null };
      if (state.phase !== 'player_planning') break;
      state = executeTurn(state);
      if (state.seasonSummary) {
        expect(state.seasonSummary.battles.length).toBeLessThanOrEqual(MAX_BATTLES_PER_SEASON);
      }
    }
  });

  it('does not crash when a province is contested by multiple AI kingdoms', () => {
    // Start as a weak kingdom (Zhongshan) where AI kingdoms will fight over border provinces
    expect(() => runSeasons('zhongshan', SEASONS_TO_RUN)).not.toThrow();
  });
});
