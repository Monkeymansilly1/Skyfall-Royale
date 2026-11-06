# Skyfall Royale

An original, browser-playable 3D battle royale inspired by classic build-focused battle royale games. Drop from an aerial transport, loot the island, fight **16 local AI bots**, build cover and high ground, and survive the shrinking storm. This is a playable single-player prototype, with an entire match and restart loop. There are no online players, accounts, paid services, or downloaded game assets.

Built with **TypeScript, Vite, Three.js, and Rapier**. Desktop keyboard, mouse, WebGL 2, and hardware acceleration are required. The HUD adapts to smaller screens; touch controls are not implemented.

## Run locally

Use Node **22.12 or newer**:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173/Skyfall-Royale/**. Click **Drop into Solo** to play a match or **Free Build** to explore with a starter loadout, 999 of each material, targets, and no bots or storm. Materials in Free Build still spend normally so placement and harvesting rules stay testable. A fatal fall or deep-water accident returns you to the starting area with your loadout.

The browser requests mouse capture when you start or resume. Escape releases the mouse and pauses the simulation. Switching tabs or losing focus also pauses. Audio begins after the first interaction. Settings and key bindings are saved locally when browser storage is available; matches are not saved.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The production preview is at **http://localhost:4173/Skyfall-Royale/**. Opening `index.html` directly through `file://` will not work.

## Controls

Keyboard bindings can be changed in **Settings**, including the movement, build-piece, and material keys. These are the defaults:

| Input                     | Action                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| W / A / S / D             | Move relative to the camera; steer during descent                          |
| Mouse                     | Look                                                                       |
| Left mouse                | Fire, harvest, use selected consumable, place build; select an edit region |
| Right mouse               | Aim; narrows FOV and sensitivity                                           |
| Space                     | Jump; jump from transport; deploy/close glider above auto-deploy height    |
| Hold Space at a low ledge | Attempt a mantle                                                           |
| Shift                     | Sprint                                                                     |
| Ctrl                      | Crouch; crouch while sprinting to slide                                    |
| 1–5                       | Select inventory slot                                                      |
| 6                         | Equip the permanent pickaxe                                                |
| E                         | Pick up/swap loot; open/close doors                                        |
| H                         | Drop selected inventory item                                               |
| R                         | Reload; reset the active edit                                              |
| Q                         | Toggle building                                                            |
| Z / X / C / V             | Select wall / floor / ramp / cone                                          |
| T                         | Rotate the preview or a ramp/cone edit                                     |
| B                         | Cycle wood / brick / metal                                                 |
| G                         | Edit your aimed build; confirm the edit                                    |
| 1–9 while editing         | Toggle wall regions, numbered bottom-to-top                                |
| 1–4 while editing         | Toggle floor quadrants                                                     |
| Escape                    | Cancel the edit; release mouse / pause                                     |
| M                         | Open the full island map and pause                                         |

Hold left mouse to continuously place builds or fire an automatic weapon. Pumps and snipers require individual clicks. Switching inventory slots explicitly cancels reload/use; an active reload prevents firing. Damage interrupts healing. Drink flasks for 50 shield, up to 100; a field kit restores health to 100. Harvest trees, rocks, crates, and fences with the pickaxe for materials. Five inventory slots exclude the permanent pickaxe.

For a door edit, remove the center bottom and center middle wall regions (keys **2, 5**) and confirm with G. A window uses region **5**. Floors expose four removable quadrants; ramps change orientation. R resets, G confirms, and Escape cancels. Edits replace the physical colliders. Closing an opening around a player is refused.

## What works

- Third-person shoulder camera, mouse capture, camera collision, ADS, acceleration, sprint, crouch, jump, air steering, basic slide and low mantle. Characters have procedural stride, aim, swing, freefall, and glider poses.
- Pickaxe, assault rifle, pump shotgun, SMG, and projectile sniper with gravity. Individual magazine/reload/rate/recoil/spread/falloff/switch parameters; shotgun pellets, headshots, shield absorption, muzzle obstruction, traces, impacts, colored damage numbers, and hit feedback.
- Ground loot, dropped weapons, full-slot swapping, consumable stacks, healing, five rarity colors, rooftop supply chests, harvesting, and resource costs.
- Four build shapes on a 4 m horizontal grid. Terrain-height foundations establish a consistent vertical grid for attached pieces. Valid/invalid previews, rotation, three materials, hold placement, construction health, destruction, supported-piece traversal, collapse, and live collision edits.
- A compact rolling island with beaches, water, roads, rocks, trees, destructible cover, and four distinct settlements: **Sunstone Square, Tidebreak Bay, Lookout Lodge, Amber Acres**. Houses contain usable doors, window openings, stairs, upper floors, and rooftops.
- Aerial transport, jump/freefall/automatic glider/landing, local bot looting and combat, five progressively smaller safe zones with escalating storm damage, last-contestant resolution, placement/victory results, match statistics, and clean restarts.
- Inspectable bot states: `drop`, `loot`, `roam`, `zone`, `engage`, `heal`. Bots use the same capsules, weapons, ammunition, loot transfers, consumables, damage, builds, and storm rules. They need line of sight, have reaction delays and imperfect aim, open doors, steer around obstacles, jump low obstructions, harvest when short on wood, and can place defensive walls. They seek landed opponents rather than targeting the initial drop.
- Health/shield bars, five-slot hotbar, ammunition, material/build indicators, compass, minimap/full map, current/next storm circles, countdowns, contestant count, kill feed, interaction prompts, action timers, hit feedback, and result screens.
- Original synthesized positional effects and footsteps; volume, sensitivity, shadow, render-resolution, and keyboard settings. Static objects share geometry/materials and use instancing. Character physics and AI run at a fixed 60 Hz; bot decisions are staggered. The camera and rendering run separately.

## Architecture

| Path                   | Responsibility                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `src/config.ts`        | Movement, weapon, building, population, storm, and projectile tuning                  |
| `src/sim/game.ts`      | Authoritative local match state, commands, combat, looting, bot state machine, events |
| `src/sim/physics.ts`   | Rapier capsule controllers, collision, line-of-sight, queries, camera obstruction     |
| `src/sim/building.ts`  | Placement rules, editable shape descriptors, support graph                            |
| `src/sim/inventory.ts` | Inventory transactions and damage/shield calculations                                 |
| `src/sim/map.ts`       | Seeded prop layout, named locations, terrain and matching collision mesh              |
| `src/sim/storm.ts`     | Successive safe-zone targets and interpolation                                        |
| `src/render/`          | Three.js world, procedural original models, effects, camera, synthesized audio        |
| `src/ui/`              | DOM HUD, menus, controls, canvas maps                                                 |
| `src/input.ts`         | Remappable input, persisted preferences, pointer capture                              |
| `src/main.ts`          | Fixed-step loop, rendering, lifecycle, pause/restart wiring                           |
| `tests/`               | Deterministic rule, physics, combat, and whole-match tests                            |

Simulation does not import Three.js, DOM, audio, or rendering. It emits typed events that presentation consumes. `PlayerInput` is the command boundary. `Game` accepts a seed for repeatable simulations. Multiplayer would require moving simulation to a server, transport, snapshot/interpolation, validation and reconciliation; **none of that is currently implemented**.

Build support uses contacts between shape bounds and ground-connected traversal. It is deliberately conservative, rather than a full structural engineering solver. Houses and environmental props are destructible map objects; the support/collapse system applies to player/bot builds.

## Verification

`npm test` exercises inventory transfers and stacking, health/shield overflow and storm bypass, every storm stage, placement validation, support/collapse, terrain movement/jumping, actual edited wall and floor collision, ramp traversal, cone surfaces, camera obstruction, door collision, construction health, reload/switch rules, muzzle cover, head-height damage, sniper travel, victory/elimination, and clean match recreation. A seeded match also runs the actual bot/physics simulation until at most one contestant remains, checks that all bots land and most acquire loot, and records real combat events.

Browser verification during implementation covered menu/settings/help, remapping, practice movement, click placement, door editing, firing/reload, shield consumption, dropping items, map, pause/resume, solo transport/drop/landing, a complete elimination route and restart. The long browser match used accelerated simulation, rather than a manual skill/performance playthrough. Browser checks reported no JavaScript errors. Unit fixtures separately verify the victory condition. Current Rapier's compatibility initializer emits an upstream deprecation **warning**; it does not fail initialization or tests.

A small diagnostic bridge exists only in Vite development with `?qa` in the URL (`window.skyfallQA`); it exposes snapshots, look direction, and capped deterministic advancement for browser checks. Vite removes it from production builds.

## GitHub Pages deployment

1. Merge the game branch into **main**.
2. In this repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Open **Actions → Validate and deploy Skyfall Royale**. The workflow runs on pushes to main; use **Run workflow** if Pages was enabled after the initial push.
4. After its build and deploy jobs succeed, visit **https://monkeymansilly1.github.io/Skyfall-Royale/**.

The workflow installs from `package-lock.json`, runs the tests and production build, uploads `dist`, and uses the official Pages deploy action. Pull requests run validation without deployment. The `github-pages` environment may require a repository-configured approval. Pages must be enabled by a repository administrator; this change does not alter repository hosting settings.

`vite.config.ts` explicitly sets `base: '/Skyfall-Royale/'`, so scripts and assets resolve under the repository path. If the repository is renamed, update that base path. For a domain rooted at `/`, change it to `/`. The game is fully static; no runtime environment variables or server are required. The production output includes the Rapier WebAssembly payload inside the physics bundle.

## Asset attribution

All island geometry, architecture, characters, transport/glider, weapon models, icons, map art, and synthesized sound effects were created procedurally for this project. No Epic branding, character models, game files, textures, music, or extracted assets are included. System fonts are used, with no external font requests.

Runtime dependencies are **Three.js (MIT)** and **Rapier (Apache-2.0)**; their license notices remain in the installed packages and production bundles where applicable. Vite, TypeScript, and Vitest are development tooling. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Known limits / future work

This is a working prototype, not Fortnite feature or feel parity. Movement/weapon tuning and animation need human playtesting on real gaming hardware. Laptop frame-rate targets are not benchmarked; lower shadows or render resolution if needed. The art uses simple original low-poly models and a small island.

Bot navigation uses reactive steering and capsule steps, not a baked navigation mesh or tactical planner. Bots can hesitate at complex multi-level builds and have basic cover/healing/building decisions. They do not edit structures. Player edits support wall regions, floor openings and ramp orientation; a symmetric cone's rotation is mainly an orientation indicator. There is no repair system, advanced sliding/mantling animation, swimming, vehicles, persistent progression, controller/touch support, or online multiplayer. Physical support is approximate, and destroying a house wall does not collapse the entire house. Match randomness and bot tuning still need broader balancing.
