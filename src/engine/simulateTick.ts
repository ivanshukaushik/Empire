/**
 * simulateTick — pure continuous-time engine step.
 *
 * Advances game state by `dtDays` (integer days).  All calendar events
 * (economy, AI planning, army arrivals, season boundaries) are resolved
 * deterministically from `state.gameTimeDays`.
 *
 * Nothing in this file mutates the input state; every write is via spread.
 */

import {
  GameState,
  PlayerAction,
  ArmyMovement,
  RecentBattle,
  LogEntry,
  DiploProposal,
} from './types';
import { createRng, rollFloat } from './rng';
import { resolveBattle, AttackOrder } from './combat';
import { economyPhase } from './economy';
import { diplomacyPhase, proposeNAP } from './diplomacy';
import { checkWinConditions, markEliminated } from './winConditions';
import { recomputeFog } from './initialState';
import { aiPlanTurn } from '../ai/aiAgent';
import { processRulerAging } from './ruler';
import { buildCost, recruitCost, SEASON_NAMES } from './turnEngine';

// ── Constants ────────────────────────────────────────────────

/** AI kingdoms re-plan every this many days (stagger added per kingdom). */
const AI_PLAN_INTERVAL_DAYS = 10;
/** Hard cap on AI actions per planning window. */
const MAX_AI_ACTIONS = 20;
/** Keep at most this many RecentBattle records. */
const MAX_RECENT_BATTLES = 10;
/** Show battle flash on map for this many game-days. */
export const BATTLE_FLASH_DURATION_DAYS = 8;
/** Keep turnLog bounded. */
const MAX_LOG_ENTRIES = 200;

/** Base travel time in days by terrain. */
export const TERRAIN_TRAVEL_DAYS: Record<string, number> = {
  plains:     3,
  hills:      5,
  mountains:  8,
  riverlands: 4,
};

// ── Travel-time helper ───────────────────────────────────────

export function computeTravelDays(terrain: string, season: number): number {
  const base = TERRAIN_TRAVEL_DAYS[terrain] ?? 4;
  const winterMult = (season % 4) === 0 ? 1.5 : 1.0; // season%4==0 is winter
  return Math.max(1, Math.round(base * winterMult));
}

// ── Main tick function ───────────────────────────────────────

