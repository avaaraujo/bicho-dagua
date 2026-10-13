import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, gridSlots, projectOnTrack } from '../shared/track.js';
import { LAPS } from '../shared/constants.js';
import { simulateRace } from './race-sim.js';

const track = buildTrack();

test('pista fechada e sem auto-interseção perto demais', () => {
  assert.ok(track.length > 120 && track.length < 300, `comprimento ${track.length}`);
  // amostras que não são vizinhas na pista não podem ficar a menos de uma largura
  const S = track.samples;
  for (let i = 0; i < S.length; i += 4) {
    for (let j = 0; j < S.length; j += 4) {
      const along = Math.abs(S[i].s - S[j].s);
      const gap = Math.min(along, track.length - along);
      if (gap < 40) continue;
      const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
      assert.ok(d > track.halfWidth * 2 + 2, `trechos ${i} e ${j} a ${d.toFixed(1)} m`);
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
  const { finish, crashes, laps } = simulateRace(track);
  console.log('tempos de chegada (s):', finish.map((f) => f && f.toFixed(1)).join(', '), '| volta:', (track.length).toFixed(0), 'm', '| batidas:', crashes.join(', '));
  assert.ok(finish.every((f) => f !== null), `nem todos terminaram: ${laps.join(',')}`);
  assert.ok(Math.max(...finish) < 120, `lento demais: ${Math.max(...finish)}`);
  // bots batem às vezes, mas não toda volta
  assert.ok(Math.max(...crashes) <= 6, `bots batendo demais: ${crashes.join(',')}`);
  assert.equal(LAPS, 5);
});
