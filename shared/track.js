// Pista: uma linha central fechada (Catmull-Rom) com largura fixa.
// Tudo é medido no plano x/z; y é altura.

export const TRACK_HALF_WIDTH = 9;

// Pontos de controle do anel dentro da cratera. A reentrância entre
// (52, 30) e (-6, 52) cria um "S" que pune quem entra rápido demais.
const CONTROL_POINTS = [
  [0, -62], [38, -58], [68, -36], [78, 0], [70, 30], [44, 34],
  [22, 28], [6, 48], [-22, 70], [-58, 60], [-80, 24], [-72, -22], [-40, -54],
];

const SAMPLES_PER_SEGMENT = 32;

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

export function buildTrack(points = CONTROL_POINTS, halfWidth = TRACK_HALF_WIDTH) {
  const n = points.length;
  const raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let k = 0; k < SAMPLES_PER_SEGMENT; k++) raw.push(catmullRom(p0, p1, p2, p3, k / SAMPLES_PER_SEGMENT));
  }

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

  return { samples, length: s, halfWidth, outwardSign };
}

// Ponto mais próximo da linha central. Devolve distância percorrida (s),
// deslocamento lateral (positivo = para fora) e a tangente local.
export function projectOnTrack(track, x, z) {
  const { samples } = track;
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < samples.length; i++) {
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
      best = { index: i, t, cx, cz };
    }
  }
  const a = samples[best.index];
  const lateral = (x - best.cx) * a.nx + (z - best.cz) * a.nz;
  return { index: best.index, s: a.s + a.len * best.t, lateral, tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz };
}

// Posição na pista a partir de s (distância) e deslocamento lateral.
export function pointAt(track, s, lateral = 0) {
  const { samples, length } = track;
  let d = ((s % length) + length) % length;
  // busca binária pelo segmento
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = samples[lo];
  const t = (d - a.s) / a.len;
  return {
    x: a.x + a.tx * a.len * t + a.nx * lateral,
    z: a.z + a.tz * a.len * t + a.nz * lateral,
    tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz, turn: a.turn, index: lo,
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
  const rows = [[-8, -3.6], [-8, 3.6], [-15, -3.6], [-15, 3.6]];
  for (const [back, side] of rows) {
    const p = pointAt(track, back, side);
    slots.push({ x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), total: back });
  }
  return slots;
}
