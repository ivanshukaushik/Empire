# Ancient Warring States — Design Document

> "One who wins without fighting is superior." — Sun Tzu

## Overview

Ancient Warring States is a real-time grand strategy game set in 475 BCE China,
during the Warring States period. You control one of eight kingdoms competing for
hegemony over the Central Plains.

The game runs in continuous real-time at configurable speed (1–8 game-days/second).
Every decision you make is visible on the map immediately. There are no turn boundaries,
no modal interruptions, and no waiting.

---

## Core Loop

```
[Time passes] → [Resources accrue] → [Armies march] → [Battles resolve] → [Provinces change hands]
                      ↑                                        ↓
               [Build infrastructure]              [War Ledger records events]
               [Recruit armies]                    [AI kingdoms re-plan]
               [Issue commands]
```

Each game-day:
- Manpower regenerates based on province infrastructure
- Armies in transit move toward their targets
- AI kingdoms check their planning window and issue orders

Each season (90 days):
- Income, food, and army upkeep are resolved
- Treaties may expire
- Rulers age (annually)

---

## Natural Constraints

These systems create meaningful decisions without arbitrary caps or "order limits":

### Treasury
Gold is the bottleneck for building and recruiting. Running out causes stability loss.
Armies cost upkeep every season — a large army without income is a liability.

### Manpower
Manpower regenerates per-day from province population. Recruiting draws from
this pool instantly. The pool is capped at 100 points per kingdom.
The regeneration rate is shown as `+X/day` in the Kingdom panel.

### Food
Farms and riverland provinces produce food. Armies consume it. Famine
causes 5% troop attrition and −10 morale per season.

### Stability
Stability (0–100) acts as a soft leash on aggression. Bankruptcy (treasury < 0)
causes −5 stability/season. Reaching 0 is a loss condition.

### Overextension
Each province costs 1 admin point (capitals cost 2). If you own more than
your `adminCapacity` (default 10), you pay a −15% income penalty every season.
Expanding administration tech raises the cap by +4.

### Army Replenishment
Resting armies in friendly territory recover troops each season, limited by
the manpower pool and provincial infrastructure (barracks add +80 troops/season).

---

## Economy System

| Province Feature | Effect |
|---|---|
| Farm | +2 food/season |
| Market | +2 gold income/season |
| Barracks | +80 replenishment/season; enables recruiting |
| Fort Lv.1–3 | +20% defender power per level |
| Iron province | +8% combat modifier for owning kingdom |
| Salt province | −5 unrest/season |
| Horses province | −1 travel day for owning kingdom's armies |

Income formula: `base × (1 − unrest/200) × incomeModifier × reform.income × rulerBonus`

---

## Combat System

Battle power is deterministic with a small random roll (±15%):

```
attackerPower = size × (morale/100) × terrainMod × combatMod × seasonMod × roll(0.85–1.15)
defenderPower = (garrison + armies) × terrainMod × fortMod × combatMod × roll(0.85–1.15)
```

**Terrain effects:**

| Terrain | Attack mod | Defense mod |
|---|---|---|
| Plains | 1.0× | 1.0× |
| Hills | 0.9× | 1.15× |
| Mountains | 0.75× | 1.30× |
| Riverlands | 0.85× | 1.10× |

**Season effects:**
- Winter: −20% all combat
- Summer: +5% attacker
- Autumn: −5% attacker

The **combat preview** tooltip (shown when hovering a target in attack mode)
explains all these modifiers before you commit. No opaque numbers.

---

## Diplomacy System

### Non-Aggression Pacts (NAPs)
AI kingdoms send NAP proposals to your inbox. **You always choose** — nothing
is ever auto-signed. Press Y to accept, N to decline, or use the Diplomacy tab.

### Treaty States
A treaty can be: `active`, `breached`, or `expired`.
- Active: both sides have agreed; attacking the ally causes a breach
- Breached: attacker suffers reputation penalty; AI remembers
- Expired: after the season countdown hits 0

### Breach
Attacking a NAP partner queues a `breach_treaty` action. Breaching increases
`treatyBreachCount` on your kingdom, which makes AI kingdoms less likely to
trust you in future negotiations.

---

## Strategic Resources

Three resource types add kingdom-specific power:

| Resource | Location examples | Unlock |
|---|---|---|
| Iron | Hanzhong (Qin), Jinyang (Zhao), Yiyang (Han) | +8% combat modifier |
| Salt | Liaoyang (Yan), Linzi/Jimo (Qi) | −5 unrest/season per province |
| Horses | Yunzhong (Zhao), Longxi (Qin), Yanmen (Zhao) | −1 travel day |

Owning even one province with that resource grants the bonus to your kingdom.
This creates meaningful geographic objectives: Qi's salt coast funds a mercantile
empire; Zhao's horse provinces enable fast cavalry campaigns.

---

## Construction Projects

Each province has **1 project slot** (capital provinces get 2 with Administration tech).
Queuing a project costs gold immediately; the building completes after N game-days:

| Building | Cost | Duration | Effect |
|---|---|---|---|
| Farm | 5g | 5 days | +2 food |
| Market | 8g | 7 days | +2 income |
| Barracks | 10g | 10 days | Replenishment +80/season; enables recruit |
| Fort (Lv.1–3) | 12g | 6 days | +20% defender power per level |

Progress is shown as "Xd left" in the province panel.

---

## Intent Control Layer

The command box (press **C** to open) accepts natural language intents:

| Command | Effect |
|---|---|
| `conquer [province]` | Attacks that province with your largest adjacent army |
| `defend [province]` | Moves your largest available army to that province |
| `stabilize [province]` | Queues a Farm or Barracks build to reduce unrest risk |
| `make peace with [kingdom]` | Proposes a NAP to that kingdom |

The parser is **purely deterministic** — no LLM, no network call.
Province and kingdom names are matched by prefix/substring against the game data.

After parsing, a **plan card** shows:
- Resolved intent (province name, kingdom name)
- ETA in game-days
- Risk assessment (combat odds if applicable)
- Why it can't execute, if blocked

Press **Enter** to approve and queue the actions, or **Escape** to cancel.

---

## AI Behavior

Each AI kingdom has a `personality` with:
- `goal`: expand / consolidate / survive / hegemon
- `aggressionWeight`: 0.0–1.0 (how likely to attack vs. develop)
- `economyWeight`: investment in buildings vs. armies
- `diplomacyWeight`: willingness to propose/accept treaties

AI kingdoms re-plan every 10 days (staggered to avoid simultaneous spikes).
They track `recentAttackers` and `recentBetrayers` — kingdoms that have attacked
them or broken treaties will be treated with hostility.

AI kingdoms **never auto-sign treaties with the player**. Proposals only arrive
in your diplomatic inbox.

---

## Fog of War

| State | Information shown |
|---|---|
| Owned | Full: garrison, income, food, projects |
| Adjacent (partial) | Owner, terrain, garrison tier (small/medium/large) |
| Scouted | Full info for 3 seasons after scouting |
| Unknown | "???" — only location visible |

---

## Win / Lose Conditions

**Win:**
- Control 60% of all provinces, OR
- Capture 3 enemy capitals

**Lose:**
- Your capital is captured, OR
- Stability reaches 0
