import {
  GameState,
  PlayerAction,
  SeasonSummary,
  BattleResult,
  LogEntry,
  Army,
  Province,
} from './types';
import { createRng, rollFloat } from './rng';
import { resolveBattle, AttackOrder } from './combat';
import { economyPhase, getReformModifiers } from './economy';
import { diplomacyPhase, proposeNAP, offerTribute } from './diplomacy';
import { resolveEspionage } from './espionage';
import { checkWinConditions, markEliminated } from './winConditions';
import { recomputeFog } from './initialState';
import { aiPlanTurn } from '../ai/aiAgent';

// ============================================================
// ACTION COSTS
// ============================================================
export const ACTION_AP_COSTS: Record<string, number> = {
  build: 1,
  recruit: 1,
  move: 1,
  attack: 1,
  diplomacy_nap: 1,
  diplomacy_tribute: 1,
  espionage_scout: 1,
  espionage_sabotage: 2,
  espionage_incite: 2,
  reform: 1,
};

// Qin pays +1 AP for all diplomacy
function adjustedApCost(action: PlayerAction, kingdomId: string): number {
  const base = ACTION_AP_COSTS[action.type] ?? 1;
  if (kingdomId === 'qin' && (action.type === 'diplomacy_nap' || action.type === 'diplomacy_tribute')) {
    return base + 1;
  }
  return base;
}

const SEASON_NAMES = ['Winter', 'Spring', 'Summer', 'Autumn'];

