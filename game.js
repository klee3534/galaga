const GAME_W = 224;
const GAME_H = 288;

const STATE = {
  ATTRACT: 'attract',
  STAGE_INTRO: 'stage_intro',
  PLAY: 'play',
  STAGE_CLEAR: 'stage_clear',
  GAME_OVER: 'game_over',
};

const COLORS = {
  red:    '#ff2a2a',
  white:  '#ffffff',
  yellow: '#ffd83d',
  blue:   '#3d6bff',
  cyan:   '#3dffff',
  green:  '#54ff54',
  gray:   '#888888',
};

// ---------- SOUND ----------
// Synthesized approximations of the Namco WSG sounds from the original
// 1981 Galaga arcade. AudioContext is created lazily on first user
// interaction (browsers block autoplay until then).
const Sound = {
  ctx: null,
  masterGain: null,
  muted: false,
  _lastDiveSrc: null,

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.40;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },

  // Schedule a square-wave note with quick attack and a held sustain.
  _note(freq, duration, gain, startT, type) {
    const t = startT;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.setValueAtTime(gain, t + duration * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);
    return { osc, g };
  },

  // Filtered white noise with a decaying envelope.
  _noise(duration, gainPeak, filterStart, filterEnd, filterType) {
    const t = this.ctx.currentTime;
    const len = Math.max(1, (this.ctx.sampleRate * duration) | 0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // 1-bit (binary) quantized noise — closer to the chip-tune character
    // than a full-range Math.random() floor.
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() < 0.5 ? -0.85 : 0.85) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(filterStart, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(filterEnd, 20), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainPeak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(this.masterGain);
    src.start(t);
    return src;
  },

  // --- Player fire: very short, snappy descending pulse ---
  // Original Galaga shot: ~30 ms, sharp downward pitch slide, square wave.
  fire() {
    if (this.muted || !this.ensureCtx()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2200, t);
    osc.frequency.exponentialRampToValueAtTime(500, t + 0.03);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.045);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.06);
  },

  // --- Boss hit (took damage, still alive) ---
  enemyHit() {
    if (this.muted || !this.ensureCtx()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.06);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  },

  // --- Enemy explosion: short "bloop" — noise burst + low pitched thud ---
  enemyExplode() {
    if (this.muted || !this.ensureCtx()) return;
    const t = this.ctx.currentTime;
    this._noise(0.18, 0.35, 2000, 150);
    // Low pitched square thud underneath
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  },

  // --- Player explosion: long descending whine + filtered noise ---
  playerExplode() {
    if (this.muted || !this.ensureCtx()) return;
    const t = this.ctx.currentTime;
    this._noise(0.95, 0.45, 1200, 40);
    // Descending sawtooth whine
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.9);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 1.0);
  },

  // --- Dive: classic Galaga warbling alarm.
  // Rapidly alternates between two pitches for the dive duration.
  // Suppresses overlap so multiple simultaneous dives don't stack the sound.
  dive() {
    if (this.muted || !this.ensureCtx()) return;
    // If a previous dive is still playing, let it continue (don't kill abruptly)
    // but don't stack a new one too quickly.
    if (this._lastDiveSrc && this._lastDiveSrc._until > this.ctx.currentTime - 0.15) return;

    const t = this.ctx.currentTime;
    const duration = 0.75;
    const stepLen = 0.045;  // ~22 Hz warble
    const fHigh = 880;
    const fLow  = 520;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(fHigh, t);
    for (let i = 0; i * stepLen < duration; i++) {
      const f = i % 2 === 0 ? fHigh : fLow;
      osc.frequency.setValueAtTime(f, t + i * stepLen);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.01);
    g.gain.setValueAtTime(0.13, t + duration - 0.08);
    g.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + duration + 0.02);

    osc._until = t + duration;
    this._lastDiveSrc = osc;
  },

  // --- Stage start: ascending arpeggio fanfare in chip-tune style ---
  stageStart() {
    if (this.muted || !this.ensureCtx()) return;
    let t = this.ctx.currentTime;
    // Ascending C major arpeggio, twice (low octave, then high)
    const seq = [
      { f: 523.25, d: 0.09, gain: 0.16 }, // C5
      { f: 659.25, d: 0.09, gain: 0.16 }, // E5
      { f: 783.99, d: 0.09, gain: 0.16 }, // G5
      { f: 1046.5, d: 0.18, gain: 0.16 }, // C6
      { f: 0,      d: 0.05, gain: 0    }, // rest
      { f: 783.99, d: 0.09, gain: 0.16 }, // G5
      { f: 1046.5, d: 0.09, gain: 0.16 }, // C6
      { f: 1318.5, d: 0.09, gain: 0.16 }, // E6
      { f: 1568.0, d: 0.28, gain: 0.18 }, // G6 held
    ];
    for (const n of seq) {
      if (n.f > 0) this._note(n.f, n.d, n.gain, t);
      t += n.d;
    }
  },

  // --- Stage clear: bright ascending arpeggio ---
  stageClear() {
    if (this.muted || !this.ensureCtx()) return;
    let t = this.ctx.currentTime;
    const notes = [659.25, 987.77, 1318.5, 1568.0]; // E G# B D# style ascending
    for (const f of notes) {
      this._note(f, 0.16, 0.17, t);
      t += 0.10;
    }
    // Final accent
    this._note(1975.5, 0.30, 0.18, t);
  },

  // --- Game over: descending solemn tones ---
  gameOver() {
    if (this.muted || !this.ensureCtx()) return;
    let t = this.ctx.currentTime;
    const seq = [
      { f: 523.25, d: 0.20 },
      { f: 466.16, d: 0.20 },
      { f: 392.00, d: 0.20 },
      { f: 311.13, d: 0.55 },
    ];
    for (const n of seq) {
      this._note(n.f, n.d, 0.20, t, 'triangle');
      t += n.d;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (!this.muted) this.ensureCtx();
  },
};

