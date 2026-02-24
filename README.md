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
3. Optionally change the **seed** (affects random outcomes).
4. Click **Begin Campaign**.

---

### Main Interface

```
┌─────────────┬──────────────────────────┬────────────────┐
│ Kingdom     │                          │ Province       │
│ Panel       │    SVG MAP               │ Detail Panel   │
│ (left)      │    (center)              │ (right)        │
│ Resources   │    Click provinces       │ Stats, actions │
│ Armies      │    to select             │ on selection   │
│ Stability   │                          │                │
├─────────────┴──────────────────────────┴────────────────┤
│              ACTION BAR  [ AP ●●● ]  [End Season ▶]     │
└─────────────────────────────────────────────────────────┘
```

**Click a province** on the map to select it. The right panel shows details and context actions.

---

### Each Season (Turn)

You have **3 Action Points (AP)** per season. Spend them on:

| Action | AP | How |
|--------|----|-----|
| **Move** army | 1 | Click "⇒ Move" → click your province with army → click target |
| **Attack** province | 1 | Click "⚔ Attack" → click your army's province → click enemy target |
| **Recruit** troops | 1 | Select your province → use Province Panel or Action Bar |
| **Build** Farm/Market/Barracks/Fort | 1 | Select your province → click build button |
| **Scout** enemy province | 1 | Select enemy province → "🔍 Scout" |
| **Sabotage** garrison | 2 | Select enemy province → "🗡 Sabotage" |
| **Incite Unrest** | 2 | Select enemy province → "😠 Incite Unrest" |
| **Propose NAP** | 1 (Qin: 2) | Click "✋ NAP" in Action Bar |
| **Offer Tribute** | 1 | Action Bar → NAP dropdown → Tribute section |
| **Enact Reform** | 1 | Click "📜 Reform" in Action Bar |

When done, click **End Season ▶**. The AI kingdoms take their turns, combat resolves, and economy updates. A **Season Summary** shows what happened.

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

Buildings in a province:
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

Only 1 active reform at a time. Costs 1 AP to enact.

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
- **Recruit in barracks provinces** — capitals also work.
- **Watch your food** — starving armies lose morale fast.
- **Forts on borders** — even Fort Level 1 (+20% defense) significantly helps.
- **Stability matters** — bankrupt kingdoms spiral; keep treasury positive.

---

## Architecture Notes

- **Pure client-side** — no server, no external APIs. Runs offline.
- **Deterministic** — same seed + same actions = same game. Share seeds with friends.
- **Save/Load** — auto-save available from the left panel. Stored in localStorage.
- Engine lives in `src/engine/` (pure TypeScript, testable independently).
- AI lives in `src/ai/aiAgent.ts` (utility-based planner, one file).
- Map data in `src/data/gameData.ts` (easy to tune province stats).

See `docs/GDD.md` for the full Game Design Document and `docs/TDD.md` for the Technical Design Document.

---

## V1 Scope

This is V1. Features intentionally cut:
- Multiplayer (architecture supports it)
- Multi-turn sieges
- Defensive alliances
- Hero units / generals
- Random event deck
- Sound / music
- Animated battle sequences
- Technology trees
