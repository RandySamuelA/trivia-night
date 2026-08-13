const socket = io();

const screens = {
  join: document.getElementById('screen-join'),
  waiting: document.getElementById('screen-waiting'),
  songWait: document.getElementById('screen-song-wait'),
  songAnswer: document.getElementById('screen-song-answer'),
  wagerBet: document.getElementById('screen-wager-bet'),
  question: document.getElementById('screen-question'),
  submitted: document.getElementById('screen-submitted'),
  reveal: document.getElementById('screen-reveal'),
  final: document.getElementById('screen-final'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

let myName = '';
let myRoom = '';
let currentAnswer = null;

// Prefill room code from ?room= in URL
const params = new URLSearchParams(window.location.search);
if (params.get('room')) {
  document.getElementById('input-room').value = params.get('room');
}

document.getElementById('btn-join').addEventListener('click', () => {
  const room = document.getElementById('input-room').value.trim();
  const name = document.getElementById('input-name').value.trim();
  const errorEl = document.getElementById('join-error');
  errorEl.textContent = '';

  if (!room || !name) {
    errorEl.textContent = 'Isi Room Code dan Nama terlebih dahulu.';
    return;
  }

  socket.emit('player:join', { roomCode: room, name }, (res) => {
    if (!res.ok) {
      errorEl.textContent = res.error;
      return;
    }
    myName = name;
    myRoom = room;
    document.getElementById('waiting-name').textContent = name;
    document.getElementById('waiting-room').textContent = room;
    showScreen('waiting');
  });
});

socket.on('game:started', () => {
  // handled by question:show which follows immediately
});

let myWager = null;

socket.on('wager:collect-start', (data) => {
  myWager = null;
  document.getElementById('wager-current-score').textContent = data.yourScore;
  document.getElementById('wager-input').value = '';
  document.getElementById('wager-error').textContent = '';
  document.getElementById('btn-submit-wager').disabled = false;
  showScreen('wagerBet');
});

document.getElementById('btn-submit-wager').addEventListener('click', () => {
  const errorEl = document.getElementById('wager-error');
  errorEl.textContent = '';
  const raw = document.getElementById('wager-input').value.trim();
  const amount = parseInt(raw, 10);
  if (raw === '' || Number.isNaN(amount) || amount < 0) {
    errorEl.textContent = 'Masukkan angka taruhan yang valid (boleh 0).';
    return;
  }
  document.getElementById('btn-submit-wager').disabled = true;
  socket.emit('player:submit-wager', { amount }, (res) => {
    if (!res.ok) {
      errorEl.textContent = res.error || 'Gagal memasang taruhan.';
      document.getElementById('btn-submit-wager').disabled = false;
      return;
    }
    myWager = amount;
    showScreen('waiting');
    document.getElementById('waiting-name').textContent = myName;
    document.querySelector('#screen-waiting .status-msg').textContent = 'Taruhan terpasang. Waiting Host...';
  });
});

socket.on('song:ready', () => {
  currentAnswer = null;
  showScreen('songWait');
});

socket.on('song:tier-start', (data) => {
  if (currentAnswer !== null) return; // already answered, stay on submitted screen
  document.getElementById('song-tier-info').textContent =
    `Tier ${data.tier} detik — jawab sekarang untuk dapat ${data.points} poin!`;
  document.getElementById('song-answer-input').value = '';
  document.getElementById('btn-submit-song').disabled = false;
  showScreen('songAnswer');
});

document.getElementById('btn-submit-song').addEventListener('click', () => {
  const val = document.getElementById('song-answer-input').value.trim();
  if (!val || currentAnswer !== null) return;
  document.getElementById('btn-submit-song').disabled = true;
  submitAnswer(val, null, null);
});

socket.on('question:show', (q) => {
  currentAnswer = null;
  document.getElementById('q-number').textContent = q.number;
  document.getElementById('q-total').textContent = q.total;
  const wagerNote = document.getElementById('q-wager-note');
  if (q.type === 'wager') {
    document.getElementById('q-points').textContent = '';
    wagerNote.style.display = 'block';
    wagerNote.textContent = `Taruhanmu: ${q.yourWager} poin (menang = +${q.yourWager * 2}, kalah = -${q.yourWager})`;
  } else {
    document.getElementById('q-points').textContent = q.points > 0 ? `${q.points} poin` : 'Survey';
    wagerNote.style.display = 'none';
  }

  const mcWrap = document.getElementById('q-mc-wrap');
  const textWrap = document.getElementById('q-text-wrap');
  mcWrap.innerHTML = '';
  document.getElementById('q-text-input').value = '';
  document.getElementById('btn-submit-text').disabled = false;

  if (q.type === 'short_answer' || q.type === 'wager') {
    mcWrap.style.display = 'none';
    textWrap.style.display = 'block';
  } else {
    textWrap.style.display = 'none';
    mcWrap.style.display = 'grid';
    mcWrap.classList.toggle('single', q.options.length <= 2 && q.type === 'true_false' ? false : q.options.length % 2 !== 0);
    q.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitAnswer(opt, btn, mcWrap));
      mcWrap.appendChild(btn);
    });
  }
  showScreen('question');
});

