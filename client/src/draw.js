// Grand Prix antes de cada corrida: o sorteio de quem desenha, a folha de
// desenho (só para o sorteado) e a tela de espera (para os outros, que não
// veem o desenho: a pista é surpresa na largada).
import { findClosure, CLOSE_RADIUS, PAPER_ASPECT } from '../../shared/sketch.js';
import { characterInfo } from './scene/models.js';

const $ = (id) => document.getElementById(id);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = '#262229';
const MAGMA = '#ff6a1a';
const TEAL = '#0b7f86';

// Por que a primeira tentativa não virou pista (motivo vindo do servidor).
const REASONS = {
  'not-closed': 'A volta não fechou.',
  empty: 'Não apareceu nenhum desenho na folha.',
  timeout: 'O tempo acabou antes de a volta fechar.',
  'too-many-crossings': 'Cruzou demais: a pista aceita até 3 cruzamentos.',
  invalid: 'Esse desenho não coube como pista. Laços maiores e curvas mais abertas funcionam melhor.',
};

export function createDrawScreen({ portraits, onSubmit }) {
  const el = {
    screen: $('screen-draw'),
    intro: $('draw-intro'),
    introTitle: $('draw-intro-title'),
    roulette: $('draw-roulette'),
    sheet: $('draw-sheet'),
    sheetTitle: $('sheet-title'),
    sheetHint: $('sheet-hint'),
    clear: $('sheet-clear'),
    timer: $('sheet-timer'),
    wrap: $('paper-wrap'),
    paper: $('paper'),
    wait: $('draw-wait'),
    waitFace: $('draw-wait-face'),
    waitTitle: $('draw-wait-title'),
    waitTimer: $('draw-wait-timer'),
    waitNote: $('draw-wait-note'),
  };
  const ctx = el.paper.getContext('2d');
  let key = null; // fase atual (corrida, tentativa, quem desenha)
  let phase = 'off'; // off | intro | draw | wait
  let draw = null;
  let mine = false;
  let drawAt = 0; // performance.now() em que a folha abre
  let endAt = 0; // ...e em que o tempo acaba
  let points = [];
  let pen = null; // ponteiro desenhando agora
  let hover = null; // posição do lápis (para o círculo da largada reagir)
  let paused = false; // levantou o lápis sem fechar
  let sent = false;
  let rouletteTimers = [];
  let tick = 0;

  // ---------- folha ----------
  function size() {
    const box = el.wrap.getBoundingClientRect();
    let w = box.width;
    let h = w / PAPER_ASPECT;
    if (h > box.height) {
      h = box.height;
      w = h * PAPER_ASPECT;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.paper.style.width = `${Math.floor(w)}px`;
    el.paper.style.height = `${Math.floor(h)}px`;
    el.paper.width = Math.floor(w * dpr);
    el.paper.height = Math.floor(h * dpr);
    render();
  }
  new ResizeObserver(() => phase === 'draw' && size()).observe(el.wrap);

  function render() {
    const W = el.paper.width;
    const H = el.paper.height;
    ctx.clearRect(0, 0, W, H);
    const px = (p) => [p[0] * W, p[1] * H];
    const r = CLOSE_RADIUS * H;
    if (!points.length) {
      ctx.fillStyle = 'rgba(38, 34, 41, 0.38)';
      ctx.font = `800 ${Math.round(H * 0.055)}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Encoste o lápis em qualquer lugar para começar', W / 2, H / 2);
      return;
    }
    // traço de lápis: uma passada firme e uma mais leve, deslocada
    const lw = Math.max(3, H * 0.011);
    for (const [alpha, off, width] of [[0.92, 0, lw], [0.28, lw * 0.35, lw * 0.7]]) {
      ctx.strokeStyle = INK;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((p, i) => {
        const [x, y] = px(p);
        if (i === 0) ctx.moveTo(x + off, y + off);
        else ctx.lineTo(x + off, y + off);
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // largada: círculo laranja; acende quando dá para fechar a volta ali
    const { left } = findClosure(points);
    const [sx, sy] = px(points[0]);
    const near = hover && left && Math.hypot(hover[0] * W - sx, hover[1] * H - sy) < r;
    ctx.setLineDash(left ? [] : [r * 0.25, r * 0.18]);
    ctx.lineWidth = Math.max(2, H * 0.006);
    ctx.strokeStyle = MAGMA;
    ctx.fillStyle = near ? 'rgba(255, 106, 26, 0.28)' : 'rgba(255, 106, 26, 0.1)';
    const pulse = left && !near && !REDUCED ? 1 + Math.sin(tick * 6) * 0.06 : 1;
    ctx.beginPath();
    ctx.arc(sx, sy, r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = MAGMA;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(4, H * 0.012), 0, Math.PI * 2);
    ctx.fill();
    label(near ? 'Solte!' : 'Largada', sx, sy - r - H * 0.02, MAGMA);

    // lápis levantado: ponto azul de onde continuar
    if (paused && !sent) {
      const [ex, ey] = px(points[points.length - 1]);
      ctx.strokeStyle = TEAL;
      ctx.fillStyle = 'rgba(25, 195, 180, 0.22)';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label('Continue daqui', ex, ey + r * 0.7 + H * 0.045, TEAL);
    }
  }

  function label(text, x, y, color) {
    const H = el.paper.height;
    ctx.font = `800 ${Math.round(H * 0.04)}px Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(3, H * 0.008);
    ctx.strokeStyle = '#fffdf8';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function toPaper(e) {
    const b = el.paper.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, (e.clientY - b.top) / b.height))];
  }

  function hint(text) {
    el.sheetHint.textContent = text;
  }

  el.paper.addEventListener('pointerdown', (e) => {
    if (phase !== 'draw' || !mine || sent || performance.now() < drawAt) return;
    e.preventDefault();
    const p = toPaper(e);
    if (paused) {
      // só continua de onde parou, para o traço não pular pela folha
      const end = points[points.length - 1];
      const d = Math.hypot((p[0] - end[0]) * PAPER_ASPECT, p[1] - end[1]);
      if (d > CLOSE_RADIUS * 1.2) {
        hint('Continue do ponto azul, ou toque em Apagar para começar de novo.');
        el.sheetHint.classList.remove('is-nudge');
        void el.sheetHint.offsetWidth;
        el.sheetHint.classList.add('is-nudge');
        return;
      }
      paused = false;
    } else if (!points.length) {
      points.push(p);
    }
    pen = e.pointerId;
    hover = p;
    try {
      el.paper.setPointerCapture(e.pointerId); // o traço continua mesmo saindo da folha
    } catch {
      /* ponteiro já solto: segue sem captura */
    }
    el.clear.disabled = false;
    hint('Dê a volta e solte o lápis dentro do círculo laranja.');
    render();
  });

  el.paper.addEventListener('pointermove', (e) => {
    if (phase !== 'draw') return;
    const p = toPaper(e);
    hover = p;
    if (pen !== e.pointerId) return;
    const last = points[points.length - 1];
    const W = el.paper.clientWidth;
    const H = el.paper.clientHeight;
    if (Math.hypot((p[0] - last[0]) * W, (p[1] - last[1]) * H) < 2) return;
    points.push(p);
    render();
  });

  const lift = (e) => {
    if (pen !== e.pointerId) return;
    pen = null;
    if (findClosure(points).closed) {
      submit();
      return;
    }
    paused = points.length > 0;
    hint('A volta ainda não fechou: continue do ponto azul até o círculo laranja.');
    render();
  };
  el.paper.addEventListener('pointerup', lift);
  el.paper.addEventListener('pointercancel', lift);
  el.paper.addEventListener('pointerleave', () => {
    hover = null;
    if (pen === null) render();
  });

  el.clear.addEventListener('click', () => {
    if (sent) return;
    points = [];
    paused = false;
    pen = null;
    el.clear.disabled = true;
    hint('Comece em qualquer lugar, dê a volta e solte o lápis no círculo laranja.');
    render();
  });

  function submit() {
    if (sent) return;
    sent = true;
    pen = null;
    el.clear.disabled = true;
    el.sheet.classList.add('is-sent');
    el.sheetTitle.textContent = 'Montando a pista…';
    hint('Segura aí: a corrida já vai começar.');
    render();
    onSubmit(points);
  }

  // ---------- sorteio ----------
  function roulette(players, drawerId, ms) {
    rouletteTimers.forEach(clearTimeout);
    rouletteTimers = [];
    el.roulette.replaceChildren(...players.map((p) => {
      const li = document.createElement('li');
      li.className = 'roulette-slot';
      li.dataset.id = p.id;
      const img = document.createElement('img');
      img.src = portraits[p.character];
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = p.name;
      li.append(img, name);
      return li;
    }));
    const slots = [...el.roulette.children];
    const target = Math.max(0, players.findIndex((p) => p.id === drawerId));
    const light = (i, done) => slots.forEach((s, k) => {
      s.classList.toggle('is-lit', k === i);
      s.classList.toggle('is-chosen', done && k === i);
    });
    if (REDUCED || players.length < 2 || ms < 400) {
      light(target, true);
      return;
    }
    // giro desacelerando até parar em quem desenha
    const intervals = [];
    let total = 0;
    let gap = 70;
    while (total + gap < ms - 450) {
      intervals.push(gap);
      total += gap;
      gap *= 1.12;
    }
    let i = (((target - intervals.length) % players.length) + players.length) % players.length;
    light(i, false);
    let at = 0;
    intervals.forEach((g, k) => {
      at += g;
      rouletteTimers.push(setTimeout(() => {
        i = (i + 1) % players.length;
        light(i, k === intervals.length - 1);
      }, at));
    });
  }

  // ---------- fases ----------
  function enter(next) {
    phase = next;
    el.intro.hidden = next !== 'intro';
    el.sheet.hidden = next !== 'draw';
    el.wait.hidden = next !== 'wait';
    if (next === 'draw') requestAnimationFrame(size);
  }

  return {
    // draw: room.gp.draw do servidor; room: a sala (jogadores, quem sou eu)
    show(d, { myId, players, races }) {
      const k = `${d.race}|${d.attempt}|${d.drawerId}`;
      el.screen.hidden = false;
      if (k === key) return;
      key = k;
      draw = d;
      mine = d.drawerId === myId;
      const now = performance.now();
      drawAt = now + d.startsIn;
      endAt = now + d.endsIn; // endsIn já conta o sorteio
      points = [];
      paused = false;
      pen = null;
      sent = false;
      el.sheet.classList.remove('is-sent');
      el.clear.disabled = true;
      const name = mine ? 'Você' : d.drawerName;

      if (d.attempt === 1) {
        el.introTitle.textContent = `Quem desenha a pista ${d.race}?`;
        roulette(players, d.drawerId, d.startsIn);
        rouletteTimers.push(setTimeout(() => {
          el.introTitle.textContent = mine ? 'Você desenha!' : `${name} desenha!`;
        }, Math.max(0, d.startsIn - 450)));
        // abre a folha mesmo se a aba não estiver desenhando quadros
        rouletteTimers.push(setTimeout(() => {
          if (phase === 'intro') enter(mine ? 'draw' : 'wait');
        }, d.startsIn));
        enter('intro');
      }
      el.sheetTitle.textContent = d.attempt === 1 ? 'Desenhe a pista!' : 'Mais 10 segundos!';
      hint(d.attempt === 1
        ? 'Comece em qualquer lugar, dê a volta e solte o lápis no círculo laranja.'
        : `${REASONS[d.reason] ?? 'Esse desenho não virou pista.'} Se não fechar desta vez, a gente liga o fim ao começo com uma reta.`);
      const drawer = players.find((p) => p.id === d.drawerId);
      el.waitFace.src = drawer ? portraits[drawer.character] : '';
      el.waitFace.alt = drawer ? characterInfo(drawer.character).name : '';
      el.waitTitle.textContent = `${d.drawerName} está desenhando a pista ${d.race} de ${races}`;
      el.waitNote.textContent = d.attempt === 1
        ? 'A pista só aparece na largada.'
        : 'A primeira tentativa não virou pista: mais 10 segundos.';
      if (d.attempt !== 1) enter(mine ? 'draw' : 'wait');
    },

    hide() {
      rouletteTimers.forEach(clearTimeout);
      rouletteTimers = [];
      el.screen.hidden = true;
      key = null;
      enter('off');
    },

    // a cada quadro: troca do sorteio para a folha/espera e o relógio
    update(dt) {
      if (phase === 'off') return;
      tick += dt;
      const now = performance.now();
      if (phase === 'intro' && now >= drawAt) enter(mine ? 'draw' : 'wait');
      const left = Math.max(0, Math.ceil((endAt - now) / 1000));
      const text = String(phase === 'intro' ? Math.round((endAt - drawAt) / 1000) : left);
      for (const t of [el.timer, el.waitTimer]) {
        if (t.textContent !== text) t.textContent = text;
        t.classList.toggle('is-low', phase !== 'intro' && left <= 5);
      }
      if (phase === 'draw') {
        if (!sent && now >= endAt) submit(); // acabou o tempo: manda o que tiver
        else if (points.length && !sent && !REDUCED) render(); // círculo pulsando
      }
    },
  };
}
