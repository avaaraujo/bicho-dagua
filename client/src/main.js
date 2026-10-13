import '@fontsource/titan-one/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './style.css';
import * as THREE from 'three';
import { io } from 'socket.io-client';
import { buildTrack } from '../../shared/track.js';
import { CHARACTERS } from '../../shared/constants.js';
import { buildWorld } from './scene/world.js';
import { buildRacerModel, characterInfo } from './scene/models.js';
import { createSpray } from './scene/fx.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { Race, Showcase } from './race.js';
import { createDrawScreen } from './draw.js';
import { Podium } from './scene/podium.js';

const $ = (id) => document.getElementById(id);

// Se algo quebrar (principalmente em celular), mostra o erro na tela para dar
// para tirar print e corrigir, em vez de o jogo simplesmente parar.
function showCrash(message) {
  let box = document.querySelector('.crash-report');
  if (!box) {
    box = document.createElement('p');
    box.className = 'crash-report';
    box.setAttribute('role', 'alert');
    document.body.append(box);
  }
  box.textContent = `Ops, deu um erro no jogo. Manda um print disto: ${message} · ${navigator.userAgent}`;
}
window.addEventListener('error', (e) => showCrash(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => showCrash(String(e.reason?.message || e.reason)));
// iOS ignora user-scalable=no: bloqueia o gesto de pinça e o toque duplo, que
// davam zoom no meio da corrida e jogavam os botões para fora da tela.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 350 && !(e.target instanceof HTMLInputElement)) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
// Ao girar o celular o Safari às vezes fica com zoom; reescrever a meta viewport
// faz ele voltar para a escala 1.
const viewportMeta = document.querySelector('meta[name="viewport"]');
function resetZoom() {
  const content = viewportMeta.content;
  viewportMeta.content = `${content}, x-reset=1`;
  requestAnimationFrame(() => {
    viewportMeta.content = content;
  });
}
window.addEventListener('orientationchange', () => setTimeout(resetZoom, 300));
window.visualViewport?.addEventListener('resize', () => {
  if (window.visualViewport.scale > 1.01) resetZoom();
});
const INTERNAL_HEIGHT = 560; // resolução interna baixa, ampliada com pixels nítidos
const AUTOPILOT = new URLSearchParams(location.search).has('autopilot'); // só para testes automáticos

// ---------- cena ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.5, 900);
// Pista do Quick Play: a dos menus e a de toda corrida que não traz outra.
const track = buildTrack();
const world = buildWorld(scene, track);
const spray = createSpray(scene);
const input = createInput();
const hud = createHud(track);
const audio = createAudio();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(1, INTERNAL_HEIGHT / h);
  renderer.setSize(Math.round(w * scale), Math.round(h * scale), false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('is-touch', isTouch);
input.bindTouch($('t-left'), $('t-right'), $('t-gas'), $('t-brake'));

// ---------- estado do app ----------
const app = {
  socket: null,
  myId: null,
  room: null,
  race: null,
  showcase: new Showcase({ scene, camera, track, spray, center: world.center }),
  lastResults: null,
  podium: null, // cena do campeão no fim do Grand Prix
};

const screens = ['screen-home', 'screen-lobby', 'screen-results', 'screen-draw', 'screen-final'];
function showScreen(id) {
  for (const s of screens) $(s).hidden = s !== id;
  document.body.classList.toggle('is-racing', id === null);
  // Aviso de "deite o celular": na sala, no desenho e na corrida, não na tela inicial.
  document.body.classList.toggle('wants-landscape', id === null || id === 'screen-lobby' || id === 'screen-draw');
}
$('btn-rotate-skip').addEventListener('click', () => document.body.classList.add('rotate-skipped'));

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// ---------- retratos dos pilotos (renderizados uma vez) ----------
const portraits = {};
(function makePortraits() {
  const r = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  r.setSize(72, 72, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffe6f0, 0x2f8f8a, 1.6));
  const sun = new THREE.DirectionalLight(0xffe2b8, 1.8);
  sun.position.set(3, 6, 6);
  s.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(2.6, 2.7, 4.4);
  cam.lookAt(0, 1.5, 0);
  for (const c of CHARACTERS) {
    const m = buildRacerModel(c.id);
    m.rotation.y = 0.5;
    s.add(m);
    r.render(s, cam);
    portraits[c.id] = r.domElement.toDataURL();
    s.remove(m);
  }
  r.dispose();
  r.forceContextLoss?.();
})();

// ---------- Grand Prix: sorteio e desenho ----------
const drawScreen = createDrawScreen({
  portraits,
  onSubmit: (points) => app.socket?.emit('gp:sketch', points),
});
if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector('.scribble')?.pauseAnimations?.();

// ---------- rede ----------
function connect() {
  if (app.socket) return app.socket;
  // Tenta WebSocket primeiro (mais rápido); se a rede bloquear (proxy de
  // empresa, escola, Wi-Fi público), cai para polling HTTP em vez de travar.
  const socket = io({ transports: ['websocket', 'polling'], tryAllTransports: true });
  app.socket = socket;
  const overlayTimer = setTimeout(() => {
    if (!socket.connected) $('overlay-connect').hidden = false;
  }, 900);
  socket.on('connect', () => {
    clearTimeout(overlayTimer);
    $('overlay-connect').hidden = true;
  });
  socket.on('disconnect', () => {
    if (app.room) {
      leaveRace();
      app.room = null;
      showScreen('screen-home');
      setHomeError('A conexão caiu e você saiu da sala. Crie ou entre numa sala de novo.');
    }
  });
  socket.on('room:update', (room) => {
    app.room = room;
    if (room.state === 'lobby') {
      if (app.race) leaveRace();
      endPodium();
      drawScreen.hide();
      renderLobby();
      showScreen('screen-lobby');
    } else if (room.state === 'drawing' && room.gp?.draw) {
      if (app.race) leaveRace();
      app.lastResults = null;
      showScreen('screen-draw');
      drawScreen.show(room.gp.draw, { myId: app.myId, players: room.players, races: room.gp.races });
    } else if (room.state === 'results' && !$('screen-results').hidden) {
      renderResults();
    }
  });
  socket.on('race:start', (start) => startRace(start));
  socket.on('race:snap', (snap) => app.race?.onSnap(snap));
  socket.on('race:end', (payload) => {
    app.lastResults = payload;
    app.race?.end();
    if (payload.draw) app.race?.hud.banner('TEMPO!', 0, 'warn');
    setTimeout(() => {
      if (!app.lastResults || app.room?.state !== 'results') return;
      leaveRace();
      if (app.lastResults.gp?.final) {
        startPodium();
        return;
      }
      renderResults();
      showScreen('screen-results');
    }, 2600);
  });
  return socket;
}

function request(event, payload) {
  const socket = connect();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'O servidor não respondeu. Tente de novo em alguns segundos.' }), 70000);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

