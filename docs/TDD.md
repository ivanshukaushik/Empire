# Technical Design Document — Ancient Warring States V1

---

## 1. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + TypeScript | Fast iteration, rich ecosystem |
| Build Tool | Vite 5 | Sub-second HMR, simple config |
| State Management | Zustand + Immer | Minimal boilerplate, mutable draft patterns |
| Styling | Tailwind CSS | Utility-first, no custom CSS files needed |
| Map Rendering | SVG (inline React) | No canvas lib needed; interactive, scalable |
| Persistence | localStorage JSON | Zero backend, offline-first |
| Testing | Vitest | Co-located with Vite, fast |
| RNG | Seeded Mulberry32 | Deterministic, reproducible |

**No backend. No external APIs. Runs entirely in browser.**

---

## 2. Project Layout

```
/
├── docs/
│   ├── GDD.md
│   ├── TDD.md
│   └── IMPLEMENTATION_PLAN.md
├── src/
│   ├── data/
│   │   └── gameData.ts         # Province defs, Kingdom defs, adjacency
│   ├── engine/
│   │   ├── types.ts            # All TypeScript interfaces & enums
│   │   ├── rng.ts              # Seeded RNG (Mulberry32)
│   │   ├── initialState.ts     # Factory: GameState from seed + player choice
│   │   ├── combat.ts           # Battle resolution
│   │   ├── economy.ts          # Economic phase
│   │   ├── diplomacy.ts        # Diplomacy phase & treaty logic
│   │   ├── espionage.ts        # Espionage resolution
│   │   ├── fogOfWar.ts         # Visibility computation
│   │   ├── winConditions.ts    # Win/loss checks
│   │   └── turnEngine.ts       # Orchestrates all phases
│   ├── ai/
│   │   └── aiAgent.ts          # Utility-based AI for all 7 kingdoms
│   ├── store/
│   │   └── gameStore.ts        # Zustand store + player action queue
│   └── components/
│       ├── App.tsx
│       ├── GameSetup.tsx
│       ├── GameBoard.tsx
│       ├── MapView.tsx
│       ├── KingdomInfo.tsx
│       ├── ProvinceInfo.tsx
│       ├── ActionBar.tsx
│       └── SeasonSummary.tsx
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── README.md
```

---

## 3. Data Models

### 3.1 Province

```typescript
interface Province {
  id: string;               // e.g. "qin2"
  name: string;             // "Xianyang"
  terrain: TerrainType;     // 'plains' | 'hills' | 'mountains' | 'riverlands'
  owner: string;            // kingdom id
  isCapital: boolean;
  adjacentTo: string[];     // array of province ids
  garrison: number;         // troops garrisoned (not in an army)
  unrest: number;           // 0-100
  baseFood: number;
  baseIncome: number;
  baseManpower: number;
  hasIron: boolean;
  hasSalt: boolean;
  fortLevel: number;        // 0-3
  hasFarm: boolean;
  hasMarket: boolean;
  hasBarracks: boolean;
  hasSpyNetwork: boolean;
  x: number; y: number;     // SVG coordinates
}
```

### 3.2 Kingdom

```typescript
interface Kingdom {
  id: string;
  name: string;
  color: string;            // CSS hex
  capital: string;          // province id
  treasury: number;
  food: number;
  manpower: number;
  stability: number;        // 0-100
  reputation: number;       // -100 to +100
  // Trait modifiers (multipliers applied at runtime)
  incomeModifier: number;
  foodModifier: number;
  armyCostModifier: number;
  combatModifier: number;
  mobilityBonus: number;    // 0 or 1 extra movement range
  espionageModifier: number;
  diplomacyModifier: number;
  recruitCostModifier: number;
  activeReform: ReformType | null;
  isEliminated: boolean;
  isPlayer: boolean;
  personality?: AIPersonality;
  bonusDescription: string;
  weaknessDescription: string;
  archetype: string;
}
```

### 3.3 Army

```typescript
interface Army {
  id: string;
  kingdomId: string;
  provinceId: string;
  size: number;
  morale: number;   // 0-100
  name: string;
}
```

### 3.4 Relations

```typescript
// Nested map: relations[kingdomA][kingdomB]
interface RelationData {
  score: number;        // -100 to +100
  treaty: Treaty | null;
  atWarWith: boolean;
  events: string[];
}
interface Treaty {
  type: 'nap' | 'tribute';
  expiresAt: number;    // season number; -1 = permanent
  tributeAmount?: number;
  parties: [string, string];
}
```

### 3.5 GameState (top-level)

```typescript
interface GameState {
  seed: number;
  season: number;
  year: number;
  phase: 'player_planning' | 'executing' | 'season_summary' | 'game_over';
  provinces: Record<string, Province>;
  kingdoms: Record<string, Kingdom>;
  armies: Record<string, Army>;
  relations: Record<string, Record<string, RelationData>>;
  playerKingdomId: string;
  actionPointsRemaining: number;
  maxActionPoints: number;
  pendingPlayerActions: PlayerAction[];
  fogOfWar: Record<string, FogOfWarEntry>;
  turnLog: LogEntry[];
  seasonSummary: SeasonSummary | null;
  isGameOver: boolean;
  winner: string | null;
  loseReason: string | null;
  selectedProvinceId: string | null;
  actionBeingPlanned: ActionType | null;
}
```

---

## 4. Turn Engine Flow

