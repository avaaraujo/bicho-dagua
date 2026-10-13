// Galeria para conferir de olho a conversão desenho → pista do Grand Prix.
// Gera dist/sketch-gallery.html com os desenhos de teste (em cinza) e as
// pistas que saíram deles: água, cruzamentos (laranja), grid (vermelho) e o
// sentido da largada (traço preto).
import fs from 'node:fs';
import * as sketches from '../test/sketches.js';
import { sketchToTrack, AREA } from '../shared/sketch.js';
import { buildTrack, gridSlots } from '../shared/track.js';

const KINDS = ['blob', 'figureEight', 'chain', 'curl', 'openArc', 'line', 'scribble', 'loopy', 'trefoil', 'star'];
const FORCE = new Set(['openArc', 'line']);
const PER_KIND = 6;
const W = AREA.halfX + 16;
const H = AREA.halfZ + 16;

let html = `<!doctype html><meta charset="utf-8"><title>Pistas desenhadas</title>
<style>body{font:12px sans-serif;background:#f4efe6;margin:8px}figure{display:inline-block;margin:4px;background:#fff;padding:4px}svg{display:block}</style>`;

for (const kind of KINDS) {
  html += `<h3>${kind}</h3>`;
  for (let i = 0; i < PER_KIND; i++) {
    const pts = sketches[kind](sketches.seeded(2000 + i));
    const r = sketchToTrack(pts, { forceClose: FORCE.has(kind) });
    const drawn = pts.map(([u, v]) => [(u - 0.5) * 2 * AREA.halfX, (v - 0.5) * 2 * AREA.halfZ]);
    let svg = `<svg width="300" height="${(300 * H) / W}" viewBox="${-W} ${-H} ${2 * W} ${2 * H}">`;
    svg += `<rect x="${-AREA.halfX}" y="${-AREA.halfZ}" width="${2 * AREA.halfX}" height="${2 * AREA.halfZ}" fill="none" stroke="#ddd" stroke-dasharray="3"/>`;
    svg += `<polyline points="${pointList(drawn)}" fill="none" stroke="#000" stroke-width="1" opacity=".25"/>`;
    if (r.ok) {
      const track = buildTrack(r.raw);
      const line = pointList(r.raw);
      svg += `<polygon points="${line}" fill="none" stroke="#19c3b4" stroke-width="${track.halfWidth * 2}" stroke-linejoin="round" opacity=".6"/>`;
      svg += `<polygon points="${line}" fill="none" stroke="#0b7f86" stroke-width=".8"/>`;
      for (const c of r.crossings) svg += `<circle cx="${c.x}" cy="${c.z}" r="4" fill="#ff6a1a"/>`;
      for (const g of gridSlots(track)) svg += `<circle cx="${g.x}" cy="${g.z}" r="1.5" fill="#e2403a"/>`;
      const [a, b] = [r.raw[0], r.raw[6]];
      svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${a[0] + (b[0] - a[0]) * 3}" y2="${a[1] + (b[1] - a[1]) * 3}" stroke="#222" stroke-width="1.5"/>`;
    }
    svg += '</svg>';
    const label = r.ok
      ? `${r.length.toFixed(0)} m, ${r.crossings.length} cruz.${r.autoClosed ? ', fechado auto' : ''}${r.startShift ? `, largada +${r.startShift.toFixed(0)} m` : ''}`
      : r.reason;
    html += `<figure>${svg}${label}</figure>`;
  }
}

fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/sketch-gallery.html', html);
console.log('dist/sketch-gallery.html');

function pointList(pts) {
  return pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
}