// ---------- início ----------
const nameInput = $('in-name');
const codeInput = $('in-code');
try {
  nameInput.value = localStorage.getItem('tc-name') || '';
} catch {
  /* sem armazenamento */
}
const urlCode = new URLSearchParams(location.search).get('sala');
if (urlCode) codeInput.value = urlCode.toUpperCase().slice(0, 4);

function setHomeError(text) {
  $('home-error').textContent = text;
}

function playerName() {
  const name = nameInput.value.trim();
  if (!name) {
    setHomeError('Escreva seu nome para os outros saberem quem é quem.');
    nameInput.focus();
    return null;
  }
  try {
    localStorage.setItem('tc-name', name);
  } catch {
    /* ignora */
  }
  return name;
}

async function enterRoom(event, payload, button) {
  audio.unlock();
  setHomeError('');
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Conectando…';
  const res = await request(event, payload);
  button.disabled = false;
  button.textContent = label;
  if (!res.ok) {
    setHomeError(res.error);
    return;
  }
  app.myId = res.you;
  app.room = res.room;
  history.replaceState(null, '', `?sala=${res.room.code}`);
  renderLobby();
  showScreen('screen-lobby');
}

$('form-home').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = playerName();
  if (name) enterRoom('room:create', { name }, $('btn-create'));
});
$('btn-join').addEventListener('click', () => {
  const name = playerName();
  if (!name) return;
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 4) {
    setHomeError('O código da sala tem 4 letras.');
    codeInput.focus();
    return;
  }
  enterRoom('room:join', { name, code }, $('btn-join'));
});
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
});

// ---------- sala ----------
function isHost() {
  return app.room && app.room.hostId === app.myId;
}

