// Fim do Grand Prix: pódio dos 3 primeiros em cima da ilha xadrez do meio da
// piscina, o campeão levantando a taça, confete caindo e a câmera girando
// devagar em volta.
import * as THREE from 'three';
import { part, canvasTexture } from './lowpoly.js';
import { buildRacerModel, buildTrophy } from './models.js';

// Topo da ilha do meio (Quick Play), longe do mastro da linha de chegada (x = 0).
const CENTER = new THREE.Vector3(16, 1.2, 7.5);
const STEPS = [
  { x: 0, h: 3.2, top: '#ffc23a' }, // 1º, ouro
  { x: -4.6, h: 2.2, top: '#d7d0e4' }, // 2º, prata
  { x: 4.6, h: 1.5, top: '#d98a4a' }, // 3º, bronze
];
const CONFETTI_COLORS = ['#ff6a1a', '#ffc23a', '#19c3b4', '#3fa34d', '#fff4dc', '#9a7fd1'];
const CONFETTI = 140;
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Número do degrau, desenhado como as letras cromadas do HUD (simplificado).
function numberPlate(n) {
  const tex = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#3b2440';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '48px "Titan One", Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#24142a';
    ctx.strokeText(String(n), w / 2, h / 2 + 3);
    ctx.fillStyle = '#fff4dc';
    ctx.fillText(String(n), w / 2, h / 2 + 3);
  }, { nearest: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: tex }));
}

export class Podium {
  // table: classificação final (já em ordem), com { character }.
  constructor({ scene, camera, table }) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.copy(CENTER);
    scene.add(this.group);
    this.racers = [];

    table.slice(0, 3).forEach((row, i) => {
      const step = STEPS[i];
      const block = new THREE.Group();
      block.position.x = step.x;
      block.add(part(new THREE.BoxGeometry(4.2, step.h, 3.8), '#3b2440', [0, step.h / 2, 0]));
      block.add(part(new THREE.BoxGeometry(4.4, 0.3, 4), step.top, [0, step.h + 0.15, 0]));
      const plate = numberPlate(i + 1);
      plate.position.set(0, step.h / 2, 1.91);
      block.add(plate);
      this.group.add(block);

      const model = buildRacerModel(row.character, { cheer: i === 0 });
      model.scale.setScalar(1.25);
      model.position.set(step.x, step.h + 0.3, 0);
      model.userData.shadow = null;
      if (i === 0) {
        const trophy = buildTrophy();
        trophy.position.set(0, model.userData.handsTop - 0.2, 0.05);
        model.userData.tilt.add(trophy);
        this.trophy = trophy;
      }
      this.group.add(model);
      this.racers.push({ model, base: step.h + 0.3, winner: i === 0, phase: i * 1.3 });
    });

    // Confete: cubinhos coloridos caindo e girando, num InstancedMesh só.
    this.confetti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.04, 0.14), new THREE.MeshBasicMaterial(), CONFETTI);
    this.confetti.frustumCulled = false;
    this.bits = Array.from({ length: CONFETTI }, (_, i) => {
      this.confetti.setColorAt(i, new THREE.Color(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
      return this.spawn({}, true);
    });
    this.confetti.instanceColor.needsUpdate = true;
    this.group.add(this.confetti);
    this.dummy = new THREE.Object3D();
    this.angle = 0.35;
  }

  spawn(bit, anywhere = false) {
    return Object.assign(bit, {
      x: (Math.random() - 0.5) * 18,
      y: anywhere ? Math.random() * 14 : 12 + Math.random() * 4,
      z: (Math.random() - 0.5) * 12,
      vy: 2 + Math.random() * 2.5,
      sway: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 8,
    });
  }

  update(t, dt) {
    for (const r of this.racers) {
      // o campeão pula de alegria com a taça; os outros balançam
      const hop = r.winner && !REDUCED ? Math.abs(Math.sin(t * 3.4)) * 0.45 : Math.sin(t * 2 + r.phase) * 0.05;
      r.model.position.y = r.base + hop;
      r.model.userData.tilt.rotation.z = Math.sin(t * 1.7 + r.phase) * 0.06;
    }
    if (this.trophy && !REDUCED) this.trophy.rotation.y = Math.sin(t * 1.4) * 0.5;

    this.bits.forEach((b, i) => {
      b.y -= b.vy * dt;
      b.sway += dt * 2;
      if (b.y < -1) this.spawn(b);
      this.dummy.position.set(b.x + Math.sin(b.sway) * 0.6, b.y, b.z);
      this.dummy.rotation.set(t * b.spin, t * b.spin * 0.7, 0);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    });
    this.confetti.instanceMatrix.needsUpdate = true;

    // Câmera girando devagar; no celular em pé fica mais longe para caber.
    if (!REDUCED) this.angle += dt * 0.12;
    const portrait = this.camera.aspect < 1;
    const radius = portrait ? 26 : 18;
    // mira acima do pódio: ele desce no quadro e a taça não fica atrás do título
    // (no celular em pé mira abaixo, para o pódio subir e não ficar atrás do painel)
    const look = CENTER.clone().add(new THREE.Vector3(0, portrait ? -5 : 4.4, 0));
    this.camera.position.set(look.x + Math.sin(this.angle) * radius, look.y + (portrait ? 14 : 3), look.z + Math.cos(this.angle) * radius);
    // em tela larga o pódio fica à esquerda, deixando a direita para a classificação
    if (!portrait) {
      const right = new THREE.Vector3(Math.cos(this.angle), 0, -Math.sin(this.angle));
      look.addScaledVector(right, 4.2);
    }
    if (this.camera.fov !== 50) {
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(look);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