// ============================================================
// VALIDATE PLAYER ACTION (call before queueing)
// ============================================================
export function validateAction(
  action: PlayerAction,
  state: GameState
): { valid: boolean; reason: string } {
  const kid = state.playerKingdomId;
  const apCost = adjustedApCost(action, kid);
  if (state.actionPointsRemaining < apCost) {
    return { valid: false, reason: `Not enough AP (need ${apCost}, have ${state.actionPointsRemaining}).` };
  }

  const kingdom = state.kingdoms[kid];

  switch (action.type) {
    case 'build': {
      if (!action.provinceId) return { valid: false, reason: 'No province selected.' };
      const p = state.provinces[action.provinceId];
      if (!p || p.owner !== kid) return { valid: false, reason: 'You do not own that province.' };
      if (!action.buildingType) return { valid: false, reason: 'No building type selected.' };
      const cost = buildCost(action.buildingType, kingdom);
      if (kingdom.treasury < cost.gold) return { valid: false, reason: `Need ${cost.gold} gold.` };
      if (kingdom.food < cost.food) return { valid: false, reason: `Need ${cost.food} food.` };
      if (action.buildingType === 'fort' && p.fortLevel >= 3) return { valid: false, reason: 'Fort already at max level.' };
      if (action.buildingType === 'farm' && p.hasFarm) return { valid: false, reason: 'Farm already built.' };
      if (action.buildingType === 'market' && p.hasMarket) return { valid: false, reason: 'Market already built.' };
      if (action.buildingType === 'barracks' && p.hasBarracks) return { valid: false, reason: 'Barracks already built.' };
      return { valid: true, reason: '' };
    }
    case 'recruit': {
      if (!action.provinceId) return { valid: false, reason: 'No province selected.' };
      const p = state.provinces[action.provinceId];
      if (!p || p.owner !== kid) return { valid: false, reason: 'You do not own that province.' };
      const canRecruit = p.hasBarracks || p.isCapital || (kid === 'qi'); // Qi can recruit anywhere
      if (!canRecruit) return { valid: false, reason: 'No barracks in this province.' };
      if (!action.recruitAmount || action.recruitAmount <= 0) return { valid: false, reason: 'Invalid recruit amount.' };
      const cost = recruitCost(action.recruitAmount, kingdom);
      if (kingdom.treasury < cost.gold) return { valid: false, reason: `Need ${cost.gold} gold.` };
      if (kingdom.manpower < action.recruitAmount) return { valid: false, reason: `Need ${action.recruitAmount} manpower.` };
      return { valid: true, reason: '' };
    }
    case 'move': {
      if (!action.armyId) return { valid: false, reason: 'No army selected.' };
      if (!action.targetProvinceId) return { valid: false, reason: 'No target province.' };
      const army = state.armies[action.armyId];
      if (!army || army.kingdomId !== kid) return { valid: false, reason: 'Not your army.' };
      const fromProv = state.provinces[army.provinceId];
      const toProv = state.provinces[action.targetProvinceId];
      if (!fromProv || !toProv) return { valid: false, reason: 'Province not found.' };
      if (toProv.owner !== kid) return { valid: false, reason: 'Target province is not owned by you (use Attack instead).' };
      if (!isAdjacent(fromProv, toProv, state, kingdom)) {
        return { valid: false, reason: 'Province not in movement range.' };
      }
      return { valid: true, reason: '' };
    }
    case 'attack': {
      if (!action.armyId) return { valid: false, reason: 'No army selected.' };
      if (!action.targetProvinceId) return { valid: false, reason: 'No target province.' };
      const army = state.armies[action.armyId];
      if (!army || army.kingdomId !== kid) return { valid: false, reason: 'Not your army.' };
      const fromProv = state.provinces[army.provinceId];
      const toProv = state.provinces[action.targetProvinceId];
      if (!fromProv || !toProv) return { valid: false, reason: 'Province not found.' };
      if (toProv.owner === kid) return { valid: false, reason: 'That province is already yours.' };
      if (!isAdjacent(fromProv, toProv, state, kingdom)) {
        return { valid: false, reason: 'Province not in attack range.' };
      }
      // Check NAP
      const napTarget = toProv.owner;
      const rel = state.relations[kid]?.[napTarget];
      if (rel?.treaty?.type === 'nap') {
        return { valid: false, reason: `You have a Non-Aggression Pact with ${state.kingdoms[napTarget]?.name}!` };
      }
      return { valid: true, reason: '' };
    }
    case 'diplomacy_nap':
    case 'diplomacy_tribute': {
      if (!action.targetKingdomId) return { valid: false, reason: 'No target kingdom.' };
      const target = state.kingdoms[action.targetKingdomId];
      if (!target || target.isEliminated) return { valid: false, reason: 'Kingdom not found.' };
      if (action.targetKingdomId === kid) return { valid: false, reason: 'Cannot target yourself.' };
      return { valid: true, reason: '' };
    }
    case 'espionage_scout': {
      if (!action.targetProvinceId) return { valid: false, reason: 'No target province.' };
      const p = state.provinces[action.targetProvinceId];
      if (!p) return { valid: false, reason: 'Province not found.' };
      if (p.owner === kid) return { valid: false, reason: 'You already own that province.' };
      return { valid: true, reason: '' };
    }
    case 'espionage_sabotage':
    case 'espionage_incite': {
      if (!action.targetProvinceId) return { valid: false, reason: 'No target province.' };
      const p = state.provinces[action.targetProvinceId];
      if (!p) return { valid: false, reason: 'Province not found.' };
      if (p.owner === kid) return { valid: false, reason: 'Cannot target your own province.' };
      return { valid: true, reason: '' };
    }
    case 'reform': {
      if (!action.reform) return { valid: false, reason: 'No reform selected.' };
      return { valid: true, reason: '' };
    }
    default:
      return { valid: false, reason: 'Unknown action.' };
  }
}

