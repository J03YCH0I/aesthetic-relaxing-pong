/* =====================================================================
   BREAKOUT - endless edition

   HOW TO PLAY
   - Move the paddle with the mouse, the arrow keys, or A / D.
   - Click or press Space to launch the ball.
   - The ball speeds up the longer you survive.
   - Break every brick and a new random wall appears.
   - Catch the falling capsules for power-ups.
   - P = pause, M = sound on/off. Your best time is saved.

   FILES
     sound.js    - every sound effect (made with code, no audio files)
     effects.js  - background, sparks, and brick-breaking animation
     script.js   - this file: the rules of the game

   SECTIONS IN THIS FILE
     1. SETTINGS     2. GAME STATE    3. INPUT       4. UPDATE
     5. BRICKS       6. POWER-UPS     7. DRAWING     8. SCREENS
     9. HELPERS     10. MAIN LOOP
   ===================================================================== */


// ============================================================
// 1. SETTINGS - change these numbers to tune the game
// ============================================================
const WIDTH = 600;    // the game is always 600 x 720 "game pixels",
const HEIGHT = 720;   // then scaled to fit the window

const SETTINGS = {
  // Paddle
  PADDLE_WIDTH: 100,
  PADDLE_HEIGHT: 14,
  PADDLE_Y: 670,
  PADDLE_KEY_SPEED: 600,       // pixels per second when using the keyboard
  PADDLE_SMOOTHING: 20,        // how quickly the paddle glides to the mouse (higher = snappier)

  // Ball
  BALL_RADIUS: 8,
  BALL_START_SPEED: 320,       // pixels per second at 0:00
  BALL_SPEEDUP: 3,             // extra speed gained for every second you survive
  BALL_MAX_SPEED: 850,
  MAX_BALLS: 8,
  TRAIL_LENGTH: 10,            // how many old positions the glowing trail remembers

  // Bricks (all white)
  BRICK_COLOR: '#f8fafc',
  BRICK_ROWS_START: 5,         // wave 1 has 5 rows...
  BRICK_ROWS_MAX: 8,           // ...adding one every 2 waves, up to 8
  BRICK_COLS: 10,
  BRICK_HEIGHT: 22,
  BRICK_GAP: 6,
  BRICK_TOP: 80,               // y position of the first row
  BRICK_SIDE_MARGIN: 20,
  BRICK_FILL_CHANCE: 0.75,     // chance each spot in the grid gets a brick

  // Lives and power-ups
  START_LIVES: 3,
  POWERUP_DROP_CHANCE: 0.15,   // chance a broken brick drops a capsule
  POWERUP_FALL_SPEED: 140,
  POWERUP_WIDTH: 34,
  POWERUP_HEIGHT: 18,
  WIDE_DURATION: 10,           // seconds
  SLOW_DURATION: 8,
  FIRE_DURATION: 6,
  BARRIER_Y: HEIGHT - 10,      // where the safety barrier sits
};

// Every power-up the game can drop. Higher weight = drops more often.
const POWERUPS = {
  wide:    { letter: 'W', color: '#60a5fa', message: 'Wide Paddle', weight: 4 },
  multi:   { letter: 'M', color: '#f472b6', message: 'Multi-Ball',  weight: 3 },
  slow:    { letter: 'S', color: '#4ade80', message: 'Slow Ball',   weight: 3 },
  fire:    { letter: 'F', color: '#fb923c', message: 'Fireball',    weight: 2 },
  barrier: { letter: 'B', color: '#22d3ee', message: 'Barrier',     weight: 2 },
  life:    { letter: '+', color: '#f87171', message: 'Extra Life',  weight: 1 },
};


// ============================================================
// 2. GAME STATE - one object holds everything about the current game
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const BEST_TIME_KEY = 'breakout-best-time';
let bestTime = loadBestTime();
let game = null;

