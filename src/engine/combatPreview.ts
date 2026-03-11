import { GameState } from './types';

// Terrain modifiers — must stay in sync with combat.ts
const TERRAIN_ATK: Record<string, number> = {
  plains: 1.0, hills: 0.9, mountains: 0.75, riverlands: 0.85,
};
const TERRAIN_DEF: Record<string, number> = {
  plains: 1.0, hills: 1.15, mountains: 1.3, riverlands: 1.1,
};

function seasonMod(season: number): number {
  const s = season % 4;
  if (s === 2) return 1.05; // summer
  if (s === 3) return 0.95; // autumn
  if (s === 0) return 0.80; // winter
  return 1.0;               // spring
}

export type OddsRating = 'overwhelming' | 'favored' | 'even' | 'risky' | 'desperate';

/**
 * Per-factor modifier breakdown — mirrors every multiplier used in combat.ts
 * so the forecast is guaranteed to be deterministic with the real battle engine.
 */
export interface CombatModifiers {
  /** TERRAIN_ATK multiplier for the province terrain (attacker penalty). */
  terrainAttackMod: number;
  /** TERRAIN_DEF multiplier for the province terrain (defender bonus). */
  terrainDefendMod: number;
  /** 1 + fortLevel × 0.2 — defender fort bonus. */
  fortMod: number;
  /** Season combat multiplier (0.8 winter … 1.05 summer). */
  seasonMod: number;
  /** Attacker kingdom combatModifier (incorporates ruler military stat). */
  atkCombatMod: number;
  /** Defender kingdom combatModifier (incorporates ruler military stat). */
  defCombatMod: number;
  /** 1.08 if attacker controls any iron province, else 1.0. */
  ironBonus: number;
  /** 1.15 if Zhao attacking plains, else 1.0. */
  zhaoCavalryBonus: number;
  /** army.morale / 100 — attacker morale factor. */
  moraleFactor: number;
}

export interface CombatPreview {
  attackerStrength: number;   // raw army size
  defenderStrength: number;   // garrison + defending armies
  attackerPowerBase: number;  // deterministic expected power (RNG factor = 1.0)
  defenderPowerBase: number;
  attackerPowerMin: number;   // low end of RNG band (×0.85)
  attackerPowerMax: number;   // high end of RNG band (×1.15)
  defenderPowerMin: number;
  defenderPowerMax: number;
  odds: OddsRating;
  winChancePct: number;       // 0–100 estimated win probability
  attackerLossLow: number;
  attackerLossHigh: number;
  defenderLossLow: number;
  defenderLossHigh: number;
  terrainNote: string;        // human-readable modifier summary
  seasonNote: string;
  modifiers: CombatModifiers; // full per-factor breakdown for UI display
}

/**
 * Compute a deterministic battle forecast without modifying game state.
 *
 * Uses the exact same formulas as resolveBattle() in combat.ts, but with
 * the RNG factor held at 1.0 for the base estimate and ±15% for the range.
 */
