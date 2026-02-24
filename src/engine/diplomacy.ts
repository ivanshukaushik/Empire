import { GameState, RelationData, Kingdom } from './types';

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
        if (t.expiresAt !== -1 && state.season >= t.expiresAt) {
          // Treaty expired
          lines.push(`The ${t.type === 'nap' ? 'Non-Aggression Pact' : 'Tribute treaty'} between ${state.kingdoms[k1].name} and ${state.kingdoms[k2].name} has expired.`);
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
              // Can't pay — treaty breaks
              lines.push(`${payerK.name} cannot pay tribute to ${receiverK.name}! Treaty broken. Relations collapse.`);
              rel12.treaty = null;
              rel21.treaty = null;
              rel12.score = Math.max(-100, rel12.score - 40);
              rel21.score = Math.max(-100, rel21.score - 40);
              if (payerK.personality) payerK.personality.recentBetrayers.push(receiver);
            }
          }
        }
      }

      // Slow natural drift toward 0 (if no treaty and not at war)
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

// Player proposes NAP
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

  if (rel.treaty?.type === 'nap') {
    return { accepted: false, newState: state, message: `${targetKingdom.name} already has a Non-Aggression Pact with you.` };
  }

  // AI acceptance threshold: relations ≥ −10 + personality mod
  const personalityMod = getAIPersonalityDiplomacyMod(targetKingdom);
  const threshold = -10 + personalityMod + targetKingdom.diplomacyModifier * 10;
  // Qin penalty: harder to sign pacts with
  const qinPenalty = targetKid === 'qin' || proposerKid === 'qin' ? 20 : 0;

  const roll = rng() * 40 - 20; // ±20 randomness
  const effectiveScore = rel.score + roll;

  if (effectiveScore >= threshold - qinPenalty) {
    // Accept
    const duration = 8; // 8 seasons
    const treaty = {
      type: 'nap' as const,
      expiresAt: state.season + duration,
      parties: [proposerKid, targetKid] as [string, string],
    };
    const newRelations = deepCopyRelations(state.relations);
    newRelations[proposerKid][targetKid] = {
      ...newRelations[proposerKid][targetKid],
      treaty,
      score: Math.min(100, rel.score + 10),
      atWarWith: false,
    };
    newRelations[targetKid][proposerKid] = {
      ...newRelations[targetKid][proposerKid],
      treaty,
      score: Math.min(100, state.relations[targetKid][proposerKid].score + 10),
      atWarWith: false,
    };
    return {
      accepted: true,
      newState: { ...state, relations: newRelations },
      message: `${targetKingdom.name} accepts the Non-Aggression Pact for ${duration} seasons.`,
    };
  } else {
    return {
      accepted: false,
      newState: state,
      message: `${targetKingdom.name} refuses the Non-Aggression Pact.`,
    };
  }
}

// Player offers tribute
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

  // Always accepted for tribute — it's money
  const treaty = {
    type: 'tribute' as const,
    expiresAt: state.season + 4, // 4 seasons
    tributeAmount: amount,
    parties: [proposerKid, targetKid] as [string, string],
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

function getAIPersonalityDiplomacyMod(k: Kingdom): number {
  if (!k.personality) return 0;
  const traits = k.personality.traits;
  let mod = 0;
  if (traits.includes('honorable')) mod += 15;
  if (traits.includes('cautious')) mod += 10;
  if (traits.includes('aggressive')) mod -= 20;
  if (traits.includes('mercantile')) mod += 10;
  return mod;
}

function deepCopyRelations(
  relations: Record<string, Record<string, RelationData>>
): Record<string, Record<string, RelationData>> {
  const copy: Record<string, Record<string, RelationData>> = {};
  for (const k1 of Object.keys(relations)) {
    copy[k1] = {};
    for (const k2 of Object.keys(relations[k1])) {
      copy[k1][k2] = {
        ...relations[k1][k2],
        events: [...relations[k1][k2].events],
        treaty: relations[k1][k2].treaty ? { ...relations[k1][k2].treaty! } : null,
      };
    }
  }
  return copy;
}
