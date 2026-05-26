// ---------- ENEMY DATA ----------
// Three types: bee (bottom rows), butterfly (middle), boss galaga (top row).
// Sprites are 13x10 to match the player's footprint.

const ENEMY_W = 13;
const ENEMY_H = 10;

const ENEMY_DATA = {
  bee: {
    hp: 1,
    formationPts: 50,
    divingPts: 100,
    sprite: null,
    rows: [
      '.....Y.Y.....',
      '.....YYY.....',
      '..B..YBY..B..',
      '.BBBBYYYBBBB.',
      'BBBBBYBYBBBBB',
      'BBBBBYBYBBBBB',
      '.BBBBYYYBBBB.',
      '..B..YYY..B..',
      '.....Y.Y.....',
      '.....Y.Y.....',
    ],
    palette: { Y: '#ffd83d', B: '#3d6bff', '.': null },
  },
  butterfly: {
    hp: 1,
    formationPts: 80,
    divingPts: 160,
    sprite: null,
    rows: [
      '......R......',
      '.....RRR.....',
      '..B..RWR..B..',
      '.BB.BRRRB.BB.',
      'BBBBBRWRBBBBB',
      'BBBBBRWRBBBBB',
      '.BB.BRRRB.BB.',
      '..B..RWR..B..',
      '.....R.R.....',
      '.....R.R.....',
    ],
    palette: { R: '#ff2a2a', W: '#ffffff', B: '#3d6bff', '.': null },
  },
  boss: {
    hp: 2,
    formationPts: 150,
    aloneePts: 400,
    divingPts: 150,
    sprite: null,
    spriteHurt: null,
    rows: [
      '......G......',
      '.....GGG.....',
      '...GGGCGGG...',
      '..GGCCCCCGG..',
      '.GGCCGGGCCGG.',
      'GGGCGGGGGCGGG',
      'GGCCCGGGCCCGG',
      '.GG.GGGGG.GG.',
      '..G..G.G..G..',
      '.....G.G.....',
    ],
    palette: { G: '#54ff54', C: '#3dffff', '.': null },
    rowsHurt: [
      '......B......',
      '.....BBB.....',
      '...BBBCBBB...',
      '..BBCCCCCBB..',
      '.BBCCBBBCCBB.',
      'BBBCBBBBBCBBB',
      'BBCCCBBBCCCBB',
      '.BB.BBBBB.BB.',
      '..B..B.B..B..',
      '.....B.B.....',
    ],
    paletteHurt: { B: '#3d6bff', C: '#3dffff', '.': null },
  },
};

function initEnemySprites() {
  ENEMY_DATA.bee.sprite       = makeSprite(ENEMY_DATA.bee.rows,       ENEMY_DATA.bee.palette);
  ENEMY_DATA.butterfly.sprite = makeSprite(ENEMY_DATA.butterfly.rows, ENEMY_DATA.butterfly.palette);
  ENEMY_DATA.boss.sprite      = makeSprite(ENEMY_DATA.boss.rows,      ENEMY_DATA.boss.palette);
  ENEMY_DATA.boss.spriteHurt  = makeSprite(ENEMY_DATA.boss.rowsHurt,  ENEMY_DATA.boss.paletteHurt);
}

// ---------- FORMATION ----------
// 10 columns x 5 rows = 40 slots.
// Row 0 (top):    8 butterflies + 4 bosses (interleaved as in arcade — 2 bosses center, butterflies flanking)
// Row 1:          butterflies (10)
// Rows 2-4:       bees (10 per row) — but original has 4 bee rows... we use 3 bee rows to total 40 (= 4 boss + 16 butterfly + 20 bee).
//   bosses:    4
//   butterflies: 16  (row 0 flanks + row 1 full)
//   bees:        20  (rows 2,3 = 10 each; we'll keep 2 bee rows to total exactly 40)
// Layout:
//   Row 0: . B b b B B b b B .   (B = boss, b = butterfly; 4 bosses, 4 butterflies — gap at ends)
//   Row 1: b b b b b b b b b b   (10 butterflies)  -> wait that's 14 butterflies, off-target. Recompute.
// Simpler classic-ish split totaling 40:
//   Row 0: 4 bosses centered (cols 3..6)
//   Row 1: 8 butterflies (cols 1..8)
//   Row 2: 8 butterflies (cols 1..8)
//   Row 3: 10 bees
//   Row 4: 10 bees
// Total = 4 + 8 + 8 + 10 + 10 = 40. Good.

