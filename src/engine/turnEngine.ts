import {
  GameState,
  PlayerAction,
  SeasonSummary,
  BattleResult,
  LogEntry,
  Army,
  Province,
  ActionType,
  DiploProposal,
  RulerSuccessionEvent,
  ArmyMovement,
  Project,
} from './types';
import { createRng, rollFloat } from './rng';
import { resolveBattle, AttackOrder } from './combat';
import { PROJECT_DURATIONS } from './economy';
import { economyPhase, getReformModifiers } from './economy';
import { diplomacyPhase, proposeNAP, offerTribute } from './diplomacy';
import { resolveEspionage } from './espionage';
import { checkWinConditions, markEliminated } from './winConditions';
import { recomputeFog } from './initialState';
import { aiPlanTurn } from '../ai/aiAgent';
import { processRulerAging, generateRuler } from './ruler';
import { computeTravelDays } from './simulateTick';

// ============================================================
// PERFORMANCE GUARDS
// ============================================================

/** Hard cap on AI action iterations per kingdom per season. */
const MAX_AI_ACTIONS_PER_KINGDOM = 30;
/** Hard cap on total battles that can be resolved in one season. */
const MAX_BATTLES_PER_SEASON = 200;
/** Cap on turnLog entries kept (older entries are discarded). */
const MAX_TURN_LOG_ENTRIES = 200;

// ============================================================
// ACTION CLASSIFICATION
// ============================================================

/**
 * Campaign actions (legacy — kept for compatibility but no longer cost orders).
 */
const CAMPAIGN_ACTIONS = new Set<ActionType>([
  'move', 'attack',
  'diplomacy_nap', 'diplomacy_tribute',
  'espionage_scout', 'espionage_sabotage', 'espionage_incite',
  'levy',
]);

/**
 * Domestic actions cost 0 Orders but consume the province's domestic slot.
 * Only one domestic action per province per season.
 */
const DOMESTIC_ACTIONS = new Set<ActionType>(['build', 'recruit']);

export function isCampaignAction(type: ActionType): boolean {
  return CAMPAIGN_ACTIONS.has(type);
}

