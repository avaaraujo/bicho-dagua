// Desenvolvimento: servidor do jogo na 3000 e Vite (com hot reload) na 5173.
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
