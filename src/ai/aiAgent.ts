import { GameState, Kingdom, PlayerAction, Army, Province, AIPersonality } from '../engine/types';
import { buildCost, recruitCost } from '../engine/turnEngine';

// ============================================================
// UTILITY-BASED AI PLANNER
// AI has fog-of-war: it knows its own provinces fully,
// adjacent provinces partially, and remembers scouted data.
// ============================================================

interface ScoredAction {
  action: PlayerAction;
  score: number;
}

export function aiPlanTurn(
  kingdom: Kingdom,
  state: GameState,
  rng: () => number
): PlayerAction[] {
  if (kingdom.isEliminated) return [];

  const p = kingdom.personality;
  if (!p) return [];

  let apRemaining = 3;
  const chosen: PlayerAction[] = [];
  const maxIter = 10;

  for (let i = 0; i < maxIter && apRemaining > 0; i++) {
    const candidates = generateCandidateActions(kingdom, state, apRemaining, rng);
    if (candidates.length === 0) break;

    const scored = candidates.map((a) => ({
      action: a,
      score: scoreAction(a, kingdom, state, p, rng),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score <= 0) break;

    chosen.push(best.action);
    apRemaining -= best.action.apCost;

    // Update local state shadow so next action doesn't re-pick same target
    // (simplified: just break if attacking and we only have 1 army)
    if (best.action.type === 'attack' || best.action.type === 'move') {
      // Don't plan another attack this turn
      break;
    }
  }

  return chosen;
}

function generateCandidateActions(
  kingdom: Kingdom,
  state: GameState,
  apRemaining: number,
  rng: () => number
): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const kid = kingdom.id;
  const ownedProvinces = Object.values(state.provinces).filter((p) => p.owner === kid);
  const myArmies = Object.values(state.armies).filter((a) => a.kingdomId === kid);

  // --- ATTACK / MOVE actions ---
  if (apRemaining >= 1) {
    for (const army of myArmies) {
      if (army.size < 500) continue;
      const fromProv = state.provinces[army.provinceId];
      if (!fromProv) continue;

      for (const adjId of fromProv.adjacentTo) {
        const adjProv = state.provinces[adjId];
        if (!adjProv) continue;

        if (adjProv.owner === kid) {
          // Move to friendly province (for repositioning)
          actions.push({
            id: `ai_move_${army.id}_${adjId}`,
            type: 'move',
            apCost: 1,
            armyId: army.id,
            targetProvinceId: adjId,
          });
        } else {
          // Check no NAP
          const rel = state.relations[kid]?.[adjProv.owner];
          if (rel?.treaty?.type === 'nap') continue;
          if (state.kingdoms[adjProv.owner]?.isEliminated) continue;

          actions.push({
            id: `ai_attack_${army.id}_${adjId}`,
            type: 'attack',
            apCost: 1,
            armyId: army.id,
            targetProvinceId: adjId,
          });
        }
      }

      // Zhao mobility bonus
      if (kingdom.mobilityBonus > 0) {
        for (const adjId of fromProv.adjacentTo) {
          const adjProv = state.provinces[adjId];
          if (!adjProv || adjProv.owner !== kid) continue;
          for (const adj2Id of adjProv.adjacentTo) {
            if (adj2Id === army.provinceId) continue;
            const adj2Prov = state.provinces[adj2Id];
            if (!adj2Prov || adj2Prov.owner === kid) continue;
            const rel = state.relations[kid]?.[adj2Prov.owner];
            if (rel?.treaty?.type === 'nap') continue;
            if (state.kingdoms[adj2Prov.owner]?.isEliminated) continue;
            actions.push({
              id: `ai_attack2_${army.id}_${adj2Id}`,
              type: 'attack',
              apCost: 1,
              armyId: army.id,
              targetProvinceId: adj2Id,
            });
          }
        }
      }
    }
  }

  // --- RECRUIT ---
  if (apRemaining >= 1 && kingdom.manpower >= 2 && kingdom.treasury >= 4) {
    const recruitProv = ownedProvinces.find((p) => p.hasBarracks || p.isCapital);
    if (recruitProv) {
      const amount = Math.min(5, Math.floor(kingdom.manpower / 2), Math.floor(kingdom.treasury / 4));
      if (amount >= 1) {
        actions.push({
          id: `ai_recruit_${kid}`,
          type: 'recruit',
          apCost: 1,
          provinceId: recruitProv.id,
          recruitAmount: amount,
        });
      }
    }
  }

  // --- BUILD ---
  if (apRemaining >= 1) {
    for (const prov of ownedProvinces) {
      const cost = buildCost('farm', kingdom);
      if (!prov.hasFarm && kingdom.treasury >= cost.gold) {
        actions.push({ id: `ai_build_farm_${prov.id}`, type: 'build', apCost: 1, provinceId: prov.id, buildingType: 'farm' });
      }
      const mcost = buildCost('market', kingdom);
      if (!prov.hasMarket && kingdom.treasury >= mcost.gold) {
        actions.push({ id: `ai_build_market_${prov.id}`, type: 'build', apCost: 1, provinceId: prov.id, buildingType: 'market' });
      }
      const bcost = buildCost('barracks', kingdom);
      if (!prov.hasBarracks && kingdom.treasury >= bcost.gold && kingdom.food >= bcost.food) {
        actions.push({ id: `ai_build_barracks_${prov.id}`, type: 'build', apCost: 1, provinceId: prov.id, buildingType: 'barracks' });
      }
      if (prov.fortLevel < 2) {
        const fcost = buildCost('fort', kingdom);
        if (kingdom.treasury >= fcost.gold && kingdom.food >= fcost.food) {
          // Only fort border provinces
          const isBorder = prov.adjacentTo.some((a) => state.provinces[a]?.owner !== kid);
          if (isBorder || prov.isCapital) {
            actions.push({ id: `ai_build_fort_${prov.id}`, type: 'build', apCost: 1, provinceId: prov.id, buildingType: 'fort' });
          }
        }
      }
    }
  }

  // --- DIPLOMACY (NAP) ---
  if (apRemaining >= 1) {
    const otherKids = Object.keys(state.kingdoms).filter(
      (k) => k !== kid && !state.kingdoms[k].isEliminated
    );
    for (const targetKid of otherKids) {
      const rel = state.relations[kid]?.[targetKid];
      if (!rel || rel.treaty?.type === 'nap') continue;
      // Only propose if relations aren't terrible
      if (rel.score > -30) {
        actions.push({
          id: `ai_nap_${kid}_${targetKid}`,
          type: 'diplomacy_nap',
          apCost: 1,
          targetKingdomId: targetKid,
        });
      }
    }
  }

  return actions;
}

function scoreAction(
  action: PlayerAction,
  kingdom: Kingdom,
  state: GameState,
  p: AIPersonality,
  rng: () => number
): number {
  const kid = kingdom.id;
  let score = 0;

  switch (action.type) {
    case 'attack': {
      const targetProv = state.provinces[action.targetProvinceId!];
      const attackerArmy = state.armies[action.armyId!];
      if (!targetProv || !attackerArmy) return -999;

      // Estimate odds
      const targetGarrison = targetProv.garrison + getDefendingArmySize(targetProv.id, targetProv.owner, state);
      const strengthRatio = attackerArmy.size / Math.max(1, targetGarrison);

      // Base score for attacking
      score = 60;

      // Strength advantage
      if (strengthRatio > 2.0) score += 40;
      else if (strengthRatio > 1.5) score += 25;
      else if (strengthRatio > 1.0) score += 10;
      else score -= 30; // risky

      // Province value
      if (targetProv.isCapital) score += 30;
      if (targetProv.hasSalt || targetProv.hasIron) score += 15;
      score += targetProv.baseIncome * 5;
      score += targetProv.baseFood * 3;

      // Personality modifiers
      score *= p.aggressionWeight * 1.5;

      // Opportunistic: loves hitting weakened targets
      if (p.traits.includes('opportunistic') && strengthRatio > 1.5) score += 20;

      // Cautious: very reluctant to attack unless overwhelmingly strong
      if (p.traits.includes('cautious') && strengthRatio < 2.0) score *= 0.3;

      // Don't attack if they recently attacked us back and we're weakened
      if (p.recentAttackers.includes(targetProv.owner) && attackerArmy.size < 4000) score -= 20;

      // Morale check
      if (attackerArmy.morale < 50) score -= 20;
      if (attackerArmy.size < 2000) score -= 50;

      // Slight randomness (prevents predictable loops)
      score += (rng() - 0.5) * 15;

      break;
    }

    case 'move': {
      const toProv = state.provinces[action.targetProvinceId!];
      if (!toProv) return -999;
      const army = state.armies[action.armyId!];
      if (!army) return -999;

      // Score moving toward threats or weak enemies
      let baseScore = 10;

      // Is target adjacent to an enemy?
      const isStrategic = toProv.adjacentTo.some((adj) => {
        const adjProv = state.provinces[adj];
        return adjProv && adjProv.owner !== kid;
      });
      if (isStrategic) baseScore += 15;

      // Paranoid AI: move armies to defend capital
      if (p.traits.includes('paranoid')) {
        const capital = state.provinces[kingdom.capital];
        if (capital && toProv.adjacentTo.includes(kingdom.capital)) baseScore += 20;
      }

      // Aggressive: move toward enemies
      score = baseScore * p.aggressionWeight;
      score += (rng() - 0.5) * 10;
      break;
    }

    case 'recruit': {
      // Base 50; higher if military is low or threatened
      score = 50 * p.aggressionWeight;

      const myArmyStrength = Object.values(state.armies)
        .filter((a) => a.kingdomId === kid)
        .reduce((s, a) => s + a.size, 0);

      // Threatened?
      const ownedProvs = Object.values(state.provinces).filter((p) => p.owner === kid);
      const isThreatened = ownedProvs.some((prov) =>
        prov.adjacentTo.some((adj) => {
          const adjProv = state.provinces[adj];
          return adjProv && adjProv.owner !== kid && getDefendingArmySize(adj, adjProv.owner, state) > 3000;
        })
      );
      if (isThreatened) score += 30;

      // Cautious: likes recruiting
      if (p.traits.includes('cautious')) score += 20;
      if (myArmyStrength < 5000) score += 25;
      if (kingdom.manpower < 5) score -= 40;
      break;
    }

    case 'build': {
      const prov = state.provinces[action.provinceId!];
      if (!prov) return -999;

      score = 30;
      switch (action.buildingType) {
        case 'farm':
          score += p.economyWeight * 40;
          if (kingdom.food < 20) score += 20;
          break;
        case 'market':
          score += p.economyWeight * 45;
          if (kingdom.treasury < 30) score += 20;
          // Mercantile loves markets
          if (p.traits.includes('mercantile')) score += 30;
          break;
        case 'barracks':
          score += p.aggressionWeight * 30 + p.economyWeight * 15;
          break;
        case 'fort': {
          const isBorder = prov.adjacentTo.some((a) => state.provinces[a]?.owner !== kid);
          score = isBorder ? 35 : 10;
          if (p.traits.includes('cautious')) score += 25;
          if (kingdom.id === 'han') score += 20; // Han loves forts
          break;
        }
      }
      break;
    }

    case 'diplomacy_nap': {
      const targetKid = action.targetKingdomId!;
      const rel = state.relations[kid]?.[targetKid];
      if (!rel) return -999;

      score = p.diplomacyWeight * 50;

      // Only sign pacts with non-threatening neighbors
      if (p.traits.includes('honorable')) score += 20;
      if (p.traits.includes('aggressive')) score -= 30;
      if (p.traits.includes('paranoid')) score += 15; // buying time

      // Don't sign pacts if we're currently attacking them
      const pendingAttack = Object.values(state.armies).some(
        (a) => a.kingdomId === kid && state.provinces[a.provinceId]?.adjacentTo.some(
          (adj) => state.provinces[adj]?.owner === targetKid
        )
      );
      if (pendingAttack) score -= 40;

      // More valuable if they're strong
      const theirStrength = Object.values(state.armies)
        .filter((a) => a.kingdomId === targetKid)
        .reduce((s, a) => s + a.size, 0);
      if (theirStrength > 8000) score += 20;

      break;
    }

    default:
      score = 0;
  }

  return score;
}

function getDefendingArmySize(provinceId: string, kingdomId: string, state: GameState): number {
  return Object.values(state.armies)
    .filter((a) => a.provinceId === provinceId && a.kingdomId === kingdomId)
    .reduce((s, a) => s + a.size, 0);
}
