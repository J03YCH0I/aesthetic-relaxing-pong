/* =====================================================================
   SOUND.JS - relaxing sound effects made with code (no audio files!)

   Every sound is built with the browser's Web Audio API:
       oscillator (makes a tone) -> gain (fades it in/out) -> speakers
   A soft reverb is added so notes ring out gently, like wind chimes.

   Breaking bricks plays notes from the PENTATONIC scale - five notes
   that always sound nice together - so a chain of broken bricks plays
   a calm little melody instead of random beeps. The chain (combo) climbs
   up the scale and starts over each time the ball touches the paddle.
   ===================================================================== */

const MUTE_KEY = 'breakout-muted';

const Sound = {
  ctx: null,          // the AudioContext (created on the first click or key press)
  master: null,       // master volume
  reverb: null,       // echo effect
  muted: loadMuted(),
  lastNoteTime: 0,    // stops dozens of notes piling up at the same instant
};

// C major pentatonic scale: C D E G A (counted in semitones above C)
const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_FREQUENCY = 261.63;   // middle C, in Hz


// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------

// Browsers only allow sound after the player clicks or presses a key,
// so the input code calls this every time. It only builds things once.
function startAudio() {
  if (Sound.ctx) {
    if (Sound.ctx.state === 'suspended') Sound.ctx.resume();
    return;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;   // very old browser: play silently

  Sound.ctx = new AudioCtx();

  // A compressor keeps lots of overlapping notes from getting too loud
  const compressor = Sound.ctx.createDynamicsCompressor();
  compressor.connect(Sound.ctx.destination);

  Sound.master = Sound.ctx.createGain();
  Sound.master.gain.value = 0.6;
  Sound.master.connect(compressor);

  // Reverb: every note also goes through here so it softly echoes
  Sound.reverb = Sound.ctx.createConvolver();
  Sound.reverb.buffer = makeReverbEcho(2.5);
  const reverbVolume = Sound.ctx.createGain();
  reverbVolume.gain.value = 0.35;
  Sound.reverb.connect(reverbVolume);
  reverbVolume.connect(Sound.master);
}

// Makes a fake "room echo": random noise that fades away over a few seconds
function makeReverbEcho(seconds) {
  const rate = Sound.ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = Sound.ctx.createBuffer(2, length, rate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const fade = Math.pow(1 - i / length, 3);
      data[i] = (Math.random() * 2 - 1) * fade;
    }
  }
  return buffer;
}


// ------------------------------------------------------------
// Building blocks
// ------------------------------------------------------------

// Plays one tone. frequency in Hz, duration in seconds, volume 0-1,
// delay = seconds from now, wave = 'sine' (smooth) or 'triangle' (a bit brighter)
function playTone(frequency, duration, volume, delay, wave) {
  if (!Sound.ctx || Sound.muted) return;

  const start = Sound.ctx.currentTime + (delay || 0);
  const osc = Sound.ctx.createOscillator();
  const fade = Sound.ctx.createGain();

  osc.type = wave || 'sine';
  osc.frequency.value = frequency;

  // Volume envelope: fade in very quickly, then fade out slowly
  fade.gain.setValueAtTime(0.0001, start);
  fade.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  fade.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(fade);
  fade.connect(Sound.master);
  fade.connect(Sound.reverb);

  osc.start(start);
  osc.stop(start + duration + 0.05);
}

// A soft bell: one main note plus two quiet higher notes for shimmer
function playBell(frequency, volume, delay) {
  playTone(frequency,     1.4, volume,        delay);
  playTone(frequency * 2, 0.6, volume * 0.25, delay);
  playTone(frequency * 3, 0.3, volume * 0.08, delay);
}

// Turns a step number into a frequency on the pentatonic scale.
// step 0 = C, 1 = D, 2 = E, 3 = G, 4 = A, 5 = the next C up, ...
function scaleNote(step) {
  const octave = Math.floor(step / PENTATONIC.length);
  const semitones = PENTATONIC[step % PENTATONIC.length] + 12 * octave;
  return BASE_FREQUENCY * Math.pow(2, semitones / 12);
}


// ------------------------------------------------------------
// The game's sounds
// ------------------------------------------------------------

// combo = how many bricks broken since the ball last touched the paddle
function soundBrickBreak(combo) {
  if (!Sound.ctx) return;

  const now = Sound.ctx.currentTime;
  if (now - Sound.lastNoteTime < 0.03) return;   // too many at once - skip this one
  Sound.lastNoteTime = now;

  const step = Math.min(combo, 12);   // climb up the scale, but not forever
  playBell(scaleNote(step), 0.16, 0);
}

// A tough brick got cracked but not broken
function soundBrickCrack() {
  playTone(scaleNote(0) / 2, 0.3, 0.12, 0, 'triangle');
}

// A soft, low "bop" when the ball touches the paddle
function soundPaddle() {
  playTone(196, 0.25, 0.18, 0);              // G3
  playTone(392, 0.08, 0.04, 0, 'triangle');  // a tiny click on top
}

// Rising sparkle when you catch a power-up
function soundPowerUp() {
  const steps = [5, 7, 9, 10];
  for (let i = 0; i < steps.length; i++) {
    playBell(scaleNote(steps[i]), 0.09, i * 0.07);
  }
}

// The barrier saves a ball
function soundBarrier() {
  playBell(scaleNote(3), 0.12, 0);
  playBell(scaleNote(8), 0.08, 0.05);
}

// A calm rising run when a whole wall is cleared
function soundWaveClear() {
  for (let i = 0; i < 8; i++) {
    playBell(scaleNote(i + 3), 0.09, i * 0.08);
  }
}

// Gentle falling notes when the last ball drops
function soundLifeLost() {
  const steps = [4, 2, 0];
  for (let i = 0; i < steps.length; i++) {
    playBell(scaleNote(steps[i]) / 2, 0.14, i * 0.18);
  }
}

function soundGameOver() {
  const steps = [5, 4, 2, 1, 0];
  for (let i = 0; i < steps.length; i++) {
    playBell(scaleNote(steps[i]) / 2, 0.13, i * 0.25);
  }
}


// ------------------------------------------------------------
// Mute (remembered between visits)
// ------------------------------------------------------------
function toggleMute() {
  Sound.muted = !Sound.muted;
  try {
    localStorage.setItem(MUTE_KEY, Sound.muted ? '1' : '0');
  } catch (e) {
    // storage blocked - mute just won't be remembered
  }
}

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    return false;
  }
}
