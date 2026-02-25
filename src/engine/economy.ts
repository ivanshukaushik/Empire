import { GameState, Kingdom, Province, Army } from './types';
import { getRulerCombatBonus, getRulerIncomeBonus } from './ruler';

// Upkeep: per 1000 troops per season
const GOLD_UPKEEP_PER_K = 0.4;
const FOOD_UPKEEP_PER_K = 0.8;

// Auto-replenishment: troops recovered per season when resting in friendly territory
const REPLENISH_BASE = 80;         // base troops per season
const REPLENISH_BARRACKS_BONUS = 80; // extra with barracks
const REPLENISH_CAPITAL_BONUS = 40;  // extra in capital
const REPLENISH_MAX_PER_SEASON = 500; // hard cap

// Reform modifiers applied on top of kingdom modifiers
export function getReformModifiers(reform: string | null) {
  switch (reform) {
    case 'iron_fist':     return { income: 0.9,  food: 1.0, combat: 1.2, recruit: 1.0 };
    case 'commerce':      return { income: 1.2,  food: 1.0, combat: 1.0, recruit: 1.0 };
    case 'conscription':  return { income: 1.0,  food: 1.0, combat: 1.0, recruit: 1.3 };
    case 'propaganda':    return { income: 0.95, food: 1.0, combat: 1.0, recruit: 1.0 };
    case 'fortify_borders': return { income: 1.0, food: 1.0, combat: 1.0, recruit: 0.85 };
    default:              return { income: 1.0,  food: 1.0, combat: 1.0, recruit: 1.0 };
  }
}

// Season food modifier
function seasonFoodMod(season: number): number {
  const s = season % 4;
  if (s === 2) return 1.1;  // summer
  if (s === 0) return 0.7;  // winter
  return 1.0;
}

// Province income (gold per season)
export function provinceIncome(p: Province, k: Kingdom): number {
  let base = p.baseIncome;
  if (p.hasMarket) base += 2;
  const unrestPenalty = 1 - p.unrest / 200; // max 50% reduction
  const reform = getReformModifiers(k.activeReform);
  const rulerBonus = k.ruler ? (1 + getRulerIncomeBonus(k.ruler)) : 1;
  return Math.max(0, base * unrestPenalty * k.incomeModifier * reform.income * rulerBonus);
}

// Province food output
export function provinceFood(p: Province, k: Kingdom, season: number): number {
  let base = p.baseFood;
  if (p.hasFarm) base += 2;
  if (p.terrain === 'riverlands') base += 1;
  const reform = getReformModifiers(k.activeReform);
  return Math.max(0, base * k.foodModifier * reform.food * seasonFoodMod(season));
}

// Province manpower replenishment per season
export function provinceManpower(p: Province, k: Kingdom): number {
  let base = p.baseManpower;
  if (p.hasBarracks) base += 1;
  const reform = getReformModifiers(k.activeReform);
  const manpowerMod = k.id === 'han' ? 0.8 : (k.id === 'qi' ? 0.8 : 1.0);
  return Math.max(0, Math.floor(base * manpowerMod * reform.recruit));
}

// Army upkeep
function armyUpkeep(armySize: number, k: Kingdom): { gold: number; food: number } {
  const thousands = armySize / 1000;
  const goldUpkeep = thousands * GOLD_UPKEEP_PER_K * k.armyCostModifier;
  const foodUpkeep = thousands * FOOD_UPKEEP_PER_K;
  return { gold: goldUpkeep, food: foodUpkeep };
}

/**
 * Auto-replenishment: armies resting in friendly provinces recover troops.
 * Rate depends on province infrastructure. Draws from kingdom manpower pool.
 * Called as part of the economy phase.
 */
export function autoReplenishArmies(
  armies: Record<string, Army>,
  provinces: Record<string, Province>,
  kingdom: { id: string; manpower: number; food: number }
): { newArmies: Record<string, Army>; manpowerUsed: number } {
  const newArmies = { ...armies };
  let manpowerUsed = 0;
  let remainingManpower = kingdom.manpower;

  const myArmies = Object.values(armies).filter(
    (a) => a.kingdomId === kingdom.id && a.size > 0
  );

  for (const army of myArmies) {
    if (remainingManpower <= 0) break;
    const prov = provinces[army.provinceId];
    if (!prov || prov.owner !== kingdom.id) continue; // only replenish in own territory

    const maxSize = army.maxSize ?? army.size; // cap at peak size
    if (army.size >= maxSize) continue; // already at max

    // Compute replenish rate
    let rate = REPLENISH_BASE;
    if (prov.hasBarracks) rate += REPLENISH_BARRACKS_BONUS;
    if (prov.isCapital) rate += REPLENISH_CAPITAL_BONUS;
    rate = Math.min(rate, REPLENISH_MAX_PER_SEASON);
    rate = Math.min(rate, maxSize - army.size); // don't exceed max

    // Each 10 troops costs 1 manpower point
    const mpCost = Math.ceil(rate / 10);
    const actualMpCost = Math.min(mpCost, Math.floor(remainingManpower));
    const actualTroops = actualMpCost * 10;

    if (actualTroops <= 0) continue;

    newArmies[army.id] = {
      ...army,
      size: army.size + actualTroops,
      morale: Math.min(100, army.morale + 2), // slow morale recovery too
    };
    remainingManpower -= actualMpCost;
    manpowerUsed += actualMpCost;
  }

  return { newArmies, manpowerUsed };
}

