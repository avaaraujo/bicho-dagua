// A cratera: água, ilha central com a estátua da baleia, paredões de rocha,
// cachoeiras, rios de lava, céu de fim de tarde e a linha de chegada.
import * as THREE from 'three';
import { part, flat, canvasTexture, hash, mixColor, vertexColorMaterial } from './lowpoly.js';
import { pointAt } from '../../../shared/track.js';

const PAL = {
  waterDeep: '#0b7f86',
  water: '#19c3b4',
  waterLight: '#7ee8d8',
  magma: '#ff6a1a',
  magmaHot: '#ffc23a',
  jungle: '#3fa34d',
  jungleDark: '#2b7a3c',
  rockLow: '#4a2f3f',
  rock: '#a8482b',
  rockHigh: '#d9773a',
  skyTop: '#5d4aa6',
  skyMid: '#9a7fd1',
  skyLow: '#f3b6a0',
  fog: '#c4a2c6',
  stone: '#9a9387',
  plum: '#3b2440',
  cream: '#fff4dc',
};

export function buildWorld(scene, track) {
  const animated = [];
  scene.background = new THREE.Color(PAL.skyMid);
  scene.fog = new THREE.Fog(PAL.fog, 110, 360);

  scene.add(new THREE.HemisphereLight(0xffe6f0, 0x2f8f8a, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.9);
  sun.position.set(60, 120, -40);
  scene.add(sun);

  scene.add(sky());

  const center = interiorCenter(track);
  const water = waterPlane(center);
  scene.add(water.mesh);
  animated.push(water.update);

  scene.add(island(track));
  const whale = whaleStatue();
  whale.position.set(center.x, 1.5, center.z);
  whale.rotation.y = Math.PI * 0.85;
  scene.add(whale);
  scene.add(islandDecor(track, center));

  const cliffs = cliffRing(track, center);
  scene.add(cliffs.mesh);

  const falls = cascades(cliffs);
  scene.add(falls.group);
  animated.push(falls.update);

  scene.add(finishLine(track));
  scene.add(cornerSigns(track));

  return {
    center,
    update(t, dt) {
      for (const fn of animated) fn(t, dt);
    },
  };
}

function sky() {
  const g = new THREE.SphereGeometry(500, 16, 10);
  const colors = [];
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 500;
    const c = y > 0.25 ? mixColor(PAL.skyMid, PAL.skyTop, (y - 0.25) / 0.75) : mixColor(PAL.skyLow, PAL.skyMid, (y + 0.1) / 0.35);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  return m;
}

function interiorCenter(track) {
  let x = 0;
  let z = 0;
  for (const s of track.samples) {
    x += s.x;
    z += s.z;
  }
  return { x: x / track.samples.length, z: z / track.samples.length };
}

function waterPlane(center) {
  const tex = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = PAL.water;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#15b0a3';
    for (let i = 0; i < 18; i++) ctx.fillRect(hash(i) * w, hash(i + 40) * h, 10 + hash(i + 9) * 14, 3);
    ctx.fillStyle = PAL.waterLight;
    for (let i = 0; i < 10; i++) {
      const x = hash(i + 100) * w;
      const y = hash(i + 200) * h;
      ctx.fillRect(x, y, 8 + hash(i + 300) * 10, 2);
      ctx.fillRect(x + 4, y - 2, 6, 2);
    }
  }, { repeat: [40, 40] });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(260, 40), new THREE.MeshLambertMaterial({ map: tex }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, 0, center.z);
  return {
    mesh,
    update(t) {
      tex.offset.set(Math.sin(t * 0.25) * 0.08, t * 0.035);
    },
  };
}

function boundary(track, lateral, step = 4) {
  const pts = [];
  for (let s = 0; s < track.length; s += step) {
    const p = pointAt(track, s, lateral);
    pts.push(p);
  }
  return pts;
}

function island(track) {
  const pts = boundary(track, -(track.halfWidth + 0.15), 3);
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 3.4, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -1.2, 0);
  const mesh = new THREE.Mesh(g, [flat(PAL.jungle), flat(PAL.rock)]);
  // segundo degrau de grama, mais para dentro
  const inner = boundary(track, -(track.halfWidth + 5), 6);
  const shape2 = new THREE.Shape(inner.map((p) => new THREE.Vector2(p.x, -p.z)));
  const g2 = new THREE.ExtrudeGeometry(shape2, { depth: 1.4, bevelEnabled: false, curveSegments: 1 });
  g2.rotateX(-Math.PI / 2);
  g2.translate(0, 2.2, 0);
  const top = new THREE.Mesh(g2, [flat(PAL.jungleDark), flat(PAL.rockHigh)]);
  const group = new THREE.Group();
  group.add(mesh, top);
  return group;
}

