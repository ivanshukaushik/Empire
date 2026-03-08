/**
 * commandParser.ts — deterministic natural-language intent parser.
 *
 * No LLM, no network. Parses commands like "conquer Handan" or
 * "make peace with Zhao" by string matching against game data.
 *
 * Returns a ParsedIntent describing the resolved plan, ETA, risk,
 * and the concrete PlayerAction(s) to queue if approved.
 */

import { GameState, PlayerAction } from './types';
import { previewCombat } from './combatPreview';
import { TERRAIN_TRAVEL_DAYS } from './simulateTick';

// ── Types ─────────────────────────────────────────────────────

export type IntentKind = 'conquer' | 'defend' | 'stabilize' | 'peace' | 'unknown';

export interface ParsedIntent {
  kind: IntentKind;
  raw: string;
  /** Resolved province id (if applicable) */
  provinceId?: string;
  provinceName?: string;
  /** Resolved kingdom id (if applicable) */
  kingdomId?: string;
  kingdomName?: string;
  /** Estimated travel/completion time in game-days */
  etaDays?: number;
  /** Human-readable risk/odds summary */
  riskNote?: string;
  /** Full one-liner description of the plan */
  actionSummary: string;
  /** Whether the action can be executed right now */
  canExecute: boolean;
  /** Why it can't execute (if applicable) */
  reason?: string;
  /** Concrete actions to queue if player approves */
  actions?: Omit<PlayerAction, 'id'>[];
}

// ── Province / Kingdom name matching ──────────────────────────

function matchProvince(query: string, state: GameState): string | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  // 1. Exact name match (case-insensitive)
  for (const p of Object.values(state.provinces)) {
    if (p.name.toLowerCase() === q) return p.id;
  }

  // 2. Province id match (e.g. "qin2")
  if (state.provinces[q]) return q;

  // 3. Starts-with match
  const startsWith = Object.values(state.provinces).filter((p) =>
    p.name.toLowerCase().startsWith(q)
  );
  if (startsWith.length === 1) return startsWith[0].id;
  if (startsWith.length > 0) {
    // prefer shorter (more specific) match
    return startsWith.sort((a, b) => a.name.length - b.name.length)[0].id;
  }

  // 4. Contains match
  const contains = Object.values(state.provinces).filter((p) =>
    p.name.toLowerCase().includes(q)
  );
  if (contains.length === 1) return contains[0].id;
  if (contains.length > 0) {
    return contains.sort((a, b) => a.name.length - b.name.length)[0].id;
  }

  return null;
}

function matchKingdom(query: string, state: GameState): string | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  for (const k of Object.values(state.kingdoms)) {
    if (k.name.toLowerCase() === q || k.id === q) return k.id;
  }

  const startsWith = Object.values(state.kingdoms).filter((k) =>
    k.name.toLowerCase().startsWith(q)
  );
  if (startsWith.length === 1) return startsWith[0].id;

  const contains = Object.values(state.kingdoms).filter((k) =>
    k.name.toLowerCase().includes(q)
  );
  if (contains.length === 1) return contains[0].id;

  return null;
}

// ── Travel time helper (mirrors simulateTick.computeTravelDays) ──

function travelDays(terrain: string, season: number): number {
  const base = TERRAIN_TRAVEL_DAYS[terrain] ?? 4;
  const winterMult = season % 4 === 0 ? 1.5 : 1.0;
  return Math.max(1, Math.round(base * winterMult));
}

// ── Main parser ───────────────────────────────────────────────

