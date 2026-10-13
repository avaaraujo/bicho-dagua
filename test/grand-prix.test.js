// Grand Prix no servidor: sorteio de quem desenha, desenho → pista, 4
// corridas com pontos 10/6/3/1, desempate e saída de jogadores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { GP_RACES } from '../shared/constants.js';
import * as sketches from './sketches.js';

function fakeIo() {
  const sent = [];
  const channel = { emit: (event, payload) => sent.push({ event, payload }) };
  channel.volatile = { emit() {} };
  return { sent, to: () => channel };
}

function setup(names) {
  const io = fakeIo();
  const room = new Room('ABCD', io);
  room.timing = { intro: 10, draw: 250, redraw: 200, grace: 50 };
  for (const n of names) room.join({ id: n, join() {} }, n);
  return { io, room };
}

const last = (io, event) => io.sent.filter((m) => m.event === event).at(-1)?.payload;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const eight = (seed = 1) => sketches.figureEight(sketches.seeded(seed));

// Termina a corrida com os pilotos chegando nessa ordem.
function finishRace(room, ids) {
  ids.forEach((id, i) => {
    room.racers.find((r) => r.id === id).finishTime = 50 + i;
  });
  room.finish(60);
}

test('só o anfitrião escolhe o modo, e só na sala', () => {
  const { room } = setup(['ana', 'bia']);
  room.setMode('bia', 'gp');
  assert.equal(room.mode, 'quick');
  room.setMode('ana', 'xyz');
  assert.equal(room.mode, 'quick');
  room.setMode('ana', 'gp');
  assert.equal(room.mode, 'gp');
  assert.equal(room.lobbyPayload().mode, 'gp');
  room.stop();
});

test('Quick Play continua igual: sem desenho e sem pontos', () => {
  const { io, room } = setup(['ana']);
  room.start('ana');
  assert.equal(room.state, 'countdown');
  assert.equal(last(io, 'race:start').gp, null);
  assert.equal(last(io, 'race:start').track, null);
  finishRace(room, ['ana', 'bot-1', 'bot-2', 'bot-3']);
  assert.equal(last(io, 'race:end').gp, null);
  room.backToLobby('ana');
  assert.equal(room.state, 'lobby');
});

test('Grand Prix: 4 corridas, pontos 10/6/3/1, todo mundo desenha antes de repetir', async () => {
  const { io, room } = setup(['ana', 'bia']);
  room.setMode('ana', 'gp');
  room.start('ana');
  const drawers = [];
  for (let race = 1; race <= GP_RACES; race++) {
    assert.equal(room.state, 'drawing');
    const draw = room.lobbyPayload().gp.draw;
    assert.equal(draw.race, race);
    assert.equal(draw.attempt, 1);
    assert.ok(['ana', 'bia'].includes(draw.drawerId), 'bot nunca desenha');
    drawers.push(draw.drawerId);

    // Só quem foi sorteado pode mandar o desenho.
    const other = draw.drawerId === 'ana' ? 'bia' : 'ana';
    await room.submitSketch(other, eight(race));
    assert.equal(room.state, 'drawing');

    await room.submitSketch(draw.drawerId, eight(race));
    assert.equal(room.state, 'countdown');
    const start = last(io, 'race:start');
    assert.ok(start.track, 'a corrida usa a pista desenhada');
    assert.deepEqual({ ...start.gp }, { race, races: GP_RACES, drawerName: draw.drawerName, fallback: false });

    finishRace(room, ['bot-2', 'ana', 'bot-3', 'bia']);
    const end = last(io, 'race:end');
    assert.equal(end.gp.race, race);
    assert.equal(end.gp.final, race === GP_RACES);
    const points = Object.fromEntries(end.gp.table.map((r) => [r.id, r.points]));
    assert.deepEqual(points, { 'bot-2': 10 * race, ana: 6 * race, 'bot-3': 3 * race, bia: 1 * race });
    room.backToLobby('ana');
  }
  // As duas primeiras pistas são de pessoas diferentes; depois pode repetir.
  assert.notEqual(drawers[0], drawers[1]);
  assert.notEqual(drawers[2], drawers[3]);
  assert.equal(room.state, 'lobby');
  assert.equal(room.gp, null);
  // Um bot pode ganhar o Grand Prix.
  assert.equal(last(io, 'race:end').gp.table[0].id, 'bot-2');
});

