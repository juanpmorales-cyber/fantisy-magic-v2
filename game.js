const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W, H, dpr;
let player;
let enemies = [];
let projectiles = [];
let particles = [];
let floatingTexts = [];
let keys = {};
let mouse = { x: 0, y: 0, down: false };
let hp = 100, mana = 100, xp = 0, level = 1;
let score = 0, kills = 0, wave = 1;
let gameOver = false, paused = false;
let spawnTimer = 1.2, castCooldown = 0;
let spellCooldowns = { fire: 0, nova: 0, blink: 0, frost: 0, lightning: 0, meteor: 0, ward: 0 };
let shieldTimer = 0;
let shake = 0, bannerTimer = 0, last = performance.now();

const MAX_HP = 100;
const MAX_MANA = 100;
const XP_PER_LEVEL = 100;

const monsterTypes = [
  { name: "Imp", color: "#8d3138", glow: "#ff5a5f", hp: 60, speed: 54, damage: 8, radius: 19, xp: 22 },
  { name: "Ghoul", color: "#46634e", glow: "#9dd7a7", hp: 95, speed: 38, damage: 12, radius: 23, xp: 32 },
  { name: "Wraith", color: "#51438b", glow: "#ae9cff", hp: 72, speed: 72, damage: 10, radius: 18, xp: 30 }
];

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!mouse.x) {
    mouse.x = W / 2;
    mouse.y = H / 2;
  }
  if (player) {
    player.x = Math.max(36, Math.min(W - 36, player.x));
    player.y = Math.max(36, Math.min(H - 36, player.y));
  }
}
window.addEventListener("resize", resize);
resize();

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) e.preventDefault();
  if (gameOver && key === "r") reset();
  if (!gameOver && key === "p") paused = !paused;
  if (!gameOver && key === "1") cast("fire");
  if (!gameOver && key === "2") cast("nova");
  if (!gameOver && key === "3") cast("blink");
  if (!gameOver && key === "4") cast("frost");
  if (!gameOver && key === "5") cast("lightning");
  if (!gameOver && key === "6") cast("meteor");
  if (!gameOver && key === "7") cast("ward");
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener("mousedown", (e) => { if (e.button === 0) { mouse.down = true; cast("fire"); } });
window.addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
window.addEventListener("blur", () => { mouse.down = false; keys = {}; });

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function addFloat(x, y, text, color = "#fff") { floatingTexts.push({ x, y, text, color, life: 1 }); }

function reset() {
  hp = MAX_HP;
  mana = MAX_MANA;
  xp = 0;
  level = 1;
  score = 0;
  kills = 0;
  wave = 1;
  gameOver = false;
  paused = false;
  spawnTimer = 1.1;
  castCooldown = 0;
  spellCooldowns = { fire: 0, nova: 0, blink: 0, frost: 0, lightning: 0, meteor: 0, ward: 0 };
  shieldTimer = 0;
  shake = 0;
  bannerTimer = 2.2;
  enemies = [];
  projectiles = [];
  particles = [];
  floatingTexts = [];
  player = { x: W / 2, y: H / 2, r: 18, speed: 220, facing: 0 };
  for (let i = 0; i < 5; i++) spawnEnemy(true);
  updateHud();
}

function spawnEnemy(initial = false) {
  const type = monsterTypes[Math.floor(Math.random() * monsterTypes.length)];
  const side = Math.floor(Math.random() * 4);
  const pad = 45;
  let x, y;
  if (side === 0) { x = -pad; y = Math.random() * H; }
  else if (side === 1) { x = W + pad; y = Math.random() * H; }
  else if (side === 2) { x = Math.random() * W; y = -pad; }
  else { x = Math.random() * W; y = H + pad; }

  const scale = 1 + (wave - 1) * 0.1;
  enemies.push({
    ...type,
    x, y,
    hp: Math.round(type.hp * scale),
    maxHp: Math.round(type.hp * scale),
    speed: type.speed * (1 + Math.min(.28, (wave - 1) * .025)),
    attack: initial ? .7 : Math.random(),
    hit: 0,
    slow: 1,
    wobble: Math.random() * Math.PI * 2
  });
}

