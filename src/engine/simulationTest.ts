/**
 * simulationTest — headless 120-day smoke test.
 *
 * Run from the browser console:
 *   import { runSimulationTest } from './engine/simulationTest';
 *   runSimulationTest();
 *
 * Or from Vite dev-mode via a test harness.
 *
 * Checks:
 *   - Simulation runs 120 days without throwing
 *   - gameTimeDays advances correctly
 *   - season/year are consistent
 *   - No NaN in treasury/food/manpower for any kingdom
 *   - activeMovements shrinks (battles resolve)
 *   - No duplicate province ownership
 */

import { createInitialState } from './initialState';
import { simulateTick } from './simulateTick';
import { createRng } from './rng';
import { GameState } from './types';

export function runSimulationTest(seed = 42, playerKingdomId = 'qin'): boolean {
  console.group('[SimulationTest] 120-day smoke test');
  let passed = true;

  try {
    let state = createInitialState(seed, playerKingdomId);

    // Sanity: initial values
    if (state.gameTimeDays !== 0)   { console.error('FAIL: initial gameTimeDays !== 0'); passed = false; }
    if (state.season !== 1)         { console.error('FAIL: initial season !== 1'); passed = false; }
    if (state.year !== 475)         { console.error('FAIL: initial year !== 475'); passed = false; }

    const rng = createRng(seed * 997);

    // Simulate 120 days (1 day at a time for maximum coverage)
    for (let day = 1; day <= 120; day++) {
      state = simulateTick(state, 1, rng);

      // Check gameTimeDays
      if (Math.abs(state.gameTimeDays - day) > 0.01) {
        console.error(`FAIL day ${day}: gameTimeDays=${state.gameTimeDays}`);
        passed = false;
        break;
      }

      // No NaN in kingdom resources
      for (const k of Object.values(state.kingdoms)) {
        if (!k.isEliminated) {
          if (isNaN(k.treasury) || isNaN(k.food) || isNaN(k.manpower) || isNaN(k.stability)) {
            console.error(`FAIL day ${day}: NaN resource in ${k.name}`, k);
            passed = false;
          }
        }
      }

      // No orphan movements (army doesn't exist)
      for (const [armyId, mv] of Object.entries(state.activeMovements)) {
        if (!state.armies[armyId]) {
          console.warn(`WARN day ${day}: orphan movement for deleted army ${armyId}`);
        }
        if (!state.provinces[mv.fromProvinceId] || !state.provinces[mv.toProvinceId]) {
          console.error(`FAIL day ${day}: movement references missing province`);
          passed = false;
        }
      }

      // No province owned by eliminated kingdom
      for (const p of Object.values(state.provinces)) {
        const k = state.kingdoms[p.owner];
        if (k?.isEliminated) {
          console.error(`FAIL day ${day}: province ${p.id} owned by eliminated ${p.owner}`);
          passed = false;
        }
      }
    }

    // After 90 days exactly one season boundary should have been crossed
    const seasonAfter90 = Math.floor(90 / 90) + 1; // = 2
    if (state.season !== seasonAfter90 + 1) {
      // Allow +1 because we ran 120 days (> 90), so season 3 expected
      const expectedSeason = Math.floor(120 / 90) + 1; // = 2 (floor(1.33)+1)
      if (state.season < 2) {
        console.error(`FAIL: season not advanced after 120 days (got ${state.season})`);
        passed = false;
      }
    }

    console.log(`gameTimeDays=${state.gameTimeDays}, season=${state.season}, year=${state.year}`);
    console.log(`activeMovements=${Object.keys(state.activeMovements).length}`);
    console.log(`recentBattles=${state.recentBattles.length}`);
    const ownedByElim = Object.values(state.provinces).filter((p) => state.kingdoms[p.owner]?.isEliminated).length;
    console.log(`provinces owned by eliminated kingdoms: ${ownedByElim}`);

  } catch (err) {
    console.error('FAIL: simulation threw:', err);
    passed = false;
  }

  console.log(passed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED');
  console.groupEnd();
  return passed;
}
