# Ancient Warring States

A real-time grand strategy game set in ancient China's Warring States period (475 BCE).
Control one of 8 rival kingdoms and conquer the Central Plains.

**Play online:** https://ivanshukaushik.github.io/Empire/

---

## Quick Start (local dev)

**Requirements:** Node.js 18+

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Open http://localhost:5173

# Run tests
npm test

# Build for production
npm run build

# Preview production build locally
npm run preview
```

Automatic deployment to GitHub Pages runs on every push to the `claude/ancient-warring-states-game-Ipull` branch via GitHub Actions (see `.github/workflows/deploy.yml`).

---

## Design

See [DESIGN.md](DESIGN.md) for the full game design document covering:
- Core loop and simulation model
- Economy, combat, and diplomacy systems
- Intent control layer (command box)
- Strategic resources and natural constraints

---

## How to Play

### Starting a Game

1. Open the game in your browser.
2. **Choose a kingdom** — each has unique strengths and weaknesses:
   - **Qin** (red) — Legalists. Cheap armies, brutal reform policies. Isolated diplomatically (NAP costs 2 Orders).
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
│  [Kingdom] 👑 Ruler  Season 4 · Spring   [■■□ 2/2 Orders]  [✉ 1]│
├──────────────┬───────────────────────────────┬───────────────┤
│ Kingdom      │                               │ Province      │
│ Panel        │   PARCHMENT MAP               │ Detail Panel  │
│ (left)       │   (center)                    │ (right)       │
│ Overview     │   Rivers · Roads · Mountains  │ Stats, costs  │
│ Military     │   Click provinces to select   │ Army actions  │
│ Diplomacy    │                               │ Levy button   │
├──────────────┴───────────────────────────────┴───────────────┤
│  Recent events ··· last 8 non-economy events scrolling ···   │
├──────────────────────────────────────────────────────────────┤
│  [Attack][Move][Recruit][Levy][Split][Scout]...[End Season ▶]│
└──────────────────────────────────────────────────────────────┘
```

**Click a province** on the map to select it. The right panel shows details and actions.

---

### Orders System

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
| **Request Levy** | 1 | Emergency manpower (4-season cooldown per province) |
| **Split Army** | Free | Split selected army 50/50; no Orders cost |
| **Build** Farm/Market/Barracks/Fort | **Free** | 1 domestic slot per province per season |
| **Recruit** troops | **Free** | 1 domestic slot per province per season |

**Key rules:**
- Each **army** can only take one campaign action (Move or Attack) per season.
- Each **province** has one domestic slot — you can Build OR Recruit there per season, at no Order cost.
- Orders refresh when you **End Season**.

---

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `A` | Attack wizard — press, then click your army's province, then hover enemy to see odds and click |
| `M` | Move wizard — press, then click your army's province, then click friendly adjacent province |
| `X` | Split selected army 50/50 at current province (needs 2000+ troops) |
| `I` | Scout selected enemy province (1 Order) |
| `R` | Recruit 30 troops in selected province (free) |
| `Y` | Accept first pending diplomatic proposal |
| `N` | Decline first pending diplomatic proposal |
| `S` or `Enter` | End Season (resolve AI turns, economy, aging) |
| `F` | Focus map on selected province (pans to it) |
| `Escape` | Cancel current action being planned |

---

### Rulers

Every kingdom is led by a **ruler** with distinct traits and stats:

- **Military** (1–10) — Adds up to +10% combat power for your armies
- **Diplomacy** (1–10) — Boosts NAP acceptance probability and may improve proposal outcomes
- **Administration** (1–10) — Adds up to +10% to all province income

**Traits** (examples): `aggressive`, `cautious`, `honorable`, `paranoid`, `mercantile`, `reformist`, `ambitious`, `cunning`

**Ambitions**: Rulers have a driving ambition (`unify`, `survive`, `dominate_trade`, `revenge`, `reform`) that shapes AI behavior.

**Aging & Succession**:
- Rulers age each **year** (every 4 seasons, at Winter).
- Death chance rises sharply after age 65: 4%/year at 55–64, 12%/year at 65–74, 22%/year at 75–79, 40%/year at 80+.
- When a ruler dies, a **successor** is generated — possibly with different traits and ambitions, which may shift AI strategy.
- Succession events appear in the **Season Summary** under the 👑 Succession section.

The ruler's name and a crown icon appear in the top bar. Hover for age, traits, and stats. Full ruler card is in the **Kingdom Panel → Overview tab**.

---

### Diplomatic Inbox

AI kingdoms may send diplomatic proposals each season. A purple **✉** badge on the top bar signals pending proposals. Open the **Diplomacy tab** in the Kingdom panel to review them.

Proposal types:
- **NAP Offer** — Mutual non-aggression for 8 seasons. Accepting improves relations.
- **Tribute Demand** — Pay gold for peace. Accepting transfers gold and improves relations.
- **Mutual Target** — Agree on a shared enemy. Improves relations with the proposer.

**Keyboard shortcuts:** Press `Y` to accept the first proposal, `N` to decline it.

Proposals **expire** after 4 seasons. Declining a proposal costs −5 relations.

All 8 kingdoms generate proposals — proposals are shuffled each season so every kingdom can reach your inbox.

---

### Treaty Breach

You can break any active **NAP** or **Tribute** treaty from the **Diplomacy tab** in the Kingdom panel.

**Consequences of breaching:**
- Relations with target: **−50**
- Your kingdom's reputation (relations with all others): **−20**
- Your stability: **−8**
- Coalition pressure among all kingdoms: **−8** (makes everyone more hostile to you)