export function simulateTick(
  state: GameState,
  dtDays: number,
  rng: () => number
): GameState {
  if (dtDays <= 0) return state;

  const prevTimeDays = state.gameTimeDays;
  const newTimeDays  = prevTimeDays + dtDays;

  // ── Derive season / year ────────────────────────────────────
  // Season 1 = spring of 475 BCE.  season%4: 1=spring, 2=summer, 3=autumn, 0=winter.
  const newSeasonAbsolute  = Math.floor(newTimeDays / 90) + 1;
  const prevSeasonAbsolute = Math.floor(prevTimeDays / 90) + 1;
  const crossedSeason      = newSeasonAbsolute > prevSeasonAbsolute;
  const newYear            = 475 - Math.floor(newTimeDays / 360);

  let s: GameState = {
    ...state,
    gameTimeDays: newTimeDays,
    season:       newSeasonAbsolute,
    year:         newYear,
  };

  // ── Army-movement arrivals ──────────────────────────────────
  const arrivedIds: string[] = [];
  for (const [armyId, mv] of Object.entries(s.activeMovements)) {
    if (mv.arrivalTimeDays <= newTimeDays) {
      arrivedIds.push(armyId);
    }
  }

  for (const armyId of arrivedIds) {
    const mv = s.activeMovements[armyId];
    if (!mv) continue;
    const army       = s.armies[armyId];
    const targetProv = s.provinces[mv.toProvinceId];

    if (!army || !targetProv) {
      s = removeMovement(s, armyId);
      continue;
    }

    if (mv.isHostile && targetProv.owner !== mv.attackerKingdomId) {
      // ── Resolve battle ───────────────────────────────────────
      const order: AttackOrder = {
        armyId,
        targetProvinceId: mv.toProvinceId,
        attackerKingdomId: mv.attackerKingdomId,
      };
      try {
        const battleOut = resolveBattle(order, s, rng);
        s = battleOut.newState;
        const r = battleOut.result;
        const flash: RecentBattle = {
          id:                 `b_${armyId}_${Math.floor(newTimeDays)}`,
          provinceId:         mv.toProvinceId,
          attackerKingdomId:  mv.attackerKingdomId,
          defenderKingdomId:  targetProv.owner,
          attackerWon:        r.attackerWon,
          resolvedAtDays:     newTimeDays,
          narrative:          r.narrative,
        };
        s = {
          ...s,
          recentBattles: [...s.recentBattles.slice(-(MAX_RECENT_BATTLES - 1)), flash],
          turnLog: addLog(s.turnLog, s.season, 'combat', r.narrative),
        };
      } catch (err) {
        console.error('[simulateTick] resolveBattle threw:', err);
      }
    } else {
      // Friendly arrival (or province already captured) — just place army
      s = {
        ...s,
        armies: {
          ...s.armies,
          [armyId]: { ...army, provinceId: mv.toProvinceId },
        },
      };
    }

    s = removeMovement(s, armyId);
  }

  // ── AI planning windows ─────────────────────────────────────
  const newNextPlan = { ...s.nextAiPlanAtDays };

  const aiKingdoms = Object.values(s.kingdoms).filter(
    (k) => !k.isPlayer && !k.isEliminated
  );

  for (const aiK of aiKingdoms) {
    const dueAt = newNextPlan[aiK.id] ?? 0;
    if (newTimeDays < dueAt) continue;

    const actions = aiPlanTurn(aiK, s, rng);
    let count = 0;
    for (const action of actions) {
      if (count >= MAX_AI_ACTIONS) break;
      s = applyAIAction(action, aiK.id, s, rng);
      count++;
    }

    // Stagger next plan time so kingdoms don't all fire on the same tick
    const stagger = (Object.keys(s.kingdoms).indexOf(aiK.id) % AI_PLAN_INTERVAL_DAYS);
    newNextPlan[aiK.id] = newTimeDays + AI_PLAN_INTERVAL_DAYS + stagger;
  }
  s = { ...s, nextAiPlanAtDays: newNextPlan };

  // ── Season-boundary events ──────────────────────────────────
  if (crossedSeason) {
    // Economy phase (once per season)
    if (s.gameTimeDays >= s.lastEconomyAtDays + 90) {
      const econOut = economyPhase(s);
      s = econOut.newState;
      for (const line of econOut.lines) {
        s = { ...s, turnLog: addLog(s.turnLog, s.season, 'economy', line) };
      }
      s = { ...s, lastEconomyAtDays: s.gameTimeDays };
    }

    // Reset domestic slots each season
    s = {
      ...s,
      provinceDomesticUsed: {},
      armyCampaignUsed:   {},
    };

    // Diplomacy tick (treaty expiry, tribute collection)
    const diploOut = diplomacyPhase(s);
    s = diploOut.newState;
    for (const line of diploOut.lines) {
      s = { ...s, turnLog: addLog(s.turnLog, s.season, 'diplomacy', line) };
    }

    // Ruler aging (annually — every 4 season boundaries)
    if (Math.floor(newTimeDays / 360) > Math.floor(prevTimeDays / 360)) {
      const rulerOut = processRulerAging(s, rng);
      s = rulerOut.newState;
      for (const ev of rulerOut.events) {
        s = { ...s, turnLog: addLog(s.turnLog, s.season, 'succession', ev.message) };
      }
      s = { ...s, rulerEvents: rulerOut.events };
    }

    // AI diplomacy proposals for player inbox
    const newProposals = generateAIProposals(s, rng);
    if (newProposals.length > 0) {
      const combined = [...s.diplomaticInbox, ...newProposals].slice(-5);
      s = { ...s, diplomaticInbox: combined };
    }

    // Expire stale inbox proposals
    s = {
      ...s,
      diplomaticInbox: s.diplomaticInbox
        .map((p) => (p.expiresAt <= s.season ? { ...p, status: 'expired' as const } : p))
        .filter((p) => p.status === 'pending'),
    };

    // Levy cooldown: province.levyCooldownUntil is in seasons, still valid

    // Mark eliminations
    s = markEliminated(s);

    // Fog of war
    s = {
      ...s,
      fogOfWar: recomputeFog(s.playerKingdomId, s.provinces, s.fogOfWar, s.season),
    };

    // Build season summary and show it (game auto-pauses)
    if (!s.isGameOver) {
      const seasonName = SEASON_NAMES[s.season % 4] ?? 'Unknown';
      s = {
        ...s,
        phase: 'season_summary',
        paused: true,
        seasonSummary: {
          season:          s.season,
          year:            s.year,
          seasonName,
          battles:         s.recentBattles
            .filter((b) => b.resolvedAtDays > prevTimeDays)
            .map((b) => ({
              // BattleResult shape (minimal — enough for SeasonSummary component)
              attackerKingdomId:      b.attackerKingdomId,
              defenderKingdomId:      b.defenderKingdomId,
              attackerArmyId:         '',
              targetProvinceId:       b.provinceId,
              attackerInitialStrength: 0,
              defenderInitialStrength: 0,
              attackerPower:          0,
              defenderPower:          0,
              attackerWon:            b.attackerWon,
              attackerLosses:         0,
              defenderLosses:         0,
              provinceCaptured:       b.attackerWon,
              narrative:              b.narrative,
            })),
          playerActions:   [],
          aiActions:       s.turnLog
            .filter((e) => e.type === 'ai' && e.season === s.season)
            .map((e) => e.message),
          economyLines:    s.turnLog
            .filter((e) => e.type === 'economy' && e.season === s.season)
            .map((e) => e.message),
          diplomaticLines: s.turnLog
            .filter((e) => e.type === 'diplomacy' && e.season === s.season)
            .map((e) => e.message),
          espionageLines:  s.turnLog
            .filter((e) => e.type === 'espionage' && e.season === s.season)
            .map((e) => e.message),
          successionLines: s.turnLog
            .filter((e) => e.type === 'succession' && e.season === s.season)
            .map((e) => e.message),
          winCheck:        null,
        },
      };
    }

    // Cap log
    if (s.turnLog.length > MAX_LOG_ENTRIES) {
      s = { ...s, turnLog: s.turnLog.slice(-MAX_LOG_ENTRIES) };
    }
  }

  // ── Win / lose check ────────────────────────────────────────
  if (!s.isGameOver) {
    const winCheck = checkWinConditions(s);
    if (winCheck.isOver) {
      s = {
        ...s,
        isGameOver: true,
        winner:     winCheck.winner,
        loseReason: winCheck.loser ? winCheck.reason : null,
        phase:      'game_over',
        paused:     true,
      };
    }
  }

  return s;
}

