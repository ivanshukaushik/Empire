import { GameState } from './types';

// Terrain modifiers (mirrors combat.ts — kept in sync)
const TERRAIN_ATK: Record<string, number> = {
  plains: 1.0, hills: 0.9, mountains: 0.75, riverlands: 0.85,
};
const TERRAIN_DEF: Record<string, number> = {
  plains: 1.0, hills: 1.15, mountains: 1.3, riverlands: 1.1,
};

function seasonMod(season: number): number {
  const s = season % 4;
  if (s === 2) return 1.05;
  if (s === 3) return 0.95;
  if (s === 0) return 0.80;
  return 1.0;
}

export type OddsRating = 'overwhelming' | 'favored' | 'even' | 'risky' | 'desperate';

export interface CombatPreview {
  attackerStrength: number;   // raw army size
  defenderStrength: number;   // garrison + defending armies
  attackerPowerBase: number;  // expected power (rng = 1.0)
  defenderPowerBase: number;
  attackerPowerMin: number;
  attackerPowerMax: number;
  defenderPowerMin: number;
  defenderPowerMax: number;
  odds: OddsRating;
  winChancePct: number;       // 0–100 estimated
  attackerLossLow: number;
  attackerLossHigh: number;
  defenderLossLow: number;
  defenderLossHigh: number;
  terrainNote: string;
  seasonNote: string;
}

export function previewCombat(
  armyId: string,
  targetProvinceId: string,
  state: GameState
): CombatPreview | null {
  const army = state.armies[armyId];
  const target = state.provinces[targetProvinceId];
  if (!army || !target) return null;

  const atkK = state.kingdoms[army.kingdomId];
  const defK = state.kingdoms[target.owner];
  if (!atkK || !defK) return null;

  const terrain = target.terrain;
  const atkTerrainMod = TERRAIN_ATK[terrain] ?? 1.0;
  const defTerrainMod = TERRAIN_DEF[terrain] ?? 1.0;
  const sm = seasonMod(state.season);
  const zhaoPlainsBonus = army.kingdomId === 'zhao' && terrain === 'plains' ? 1.15 : 1.0;
  const fortMod = 1.0 + target.fortLevel * 0.2;

  const defArmySize = Object.values(state.armies)
    .filter((a) => a.provinceId === targetProvinceId && a.kingdomId === target.owner)
    .reduce((s, a) => s + a.size, 0);
  const defTotalSize = target.garrison + defArmySize;

  const atkBase =
    army.size * (army.morale / 100) * atkTerrainMod * atkK.combatModifier * zhaoPlainsBonus * sm;
  const defBase = defTotalSize * defTerrainMod * fortMod * defK.combatModifier;

  const atkMin = atkBase * 0.85;
  const atkMax = atkBase * 1.15;
  const defMin = defBase * 0.85;
  const defMax = defBase * 1.15;

  const ratio = atkBase / Math.max(1, defBase);

  let odds: OddsRating;
  let winChancePct: number;
  if (ratio >= 1.8)      { odds = 'overwhelming'; winChancePct = 92; }
  else if (ratio >= 1.3) { odds = 'favored';      winChancePct = 72; }
  else if (ratio >= 0.85){ odds = 'even';          winChancePct = 50; }
  else if (ratio >= 0.6) { odds = 'risky';         winChancePct = 28; }
  else                   { odds = 'desperate';     winChancePct = 10; }

  // Loss estimates for win and lose scenarios
  const atkLossIfWin  = Math.floor(defBase * 0.35 * 0.85);
  const atkLossIfLose = Math.floor(atkBase * 0.45 * 1.15);
  const defLossIfWin  = defTotalSize; // wiped
  const defLossIfLose = Math.floor(atkBase * 0.20);

  // Weighted by win chance
  const w = winChancePct / 100;
  const attackerLossLow  = Math.floor(atkLossIfWin  * 0.85);
  const attackerLossHigh = Math.floor(atkLossIfLose * 1.0);
  const defenderLossLow  = Math.floor(defLossIfLose);
  const defenderLossHigh = defLossIfWin;

  // Build terrain/season notes
  const terrainNotes: string[] = [];
  if (terrain === 'mountains')   terrainNotes.push('Mountains +30% def');
  else if (terrain === 'hills')  terrainNotes.push('Hills +15% def');
  else if (terrain === 'riverlands') terrainNotes.push('River −15% atk');
  if (target.fortLevel > 0)     terrainNotes.push(`Fort Lv.${target.fortLevel} (+${target.fortLevel * 20}% def)`);
  if (zhaoPlainsBonus > 1)      terrainNotes.push('Zhao cavalry +15%');

  const seasonNotes: Record<number, string> = { 0: 'Winter −20% all', 2: 'Summer +5% atk', 3: 'Autumn −5% atk' };
  const seasonNote = seasonNotes[state.season % 4] ?? '';

  return {
    attackerStrength: army.size,
    defenderStrength: defTotalSize,
    attackerPowerBase: atkBase,
    defenderPowerBase: defBase,
    attackerPowerMin: atkMin,
    attackerPowerMax: atkMax,
    defenderPowerMin: defMin,
    defenderPowerMax: defMax,
    odds,
    winChancePct,
    attackerLossLow,
    attackerLossHigh,
    defenderLossLow,
    defenderLossHigh,
    terrainNote: terrainNotes.join(', '),
    seasonNote,
  };
}
