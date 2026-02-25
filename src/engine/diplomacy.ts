import { GameState, RelationData, Kingdom, Treaty } from './types';

// ── Deep copy helpers ─────────────────────────────────────────

export function deepCopyRelations(
  relations: Record<string, Record<string, RelationData>>
): Record<string, Record<string, RelationData>> {
  const copy: Record<string, Record<string, RelationData>> = {};
  for (const k1 of Object.keys(relations)) {
    copy[k1] = {};
    for (const k2 of Object.keys(relations[k1])) {
      const r = relations[k1][k2];
      copy[k1][k2] = {
        ...r,
        events: [...r.events],
        treaty: r.treaty ? { ...r.treaty } : null,
      };
    }
  }
  return copy;
}

// ── Diplomacy phase (seasonal tick) ──────────────────────────

export function diplomacyPhase(state: GameState): { newState: GameState; lines: string[] } {
  const newRelations = deepCopyRelations(state.relations);
  const newKingdoms = { ...state.kingdoms };
  const lines: string[] = [];
  const allKids = Object.keys(state.kingdoms);

  for (const k1 of allKids) {
    for (const k2 of allKids) {
      if (k1 >= k2) continue; // process each pair once
      const rel12 = newRelations[k1]?.[k2];
      const rel21 = newRelations[k2]?.[k1];
      if (!rel12 || !rel21) continue;

      // Tick NAP / tribute treaties
      if (rel12.treaty) {
        const t = rel12.treaty;
        if (t.status === 'breached') {
          // Already breached — clear treaty but leave relation damage in place
          rel12.treaty = null;
          rel21.treaty = null;
        } else if (t.expiresAt !== -1 && state.season >= t.expiresAt) {
          // Treaty expired naturally
          lines.push(`The ${t.type === 'nap' ? 'Non-Aggression Pact' : 'Tribute treaty'} between ${state.kingdoms[k1].name} and ${state.kingdoms[k2].name} has expired.`);
          rel12.treaty = { ...t, status: 'expired' };
          rel21.treaty = { ...t, status: 'expired' };
          // Small grace: actually null them out next tick. Clear now:
          rel12.treaty = null;
          rel21.treaty = null;
          rel12.atWarWith = false;
          rel21.atWarWith = false;
        } else if (t.type === 'nap') {
          // Honoring NAP: small rep boost
          rel12.score = Math.min(100, rel12.score + 2);
          rel21.score = Math.min(100, rel21.score + 2);
        } else if (t.type === 'tribute') {
          // Process tribute payment
          const payer = t.parties[0];
          const receiver = t.parties[1];
          const amount = t.tributeAmount ?? 10;
          const payerK = newKingdoms[payer];
          const receiverK = newKingdoms[receiver];
          if (payerK && receiverK) {
            if (payerK.treasury >= amount) {
              newKingdoms[payer] = { ...payerK, treasury: payerK.treasury - amount };
              newKingdoms[receiver] = { ...receiverK, treasury: receiverK.treasury + amount };
              rel12.score = Math.min(100, rel12.score + 3);
              rel21.score = Math.min(100, rel21.score + 3);
            } else {
              // Can't pay — treaty auto-breaks (not counted as intentional breach)
              lines.push(`${payerK.name} cannot pay tribute to ${receiverK.name}! Treaty broken. Relations collapse.`);
              rel12.treaty = null;
              rel21.treaty = null;
              rel12.score = Math.max(-100, rel12.score - 40);
              rel21.score = Math.max(-100, rel21.score - 40);
              if (payerK.personality) {
                newKingdoms[payer] = {
                  ...payerK,
                  personality: {
                    ...payerK.personality,
                    recentBetrayers: [...payerK.personality.recentBetrayers, receiver],
                  },
                };
              }
            }
          }
        }
      }

      // Slow natural drift toward 0 (if no active treaty)
      if (!rel12.atWarWith && !rel12.treaty) {
        if (rel12.score > 0) {
          rel12.score = Math.max(0, rel12.score - 1);
          rel21.score = Math.max(0, rel21.score - 1);
        } else if (rel12.score < -20) {
          rel12.score = Math.min(-20, rel12.score + 1);
          rel21.score = Math.min(-20, rel21.score + 1);
        }
      }

      newRelations[k1][k2] = rel12;
      newRelations[k2][k1] = rel21;
    }
  }

  return {
    newState: { ...state, relations: newRelations, kingdoms: newKingdoms },
    lines,
  };
}

// ── Build a NAP treaty object ─────────────────────────────────
function buildNAP(season: number, parties: [string, string], duration = 8): Treaty {
  return {
    type: 'nap',
    status: 'active',
    expiresAt: season + duration,
    parties,
    signedAt: season,
  };
}

