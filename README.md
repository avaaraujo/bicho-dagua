# Bicho d'Água

A jet-ski race inside a volcano for up to 4 friends, played in the browser. The look is a late-90s console game, built with Three.js. The first to finish 5 laps wins. If nobody finishes within 3 minutes, the race is a draw. Empty slots are filled by bots.

All characters, art, sounds and names are original.

## Playing

1. One player clicks **Criar sala** and gets a 4-letter code.
2. The others enter the code, or open the link from **Copiar convite**.
3. Each player picks a racer: Morsa, Garça, Sapo or Cabra.
4. The host clicks **Largar!**.

| | Steer | Accelerate | Brake / reverse |
|---|---|---|---|
| Keyboard | **A** / **D** (or ← →) | **J** (or ↑) | **K** (or ↓) |
| Phone | on-screen ‹ › buttons | **Acelerar** button | **Ré** button |
| Gamepad | left stick or d-pad | A or RT | B or LT |

The track is a pool-shaped oval with a wall down the middle, and a race lasts about 1 minute. As in the original minigame, the camera is fixed overhead and shows the whole track. Steering is relative to the jet-ski, so when it is heading toward the screen, left and right feel reversed; that is the challenge. Taking a corner too fast throws you into the wall and costs speed. If you turn around, **CONTRAMÃO!** appears on screen. After you cross the finish line, the camera moves behind your jet-ski, which keeps lapping on its own while the others finish.

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
