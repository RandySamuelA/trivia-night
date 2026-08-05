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

// ---------- Load question bank ----------
function loadQuestions() {
  const raw = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf-8');
  return JSON.parse(raw);
}

// ---------- In-memory state ----------
// rooms[code] = {
//   code, hostSocketId, state: 'lobby'|'question'|'reveal'|'ended',
//   questions, currentIndex, players: Map(socketId -> {name, score, answer, judged, correct}),
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

function publicPlayerList(room) {
  return Array.from(room.players.entries()).map(([id, p]) => ({
    id,
    name: p.name,
    score: p.score,
    submitted: p.answer !== null,
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


function questionForPlayer(q) {
  // Players never see the question text/title (that's on the PowerPoint).
  // They only see the answer input matching the question type.
  return {
    index: undefined,
    type: q.type,
    options: q.options,
    points: q.points,
  };
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
      players: new Map(),
    };
    rooms[code] = room;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.isHost = true;

    // Build the join URL from the actual request the host's browser used to
    // load the dashboard. This makes it work automatically whether it's
    // opened via a local Wi-Fi IP (http://192.168.x.x:3000) or a hosted
    // public URL (https://your-app.onrender.com) - no code changes needed.
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
    room.state = 'question';
    room.currentIndex = 0;
    for (const p of room.players.values()) {
      p.answer = null;
      p.judged = false;
      p.correct = false;
    }
    const q = currentQuestion(room);
    io.to(room.code).emit('game:started');
    io.to(room.code).emit('question:show', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      ...questionForPlayer(q),
    });
    io.to(room.hostSocketId).emit('host:question-live', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      question: q,
      submittedCount: 0,
      totalPlayers: room.players.size,
    });
  });

  socket.on('host:end-timer', () => {
    // Host manually decides time's up; just notify players input is closing.
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    io.to(room.code).emit('question:locked');
  });

  socket.on('host:judge-short-answer', () => {
    // No longer used: short_answer is now graded automatically against
    // the question's `correctAnswer` key (see host:reveal). Kept as a
    // no-op for backward compatibility with any older client caches.
  });

  socket.on('host:reveal', ({ correctAnswer }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    const q = currentQuestion(room);
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
        leaderboard: board.slice(0, 5),
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
    room.state = 'question';
    for (const p of room.players.values()) {
      p.answer = null;
      p.judged = false;
      p.correct = false;
    }
    const q = currentQuestion(room);
    io.to(room.code).emit('question:show', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      ...questionForPlayer(q),
    });
    io.to(room.hostSocketId).emit('host:question-live', {
      number: room.currentIndex + 1,
      total: room.questions.length,
      question: q,
      submittedCount: 0,
      totalPlayers: room.players.size,
    });
  });

  socket.on('host:end-game', () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.hostSocketId !== socket.id) return;
    room.state = 'ended';
    const board = leaderboard(room);
    io.to(room.code).emit('game:ended', { leaderboard: board });
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

    room.players.set(socket.id, { name: trimmed, score: 0, answer: null, judged: false, correct: false });
    socket.join(roomCode);
    socket.data.roomCode = roomCode;
    socket.data.isHost = false;

    cb({ ok: true });
    io.to(room.hostSocketId).emit('host:player-list', publicPlayerList(room));
  });

  socket.on('player:submit-answer', ({ answer }, cb) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.state !== 'question') return cb && cb({ ok: false });
    const p = room.players.get(socket.id);
    if (!p || p.answer !== null) return cb && cb({ ok: false });
    p.answer = answer;
    cb && cb({ ok: true });

    const submittedCount = Array.from(room.players.values()).filter((pl) => pl.answer !== null).length;
    const q = currentQuestion(room);
    const payload = {
      submittedCount,
      totalPlayers: room.players.size,
      players: publicPlayerList(room),
    };
    if (q && q.type === 'short_answer') {
      payload.shortAnswers = Array.from(room.players.entries())
        .filter(([, pl]) => pl.answer !== null)
        .map(([id, pl]) => ({ id, name: pl.name, answerText: pl.answer, judged: pl.judged }));
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