function burst(x, y, count = 14, color = "#ffbe48", power = 130) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 30 + Math.random() * power;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .45 + Math.random() * .55, size: 2 + Math.random() * 4, color });
  }
}

function readySpell(type, manaCost, cooldown) {
  if (mana < manaCost || spellCooldowns[type] > 0) return false;
  mana -= manaCost;
  spellCooldowns[type] = cooldown;
  return true;
}

function cast(type) {
  if (gameOver || paused || !player) return;

  if (type === "fire") {
    if (!readySpell("fire", 12, .15)) return;
    const a = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    player.facing = a;
    projectiles.push({ kind: "fire", x: player.x + Math.cos(a) * 28, y: player.y + Math.sin(a) * 28,
      vx: Math.cos(a) * 610, vy: Math.sin(a) * 610, r: 8, damage: 34 + level * 3, life: 1.8 });
    burst(player.x + Math.cos(a) * 25, player.y + Math.sin(a) * 25, 5, "#ffd36b", 55);
  }

  if (type === "nova") {
    if (!readySpell("nova", 35, .35)) return;
    const radius = 135 + level * 4;
    let hits = 0;
    for (const e of enemies) {
      if (dist(player.x, player.y, e.x, e.y) < radius + e.radius) {
        e.hp -= 52 + level * 5; e.hit = .16; hits++;
      }
    }
    burst(player.x, player.y, 56, "#b58cff", 230);
    shockwave(radius);
    addFloat(player.x, player.y - 40, hits ? `ARCANE NOVA ×${hits}` : "ARCANE NOVA", "#d8c4ff");
    shake = .18;
  }

  if (type === "blink") {
    if (!readySpell("blink", 25, .45)) return;
    const a = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const oldX = player.x, oldY = player.y;
    player.x = clamp(player.x + Math.cos(a) * 150, 30, W - 30);
    player.y = clamp(player.y + Math.sin(a) * 150, 30, H - 30);
    burst(oldX, oldY, 22, "#7de7ff", 120); burst(player.x, player.y, 22, "#7de7ff", 120);
    addFloat(player.x, player.y - 32, "BLINK", "#9af0ff");
  }

  if (type === "frost") {
    if (!readySpell("frost", 18, .38)) return;
    const a = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    player.facing = a;
    projectiles.push({ kind: "frost", x: player.x + Math.cos(a) * 28, y: player.y + Math.sin(a) * 28,
      vx: Math.cos(a) * 500, vy: Math.sin(a) * 500, r: 9, damage: 28 + level * 2, life: 2.1 });
    burst(player.x + Math.cos(a) * 25, player.y + Math.sin(a) * 25, 8, "#a7edff", 70);
  }

  if (type === "lightning") {
    if (!readySpell("lightning", 30, 1.1)) return;
    const maxTargets = 3 + Math.floor(level / 4);
    const range = 360;
    const targets = enemies
      .filter(e => dist(player.x, player.y, e.x, e.y) <= range)
      .sort((a,b) => dist(player.x, player.y, a.x, a.y) - dist(player.x, player.y, b.x, b.y))
      .slice(0, maxTargets);
    for (const e of targets) {
      e.hp -= 42 + level * 4; e.hit = .25;
      particles.push({ type: "bolt", x1: player.x, y1: player.y, x2: e.x, y2: e.y, life: .18, color: "#d9f3ff" });
      burst(e.x, e.y, 12, "#c3f0ff", 120);
    }
    addFloat(player.x, player.y - 40, targets.length ? `CHAIN LIGHTNING ×${targets.length}` : "NO TARGET", "#d9f3ff");
    shake = .1;
  }

  if (type === "meteor") {
    if (!readySpell("meteor", 45, 1.5)) return;
    projectiles.push({ kind: "meteor", x: clamp(mouse.x, 50, W - 50), y: clamp(mouse.y, 50, H - 50),
      timer: .65, life: .65, r: 18, damage: 95 + level * 8 });
    shockwaveTarget(clamp(mouse.x, 50, W - 50), clamp(mouse.y, 50, H - 50), 88);
    addFloat(mouse.x, mouse.y - 30, "METEOR", "#ffc36d");
  }

  if (type === "ward") {
    if (!readySpell("ward", 28, 8)) return;
    shieldTimer = 3.5;
    burst(player.x, player.y, 34, "#e8c8ff", 170);
    shockwave(58);
    addFloat(player.x, player.y - 40, "ARCANE WARD", "#ebd7ff");
  }
}
function shockwave(radius) {
  particles.push({ type: "ring", x: player.x, y: player.y, radius: 10, max: radius, life: .5, color: "#b58cff" });
}

