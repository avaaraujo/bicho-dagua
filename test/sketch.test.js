import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sketchToTrack, findClosure, AREA, MAX_CROSSINGS, MIN_CROSS_ANGLE, PAPER_ASPECT } from '../shared/sketch.js';
import { buildTrack, gridSlots, projectOnTrack } from '../shared/track.js';
import * as sketches from './sketches.js';
import { simulateRace } from './race-sim.js';

let slowest = 0;
function convert(points, options) {
  const t0 = performance.now();
  const r = sketchToTrack(points, options);
  slowest = Math.max(slowest, performance.now() - t0);
  return r;
}

// Toda pista que sai da conversão: cabe na cratera, monta, e o grid de
// largada fica dentro da água.
function assertTrack(r, label) {
  assert.ok(r.ok, `${label}: ${r.reason} ${r.problems ?? ''}`);
  assert.ok(r.length > 140 && r.length < 520, `${label}: volta de ${r.length.toFixed(0)} m`);
  assert.ok(r.crossings.length <= MAX_CROSSINGS, `${label}: ${r.crossings.length} cruzamentos`);
  for (const [x, z] of r.raw) {
    assert.ok(Math.abs(x) <= AREA.halfX + 0.5 && Math.abs(z) <= AREA.halfZ + 0.5, `${label}: fora da cratera`);
  }
  const track = buildTrack(r.raw);
  for (const slot of gridSlots(track)) {
    const p = projectOnTrack(track, slot.x, slot.z);
    assert.ok(Math.abs(p.lateral) < track.halfWidth - 1, `${label}: grid fora da pista`);
  }
  return track;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

test('voltas simples, com voltinha ou com laços pequenos viram pista sem ponte', () => {
  for (const kind of ['blob', 'curl', 'scribble', 'loopy']) {
    for (let i = 0; i < 25; i++) {
      const r = convert(sketches[kind](sketches.seeded(100 + i)));
      assertTrack(r, `${kind} ${i}`);
      assert.equal(r.crossings.length, 0, `${kind} ${i}`);
      assert.equal(r.autoClosed, false);
    }
  }
});

test('um "8" vira pista com uma ponte em ângulo aberto', () => {
  for (let i = 0; i < 25; i++) {
    const r = convert(sketches.figureEight(sketches.seeded(200 + i)));
    assertTrack(r, `8 ${i}`);
    assert.equal(r.crossings.length, 1, `8 ${i}`);
    assert.ok(r.crossings[0].angle >= MIN_CROSS_ANGLE - 0.05);
  }
});

test('corrente de três laços: duas pontes', () => {
  for (let i = 0; i < 12; i++) {
    const r = convert(sketches.chain(sketches.seeded(250 + i)));
    assertTrack(r, `corrente ${i}`);
    assert.equal(r.crossings.length, 2, `corrente ${i}`);
  }
});

test('nó de trevo: três pontes ou recusado; estrela de 5 pontas: cruzamentos demais', () => {
  // No miolo de um nó os três cruzamentos ficam colados; muitas vezes não
  // cabe a rampa de uma ponte antes do túnel da outra, e o desenho é recusado.
  let ok = 0;
  for (let i = 0; i < 12; i++) {
    const r = convert(sketches.trefoil(sketches.seeded(300 + i)));
    if (!r.ok) {
      assert.equal(r.reason, 'invalid', `trevo ${i}`);
      continue;
    }
    ok++;
    assertTrack(r, `trevo ${i}`);
    assert.equal(r.crossings.length, 3, `trevo ${i}`);
  }
  assert.ok(ok >= 3, `só ${ok} de 12 trevos viraram pista`);
  for (let i = 0; i < 12; i++) {
    const r = convert(sketches.star(sketches.seeded(400 + i)));
    assert.equal(r.reason, 'too-many-crossings', `estrela ${i}`);
  }
});

test('traço que não fecha: recusado, ou fechado com uma linha reta no fim do tempo', () => {
  for (let i = 0; i < 10; i++) {
    const pts = sketches.openArc(sketches.seeded(500 + i));
    assert.equal(findClosure(pts).closed, false);
    assert.equal(convert(pts).reason, 'not-closed');
    const r = convert(pts, { forceClose: true });
    assertTrack(r, `arco ${i}`);
    assert.equal(r.autoClosed, true);
    // Até um risco reto vira uma pista (um oval comprido).
    assertTrack(convert(sketches.line(sketches.seeded(600 + i)), { forceClose: true }), `risco ${i}`);
  }
});

test('desenho vazio ou que não saiu do lugar', () => {
  assert.equal(convert([]).reason, 'empty');
  assert.equal(convert([[0.5, 0.5]], { forceClose: true }).reason, 'empty');
  const dot = Array.from({ length: 30 }, (_, i) => [0.5 + Math.cos(i) * 0.01, 0.5 + Math.sin(i) * 0.01]);
  assert.equal(convert(dot, { forceClose: true }).reason, 'empty');
  assert.equal(findClosure(dot).left, false);
});

test('a largada é o começo do traço e o sentido é o do traço', () => {
  for (let i = 0; i < 20; i++) {
    const pts = sketches.blob(sketches.seeded(700 + i));
    assert.equal(findClosure(pts).closed, true);
    const r = convert(pts);
    assertTrack(r, `bolha ${i}`);
    assert.equal(r.startShift, 0);
    const { scale, cx, cz } = r.transform;
    const x0 = ((pts[0][0] - 0.5) * 2 * AREA.halfX - cx) * scale;
    const z0 = ((pts[0][1] - 0.5) * 2 * AREA.halfZ - cz) * scale;
    const d = Math.hypot(r.raw[0][0] - x0, r.raw[0][1] - z0);
    assert.ok(d < 6, `bolha ${i}: largada a ${d.toFixed(1)} m do começo do traço`);
    const drawn = pts.map(([u, v]) => [u * PAPER_ASPECT, v]);
    assert.equal(Math.sign(signedArea(r.raw)), Math.sign(signedArea(drawn)), `bolha ${i}: sentido trocado`);
  }
});

test('um "8" começado no cruzamento só fecha no fim, e a largada sai de cima da ponte', () => {
  const pts = [];
  for (let i = 0; i <= 200; i++) {
    const t = Math.PI / 2 + (2 * Math.PI * i) / 200; // t = π/2 é o cruzamento
    pts.push([(0.75 + 0.6 * Math.cos(t)) / PAPER_ASPECT, 0.5 + 0.35 * Math.sin(2 * t)]);
  }
  assert.equal(findClosure(pts.slice(0, 120)).closed, false); // passou pelo começo, mas não levantou o lápis ali
  assert.equal(findClosure(pts).closed, true);
  const r = convert(pts);
  assertTrack(r, '8 do cruzamento');
  assert.equal(r.crossings.length, 1);
  assert.notEqual(r.startShift, 0);
});

test('a conversão é rápida', () => {
  console.log(`conversão mais lenta: ${slowest.toFixed(0)} ms`);
  assert.ok(slowest < 1000);
});

test('4 bots completam 5 voltas nas pistas desenhadas (sem ponte)', () => {
  const cases = [
    ['blob', 0], ['blob', 1], ['blob', 2], ['curl', 3], ['openArc', 4], ['line', 5], ['scribble', 6], ['loopy', 7],
  ];
  for (const [kind, i] of cases) {
    const r = sketchToTrack(sketches[kind](sketches.seeded(800 + i)), { forceClose: true });
    const track = assertTrack(r, `${kind} ${i}`);
    const { finish, crashes, laps } = simulateRace(track);
    assert.ok(finish.every((f) => f !== null), `${kind} ${i}: nem todos terminaram (${laps.join(',')})`);
    assert.ok(Math.max(...finish) < 120, `${kind} ${i}: lento demais (${Math.max(...finish).toFixed(0)} s)`);
    assert.ok(Math.max(...crashes) <= 8, `${kind} ${i}: batidas ${crashes.join(',')}`);
  }
});
