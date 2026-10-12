// Física arcade do jet-ski. Mesma função no servidor (bots) e no cliente
// (o seu jet-ski), para os dois se comportarem igual.
import { projectOnTrack, wrapDelta } from './track.js';
import { LAPS } from './constants.js';

export const BOAT_RADIUS = 1.5;
export const ACCEL = 21;
export const DRAG = 0.78; // velocidade máxima ≈ ACCEL / DRAG ≈ 27 m/s
export const COAST_DRAG = 1.2;
export const GRIP = 2.4; // quanto da derrapagem lateral some por segundo
export const TURN_RATE = 2.35; // rad/s no melhor ponto
export const MAX_SPEED = ACCEL / DRAG;

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

  const throttle = input.throttle;
  fwd += ACCEL * speedMul * throttle * dt;
  fwd -= fwd * (throttle > 0.05 ? DRAG : COAST_DRAG) * dt;
  if (fwd < -4) fwd = -4;

  // Vira melhor em velocidade média; parado ainda gira devagar; muito rápido perde força.
  const sp = Math.abs(fwd) / MAX_SPEED;
  const turnFactor = 0.38 + 0.9 * Math.min(1, sp * 2.2) - 0.32 * sp * sp;
  b.h -= b.steer * TURN_RATE * turnFactor * dt;

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

// Paredes: lado de fora (penhasco) e lado de dentro (ilha).
// Bater rápido no lado de fora custa bastante velocidade.
export function collideWalls(b, track) {
  const p = projectOnTrack(track, b.x, b.z);
  const limit = track.halfWidth - BOAT_RADIUS;
  let nx = 0;
  let nz = 0;
  let over = 0;
  if (p.lateral > limit) {
    nx = p.nx; nz = p.nz; over = p.lateral - limit;
  } else if (p.lateral < -limit) {
    nx = -p.nx; nz = -p.nz; over = -limit - p.lateral;
  }
  b._proj = p;
  if (over <= 0) return 0;
  b.x -= nx * over;
  b.z -= nz * over;
  const vn = b.vx * nx + b.vz * nz;
  if (vn > 0) {
    b.vx -= 1.35 * vn * nx;
    b.vz -= 1.35 * vn * nz;
    const keep = Math.max(0.45, 1 - vn * 0.045);
    b.vx *= keep;
    b.vz *= keep;
    b.bump = Math.max(b.bump, Math.min(1, vn / 12));
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

// Empurra dois barcos para longe um do outro. "fixedB" = b não se mexe
// (usado quando b é outro jogador controlado pelo próprio navegador dele).
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
  const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rv < 0) {
    const j = -rv * 0.6;
    a.vx -= nx * j * (fixedB ? 1.4 : 1);
    a.vz -= nz * j * (fixedB ? 1.4 : 1);
    if (!fixedB) {
      b.vx += nx * j;
      b.vz += nz * j;
    }
    a.bump = Math.max(a.bump, Math.min(1, -rv / 10));
  }
  return true;
}