// ============================================================
// APPLY SINGLE PLAYER ACTION (immediate effect on state)
// ============================================================
export function applyPlayerAction(
  action: PlayerAction,
  state: GameState,
  rng: () => number
): { newState: GameState; message: string; battleResult?: BattleResult } {
  const kid = state.playerKingdomId;
  const apCost = adjustedApCost(action, kid);
  let newState = {
    ...state,
    actionPointsRemaining: state.actionPointsRemaining - apCost,
  };

  const newKingdoms = { ...newState.kingdoms };
  const newProvinces = { ...newState.provinces };
  const newArmies = { ...newState.armies };

  let message = '';
  let battleResult: BattleResult | undefined;

  switch (action.type) {
    case 'build': {
      const p = newProvinces[action.provinceId!];
      const k = { ...newKingdoms[kid] };
      const cost = buildCost(action.buildingType!, k);
      k.treasury -= cost.gold;
      k.food = Math.max(0, k.food - cost.food);
      newKingdoms[kid] = k;

      const updatedProv = { ...p };
      switch (action.buildingType) {
        case 'farm':    updatedProv.hasFarm    = true; break;
        case 'market':  updatedProv.hasMarket  = true; break;
        case 'barracks': updatedProv.hasBarracks = true; break;
        case 'fort':    updatedProv.fortLevel  = Math.min(3, p.fortLevel + 1); break;
      }
      newProvinces[action.provinceId!] = updatedProv;
      message = `Built ${action.buildingType} in ${p.name}. Cost: ${cost.gold} gold, ${cost.food} food.`;
      break;
    }

    case 'recruit': {
      const p = newProvinces[action.provinceId!];
      const k = { ...newKingdoms[kid] };
      const amount = action.recruitAmount ?? 1;
      const cost = recruitCost(amount, k);
      k.treasury -= cost.gold;
      k.manpower -= amount;
      newKingdoms[kid] = k;

      const troops = amount * 10 * (p.hasBarracks ? 1.1 : 1.0) * (p.isCapital ? 1.05 : 1.0);

      // Find existing army in province or create new one
      const existingArmy = Object.values(newArmies).find(
        (a) => a.kingdomId === kid && a.provinceId === action.provinceId
      );
      if (existingArmy) {
        newArmies[existingArmy.id] = {
          ...existingArmy,
          size: existingArmy.size + Math.floor(troops),
          morale: Math.min(100, existingArmy.morale + 2),
        };
      } else {
        const newId = `a_${kid}_${Date.now()}`;
        newArmies[newId] = {
          id: newId,
          kingdomId: kid,
          provinceId: action.provinceId!,
          size: Math.floor(troops),
          morale: 75,
          name: `${newKingdoms[kid].name} Army`,
        };
      }
      message = `Recruited ${Math.floor(troops).toLocaleString()} troops in ${p.name}.`;
      break;
    }

    case 'move': {
      const army = newArmies[action.armyId!];
      newArmies[action.armyId!] = { ...army, provinceId: action.targetProvinceId! };
      message = `${army.name} moved to ${newProvinces[action.targetProvinceId!].name}.`;
      break;
    }

    case 'attack': {
      const order: AttackOrder = {
        armyId: action.armyId!,
        targetProvinceId: action.targetProvinceId!,
        attackerKingdomId: kid,
      };
      const result = resolveBattle(order, { ...newState, provinces: newProvinces, kingdoms: newKingdoms, armies: newArmies }, rng);
      return {
        newState: result.newState,
        message: result.result.narrative,
        battleResult: result.result,
      };
    }

    case 'diplomacy_nap': {
      const result = proposeNAP(
        { ...newState, provinces: newProvinces, kingdoms: newKingdoms },
        kid,
        action.targetKingdomId!,
        rng
      );
      return { newState: result.newState, message: result.message };
    }

    case 'diplomacy_tribute': {
      const result = offerTribute(
        { ...newState, provinces: newProvinces, kingdoms: newKingdoms },
        kid,
        action.targetKingdomId!,
        action.tributeAmount ?? 20
      );
      if (result.accepted) {
        const k = { ...newKingdoms[kid] };
        k.treasury -= action.tributeAmount ?? 20;
        newKingdoms[kid] = k;
      }
      return { newState: { ...result.newState, kingdoms: newKingdoms }, message: result.message };
    }

    case 'espionage_scout':
    case 'espionage_sabotage':
    case 'espionage_incite': {
      const result = resolveEspionage(action, { ...newState, provinces: newProvinces, kingdoms: newKingdoms }, rng);
      return { newState: result.newState, message: result.message };
    }

    case 'reform': {
      const k = { ...newKingdoms[kid] };
      k.activeReform = action.reform ?? null;
      if (action.reform === 'conscription') {
        k.stability = Math.max(0, k.stability - 10);
      }
      newKingdoms[kid] = k;
      message = `Reform enacted: ${action.reform?.replace('_', ' ')}.`;
      break;
    }

    default:
      message = 'Unknown action.';
  }

  return {
    newState: { ...newState, provinces: newProvinces, kingdoms: newKingdoms, armies: newArmies },
    message,
    battleResult,
  };
}

