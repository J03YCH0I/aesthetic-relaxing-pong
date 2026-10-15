/* =====================================================================
   EFFECTS.JS - eye candy: background, sparks, and bricks breaking apart.
   None of this changes how the game plays - it just makes it look smooth.
   (Uses WIDTH, HEIGHT, and ctx from script.js.)
   ===================================================================== */

const effects = {
  particles: [],      // little sparks that fly out when things break
  fadingBricks: [],   // bricks that were just broken, growing and fading away
  dust: [],           // slow floating specks in the background
  background: null,   // the background color gradient (made once, reused)
};

const BRICK_FADE_TIME = 0.3;   // seconds a broken brick takes to fade out

// Called once when the page loads
function initEffects() {
  effects.background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  effects.background.addColorStop(0, '#111a2e');
  effects.background.addColorStop(1, '#05070d');

  for (let i = 0; i < 60; i++) {
    effects.dust.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      speed: 4 + Math.random() * 12,     // pixels per second, drifting upward
      size: 0.5 + Math.random() * 1.5,
      alpha: 0.05 + Math.random() * 0.2,
    });
  }
}

// Called on every new game
function clearEffects() {
  effects.particles = [];
  effects.fadingBricks = [];
}


// ------------------------------------------------------------
// Making effects
// ------------------------------------------------------------

// Shoots out `count` sparks from (x, y) in random directions
function spawnParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    const life = 0.5 + Math.random() * 0.5;

    effects.particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      size: 1.5 + Math.random() * 2.5,
      life: life,
      maxLife: life,
      color: color,
    });
  }
}

function brickBreakEffect(brick) {
  effects.fadingBricks.push({
    x: brick.x,
    y: brick.y,
    width: brick.width,
    height: brick.height,
    time: 0,
  });
  spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, '#ffffff', 12, 220);
}


// ------------------------------------------------------------
// Updating effects
// ------------------------------------------------------------
function updateEffects(dt) {
  // Sparks fly, fall with a little gravity, and fade
  for (const p of effects.particles) {
    p.vy += 400 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  effects.particles = effects.particles.filter((p) => p.life > 0);

  // Broken bricks finish their fade-out
  for (const fb of effects.fadingBricks) fb.time += dt;
  effects.fadingBricks = effects.fadingBricks.filter((fb) => fb.time < BRICK_FADE_TIME);

  // Background dust drifts upward and wraps around to the bottom
  for (const d of effects.dust) {
    d.y -= d.speed * dt;
    if (d.y < -5) {
      d.y = HEIGHT + 5;
      d.x = Math.random() * WIDTH;
    }
  }
}


// ------------------------------------------------------------
// Drawing effects
// ------------------------------------------------------------
function drawBackground() {
  ctx.fillStyle = effects.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#ffffff';
  for (const d of effects.dust) {
    ctx.globalAlpha = d.alpha;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFadingBricks() {
  ctx.fillStyle = '#ffffff';
  for (const fb of effects.fadingBricks) {
    const progress = fb.time / BRICK_FADE_TIME;   // 0 -> 1
    const scale = 1 + 0.4 * progress;             // grows a little...
    const w = fb.width * scale;
    const h = fb.height * scale;

    ctx.globalAlpha = 1 - progress;               // ...while fading out
    ctx.beginPath();
    ctx.roundRect(fb.x + fb.width / 2 - w / 2, fb.y + fb.height / 2 - h / 2, w, h, 5);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of effects.particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
