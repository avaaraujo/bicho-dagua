// Jet-skis e pilotos, montados com poucas formas. Frente do modelo = +z.
import * as THREE from 'three';
import { part } from './lowpoly.js';
import { CHARACTERS } from '../../../shared/constants.js';

const ICO0 = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const CONE5 = new THREE.ConeGeometry(1, 1, 5);
const EYE = 0x24142a;
const CREAM = 0xfff4dc;

function hullGeometry() {
  const g = new THREE.BoxGeometry(1.35, 0.55, 3.2, 1, 1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const y = p.getY(i);
    if (z > 1) {
      p.setX(i, p.getX(i) * 0.22);
      p.setY(i, y + (y > 0 ? 0.05 : 0.25));
    } else if (z < -1) {
      p.setX(i, p.getX(i) * 0.92);
    }
  }
  g.computeVertexNormals();
  return g;
}
const HULL = hullGeometry();

function jetSki(color) {
  const g = new THREE.Group();
  g.add(part(HULL, 0xf4efe6, [0, 0.2, 0], [0, 0, 0], [1, 0.75, 1]));
  g.add(part(HULL, color, [0, 0.55, 0.05], [0, 0, 0], [0.92, 0.55, 0.95]));
  g.add(part(BOX, 0x3b2440, [0, 0.86, -0.45], [0, 0, 0], [0.62, 0.22, 1.25])); // banco
  g.add(part(BOX, 0x3b2440, [0, 1.02, 0.62], [-0.5, 0, 0], [0.5, 0.35, 0.25])); // painel
  g.add(part(BOX, 0x2a2a33, [0, 1.25, 0.6], [0, 0, 0], [1.05, 0.08, 0.08])); // guidão
  g.add(part(BOX, color, [0, 0.5, -1.55], [0, 0, 0], [0.9, 0.18, 0.14])); // traseira
  return g;
}

// Braços que saem dos ombros até o guidão, ou (pose "cheer", no pódio) para o
// alto, com as mãos acima da cabeça em "top", segurando a taça.
let pose = 'ride';
function arms(g, color, shoulderY, shoulderX = 0.45, shoulderZ = 0.1, top = 2.8) {
  g.userData.handsTop = top;
  for (const side of [-1, 1]) {
    const from = new THREE.Vector3(side * shoulderX, shoulderY, shoulderZ);
    const to = pose === 'cheer' ? new THREE.Vector3(side * 0.42, top, 0.05) : new THREE.Vector3(side * 0.5, 1.25, 0.6);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    const arm = part(CYL6, color, mid.toArray(), [0, 0, 0], [0.11, len, 0.11]);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    g.add(arm);
  }
}

function eyes(g, y, z, spread, size = 0.07) {
  for (const s of [-1, 1]) g.add(part(ICO0, EYE, [s * spread, y, z], [0, 0, 0], [size, size, size]));
}

