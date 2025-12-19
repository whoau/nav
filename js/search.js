// 搜索模块
const Search = {
  engines: {
    google: {
      name: 'Google',
      url: 'https://www.google.com/search?q=',
      icon: 'https://www.google.com/favicon.ico'
    },
    baidu: {
      name: '百度',
      url: 'https://www.baidu.com/s?wd=',
      icon: 'https://www.baidu.com/favicon.ico'
    },
    bing: {
      name: 'Bing',
      url: 'https://www.bing.com/search?q=',
      icon: 'https://www.bing.com/favicon.ico'
    },
    duckduckgo: {
      name: 'DuckDuckGo',
      url: 'https://duckduckgo.com/?q=',
      icon: 'https://duckduckgo.com/favicon.ico'
    },
    yandex: {
      name: 'Yandex',
      url: 'https://yandex.com/search/?text=',
      icon: 'https://yandex.com/favicon.ico'
    }
  },

  currentEngine: 'google',
  isDropdownOpen: false,

  init() {
    console.log('Search init');
    this.loadEngine();
    this.bindEvents();
  },

  async loadEngine() {
    this.currentEngine = await Storage.get('searchEngine') || 'google';
    this.updateEngineIcon();
  },

  updateEngineIcon() {
    const engine = this.engines[this.currentEngine];
    const iconEl = document.getElementById('currentEngineIcon');
    if (iconEl && engine) {
      iconEl.src = engine.icon;
      iconEl.alt = engine.name;
      iconEl.onerror = () => {
        iconEl.style.display = 'none';
      };
    }
  },

  bindEvents() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const engineSelector = document.getElementById('engineSelector');
    const engineDropdown = document.getElementById('engineDropdown');
    const engineOptions = document.querySelectorAll('.engine-option');

    if (!searchInput || !engineSelector || !engineDropdown) {
      console.error('搜索元素未找到');
      return;
    }

    // 快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      if (e.key === 'Escape') {
        searchInput.blur();
        this.closeDropdown();
      }
    });

    // 搜索
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.search(searchInput.value);
      }
    });

    searchBtn.addEventListener('click', () => {
      this.search(searchInput.value);
    });

    // 搜索引擎选择器
    engineSelector.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleDropdown();
    });

    // 选择搜索引擎
    engineOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const engine = option.dataset.engine;
        this.selectEngine(engine);
      });
    });

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!engineSelector.contains(e.target) && !engineDropdown.contains(e.target)) {
        this.closeDropdown();
      }
    });
  },

  toggleDropdown() {
    const dropdown = document.getElementById('engineDropdown');
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      dropdown.classList.add('show');
      this.isDropdownOpen = true;
    }
  },

  closeDropdown() {
    const dropdown = document.getElementById('engineDropdown');
    dropdown.classList.remove('show');
    this.isDropdownOpen = false;
  },

  async selectEngine(engine) {
    this.currentEngine = engine;
    this.updateEngineIcon();
    await Storage.set('searchEngine', engine);
    this.closeDropdown();
  },

  search(query) {
    if (!query.trim()) return;

    const urlPattern = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/\S*)?$/;
    if (urlPattern.test(query)) {
      const url = query.startsWith('http') ? query : `https://${query}`;
      window.location.href = url;
      return;
    }

    const engine = this.engines[this.currentEngine];
    window.location.href = engine.url + encodeURIComponent(query);
  }
};