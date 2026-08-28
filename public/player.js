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
let myPlayerId = null;
let currentAnswer = null;

const SESSION_KEY = 'triviaNightSession';

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: myRoom, playerId: myPlayerId, name: myName }));
  } catch (e) {
    // localStorage unavailable (private browsing, etc.) - reconnect just won't
    // auto-resume, everything else still works fine.
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // ignore
  }
}

// ---------- Audio (Tebak Lagu plays on the player's own phone too) ----------
// Mobile browsers block audio.play() unless it happens inside (or shortly
// after) a real user gesture. We "unlock" the shared <audio> element the
// moment the player taps Join - a real gesture - so later programmatic
// play() calls triggered by server events (song:tier-start) are allowed for
// the rest of this page session.
let audioUnlocked = false;
function unlockAudioPlayback() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const audio = document.getElementById('player-song-audio');
  const p = audio.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
  audio.pause();
}

function playSongClip(audioFile, tierSeconds) {
  const audio = document.getElementById('player-song-audio');
  if (audioFile && !audio.src.endsWith('/audio/' + audioFile)) {
    audio.src = `/audio/${audioFile}`;
    audio.load();
  }
  clearTimeout(window.__playerSongStopTimer);
  const start = () => {
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        // Autoplay can still be blocked on some phones/browsers despite the
        // unlock attempt - that's OK, the shared host speaker is the main
        // audio source anyway. Just don't bother the player with a popup.
        if (err && err.name !== 'AbortError') console.warn('Audio di HP tidak bisa autoplay:', err);
      });
    }
    window.__playerSongStopTimer = setTimeout(() => audio.pause(), tierSeconds * 1000);
  };
  if (audio.readyState >= 2) {
    start();
  } else {
    audio.addEventListener('canplay', start, { once: true });
  }
}

// Prefill room code from ?room= in URL
const params = new URLSearchParams(window.location.search);
if (params.get('room')) {
  document.getElementById('input-room').value = params.get('room');
}

// If this browser already joined a room before (e.g. the screen locked, the
// app was backgrounded to check WhatsApp, or Wi-Fi hiccuped), try to resume
// that same seat automatically instead of showing the join screen again.
// This runs on the very first connection AND every time Socket.IO's built-in
// reconnection logic re-establishes the connection after a drop.
socket.on('connect', () => {
  const session = loadSession();
  if (!session || !session.roomCode || !session.playerId) return;

  socket.emit('player:rejoin', { roomCode: session.roomCode, playerId: session.playerId }, (res) => {
    if (!res.ok) {
      clearSession();
      return; // stay on / fall back to the normal join screen
    }
    myName = res.name;
    myRoom = session.roomCode;
    myPlayerId = session.playerId;
    // The server follows this ack with whichever screen matches the live
    // game state (waiting / question / reveal / etc.) via its own events.
  });
});

document.getElementById('btn-join').addEventListener('click', () => {
  unlockAudioPlayback();
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
    myPlayerId = res.playerId;
    saveSession();
    document.getElementById('waiting-name').textContent = name;
    document.getElementById('waiting-room').textContent = room;
    showScreen('waiting');
  });
});

// Sent by the server right after a successful player:rejoin, for whichever
// phase doesn't have a more specific "catch up" event (lobby / between
// questions) - just parks them back on the normal waiting screen.
socket.on('rejoin:show-waiting', () => {
  currentAnswer = null;
  document.getElementById('waiting-name').textContent = myName;
  document.getElementById('waiting-room').textContent = myRoom;
  document.querySelector('#screen-waiting .status-msg').textContent = 'Waiting Host...';
  showScreen('waiting');
});

// Sent by the server on reconnect if this player already answered the
// current question before disconnecting - skips straight to "submitted" so
// they can't (and don't need to) answer again.
socket.on('rejoin:show-submitted', () => {
  currentAnswer = 'RESUMED';
  showScreen('submitted');
});

