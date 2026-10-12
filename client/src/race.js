// Uma corrida no navegador: física do meu jet-ski, interpolação dos outros,
// câmera, efeitos e HUD.
import * as THREE from 'three';
import {
  createBoat, stepBoat, collideBoats, isWrongWay, hasFinished, forwardSpeed, MAX_SPEED,
} from '../../shared/physics.js';
import { createBrain, botInput } from '../../shared/bot.js';
import { PHYSICS_DT, TICK_RATE } from '../../shared/constants.js';
import { buildRacerModel } from './scene/models.js';
import { RaceCamera } from './camera.js';

const INTERP_DELAY = 120; // ms atrás do servidor, para suavizar os outros

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '800 34px Nunito, sans-serif';
  const w = Math.min(240, ctx.measureText(text).width + 36);
  ctx.fillStyle = 'rgba(36, 20, 42, 0.85)';
  ctx.beginPath();
  // roundRect não existe no Safari antigo (iOS < 16): sem ele, um retângulo simples
  if (ctx.roundRect) ctx.roundRect((256 - w) / 2, 10, w, 44, 10);
  else ctx.rect((256 - w) / 2, 10, w, 44);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect((256 - w) / 2 + 10, 26, 10, 12);
  ctx.fillStyle = '#fff4dc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128 + 8, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(5, 1.25, 1);
  sprite.position.y = 3.6;
  sprite.renderOrder = 10;
  return sprite;
}

// Atualiza o modelo 3D a partir de um estado de barco.
export function poseModel(model, b, t, phase = 0) {
  model.position.set(b.x, 0.12 + Math.sin(t * 3.2 + phase) * 0.07, b.z);
  model.rotation.y = b.h;
  const { tilt } = model.userData;
  tilt.rotation.z = -(b.lean || 0) * 0.9;
  tilt.rotation.x = -0.04 - Math.min(0.12, Math.abs(forwardSpeed(b)) * 0.004) + Math.sin(t * 2.6 + phase) * 0.02;
}

export class Race {
  constructor(opts) {
    Object.assign(this, opts); // scene, camera, track, net, myId, start, hud, input, audio, spray, onFinishedLocal
    this.entries = new Map();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.laps = this.start.laps;
    this.countdownEnd = performance.now() + this.start.countdownMs;
    this.lastCount = null;
    this.racing = false;
    this.ended = false;
    this.finishedLocal = false;
    this.acc = 0;
    this.sendAcc = 0;
    this.serverOffset = null;
    this.timeLeft = this.start.timeLimit;
    this.wrongWayTime = 0;
    this.shake = 0;
    this.lastLap = 0;
    this.myPlace = null;
    this.cameraMode = 'overview'; // câmera de trás só depois de cruzar a chegada
    this.raceCamera = new RaceCamera(this.camera, this.track);

    this.start.racers.forEach((r, i) => {
      const model = buildRacerModel(r.character);
      const isMe = r.id === this.myId;
      model.scale.setScalar(1.25);
      model.add(nameTag(isMe ? 'Você' : r.name, model.userData.color ?? '#fff4dc'));
      if (isMe) {
        this.marker = new THREE.Mesh(
          new THREE.ConeGeometry(0.7, 1.4, 4),
          new THREE.MeshBasicMaterial({ color: 0xffc23a, fog: false }),
        );
        this.marker.rotation.x = Math.PI;
        model.add(this.marker);
      }
      this.group.add(model);
      const display = createBoat(r);
      this.entries.set(r.id, { info: r, model, display, buffer: [], phase: i * 1.7, isMe, place: i + 1 });
    });
    this.me = this.entries.get(this.myId) ?? null;
    this.myBoat = this.me ? this.me.display : null;
    this.brain = createBrain(7);
    this.hud.reset();
    this.hud.show(true);
    this.hud.lap(1, this.laps);
    this.hud.time(this.timeLeft);
    if (this.myBoat) this.placeCamera(true);
  }

  onSnap(snap) {
    const off = snap.t - Date.now();
    this.serverOffset = this.serverOffset === null ? off : this.serverOffset + (off - this.serverOffset) * 0.1;
    this.timeLeft = snap.timeLeft;
    for (const r of snap.racers) {
      const e = this.entries.get(r.id);
      if (!e) continue;
      e.place = r.place;
      e.finished = r.finished;
      if (e.isMe) {
        this.myPlace = r.place;
        // O servidor recusou minha posição (salto grande): volta para a dele.
        const b = this.myBoat;
        e.finished = r.finished;
        if (this.racing && Math.hypot(b.x - r.x, b.z - r.z) > 18) {
          Object.assign(b, { x: r.x, z: r.z, h: r.h, vx: r.vx, vz: r.vz, total: r.total, s: null });
        }
        continue;
      }
      e.display.total = r.total;
      e.buffer.push({ t: snap.t, x: r.x, z: r.z, h: r.h, vx: r.vx, vz: r.vz, lean: r.lean, total: r.total });
      if (e.buffer.length > 40) e.buffer.shift();
    }
  }