// ---------- INPUT ----------
const Input = {
  keys: new Set(),
  pressed: new Set(),
  init() {
    const block = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space']);
    window.addEventListener('keydown', e => {
      if (block.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  },
  left()        { return this.keys.has('ArrowLeft')  || this.keys.has('KeyA'); },
  right()       { return this.keys.has('ArrowRight') || this.keys.has('KeyD'); },
  fire()        { return this.keys.has('Space')      || this.keys.has('KeyW'); },
  firePressed() { return this.pressed.has('Space')   || this.pressed.has('KeyW'); },
  endFrame()    { this.pressed.clear(); },
};

// ---------- STARFIELD ----------
const STAR_PALETTE = [
  '#ffffff', '#ff5a5a', '#5aaaff', '#5affff',
  '#ff5aff', '#ffff5a', '#5aff5a', '#ffaa5a',
];

const Stars = {
  list: [],
  init() {
    const layers = [
      { count: 35, speed: 6  },
      { count: 30, speed: 12 },
      { count: 20, speed: 22 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.count; i++) {
        this.list.push({
          x: Math.floor(Math.random() * GAME_W),
          y: Math.floor(Math.random() * GAME_H),
          color: STAR_PALETTE[(Math.random() * STAR_PALETTE.length) | 0],
          speed: L.speed,
          blinkRate: 0.6 + Math.random() * 2.4,
          blinkPhase: Math.random() * Math.PI * 2,
        });
      }
    }
  },
  update(dt) {
    for (const s of this.list) {
      s.y += s.speed * dt;
      if (s.y >= GAME_H) {
        s.y = 0;
        s.x = Math.floor(Math.random() * GAME_W);
        s.color = STAR_PALETTE[(Math.random() * STAR_PALETTE.length) | 0];
      }
    }
  },
  draw(ctx, time) {
    for (const s of this.list) {
      const a = (Math.sin(time * s.blinkRate + s.blinkPhase) + 1) * 0.5;
      if (a < 0.25) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
    }
    ctx.globalAlpha = 1;
  },
};

// ---------- SPRITE HELPER ----------
function makeSprite(rows, palette) {
  const w = rows[0].length;
  const h = rows.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = palette[rows[y][x]];
      if (col) {
        cx.fillStyle = col;
        cx.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

// ---------- PLAYER ----------
const PLAYER_Y          = GAME_H - 32;
const PLAYER_SPEED      = 110;
const BULLET_SPEED      = 340;
const PLAYER_BULLET_MAX = 2;
const FIRE_COOLDOWN     = 0.08;
const DEATH_PAUSE       = 1.5;
const INVINCIBLE_TIME   = 1.5;

const Player = {
  sprite: null,
  x: 0,
  y: PLAYER_Y,
  alive: true,
  cooldown: 0,
  deathTimer: 0,
  invincibleTimer: 0,

  init() {
    this.sprite = makeSprite([
      '......W......',
      '......W......',
      '.....WWW.....',
      '.....WRW.....',
      '.....WRW.....',
      '..W..WWW..W..',
      '.WW.WWWWW.WW.',
      '.WWWWWWWWWWW.',
      'WWWWWWWWWWWWW',
      'WWWWWWWWWWWWW',
      'WW.WW.W.WW.WW',
      '.W..W...W..W.',
    ], { W: COLORS.white, R: COLORS.red, '.': null });
    this.reset();
  },

  reset() {
    this.x = (GAME_W - this.sprite.width) / 2;
    this.alive = true;
    this.deathTimer = 0;
    this.invincibleTimer = INVINCIBLE_TIME;
    this.cooldown = 0;
  },

  die() {
    if (!this.alive || this.invincibleTimer > 0) return;
    this.alive = false;
    this.deathTimer = 0;
    Explosions.spawn(this.x + this.sprite.width / 2, this.y + 6, 'player');
    Sound.playerExplode();
    HUD.lives--;
  },

  update(dt) {
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;

    if (!this.alive) {
      this.deathTimer += dt;
      if (this.deathTimer >= DEATH_PAUSE) {
        if (HUD.lives > 0) {
          this.reset();
        } else {
          Game.setState(STATE.GAME_OVER);
        }
      }
      return;
    }

    if (Input.left())  this.x -= PLAYER_SPEED * dt;
    if (Input.right()) this.x += PLAYER_SPEED * dt;
    const min = 4;
    const max = GAME_W - this.sprite.width - 4;
    if (this.x < min) this.x = min;
    if (this.x > max) this.x = max;

    this.cooldown -= dt;
    if (Input.firePressed() &&
        this.cooldown <= 0 &&
        Bullets.player.length < PLAYER_BULLET_MAX) {
      Bullets.spawnPlayer(this.x + this.sprite.width / 2, this.y);
      this.cooldown = FIRE_COOLDOWN;
    }
  },

  draw(ctx) {
    if (!this.alive) return;
    // Blink during invincibility
    if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 10) % 2 === 0) return;
    ctx.drawImage(this.sprite, this.x | 0, this.y | 0);
  },
};

// ---------- BULLETS ----------
const Bullets = {
  player: [],
  enemy: [],

  spawnPlayer(x, y) {
    this.player.push({ x: x - 1, y: y - 6, w: 2, h: 6 });
    Sound.fire();
  },

  spawnEnemy(x, y, vx, vy) {
    this.enemy.push({ x: x - 1, y, w: 2, h: 6, vx, vy });
  },

  update(dt) {
    for (let i = this.player.length - 1; i >= 0; i--) {
      const b = this.player[i];
      b.y -= BULLET_SPEED * dt;
      if (b.y + b.h < 0) this.player.splice(i, 1);
    }
    for (let i = this.enemy.length - 1; i >= 0; i--) {
      const b = this.enemy[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > GAME_H || b.y < -10 || b.x < -10 || b.x > GAME_W + 10) {
        this.enemy.splice(i, 1);
      }
    }
  },

  draw(ctx) {
    ctx.fillStyle = COLORS.white;
    for (const b of this.player) ctx.fillRect(b.x | 0, b.y | 0, b.w, b.h);
    ctx.fillStyle = COLORS.yellow;
    for (const b of this.enemy) ctx.fillRect(b.x | 0, b.y | 0, b.w, b.h);
  },

  reset() {
    this.player.length = 0;
    this.enemy.length = 0;
  },
};

// ---------- EXPLOSIONS ----------
const Explosions = {
  list: [],

  spawn(x, y, kind) {
    this.list.push({
      x, y, kind,
      t: 0,
      duration: kind === 'player' ? 0.8 : 0.4,
    });
  },

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].t += dt;
      if (this.list[i].t >= this.list[i].duration) this.list.splice(i, 1);
    }
  },

  draw(ctx) {
    for (const e of this.list) {
      const p = e.t / e.duration;
      const baseR = e.kind === 'player' ? 12 : 6;
      const radius = baseR * Math.sin(p * Math.PI);
      const color = p < 0.33 ? COLORS.yellow : p < 0.66 ? COLORS.red : COLORS.gray;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, Math.max(1, radius), 0, Math.PI * 2);
      ctx.fill();
      if (p < 0.5) {
        const sl = radius * 1.5;
        ctx.fillStyle = COLORS.white;
        ctx.fillRect(e.x - sl, e.y, sl * 2, 1);
        ctx.fillRect(e.x, e.y - sl, 1, sl * 2);
      }
    }
  },

  reset() { this.list.length = 0; },
};

