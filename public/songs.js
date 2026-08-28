/**
 * Song Database & Search Engine for Tebak Lagu
 * Provides fast autocomplete & search over popular Spotify & Indonesian/International songs.
 */
(function (global) {
  const SongDB = {
    songs: [],
    isLoaded: false,
    _loadedPromise: null,

    // Initialize database
    async init() {
      if (this.isLoaded) return this.songs;
      if (this._loadedPromise) return this._loadedPromise;

      this._loadedPromise = (async () => {
        try {
          const res = await fetch('/data/songs.json');
          if (res.ok) {
            const data = await res.json();
            this.setSongs(data);
          }
        } catch (err) {
          console.warn('Could not fetch /data/songs.json, using built-in defaults:', err);
        }
        this.isLoaded = true;
        return this.songs;
      })();

      return this._loadedPromise;
    },

    setSongs(list) {
      if (!Array.isArray(list)) return;
      const seen = new Set();
      this.songs = [];

      list.forEach((item) => {
        let title = '';
        let artist = '';
        let display = '';

        if (typeof item === 'string') {
          const parts = item.split(' - ');
          if (parts.length >= 2) {
            title = parts[0].trim();
            artist = parts.slice(1).join(' - ').trim();
            display = `${title} - ${artist}`;
          } else {
            title = item.trim();
            artist = '';
            display = title;
          }
        } else if (item && typeof item === 'object') {
          title = (item.title || '').trim();
          artist = (item.artist || '').trim();
          display = artist ? `${title} - ${artist}` : title;
        }

        if (!display) return;
        const key = display.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        this.songs.push({
          title,
          artist,
          display,
          searchKey: `${title} ${artist} ${display}`.toLowerCase()
        });
      });

      // Sort alphabetically by title
      this.songs.sort((a, b) => a.title.localeCompare(b.title));
    },

    ensureSong(str) {
      if (!str || typeof str !== 'string') return;
      const clean = str.trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      const exists = this.songs.some((s) => s.display.toLowerCase() === key || s.title.toLowerCase() === key);
      if (!exists) {
        let title = clean;
        let artist = '';
        const parts = clean.split(' - ');
        if (parts.length >= 2) {
          title = parts[0].trim();
          artist = parts.slice(1).join(' - ').trim();
        }
        this.songs.push({
          title,
          artist,
          display: artist ? `${title} - ${artist}` : title,
          searchKey: `${title} ${artist} ${clean}`.toLowerCase()
        });
      }
    },

    search(query, limit = 20) {
      if (!query || typeof query !== 'string') {
        return this.songs.slice(0, limit);
      }

      const q = query.trim().toLowerCase();
      if (!q) return this.songs.slice(0, limit);

      const tokens = q.split(/\s+/).filter(Boolean);

      // Score matching
      const matches = [];

      for (let i = 0; i < this.songs.length; i++) {
        const s = this.songs[i];
        const titleLow = s.title.toLowerCase();
        const artistLow = s.artist.toLowerCase();
        const dispLow = s.display.toLowerCase();

        // Must match all tokens
        let matchesAll = true;
        for (let t = 0; t < tokens.length; t++) {
          if (!s.searchKey.includes(tokens[t])) {
            matchesAll = false;
            break;
          }
        }

        if (!matchesAll) continue;

        // Calculate score for ranking
        let score = 0;
        if (dispLow === q || titleLow === q) score += 100;
        else if (titleLow.startsWith(q)) score += 80;
        else if (artistLow.startsWith(q)) score += 60;
        else if (dispLow.includes(q)) score += 40;
        else score += 20;

        matches.push({ song: s, score });
      }

      matches.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title));

      return matches.slice(0, limit).map((m) => m.song);
    }
  };

  // Initialize immediately on load
  SongDB.init();

  global.SongDB = SongDB;
})(typeof window !== 'undefined' ? window : global);