Breaking treaties is a drastic option — use it only when survival demands it or when the strategic gain is overwhelming. A kingdom with multiple breaches will find diplomacy progressively harder.

---

### Army Replenishment & Levy

**Auto-replenishment** (passive, each season):
- Armies resting in **owned territory** automatically recover troops from your manpower pool.
- Base rate: 80 troops/season. Doubled to 160 in provinces with **Barracks**. Extra +40 in a **Capital**. Capped at 500/season.
- Draws from your manpower pool (10 troops = 1 manpower point consumed).

**Request Levy** (active action — 1 Order):
- Emergency call-up: +20 manpower added to your pool instantly.
- Costs **5 gold**, **−3 stability**, +8 unrest in the province.
- **4-season cooldown** per province. Use sparingly; chaining levies destabilizes your realm.
- Available from the Action Bar or from the Province Detail panel on any owned province.

**Army Splitting** (free):
- Press `X` (or use the ✂ Split button in the Action Bar) to split the selected army 50/50.
- Requires 2000+ troops. Useful for guarding two fronts simultaneously without a second recruit cycle.

---

### Combat

When you attack:
- Your army's strength × morale × terrain modifiers vs defender's garrison × fort level × terrain
- Both sides roll a ±15% random modifier
- **Winner** takes fewer casualties; loser retreats
- **Attacker wins**: province captured, unrest spikes +20 there
- **Defender wins**: attacker retreats with heavy losses
- Ruler **Military** stat provides a bonus to attack power.

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
- Provinces produce **gold**, **food**, and **manpower** (modified by buildings, unrest, and ruler Administration stat)
- Armies consume **upkeep** (gold + food)
- If treasury goes negative: **stability drops −5**
- If food runs out: armies take **attrition and morale loss**

Buildings in a province (free domestic action):
- **Farm** (+2 food/season)
- **Market** (+2 income/season)
- **Barracks** (+1 manpower/season, enables recruiting, boosts replenishment rate)
- **Fort** (+20% defense per level, max 3)

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
- You control ≥60% of all provinces (24+), OR
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
- **Check your inbox** — AI proposals can offer advantageous peace terms. Use Y/N for quick decisions.
- **Replenish before attacking** — armies recover each season in owned territory; use the free season to build up.
- **Levy sparingly** — emergency levies destabilize provinces. Reserve for genuine crises.
- **Split armies for two-front coverage** — one large army split into two can hold adjacent borders.
- **Watch ruler age** — old rulers die. Plan for succession: the new ruler may have a radically different personality.

---

## Architecture Notes

- **Pure client-side** — no server, no external APIs. Runs offline.
- **Deterministic** — seed is derived from wall-clock time at game start (configurable via `src/config.ts`).
  - `SEED_MODE: 'time'` (default) — unique game each run.
  - `SEED_MODE: 'fixed'` — use `FIXED_SEED` for reproducible testing.
  - Dev: append `?seed=<number>` to the URL to override (requires `DEV_QUERY_SEED_OVERRIDE = true`).
- **Save/Load** — auto-save available from the left panel. Stored in localStorage (key: `warring-states-v3-save`). Migrates v1/v2 saves automatically.
- Engine lives in `src/engine/` (pure TypeScript, testable independently).
- Ruler system in `src/engine/ruler.ts` — generation, aging, death, succession.
- AI lives in `src/ai/aiAgent.ts` (utility-based planner, one file).
- Map data in `src/data/gameData.ts` (province stats), `src/data/mapFeatures.ts` (rivers, roads, terrain decorations).

---

## Changelog

### V2.0 — Rulers, Breach Mechanics, Levy & Army Splitting

- **Ruler system**: every kingdom has a named ruler with Military/Diplomacy/Administration stats (1–10) and traits. Stats provide direct bonuses to combat, income, and diplomacy success.
- **Ruler aging and succession**: rulers age annually (every 4 seasons). Death probability rises sharply after age 65. Succession events appear in the Season Summary.
- **Treaty breach mechanics**: any active NAP or tribute can be breached from the Diplomacy tab. Consequences: −50 relations with target, −20 reputation with all others, −8 stability, −8 coalition pressure.
- **Diplomacy inbox bug fixed**: proposals now shuffle kingdom iteration order so all 8 kingdoms can appear; proposal cap raised from 3 to 5; proposals expire after 4 seasons.
- **Force-accept fix**: clicking Accept in the inbox now guarantees the treaty is signed (no more silent AI re-roll blocking the player's Accept decision).
- **Auto-replenishment**: armies resting in owned territory auto-recover from the manpower pool each season.
- **Request Levy**: emergency manpower action (1 Order, 4-season cooldown per province, costs gold and stability).
- **Army splitting**: press `X` or use the ✂ Split button to split 50/50 (2000+ troops required).
- **Keyboard overhaul**: `S` = End Season, `I` = Scout, `X` = Split, `Y`/`N` = Accept/Decline inbox, `F` = Focus map.
- **Toast notifications**: action feedback appears as non-blocking toasts above the map.
- **Inbox expiry**: pending proposals show their remaining seasons; expired proposals are cleaned up automatically.
- **Save format v3**: migrated from v1/v2 automatically on load.

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
- Keyboard shortcuts

### V1.0 — Initial Release
- 8 kingdoms, 40 provinces, full turn-based game loop
- Fog of war, terrain, buildings, reforms, espionage, diplomacy
- AI agents, seasonal economy, win/lose conditions
