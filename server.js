const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DEFAULT_TIER_POINTS = [50, 40, 30, 20, 10];
// How long a disconnected player's spot is held before they're removed for
// good. Generous on purpose - covers a phone locking, switching to WhatsApp,
// a Wi-Fi hiccup, etc. without losing their score/progress.
const RECONNECT_GRACE_MS = 10 * 60 * 1000; // 10 minutes

// ---------- Load question packs ----------
const PACKS_DIR = path.join(__dirname, 'packs');

function listPacks() {
  const files = fs.readdirSync(PACKS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const id = f.replace(/\.json$/, '');
    const data = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, f), 'utf-8'));
    const isArray = Array.isArray(data);
    const questions = isArray ? data : (Array.isArray(data.questions) ? data.questions : []);
    return {
      id,
      name: (!isArray && data.name) ? data.name : id,
      description: (!isArray && data.description) ? data.description : '',
      questionCount: questions.length,
    };
  });
}

function loadPack(packId) {
  const filePath = path.join(PACKS_DIR, `${packId}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const isArray = Array.isArray(data);
  return {
    name: (!isArray && data.name) ? data.name : packId,
    questions: isArray ? data : (data.questions || [])
  };
}

function generatePlayerId() {
  return crypto.randomBytes(8).toString('hex');
}

// ---------- In-memory state ----------
// rooms[code] = {
//   code, hostSocketId, packId,
//   state: 'lobby'|'question'|'wager-collect'|'wager-question'|'song-ready'|'song-tier'|'reveal'|'ended',
//   questions, currentIndex, songTier,
//   players: Map(playerId -> {name, score, answer, correct, matches, wager, wagerWin,
//                              songTier, connected, disconnectTimer}),
// }
// Players are keyed by a stable playerId (NOT socket.id) so a phone that
// reconnects with a brand new socket.id (after locking, backgrounding, or a
// network blip) can be matched back to the same player record instead of
// being treated as someone new.
const rooms = {};

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms[code]);
  return code;
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

// Full, host-only view of every player - includes their live answer text so
// the host can see, in real time, exactly what each player has typed/picked
// for the current question, across every question type - plus their
// connection status so the host knows if someone's phone dropped.
function publicPlayerList(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({
    id,
    name: p.name,
    score: p.score,
    submitted: p.answer !== null,
    answer: p.answer,
    connected: p.connected !== false,
  }));
}

function leaderboard(room) {
  return Array.from(room.players.values())
    .map((p) => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function currentQuestion(room) {
  return room.questions[room.currentIndex];
}

// Normalize free-text answers for auto-grading:
// lowercase, strip punctuation, collapse whitespace, trim.
function normalizeAnswer(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// For "survey" questions, the vote options are NOT hardcoded in the pack -
// they are generated live from whoever has actually joined the room, so the
// list always matches the real players at the table.
function getQuestionOptions(q, room) {
  if (q.type === 'survey') {
    return Array.from(room.players.values()).map((p) => p.name);
  }
  return q.options || [];
}

function getTierPoints(q) {
  return Array.isArray(q.tierPoints) && q.tierPoints.length >= 5 ? q.tierPoints : DEFAULT_TIER_POINTS;
}

function questionForPlayer(q, room) {
  // Question text is shown to players too. If a pack omits `text`, this
  // stays undefined and the client falls back to a generic heading - so
  // older/custom packs without it still work fine.
  return {
    type: q.type,
    text: q.text,
    image: q.image || q.imageFile || null,
    options: getQuestionOptions(q, room),
    points: q.points,
  };
}

// Moves the room into whichever phase the current question needs: a normal
// question, the wager-collection phase, or the song-guess "get ready" phase.
// Used by both host:start-game and host:next-question.
function advanceToCurrentQuestion(room) {
  const q = currentQuestion(room);

  for (const p of room.players.values()) {
    p.answer = null;
    p.correct = false;
    p.matches = 0;
    p.wager = null;
    p.wagerWin = null;
    p.songTier = null;
  }

  if (q.type === 'wager') {
    room.state = 'wager-collect';
    for (const [id, p] of room.players.entries()) {
      io.to(id).emit('wager:collect-start', { yourScore: p.score, text: q.text });
    }
    io.to(room.hostSocketId).emit('host:wager-collect-start', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      submittedCount: 0,
      totalPlayers: room.players.size,
      players: publicPlayerList(room),
    });
  } else if (q.type === 'song_guess') {
    room.state = 'song-ready';
    room.songTier = 0;
    io.to(room.code).emit('song:ready', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      text: q.text,
      audioFile: q.audioFile,
    });
    io.to(room.hostSocketId).emit('host:song-ready', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      audioFile: q.audioFile,
      tierPoints: getTierPoints(q),
      submittedCount: 0,
      totalPlayers: room.players.size,
      players: publicPlayerList(room),
    });
  } else {
    room.state = 'question';
    io.to(room.code).emit('question:show', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      ...questionForPlayer(q, room),
    });
    io.to(room.hostSocketId).emit('host:question-live', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      question: { ...q, options: getQuestionOptions(q, room) },
      submittedCount: 0,
      totalPlayers: room.players.size,
      players: publicPlayerList(room),
    });
  }
}

// Re-sends whatever the room's current phase would normally show a freshly
// arriving player, so a reconnecting player's screen "catches up" to the
// live game state instead of getting stuck on the join screen.
function sendCurrentPhaseTo(socket, room, player) {
  const alreadyAnswered =
    player.answer !== null && ['question', 'wager-question', 'song-tier'].includes(room.state);
  if (alreadyAnswered) {
    socket.emit('rejoin:show-submitted');
    return;
  }

  const q = room.currentIndex >= 0 ? currentQuestion(room) : null;
  switch (room.state) {
    case 'lobby':
      socket.emit('rejoin:show-waiting');
      break;
    case 'question':
      socket.emit('question:show', {
        number: room.currentIndex + 1,
        total: room.questions.length,
        ...questionForPlayer(q, room),
      });
      break;
    case 'wager-collect':
      socket.emit('wager:collect-start', { yourScore: player.score, text: q.text });
      break;
    case 'wager-question':
      socket.emit('question:show', {
        number: room.currentIndex + 1,
        total: room.questions.length,
        type: 'wager',
        text: q.text,
        options: [],
        points: 0,
        yourWager: player.wager,
      });
      break;
    case 'song-ready':
      socket.emit('song:ready', {
        number: room.currentIndex + 1,
        total: room.questions.length,
        text: q.text,
        audioFile: q.audioFile,
      });
      break;
    case 'song-tier':
      socket.emit('song:tier-start', {
        tier: room.songTier,
        points: getTierPoints(q)[room.songTier - 1],
        audioFile: q.audioFile,
      });
      break;
    case 'reveal':
      socket.emit('rejoin:show-waiting');
      break;
    case 'ended':
      socket.emit('game:ended', { leaderboard: leaderboard(room) });
      break;
    default:
      socket.emit('rejoin:show-waiting');
  }
}

// ---------- Static files ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/host-info', (req, res) => {
  res.json({ ip: getLanIp(), port: PORT });
});

// Simple health check endpoint - useful for an uptime pinger (e.g. UptimeRobot,
// cron-job.org) to keep a free hosted instance from going to sleep.
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  // ---- HOST EVENTS ----
  socket.on('host:list-packs', (_data, cb) => {
    try {
      cb({ ok: true, packs: listPacks() });
    } catch (err) {
      cb({ ok: false, error: 'Gagal membaca folder packs/.', packs: [] });
    }
  });

  socket.on('host:create-room', ({ packId } = {}, cb) => {
    let packs;
    try {
      packs = listPacks();
    } catch (err) {
      return cb({ ok: false, error: 'Gagal membaca folder packs/.' });
    }
    if (packs.length === 0) {
      return cb({ ok: false, error: 'Tidak ada paket soal ditemukan di folder packs/.' });
    }
    const chosenId = packs.some((p) => p.id === packId) ? packId : packs[0].id;
    const pack = loadPack(chosenId);

    const code = generateRoomCode();
    const room = {
      code,
      hostSocketId: socket.id,
      state: 'lobby',
      packId: chosenId,
      questions: pack.questions,
      currentIndex: -1,
      songTier: 0,
      players: new Map(),
    };
    rooms[code] = room;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;

    // Build the join URL from the actual request the host's browser used to
    // load the dashboard. This makes it work automatically whether it's
    // opened via a local Wi-Fi IP (http://192.168.x.x:3000) or a hosted
    // public URL (https://your-app.onrender.com / .up.railway.app) - no code
    // changes needed.
    const headers = socket.handshake.headers;
    const forwardedProto = headers['x-forwarded-proto'];
    const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : 'http';
    const hostHeader = headers.host || `${getLanIp()}:${PORT}`;
    const joinUrl = `${protocol}://${hostHeader}/player.html?room=${code}`;

    QRCode.toDataURL(joinUrl, { margin: 1, width: 300 }, (err, qrDataUrl) => {
      cb({
        ok: true,
        roomCode: code,
        joinUrl,
        qrDataUrl: err ? null : qrDataUrl,
        totalQuestions: room.questions.length,
        packName: pack.name,
      });
    });
  });

  socket.on('host:start-game', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    room.currentIndex = 0;
    io.to(room.code).emit('game:started');
    advanceToCurrentQuestion(room);
  });

  socket.on('host:end-timer', () => {
    // Host manually decides time's up; just notify players input is closing.
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(room.code).emit('question:locked');
  });

  socket.on('host:reveal', ({ correctAnswer }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    const q = currentQuestion(room);
    if (q.type === 'wager' || q.type === 'song_guess') return; // these use their own finalize events
    room.state = 'reveal';

    // If the question pack already has a preset correctAnswer (multiple_choice
    // / true_false), use that automatically - the host doesn't have to pick
    // it manually. Falls back to whatever the host selected on the dashboard
    // for older/custom questions that don't have a preset key.
    const hasPresetKey = q.correctAnswer !== undefined && q.correctAnswer !== null && q.correctAnswer !== '';
    const finalCorrectAnswer = q.type === 'short_answer'
      ? q.correctAnswer
      : (hasPresetKey ? q.correctAnswer : correctAnswer);

    if (q.type === 'survey') {
      // Group players by the target they voted for. Everyone whose vote
      // matches at least one other player's vote earns points - once per
      // other matching voter (not counting themselves).
      const groups = new Map(); // answer -> array of playerIds
      for (const [id, p] of room.players.entries()) {
        if (p.answer === null) continue;
        if (!groups.has(p.answer)) groups.set(p.answer, []);
        groups.get(p.answer).push(id);
      }
      for (const [id, p] of room.players.entries()) {
        if (p.answer === null) {
          p.matches = 0;
          p.correct = null;
          continue;
        }
        const group = groups.get(p.answer) || [];
        const matches = Math.max(0, group.length - 1);
        p.matches = matches;
        p.correct = null;
        p.score += matches * q.points;
      }
    } else if (q.type === 'short_answer') {
      const key = normalizeAnswer(finalCorrectAnswer);
      for (const p of room.players.values()) {
        const isCorrect = p.answer !== null && normalizeAnswer(p.answer) === key;
        p.correct = isCorrect;
        if (isCorrect) p.score += q.points;
      }
    } else {
      for (const p of room.players.values()) {
        const isCorrect = p.answer === finalCorrectAnswer;
        p.correct = isCorrect;
        if (isCorrect) p.score += q.points;
      }
    }

    const board = leaderboard(room);
    const isLast = room.currentIndex >= room.questions.length - 1;

    // Send each player their own result
    for (const [id, p] of room.players.entries()) {
      io.to(id).emit('question:reveal', {
        correctAnswer: q.type === 'survey' ? null : finalCorrectAnswer,
        yourAnswer: p.answer,
        yourResult: q.type === 'survey' ? null : p.correct,
        yourMatches: q.type === 'survey' ? p.matches : undefined,
        yourScore: p.score,
        leaderboard: board,
      });
    }
    io.to(room.hostSocketId).emit('host:revealed', {
      leaderboard: board,
      isLast,
      players: publicPlayerList(room),
    });
  });

  socket.on('host:next-question', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.currentIndex >= room.questions.length - 1) return;
    room.currentIndex += 1;
    advanceToCurrentQuestion(room);
  });

  socket.on('host:end-game', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    room.state = 'ended';
    const board = leaderboard(room);
    io.to(room.code).emit('game:ended', { leaderboard: board });
  });

  // ---- WAGER ROUND (final round) ----
  socket.on('host:proceed-to-wager-question', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.state !== 'wager-collect') return;
    const q = currentQuestion(room);
    // Anyone who didn't place a bet defaults to a wager of 0 (can't win/lose points).
    for (const p of room.players.values()) {
      if (p.wager === null || p.wager === undefined) p.wager = 0;
    }
    room.state = 'wager-question';
    for (const [id, p] of room.players.entries()) {
      io.to(id).emit('question:show', {
        number: room.currentIndex + 1,
        total: room.questions.length,
        type: 'wager',
        text: q.text,
        options: [],
        points: 0,
        yourWager: p.wager,
      });
    }
    io.to(room.hostSocketId).emit('host:wager-question-live', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      submittedCount: 0,
      totalPlayers: room.players.size,
      players: Array.from(room.players.entries()).map(([id, p]) => ({
        id, name: p.name, wager: p.wager, answerText: null, hasAnswered: false,
      })),
    });
  });

  socket.on('host:finalize-wager', ({ winnerIds }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    const q = currentQuestion(room);
    if (q.type !== 'wager' || room.state !== 'wager-question') return;
    room.state = 'reveal';

    const winners = new Set(winnerIds || []);
    for (const [id, p] of room.players.entries()) {
      const wager = p.wager || 0;
      if (winners.has(id)) {
        p.wagerWin = true;
        p.score += wager * 2;
      } else {
        p.wagerWin = false;
        p.score -= wager;
      }
    }

    const board = leaderboard(room);
    const isLast = room.currentIndex >= room.questions.length - 1;

    for (const [id, p] of room.players.entries()) {
      io.to(id).emit('question:reveal', {
        isWager: true,
        yourWager: p.wager || 0,
        yourResult: p.wagerWin,
        yourAnswer: p.answer,
        yourScore: p.score,
        leaderboard: board,
      });
    }
    io.to(room.hostSocketId).emit('host:revealed', {
      leaderboard: board,
      isLast,
      players: publicPlayerList(room),
    });
  });

  // ---- SONG GUESS ROUND ----
  socket.on('host:song-play-tier', ({ tier }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    const q = currentQuestion(room);
    if (q.type !== 'song_guess') return;
    if (room.state !== 'song-ready' && room.state !== 'song-tier') return;
    const t = Math.max(1, Math.min(5, Math.floor(tier)));
    if (t < room.songTier) return; // can't go backwards
    room.songTier = t;
    room.state = 'song-tier';
    const points = getTierPoints(q)[t - 1];

    // Broadcast to the room - players who already answered simply ignore this
    // (their screen stays on "answer submitted"). Each player's own phone
    // also plays the same clip, capped to the same tier duration as the host.
    io.to(room.code).emit('song:tier-start', { tier: t, points, audioFile: q.audioFile });

    const submittedCount = Array.from(room.players.values()).filter((p) => p.answer !== null).length;
    io.to(room.hostSocketId).emit('host:song-tier-update', {
      tier: t,
      submittedCount,
      totalPlayers: room.players.size,
      players: publicPlayerList(room),
    });
  });

  socket.on('host:finalize-song', ({ correctIds }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    const q = currentQuestion(room);
    if (q.type !== 'song_guess' || room.state !== 'song-tier') return;
    room.state = 'reveal';

    const tierPoints = getTierPoints(q);
    const correctSet = new Set(correctIds || []);
    const earned = {};

    for (const [id, p] of room.players.entries()) {
      if (p.answer === null) {
        p.correct = false;
        earned[id] = 0;
        continue;
      }
      const isCorrect = correctSet.has(id);
      p.correct = isCorrect;
      const tier = p.songTier || 5;
      const pts = isCorrect ? (tierPoints[tier - 1] || 0) : 0;
      earned[id] = pts;
      if (isCorrect) p.score += pts;
    }

    const board = leaderboard(room);
    const isLast = room.currentIndex >= room.questions.length - 1;

    for (const [id, p] of room.players.entries()) {
      io.to(id).emit('question:reveal', {
        isSong: true,
        yourAnswer: p.answer,
        yourResult: p.answer === null ? null : p.correct,
        yourTier: p.songTier,
        yourPointsEarned: earned[id],
        yourScore: p.score,
        leaderboard: board,
      });
    }
    io.to(room.hostSocketId).emit('host:revealed', {
      leaderboard: board,
      isLast,
      players: publicPlayerList(room),
    });
  });

  // ---- PLAYER EVENTS ----
  socket.on('player:join', ({ roomCode, name }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb({ ok: false, error: 'Room tidak ditemukan. Cek Room Code.' });
    if (room.state !== 'lobby') return cb({ ok: false, error: 'Permainan sudah dimulai.' });
    const trimmed = (name || '').trim();
    if (!trimmed) return cb({ ok: false, error: 'Nama tidak boleh kosong.' });
    const nameTaken = Array.from(room.players.values()).some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (nameTaken) return cb({ ok: false, error: 'Nama sudah dipakai peserta lain.' });

    const playerId = generatePlayerId();
    room.players.set(playerId, {
      name: trimmed, score: 0, answer: null, correct: false, matches: 0,
      wager: null, wagerWin: null, songTier: null, connected: true, disconnectTimer: null,
    });
    socket.join(roomCode);
    socket.join(playerId);
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;
    socket.data.isHost = false;

    cb({ ok: true, playerId });
    io.to(room.hostSocketId).emit('host:player-list', publicPlayerList(room));
  });

  // A player's browser reconnected (screen unlocked, came back from
  // WhatsApp, Wi-Fi blip, etc.) and is presenting the playerId it saved from
  // its original join, asking to resume the same seat instead of starting
  // over as a brand new player.
  socket.on('player:rejoin', ({ roomCode, playerId }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb({ ok: false, error: 'Room sudah tidak ada.' });
    const p = room.players.get(playerId);
    if (!p) return cb({ ok: false, error: 'Sesi sudah berakhir, silakan join lagi.' });

    if (p.disconnectTimer) {
      clearTimeout(p.disconnectTimer);
      p.disconnectTimer = null;
    }
    p.connected = true;

    socket.join(roomCode);
    socket.join(playerId);
    socket.data.roomCode = roomCode;
    socket.data.playerId = playerId;
    socket.data.isHost = false;

    cb({ ok: true, name: p.name, score: p.score });
    io.to(room.hostSocketId).emit('host:player-list', publicPlayerList(room));
    sendCurrentPhaseTo(socket, room, p);
  });

  socket.on('player:submit-wager', ({ amount }, cb) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.state !== 'wager-collect') return cb && cb({ ok: false, error: 'Bukan waktunya bertaruh.' });
    const p = room.players.get(socket.data.playerId);
    if (!p) return cb && cb({ ok: false });
    if (p.wager !== null && p.wager !== undefined) return cb && cb({ ok: false, error: 'Taruhan sudah dikirim.' });
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt < 0 || amt > p.score) {
      return cb && cb({ ok: false, error: `Taruhan harus antara 0 - ${p.score}.` });
    }
    p.wager = amt;
    cb && cb({ ok: true });

    const submittedCount = Array.from(room.players.values()).filter((pl) => pl.wager !== null).length;
    io.to(room.hostSocketId).emit('host:wager-collect-update', {
      submittedCount,
      totalPlayers: room.players.size,
      players: publicPlayerList(room),
    });
  });

  socket.on('player:submit-answer', ({ answer }, cb) => {
    const room = rooms[socket.data.roomCode];
    if (!room || !['question', 'wager-question', 'song-tier'].includes(room.state)) {
      return cb && cb({ ok: false });
    }
    const p = room.players.get(socket.data.playerId);
    if (!p || p.answer !== null) return cb && cb({ ok: false });
    p.answer = answer;
    if (room.state === 'song-tier') p.songTier = room.songTier;
    cb && cb({ ok: true });

    const submittedCount = Array.from(room.players.values()).filter((pl) => pl.answer !== null).length;
    const q = currentQuestion(room);

    if (room.state === 'wager-question') {
      io.to(room.hostSocketId).emit('host:wager-question-update', {
        submittedCount,
        totalPlayers: room.players.size,
        players: Array.from(room.players.entries()).map(([id, pl]) => ({
          id, name: pl.name, wager: pl.wager || 0, answerText: pl.answer, hasAnswered: pl.answer !== null,
        })),
      });
      return;
    }

    if (room.state === 'song-tier') {
      io.to(room.hostSocketId).emit('host:song-tier-update', {
        tier: room.songTier,
        submittedCount,
        totalPlayers: room.players.size,
        players: publicPlayerList(room),
      });
      return;
    }

    const payload = {
      submittedCount,
      totalPlayers: room.players.size,
      players: publicPlayerList(room),
    };
    if (q && q.type === 'short_answer') {
      payload.shortAnswers = Array.from(room.players.entries())
        .filter(([, pl]) => pl.answer !== null)
        .map(([id, pl]) => ({ id, name: pl.name, answerText: pl.answer }));
    }
    io.to(room.hostSocketId).emit('host:submission-update', payload);
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    const room = rooms[roomCode];
    if (!room) return;

    if (socket.data.isHost) {
      // Host disconnected - notify players (room stays alive briefly in case of reconnect)
      io.to(room.code).emit('host:disconnected');
      return;
    }

    const playerId = socket.data.playerId;
    if (!playerId) return;
    const p = room.players.get(playerId);
    if (!p) return;

    // Don't remove the player immediately - their phone might just be
    // locked or they switched apps for a minute. Mark them as disconnected
    // (host sees a "terputus" badge) and hold their seat + score for a grace
    // period in case they come back via player:rejoin.
    p.connected = false;
    io.to(room.hostSocketId).emit('host:player-list', publicPlayerList(room));

    if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
    p.disconnectTimer = setTimeout(() => {
      const stillThere = room.players.get(playerId);
      if (stillThere && !stillThere.connected) {
        room.players.delete(playerId);
        io.to(room.hostSocketId).emit('host:player-list', publicPlayerList(room));
      }
    }, RECONNECT_GRACE_MS);
  });
});

server.listen(PORT, () => {
  const ip = getLanIp();
  console.log('==================================================');
  console.log(' Vacation Trivia Night server berjalan!');
  console.log(` Host Dashboard : http://localhost:${PORT}/host.html`);
  console.log(` Player join    : http://${ip}:${PORT}/player.html`);
  console.log(' Pastikan semua HP terhubung ke Wi-Fi yang sama.');
  console.log('==================================================');
});
