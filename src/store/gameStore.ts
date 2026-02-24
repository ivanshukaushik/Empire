import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { GameState, PlayerAction, ActionType, DiploProposal } from '../engine/types';
import { createInitialState } from '../engine/initialState';
import { validateAction, applyPlayerAction, executeTurn, isCampaignAction } from '../engine/turnEngine';
import { createRng } from '../engine/rng';
import { proposeNAP } from '../engine/diplomacy';
import { resolveSeed } from '../config';

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

  /** Accept an inbound diplomatic proposal */
  acceptProposal: (proposalId: string) => void;
  /** Decline an inbound diplomatic proposal */
  declineProposal: (proposalId: string) => void;
}

const SAVE_KEY = 'warring-states-v2-save';

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

      // RNG seeded from ordersRemaining so determinism is preserved
      const rng = createRng(
        gameState.seed + gameState.season * 100 + gameState.ordersRemaining
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

      // Set phase to 'executing' first so the "Resolving…" overlay renders.
      set({
        gameState: {
          ...gameState,
          phase: 'executing',
          actionBeingPlanned: null,
          pendingMoveArmyId: null,
        },
      });

      // Yield to the browser so it can flush the paint (show the overlay)
      // before we block the main thread with season resolution.
      requestAnimationFrame(() => {
        // One extra tick ensures the overlay is actually composited.
        setTimeout(() => {
          const { gameState: current } = get();
          if (!current) return;
          try {
            const newState = executeTurn(current);
            set({ gameState: newState });
          } catch (err) {
            console.error('[endTurn] executeTurn threw — resetting to player_planning:', err);
            // Return to planning phase so the player isn't permanently stuck.
            set({
              gameState: { ...current, phase: 'player_planning' },
              actionFeedback: '⚠ Season resolution failed — check the console for details.',
            });
          }
        }, 0);
      });
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
          JSON.stringify({ version: '2.0', savedAt: new Date().toISOString(), state: gameState })
        );
      } catch (e) {
        console.error('Save failed:', e);
      }
    },

    loadGame: () => {
      try {
        // Try current save key first, then legacy key for backward compat
        const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem('warring-states-v1-save');
        if (!raw) return false;
        const save = JSON.parse(raw);
        if (!save?.state) return false;
        // Migrate old saves: add missing fields from new schema
        const loaded = save.state as Partial<GameState>;
        const migrated: GameState = {
          ordersRemaining: 2,
          maxOrders: 2,
          provinceDomesticUsed: {},
          armyCampaignUsed: {},
          diplomaticInbox: [],
          ...loaded,
        } as GameState;
        set({ gameState: migrated });
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

    acceptProposal: (proposalId) => {
      const { gameState } = get();
      if (!gameState) return;
      const proposal = gameState.diplomaticInbox.find((p) => p.id === proposalId);
      if (!proposal) return;

      const kid = gameState.playerKingdomId;
      let newState = { ...gameState };
      let message = '';

      if (proposal.type === 'nap_offer') {
        const rng = createRng(gameState.seed + gameState.season * 77 + Date.now() % 999);
        const result = proposeNAP(newState, kid, proposal.fromKingdomId, rng);
        newState = result.newState;
        message = `Accepted NAP offer from ${gameState.kingdoms[proposal.fromKingdomId]?.name}.`;
      } else if (proposal.type === 'tribute_demand') {
        // AI pays us tribute — improve relations, add to upcoming season income
        const amount = proposal.tributeAmount ?? 10;
        const fromK = { ...newState.kingdoms[proposal.fromKingdomId] };
        fromK.treasury = Math.max(0, fromK.treasury - amount);
        const playerK = { ...newState.kingdoms[kid] };
        playerK.treasury += amount;
        const newRelations = { ...newState.relations };
        if (newRelations[kid]?.[proposal.fromKingdomId]) {
          newRelations[kid] = {
            ...newRelations[kid],
            [proposal.fromKingdomId]: {
              ...newRelations[kid][proposal.fromKingdomId],
              score: Math.min(100, (newRelations[kid][proposal.fromKingdomId].score ?? 0) + 15),
            },
          };
        }
        newState = {
          ...newState,
          kingdoms: { ...newState.kingdoms, [proposal.fromKingdomId]: fromK, [kid]: playerK },
          relations: newRelations,
        };
        message = `Accepted tribute from ${gameState.kingdoms[proposal.fromKingdomId]?.name}: +${amount} gold.`;
      } else if (proposal.type === 'mutual_target') {
        // Soft pact: improve relations with proposer, worsen with target
        const fromName = gameState.kingdoms[proposal.fromKingdomId]?.name ?? '';
        const newRelations = { ...newState.relations };
        if (newRelations[kid]?.[proposal.fromKingdomId]) {
          newRelations[kid] = {
            ...newRelations[kid],
            [proposal.fromKingdomId]: {
              ...newRelations[kid][proposal.fromKingdomId],
              score: Math.min(100, (newRelations[kid][proposal.fromKingdomId].score ?? 0) + 10),
            },
          };
        }
        newState = { ...newState, relations: newRelations };
        message = `Agreed to coordinate with ${fromName} against ${proposal.targetKingdomId ? (gameState.kingdoms[proposal.targetKingdomId]?.name ?? '') : 'common foes'}.`;
      }

      // Remove proposal from inbox
      newState = {
        ...newState,
        diplomaticInbox: newState.diplomaticInbox.filter((p) => p.id !== proposalId),
        turnLog: [...newState.turnLog, { season: newState.season, type: 'diplomacy', message }],
      };

      set({ gameState: newState, actionFeedback: message });
    },

    declineProposal: (proposalId) => {
      const { gameState } = get();
      if (!gameState) return;
      const proposal = gameState.diplomaticInbox.find((p) => p.id === proposalId);
      if (!proposal) return;

      const kid = gameState.playerKingdomId;
      const fromName = gameState.kingdoms[proposal.fromKingdomId]?.name ?? '';

      // Small relations penalty for declining
      const newRelations = { ...gameState.relations };
      if (newRelations[kid]?.[proposal.fromKingdomId]) {
        newRelations[kid] = {
          ...newRelations[kid],
          [proposal.fromKingdomId]: {
            ...newRelations[kid][proposal.fromKingdomId],
            score: Math.max(-100, (newRelations[kid][proposal.fromKingdomId].score ?? 0) - 5),
          },
        };
      }

      const message = `Declined proposal from ${fromName}.`;
      const newState = {
        ...gameState,
        relations: newRelations,
        diplomaticInbox: gameState.diplomaticInbox.filter((p) => p.id !== proposalId),
        turnLog: [...gameState.turnLog, { season: gameState.season, type: 'diplomacy' as const, message }],
      };

      set({ gameState: newState, actionFeedback: message });
    },
  }))
);
