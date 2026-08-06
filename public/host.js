const socket = io();

const screens = {
  setup: document.getElementById('screen-setup'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  revealed: document.getElementById('screen-revealed'),
  ended: document.getElementById('screen-ended'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

let currentQuestion = null;
let selectedCorrect = null;

const typeLabels = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  short_answer: 'Short Answer',
  survey: 'Survey',
};

document.getElementById('btn-create-room').addEventListener('click', () => {
  socket.emit('host:create-room', {}, (res) => {
    if (!res.ok) return;
    document.getElementById('lobby-room-code').textContent = res.roomCode;
    document.getElementById('lobby-join-url').textContent = res.joinUrl;
    if (res.qrDataUrl) document.getElementById('lobby-qr').src = res.qrDataUrl;
    showScreen('lobby');
  });
});

socket.on('host:player-list', (players) => {
  document.getElementById('lobby-player-count').textContent = `${players.length} peserta bergabung`;
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="badge">siap</span>`;
    list.appendChild(li);
  });
  document.getElementById('btn-start-game').disabled = players.length === 0;

  // Also refresh in-game player list if visible
  updateGamePlayerList(players);
});

document.getElementById('btn-start-game').addEventListener('click', () => {
  socket.emit('host:start-game');
});

socket.on('host:question-live', (data) => {
  currentQuestion = data.question;
  selectedCorrect = null;

  document.getElementById('game-q-number').textContent = data.number;
  document.getElementById('game-q-total').textContent = data.total;
  document.getElementById('game-q-points').textContent =
    currentQuestion.points > 0 ? `${currentQuestion.points} poin` : 'Survey';
  document.getElementById('game-q-type-label').textContent =
    `${currentQuestion.label || 'Soal'} — ${typeLabels[currentQuestion.type]}`;
  document.getElementById('game-submit-count').textContent =
    `${data.submittedCount} / ${data.totalPlayers} sudah submit`;

  document.getElementById('mc-correct-wrap').style.display = 'none';
  document.getElementById('short-judge-wrap').style.display = 'none';
  document.getElementById('survey-wrap').style.display = 'none';

  if (currentQuestion.type === 'short_answer') {
    document.getElementById('short-judge-wrap').style.display = 'block';
    document.getElementById('short-answer-list').innerHTML =
      `<p class="hint">Kunci jawaban: <b>${escapeHtml(currentQuestion.correctAnswer || '(belum diisi)')}</b><br>` +
      `Penilaian otomatis (huruf besar/kecil &amp; tanda baca diabaikan).</p>`;
  } else if (currentQuestion.type === 'survey') {
    document.getElementById('survey-wrap').style.display = 'block';
  } else {
    document.getElementById('mc-correct-wrap').style.display = 'block';
    const wrap = document.getElementById('mc-correct-buttons');
    wrap.innerHTML = '';
    currentQuestion.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => {
        selectedCorrect = opt;
        Array.from(wrap.children).forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      wrap.appendChild(btn);
    });
  }

  showScreen('game');
});

socket.on('host:submission-update', (data) => {
  document.getElementById('game-submit-count').textContent =
    `${data.submittedCount} / ${data.totalPlayers} sudah submit`;
  updateGamePlayerList(data.players);
  if (currentQuestion && currentQuestion.type === 'short_answer' && data.shortAnswers) {
    renderShortAnswerList(data.shortAnswers);
  }
});

function updateGamePlayerList(players) {
  const list = document.getElementById('game-player-list');
  if (!list) return;
  list.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="badge ${p.submitted ? 'done' : ''}">${p.submitted ? 'submitted' : 'menunggu'}</span>`;
    list.appendChild(li);
  });
}

document.getElementById('btn-lock-time').addEventListener('click', () => {
  socket.emit('host:end-timer');
});

document.getElementById('btn-reveal').addEventListener('click', () => {
  if (!currentQuestion) return;
  if (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'true_false') {
    if (!selectedCorrect) {
      alert('Pilih dulu jawaban yang benar.');
      return;
    }
  }
  socket.emit('host:reveal', { correctAnswer: selectedCorrect });
});

function renderShortAnswerList(shortAnswers) {
  const wrap = document.getElementById('short-answer-list');
  const keyLine = `<p class="hint">Kunci jawaban: <b>${escapeHtml(currentQuestion.correctAnswer || '(belum diisi)')}</b><br>Penilaian otomatis (huruf besar/kecil &amp; tanda baca diabaikan).</p>`;
  if (!shortAnswers || shortAnswers.length === 0) {
    wrap.innerHTML = keyLine + '<p class="hint">Menunggu peserta submit jawaban...</p>';
    return;
  }
  const rows = shortAnswers
    .map((a) => `<div class="short-answer-row"><span class="txt">${escapeHtml(a.name)}: "${escapeHtml(a.answerText)}"</span></div>`)
    .join('');
  wrap.innerHTML = keyLine + rows;
}

socket.on('host:revealed', (data) => {
  const lb = document.getElementById('revealed-leaderboard');
  lb.innerHTML = '';
  data.leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span><span class="rank">#${i + 1}</span>${escapeHtml(p.name)}</span><span>${p.score}</span>`;
    lb.appendChild(row);
  });
  document.getElementById('btn-next-question').style.display = data.isLast ? 'none' : 'block';
  showScreen('revealed');
});

document.getElementById('btn-next-question').addEventListener('click', () => {
  socket.emit('host:next-question');
});

document.getElementById('btn-end-game').addEventListener('click', () => {
  if (confirm('Akhiri permainan sekarang?')) {
    socket.emit('host:end-game');
  }
});

socket.on('game:ended', (data) => {
  const champ = data.leaderboard[0];
  document.getElementById('ended-champion-name').textContent = champ ? champ.name : '-';
  document.getElementById('ended-champion-score').textContent = champ ? `${champ.score} Point` : '';
  const lb = document.getElementById('ended-leaderboard');
  lb.innerHTML = '';
  data.leaderboard.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span>${medal} ${escapeHtml(p.name)}</span><span>${p.score}</span>`;
    lb.appendChild(row);
  });
  showScreen('ended');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
