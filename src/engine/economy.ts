import { GameState, Kingdom, Province } from './types';

// Upkeep: per 1000 troops per season
const GOLD_UPKEEP_PER_K = 0.4;
const FOOD_UPKEEP_PER_K = 0.8;

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
  return Math.max(0, base * unrestPenalty * k.incomeModifier * reform.income);
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

export function economyPhase(
  state: GameState
): { newState: GameState; lines: string[] } {
  const newProvinces = { ...state.provinces };
  const newKingdoms = { ...state.kingdoms };
  const newArmies = { ...state.armies };
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

    // 3. Apply
    k.treasury = Math.max(-50, k.treasury + totalGold - goldUpkeepTotal);
    k.food = Math.max(0, k.food + totalFood - foodUpkeepTotal);
    k.manpower = Math.min(100, k.manpower + Math.floor(totalManpower * 0.2));

    // 4. Stability adjustments
    if (k.treasury < 0) {
      k.stability = Math.max(0, k.stability - 5);
      lines.push(`${k.name} is bankrupt! Stability −5.`);
    } else {
      k.stability = Math.min(100, k.stability + 1);
    }

    // Propaganda reform slowly raises stability
    if (k.activeReform === 'propaganda') {
      k.stability = Math.min(100, k.stability + 3);
    }

    // Conscription one-time hit: handled when reform is set
    // 5. Food attrition
    if (k.food <= 0) {
      for (const army of kingdomArmies) {
        const attrition = Math.floor(army.size * 0.05);
        newArmies[army.id] = {
          ...army,
          size: Math.max(500, army.size - attrition),
          morale: Math.max(10, army.morale - 10),
        };
      }
      lines.push(`${k.name} armies suffer attrition from food shortage!`);
    }

    // 6. Riverlands morale recovery for Chu
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

  // 7. Unrest decay in all provinces
  for (const pid of Object.keys(newProvinces)) {
    const p = newProvinces[pid];
    const k = newKingdoms[p.owner];
    if (!k) continue;
    const decayRate = k.id === 'zhongshan' ? 6 : 3;
    // Salt bonus
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
