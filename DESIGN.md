# Design: Turbo Cratera

Visual direction: **late-90s console played on a CRT TV** (key visual 3, `docs/keyvisuals/03-lowpoly-anos-90.jpg`). It should look like a beloved cartridge, not a modern mobile racer and not a clone of any franchise.

## 3D world

- **Geometry:** chunky low-poly with flat faces (`flatShading`). Colors come from the vertices, never from realistic textures. Small textures (16–64 px) are drawn in a canvas and filtered with `NearestFilter`.
- **Resolution:** the scene renders at 480 lines and is scaled up with `image-rendering: pixelated`. CSS scanlines and vignette sit on top. This is the visual signature and it also keeps phones running smoothly.
- **Light:** a violet-and-teal hemisphere light plus a warm sun. No real shadows; each jet-ski gets a dark disc on the water instead.
- **Fog:** violet `#c4a2c6`, from 110 to 360 m.
- **Scenery:** a ring channel inside the crater, a central island with grass and a stone whale statue, orange rock cliffs with green ledges, waterfalls and lava (scrolling textures), a checkered finish arch, and chevron signs on the outside of sharp curves.
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
- Bottom left: a radar that rotates with the racer, so forward is always up.
- Top right: time remaining, turning yellow in the last 20 s.
- Center: countdown, **VAI!**, **VOLTA FINAL!**, **CONTRAMÃO!** (blinking) and **CHEGOU!**.
- On touch screens, the radar and the position move up so the buttons fit at the bottom.

## Components

- **Panel:** solid plum, rounded 18 px, with an inset bevel (light top, dark bottom) and a soft shadow. No glass or blur.
- **Buttons:** a vertical gradient plus a thick bottom bevel, giving a "plastic controller key" feel. Pressing one moves it down 3 px.
- **Touch controls:** two round steering buttons on the left and a large orange **Acelerar** button on the right. The icons are SVG.
- **Focus:** a 3 px cream outline. Text selection uses magma.

## Motion

- Banners pop with a short spring (an arcade effect). Everything else uses a smooth ease-out.
- `prefers-reduced-motion` turns off the transitions and the blinking.

## Provenance

The key visuals in `docs/keyvisuals/` were generated with Krea (Nano Banana Pro) and serve as reference only. No image from them ships in the game. Everything in the game is drawn in code.