test('desenho que não fecha: mais 10 s; de novo, fecha com uma linha reta', async () => {
  const { io, room } = setup(['ana']);
  room.setMode('ana', 'gp');
  room.start('ana');
  const open = sketches.openArc(sketches.seeded(3));
  await room.submitSketch('ana', open);
  const draw = room.lobbyPayload().gp.draw;
  assert.equal(room.state, 'drawing');
  assert.equal(draw.attempt, 2);
  assert.equal(draw.reason, 'not-closed');
  assert.ok(draw.endsIn <= room.timing.redraw);
  await room.submitSketch('ana', open);
  assert.equal(room.state, 'countdown');
  assert.ok(last(io, 'race:start').track);
  assert.equal(last(io, 'race:start').gp.fallback, false);
  room.stop();
});

test('desenho impossível duas vezes: a corrida usa a pista do Quick Play', async () => {
  const { io, room } = setup(['ana']);
  room.setMode('ana', 'gp');
  room.start('ana');
  const star = sketches.star(sketches.seeded(4));
  await room.submitSketch('ana', star);
  assert.equal(room.lobbyPayload().gp.draw.reason, 'too-many-crossings');
  await room.submitSketch('ana', star);
  assert.equal(room.state, 'countdown');
  assert.equal(last(io, 'race:start').track, null);
  assert.equal(last(io, 'race:start').gp.fallback, true);
  room.stop();
});

test('tempo esgotado sem desenho: segunda chance e depois a pista do Quick Play', async () => {
  const { io, room } = setup(['ana']);
  room.setMode('ana', 'gp');
  room.start('ana');
  await wait(room.timing.intro + room.timing.draw + room.timing.grace + 60);
  assert.equal(room.lobbyPayload().gp.draw.attempt, 2);
  assert.equal(room.lobbyPayload().gp.draw.reason, 'timeout');
  // Desenho atrasado demais não vale.
  await wait(room.timing.redraw + room.timing.grace + 60);
  assert.equal(room.state, 'countdown');
  assert.equal(last(io, 'race:start').gp.fallback, true);
  await room.submitSketch('ana', eight());
  assert.equal(room.state, 'countdown');
  room.stop();
});

test('quem está desenhando sai: outro desenha; quem saiu vira bot e fica com os pontos', async () => {
  const { io, room } = setup(['ana', 'bia', 'caio']);
  room.setMode('ana', 'gp');
  room.start('ana');
  await room.submitSketch(room.gp.draw.drawerId, eight());
  finishRace(room, ['caio', 'ana', 'bia', 'bot-3']);
  room.backToLobby('ana');
  const leaving = room.gp.draw.drawerId;
  room.leave(leaving);
  assert.equal(room.state, 'drawing');
  const now = room.gp.draw.drawerId;
  assert.notEqual(now, leaving);
  assert.ok(room.members.has(now));
  const entry = room.lobbyPayload().gp.table.find((r) => r.id === leaving);
  assert.equal(entry.isBot, true);
  assert.match(entry.name, /\(bot\)$/);
  assert.ok(entry.points > 0);
  // Na próxima corrida ele está lá, como bot.
  await room.submitSketch(now, eight(2));
  const racer = last(io, 'race:start').racers.find((r) => r.id === leaving);
  assert.equal(racer.isBot, true);
  room.stop();
});

test('desempate: mais vitórias, depois a melhor colocação na última corrida', () => {
  const { room } = setup(['ana', 'bia']);
  room.setMode('ana', 'gp');
  room.start('ana');
  const set = (id, points, wins, places) => Object.assign(room.gp.scores.get(id), { points, wins, places });
  set('ana', 20, 1, [1, 4, 2]);
  set('bia', 20, 2, [1, 1, 4]);
  set('bot-2', 13, 0, [2, 3, 3]);
  set('bot-3', 13, 0, [3, 2, 2]);
  assert.deepEqual(room.gpTable().map((r) => r.id), ['bia', 'ana', 'bot-3', 'bot-2']);
  room.stop();
});

test('converter um desenho pesado não trava o servidor (roda em outra thread)', async () => {
  const { convertSketch } = await import('../server/sketcher.js');
  await convertSketch(eight(), false); // a thread já começa aquecida
  let worst = 0;
  let prev = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - prev);
    prev = now;
  }, 5);
  const t0 = performance.now();
  const result = await convertSketch(sketches.trefoil(sketches.seeded(300)), false);
  const took = performance.now() - t0;
  clearInterval(timer);
  assert.ok(result.ok || result.reason);
  console.log(`conversão do trevo: ${took.toFixed(0)} ms; maior pausa do servidor: ${worst.toFixed(0)} ms`);
  assert.ok(worst < Math.max(60, took / 3), `o servidor parou ${worst.toFixed(0)} ms`);
});
