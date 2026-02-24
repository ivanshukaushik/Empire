# Game Design Document — Ancient Warring States V1

**Version:** 1.0
**Tech Stack:** React + TypeScript (Vite), Zustand, Tailwind CSS
**Target Play Time:** 60–120 minutes per campaign

---

## Assumptions Made

- Map is a fixed, hand-crafted adjacency graph (no procedural generation).
- V1 is single-player only; AI controls all 7 other kingdoms.
- Multiplayer stub: architecture allows swapping AI agents for human action queues.
- Siege is a one-turn assault with elevated losses (no multi-turn siege clock).
- Alliances are defensive-only in V1; offensive alliance calls are cut.
- Iron and Salt are minor strategic bonuses, not a full resource chain.
- Year starts at 475 BCE (Warring States period opening); each season = 3 in-game months.

---

## 1. Core Loop

```
New Game → Choose Kingdom → [Planning Phase → End Season → AI Resolves → Execution →
Economy → Diplomacy → Season Summary] → Repeat → Win or Lose
```

Each **Season** = one turn.
4 Seasons = 1 Year (Spring / Summer / Autumn / Winter).
Winter imposes food penalties and movement malus.

---

## 2. The World

### 2.1 Map

40 provinces arranged in a hand-crafted adjacency graph approximating the Central Plains of ancient China. Rendered as SVG nodes connected by edges.

### 2.2 Terrain Types

| Terrain    | Attack Mod | Defense Mod | Move Cost | Notes |
|------------|-----------|-------------|-----------|-------|
| Plains     | 1.00      | 1.00        | 1         | Default |
| Hills      | 0.90      | 1.15        | 1         | Favours defender |
| Mountains  | 0.75      | 1.30        | 2         | Chokepoints |
| Riverlands | 0.85      | 1.10        | 1         | Food bonus +1 |

### 2.3 Province Properties

| Property | Description |
|----------|-------------|
| `owner` | Controlling kingdom ID |
| `terrain` | Terrain type |
| `garrison` | Troops stationed here (not in an army group) |
| `unrest` | 0–100; high unrest lowers income and can trigger revolt |
| `baseFood` | Food produced per season |
| `baseIncome` | Gold produced per season |
| `baseManpower` | Manpower replenishment per season |
| `hasIron` | Iron province: army recruitment costs −15% |
| `hasSalt` | Salt province: unrest recovery +5/season |
| `fortLevel` | 0–3; multiplies defender strength by 1 + 0.2×level |
| `hasFarm` | Built improvement: food +2 |
| `hasMarket` | Built improvement: income +2 |
| `hasBarracks` | Built improvement: manpower rate +1, recruit cost −10% |

---

## 3. Kingdoms

### 3.1 Resources

| Resource | Description |
|----------|-------------|
| Treasury | Gold. Army upkeep, buildings, diplomacy. Negative → stability drops. |
| Food | Feeds armies. Negative → morale drops, attrition. |
| Manpower | Pool that armies draw from when recruiting. |
| Stability | 0–100. Below 20 → internal crises. Hits 0 → you lose. |
| Reputation | −100 to +100. Affects AI willingness to sign treaties. |

### 3.2 Army Groups

- Each kingdom starts with 1–2 named army groups.
- Each army has: `size` (troops), `morale` (0–100), `provinceId` (location).
- Armies can be in friendly OR captured provinces.
- Upkeep: 0.02 gold per 100 troops per season. 0.04 food per 100 troops.

---

## 4. Turn Structure

### Phase 1 — Player Planning
Player has **3 AP** per season. Spends them on actions below.

### Phase 2 — AI Planning
All 7 AI kingdoms plan their actions (utility-based, fog-of-war limited).

### Phase 3 — Execution
1. **Movement** resolves (armies move to target).
2. **Combat** resolves (attackers fight defenders; simultaneous resolution by strength).
3. **Espionage** resolves.

### Phase 4 — Economy
- Provinces produce gold, food, manpower (modified by buildings, unrest, season).
- Armies pay upkeep.
- Unrest: decays −3/season; spikes +20 on capture, +10 if army present enemy territory.
- Stability changes: +2/season base; −5 if treasury < 0; −10 if capital is attacked.

### Phase 5 — Diplomacy
- Treaties tick down (NAPs expire after N seasons).
- Reputation adjusts for betrayals, fulfilled treaties.

### Phase 6 — Season Summary
Full narrative log of what happened.

---

## 5. Player Actions

