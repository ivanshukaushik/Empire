import { GameState } from './types';

export interface WinCheckResult {
  isOver: boolean;
  winner: string | null;
  loser: string | null;
  reason: string;
}

export function checkWinConditions(state: GameState): WinCheckResult {
  const totalProvinces = Object.keys(state.provinces).length;
  const winProvinceCount = Math.ceil(totalProvinces * 0.6); // 60%
  const allKids = Object.keys(state.kingdoms).filter((k) => !state.kingdoms[k].isEliminated);

  // Check player loss first
  const playerKingdom = state.kingdoms[state.playerKingdomId];
  if (!playerKingdom || playerKingdom.isEliminated) {
    return { isOver: true, winner: null, loser: state.playerKingdomId, reason: 'Your kingdom has been eliminated.' };
  }
  if (playerKingdom.stability <= 0) {
    return { isOver: true, winner: null, loser: state.playerKingdomId, reason: 'Your kingdom collapsed from internal chaos (Stability reached 0).' };
  }
  const playerCapital = state.provinces[playerKingdom.capital];
  if (playerCapital && playerCapital.owner !== state.playerKingdomId) {
    return { isOver: true, winner: null, loser: state.playerKingdomId, reason: `Your capital ${playerCapital.name} has been captured!` };
  }

  // Check player victory
  const playerProvinces = Object.values(state.provinces).filter(
    (p) => p.owner === state.playerKingdomId
  ).length;

  if (playerProvinces >= winProvinceCount) {
    return {
      isOver: true,
      winner: state.playerKingdomId,
      loser: null,
      reason: `You control ${playerProvinces}/${totalProvinces} provinces (${Math.round((playerProvinces / totalProvinces) * 100)}%) — Victory!`,
    };
  }

  // Capture 3 enemy capitals
  const capturedCapitals = Object.values(state.kingdoms)
    .filter((k) => k.id !== state.playerKingdomId)
    .filter((k) => {
      const cap = state.provinces[k.capital];
      return cap && cap.owner === state.playerKingdomId;
    }).length;

  if (capturedCapitals >= 3) {
    return {
      isOver: true,
      winner: state.playerKingdomId,
      loser: null,
      reason: `You have captured ${capturedCapitals} enemy capitals — Decisive Victory!`,
    };
  }

  // Check AI victories (for game-over loss condition)
  for (const kid of allKids) {
    if (kid === state.playerKingdomId) continue;
    const kProvinces = Object.values(state.provinces).filter((p) => p.owner === kid).length;
    if (kProvinces >= winProvinceCount) {
      return {
        isOver: true,
        winner: kid,
        loser: state.playerKingdomId,
        reason: `${state.kingdoms[kid].name} has unified ${kProvinces} provinces and achieved hegemony. You have been defeated.`,
      };
    }
  }

  // Mark eliminated kingdoms
  for (const kid of Object.keys(state.kingdoms)) {
    const k = state.kingdoms[kid];
    if (k.isEliminated) continue;
    const ownedCount = Object.values(state.provinces).filter((p) => p.owner === kid).length;
    if (ownedCount === 0) {
      // Will be marked eliminated in turn engine
    }
  }

  return { isOver: false, winner: null, loser: null, reason: '' };
}

// Mark kingdoms with no provinces as eliminated
export function markEliminated(state: GameState): GameState {
  const newKingdoms = { ...state.kingdoms };
  for (const kid of Object.keys(newKingdoms)) {
    const ownedCount = Object.values(state.provinces).filter((p) => p.owner === kid).length;
    if (ownedCount === 0 && !newKingdoms[kid].isEliminated) {
      newKingdoms[kid] = { ...newKingdoms[kid], isEliminated: true };
    }
  }
  return { ...state, kingdoms: newKingdoms };
}