function whaleStatue() {
  const g = new THREE.Group();
  const ico = new THREE.IcosahedronGeometry(1, 1);
  g.add(part(new THREE.CylinderGeometry(4.2, 5, 2.4, 7), PAL.plum, [0, 2.4, 0]));
  g.add(part(new THREE.CylinderGeometry(3.4, 4.2, 1.2, 7), PAL.stone, [0, 4.2, 0]));
  // corpo saindo da água, inclinado para cima
  const body = part(ico, PAL.stone, [0, 11, 0], [0.25, 0, 0], [4.3, 8.2, 4.6]);
  g.add(body);
  g.add(part(ico, '#b3ab9d', [0, 9.5, 2.6], [0.25, 0, 0], [3.2, 5.5, 2.2])); // barriga
  g.add(part(ico, PAL.stone, [0, 17.8, 2.4], [0.9, 0, 0], [3.5, 3.6, 3.8])); // cabeça
  g.add(part(new THREE.BoxGeometry(5.6, 0.35, 0.5), '#5c544a', [0, 16.8, 5.4], [0.4, 0, 0])); // boca
  for (const s of [-1, 1]) {
    g.add(part(ico, '#2a2230', [s * 3.15, 18.4, 3.3], [0, 0, 0], [0.38, 0.38, 0.38]));
    g.add(part(ico, PAL.stone, [s * 4.6, 11.5, 1.2], [0.4, 0, s * 0.9], [0.9, 3.2, 1.6])); // nadadeiras
  }
  // cauda atrás, saindo da água
  g.add(part(ico, PAL.stone, [0, 6.2, -7], [-0.6, 0, 0], [1.6, 3.4, 1.6]));
  g.add(part(ico, PAL.stone, [0, 9.4, -9], [0, 0, 0], [4.6, 0.7, 1.5]));
  return g;
}

function palm(x, z, h, seed) {
  const g = new THREE.Group();
  const lean = (hash(seed) - 0.5) * 0.5;
  let px = 0;
  let py = 0;
  for (let i = 0; i < 4; i++) {
    const seg = part(new THREE.CylinderGeometry(0.32, 0.4, h / 4, 5), '#8a6a4a', [px, py + h / 8, 0], [0, 0, lean]);
    g.add(seg);
    px -= Math.sin(lean) * h / 4;
    py += Math.cos(lean) * h / 4;
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    const leaf = part(new THREE.ConeGeometry(0.5, 4.2, 4), i % 2 ? PAL.jungle : PAL.jungleDark, [px + Math.cos(a) * 1.6, py - 0.3, Math.sin(a) * 1.6], [0, 0, 0]);
    leaf.rotation.set(Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9);
    leaf.scale.set(1, 1, 0.3);
    g.add(leaf);
  }
  g.position.set(x, 3, z);
  return g;
}

function islandDecor(track, center) {
  const g = new THREE.Group();
  const ring = boundary(track, -(track.halfWidth + 9), 22);
  ring.forEach((p, i) => {
    const d = Math.hypot(p.x - center.x, p.z - center.z);
    if (d < 14) return;
    if (i % 2 === 0) g.add(palm(p.x, p.z, 6 + hash(i) * 4, i));
    else g.add(part(new THREE.DodecahedronGeometry(1.4 + hash(i) * 1.2, 0), PAL.rockLow, [p.x, 3.4, p.z], [hash(i) * 3, hash(i + 1) * 3, 0]));
  });
  return g;
}