// Starts a brand-new game. Called when the page loads and on "Play Again".
function resetGame() {
  game = {
    state: 'READY',     // 'READY' (ball on paddle) | 'PLAYING' | 'PAUSED' | 'GAME_OVER'
    time: 0,            // seconds survived (only counts while the ball is moving)
    lives: SETTINGS.START_LIVES,
    wave: 1,
    combo: 0,           // bricks broken since the ball last touched the paddle
    paddle: {
      x: WIDTH / 2 - SETTINGS.PADDLE_WIDTH / 2,
      targetX: WIDTH / 2 - SETTINGS.PADDLE_WIDTH / 2,   // where the paddle is gliding to
      y: SETTINGS.PADDLE_Y,
      width: SETTINGS.PADDLE_WIDTH,
      height: SETTINGS.PADDLE_HEIGHT,
      glow: 0,          // flashes brighter when the ball hits it
    },
    balls: [createBall()],
    bricks: buildBricks(1),
    powerUps: [],
    wideTimer: 0,       // seconds left on each timed power-up
    slowTimer: 0,
    fireTimer: 0,
    barrier: false,     // true = a one-time safety net is under the paddle
    message: '',        // big text that fades in the middle ("Wave 2")
    messageTimer: 0,
  };
  stickBallToPaddle();
  clearEffects();
  hideScreen(gameOverScreen);
}

function createBall() {
  return { x: 0, y: 0, vx: 0, vy: 0, radius: SETTINGS.BALL_RADIUS, trail: [], lost: false };
}


// ============================================================
// 3. INPUT - keyboard and mouse
// ============================================================
const keys = {};

window.addEventListener('keydown', (e) => {
  startAudio();   // browsers only allow sound after a key press or click
  const key = e.key.toLowerCase();
  keys[key] = true;

  // Stop Space and the arrow keys from scrolling the page
  if (key === ' ' || key.startsWith('arrow')) e.preventDefault();

  if (key === ' ' && game.state === 'READY') launchBall();
  else if ((key === ' ' || key === 'enter') && game.state === 'GAME_OVER') resetGame();

  if (key === 'p' || key === 'escape') togglePause();
  if (key === 'm') toggleMute();
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Mouse (or finger) steers the paddle
canvas.addEventListener('pointermove', (e) => {
  setPaddleTarget(mouseToGameX(e));
});

// Click (or tap) launches the ball, or resumes from pause
canvas.addEventListener('pointerdown', (e) => {
  startAudio();
  setPaddleTarget(mouseToGameX(e));
  if (game.state === 'READY') launchBall();
  else if (game.state === 'PAUSED') togglePause();
});

// Pause automatically if the player switches to another tab
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'PLAYING') togglePause();
});

// The canvas is scaled to fit the window, so convert the mouse
// position from screen pixels into game pixels.
function mouseToGameX(e) {
  const rect = canvas.getBoundingClientRect();
  return (e.clientX - rect.left) * (WIDTH / rect.width);
}

function togglePause() {
  if (game.state === 'PLAYING') game.state = 'PAUSED';
  else if (game.state === 'PAUSED') game.state = 'PLAYING';
}


// ============================================================
// 4. UPDATE - move everything forward by dt seconds
// ============================================================
function update(dt) {
  updatePaddle(dt);
  updateBricks(dt);

  // Before launch, the ball just rides on the paddle
  if (game.state === 'READY') {
    stickBallToPaddle();
    return;
  }

  game.time += dt;
  updateTimers(dt);
  updateBalls(dt);
  updatePowerUps(dt);

  if (game.bricks.length === 0) nextWave();
}

function updatePaddle(dt) {
  const p = game.paddle;

  // Keyboard moves the target; the mouse sets it directly (see INPUT)
  if (keys['arrowleft'] || keys['a'])  p.targetX -= SETTINGS.PADDLE_KEY_SPEED * dt;
  if (keys['arrowright'] || keys['d']) p.targetX += SETTINGS.PADDLE_KEY_SPEED * dt;
  p.targetX = clamp(p.targetX, 0, WIDTH - p.width);

  // Glide toward the target instead of teleporting - this is what makes it feel smooth
  p.x += (p.targetX - p.x) * Math.min(1, SETTINGS.PADDLE_SMOOTHING * dt);

  if (p.glow > 0) p.glow = Math.max(0, p.glow - dt * 3);
}

function setPaddleTarget(centerX) {
  const p = game.paddle;
  p.targetX = clamp(centerX - p.width / 2, 0, WIDTH - p.width);
}

function stickBallToPaddle() {
  const ball = game.balls[0];
  const p = game.paddle;
  ball.x = p.x + p.width / 2;
  ball.y = p.y - ball.radius - 1;
  ball.trail = [];
}