export function economyPhase(
  state: GameState
): { newState: GameState; lines: string[] } {
  const newProvinces = { ...state.provinces };
  const newKingdoms = { ...state.kingdoms };
  let newArmies = { ...state.armies };
  const lines: string[] = [];

  for (const kid of Object.keys(newKingdoms)) {
    const k = { ...newKingdoms[kid] };
    if (k.isEliminated) { newKingdoms[kid] = k; continue; }

    const ownedProvinces = Object.values(state.provinces).filter((p) => p.owner === kid);

    // 1. Province production
    let totalGold = 0;
    let totalFood = 0;
    let totalManpower = 0;

    for (const p of ownedProvinces) {
      totalGold += provinceIncome(p, k);
      totalFood += provinceFood(p, k, state.season);
      totalManpower += provinceManpower(p, k);
    }

    // 2. Army upkeep
    const kingdomArmies = Object.values(state.armies).filter((a) => a.kingdomId === kid);
    let goldUpkeepTotal = 0;
    let foodUpkeepTotal = 0;
    for (const army of kingdomArmies) {
      const upkeep = armyUpkeep(army.size, k);
      goldUpkeepTotal += upkeep.gold;
      foodUpkeepTotal += upkeep.food;
    }

    // Propaganda reform costs 5 gold/turn
    if (k.activeReform === 'propaganda') goldUpkeepTotal += 5;

    // 3. Apply resources
    k.treasury = Math.max(-50, k.treasury + totalGold - goldUpkeepTotal);
    k.food = Math.max(0, k.food + totalFood - foodUpkeepTotal);

    // 4. Manpower replenishment (from provinces)
    const newManpower = Math.min(100, k.manpower + Math.floor(totalManpower * 0.2));

    // 5. Auto-replenishment: armies recover in friendly territory
    const replenishResult = autoReplenishArmies(newArmies, state.provinces, {
      id: kid,
      manpower: newManpower,
      food: k.food,
    });
    newArmies = replenishResult.newArmies;
    k.manpower = Math.max(0, newManpower - replenishResult.manpowerUsed);

    // 6. Stability adjustments
    if (k.treasury < 0) {
      k.stability = Math.max(0, k.stability - 5);
      lines.push(`${k.name} is bankrupt! Stability −5.`);
    } else {
      k.stability = Math.min(100, k.stability + 1);
    }

    if (k.activeReform === 'propaganda') {
      k.stability = Math.min(100, k.stability + 3);
    }

    // 7. Food attrition
    if (k.food <= 0) {
      for (const army of kingdomArmies) {
        const attrition = Math.floor(army.size * 0.05);
        newArmies[army.id] = {
          ...newArmies[army.id],
          size: Math.max(500, (newArmies[army.id]?.size ?? army.size) - attrition),
          morale: Math.max(10, (newArmies[army.id]?.morale ?? army.morale) - 10),
        };
      }
      lines.push(`${k.name} armies suffer attrition from food shortage!`);
    }

    // 8. Riverlands morale recovery for Chu
    if (kid === 'chu') {
      for (const army of kingdomArmies) {
        const p = state.provinces[army.provinceId];
        if (p?.terrain === 'riverlands') {
          newArmies[army.id] = {
            ...newArmies[army.id],
            morale: Math.min(100, (newArmies[army.id]?.morale ?? army.morale) + 5),
          };
        }
      }
    }

    newKingdoms[kid] = k;
  }

  // 9. Unrest decay in all provinces
  for (const pid of Object.keys(newProvinces)) {
    const p = newProvinces[pid];
    const k = newKingdoms[p.owner];
    if (!k) continue;
    const decayRate = k.id === 'zhongshan' ? 6 : 3;
    const saltBonus = p.hasSalt ? 5 : 0;
    newProvinces[pid] = {
      ...p,
      unrest: Math.max(0, p.unrest - decayRate - saltBonus),
    };
  }

  return {
    newState: {
      ...state,
      provinces: newProvinces,
      kingdoms: newKingdoms,
      armies: newArmies,
    },
    lines,
  };
}
