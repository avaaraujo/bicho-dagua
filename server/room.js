// Uma sala: lobby → contagem → corrida → resultado → lobby.
// O navegador de cada jogador manda a posição do próprio jet-ski; o servidor
// confere se é plausível, calcula voltas e colocação, e pilota os bots.
import { buildTrack, gridSlots } from '../shared/track.js';
import { createBoat, stepBoat, collideBoats, collideWalls, updateProgress, hasFinished, MAX_SPEED } from '../shared/physics.js';
import { createBrain, botInput } from '../shared/bot.js';
import {
  CHARACTERS, BOT_NAMES, MAX_PLAYERS, LAPS, COUNTDOWN_MS, TICK_RATE, PHYSICS_DT,
  RACE_TIME_LIMIT, AFTER_FIRST_FINISH,
} from '../shared/constants.js';

const track = buildTrack();

export class Room {
  constructor(code, io) {
    this.code = code;
    this.io = io;
    this.hostId = null;
    this.members = new Map(); // socketId -> { id, name, character }
    this.state = 'lobby';
    this.racers = [];
    this.timer = null;
    this.raceStart = 0;
    this.firstFinishAt = null;
    this.lastActivity = Date.now();
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
    // No meio da corrida, quem sai vira bot e a corrida continua.
    const racer = this.racers.find((r) => r.id === socketId);
    if (racer && this.state !== 'lobby') {
      racer.isBot = true;
      racer.brain = createBrain(Math.floor(Math.random() * 1e9));
      racer.name = `${racer.name} (bot)`;
    }
    if (this.isEmpty()) this.stop();
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

  lobbyPayload() {
    return {
      code: this.code,
      hostId: this.hostId,
      state: this.state,
      players: [...this.members.values()],
      laps: LAPS,
    };
  }

  broadcastLobby() {
    this.channel.emit('room:update', this.lobbyPayload());
  }

  start(socketId) {
    if (socketId !== this.hostId || this.state !== 'lobby') return;
    const slots = gridSlots(track);
    const humans = [...this.members.values()];
    const taken = new Set(humans.map((m) => m.character));
    const freeChars = CHARACTERS.filter((c) => !taken.has(c.id));
    const slotOrder = shuffle(slots.map((_, i) => i));
    this.racers = [];
    humans.forEach((m, i) => {
      this.racers.push({
        id: m.id, name: m.name, character: m.character, isBot: false,
        boat: createBoat(slots[slotOrder[i]]), lastUpdate: 0, finishTime: null,
      });
    });
    for (let i = this.racers.length; i < MAX_PLAYERS; i++) {
      const ch = freeChars.shift();
      this.racers.push({
        id: `bot-${i}`, name: BOT_NAMES[i], character: ch.id, isBot: true,
        boat: createBoat(slots[slotOrder[i]]), brain: createBrain(Math.floor(Math.random() * 1e9)),
        finishTime: null,
      });
    }
    this.state = 'countdown';
    this.firstFinishAt = null;
    this.raceStart = Date.now() + COUNTDOWN_MS;
    this.lastActivity = Date.now();
    this.broadcastLobby();
    this.channel.emit('race:start', {
      countdownMs: COUNTDOWN_MS,
      laps: LAPS,
      timeLimit: RACE_TIME_LIMIT,
      racers: this.racers.map((r) => ({
        id: r.id, name: r.name, character: r.character, isBot: r.isBot,
        x: r.boat.x, z: r.boat.z, h: r.boat.h, total: r.boat.total,
      })),
    });
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 1000 / TICK_RATE);
  }

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
    collideWalls(b, track);
    updateProgress(b, track);
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
        const { input, speedMul } = botInput(r.boat, r.brain, track, PHYSICS_DT, Number.isFinite(leader) ? leader : undefined, boats);
        stepBoat(r.boat, input, PHYSICS_DT, track, speedMul);
      }
      for (let i = 0; i < this.racers.length; i++) {
        for (let j = i + 1; j < this.racers.length; j++) {
          const a = this.racers[i];
          const b = this.racers[j];
          if (a.finishTime !== null || b.finishTime !== null) continue;
          if (a.isBot && b.isBot) collideBoats(a.boat, b.boat);
          else if (a.isBot) collideBoats(a.boat, b.boat, true);
          else if (b.isBot) collideBoats(b.boat, a.boat, true);
        }
      }
    }

    for (const r of this.racers) {
      if (r.finishTime === null && hasFinished(r.boat, track)) {
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
    this.state = 'results';
    this.channel.emit('race:end', {
      draw: !someoneFinished,
      elapsed,
      results: order.map((r, i) => ({
        id: r.id, name: r.name, character: r.character, isBot: r.isBot,
        place: someoneFinished ? i + 1 : null,
        time: r.finishTime,
        laps: Math.min(LAPS, Math.max(0, Math.floor(r.boat.total / track.length))),
      })),
    });
    this.broadcastLobby();
  }

  backToLobby(socketId) {
    if (socketId !== this.hostId || this.state !== 'results') return;
    this.state = 'lobby';
    this.racers = [];
    this.broadcastLobby();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
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
