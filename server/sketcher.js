// Converte desenhos em pistas numa thread separada: um desenho complicado leva
// até ~0,4 s, e o servidor não pode parar as corridas das outras salas nesse
// tempo.
import { Worker } from 'node:worker_threads';

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./sketch-worker.js', import.meta.url));
  worker.unref(); // não segura o processo aberto quando não tem desenho na fila
  worker.on('message', ({ id, result }) => {
    pending.get(id)?.(result);
    pending.delete(id);
    if (!pending.size) worker?.unref();
  });
  worker.on('error', (err) => {
    console.error('erro convertendo desenho:', err);
    for (const resolve of pending.values()) resolve({ ok: false, reason: 'invalid' });
    pending.clear();
    worker = null;
  });
  return worker;
}

// Pontos [u, v] da folha → { ok, raw, crossings, autoClosed } ou { ok: false, reason }.
export function convertSketch(points, forceClose) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    const w = getWorker();
    w.ref();
    w.postMessage({ id, points, forceClose });
  });
}
