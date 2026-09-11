import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { GameState, PlayerAction, ActionType, DiploProposal, Minister, MinisterMessage } from '../engine/types';
import { createInitialState } from '../engine/initialState';
import { validateAction, applyPlayerAction, isCampaignAction } from '../engine/turnEngine';
import { createRng } from '../engine/rng';
import { forceAcceptNAP, breachTreaty, deepCopyRelations } from '../engine/diplomacy';
import { simulateTick } from '../engine/simulateTick';
import { resolveSeed } from '../config';

// ============================================================
// GAME STORE
// ============================================================

interface GameStore {
  gameState: GameState | null;
  actionFeedback: string | null;

  newGame:              (seed: number, playerKingdomId: string) => void;
  queueAction:          (action: Omit<PlayerAction, 'id'>) => void;
  /** Advance the simulation by the given number of whole game-days. */
  tick:                 (days: number) => void;
  togglePause:          () => void;
  setSpeed:             (speed: 1 | 2 | 4 | 8) => void;
  dismissSummary:       () => void;
  saveGame:             () => void;
  loadGame:             () => boolean;
  setSelectedProvince:  (provinceId: string | null) => void;
  setActionBeingPlanned:(actionType: ActionType | null) => void;
  setPendingMoveArmy:   (armyId: string | null) => void;
  clearFeedback:        () => void;
  resetGame:            () => void;
  dismissHelp:          () => void;
  acceptProposal:       (proposalId: string) => void;
  declineProposal:      (proposalId: string) => void;
  breachTreatyWith:     (targetKingdomId: string) => void;
  /** Send a message to a minister and get their LLM response. Returns response text or throws. */
  consultMinister:      (ministerId: string, message: string) => Promise<string>;
  /** Raise or lower player suspicion of a minister (clamped 0–100) */
  setMinisterSuspicion: (ministerId: string, delta: number) => void;
}

const SAVE_KEY = 'warring-states-v4-save';

