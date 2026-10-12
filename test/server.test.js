import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3917;
const URL = `http://localhost:${PORT}`;

function once(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}
function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

test('criar sala, entrar, largar e receber snapshots', async (t) => {
  const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT) } });
  t.after(() => server.kill());
  await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('rodando') && resolve()));

  const a = io(URL, { transports: ['websocket'] });
  const b = io(URL, { transports: ['websocket'] });
  t.after(() => { a.close(); b.close(); });

  const created = await emitAck(a, 'room:create', { name: 'Ana' });
  assert.ok(created.ok);
  assert.match(created.room.code, /^[A-Z]{4}$/);

  const bad = await emitAck(b, 'room:join', { code: 'ZZZZ', name: 'Bia' });
  assert.equal(bad.ok, false);

  const joined = await emitAck(b, 'room:join', { code: created.room.code.toLowerCase(), name: 'Bia' });
  assert.ok(joined.ok);
  assert.equal(joined.room.players.length, 2);
  assert.notEqual(joined.room.players[0].character, joined.room.players[1].character);

  // só o anfitrião pode largar
  b.emit('lobby:start');
  a.emit('lobby:start');
  const start = await once(b, 'race:start');
  assert.equal(start.racers.length, 4);
  assert.equal(start.racers.filter((r) => r.isBot).length, 2);

  const snap = await once(a, 'race:snap');
  assert.equal(snap.racers.length, 4);
  assert.ok(snap.racers.every((r) => r.place >= 1 && r.place <= 4));
});
