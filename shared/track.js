// Pista: uma linha central fechada com largura fixa, no plano x/z (y = altura).
// Uma piscina vista de cima: reta de largada embaixo, duas curvas fechadas de
// 180° nas pontas e uma chicane em "lombada" na reta de cima.

export const TRACK_HALF_WIDTH = 9.75;
const R = 15; // raio das curvas
const Q = Math.PI / 4;

// Trechos da linha central. Ângulo negativo = vira para -z (para cima na tela).
// Largada no meio da reta de baixo (perto da câmera), indo para +x.
const SEGMENTS = [
  { line: 33 },
  { arc: -Math.PI, r: R }, // curva da direita
  { line: 7.4 },
  { arc: Q, r: R }, { arc: -Q, r: R }, // chicane: sobe...
  { line: 8.79 }, // topo da lombada
  { arc: -Q, r: R }, { arc: Q, r: R }, // ...e desce
  { line: 7.4 },
  { arc: -Math.PI, r: R }, // curva da esquerda
  { line: 33 },
];

// Percorre os trechos em passos de "step" metros e devolve os pontos.
export function pathPoints(segments = SEGMENTS, step = 0.5) {
  const pts = [];
  let x = 0;
  let z = 22.5;
  let a = 0; // direção = (cos a, sin a)
  for (const seg of segments) {
    const len = seg.line ?? Math.abs(seg.arc) * seg.r;
    const n = Math.round(len / step);
    for (let i = 0; i < n; i++) {
      pts.push([x, z]);
      const ds = len / n;
      if (seg.arc !== undefined) a += Math.sign(seg.arc) * (ds / seg.r);
      x += Math.cos(a) * ds;
      z += Math.sin(a) * ds;
    }
  }
  return pts;
}

// crossings: cruzamentos de uma pista desenhada (ver shared/sketch.js), cada
// um com a distância na pista da passagem por cima (over, na ponte), da
// passagem por baixo (under, no túnel) e o meio-comprimento "half" de cada
// passagem em que as duas ficam uma sobre a outra.
export function buildTrack(raw = pathPoints(), halfWidth = TRACK_HALF_WIDTH, crossings = []) {
  // Área com sinal: decide para que lado fica o "fora" da pista.
  let area = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const outwardSign = area > 0 ? 1 : -1;

  const samples = [];
  let s = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const tx = dx / len;
    const tz = dz / len;
    samples.push({ x: a[0], z: a[1], tx, tz, nx: tz * outwardSign, nz: -tx * outwardSign, s, len });
    s += len;
  }

  // Curvatura suavizada: quanto a direção muda nos próximos ~16 m.
  const lookSamples = Math.max(1, Math.round(16 / (s / samples.length)));
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + lookSamples) % samples.length];
    const cross = a.tx * b.tz - a.tz * b.tx;
    const dot = a.tx * b.tx + a.tz * b.tz;
    const bend = (b.tx - a.tx) * a.nx + (b.tz - a.tz) * a.nz;
    // radianos de curva à frente; positivo = a curva puxa para o lado de fora (+n)
    a.turn = Math.abs(Math.atan2(cross, dot)) * (bend >= 0 ? 1 : -1);
  }
  // Quanto se vira no total nos próximos ~16 m, somando curvas para os dois
  // lados (numa chicane a direção líquida quase não muda, mas exige freio).
  const step = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % samples.length];
    step.push(Math.acos(Math.max(-1, Math.min(1, a.tx * b.tx + a.tz * b.tz))));
  }
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let k = 0; k < lookSamples; k++) sum += step[(i + k) % samples.length];
    samples[i].curv = sum;
  }

  const track = {
    samples, length: s, halfWidth, outwardSign,
    crossings: crossings.map(({ x, z, over, under, half, angle }) => ({ x, z, over, under, half, angle })),
  };
  planBridges(track);
  // Caixa que envolve a piscina inteira (com a mureta de fora), para a câmera.
  const wall = halfWidth + 2.6;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const a of samples) {
    minX = Math.min(minX, a.x - wall); maxX = Math.max(maxX, a.x + wall);
    minZ = Math.min(minZ, a.z - wall); maxZ = Math.max(maxZ, a.z + wall);
  }
  track.bounds = { minX, maxX, minZ, maxZ };
  return track;
}

