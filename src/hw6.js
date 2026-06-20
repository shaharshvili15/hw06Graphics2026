// =============================================================================
// Computer Graphics - Exercise 6 - Interactive Bowling Game
// =============================================================================
//
//
// HW06 adds the INTERACTIVE layer on top of the static scene:
//   1. Aiming & controls (move/aim the ball, oscillating power meter, release)
//   2. Simplified ball physics (rolling, gutter balls, optional curve)
//   3. Pin collision & toppling
//   4. 10-frame bowling scoring
//   5. Game flow (frames, reset, end-of-roll detection)
//
// Use simplified, hand-written physics in the animate() loop. Do NOT add an
// external physics engine.
// =============================================================================



import {OrbitControls} from './OrbitControls.js'

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
// Set background color
scene.background = new THREE.Color(0x1a1a2e);

// Add lights to the scene
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 20, -20);
scene.add(directionalLight);

// Enable shadows
renderer.shadowMap.enabled = true;
directionalLight.castShadow = true;

function degrees_to_radians(degrees) {
  var pi = Math.PI;
  return degrees * (pi/180);
}

// Module-scope references needed by HW06 game logic
let ballGroup;
const pins = [];
let sweeper;
const sweeperAnim = { active: false, phase: '', elapsed: 0, callback: null };
let audioCtx = null;
let rollGainNode = null;

function createLaneSurface() {
  const laneGeometry = new THREE.BoxGeometry(3.5, 0.2, 60);
  const laneMaterial = new THREE.MeshPhongMaterial({ color: 0xDEB887, shininess: 80 });
  const lane = new THREE.Mesh(laneGeometry, laneMaterial);
  lane.position.set(0, 0, -30);
  lane.receiveShadow = true;
  scene.add(lane);
}

function createApproachArea() {
  const approachGeo = new THREE.BoxGeometry(3.5, 0.2, 15);
  const approachMat = new THREE.MeshPhongMaterial({ color: 0xC8A96E, shininess: 60 });
  const approach = new THREE.Mesh(approachGeo, approachMat);
  approach.position.set(0, 0, 7.5);
  approach.receiveShadow = true;
  scene.add(approach);
}

function createGutters() {
  const gutterGeo = new THREE.BoxGeometry(0.4, 0.15, 75);
  const gutterMat = new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 30 });

  const leftGutter = new THREE.Mesh(gutterGeo, gutterMat);
  leftGutter.position.set(-1.95, -0.1, -22.5);
  leftGutter.receiveShadow = true;
  scene.add(leftGutter);

  const rightGutter = new THREE.Mesh(gutterGeo, gutterMat);
  rightGutter.position.set(1.95, -0.1, -22.5);
  rightGutter.receiveShadow = true;
  scene.add(rightGutter);
}

function createFoulLine() {
  const geo = new THREE.PlaneGeometry(3.5, 0.1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const foulLine = new THREE.Mesh(geo, mat);
  foulLine.rotation.x = -Math.PI / 2;
  foulLine.position.set(0, 0.11, 0);  // just above lane surface, at Z=0 boundary
  scene.add(foulLine);
}

function createApproachDots() {
  const dotGeo = new THREE.CircleGeometry(0.06, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const xPositions = [-1.5, -0.75, 0, 0.75, 1.5];
  const zPositions = [3.5, 7.0];  // two rows on the approach area

  for (const z of zPositions) {
    for (const x of xPositions) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x, 0.11, z);
      scene.add(dot);
    }
  }
}

function createTargetingArrows() {
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x5C3A1E, side: THREE.DoubleSide });

  // Triangle tip points in local +Y which maps to world -Z (toward pins) after rotation.x = -PI/2
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.28);      // tip — toward pins
  arrowShape.lineTo(-0.18, -0.18); // back-left corner — toward bowler
  arrowShape.lineTo(0.18, -0.18);  // back-right corner — toward bowler
  arrowShape.closePath();

  const arrowGeo = new THREE.ShapeGeometry(arrowShape);
  const xPositions = [-1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5];

  for (const x of xPositions) {
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(x, 0.11, -13);
    scene.add(arrow);
  }
}

