// Corrida de 4 bots sem servidor nem navegador, para testar pistas.
import { gridSlots } from '../shared/track.js';
import { createBoat, stepBoat, collideBoats, hasFinished, lapOf } from '../shared/physics.js';
import { createBrain, botInput } from '../shared/bot.js';
import { PHYSICS_DT, RACE_TIME_LIMIT } from '../shared/constants.js';

// Devolve o tempo de chegada de cada bot (null = não terminou), as batidas,
// as voltas completas e o maior avanço de um passo para o outro (um salto
// grande = o barco "pulou" de trecho, por exemplo num cruzamento).
export function simulateRace(track, seed = 1234) {
  const boats = gridSlots(track).map(createBoat);
  const brains = boats.map((_, i) => createBrain(seed + i * 77));
  const finish = new Array(4).fill(null);
  const crashes = new Array(4).fill(0);
  let maxStep = 0;
  let t = 0;
  while (t < RACE_TIME_LIMIT && finish.some((f) => f === null)) {
    const leader = Math.max(...boats.map((b) => b.total));
    const racing = boats.filter((_, i) => finish[i] === null);
    boats.forEach((b, i) => {
      if (finish[i] !== null) return;
      const { input, speedMul } = botInput(b, brains[i], track, PHYSICS_DT, leader, racing);
      const before = b.bump;
      const total = b.total;
      stepBoat(b, input, PHYSICS_DT, track, speedMul);
      maxStep = Math.max(maxStep, Math.abs(b.total - total));
      if (b.bump === 1 && before < 1) crashes[i]++;
    });
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        // Como no servidor: quem já chegou sai da pista e não bate em ninguém.
        if (finish[i] !== null || finish[j] !== null) continue;
        const bi = boats[i].bump;
        const bj = boats[j].bump;
        collideBoats(boats[i], boats[j], false, track);
        if (boats[i].bump === 1 && bi < 1) crashes[i]++;
        if (boats[j].bump === 1 && bj < 1) crashes[j]++;
      }
    }
    boats.forEach((b, i) => {
      if (finish[i] === null && hasFinished(b, track)) finish[i] = t;
    });
    t += PHYSICS_DT;
  }
  return { finish, crashes, maxStep, laps: boats.map((b) => lapOf(b, track)) };
}
