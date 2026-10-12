# Design: Bicho d'Água

Visual direction: **late-90s console played on a CRT TV** (key visual 3, `docs/keyvisuals/03-lowpoly-anos-90.jpg`). It should look like a beloved cartridge, not a modern mobile racer and not a clone of any franchise.

## 3D world

- **Geometry:** chunky low-poly with flat faces (`flatShading`). Colors come from the vertices, never from realistic textures. Small textures (16–64 px) are drawn in a canvas and filtered with `NearestFilter`.
- **Resolution:** the scene renders at 560 lines and is scaled up with `image-rendering: pixelated`. CSS scanlines and vignette sit on top. This is the visual signature and it also keeps phones running smoothly.
- **Light:** a violet-and-teal hemisphere light plus a warm sun. No real shadows; each jet-ski gets a dark disc on the water instead.
- **Fog:** violet `#c4a2c6`, from 110 to 360 m.
- **Track:** a pool-shaped oval (two 46 m straights and two tight 180° turns) with a low checkered wall around the outside and down the middle, in violet.
- **Camera:** fixed overhead at about 42° (56° on a phone held upright, turned 90° so the track fits), showing the whole pool. This is the core of the game's difficulty. The chase camera appears only after you cross the finish line.
- **Scenery:** a giant stone whale behind the pool (playing the role of the original's background creature), islets with palm trees, and the crater's orange rock cliffs with green ledges, waterfalls and lava (scrolling textures). The finish is a checkered strip on the water plus a pole with a flag on the center wall.
- **Racers:** four original animals (Morsa, Garça, Sapo, Cabra) assembled from icosahedra, cones and boxes. Each one's color matches its jet-ski.

## Palette

| Token | Hex | Use |
|---|---|---|
| teal | `#19c3b4` | water, secondary button |
| teal-deep | `#0b7f86` | deep water, button bevel |
| magma | `#ff6a1a` | lava, primary button, signs |
| magma-hot | `#ffc23a` | primary button highlight, low-time warning |
| jungle | `#3fa34d` | grass and vegetation |
| violet | `#9a7fd1` | sky |
| peach | `#f3b6a0` | horizon, form labels |
| plum | `#3b2440` | panels |
| plum-deep | `#24142a` | outlines, input background, chrome text stroke |
| cream | `#fff4dc` | text |

## Typography

- **Titan One** (self-hosted via @fontsource): titles, HUD numbers and buttons.
- **Nunito 600/800:** menu text and labels.
- **Chrome lettering:** cream-to-copper gradient, a plum-deep stroke and a hard bevel shadow. This is the HUD signature and it comes straight from the key visual. The detector flags it as "gradient text"; it stays on purpose, because the chosen world requires it.

## HUD

- Top left: **VOLTA n/5**, large.
- Bottom right: position (**1º**…**4º**), huge.
- Top right: a standings board with every racer's lap. On a phone it shows only position, color and lap.
- A yellow marker bobs above your jet-ski, and every racer has a name tag (yours reads "Você").
- Top right: time remaining, turning yellow in the last 20 s.
- Center: countdown, **VAI!**, **VOLTA FINAL!**, **CONTRAMÃO!** (blinking) and **CHEGOU!**.
- On touch screens, the position moves up so the buttons fit at the bottom. With the phone upright, **Ré** sits above **Acelerar**.
- **Phone upright** in the lobby or during a race: a full-screen **Deite o celular** notice appears, with an animated rotating phone. It disappears on its own once the phone is turned, and **Jogar em pé mesmo** dismisses it for the session. It does not appear on the home screen, where typing a name is easier with the phone upright.

## Components

- **Panel:** solid plum, rounded 18 px, with an inset bevel (light top, dark bottom) and a soft shadow. No glass or blur.
- **Buttons:** a vertical gradient plus a thick bottom bevel, giving a "plastic controller key" feel. Pressing one moves it down 3 px.
- **Touch controls:** two round steering buttons on the left; on the right, a large orange **Acelerar** button and a smaller **Ré** button. The icons are SVG.
- **Focus:** a 3 px cream outline. Text selection uses magma.

## Motion

- Banners pop with a short spring (an arcade effect). Everything else uses a smooth ease-out.
- `prefers-reduced-motion` turns off the transitions and the blinking.

## Provenance

The key visuals in `docs/keyvisuals/` were generated with Krea (Nano Banana Pro) and serve as reference only. No image from them ships in the game. Everything in the game is drawn in code.
