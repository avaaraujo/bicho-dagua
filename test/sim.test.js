import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, gridSlots, projectOnTrack } from '../shared/track.js';
import { createBoat, stepBoat, collideBoats, hasFinished, lapOf } from '../shared/physics.js';
import { createBrain, botInput } from '../shared/bot.js';
import { PHYSICS_DT, LAPS, RACE_TIME_LIMIT } from '../shared/constants.js';

const track = buildTrack();

test('pista fechada e sem auto-interseção perto demais', () => {
  assert.ok(track.length > 350 && track.length < 700, `comprimento ${track.length}`);
  // amostras que não são vizinhas na pista não podem ficar a menos de uma largura
  const S = track.samples;
  for (let i = 0; i < S.length; i += 4) {
    for (let j = 0; j < S.length; j += 4) {
      const along = Math.abs(S[i].s - S[j].s);
      const gap = Math.min(along, track.length - along);
      if (gap < 60) continue;
      const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
      assert.ok(d > track.halfWidth * 2 + 6, `trechos ${i} e ${j} a ${d.toFixed(1)} m`);
    }
  }
});

test('grid de largada fica dentro da pista', () => {
  for (const slot of gridSlots(track)) {
    const p = projectOnTrack(track, slot.x, slot.z);
    assert.ok(Math.abs(p.lateral) < track.halfWidth - 1);
  }
});

test('4 bots terminam 5 voltas dentro do tempo', () => {
  const boats = gridSlots(track).map(createBoat);
  const brains = boats.map((_, i) => createBrain(1234 + i * 77));
  const finish = new Array(4).fill(null);
  let t = 0;
  while (t < RACE_TIME_LIMIT && finish.some((f) => f === null)) {
    const leader = Math.max(...boats.map((b) => b.total));
    boats.forEach((b, i) => {
      if (finish[i] !== null) return;
      const { input, speedMul } = botInput(b, brains[i], track, PHYSICS_DT, leader);
      stepBoat(b, input, PHYSICS_DT, track, speedMul);
    });
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) collideBoats(boats[i], boats[j]);
    boats.forEach((b, i) => {
      if (finish[i] === null && hasFinished(b, track)) finish[i] = t;
    });
    t += PHYSICS_DT;
  }
  console.log('tempos de chegada (s):', finish.map((f) => f && f.toFixed(1)).join(', '), '| volta:', (track.length).toFixed(0), 'm');
  assert.ok(finish.every((f) => f !== null), `nem todos terminaram: ${boats.map((b) => lapOf(b, track)).join(',')}`);
  assert.ok(Math.max(...finish) < 150);
  assert.equal(LAPS, 5);
});
