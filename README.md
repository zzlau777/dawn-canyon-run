# DAWN CANYON RUN

A complete 3D low-poly flight game for the make.fun **best-flight-game** bounty. Take off at
dawn, thread twelve golden rings down a winding canyon, then dive through the finish gate over
the runway. Built on a vendored Three.js; every line of game logic is hand-written, and the
game makes zero network requests — open `game/index.html` and fly.

## How to play

| Keys | Action |
| --- | --- |
| `W` / `S` | Throttle up / down (`Shift` = boost) |
| `↑` / `↓` | Climb / dive |
| `←` / `→` | Bank left / right |
| `A` / `D` | Rudder |
| Mouse | Steer toward the pointer |
| `P` / `Esc` | Pause · `M` mute · `R` restart |

Watch your airspeed: below the stall speed the wing lets go, the nose drops and the STALL
warning flashes. Crashing puts you back at the last ring with ten seconds on the clock.

## What's in the game

- **A real flight model** — thrust vs. drag, gravity along the flight path, lift that fades
  into a stall, banked turns, a soft ceiling, and ground collision against the very height
  field the terrain mesh is built from.
- **A living canyon** — procedural seeded terrain with a winding valley and river, a runway
  with markings, threshold lights and buildings, instanced pines and rocks, cloud blobs and a
  ring of snow-capped peaks under a dawn sky.
- **A full instrument panel** — six lit gauges drawn live (attitude, altimeter, airspeed,
  heading compass, vertical speed, RPM) beside amber ALT / SPD / HDG readouts, a next-ring
  arrow with distance, timer and score.
- **Synthesised audio** — a WebAudio engine hum that follows RPM, a chime per ring, a finish
  jingle. No audio files.

## Layout

- `main.ts` — hands the entry in: copies `game/` and `screenshots/` to the output directory
  and writes `dossier.json` with the vendored make.fun library.
- `game/index.html` — the page and HUD. `game/vendor/three.min.js` — vendored Three.js r128.
- `game/src/` — one job per file: `config` (tuning + the canyon course), `random` (seeded
  PRNG + value noise), `input`, `audio`, `world` (terrain, river, runway), `aircraft`,
  `rings` (the mission course), `hud` (readouts + gauges), `main` (flight model + game loop),
  `shots` (the deterministic `?shot=` scenes the screenshots were staged from).

## Screenshots

`1-cover.jpg` — just airborne, first ring glowing up the valley · `2-rings.jpg` — closing on
ring five over the river · `3-bank.jpg` — hard bank into ring seven · `4-final.jpg` — mission
complete over the runway.

MIT licensed — see `LICENSE`.
