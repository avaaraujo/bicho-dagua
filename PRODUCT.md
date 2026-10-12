# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Three.js for the 3D game, rendered in the browser. Node.js game server over WebSockets (Socket.IO), hosted on Render's free tier. Chosen by the user after a cost comparison.

## Users

Adult friends playing short online matches together, each on their own device: a game night over voice chat, or a quick break. Some play on a computer with a keyboard, others on a phone with touch controls.

## Product Purpose

A browser-based, online multiplayer water race for up to 4 players, inspired by the "first to finish 5 laps" race minigame format from party games. Success: friends open a link, join a room with a code, and are racing within a minute, with no install or account needed.

## Positioning

An original party racing minigame. It is not a clone: it carries no characters, names, art, music, or sounds from any existing franchise.

## Operating Context

- One player creates a room and shares a short code. The others join from their own devices. Bots fill the empty slots up to 4 racers.
- The race is on water, around a single track. The first to complete 5 laps wins. If nobody finishes within 3 minutes, the race ends in a draw.
- Cornering is the skill. Too fast pushes you into the outer wall and slows you down. Too slow or careless turns you around, and the game warns that you are going the wrong way.
- The free Render server sleeps after 15 idle minutes. The first visitor after that waits about a minute while it wakes up.

## Capabilities and Constraints

- Controls are just steer and accelerate, with a keyboard on desktop and on-screen touch controls on mobile.
- The game must run smoothly in mobile browsers, which limits geometry, shaders, and post-processing.
- Copyright: all characters, vehicles, art, audio, names, and logos must be original. Nothing should resemble an existing franchise closely enough to raise a copyright or trademark risk.
- Vehicles are free to vary (jet-ski, float, boat, creature, and so on). The race always takes place on water.
- Undecided: the game's name, the final visual world (being explored through key visuals), and the audio.

## Evidence on Hand

None yet: no assets, name, or logo exist. Do not fabricate player counts, reviews, or press.

## Product Principles

- From link to racing in under a minute: no accounts, no installs.
- Steering is the whole game, so the track must make every corner readable at speed.
- A race with friends should produce laughs and close finishes, not a runaway leader.
- Original in every asset, so there is never a reason to take it down.
