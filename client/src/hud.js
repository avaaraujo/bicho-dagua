// HUD da corrida: volta, colocação, tempo, radar e avisos no centro.
import { characterInfo } from './scene/models.js';

const $ = (id) => document.getElementById(id);

export function createHud(track) {
  const el = {
    root: $('hud'),
    lap: $('hud-lap'),
    lapLabel: $('hud-lap-label'),
    place: $('hud-place'),
    time: $('hud-time'),
    banner: $('hud-banner'),
    radar: $('hud-radar'),
  };
  const ctx = el.radar.getContext('2d');
  let bannerTimer = 0;
  let bannerSticky = false;
  let last = { lap: '', place: '', time: '' };

  function setText(node, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  return {
    show(on) {
      el.root.hidden = !on;
    },
    reset() {
      last = { lap: '', place: '', time: '' };
      this.banner('', 0);
    },
    lap(n, total) {
      setText(el.lap, 'lap', `${Math.min(n, total)}/${total}`);
    },
    place(p) {
      setText(el.place, 'place', p ? `${p}º` : '');
    },
    time(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(el.time, 'time', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      el.time.classList.toggle('is-low', s <= 20);
    },
    // texto grande no centro; duração 0 = fica até ser trocado
    banner(text, duration = 1.4, tone = '') {
      el.banner.textContent = text;
      el.banner.dataset.tone = tone;
      el.banner.classList.toggle('is-on', !!text);
      if (text) {
        el.banner.classList.remove('pop');
        void el.banner.offsetWidth;
        el.banner.classList.add('pop');
      }
      bannerTimer = duration;
      bannerSticky = duration === 0;
    },
    update(dt) {
      if (!bannerSticky && bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) el.banner.classList.remove('is-on');
      }
    },
    // radar girando com o piloto: a frente fica para cima
    radar(me, racers) {
      const w = el.radar.width;
      const r = w / 2;
      const scale = r / 85; // metros visíveis no raio
      ctx.clearRect(0, 0, w, w);
      ctx.save();
      ctx.beginPath();
      ctx.arc(r, r, r - 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 52, 58, 0.82)';
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = 'rgba(126, 232, 216, 0.28)';
      ctx.lineWidth = 2;
      for (const k of [0.33, 0.66]) {
        ctx.beginPath();
        ctx.arc(r, r, r * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.lineTo(r, w);
      ctx.moveTo(0, r); ctx.lineTo(w, r);
      ctx.stroke();

      // mundo → radar: centraliza em mim e gira pela minha direção
      const cos = Math.cos(me.h);
      const sin = Math.sin(me.h);
      const toRadar = (x, z) => {
        const dx = x - me.x;
        const dz = z - me.z;
        const fwd = dx * sin + dz * cos;
        const right = dx * -cos + dz * sin;
        return [r + right * scale, r - fwd * scale];
      };
      ctx.strokeStyle = 'rgba(255, 244, 220, 0.55)';
      ctx.lineWidth = track.halfWidth * 2 * scale;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      track.samples.forEach((s, i) => {
        const [x, y] = toRadar(s.x, s.z);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();

      for (const o of racers) {
        if (o.isMe) continue;
        const [x, y] = toRadar(o.x, o.z);
        ctx.fillStyle = characterInfo(o.character).color;
        ctx.strokeStyle = '#24142a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // eu: triângulo no centro
      ctx.fillStyle = '#fff4dc';
      ctx.strokeStyle = '#24142a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r, r - 9);
      ctx.lineTo(r + 7, r + 7);
      ctx.lineTo(r - 7, r + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r, r, r - 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#3b2440';
      ctx.lineWidth = 4;
      ctx.stroke();
    },
  };
}