| Action | AP Cost | Description |
|--------|---------|-------------|
| **Build** | 1 | Construct a building in an owned province. Costs gold + food. |
| **Recruit** | 1 | Convert manpower + gold into army strength at a province with barracks (or capital). |
| **Move** | 1 | Move an army to an adjacent owned/neutral province. |
| **Attack** | 1 | Move army into enemy province; triggers combat. |
| **Diplomacy — NAP** | 1 | Propose non-aggression pact to a kingdom. They accept based on relations + personality. |
| **Diplomacy — Tribute** | 1 | Offer tribute to buy peace or improve relations. |
| **Scout** | 1 | Reveal full details of a target province for 3 seasons. |
| **Sabotage** | 2 | Reduce garrison of enemy province by 15–30%. May be detected. |
| **Incite Unrest** | 2 | Raise target province unrest +20. May be detected. |
| **Reform** | 1 | Activate one kingdom-wide policy (replaces previous). |

Building costs:

| Building | Gold | Food | Effect |
|----------|------|------|--------|
| Farm | 20 | 0 | +2 food/season |
| Market | 25 | 0 | +2 income/season |
| Barracks | 30 | 10 | +1 manpower/season, −10% recruit cost |
| Fort (+1) | 40 | 20 | fortLevel +1 (max 3) |

Recruit formula:
`troops = manpower_spent × 10 × barracks_bonus × kingdom_modifier`
Cost: `manpower_spent × 2 gold × kingdom_recruit_modifier`

Reform options:

| Reform | Bonus | Penalty |
|--------|-------|---------|
| Iron Fist | Combat +20% | Economy −10% |
| Commerce | Income +20% | Military upkeep +10% |
| Conscription | Manpower rate +30% | Stability −10 (one-time) |
| Propaganda | Stability +20 (over 4 seasons) | −5 gold/season |
| Fortify Borders | Fort cost −30% | Recruitment −15% |

---

## 6. Combat System

### Battle Resolution

```
attackPower = armySize × (morale/100) × terrainAttackMod × combatBonus × rng(0.85–1.15)
defensePower = (garrison + defArmySize) × terrainDefenseMod × (1 + fortLevel×0.2) × rng(0.85–1.15)
```

- If `attackPower > defensePower`: **Attacker wins**
  - Attacker losses = floor(defensePower × 0.35)
  - Defender garrison → 0, province captured
  - Unrest +20 in captured province
  - Winner morale +5; Loser army retreats to nearest owned province
- If `defensePower >= attackPower`: **Defender wins**
  - Attacker losses = floor(attackPower × 0.45)
  - Attacker retreats; defender garrison −floor(attackPower × 0.20)

Battle log is always shown verbatim.

### Season Modifiers

| Season | Combat Mod | Notes |
|--------|-----------|-------|
| Spring | 1.00 | Normal |
| Summer | 1.05 | Peak campaign |
| Autumn | 0.95 | Slight drop |
| Winter | 0.80 | Reduced ops, attrition |

---

## 7. Diplomacy

### Relations Score

Each kingdom-pair has a score from −100 (war) to +100 (strong alliance).

Default: 0. Changes from:
- Attacking: −30
- Breaking treaty: −40
- Honoring treaty: +5/season
- Tribute paid: +15
- Common enemy: +10

### Treaties

| Treaty | Duration | Effect |
|--------|----------|--------|
| Non-Aggression Pact | 8 seasons | Neither party can attack the other |
| Tribute | Ongoing | Sender pays X gold/season; recipient has +20 relations |

AI acceptance threshold: relations ≥ −10 + personality modifier.

---

## 8. Fog of War

| Visibility Level | What Player Sees |
|-----------------|-----------------|
| Owned province | Full details |
| Adjacent (not owned) | Owner, terrain, garrison tier (Small/Medium/Large) |
| Scouted (within 3 seasons) | Full details |
| Unknown | "???" — owner unknown, no stats |

Garrison tiers: Small (<2000), Medium (2000–5000), Large (>5000).

---

## 9. Kingdom Archetypes

### 1. Qin — The Legalists
*"One law, one army, one empire."*
- **Starting territory:** Yongcheng, Xianyang (capital), Hanzhong, Longxi, Beidi
- **Bonus:** Army upkeep −25%; reforms have no stability penalty
- **Weakness:** Diplomacy costs +1 AP; other kingdoms start −20 relations with Qin
- **Playstyle:** Slow military buildup, economic reforms, then overwhelming late-game invasion