// Sends the ball upward at a slightly random angle
function launchBall() {
  stickBallToPaddle();   // make sure it starts from the paddle
  const ball = game.balls[0];
  const angle = (Math.random() * 60 - 30) * (Math.PI / 180);   // -30 to +30 degrees
  const speed = currentBallSpeed();
  ball.vx = Math.sin(angle) * speed;
  ball.vy = -Math.cos(angle) * speed;
  game.state = 'PLAYING';
}

// THE DIFFICULTY: the ball speeds up the longer you survive
function currentBallSpeed() {
  let speed = SETTINGS.BALL_START_SPEED + game.time * SETTINGS.BALL_SPEEDUP;
  speed = Math.min(speed, SETTINGS.BALL_MAX_SPEED);
  if (game.slowTimer > 0) speed *= 0.6;
  return speed;
}

function updateTimers(dt) {
  if (game.wideTimer > 0) {
    game.wideTimer -= dt;
    if (game.wideTimer <= 0) setPaddleWidth(SETTINGS.PADDLE_WIDTH);
  }
  if (game.slowTimer > 0) game.slowTimer -= dt;
  if (game.fireTimer > 0) game.fireTimer -= dt;
  if (game.messageTimer > 0) game.messageTimer -= dt;
}

function updateBalls(dt) {
  const speed = currentBallSpeed();

  for (const ball of game.balls) {
    setBallSpeed(ball, speed);

    // Move in small steps (about 4 pixels each) so a fast ball
    // can't jump straight through a brick in a single frame.
    const steps = Math.ceil((speed * dt) / 4);
    for (let i = 0; i < steps; i++) {
      moveBall(ball, dt / steps);
      if (ball.lost) break;
    }

    // Remember recent positions for the glowing trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > SETTINGS.TRAIL_LENGTH) ball.trail.shift();
  }

  game.balls = game.balls.filter((ball) => !ball.lost);
  if (game.balls.length === 0) loseLife();
}

function moveBall(ball, dt) {
  const r = ball.radius;
  const prevX = ball.x;
  const prevY = ball.y;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Bounce off the left, right, and top walls
  if (ball.x - r < 0)     { ball.x = r;         ball.vx = Math.abs(ball.vx); }
  if (ball.x + r > WIDTH) { ball.x = WIDTH - r; ball.vx = -Math.abs(ball.vx); }
  if (ball.y - r < 0)     { ball.y = r;         ball.vy = Math.abs(ball.vy); }

  // The Barrier power-up saves the ball once, then disappears
  if (game.barrier && ball.vy > 0 && ball.y + r > SETTINGS.BARRIER_Y) {
    ball.y = SETTINGS.BARRIER_Y - r;
    ball.vy = -Math.abs(ball.vy);
    game.barrier = false;
    soundBarrier();
    spawnParticles(ball.x, SETTINGS.BARRIER_Y, POWERUPS.barrier.color, 20, 220);
  }

  // Fell off the bottom
  if (ball.y - r > HEIGHT) {
    ball.lost = true;
    return;
  }

  // Bounce off the paddle (only when moving down, so it can't get stuck)
  if (ball.vy > 0 && circleHitsRect(ball, game.paddle)) {
    bounceOffPaddle(ball);
  }

  // Hit a brick?
  for (const brick of game.bricks) {
    if (!circleHitsRect(ball, brick)) continue;

    if (game.fireTimer > 0) {
      // Fireball smashes straight through without bouncing
      breakBrick(brick);
    } else {
      // If the ball was beside the brick a moment ago, it hit a side:
      // flip left/right. Otherwise it hit the top or bottom: flip up/down.
      const wasBeside = prevX + r <= brick.x || prevX - r >= brick.x + brick.width;
      if (wasBeside) {
        ball.vx = -ball.vx;
      } else {
        ball.vy = -ball.vy;
      }
      ball.x = prevX;   // step back out of the brick
      ball.y = prevY;
      hitBrick(brick);
    }
    break;              // only one brick per step
  }
}

// Where the ball lands on the paddle decides where it goes:
// middle = straight up, edges = sharp angle (up to 60 degrees).
function bounceOffPaddle(ball) {
  const p = game.paddle;
  const paddleCenter = p.x + p.width / 2;
  const hit = clamp((ball.x - paddleCenter) / (p.width / 2), -1, 1);   // -1 left edge ... 1 right edge
  const angle = hit * (Math.PI / 3);
  const speed = currentBallSpeed();

  ball.vx = Math.sin(angle) * speed;
  ball.vy = -Math.cos(angle) * speed;
  ball.y = p.y - ball.radius;

  game.combo = 0;   // the melody starts over from the bottom note
  p.glow = 1;
  soundPaddle();
}