// Ponto mais próximo da linha central. Devolve distância percorrida (s),
// deslocamento lateral (positivo = para fora) e a tangente local.
// "near" = distância na pista onde o barco estava há pouco. Com ela, procura
// só ali perto: num cruzamento, quem está na ponte continua na ponte, mesmo
// passando bem em cima do túnel. Sem ela (ou se o barco não está ali perto),
// procura na pista inteira.
const LOCAL_WINDOW = 40; // metros para trás e para frente de "near"

export function projectOnTrack(track, x, z, near = null) {
  const { samples } = track;
  if (near !== null && Number.isFinite(near)) {
    const n = samples.length;
    const span = Math.min(n, Math.ceil((2 * LOCAL_WINDOW * n) / track.length));
    const from = sampleIndex(track, near - LOCAL_WINDOW);
    const local = nearestSample(track, x, z, from, span);
    if (local.d < (track.halfWidth + 4) ** 2) return projection(track, x, z, local);
  }
  return projection(track, x, z, nearestSample(track, x, z, 0, samples.length));
}

function nearestSample(track, x, z, from, count) {
  const { samples } = track;
  const n = samples.length;
  let best = null;
  let bestD = Infinity;
  for (let k = 0; k < count; k++) {
    const i = (from + k) % n;
    const a = samples[i];
    const px = x - a.x;
    const pz = z - a.z;
    let t = (px * a.tx + pz * a.tz) / a.len;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = a.x + a.tx * a.len * t;
    const cz = a.z + a.tz * a.len * t;
    const d = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    if (d < bestD) {
      bestD = d;
      best = { index: i, t, cx, cz, d };
    }
  }
  return best;
}

function projection(track, x, z, best) {
  const a = track.samples[best.index];
  const lateral = (x - best.cx) * a.nx + (z - best.cz) * a.nz;
  return { index: best.index, s: a.s + a.len * best.t, lateral, tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz };
}

// Índice da amostra que contém a distância s (dá a volta na pista).
function sampleIndex(track, s) {
  const { samples, length } = track;
  const d = ((s % length) + length) % length;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Pontes: em cada cruzamento uma passagem vai por cima, no alto ao longo de
// "core" metros para cada lado (o bastante para passar por cima do canal de
// baixo e das muretas dele), e desce numa rampa de RAMP metros. Pontes
// vizinhas viram um viaduto só. track.spans = trechos no alto [a, b].
export const BRIDGE_HEIGHT = 4;
export const RAMP = 12;

// Até onde, a partir de "s", a passagem (com as muretas) ainda fica em cima do
// canal que passa por "other". Medido, porque os trechos desenhados são curvos.
function measureCore(track, s0, other, half) {
  const foot = track.halfWidth + 2.6; // canal + mureta
  const L = track.length;
  let core = 2;
  for (let d = 0; d <= half + 10; d += 0.5) {
    for (const s of [s0 - d, s0 + d]) {
      for (let lateral = -foot; lateral <= foot; lateral += 1) {
        const p = pointAt(track, s, lateral);
        const q = projectOnTrack(track, p.x, p.z, other);
        if (circDist(q.s, other, L) < half + 10 && Math.abs(q.lateral) < foot + 0.5) core = Math.max(core, d + 1);
      }
    }
  }
  return core;
}

// Escolhe qual passagem de cada cruzamento vai por cima. Um túnel não pode
// ficar numa rampa nem embaixo de outra ponte; com até 3 cruzamentos dá para
// testar todas as combinações. track.bridgesOk = false se nenhuma serve.
function planBridges(track) {
  const L = track.length;
  const xs = track.crossings;
  for (const c of xs) {
    c.coreOver = measureCore(track, c.over, c.under, c.half);
    c.coreUnder = measureCore(track, c.under, c.over, c.half);
  }
  let best = null;
  for (let mask = 0; mask < 1 << xs.length; mask++) {
    const plan = xs.map((c, i) => ((mask >> i) & 1
      ? { top: c.under, topCore: c.coreUnder, low: c.over, lowCore: c.coreOver }
      : { top: c.over, topCore: c.coreOver, low: c.under, lowCore: c.coreUnder }));
    const spans = mergeSpans(plan.map((p) => [p.top - p.topCore, p.top + p.topCore]), L);
    const ok = plan.every((p) => spans.every((sp) => spanGap(sp, [p.low - p.lowCore - 2, p.low + p.lowCore + 2], L) >= RAMP));
    const high = spans.reduce((sum, [a, b]) => sum + b - a, 0);
    if (ok && (!best || high < best.high)) best = { mask, spans, high };
  }
  track.bridgesOk = !xs.length || !!best;
  const { mask, spans } = best ?? { mask: 0, spans: mergeSpans(xs.map((c) => [c.over - c.coreOver, c.over + c.coreOver]), L) };
  xs.forEach((c, i) => {
    if ((mask >> i) & 1) [c.over, c.under, c.coreOver, c.coreUnder] = [c.under, c.over, c.coreUnder, c.coreOver];
    c.core = c.coreOver;
  });
  track.spans = spans;
}

// Junta trechos no alto que se sobrepõem ou ficam perto demais para descer e
// subir de novo. Trechos em [0, L) ou passando um pouco das pontas.
function mergeSpans(list, L) {
  const sorted = list.map(([a, b]) => {
    const k = Math.floor(a / L) * L;
    return [a - k, b - k];
  }).sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a - last[1] < 2 * RAMP + 2) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  // o último pode encostar no primeiro dando a volta
  if (out.length > 1 && out[0][0] + L - out[out.length - 1][1] < 2 * RAMP + 2) {
    const last = out.pop();
    out[0] = [last[0] - L, Math.max(out[0][1], last[1] - L)];
  }
  return out;
}

