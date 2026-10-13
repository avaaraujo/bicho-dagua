// Cada corrida com a sua pista: o servidor manda a pista desenhada na
// largada e o navegador monta a mesma; nas pontes a água sobe e desce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { sketchToTrack } from '../shared/sketch.js';
import { buildTrack, pointAt, projectOnTrack, waterHeightAt, BRIDGE_HEIGHT, RAMP } from '../shared/track.js';
import * as sketches from './sketches.js';

// Socket.IO de mentira: guarda o que a sala mandou.
function fakeIo() {
  const sent = [];
  const channel = { emit: (event, payload) => sent.push({ event, payload }) };
  channel.volatile = channel;
  return { sent, to: () => channel };
}

function startRace(room, io) {
  room.start('ana');
  const start = io.sent.filter((m) => m.event === 'race:start').at(-1).payload;
  room.stop();
  return start;
}

test('a largada leva a pista desenhada, e a corrida seguinte volta para a do Quick Play', () => {
  const io = fakeIo();
  const room = new Room('ABCD', io);
  room.join({ id: 'ana', join() {} }, 'Ana');

  const quick = startRace(room, io);
  assert.equal(quick.track, null);
  const quickLength = room.track.length;

  const sketch = sketchToTrack(sketches.figureEight(sketches.seeded(5)));
  assert.ok(sketch.ok);
  room.state = 'lobby';
  room.setNextTrack(sketch);
  const drawn = startRace(room, io);
  assert.ok(drawn.track);
  // O navegador recebe por JSON e monta a pista igualzinha à do servidor.
  const wire = JSON.parse(JSON.stringify(drawn.track));
  const client = buildTrack(wire.raw, undefined, wire.crossings);
  assert.equal(client.length, room.track.length);
  assert.equal(client.samples.length, room.track.samples.length);
  assert.deepEqual(client.crossings, room.track.crossings);
  assert.ok(JSON.stringify(drawn.track).length < 60000);
  // O grid de largada da corrida foi montado na pista desenhada.
  for (const r of drawn.racers) {
    const p = projectOnTrack(client, r.x, r.z);
    assert.ok(Math.abs(p.lateral) < client.halfWidth);
  }

  room.state = 'lobby';
  const again = startRace(room, io);
  assert.equal(again.track, null);
  assert.equal(room.track.length, quickLength);
});

test('a água sobe na ponte, desce suave e fica no chão no túnel', () => {
  for (const [kind, seed] of [['figureEight', 6], ['trefoil', 7], ['chain', 7]]) {
    const r = sketchToTrack(sketches[kind](sketches.seeded(seed)));
    assert.ok(r.ok);
    const track = buildTrack(r.raw, undefined, r.crossings);
    assert.equal(waterHeightAt(track, 0), 0); // largada nunca fica numa ponte
    let prev = waterHeightAt(track, 0);
    for (let s = 0.5; s <= track.length; s += 0.5) {
      const y = waterHeightAt(track, s);
      assert.ok(Math.abs(y - prev) < 0.25, `${kind}: degrau de ${(y - prev).toFixed(2)} m em ${s}`);
      prev = y;
    }
    for (const c of track.crossings) {
      assert.equal(waterHeightAt(track, c.over), BRIDGE_HEIGHT);
      // O canal do túnel fica no chão em todo o trecho embaixo da ponte (não
      // cai na rampa de outra ponte).
      for (let d = -c.coreUnder; d <= c.coreUnder; d += 0.5) {
        assert.equal(waterHeightAt(track, c.under + d), 0, `${kind}: túnel numa rampa`);
      }
    }
  }
});

test('fora do trecho alto, o aterro da ponte não encosta no canal de baixo', () => {
  for (const [kind, seed] of [['figureEight', 8], ['figureEight', 9], ['trefoil', 10], ['chain', 10]]) {
    const r = sketchToTrack(sketches[kind](sketches.seeded(seed)));
    assert.ok(r.ok);
    const track = buildTrack(r.raw, undefined, r.crossings);
    const foot = track.halfWidth + 2.6; // canal + mureta
    for (const c of track.crossings) {
      for (let d = c.core; d <= c.core + RAMP; d += 0.5) {
        for (const s of [c.over - d, c.over + d]) {
          for (let lateral = -foot; lateral <= foot; lateral += 1) {
            const p = pointAt(track, s, lateral);
            const under = projectOnTrack(track, p.x, p.z, c.under);
            const nearUnder = Math.abs(((under.s - c.under) % track.length + track.length * 1.5) % track.length - track.length / 2) < c.half + 10;
            if (!nearUnder) continue;
            assert.ok(Math.abs(under.lateral) > foot - 0.3, `${kind} ${seed}: aterro a ${Math.abs(under.lateral).toFixed(1)} m do canal de baixo`);
          }
        }
      }
    }
  }
});