function loseLife() {
  game.lives--;
  if (game.lives <= 0) {
    gameOver();
    return;
  }

  soundLifeLost();

  // Clear power-ups and put a fresh ball on the paddle
  game.powerUps = [];
  game.wideTimer = 0;
  game.slowTimer = 0;
  game.fireTimer = 0;
  game.combo = 0;
  setPaddleWidth(SETTINGS.PADDLE_WIDTH);
  game.balls = [createBall()];
  stickBallToPaddle();
  game.state = 'READY';
  showMessage('Life lost');
}


// ============================================================
// 5. BRICKS - random, mirrored walls that get tougher each wave
// ============================================================
function buildBricks(wave) {
  const bricks = [];
  const cols = SETTINGS.BRICK_COLS;
  const totalGap = (cols - 1) * SETTINGS.BRICK_GAP;
  const brickWidth = (WIDTH - SETTINGS.BRICK_SIDE_MARGIN * 2 - totalGap) / cols;

  // One more row every 2 waves
  const rows = Math.min(SETTINGS.BRICK_ROWS_MAX, SETTINGS.BRICK_ROWS_START + Math.floor((wave - 1) / 2));

  // Wave 1 has no tough bricks; each later wave has more (up to half)
  const toughChance = Math.min(0.5, (wave - 1) * 0.12);

  for (let row = 0; row < rows; row++) {
    // Only roll dice for the left half, then mirror it to the right
    // half. Symmetry makes random walls look designed instead of messy.
    for (let col = 0; col < cols / 2; col++) {
      if (Math.random() > SETTINGS.BRICK_FILL_CHANCE) continue;   // leave a gap

      const hp = Math.random() < toughChance ? 2 : 1;             // tough bricks take 2 hits
      bricks.push(makeBrick(row, col, hp, brickWidth));
      bricks.push(makeBrick(row, cols - 1 - col, hp, brickWidth));
    }
  }

  // Super unlikely, but never hand the player an empty wall
  if (bricks.length === 0) return buildBricks(wave);
  return bricks;
}

function makeBrick(row, col, hp, brickWidth) {
  // Bricks drop in one by one, rippling out from the center
  const distanceFromCenter = Math.abs(col - (SETTINGS.BRICK_COLS - 1) / 2);
  return {
    x: SETTINGS.BRICK_SIDE_MARGIN + col * (brickWidth + SETTINGS.BRICK_GAP),
    y: SETTINGS.BRICK_TOP + row * (SETTINGS.BRICK_HEIGHT + SETTINGS.BRICK_GAP),
    width: brickWidth,
    height: SETTINGS.BRICK_HEIGHT,
    hp: hp,
    appear: -(row * 0.06 + distanceFromCenter * 0.04),   // below 0 = still waiting to appear
    flash: 0,                                            // white glow when cracked
  };
}

// Animates bricks appearing and the crack flash
function updateBricks(dt) {
  for (const brick of game.bricks) {
    if (brick.appear < 1) brick.appear = Math.min(1, brick.appear + dt * 2.5);
    if (brick.flash > 0) brick.flash = Math.max(0, brick.flash - dt * 4);
  }
}

function hitBrick(brick) {
  brick.hp--;
  if (brick.hp > 0) {
    // Tough brick cracked but not broken yet
    brick.flash = 1;
    soundBrickCrack();
    spawnParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, '#ffffff', 4, 120);
    return;
  }
  breakBrick(brick);
}

function breakBrick(brick) {
  game.bricks.splice(game.bricks.indexOf(brick), 1);

  soundBrickBreak(game.combo);   // each brick in a chain plays the next note up
  game.combo++;
  brickBreakEffect(brick);

  if (Math.random() < SETTINGS.POWERUP_DROP_CHANCE) {
    dropPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2);
  }
}

function nextWave() {
  game.wave++;
  game.bricks = buildBricks(game.wave);
  soundWaveClear();
  showMessage('Wave ' + game.wave);
}


