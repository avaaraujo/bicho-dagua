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
    // folga extra para o HUD nos cantos
    const dist = Math.max(halfW / tanH, (halfD * Math.sin(pitch)) / tanV) * (portrait ? 1.2 : 1.28);
    const up = Math.sin(pitch) * dist;
    const back = Math.cos(pitch) * dist;
    // mira um pouco "atrás" do centro: a pista desce na tela e sobra lugar para o HUD de cima
    const lead = dist * 0.06;
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

function clamp(v, lo, hi) {
  if (lo > hi) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, v));
}
