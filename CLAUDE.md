# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running and verifying

- **Run the game**: `open index.html`. No build step, no dependencies, no install.
- **Syntax check** (no test framework exists): `node --check game.js && node --check enemies.js`
- **Manual verification only** — this is a browser game with no automated test harness. Confirming a change requires opening the file, pressing Space, and watching the behavior in PLAY state.

## Script load order is load-bearing

`index.html` loads `game.js` *before* `enemies.js` — this order is required, not arbitrary. `enemies.js` references constants from `game.js` (e.g. `GAME_W`, `GAME_H`) inside object literals at module load time (most notably `Formation.centerX: GAME_W / 2` and the bezier path tables). Reversing the order throws ReferenceError on page load.

## Architecture

The codebase is plain classic-script JavaScript (no ES modules, no bundler). Every subsystem is a single namespace object that exposes some subset of `init`, `update(dt)`, `draw(ctx)`, plus state. The objects all sit in the global lexical environment shared between `game.js` and `enemies.js`.

**Module map (the big picture)**:

- `Game` — owns the main loop, the top-level state machine, `time`, `stateTimer`, and the FPS counter
- `Input` — keyboard state with both held (`keys`) and just-pressed (`pressed`) sets; `endFrame()` clears `pressed` each tick
- `Stars` — parallax-layer starfield
- `Player` — sprite, position, fire cooldown, death/respawn lifecycle, invincibility blink
- `Bullets` — *both* player and enemy bullets live here in two arrays (`player[]`, `enemy[]`). Extend this module rather than creating a separate enemy-bullets module
- `Enemies` (in `enemies.js`) — `list[]` of live enemies, `spawnQueue[]` for staggered entry; owns the dive-trigger logic
- `Formation` (in `enemies.js`) — slot positions, sway. `slotX(col)` / `slotY(row)` are the public API
- `Explosions`, `HUD`, `Collisions`, `Sound` — single-purpose modules in `game.js`

**Two nested state machines**:

1. `Game.state` — high-level: `ATTRACT → STAGE_INTRO → PLAY → STAGE_CLEAR → GAME_OVER → ATTRACT`. Transition only through `Game.setState(STATE.X)`, which runs side-effects (reset bullets, init enemies, play sound).
2. Each enemy has its own `mode` field: `entering → gliding → formation → diving → gliding → formation`. `entering` follows a bezier entry path; `gliding` linearly interpolates to its assigned formation slot; `diving` follows a bezier that arcs through the player position; firing happens only in `diving`.

These two machines run independently — `Game.state` is what the player sees; `e.mode` is what each enemy is doing.

## Conventions to follow when editing

- **Sprites are ASCII grids**: define new sprites by passing arrays of equal-length strings + a palette dict to `makeSprite(rows, palette)`. Single character per pixel; `'.'` (or any key with value `null`) is transparent. The result is an offscreen canvas you blit with `ctx.drawImage`.
- **Coordinates are game pixels**: the internal canvas is 224×288. `style.css` scales it 2× for display. Always work in game pixels in JS — never apply the 2× factor yourself.
- **Paths are multi-segment quadratic beziers**: an array of `{ p0, p1, p2, duration }` segments. Use `pathPoint(path, t)` to evaluate (handles the segment walk). Entry paths live in `buildEntryPaths()`; dive paths are built per-enemy in `Enemies._startDive()`.
- **Sound triggers**: every `Sound.*` method calls `ensureCtx()` first because AudioContext can only be created after a user gesture. To add a new sound, define it as a method on `Sound` and call it from the gameplay code (e.g. `Bullets.spawnPlayer` → `Sound.fire()`). Don't add gameplay logic inside Sound; don't try to start audio at page load.
- **Module hookup**: a new updateable system needs three lines — `X.init()` in `Game.init`, `X.update(dt)` in the right `Game.update` switch case, `X.draw(ctx)` in `Game.draw`. Match the existing pattern.

## Audio notes

The sounds are *synthesized* approximations of the Namco WSG chip (square waves, 1-bit quantized noise, filter envelopes). They are not extracted arcade ROM samples and we deliberately do not ship those — adding the real ROMs is out of scope. If a tweak is requested, adjust the synth parameters (frequencies, durations, envelope shapes) rather than swapping in audio files.

## Git workflow — commit and push as you go

**This is a standing user requirement, not optional.** The user values never losing work and being able to revert at any moment. As you complete units of work, commit them locally and push to GitHub. Do this throughout the session, not just at the end.

Repo: `github.com/klee3534/galaga`, tracking `origin/main`.

**When to commit and push**:
- After every logical unit of work the user accepts — a feature added, a bug fixed, a refactor finished, a doc updated. Don't wait until "everything is done."
- Multi-step tasks should land as multiple commits, one per logical step, not one giant commit at the end.
- After updating docs (README, CLAUDE.md), comments, or sounds — these are work too, commit them.

**How**:
- Stage only the files you actually changed (`git add <files>`, never `git add .` or `-A`).
- Commit message: concise subject line focused on the *why* (not "update file.js"); optional body for context. Use a HEREDOC for multi-line messages so formatting survives.
- Include the trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- `git push` to `origin` immediately after committing — a local commit isn't safe until it's on the remote.

**Hard rules**:
- Never force-push, never `--amend` a pushed commit, never `--no-verify`. If a hook fails, fix the cause and make a new commit.
- Never commit secrets (`.env`, credentials). The repo has no `.gitignore` yet — add one before committing any file that could contain sensitive values.
- If you're unsure whether a change is worth committing, commit it. Many small commits are better than losing work.