// ============================================================
// 6. POWER-UPS - capsules that fall from broken bricks
// ============================================================
function dropPowerUp(x, y) {
  game.powerUps.push({
    type: pickRandomPowerUp(),
    x: x - SETTINGS.POWERUP_WIDTH / 2,
    y: y - SETTINGS.POWERUP_HEIGHT / 2,
    width: SETTINGS.POWERUP_WIDTH,
    height: SETTINGS.POWERUP_HEIGHT,
    done: false,
  });
}

// Picks a power-up type using the weights (like drawing from a bag where
// 'wide' has 4 tickets and 'life' only has 1)
function pickRandomPowerUp() {
  let totalWeight = 0;
  for (const type in POWERUPS) totalWeight += POWERUPS[type].weight;

  let roll = Math.random() * totalWeight;
  for (const type in POWERUPS) {
    roll -= POWERUPS[type].weight;
    if (roll < 0) return type;
  }
  return 'wide';   // fallback (never actually reached)
}

function updatePowerUps(dt) {
  for (const pu of game.powerUps) {
    pu.y += SETTINGS.POWERUP_FALL_SPEED * dt;

    if (rectsOverlap(pu, game.paddle)) {
      applyPowerUp(pu.type);
      spawnParticles(pu.x + pu.width / 2, pu.y + pu.height / 2, POWERUPS[pu.type].color, 14, 180);
      pu.done = true;
    } else if (pu.y > HEIGHT) {
      pu.done = true;   // missed it
    }
  }
  game.powerUps = game.powerUps.filter((pu) => !pu.done);
}

function applyPowerUp(type) {
  if (type === 'wide') {
    setPaddleWidth(SETTINGS.PADDLE_WIDTH * 1.6);
    game.wideTimer = SETTINGS.WIDE_DURATION;
  } else if (type === 'multi') {
    addExtraBalls();
  } else if (type === 'slow') {
    game.slowTimer = SETTINGS.SLOW_DURATION;
  } else if (type === 'fire') {
    game.fireTimer = SETTINGS.FIRE_DURATION;
  } else if (type === 'barrier') {
    game.barrier = true;
  } else if (type === 'life') {
    game.lives++;
  }
  soundPowerUp();
  showMessage(POWERUPS[type].message);
}

// Splits the first ball into three, spreading out at slight angles
function addExtraBalls() {
  const source = game.balls[0];
  if (!source) return;

  const speed = currentBallSpeed();
  const baseAngle = Math.atan2(source.vy, source.vx);

  for (const offset of [-0.4, 0.4]) {
    if (game.balls.length >= SETTINGS.MAX_BALLS) break;
    const ball = createBall();
    ball.x = source.x;
    ball.y = source.y;
    ball.vx = Math.cos(baseAngle + offset) * speed;
    ball.vy = Math.sin(baseAngle + offset) * speed;
    game.balls.push(ball);
  }
}

// Changes paddle width but keeps it centered in the same spot
function setPaddleWidth(newWidth) {
  const p = game.paddle;
  const change = newWidth - p.width;
  p.width = newWidth;
  p.x = clamp(p.x - change / 2, 0, WIDTH - newWidth);
  p.targetX = clamp(p.targetX - change / 2, 0, WIDTH - newWidth);
}


// ============================================================
// 7. DRAWING - paint everything onto the canvas
// ============================================================
function draw() {
  drawBackground();                              // effects.js

  for (const brick of game.bricks) drawBrick(brick);
  drawFadingBricks();                            // effects.js
  for (const pu of game.powerUps) drawPowerUp(pu);
  if (game.barrier) drawBarrier();
  drawPaddle();
  for (const ball of game.balls) drawBall(ball);
  drawParticles();                               // effects.js

  drawHUD();
  drawMessage();
  if (game.state === 'READY') drawLaunchHint();
  if (game.state === 'PAUSED') drawPauseScreen();
}

