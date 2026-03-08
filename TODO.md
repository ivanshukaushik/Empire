# TODO — Current Sprint

## In Progress

- [ ] Verify GitHub Pages deployment after first push to work branch

## Done This Sprint

- [x] GitHub Actions: `deploy.yml` — build + deploy to gh-pages on push
- [x] GitHub Actions: `nightly.yml` — nightly build health + TODO summary
- [x] Issue templates: `bug.yml`, `feature.yml`
- [x] `vite.config.ts` — configurable base path via `VITE_BASE_URL` env var
- [x] `DESIGN.md` — core loop, constraints, combat math, intent control
- [x] `ROADMAP.md` — 3-week plan
- [x] `TODO.md` — this file
- [x] Phase 4K: `commandParser.ts` — deterministic natural-language intent parser
- [x] Phase 4K: `CommandBox.tsx` — command input UI with plan preview
- [x] GameBoard: integrate CommandBox, add `C` keyboard shortcut
- [x] Strategic resources: iron → +8% combat modifier for owning kingdom
- [x] Strategic resources: horses → −1 travel day for owning kingdom
- [x] Horses added to 3 northern steppe provinces in gameData.ts

## Bugs to Fix

- [ ] Army token z-order: marching tokens sometimes render behind province circles
- [ ] Combat preview doesn't account for iron/horses bonuses yet (combatPreview.ts)
- [ ] `administrateTechLevel` upgrade not yet wired to a UI button (placeholder only)

## Next Up (Week 2)

- [ ] Siege progress rings on map for provinces under active attack
- [ ] Admin tech upgrade button in KingdomInfo panel
- [ ] Ruler trait effects — show labeled bonus rows in KingdomInfo
- [ ] Province resource icons on map (⚒/🧂/🐴)
- [ ] Army size labels on marching tokens