let myWager = null;

socket.on('wager:collect-start', (data) => {
  myWager = null;
  document.getElementById('wager-text').textContent = data.text || '';
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

// ---------- Tebak Lagu Autocomplete ----------
let selectedSongAnswer = '';
let activeSongHighlightIndex = -1;
let currentSongMatches = [];

function initSongAutocomplete() {
  const searchInput = document.getElementById('song-search-input');
  const clearBtn = document.getElementById('btn-clear-song-search');
  const dropdownList = document.getElementById('song-dropdown-list');
  const selectedPreview = document.getElementById('song-selected-preview');
  const selectedDisplay = document.getElementById('song-selected-display');
  const unselectBtn = document.getElementById('btn-unselect-song');
  const answerInput = document.getElementById('song-answer-input');
  const submitBtn = document.getElementById('btn-submit-song');

  if (!searchInput) return;

  function selectSong(song) {
    const text = typeof song === 'string' ? song : song.display;
    selectedSongAnswer = text;
    answerInput.value = text;
    selectedDisplay.textContent = text;
    selectedPreview.style.display = 'flex';
    searchInput.parentElement.style.display = 'none';
    dropdownList.style.display = 'none';
    submitBtn.disabled = false;
  }

  function unselectSong() {
    selectedSongAnswer = '';
    answerInput.value = '';
    selectedDisplay.textContent = '';
    selectedPreview.style.display = 'none';
    searchInput.parentElement.style.display = 'flex';
    searchInput.value = '';
    clearBtn.style.display = 'none';
    dropdownList.style.display = 'none';
    submitBtn.disabled = true;
  }

  function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);
    const escapedText = escapeHtml(text);
    const qLower = query.toLowerCase();
    const idx = escapedText.toLowerCase().indexOf(qLower);
    if (idx === -1) return escapedText;
    const before = escapedText.slice(0, idx);
    const match = escapedText.slice(idx, idx + query.length);
    const after = escapedText.slice(idx + query.length);
    return `${before}<mark class="song-mark">${match}</mark>${after}`;
  }

  function renderDropdown(query) {
    const q = (query || '').trim();
    if (!q) {
      currentSongMatches = window.SongDB ? window.SongDB.search('', 15) : [];
    } else {
      currentSongMatches = window.SongDB ? window.SongDB.search(q, 20) : [];
    }

    activeSongHighlightIndex = -1;
    dropdownList.innerHTML = '';

    if (currentSongMatches.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'song-option no-match';
      emptyDiv.textContent = 'Tidak ada lagu yang cocok';
      dropdownList.appendChild(emptyDiv);
      dropdownList.style.display = 'block';
      return;
    }

    currentSongMatches.forEach((s, idx) => {
      const item = document.createElement('div');
      item.className = 'song-option';
      item.dataset.index = idx;
      item.innerHTML = `
        <div class="song-opt-title">${highlightMatch(s.title, q)}</div>
        <div class="song-opt-artist">${highlightMatch(s.artist, q)}</div>
      `;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectSong(s);
      });
      dropdownList.appendChild(item);
    });

    dropdownList.style.display = 'block';
  }

  function updateHighlight() {
    const items = dropdownList.querySelectorAll('.song-option:not(.no-match)');
    items.forEach((it, idx) => {
      if (idx === activeSongHighlightIndex) {
        it.classList.add('highlighted');
        it.scrollIntoView({ block: 'nearest' });
      } else {
        it.classList.remove('highlighted');
      }
    });
  }

  searchInput.addEventListener('input', () => {
    const val = searchInput.value;
    clearBtn.style.display = val.length > 0 ? 'block' : 'none';
    renderDropdown(val);
  });

  searchInput.addEventListener('focus', () => {
    if (!selectedSongAnswer) {
      renderDropdown(searchInput.value);
    }
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    renderDropdown('');
    searchInput.focus();
  });

  unselectBtn.addEventListener('click', () => {
    unselectSong();
    searchInput.focus();
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = dropdownList.querySelectorAll('.song-option:not(.no-match)');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length === 0) return;
      activeSongHighlightIndex = (activeSongHighlightIndex + 1) % items.length;
      updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      activeSongHighlightIndex = (activeSongHighlightIndex - 1 + items.length) % items.length;
      updateHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeSongHighlightIndex >= 0 && currentSongMatches[activeSongHighlightIndex]) {
        selectSong(currentSongMatches[activeSongHighlightIndex]);
      } else if (currentSongMatches.length > 0) {
        selectSong(currentSongMatches[0]);
      }
    } else if (e.key === 'Escape') {
      dropdownList.style.display = 'none';
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.song-autocomplete-wrap')) {
      dropdownList.style.display = 'none';
    }
  });

  window.resetSongAutocomplete = unselectSong;
}

