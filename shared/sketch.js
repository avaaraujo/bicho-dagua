// Grand Prix: o desenho do jogador vira pista.
// A folha é a cratera vista de cima (x para a direita, z para baixo na tela).
// O traço chega como pontos [u, v] de 0 a 1 na folha; o primeiro ponto é a
// largada e o sentido do traço é o sentido da corrida.
//
// A limpeza deixa a pista corrível: suaviza o tremido da mão, apaga voltinhas
// pequenas demais, arredonda curvas fechadas demais, afasta trechos colados e
// abre o ângulo dos cruzamentos (que viram ponte + túnel).
import { TRACK_HALF_WIDTH, buildTrack } from './track.js';

export const PAPER_ASPECT = 1.5; // largura / altura da folha
export const CLOSE_RADIUS = 0.08; // fração da altura da folha
export const MAX_CROSSINGS = 3;
// Até onde a linha central pode ir (a mureta de fora ainda cabe na cratera).
export const AREA = { halfX: 72, halfZ: 48 };
export const MIN_RADIUS = 15; // mesmo raio das curvas da pista do Quick Play
// Distância mínima entre as linhas centrais de trechos que não se cruzam:
// as duas muretas de fora não podem se encostar.
export const LANE_GAP = 2 * (TRACK_HALF_WIDTH + 2.6) + 1;
export const MIN_CROSS_ANGLE = (55 * Math.PI) / 180;
// Cruzamento mais raso que isso não vira ponte: os dois trechos quase se
// sobrepõem (traço indo e voltando), então a pista é "desenroscada" ali.
const GRAZE_ANGLE = (15 * Math.PI) / 180;
// Volta mais longa que isso é encolhida. Cada ponte ganha um pouco mais de
// pista, senão as voltas de um "8" ficam pequenas demais para as rampas.
const TARGET_LENGTH = 300;
const TARGET_PER_CROSSING = 60;
const MIN_LENGTH = 140;
const MAX_LENGTH = 520; // ~2 min de corrida para os bots, dentro dos 3 min
const STEP = 2.5; // espaçamento dos pontos durante a limpeza
const NEAR_ALONG = Math.PI * MIN_RADIUS + 5; // mais perto que isso na pista = mesmo trecho
const GRID_BEHIND = 22; // o grid fica até ~17 m atrás da largada
const GRID_AHEAD = 8;
const MAX_ITER = 500;

const PAPER_H = AREA.halfZ * 2;

// A folha nas mesmas unidades da cratera (metros), antes de ajustar a escala.
function paperToWorld(points) {
  const out = [];
  for (const p of points ?? []) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const u = Math.min(1, Math.max(0, p[0]));
    const v = Math.min(1, Math.max(0, p[1]));
    const q = [(u - 0.5) * 2 * AREA.halfX, (v - 0.5) * 2 * AREA.halfZ];
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 0.01) out.push(q);
  }
  return out;
}

// O traço fechou? Fecha quando ele se afastou do começo e o lápis foi
// levantado perto do começo. Passar pelo começo no meio do traço (um "8" que
// começou no cruzamento) não fecha. Devolve também até onde vai o traço sem
// a pontinha final que já está dentro do círculo da largada.
export function findClosure(points) {
  const { closed, left } = closureOf(paperToWorld(points));
  return { closed, left };
}

function closureOf(pts) {
  const r = CLOSE_RADIUS * PAPER_H;
  if (pts.length < 3) return { closed: false, left: false, end: pts.length };
  const [x0, z0] = pts[0];
  const dist = (p) => Math.hypot(p[0] - x0, p[1] - z0);
  const left = pts.some((p) => dist(p) > r * 3);
  let end = pts.length;
  while (end > 1 && dist(pts[end - 1]) < r) end--;
  return { closed: left && end < pts.length, left, end };
}

