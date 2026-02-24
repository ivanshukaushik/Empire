import { GameState, PlayerAction } from './types';
import { garrisonTier } from './initialState';
import { rollFloat } from './rng';

export function resolveEspionage(
  action: PlayerAction,
  state: GameState,
  rng: () => number
): { newState: GameState; message: string; success: boolean } {
  const targetId = action.targetProvinceId;
  if (!targetId) return { newState: state, message: 'No target province.', success: false };

  const targetProvince = state.provinces[targetId];
  if (!targetProvince) return { newState: state, message: 'Province not found.', success: false };

  const playerKingdom = state.kingdoms[state.playerKingdomId];
  const isYan = state.playerKingdomId === 'yan';

  switch (action.type) {
    case 'espionage_scout': {
      // Always succeeds (Yan gets it free; others pay AP)
      const newFog = { ...state.fogOfWar };
      newFog[targetId] = {
        visible: false,
        partial: newFog[targetId]?.partial ?? false,
        scouted: true,
        scoutedAt: state.season,
        lastKnownOwner: targetProvince.owner,
        lastKnownGarrisonTier: garrisonTier(targetProvince.garrison),
      };
      return {
        newState: { ...state, fogOfWar: newFog },
        message: `Scouts return from ${targetProvince.name}: garrison ~${targetProvince.garrison.toLocaleString()}, unrest ${targetProvince.unrest}, owner ${state.kingdoms[targetProvince.owner]?.name ?? '?'}.`,
        success: true,
      };
    }

    case 'espionage_sabotage': {
      // Base success 55%; Yan: 75%; detected chance 30% (20% for Yan)
      const baseChance = isYan ? 0.75 : 0.55;
      const success = rng() < baseChance * playerKingdom.espionageModifier;
      const detected = rng() < (isYan ? 0.2 : 0.3);

      if (success) {
        const reduction = Math.floor(targetProvince.garrison * rollFloat(rng, 0.15, 0.30));
        const newProvinces = {
          ...state.provinces,
          [targetId]: { ...targetProvince, garrison: Math.max(0, targetProvince.garrison - reduction) },
        };
        let newState = { ...state, provinces: newProvinces };
        if (detected) {
          // Relations penalty
          const ownerKid = targetProvince.owner;
          const newRelations = { ...state.relations };
          if (newRelations[state.playerKingdomId]?.[ownerKid]) {
            newRelations[state.playerKingdomId][ownerKid] = {
              ...newRelations[state.playerKingdomId][ownerKid],
              score: Math.max(-100, newRelations[state.playerKingdomId][ownerKid].score - 15),
            };
          }
          newState = { ...newState, relations: newRelations };
        }
        return {
          newState,
          message: `Saboteurs struck ${targetProvince.name}! Garrison reduced by ${reduction.toLocaleString()}. ${detected ? '⚠ Agents were spotted — relations with ' + (state.kingdoms[targetProvince.owner]?.name ?? '?') + ' suffer.' : 'Agents escaped undetected.'}`,
          success: true,
        };
      } else {
        return {
          newState: state,
          message: `Sabotage of ${targetProvince.name} failed. ${detected ? 'Agents captured! Relations damaged.' : 'Agents retreated.'}`,
          success: false,
        };
      }
    }

    case 'espionage_incite': {
      const baseChance = isYan ? 0.70 : 0.50;
      const success = rng() < baseChance * playerKingdom.espionageModifier;
      const detected = rng() < (isYan ? 0.25 : 0.35);

      if (success) {
        const unrestGain = Math.floor(rollFloat(rng, 15, 25));
        const newProvinces = {
          ...state.provinces,
          [targetId]: { ...targetProvince, unrest: Math.min(100, targetProvince.unrest + unrestGain) },
        };
        let newState = { ...state, provinces: newProvinces };
        if (detected) {
          const ownerKid = targetProvince.owner;
          const newRelations = { ...state.relations };
          if (newRelations[state.playerKingdomId]?.[ownerKid]) {
            newRelations[state.playerKingdomId][ownerKid] = {
              ...newRelations[state.playerKingdomId][ownerKid],
              score: Math.max(-100, newRelations[state.playerKingdomId][ownerKid].score - 20),
            };
          }
          newState = { ...newState, relations: newRelations };
        }
        return {
          newState,
          message: `Agitators stirred unrest in ${targetProvince.name}! Unrest +${unrestGain}. ${detected ? '⚠ Detected! Relations damaged.' : 'Operation undetected.'}`,
          success: true,
        };
      } else {
        return {
          newState: state,
          message: `Incitement in ${targetProvince.name} failed.`,
          success: false,
        };
      }
    }

    default:
      return { newState: state, message: 'Unknown espionage action.', success: false };
  }
}