const FORMATION_COLS = 10;
const FORMATION_ROWS = 5;
const FORMATION_SPACING_X = 16;
const FORMATION_SPACING_Y = 16;
const FORMATION_TOP_Y = 36;
const FORMATION_SWAY_AMPL = 8;
const FORMATION_SWAY_FREQ = 0.4; // Hz

const Formation = {
  swayPhase: 0,
  centerX: GAME_W / 2,
  sway: 0,

  // Returns { x, y } for slot (col, row). Sway is applied in slotX().
  slotX(col) {
    const totalW = (FORMATION_COLS - 1) * FORMATION_SPACING_X;
    const left = this.centerX - totalW / 2;
    return left + col * FORMATION_SPACING_X - ENEMY_W / 2 + this.sway;
  },
  slotY(row) {
    return FORMATION_TOP_Y + row * FORMATION_SPACING_Y - ENEMY_H / 2;
  },

  update(dt, time) {
    this.swayPhase = time;
    this.sway = Math.sin(time * FORMATION_SWAY_FREQ * Math.PI * 2) * FORMATION_SWAY_AMPL;
  },
};

// Define which slot holds which enemy type. (col, row) -> type or null.
function buildFormationPlan() {
  const plan = [];
  // Row 0: 4 bosses at cols 3,4,5,6
  for (let c = 3; c <= 6; c++) plan.push({ col: c, row: 0, type: 'boss' });
  // Rows 1, 2: butterflies at cols 1..8
  for (let r = 1; r <= 2; r++) {
    for (let c = 1; c <= 8; c++) plan.push({ col: c, row: r, type: 'butterfly' });
  }
  // Rows 3, 4: bees at cols 0..9
  for (let r = 3; r <= 4; r++) {
    for (let c = 0; c <= 9; c++) plan.push({ col: c, row: r, type: 'bee' });
  }
  return plan;
}

// ---------- BEZIER PATH HELPERS ----------
// Quadratic bezier between p0, p1 (control), p2.
function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

// A "path" is an array of bezier segments; each segment is { p0, p1, p2, duration }.
// pathPoint(path, t) where t is total elapsed seconds.
function pathPoint(path, t) {
  let acc = 0;
  for (const seg of path) {
    if (t <= acc + seg.duration) {
      const local = (t - acc) / seg.duration;
      return bezier(seg.p0, seg.p1, seg.p2, local);
    }
    acc += seg.duration;
  }
  // Past the end: return final point.
  const last = path[path.length - 1];
  return { x: last.p2.x, y: last.p2.y };
}

function pathDuration(path) {
  return path.reduce((s, seg) => s + seg.duration, 0);
}

// Five canned entry paths. Each ends near top-center; the linear glide to slot happens after.
function buildEntryPaths() {
  const endPoint = { x: GAME_W / 2, y: 30 };
  return [
    // From bottom-left, swoop up
    [
      { p0: { x: -20, y: GAME_H + 10 }, p1: { x: 40,  y: GAME_H - 40 }, p2: { x: 80,  y: GAME_H / 2 }, duration: 1.2 },
      { p0: { x: 80,  y: GAME_H / 2  }, p1: { x: 120, y: 80           }, p2: endPoint,                 duration: 1.0 },
    ],
    // From bottom-right
    [
      { p0: { x: GAME_W + 20, y: GAME_H + 10 }, p1: { x: GAME_W - 40, y: GAME_H - 40 }, p2: { x: GAME_W - 80, y: GAME_H / 2 }, duration: 1.2 },
      { p0: { x: GAME_W - 80, y: GAME_H / 2 }, p1: { x: GAME_W - 120, y: 80 }, p2: endPoint, duration: 1.0 },
    ],
    // From top-left, loop down then up
    [
      { p0: { x: -20, y: -20 }, p1: { x: 30,  y: 100 }, p2: { x: 90,  y: 150 }, duration: 1.0 },
      { p0: { x: 90,  y: 150 }, p1: { x: 130, y: 60  }, p2: endPoint,           duration: 1.0 },
    ],
    // From top-right, loop down then up
    [
      { p0: { x: GAME_W + 20, y: -20 }, p1: { x: GAME_W - 30, y: 100 }, p2: { x: GAME_W - 90, y: 150 }, duration: 1.0 },
      { p0: { x: GAME_W - 90, y: 150 }, p1: { x: GAME_W - 130, y: 60 }, p2: endPoint, duration: 1.0 },
    ],
    // Straight down from top center then arc
    [
      { p0: { x: GAME_W / 2, y: -20 }, p1: { x: GAME_W / 2 + 40, y: 80 }, p2: { x: GAME_W / 2 + 60, y: 140 }, duration: 1.0 },
      { p0: { x: GAME_W / 2 + 60, y: 140 }, p1: { x: GAME_W / 2 - 30, y: 80 }, p2: endPoint, duration: 1.0 },
    ],
  ];
}