function createPinDeck() {
  const deckGeo = new THREE.BoxGeometry(3.5, 0.21, 5);
  const deckMat = new THREE.MeshPhongMaterial({ color: 0xF5DEB3, shininess: 50 });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.set(0, 0, -58.3);  // covers Z=-55.8 to Z=-60.8, tight around pins
  deck.receiveShadow = true;
  scene.add(deck);
}

function createBowlingPins() {
  // 2D profile: [radius, height] points revolved around Y axis to form pin shape
  const profilePoints = [
    new THREE.Vector2(0.00, 0.00),  // center of base
    new THREE.Vector2(0.10, 0.00),  // base edge
    new THREE.Vector2(0.15, 0.09),  // widen
    new THREE.Vector2(0.18, 0.24),  // widest belly
    new THREE.Vector2(0.16, 0.38),
    new THREE.Vector2(0.10, 0.52),  // narrow toward neck
    new THREE.Vector2(0.07, 0.61),  // neck
    new THREE.Vector2(0.07, 0.72),  // neck top
    new THREE.Vector2(0.11, 0.85),  // head shoulder
    new THREE.Vector2(0.10, 0.98),  // head
    new THREE.Vector2(0.06, 1.17),  // crown taper
    new THREE.Vector2(0.00, 1.25),  // tip — matches spec
  ];

  const pinGeo = new THREE.LatheGeometry(profilePoints, 20);
  const pinMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 120 });

  // Red stripe cylinder at neck height
  const stripeGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.08, 20);
  const stripeMat = new THREE.MeshPhongMaterial({ color: 0xcc0000, shininess: 80 });

  // Standard 10-pin triangular formation (X, Z) — head pin at Z=-57
  const pinPositions = [
    [  0.0, -57.000],  // Pin 1 — head pin
    [ -0.5, -57.866],  // Pin 2
    [  0.5, -57.866],  // Pin 3
    [ -1.0, -58.732],  // Pin 4
    [  0.0, -58.732],  // Pin 5
    [  1.0, -58.732],  // Pin 6
    [ -1.5, -59.598],  // Pin 7
    [ -0.5, -59.598],  // Pin 8
    [  0.5, -59.598],  // Pin 9
    [  1.5, -59.598],  // Pin 10
  ];

  for (const [x, z] of pinPositions) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(pinGeo, pinMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.66;  // neck height
    stripe.castShadow = true;
    group.add(stripe);

    group.position.set(x, 0.1, z);  // base sits just above lane surface
    scene.add(group);
    pins.push({ mesh: group, x, z, standing: true, falling: false, fallAngle: 0, fallAxis: new THREE.Vector3() });
  }
}

function createBowlingBall() {
  const ballRadius = 0.45;
  ballGroup = new THREE.Group();
  ballGroup.position.set(0, ballRadius + 0.1, 5);  // resting on approach area

  // Ball body — dark glossy
  const ballGeo = new THREE.SphereGeometry(ballRadius, 32, 32);
  const ballMat = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, shininess: 220, specular: 0x444466 });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  ballGroup.add(ball);

  // Finger holes — dark circles placed flush on ball surface (decal approach)
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.FrontSide });

  const holes = [
    { radius: 0.04, pos: new THREE.Vector3(-0.08, 0.384, 0.22) },  // middle finger — upper left
    { radius: 0.04, pos: new THREE.Vector3( 0.08, 0.384, 0.22) },  // ring finger   — upper right
    { radius: 0.05, pos: new THREE.Vector3( 0.00, 0.352, 0.28) },  // thumb         — below, centered
  ];

  for (const h of holes) {
    const holeGeo = new THREE.CircleGeometry(h.radius, 24);
    const hole = new THREE.Mesh(holeGeo, holeMat);
    // Place circle just outside surface to avoid z-fighting, facing outward
    const outward = h.pos.clone().normalize();
    hole.position.copy(outward.clone().multiplyScalar(0.452));
    hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
    ballGroup.add(hole);
  }

  scene.add(ballGroup);
}

