// Piloto automático: mira num ponto à frente na pista, numa "faixa" própria,
// e tira o pé antes das curvas fechadas.
import { pointAt } from './track.js';
import { forwardSpeed, MAX_SPEED } from './physics.js';

export function createBrain(seed) {
  const rand = mulberry32(seed);
  return {
    rand,
    skill: 0.9 + rand() * 0.08, // multiplicador de aceleração
    caution: 0.75 + rand() * 0.4, // quanto freia nas curvas
    lane: (rand() - 0.5) * 6,
    laneTarget: 0,
    laneTimer: 0,
  };
}

export function botInput(b, brain, track, dt, leaderTotal) {
  brain.laneTimer -= dt;
  if (brain.laneTimer <= 0) {
    brain.laneTimer = 1.5 + brain.rand() * 2.5;
    brain.laneTarget = (brain.rand() - 0.5) * (track.halfWidth * 0.9);
  }
  brain.lane += (brain.laneTarget - brain.lane) * Math.min(1, dt * 0.8);

  const speed = forwardSpeed(b);
  const ahead = 7 + Math.max(0, speed) * 0.45;
  const here = pointAt(track, b.total, 0);
  // Por dentro da curva fica mais curto: puxa a faixa para o lado de dentro.
  const lane = brain.lane + Math.sign(here.turn) * Math.min(4, Math.abs(here.turn) * 5);
  const target = pointAt(track, b.total + ahead, lane);

  const desired = Math.atan2(target.x - b.x, target.z - b.z);
  let diff = desired - b.h;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, -diff * 2.6));

  const curve = Math.abs(pointAt(track, b.total + ahead * 1.2, 0).turn);
  const safeSpeed = MAX_SPEED * (1 - Math.min(0.6, curve * brain.caution * 0.75));
  let throttle = speed > safeSpeed ? 0.15 : 1;
  if (Math.abs(diff) > 1.2) throttle = 0.4; // desvirando

  // Elástico leve para a corrida ficar disputada.
  let mul = brain.skill;
  if (leaderTotal !== undefined) {
    const gap = leaderTotal - b.total;
    if (gap > 60) mul *= 1.05;
    else if (gap < -40) mul *= 0.9;
  }
  mul = Math.min(mul, 0.98); // bot nunca é mais rápido que um jogador acelerando tudo
  return { input: { steer, throttle }, speedMul: mul };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