// ---------- ENEMIES ----------
const Enemies = {
  list: [],
  spawnQueue: [],  // { delay, enemy }
  paths: [],
  stage: 1,

  init(stage) {
    if (!ENEMY_DATA.bee.sprite) initEnemySprites();
    this.list = [];
    this.spawnQueue = [];
    this.paths = buildEntryPaths();
    this.stage = stage;

    const plan = buildFormationPlan();
    // Shuffle plan so groups vary
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [plan[i], plan[j]] = [plan[j], plan[i]];
    }

    // Queue enemies in groups of 8, spaced 0.15s within group, 0.6s between groups, alternating paths.
    const groupSize = 8;
    const withinDelay = 0.15;
    const betweenDelay = 0.5;
    let t = 0.6; // initial delay before first arrival
    for (let i = 0; i < plan.length; i++) {
      const groupIdx = Math.floor(i / groupSize);
      const posInGroup = i % groupSize;
      const path = this.paths[groupIdx % this.paths.length];
      const delay = t + groupIdx * betweenDelay + posInGroup * withinDelay;
      const slot = plan[i];
      const data = ENEMY_DATA[slot.type];
      this.spawnQueue.push({
        delay,
        enemy: {
          type: slot.type,
          hp: data.hp,
          col: slot.col,
          row: slot.row,
          mode: 'entering',
          path,
          pathT: 0,
          glideT: 0,
          glideDuration: 0.4,
          glideFromX: 0,
          glideFromY: 0,
          x: 0,
          y: 0,
          diveT: 0,
          divePath: null,
          fireCooldown: 1 + Math.random() * 2,
        },
      });
    }
  },

  update(dt) {
    Formation.update(dt, Game.time);

    // Release queued enemies
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      this.spawnQueue[i].delay -= dt;
      if (this.spawnQueue[i].delay <= 0) {
        this.list.push(this.spawnQueue[i].enemy);
        this.spawnQueue.splice(i, 1);
      }
    }

    for (const e of this.list) {
      if (e.mode === 'entering') {
        e.pathT += dt;
        const dur = pathDuration(e.path);
        if (e.pathT >= dur) {
          // Switch to gliding to slot
          const last = pathPoint(e.path, dur);
          e.glideFromX = last.x - ENEMY_W / 2;
          e.glideFromY = last.y - ENEMY_H / 2;
          e.glideT = 0;
          e.mode = 'gliding';
        } else {
          const p = pathPoint(e.path, e.pathT);
          e.x = p.x - ENEMY_W / 2;
          e.y = p.y - ENEMY_H / 2;
        }
      } else if (e.mode === 'gliding') {
        e.glideT += dt;
        const a = Math.min(e.glideT / e.glideDuration, 1);
        const targetX = Formation.slotX(e.col);
        const targetY = Formation.slotY(e.row);
        e.x = e.glideFromX + (targetX - e.glideFromX) * a;
        e.y = e.glideFromY + (targetY - e.glideFromY) * a;
        if (a >= 1) e.mode = 'formation';
      } else if (e.mode === 'formation') {
        e.x = Formation.slotX(e.col);
        e.y = Formation.slotY(e.row);
      } else if (e.mode === 'diving') {
        e.diveT += dt;
        if (e.diveT < 0) {
          // Escort delay — hold at slot until dive starts
          e.x = Formation.slotX(e.col);
          e.y = Formation.slotY(e.row);
          continue;
        }
        const dur = pathDuration(e.divePath);
        if (e.diveT >= dur) {
          // Returning to slot: simple glide
          e.mode = 'gliding';
          e.glideT = 0;
          e.glideDuration = 0.8;
          const last = pathPoint(e.divePath, dur);
          e.glideFromX = last.x - ENEMY_W / 2;
          e.glideFromY = last.y - ENEMY_H / 2;
        } else {
          const p = pathPoint(e.divePath, e.diveT);
          e.x = p.x - ENEMY_W / 2;
          e.y = p.y - ENEMY_H / 2;
          // Fire occasionally
          e.fireCooldown -= dt;
          if (e.fireCooldown <= 0) {
            const cx = e.x + ENEMY_W / 2;
            const cy = e.y + ENEMY_H;
            // Aim roughly at player
            const dx = (Player.x + Player.sprite.width / 2) - cx;
            const dy = (Player.y) - cy;
            const len = Math.hypot(dx, dy) || 1;
            const speed = 110 + this.stage * 5;
            Bullets.spawnEnemy(cx, cy, (dx / len) * speed, (dy / len) * speed);
            e.fireCooldown = 1.2 + Math.random() * 1.5;
          }
        }
      }
    }
  },

  draw(ctx) {
    for (const e of this.list) {
      const data = ENEMY_DATA[e.type];
      const sprite = (e.type === 'boss' && e.hp < 2) ? data.spriteHurt : data.sprite;
      ctx.drawImage(sprite, e.x | 0, e.y | 0);
    }
  },

  // Used for collision detection
  forEachAlive(fn) {
    for (const e of this.list) fn(e);
  },

  removeAt(idx) {
    this.list.splice(idx, 1);
  },

  allInFormation() {
    if (this.spawnQueue.length) return false;
    return this.list.every(e => e.mode === 'formation');
  },

  count() {
    return this.list.length + this.spawnQueue.length;
  },

  // Trigger a dive on a formation enemy (called by Game.update in PLAY state)
  triggerDive(stage) {
    const eligible = this.list.filter(e => e.mode === 'formation');
    if (!eligible.length) return;
    const leader = eligible[Math.floor(Math.random() * eligible.length)];
    this._startDive(leader, stage);
    Sound.dive();

    // If leader is a boss, bring up to 2 escorts (any adjacent butterflies)
    if (leader.type === 'boss') {
      const escorts = eligible.filter(e =>
        e.type === 'butterfly' &&
        Math.abs(e.col - leader.col) <= 1 &&
        Math.abs(e.row - leader.row) <= 1 &&
        e !== leader
      ).slice(0, 2);
      for (const esc of escorts) this._startDive(esc, stage, 0.3);
    }
  },

  _startDive(e, stage, delayPathT = 0) {
    // Build a dive path: from current slot down past the player and off-screen, then re-enter from top.
    const startX = e.x + ENEMY_W / 2;
    const startY = e.y + ENEMY_H / 2;
    const playerX = (Player && Player.alive) ? Player.x + Player.sprite.width / 2 : GAME_W / 2;
    const speed = 1.0 - Math.min(stage - 1, 5) * 0.06; // dives get faster each stage (smaller duration)
    e.divePath = [
      { p0: { x: startX, y: startY },
        p1: { x: startX + (playerX - startX) * 0.4, y: startY + 60 },
        p2: { x: playerX, y: GAME_H - 30 },
        duration: 1.4 * speed },
      { p0: { x: playerX, y: GAME_H - 30 },
        p1: { x: playerX + (startX < GAME_W / 2 ? 60 : -60), y: GAME_H + 30 },
        p2: { x: startX > GAME_W / 2 ? GAME_W + 20 : -20, y: -20 },
        duration: 1.2 * speed },
      { p0: { x: startX > GAME_W / 2 ? GAME_W + 20 : -20, y: -20 },
        p1: { x: startX, y: -10 },
        p2: { x: startX, y: startY },
        duration: 0.8 * speed },
    ];
    e.diveT = -delayPathT;
    e.mode = 'diving';
    e.fireCooldown = 0.6 + Math.random() * 0.4;
  },
};
