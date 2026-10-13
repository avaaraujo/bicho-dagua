// A piscina de corrida dentro da cratera: água, muretas xadrez, baleia gigante
// ao fundo, paredões com cachoeiras e lava, céu de fim de tarde.
import * as THREE from 'three';
import { part, flat, canvasTexture, hash, mixColor, vertexColorMaterial } from './lowpoly.js';
import { pointAt, waterHeightAt } from '../../../shared/track.js';

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
  violet: '#9a7fd1',
  violetDark: '#6b4fa0',
  sand: '#e8c98f',
  plum: '#3b2440',
  cream: '#fff4dc',
};

const SCENERY_SCALE = 1.5; // acompanha a pista, que cresceu 50%

export function buildWorld(scene, track) {
  const animated = [];
  scene.background = new THREE.Color(PAL.skyMid);
  scene.fog = new THREE.Fog(PAL.fog, 180, 570);

  scene.add(new THREE.HemisphereLight(0xffe6f0, 0x2f8f8a, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.9);
  sun.position.set(40, 120, 60);
  scene.add(sun);

  scene.add(sky());

  const center = { x: 0, z: 0 };
  const water = waterPlane(center);
  scene.add(water.mesh);
  animated.push(water.update);

  // Cenário em volta da piscina, na mesma escala da pista.
  const scenery = new THREE.Group();
  scenery.scale.setScalar(SCENERY_SCALE);
  scene.add(scenery);

  // Baleia gigante atrás da pista, de frente para a câmera.
  const whale = whaleStatue();
  whale.scale.setScalar(1.7);
  whale.position.set(0, -1, -40);
  scenery.add(whale);
  const isles = islets();
  scenery.add(isles.group);

  const cliffs = cliffRing();
  scenery.add(cliffs.mesh);
  const falls = cascades(cliffs);
  scenery.add(falls.group);
  animated.push(falls.update);

  // O que depende da pista é refeito a cada corrida (no Grand Prix cada
  // corrida tem a pista desenhada por um jogador).
  const trackGroup = new THREE.Group();
  scene.add(trackGroup);
  let current = null;
  let spans = [];

  function setTrack(t) {
    if (t === current) return;
    current = t;
    for (const child of [...trackGroup.children]) {
      trackGroup.remove(child);
      child.traverse((o) => o.geometry?.dispose());
    }
    spans = [];
    if (t.crossings.length) {
      const bridges = bridgeTrack(t, water.material);
      trackGroup.add(bridges.group);
      spans = bridges.spans;
    } else {
      trackGroup.add(poolWalls(t));
    }
    trackGroup.add(finishLine(t));
    // Ilhotas em cima da pista somem; a baleia fica sempre atrás dela.
    isles.fit(t);
    whale.position.z = Math.min(-40, (t.bounds.minZ - 13) / SCENERY_SCALE);
  }
  setTrack(track);

  return {
    center,
    setTrack,
    // Ponte fica transparente quando tem barco no túnel embaixo dela.
    // boats: barcos com "total" (distância percorrida).
    updateBridges(boats, dt) {
      for (const span of spans) span.update(boats, dt);
    },
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
    material: mesh.material,
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

function checkerTexture(a, b, repeat) {
  return canvasTexture(2, 2, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 2, 2);
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(1, 1, 1, 1);
  }, { repeat: [repeat, repeat] });
}

// Bordas da piscina: a mureta de fora e a mureta do meio, com topo xadrez.
function poolWalls(track) {
  const top = new THREE.MeshLambertMaterial({ map: checkerTexture(PAL.violet, PAL.violetDark, 0.45) });
  const side = flat(PAL.plum);
  const toV2 = (pts) => pts.map((p) => new THREE.Vector2(p.x, -p.z));
  const extrude = (shape) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.8, 0);
    return new THREE.Mesh(g, [top, side]);
  };
  const outer = new THREE.Shape(toV2(boundary(track, track.halfWidth + 2.6, 1)));
  outer.holes.push(new THREE.Path(toV2(boundary(track, track.halfWidth + 0.1, 1))));
  const middle = new THREE.Shape(toV2(boundary(track, -(track.halfWidth + 0.1), 1)));
  const group = new THREE.Group();
  group.add(extrude(outer), extrude(middle));
  return group;
}