// ---------- COLLISIONS ----------
function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

const Collisions = {
  check() {
    // Player bullets vs enemies (any mode — you can shoot entering/diving enemies)
    for (let bi = Bullets.player.length - 1; bi >= 0; bi--) {
      const b = Bullets.player[bi];
      for (let ei = Enemies.list.length - 1; ei >= 0; ei--) {
        const e = Enemies.list[ei];
        if (rectOverlap(b.x, b.y, b.w, b.h, e.x, e.y, ENEMY_W, ENEMY_H)) {
          Bullets.player.splice(bi, 1);
          e.hp--;
          if (e.hp <= 0) {
            const data = ENEMY_DATA[e.type];
            const pts = e.mode === 'diving' ? data.divingPts : data.formationPts;
            HUD.addScore(pts);
            Explosions.spawn(e.x + ENEMY_W / 2, e.y + ENEMY_H / 2, 'enemy');
            Sound.enemyExplode();
            Enemies.list.splice(ei, 1);
          } else {
            Sound.enemyHit();
          }
          break;
        }
      }
    }

    if (!Player.alive || Player.invincibleTimer > 0) return;
    const pw = Player.sprite.width, ph = Player.sprite.height;

    // Enemy bullets vs player
    for (let bi = Bullets.enemy.length - 1; bi >= 0; bi--) {
      const b = Bullets.enemy[bi];
      if (rectOverlap(b.x, b.y, b.w, b.h, Player.x, Player.y, pw, ph)) {
        Bullets.enemy.splice(bi, 1);
        Player.die();
        return;
      }
    }

    // Diving enemies vs player (kamikaze)
    for (let ei = Enemies.list.length - 1; ei >= 0; ei--) {
      const e = Enemies.list[ei];
      if (e.mode !== 'diving') continue;
      if (rectOverlap(Player.x, Player.y, pw, ph, e.x, e.y, ENEMY_W, ENEMY_H)) {
        Explosions.spawn(e.x + ENEMY_W / 2, e.y + ENEMY_H / 2, 'enemy');
        Sound.enemyExplode();
        Enemies.list.splice(ei, 1);
        Player.die();
        return;
      }
    }
  },
};

