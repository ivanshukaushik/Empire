import { createRng } from './rng';
import {
  GameState,
  Province,
  Kingdom,
  Army,
  RelationData,
  FogOfWarEntry,
} from './types';
import {
  PROVINCE_DEFS,
  KINGDOM_DEFS,
  ARMY_DEFS,
  STARTING_FORTS,
} from '../data/gameData';
import { DEFAULT_MAX_ORDERS } from '../config';
import { generateRuler } from './ruler';

// ============================================================
// BUILD INITIAL GAME STATE
// ============================================================

export function createInitialState(seed: number, playerKingdomId: string): GameState {
  // Build provinces
  const provinces: Record<string, Province> = {};
  for (const def of PROVINCE_DEFS) {
    const isCapitalProv = def.isCapital;
    provinces[def.id] = {
      ...def,
      owner: def.id.split('').slice(0, 3).join('') === 'qin' ? 'qin'
        : def.id.startsWith('zha') ? 'zhao'
        : def.id.startsWith('yan') ? 'yan'
        : def.id.startsWith('qi') ? 'qi'
        : def.id.startsWith('wei') ? 'wei'
        : def.id.startsWith('han') ? 'han'
        : def.id.startsWith('chu') ? 'chu'
        : 'zhongshan',
      garrison: isCapitalProv ? 4000 : (def.terrain === 'mountains' ? 1500 : 2000),
      unrest: 0,
      fortLevel: STARTING_FORTS[def.id] ?? 0,
      hasFarm: false,
      hasMarket: false,
      hasBarracks: def.isCapital, // capitals start with barracks
      hasSpyNetwork: false,
    };
  }

  // Build kingdoms (with rulers)
  const rng = createRng(seed);
  const kingdoms: Record<string, Kingdom> = {};
  for (const def of KINGDOM_DEFS) {
    const ruler = generateRuler(def.id, rng, 1, 35 + Math.floor(rng() * 25));
    kingdoms[def.id] = {
      ...def,
      isPlayer: def.id === playerKingdomId,
      // Deep-copy personality to avoid shared state
      personality: def.personality
        ? JSON.parse(JSON.stringify(def.personality))
        : undefined,
      ruler,
      treatyBreachCount: 0,
    };
  }

  // Build armies (with maxSize = starting size)
  const armies: Record<string, Army> = {};
  for (const def of ARMY_DEFS) {
    armies[def.id] = { ...def, maxSize: def.size };
  }

  // Build relations: all start at 0, except Qin starts at −20 with everyone
  const allKids = Object.keys(kingdoms);
  const relations: Record<string, Record<string, RelationData>> = {};
  for (const k1 of allKids) {
    relations[k1] = {};
    for (const k2 of allKids) {
      if (k1 === k2) continue;
      let score = 0;
      if (k1 === 'qin' || k2 === 'qin') score = -20;
      relations[k1][k2] = {
        score,
        treaty: null,
        atWarWith: false,
        events: [],
      };
    }
  }

  // Fog of war: compute from player kingdom
  const fogOfWar = computeInitialFog(playerKingdomId, provinces);

  // Build initial AI planning schedule: stagger each kingdom's first planning
  const allKingdomIds = Object.keys(kingdoms);
  const nextAiPlanAtDays: Record<string, number> = {};
  allKingdomIds.forEach((kid, i) => {
    nextAiPlanAtDays[kid] = i * 2; // stagger 2 days apart so they don't all fire at day 0
  });

  const state: GameState = {
    seed,
    season: 1,
    year: 475,
    phase: 'player_planning',
    provinces,
    kingdoms,
    armies,
    relations,
    playerKingdomId,
    ordersRemaining: DEFAULT_MAX_ORDERS,
    maxOrders: DEFAULT_MAX_ORDERS,
    provinceDomesticUsed: {},
    armyCampaignUsed: {},
    pendingPlayerActions: [],
    fogOfWar,
    turnLog: [],
    seasonSummary: null,
    isGameOver: false,
    winner: null,
    loseReason: null,
    selectedProvinceId: null,
    actionBeingPlanned: null,
    pendingMoveArmyId: null,
    helpSeen: false,
    diplomaticInbox: [],
    rulerEvents: [],
    toastMessages: [],
    // Continuous-time fields
    gameTimeDays:     0,
    paused:           false,
    speed:            1,
    activeMovements:  {},
    nextAiPlanAtDays,
    recentBattles:    [],
    lastEconomyAtDays: 0,
  };

  return state;
}

