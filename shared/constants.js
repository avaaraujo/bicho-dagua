// Regras e números compartilhados entre servidor e cliente.

export const LAPS = 5;
export const MAX_PLAYERS = 4;
export const RACE_TIME_LIMIT = 180; // segundos; ninguém terminou = empate
export const AFTER_FIRST_FINISH = 10; // segundos que os outros têm depois do 1º chegar
export const COUNTDOWN_MS = 3500;
export const TICK_RATE = 20; // snapshots por segundo
export const PHYSICS_DT = 1 / 60;
export const ROOM_CODE_LENGTH = 4;

export const CHARACTERS = [
  { id: 'morsa', name: 'Morsa', color: '#2f6fd6' },
  { id: 'garca', name: 'Garça', color: '#f2c230' },
  { id: 'sapo', name: 'Sapo', color: '#e2403a' },
  { id: 'cabra', name: 'Cabra', color: '#3fa34d' },
];

export const BOT_NAMES = ['Bot Coral', 'Bot Maré', 'Bot Lava', 'Bot Brisa'];

// Grand Prix: 4 corridas em pistas desenhadas pelos jogadores.
export const GP_RACES = 4;
export const GP_POINTS = [10, 6, 3, 1]; // por colocação em cada corrida
export const DRAW_SECONDS = 15; // tempo para desenhar a pista
export const REDRAW_SECONDS = 10; // segunda chance, se o desenho não deu pista
export const DRAW_INTRO_MS = 2500; // sorteio na tela antes de a folha abrir
