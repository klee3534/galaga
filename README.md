# Galaga

A browser-based clone of the classic 1981 arcade space shooter, built with vanilla JavaScript and the HTML5 Canvas. Faithful to the core gameplay loop — formation entries, dive attacks, escort squads, and a stage-based difficulty curve.

Play it live: https://klee3534.github.io/galaga/ (if GitHub Pages is enabled)

## How to play

| Key | Action |
|---|---|
| `←` / `→` (or `A` / `D`) | Move ship |
| `Space` (or `W`) | Fire |
| `M` | Toggle mute |
| `F1` | Toggle FPS counter |

Press `Space` on the title screen to start.

## Features

- **Three enemy types** — bees (50/100 pts), butterflies (80/160 pts), and bosses (150/400 pts, 2 HP)
- **Formation entry choreography** — enemies fly in on quadratic bezier paths in groups of 8 and settle into a 10×5 swaying grid
- **Dive attacks** — formation enemies break off and dive at the player; bosses can bring two escort butterflies in classic squad formation
- **Stage progression** — clear all 40 enemies to advance; each stage gets faster and more aggressive
- **Lives system** — 3 lives, 1.5 s respawn invincibility with blinking sprite
- **Synthesized arcade audio** via Web Audio API — fire, explosions, warbling dive alarm, stage-start fanfare. No external sound files.
- **Full state machine** — attract screen → stage intro → play → stage clear → game over → loop

## Running locally

No build step or dependencies. Just open the file:

```bash
open index.html
```

Or serve it with any static file server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Project structure

```
.
├── index.html      # canvas + script tags
├── style.css       # 2x pixelated canvas scaling and centering
├── game.js         # game loop, input, player, bullets, HUD, sound, state machine
└── enemies.js      # enemy sprites, formation, bezier paths, dive AI
```

## Implementation notes

- **Resolution**: internal 224×288 game canvas, displayed at 2× scale via CSS with `image-rendering: pixelated`
- **Sprites**: defined as ASCII character grids and rasterized at startup to offscreen canvases for fast `drawImage` blits
- **Audio**: classic-arcade approximations synthesized in code — square-wave melodies, 1-bit quantized noise for explosions, and a warbling square-wave alarm for dives
- **Paths**: quadratic bezier segments stitched into multi-segment paths for both formation entries and dives

## Not (yet) implemented vs. the original

- Boss galaga tractor-beam capture and dual-fighter rescue
- Challenge stages every few rounds
- The original ROM sound samples — audio here is synthesized approximations, not bit-perfect arcade rips

## License

Personal project. Original Galaga is © Namco/Bandai Namco — this is an educational clone, not affiliated with or endorsed by the rights holders.