// Initialize autocomplete after DOM loads
initSongAutocomplete();

let currentSongText = '';

socket.on('song:ready', (data) => {
  currentAnswer = null;
  currentSongText = data.text || '';
  document.getElementById('song-wait-text').textContent = currentSongText;
  if (typeof window.resetSongAutocomplete === 'function') {
    window.resetSongAutocomplete();
  }
  if (data.audioFile) {
    const audio = document.getElementById('player-song-audio');
    audio.src = `/audio/${data.audioFile}`;
    audio.load();
  }
  showScreen('songWait');
});

socket.on('song:tier-start', (data) => {
  if (currentAnswer !== null) return; // already answered, stay on submitted screen
  document.getElementById('song-answer-text').textContent = currentSongText;
  document.getElementById('song-tier-info').textContent =
    `Tier ${data.tier} detik — jawab sekarang untuk dapat ${data.points} poin!`;
  if (typeof window.resetSongAutocomplete === 'function') {
    window.resetSongAutocomplete();
  }
  showScreen('songAnswer');
  playSongClip(data.audioFile, data.tier);
});

document.getElementById('btn-submit-song').addEventListener('click', () => {
  const val = document.getElementById('song-answer-input').value.trim();
  if (!val || currentAnswer !== null) return;
  document.getElementById('btn-submit-song').disabled = true;
  const audio = document.getElementById('player-song-audio');
  audio.pause();
  clearTimeout(window.__playerSongStopTimer);
  submitAnswer(val, null, null);
});