const RIDERS = {
  morsa(color) {
    const g = new THREE.Group();
    g.add(part(ICO1, 0x8a5a3c, [0, 1.45, -0.35], [0, 0, 0], [0.62, 0.68, 0.55]));
    g.add(part(ICO1, color, [0, 1.38, -0.32], [0, 0, 0], [0.66, 0.42, 0.6])); // jaqueta
    g.add(part(ICO1, 0x8a5a3c, [0, 2.1, -0.15], [0, 0, 0], [0.45, 0.4, 0.42]));
    g.add(part(ICO0, 0xb07a55, [-0.13, 1.98, 0.2], [0, 0, 0], [0.17, 0.14, 0.14]));
    g.add(part(ICO0, 0xb07a55, [0.13, 1.98, 0.2], [0, 0, 0], [0.17, 0.14, 0.14]));
    for (const s of [-1, 1]) g.add(part(CONE5, CREAM, [s * 0.12, 1.72, 0.24], [Math.PI, 0, 0], [0.06, 0.38, 0.06]));
    eyes(g, 2.22, 0.18, 0.15);
    arms(g, color, 1.6, 0.5, -0.2, 2.75);
    return g;
  },
  garca(color) {
    const g = new THREE.Group();
    g.add(part(ICO1, 0x8e9bb5, [0, 1.3, -0.4], [0.3, 0, 0], [0.42, 0.45, 0.62]));
    g.add(part(ICO1, color, [0, 1.15, -0.42], [0, 0, 0], [0.46, 0.22, 0.5])); // colete
    g.add(part(CYL6, 0xa9b4c9, [0, 1.95, -0.25], [0.2, 0, 0], [0.09, 1.1, 0.09])); // pescoço
    g.add(part(ICO0, 0xa9b4c9, [0, 2.55, -0.1], [0, 0, 0], [0.24, 0.22, 0.28]));
    g.add(part(CONE5, 0xf2c230, [0, 2.52, 0.38], [Math.PI / 2, 0, 0], [0.08, 0.7, 0.08])); // bico
    g.add(part(CONE5, 0x24142a, [0, 2.7, -0.38], [-1.9, 0, 0], [0.04, 0.45, 0.04])); // penacho
    eyes(g, 2.62, 0.1, 0.13, 0.05);
    arms(g, 0x8e9bb5, 1.45, 0.38, -0.2, 3.15);
    return g;
  },
  sapo(color) {
    const g = new THREE.Group();
    g.add(part(ICO1, 0x5fae3a, [0, 1.35, -0.3], [0, 0, 0], [0.7, 0.55, 0.62]));
    g.add(part(ICO1, color, [0, 1.2, -0.3], [0, 0, 0], [0.74, 0.3, 0.66])); // colete
    g.add(part(ICO1, 0x5fae3a, [0, 1.9, -0.1], [0, 0, 0], [0.55, 0.38, 0.5]));
    g.add(part(ICO0, 0xd8e8a0, [0, 1.78, 0.2], [0, 0, 0], [0.42, 0.16, 0.3])); // papo
    for (const s of [-1, 1]) {
      g.add(part(ICO1, 0xfff4dc, [s * 0.24, 2.25, 0.05], [0, 0, 0], [0.19, 0.19, 0.19]));
      g.add(part(ICO0, EYE, [s * 0.24, 2.27, 0.2], [0, 0, 0], [0.08, 0.08, 0.08]));
      const ring = part(new THREE.TorusGeometry(0.22, 0.05, 4, 8), 0xf2c230, [s * 0.24, 2.25, 0.12]);
      g.add(ring);
    }
    g.add(part(BOX, 0xf2c230, [0, 2.25, 0.12], [0, 0, 0], [0.1, 0.05, 0.05]));
    arms(g, 0x5fae3a, 1.55, 0.55, -0.15, 2.75);
    return g;
  },
  cabra(color) {
    const g = new THREE.Group();
    g.add(part(ICO1, 0xd9c6a5, [0, 1.35, -0.35], [0, 0, 0], [0.5, 0.58, 0.55]));
    g.add(part(ICO1, color, [0, 1.25, -0.33], [0, 0, 0], [0.54, 0.3, 0.58])); // colete
    g.add(part(ICO1, 0xd9c6a5, [0, 2.05, -0.05], [0.35, 0, 0], [0.3, 0.32, 0.42]));
    g.add(part(ICO0, 0xc4ad88, [0, 1.95, 0.3], [0, 0, 0], [0.18, 0.15, 0.18])); // focinho
    g.add(part(CONE5, CREAM, [0, 1.72, 0.3], [Math.PI, 0, 0], [0.07, 0.25, 0.07])); // barba
    for (const s of [-1, 1]) {
      g.add(part(CONE5, 0x8b7f73, [s * 0.14, 2.4, -0.2], [-0.7, 0, s * 0.25], [0.07, 0.42, 0.07])); // chifres
      g.add(part(CONE5, 0xd9c6a5, [s * 0.32, 2.12, -0.1], [0, 0, s * 1.8], [0.08, 0.28, 0.06])); // orelhas
    }
    eyes(g, 2.15, 0.2, 0.15, 0.06);
    arms(g, 0xd9c6a5, 1.55, 0.45, -0.2, 2.95);
    return g;
  },
};

export function characterInfo(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

// Barco completo: grupo externo (posição/direção) > balanço > jet-ski + piloto.
// opts.cheer: braços para o alto (pódio); userData.handsTop = altura das mãos.
export function buildRacerModel(characterId, opts = {}) {
  const info = characterInfo(characterId);
  const color = new THREE.Color(info.color).getHex();
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  tilt.add(jetSki(color));
  pose = opts.cheer ? 'cheer' : 'ride';
  const rider = RIDERS[info.id](color);
  pose = 'ride';
  tilt.add(rider);
  // sombra falsa: um disco escuro na água
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 8),
    new THREE.MeshBasicMaterial({ color: 0x0b4f56, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  shadow.scale.set(0.8, 1.5, 1);
  root.add(shadow);
  root.userData = { tilt, rider, color: info.color, handsTop: rider.userData.handsTop };
  return root;
}

// Taça do Grand Prix: base, haste, copa e duas alças, em ouro chapado.
export function buildTrophy() {
  const gold = 0xffc23a;
  const g = new THREE.Group();
  g.add(part(CYL6, 0x3b2440, [0, 0.08, 0], [0, 0, 0], [0.42, 0.16, 0.42])); // base
  g.add(part(CYL6, gold, [0, 0.2, 0], [0, 0, 0], [0.3, 0.1, 0.3]));
  g.add(part(CYL6, gold, [0, 0.42, 0], [0, 0, 0], [0.08, 0.36, 0.08])); // haste
  g.add(part(new THREE.CylinderGeometry(0.55, 0.22, 0.75, 7), gold, [0, 0.95, 0]));
  g.add(part(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 7), 0xffe08a, [0, 1.33, 0])); // borda
  for (const s of [-1, 1]) {
    const handle = part(new THREE.TorusGeometry(0.22, 0.06, 4, 8, Math.PI), gold, [s * 0.5, 1.0, 0], [0, 0, s * -Math.PI / 2]);
    g.add(handle);
  }
  return g;
}
