// Uma sala. Quick Play: lobby → contagem → corrida → resultado → lobby.
// Grand Prix: lobby → (sorteio e desenho → contagem → corrida → resultado) × 4
// → resultado final → lobby.
// O navegador de cada jogador manda a posição do próprio jet-ski; o servidor
// confere se é plausível, calcula voltas e colocação, e pilota os bots.
import { buildTrack, gridSlots } from '../shared/track.js';
import { createBoat, stepBoat, collideBoats, collideWalls, updateProgress, hasFinished, MAX_SPEED } from '../shared/physics.js';
import { createBrain, botInput } from '../shared/bot.js';
import {
  CHARACTERS, BOT_NAMES, MAX_PLAYERS, LAPS, COUNTDOWN_MS, TICK_RATE, PHYSICS_DT,
  RACE_TIME_LIMIT, AFTER_FIRST_FINISH,
  GP_RACES, GP_POINTS, DRAW_SECONDS, REDRAW_SECONDS, DRAW_INTRO_MS,
} from '../shared/constants.js';
import { convertSketch } from './sketcher.js';

const QUICK_PLAY_TRACK = buildTrack();
const MAX_SKETCH_POINTS = 4000;

export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.hostId = null;
    this.members = new Map(); // socketId -> { id, name, character }
    this.state = 'lobby'; // lobby | drawing | countdown | racing | results
    this.mode = 'quick'; // quick | gp
    this.gp = null; // Grand Prix em andamento (ver startGrandPrix)
    this.racers = [];
    this.timer = null;
    this.drawTimer = null;
    this.raceStart = 0;
    this.firstFinishAt = null;
    this.lastActivity = Date.now();
    this.track = QUICK_PLAY_TRACK; // pista da corrida atual
    this.trackData = null; // { raw, crossings } de uma pista desenhada; null = Quick Play
    this.nextTrackData = null;
    // tempos do desenho (os testes encurtam)
    this.timing = { intro: DRAW_INTRO_MS, draw: DRAW_SECONDS * 1000, redraw: REDRAW_SECONDS * 1000, grace: 1500 };
  }

  // Pista desenhada para a próxima largada (resultado ok de sketchToTrack).
  // Vale para uma corrida só; depois volta a do Quick Play.
  setNextTrack(sketch) {
    this.nextTrackData = sketch
      ? { raw: sketch.raw, crossings: sketch.crossings.map(({ x, z, over, under, half, angle }) => ({ x, z, over, under, half, angle })) }
      : null;
  }

  get channel() {
    return this.io.to(this.code);
  }

  isEmpty() {
    return this.members.size === 0;
  }

  freeCharacter() {
    const taken = new Set([...this.members.values()].map((m) => m.character));
    return CHARACTERS.find((c) => !taken.has(c.id))?.id ?? CHARACTERS[0].id;
  }

  join(socket, name) {
    if (this.members.size >= MAX_PLAYERS) return 'A sala está cheia (máximo 4 jogadores).';
    if (this.state !== 'lobby') return 'A corrida já começou. Espere ela terminar e tente de novo.';
    this.members.set(socket.id, { id: socket.id, name, character: this.freeCharacter() });
    if (!this.hostId) this.hostId = socket.id;
    socket.join(this.code);
    this.lastActivity = Date.now();
    this.broadcastLobby();
    return null;
  }

  leave(socketId) {
    const member = this.members.get(socketId);
    if (!member) return;
    this.members.delete(socketId);
    if (this.hostId === socketId) this.hostId = this.members.keys().next().value ?? null;
    // No meio da corrida (ou do Grand Prix), quem sai vira bot e continua.
    const racer = this.racers.find((r) => r.id === socketId);
    if (racer && this.state !== 'lobby') {
      racer.isBot = true;
      racer.brain = createBrain(Math.floor(Math.random() * 1e9));
      racer.name = `${member.name} (bot)`;
    }
    const entry = this.gp?.roster.find((r) => r.id === socketId);
    if (entry) {
      entry.isBot = true;
      entry.name = `${member.name} (bot)`;
    }
    if (this.isEmpty()) {
      this.stop();
      return;
    }
    // Quem estava desenhando saiu: sorteia outro.
    if (this.state === 'drawing' && this.gp.draw.drawerId === socketId) this.nextDraw();
    else this.broadcastLobby();
  }

  setCharacter(socketId, character) {
    const member = this.members.get(socketId);
    if (!member || this.state !== 'lobby') return;
    if (!CHARACTERS.some((c) => c.id === character)) return;
    const takenByOther = [...this.members.values()].some((m) => m.id !== socketId && m.character === character);
    if (takenByOther) return;
    member.character = character;
    this.broadcastLobby();
  }

  setMode(socketId, mode) {
    if (socketId !== this.hostId || this.state !== 'lobby') return;
    if (mode !== 'quick' && mode !== 'gp') return;
    this.mode = mode;
    this.broadcastLobby();
  }

  lobbyPayload() {
    return {
      code: this.code,
      hostId: this.hostId,
      state: this.state,
      mode: this.mode,
      players: [...this.members.values()],
      laps: LAPS,
      gp: this.gp && {
        race: this.gp.race, // corridas já terminadas
        races: GP_RACES,
        draw: this.state === 'drawing' ? this.drawPayload() : null,
        table: this.gpTable(),
      },
    };
  }

  broadcastLobby() {
    this.channel.emit('room:update', this.lobbyPayload());
  }

  // Os 4 pilotos: os jogadores da sala e bots nas vagas livres.
  buildRoster() {
    const humans = [...this.members.values()];
    const taken = new Set(humans.map((m) => m.character));
    const freeChars = CHARACTERS.filter((c) => !taken.has(c.id));
    const roster = humans.map((m) => ({ id: m.id, name: m.name, character: m.character, isBot: false }));
    for (let i = roster.length; i < MAX_PLAYERS; i++) {
      roster.push({ id: `bot-${i}`, name: BOT_NAMES[i], character: freeChars.shift().id, isBot: true });
    }
    return roster;
  }

  // O anfitrião largou.
  start(socketId) {
    if (socketId !== this.hostId || this.state !== 'lobby') return;
    if (this.mode === 'gp') this.startGrandPrix();
    else this.startRace(this.buildRoster());
  }

  startRace(roster, extra = null) {
    this.trackData = this.nextTrackData;
    this.nextTrackData = null;
    this.track = this.trackData ? buildTrack(this.trackData.raw, undefined, this.trackData.crossings) : QUICK_PLAY_TRACK;
    const slots = gridSlots(this.track);
    const slotOrder = shuffle(slots.map((_, i) => i));
    this.racers = roster.map((p, i) => ({
      id: p.id, name: p.name, character: p.character, isBot: p.isBot,
      boat: createBoat(slots[slotOrder[i]]),
      brain: p.isBot ? createBrain(Math.floor(Math.random() * 1e9)) : undefined,
      lastUpdate: 0, finishTime: null,
    }));
    this.state = 'countdown';
    this.firstFinishAt = null;
    this.raceStart = Date.now() + COUNTDOWN_MS;
    this.lastActivity = Date.now();
    this.broadcastLobby();
    this.channel.emit('race:start', {
      countdownMs: COUNTDOWN_MS,
      laps: LAPS,
      timeLimit: RACE_TIME_LIMIT,
      track: this.trackData,
      gp: extra,
      racers: this.racers.map((r) => ({
        id: r.id, name: r.name, character: r.character, isBot: r.isBot,
        x: r.boat.x, z: r.boat.z, h: r.boat.h, total: r.boat.total,
      })),
    });
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

  // ---------- Grand Prix ----------

  startGrandPrix() {
    const roster = this.buildRoster();
    this.gp = {
      race: 0,
      roster,
      scores: new Map(roster.map((p) => [p.id, { points: 0, wins: 0, places: [], gained: 0 }])),
      drawn: new Set(), // quem já desenhou nesta rodada de sorteios
      draw: null,
      drawSeq: 0,
    };
    this.nextDraw();
  }

  // Sorteia quem desenha a próxima pista: só humanos que ainda estão na sala,
  // e ninguém repete até todos terem desenhado.
  nextDraw() {
    const humans = this.gp.roster.filter((p) => !p.isBot && this.members.has(p.id));
    if (!humans.length) return;
    let pool = humans.filter((p) => !this.gp.drawn.has(p.id));
    if (!pool.length) {
      this.gp.drawn.clear();
      pool = humans;
    }
    const drawer = pool[Math.floor(Math.random() * pool.length)];
    this.gp.drawn.add(drawer.id);
    this.beginDraw(drawer.id, 1, null);
  }

  // attempt 1: sorteio na tela e 15 s; attempt 2: mais 10 s (o desenho
  // anterior não deu pista; reason diz por quê).
  beginDraw(drawerId, attempt, reason) {
    const now = Date.now();
    const intro = attempt === 1 ? this.timing.intro : 0;
    const length = attempt === 1 ? this.timing.draw : this.timing.redraw;
    this.gp.draw = {
      drawerId, attempt, reason,
      startsAt: now + intro,
      endsAt: now + intro + length,
      token: ++this.gp.drawSeq,
      busy: false,
    };
    this.state = 'drawing';
    this.lastActivity = now;
    clearTimeout(this.drawTimer);
    const token = this.gp.draw.token;
    this.drawTimer = setTimeout(() => this.drawTimeout(token), intro + length + this.timing.grace);
    this.broadcastLobby();
  }

  drawPayload() {
    const d = this.gp.draw;
    const now = Date.now();
    return {
      drawerId: d.drawerId,
      drawerName: this.gp.roster.find((p) => p.id === d.drawerId)?.name ?? '',
      attempt: d.attempt,
      reason: d.reason,
      race: this.gp.race + 1,
      // relativos (o relógio de cada aparelho é diferente do servidor)
      startsIn: Math.max(0, d.startsAt - now),
      endsIn: Math.max(0, d.endsAt - now),
    };
  }

  // O desenho chegou (quando o lápis fecha o ciclo ou quando o tempo acaba).
  async submitSketch(socketId, points) {
    const d = this.gp?.draw;
    if (this.state !== 'drawing' || !d || d.drawerId !== socketId || d.busy) return;
    if (Date.now() > d.endsAt + this.timing.grace) return;
    d.busy = true;
    clearTimeout(this.drawTimer);
    const result = await convertSketch(cleanPoints(points), d.attempt >= 2);
    if (this.state !== 'drawing' || this.gp?.draw !== d) return; // a sala seguiu (alguém saiu)
    this.afterSketch(result);
  }

  drawTimeout(token) {
    const d = this.gp?.draw;
    if (this.state !== 'drawing' || !d || d.token !== token || d.busy) return;
    this.afterSketch({ ok: false, reason: 'timeout' });
  }

  afterSketch(result) {
    const d = this.gp.draw;
    if (result.ok) {
      this.setNextTrack(result);
      this.startGpRace(false);
    } else if (d.attempt === 1) {
      this.beginDraw(d.drawerId, 2, result.reason);
    } else {
      // Segunda tentativa também não deu pista: corre na do Quick Play.
      this.setNextTrack(null);
      this.startGpRace(true);
    }
  }

  startGpRace(fallback) {
    clearTimeout(this.drawTimer);
    const drawer = this.gp.roster.find((p) => p.id === this.gp.draw.drawerId);
    this.gp.draw = null;
    this.startRace(this.gp.roster, { race: this.gp.race + 1, races: GP_RACES, drawerName: drawer?.name ?? '', fallback });
  }

  // Classificação do Grand Prix: pontos, depois vitórias, depois a melhor
  // colocação na última corrida.
  gpTable() {
    if (!this.gp) return [];
    return this.gp.roster.map((p) => {
      const s = this.gp.scores.get(p.id);
      return {
        id: p.id, name: p.name, character: p.character, isBot: p.isBot,
        points: s.points, wins: s.wins, gained: s.gained, last: s.places.at(-1) ?? null,
      };
    }).sort((a, b) => b.points - a.points || b.wins - a.wins || (a.last ?? 9) - (b.last ?? 9));
  }

  scoreRace(order) {
    order.forEach((r, i) => {
      const s = this.gp.scores.get(r.id);
      if (!s) return;
      s.gained = GP_POINTS[i] ?? 0;
      s.points += s.gained;
      s.places.push(i + 1);
      if (i === 0) s.wins++;
    });
    this.gp.race++;
  }

  // ---------- corrida ----------

  // Estado enviado pelo navegador do jogador.
  clientState(socketId, msg) {
    if (this.state !== 'racing') return;
    const r = this.racers.find((x) => x.id === socketId && !x.isBot);
    if (!r || r.finishTime !== null) return;
    if (!msg || ![msg.x, msg.z, msg.h, msg.vx, msg.vz].every(Number.isFinite)) return;
    const b = r.boat;
    const now = Date.now();
    const dt = r.lastUpdate ? (now - r.lastUpdate) / 1000 : 0.1;
    const maxMove = MAX_SPEED * 1.25 * Math.max(dt, 0.05) + 3;
    const moved = Math.hypot(msg.x - b.x, msg.z - b.z);
    r.lastUpdate = now;
    if (moved > maxMove) return; // implausível: ignora (o cliente é corrigido pelo snapshot)
    b.x = msg.x;
    b.z = msg.z;
    b.h = msg.h;
    b.vx = msg.vx;
    b.vz = msg.vz;
    b.lean = Number.isFinite(msg.lean) ? msg.lean : 0;
    b._proj = null;
    collideWalls(b, this.track);
    updateProgress(b, this.track);
  }

  tick() {
    const now = Date.now();
    if (this.state === 'countdown') {
      if (now >= this.raceStart) this.state = 'racing';
      else return this.sendSnapshot(now);
    }
    if (this.state !== 'racing') return;

    const elapsed = (now - this.raceStart) / 1000;
    const steps = Math.round(1 / TICK_RATE / PHYSICS_DT);
    const leader = Math.max(...this.racers.filter((r) => !r.isBot).map((r) => r.boat.total), -Infinity);
    const boats = this.racers.filter((r) => r.finishTime === null).map((r) => r.boat);
    for (let s = 0; s < steps; s++) {
      for (const r of this.racers) {
        if (!r.isBot || r.finishTime !== null) continue;
        const { input, speedMul } = botInput(r.boat, r.brain, this.track, PHYSICS_DT, Number.isFinite(leader) ? leader : undefined, boats);
        stepBoat(r.boat, input, PHYSICS_DT, this.track, speedMul);
      }
      for (let i = 0; i < this.racers.length; i++) {
        for (let j = i + 1; j < this.racers.length; j++) {
          const a = this.racers[i];
          const b = this.racers[j];
          if (a.finishTime !== null || b.finishTime !== null) continue;
          if (a.isBot && b.isBot) collideBoats(a.boat, b.boat, false, this.track);
          else if (a.isBot) collideBoats(a.boat, b.boat, true, this.track);
          else if (b.isBot) collideBoats(b.boat, a.boat, true, this.track);
        }
      }
    }

    for (const r of this.racers) {
      if (r.finishTime === null && hasFinished(r.boat, this.track)) {
        r.finishTime = elapsed;
        if (this.firstFinishAt === null) this.firstFinishAt = elapsed;
      }
    }

    this.sendSnapshot(now);

    const humans = this.racers.filter((r) => !r.isBot);
    const allHumansDone = humans.length > 0 && humans.every((r) => r.finishTime !== null);
    const graceOver = this.firstFinishAt !== null && elapsed - this.firstFinishAt > AFTER_FIRST_FINISH;
    const allDone = this.racers.every((r) => r.finishTime !== null);
    if (allDone || allHumansDone || graceOver || elapsed >= RACE_TIME_LIMIT) this.finish(elapsed);
  }

  standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.boat.total - a.boat.total;
    });
  }

  sendSnapshot(now) {
    const order = this.standings();
    const elapsed = Math.max(0, (now - this.raceStart) / 1000);
    this.channel.volatile.emit('race:snap', {
      t: now,
      state: this.state,
      timeLeft: Math.max(0, RACE_TIME_LIMIT - elapsed),
      racers: this.racers.map((r) => ({
        id: r.id,
        x: round(r.boat.x), z: round(r.boat.z), h: round(r.boat.h, 1000),
        vx: round(r.boat.vx), vz: round(r.boat.vz), lean: round(r.boat.lean || 0, 100),
        total: round(r.boat.total),
        place: order.indexOf(r) + 1,
        finished: r.finishTime !== null,
        isBot: r.isBot,
      })),
    });
  }

  finish(elapsed) {
    clearInterval(this.timer);
    this.timer = null;
    const someoneFinished = this.racers.some((r) => r.finishTime !== null);
    const order = this.standings();
    // No Grand Prix toda corrida dá pontos, mesmo sem ninguém completar as
    // voltas: aí vale quem foi mais longe.
    if (this.gp) this.scoreRace(order);
    this.state = 'results';
    this.channel.emit('race:end', {
      draw: !someoneFinished,
      elapsed,
      results: order.map((r, i) => ({
        id: r.id, name: r.name, character: r.character, isBot: r.isBot,
        place: someoneFinished || this.gp ? i + 1 : null,
        time: r.finishTime,
        laps: Math.min(LAPS, Math.max(0, Math.floor(r.boat.total / this.track.length))),
      })),
      gp: this.gp && {
        race: this.gp.race,
        races: GP_RACES,
        final: this.gp.race >= GP_RACES,
        table: this.gpTable(),
      },
    });
    this.broadcastLobby();
  }

  // Botão do anfitrião no resultado: próxima corrida do Grand Prix, ou volta
  // para a sala (Quick Play e fim do Grand Prix).
  backToLobby(socketId) {
    if (socketId !== this.hostId || this.state !== 'results') return;
    this.racers = [];
    if (this.gp && this.gp.race < GP_RACES) {
      this.nextDraw();
      return;
    }
    this.gp = null;
    this.state = 'lobby';
    this.broadcastLobby();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    clearTimeout(this.drawTimer);
    this.drawTimer = null;
  }
}

// Só pares de números entre 0 e 1, e não mais que MAX_SKETCH_POINTS.
function cleanPoints(points) {
  if (!Array.isArray(points)) return [];
  const out = [];
  for (const p of points.slice(0, MAX_SKETCH_POINTS)) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    out.push([Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))]);
  }
  return out;
}

function round(v, k = 100) {
  return Math.round(v * k) / k;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
