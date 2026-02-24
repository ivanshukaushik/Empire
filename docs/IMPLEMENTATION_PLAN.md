# Implementation Plan — Ancient Warring States V1

---

## Milestone 0 — Project Scaffold

**Goal:** Vite+React+TypeScript+Tailwind builds and runs.

**Tasks:**
- [ ] `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`
- [ ] `index.html` entry point
- [ ] `src/main.tsx` + `src/App.tsx` placeholder
- [ ] npm install + `npm run dev` works

**Acceptance:** Browser shows placeholder page.

---

## Milestone 1 — Core Data & Types

**Goal:** Province map, kingdom definitions, type system are locked.

**Tasks:**
- [ ] `src/engine/types.ts` — all interfaces, enums
- [ ] `src/engine/rng.ts` — Mulberry32 seeded RNG
- [ ] `src/data/gameData.ts` — 40 provinces with positions, adjacency, base stats; 8 kingdoms with base modifiers

**Acceptance:**
- `gameData.ts` exports are importable with correct TypeScript types
- Provinces have valid bidirectional adjacencies (unit test)

---

## Milestone 2 — Game State & Turn Engine

**Goal:** Full turn executes from initial state with no UI.

**Tasks:**
- [ ] `src/engine/initialState.ts` — `createInitialState(seed, playerKingdomId)`
- [ ] `src/engine/combat.ts` — `resolveBattle(...) → BattleResult`
- [ ] `src/engine/economy.ts` — `economyPhase(state)`
- [ ] `src/engine/diplomacy.ts` — `diplomacyPhase(state)`
- [ ] `src/engine/espionage.ts` — `resolveEspionage(action, state)`
- [ ] `src/engine/fogOfWar.ts` — `computeFog(playerKid, state)`
- [ ] `src/engine/winConditions.ts` — `checkWinConditions(state)`
- [ ] `src/engine/turnEngine.ts` — `executeTurn(state, playerActions)`

**Acceptance:**
- Console script can run 10 turns headlessly
- Combat produces correct winner/loser
- Economy adds resources each season

---

## Milestone 3 — AI Agent

**Goal:** 7 distinct AI kingdoms make plausible decisions.

**Tasks:**
- [ ] `src/ai/aiAgent.ts` — utility scorer, personality modifiers, action selection
- [ ] Each of 8 kingdom personalities configured

**Acceptance:**
- AIs don't stack-overflow or throw errors over 20 turns
- Aggressive AI attacks more than cautious AI (statistical check over 50 turns)
- AIs don't attack provinces they have NAPs with

---

## Milestone 4 — Zustand Store

**Goal:** All game logic accessible via a clean store API.

**Tasks:**
- [ ] `src/store/gameStore.ts`:
  - `newGame(seed, playerKingdomId)`
  - `queueAction(action)`
  - `cancelAction(actionId)`
  - `endTurn()`
  - `saveGame()` / `loadGame()`

**Acceptance:**
- Actions queue correctly
- `endTurn()` advances season and updates all state

---

## Milestone 5 — Core UI

**Goal:** Game is visually playable end-to-end.

**Tasks:**
- [ ] `GameSetup.tsx` — kingdom select screen with archetype cards
- [ ] `MapView.tsx` — SVG map; provinces colored by owner; fog of war opacity; click to select
- [ ] `KingdomInfo.tsx` — resources, armies, current AP
- [ ] `ProvinceInfo.tsx` — detail panel for selected province
- [ ] `ActionBar.tsx` — action buttons, AP display, end season button
- [ ] `SeasonSummary.tsx` — modal with battle results, economic changes, events
- [ ] `GameBoard.tsx` — layout container
- [ ] `App.tsx` — routing between Setup → Board → GameOver

**Acceptance:**
- Full game loop: new game → take 3 actions → end season → see summary → repeat
- Win/lose screens show correctly
- Fog of war dims unknown provinces

---

## Milestone 6 — Polish & README

**Goal:** Usable by someone who has never seen the code.

**Tasks:**
- [ ] `README.md` — How to Run, How to Play
- [ ] Verify save/load works across browser refreshes
- [ ] Seed display so player can share seeds
- [ ] Season/Year display (475 BCE counting down)
- [ ] Ensure no runtime errors across 30-turn game

**Acceptance:**
- Fresh `npm install && npm run dev` works
- A complete game (win or lose) can be played without crashing

---

## Cut from V1 (acknowledged)

- Multiplayer
- Multi-turn sieges
- Alliance combat calls
- Hero units
- Random event deck
- Sound/music
- Animated sequences
- Tech tree
- Campaign map generation