// Distância entre dois trechos da volta (negativa se eles se sobrepõem).
function spanGap([a, b], [c, d], L) {
  let best = Infinity;
  for (const off of [-L, 0, L]) best = Math.min(best, Math.max(c + off - b, a - (d + off)));
  return best;
}

function circDist(a, b, L) {
  const d = Math.abs((((a - b) % L) + L) % L);
  return Math.min(d, L - d);
}

// Altura da água num ponto da pista (0 fora das pontes). "s" pode ser a
// distância percorrida de um barco (total).
export function waterHeightAt(track, s) {
  const L = track.length;
  let y = 0;
  for (const span of track.spans) {
    const d = -spanGap(span, [s, s], L); // >= 0 dentro do trecho
    if (d >= 0) return BRIDGE_HEIGHT;
    if (-d >= RAMP) continue;
    const k = (RAMP + d) / RAMP;
    y = Math.max(y, BRIDGE_HEIGHT * k * k * (3 - 2 * k));
  }
  return y;
}

// Num cruzamento, um barco na ponte e outro no túnel estão em níveis
// diferentes: não batem um no outro. "ta" e "tb" = distância percorrida
// (total) de cada barco.
export function onDifferentLevels(track, ta, tb) {
  const L = track.length;
  const near = (t, s, half) => {
    const d = Math.abs((((t - s) % L) + L) % L);
    return Math.min(d, L - d) < half;
  };
  for (const c of track.crossings) {
    const aOver = near(ta, c.over, c.half);
    const aUnder = near(ta, c.under, c.half);
    const bOver = near(tb, c.over, c.half);
    const bUnder = near(tb, c.under, c.half);
    if ((aOver && bUnder) || (aUnder && bOver)) return true;
  }
  return false;
}

// Posição na pista a partir de s (distância) e deslocamento lateral.
export function pointAt(track, s, lateral = 0) {
  const { samples, length } = track;
  const d = ((s % length) + length) % length;
  const lo = sampleIndex(track, s);
  const a = samples[lo];
  const t = (d - a.s) / a.len;
  return {
    x: a.x + a.tx * a.len * t + a.nx * lateral,
    z: a.z + a.tz * a.len * t + a.nz * lateral,
    tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz, turn: a.turn, curv: a.curv, index: lo,
  };
}

// Diferença de s com volta: resultado em [-L/2, L/2].
export function wrapDelta(track, ds) {
  const L = track.length;
  if (ds > L / 2) return ds - L;
  if (ds < -L / 2) return ds + L;
  return ds;
}

// Posições de largada: 2 x 2, atrás da linha de chegada (s = 0).
export function gridSlots(track) {
  const slots = [];
  const rows = [[-8, -5.4], [-8, 5.4], [-15, -5.4], [-15, 5.4]];
  for (const [back, side] of rows) {
    const p = pointAt(track, back, side);
    slots.push({ x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), total: back });
  }
  return slots;
}