// ── Player proposes NAP (AI may accept or decline) ────────────
export function proposeNAP(
  state: GameState,
  proposerKid: string,
  targetKid: string,
  rng: () => number
): { accepted: boolean; newState: GameState; message: string } {
  const targetKingdom = state.kingdoms[targetKid];
  if (!targetKingdom) return { accepted: false, newState: state, message: 'Kingdom not found.' };

  const rel = state.relations[proposerKid]?.[targetKid];
  if (!rel) return { accepted: false, newState: state, message: 'No relations.' };

  if (rel.treaty?.type === 'nap' && rel.treaty.status === 'active') {
    return { accepted: false, newState: state, message: `${targetKingdom.name} already has a Non-Aggression Pact with you.` };
  }

  // Ruler diplomacy bonus affects acceptance
  const rulerBonus = targetKingdom.ruler ? ((targetKingdom.ruler.stats.diplomacy - 5) * 2) : 0;

  // AI acceptance threshold: relations ≥ −10 + personality mod + ruler bonus
  const personalityMod = getAIPersonalityDiplomacyMod(targetKingdom);
  const threshold = -10 + personalityMod + targetKingdom.diplomacyModifier * 10 + rulerBonus;
  const qinPenalty = targetKid === 'qin' || proposerKid === 'qin' ? 20 : 0;

  const roll = rng() * 40 - 20; // ±20 randomness
  const effectiveScore = rel.score + roll;

  if (import.meta.env?.DEV) {
    console.debug(`[Diplomacy] NAP proposal ${proposerKid}→${targetKid}: score=${rel.score} roll=${roll.toFixed(1)} effective=${effectiveScore.toFixed(1)} threshold=${threshold - qinPenalty}`);
  }

  if (effectiveScore >= threshold - qinPenalty) {
    return acceptNAP(state, proposerKid, targetKid);
  } else {
    return {
      accepted: false,
      newState: state,
      message: `${targetKingdom.name} refuses the Non-Aggression Pact.`,
    };
  }
}

/**
 * Force-accept a NAP without re-rolling probability.
 * Used when the player accepts an inbox proposal that the AI already expressed desire for.
 */
export function forceAcceptNAP(
  state: GameState,
  playerKid: string,
  fromKid: string
): { newState: GameState; message: string } {
  const result = acceptNAP(state, playerKid, fromKid);
  return { newState: result.newState, message: result.message };
}

function acceptNAP(
  state: GameState,
  party1: string,
  party2: string
): { accepted: true; newState: GameState; message: string } {
  const duration = 8;
  const treaty = buildNAP(state.season, [party1, party2], duration);
  const newRelations = deepCopyRelations(state.relations);
  newRelations[party1][party2] = {
    ...newRelations[party1][party2],
    treaty,
    score: Math.min(100, (newRelations[party1][party2].score ?? 0) + 10),
    atWarWith: false,
  };
  newRelations[party2][party1] = {
    ...newRelations[party2][party1],
    treaty,
    score: Math.min(100, (newRelations[party2][party1].score ?? 0) + 10),
    atWarWith: false,
  };
  const name = state.kingdoms[party2]?.name ?? party2;
  return {
    accepted: true,
    newState: { ...state, relations: newRelations },
    message: `Non-Aggression Pact with ${name} signed for ${duration} seasons.`,
  };
}

// ── Player offers tribute ─────────────────────────────────────
export function offerTribute(
  state: GameState,
  proposerKid: string,
  targetKid: string,
  amount: number
): { accepted: boolean; newState: GameState; message: string } {
  const targetKingdom = state.kingdoms[targetKid];
  const proposerKingdom = state.kingdoms[proposerKid];
  if (!targetKingdom || !proposerKingdom) {
    return { accepted: false, newState: state, message: 'Kingdom not found.' };
  }
  if (proposerKingdom.treasury < amount) {
    return { accepted: false, newState: state, message: 'Insufficient treasury.' };
  }

  const treaty: Treaty = {
    type: 'tribute',
    status: 'active',
    expiresAt: state.season + 4,
    tributeAmount: amount,
    parties: [proposerKid, targetKid],
    signedAt: state.season,
  };

  const newRelations = deepCopyRelations(state.relations);
  newRelations[proposerKid][targetKid] = {
    ...newRelations[proposerKid][targetKid],
    treaty,
    score: Math.min(100, newRelations[proposerKid][targetKid].score + 15),
    atWarWith: false,
  };
  newRelations[targetKid][proposerKid] = {
    ...newRelations[targetKid][proposerKid],
    treaty,
    score: Math.min(100, newRelations[targetKid][proposerKid].score + 15),
    atWarWith: false,
  };

  return {
    accepted: true,
    newState: { ...state, relations: newRelations },
    message: `${targetKingdom.name} accepts your tribute of ${amount} gold for 4 seasons.`,
  };
}

