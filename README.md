# Ancient Warring States

A turn-based strategy game set in ancient China's Warring States period (475 BCE).
Control one of 8 rival kingdoms and conquer the Central Plains.

---

## How to Run

**Requirements:** Node.js 18+

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Then open http://localhost:5173 in your browser

# Build for production
npm run build
npm run preview
```

---

## How to Play

### Starting a Game

1. Open the game in your browser.
2. **Choose a kingdom** — each has unique strengths and weaknesses:
   - **Qin** (red) — Legalists. Cheap armies, brutal reform policies. Isolated diplomatically.
   - **Zhao** (blue) — Cavalry Lords. Fast armies that can attack 2 provinces away.
   - **Yan** (purple) — Spymasters. Half-price espionage; weaker in direct combat.
   - **Qi** (amber) — Merchants. +30% income; can recruit anywhere.
   - **Wei** (green) — Crossbowmen. +20% combat on plains; central position, many neighbors.
   - **Han** (cyan) — Artisans. Cheap forts and buildings; small manpower base.
   - **Chu** (brown) — River Lords. +30% food, strong in the south.
   - **Zhongshan** (gray) — Survivors. High stability, fast unrest recovery; small starting territory.
3. Click **Begin Campaign**. (Seed is resolved automatically — see below.)

---

### Main Interface

```
┌──────────────────────────────────────────────────────────────┐
│  [Kingdom]  Season 4 · Spring   [■■□ 2/2 Orders]  [✉ 1]  [▶]│
├──────────────┬───────────────────────────────┬───────────────┤
│ Kingdom      │                               │ Province      │
│ Panel        │   PARCHMENT MAP               │ Detail Panel  │
│ (left)       │   (center)                    │ (right)       │
│ Overview     │   Rivers · Roads · Mountains  │ Stats, costs  │
│ Military     │   Click provinces to select   │ Army actions  │
│ Diplomacy    │                               │               │
├──────────────┴───────────────────────────────┴───────────────┤
│  Recent events ··· last 8 non-economy events scrolling ···   │
├──────────────────────────────────────────────────────────────┤
│  ACTION BAR  [Move] [Attack] [Scout] [Sabotage] ... [End ▶]  │
└──────────────────────────────────────────────────────────────┘
```

**Click a province** on the map to select it. The right panel shows details and actions.

---

### Orders System (V1.2)

Each season you have **2 Orders**. Orders power *campaign* actions — military operations and statecraft that require your personal attention.

| Action | Orders | Notes |
|--------|--------|-------|
| **Move** army | 1 | Army may only act once per season |
| **Attack** province | 1 | Army may only act once per season |
| **Scout** enemy province | 1 | Espionage |
| **Sabotage** garrison | 1 | Espionage |
| **Incite Unrest** | 1 | Espionage |
| **Propose NAP** | 1 (Qin: 2) | Diplomacy |
| **Offer Tribute** | 1 | Diplomacy |
| **Enact Reform** | 1 | Statecraft |
| **Build** Farm/Market/Barracks/Fort | **Free** | 1 domestic slot per province per season |
| **Recruit** troops | **Free** | 1 domestic slot per province per season |

**Key rules:**
- Each **army** can only take one campaign action (Move or Attack) per season. Acted armies appear grayed-out on the map.
- Each **province** has one domestic slot — you can Build OR Recruit there per season, at no Order cost.
- Orders refresh when you **End Season**.

---

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `M` | Move wizard (requires army selected, Orders > 0) |
| `A` | Attack wizard (requires army selected, Orders > 0) |
| `R` | Recruit in selected province (free) |
| `E` | End Season |
| `K` | Toggle Kingdom Info panel |
| `Escape` | Cancel current wizard step |
| `?` | Toggle help overlay |

---

### Diplomatic Inbox

AI kingdoms may send you diplomatic proposals each season. A purple **✉** badge on the top bar signals unread proposals. Open the **Diplomacy tab** in the Kingdom panel to review them.

Proposal types:
- **NAP Offer** — Mutual non-aggression for 8 seasons. Accepting improves relations.
- **Tribute Demand** — Pay gold for peace. Accepting transfers gold and improves relations.
- **Mutual Target** — Agree on a shared enemy. Improves relations with the proposer.

Declining a proposal costs −5 relations.

---

### Combat

When you attack:
- Your army's strength × morale × terrain modifiers vs defender's garrison × fort level × terrain
- Both sides roll a ±15% random modifier
- **Winner** takes fewer casualties; loser retreats
- **Attacker wins**: province captured, unrest spikes +20 there
- **Defender wins**: attacker retreats with heavy losses

**Terrain matters:** Mountains give defenders +30% strength; Hills +15%. Plains favor cavalry (Zhao +15%).

---

### Fog of War

| Province | What you see |
|----------|-------------|
| **Your own** | Full details |
| **Adjacent** | Owner, terrain, garrison tier (Small/Medium/Large) |
| **Scouted** (within 3 seasons) | Full details |
| **Unknown** | "???" — no information |

---

### Economy

Each season:
- Provinces produce **gold**, **food**, and **manpower** (modified by buildings and unrest)
- Armies consume **upkeep** (gold + food)
- If treasury goes negative: **stability drops −5**
- If food runs out: armies take **attrition and morale loss**

Buildings in a province (free domestic action):
- **Farm** (+2 food/season)
- **Market** (+2 income/season)
- **Barracks** (+1 manpower/season, cheaper recruiting)
- **Fort** (+20% defense per level, max 3)

---

### Diplomacy

- Each kingdom-pair has a **relations score** (−100 to +100)
- **Non-Aggression Pact**: neither side can attack; lasts 8 seasons
- **Tribute**: pay gold each season for improved relations and guaranteed peace
- Breaking a NAP causes a large reputation penalty

---

### Reforms

Only 1 active reform at a time. Costs 1 Order to enact.

| Reform | Bonus | Penalty |
|--------|-------|---------|
| Iron Fist | Combat +20% | Economy −10% |
| Commerce | Income +20% | Upkeep +10% |
| Conscription | Manpower rate +30% | Stability −10 (once) |
| Propaganda | +3 stability/season | −5 gold/season |
| Fortify Borders | Fort cost −30% | Recruit −15% |

---

### Win / Lose

**Win if:**
- You control ≥60% of all 40 provinces (24+), OR
- You capture 3 enemy capitals

**Lose if:**
- Your capital is captured, OR
- Your stability reaches 0, OR
- Another kingdom reaches the win condition first

---

### Tips

- **Expand early** — provinces compound income and manpower.
- **Scout before attacking** — know the garrison before committing armies.
- **NAPs buy time** — use diplomacy to avoid two-front wars.
- **Build is free** — use your domestic slot every season; infrastructure compounds fast.
- **Watch your food** — starving armies lose morale fast.
- **Forts on borders** — even Fort Level 1 (+20% defense) significantly helps.
- **Stability matters** — bankrupt kingdoms spiral; keep treasury positive.
- **Check your inbox** — AI proposals can offer advantageous peace terms.
- **Acted armies** appear grayed on the map — plan your Order spend before ending the season.

---

## Architecture Notes

- **Pure client-side** — no server, no external APIs. Runs offline.
- **Deterministic** — seed is derived from wall-clock time at game start (configurable via `src/config.ts`).
  - `SEED_MODE: 'time'` (default) — unique game each run.
  - `SEED_MODE: 'fixed'` — use `FIXED_SEED` for reproducible testing.
  - Dev: append `?seed=<number>` to the URL to override (requires `DEV_QUERY_SEED_OVERRIDE = true`).
- **Save/Load** — auto-save available from the left panel. Stored in localStorage (key: `warring-states-v2-save`).
- Engine lives in `src/engine/` (pure TypeScript, testable independently).
- AI lives in `src/ai/aiAgent.ts` (utility-based planner, one file).
- Map data in `src/data/gameData.ts` (province stats), `src/data/mapFeatures.ts` (rivers, roads, terrain decorations).

See `docs/GDD.md` for the full Game Design Document and `docs/TDD.md` for the Technical Design Document.

---

## Changelog

### V1.2 — Orders, Diplomacy & Parchment Map
- **Orders system**: replaced 3 AP/turn with 2 Orders/turn for campaign actions; Build/Recruit are free domestic actions (1 slot per province per season)
- **Per-army campaign limit**: each army may Move or Attack once per season; acted armies gray out on the map
- **Diplomatic inbox**: AI kingdoms send NAP offers, tribute demands, and mutual-target proposals; surfaced in the Diplomacy tab with Accept/Decline
- **Recent events feed**: last 8 non-economy log entries scroll below the map during planning
- **Parchment map**: CSS warm-tan gradient background + vignette, SVG grain/shadow filters, province labels in serif font
- **Map features**: Yellow River, Wei River, Han River, Yangtze, Fen River (smooth Bezier curves); road network (dotted lines); mountain and forest decorations
- **Seed moved to config**: `src/config.ts` controls seed mode; seed input removed from game setup UI

### V1.1 — UX Polish
- Attack/Move wizard (step-by-step guided flow)
- Tooltips on all action buttons explaining requirements
- Kingdom info panel restructured (Overview / Military / Diplomacy tabs)
- Season summary improvements
- Keyboard shortcuts (M, A, R, E, K, ?, Escape)

### V1.0 — Initial Release
- 8 kingdoms, 40 provinces, full turn-based game loop
- Fog of war, terrain, buildings, reforms, espionage, diplomacy
- AI agents, seasonal economy, win/lose conditions
