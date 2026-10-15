// Câmera da corrida, como no minigame original: ângulo fixo no alto, mas o
// enquadramento segue os pilotos. Juntos num canto → zoom neles; espalhados
// pela piscina → mostra a pista inteira. Nunca afasta além da pista inteira
// nem chega mais perto que um zoom mínimo.
// No celular em pé a câmera gira 90° para a pista comprida caber na tela.

const MARGIN = 9; // metros de folga em volta dos barcos
const MIN_HALF = { w: 21, d: 13 }; // menor área mostrada (metade da largura/profundidade)

export class RaceCamera {
  constructor(camera, track) {
    this.camera = camera;
    this.track = track;
    this.state = null; // { cx, cz, hw, hd } suavizados
  }

  get portrait() {
    return this.camera.aspect < 1;
  }

  // Caixa (no chão) que precisa aparecer: os barcos com folga, sem passar da pista.
  focusBox(points) {
    const b = this.track.bounds;
    if (!points.length) return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, hw: (b.maxX - b.minX) / 2, hd: (b.maxZ - b.minZ) / 2 };
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    // eixos "da tela": no celular em pé o x da tela é o z do mundo
    const minHW = this.portrait ? MIN_HALF.d : MIN_HALF.w;
    const minHD = this.portrait ? MIN_HALF.w : MIN_HALF.d;
    let hw = Math.max((maxX - minX) / 2 + MARGIN, minHW);
    let hd = Math.max((maxZ - minZ) / 2 + MARGIN, minHD);
    hw = Math.min(hw, (b.maxX - b.minX) / 2);
    hd = Math.min(hd, (b.maxZ - b.minZ) / 2);
    // o centro anda só até onde a caixa ainda cabe dentro da pista
    const cx = clamp((minX + maxX) / 2, b.minX + hw, b.maxX - hw);
    const cz = clamp((minZ + maxZ) / 2, b.minZ + hd, b.maxZ - hd);
    return { cx, cz, hw, hd };
  }

  // points: posições dos pilotos ainda correndo. snap = sem suavizar.
  update(points, dt, snap = false, shake = 0) {
    const goal = this.focusBox(points);
    if (!this.state || snap) this.state = { ...goal };
    else {
      const s = this.state;
      const k = 1 - Math.exp(-dt * 3);
      s.cx += (goal.cx - s.cx) * k;
      s.cz += (goal.cz - s.cz) * k;
      // afasta rápido (ninguém some da tela), aproxima devagar
      const kw = 1 - Math.exp(-dt * (goal.hw > s.hw ? 5 : 1.2));
      const kd = 1 - Math.exp(-dt * (goal.hd > s.hd ? 5 : 1.2));
      s.hw += (goal.hw - s.hw) * kw;
      s.hd += (goal.hd - s.hd) * kd;
    }
    this.apply(this.state, shake);
  }

  apply({ cx, cz, hw, hd }, shake = 0) {
    const camera = this.camera;
    const portrait = this.portrait;
    const fov = portrait ? 50 : 38;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const pitch = (portrait ? 56 : 44) * (Math.PI / 180);
    const tanV = Math.tan((fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    // tamanho na tela: largura (eixo horizontal da tela) e profundidade
    const halfW = portrait ? hd : hw;
    const halfD = portrait ? hw : hd;
    // zona morta: o enquadramento cabe só na parte da tela que o HUD e os
    // botões não cobrem, e a projeção desloca esse retângulo para o centro
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ins = safeInsets(W, H, portrait);
    const fracW = Math.max(0.5, (W - ins.l - ins.r) / W);
    const fracH = Math.max(0.5, (H - ins.t - ins.b) / H);
    const dist = Math.max(halfW / (tanH * fracW), (halfD * Math.sin(pitch)) / (tanV * fracH)) * 1.08;
    const up = Math.sin(pitch) * dist;
    const back = Math.cos(pitch) * dist;
    const offX = Math.round((ins.l - ins.r) / 2);
    const offY = Math.round((ins.t - ins.b) / 2);
    if (offX || offY) camera.setViewOffset(W, H, -offX, -offY, W, H);
    else camera.clearViewOffset();
    const lead = 0;
    const sx = (Math.random() - 0.5) * shake;
    if (portrait) {
      camera.position.set(cx - lead + back, up, cz + sx);
      camera.lookAt(cx - lead, 0, cz);
    } else {
      camera.position.set(cx + sx, up, cz - lead + back);
      camera.lookAt(cx, 0, cz - lead);
    }
  }
}

// Pixels da tela cobertos pelo HUD/botões (t=topo, b=base, l/r=lados).
function safeInsets(W, H, portrait) {
  const touch = document.body.classList.contains('is-touch');
  if (!touch) return { t: 80, b: 24, l: 0, r: 0 };
  if (portrait) return { t: Math.min(170, H * 0.24), b: Math.min(250, H * 0.3), l: 0, r: 0 };
  return { t: 64, b: Math.min(110, H * 0.28), l: 0, r: 0 };
}

function clamp(v, lo, hi) {
  if (lo > hi) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}