// ============================================================
// EXECUTE FULL TURN (called when player ends season)
// ============================================================
export function executeTurn(state: GameState): GameState {
  const rng = createRng(state.seed + state.season * 1000);

  let s = { ...state };
  const summary: SeasonSummary = {
    season: state.season,
    year: state.year,
    seasonName: SEASON_NAMES[state.season % 4],
    battles: [],
    playerActions: [],
    aiActions: [],
    economyLines: [],
    diplomaticLines: [],
    espionageLines: [],
    winCheck: null,
  };

  // --- Phase 2: AI planning ---
  const aiKingdoms = Object.values(s.kingdoms).filter(
    (k) => !k.isPlayer && !k.isEliminated
  );

  for (const aiK of aiKingdoms) {
    const aiActions = aiPlanTurn(aiK, s, rng);
    for (const action of aiActions) {
      // Apply each AI action
      switch (action.type) {
        case 'attack': {
          const order: AttackOrder = {
            armyId: action.armyId!,
            targetProvinceId: action.targetProvinceId!,
            attackerKingdomId: aiK.id,
          };
          if (s.provinces[action.targetProvinceId!] && s.armies[action.armyId!]) {
            const result = resolveBattle(order, s, rng);
            s = result.newState;
            summary.battles.push(result.result);
            summary.aiActions.push(result.result.narrative);
          }
          break;
        }
        case 'move': {
          if (s.armies[action.armyId!]) {
            s = {
              ...s,
              armies: {
                ...s.armies,
                [action.armyId!]: { ...s.armies[action.armyId!], provinceId: action.targetProvinceId! },
              },
            };
            summary.aiActions.push(
              `${aiK.name} moves army to ${s.provinces[action.targetProvinceId!]?.name ?? action.targetProvinceId}.`
            );
          }
          break;
        }
        case 'recruit': {
          const provinceId = action.provinceId!;
          const amount = action.recruitAmount ?? 1;
          const k = { ...s.kingdoms[aiK.id] };
          const cost = recruitCost(amount, k);
          if (k.treasury >= cost.gold && k.manpower >= amount) {
            k.treasury -= cost.gold;
            k.manpower -= amount;
            const troops = amount * 10;
            const existingArmy = Object.values(s.armies).find(
              (a) => a.kingdomId === aiK.id && a.provinceId === provinceId
            );
            if (existingArmy) {
              s = {
                ...s,
                kingdoms: { ...s.kingdoms, [aiK.id]: k },
                armies: { ...s.armies, [existingArmy.id]: { ...existingArmy, size: existingArmy.size + troops } },
              };
            } else {
              const newId = `a_${aiK.id}_${Date.now()}_${Math.floor(rng() * 9999)}`;
              s = {
                ...s,
                kingdoms: { ...s.kingdoms, [aiK.id]: k },
                armies: {
                  ...s.armies,
                  [newId]: { id: newId, kingdomId: aiK.id, provinceId, size: troops, morale: 75, name: `${aiK.name} Army` },
                },
              };
            }
            summary.aiActions.push(`${aiK.name} recruits ${troops.toLocaleString()} troops.`);
          }
          break;
        }
        case 'build': {
          const p = s.provinces[action.provinceId!];
          if (!p || p.owner !== aiK.id) break;
          const k = { ...s.kingdoms[aiK.id] };
          const cost = buildCost(action.buildingType!, k);
          if (k.treasury >= cost.gold) {
            k.treasury -= cost.gold;
            const updatedProv = { ...p };
            switch (action.buildingType) {
              case 'farm': if (!p.hasFarm) updatedProv.hasFarm = true; else break;
                break;
              case 'market': if (!p.hasMarket) updatedProv.hasMarket = true; else break;
                break;
              case 'barracks': if (!p.hasBarracks) updatedProv.hasBarracks = true; else break;
                break;
              case 'fort': updatedProv.fortLevel = Math.min(3, p.fortLevel + 1); break;
            }
            s = {
              ...s,
              kingdoms: { ...s.kingdoms, [aiK.id]: k },
              provinces: { ...s.provinces, [action.provinceId!]: updatedProv },
            };
          }
          break;
        }
        case 'diplomacy_nap': {
          if (action.targetKingdomId) {
            const result = proposeNAP(s, aiK.id, action.targetKingdomId, rng);
            if (result.accepted) {
              s = result.newState;
              summary.diplomaticLines.push(`${aiK.name} signs a Non-Aggression Pact with ${s.kingdoms[action.targetKingdomId]?.name}.`);
              summary.aiActions.push(`${aiK.name} proposed and signed a NAP with ${s.kingdoms[action.targetKingdomId]?.name}.`);
            }
          }
          break;
        }
        case 'reform': {
          if (action.reform) {
            const k = { ...s.kingdoms[aiK.id], activeReform: action.reform };
            s = { ...s, kingdoms: { ...s.kingdoms, [aiK.id]: k } };
          }
          break;
        }
      }
    }
  }

  // --- Phase 4: Economy ---
  const econResult = economyPhase(s);
  s = econResult.newState;
  summary.economyLines = econResult.lines;

  // --- Phase 5: Diplomacy tick ---
  const diplomacyResult = diplomacyPhase(s);
  s = diplomacyResult.newState;
  summary.diplomaticLines.push(...diplomacyResult.lines);

  // --- Mark eliminations ---
  s = markEliminated(s);

  // --- Phase 6: Win/loss check ---
  const winCheck = checkWinConditions(s);
  if (winCheck.isOver) {
    summary.winCheck = winCheck.winner
      ? { winner: winCheck.winner, reason: winCheck.reason }
      : { winner: 'none', reason: winCheck.reason };
    s = {
      ...s,
      isGameOver: true,
      winner: winCheck.winner,
      loseReason: winCheck.loser ? winCheck.reason : null,
      phase: 'game_over',
    };
  } else {
    // Advance season
    const newSeason = state.season + 1;
    const newYear = state.year - (newSeason % 4 === 1 ? 1 : 0); // advance year each winter

    // Recompute fog of war
    const newFog = recomputeFog(state.playerKingdomId, s.provinces, s.fogOfWar, newSeason);

    s = {
      ...s,
      season: newSeason,
      year: newYear,
      phase: 'season_summary',
      actionPointsRemaining: state.maxActionPoints,
      pendingPlayerActions: [],
      fogOfWar: newFog,
      seasonSummary: summary,
    };
  }

  return s;
}