function computeInitialFog(
  playerKingdomId: string,
  provinces: Record<string, Province>
): Record<string, FogOfWarEntry> {
  const fog: Record<string, FogOfWarEntry> = {};

  const ownedIds = new Set(
    Object.values(provinces)
      .filter((p) => p.owner === playerKingdomId)
      .map((p) => p.id)
  );

  const adjacentIds = new Set<string>();
  for (const pid of ownedIds) {
    for (const adj of provinces[pid].adjacentTo) {
      if (!ownedIds.has(adj)) adjacentIds.add(adj);
    }
  }

  for (const p of Object.values(provinces)) {
    if (ownedIds.has(p.id)) {
      fog[p.id] = {
        visible: true,
        partial: false,
        scouted: false,
        scoutedAt: 0,
        lastKnownOwner: p.owner,
        lastKnownGarrisonTier: garrisonTier(p.garrison),
      };
    } else if (adjacentIds.has(p.id)) {
      fog[p.id] = {
        visible: false,
        partial: true,
        scouted: false,
        scoutedAt: 0,
        lastKnownOwner: p.owner,
        lastKnownGarrisonTier: garrisonTier(p.garrison),
      };
    } else {
      fog[p.id] = {
        visible: false,
        partial: false,
        scouted: false,
        scoutedAt: 0,
        lastKnownOwner: 'unknown',
        lastKnownGarrisonTier: 'unknown',
      };
    }
  }
  return fog;
}

export function garrisonTier(garrison: number): 'small' | 'medium' | 'large' {
  if (garrison < 2000) return 'small';
  if (garrison < 5000) return 'medium';
  return 'large';
}

export function recomputeFog(
  playerKingdomId: string,
  provinces: Record<string, Province>,
  currentFog: Record<string, FogOfWarEntry>,
  currentSeason: number
): Record<string, FogOfWarEntry> {
  const fog: Record<string, FogOfWarEntry> = { ...currentFog };

  const ownedIds = new Set(
    Object.values(provinces)
      .filter((p) => p.owner === playerKingdomId)
      .map((p) => p.id)
  );

  const adjacentIds = new Set<string>();
  for (const pid of ownedIds) {
    for (const adj of provinces[pid].adjacentTo) {
      if (!ownedIds.has(adj)) adjacentIds.add(adj);
    }
  }

  for (const p of Object.values(provinces)) {
    if (ownedIds.has(p.id)) {
      fog[p.id] = {
        visible: true,
        partial: false,
        scouted: false,
        scoutedAt: 0,
        lastKnownOwner: p.owner,
        lastKnownGarrisonTier: garrisonTier(p.garrison),
      };
    } else if (adjacentIds.has(p.id)) {
      const prev = fog[p.id];
      fog[p.id] = {
        visible: false,
        partial: true,
        scouted: prev?.scouted && currentSeason - prev.scoutedAt <= 3,
        scoutedAt: prev?.scoutedAt ?? 0,
        lastKnownOwner: p.owner,
        lastKnownGarrisonTier: garrisonTier(p.garrison),
      };
    } else {
      const prev = fog[p.id];
      const stillScouted = prev?.scouted && currentSeason - prev.scoutedAt <= 3;
      if (!stillScouted && prev?.scouted) {
        // Scout expired
        fog[p.id] = {
          ...prev,
          scouted: false,
          partial: false,
          visible: false,
        };
      }
      // Otherwise leave as-is (unknown or still scouted)
    }
  }
  return fog;
}