function renderLobby() {
  const room = app.room;
  if (!room) return;
  $('lobby-code').textContent = room.code;
  const slots = $('lobby-slots');
  slots.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = room.players[i];
    const li = document.createElement('li');
    li.className = 'slot' + (p ? '' : ' is-empty');
    if (p) {
      const img = document.createElement('img');
      img.className = 'slot-face';
      img.src = portraits[p.character];
      img.alt = characterInfo(p.character).name;
      const name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = p.name + (p.id === app.myId ? ' (você)' : '');
      const tag = document.createElement('span');
      tag.className = 'slot-tag';
      tag.textContent = p.id === room.hostId ? 'Anfitrião' : characterInfo(p.character).name;
      li.append(img, name, tag);
    } else {
      li.innerHTML = '<span class="slot-face"></span><span class="slot-name">Vaga livre</span><span class="slot-tag">vira bot</span>';
    }
    slots.append(li);
  }

  const me = room.players.find((p) => p.id === app.myId);
  const picker = $('lobby-picker');
  picker.innerHTML = '';
  for (const c of CHARACTERS) {
    const owner = room.players.find((p) => p.character === c.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.setAttribute('aria-pressed', String(me?.character === c.id));
    b.disabled = !!owner && owner.id !== app.myId;
    b.innerHTML = `<img alt="" src="${portraits[c.id]}"><span>${c.name}</span><span class="pick-who"></span>`;
    b.querySelector('.pick-who').textContent = owner && owner.id !== app.myId ? owner.name : '';
    b.addEventListener('click', () => app.socket.emit('lobby:character', c.id));
    picker.append(b);
  }

  for (const b of $('lobby-modes').querySelectorAll('.mode')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === (room.mode ?? 'quick')));
    b.disabled = !isHost();
  }
  $('btn-start').textContent = room.mode === 'gp' ? 'Começar o Grand Prix' : 'Largar!';

  const host = room.players.find((p) => p.id === room.hostId);
  $('btn-start').hidden = !isHost();
  const bots = 4 - room.players.length;
  $('lobby-wait').textContent = isHost()
    ? (bots ? `${bots === 1 ? '1 vaga vira bot' : `${bots} vagas viram bots`} se ninguém mais entrar.` : 'Sala cheia!')
    : `Esperando ${host?.name ?? 'o anfitrião'} largar…`;
}