// Qin pays +1 Order for all diplomacy actions
function adjustedOrderCost(action: PlayerAction, kingdomId: string): number {
  if (!isCampaignAction(action.type)) return 0; // domestic: free
  if (kingdomId === 'qin' && (action.type === 'diplomacy_nap' || action.type === 'diplomacy_tribute')) {
    return 2;
  }
  return 1;
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
  const kingdom = state.kingdoms[kid];

  // ── Project slot check for build actions ──────────────────
  if (action.type === 'build') {
    const pid = action.provinceId;
    if (pid) {
      const prov = state.provinces[pid];
      if (prov) {
        const slots = (prov.projectSlotsBase ?? 1) + ((state.kingdoms[state.playerKingdomId]?.adminTechLevel ?? 0) >= 1 ? 1 : 0);
        const active = (prov.activeProjects ?? []).length;
        if (active >= slots) {
          return {
            valid: false,
            reason: `${prov.name} has no free project slots (${active}/${slots} used). Wait for current projects to complete.`,
          };
        }
        // Check not already building same type
        const alreadyQueued = (prov.activeProjects ?? []).some((p) => p.kind === action.buildingType);
        if (alreadyQueued) {
          return { valid: false, reason: `${action.buildingType} is already under construction here.` };
        }
      }
    }
  }

  // ── Per-army movement check (already marching?) ───────────
  if (action.type === 'move' || action.type === 'attack') {
    if (action.armyId && state.activeMovements?.[action.armyId]) {
      const armyName = state.armies[action.armyId]?.name ?? 'This army';
      return { valid: false, reason: `${armyName} is already marching — wait for it to arrive.` };
    }
  }

  switch (action.type) {
    case 'build': {
      if (!action.provinceId) return { valid: false, reason: 'No province selected.' };
      const p = state.provinces[action.provinceId];
      if (!p || p.owner !== kid) return { valid: false, reason: 'You do not own that province.' };
      if (!action.buildingType) return { valid: false, reason: 'No building type selected.' };
      const cost = buildCost(action.buildingType, kingdom);
      if (kingdom.treasury < cost.gold) return { valid: false, reason: `Need ${cost.gold} gold (have ${Math.floor(kingdom.treasury)}).` };
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
      if (!canRecruit) return { valid: false, reason: 'No barracks in this province (build one first, or use capital).' };
      if (!action.recruitAmount || action.recruitAmount <= 0) return { valid: false, reason: 'Invalid recruit amount.' };
      const cost = recruitCost(action.recruitAmount, kingdom);
      if (kingdom.treasury < cost.gold) return { valid: false, reason: `Need ${cost.gold} gold (have ${Math.floor(kingdom.treasury)}).` };
      if (kingdom.manpower < action.recruitAmount) return { valid: false, reason: `Need ${action.recruitAmount} manpower (have ${Math.floor(kingdom.manpower)}).` };
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
    case 'levy': {
      if (!action.provinceId) return { valid: false, reason: 'No province selected.' };
      const p = state.provinces[action.provinceId];
      if (!p || p.owner !== kid) return { valid: false, reason: 'You do not own that province.' };
      // Check levy cooldown
      if (p.levyCooldownUntil && state.season < p.levyCooldownUntil) {
        return { valid: false, reason: `Levy on cooldown for ${p.levyCooldownUntil - state.season} more season(s).` };
      }
      const levyAmt = action.levyAmount ?? 5;
      const levyGoldCost = levyAmt * 3;
      if (kingdom.treasury < levyGoldCost) {
        return { valid: false, reason: `Levy requires ${levyGoldCost} gold (have ${Math.floor(kingdom.treasury)}).` };
      }
      return { valid: true, reason: '' };
    }
    case 'split_army': {
      if (!action.armyId) return { valid: false, reason: 'No army selected.' };
      const army = state.armies[action.armyId];
      if (!army || army.kingdomId !== kid) return { valid: false, reason: 'Not your army.' };
      if (army.size < 2000) return { valid: false, reason: 'Army too small to split (need 2000+).' };
      return { valid: true, reason: '' };
    }
    case 'breach_treaty': {
      if (!action.targetKingdomId) return { valid: false, reason: 'No target kingdom.' };
      const rel = state.relations[kid]?.[action.targetKingdomId];
      if (!rel?.treaty || rel.treaty.status !== 'active') {
        return { valid: false, reason: 'No active treaty with that kingdom.' };
      }
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

  let newState: GameState = { ...state };

  // (Move/attack use activeMovements as the lock; build uses project slots)

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

      // Start a timed project (Part A) — building completes in durationDays
      const duration = PROJECT_DURATIONS[action.buildingType!] ?? 7;
      const proj: Project = {
        id:            `proj_${action.provinceId}_${action.buildingType}_${Math.floor(newState.gameTimeDays)}`,
        kind:          action.buildingType!,
        startedAtDays: newState.gameTimeDays,
        durationDays:  duration,
        costGold:      cost.gold,
      };
      newProvinces[action.provinceId!] = {
        ...p,
        activeProjects: [...(p.activeProjects ?? []), proj],
      };
      message = `${action.buildingType} construction started in ${p.name} — completes in ${duration} days.`;
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
      const targetProv = newProvinces[action.targetProvinceId!];
      const hasHorsesMove = Object.values(newProvinces).some((p) => p.owner === kid && p.hasHorses);
      const travelDays = computeTravelDays(targetProv.terrain, newState.season, hasHorsesMove);
      const mv: ArmyMovement = {
        armyId:           action.armyId!,
        fromProvinceId:   army.provinceId,
        toProvinceId:     action.targetProvinceId!,
        startTimeDays:    newState.gameTimeDays,
        arrivalTimeDays:  newState.gameTimeDays + travelDays,
        isHostile:        false,
        attackerKingdomId: kid,
      };
      return {
        newState: {
          ...newState,
          provinces: newProvinces,
          kingdoms:  newKingdoms,
          armies:    newArmies,
          activeMovements: { ...newState.activeMovements, [action.armyId!]: mv },
        },
        message: `${army.name} marches to ${targetProv.name}. Arrives in ${travelDays} day${travelDays !== 1 ? 's' : ''}.`,
      };
    }

    case 'attack': {
      const army = newArmies[action.armyId!];
      const targetProv = newProvinces[action.targetProvinceId!];
      const hasHorsesAtk = Object.values(newProvinces).some((p) => p.owner === kid && p.hasHorses);
      const travelDays = computeTravelDays(targetProv.terrain, newState.season, hasHorsesAtk);
      const mv: ArmyMovement = {
        armyId:           action.armyId!,
        fromProvinceId:   army.provinceId,
        toProvinceId:     action.targetProvinceId!,
        startTimeDays:    newState.gameTimeDays,
        arrivalTimeDays:  newState.gameTimeDays + travelDays,
        isHostile:        true,
        attackerKingdomId: kid,
      };
      return {
        newState: {
          ...newState,
          provinces: newProvinces,
          kingdoms:  newKingdoms,
          armies:    newArmies,
          activeMovements: { ...newState.activeMovements, [action.armyId!]: mv },
        },
        message: `${army.name} advances on ${targetProv.name}! Battle in ${travelDays} day${travelDays !== 1 ? 's' : ''}.`,
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

    case 'levy': {
      const p = newProvinces[action.provinceId!];
      const k = { ...newKingdoms[kid] };
      const levyAmt = action.levyAmount ?? 5;
      const levyGoldCost = levyAmt * 3;
      // Pay gold cost
      k.treasury -= levyGoldCost;
      // Stability hit
      k.stability = Math.max(0, k.stability - 3);
      // Add manpower directly to pool
      k.manpower = Math.min(100, k.manpower + levyAmt);
      newKingdoms[kid] = k;
      // Set levy cooldown on province
      newProvinces[action.provinceId!] = {
        ...p,
        levyCooldownUntil: newState.season + 4,
        unrest: Math.min(100, p.unrest + 8), // locals unhappy
      };
      message = `Levy raised from ${p.name}: +${levyAmt} manpower. Cost: ${levyGoldCost} gold, stability −3, unrest +8.`;
      break;
    }

    case 'split_army': {
      const army = newArmies[action.armyId!];
      const fraction = action.splitFraction ?? 0.5;
      const splitSize = Math.floor(army.size * fraction);
      const remainSize = army.size - splitSize;
      if (splitSize < 500 || remainSize < 500) {
        message = 'Cannot split: resulting armies too small (min 500 each).';
        break;
      }
      // Update original army
      newArmies[action.armyId!] = { ...army, size: remainSize };
      // Create new split army
      const splitId = `a_${kid}_split_${Date.now()}`;
      newArmies[splitId] = {
        id: splitId,
        kingdomId: kid,
        provinceId: army.provinceId,
        size: splitSize,
        morale: army.morale,
        name: `${army.name} (detachment)`,
        maxSize: splitSize,
      };
      message = `Split ${army.name}: ${remainSize.toLocaleString()} + ${splitSize.toLocaleString()} detachment in ${newProvinces[army.provinceId]?.name ?? army.provinceId}.`;
      break;
    }

    case 'breach_treaty': {
      // Breach is handled through the store directly; if it somehow arrives here, ignore
      message = 'Use the diplomacy panel to breach treaties.';
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
  const t0 = performance.now();
  const seasonLabel = `[Season ${state.season}] executeTurn`;
  console.groupCollapsed(seasonLabel);

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
    successionLines: [],
    winCheck: null,
  };

  // --- Phase 2: AI planning ---
  const t1 = performance.now();
  const aiKingdoms = Object.values(s.kingdoms).filter(
    (k) => !k.isPlayer && !k.isEliminated
  );

  let totalBattles = 0;
  for (const aiK of aiKingdoms) {
    const aiActions = aiPlanTurn(aiK, s, rng);
    if (aiActions.length > MAX_AI_ACTIONS_PER_KINGDOM) {
      console.warn(`[executeTurn] ${aiK.name} generated ${aiActions.length} actions — capping at ${MAX_AI_ACTIONS_PER_KINGDOM}`);
      aiActions.splice(MAX_AI_ACTIONS_PER_KINGDOM);
    }
    for (const action of aiActions) {
      if (totalBattles >= MAX_BATTLES_PER_SEASON) {
        console.warn(`[executeTurn] Battle cap (${MAX_BATTLES_PER_SEASON}) reached — skipping remaining AI attack orders`);
        break;
      }
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
            totalBattles++;
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
          // Never auto-sign with the player — proposals go through the inbox
          if (action.targetKingdomId && action.targetKingdomId !== s.playerKingdomId) {
            const result = proposeNAP(s, aiK.id, action.targetKingdomId, rng);
            if (result.accepted) {
              s = result.newState;
              summary.diplomaticLines.push(`${aiK.name} signs a Non-Aggression Pact with ${s.kingdoms[action.targetKingdomId]?.name}.`);
              summary.aiActions.push(`${aiK.name} proposed and signed a NAP with ${s.kingdoms[action.targetKingdomId]?.name}.`);
            }
          }
          break;
        }
      }
    }
  }

  console.log(`  AI planning: ${(performance.now() - t1).toFixed(1)}ms  (${totalBattles} battles, ${aiKingdoms.length} kingdoms)`);

  // --- Phase 3: Generate AI diplomacy proposals for player inbox ---
  const t3 = performance.now();
  const newProposals = generateAIProposals(s, rng);
  if (newProposals.length > 0) {
    // Keep existing inbox + add new (max 5 total)
    const combined = [...s.diplomaticInbox, ...newProposals].slice(-5);
    s = { ...s, diplomaticInbox: combined };
    for (const prop of newProposals) {
      const fromName = s.kingdoms[prop.fromKingdomId]?.name ?? prop.fromKingdomId;
      summary.diplomaticLines.push(`${fromName} sent a diplomatic proposal.`);
    }
  }

  console.log(`  Diplomacy proposals: ${(performance.now() - t3).toFixed(1)}ms`);

  // --- Phase 4: Economy ---
  const t4 = performance.now();
  const econResult = economyPhase(s);
  s = econResult.newState;
  summary.economyLines = econResult.lines;

  console.log(`  Economy: ${(performance.now() - t4).toFixed(1)}ms`);

  // --- Phase 5: Diplomacy tick ---
  const t5 = performance.now();
  const diplomacyResult = diplomacyPhase(s);
  s = diplomacyResult.newState;
  summary.diplomaticLines.push(...diplomacyResult.lines);

  console.log(`  Diplomacy tick: ${(performance.now() - t5).toFixed(1)}ms`);

  // --- Phase 5b: Ruler aging & succession ---
  const tSucc = performance.now();
  const { newState: stateAfterRulers, events: rulerEvents } = processRulerAging(s, rng);
  s = stateAfterRulers;
  for (const ev of rulerEvents) {
    summary.successionLines.push(ev.message);
    summary.diplomaticLines.push(ev.message);
  }
  // Keep latest events on state for summary display
  s = { ...s, rulerEvents };
  console.log(`  Ruler succession: ${(performance.now() - tSucc).toFixed(1)}ms  (${rulerEvents.length} events)`);

  // --- Expire stale inbox proposals ---
  s = {
    ...s,
    diplomaticInbox: s.diplomaticInbox
      .map((p) => (p.expiresAt <= s.season ? { ...p, status: 'expired' as const } : p))
      .filter((p) => p.status === 'pending'),
  };

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

    // Cap turnLog so it never grows unboundedly across many seasons
    const cappedLog = s.turnLog.length > MAX_TURN_LOG_ENTRIES
      ? s.turnLog.slice(-MAX_TURN_LOG_ENTRIES)
      : s.turnLog;

    s = {
      ...s,
      season: newSeason,
      year: newYear,
      phase: 'season_summary',
      // (Domestic slot system replaced by Project Slots — no reset needed)
      pendingPlayerActions: [],
      fogOfWar: newFog,
      turnLog: cappedLog,
      seasonSummary: summary,
    };
  }

  console.log(`  Total: ${(performance.now() - t0).toFixed(1)}ms`);
  console.groupEnd();

  return s;
}

// ============================================================
// AI DIPLOMACY PROPOSAL GENERATION
// ============================================================

/**
 * Generate inbound diplomacy proposals for the player's inbox.
 *
 * BUG FIX v2: The original code iterated kingdoms in insertion order and
 * broke after 3 proposals, causing only early kingdoms (Zhao) to generate
 * proposals. Now we:
 *   1. Shuffle kingdom order so all kingdoms get fair chances.
 *   2. Raise the cap to 5 (inbox can hold more).
 *   3. Raise baseline chance so proposals appear from many kingdoms.
 *   4. Add proper status/expiresAt fields so inbox lifecycle is tracked.
 *   5. Never auto-accept — proposals sit in inbox until player decides.
 */
function generateAIProposals(state: GameState, rng: () => number): DiploProposal[] {
  const proposals: DiploProposal[] = [];
  const playerKid = state.playerKingdomId;
  const playerProvCount = Object.values(state.provinces).filter((p) => p.owner === playerKid).length;
  const PROPOSAL_CAP = 5;
  const EXPIRES_IN = 4; // proposals expire after 4 seasons if not acted on

  // Player army positions
  const playerArmyProvIds = new Set(
    Object.values(state.armies)
      .filter((a) => a.kingdomId === playerKid)
      .map((a) => a.provinceId)
  );

  // Track which kingdoms already have a pending proposal in the inbox to avoid duplicates
  const alreadyPending = new Set(
    state.diplomaticInbox
      .filter((p) => p.status === 'pending')
      .map((p) => p.fromKingdomId)
  );

  // Shuffle kingdom order — critical fix so all kingdoms get equal chances
  const aiKingdoms = Object.values(state.kingdoms)
    .filter((k) => !k.isPlayer && !k.isEliminated)
    .sort(() => rng() - 0.5); // Fisher-Yates equivalent with seeded RNG

  for (const kingdom of aiKingdoms) {
    if (proposals.length >= PROPOSAL_CAP) break;
    if (alreadyPending.has(kingdom.id)) continue; // already waiting on this kingdom

    const rel = state.relations[kingdom.id]?.[playerKid];
    if (!rel) continue;
    if (rel.treaty?.type === 'nap' && rel.treaty.status === 'active') continue; // already has NAP

    const aiProvCount = Object.values(state.provinces).filter((p) => p.owner === kingdom.id).length;

    const aiProvinces = Object.values(state.provinces).filter((p) => p.owner === kingdom.id);
    const isPlayerThreatening = aiProvinces.some((p) =>
      p.adjacentTo.some((adj) => playerArmyProvIds.has(adj))
    );

    // Ruler diplomacy trait bonus
    const rulerDiploBonus = kingdom.ruler?.traits.includes('honorable') ? 0.10 : 0;

    // Compute base proposal chance — raised from 12% to 18% baseline
    let proposalChance = 0.18 + rulerDiploBonus;
    if (isPlayerThreatening && rel.score < 0) proposalChance = 0.55;
    else if (playerProvCount > aiProvCount * 1.5) proposalChance = 0.35;
    else if (rel.score > 15) proposalChance = 0.28;
    else if (kingdom.personality?.traits.includes('honorable')) proposalChance = 0.25;
    else if (kingdom.personality?.traits.includes('mercantile')) proposalChance = 0.22;

    if (import.meta.env?.DEV) {
      console.debug(`[Proposals] ${kingdom.id}: chance=${(proposalChance * 100).toFixed(0)}% threatening=${isPlayerThreatening} rel=${rel.score}`);
    }

    if (rng() > proposalChance) continue;

    const propId = `dp_${kingdom.id}_s${state.season}_${Math.floor(rng() * 9999)}`;

    let proposal: DiploProposal | null = null;

    if (isPlayerThreatening && aiProvCount <= playerProvCount) {
      // Threatened and not dominant — propose peace
      if (rng() < 0.60) {
        proposal = {
          id: propId,
          fromKingdomId: kingdom.id,
          type: 'nap_offer',
          terms: `${kingdom.name} seeks stability on its borders and proposes a Non-Aggression Pact lasting 8 seasons.`,
          season: state.season,
          expiresAt: state.season + EXPIRES_IN,
          status: 'pending',
        };
      } else {
        const amt = 5 + Math.floor(rng() * 15);
        proposal = {
          id: propId,
          fromKingdomId: kingdom.id,
          type: 'tribute_demand',
          terms: `${kingdom.name} offers ${amt} gold per season in tribute, hoping to forestall conflict.`,
          tributeAmount: amt,
          season: state.season,
          expiresAt: state.season + EXPIRES_IN,
          status: 'pending',
        };
      }
    } else if (rel.score > 10 && !isPlayerThreatening) {
      const mutualEnemies = Object.values(state.kingdoms).filter((k) => {
        if (k.isPlayer || k.isEliminated || k.id === kingdom.id) return false;
        const aiRel = state.relations[kingdom.id]?.[k.id];
        const playerRel = state.relations[playerKid]?.[k.id];
        return (aiRel?.score ?? 0) < -20 && (playerRel?.score ?? 0) < -20;
      });

      if (mutualEnemies.length > 0) {
        const target = mutualEnemies[Math.floor(rng() * mutualEnemies.length)];
        proposal = {
          id: propId,
          fromKingdomId: kingdom.id,
          type: 'mutual_target',
          terms: `${kingdom.name} proposes a coordinated campaign against ${target.name}. They will prioritize attacking ${target.name} this season.`,
          targetKingdomId: target.id,
          season: state.season,
          expiresAt: state.season + EXPIRES_IN,
          status: 'pending',
        };
      } else {
        proposal = {
          id: propId,
          fromKingdomId: kingdom.id,
          type: 'nap_offer',
          terms: `${kingdom.name} believes mutual restraint serves both kingdoms well. They propose a Non-Aggression Pact.`,
          season: state.season,
          expiresAt: state.season + EXPIRES_IN,
          status: 'pending',
        };
      }
    } else if (rel.score < -30 && playerProvCount < aiProvCount) {
      const amt = 10 + Math.floor(rng() * 20);
      proposal = {
        id: propId,
        fromKingdomId: kingdom.id,
        type: 'tribute_demand',
        terms: `${kingdom.name} demands ${amt} gold per season in tribute or they will consider open war.`,
        tributeAmount: amt,
        season: state.season,
        expiresAt: state.season + EXPIRES_IN,
        status: 'pending',
      };
    } else if (proposalChance > 0.20 && !proposal) {
      // Fallback: friendly/neutral kingdoms sometimes reach out with a simple NAP
      proposal = {
        id: propId,
        fromKingdomId: kingdom.id,
        type: 'nap_offer',
        terms: `${kingdom.name} reaches out diplomatically, proposing a Non-Aggression Pact.`,
        season: state.season,
        expiresAt: state.season + EXPIRES_IN,
        status: 'pending',
      };
    }

    if (proposal) {
      proposals.push(proposal);
      if (import.meta.env?.DEV) {
        console.debug(`[Proposals] ${kingdom.id} → ${proposal.type} (pending, expires S${proposal.expiresAt})`);
      }
    }
  }

  return proposals;
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
// Export so UI can check which actions cost orders
export { CAMPAIGN_ACTIONS, DOMESTIC_ACTIONS };
