// Piloto automático: mira num ponto à frente na pista, numa "faixa" própria,
// desvia dos pilares e dos outros barcos, e freia antes das curvas, porque
// qualquer batida para o barco.
import { pointAt, wrapDelta } from './track.js';
import { forwardSpeed, MAX_SPEED, BOAT_RADIUS } from './physics.js';

const PLAN_BRAKE = 18; // m/s² que o bot conta poder frear ao planejar

export function createBrain(seed) {
  const rand = mulberry32(seed);
  return {
    rand,
    skill: 0.9 + rand() * 0.08, // multiplicador de aceleração
    caution: 0.9 + rand() * 0.25, // quanto respeita as curvas (maior = mais lento)
    lane: (rand() - 0.5) * 6,
    laneTarget: 0,
    laneTimer: 0,
  };
}

// Velocidade segura num trecho com "curv" radianos de curva nos próximos 16 m.
function cornerSpeed(curv, caution) {
  return MAX_SPEED * Math.max(0.3, 1 - curv * 0.38 * caution);
}

// others: barcos dos outros pilotos (com _proj e total), para desviar.
export function botInput(b, brain, track, dt, leaderTotal, others = []) {
  const hw = track.halfWidth;
  const maxLane = hw - BOAT_RADIUS - 0.6;
  brain.laneTimer -= dt;
  if (brain.laneTimer <= 0) {
    brain.laneTimer = 1.5 + brain.rand() * 2.5;
    brain.laneTarget = (brain.rand() - 0.5) * hw * 0.9;
  }

  // Desvia dos pilares que estão chegando. O lado é escolhido uma vez por
  // pilar (senão o bot fica indeciso e acerta o pilar no meio).
  let goal = brain.laneTarget;
  brain.sides = brain.sides || {};
  (track.obstacles || []).forEach((o, k) => {
    const gap = wrapDelta(track, o.s - (b.s ?? 0));
    if (gap < -4 || gap > 30) {
      delete brain.sides[k];
      return;
    }
    if (!brain.sides[k]) {
      const cur = b._proj ? b._proj.lateral : brain.lane;
      brain.sides[k] = Math.sign(cur - o.lateral) || (brain.rand() < 0.5 ? -1 : 1);
    }
    const clear = o.r + BOAT_RADIUS + 1.2;
    const pass = Math.max(-maxLane, Math.min(maxLane, o.lateral + brain.sides[k] * clear));
    goal = pass;
    brain.pass = brain.pass || {};
    brain.pass[k] = pass;
  });

  // Quem está logo à frente na mesma faixa: segue sem encostar e, se der,
  // muda de faixa para passar.
  const speed = forwardSpeed(b);
  let followSpeed = Infinity;
  const myLat = b._proj ? b._proj.lateral : brain.lane;
  for (const o of others) {
    if (o === b || !o._proj) continue;
    const gap = o.total - b.total;
    if (gap <= 0 || gap > 14) continue;
    if (Math.abs(o._proj.lateral - myLat) > BOAT_RADIUS * 2 + 0.6) continue;
    followSpeed = Math.min(followSpeed, Math.max(0, forwardSpeed(o) + (gap - 6) * 0.8));
    const side = o._proj.lateral > myLat ? -1 : 1;
    const dodge = o._proj.lateral + side * (BOAT_RADIUS * 2 + 1.2);
    if (Math.abs(dodge) <= maxLane) goal = dodge;
  }

  goal = Math.max(-maxLane, Math.min(maxLane, goal));
  brain.lane += (goal - brain.lane) * Math.min(1, dt * 3);

  const ahead = 4 + Math.max(0, speed) * 0.3;
  const here = pointAt(track, b.total, 0);
  // Por dentro da curva fica mais curto: puxa a faixa para o lado de dentro,
  // mas sem colar na mureta (a linha reta até o alvo corta a curva).
  const aimLane = maxLane - 1.4;
  let lane = Math.max(-aimLane, Math.min(aimLane, brain.lane + Math.sign(here.turn) * Math.min(2, Math.abs(here.turn) * 2.5)));
  // O desvio dos pilares vale mais que o atalho da curva.
  (track.obstacles || []).forEach((o, k) => {
    if (brain.sides[k] !== undefined) lane = brain.pass[k];
  });
  let target = pointAt(track, b.total + ahead, lane);
  // Pilar entre o barco e o alvo: mira direto no "portão" ao lado dele.
  (track.obstacles || []).forEach((o, k) => {
    const gap = wrapDelta(track, o.s - (b.s ?? 0));
    if (brain.sides[k] === undefined || gap < -3 || gap > ahead + 3) return;
    target = pointAt(track, o.s + 5, brain.pass[k]);
  });

  const desired = Math.atan2(target.x - b.x, target.z - b.z);
  let diff = desired - b.h;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, -diff * 2.6));

  // Planeja a velocidade: em cada ponto à frente, até que velocidade dá para
  // chegar lá ainda conseguindo frear para a curva daquele ponto?
  let targetSpeed = Math.min(MAX_SPEED, followSpeed);
  for (let d = 0; d <= 40; d += 4) {
    const curv = pointAt(track, b.total + d, 0).curv;
    const safe = cornerSpeed(curv, brain.caution);
    targetSpeed = Math.min(targetSpeed, Math.sqrt(safe * safe + 2 * PLAN_BRAKE * d));
  }
  let throttle = 1;
  if (speed > targetSpeed + 1.5) throttle = -1;
  else if (speed > targetSpeed) throttle = 0;
  if (Math.abs(diff) > 1.2) throttle = 0.4; // desvirando depois de uma batida

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