// ── Treaty Breach ─────────────────────────────────────────────

export interface BreachConsequences {
  relationsWithTarget: number;      // score change
  reputationChange: number;         // player reputation change
  stabilityChange: number;          // player stability change
  coalitionPressure: number;        // score change with ALL other kingdoms
}

export const BREACH_CONSEQUENCES: BreachConsequences = {
  relationsWithTarget: -50,
  reputationChange: -20,
  stabilityChange: -8,
  coalitionPressure: -8,
};

/**
 * Breach an active treaty between breakerKid and targetKid.
 * Applies penalties, marks treaty as breached, increments breachCount.
 */
export function breachTreaty(
  state: GameState,
  breakerKid: string,
  targetKid: string
): { newState: GameState; consequences: BreachConsequences; message: string } {
  const rel = state.relations[breakerKid]?.[targetKid];
  if (!rel?.treaty || rel.treaty.status !== 'active') {
    return {
      newState: state,
      consequences: { relationsWithTarget: 0, reputationChange: 0, stabilityChange: 0, coalitionPressure: 0 },
      message: 'No active treaty to breach.',
    };
  }

  const c = BREACH_CONSEQUENCES;
  const newRelations = deepCopyRelations(state.relations);
  const newKingdoms = { ...state.kingdoms };

  // Mark treaty breached
  const treaty = newRelations[breakerKid][targetKid].treaty!;
  newRelations[breakerKid][targetKid].treaty = { ...treaty, status: 'breached', expiresAt: state.season };
  newRelations[targetKid][breakerKid].treaty = { ...treaty, status: 'breached', expiresAt: state.season };

  // Relations penalty with target
  newRelations[breakerKid][targetKid].score = Math.max(-100, newRelations[breakerKid][targetKid].score + c.relationsWithTarget);
  newRelations[targetKid][breakerKid].score = Math.max(-100, newRelations[targetKid][breakerKid].score + c.relationsWithTarget);
  newRelations[targetKid][breakerKid].atWarWith = true;

  // Coalition pressure — all other kingdoms hear of the breach
  for (const otherId of Object.keys(state.kingdoms)) {
    if (otherId === breakerKid || otherId === targetKid) continue;
    if (newRelations[otherId]?.[breakerKid]) {
      newRelations[otherId][breakerKid].score = Math.max(-100, newRelations[otherId][breakerKid].score + c.coalitionPressure);
    }
    if (newRelations[breakerKid]?.[otherId]) {
      newRelations[breakerKid][otherId].score = Math.max(-100, newRelations[breakerKid][otherId].score + c.coalitionPressure);
    }
  }

  // Breaker kingdom penalties
  const breakerK = { ...newKingdoms[breakerKid] };
  breakerK.reputation = Math.max(-100, breakerK.reputation + c.reputationChange);
  breakerK.stability = Math.max(0, breakerK.stability + c.stabilityChange);
  breakerK.treatyBreachCount = (breakerK.treatyBreachCount ?? 0) + 1;
  newKingdoms[breakerKid] = breakerK;

  // Record in target AI memory
  const targetK = newKingdoms[targetKid];
  if (targetK?.personality) {
    newKingdoms[targetKid] = {
      ...targetK,
      personality: {
        ...targetK.personality,
        recentBetrayers: targetK.personality.recentBetrayers.includes(breakerKid)
          ? targetK.personality.recentBetrayers
          : [...targetK.personality.recentBetrayers, breakerKid],
      },
    };
  }

  const targetName = state.kingdoms[targetKid]?.name ?? targetKid;
  const treatyName = treaty.type === 'nap' ? 'Non-Aggression Pact' : 'Tribute Treaty';
  const msg = `You breached the ${treatyName} with ${targetName}! Relations −50, reputation −20, stability −8. All kingdoms distrust you more.`;

  return {
    newState: { ...state, relations: newRelations, kingdoms: newKingdoms },
    consequences: c,
    message: msg,
  };
}

// ── AI personality helpers ────────────────────────────────────

function getAIPersonalityDiplomacyMod(k: Kingdom): number {
  if (!k.personality) return 0;
  const traits = k.personality.traits;
  let mod = 0;
  if (traits.includes('honorable')) mod += 15;
  if (traits.includes('cautious')) mod += 10;
  if (traits.includes('aggressive')) mod -= 20;
  if (traits.includes('mercantile')) mod += 10;
  // Serial breaker penalty: each breach makes this kingdom harder to sign pacts with
  if ((k.treatyBreachCount ?? 0) > 0) mod -= (k.treatyBreachCount ?? 0) * 5;
  return mod;
}
