# Bicho d'Água

A jet-ski race inside a volcano for up to 4 friends, played in the browser. The look is a late-90s console game, built with Three.js. The first to finish 5 laps wins. If nobody finishes within 3 minutes, the race is a draw. Empty slots are filled by bots.

All characters, art, sounds and names are original.

## Playing

1. One player clicks **Criar sala** and gets a 4-letter code.
2. The others enter the code, or open the link from **Copiar convite**.
3. Each player picks a racer: Morsa, Garça, Sapo or Cabra.
4. The host picks the mode, **Quick Play** (one race) or **Grand Prix** (4 races on tracks you draw), and starts.

| | Steer | Accelerate | Brake / reverse |
|---|---|---|---|
| Keyboard | **A** / **D** (or ← →) | **J** (or ↑) | **K** (or ↓) |
| Phone | on-screen ‹ › buttons | **Acelerar** button | **Ré** button |
| Gamepad | left stick or d-pad | A or RT | B or LT |

The track is a pool seen from above, with a wall down the middle: a starting straight, two tight 180° turns at the ends, and a chicane on the top straight. A race lasts about 1 minute.

The jet-ski takes about 5 seconds to reach top speed, and **any collision stops it**: the wall or another jet-ski. You have to brake (**K**) before the turns. As in the original minigame, the camera has a fixed overhead angle and frames the racers who are still in the race. When they are close together it zooms in on them, and it only opens up to the whole track when they are spread out. Steering is relative to the jet-ski, so when it is heading toward the screen, left and right feel reversed. If you turn around, **CONTRAMÃO!** appears on screen. After you cross the finish line, the camera moves behind your jet-ski, which keeps lapping on its own while the others finish.

### Grand Prix

Four races, each on a track drawn by one of the players. Before each race the game picks a human player (everyone draws once before anyone repeats). That player has 15 seconds to draw a closed loop on a sheet of paper: the loop closes when the pencil is lifted inside the orange start circle, and that point becomes the start. If the drawing does not become a track, the player gets 10 more seconds; if it fails again, the race uses the Quick Play pool. The others wait without seeing the drawing. A figure-8 becomes a bridge over a tunnel (up to 3 crossings). Each race gives 10, 6, 3 and 1 points; bots score too. Ties are broken by wins, then by the last race. The champion lifts the trophy on the podium at the end.

The drawing becomes a track through geometry only (`shared/sketch.js`), with no paid API. The full plan and rules are in [docs/grand-prix.md](docs/grand-prix.md).

## Running locally

```bash
npm install
npm run dev     # game server on 3000 and Vite on http://localhost:5173
npm test        # simulation and room tests
```

To test the production build: `npm run build && npm start`, then open http://localhost:3000.

## Publishing on Render (free plan)

The repository includes `render.yaml`. One Node service serves both the game and the multiplayer.

1. On [render.com](https://render.com), click **New → Blueprint** and choose this repository.
2. Render reads `render.yaml`. Confirm the **Free** plan and create the service.
3. When the deploy finishes, share the `https://bicho-dagua.onrender.com` link (or whatever name Render assigns).

On the free plan the server sleeps after 15 minutes without players. The first visit after that takes about 1 minute to wake it up.

## Structure

- `shared/`: rules, track, physics and bots. The same code runs on the server and in the browser.
- `server/`: Express + Socket.IO. Handles rooms, countdown, laps, standings and the bots.
- `client/`: Three.js scene, characters, HUD, menus and touch controls.
- `docs/keyvisuals/`: the 6 visual directions explored (we chose number 3).
- `PRODUCT.md` / `DESIGN.md`: the product brief and the visual system.

## Networking

Each browser simulates its own jet-ski and sends its position 20 times per second. The server checks that the movement is plausible, computes laps and standings, drives the bots, and sends a snapshot of everyone back 20 times per second. The other jet-skis are drawn 120 ms in the past, which makes their movement smooth.

## Test mode

Adding `?autopilot=1` to the address makes your jet-ski drive itself. It is used by automated tests.

With the server started with `BICHO_DEV=1`, two shortcuts help test drawn tracks by hand: `node scripts/dev-sketch.js CODE figureEight 3` sends a test drawing for the next start in room `CODE`, and the `dev:finish` socket event ends the current race at once. `node scripts/sketch-gallery.js` renders how the test drawings become tracks (`dist/sketch-gallery.html`).
