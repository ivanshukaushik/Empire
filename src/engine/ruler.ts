/**
 * ruler.ts — Ruler system: generation, aging, death, succession
 *
 * Each kingdom has a Ruler with name, age, traits, ambition, and stats.
 * Every 4 seasons (1 in-game year) rulers age by 1.
 * Death probability is age-based. On death a successor is generated.
 * The ruler's stats grant small combat/income/diplomacy bonuses.
 */
import {
  Ruler,
  RulerTrait,
  RulerAmbition,
  RulerStats,
  RulerSuccessionEvent,
  Kingdom,
  GameState,
} from './types';

// ── Name pools per kingdom ────────────────────────────────────
const RULER_NAMES: Record<string, string[]> = {
  qin:       ['Xiaogong', 'Huiwang', 'Wuzhao', 'Zhaoxiang', 'Xiao', 'Zhuang', 'Zheng', 'Hui', 'Dao'],
  zhao:      ['Wuling', 'Huiwen', 'Xiaocheng', 'Dao', 'Xiao', 'You', 'Li', 'Jian'],
  yan:       ['Yi', 'Zhao', 'Kui', 'Zhe', 'Xi', 'Dan', 'Wan'],
  qi:        ['Wei', 'Xuan', 'Min', 'Xiang', 'Jian', 'Kang', 'Huan'],
  wei:       ['Hui', 'Xiang', 'Ai', 'Jing', 'Zhao', 'An', 'Jia'],
  han:       ['Zhao', 'Yi', 'Hui', 'Xuan', 'Huan', 'Li', 'An', 'Fei'],
  chu:       ['Su', 'Xuan', 'Wei', 'Qing', 'Kaolie', 'You', 'Fu'],
  zhongshan: ['Wuling', 'Cheng', 'Mo', 'Cuo', 'Yan', 'Sheng'],
};

const FALLBACK_NAMES = ['Wen', 'Wu', 'Kang', 'Jing', 'Xuan', 'Zhao', 'Hui', 'Ai'];

// ── Ruler trait pools by kingdom archetype ────────────────────
const KINGDOM_TRAIT_POOLS: Record<string, RulerTrait[]> = {
  qin:       ['aggressive', 'ambitious', 'reformist'],
  zhao:      ['aggressive', 'opportunistic', 'ambitious'],
  yan:       ['paranoid', 'cautious', 'cunning'],
  qi:        ['mercantile', 'opportunistic', 'cunning'],
  wei:       ['cautious', 'honorable', 'reformist'],
  han:       ['cautious', 'reformist', 'cunning'],
  chu:       ['opportunistic', 'ambitious', 'aggressive'],
  zhongshan: ['paranoid', 'cautious', 'honorable'],
};

const AMBITIONS: RulerAmbition[] = ['unify', 'survive', 'dominate_trade', 'revenge', 'reform'];

// ── Generation ────────────────────────────────────────────────

let _rulerIdCounter = 1000;

export function generateRuler(
  kingdomId: string,
  rng: () => number,
  reignStartSeason: number,
  startingAge?: number
): Ruler {
  const names = RULER_NAMES[kingdomId] ?? FALLBACK_NAMES;
  const name = names[Math.floor(rng() * names.length)];

  const traitPool = KINGDOM_TRAIT_POOLS[kingdomId] ?? ['cautious', 'honorable'];
  // Pick 1–2 traits from pool, possibly a random extra
  const shuffled = [...traitPool].sort(() => rng() - 0.5);
  const numTraits = 1 + Math.floor(rng() * 2); // 1 or 2
  const traits: RulerTrait[] = shuffled.slice(0, numTraits);

  const ambition = AMBITIONS[Math.floor(rng() * AMBITIONS.length)];

  const stats: RulerStats = {
    military:        1 + Math.floor(rng() * 10),
    diplomacy:       1 + Math.floor(rng() * 10),
    administration:  1 + Math.floor(rng() * 10),
  };

  const age = startingAge ?? (30 + Math.floor(rng() * 30)); // 30–59

  return {
    id: `ruler_${kingdomId}_${++_rulerIdCounter}`,
    name,
    age,
    traits,
    ambition,
    stats,
    reignStartSeason,
  };
}

// ── Modifier helpers ──────────────────────────────────────────

/** Returns fractional bonus to apply on top of kingdom's base combatModifier */
export function getRulerCombatBonus(ruler: Ruler): number {
  // military 1→0%, 10→+10%
  return (ruler.stats.military - 1) / 90; // max +0.10
}

export function getRulerIncomeBonus(ruler: Ruler): number {
  // administration 1→0%, 10→+10%
  return (ruler.stats.administration - 1) / 90;
}

export function getRulerDiplomacyBonus(ruler: Ruler): number {
  // diplomacy 1→0%, 10→+20%
  return ((ruler.stats.diplomacy - 1) / 9) * 0.2;
}

// ── Aging & death ─────────────────────────────────────────────

/** Called once per year (every 4 seasons). Returns true if ruler died. */
export function ageRuler(ruler: Ruler): Ruler {
  return { ...ruler, age: ruler.age + 1 };
}

/** Age-based annual death probability */
export function deathChance(age: number): number {
  if (age < 55) return 0.01;   //  1% / year
  if (age < 65) return 0.04;   //  4%
  if (age < 75) return 0.12;   // 12%
  if (age < 80) return 0.22;   // 22%
  return 0.40;                  // 40%+ at extreme age
}

// ── Succession ────────────────────────────────────────────────

export function generateSuccessor(
  kingdom: Kingdom,
  state: GameState,
  rng: () => number
): Ruler {
  // Successor skews a bit younger (25–45)
  const age = 25 + Math.floor(rng() * 20);
  return generateRuler(kingdom.id, rng, state.season, age);
}

// ── Run succession phase for all kingdoms ─────────────────────

export function processRulerAging(
  state: GameState,
  rng: () => number
): { newState: GameState; events: RulerSuccessionEvent[] } {
  // Only age rulers at the start of Winter (season % 4 === 0, but we use === 1 for S1=Spring)
  // Year advances when season % 4 === 1 (new year starts at Winter which is season % 4 === 0)
  // Let's age every 4 seasons when season % 4 === 0 (winter)
  const isYearBoundary = state.season % 4 === 0;
  if (!isYearBoundary) {
    return { newState: state, events: [] };
  }

  const newKingdoms = { ...state.kingdoms };
  const events: RulerSuccessionEvent[] = [];

  for (const kid of Object.keys(newKingdoms)) {
    const k = newKingdoms[kid];
    if (k.isEliminated) continue;

    let ruler = k.ruler;
    if (!ruler) {
      // Generate a ruler if missing (migration)
      ruler = generateRuler(kid, rng, state.season, 40 + Math.floor(rng() * 20));
      newKingdoms[kid] = { ...k, ruler };
      continue;
    }

    // Age the ruler
    const aged = ageRuler(ruler);

    // Check death
    const dChance = deathChance(aged.age);
    if (rng() < dChance) {
      // Ruler dies — generate successor
      const newRuler = generateSuccessor(k, state, rng);
      const msg = `${k.name}'s ruler, ${aged.name} (age ${aged.age}), has died. ${newRuler.name} takes the throne (${newRuler.traits.join(', ')}).`;

      events.push({
        season: state.season,
        kingdomId: kid,
        deceasedName: aged.name,
        newRuler,
        message: msg,
      });

      newKingdoms[kid] = { ...k, ruler: newRuler };
    } else {
      newKingdoms[kid] = { ...k, ruler: aged };
    }
  }

  return { newState: { ...state, kingdoms: newKingdoms }, events };
}
