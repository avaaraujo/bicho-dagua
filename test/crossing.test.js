// Pistas desenhadas com cruzamento: ponte por cima, túnel por baixo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sketchToTrack } from '../shared/sketch.js';
import { buildTrack, pointAt, projectOnTrack, onDifferentLevels } from '../shared/track.js';
import { createBoat, collideBoats, collideWalls, updateProgress } from '../shared/physics.js';
import * as sketches from './sketches.js';
import { simulateRace } from './race-sim.js';

function drawnTrack(kind, seed) {
  const r = sketchToTrack(sketches[kind](sketches.seeded(seed)));
  assert.ok(r.ok, `${kind} ${seed}: ${r.reason}`);
  return buildTrack(r.raw, undefined, r.crossings);
}

const eight = drawnTrack('figureEight', 900);
const trefoil = drawnTrack('trefoil', 906);
const chain = drawnTrack('chain', 900);

// Um barco parado num ponto da pista, já "situado" nela (s conhecido).
function boatAt(track, s, lateral = 0) {
  const p = pointAt(track, s, lateral);
  const b = createBoat({ x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), total: s });
  b.s = ((s % track.length) + track.length) % track.length;
  return b;
}

test('a pista guarda os cruzamentos do desenho', () => {
  assert.equal(eight.crossings.length, 1);
  assert.equal(trefoil.crossings.length, 3);
  assert.equal(chain.crossings.length, 2);
  for (const track of [eight, trefoil, chain]) for (const c of track.crossings) {
    // as duas passagens passam mesmo pelo ponto de cruzamento
    for (const s of [c.over, c.under]) {
      const p = pointAt(track, s);
      assert.ok(Math.hypot(p.x - c.x, p.z - c.z) < 0.5);
    }
  }
});

test('no cruzamento, quem está na ponte continua na ponte e quem está no túnel continua no túnel', () => {
  for (const track of [eight, trefoil, chain]) {
    for (const c of track.crossings) {
      for (const s0 of [c.over, c.under]) {
        for (let ds = -c.half; ds <= c.half; ds += 2) {
          for (const lateral of [-6, 0, 6]) {
            const p = pointAt(track, s0 + ds, lateral);
            const proj = projectOnTrack(track, p.x, p.z, s0 + ds - 1);
            const along = Math.abs(((proj.s - (s0 + ds)) % track.length + track.length * 1.5) % track.length - track.length / 2);
            assert.ok(along < 1, `passagem ${s0.toFixed(0)}: foi parar ${along.toFixed(1)} m longe`);
            assert.ok(Math.abs(proj.lateral - lateral) < 0.5);
          }
        }
      }
      // Sem saber onde o barco estava, bem em cima do cruzamento as duas
      // passagens empatam: é por isso que a física procura perto de "s".
      const both = [c.over, c.under].map((s) => projectOnTrack(track, c.x, c.z, s).s);
      assert.ok(Math.abs(both[0] - both[1]) > 10);
    }
  }
});

test('atravessando o cruzamento, as paredes da outra passagem não existem', () => {
  for (const track of [eight, trefoil, chain]) {
    for (const c of track.crossings) {
      for (const s0 of [c.over, c.under]) {
        for (let ds = -c.half; ds <= c.half; ds += 1) {
          const b = boatAt(track, s0 + ds, 5);
          const before = { x: b.x, z: b.z };
          const hit = collideWalls(b, track);
          assert.equal(hit, 0, `bateu numa parede em ${(s0 + ds).toFixed(0)}`);
          assert.deepEqual({ x: b.x, z: b.z }, before);
        }
      }
    }
  }
});

test('ponte e túnel: barcos um em cima do outro não batem', () => {
  for (const c of trefoil.crossings) {
    const top = boatAt(trefoil, c.over);
    const below = boatAt(trefoil, c.under);
    assert.ok(Math.hypot(top.x - below.x, top.z - below.z) < 0.5);
    assert.equal(onDifferentLevels(trefoil, top.total, below.total), true);
    top.vx = 20; // vindo a toda
    assert.equal(collideBoats(top, below, false, trefoil), false);
    assert.equal(top.vx, 20);
    // Na mesma passagem, batem normalmente.
    const behind = boatAt(trefoil, c.over - 1);
    assert.equal(onDifferentLevels(trefoil, top.total, behind.total), false);
    assert.equal(collideBoats(top, behind, false, trefoil), true);
  }
  // Longe dos cruzamentos ninguém está em "níveis diferentes".
  assert.equal(onDifferentLevels(eight, 0, eight.length / 2), false);
});

test('a volta conta certo passando pelo cruzamento', () => {
  for (const track of [eight, trefoil, chain]) {
    for (const c of track.crossings) {
      for (const s0 of [c.over, c.under]) {
        for (const lateral of [-6, 0, 6]) {
          const b = boatAt(track, s0 - c.half - 5, lateral);
          const start = b.total;
          // anda pela sua faixa, de metro em metro, até depois do cruzamento
          for (let d = 1; d <= 2 * c.half + 10; d++) {
            const p = pointAt(track, start + d, lateral);
            b.x = p.x;
            b.z = p.z;
            b._proj = null;
            collideWalls(b, track);
            updateProgress(b, track);
            // Fora do centro, a projeção oscila até ~1 m nas quinas da linha;
            // pular para a outra passagem erraria a conta em até 12 m.
            assert.ok(Math.abs(b.total - (start + d)) < 1.5, `perdeu a conta em ${(start + d).toFixed(0)}, faixa ${lateral}`);
          }
        }
      }
    }
  }
});

test('4 bots completam 5 voltas em pistas com ponte', () => {
  const cases = [['figureEight', 910], ['figureEight', 911], ['figureEight', 912], ['trefoil', 907], ['trefoil', 908], ['chain', 901], ['chain', 902]];
  for (const [kind, seed] of cases) {
    const track = drawnTrack(kind, seed);
    const { finish, crashes, laps, maxStep } = simulateRace(track);
    const label = `${kind} ${seed} (${track.length.toFixed(0)} m)`;
    assert.ok(finish.every((f) => f !== null), `${label}: nem todos terminaram (${laps.join(',')})`);
    assert.ok(Math.max(...finish) < 150, `${label}: lento demais (${Math.max(...finish).toFixed(0)} s)`);
    assert.ok(Math.max(...crashes) <= 9, `${label}: batidas ${crashes.join(',')}`);
    // Um barco que "pula" de trecho no cruzamento avançaria até 12 m de uma vez.
    assert.ok(maxStep < 5, `${label}: salto de ${maxStep.toFixed(1)} m`);
  }
});