// ── Helper: apply a single AI-generated action ───────────────

function applyAIAction(
  action: PlayerAction,
  kingdomId: string,
  state: GameState,
  rng: () => number
): GameState {
  let s = state;
  const k = s.kingdoms[kingdomId];
  if (!k || k.isEliminated) return s;

  switch (action.type) {
    case 'attack': {
      const armyId = action.armyId;
      const targetId = action.targetProvinceId;
      if (!armyId || !targetId) break;
      if (s.activeMovements[armyId]) break; // already moving
      const army = s.armies[armyId];
      const targetProv = s.provinces[targetId];
      if (!army || !targetProv) break;
      if (army.kingdomId !== kingdomId) break;
      if (targetProv.owner === kingdomId) break; // already ours

      const travelDays = computeTravelDays(targetProv.terrain, s.season);
      const mv: ArmyMovement = {
        armyId,
        fromProvinceId:   army.provinceId,
        toProvinceId:     targetId,
        startTimeDays:    s.gameTimeDays,
        arrivalTimeDays:  s.gameTimeDays + travelDays,
        isHostile:        true,
        attackerKingdomId: kingdomId,
      };
      s = { ...s, activeMovements: { ...s.activeMovements, [armyId]: mv } };
      break;
    }
    case 'move': {
      const armyId = action.armyId;
      const targetId = action.targetProvinceId;
      if (!armyId || !targetId) break;
      if (s.activeMovements[armyId]) break;
      const army = s.armies[armyId];
      const targetProv = s.provinces[targetId];
      if (!army || !targetProv) break;
      if (army.kingdomId !== kingdomId) break;

      const travelDays = computeTravelDays(targetProv.terrain, s.season);
      const mv: ArmyMovement = {
        armyId,
        fromProvinceId:   army.provinceId,
        toProvinceId:     targetId,
        startTimeDays:    s.gameTimeDays,
        arrivalTimeDays:  s.gameTimeDays + travelDays,
        isHostile:        false,
        attackerKingdomId: kingdomId,
      };
      s = { ...s, activeMovements: { ...s.activeMovements, [armyId]: mv } };
      break;
    }
    case 'recruit': {
      const provinceId = action.provinceId;
      if (!provinceId) break;
      const p = s.provinces[provinceId];
      if (!p || p.owner !== kingdomId) break;
      const amount = action.recruitAmount ?? 1;
      const cost = recruitCost(amount, k);
      if (k.treasury < cost.gold || k.manpower < amount) break;

      const troops = Math.floor(amount * 10);
      const existingArmy = Object.values(s.armies).find(
        (a) => a.kingdomId === kingdomId && a.provinceId === provinceId
      );
      const newK = { ...k, treasury: k.treasury - cost.gold, manpower: k.manpower - amount };

      if (existingArmy) {
        s = {
          ...s,
          kingdoms: { ...s.kingdoms, [kingdomId]: newK },
          armies: {
            ...s.armies,
            [existingArmy.id]: { ...existingArmy, size: existingArmy.size + troops },
          },
        };
      } else {
        const newId = `a_${kingdomId}_${Math.floor(s.gameTimeDays)}_${Math.floor(rng() * 9999)}`;
        s = {
          ...s,
          kingdoms: { ...s.kingdoms, [kingdomId]: newK },
          armies: {
            ...s.armies,
            [newId]: {
              id: newId, kingdomId, provinceId,
              size: troops, morale: 75,
              name: `${k.name} Army`,
            },
          },
        };
      }
      break;
    }
    case 'build': {
      const provinceId = action.provinceId;
      const buildingType = action.buildingType;
      if (!provinceId || !buildingType) break;
      const p = s.provinces[provinceId];
      if (!p || p.owner !== kingdomId) break;
      const cost = buildCost(buildingType, k);
      if (k.treasury < cost.gold) break;

      const newK = { ...k, treasury: k.treasury - cost.gold, food: Math.max(0, k.food - cost.food) };
      const updatedP = { ...p };
      switch (buildingType) {
        case 'farm':     if (!p.hasFarm)     updatedP.hasFarm     = true; else return s; break;
        case 'market':   if (!p.hasMarket)   updatedP.hasMarket   = true; else return s; break;
        case 'barracks': if (!p.hasBarracks) updatedP.hasBarracks = true; else return s; break;
        case 'fort':     if (p.fortLevel < 3) updatedP.fortLevel  = p.fortLevel + 1; else return s; break;
        default:         return s;
      }
      s = {
        ...s,
        kingdoms:  { ...s.kingdoms,  [kingdomId]: newK },
        provinces: { ...s.provinces, [provinceId]: updatedP },
      };
      break;
    }
    case 'diplomacy_nap': {
      // Never auto-sign with the player — they must accept via the inbox
      if (!action.targetKingdomId || action.targetKingdomId === s.playerKingdomId) break;
      try {
        const result = proposeNAP(s, kingdomId, action.targetKingdomId, rng);
        if (result.accepted) s = result.newState;
      } catch (_) { /* ignore */ }
      break;
    }
    default:
      break;
  }
  return s;
}