function createSweeper() {
  const geo = new THREE.BoxGeometry(3.6, 0.3, 0.2);
  const mat = new THREE.MeshPhongMaterial({ color: 0x777777, shininess: 40 });
  sweeper = new THREE.Mesh(geo, mat);
  sweeper.visible = false;
  sweeper.position.set(0, 3, -55);
  scene.add(sweeper);
}

// Create all elements
createLaneSurface();
createApproachArea();
createGutters();
createFoulLine();
createApproachDots();
createTargetingArrows();
createPinDeck();
createBowlingPins();
createBowlingBall();
createSweeper();

// Set camera position for bowler's perspective
const cameraTranslate = new THREE.Matrix4();
cameraTranslate.makeTranslation(0, 5, 12);
camera.applyMatrix4(cameraTranslate);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
let isOrbitEnabled = true;

const clock = new THREE.Clock();

// =============================================================================
// HW06 GAME STATE
// =============================================================================
const gameState = {
  phase: 'aiming',         // 'aiming' | 'power' | 'rolling' | 'resolving'
  frame: 1,                // 1..10
  roll: 1,                 // 1 or 2 (3 in 10th frame)
  rolls: [],               // flat list of pin counts per roll (feeds scorer)
  pinsKnockedThisRoll: 0,
  ballVelocity: new THREE.Vector3(),
  powerLevel: 0,           // 0..100
  powerDirection: 1,       // +1 or -1 (oscillation direction)
  aimX: 0,                 // ball X position at foul line
  spin: 0,                 // -1 (left hook) to +1 (right hook), set with Up/Down
  cameraMode: 'bowler',    // 'bowler' | 'follow' | 'overhead' | 'pinend' | 'side'
  gameOver: false,
};

const BALL_RADIUS = 0.45;
const LANE_HALF_WIDTH = 1.75;
const PIN_RADIUS = 0.18;
const BALL_START_Z = 5;

