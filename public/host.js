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

// ---------- PACK SELECTION ----------
let selectedPackId = null;

socket.emit('host:list-packs', {}, (res) => {
  if (!res.ok) {
    document.getElementById('pack-list').innerHTML = `<p class="hint">Gagal memuat daftar paket soal: ${escapeHtml(res.error || '')}</p>`;
    return;
  }
  renderPackList(res.packs);
});

function renderPackList(packs) {
  const wrap = document.getElementById('pack-list');
  wrap.innerHTML = '';
  if (!packs || packs.length === 0) {
    wrap.innerHTML = '<p class="hint">Tidak ada paket soal ditemukan di folder packs/.</p>';
    return;
  }
  packs.forEach((pack, idx) => {
    const btn = document.createElement('button');
    btn.className = 'btn-secondary';
    btn.innerHTML = `<strong>${escapeHtml(pack.name)}</strong><br><span class="hint">${escapeHtml(pack.description || '')} — ${pack.questionCount} soal</span>`;
    btn.addEventListener('click', () => {
      selectedPackId = pack.id;
      Array.from(wrap.children).forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('btn-create-room').disabled = false;
    });
    wrap.appendChild(btn);
    if (idx === 0) btn.click(); // auto-select the first pack by default
  });
}

document.getElementById('btn-create-room').addEventListener('click', () => {
  if (!selectedPackId) return;
  socket.emit('host:create-room', { packId: selectedPackId }, (res) => {
    if (!res.ok) {
      alert(res.error || 'Gagal membuat room.');
      return;
    }
    document.getElementById('lobby-room-code').textContent = res.roomCode;
    document.getElementById('lobby-join-url').textContent = res.joinUrl;
    document.getElementById('lobby-pack-name').textContent = `Paket soal: ${res.packName}`;
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
    const badge = p.connected === false ? '<span class="badge">🔌 terputus</span>' : '<span class="badge">siap</span>';
    li.innerHTML = `<span>${escapeHtml(p.name)}</span>${badge}`;
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
    `${currentQuestion.label || 'Soal'} — ${typeLabels[currentQuestion.type] || currentQuestion.type}`;
  document.getElementById('game-q-text').textContent = currentQuestion.text || '';
  const imgWrap = document.getElementById('game-q-image-wrap');
  const imgEl = document.getElementById('game-q-image');
  const imageSrc = currentQuestion.image || currentQuestion.imageFile;
  if (imgWrap && imgEl) {
    if (imageSrc) {
      imgEl.src = imageSrc.startsWith('http') || imageSrc.startsWith('/') ? imageSrc : `/images/${imageSrc}`;
      imgWrap.style.display = 'flex';
    } else {
      imgWrap.style.display = 'none';
      imgEl.src = '';
    }
  }
  document.getElementById('game-submit-count').textContent =
    `${data.submittedCount} / ${data.totalPlayers} sudah submit`;
  updateGamePlayerList(data.players || []);

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
    // multiple_choice / true_false
    document.getElementById('mc-correct-wrap').style.display = 'block';
    const hasPresetKey = currentQuestion.correctAnswer !== undefined && currentQuestion.correctAnswer !== null && currentQuestion.correctAnswer !== '';
    const wrap = document.getElementById('mc-correct-buttons');
    if (hasPresetKey) {
      // The pack already has an answer key - host doesn't need to pick it manually.
      wrap.innerHTML = `<p class="hint">Kunci jawaban: <b>${escapeHtml(currentQuestion.correctAnswer)}</b> (otomatis dari paket soal)</p>`;
      selectedCorrect = currentQuestion.correctAnswer;
    } else {
      // No preset key on this question - host picks it manually (legacy behavior).
      wrap.innerHTML = '<p class="hint">Pilih jawaban yang benar lalu klik Reveal:</p>';
      const btnGrid = document.createElement('div');
      btnGrid.className = 'answer-grid';
      currentQuestion.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.addEventListener('click', () => {
          selectedCorrect = opt;
          Array.from(btnGrid.children).forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
        btnGrid.appendChild(btn);
      });
      wrap.appendChild(btnGrid);
    }
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
    const discBadge = p.connected === false ? ' 🔌' : '';
    const badgeText = p.submitted ? `✓ ${escapeHtml(String(p.answer))}` : 'menunggu';
    li.innerHTML = `<span>${escapeHtml(p.name)}${discBadge}</span><span class="badge ${p.submitted ? 'done' : ''}">${badgeText}</span>`;
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

// ---------- SONG GUESS ROUND ----------
let songTierPoints = [50, 40, 30, 20, 10];
let songCurrentTier = 0;
let currentSongHostText = '';

socket.on('host:song-ready', (data) => {
  currentQuestion = { type: 'song_guess' };
  songTierPoints = data.tierPoints || songTierPoints;
  songCurrentTier = 0;
  currentSongHostText = data.text || '';
  document.getElementById('song-host-text').textContent = currentSongHostText;

  const audio = document.getElementById('song-audio');
  audio.onerror = () => {
    const code = audio.error ? audio.error.code : 'unknown';
    console.error('Gagal memuat file audio:', audio.src, 'error code:', code);
    document.getElementById('song-tier-label').textContent =
      `⚠️ File audio "${data.audioFile}" tidak ditemukan / gagal dimuat. Cek nama file di public/audio/ ` +
      `(huruf besar/kecil harus PERSIS SAMA kalau sudah di-hosting online).`;
  };
  audio.src = `/audio/${data.audioFile}`;
  audio.load();

  document.getElementById('song-tier-label').textContent = 'Belum diputar - klik salah satu tombol di bawah';
  document.getElementById('song-submit-count').textContent = `${data.submittedCount} / ${data.totalPlayers} sudah menjawab`;
  renderSongTierButtons();
  renderSongJudgeList(data.players || []);
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

  // Clear any pending auto-pause from a previous tier FIRST, so it can't fire
  // mid-way through this new play() call and cause a spurious AbortError.
  clearTimeout(window.__songStopTimer);

  const startPlayback = () => {
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        // AbortError happens when a play() request gets interrupted by another
        // play()/pause() call in quick succession (e.g. double-clicking a tier
        // button) - it's harmless, the newer request is the one that matters.
        if (err && err.name === 'AbortError') return;
        console.error('Gagal memutar audio:', err);
        alert(
          `Gagal memutar lagu (${err && err.name ? err.name : 'unknown error'}).\n\n` +
          `Kemungkinan penyebab:\n` +
          `- File "${audio.src.split('/').pop()}" belum ada / salah nama di folder public/audio/\n` +
          `- Kalau sudah di-hosting online: nama file harus PERSIS SAMA besar-kecil hurufnya\n` +
          `  (lokal di Windows/Mac tidak masalah, tapi Render/Railway peduli huruf besar-kecil).`
        );
      });
    }
    window.__songStopTimer = setTimeout(() => audio.pause(), tier * 1000);
  };

  if (audio.readyState >= 2) {
    startPlayback();
  } else {
    audio.addEventListener('canplay', startPlayback, { once: true });
  }

  socket.emit('host:song-play-tier', { tier });
}

socket.on('host:song-tier-update', (data) => {
  songCurrentTier = data.tier;
  document.getElementById('song-tier-label').textContent = `Tier saat ini: ${data.tier} detik (${songTierPoints[data.tier - 1]} poin)`;
  document.getElementById('song-submit-count').textContent = `${data.submittedCount} / ${data.totalPlayers} sudah menjawab`;
  renderSongTierButtons();
  const checkedIds = new Set(
    Array.from(document.querySelectorAll('#song-judge-list input[type=checkbox]:checked')).map((el) => el.dataset.id)
  );
  renderSongJudgeList(data.players, checkedIds);
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

// ---------- WAGER ROUND ----------
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