export function previewCombat(
  armyId: string,
  targetProvinceId: string,
  state: GameState
): CombatPreview | null {
  const army   = state.armies[armyId];
  const target = state.provinces[targetProvinceId];
  if (!army || !target) return null;

  const atkK = state.kingdoms[army.kingdomId];
  const defK = state.kingdoms[target.owner];
  if (!atkK || !defK) return null;

  const terrain       = target.terrain;
  const atkTerrainMod = TERRAIN_ATK[terrain] ?? 1.0;
  const defTerrainMod = TERRAIN_DEF[terrain] ?? 1.0;
  const sm            = seasonMod(state.season);
  const zhaoPlainsBonus =
    army.kingdomId === 'zhao' && terrain === 'plains' ? 1.15 : 1.0;
  const fortMod = 1.0 + target.fortLevel * 0.2;

  // Iron bonus — mirrors combat.ts exactly
  const atkKingdomOwnsIron = Object.values(state.provinces).some(
    (p) => p.owner === army.kingdomId && p.hasIron
  );
  const ironAtkBonus = atkKingdomOwnsIron ? 1.08 : 1.0;

  const defArmySize = Object.values(state.armies)
    .filter((a) => a.provinceId === targetProvinceId && a.kingdomId === target.owner)
    .reduce((s, a) => s + a.size, 0);
  const defTotalSize = target.garrison + defArmySize;

  // Base power (RNG = 1.0) — identical formula to combat.ts minus rollFloat()
  const atkBase =
    army.size *
    (army.morale / 100) *
    atkTerrainMod *
    atkK.combatModifier *
    zhaoPlainsBonus *
    ironAtkBonus *
    sm;

  const defBase =
    defTotalSize *
    defTerrainMod *
    fortMod *
    defK.combatModifier;

  const atkMin = atkBase * 0.85;
  const atkMax = atkBase * 1.15;
  const defMin = defBase * 0.85;
  const defMax = defBase * 1.15;

  const ratio = atkBase / Math.max(1, defBase);

  let odds: OddsRating;
  let winChancePct: number;
  if      (ratio >= 1.8)  { odds = 'overwhelming'; winChancePct = 92; }
  else if (ratio >= 1.3)  { odds = 'favored';      winChancePct = 72; }
  else if (ratio >= 0.85) { odds = 'even';          winChancePct = 50; }
  else if (ratio >= 0.6)  { odds = 'risky';         winChancePct = 28; }
  else                    { odds = 'desperate';     winChancePct = 10; }

  // Loss estimates — mirrors combat.ts win/lose branches
  const atkLossIfWin  = Math.floor(defBase * 0.35);   // defPower × 0.35 (attacker wins)
  const atkLossIfLose = Math.floor(atkBase * 0.45);   // atkPower × 0.45 (attacker loses)
  const defLossIfWin  = defTotalSize;                 // garrison wiped on attacker win
  const defLossIfLose = Math.floor(atkBase * 0.20);   // atkPower × 0.20 (defender repels)

  // Show plausible range: best-case (win, low RNG) → worst-case (lose)
  const attackerLossLow  = Math.floor(atkLossIfWin  * 0.85);
  const attackerLossHigh = atkLossIfLose;
  const defenderLossLow  = defLossIfLose;
  const defenderLossHigh = defLossIfWin;

  // Human-readable modifier notes
  const terrainNotes: string[] = [];
  if (terrain === 'mountains')       terrainNotes.push('Mountains +30% def');
  else if (terrain === 'hills')      terrainNotes.push('Hills +15% def');
  else if (terrain === 'riverlands') terrainNotes.push('River −15% atk');
  if (target.fortLevel > 0)         terrainNotes.push(`Fort Lv.${target.fortLevel} (+${target.fortLevel * 20}% def)`);
  if (zhaoPlainsBonus > 1)          terrainNotes.push('Zhao cavalry +15%');
  if (ironAtkBonus > 1)             terrainNotes.push('Iron +8% atk');

  const seasonLabels: Record<number, string> = {
    0: 'Winter −20% all',
    2: 'Summer +5% atk',
    3: 'Autumn −5% atk',
  };
  const seasonNote = seasonLabels[state.season % 4] ?? '';

  const modifiers: CombatModifiers = {
    terrainAttackMod: atkTerrainMod,
    terrainDefendMod: defTerrainMod,
    fortMod,
    seasonMod:        sm,
    atkCombatMod:     atkK.combatModifier,
    defCombatMod:     defK.combatModifier,
    ironBonus:        ironAtkBonus,
    zhaoCavalryBonus: zhaoPlainsBonus,
    moraleFactor:     army.morale / 100,
  };

  return {
    attackerStrength:  army.size,
    defenderStrength:  defTotalSize,
    attackerPowerBase: atkBase,
    defenderPowerBase: defBase,
    attackerPowerMin:  atkMin,
    attackerPowerMax:  atkMax,
    defenderPowerMin:  defMin,
    defenderPowerMax:  defMax,
    odds,
    winChancePct,
    attackerLossLow,
    attackerLossHigh,
    defenderLossLow,
    defenderLossHigh,
    terrainNote: terrainNotes.join(' · '),
    seasonNote,
    modifiers,
  };
}