export const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    gameState:      null,
    actionFeedback: null,

    newGame: (seed, playerKingdomId) => {
      const state = createInitialState(seed, playerKingdomId);
      set({ gameState: state, actionFeedback: null });
    },

    // ── Simulation tick ──────────────────────────────────────
    tick: (days) => {
      const { gameState } = get();
      if (!gameState) return;
      if (gameState.isGameOver) return;
      if (gameState.paused) return;
      if (gameState.phase === 'season_summary') return;

      const rng = createRng(
        gameState.seed + Math.floor(gameState.gameTimeDays * 1000)
      );

      let s = gameState;
      const cap = Math.min(days, 60); // safety cap — never jump more than 60 days at once
      for (let i = 0; i < cap; i++) {
        s = simulateTick(s, 1, rng);
        if (s.isGameOver || s.phase === 'season_summary') break;
      }

      set({ gameState: s });
    },

    togglePause: () => {
      set((draft) => {
        if (!draft.gameState) return;
        draft.gameState.paused = !draft.gameState.paused;
      });
    },

    setSpeed: (speed) => {
      set((draft) => {
        if (!draft.gameState) return;
        draft.gameState.speed = speed;
      });
    },

    // ── Player actions ───────────────────────────────────────
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
          pendingPlayerActions: [...(newState.pendingPlayerActions ?? []), action],
          actionBeingPlanned:   null,
          pendingMoveArmyId:    null,
          turnLog: [
            ...newState.turnLog,
            {
              season:    newState.season,
              type:      'player' as const,
              message,
              kingdomId: gameState.playerKingdomId,
            },
          ],
        },
        actionFeedback: message,
      });
    },

    dismissSummary: () => {
      const { gameState } = get();
      if (!gameState) return;
      if (gameState.phase === 'season_summary') {
        set({
          gameState: {
            ...gameState,
            phase:         'player_planning',
            paused:        false,  // resume after dismissing summary
            seasonSummary: null,
          },
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
          JSON.stringify({ version: '4.0', savedAt: new Date().toISOString(), state: gameState })
        );
      } catch (e) {
        console.error('Save failed:', e);
      }
    },

    loadGame: () => {
      try {
        const raw = localStorage.getItem(SAVE_KEY)
          ?? localStorage.getItem('warring-states-v3-save')
          ?? localStorage.getItem('warring-states-v2-save')
          ?? localStorage.getItem('warring-states-v1-save');
        if (!raw) return false;
        const save = JSON.parse(raw);
        if (!save?.state) return false;
        const loaded = save.state as Partial<GameState>;

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

        // Build nextAiPlanAtDays for kingdoms that don't have it
        const loadedNextPlan = (loaded as any).nextAiPlanAtDays ?? {};
        const gameTimeDays = (loaded as any).gameTimeDays ?? 0;
        const allKids = Object.keys(migratedKingdoms);
        const nextAiPlanAtDays: Record<string, number> = {};
        allKids.forEach((kid, i) => {
          nextAiPlanAtDays[kid] = loadedNextPlan[kid] ?? gameTimeDays + i * 2;
        });

        const migrated: GameState = {
          ordersRemaining:      2,
          maxOrders:            2,
          provinceDomesticUsed: {},
          armyCampaignUsed:     {},
          pendingPlayerActions: [],
          rulerEvents:          [],
          toastMessages:        [],
          // Continuous-time defaults for old saves
          gameTimeDays:         0,
          paused:               true,  // load paused so player can orient
          speed:                1,
          activeMovements:      {},
          nextAiPlanAtDays,
          recentBattles:        [],
          lastEconomyAtDays:    0,
          warLedger:            [],
          ...loaded,
          kingdoms:         migratedKingdoms,
          diplomaticInbox:  migratedInbox,
          relations:        migratedRelations,
          // Ensure loaded game resumes in valid phase
          phase: (loaded.phase === 'executing' ? 'player_planning' : loaded.phase) as any,
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
        const result = forceAcceptNAP(newState, kid, proposal.fromKingdomId);
        newState = result.newState;
        message = `Non-Aggression Pact accepted with ${gameState.kingdoms[proposal.fromKingdomId]?.name}.`;
      } else if (proposal.type === 'tribute_demand') {
        const amount = proposal.tributeAmount ?? 10;
        const fromK  = { ...newState.kingdoms[proposal.fromKingdomId] };
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
          kingdoms:  { ...newState.kingdoms, [proposal.fromKingdomId]: fromK, [kid]: playerK },
          relations: newRelations,
        };
        message = `Accepted tribute from ${gameState.kingdoms[proposal.fromKingdomId]?.name}: +${amount} gold.`;
      } else if (proposal.type === 'mutual_target') {
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

      const kid    = gameState.playerKingdomId;
      const fromName = gameState.kingdoms[proposal.fromKingdomId]?.name ?? '';
      const newRelations = deepCopyRelations(gameState.relations);
      if (newRelations[kid]?.[proposal.fromKingdomId]) {
        newRelations[kid][proposal.fromKingdomId].score = Math.max(
          -100,
          (newRelations[kid][proposal.fromKingdomId].score ?? 0) - 5
        );
      }

      const message  = `Declined proposal from ${fromName}.`;
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
      set({
        gameState: {
          ...newState,
          turnLog: [...newState.turnLog, {
            season:    newState.season,
            type:      'diplomacy' as const,
            message,
            kingdomId: gameState.playerKingdomId,
          }],
        },
        actionFeedback: message,
      });
    },

    consultMinister: async (ministerId, message) => {
      const { gameState } = get();
      if (!gameState) throw new Error('No game state');

      const kid = gameState.playerKingdomId;
      const ministers = gameState.ministers[kid] ?? [];
      const minister = ministers.find((m) => m.id === ministerId);
      if (!minister) throw new Error('Minister not found');

      const kingdom = gameState.kingdoms[kid];
      const armies  = Object.values(gameState.armies).filter((a) => a.kingdomId === kid);
      const totalTroops = armies.reduce((s, a) => s + a.size, 0);

      const activeWars = Object.entries(gameState.relations[kid] ?? {})
        .filter(([, r]) => r.atWarWith)
        .map(([k]) => gameState.kingdoms[k]?.name ?? k);

      const threats = Object.entries(gameState.relations[kid] ?? {})
        .filter(([, r]) => r.score < -30)
        .map(([k]) => `${gameState.kingdoms[k]?.name ?? k} (hostile)`);

      const recentEvents = gameState.turnLog.slice(-8).map((e) => e.message);

      const relations: Record<string, number> = {};
      for (const [k, r] of Object.entries(gameState.relations[kid] ?? {})) {
        relations[gameState.kingdoms[k]?.name ?? k] = r.score;
      }

      // Owned provinces
      const ownedProvinces = Object.values(gameState.provinces)
        .filter(p => p.owner === kid)
        .map(p => ({
          id: p.id, name: p.name, terrain: p.terrain,
          isCapital: p.isCapital, owner: p.owner, ownerName: kingdom.name,
          hasFarm: p.hasFarm, hasMarket: p.hasMarket, hasBarracks: p.hasBarracks,
          fortLevel: p.fortLevel, adjacentEnemies: p.adjacentTo.filter(a => gameState.provinces[a]?.owner !== kid),
        }));

      // Border provinces (enemy provinces adjacent to our territory)
      const borderProvinceIds = new Set<string>();
      ownedProvinces.forEach(p => p.adjacentEnemies.forEach(id => borderProvinceIds.add(id)));
      const borderProvinces = [...borderProvinceIds].map(id => {
        const p = gameState.provinces[id];
        const fog = gameState.fogOfWar[id];
        const ownerK = gameState.kingdoms[p.owner];
        return {
          id: p.id, name: p.name, terrain: p.terrain, isCapital: p.isCapital,
          owner: p.owner, ownerName: ownerK?.name ?? p.owner,
          garrison: (fog?.partial || fog?.scouted) ? p.garrison : undefined,
          hasFarm: p.hasFarm, hasMarket: p.hasMarket, hasBarracks: p.hasBarracks,
          fortLevel: p.fortLevel, adjacentEnemies: [],
        };
      });

      // Known enemy provinces from scouting
      const knownEnemyProvinces = Object.values(gameState.provinces)
        .filter(p => p.owner !== kid && (gameState.fogOfWar[p.id]?.scouted || gameState.fogOfWar[p.id]?.partial))
        .map(p => ({
          id: p.id, name: p.name, terrain: p.terrain, isCapital: p.isCapital,
          owner: p.owner, ownerName: gameState.kingdoms[p.owner]?.name ?? p.owner,
          garrison: p.garrison, hasFarm: p.hasFarm, hasMarket: p.hasMarket,
          hasBarracks: p.hasBarracks, fortLevel: p.fortLevel, adjacentEnemies: [],
        }));

      // Army info
      const armyInfos = armies.map(a => ({
        id: a.id, name: a.name, size: a.size, morale: a.morale,
        provinceId: a.provinceId,
        provinceName: gameState.provinces[a.provinceId]?.name ?? a.provinceId,
        isMarching: !!gameState.activeMovements?.[a.id],
      }));

      const allKingdoms: Record<string, string> = {};
      Object.values(gameState.kingdoms).forEach(k => { allKingdoms[k.id] = k.name; });

      const gameContext = {
        kingdomName: kingdom.name,
        kingdomId: kid,
        treasury: kingdom.treasury,
        stability: kingdom.stability,
        manpower: kingdom.manpower,
        season: gameState.season,
        year: gameState.year,
        totalTroops,
        threats,
        recentEvents,
        activeWars,
        relations,
        armies: armyInfos,
        ownedProvinces,
        borderProvinces,
        knownEnemyProvinces,
        allKingdoms,
      };

      const history = minister.conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/minister/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minister: {
            id: minister.id,
            name: minister.name,
            role: minister.role,
            personality: minister.personality,
            age: minister.age,
            competence: minister.competence,
            hidden: minister.hidden,
          },
          gameContext,
          message,
          history,
        }),
      });

      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      const response: string = data.response;
      const actionData = data.action as {
        type: string; provinceId?: string; targetProvinceId?: string;
        armyId?: string; targetKingdomId?: string; buildingType?: string;
        recruitAmount?: number; tributeAmount?: number;
      } | null;

      // Execute the minister's action if one was returned
      if (actionData?.type) {
        const action: Omit<PlayerAction, 'id'> = {
          type: actionData.type as PlayerAction['type'],
          apCost: 1,
          provinceId:       actionData.provinceId,
          targetProvinceId: actionData.targetProvinceId,
          armyId:           actionData.armyId,
          targetKingdomId:  actionData.targetKingdomId,
          buildingType:     actionData.buildingType as PlayerAction['buildingType'],
          recruitAmount:    actionData.recruitAmount,
          tributeAmount:    actionData.tributeAmount,
        };
        // Use queueAction directly on current state
        get().queueAction(action);
      }

      const now = Date.now();
      const userMsg: MinisterMessage  = { role: 'user',      content: message,  timestamp: now };
      const asstMsg: MinisterMessage  = { role: 'assistant', content: response, timestamp: now + 1 };

      const actionLabel = actionData?.type
        ? `${minister.name} is acting: ${actionData.type.replace(/_/g, ' ')}`
        : null;

      set((draft) => {
        if (!draft.gameState) return;
        const ms = draft.gameState.ministers[kid];
        const idx = ms.findIndex((m: Minister) => m.id === ministerId);
        if (idx >= 0) {
          ms[idx].conversationHistory.push(userMsg, asstMsg);
        }
      });

      if (actionLabel) set({ actionFeedback: actionLabel });

      return response;
    },

    setMinisterSuspicion: (ministerId, delta) => {
      set((draft) => {
        if (!draft.gameState) return;
        const kid = draft.gameState.playerKingdomId;
        const ms  = draft.gameState.ministers[kid];
        const m   = ms?.find((x: Minister) => x.id === ministerId);
        if (m) m.suspicion = Math.max(0, Math.min(100, m.suspicion + delta));
      });
    },
  }))
);