for (const b of $('lobby-modes').querySelectorAll('.mode')) {
  b.addEventListener('click', () => {
    if (!isHost()) return;
    app.socket.emit('lobby:mode', b.dataset.mode);
  });
}
$('btn-start').addEventListener('click', () => {
  audio.unlock();
  app.socket.emit('lobby:start');
});
$('btn-copy').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?sala=${app.room.code}`;
  try {
    await navigator.clipboard.writeText(link);
    toast('Convite copiado! Mande para os amigos.');
  } catch {
    toast(`Mande este link: ${link}`);
  }
});
function leaveRoom() {
  app.socket?.emit('room:leave');
  app.room = null;
  leaveRace();
  endPodium();
  drawScreen.hide();
  history.replaceState(null, '', location.pathname);
  showScreen('screen-home');
}
$('btn-leave').addEventListener('click', leaveRoom);
$('btn-results-leave').addEventListener('click', leaveRoom);
$('btn-final-leave').addEventListener('click', leaveRoom);
$('btn-final-back').addEventListener('click', () => app.socket.emit('race:again'));

// ---------- corrida ----------
function startRace(start) {
  leaveRace();
  drawScreen.hide();
  // Corrida com pista desenhada (Grand Prix): o servidor manda os pontos.
  const raceTrack = start.track ? buildTrack(start.track.raw, undefined, start.track.crossings) : track;
  world.setTrack(raceTrack);
  app.lastResults = null;
  app.showcase.group.visible = false;
  showScreen(null);
  $('touch').hidden = !isTouch;
  app.race = new Race({
    scene, camera, track: raceTrack, world, net: app.socket, myId: app.myId, start, hud, input, audio, spray,
    autopilot: AUTOPILOT,
  });
  if (start.gp) {
    const by = start.gp.fallback ? 'piscina clássica' : `desenhada por ${start.gp.drawerName}`;
    hud.gp(`Pista ${start.gp.race} de ${start.gp.races} · ${by}`);
    if (start.gp.fallback) toast('O desenho não virou pista: esta corrida é na piscina clássica.');
  }
}

// ---------- fim do Grand Prix: pódio ----------
function startPodium() {
  const res = app.lastResults;
  endPodium();
  app.showcase.group.visible = false;
  world.setTrack(track);
  app.podium = new Podium({ scene, camera, table: res.gp.table });
  const winner = res.gp.table[0];
  $('final-title').textContent = winner.id === app.myId ? 'Você venceu!' : 'Campeão!';
  $('final-winner').textContent = winner.id === app.myId
    ? `Você levou a taça do Grand Prix com ${winner.points} pontos.`
    : `${winner.name} levou a taça do Grand Prix com ${winner.points} pontos.`;
  renderStandings($('final-list'), res.gp.table, false);
  $('btn-final-back').hidden = !isHost();
  const host = app.room?.players.find((p) => p.id === app.room.hostId);
  $('final-wait').textContent = isHost() ? '' : `Esperando ${host?.name ?? 'o anfitrião'} voltar para a sala…`;
  showScreen('screen-final');
  audio.fanfare(winner.id === app.myId);
}

function endPodium() {
  if (!app.podium) return;
  app.podium.dispose();
  app.podium = null;
  app.showcase.group.visible = true;
}

function leaveRace() {
  if (app.race) {
    app.race.dispose();
    app.race = null;
  }
  $('touch').hidden = true;
  app.showcase.group.visible = true;
  world.setTrack(track);
}

function formatTime(t) {
  if (t === null || t === undefined) return 'não terminou';
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

// Classificação do Grand Prix: posição, retrato, nome (e a colocação nesta
// corrida), pontos ganhos agora e o total.
function renderStandings(list, table, withRace, results = []) {
  list.innerHTML = '';
  table.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.id === app.myId) li.className = 'is-me';
    const pos = document.createElement('span');
    pos.className = 'pos chrome';
    pos.textContent = `${i + 1}º`;
    const img = document.createElement('img');
    img.className = 'slot-face';
    img.src = portraits[r.character];
    img.alt = characterInfo(r.character).name;
    const who = document.createElement('span');
    who.className = 'standing-name';
    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = r.name + (r.id === app.myId ? ' (você)' : '');
    who.append(name);
    const place = results.find((x) => x.id === r.id)?.place;
    if (withRace && place) {
      const sub = document.createElement('span');
      sub.className = 'standing-sub';
      sub.textContent = `${place}º nesta corrida`;
      who.append(sub);
    }
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.innerHTML = '<small>pts</small>';
    pts.prepend(String(r.points));
    if (withRace) {
      const gained = document.createElement('span');
      gained.className = 'gained';
      gained.textContent = r.gained ? `+${r.gained}` : '';
      li.append(pos, img, who, gained, pts);
    } else {
      li.append(pos, img, who, pts);
    }
    list.append(li);
  });
}

function renderResults() {
  const res = app.lastResults;
  if (!res) return;
  const list = $('results-list');
  list.classList.toggle('is-gp', !!res.gp);
  if (res.gp) {
    $('results-title').textContent = `Corrida ${res.gp.race} de ${res.gp.races}`;
    $('results-sub').textContent = res.draw
      ? 'Ninguém completou as 5 voltas: os pontos foram para quem foi mais longe.'
      : 'Classificação do Grand Prix';
    renderStandings(list, res.gp.table, true, res.results);
    $('btn-again').textContent = 'Próxima corrida';
    $('btn-again').hidden = !isHost();
    const host = app.room?.players.find((p) => p.id === app.room.hostId);
    $('results-wait').textContent = isHost() ? '' : `Esperando ${host?.name ?? 'o anfitrião'} chamar a próxima corrida…`;
    return;
  }
  $('btn-again').textContent = 'Correr de novo';
  const mine = res.results.find((r) => r.id === app.myId);
  $('results-title').textContent = res.draw ? 'Empate!' : mine?.place === 1 ? 'Você venceu!' : 'Resultado';
  $('results-sub').textContent = res.draw ? 'Ninguém completou as 5 voltas em 3 minutos.' : '';
  list.innerHTML = '';
  res.results.forEach((r, i) => {
    const li = document.createElement('li');
    if (r.id === app.myId) li.className = 'is-me';
    const pos = document.createElement('span');
    pos.className = 'pos chrome';
    pos.textContent = r.place ? `${r.place}º` : '–';
    const img = document.createElement('img');
    img.className = 'slot-face';
    img.src = portraits[r.character];
    img.alt = characterInfo(r.character).name;
    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = r.name + (r.id === app.myId ? ' (você)' : '');
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = r.time !== null ? formatTime(r.time) : `${r.laps}/5 voltas`;
    li.append(pos, img, name, time);
    list.append(li);
    if (i === 0) li.style.order = '0';
  });
  $('btn-again').hidden = !isHost();
  const host = app.room?.players.find((p) => p.id === app.room.hostId);
  $('results-wait').textContent = isHost() ? '' : `Esperando ${host?.name ?? 'o anfitrião'} chamar a próxima corrida…`;
}
$('btn-again').addEventListener('click', () => app.socket.emit('race:again'));

// ---------- som ----------
const muteBtn = $('btn-mute');
function syncMute() {
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
  muteBtn.setAttribute('aria-label', audio.muted ? 'Ligar som' : 'Desligar som');
}
muteBtn.addEventListener('click', () => {
  audio.unlock();
  audio.toggleMute();
  syncMute();
});
syncMute();
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// ---------- loop ----------
let elapsed = 0;
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  elapsed += dt;
  world.update(elapsed, dt);
  if (app.race) app.race.update(dt, elapsed, performance.now());
  else if (app.podium) app.podium.update(elapsed, dt);
  else app.showcase.update(dt, elapsed);
  drawScreen.update(dt);
  spray.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
showScreen('screen-home');
requestAnimationFrame(frame);
if (urlCode) nameInput.focus();