// ---------- HUD ----------
const HUD = {
  score: 0,
  highScore: 20000,
  lives: 3,
  stage: 1,

  reset() {
    this.score = 0;
    this.lives = 3;
    this.stage = 1;
  },

  addScore(pts) {
    this.score += pts;
    if (this.score > this.highScore) this.highScore = this.score;
  },

  draw(ctx) {
    ctx.font = '8px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    ctx.fillStyle = COLORS.red;
    ctx.fillText('1UP',         8, 4);
    ctx.fillText('HIGH SCORE',  GAME_W / 2 - 20, 4);

    ctx.fillStyle = COLORS.white;
    drawNumRight(ctx, this.score,     34,            14);
    drawNumRight(ctx, this.highScore, GAME_W / 2 + 28, 14);

    for (let i = 0; i < this.lives - 1; i++) {
      drawLifeIcon(ctx, 4 + i * 14, GAME_H - 14);
    }

    drawStageFlags(ctx, GAME_W - 4, GAME_H - 14, this.stage);
  },
};

function drawNumRight(ctx, n, rightX, y) {
  const s = String(n).padStart(2, '0');
  const w = s.length * 6;
  ctx.fillText(s, rightX - w, y);
}

function drawLifeIcon(ctx, x, y) {
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(x + 6, y,     1, 2);
  ctx.fillRect(x + 5, y + 2, 3, 2);
  ctx.fillRect(x + 2, y + 4, 9, 2);
  ctx.fillRect(x,     y + 6, 13, 2);
  ctx.fillRect(x + 1, y + 8, 3, 2);
  ctx.fillRect(x + 9, y + 8, 3, 2);

  ctx.fillStyle = COLORS.red;
  ctx.fillRect(x + 6, y + 4, 1, 2);
  ctx.fillRect(x + 5, y + 8, 3, 1);
}