// ── Helper: generate AI diplomacy proposals for player inbox ─

function generateAIProposals(state: GameState, rng: () => number): DiploProposal[] {
  const proposals: DiploProposal[] = [];
  const playerKid = state.playerKingdomId;
  const PROPOSAL_CAP = 3;
  const EXPIRES_IN_SEASONS = 4;

  const playerArmyProvIds = new Set(
    Object.values(state.armies)
      .filter((a) => a.kingdomId === playerKid)
      .map((a) => a.provinceId)
  );
  const alreadyPending = new Set(
    state.diplomaticInbox
      .filter((p) => p.status === 'pending')
      .map((p) => p.fromKingdomId)
  );
  const playerProvCount = Object.values(state.provinces).filter((p) => p.owner === playerKid).length;

  const aiKingdoms = Object.values(state.kingdoms)
    .filter((k) => !k.isPlayer && !k.isEliminated)
    .sort(() => rng() - 0.5);

  for (const kingdom of aiKingdoms) {
    if (proposals.length >= PROPOSAL_CAP) break;
    if (alreadyPending.has(kingdom.id)) continue;

    const rel = state.relations[kingdom.id]?.[playerKid];
    if (!rel) continue;
    if (rel.treaty?.type === 'nap' && rel.treaty.status === 'active') continue;

    const aiProvCount = Object.values(state.provinces).filter((p) => p.owner === kingdom.id).length;
    const aiProvinces = Object.values(state.provinces).filter((p) => p.owner === kingdom.id);
    const isPlayerThreatening = aiProvinces.some((p) =>
      p.adjacentTo.some((adj) => playerArmyProvIds.has(adj))
    );

    let chance = 0.12;
    if (isPlayerThreatening && rel.score < 0) chance = 0.5;
    else if (playerProvCount > aiProvCount * 1.5) chance = 0.3;
    else if (rel.score > 15) chance = 0.22;

    if (rng() > chance) continue;

    const propId = `dp_${kingdom.id}_s${state.season}_${Math.floor(rng() * 9999)}`;
    const proposal: DiploProposal = {
      id:            propId,
      fromKingdomId: kingdom.id,
      type:          'nap_offer',
      terms:         `${kingdom.name} proposes a Non-Aggression Pact.`,
      season:        state.season,
      expiresAt:     state.season + EXPIRES_IN_SEASONS,
      status:        'pending',
    };
    proposals.push(proposal);
  }
  return proposals;
}

// ── Small helpers ────────────────────────────────────────────

function removeMovement(state: GameState, armyId: string): GameState {
  const newMv = { ...state.activeMovements };
  delete newMv[armyId];
  return { ...state, activeMovements: newMv };
}

function addLog(
  log: LogEntry[],
  season: number,
  type: LogEntry['type'],
  message: string
): LogEntry[] {
  return [...log, { season, type, message }];
}