function submitAnswer(answer, btnEl, wrapEl) {
  if (currentAnswer !== null) return;
  currentAnswer = answer;
  if (wrapEl) {
    Array.from(wrapEl.children).forEach((b) => b.disabled = true);
    btnEl.classList.add('selected');
  }
  socket.emit('player:submit-answer', { answer }, (res) => {
    if (res && res.ok) {
      setTimeout(() => showScreen('submitted'), 250);
    }
  });
}

document.getElementById('btn-submit-text').addEventListener('click', () => {
  const val = document.getElementById('q-text-input').value.trim();
  if (!val || currentAnswer !== null) return;
  document.getElementById('btn-submit-text').disabled = true;
  submitAnswer(val, null, null);
});

socket.on('question:locked', () => {
  // Time's up on host side; if not yet answered, just wait for reveal.
});

socket.on('question:reveal', (data) => {
  const banner = document.getElementById('reveal-banner');
  if (data.isWager) {
    if (data.yourResult === true) {
      banner.className = 'result-banner good';
      banner.textContent = `🎉 Kamu MENANG taruhan! +${data.yourWager * 2} poin`;
    } else {
      banner.className = 'result-banner bad';
      banner.textContent = data.yourWager > 0 ? `😢 Taruhanmu meleset, -${data.yourWager} poin` : 'Taruhanmu 0, tidak ada perubahan poin';
    }
  } else if (data.isSong) {
    if (data.yourAnswer === null) {
      banner.className = 'result-banner neutral';
      banner.textContent = 'Kamu tidak sempat menjawab';
    } else if (data.yourResult === true) {
      banner.className = 'result-banner good';
      banner.textContent = `🎉 Benar! +${data.yourPointsEarned} poin (tier ${data.yourTier} detik)`;
    } else {
      banner.className = 'result-banner bad';
      banner.textContent = '❌ Jawaban kamu salah';
    }
  } else if (data.yourResult === true) {
    banner.className = 'result-banner good';
    banner.textContent = '🎉 Jawaban kamu BENAR!';
  } else if (data.yourResult === false) {
    banner.className = 'result-banner bad';
    banner.textContent = '❌ Jawaban kamu salah';
  } else if (typeof data.yourMatches === 'number') {
    if (data.yourMatches > 0) {
      banner.className = 'result-banner good';
      banner.textContent = `🎉 Cocok dengan ${data.yourMatches} orang lain!`;
    } else {
      banner.className = 'result-banner neutral';
      banner.textContent = 'Tidak ada yang vote sama dengan kamu';
    }
  } else {
    banner.className = 'result-banner neutral';
    banner.textContent = 'Terima kasih sudah vote!';
  }
  document.getElementById('reveal-score').textContent = data.yourScore;

  const lb = document.getElementById('reveal-leaderboard');
  lb.innerHTML = '';
  data.leaderboard.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span><span class="rank">#${i + 1}</span>${escapeHtml(p.name)}</span><span>${p.score}</span>`;
    lb.appendChild(row);
  });

  showScreen('reveal');
});

socket.on('game:ended', (data) => {
  const champ = data.leaderboard[0];
  document.getElementById('final-champion-name').textContent = champ ? champ.name : '-';
  document.getElementById('final-champion-score').textContent = champ ? `${champ.score} Point` : '';

  const lb = document.getElementById('final-leaderboard');
  lb.innerHTML = '';
  data.leaderboard.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `<span>${medal} ${escapeHtml(p.name)}</span><span>${p.score}</span>`;
    lb.appendChild(row);
  });
  showScreen('final');
});

socket.on('host:disconnected', () => {
  alert('Koneksi ke host terputus. Minta host membuka ulang dashboard.');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