// Desenho → pista. Sem "forceClose", um traço que não fechou é recusado
// (o jogador ganha mais tempo); com ele, fecha com uma linha reta.
// Resultado: { ok: true, raw, crossings, length, autoClosed, startShift, transform }
// ou { ok: false, reason } com reason = 'empty' | 'not-closed' |
// 'too-many-crossings' | 'invalid'.
export function sketchToTrack(points, { forceClose = false } = {}) {
  let pts = paperToWorld(points);
  const { closed, left, end } = closureOf(pts);
  if (!left) return { ok: false, reason: 'empty' };
  let autoClosed = false;
  if (closed) pts = pts.slice(0, end);
  else if (forceClose) autoClosed = true;
  else return { ok: false, reason: 'not-closed' };

  // Tira o tremido da mão.
  pts = smoothClosed(resampleClosed(pts, 1), 3);

  // Centraliza e ocupa a cratera, sem passar do comprimento alvo.
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const [x, z] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const fill = Math.min(
    (AREA.halfX * 2 * 0.9) / Math.max(maxX - minX, 1e-6),
    (AREA.halfZ * 2 * 0.9) / Math.max(maxZ - minZ, 1e-6),
  );
  const bridges = findCrossings(resampleClosed(pts, 2)).filter((c) => c.angle >= GRAZE_ANGLE).length;
  const target = TARGET_LENGTH + TARGET_PER_CROSSING * Math.min(bridges, MAX_CROSSINGS);
  const scale = Math.min(fill, target / loopLength(pts));
  const transform = { scale, cx, cz };
  pts = pts.map(([x, z]) => [(x - cx) * scale, (z - cz) * scale]);

  pts = relax(resampleClosed(pts, STEP));

  // Pontos finais a cada ~0,5 m, como a pista do Quick Play.
  let raw = catmullRom(pts, 5);
  let crossings = findCrossings(raw);
  if (crossings.length > MAX_CROSSINGS) return { ok: false, reason: 'too-many-crossings' };

  // A largada (e o grid atrás dela) não pode ficar em cima de uma ponte.
  const L = loopLength(raw);
  const h = L / raw.length;
  // Vai para o lugar livre mais perto, para a frente ou para trás.
  let startShift = 0;
  search: for (let d = 0; d < L / 2; d += h) {
    for (const s of [d, -d]) {
      if (!crossings.some((c) => zoneHits(c, s - GRID_BEHIND, s + GRID_AHEAD, L))) {
        startShift = s;
        break search;
      }
    }
  }
  const k = ((Math.round(startShift / h) % raw.length) + raw.length) % raw.length;
  // Sem arredondar: o JSON leva os números exatos, então servidor e navegador
  // montam a mesma pista (arredondar faz a direção "tremer" e os bots acham
  // que tem curva onde não tem).
  raw = raw.slice(k).concat(raw.slice(0, k));
  crossings = findCrossings(raw);

  const problems = checkTrack(raw, crossings);
  if (problems.length) return { ok: false, reason: 'invalid', problems };
  return { ok: true, raw, crossings, length: L, autoClosed, startShift, transform };
}

// Algum trecho [a, b] da pista passa pela zona da ponte/túnel?
function zoneHits(c, a, b, L) {
  return [c.over, c.under].some((s) => {
    for (const off of [-L, 0, L]) {
      if (b > s + off - c.half && a < s + off + c.half) return true;
    }
    return false;
  });
}

