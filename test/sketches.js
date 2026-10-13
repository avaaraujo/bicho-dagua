// Desenhos de mentira, parecidos com os de uma pessoa com o dedo ou o mouse.
// As formas são geradas em "alturas de folha" (x de 0 a 1,5, y de 0 a 1) e
// devolvidas como pontos [u, v] da folha, de 0 a 1.
import { PAPER_ASPECT, CLOSE_RADIUS } from '../shared/sketch.js';
import { mulberry32 } from '../shared/bot.js';

const TAU = Math.PI * 2;

function toPaper(pts) {
  return pts.map(([x, y]) => [x / PAPER_ASPECT, y]);
}

// Mão tremida: um passeio aleatório pequeno somado ao traço.
function shaky(pts, rand, amount = 0.006) {
  let jx = 0;
  let jy = 0;
  return pts.map(([x, y]) => {
    jx = jx * 0.85 + (rand() - 0.5) * amount;
    jy = jy * 0.85 + (rand() - 0.5) * amount;
    return [x + jx, y + jy];
  });
}

// Termina perto (mas não exatamente em cima) do primeiro ponto.
function closeNear(pts, rand) {
  const miss = CLOSE_RADIUS * 0.6 * rand();
  const a = rand() * TAU;
  pts.push([pts[0][0] + Math.cos(a) * miss, pts[0][1] + Math.sin(a) * miss]);
  return pts;
}

// Uma volta torta, sem cruzar.
export function blob(rand, n = 160) {
  const cx = 0.75 + (rand() - 0.5) * 0.3;
  const cy = 0.5 + (rand() - 0.5) * 0.15;
  const rx = 0.3 + rand() * 0.35;
  const ry = 0.22 + rand() * 0.18;
  const harm = [2, 3, 4].map((k) => ({ k, a: (rand() * 0.2) / (k - 1), ph: rand() * TAU }));
  const a0 = rand() * TAU;
  const dir = rand() < 0.5 ? 1 : -1;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + (dir * TAU * i) / n;
    const r = 1 + harm.reduce((s, h) => s + h.a * Math.sin(h.k * t + h.ph), 0);
    pts.push([cx + rx * r * Math.cos(t), cy + ry * r * Math.sin(t)]);
  }
  return toPaper(shaky(closeNear(pts, rand), rand));
}

// Um "8" (lemniscata de Gerono), girado e esticado.
export function figureEight(rand, n = 200) {
  const cx = 0.75 + (rand() - 0.5) * 0.2;
  const cy = 0.5 + (rand() - 0.5) * 0.1;
  const rx = 0.45 + rand() * 0.2;
  const ry = 0.25 + rand() * 0.2;
  const rot = (rand() - 0.5) * 0.6;
  const t0 = rand() * TAU;
  const dir = rand() < 0.5 ? 1 : -1;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + (dir * TAU * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(2 * t);
    pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return toPaper(shaky(closeNear(pts, rand), rand));
}

// Volta com um laço pequeno no meio (a mão "enrolou").
export function curl(rand) {
  const base = blob(rand).map(([u, v]) => [u * PAPER_ASPECT, v]);
  const at = 40 + Math.floor(rand() * 60);
  const [x, y] = base[at];
  const r = 0.02 + rand() * 0.03;
  const loop = [];
  for (let i = 0; i <= 24; i++) {
    const t = (TAU * i) / 24;
    loop.push([x + r * Math.sin(t), y - r + r * Math.cos(t)]);
  }
  return toPaper([...base.slice(0, at), ...loop, ...base.slice(at)]);
}

// Traço que não volta para o começo.
export function openArc(rand, n = 120) {
  const pts = [];
  const a0 = rand() * TAU;
  for (let i = 0; i < n; i++) {
    const t = a0 + (1.4 * Math.PI * i) / n;
    pts.push([0.75 + 0.5 * Math.cos(t), 0.5 + 0.35 * Math.sin(t)]);
  }
  return toPaper(shaky(pts, rand));
}

// Um risco reto.
export function line(rand, n = 60) {
  const a = [0.2 + rand() * 0.2, 0.2 + rand() * 0.6];
  const b = [1.1 + rand() * 0.2, 0.2 + rand() * 0.6];
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return toPaper(shaky(pts, rand));
}

// Volta cheia de laços grandes (muitos cruzamentos).
export function scribble(rand, n = 300) {
  const loops = 5 + Math.floor(rand() * 3);
  const R = 0.38;
  const r = 0.13 + rand() * 0.05;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (TAU * i) / n;
    pts.push([
      0.75 + R * 1.5 * Math.cos(t) + r * Math.cos(loops * t),
      0.5 + R * Math.sin(t) + r * Math.sin(loops * t),
    ]);
  }
  return toPaper(shaky(closeNear(pts, rand), rand));
}

