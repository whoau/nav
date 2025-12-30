// 存储管理模块
const PROVERB_HISTORY_LIMIT = 60;

const Storage = {
  _memoryCache: new Map(),
  _pendingGets: new Map(),

  _clone(value) {
    if (value && typeof value === 'object') {
      try {
        return structuredClone(value);
      } catch {
        return JSON.parse(JSON.stringify(value));
      }
    }
    return value;
  },

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
    iconPreferredSources: {},
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
    wallpaperLibrary: {
      bing: [],
      unsplash: [],
      picsum: [],
      shownWallpapers: [],
      lastUpdated: 0
    },
    locationCache: null,
    locationCacheTime: 0,
    weatherCache: null,
    weatherCacheTime: 0,
    proverbCache: null,
    proverbCacheDate: null,
    proverbHistory: []
  },

  async get(key) {
    if (this._memoryCache.has(key)) {
      return this._clone(this._memoryCache.get(key));
    }

    if (this._pendingGets.has(key)) {
      const value = await this._pendingGets.get(key);
      return this._clone(value);
    }

    const pending = new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get([key], (result) => {
          const fallback = this.defaults.hasOwnProperty(key) ? this.defaults[key] : undefined;
          resolve(result[key] !== undefined ? result[key] : fallback);
        });
      } else {
        const data = localStorage.getItem(`mytab_${key}`);
        const fallback = this.defaults.hasOwnProperty(key) ? this.defaults[key] : undefined;
        resolve(data ? JSON.parse(data) : fallback);
      }
    }).then((value) => {
      const cachedValue = this._clone(value);
      this._memoryCache.set(key, cachedValue);
      this._pendingGets.delete(key);
      return cachedValue;
    }).catch((error) => {
      this._pendingGets.delete(key);
      throw error;
    });

    this._pendingGets.set(key, pending);
    const value = await pending;
    return this._clone(value);
  },

  async set(key, value) {
    const storedValue = this._clone(value);
    this._memoryCache.set(key, storedValue);
    this._pendingGets.delete(key);

    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ [key]: storedValue }, resolve);
      } else {
        localStorage.setItem(`mytab_${key}`, JSON.stringify(storedValue));
        resolve();
      }
    });
  },

  async getAll() {
    const [
      settings,
      shortcuts,
      bookmarks,
      todos,
      notes,
      searchEngine,
      lastWallpaperChange,
      currentWallpaper,
      wallpaperHistory,
      wallpaperLibrary,
      proverbCache,
      proverbCacheDate,
      proverbHistory
    ] = await Promise.all([
      this.get('settings'),
      this.get('shortcuts'),
      this.get('bookmarks'),
      this.get('todos'),
      this.get('notes'),
      this.get('searchEngine'),
      this.get('lastWallpaperChange'),
      this.get('currentWallpaper'),
      this.get('wallpaperHistory'),
      this.get('wallpaperLibrary'),
      this.get('proverbCache'),
      this.get('proverbCacheDate'),
      this.get('proverbHistory')
    ]);

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

  async importData(importData, mode = 'replace') {
    if (!importData || typeof importData !== 'object') {
      throw new Error('无效的导入数据格式');
    }

    // 验证数据结构
    this._validateImportData(importData);

    const data = importData.data;
    const currentData = await this.getAll();

    if (mode === 'replace') {
      // 覆盖模式：完全替换现有数据
      await this._importReplace(data);
    } else if (mode === 'merge') {
      // 合并模式：合并数据
      await this._importMerge(data, currentData);
    } else {
      throw new Error('未知的导入模式');
    }

    // 清除内存缓存，确保数据一致性
    this._memoryCache.clear();
    this._pendingGets.clear();
  },

  _validateImportData(importData) {
    if (!importData.meta || !importData.data) {
      throw new Error('导入文件格式不正确，缺少必要的元数据或数据部分');
    }

    if (importData.meta.schema !== 'mytab-export-v1') {
      throw new Error('不支持的导出文件格式版本');
    }

    if (!importData.data || typeof importData.data !== 'object') {
      throw new Error('导入文件的数据部分格式不正确');
    }

    // 验证必要的数据字段
    const requiredFields = ['settings', 'shortcuts', 'bookmarks', 'todos', 'notes', 'searchEngine'];
    for (const field of requiredFields) {
      if (!importData.data.hasOwnProperty(field)) {
        console.warn(`导入数据缺少字段: ${field}，将使用默认值`);
      }
    }
  },

  async _importReplace(data) {
    try {
      // 导入设置
      if (data.settings) {
        await this.set('settings', { ...this.defaults.settings, ...data.settings });
      }

      // 导入快捷方式
      if (data.shortcuts) {
        await this.set('shortcuts', data.shortcuts);
      }

      // 导入书签
      if (data.bookmarks) {
        await this.set('bookmarks', data.bookmarks);
      }

      // 导入待办事项
      if (data.todos) {
        await this.set('todos', data.todos);
      }

      // 导入笔记
      if (data.notes) {
        await this.set('notes', data.notes);
      }

      // 导入搜索引擎
      if (data.searchEngine) {
        await this.set('searchEngine', data.searchEngine);
      }

      // 导入壁纸相关数据
      if (data.wallpaper) {
        if (data.wallpaper.current) {
          await this.set('currentWallpaper', data.wallpaper.current);
        }
        if (data.wallpaper.history) {
          await this.set('wallpaperHistory', data.wallpaper.history);
        }
        if (data.wallpaper.lastChangedAt) {
          await this.set('lastWallpaperChange', data.wallpaper.lastChangedAt);
        }
      }

      // 导入谚语相关数据
      if (data.proverb) {
        if (data.proverb.today) {
          await this.set('proverbCache', data.proverb.today);
        }
        if (data.proverb.lastUpdated) {
          await this.set('proverbCacheDate', data.proverb.lastUpdated);
        }
        if (data.proverb.history) {
          await this.set('proverbHistory', data.proverb.history);
        }
      }

    } catch (error) {
      throw new Error(`数据导入失败: ${error.message}`);
    }
  },

  async _importMerge(data, currentData) {
    try {
      // 设置直接覆盖（因为设置通常是完整的配置）
      if (data.settings) {
        await this.set('settings', { ...this.defaults.settings, ...data.settings });
      }

      // 快捷方式合并
      if (data.shortcuts && Array.isArray(data.shortcuts)) {
        const currentShortcuts = currentData.shortcuts || [];
        const mergedShortcuts = [...currentShortcuts, ...data.shortcuts];
        await this.set('shortcuts', mergedShortcuts);
      }

      // 书签合并
      if (data.bookmarks && Array.isArray(data.bookmarks)) {
        const currentBookmarks = currentData.bookmarks || [];
        const mergedBookmarks = [...currentBookmarks, ...data.bookmarks];
        await this.set('bookmarks', mergedBookmarks);
      }

      // 待办事项合并
      if (data.todos && Array.isArray(data.todos)) {
        const currentTodos = currentData.todos || [];
        const mergedTodos = [...currentTodos, ...data.todos];
        await this.set('todos', mergedTodos);
      }

      // 笔记直接覆盖（通常只有一份）
      if (data.notes) {
        await this.set('notes', data.notes);
      }

      // 搜索引擎直接覆盖
      if (data.searchEngine) {
        await this.set('searchEngine', data.searchEngine);
      }

      // 壁纸相关数据合并
      if (data.wallpaper) {
        if (data.wallpaper.current) {
          await this.set('currentWallpaper', data.wallpaper.current);
        }
        if (data.wallpaper.history) {
          const currentHistory = currentData.wallpaperHistory || [];
          const mergedHistory = [...currentHistory, ...data.wallpaper.history];
          await this.set('wallpaperHistory', mergedHistory);
        }
        if (data.wallpaper.lastChangedAt) {
          await this.set('lastWallpaperChange', data.wallpaper.lastChangedAt);
        }
      }

      // 谚语相关数据合并
      if (data.proverb) {
        if (data.proverb.today) {
          await this.set('proverbCache', data.proverb.today);
        }
        if (data.proverb.lastUpdated) {
          await this.set('proverbCacheDate', data.proverb.lastUpdated);
        }
        if (data.proverb.history) {
          const currentHistory = currentData.proverbHistory || [];
          const mergedHistory = [...currentHistory, ...data.proverb.history];
          await this.set('proverbHistory', mergedHistory);
        }
      }

    } catch (error) {
      throw new Error(`数据合并失败: ${error.message}`);
    }
  },

  async clear() {
    this._memoryCache.clear();
    this._pendingGets.clear();

    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.clear();
    } else {
      Object.keys(localStorage)
        .filter(key => key.startsWith('mytab_'))
        .forEach(key => localStorage.removeItem(key));
    }
  }
};
