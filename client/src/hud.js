// HUD da corrida: volta, colocação, tempo, placar e avisos no centro.
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
    board: $('hud-board'),
  };
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
    // lista com a volta de cada um, como os quatro placares do original
    board(rows, laps) {
      const key = JSON.stringify(rows);
      if (key === last.board) return;
      last.board = key;
      el.board.replaceChildren(...[...rows].sort((a, b) => a.place - b.place).map((r) => {
        const li = document.createElement('li');
        if (r.isMe) li.className = 'is-me';
        const pos = document.createElement('span');
        pos.className = 'board-pos';
        pos.textContent = `${r.place}º`;
        const chip = document.createElement('span');
        chip.className = 'board-chip';
        chip.style.background = characterInfo(r.character).color;
        const name = document.createElement('span');
        name.className = 'board-name';
        name.textContent = r.name;
        const lap = document.createElement('span');
        lap.className = 'board-lap';
        lap.textContent = r.finished ? 'Chegou' : `${r.lap}/${laps}`;
        li.append(pos, chip, name, lap);
        return li;
      }));
    },
    reset() {
      last = { lap: '', place: '', time: '', board: '' };
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
  };
}
