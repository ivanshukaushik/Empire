# Roadmap — Ancient Warring States

3-week sprint plan starting from the current V4.0 baseline.

---

## ✅ Completed (V4.0 baseline)

- [x] Continuous-time simulation (RAF loop, no turn pauses)
- [x] War Ledger — persistent event feed replacing season summary modal
- [x] Per-day manpower regeneration with `+X/day` tooltip
- [x] Project Slot system — timed construction (farm/market/barracks/fort)
- [x] Battle stats fixed — power and losses show real numbers
- [x] Admin capacity / overextension penalty (−15% income)
- [x] Army movement interpolation on map (animated tokens)
- [x] Combat preview tooltip — troops, morale, terrain, forts before committing
- [x] Keyboard controls: Space, A, M, X, Esc, Y/N, I, R, 1/2/3/4
- [x] Diplomacy consent: inbox, pending/accepted/declined/expired states
- [x] Strategic resources tracked (iron, salt, horses)

---

## Week 1 — Polish and automation (current sprint)

- [x] GitHub Actions: build + deploy to GitHub Pages on push to work branch
- [x] Nightly scheduled workflow — build health check + TODO summary
- [x] Issue templates (bug, feature)
- [x] DESIGN.md — full game design document
- [x] ROADMAP.md + TODO.md
- [x] Vite base path configured for `/Empire/` GitHub Pages
- [x] Intent control layer (Phase 4K) — command box with deterministic parser
- [x] Strategic resource mechanics: iron +8% combat, horses −1 travel day

---

## Week 2 — Depth and clarity

- [ ] **Siege progress rings** — provinces under attack show a ring that fills over the battle duration; gives visual cue of ongoing siege
- [ ] **Admin tech unlock** — button in Kingdom panel to spend gold/stability for +1 adminTechLevel, which increases adminCapacity +4 and unlocks 2nd project slot
- [ ] **Ruler trait effects visible** — KingdomInfo panel shows active ruler bonuses as labeled rows ("Military 8 → +8% combat")
- [ ] **Diplomacy: tribute demand** — AI can demand tribute from weaker neighbors; player can demand tribute too
- [ ] **Army size labels** — show troop count on marching tokens on the map
- [ ] **Province resource icons** — small ⚒ (iron), 🧂 (salt), 🐴 (horses) glyphs on map nodes when fog is visible

---

## Week 3 — End-game and replay

- [ ] **Victory screen** — styled cinematic modal with kingdom name, year of unification, and key stats (battles won, kingdoms eliminated)
- [ ] **Loss screen** — narrative explanation: "Your capital fell at Day X. The armies of [Kingdom] overwhelmed your last defense."
- [ ] **Kingdom select screen polish** — show each kingdom's unique bonuses and starting position on a mini-map preview
- [ ] **Difficulty settings** — Easy (player gets +20% income, AI aggression −30%), Normal, Hard (AI plans every 7 days, +10% combat)
- [ ] **Save / load to localStorage** — persist game state between browser sessions (already partially implemented in gameStore)
- [ ] **AI personality differentiation** — make Yan feel like a spy state (more espionage), Qi feel like a trade state (build markets), Qin feel aggressive (attacks early)
- [ ] **Surrender offer** — when hopelessly outmatched, player can surrender a province to buy peace

---

## Backlog (unscheduled)

- Strategic resource trading between kingdoms
- Seasonal event cards (flood, drought, plague, peasant revolt)
- Multi-army coordination — flanking mechanic
- Naval provinces + river crossing battles
- Ruler marriage / succession diplomacy
- Historical events (certain years trigger named events)
- Replay system — record all state transitions for post-game review
- Mobile / touch controls