// Pista desenhada com cruzamentos: muretas dos dois lados, acompanhando a
// altura da água. Na passagem de cima a água sobe numa rampa (um aterro) e
// atravessa o canal de baixo numa ponte; o canal de baixo segue no chão,
// passando pelo túnel embaixo dela.
const WALL_TOP = 1.2; // mureta acima da água
const WALL_FOOT = -0.8; // até onde a mureta desce no chão
const DECK = 1.4; // espessura da ponte, abaixo da água
const STEP = 1; // metros entre as fatias das muretas

function bridgeTrack(track, waterMaterial) {
  const L = track.length;
  const hw = track.halfWidth;
  const top = new THREE.MeshLambertMaterial({ map: checkerTexture(PAL.violet, PAL.violetDark, 0.45), side: THREE.DoubleSide });
  const side = new THREE.MeshLambertMaterial({ color: PAL.plum, flatShading: true, side: THREE.DoubleSide });
  // mesma água da piscina (a textura animada é compartilhada), vista dos dois
  // lados porque o sentido dos triângulos depende do sentido do desenho
  const water = waterMaterial.clone();
  water.side = THREE.DoubleSide;
  const circ = (a, b) => {
    const d = Math.abs((((a - b) % L) + L) % L);
    return Math.min(d, L - d);
  };
  // em qual ponte está o ponto s (-1 = fora das pontes)
  const spanOf = (s) => track.crossings.findIndex((c) => circ(s, c.over) < c.core);
  const pieces = [-1, ...track.crossings.keys()].map(() => ({ top: [], topUv: [], side: [], water: [], waterUv: [] }));

  const quad = (list, a, b, c, d) => list.push(...a, ...b, ...c, ...a, ...c, ...d);
  // quad virado para cima (água): o sentido do desenho decide a ordem
  const quadUp = (list, a, b, c, d) => {
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (ny >= 0) quad(list, a, b, c, d);
    else quad(list, a, d, c, b);
    return ny >= 0 ? [a, b, c, a, c, d] : [a, d, c, a, c, b];
  };
  const at = (s, lateral, y) => {
    const p = pointAt(track, s, lateral);
    return [p.x, y, p.z];
  };
  const waterUv = (p) => [p[0] / 520 + 0.5, -p[2] / 520 + 0.5];

  const n = Math.ceil(L / STEP);
  for (let i = 0; i < n; i++) {
    const s0 = (i * L) / n;
    const s1 = ((i + 1) * L) / n;
    const piece = pieces[spanOf((s0 + s1) / 2) + 1];
    const stations = [s0, s1].map((s) => {
      const y = waterHeightAt(track, s);
      return { s, y, foot: spanOf(s) >= 0 ? y - DECK : WALL_FOOT };
    });
    const [A, B] = stations;
    for (const sign of [1, -1]) {
      const inA = (y) => at(A.s, sign * (hw + 0.1), y);
      const inB = (y) => at(B.s, sign * (hw + 0.1), y);
      const outA = (y) => at(A.s, sign * (hw + 2.6), y);
      const outB = (y) => at(B.s, sign * (hw + 2.6), y);
      const t = [inA(A.y + WALL_TOP), outA(A.y + WALL_TOP), outB(B.y + WALL_TOP), inB(B.y + WALL_TOP)];
      quad(piece.top, ...t);
      for (const p of t) piece.topUv.push(p[0], -p[2]);
      quad(piece.side, inA(A.y + WALL_TOP), inB(B.y + WALL_TOP), inB(B.y + WALL_FOOT), inA(A.y + WALL_FOOT));
      quad(piece.side, outA(A.y + WALL_TOP), outA(A.foot), outB(B.foot), outB(B.y + WALL_TOP));
    }
    // água elevada (rampa e ponte) e, na ponte, o fundo do tabuleiro
    if (A.y > 0.01 || B.y > 0.01) {
      const w = [at(A.s, hw + 0.1, A.y + 0.02), at(A.s, -(hw + 0.1), A.y + 0.02), at(B.s, -(hw + 0.1), B.y + 0.02), at(B.s, hw + 0.1, B.y + 0.02)];
      for (const p of quadUp(piece.water, ...w)) piece.waterUv.push(...waterUv(p));
      if (piece !== pieces[0]) {
        quad(piece.side, at(A.s, hw + 0.1, A.y - DECK), at(A.s, -(hw + 0.1), A.y - DECK), at(B.s, -(hw + 0.1), B.y - DECK), at(B.s, hw + 0.1, B.y - DECK));
      }
    }
  }
  // Paredes do aterro nas duas cabeceiras da ponte (a boca do túnel).
  for (const c of track.crossings) {
    for (const s of [c.over - c.core, c.over + c.core]) {
      const y = waterHeightAt(track, s);
      quad(pieces[0].side, at(s, hw + 2.6, y - DECK), at(s, -(hw + 2.6), y - DECK), at(s, -(hw + 2.6), WALL_FOOT), at(s, hw + 2.6, WALL_FOOT));
    }
  }

  const group = new THREE.Group();
  const build = (piece, mats) => {
    const g = new THREE.Group();
    const walls = new THREE.BufferGeometry();
    walls.setAttribute('position', new THREE.Float32BufferAttribute([...piece.top, ...piece.side], 3));
    // a textura xadrez só vale no topo; os lados são de cor chapada
    walls.setAttribute('uv', new THREE.Float32BufferAttribute([...expandUv(piece.topUv), ...new Array((piece.side.length / 3) * 2).fill(0)], 2));
    walls.addGroup(0, piece.top.length / 3, 0);
    walls.addGroup(piece.top.length / 3, piece.side.length / 3, 1);
    walls.computeVertexNormals();
    g.add(new THREE.Mesh(walls, [mats.top, mats.side]));
    if (piece.water.length) {
      const water = new THREE.BufferGeometry();
      water.setAttribute('position', new THREE.Float32BufferAttribute(piece.water, 3));
      water.setAttribute('uv', new THREE.Float32BufferAttribute(piece.waterUv, 2));
      // normal sempre para cima (o sentido dos triângulos depende do desenho),
      // senão a luz trata a água como vista por baixo e ela fica escura
      water.setAttribute('normal', new THREE.Float32BufferAttribute(piece.water.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.add(new THREE.Mesh(water, mats.water));
    }
    return g;
  };
  group.add(build(pieces[0], { top, side, water }));

  const spans = track.crossings.map((c, k) => {
    const mats = { top: top.clone(), side: side.clone(), water: water.clone() };
    const all = Object.values(mats);
    group.add(build(pieces[k + 1], mats));
    let opacity = 1;
    return {
      update(boats, dt) {
        const under = boats.some((b) => circ(b.total ?? 0, c.under) < c.core + 6);
        opacity += ((under ? 0.3 : 1) - opacity) * Math.min(1, dt * 8);
        for (const m of all) {
          m.opacity = opacity;
          m.transparent = opacity < 0.99;
          m.depthWrite = opacity >= 0.99;
        }
      },
    };
  });
  return { group, spans };
}

// UVs do topo: um par por vértice, na mesma ordem dos triângulos (quad → 6).
function expandUv(uv4) {
  const out = [];
  for (let i = 0; i < uv4.length; i += 8) {
    const q = [0, 1, 2, 3].map((k) => [uv4[i + k * 2], uv4[i + k * 2 + 1]]);
    for (const k of [0, 1, 2, 0, 2, 3]) out.push(...q[k]);
  }
  return out;
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

// Ilhotas com coqueiros e pedras entre a piscina e o paredão.
function islets() {
  const g = new THREE.Group();
  const spots = [[-62, -24], [64, -28], [-70, 16], [68, 12], [-34, -42], [36, -44]];
  const items = spots.map(([x, z], i) => {
    const isle = new THREE.Group();
    isle.position.set(x, 0, z);
    const r = 7 + hash(i) * 3;
    isle.add(part(new THREE.CylinderGeometry(5 + hash(i) * 3, r, 2.4, 7), PAL.sand));
    isle.add(part(new THREE.CylinderGeometry(3.5, 5, 1.2, 7), PAL.jungle, [0, 1.4, 0]));
    isle.add(palm(1, 0, 7 + hash(i + 3) * 4, i));
    isle.add(part(new THREE.DodecahedronGeometry(1.6, 0), PAL.rockLow, [-2.5, 2, 1.5], [hash(i) * 3, hash(i + 1) * 3, 0]));
    g.add(isle);
    return { isle, x: x * SCENERY_SCALE, z: z * SCENERY_SCALE, r: r * SCENERY_SCALE };
  });
  return {
    group: g,
    // esconde as ilhotas que ficariam em cima da pista (ou da mureta dela)
    fit(track) {
      const clear = track.halfWidth + 3.5;
      for (const it of items) {
        it.isle.visible = !track.samples.some((a, k) => k % 4 === 0 && Math.hypot(a.x - it.x, a.z - it.z) < it.r + clear);
      }
    },
  };
}

// Paredão da cratera: anéis em elipse ao redor da piscina, abrindo para cima.
function cliffRing(n = 64) {
  const RX = 92;
  const RZ = 66;
  const rings = [
    { s: 1, y: -2 }, { s: 1.04, y: 3 }, { s: 1.14, y: 10, j: 2 }, { s: 1.3, y: 21, j: 4 },
    { s: 1.55, y: 33, j: 5 }, { s: 1.9, y: 41, j: 6 }, { s: 2.5, y: 32, j: 3 },
  ];
  const grid = rings.map((ring, ri) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + (hash(i * 3 + ri) - 0.5) * 0.06;
    const y = ring.y + (ring.j ? (hash(i * 7 + ri * 31) - 0.5) * 2 * ring.j : 0);
    return new THREE.Vector3(Math.cos(a) * RX * ring.s * wob, y, Math.sin(a) * RZ * ring.s * wob);
  }));

  const pos = [];
  const col = [];
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
  return { mesh: new THREE.Mesh(g, vertexColorMaterial), grid, n };
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
  for (const frac of [0.6, 0.69, 0.81, 0.9]) {
    const i = Math.floor(frac * n);
    const f = fallStrip(cliffs.grid, i, 1, 4, 7, waterMat);
    group.add(f.mesh);
    const foam = part(new THREE.IcosahedronGeometry(1, 0), '#ffffff', [f.bottom.x, 0.5, f.bottom.z], [0, 0, 0], [4, 0.9, 3]);
    foams.push(foam);
    group.add(foam);
  }
  for (const [k, frac] of [0.55, 0.65, 0.73, 0.78, 0.86, 0.95].entries()) {
    const i = Math.floor(frac * n);
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

// Faixa xadrez na água e um mastro com bandeira na mureta do meio.
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
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(track.halfWidth * 2, 1.4),
    new THREE.MeshBasicMaterial({ map: checker, transparent: true, opacity: 0.9 }),
  );
  line.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(line);
  holder.position.set(p.x, 0.06, p.z);
  holder.rotation.y = heading;
  g.add(holder);

  const inner = pointAt(track, 0, -(track.halfWidth + 1.2));
  g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 7, 6), PAL.cream, [inner.x, 4.5, inner.z]));
  const flag = part(new THREE.BoxGeometry(0.15, 1.8, 2.8), PAL.magma, [inner.x, 7, inner.z - 1.4]);
  g.add(flag);
  g.add(part(new THREE.OctahedronGeometry(0.7, 0), PAL.magmaHot, [inner.x, 8.3, inner.z]));
  return g;
}
