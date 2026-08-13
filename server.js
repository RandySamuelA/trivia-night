const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DEFAULT_TIER_POINTS = [50, 40, 30, 20, 10];

// ---------- Load question bank ----------
function loadQuestions() {
  const raw = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf-8');
  return JSON.parse(raw);
}

// ---------- In-memory state ----------
// rooms[code] = {
//   code, hostSocketId,
//   state: 'lobby'|'question'|'wager-collect'|'wager-question'|'song-ready'|'song-tier'|'reveal'|'ended',
//   questions, currentIndex, songTier,
//   players: Map(socketId -> {name, score, answer, correct, matches, wager, wagerWin, songTier}),
// }
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
// for the current question, across every question type.
function publicPlayerList(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({
    id,
    name: p.name,
    score: p.score,
    submitted: p.answer !== null,
    answer: p.answer,
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

// For "survey" questions, the vote options are NOT hardcoded in questions.json -
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
  // Players never see the question text/title (that's on the PowerPoint).
  // They only see the answer input matching the question type.
  return {
    type: q.type,
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
      io.to(id).emit('wager:collect-start', { yourScore: p.score });
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
  socket.on('host:create-room', (_data, cb) => {
    const code = generateRoomCode();
    const room = {
      code,
      hostSocketId: socket.id,
      state: 'lobby',
      questions: loadQuestions(),
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
      const key = normalizeAnswer(q.correctAnswer);
      for (const p of room.players.values()) {
        const isCorrect = p.answer !== null && normalizeAnswer(p.answer) === key;
        p.correct = isCorrect;
        if (isCorrect) p.score += q.points;
      }
    } else {
      for (const p of room.players.values()) {
        const isCorrect = p.answer === correctAnswer;
        p.correct = isCorrect;
        if (isCorrect) p.score += q.points;
      }
    }

    const board = leaderboard(room);
    const isLast = room.currentIndex >= room.questions.length - 1;

    // Send each player their own result
    for (const [id, p] of room.players.entries()) {
      io.to(id).emit('question:reveal', {
        correctAnswer: q.type === 'survey' ? null : (q.type === 'short_answer' ? q.correctAnswer : correctAnswer),
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
    // (their screen stays on "answer submitted").
    io.to(room.code).emit('song:tier-start', { tier: t, points });

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

    room.players.set(socket.id, {
      name: trimmed, score: 0, answer: null, correct: false, matches: 0,
      wager: null, wagerWin: null, songTier: null,
    });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.isHost = false;

    cb({ ok: true });
    io.to(room.hostSocketId).emit('host:player-list', publicPlayerList(room));
  });

  socket.on('player:submit-wager', ({ amount }, cb) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.state !== 'wager-collect') return cb && cb({ ok: false, error: 'Bukan waktunya bertaruh.' });
    const p = room.players.get(socket.id);
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
    const p = room.players.get(socket.id);
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
    } else if (room.players.has(socket.id)) {
      room.players.delete(socket.id);
      io.to(room.hostSocketId).emit('host:player-list', publicPlayerList(room));
    }
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
