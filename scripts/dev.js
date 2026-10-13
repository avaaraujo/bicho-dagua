// Desenvolvimento: servidor do jogo na 3000 e Vite (com hot reload) na 5173.
// Roda tudo com o próprio Node (process.execPath), sem npx nem shell, para
// funcionar igual no Windows, macOS e Linux.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const procs = [
  spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn(process.execPath, [vite], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