  interpolate(e) {
    const buf = e.buffer;
    if (!buf.length) return;
    const renderT = Date.now() + (this.serverOffset ?? 0) - INTERP_DELAY;
    let a = buf[0];
    let b = buf[buf.length - 1];
    for (let i = buf.length - 1; i > 0; i--) {
      if (buf[i - 1].t <= renderT) {
        a = buf[i - 1];
        b = buf[i];
        break;
      }
    }
    const d = e.display;
    if (renderT >= b.t) {
      // sem dado novo: extrapola um pouquinho com a velocidade
      const ex = Math.min(0.25, (renderT - b.t) / 1000);
      Object.assign(d, { x: b.x + b.vx * ex, z: b.z + b.vz * ex, h: b.h, vx: b.vx, vz: b.vz, lean: b.lean });
      return;
    }
    const t = b.t === a.t ? 1 : Math.max(0, Math.min(1, (renderT - a.t) / (b.t - a.t)));
    d.x = a.x + (b.x - a.x) * t;
    d.z = a.z + (b.z - a.z) * t;
    d.h = lerpAngle(a.h, b.h, t);
    d.vx = a.vx + (b.vx - a.vx) * t;
    d.vz = a.vz + (b.vz - a.vz) * t;
    d.lean = a.lean + (b.lean - a.lean) * t;
  }

  countdown(now) {
    const left = this.countdownEnd - now;
    if (left > 0) {
      const n = Math.ceil(left / 1000);
      if (n !== this.lastCount && n <= 3) {
        this.lastCount = n;
        this.hud.banner(String(n), 0.9, 'count');
        this.audio.beep(false);
      }
      return false;
    }
    if (!this.racing) {
      this.racing = true;
      this.hud.banner('VAI!', 1, 'go');
      this.audio.beep(true);
    }
    return true;
  }

  update(dt, t, now) {
    const go = this.countdown(now);
    const b = this.myBoat;

    if (b) {
      this.acc += Math.min(dt, 0.1);
      while (this.acc >= PHYSICS_DT) {
        this.acc -= PHYSICS_DT;
        let input = { steer: 0, throttle: 0 };
        if (go && (this.finishedLocal || this.autopilot)) input = botInput(b, this.brain, this.track, PHYSICS_DT).input;
        else if (go && !this.ended) input = this.input.read();
        const before = b.bump;
        if (go || this.finishedLocal) stepBoat(b, input, PHYSICS_DT, this.track);
        for (const e of this.entries.values()) if (!e.isMe) collideBoats(b, e.display, true);
        if (b.bump > before + 0.15) {
          this.audio.bump(b.bump);
          this.spray.splash(b.x + Math.sin(b.h) * 1.5, b.z + Math.cos(b.h) * 1.5, b.bump);
          this.shake = Math.max(this.shake, b.bump * 0.6);
        }
      }

      if (go && !this.ended) {
        this.sendAcc += dt;
        if (this.sendAcc >= 1 / TICK_RATE) {
          this.sendAcc = 0;
          this.net.emit('race:state', { x: b.x, z: b.z, h: b.h, vx: b.vx, vz: b.vz, lean: b.lean });
        }
        this.trackLaps(b, dt);
      }
      this.audio.engine(go && !this.ended ? Math.min(1, Math.abs(forwardSpeed(b)) / MAX_SPEED) : 0);
    }

    for (const e of this.entries.values()) {
      if (!e.isMe) this.interpolate(e);
      poseModel(e.model, e.display, t, e.phase);
      const sp = Math.abs(forwardSpeed(e.display));
      if (sp > 4) this.spray.trail(e.display, sp, dt);
    }

    if (b) {
      this.placeCamera(false, dt);
      this.hud.place(this.myPlace);
      if (this.marker) {
        this.marker.visible = this.cameraMode === 'overview' && !this.finishedLocal;
        this.marker.position.y = 5.2 + Math.sin(t * 5) * 0.3;
      }
    } else {
      this.raceCamera.update(this.framePoints(), dt);
    }
    this.boardAcc = (this.boardAcc ?? 0) + dt;
    if (this.boardAcc > 0.25) {
      this.boardAcc = 0;
      this.hud.board([...this.entries.values()].map((e) => ({
        name: e.isMe ? 'Você' : e.info.name,
        character: e.info.character,
        place: e.place,
        lap: Math.max(1, Math.min(this.laps, Math.floor((e.display.total ?? 0) / this.track.length) + 1)),
        finished: !!e.finished,
        isMe: e.isMe,
      })), this.laps);
    }
    this.hud.time(this.timeLeft);
    this.hud.update(dt);
  }

