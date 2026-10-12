// Física arcade do jet-ski. Mesma função no servidor (bots) e no cliente
// (o seu jet-ski), para os dois se comportarem igual.
import { projectOnTrack, wrapDelta } from './track.js';
import { LAPS } from './constants.js';

export const BOAT_RADIUS = 1.5;
// Aceleração baixa e velocidade máxima alta: leva uns 5 s para chegar perto
// do máximo, então cada batida (que para o barco) custa caro.
export const ACCEL = 13.8;
export const DRAG = 0.46; // velocidade máxima ≈ ACCEL / DRAG ≈ 30 m/s
export const COAST_DRAG = 0.9;
export const GRIP = 2.4; // quanto da derrapagem lateral some por segundo
export const TURN_RATE = 2.35; // rad/s no melhor ponto
export const MAX_SPEED = ACCEL / DRAG;
export const BRAKE = 30; // m/s² freando
// Batida mais forte que isso (m/s contra a parede/obstáculo/barco) para o barco.
export const CRASH_SPEED = 1.5;
const BOUNCE = 1.2; // velocidade com que o barco quica para trás depois de parar
export const REVERSE_ACCEL = 9;
export const MAX_REVERSE = 6;

// h = direção. Frente = (sin h, cos h). Direita = (-cos h, sin h).
export function createBoat(slot) {
  return {
    x: slot.x, z: slot.z, h: slot.h,
    vx: 0, vz: 0,
    steer: 0,
    total: slot.total, // distância acumulada na corrida (pode diminuir)
    s: null,
    lean: 0,
    bump: 0, // intensidade da última batida (efeitos)
  };
}

export function forwardSpeed(b) {
  return b.vx * Math.sin(b.h) + b.vz * Math.cos(b.h);
}

// input: { steer: -1..1 (positivo = direita), throttle: 0..1 }
export function stepBoat(b, input, dt, track, speedMul = 1) {
  const fx = Math.sin(b.h);
  const fz = Math.cos(b.h);
  const rx = -fz;
  const rz = fx;
  let fwd = b.vx * fx + b.vz * fz;
  let lat = b.vx * rx + b.vz * rz;

  // Volante com um pouco de inércia, para não ser digital demais.
  b.steer += (input.steer - b.steer) * Math.min(1, dt * 10);

  // throttle: 1 = acelera, 0 = solta, negativo = freia e, quase parado, dá ré.
  const throttle = input.throttle;
  if (throttle >= 0) {
    fwd += ACCEL * speedMul * throttle * dt;
  } else if (fwd > 0.5) {
    fwd = Math.max(0, fwd + BRAKE * throttle * dt);
  } else {
    fwd += REVERSE_ACCEL * throttle * dt;
  }
  fwd -= fwd * (throttle > 0.05 ? DRAG : COAST_DRAG) * dt;
  if (fwd < -MAX_REVERSE) fwd = -MAX_REVERSE;

  // Vira melhor em velocidade média; parado ainda gira devagar; muito rápido perde força.
  // De ré o barco gira para o outro lado, como um carro.
  const sp = Math.abs(fwd) / MAX_SPEED;
  const turnFactor = 0.38 + 0.9 * Math.min(1, sp * 2.2) - 0.32 * sp * sp;
  const dir = fwd < -0.5 ? -1 : 1;
  b.h -= b.steer * TURN_RATE * turnFactor * dir * dt;

  lat *= Math.exp(-GRIP * dt);

  const nfx = Math.sin(b.h);
  const nfz = Math.cos(b.h);
  b.vx = nfx * fwd + -nfz * lat;
  b.vz = nfz * fwd + nfx * lat;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.lean += (-b.steer * Math.min(1, sp * 1.6) * 0.45 - b.lean) * Math.min(1, dt * 6);
  b.bump = Math.max(0, b.bump - dt * 3);

  collideWalls(b, track);
  updateProgress(b, track);
}

// Para o barco quase por completo e o devolve um pouco na direção (nx, nz).
function crash(b, nx, nz) {
  b.vx = nx * BOUNCE;
  b.vz = nz * BOUNCE;
  b.bump = 1;
}

// Paredes (mureta de fora e mureta do meio) e pilares de pedra.
// Bater de frente para o barco; raspar de leve só tira um pouco de velocidade.
export function collideWalls(b, track) {
  const p = projectOnTrack(track, b.x, b.z);
  b._proj = p;
  const limit = track.halfWidth - BOAT_RADIUS;
  let hit = 0;
  if (p.lateral > limit) hit = pushOut(b, -p.nx, -p.nz, p.lateral - limit);
  else if (p.lateral < -limit) hit = pushOut(b, p.nx, p.nz, -limit - p.lateral);
  for (const o of track.obstacles || []) {
    const dx = b.x - o.x;
    const dz = b.z - o.z;
    const min = o.r + BOAT_RADIUS;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min || d2 < 1e-6) continue;
    const d = Math.sqrt(d2);
    hit = Math.max(hit, pushOut(b, dx / d, dz / d, min - d));
  }
  return hit;
}

// (nx, nz) aponta para longe da parede. Devolve a velocidade da batida.
function pushOut(b, nx, nz, over) {
  b.x += nx * over;
  b.z += nz * over;
  const vn = -(b.vx * nx + b.vz * nz); // velocidade indo contra a parede
  if (vn <= 0) return 0;
  if (vn > CRASH_SPEED) {
    crash(b, nx, nz);
  } else {
    b.vx += vn * nx;
    b.vz += vn * nz;
    b.vx *= 0.97;
    b.vz *= 0.97;
  }
  return vn;
}

export function updateProgress(b, track) {
  const p = b._proj || projectOnTrack(track, b.x, b.z);
  if (b.s === null) {
    b.s = p.s;
    return;
  }
  let ds = wrapDelta(track, p.s - b.s);
  if (ds > 12) ds = 12; // nunca pula pedaço da pista
  if (ds < -12) ds = -12;
  b.total += ds;
  b.s = p.s;
}

export function lapOf(b, track) {
  return Math.max(0, Math.floor(b.total / track.length));
}

export function hasFinished(b, track) {
  return b.total >= LAPS * track.length;
}

// Andando na direção errada da pista?
export function isWrongWay(b, track) {
  const p = b._proj || projectOnTrack(track, b.x, b.z);
  const fx = Math.sin(b.h);
  const fz = Math.cos(b.h);
  return fx * p.tx + fz * p.tz < -0.35;
}

// Dois barcos se encostando. Batida de verdade para os dois. "fixedB" = b não
// se mexe (é outro jogador, controlado pelo próprio navegador dele; ele vai
// sentir a batida do lado de lá).
export function collideBoats(a, b, fixedB = false) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  const min = BOAT_RADIUS * 2;
  if (d2 >= min * min || d2 < 1e-6) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const nz = dz / d;
  const over = min - d;
  const share = fixedB ? 1 : 0.5;
  a.x -= nx * over * share;
  a.z -= nz * over * share;
  if (!fixedB) {
    b.x += nx * over * 0.5;
    b.z += nz * over * 0.5;
  }
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // > 0 = se aproximando
  if (closing > CRASH_SPEED) {
    crash(a, -nx, -nz);
    if (!fixedB) crash(b, nx, nz);
  } else if (closing > 0) {
    a.vx -= nx * closing * 0.5;
    a.vz -= nz * closing * 0.5;
    if (!fixedB) {
      b.vx += nx * closing * 0.5;
      b.vz += nz * closing * 0.5;
    }
  }
  return true;
}