function drawStageFlags(ctx, rightX, y, stage) {
  const n = Math.min(stage, 5);
  for (let i = 0; i < n; i++) {
    const fx = rightX - (i + 1) * 11;
    drawFlag(ctx, fx, y);
  }
}

function drawFlag(ctx, x, y) {
  ctx.fillStyle = '#444';
  ctx.fillRect(x, y, 1, 10);
  ctx.fillStyle = COLORS.yellow;
  ctx.fillRect(x + 1, y, 8, 6);
  ctx.fillStyle = COLORS.red;
  ctx.fillRect(x + 2, y + 1, 2, 4);
  ctx.fillRect(x + 5, y + 1, 1, 4);
}

// ---------- GAME ----------
const Game = {
  state: STATE.ATTRACT,
  stateTimer: 0,
  diveTimer: 0,
  ctx: null,
  canvas: null,
  lastTime: 0,
  time: 0,
  fps: 0,
  _fpsFrames: 0,
  _fpsTime: 0,
  showFps: false,

  init() {
    this.canvas = document.getElementById('game');
    this.canvas.width = GAME_W;
    this.canvas.height = GAME_H;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    Input.init();
    Stars.init();
    Player.init();

    window.addEventListener('keydown', e => {
      if (e.code === 'F1') this.showFps = !this.showFps;
      if (e.code === 'KeyM') Sound.toggleMute();
    });

    this.setState(STATE.ATTRACT);

    this.lastTime = performance.now();
    requestAnimationFrame(t => this.loop(t));
  },

  setState(s) {
    this.state = s;
    this.stateTimer = 0;

    if (s === STATE.ATTRACT) {
      Bullets.reset();
      Explosions.reset();
      Enemies.list = [];
      Enemies.spawnQueue = [];
    } else if (s === STATE.STAGE_INTRO) {
      Bullets.reset();
      Explosions.reset();
      Player.reset();
      Enemies.init(HUD.stage);
      this.diveTimer = 3.5;
      Sound.stageStart();
    } else if (s === STATE.STAGE_CLEAR) {
      Sound.stageClear();
    } else if (s === STATE.GAME_OVER) {
      Sound.gameOver();
    }
  },

  loop(t) {
    const dt = Math.min((t - this.lastTime) / 1000, 1 / 30);
    this.lastTime = t;
    this.time += dt;
    this.stateTimer += dt;

    this._fpsFrames++;
    this._fpsTime += dt;
    if (this._fpsTime >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsTime);
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }

    this.update(dt);
    this.draw();
    Input.endFrame();
    requestAnimationFrame(t2 => this.loop(t2));
  },

  update(dt) {
    Stars.update(dt);

    switch (this.state) {
      case STATE.ATTRACT:
        if (Input.firePressed()) {
          HUD.reset();
          this.setState(STATE.STAGE_INTRO);
        }
        break;

      case STATE.STAGE_INTRO:
        Player.update(dt);
        Bullets.update(dt);
        Enemies.update(dt);
        Explosions.update(dt);
        Collisions.check();
        if (this.stateTimer >= 1.8 && Enemies.allInFormation()) {
          this.setState(STATE.PLAY);
        }
        break;

      case STATE.PLAY:
        Player.update(dt);
        Bullets.update(dt);
        Enemies.update(dt);
        Explosions.update(dt);
        Collisions.check();

        if (Player.alive) {
          this.diveTimer -= dt;
          if (this.diveTimer <= 0) {
            Enemies.triggerDive(HUD.stage);
            this.diveTimer = Math.max(0.8, 2.5 - HUD.stage * 0.2);
          }
        }

        if (Enemies.count() === 0 && Player.alive) {
          this.setState(STATE.STAGE_CLEAR);
        }
        break;

      case STATE.STAGE_CLEAR:
        Explosions.update(dt);
        Bullets.update(dt);
        if (this.stateTimer >= 2.5) {
          HUD.stage++;
          this.setState(STATE.STAGE_INTRO);
        }
        break;

      case STATE.GAME_OVER:
        Explosions.update(dt);
        Bullets.update(dt);
        if (this.stateTimer >= 4) {
          this.setState(STATE.ATTRACT);
        }
        break;
    }
  },

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    Stars.draw(ctx, this.time);

    if (this.state !== STATE.ATTRACT) {
      Enemies.draw(ctx);
      Bullets.draw(ctx);
      Player.draw(ctx);
      Explosions.draw(ctx);
    }

    HUD.draw(ctx);

    if (this.state === STATE.ATTRACT) {
      this.drawAttract(ctx);
    } else if (this.state === STATE.STAGE_INTRO) {
      this.drawCenteredText(ctx, `STAGE ${HUD.stage}`, COLORS.cyan, 60);
    } else if (this.state === STATE.STAGE_CLEAR) {
      this.drawCenteredText(ctx, 'STAGE CLEAR', COLORS.yellow, 0);
    } else if (this.state === STATE.GAME_OVER) {
      this.drawCenteredText(ctx, 'GAME OVER', COLORS.red, 0);
    }

    if (this.showFps) {
      ctx.fillStyle = COLORS.green;
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`FPS ${this.fps}`, GAME_W - 42, GAME_H - 26);
    }

    if (Sound.muted) {
      ctx.fillStyle = COLORS.gray;
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('MUTE', GAME_W - 28, 4);
    }
  },

  drawAttract(ctx) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = COLORS.red;
    ctx.fillText('GALAGA', GAME_W / 2, GAME_H / 2 - 30);

    ctx.font = '8px monospace';
    ctx.fillStyle = COLORS.white;
    ctx.fillText('AUTHENTIC RETRO', GAME_W / 2, GAME_H / 2 + 4);

    if (Math.floor(this.time * 2) % 2 === 0) {
      ctx.fillStyle = COLORS.yellow;
      ctx.fillText('PUSH SPACE', GAME_W / 2, GAME_H / 2 + 28);
    }

    ctx.fillStyle = COLORS.cyan;
    ctx.fillText('ARROWS = MOVE   SPACE = FIRE', GAME_W / 2, GAME_H - 36);
    ctx.fillStyle = COLORS.gray;
    ctx.fillText('M = MUTE   F1 = FPS', GAME_W / 2, GAME_H - 24);
  },

  drawCenteredText(ctx, text, color, offsetY = 0) {
    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, GAME_W / 2, GAME_H / 2 + offsetY);
    if (this.state === STATE.GAME_OVER) {
      ctx.font = '8px monospace';
      ctx.fillStyle = COLORS.white;
      ctx.fillText(`SCORE  ${HUD.score}`, GAME_W / 2, GAME_H / 2 + 20);
    }
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
