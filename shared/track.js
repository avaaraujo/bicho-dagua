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

export function buildTrack(raw = pathPoints(), halfWidth = TRACK_HALF_WIDTH) {
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

  const track = { samples, length: s, halfWidth, outwardSign };
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
