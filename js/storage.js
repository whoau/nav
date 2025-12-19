// 存储管理模块
const PROVERB_HISTORY_LIMIT = 60;

const Storage = {
  defaults: {
    settings: {
      bgType: 'gradient',
      gradientColor1: '#667eea',
      gradientColor2: '#764ba2',
      gradientColor3: '',
      gradientAngle: 135,
      gradientPresetIndex: 0,
      bgImageUrl: '',
      autoChangeWallpaper: 'newtab',
      bgBlur: 0,
      bgDarkness: 30,
      blurEffect: true,
      showSeconds: false,
      use12Hour: false,
      showGreeting: true,
      showWeather: true,
      showProverb: true,
      showHotTopics: true,
      showTodo: true,
      showBookmarks: true,
      showNotes: true,
      showGames: true
    },
    shortcuts: [
      { name: 'Google', url: 'https://google.com' },
      { name: 'YouTube', url: 'https://youtube.com' },
      { name: 'Gmail', url: 'https://mail.google.com' },
      { name: 'Twitter', url: 'https://twitter.com' },
      { name: 'Reddit', url: 'https://reddit.com' },
      { name: 'Netflix', url: 'https://netflix.com' }
    ],
    bookmarks: [
      { name: 'Google', url: 'https://google.com' },
      { name: 'YouTube', url: 'https://youtube.com' },
      { name: 'GitHub', url: 'https://github.com' },
      { name: 'Twitter', url: 'https://twitter.com' }
    ],
    todos: [],
    notes: '',
    searchEngine: 'google',
    lastWallpaperChange: 0,
    currentWallpaper: '',
    wallpaperHistory: [],
    proverbCache: null,
    proverbCacheDate: null,
    proverbHistory: []
  },

  async get(key) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] !== undefined ? result[key] : this.defaults[key]);
        });
      } else {
        const data = localStorage.getItem(`mytab_${key}`);
        resolve(data ? JSON.parse(data) : this.defaults[key]);
      }
    });
  },

  async set(key, value) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ [key]: value }, resolve);
      } else {
        localStorage.setItem(`mytab_${key}`, JSON.stringify(value));
        resolve();
      }
    });
  },

  async getAll() {
    const settings = await this.get('settings');
    const shortcuts = await this.get('shortcuts');
    const bookmarks = await this.get('bookmarks');
    const todos = await this.get('todos');
    const notes = await this.get('notes');
    const searchEngine = await this.get('searchEngine');
    const lastWallpaperChange = await this.get('lastWallpaperChange');
    const currentWallpaper = await this.get('currentWallpaper');
    const wallpaperHistory = await this.get('wallpaperHistory');
    const wallpaperLibrary = await this.get('wallpaperLibrary');
    const proverbCache = await this.get('proverbCache');
    const proverbCacheDate = await this.get('proverbCacheDate');
    const proverbHistory = await this.get('proverbHistory');

    return {
      settings: { ...this.defaults.settings, ...settings },
      shortcuts: shortcuts || this.defaults.shortcuts,
      bookmarks: bookmarks || this.defaults.bookmarks,
      todos: todos || [],
      notes: notes || '',
      searchEngine: searchEngine || 'google',
      lastWallpaperChange: lastWallpaperChange || 0,
      currentWallpaper: currentWallpaper || '',
      wallpaperHistory: wallpaperHistory || [],
      wallpaperLibrary: { ...this.defaults.wallpaperLibrary, ...(wallpaperLibrary || {}) },
      proverbCache: proverbCache || null,
      proverbCacheDate: proverbCacheDate || null,
      proverbHistory: proverbHistory || []
    };
  },

  async getProverbHistory() {
    const history = await this.get('proverbHistory');
    return Array.isArray(history) ? history : [];
  },

  async recordProverb(proverb, meta = {}) {
    if (!proverb || !proverb.text) return;

    const history = await this.getProverbHistory();
    const entry = {
      text: proverb.text,
      author: proverb.author || '',
      source: proverb.source || '',
      category: proverb.category || '',
      fetchedAt: meta.fetchedAt || proverb.fetchedAt || new Date().toISOString(),
      dateKey: meta.dateKey || proverb.dateKey || ''
    };

    const deduped = history.filter(item => !(item.text === entry.text && item.source === entry.source));
    deduped.unshift(entry);

    if (deduped.length > PROVERB_HISTORY_LIMIT) {
      deduped.length = PROVERB_HISTORY_LIMIT;
    }

    await this.set('proverbHistory', deduped);
  },

  async exportData() {
    const snapshot = await this.getAll();
    let timezone = 'UTC';

    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (error) {
      timezone = 'UTC';
    }

    return {
      meta: {
        schema: 'mytab-export-v1',
        generatedAt: new Date().toISOString(),
        timezone
      },
      data: {
        settings: snapshot.settings,
        shortcuts: snapshot.shortcuts,
        bookmarks: snapshot.bookmarks,
        todos: snapshot.todos,
        notes: snapshot.notes,
        searchEngine: snapshot.searchEngine,
        wallpaper: {
          current: snapshot.currentWallpaper,
          history: snapshot.wallpaperHistory,
          lastChangedAt: snapshot.lastWallpaperChange
        },
        proverb: {
          today: snapshot.proverbCache,
          lastUpdated: snapshot.proverbCacheDate,
          history: snapshot.proverbHistory
        }
      }
    };
  },

  async clear() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.clear();
    } else {
      Object.keys(localStorage)
        .filter(key => key.startsWith('mytab_'))
        .forEach(key => localStorage.removeItem(key));
    }
  }
};
