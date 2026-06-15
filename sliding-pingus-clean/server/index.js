import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ADMIN_PASSWORD = 'Leopluto_2004';
const PENGUINS = ['rocky', 'frosty', 'dash', 'sunny'];
const START_BALANCE = 1000;
const BETTING_MS = 8000;
const ENDED_MS = 4000;
const TICK_MS = 60;

const players = new Map();
let roundId = Math.floor(Math.random() * 1_000_000);
let phase = 'betting';
let phaseStart = Date.now();
let crashPoints = {};
let multipliers = {};
let crashed = {};
let bets = [];
let history = [];
let roundTimer = null;
let stats = { totalBets: 0, totalVolume: 0, houseProfit: 0, rounds: 0, highestWin: 0, highestMultiplier: 0 };

function resetRoundState() {
  multipliers = Object.fromEntries(PENGUINS.map(p => [p, 0]));
  crashed = Object.fromEntries(PENGUINS.map(p => [p, false]));
  crashPoints = Object.fromEntries(PENGUINS.map(p => [p, makeCrashPoint()]));
  bets = [];
}

function makeCrashPoint() {
  const r = Math.max(0.01, Math.random());
  const point = 0.94 / r;
  return Math.min(75, Math.max(0.25, +point.toFixed(2)));
}

function makePlayer(socketId, name = '') {
  if (!players.has(socketId)) {
    players.set(socketId, {
      id: socketId,
      name: name || `Player-${socketId.slice(0, 4)}`,
      balance: START_BALANCE,
      wagered: 0,
      won: 0,
      lost: 0,
      hits: 0,
      hitStakes: [],
      betsCount: 0,
      winsCount: 0,
      lossesCount: 0,
      joinedAt: new Date().toISOString()
    });
  }
  return players.get(socketId);
}

function publicState() {
  return {
    serverTime: Date.now(), roundId, phase, phaseStart, bettingMs: BETTING_MS, endedMs: ENDED_MS,
    multipliers, crashed, bets, history, stats,
    players: [...players.values()].map(p => ({ ...p, hitStakes: undefined }))
  };
}

function emitState() { io.emit('state', publicState()); }

function startBetting() {
  clearInterval(roundTimer);
  roundId += 1;
  phase = 'betting';
  phaseStart = Date.now();
  resetRoundState();
  emitState();
  setTimeout(startRunning, BETTING_MS);
}

function startRunning() {
  phase = 'running';
  phaseStart = Date.now();
  stats.rounds += 1;
  emitState();
  roundTimer = setInterval(tickRunning, TICK_MS);
}

function multiplierAt(ms) {
  const t = ms / 1000;
  return +(Math.exp(0.08 * Math.pow(t, 1.22)) - 1).toFixed(2);
}

function tickRunning() {
  const elapsed = Date.now() - phaseStart;
  for (const p of PENGUINS) {
    if (crashed[p]) continue;
    const m = multiplierAt(elapsed);
    multipliers[p] = m;
    stats.highestMultiplier = Math.max(stats.highestMultiplier, m);
    if (m >= crashPoints[p]) {
      multipliers[p] = crashPoints[p];
      crashed[p] = true;
    }
  }
  emitState();
  if (PENGUINS.every(p => crashed[p]) || elapsed > 36000) endRound();
}

function endRound() {
  clearInterval(roundTimer);
  phase = 'ended';
  phaseStart = Date.now();
  const winner = PENGUINS.reduce((best, p) => crashPoints[p] > crashPoints[best] ? p : best, PENGUINS[0]);
  const bestM = crashPoints[winner];
  history.unshift({ roundId, winner, multiplier: bestM });
  history = history.slice(0, 14);

  for (const b of bets) {
    const p = players.get(b.playerId);
    if (!p) continue;
    if (!b.cashedOut) {
      b.lost = true;
      p.lost += b.amount;
      p.lossesCount += 1;
      stats.houseProfit += b.amount;
    }
    if (b.penguin === winner) {
      p.hits += 1;
      p.hitStakes.push(b.amount);
      if (p.hits >= 3) {
        const bonus = +(p.hitStakes.slice(-3).reduce((a, n) => a + n, 0) / 3).toFixed(2);
        p.balance = +(p.balance + bonus).toFixed(2);
        p.won = +(p.won + bonus).toFixed(2);
        stats.houseProfit = +(stats.houseProfit - bonus).toFixed(2);
        b.bonus = bonus;
        p.hits = 0;
        p.hitStakes = [];
      }
    }
  }
  emitState();
  setTimeout(startBetting, ENDED_MS);
}

io.on('connection', socket => {
  const p = makePlayer(socket.id);
  socket.emit('me', p);
  socket.emit('state', publicState());

  socket.on('setName', name => {
    const player = makePlayer(socket.id);
    player.name = String(name || player.name).trim().slice(0, 22) || player.name;
    socket.emit('me', player);
    emitState();
  });

  socket.on('bet', ({ penguin, amount }) => {
    const player = makePlayer(socket.id);
    amount = Math.round(Number(amount) * 100) / 100;
    if (phase !== 'betting' || !PENGUINS.includes(penguin) || !Number.isFinite(amount) || amount <= 0 || player.balance < amount) return;
    const old = bets.find(b => b.playerId === player.id && b.penguin === penguin && b.roundId === roundId);
    if (old) {
      player.balance = +(player.balance + old.amount).toFixed(2);
      player.wagered = +(player.wagered - old.amount).toFixed(2);
      stats.totalVolume = +(stats.totalVolume - old.amount).toFixed(2);
      bets = bets.filter(b => b.id !== old.id);
    }
    player.balance = +(player.balance - amount).toFixed(2);
    player.wagered = +(player.wagered + amount).toFixed(2);
    player.betsCount += 1;
    stats.totalBets += 1;
    stats.totalVolume = +(stats.totalVolume + amount).toFixed(2);
    bets.push({ id: crypto.randomUUID(), roundId, playerId: player.id, playerName: player.name, penguin, amount, cashedOut: false, cashoutMultiplier: null, payout: 0, lost: false });
    socket.emit('me', player);
    emitState();
  });

  socket.on('cashout', betId => {
    const player = makePlayer(socket.id);
    const b = bets.find(x => x.id === betId && x.playerId === player.id);
    if (!b || phase !== 'running' || b.cashedOut || crashed[b.penguin]) return;
    const m = multipliers[b.penguin];
    const payout = +(b.amount * m).toFixed(2);
    b.cashedOut = true;
    b.cashoutMultiplier = m;
    b.payout = payout;
    player.balance = +(player.balance + payout).toFixed(2);
    player.won = +(player.won + payout).toFixed(2);
    player.winsCount += 1;
    stats.highestWin = Math.max(stats.highestWin, payout);
    stats.houseProfit = +(stats.houseProfit - (payout - b.amount)).toFixed(2);
    socket.emit('me', player);
    emitState();
  });

  socket.on('adminAdjust', ({ password, playerId, amount }) => {
    if (password !== ADMIN_PASSWORD) return;
    const target = players.get(playerId);
    if (!target) return;
    target.balance = Math.max(0, +(target.balance + Number(amount || 0)).toFixed(2));
    emitState();
  });
});

app.get('/health', (_, res) => res.json({ ok: true }));

const distPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));

httpServer.listen(PORT, () => {
  console.log(`Sliding Pingus running on ${PORT}`);
  startBetting();
});