```
executeTurn(state: GameState): GameState
│
├── Phase 1: Apply pending player actions (already queued)
│   └── validate each action, apply effects (move, recruit, build, etc.)
│
├── Phase 2: AI planning
│   └── For each non-eliminated AI kingdom:
│       └── aiPlanTurn(kingdom, state) → list of AIActions
│       └── Apply AI actions
│
├── Phase 3: Resolve movement & combat
│   └── Collect all pending moves
│   └── resolveMovement(moves, state)
│   └── For each contested province: resolveBattle(attack, state)
│
├── Phase 4: Economy
│   └── economyPhase(state)
│   └── For each province owner: add food, gold, manpower
│   └── For each army: deduct upkeep
│   └── Apply unrest decay / spikes
│   └── Stability adjustments
│
├── Phase 5: Diplomacy
│   └── diplomacyPhase(state)
│   └── Tick treaty durations, expire treaties
│   └── Apply tribute payments
│   └── Update reputation
│
├── Phase 6: Win/loss check
│   └── checkWinConditions(state)
│
└── Build seasonSummary, advance season counter
    └── Reset actionPointsRemaining = maxActionPoints
    └── Clear pendingPlayerActions
```

All phases use **pure functions** — they take the state (or a draft via Immer) and return a modified copy. The Zustand store calls `executeTurn` and replaces the state.

---

## 5. AI Architecture

### Philosophy

The AI uses a **utility-based planner**. For each AP:
1. Generate all legal actions for this kingdom.
2. Score each action with a utility function.
3. Pick the highest-scoring action, apply it, decrement AP.
4. Repeat until AP = 0 or no beneficial actions.

### Utility Function

```typescript
function scoreAction(action, kingdom, state): number {
  let score = baseScore[action.type];
  score *= personalityMultiplier(kingdom.personality, action.type);
  score *= situationalModifier(action, kingdom, state);
  return score;
}
```

Situational modifiers:
- **Attack**: boosted if target is weak + attacker has army advantage; reduced if we have active treaties
- **Recruit**: boosted if threatened (enemy armies near borders)
- **Build (farm/market)**: boosted if economy is low, no active threat
- **Diplomacy**: boosted if outnumbered; reduced if aggressive personality
- **Scout**: boosted if paranoid; always cheap (0 AP for Yan)

### Personality Effects

| Trait | Effect on Utility |
|-------|------------------|
| aggressive | Attack ×1.5, Diplomacy ×0.5 |
| cautious | Attack ×0.5, Recruit ×1.4, Build ×1.3 |
| opportunistic | Attack ×1.3 when target <60% strength |
| honorable | Never breaks NAP (−1000 penalty for betrayal) |
| paranoid | Scout ×2.0, defensive recruit ×1.5 |
| mercantile | Build economy ×1.8, tribute accept ×2.0 |

### Fog of War in AI

- AI has a `scoutedProvinces` map: `{ provinceId → { season, garrison, owner } }`.
- If a province was scouted > 4 seasons ago, AI uses last-known data with uncertainty penalty.
- For adjacent provinces: AI always knows owner + rough garrison tier.
- AI will scout if `attackUtility > 50` but target intelligence is stale.

---

## 6. Fog of War Computation

Computed per-player per render from game state:

```typescript
function computeFog(playerKingdomId, provinces, armies, kingdoms): FogOfWarMap {
  for each province p:
    if p.owner === playerKingdomId:
      fog[p.id] = { visible: true, partial: false }
    else if any adjacent province is owned by player:
      fog[p.id] = { partial: true, visible: false }
    else if recently scouted:
      fog[p.id] = { scouted: true, scoutedAt: season }
    else:
      fog[p.id] = { unknown: true }
}
```

---

## 7. Save / Load

Format: JSON stored in `localStorage['warring-states-save']`.

```json
{
  "version": "1.0",
  "savedAt": "ISO timestamp",
  "state": { ...GameState }
}
```

On load: deserialize, re-attach seeded RNG from seed + season number.

---

## 8. Seeded RNG

Implementation: **Mulberry32** algorithm.

```typescript
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

The RNG is advanced each time a random value is needed during `executeTurn`. Since execution is deterministic given the same seed and sequence of player actions, replays are possible.

---

## 9. Key Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `gameData.ts` | Static province definitions, kingdom base stats, adjacency graph |
| `initialState.ts` | Build a fresh GameState from seed + playerKingdomId |
| `combat.ts` | `resolveBattle(attack, state) → BattleResult` |
| `economy.ts` | `economyPhase(state) → state` — resource production, upkeep, unrest |
| `diplomacy.ts` | `diplomacyPhase(state) → state` — treaty ticking, reputation |
| `espionage.ts` | `resolveEspionage(action, state) → state` |
| `fogOfWar.ts` | `computeFog(playerKid, state) → FogOfWarMap` |
| `winConditions.ts` | `checkWin(state) → { winner, reason } \| null` |
| `turnEngine.ts` | Orchestrates all phases; calls above modules |
| `aiAgent.ts` | `aiPlanTurn(kingdom, state) → PlayerAction[]` |
| `gameStore.ts` | Zustand store; exposes `queueAction`, `endTurn`, `newGame`, `loadGame` |

---

## 10. Performance Considerations

- Province count: 40. Kingdom count: 8. Army count: ≤ 24. All collections are small; no optimisation needed.
- AI computation: 7 kingdoms × 3 AP × ~20 scored actions = ~420 utility calculations per turn. Negligible.
- SVG rendering: 40 nodes + ~80 edges + labels. Fine with React.
- No web workers needed in V1.