export function parseCommand(raw: string, state: GameState): ParsedIntent {
  const lower = raw.trim().toLowerCase();
  const playerKid = state.playerKingdomId;

  if (!lower) {
    return { kind: 'unknown', raw, actionSummary: 'Type a command…', canExecute: false };
  }

  // ── CONQUER / ATTACK ─────────────────────────────────────────
  const conquerRe = /^(conquer|attack|take|capture|invade|seize)\s+(.+)$/;
  const conquerM = lower.match(conquerRe);
  if (conquerM) {
    const query = conquerM[2];
    const pid = matchProvince(query, state);
    if (!pid) {
      return { kind: 'conquer', raw, actionSummary: `Province not found: "${query}"`, canExecute: false, reason: 'No matching province' };
    }
    const prov = state.provinces[pid];
    if (prov.owner === playerKid) {
      return { kind: 'conquer', raw, provinceId: pid, provinceName: prov.name, actionSummary: `${prov.name} is already yours`, canExecute: false, reason: 'Already owned' };
    }

    // Find best ready army adjacent to the target
    const activeMovements = state.activeMovements ?? {};
    const readyArmies = Object.values(state.armies).filter(
      (a) => a.kingdomId === playerKid && a.size > 0 && !activeMovements[a.id]
    );
    const adjacent = readyArmies.filter((a) => prov.adjacentTo.includes(a.provinceId));

    if (adjacent.length === 0) {
      const defK = state.kingdoms[prov.owner];
      return {
        kind: 'conquer', raw, provinceId: pid, provinceName: prov.name,
        kingdomId: prov.owner, kingdomName: defK?.name,
        actionSummary: `No army is adjacent to ${prov.name}`,
        canExecute: false, reason: 'No adjacent army ready',
      };
    }

    const best = adjacent.sort((a, b) => b.size - a.size)[0];
    const eta = travelDays(prov.terrain, state.season);
    const preview = previewCombat(best.id, pid, state);
    const riskNote = preview
      ? `${preview.odds} (${preview.winChancePct}% win, ~${Math.round(preview.attackerLossHigh / 100) * 100}–${Math.round(preview.attackerLossLow / 100) * 100} losses)`
      : 'Unknown odds';
    const defK = state.kingdoms[prov.owner];

    return {
      kind: 'conquer', raw, provinceId: pid, provinceName: prov.name,
      kingdomId: prov.owner, kingdomName: defK?.name,
      etaDays: eta, riskNote,
      actionSummary: `Attack ${prov.name} (${defK?.name ?? '?'}) in ~${eta}d — ${riskNote}`,
      canExecute: true,
      actions: [{ type: 'attack', apCost: 1, armyId: best.id, targetProvinceId: pid }],
    };
  }

  // ── DEFEND / MOVE ─────────────────────────────────────────────
  const defendRe = /^(defend|move to|reinforce|garrison|march to)\s+(.+)$/;
  const defendM = lower.match(defendRe);
  if (defendM) {
    const query = defendM[2];
    const pid = matchProvince(query, state);
    if (!pid) {
      return { kind: 'defend', raw, actionSummary: `Province not found: "${query}"`, canExecute: false, reason: 'No matching province' };
    }
    const prov = state.provinces[pid];
    if (prov.owner !== playerKid) {
      return { kind: 'defend', raw, provinceId: pid, provinceName: prov.name, actionSummary: `${prov.name} is not yours`, canExecute: false, reason: 'Province not owned' };
    }

    const activeMovements = state.activeMovements ?? {};
    const readyArmies = Object.values(state.armies).filter(
      (a) => a.kingdomId === playerKid && a.size > 0 && !activeMovements[a.id] && a.provinceId !== pid
    );
    const adjacent = readyArmies.filter((a) => {
      const src = state.provinces[a.provinceId];
      return src?.adjacentTo.includes(pid);
    });

    if (adjacent.length === 0) {
      return {
        kind: 'defend', raw, provinceId: pid, provinceName: prov.name,
        actionSummary: `No ready army adjacent to ${prov.name}`,
        canExecute: false, reason: 'No adjacent army ready',
      };
    }

    const best = adjacent.sort((a, b) => b.size - a.size)[0];
    const eta = travelDays(prov.terrain, state.season);

    return {
      kind: 'defend', raw, provinceId: pid, provinceName: prov.name,
      etaDays: eta, riskNote: 'Friendly movement',
      actionSummary: `Move ${best.name} to ${prov.name} in ~${eta}d`,
      canExecute: true,
      actions: [{ type: 'move', apCost: 1, armyId: best.id, targetProvinceId: pid }],
    };
  }

  // ── STABILIZE ────────────────────────────────────────────────
  const stabilizeRe = /^stabilize(\s+(.+))?$/;
  const stabilizeM = lower.match(stabilizeRe);
  if (stabilizeM) {
    // Find province: either named or the province with the highest unrest
    let pid: string | null = null;
    if (stabilizeM[2]) {
      pid = matchProvince(stabilizeM[2], state);
    }
    if (!pid) {
      // Auto-pick: owned province with highest unrest
      const owned = Object.values(state.provinces)
        .filter((p) => p.owner === playerKid)
        .sort((a, b) => b.unrest - a.unrest);
      if (owned.length > 0) pid = owned[0].id;
    }

    if (!pid) {
      return { kind: 'stabilize', raw, actionSummary: 'No provinces to stabilize', canExecute: false };
    }

    const prov = state.provinces[pid];
    if (prov.owner !== playerKid) {
      return { kind: 'stabilize', raw, provinceId: pid, provinceName: prov.name, actionSummary: `${prov.name} is not yours`, canExecute: false, reason: 'Province not owned' };
    }

    const k = state.kingdoms[playerKid];
    const slots = prov.projectSlotsBase ?? 1;
    const activeProjects = prov.activeProjects ?? [];
    const hasFreeSlot = activeProjects.length < slots;

    if (!hasFreeSlot) {
      return {
        kind: 'stabilize', raw, provinceId: pid, provinceName: prov.name,
        actionSummary: `${prov.name} already has a project underway`,
        canExecute: false, reason: 'No free project slot',
      };
    }

    // Build a farm if no farm; otherwise barracks; otherwise skip
    const buildWhat = !prov.hasFarm ? 'farm' : !prov.hasBarracks ? 'barracks' : null;
    if (!buildWhat) {
      return {
        kind: 'stabilize', raw, provinceId: pid, provinceName: prov.name,
        actionSummary: `${prov.name} is already well-developed (unrest: ${prov.unrest})`,
        canExecute: false, reason: 'Already developed',
      };
    }

    const goldCost = buildWhat === 'farm' ? 5 : 10;
    if (k.treasury < goldCost) {
      return {
        kind: 'stabilize', raw, provinceId: pid, provinceName: prov.name,
        actionSummary: `Not enough gold (need ${goldCost}g, have ${Math.floor(k.treasury)}g)`,
        canExecute: false, reason: 'Insufficient gold',
      };
    }

    return {
      kind: 'stabilize', raw, provinceId: pid, provinceName: prov.name,
      etaDays: buildWhat === 'farm' ? 5 : 10,
      actionSummary: `Build ${buildWhat} in ${prov.name} to reduce unrest (unrest: ${prov.unrest})`,
      canExecute: true,
      actions: [{ type: 'build', apCost: 0, provinceId: pid, buildingType: buildWhat as any }],
    };
  }

  // ── MAKE PEACE ───────────────────────────────────────────────
  const peaceRe = /^(make peace with|peace with|propose peace|nap|treaty)\s+(.+)$/;
  const peaceM = lower.match(peaceRe);
  if (peaceM) {
    const query = peaceM[2];
    const kid = matchKingdom(query, state);
    if (!kid) {
      return { kind: 'peace', raw, actionSummary: `Kingdom not found: "${query}"`, canExecute: false, reason: 'No matching kingdom' };
    }
    const kingdom = state.kingdoms[kid];
    if (!kingdom || kingdom.isEliminated) {
      return { kind: 'peace', raw, kingdomId: kid, actionSummary: `${kingdom?.name ?? kid} is eliminated`, canExecute: false, reason: 'Kingdom eliminated' };
    }
    if (kid === playerKid) {
      return { kind: 'peace', raw, actionSummary: 'You cannot make peace with yourself', canExecute: false };
    }
    const rel = state.relations[playerKid]?.[kid];
    if (rel?.treaty?.type === 'nap' && rel.treaty.status === 'active') {
      return {
        kind: 'peace', raw, kingdomId: kid, kingdomName: kingdom.name,
        actionSummary: `Already have an active NAP with ${kingdom.name}`,
        canExecute: false, reason: 'Treaty already active',
      };
    }

    return {
      kind: 'peace', raw, kingdomId: kid, kingdomName: kingdom.name,
      actionSummary: `Propose Non-Aggression Pact to ${kingdom.name}`,
      canExecute: true,
      actions: [{ type: 'diplomacy_nap', apCost: 1, targetKingdomId: kid }],
    };
  }

  // ── UNKNOWN ──────────────────────────────────────────────────
  return {
    kind: 'unknown', raw,
    actionSummary: 'Unknown command. Try: conquer [province], defend [province], stabilize, make peace with [kingdom]',
    canExecute: false,
  };
}
