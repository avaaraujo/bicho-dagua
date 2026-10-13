// Teste manual de pista desenhada: com o servidor rodando com BICHO_DEV=1,
//   node scripts/dev-sketch.js ABCD figureEight 3
// manda um desenho de teste (ver test/sketches.js) para a sala ABCD. A
// próxima corrida que o anfitrião largar usa essa pista.
import { io } from 'socket.io-client';
import * as sketches from '../test/sketches.js';

const [code, kind = 'figureEight', seed = '1', url = 'http://localhost:3000'] = process.argv.slice(2);
if (!code || typeof sketches[kind] !== 'function') {
  console.log('uso: node scripts/dev-sketch.js CODIGO [blob|figureEight|trefoil|curl|line|...] [semente] [url]');
  process.exit(1);
}

const socket = io(url, { transports: ['websocket'] });
socket.on('connect', () => {
  const points = sketches[kind](sketches.seeded(Number(seed)));
  socket.emit('dev:sketch', { code, points, forceClose: true }, (res) => {
    console.log(res ?? 'sem resposta (o servidor está com BICHO_DEV=1?)');
    socket.close();
  });
  setTimeout(() => {
    console.log('sem resposta (o servidor está com BICHO_DEV=1?)');
    process.exit(1);
  }, 3000).unref();
});