function shockwaveTarget(x, y, radius) {
  particles.push({ type: "ring", x, y, radius: 8, max: radius, life: .65, color: "#ff9e4a" });
}

function levelUp() {
  level++;
  hp = MAX_HP;
  mana = MAX_MANA;
  wave = 1 + Math.floor((level - 1) / 2);
  bannerTimer = 2.5;
  addFloat(player.x, player.y - 48, `LEVEL ${level}!`, "#ffe28a");
  burst(player.x, player.y, 45, "#ffe28a", 220);
}

function damagePlayer(amount) {
  if (shieldTimer > 0) { addFloat(player.x, player.y - 28, "BLOCKED", "#ecd7ff"); burst(player.x, player.y, 8, "#e8c8ff", 70); return; }
  hp -= amount;
  shake = Math.max(shake, .12);
  burst(player.x, player.y, 10, "#ff6868", 90);
  addFloat(player.x, player.y - 28, `-${amount}`, "#ff8a8a");
}

function update(dt) {
  if (gameOver || paused) return;

  castCooldown = Math.max(0, castCooldown - dt);
  for (const key of Object.keys(spellCooldowns)) spellCooldowns[key] = Math.max(0, spellCooldowns[key] - dt);
  shieldTimer = Math.max(0, shieldTimer - dt);
  bannerTimer = Math.max(0, bannerTimer - dt);
  shake = Math.max(0, shake - dt);
  mana = Math.min(MAX_MANA, mana + (9 + level * .45) * dt);

  let dx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let dy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  const len = Math.hypot(dx, dy) || 1;
  const sprinting = keys.shift;
  const speed = player.speed * (sprinting ? 1.45 : 1);
  player.x = clamp(player.x + dx / len * speed * dt, 28, W - 28);
  player.y = clamp(player.y + dy / len * speed * dt, 28, H - 28);

  player.facing = Math.atan2(mouse.y - player.y, mouse.x - player.x);
  if (mouse.down) cast("fire");

  for (const p of projectiles) {
    if (p.kind === "meteor") {
      p.life -= dt; p.timer -= dt;
      if (p.timer <= 0 && !p.exploded) {
        p.exploded = true;
        const radius = 92 + level * 2;
        for (const e of enemies) {
          if (dist(p.x, p.y, e.x, e.y) < radius + e.radius) { e.hp -= p.damage; e.hit = .22; }
        }
        burst(p.x, p.y, 70, "#ff9d45", 260);
        shockwaveTarget(p.x, p.y, radius);
        shake = .24;
      }
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }

  for (const e of enemies) {
    e.attack -= dt;
    e.hit = Math.max(0, e.hit - dt);
    e.wobble += dt * 4;
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    const d = dist(player.x, player.y, e.x, e.y);
    if (d > player.r + e.radius + 5) {
      const sway = Math.sin(e.wobble) * 7;
      e.x += (Math.cos(a) * e.speed * e.slow + Math.cos(a + Math.PI / 2) * sway) * dt;
      e.y += (Math.sin(a) * e.speed * e.slow + Math.sin(a + Math.PI / 2) * sway) * dt;
    }
    if (d < player.r + e.radius + 4 && e.attack <= 0) {
      damagePlayer(e.damage);
      e.attack = 1.05;
    }
    e.slow += (1 - e.slow) * Math.min(1, dt * 5);
  }

  for (const f of projectiles) {
    if (f.life <= 0) continue;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (dist(f.x, f.y, e.x, e.y) < f.r + e.radius) {
        e.hp -= f.damage;
        e.hit = .12;
        if (f.kind === "frost") e.slow = .28;
        f.life = 0;
        burst(f.x, f.y, 18, f.kind === "frost" ? "#a7edff" : e.glow, 135);
        addFloat(e.x, e.y - e.radius - 8, `${f.damage}`, "#ffd99a");
        shake = Math.max(shake, .06);
        break;
      }
    }
  }

  const dead = enemies.filter(e => e.hp <= 0);
  if (dead.length) {
    for (const e of dead) {
      xp += e.xp;
      score += e.xp * 10;
      kills++;
      burst(e.x, e.y, 26, e.glow, 170);
      addFloat(e.x, e.y - 34, `+${e.xp} XP`, "#b8ffb0");
    }
    enemies = enemies.filter(e => e.hp > 0);
    while (xp >= XP_PER_LEVEL) {
      xp -= XP_PER_LEVEL;
      levelUp();
    }
  }

  spawnTimer -= dt;
  const maxEnemies = Math.min(18, 7 + wave * 2);
  if (spawnTimer <= 0 && enemies.length < maxEnemies) {
    spawnEnemy();
    spawnTimer = Math.max(.72, 2.25 - wave * .09);
  }

  projectiles = projectiles.filter(f => f.life > 0 && (f.kind === "meteor" || (f.x > -80 && f.x < W + 80 && f.y > -80 && f.y < H + 80)));

  for (const p of particles) {
    if (p.type === "bolt") {
      p.life -= dt;
      ctx.globalAlpha = Math.max(0, p.life * 5);
      ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.shadowBlur = 18; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.moveTo(p.x1, p.y1);
      const mx = (p.x1 + p.x2) / 2 + (Math.random() - .5) * 28;
      const my = (p.y1 + p.y2) / 2 + (Math.random() - .5) * 28;
      ctx.lineTo(mx, my); ctx.lineTo(p.x2, p.y2); ctx.stroke(); ctx.shadowBlur = 0;
      continue;
    }
    if (p.type === "ring") {
      p.radius += (p.max / .5) * dt;
      p.life -= dt;
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vx *= .975;
    p.vy *= .975;
  }
  particles = particles.filter(p => p.life > 0);

  for (const t of floatingTexts) {
    t.y -= 25 * dt;
    t.life -= dt;
  }
  floatingTexts = floatingTexts.filter(t => t.life > 0);

  if (hp <= 0) {
    hp = 0;
    gameOver = true;
    burst(player.x, player.y, 70, "#ff5a5a", 240);
  }
  updateHud();
}

function updateHud() {
  document.getElementById("hp").textContent = Math.ceil(hp);
  document.getElementById("mana").textContent = Math.floor(mana);
  document.getElementById("level").textContent = level;
  document.getElementById("xp").textContent = xp;
  document.getElementById("enemies").textContent = enemies.length;
  document.getElementById("score").textContent = score;
  document.getElementById("kills").textContent = kills;
  document.getElementById("hpbar").style.width = `${(hp / MAX_HP) * 100}%`;
  document.getElementById("manabar").style.width = `${(mana / MAX_MANA) * 100}%`;
  document.getElementById("xpbar").style.width = `${(xp / XP_PER_LEVEL) * 100}%`;
}

function drawBackground() {
  const g = ctx.createRadialGradient(W * .5, H * .35, 60, W * .5, H * .55, Math.max(W, H) * .75);
  g.addColorStop(0, "#213b35");
  g.addColorStop(.5, "#101e1a");
  g.addColorStop(1, "#050a09");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(157, 196, 166, .08)";
  ctx.lineWidth = 1;
  const size = 64;
  for (let x = 0; x < W; x += size) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += size) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  for (let i = 0; i < 28; i++) {
    const x = (i * 173 + 41) % W;
    const y = (i * 97 + 83) % H;
    ctx.fillStyle = i % 2 ? "#1b3426" : "#274536";
    ctx.beginPath(); ctx.arc(x, y, 14 + (i % 4) * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(140,210,150,.08)";
    ctx.beginPath(); ctx.arc(x - 6, y - 7, 7, 0, Math.PI * 2); ctx.fill();
  }

  const vignette = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*.28, W/2, H/2, Math.max(W,H)*.7);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.48)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.sin(e.wobble) * .04);
  ctx.shadowBlur = e.hit > 0 ? 28 : 12;
  ctx.shadowColor = e.glow;
  ctx.fillStyle = e.hit > 0 ? "#fff" : e.color;

  if (e.name === "Wraith") {
    ctx.beginPath();
    ctx.moveTo(0, -e.radius - 5);
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI * .9 + (Math.PI * 1.8 * i / 7);
      const r = e.radius * (i % 2 ? .8 : 1.05);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 5);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e9e3ff";
    ctx.beginPath(); ctx.arc(-6, -3, 3, 0, Math.PI*2); ctx.arc(6, -3, 3, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = e.name === "Ghoul" ? "#e8d69d" : "#eab6a0";
    ctx.beginPath(); ctx.arc(-7, -4, 3, 0, Math.PI*2); ctx.arc(7, -4, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#130e12";
    ctx.beginPath(); ctx.arc(-7, -4, 1.5, 0, Math.PI*2); ctx.arc(7, -4, 1.5, 0, Math.PI*2); ctx.fill();
    if (e.name === "Imp") {
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.moveTo(-11,-14); ctx.lineTo(-20,-27); ctx.lineTo(-3,-18); ctx.fill();
      ctx.beginPath(); ctx.moveTo(11,-14); ctx.lineTo(20,-27); ctx.lineTo(3,-18); ctx.fill();
    }
  }
  ctx.restore();

  const barW = e.radius * 2.25;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(e.x - barW/2, e.y - e.radius - 15, barW, 5);
  ctx.fillStyle = e.glow;
  ctx.fillRect(e.x - barW/2, e.y - e.radius - 15, barW * Math.max(0, e.hp / e.maxHp), 5);
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.facing);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(0, 21, 24, 8, 0, 0, Math.PI*2); ctx.fill();

  ctx.shadowBlur = 22;
  ctx.shadowColor = "#7a6cff";
  ctx.fillStyle = "#3b4bb6";
  ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#d2b17a";
  ctx.beginPath(); ctx.arc(0, -9, 10, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#171d58";
  ctx.beginPath(); ctx.moveTo(-17,-12); ctx.lineTo(0,-38); ctx.lineTo(17,-12); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "#ede8ff";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(34, 0); ctx.stroke();
  ctx.fillStyle = "#8de7ff";
  ctx.beginPath(); ctx.arc(12, 0, 4, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  if (shieldTimer > 0) {
    ctx.save(); ctx.globalAlpha = .35 + .18 * Math.sin(performance.now() / 90);
    ctx.strokeStyle = "#e8c8ff"; ctx.lineWidth = 3; ctx.shadowBlur = 24; ctx.shadowColor = "#b58cff";
    ctx.beginPath(); ctx.arc(player.x, player.y, 29 + Math.sin(performance.now()/120)*2, 0, Math.PI*2); ctx.stroke(); ctx.restore();
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random()-.5)*10*shake*8, (Math.random()-.5)*10*shake*8);
  drawBackground();

  for (const p of particles) {
    if (p.type === "bolt") {
      p.life -= dt;
      ctx.globalAlpha = Math.max(0, p.life * 5);
      ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.shadowBlur = 18; ctx.shadowColor = p.color;
      ctx.beginPath(); ctx.moveTo(p.x1, p.y1);
      const mx = (p.x1 + p.x2) / 2 + (Math.random() - .5) * 28;
      const my = (p.y1 + p.y2) / 2 + (Math.random() - .5) * 28;
      ctx.lineTo(mx, my); ctx.lineTo(p.x2, p.y2); ctx.stroke(); ctx.shadowBlur = 0;
      continue;
    }
    if (p.type === "ring") {
      ctx.globalAlpha = Math.max(0, p.life * 1.5);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.stroke();
      continue;
    }
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  for (const e of enemies) drawEnemy(e);

  for (const f of projectiles) {
    if (f.kind === "meteor") {
      ctx.save();
      ctx.globalAlpha = f.exploded ? Math.max(0, f.life * 2) : .85;
      ctx.strokeStyle = "#ffb45f"; ctx.lineWidth = 3; ctx.setLineDash([7, 8]);
      ctx.beginPath(); ctx.arc(f.x, f.y, 82 + level * 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,120,40,.12)"; ctx.beginPath(); ctx.arc(f.x, f.y, 62, 0, Math.PI*2); ctx.fill();
      if (!f.exploded) { ctx.fillStyle = "#ffad42"; ctx.shadowBlur = 25; ctx.shadowColor = "#ff702d"; ctx.beginPath(); ctx.arc(f.x, f.y, 12 + Math.sin(f.timer*14)*3, 0, Math.PI*2); ctx.fill(); }
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(Math.atan2(f.vy, f.vx));
    ctx.shadowBlur = 28;
    ctx.shadowColor = f.kind === "frost" ? "#77e8ff" : "#ff7b28";
    ctx.fillStyle = f.kind === "frost" ? "#9ff2ff" : "#ffb33d";
    ctx.beginPath(); ctx.arc(0,0,f.r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = f.kind === "frost" ? "#efffff" : "#fff1b3";
    ctx.beginPath(); ctx.arc(-3,-2,3,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  drawPlayer();
  ctx.restore();

  for (const t of floatingTexts) {
    ctx.globalAlpha = Math.max(0, t.life);
    ctx.fillStyle = t.color;
    ctx.font = "bold 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  const banner = document.getElementById("banner");
  banner.classList.toggle("show", bannerTimer > 0);
  banner.innerHTML = `<div class="banner-title">${level > 1 && bannerTimer > 0 ? `LEVEL ${level}` : "THE SHADOWS AWAKEN"}</div><div class="banner-sub">Survive the monsters. Master the arcane.</div>`;

  const overlay = document.getElementById("overlay");
  overlay.classList.toggle("show", gameOver || paused);
  if (gameOver) {
    document.getElementById("overlayTitle").textContent = "YOU HAVE FALLEN";
    document.getElementById("overlayText").innerHTML = `The monsters claimed the realm.<br><strong>${score}</strong> score &nbsp; • &nbsp; <strong>${kills}</strong> defeated &nbsp; • &nbsp; Level <strong>${level}</strong>`;
    document.getElementById("restartHint").textContent = "Press R to rise again";
  } else if (paused) {
    document.getElementById("overlayTitle").textContent = "PAUSED";
    document.getElementById("overlayText").textContent = "The realm waits for your return.";
    document.getElementById("restartHint").textContent = "Press P to continue";
  }
}

function loop(t) {
  const dt = Math.min(.033, (t - last) / 1000);
  last = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

reset();
requestAnimationFrame(loop);