socket.on('question:show', (q) => {
  currentAnswer = null;
  document.getElementById('q-number').textContent = q.number;
  document.getElementById('q-total').textContent = q.total;
  const wagerNote = document.getElementById('q-wager-note');
  const perfBanner = document.getElementById('q-performer-banner');
  const perfWrap = document.getElementById('q-performer-wrap');
  const titleEl = document.getElementById('q-title');
  const pptHintEl = document.getElementById('q-ppt-hint');
  const mcWrap = document.getElementById('q-mc-wrap');
  const textWrap = document.getElementById('q-text-wrap');
  const textInput = document.getElementById('q-text-input');

  perfBanner.style.display = 'none';
  perfWrap.style.display = 'none';
  mcWrap.innerHTML = '';
  textInput.value = '';
  textInput.placeholder = 'Ketik jawabanmu...';
  document.getElementById('btn-submit-text').disabled = false;

  if (q.type === 'wager') {
    document.getElementById('q-points').textContent = '';
    wagerNote.style.display = 'block';
    wagerNote.textContent = `Taruhanmu: ${q.yourWager} poin (menang = +${q.yourWager * 2}, kalah = -${q.yourWager})`;
  } else if (q.type === 'tebak_gaya' && q.isPerformer) {
    document.getElementById('q-points').textContent = '+20 poin / orang benar';
    wagerNote.style.display = 'none';
  } else {
    document.getElementById('q-points').textContent = q.points > 0 ? `${q.points} poin` : 'Survey';
    wagerNote.style.display = 'none';
  }

  const imgWrap = document.getElementById('q-image-wrap');
  const imgEl = document.getElementById('q-image');
  const imageSrc = q.image || q.imageFile;
  if (imgWrap && imgEl) {
    if (imageSrc) {
      imgEl.src = imageSrc.startsWith('http') || imageSrc.startsWith('/') ? imageSrc : `/images/${imageSrc}`;
      imgWrap.style.display = 'flex';
    } else {
      imgWrap.style.display = 'none';
      imgEl.src = '';
    }
  }

  if (q.type === 'tebak_gaya') {
    if (q.isPerformer) {
      currentAnswer = 'PERFORMER'; // Disable answering
      titleEl.textContent = '🎭 Giliran Kamu Memperagakan Gaya!';
      pptHintEl.style.display = 'none';
      document.getElementById('performer-prompt-text').textContent = q.promptToAct || '-';
      perfWrap.style.display = 'block';
      mcWrap.style.display = 'none';
      textWrap.style.display = 'none';
    } else {
      perfBanner.textContent = `🎭 Peraga: ${q.performerName || 'Temanmu'}`;
      perfBanner.style.display = 'block';
      titleEl.textContent = q.text || `Tebak gaya yang diperagakan ${q.performerName || 'temanmu'}!`;
      pptHintEl.style.display = 'none';
      textInput.placeholder = 'Ketik tebakan gayamu di sini...';
      mcWrap.style.display = 'none';
      textWrap.style.display = 'block';
    }
  } else if (q.type === 'short_answer' || q.type === 'wager') {
    if (q.text) {
      titleEl.textContent = q.text;
      pptHintEl.style.display = 'none';
    } else {
      titleEl.textContent = 'Pilih jawabanmu';
      pptHintEl.style.display = 'block';
    }
    mcWrap.style.display = 'none';
    textWrap.style.display = 'block';
  } else {
    if (q.text) {
      titleEl.textContent = q.text;
      pptHintEl.style.display = 'none';
    } else {
      titleEl.textContent = 'Pilih jawabanmu';
      pptHintEl.style.display = 'block';
    }
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
    const answerInfo = data.correctAnswer
      ? `<br><span style="font-size:0.95rem;font-weight:500;color:var(--text);display:inline-block;margin-top:4px;">🎵 Lagu: <b>${escapeHtml(data.correctAnswer)}</b></span>`
      : '';
    if (data.yourAnswer === null) {
      banner.className = 'result-banner neutral';
      banner.innerHTML = `Kamu tidak sempat menjawab${answerInfo}`;
    } else if (data.yourResult === true) {
      banner.className = 'result-banner good';
      banner.innerHTML = `🎉 Benar! +${data.yourPointsEarned} poin (tier ${data.yourTier} detik)${answerInfo}`;
    } else {
      banner.className = 'result-banner bad';
      banner.innerHTML = `❌ Jawaban kamu salah${answerInfo}`;
    }
  } else if (data.isTebakGaya) {
    if (data.isPerformer) {
      banner.className = 'result-banner good';
      banner.innerHTML = `🎭 Kamu sebagai Peraga!<br><span style="font-size:1.05rem;font-weight:600;"><b>${data.correctGuessCount} teman</b> berhasil menebak gayamu (+${data.pointsEarned} poin)</span>`;
    } else if (data.yourResult === true) {
      banner.className = 'result-banner good';
      banner.textContent = `🎉 Tebakanmu BENAR! (+${data.pointsEarned} poin)`;
    } else {
      banner.className = 'result-banner bad';
      banner.innerHTML = `❌ Tebakanmu kurang tepat.<br><span style="font-size:0.9rem;font-weight:400;color:var(--text);">Gaya: <b>${escapeHtml(data.correctAnswer)}</b></span>`;
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
