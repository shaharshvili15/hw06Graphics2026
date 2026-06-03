// =============================================================================
// Computer Graphics - Exercise 6 - Interactive Bowling Game
// =============================================================================
//
// STARTING POINT
// --------------
// HW06 builds directly on the static bowling alley you created in HW05.
//
//   >>> Copy the full contents of your completed HW05 `hw5.js` into this file <<<
//   >>> (everything that builds the lane, markings, gutters, pins, the ball,  <<<
//   >>> the lighting, the UI containers, and the orbit camera), then add the  <<<
//   >>> HW06 interactive systems marked with `// TODO (HW06)` below.          <<<
//
// The bare starter scene below is the SAME one you were given in HW05, so the
// project runs out of the box. Replace `createBowlingLane()` and the rest with
// your finished HW05 scene before you start on the HW06 features.
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

// Create bowling lane
// NOTE: Replace this with your completed HW05 scene (lane, markings, gutters,
// pins, bowling ball, pin deck, UI containers, etc.).
function createBowlingLane() {
  // Lane surface - just a simple light maple wood surface
  const laneGeometry = new THREE.BoxGeometry(3.5, 0.2, 60);
  const laneMaterial = new THREE.MeshPhongMaterial({
    color: 0xDEB887,  // Light maple wood color
    shininess: 80
  });
  const lane = new THREE.Mesh(laneGeometry, laneMaterial);
  lane.position.set(0, 0, -30);  // Lane extends from Z=0 (foul line) to Z=-60 (pin end)
  lane.receiveShadow = true;
  scene.add(lane);
}

// Create all elements
createBowlingLane();

// Set camera position for bowler's perspective
const cameraTranslate = new THREE.Matrix4();
cameraTranslate.makeTranslation(0, 5, 12);
camera.applyMatrix4(cameraTranslate);

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
let isOrbitEnabled = true;

// =============================================================================
// HW06 GAME STATE
// =============================================================================
// TODO (HW06): Track the state your game needs, for example:
//   - current frame (1..10) and roll within the frame
//   - the per-frame / per-roll pin counts that feed the scorecard
//   - the ball's current phase: 'aiming' | 'power' | 'rolling' | 'resolving'
//   - the ball's aim position / direction and chosen power
//   - which pins are still standing
// const gameState = { ... };

// =============================================================================
// HW06 UI: CONTROLS LIST + POWER METER + SCORECARD
// =============================================================================
// Reuse the HTML containers you created in HW05 (controls list + scorecard) and
// add a power-meter element here.
// TODO (HW06): Build the on-screen power meter (an oscillating bar) and render
// the live 10-frame scorecard (strikes 'X', spares '/', running total).

// Instructions display (controls list) — extend this with the HW06 controls.
const instructionsElement = document.createElement('div');
instructionsElement.style.position = 'absolute';
instructionsElement.style.bottom = '20px';
instructionsElement.style.left = '20px';
instructionsElement.style.color = 'white';
instructionsElement.style.fontSize = '16px';
instructionsElement.style.fontFamily = 'Arial, sans-serif';
instructionsElement.style.textAlign = 'left';
instructionsElement.innerHTML = `
  <h3>Bowling Game Controls:</h3>
  <p>O - Toggle orbit camera</p>
  <!-- TODO (HW06): document your aiming / power / release / reset controls -->
`;
document.body.appendChild(instructionsElement);

// =============================================================================
// HW06 INPUT HANDLING
// =============================================================================
// Handle key events
function handleKeyDown(e) {
  if (e.key === "o") {
    isOrbitEnabled = !isOrbitEnabled;
  }

  // TODO (HW06): add interactive controls, e.g.
  //   ArrowLeft / ArrowRight : move / aim the ball along the foul line
  //   ArrowUp   / ArrowDown  : adjust spin / curve (optional)
  //   Space                  : start the power meter -> lock power -> release
  //   r                      : reset pins / start a new game
}

document.addEventListener('keydown', handleKeyDown);

// =============================================================================
// HW06 PHYSICS & COLLISION (called every frame from animate)
// =============================================================================
// TODO (HW06): advance the simulation using delta time:
//   - integrate the ball's position from its velocity (and optional curve)
//   - detect when the ball enters a gutter (leaves the lane edges) -> gutter ball
//   - detect ball <-> pin collisions (sphere vs pin bounding cylinder)
//   - propagate pin <-> pin collisions and animate knocked pins toppling over
//   - detect end of roll (ball stopped / left the lane), count fallen pins,
//     update the score, advance the frame, and reset the ball to the approach
// function updateGame(deltaTime) { ... }

// =============================================================================
// ANIMATION LOOP
// =============================================================================
function animate() {
  requestAnimationFrame(animate);

  // TODO (HW06): compute deltaTime and call updateGame(deltaTime) here.

  // Update controls
  controls.enabled = isOrbitEnabled;
  controls.update();

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
