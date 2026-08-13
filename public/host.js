const socket = io();

const screens = {
  setup: document.getElementById('screen-setup'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  song: document.getElementById('screen-song'),
  wagerCollect: document.getElementById('screen-wager-collect'),
  wagerQuestion: document.getElementById('screen-wager-question'),
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
    const badgeText = p.submitted ? `✓ ${escapeHtml(String(p.answer))}` : 'menunggu';
    li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="badge ${p.submitted ? 'done' : ''}">${badgeText}</span>`;
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

// ---------- SONG GUESS ROUND ----------
let songTierPoints = [50, 40, 30, 20, 10];
let songPlayersState = [];
let songCurrentTier = 0;

socket.on('host:song-ready', (data) => {
  currentQuestion = { type: 'song_guess' };
  songTierPoints = data.tierPoints || songTierPoints;
  songCurrentTier = 0;
  songPlayersState = data.players || [];

  const audio = document.getElementById('song-audio');
  audio.src = `/audio/${data.audioFile}`;
  audio.currentTime = 0;

  document.getElementById('song-tier-label').textContent = 'Belum diputar - klik salah satu tombol di bawah';
  document.getElementById('song-submit-count').textContent = `${data.submittedCount} / ${data.totalPlayers} sudah menjawab`;
  renderSongTierButtons();
  renderSongJudgeList(songPlayersState);
  showScreen('song');
});

function renderSongTierButtons() {
  const wrap = document.getElementById('song-tier-buttons');
  wrap.innerHTML = '';
  for (let t = 1; t <= 5; t++) {
    const btn = document.createElement('button');
    btn.textContent = `▶ ${t} detik (${songTierPoints[t - 1]} poin)`;
    btn.disabled = t < songCurrentTier; // can replay current/next, not go backwards
    btn.addEventListener('click', () => playSongTier(t));
    wrap.appendChild(btn);
  }
}

function playSongTier(tier) {
  const audio = document.getElementById('song-audio');
  audio.currentTime = 0;
  audio.play().catch(() => {
    alert('Klik tombol lagi kalau audio tidak otomatis putar (browser kadang perlu 1x klik dulu).');
  });
  clearTimeout(window.__songStopTimer);
  window.__songStopTimer = setTimeout(() => audio.pause(), tier * 1000);
  socket.emit('host:song-play-tier', { tier });
}

socket.on('host:song-tier-update', (data) => {
  songCurrentTier = data.tier;
  songPlayersState = data.players;
  document.getElementById('song-tier-label').textContent = `Tier saat ini: ${data.tier} detik (${songTierPoints[data.tier - 1]} poin)`;
  document.getElementById('song-submit-count').textContent = `${data.submittedCount} / ${data.totalPlayers} sudah menjawab`;
  renderSongTierButtons();
  const checkedIds = new Set(
    Array.from(document.querySelectorAll('#song-judge-list input[type=checkbox]:checked')).map((el) => el.dataset.id)
  );
  renderSongJudgeList(songPlayersState, checkedIds);
});

function renderSongJudgeList(players, checkedIds) {
  const wrap = document.getElementById('song-judge-list');
  wrap.innerHTML = '';
  if (!players || players.length === 0) {
    wrap.innerHTML = '<p class="hint">Menunggu peserta menjawab...</p>';
    return;
  }
  players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'short-answer-row';
    const answerLabel = p.submitted ? `"${escapeHtml(String(p.answer))}"` : '<em>belum menjawab</em>';
    const isChecked = checkedIds && checkedIds.has(p.id);
    row.innerHTML = `
      <span class="txt">${escapeHtml(p.name)} — ${answerLabel}</span>
      <label style="display:flex;align-items:center;gap:4px;">
        <input type="checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''} ${p.submitted ? '' : 'disabled'} />
        Benar
      </label>
    `;
    wrap.appendChild(row);
  });
}

document.getElementById('btn-finalize-song').addEventListener('click', () => {
  const audio = document.getElementById('song-audio');
  audio.pause();
  clearTimeout(window.__songStopTimer);
  const correctIds = Array.from(document.querySelectorAll('#song-judge-list input[type=checkbox]:checked')).map(
    (el) => el.dataset.id
  );
  socket.emit('host:finalize-song', { correctIds });
});

document.getElementById('btn-proceed-wager').addEventListener('click', () => {
  socket.emit('host:proceed-to-wager-question');
});

socket.on('host:wager-collect-start', (data) => {
  currentQuestion = { type: 'wager' };
  document.getElementById('wager-collect-count').textContent =
    `${data.submittedCount} / ${data.totalPlayers} sudah pasang taruhan`;
  renderWagerCollectList(data.players);
  showScreen('wagerCollect');
});

socket.on('host:wager-collect-update', (data) => {
  document.getElementById('wager-collect-count').textContent =
    `${data.submittedCount} / ${data.totalPlayers} sudah pasang taruhan`;
  renderWagerCollectList(data.players);
});

function renderWagerCollectList(players) {
  const list = document.getElementById('wager-collect-list');
  if (!list) return;
  list.innerHTML = '';
  players.forEach((p) => {
    const li = document.createElement('li');
    // `submitted` here reflects whether an answer was set, which is not used
    // during the wager phase - we rely on the count text above instead, and
    // just list names so the host can see who's at the table.
    li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="badge">skor: ${p.score}</span>`;
    list.appendChild(li);
  });
}

let wagerPlayersState = [];

socket.on('host:wager-question-live', (data) => {
  document.getElementById('wager-submit-count').textContent =
    `${data.submittedCount} / ${data.totalPlayers} sudah menjawab`;
  wagerPlayersState = data.players;
  renderWagerJudgeList(wagerPlayersState);
  showScreen('wagerQuestion');
});

socket.on('host:wager-question-update', (data) => {
  document.getElementById('wager-submit-count').textContent =
    `${data.submittedCount} / ${data.totalPlayers} sudah menjawab`;
  // Preserve which checkboxes were already ticked before re-rendering.
  const checkedIds = new Set(
    Array.from(document.querySelectorAll('#wager-judge-list input[type=checkbox]:checked')).map((el) => el.dataset.id)
  );
  wagerPlayersState = data.players;
  renderWagerJudgeList(wagerPlayersState, checkedIds);
});

function renderWagerJudgeList(players, checkedIds) {
  const wrap = document.getElementById('wager-judge-list');
  wrap.innerHTML = '';
  players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'short-answer-row';
    const answerLabel = p.hasAnswered ? `"${escapeHtml(p.answerText)}"` : '<em>belum menjawab</em>';
    const isChecked = checkedIds && checkedIds.has(p.id);
    row.innerHTML = `
      <span class="txt">${escapeHtml(p.name)} (taruhan: ${p.wager}) — ${answerLabel}</span>
      <label style="display:flex;align-items:center;gap:4px;">
        <input type="checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''} />
        Menang
      </label>
    `;
    wrap.appendChild(row);
  });
}

document.getElementById('btn-finalize-wager').addEventListener('click', () => {
  const winnerIds = Array.from(document.querySelectorAll('#wager-judge-list input[type=checkbox]:checked')).map(
    (el) => el.dataset.id
  );
  socket.emit('host:finalize-wager', { winnerIds });
});

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
