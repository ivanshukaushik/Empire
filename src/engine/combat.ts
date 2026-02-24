import { GameState, Army, Province, BattleResult, Kingdom, RelationData } from './types';
import { rollFloat } from './rng';

// Terrain modifiers
const TERRAIN_ATK: Record<string, number> = {
  plains: 1.0,
  hills: 0.9,
  mountains: 0.75,
  riverlands: 0.85,
};
const TERRAIN_DEF: Record<string, number> = {
  plains: 1.0,
  hills: 1.15,
  mountains: 1.3,
  riverlands: 1.1,
};

// Season modifiers (season % 4: 1=spring, 2=summer, 3=autumn, 0=winter)
function seasonCombatMod(season: number): number {
  const s = season % 4;
  if (s === 2) return 1.05; // summer
  if (s === 3) return 0.95; // autumn
  if (s === 0) return 0.8;  // winter
  return 1.0; // spring
}

export interface AttackOrder {
  armyId: string;
  targetProvinceId: string;
  attackerKingdomId: string;
}

export function resolveBattle(
  order: AttackOrder,
  state: GameState,
  rng: () => number
): { newState: GameState; result: BattleResult } {
  const army = state.armies[order.armyId];
  const targetProvince = state.provinces[order.targetProvinceId];
  const defenderKingdomId = targetProvince.owner;
  const attackerKingdom = state.kingdoms[order.attackerKingdomId];
  const defenderKingdom = state.kingdoms[defenderKingdomId];

  if (!army || !targetProvince || !attackerKingdom || !defenderKingdom) {
    throw new Error(`resolveBattle: invalid IDs`);
  }

  const terrain = targetProvince.terrain;
  const atkTerrainMod = TERRAIN_ATK[terrain] ?? 1.0;
  const defTerrainMod = TERRAIN_DEF[terrain] ?? 1.0;
  const seasonMod = seasonCombatMod(state.season);

  // Plains bonus for Zhao (cavalry)
  const zhaoPlainsBonus =
    order.attackerKingdomId === 'zhao' && terrain === 'plains' ? 1.15 : 1.0;

  const atkPower =
    army.size *
    (army.morale / 100) *
    atkTerrainMod *
    attackerKingdom.combatModifier *
    zhaoPlainsBonus *
    seasonMod *
    rollFloat(rng, 0.85, 1.15);

  // Defender: garrison + any defending armies
  const defendingArmies = Object.values(state.armies).filter(
    (a) => a.provinceId === order.targetProvinceId && a.kingdomId === defenderKingdomId
  );
  const defArmySize = defendingArmies.reduce((s, a) => s + a.size, 0);
  const defTotalSize = targetProvince.garrison + defArmySize;

  const fortMod = 1.0 + targetProvince.fortLevel * 0.2;

  const defPower =
    defTotalSize *
    defTerrainMod *
    fortMod *
    defenderKingdom.combatModifier *
    rollFloat(rng, 0.85, 1.15);

  const attackerWon = atkPower > defPower;

  let attackerLosses: number;
  let defenderLosses: number;

  if (attackerWon) {
    attackerLosses = Math.floor(defPower * 0.35);
    defenderLosses = defTotalSize; // garrison wiped
  } else {
    attackerLosses = Math.floor(atkPower * 0.45);
    defenderLosses = Math.floor(atkPower * 0.2);
  }

  // Clamp losses
  attackerLosses = Math.min(attackerLosses, army.size - 100);
  defenderLosses = Math.min(defenderLosses, defTotalSize);

  // Build narrative
  const atkStr = Math.round(atkPower).toLocaleString();
  const defStr = Math.round(defPower).toLocaleString();
  const narrative = attackerWon
    ? `${attackerKingdom.name} forces stormed ${targetProvince.name}! ` +
      `Attack power ${atkStr} vs defence ${defStr}. ` +
      `${attackerKingdom.name} loses ${attackerLosses.toLocaleString()} troops; ` +
      `${defenderKingdom.name} garrison destroyed (${defTotalSize.toLocaleString()} lost). Province captured!`
    : `${attackerKingdom.name} assault on ${targetProvince.name} repelled! ` +
      `Attack power ${atkStr} vs defence ${defStr}. ` +
      `${attackerKingdom.name} loses ${attackerLosses.toLocaleString()} troops; ` +
      `${defenderKingdom.name} garrison reduced by ${defenderLosses.toLocaleString()}.`;

  // --- Mutate a copy of state ---
  const newProvinces = { ...state.provinces };
  const newArmies = { ...state.armies };
  const newKingdoms = { ...state.kingdoms };
  const newRelations = deepCopyRelations(state.relations);

  // Apply army losses to attacker
  const updatedArmy: Army = {
    ...army,
    size: army.size - attackerLosses,
    morale: attackerWon ? Math.min(100, army.morale + 5) : Math.max(10, army.morale - 15),
  };

  if (attackerWon) {
    // Move army into captured province
    updatedArmy.provinceId = order.targetProvinceId;

    // Update province
    newProvinces[order.targetProvinceId] = {
      ...targetProvince,
      owner: order.attackerKingdomId,
      garrison: Math.max(0, updatedArmy.size - attackerLosses),
      unrest: Math.min(100, targetProvince.unrest + 20),
    };

    // Eliminate defending armies in province
    for (const da of defendingArmies) {
      const daLoss = Math.floor(da.size * 0.7);
      newArmies[da.id] = {
        ...da,
        size: Math.max(0, da.size - daLoss),
        morale: Math.max(10, da.morale - 20),
        provinceId: findNearestOwnedProvince(defenderKingdomId, state) ?? da.provinceId,
      };
    }
  } else {
    // Attacker retreats to source province
    updatedArmy.provinceId = army.provinceId; // already there; just take losses

    // Reduce garrison
    newProvinces[order.targetProvinceId] = {
      ...targetProvince,
      garrison: Math.max(0, targetProvince.garrison - defenderLosses),
    };
  }

  newArmies[army.id] = updatedArmy;

  // Relations: attacking degrades relations
  if (newRelations[order.attackerKingdomId]?.[defenderKingdomId]) {
    newRelations[order.attackerKingdomId][defenderKingdomId].score = Math.max(
      -100,
      newRelations[order.attackerKingdomId][defenderKingdomId].score - 30
    );
    newRelations[order.attackerKingdomId][defenderKingdomId].atWarWith = true;
  }
  if (newRelations[defenderKingdomId]?.[order.attackerKingdomId]) {
    newRelations[defenderKingdomId][order.attackerKingdomId].score = Math.max(
      -100,
      newRelations[defenderKingdomId][order.attackerKingdomId].score - 30
    );
    newRelations[defenderKingdomId][order.attackerKingdomId].atWarWith = true;
    // Record attacker in defender's AI memory.
    // IMPORTANT: state objects are Immer-frozen — we must copy the kingdom and its
    // personality before mutating any nested field. A shallow { ...state.kingdoms }
    // only copies the top-level record; the Kingdom values are still frozen references.
    const rawDefKingdom = newKingdoms[defenderKingdomId];
    if (rawDefKingdom.personality) {
      newKingdoms[defenderKingdomId] = {
        ...rawDefKingdom,
        personality: {
          ...rawDefKingdom.personality,
          recentAttackers: rawDefKingdom.personality.recentAttackers.includes(
            order.attackerKingdomId
          )
            ? rawDefKingdom.personality.recentAttackers
            : [...rawDefKingdom.personality.recentAttackers, order.attackerKingdomId],
        },
      };
    }
  }

  const result: BattleResult = {
    attackerKingdomId: order.attackerKingdomId,
    defenderKingdomId,
    attackerArmyId: order.armyId,
    targetProvinceId: order.targetProvinceId,
    attackerInitialStrength: army.size,
    defenderInitialStrength: defTotalSize,
    attackerPower: atkPower,
    defenderPower: defPower,
    attackerWon,
    attackerLosses,
    defenderLosses,
    provinceCaptured: attackerWon,
    narrative,
  };

  return {
    newState: {
      ...state,
      provinces: newProvinces,
      armies: newArmies,
      kingdoms: newKingdoms,
      relations: newRelations,
    },
    result,
  };
}

function findNearestOwnedProvince(kingdomId: string, state: GameState): string | null {
  const owned = Object.values(state.provinces).filter((p) => p.owner === kingdomId);
  return owned.length > 0 ? owned[0].id : null;
}

function deepCopyRelations(
  relations: Record<string, Record<string, RelationData>>
): Record<string, Record<string, RelationData>> {
  const copy: Record<string, Record<string, RelationData>> = {};
  for (const k1 of Object.keys(relations)) {
    copy[k1] = {};
    for (const k2 of Object.keys(relations[k1])) {
      copy[k1][k2] = { ...relations[k1][k2], events: [...relations[k1][k2].events] };
    }
  }
  return copy;
}