### 2. Zhao — The Cavalry Lords
*"Speed is victory; hesitation is death."*
- **Starting territory:** Handan (capital), Jinyang, Yunzhong, Dai, Yanmen
- **Bonus:** Army movement +1 range; cavalry bonus +15% attack on plains
- **Weakness:** Food production −20%
- **Playstyle:** Fast strikes, mobile warfare, avoid prolonged sieges

### 3. Yan — The Spymasters
*"Know your enemy before he knows himself."*
- **Starting territory:** Ji (capital), Yuyang, Shanggu, Liaoyang, Beiping
- **Bonus:** All espionage costs −50%; scout actions free
- **Weakness:** Army combat −15%
- **Playstyle:** Information dominance, sabotage, diplomatic manipulation

### 4. Qi — The Merchants
*"Gold wins more battles than swords."*
- **Starting territory:** Linzi (capital), Jimo, Gaotang, Pingyuan, Jibei
- **Bonus:** Income +30%; tribute proposals always accepted if Qi has gold
- **Weakness:** Manpower base −20%
- **Playstyle:** Economic dominance, buy allies, fund mercenaries (recruit without barracks)

### 5. Wei — The Iron Crossbowmen
*"Discipline and firepower; no wall holds."*
- **Starting territory:** Daliang (capital), Anyi, Henei, Suiyang, Puyang
- **Bonus:** Combat +20% on plains; fort upgrade costs −20%
- **Weakness:** Surrounded — starts with 6+ border provinces exposed; no geographic safety
- **Playstyle:** Defensive fortification, aggressive counter-punching

### 6. Han — The Artisans
*"The strongest fortress is built, not born."*
- **Starting territory:** Xinzheng (capital), Yiyang, Luoyang, Nanyang, Yewang
- **Bonus:** Fort builds −30%; all builds cost −10% gold
- **Weakness:** Small manpower pool (manpower rate −20%)
- **Playstyle:** Fortress network, attrition defense, slow expansion

### 7. Chu — The River Lords
*"The south is vast; we have time."*
- **Starting territory:** Ying (capital), Chendu, Shouchun, Hengshan, Jianghan
- **Bonus:** Food production +30%; riverlands armies regenerate morale +5/season
- **Weakness:** Army movement −1 (soggy terrain); winter penalties ×1.5
- **Playstyle:** Economic powerhouse, outlast enemies, flood the north when ready

### 8. Zhongshan — The Survivors
*"Small but unbroken."*
- **Starting territory:** Lingshou (capital), Gucheng, Shiyi, Zhongdu, Furou
- **Bonus:** Unrest recovers 2× faster; legitimacy loss from territory capture −50%
- **Weakness:** Small starting territory, surrounded; manpower hard-cap lower
- **Playstyle:** Survival, diplomacy-heavy, defensive fortifications, pick off weakened neighbors

---

## 10. Win / Lose Conditions

### Victory
- Control **≥60% of provinces** (24 of 40), OR
- Control **the capitals of 3 other kingdoms**

### Defeat
- **Your capital is captured**, OR
- **Your stability drops to 0**, OR
- **All your provinces are captured** (eliminated)

---

## 11. UI Flow

```
[Title Screen]
    ↓
[Kingdom Select Screen] — choose one of 8 kingdoms, see archetype info
    ↓
[Game Board] — main play screen:
  ┌─────────────────────────────────────────────────────┐
  │ [Kingdom Info Panel] │   [SVG Map]   │ [Province Info]│
  │  Resources           │   (provinces  │  Selected prov  │
  │  Armies              │    as nodes)  │  details        │
  │  Season/Year         │               │  Actions panel  │
  └─────────────────────────────────────────────────────┘
  │              [Action Bar + AP display]               │
  │              [End Season button]                     │
    ↓
[Season Summary Modal] — what happened this season
    ↓
[Back to Game Board, next season]
    ↓
[Game Over Screen] — win or lose, stats
```

---

## 12. V1 Cut List (Intentionally NOT in V1)

- Multiplayer (architecture supports it; not wired up)
- Multi-turn sieges (replaced by one-turn assault)
- Defensive alliance calls (NAP only)
- Technology/research trees
- Hero characters / generals with special abilities
- Vassal / tributary state system (only direct control)
- Random events / disaster cards
- Animated combat sequences
- Sound / music
- Campaign map procedural generation
- Faction-specific unique buildings
- Diplomacy: peace conferences after wars
- Achievements / unlocks