// ============================================================
// HELPERS
// ============================================================

export function buildCost(
  buildingType: string,
  kingdom: { armyCostModifier: number; id: string; activeReform: string | null }
): { gold: number; food: number } {
  const isHan = kingdom.id === 'han';
  const fortDiscount = kingdom.activeReform === 'fortify_borders' ? 0.7 : 1.0;
  const hanDiscount = isHan ? 0.9 : 1.0;

  switch (buildingType) {
    case 'farm':    return { gold: Math.ceil(20 * hanDiscount), food: 0 };
    case 'market':  return { gold: Math.ceil(25 * hanDiscount), food: 0 };
    case 'barracks':return { gold: Math.ceil(30 * hanDiscount), food: Math.ceil(10 * hanDiscount) };
    case 'fort':    return { gold: Math.ceil(40 * hanDiscount * fortDiscount), food: Math.ceil(20 * hanDiscount) };
    default:        return { gold: 20, food: 0 };
  }
}

export function recruitCost(manpowerPoints: number, kingdom: { recruitCostModifier: number }): { gold: number } {
  return { gold: Math.ceil(manpowerPoints * 2 * kingdom.recruitCostModifier) };
}

function isAdjacent(
  from: Province,
  to: Province,
  state: GameState,
  kingdom: { mobilityBonus: number; id?: string }
): boolean {
  // Direct adjacency
  if (from.adjacentTo.includes(to.id)) return true;
  // Zhao mobility bonus: can reach province 2 hops away IF first hop is friendly
  if (kingdom.mobilityBonus > 0) {
    for (const mid of from.adjacentTo) {
      const midProv = state.provinces[mid];
      if (midProv?.owner === kingdom.id && midProv.adjacentTo.includes(to.id)) {
        return true;
      }
    }
  }
  return false;
}

export { SEASON_NAMES };