  trackLaps(b, dt) {
    const lapIdx = Math.floor(b.total / this.track.length); // voltas completas
    if (lapIdx > this.lastLap && !this.finishedLocal) {
      this.lastLap = lapIdx;
      if (hasFinished(b, this.track)) {
        this.finishedLocal = true;
        this.hud.banner('CHEGOU!', 2.5, 'go');
        this.setCameraMode('chase');
        this.audio.fanfare(this.myPlace === 1);
        this.onFinishedLocal?.();
      } else if (lapIdx === this.laps - 1) {
        this.hud.banner('VOLTA FINAL!', 1.6, 'final');
        this.audio.lap(true);
      } else {
        this.audio.lap(false);
      }
    }
    this.hud.lap(Math.max(1, Math.min(this.laps, lapIdx + 1)), this.laps);

    if (this.finishedLocal) return;
    const wrong = isWrongWay(b, this.track) && Math.abs(forwardSpeed(b)) > 2;
    this.wrongWayTime = wrong ? this.wrongWayTime + dt : 0;
    if (this.wrongWayTime > 0.7 && !this.showingWrongWay) {
      this.showingWrongWay = true;
      this.hud.banner('CONTRAMÃO!', 0, 'warn');
    } else if (!wrong && this.showingWrongWay) {
      this.showingWrongWay = false;
      this.hud.banner('', 0);
    }
  }

  // Quem a câmera de cima precisa mostrar: todo mundo que ainda está correndo.
  framePoints() {
    const pts = [];
    for (const e of this.entries.values()) {
      if (e.isMe ? this.finishedLocal : e.finished) continue;
      pts.push(e.display);
    }
    return pts;
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    if (this.myBoat) this.placeCamera(true);
  }

  placeCamera(snap, dt = 0) {
    this.shake = Math.max(0, this.shake - dt * 2);
    if (this.cameraMode === 'overview') {
      this.raceCamera.update(this.framePoints(), dt, snap, this.shake);
      return;
    }
    if (this.camera.fov !== (this.camera.aspect < 1 ? 82 : 65)) {
      this.camera.fov = this.camera.aspect < 1 ? 82 : 65;
      this.camera.updateProjectionMatrix();
    }
    const b = this.myBoat;
    const fx = Math.sin(b.h);
    const fz = Math.cos(b.h);
    const portrait = this.camera.aspect < 1;
    const back = portrait ? 11 : 9;
    const up = portrait ? 5.2 : 4.4;
    const target = new THREE.Vector3(b.x - fx * back, up, b.z - fz * back);
    if (snap) this.camera.position.copy(target);
    else this.camera.position.lerp(target, 1 - Math.exp(-dt * 5));
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.camera.lookAt(b.x + fx * 8 + sx, 1.3 + sy, b.z + fz * 8);
  }

  end() {
    this.ended = true;
    this.audio.stopEngine();
  }

  dispose() {
    this.scene.remove(this.group);
    this.hud.show(false);
    this.audio.stopEngine();
  }
}

// Bots rodando sozinhos atrás dos menus, com a câmera passeando.
export class Showcase {
  constructor({ scene, camera, track, spray, center }) {
    Object.assign(this, { scene, camera, track, spray, center });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.racers = ['morsa', 'garca', 'sapo', 'cabra'].map((ch, i) => {
      const model = buildRacerModel(ch);
      model.scale.setScalar(1.25);
      this.group.add(model);
      const boat = createBoat({ x: 0, z: 0, h: 0, total: 0 });
      const p = this.track.samples[(i * 37) % this.track.samples.length];
      Object.assign(boat, { x: p.x, z: p.z, h: Math.atan2(p.tx, p.tz), total: p.s, s: null });
      return { model, boat, brain: createBrain(100 + i), phase: i };
    });
    this.acc = 0;
    this.raceCamera = new RaceCamera(camera, track);
  }

  update(dt, t) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= PHYSICS_DT) {
      this.acc -= PHYSICS_DT;
      for (const r of this.racers) {
        const { input, speedMul } = botInput(r.boat, r.brain, this.track, PHYSICS_DT, undefined, this.racers.map((x) => x.boat));
        stepBoat(r.boat, input, PHYSICS_DT, this.track, speedMul * 0.85);
      }
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) collideBoats(this.racers[i].boat, this.racers[j].boat);
    }
    for (const r of this.racers) {
      poseModel(r.model, r.boat, t, r.phase);
      const sp = Math.abs(forwardSpeed(r.boat));
      if (sp > 4) this.spray.trail(r.boat, sp, dt);
    }
    this.raceCamera.update(this.racers.map((r) => r.boat), dt);
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
