import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { GameState, PlayerAction, ActionType, DiploProposal } from '../engine/types';
import { createInitialState } from '../engine/initialState';
import { validateAction, applyPlayerAction, executeTurn, isCampaignAction } from '../engine/turnEngine';
import { createRng } from '../engine/rng';
import { forceAcceptNAP, breachTreaty, deepCopyRelations } from '../engine/diplomacy';
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
  setPendingMoveArmy: (armyId: string | null) => void;
  clearFeedback: () => void;
  resetGame: () => void;
  dismissHelp: () => void;

  /** Accept an inbound diplomatic proposal */
  acceptProposal: (proposalId: string) => void;
  /** Decline an inbound diplomatic proposal */
  declineProposal: (proposalId: string) => void;
  /** Breach an active treaty with another kingdom */
  breachTreatyWith: (targetKingdomId: string) => void;
}

const SAVE_KEY = 'warring-states-v3-save';

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

      set({
        gameState: {
          ...gameState,
          phase: 'executing',
          actionBeingPlanned: null,
          pendingMoveArmyId: null,
        },
      });

      requestAnimationFrame(() => {
        setTimeout(() => {
          const { gameState: current } = get();
          if (!current) return;
          try {
            const newState = executeTurn(current);
            set({ gameState: newState });
          } catch (err) {
            console.error('[endTurn] executeTurn threw — resetting to player_planning:', err);
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
          JSON.stringify({ version: '3.0', savedAt: new Date().toISOString(), state: gameState })
        );
      } catch (e) {
        console.error('Save failed:', e);
      }
    },

    loadGame: () => {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
          ?? localStorage.getItem('warring-states-v2-save')
          ?? localStorage.getItem('warring-states-v1-save');
        if (!raw) return false;
        const save = JSON.parse(raw);
        if (!save?.state) return false;
        const loaded = save.state as Partial<GameState>;
        // Build migrated state with safe defaults and field migrations
        const migratedKingdoms = Object.fromEntries(
          Object.entries((loaded.kingdoms ?? {}) as Record<string, any>).map(([k, v]) => [
            k, { treatyBreachCount: 0, ...v },
          ])
        );
        const migratedInbox = ((loaded.diplomaticInbox ?? []) as any[]).map((p: any) => ({
          status: 'pending',
          expiresAt: (loaded.season ?? 1) + 4,
          ...p,
        }));
        const migratedRelations = Object.fromEntries(
          Object.entries((loaded.relations ?? {}) as Record<string, any>).map(([k1, inner]) => [
            k1,
            Object.fromEntries(
              Object.entries(inner as Record<string, any>).map(([k2, rel]: [string, any]) => [
                k2,
                { ...rel, treaty: rel.treaty ? { status: 'active', signedAt: 0, ...rel.treaty } : null },
              ])
            ),
          ])
        );
        const migrated: GameState = {
          ordersRemaining: 2,
          maxOrders: 2,
          provinceDomesticUsed: {},
          armyCampaignUsed: {},
          rulerEvents: [],
          toastMessages: [],
          ...loaded,
          kingdoms: migratedKingdoms,
          diplomaticInbox: migratedInbox,
          relations: migratedRelations,
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

    /**
     * Accept an inbound diplomatic proposal.
     * FIX: For nap_offer, we use forceAcceptNAP — the AI has already expressed
     * desire for peace by sending the proposal; we should NOT re-roll the
     * probability (which could silently fail and confuse the player).
     */
    acceptProposal: (proposalId) => {
      const { gameState } = get();
      if (!gameState) return;
      const proposal = gameState.diplomaticInbox.find((p) => p.id === proposalId);
      if (!proposal) return;

      const kid = gameState.playerKingdomId;
      let newState = { ...gameState };
      let message = '';

      if (proposal.type === 'nap_offer') {
        // FIXED: force-accept — the AI already sent this proposal, don't re-roll
        const result = forceAcceptNAP(newState, kid, proposal.fromKingdomId);
        newState = result.newState;
        message = `Non-Aggression Pact accepted with ${gameState.kingdoms[proposal.fromKingdomId]?.name}.`;
      } else if (proposal.type === 'tribute_demand') {
        // AI pays us tribute
        const amount = proposal.tributeAmount ?? 10;
        const fromK = { ...newState.kingdoms[proposal.fromKingdomId] };
        fromK.treasury = Math.max(0, fromK.treasury - amount);
        const playerK = { ...newState.kingdoms[kid] };
        playerK.treasury += amount;
        const newRelations = deepCopyRelations(newState.relations);
        if (newRelations[kid]?.[proposal.fromKingdomId]) {
          newRelations[kid][proposal.fromKingdomId].score = Math.min(
            100,
            (newRelations[kid][proposal.fromKingdomId].score ?? 0) + 15
          );
        }
        newState = {
          ...newState,
          kingdoms: { ...newState.kingdoms, [proposal.fromKingdomId]: fromK, [kid]: playerK },
          relations: newRelations,
        };
        message = `Accepted tribute from ${gameState.kingdoms[proposal.fromKingdomId]?.name}: +${amount} gold.`;
      } else if (proposal.type === 'mutual_target') {
        // Soft pact: improve relations with proposer
        const fromName = gameState.kingdoms[proposal.fromKingdomId]?.name ?? '';
        const newRelations = deepCopyRelations(newState.relations);
        if (newRelations[kid]?.[proposal.fromKingdomId]) {
          newRelations[kid][proposal.fromKingdomId].score = Math.min(
            100,
            (newRelations[kid][proposal.fromKingdomId].score ?? 0) + 10
          );
        }
        newState = { ...newState, relations: newRelations };
        const targetName = proposal.targetKingdomId
          ? (gameState.kingdoms[proposal.targetKingdomId]?.name ?? '')
          : 'common foes';
        message = `Agreed to coordinate with ${fromName} against ${targetName}.`;
      }

      // Mark proposal accepted and remove from inbox
      newState = {
        ...newState,
        diplomaticInbox: newState.diplomaticInbox
          .map((p) => p.id === proposalId ? { ...p, status: 'accepted' as const } : p)
          .filter((p) => p.status === 'pending'),
        turnLog: [...newState.turnLog, { season: newState.season, type: 'diplomacy' as const, message }],
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
      const newRelations = deepCopyRelations(gameState.relations);
      if (newRelations[kid]?.[proposal.fromKingdomId]) {
        newRelations[kid][proposal.fromKingdomId].score = Math.max(
          -100,
          (newRelations[kid][proposal.fromKingdomId].score ?? 0) - 5
        );
      }

      const message = `Declined proposal from ${fromName}.`;
      const newState = {
        ...gameState,
        relations: newRelations,
        diplomaticInbox: gameState.diplomaticInbox
          .map((p) => p.id === proposalId ? { ...p, status: 'declined' as const } : p)
          .filter((p) => p.status === 'pending'),
        turnLog: [...gameState.turnLog, { season: gameState.season, type: 'diplomacy' as const, message }],
      };

      set({ gameState: newState, actionFeedback: message });
    },

    breachTreatyWith: (targetKingdomId) => {
      const { gameState } = get();
      if (!gameState) return;

      const { newState, message } = breachTreaty(gameState, gameState.playerKingdomId, targetKingdomId);
      const logEntry = {
        season: newState.season,
        type: 'diplomacy' as const,
        message,
        kingdomId: gameState.playerKingdomId,
      };

      set({
        gameState: {
          ...newState,
          turnLog: [...newState.turnLog, logEntry],
        },
        actionFeedback: message,
      });
    },
  }))
);