// Confere uma pista pronta. Devolve a lista de problemas (vazia = ok).
export function checkTrack(raw, crossings) {
  const problems = [];
  const n = raw.length;
  const L = loopLength(raw);
  const h = L / n;
  if (L < MIN_LENGTH || L > MAX_LENGTH) return [`comprimento ${L.toFixed(0)} m`];
  if (crossings.length > MAX_CROSSINGS) problems.push(`${crossings.length} cruzamentos`);
  // Em cada cruzamento uma passagem vai por cima; um túnel não pode cair na
  // rampa de outra ponte (cruzamentos muito perto uns dos outros na volta).
  if (crossings.length && crossings.length <= MAX_CROSSINGS && !buildTrack(raw, TRACK_HALF_WIDTH, crossings).bridgesOk) {
    problems.push('pontes perto demais umas das outras');
  }
  for (const c of crossings) {
    if (c.angle < MIN_CROSS_ANGLE - 0.05) problems.push(`cruzamento a ${deg(c.angle)}°`);
    if (zoneHits(c, -GRID_BEHIND, GRID_AHEAD, L)) problems.push('largada em cima de um cruzamento');
  }
  for (const [x, z] of raw) {
    if (Math.abs(x) > AREA.halfX + 0.5 || Math.abs(z) > AREA.halfZ + 0.5) {
      problems.push(`fora da cratera em (${x.toFixed(0)}, ${z.toFixed(0)})`);
      break;
    }
  }
  // Raio medido com pontos a ~5 m (curva fechada demais) e a ~2 m (quina
  // curta, que a medida de 5 m não vê; ali só pega quina de verdade).
  for (const [span, min] of [[5, MIN_RADIUS * 0.9], [2, MIN_RADIUS * 0.6]]) {
    const k = Math.max(1, Math.round(span / h));
    let minR = Infinity;
    for (let i = 0; i < n; i++) {
      minR = Math.min(minR, circumradius(raw[(i - k + n) % n], raw[i], raw[(i + k) % n]));
    }
    if (minR < min) problems.push(`curva de raio ${minR.toFixed(1)} m`);
  }

  const every = Math.max(1, Math.round(2 / h));
  const near = Math.ceil(NEAR_ALONG / h);
  const zones = zoneMembership(n, h, L, crossings);
  let minGap = Infinity;
  for (let i = 0; i < n; i += every) {
    for (let j = i + every; j < n; j += every) {
      if (Math.min(j - i, n - (j - i)) <= near) continue;
      if (sharesCrossing(zones[i], zones[j])) continue;
      minGap = Math.min(minGap, Math.hypot(raw[i][0] - raw[j][0], raw[i][1] - raw[j][1]));
    }
  }
  if (minGap < LANE_GAP - 1) problems.push(`trechos a ${minGap.toFixed(1)} m um do outro`);
  return problems;
}

// ---------------------------------------------------------------------------
// Limpeza

