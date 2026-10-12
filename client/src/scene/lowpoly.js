// Utilitários do visual "console anos 90": faces chapadas, poucas arestas.
import * as THREE from 'three';

const materials = new Map();

export function flat(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.basic ?? ''}`;
  if (!materials.has(key)) {
    const m = opts.basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: opts.emissive ?? 0x000000 });
    materials.set(key, m);
  }
  return materials.get(key);
}

export function part(geometry, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], opts) {
  const m = new THREE.Mesh(geometry, flat(color, opts));
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  return m;
}

export const vertexColorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });

// Textura pequena desenhada em canvas, com pixels nítidos.
export function canvasTexture(w, h, draw, { repeat = [1, 1], nearest = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  if (nearest) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
  }
  return t;
}

// Ruído determinístico barato, para a geometria ser igual em todo navegador.
export function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export function mixColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
}
