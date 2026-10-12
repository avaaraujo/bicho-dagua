import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { Room } from './room.js';
import { ROOM_CODE_LENGTH } from '../shared/constants.js';

const PORT = Number(process.env.PORT) || 3000;
const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, '..', 'dist');

const app = express();
const http = createServer(app);
const io = new Server(http, { pingInterval: 10000, pingTimeout: 8000 });

app.get('/healthz', (_req, res) => res.send('ok'));
if (existsSync(dist)) {
  // Arquivos em /assets têm hash no nome e podem ficar em cache; a página
  // principal não, senão o navegador continua abrindo a versão antiga.
  app.use(express.static(dist, {
    index: 'index.html',
    setHeaders(res, file) {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
}

const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, para não confundir com 1 e 0

function newCode() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('sem códigos livres');
}

function cleanName(name) {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return n || 'Jogador';
}

io.on('connection', (socket) => {
  let room = null;

  const leaveCurrent = () => {
    if (!room) return;
    socket.leave(room.code);
    room.leave(socket.id);
    if (room.isEmpty()) rooms.delete(room.code);
    room = null;
  };

  socket.on('room:create', ({ name } = {}, ack) => {
    if (typeof ack !== 'function') return;
    leaveCurrent();
    const code = newCode();
    const r = new Room(code, io);
    rooms.set(code, r);
    r.join(socket, cleanName(name));
    room = r;
    ack({ ok: true, you: socket.id, room: r.lobbyPayload() });
  });

  socket.on('room:join', ({ code, name } = {}, ack) => {
    if (typeof ack !== 'function') return;
    const r = rooms.get(String(code ?? '').trim().toUpperCase());
    if (!r) return ack({ ok: false, error: 'Não achamos essa sala. Confira o código com quem criou.' });
    if (room === r) return ack({ ok: true, you: socket.id, room: r.lobbyPayload() });
    leaveCurrent();
    const error = r.join(socket, cleanName(name));
    if (error) return ack({ ok: false, error });
    room = r;
    ack({ ok: true, you: socket.id, room: r.lobbyPayload() });
  });

  socket.on('room:leave', () => leaveCurrent());
  socket.on('lobby:character', (character) => room?.setCharacter(socket.id, character));
  socket.on('lobby:start', () => room?.start(socket.id));
  socket.on('race:state', (msg) => room?.clientState(socket.id, msg));
  socket.on('race:again', () => room?.backToLobby(socket.id));
  socket.on('disconnect', () => leaveCurrent());
});

http.listen(PORT, () => {
  console.log(`Turbo Cratera rodando em http://localhost:${PORT}`);
});