// Paredão: anéis que saem da borda da pista e se abrem num círculo alto.
function cliffRing(track, center) {
  const base = boundary(track, track.halfWidth + 0.15, 4);
  const rings = [
    { off: 0, y: -2, toCircle: 0 },
    { off: 0.9, y: 2.2, toCircle: 0 },
    { off: 4, y: 7, toCircle: 0.1, jitter: 1.5 },
    { off: 12, y: 18, toCircle: 0.4, jitter: 4 },
    { off: 26, y: 31, toCircle: 0.8, jitter: 5 },
    { off: 40, y: 38, toCircle: 1, jitter: 6, radius: 175 },
    { off: 60, y: 30, toCircle: 1, jitter: 3, radius: 230 },
  ];
  const grid = rings.map((ring, ri) => base.map((p, i) => {
    let x = p.x + p.nx * ring.off;
    let z = p.z + p.nz * ring.off;
    if (ring.toCircle > 0) {
      const dx = p.x - center.x;
      const dz = p.z - center.z;
      const d = Math.hypot(dx, dz) || 1;
      const R = ring.radius ?? Math.max(d + ring.off, 130 + ri * 12);
      x += (center.x + (dx / d) * R - x) * ring.toCircle;
      z += (center.z + (dz / d) * R - z) * ring.toCircle;
    }
    const y = ring.y + (ring.jitter ? (hash(i * 7 + ri * 31) - 0.5) * 2 * ring.jitter : 0);
    return new THREE.Vector3(x, y, z);
  }));

  const pos = [];
  const col = [];
  const n = base.length;
  const faceColor = (y, ri, i) => {
    const noise = hash(i * 13 + ri * 7);
    if (ri === 1 && noise > 0.55) return new THREE.Color(PAL.jungle);
    if (ri >= 4 && noise > 0.35) return new THREE.Color(noise > 0.7 ? PAL.jungleDark : PAL.jungle);
    if (y < 4) return mixColor(PAL.rockLow, PAL.rock, (y + 2) / 6);
    return mixColor(PAL.rock, PAL.rockHigh, (y - 4) / 30 + noise * 0.25);
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let i = 0; i < n; i++) {
      const a = grid[ri][i];
      const b = grid[ri][(i + 1) % n];
      const c = grid[ri + 1][i];
      const d = grid[ri + 1][(i + 1) % n];
      for (const [p, q, r] of [[a, c, b], [b, c, d]]) {
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
        const fc = faceColor((p.y + q.y + r.y) / 3, ri, i + (p === b ? 0.5 : 0));
        for (let k = 0; k < 3; k++) col.push(fc.r, fc.g, fc.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, vertexColorMaterial);
  return { mesh, grid, n };
}

function stripeTexture(colors, speed) {
  const tex = canvasTexture(16, 64, (ctx, w, h) => {
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = colors[1 + (i % (colors.length - 1))];
      ctx.fillRect(Math.floor(hash(i + 3) * w), Math.floor(hash(i + 50) * h), 2 + Math.floor(hash(i) * 3), 8 + hash(i + 7) * 18);
    }
  }, { repeat: [2, 3] });
  tex.userData = { speed };
  return tex;
}

// Faixa que desce pelo paredão entre dois anéis: cachoeira ou lava.
function fallStrip(grid, i, fromRing, toRing, width, material) {
  const top = grid[toRing][i];
  const bottom = grid[fromRing][i];
  const side = grid[fromRing][(i + 1) % grid[fromRing].length].clone().sub(bottom).normalize().multiplyScalar(width / 2);
  const inward = new THREE.Vector3(bottom.x - top.x, 0, bottom.z - top.z).normalize().multiplyScalar(0.6);
  const pts = [
    bottom.clone().sub(side).add(inward), bottom.clone().add(side).add(inward),
    top.clone().sub(side).add(inward), top.clone().add(side).add(inward),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  const m = new THREE.Mesh(g, material);
  return { mesh: m, bottom };
}

function cascades(cliffs) {
  const group = new THREE.Group();
  const waterTex = stripeTexture(['#9ff3ea', '#ffffff', '#5fd6c8'], 1.6);
  const lavaTex = stripeTexture(['#ff6a1a', '#ffc23a', '#d63a12'], 0.5);
  const waterMat = new THREE.MeshBasicMaterial({ map: waterTex, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, side: THREE.DoubleSide, fog: false });
  const n = cliffs.n;
  const foams = [];
  for (let k = 0; k < 4; k++) {
    const i = Math.floor(((k + 0.15) / 4) * n);
    const f = fallStrip(cliffs.grid, i, 1, 4, 7, waterMat);
    group.add(f.mesh);
    const foam = part(new THREE.IcosahedronGeometry(1, 0), '#ffffff', [f.bottom.x, 0.5, f.bottom.z], [0, 0, 0], [4, 0.9, 3]);
    foams.push(foam);
    group.add(foam);
  }
  for (let k = 0; k < 5; k++) {
    const i = Math.floor(((k + 0.62) / 5) * n);
    group.add(fallStrip(cliffs.grid, i, 3, 5, 3.5 + (k % 2) * 2, lavaMat).mesh);
  }
  return {
    group,
    update(t) {
      waterTex.offset.y = t * waterTex.userData.speed;
      lavaTex.offset.y = t * lavaTex.userData.speed;
      foams.forEach((f, i) => {
        const s = 1 + Math.sin(t * 6 + i) * 0.12;
        f.scale.set(4 * s, 0.9, 3 * s);
      });
    },
  };
}

function finishLine(track) {
  const g = new THREE.Group();
  const p = pointAt(track, 0, 0);
  const heading = Math.atan2(p.tx, p.tz);
  const checker = canvasTexture(16, 4, (ctx, w, h) => {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#24142a' : '#fff4dc';
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const width = track.halfWidth * 2;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.6), new THREE.MeshBasicMaterial({ map: checker, transparent: true, opacity: 0.85 }));
  line.rotation.x = -Math.PI / 2;
  const lineHolder = new THREE.Group();
  lineHolder.add(line);
  lineHolder.position.set(p.x, 0.06, p.z);
  lineHolder.rotation.y = heading;
  g.add(lineHolder);

  const arch = new THREE.Group();
  for (const s of [-1, 1]) {
    arch.add(part(new THREE.BoxGeometry(1.2, 11, 1.2), PAL.plum, [s * (track.halfWidth + 0.8), 5, 0]));
    arch.add(part(new THREE.BoxGeometry(1.8, 0.6, 1.8), PAL.magma, [s * (track.halfWidth + 0.8), 11, 0]));
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(width + 3, 2.4, 0.5), [
    flat(PAL.plum), flat(PAL.plum), flat(PAL.plum), flat(PAL.plum),
    new THREE.MeshLambertMaterial({ map: checker }), new THREE.MeshLambertMaterial({ map: checker }),
  ]);
  banner.position.y = 9.6;
  arch.add(banner);
  arch.position.set(p.x, 0, p.z);
  arch.rotation.y = heading;
  g.add(arch);
  return g;
}

function chevronTexture(pointRight) {
  return canvasTexture(32, 16, (ctx, w, h) => {
    ctx.fillStyle = '#fff4dc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ff6a1a';
    for (let k = 0; k < 3; k++) {
      const x0 = 3 + k * 10;
      ctx.beginPath();
      if (pointRight) {
        ctx.moveTo(x0, 2); ctx.lineTo(x0 + 4, 2); ctx.lineTo(x0 + 9, 8); ctx.lineTo(x0 + 4, 14); ctx.lineTo(x0, 14); ctx.lineTo(x0 + 5, 8);
      } else {
        ctx.moveTo(x0 + 9, 2); ctx.lineTo(x0 + 5, 2); ctx.lineTo(x0, 8); ctx.lineTo(x0 + 5, 14); ctx.lineTo(x0 + 9, 14); ctx.lineTo(x0 + 4, 8);
      }
      ctx.closePath();
      ctx.fill();
    }
  }, { nearest: true });
}

// Placas de seta nas curvas fechadas, do lado de fora da curva.
function cornerSigns(track) {
  const g = new THREE.Group();
  const right = new THREE.MeshLambertMaterial({ map: chevronTexture(true), side: THREE.DoubleSide });
  const left = new THREE.MeshLambertMaterial({ map: chevronTexture(false), side: THREE.DoubleSide });
  let last = -Infinity;
  for (let s = 0; s < track.length; s += 4) {
    const p = pointAt(track, s, 0);
    if (Math.abs(p.turn) < 0.55 || s - last < 26) continue;
    last = s;
    const ahead = pointAt(track, s + 14, 0);
    const outsideSign = -Math.sign(ahead.turn);
    const spot = pointAt(track, s + 14, outsideSign * (track.halfWidth + 1.2));
    // direita do piloto = (-tz, tx)
    const nDotRight = ahead.nx * -ahead.tz + ahead.nz * ahead.tx;
    const turnsRight = Math.sign(ahead.turn) * nDotRight > 0;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), turnsRight ? right : left);
    board.position.set(spot.x, 3.2, spot.z);
    board.rotation.y = Math.atan2(-ahead.tx, -ahead.tz);
    g.add(board);
    g.add(part(new THREE.BoxGeometry(0.4, 3, 0.4), PAL.plum, [spot.x, 0.5, spot.z]));
  }
  return g;
}