// =============================================================================
// HW06 UI: CONTROLS LIST + POWER METER + SCORECARD
// =============================================================================
// Instructions display (controls list)
function createUI() {
  // Shared styles
  const style = document.createElement('style');
  style.textContent = `
    .bowling-panel {
      position: absolute;
      background: rgba(0, 0, 0, 0.65);
      color: white;
      font-family: Arial, sans-serif;
      padding: 12px 16px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .bowling-panel h3 {
      margin: 0 0 8px 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #ffa500;
    }
    .bowling-panel p {
      margin: 3px 0;
      font-size: 13px;
    }
    /* Controls panel — bottom left */
    #controls-panel {
      bottom: 20px;
      left: 20px;
    }
    /* Scorecard — bottom right */
    #scorecard-container {
      bottom: 20px;
      right: 20px;
    }
    #scorecard {
      display: flex;
      gap: 3px;
      margin-top: 6px;
    }
    .frame {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 34px;
    }
    .frame-label {
      font-size: 10px;
      color: #aaa;
      margin-bottom: 2px;
    }
    .frame-rolls {
      display: flex;
      gap: 2px;
    }
    .roll-box {
      width: 13px;
      height: 16px;
      border: 1px solid rgba(255,255,255,0.3);
      font-size: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.05);
    }
    .frame-total {
      width: 100%;
      height: 18px;
      border: 1px solid rgba(255,255,255,0.3);
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
      background: rgba(255,255,255,0.08);
    }
  `;
  document.head.appendChild(style);

  // Controls panel (bottom-left)
  const controlsPanel = document.createElement('div');
  controlsPanel.id = 'controls-panel';
  controlsPanel.className = 'bowling-panel';
  controlsPanel.innerHTML = `
    <h3>Controls</h3>
    <p>&larr; / &rarr; &mdash; Aim ball</p>
    <p>&uarr; / &darr; &mdash; Spin / hook</p>
    <p>Space &mdash; Start / lock power meter</p>
    <p>C &mdash; Cycle camera</p>
    <p>R &mdash; Reset game</p>
    <p>O &mdash; Orbit camera toggle</p>
    <p id="spin-display" style="color:#ffa500;margin-top:6px;">Spin: straight</p>
  `;
  document.body.appendChild(controlsPanel);

  // Scorecard panel (bottom-right)
  const scorecardContainer = document.createElement('div');
  scorecardContainer.id = 'scorecard-container';
  scorecardContainer.className = 'bowling-panel';

  let html = '<h3>Scorecard</h3><div id="scorecard">';
  for (let i = 1; i <= 10; i++) {
    const rolls = i === 10
      ? `<div class="roll-box"></div><div class="roll-box"></div><div class="roll-box"></div>`
      : `<div class="roll-box"></div><div class="roll-box"></div>`;
    html += `
      <div class="frame">
        <div class="frame-label">${i}</div>
        <div class="frame-rolls">${rolls}</div>
        <div class="frame-total"></div>
      </div>`;
  }
  html += '</div>';
  scorecardContainer.innerHTML = html;
  document.body.appendChild(scorecardContainer);

  // Power meter (centered top, hidden until Space is pressed)
  const meterContainer = document.createElement('div');
  meterContainer.id = 'power-meter-container';
  meterContainer.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    background: rgba(0,0,0,0.65);
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.15);
    min-width: 200px;
  `;
  meterContainer.innerHTML = `
    <span style="color:#ffa500;font-family:Arial,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Power</span>
    <div style="width:200px;height:16px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,0.2);">
      <div id="power-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#00cc44,#ffcc00,#ff3300);transition:none;"></div>
    </div>
    <span id="power-label" style="color:white;font-family:Arial,sans-serif;font-size:11px;">0%</span>
  `;
  document.body.appendChild(meterContainer);

  // Game-over overlay
  const gameOver = document.createElement('div');
  gameOver.id = 'game-over';
  gameOver.style.cssText = `
    display: none;
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.7);
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  `;
  gameOver.innerHTML = `
    <h1 style="color:#ffa500;font-family:Arial,sans-serif;font-size:48px;margin:0;">Game Over</h1>
    <p style="color:white;font-family:Arial,sans-serif;font-size:20px;margin:0;">Press R to play again</p>
  `;
  document.body.appendChild(gameOver);
}

createUI();

// =============================================================================
// HW06 INPUT HANDLING
// =============================================================================
// Handle key events
function handleKeyDown(e) {
  if (e.key === "o" || e.key === "O") {
    isOrbitEnabled = !isOrbitEnabled;
  }

    if (gameState.phase === 'aiming') {
    if (e.key === 'ArrowLeft') {
      gameState.aimX = Math.max(-LANE_HALF_WIDTH, gameState.aimX - 0.1);
      ballGroup.position.x = gameState.aimX;
    }
    if (e.key === 'ArrowRight') {
      gameState.aimX = Math.min(LANE_HALF_WIDTH, gameState.aimX + 0.1);
      ballGroup.position.x = gameState.aimX;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      gameState.spin = Math.min(1, gameState.spin + 0.1);
      updateSpinDisplay();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      gameState.spin = Math.max(-1, gameState.spin - 0.1);
      updateSpinDisplay();
    }
    if (e.key === ' ') {
      e.preventDefault();
      gameState.phase = 'power';
      document.getElementById('power-meter-container').style.display = 'flex';
    }
  } else if (gameState.phase === 'power') {
    if (e.key === ' ') {
      e.preventDefault();
      // Lock power and release the ball
      const speed = (gameState.powerLevel / 100) * 40;
      gameState.ballVelocity.set(0, 0, -speed);
      gameState.phase = 'rolling';
      gameState.pinsKnockedThisRoll = 0;
      document.getElementById('power-meter-container').style.display = 'none';
      startRollSound();
    }
  }

  // C cycles camera presets
  if (e.key === 'c' || e.key === 'C') cycleCamera();

  // R resets the game from any state
  if (e.key === 'r' || e.key === 'R') resetGame();
}

function updateSpinDisplay() {
  const el = document.getElementById('spin-display');
  if (!el) return;
  const pct = Math.round(Math.abs(gameState.spin) * 100);
  if (pct === 0) el.textContent = 'Spin: straight';
  else if (gameState.spin > 0) el.textContent = `Spin: right hook ${pct}%`;
  else el.textContent = `Spin: left hook ${pct}%`;
}

document.addEventListener('keydown', handleKeyDown);

// =============================================================================
// HW06 PHYSICS & COLLISION (called every frame from animate)
// =============================================================================
// =============================================================================
// BONUS: SOUND EFFECTS (Web Audio API — no external library)
// =============================================================================
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function startRollSound() {
  try {
    const ctx = getAudio();
    // Looping white-noise buffer filtered to a low rumble
    const bufSize = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 100;
    filter.Q.value = 0.8;

    rollGainNode = ctx.createGain();
    rollGainNode.gain.setValueAtTime(0, ctx.currentTime);
    rollGainNode.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.4);

    src.connect(filter);
    filter.connect(rollGainNode);
    rollGainNode.connect(ctx.destination);
    src.start();
    rollGainNode._src = src;
  } catch(e) {}
}

function stopRollSound() {
  try {
    if (rollGainNode) {
      rollGainNode.gain.linearRampToValueAtTime(0, getAudio().currentTime + 0.3);
      setTimeout(() => { try { rollGainNode._src.stop(); } catch(e) {} rollGainNode = null; }, 400);
    }
  } catch(e) {}
}

function playPinCrash() {
  try {
    const ctx = getAudio();
    const bufSize = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 1.5);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  } catch(e) {}
}

function playStrikeSound() {
  try {
    const ctx = getAudio();
    [220, 277, 330, 440].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.1;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch(e) {}
}

// =============================================================================
// BONUS: PINSETTER / SWEEPER ANIMATION
// =============================================================================
function updateSweeper(dt) {
  if (!sweeperAnim.active) return;
  sweeperAnim.elapsed += dt;

  if (sweeperAnim.phase === 'descend') {
    sweeper.position.y = THREE.MathUtils.lerp(3, 0.8, Math.min(sweeperAnim.elapsed / 0.35, 1));
    if (sweeperAnim.elapsed >= 0.35) { sweeperAnim.phase = 'sweep'; sweeperAnim.elapsed = 0; }

  } else if (sweeperAnim.phase === 'sweep') {
    sweeper.position.z = THREE.MathUtils.lerp(-55, -63, Math.min(sweeperAnim.elapsed / 0.7, 1));
    if (sweeperAnim.elapsed >= 0.7) {
      for (const pin of pins) { if (!pin.standing) pin.mesh.visible = false; }
      sweeperAnim.phase = 'rise';
      sweeperAnim.elapsed = 0;
    }

  } else if (sweeperAnim.phase === 'rise') {
    sweeper.position.y = THREE.MathUtils.lerp(0.8, 3, Math.min(sweeperAnim.elapsed / 0.35, 1));
    if (sweeperAnim.elapsed >= 0.35) {
      sweeper.visible = false;
      sweeper.position.set(0, 3, -55);
      sweeperAnim.active = false;
      sweeperAnim.callback();
    }
  }
}

function sweepAndResetPins(onDone) {
  sweeper.visible = true;
  sweeper.position.set(0, 3, -55);
  sweeperAnim.active = true;
  sweeperAnim.phase = 'descend';
  sweeperAnim.elapsed = 0;
  sweeperAnim.callback = () => { resetPins(); onDone(); };
}

// =============================================================================
// BONUS: CAMERA PRESETS
// =============================================================================
const CAMERA_CYCLE = ['bowler', 'follow', 'overhead', 'pinend', 'side'];
const CAMERA_PRESETS = {
  bowler:   { pos: [0, 5, 12],   look: [0, 0, -20] },
  overhead: { pos: [0, 30, -28], look: [0, 0, -28] },
  pinend:   { pos: [0, 4, -68],  look: [0, 0, -45] },
  side:     { pos: [8, 3, -28],  look: [0, 0, -28] },
};

function cycleCamera() {
  const idx = CAMERA_CYCLE.indexOf(gameState.cameraMode);
  gameState.cameraMode = CAMERA_CYCLE[(idx + 1) % CAMERA_CYCLE.length];
  const preset = CAMERA_PRESETS[gameState.cameraMode];
  if (preset) {
    camera.position.set(...preset.pos);
    camera.lookAt(...preset.look);
    isOrbitEnabled = false;
  } else {
    // 'follow' — set bowler orientation once, then updateCamera only translates Z each frame
    const ball = ballGroup.position;
    camera.position.set(ball.x, 5, ball.z + 14);
    camera.lookAt(ball.x, 0, ball.z - 25);
    isOrbitEnabled = false;
  }
  if (gameState.cameraMode === 'bowler') {
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 0, -20);
    isOrbitEnabled = true;
  }
}

function updateCamera() {
  if (gameState.cameraMode !== 'follow') return;
  const ball = ballGroup.position;
  // Same height and pitch as the bowler view, just sliding Z with the ball
  camera.position.set(ball.x, 5, ball.z + 14);
  camera.lookAt(ball.x, 0, ball.z - 25);
}

function resetBall() {
  gameState.aimX = 0;
  ballGroup.position.set(0, BALL_RADIUS + 0.1, BALL_START_Z);
  ballGroup.rotation.set(0, 0, 0);
  ballGroup.visible = true;
  gameState.ballVelocity.set(0, 0, 0);
  gameState.phase = 'aiming';
}

function updateScorecard() {
  const r = gameState.rolls;
  let i = 0;
  let total = 0;
  const frames = document.querySelectorAll('.frame');

  for (let f = 0; f < 10; f++) {
    const boxes = frames[f].querySelectorAll('.roll-box');
    const totalCell = frames[f].querySelector('.frame-total');
    boxes.forEach(b => b.textContent = '');
    totalCell.textContent = '';

    if (i >= r.length) break;

    if (f === 9) {
      // 10th frame: display up to 3 rolls, score is raw sum
      if (r[i]   !== undefined) boxes[0].textContent = r[i]   === 10 ? 'X' : (r[i]   === 0 ? '-' : r[i]);
      if (r[i+1] !== undefined) {
        if      (r[i] === 10 && r[i+1] === 10)  boxes[1].textContent = 'X';
        else if (r[i] === 10)                    boxes[1].textContent = r[i+1] === 0 ? '-' : r[i+1];
        else if (r[i] + r[i+1] === 10)           boxes[1].textContent = '/';
        else                                     boxes[1].textContent = r[i+1] === 0 ? '-' : r[i+1];
      }
      if (r[i+2] !== undefined) boxes[2].textContent = r[i+2] === 10 ? 'X' : (r[i+2] === 0 ? '-' : r[i+2]);
      const frameRolls = [r[i], r[i+1], r[i+2]].filter(v => v !== undefined);
      if (frameRolls.length > 0) {
        total += frameRolls.reduce((a, b) => a + b, 0);
        totalCell.textContent = total;
      }
    } else if (r[i] === 10) {
      // Strike
      boxes[0].textContent = '';
      boxes[1].textContent = 'X';
      if (r[i+1] !== undefined && r[i+2] !== undefined) {
        total += 10 + r[i+1] + r[i+2];
        totalCell.textContent = total;
      }
      i++;
    } else if (r[i+1] !== undefined) {
      // Two rolls this frame
      boxes[0].textContent = r[i] === 0 ? '-' : r[i];
      if (r[i] + r[i+1] === 10) {
        // Spare
        boxes[1].textContent = '/';
        if (r[i+2] !== undefined) {
          total += 10 + r[i+2];
          totalCell.textContent = total;
        }
      } else {
        // Open frame
        boxes[1].textContent = r[i+1] === 0 ? '-' : r[i+1];
        total += r[i] + r[i+1];
        totalCell.textContent = total;
      }
      i += 2;
    } else {
      // First roll of this frame in progress, no total yet
      boxes[0].textContent = r[i] === 0 ? '-' : r[i];
      break;
    }
  }
}

function resetPins() {
  for (const pin of pins) {
    pin.standing = true;
    pin.falling = false;
    pin.fallAngle = 0;
    pin.mesh.rotation.set(0, 0, 0);
    pin.mesh.visible = true;
  }
}

function setGameOver() {
  gameState.gameOver = true;
  updateScorecard();
  document.getElementById('game-over').style.display = 'flex';
}

function resetGame() {
  stopRollSound();
  sweeperAnim.active = false;
  sweeper.visible = false;
  gameState.phase = 'aiming';
  gameState.frame = 1;
  gameState.roll = 1;
  gameState.rolls = [];
  gameState.pinsKnockedThisRoll = 0;
  gameState.powerLevel = 0;
  gameState.powerDirection = 1;
  gameState.aimX = 0;
  gameState.spin = 0;
  gameState.cameraMode = 'bowler';
  gameState.gameOver = false;
  gameState.ballVelocity.set(0, 0, 0);
  camera.position.set(0, 5, 12);
  camera.lookAt(0, 0, -20);
  isOrbitEnabled = true;
  resetPins();
  resetBall();
  updateScorecard();
  updateSpinDisplay();
  document.getElementById('game-over').style.display = 'none';
}

function handleTenthFrame(pinsFallen) {
  const r = gameState.rolls;
  const roll = gameState.roll;

  if (roll === 1) {
    if (pinsFallen === 10) {
      setTimeout(() => {
        gameState.roll = 2;
        gameState.pinsKnockedThisRoll = 0;
        sweepAndResetPins(() => resetBall());
      }, 800);
    } else {
      setTimeout(() => {
        gameState.roll = 2;
        gameState.pinsKnockedThisRoll = 0;
        resetBall();
      }, 1500);
    }
  } else if (roll === 2) {
    const r1 = r[r.length - 2];
    const r2 = pinsFallen;
    const hasBonus = r1 === 10 || r1 + r2 === 10;
    if (hasBonus) {
      const needsReset = r2 === 10 || (r1 !== 10 && r1 + r2 === 10);
      if (needsReset) {
        setTimeout(() => {
          gameState.roll = 3;
          gameState.pinsKnockedThisRoll = 0;
          sweepAndResetPins(() => resetBall());
        }, 800);
      } else {
        setTimeout(() => {
          gameState.roll = 3;
          gameState.pinsKnockedThisRoll = 0;
          resetBall();
        }, 1500);
      }
    } else {
      setTimeout(() => setGameOver(), 1500);
    }
  } else {
    setTimeout(() => setGameOver(), 1500);
  }
}

function endRoll(pinsFallen) {
  stopRollSound();
  gameState.rolls.push(pinsFallen);
  updateScorecard();
  gameState.phase = 'resolving';

  const isStrike = gameState.roll === 1 && pinsFallen === 10;
  if (isStrike) playStrikeSound();

  if (gameState.frame < 10) {
    if (isStrike || gameState.roll === 2) {
      // Frame complete — sweep and advance with fresh pins
      setTimeout(() => {
        gameState.frame++;
        gameState.roll = 1;
        gameState.pinsKnockedThisRoll = 0;
        sweepAndResetPins(() => resetBall());
      }, 800);
    } else {
      // Roll 2 in same frame — keep downed pins, just reset ball
      setTimeout(() => {
        gameState.roll = 2;
        gameState.pinsKnockedThisRoll = 0;
        resetBall();
      }, 1500);
    }
  } else {
    handleTenthFrame(pinsFallen);
  }
}

// impactDir: normalized vector from pin center toward the ball (where the hit came from).
// The pin topples away from the ball, i.e. in the -impactDir direction.
// force is 0-1, based on how fast the ball was going when it hit.
// each time a pin knocks a neighbour the force drops, so weak shots don't chain all the way back.
function startTopple(pin, impactDir, force = 0) {
  if (pin.falling || !pin.standing) return;
  pin.falling = true;
  playPinCrash();
  // Rotation axis perpendicular to fall direction in the XZ plane
  pin.fallAxis.set(-impactDir.z, 0, impactDir.x).normalize();
  gameState.pinsKnockedThisRoll++;

  if (force < 0.15) return; // not enough force left to knock neighbours
  const nextForce = force * 0.55;
  for (const other of pins) {
    if (!other.standing || other.falling) continue;
    const dx = other.x - pin.x;
    const dz = other.z - pin.z;
    if (Math.sqrt(dx * dx + dz * dz) < 1.1) {
      const neighbourImpact = new THREE.Vector3(-dx, 0, -dz).normalize();
      setTimeout(() => startTopple(other, neighbourImpact, nextForce), 150);
    }
  }
}

function updateToppling(dt) {
  for (const pin of pins) {
    if (!pin.falling) continue;
    pin.fallAngle += dt * 3.5;
    if (pin.fallAngle >= Math.PI / 2) {
      pin.fallAngle = Math.PI / 2;
      pin.standing = false;
      pin.falling = false;
    }
    pin.mesh.setRotationFromAxisAngle(pin.fallAxis, pin.fallAngle);
  }
}

function updateGame(dt) {
  if (gameState.phase !== 'rolling' && gameState.phase !== 'gutter') return;
  const inGutter = gameState.phase === 'gutter';

  // Integrate position from velocity
  ballGroup.position.addScaledVector(gameState.ballVelocity, dt);

  // Rolling rotation: ω = v / r  (forward roll → negative X rotation, lateral → Z rotation)
  ballGroup.rotation.x += (gameState.ballVelocity.z / BALL_RADIUS) * dt;
  ballGroup.rotation.z -= (gameState.ballVelocity.x / BALL_RADIUS) * dt;

  // Rolling friction — light deceleration so the ball still reaches the pins
  gameState.ballVelocity.z *= (1 - 0.08 * dt);

  // Hook / curve: sideways acceleration from spin
  gameState.ballVelocity.x += gameState.spin * 5 * dt;

  // check if the ball hit any standing pin (skip when already in gutter)
  if (inGutter) return;
  for (const pin of pins) {
    if (!pin.standing || pin.falling) continue;
    const dx = ballGroup.position.x - pin.x;
    const dz = ballGroup.position.z - pin.z;
    if (Math.sqrt(dx * dx + dz * dz) < BALL_RADIUS + PIN_RADIUS) {
      const force = Math.min(1, Math.abs(gameState.ballVelocity.z) / 40);
      startTopple(pin, new THREE.Vector3(dx, 0, dz).normalize(), force);
      // ball slows down each time it hits a pin
      gameState.ballVelocity.multiplyScalar(0.75);
    }
  }

  // Gutter detection: ball left the lane edges → keep rolling visually for a moment
  if (Math.abs(ballGroup.position.x) >= LANE_HALF_WIDTH) {
    gameState.phase = 'gutter';
    setTimeout(() => { ballGroup.visible = false; endRoll(0); }, 900);
    return;
  }

  // Ball reached the pin deck or rolled past it — wait for propagation then end
  if (ballGroup.position.z < -61) {
    gameState.phase = 'resolving';
    ballGroup.visible = false;
    setTimeout(() => endRoll(gameState.pinsKnockedThisRoll), 800);
    return;
  }

  // Ball effectively stopped on the lane
  if (Math.abs(gameState.ballVelocity.z) < 0.5) {
    gameState.phase = 'resolving';
    setTimeout(() => endRoll(gameState.pinsKnockedThisRoll), 800);
    return;
  }
}

function updatePowerMeter(dt) {
  if (gameState.phase !== 'power') return;
  gameState.powerLevel += gameState.powerDirection * dt * 80;
  if (gameState.powerLevel >= 100) { gameState.powerLevel = 100; gameState.powerDirection = -1; }
  if (gameState.powerLevel <= 0)   { gameState.powerLevel = 0;   gameState.powerDirection =  1; }
  document.getElementById('power-bar').style.width = gameState.powerLevel + '%';
  document.getElementById('power-label').textContent = Math.round(gameState.powerLevel) + '%';
}

// =============================================================================
// ANIMATION LOOP
// =============================================================================
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  updatePowerMeter(dt);
  updateGame(dt);
  updateToppling(dt);
  updateSweeper(dt);

  // Orbit controls must update before follow camera so it cannot override it
  controls.enabled = isOrbitEnabled;
  controls.update();
  updateCamera();

  renderer.render(scene, camera);
}

animate();

// =============================================================================
// Responsiveness: keep the scene correct when the window is resized.
// =============================================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