// Volta com 4 ou 5 laços grandes: cruzamentos demais para uma pista.
export function loopy(rand, n = 360) {
  const loops = 4 + Math.floor(rand() * 2);
  const R = 0.3;
  const r = 0.2 + rand() * 0.05;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (TAU * i) / n;
    pts.push([
      0.75 + R * 1.6 * Math.cos(t) + r * Math.cos(loops * t),
      0.5 + R * Math.sin(t) + r * 0.9 * Math.sin(loops * t),
    ]);
  }
  return toPaper(shaky(closeNear(pts, rand), rand));
}

// Nó de trevo: três laços grandes e três cruzamentos.
export function trefoil(rand, n = 300) {
  const rot = rand() * TAU;
  const t0 = rand() * TAU;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + (TAU * i) / n;
    const x = Math.sin(t) + 2 * Math.sin(2 * t);
    const y = Math.cos(t) - 2 * Math.cos(2 * t);
    pts.push([
      0.75 + 0.16 * 1.5 * (x * Math.cos(rot) - y * Math.sin(rot)),
      0.5 + 0.16 * (x * Math.sin(rot) + y * Math.cos(rot)),
    ]);
  }
  return toPaper(shaky(closeNear(pts, rand), rand));
}

// Três laços em fila (uma corrente "∞∞"): dois cruzamentos, em x = ±a.
// Com x = cos t e y = sen t·(cos²t − a²), o traço passa duas vezes por cada
// ponto (±a, 0), uma subindo e outra descendo.
export function chain(rand, n = 320) {
  const rot = (rand() - 0.5) * 0.3;
  const t0 = rand() * TAU;
  const a = 0.38 + rand() * 0.06;
  const ry = 0.3 + rand() * 0.1;
  let peak = 0;
  for (let i = 0; i < 200; i++) {
    const t = (TAU * i) / 200;
    peak = Math.max(peak, Math.abs(Math.sin(t) * (Math.cos(t) ** 2 - a * a)));
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + (TAU * i) / n;
    const x = 0.7 * Math.cos(t);
    const y = (ry * Math.sin(t) * (Math.cos(t) ** 2 - a * a)) / peak;
    pts.push([0.75 + x * Math.cos(rot) - y * Math.sin(rot), 0.5 + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return toPaper(shaky(closeNear(pts, rand), rand));
}

// Estrela de 5 pontas num traço só: cinco cruzamentos.
export function star(rand, n = 250) {
  const rot = rand() * TAU;
  const corners = [];
  for (let k = 0; k < 5; k++) {
    const a = rot + (k * 2 * TAU) / 5;
    corners.push([0.75 + 0.62 * Math.cos(a), 0.5 + 0.45 * Math.sin(a)]);
  }
  const pts = [];
  for (let i = 0; i < n; i++) {
    const f = (5 * i) / n;
    const k = Math.floor(f);
    const t = f - k;
    const a = corners[k];
    const b = corners[(k + 1) % 5];
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return toPaper(shaky(closeNear(pts, rand), rand));
}

export function seeded(seed) {
  return mulberry32(seed);
}
