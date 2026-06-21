# Computer Graphics - Exercise 6 - Interactive Bowling Game

## Group Members
- Shahar Shvili 207637968
- Natan Yudka 347465403

## How to Run
1. Make sure you have Node.js installed
2. Install dependencies: `npm install`
3. Start the server: `node index.js`
4. Open your browser at http://localhost:8000

## Controls
| Key | Action |
|-----|--------|
| `←` / `→` | Move the ball left / right along the foul line |
| `↑` / `↓` | Add right / left hook (spin/curve) |
| `Space` | First press: starts the oscillating power meter. Second press: locks power and releases the ball |
| `C` | Cycle camera modes: Bowler → Follow (tracks the ball) → Overhead → Pin-end → Side |
| `O` | Toggle orbit camera (free look) |
| `R` | Reset pins and start a new game |

## Bonus Features
- **Ball hook / curve** — `↑` / `↓` arrows apply spin that curves the ball left or right as it rolls
- **Follow camera** — one of the `C` camera presets tracks the ball down the lane
- **Pinsetter / sweeper animation** — after each roll a sweeper bar descends, clears any fallen pins, and rises before the next roll
- **Sound effects** — synthesized sounds using the Web Audio API: a low rumble while the ball rolls, and an impact crack when pins are hit (no external audio files)

## Known Limitations
- The collision detection uses the spec formula `ball radius + pin radius` for hit detection. Because the ball's visual radius is proportionally large relative to pin spacing, a straight center throw with full power will often result in a strike — which is realistic but leaves less room for variation on center shots. Off-center and angled throws behave as expected.
- Shadows from the directional light may not reach the full length of the lane (cosmetic, carried over from HW05).

## Technical Details
- Built with THREE.js r128 (loaded via CDN)
- All physics and collision are hand-written — no external physics engine
- `src/hw6.js` — all game logic
- `src/OrbitControls.js` — vendored THREE.js OrbitControls
- `index.js` — Express server (port 8000)