function drawBrick(brick) {
  if (brick.appear <= 0) return;   // hasn't dropped in yet

  // Ease-out: starts fast, settles gently into place
  const ease = 1 - Math.pow(1 - brick.appear, 3);
  const y = brick.y - (1 - ease) * 24;
  ctx.globalAlpha = ease;

  // Soft shadow underneath
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.roundRect(brick.x + 2, y + 4, brick.width, brick.height, 5);
  ctx.fill();

  // The white brick
  ctx.fillStyle = SETTINGS.BRICK_COLOR;
  ctx.beginPath();
  ctx.roundRect(brick.x, y, brick.width, brick.height, 5);
  ctx.fill();

  // Tough bricks have a gray inner border until they are cracked
  if (brick.hp > 1) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(brick.x + 4, y + 4, brick.width - 8, brick.height - 8, 3);
    ctx.stroke();
  }

  // Bright ring that fades out after a crack
  if (brick.flash > 0) {
    ctx.globalAlpha = brick.flash;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(brick.x - 3, y - 3, brick.width + 6, brick.height + 6, 7);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

function drawPaddle() {
  const p = game.paddle;
  ctx.shadowColor = 'rgba(147, 197, 253, 0.9)';
  ctx.shadowBlur = 12 + p.glow * 25;
  ctx.fillStyle = game.wideTimer > 0 ? '#bfdbfe' : '#ffffff';
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.width, p.height, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function ballColor() {
  if (game.fireTimer > 0) return POWERUPS.fire.color;
  if (game.slowTimer > 0) return POWERUPS.slow.color;
  return '#ffffff';
}

function drawBall(ball) {
  const color = ballColor();

  // Trail: older positions are smaller and more see-through
  ctx.fillStyle = color;
  for (let i = 0; i < ball.trail.length; i++) {
    const t = (i + 1) / ball.trail.length;   // 0 = oldest, 1 = newest
    ctx.globalAlpha = t * 0.3;
    ctx.beginPath();
    ctx.arc(ball.trail[i].x, ball.trail[i].y, ball.radius * t, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The ball itself, with a soft glow
  ctx.shadowColor = color === '#ffffff' ? 'rgba(147, 197, 253, 0.9)' : color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPowerUp(pu) {
  const info = POWERUPS[pu.type];

  ctx.shadowColor = info.color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = info.color;
  ctx.beginPath();
  ctx.roundRect(pu.x, pu.y, pu.width, pu.height, 9);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#0b1020';
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(info.letter, pu.x + pu.width / 2, pu.y + pu.height / 2 + 1);
}

function drawBarrier() {
  // Gently pulsing line across the bottom
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 250);
  ctx.globalAlpha = pulse;
  ctx.shadowColor = POWERUPS.barrier.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = POWERUPS.barrier.color;
  ctx.fillRect(0, SETTINGS.BARRIER_Y, WIDTH, 3);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.textBaseline = 'middle';

  // Top-left: time and best time
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillText('Time ' + formatTime(game.time), 20, 28);

  ctx.fillStyle = '#facc15';
  ctx.font = '15px "Segoe UI", sans-serif';
  ctx.fillText('Best ' + formatTime(Math.max(bestTime, game.time)), 20, 54);

  // Top-center: wave and combo
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillText('Wave ' + game.wave, WIDTH / 2, 28);

  if (game.combo >= 3) {
    ctx.fillStyle = '#93c5fd';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillText('Combo x' + game.combo, WIDTH / 2, 54);
  }

  // Top-right: lives and sound setting
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f87171';
  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillText('Lives ' + game.lives, WIDTH - 20, 28);

  ctx.fillStyle = '#6b7280';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillText('Sound ' + (Sound.muted ? 'off' : 'on') + ' [M]', WIDTH - 20, 54);

  // Bottom-right: how fast the ball is compared to the start
  ctx.fillStyle = '#9ca3af';
  ctx.font = '14px "Segoe UI", sans-serif';
  const speedRatio = currentBallSpeed() / SETTINGS.BALL_START_SPEED;
  ctx.fillText('Speed ' + speedRatio.toFixed(1) + 'x', WIDTH - 20, HEIGHT - 22);

  // Bottom-left: active power-ups
  ctx.textAlign = 'left';
  const active = [];
  if (game.wideTimer > 0) active.push('Wide ' + Math.ceil(game.wideTimer) + 's');
  if (game.slowTimer > 0) active.push('Slow ' + Math.ceil(game.slowTimer) + 's');
  if (game.fireTimer > 0) active.push('Fire ' + Math.ceil(game.fireTimer) + 's');
  if (game.barrier) active.push('Barrier');
  ctx.fillText(active.join('   '), 20, HEIGHT - 22);
}

function drawMessage() {
  if (game.messageTimer <= 0) return;

  // Fades out during its last second while drifting slightly upward
  ctx.globalAlpha = Math.min(1, game.messageTimer);
  ctx.fillStyle = '#ffffff';
  ctx.font = '300 40px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(game.message, WIDTH / 2, HEIGHT / 2 + game.messageTimer * 10);
  ctx.globalAlpha = 1;
}

function drawLaunchHint() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Show the title only at the very start of a game
  if (game.time === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '200 52px "Segoe UI", sans-serif';
    ctx.fillText('BREAKOUT', WIDTH / 2, 410);
  }

  // Gently pulsing "launch" prompt
  ctx.globalAlpha = 0.65 + 0.35 * Math.sin(performance.now() / 400);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '20px "Segoe UI", sans-serif';
  ctx.fillText('Click or press Space to launch', WIDTH / 2, 465);
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#6b7280';
  ctx.font = '15px "Segoe UI", sans-serif';
  ctx.fillText('Move: mouse, arrow keys, or A / D', WIDTH / 2, 500);
  ctx.fillText('P: pause    M: sound on/off', WIDTH / 2, 525);
}

function drawPauseScreen() {
  ctx.fillStyle = 'rgba(5, 7, 13, 0.6)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '200 52px "Segoe UI", sans-serif';
  ctx.fillText('Paused', WIDTH / 2, HEIGHT / 2 - 20);

  ctx.fillStyle = '#9ca3af';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.fillText('Press P or click to resume', WIDTH / 2, HEIGHT / 2 + 30);
}


// ============================================================
// 8. SCREENS - Game Over overlay and the saved best time
// ============================================================
const gameOverScreen = document.getElementById('game-over');
const finalTimeText = document.getElementById('final-time');
const bestTimeText = document.getElementById('best-time');
const restartBtn = document.getElementById('restart-btn');

function showScreen(el) { el.classList.remove('hidden'); }
function hideScreen(el) { el.classList.add('hidden'); }

function gameOver() {
  game.state = 'GAME_OVER';
  soundGameOver();

  const isNewBest = game.time > bestTime;
  if (isNewBest) {
    bestTime = game.time;
    saveBestTime(bestTime);
  }

  finalTimeText.textContent =
    'You lasted ' + formatTime(game.time) + ' and reached wave ' + game.wave;
  bestTimeText.textContent = isNewBest
    ? 'New best time!'
    : 'Best time: ' + formatTime(bestTime);
  showScreen(gameOverScreen);
}

restartBtn.addEventListener('click', resetGame);

// The best time is kept in the browser's localStorage so it survives
// closing the page. (try/catch in case the browser blocks storage.)
function loadBestTime() {
  try {
    return Number(localStorage.getItem(BEST_TIME_KEY)) || 0;
  } catch (e) {
    return 0;
  }
}

function saveBestTime(seconds) {
  try {
    localStorage.setItem(BEST_TIME_KEY, String(seconds));
  } catch (e) {
    // Storage blocked - the best time just won't be remembered
  }
}

function showMessage(text) {
  game.message = text;
  game.messageTimer = 1.5;
}


// ============================================================
// 9. HELPERS - small reusable functions
// ============================================================
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Does a circle (ball) overlap a rectangle (brick or paddle)?
function circleHitsRect(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

// Do two rectangles overlap? (power-up capsule vs paddle)
function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

// Keeps the ball's direction but changes how fast it goes
function setBallSpeed(ball, speed) {
  const current = Math.hypot(ball.vx, ball.vy);
  if (current === 0) return;
  ball.vx = (ball.vx / current) * speed;
  ball.vy = (ball.vy / current) * speed;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}


// ============================================================
// 10. MAIN LOOP - update, then draw, every screen refresh
// ============================================================

// Sharp graphics: draw at the screen's real pixel density (e.g. 2x on
// high-DPI laptops), while the game code keeps using 600 x 720 coordinates.
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = (rect.width / WIDTH) * (window.devicePixelRatio || 1);
  canvas.width = Math.round(WIDTH * scale);
  canvas.height = Math.round(HEIGHT * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', resizeCanvas);

let lastTime = performance.now();

function loop(now) {
  // dt = seconds since the last frame, capped so a lag spike can't break things
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (game.state !== 'PAUSED') updateEffects(dt);
  if (game.state === 'READY' || game.state === 'PLAYING') update(dt);
  draw();

  requestAnimationFrame(loop);
}

resizeCanvas();
initEffects();
resetGame();
requestAnimationFrame(loop);
