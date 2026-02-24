import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { GameState, PlayerAction, ActionType } from '../engine/types';
import { createInitialState } from '../engine/initialState';
import { validateAction, applyPlayerAction, executeTurn } from '../engine/turnEngine';
import { createRng } from '../engine/rng';

// ============================================================
// GAME STORE
// ============================================================

interface GameStore {
  gameState: GameState | null;
  actionFeedback: string | null;

  newGame: (seed: number, playerKingdomId: string) => void;
  queueAction: (action: Omit<PlayerAction, 'id'>) => void;
  endTurn: () => void;
  dismissSummary: () => void;
  saveGame: () => void;
  loadGame: () => boolean;
  setSelectedProvince: (provinceId: string | null) => void;
  setActionBeingPlanned: (actionType: ActionType | null) => void;
  /** Store the army ID that is currently being moved or attacking */
  setPendingMoveArmy: (armyId: string | null) => void;
  clearFeedback: () => void;
  resetGame: () => void;
  dismissHelp: () => void;
}

const SAVE_KEY = 'warring-states-v1-save';

export const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    gameState: null,
    actionFeedback: null,

    newGame: (seed, playerKingdomId) => {
      const state = createInitialState(seed, playerKingdomId);
      set({ gameState: state, actionFeedback: null });
    },

    queueAction: (actionDef) => {
      const { gameState } = get();
      if (!gameState) return;
      if (gameState.phase !== 'player_planning') return;

      const action: PlayerAction = {
        id: `pa_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        ...actionDef,
      };

      const validation = validateAction(action, gameState);
      if (!validation.valid) {
        set({ actionFeedback: `⚠ ${validation.reason}` });
        return;
      }

      const rng = createRng(
        gameState.seed + gameState.season * 100 + gameState.actionPointsRemaining
      );
      const { newState, message } = applyPlayerAction(action, gameState, rng);

      set({
        gameState: {
          ...newState,
          pendingPlayerActions: [...newState.pendingPlayerActions, action],
          actionBeingPlanned: null,
          pendingMoveArmyId: null,
          turnLog: [
            ...newState.turnLog,
            {
              season: newState.season,
              type: 'player',
              message,
              kingdomId: gameState.playerKingdomId,
            },
          ],
        },
        actionFeedback: message,
      });
    },

    endTurn: () => {
      const { gameState } = get();
      if (!gameState) return;
      if (gameState.phase !== 'player_planning') return;

      set({
        gameState: {
          ...gameState,
          phase: 'executing',
          actionBeingPlanned: null,
          pendingMoveArmyId: null,
        },
      });

      setTimeout(() => {
        const { gameState: current } = get();
        if (!current) return;
        const newState = executeTurn(current);
        set({ gameState: newState });
      }, 50);
    },

    dismissSummary: () => {
      const { gameState } = get();
      if (!gameState) return;
      if (gameState.phase === 'season_summary') {
        set({
          gameState: { ...gameState, phase: 'player_planning', seasonSummary: null },
          actionFeedback: null,
        });
      }
    },

    saveGame: () => {
      const { gameState } = get();
      if (!gameState) return;
      try {
        localStorage.setItem(
          SAVE_KEY,
          JSON.stringify({ version: '1.0', savedAt: new Date().toISOString(), state: gameState })
        );
      } catch (e) {
        console.error('Save failed:', e);
      }
    },

    loadGame: () => {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const save = JSON.parse(raw);
        if (!save?.state) return false;
        set({ gameState: save.state });
        return true;
      } catch {
        return false;
      }
    },

    setSelectedProvince: (provinceId) => {
      set((draft) => {
        if (draft.gameState) draft.gameState.selectedProvinceId = provinceId;
      });
    },

    setActionBeingPlanned: (actionType) => {
      set((draft) => {
        if (draft.gameState) {
          draft.gameState.actionBeingPlanned = actionType;
          if (actionType === null) draft.gameState.pendingMoveArmyId = null;
        }
      });
    },

    setPendingMoveArmy: (armyId) => {
      set((draft) => {
        if (draft.gameState) draft.gameState.pendingMoveArmyId = armyId;
      });
    },

    clearFeedback: () => set({ actionFeedback: null }),

    resetGame: () => set({ gameState: null, actionFeedback: null }),

    dismissHelp: () => {
      set((draft) => {
        if (draft.gameState) draft.gameState.helpSeen = true;
      });
    },
  }))
);