function relax(start) {
  let pts = start;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    pts = resampleClosed(pts, STEP);
    const fixed = untangleGraze(pts) ?? cutCurl(pts);
    if (fixed) {
      pts = fixed;
      continue;
    }
    const n = pts.length;
    const L = loopLength(pts);
    const h = L / n;
    const crossings = findCrossings(pts);
    // Pontes demais e a limpeza já tirou os laços pequenos: não tem conserto.
    if (iter >= 30 && crossings.length > MAX_CROSSINGS) break;
    const zones = zoneMembership(n, h, L, crossings);
    const move = pts.map(() => [0, 0]);
    let bad = 0;

    // Curvas fechadas demais: puxa o ponto para o meio dos vizinhos. Olha os
    // vizinhos imediatos (zigue-zague curto) e os de dois em dois (curva).
    for (const k of [1, 2]) {
      for (let i = 0; i < n; i++) {
        const a = pts[(i - k + n) % n];
        const c = pts[(i + k) % n];
        const R = circumradius(a, pts[i], c);
        if (R >= MIN_RADIUS * 1.08) continue;
        if (R < MIN_RADIUS) bad++;
        const w = Math.min(1, (MIN_RADIUS * 1.08) / R - 1) * 0.35;
        move[i][0] += ((a[0] + c[0]) / 2 - pts[i][0]) * w;
        move[i][1] += ((a[1] + c[1]) / 2 - pts[i][1]) * w;
      }
    }

    // Trechos colados (que não são um cruzamento): empurra um para longe do
    // outro, sempre de lado (mesmo quando um está bem em cima do outro).
    const near = Math.ceil(NEAR_ALONG / h);
    const want = LANE_GAP + 0.8;
    const normals = pts.map((_, i) => normalAt(pts, i));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const along = Math.min(j - i, n - (j - i));
        const dx = pts[i][0] - pts[j][0];
        const dz = pts[i][1] - pts[j][1];
        const d = Math.hypot(dx, dz);
        if (along <= near) {
          // No mesmo trecho: dois pontos a "g" metros na pista ficam pelo
          // menos tão longe quanto numa curva de raio mínimo. É o que abre a
          // ponta de um grampo fechado demais em vez de só encolhê-lo.
          if (along < 3) continue;
          const g = Math.min(along * h, Math.PI * MIN_RADIUS);
          const chord = 2 * MIN_RADIUS * Math.sin(g / (2 * MIN_RADIUS));
          if (d >= chord * 0.97) continue;
          if (d < chord * 0.9) bad++;
          const [ux, uz] = d > 1e-6 ? [dx / d, dz / d] : normals[i];
          const push = (chord * 0.97 - d) * 0.25;
          move[i][0] += ux * push;
          move[i][1] += uz * push;
          move[j][0] -= ux * push;
          move[j][1] -= uz * push;
          continue;
        }
        if (d >= want || sharesCrossing(zones[i], zones[j])) continue;
        if (d < LANE_GAP) bad++;
        const push = (want - d) * 0.25;
        const ni = normals[i];
        const nj = normals[j];
        const si = Math.sign(dx * ni[0] + dz * ni[1]) || 1;
        const sj = Math.sign(-dx * nj[0] - dz * nj[1]) || -Math.sign(nj[0] * ni[0] + nj[1] * ni[1]) * si || 1;
        move[i][0] += ni[0] * si * push;
        move[i][1] += ni[1] * si * push;
        move[j][0] += nj[0] * sj * push;
        move[j][1] += nj[1] * sj * push;
      }
    }

    // Cruzamento raso demais: gira os dois trechos em volta do ponto de cruzamento.
    for (const c of crossings) {
      if (c.angle >= MIN_CROSS_ANGLE + 0.05) continue;
      if (c.angle < MIN_CROSS_ANGLE) bad++;
      const e2 = c.dot > 0 ? c.db : [-c.db[0], -c.db[1]];
      const side = Math.sign(c.da[0] * e2[1] - c.da[1] * e2[0]) || 1;
      const W = c.half * 1.3;
      const delta = (1.5 * Math.PI) / 180;
      for (const [s0, sign] of [[c.over, -side], [c.under, side]]) {
        for (let i = 0; i < n; i++) {
          const d = circDist(i * h, s0, L);
          if (d >= W) continue;
          const ang = sign * delta * 0.5 * (1 + Math.cos((Math.PI * d) / W));
          const rx = pts[i][0] - c.x;
          const rz = pts[i][1] - c.z;
          const cos = Math.cos(ang);
          const sin = Math.sin(ang);
          move[i][0] += c.x + rx * cos - rz * sin - pts[i][0];
          move[i][1] += c.z + rx * sin + rz * cos - pts[i][1];
        }
      }
    }

    if (bad === 0 && iter >= 10) break;
    pts = pts.map(([x, z], i) => {
      let [mx, mz] = move[i];
      const m = Math.hypot(mx, mz);
      if (m > 1.5) {
        mx *= 1.5 / m;
        mz *= 1.5 / m;
      }
      return [
        Math.max(-AREA.halfX, Math.min(AREA.halfX, x + mx)),
        Math.max(-AREA.halfZ, Math.min(AREA.halfZ, z + mz)),
      ];
    });
  }
  return pts;
}

// Cruzamento quase paralelo: inverte o trecho entre as duas passagens, o que
// desfaz o cruzamento e mantém uma volta só.
function untangleGraze(pts) {
  const c = findCrossings(pts).find((x) => x.angle < GRAZE_ANGLE);
  if (!c) return null;
  const { i, j } = c;
  return [...pts.slice(0, i + 1), ...pts.slice(i + 1, j + 1).reverse(), ...pts.slice(j + 1)];
}

// Uma voltinha curta demais para virar ponte (rabisco, laço de mão): corta
// fora e liga as duas pontas no ponto de cruzamento.
function cutCurl(pts) {
  const L = loopLength(pts);
  for (const c of findCrossings(pts)) {
    const inner = c.under - c.over; // trecho entre as duas passagens
    const outer = L - inner;
    const minLoop = 2 * Math.PI * MIN_RADIUS; // menor que uma volta no raio mínimo
    if (Math.min(inner, outer) >= minLoop) continue;
    const { i, j } = c;
    const X = [c.x, c.z];
    if (inner <= outer) return [...pts.slice(0, i + 1), X, ...pts.slice(j + 1)];
    return [X, ...pts.slice(i + 1, j + 1)];
  }
  return null;
}

