// Thread que converte desenhos em pistas (ver sketcher.js).
import { parentPort } from 'node:worker_threads';
import { sketchToTrack } from '../shared/sketch.js';

parentPort.on('message', ({ id, points, forceClose }) => {
  let result;
  try {
    result = sketchToTrack(points, { forceClose });
  } catch {
    result = { ok: false, reason: 'invalid' };
  }
  parentPort.postMessage({
    id,
    result: result.ok
      ? {
        ok: true,
        raw: result.raw,
        crossings: result.crossings.map(({ x, z, over, under, half, angle }) => ({ x, z, over, under, half, angle })),
        autoClosed: result.autoClosed,
      }
      : { ok: false, reason: result.reason },
  });
});