// Cruzamentos da linha com ela mesma. "over" é a passagem que vem primeiro
// na volta (vai por cima, na ponte) e "under" a segunda (no túnel).
// "half" = metade do trecho, em cada passagem, em que as duas podem ficar
// mais perto que LANE_GAP.
export function findCrossings(pts) {
  const n = pts.length;
  // Distância na pista até cada ponto, igual à de buildTrack.
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const at = (i, t) => cum[i] + (cum[i + 1] - cum[i]) * t;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const p2 = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const q = pts[j];
      const q2 = pts[(j + 1) % n];
      const hit = segHit(p, p2, q, q2);
      if (!hit) continue;
      const da = unit(p, p2);
      const db = unit(q, q2);
      const dot = da[0] * db[0] + da[1] * db[1];
      const angle = Math.acos(Math.min(1, Math.abs(dot)));
      out.push({
        x: p[0] + (p2[0] - p[0]) * hit.t,
        z: p[1] + (p2[1] - p[1]) * hit.t,
        over: at(i, hit.t),
        under: at(j, hit.u),
        angle,
        half: LANE_GAP / Math.sin(Math.max(angle, 0.35)) + 4,
        i, j, da, db, dot, // trechos que se cruzam e suas direções
      });
    }
  }
  return out;
}

// Para cada ponto, em quais passagens de cruzamento ele está: [id, 0|1].
function zoneMembership(n, h, L, crossings) {
  const zones = [];
  for (let i = 0; i < n; i++) {
    const s = i * h;
    const z = [];
    crossings.forEach((c, id) => {
      if (circDist(s, c.over, L) < c.half) z.push(id * 2);
      if (circDist(s, c.under, L) < c.half) z.push(id * 2 + 1);
    });
    zones.push(z);
  }
  return zones;
}

// Os dois pontos estão em passagens diferentes do mesmo cruzamento?
function sharesCrossing(a, b) {
  for (const x of a) {
    for (const y of b) {
      if (x >> 1 === y >> 1 && x !== y) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Geometria de linha fechada

export function loopLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

// Pontos igualmente espaçados, começando no mesmo primeiro ponto.
export function resampleClosed(pts, step) {
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[n];
  const m = Math.max(8, Math.round(L / step));
  const out = [];
  let seg = 0;
  for (let k = 0; k < m; k++) {
    const d = (k * L) / m;
    while (seg < n - 1 && cum[seg + 1] <= d) seg++;
    const a = pts[seg];
    const b = pts[(seg + 1) % n];
    const len = cum[seg + 1] - cum[seg];
    const t = len > 0 ? (d - cum[seg]) / len : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function smoothClosed(pts, sigma) {
  const n = pts.length;
  const K = Math.ceil(sigma * 3);
  const w = [];
  let sum = 0;
  for (let k = -K; k <= K; k++) {
    w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
    sum += w[w.length - 1];
  }
  return pts.map((_, i) => {
    let x = 0;
    let z = 0;
    for (let k = -K; k <= K; k++) {
      const p = pts[(((i + k) % n) + n) % n];
      x += p[0] * w[k + K];
      z += p[1] * w[k + K];
    }
    return [x / sum, z / sum];
  });
}

// Curva suave passando pelos pontos, com "sub" pontos por trecho.
function catmullRom(P, sub) {
  const n = P.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (
        2 * p1[c]
        + (-p0[c] + p2[c]) * t
        + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
        + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3
      )));
    }
  }
  return out;
}

function segHit(p, p2, q, q2) {
  const rx = p2[0] - p[0];
  const rz = p2[1] - p[1];
  const sx = q2[0] - q[0];
  const sz = q2[1] - q[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = q[0] - p[0];
  const qz = q[1] - p[1];
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
  return { t, u };
}

function circumradius(a, b, c) {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return cross < 1e-9 ? Infinity : (ab * bc * ca) / (2 * cross);
}

function normalAt(pts, i) {
  const n = pts.length;
  const [tx, tz] = unit(pts[(i - 1 + n) % n], pts[(i + 1) % n]);
  return [tz, -tx];
}

function unit(a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const d = Math.hypot(dx, dz) || 1;
  return [dx / d, dz / d];
}

function circDist(a, b, L) {
  const d = Math.abs(a - b) % L;
  return Math.min(d, L - d);
}

function deg(r) {
  return Math.round((r * 180) / Math.PI);
}
