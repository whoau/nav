// API 统一管理模块
const RECOMMENDATION_CACHE_WINDOW = 3 * 60 * 60 * 1000;
const WALLPAPER_POOL_UPDATE_INTERVAL = 2 * 60 * 60 * 1000; // 2小时更新一次
const WALLPAPER_POOL_TARGET_SIZE = 80; // 目标库存80+张
const MAX_SHOWN_HISTORY = 100; // 记录最多100张已展示的壁纸

const LOCATION_CACHE_TTL = 12 * 60 * 60 * 1000;
const WEATHER_CACHE_TTL = 15 * 60 * 1000;

const API = {
  // 壁纸库管理
  wallpaperLibrary: {
    bing: [],
    unsplash: [],
    picsum: [],
    shownWallpapers: [],
    lastUpdated: 0,

    async init() {
      const lib = await Storage.get('wallpaperLibrary');
      if (lib) {
        this.bing = lib.bing || [];
        this.unsplash = lib.unsplash || [];
        this.picsum = lib.picsum || [];
        this.shownWallpapers = lib.shownWallpapers || [];
        this.lastUpdated = lib.lastUpdated || 0;
      }
      console.log(`壁纸库初始化: bing=${this.bing.length}, unsplash=${this.unsplash.length}, picsum=${this.picsum.length}`);
    },

    async save() {
      const lib = {
        bing: this.bing,
        unsplash: this.unsplash,
        picsum: this.picsum,
        shownWallpapers: this.shownWallpapers,
        lastUpdated: this.lastUpdated
      };
      await Storage.set('wallpaperLibrary', lib);
    },

    async updatePool() {
      const now = Date.now();
      if (now - this.lastUpdated < WALLPAPER_POOL_UPDATE_INTERVAL) {
        console.log('壁纸库更新间隔未到，跳过更新');
        return;
      }

      try {
        console.log('开始更新壁纸库...');
        
        // 并行更新所有源
        await Promise.all([
          this.updateBingPool(),
          this.updateUnsplashPool(),
          this.updatePicsumPool()
        ]);

        this.lastUpdated = now;
        await this.save();
        console.log(`壁纸库已更新: bing=${this.bing.length}, unsplash=${this.unsplash.length}, picsum=${this.picsum.length}`);
      } catch (error) {
        console.error('更新壁纸库失败:', error);
      }
    },

    async updateBingPool() {
      try {
        const newWallpapers = new Set();
        const promises = [];
        
        // 获取50张Bing壁纸（尝试0-50的索引）
        for (let i = 0; i < 50; i++) {
          promises.push(this.fetchBingWallpaper(i));
        }

        const results = await Promise.allSettled(promises);
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            newWallpapers.add(result.value);
          }
        }

        // 合并新壁纸，去重
        const merged = new Set([...this.bing, ...newWallpapers]);
        this.bing = Array.from(merged).slice(0, WALLPAPER_POOL_TARGET_SIZE);
        console.log(`Bing池更新: ${this.bing.length}张`);
      } catch (error) {
        console.error('更新Bing池失败:', error);
      }
    },

    async updateUnsplashPool() {
      try {
        const newWallpapers = new Set();
        
        // 从Unsplash生成多张图片URL（使用不同的搜索词）
        const keywords = ['nature', 'landscape', 'city', 'abstract', 'minimalism', 'technology', 'space', 'ocean', 'mountains', 'sunset', 'forest', 'beach', 'desert', 'mountain', 'sky', 'water'];
        for (const keyword of keywords) {
          for (let i = 0; i < 5; i++) {
            const randomId = Math.random().toString(36).substring(2, 15);
            const url = `https://source.unsplash.com/1920x1080/?${keyword}&sig=${randomId}${Date.now()}`;
            newWallpapers.add(url);
          }
        }

        // 合并新壁纸
        const merged = new Set([...this.unsplash, ...newWallpapers]);
        this.unsplash = Array.from(merged).slice(0, WALLPAPER_POOL_TARGET_SIZE);
        console.log(`Unsplash池更新: ${this.unsplash.length}张`);
      } catch (error) {
        console.error('更新Unsplash池失败:', error);
      }
    },

    async updatePicsumPool() {
      try {
        const newWallpapers = new Set();
        
        // 从Picsum生成多张图片（使用seed参数获取不同的图片）
        for (let i = 0; i < 60; i++) {
          const seed = Math.floor(Math.random() * 10000) + i * 10000;
          const url = `https://picsum.photos/1920/1080?random=${seed}`;
          newWallpapers.add(url);
        }

        // 合并新壁纸
        const merged = new Set([...this.picsum, ...newWallpapers]);
        this.picsum = Array.from(merged).slice(0, WALLPAPER_POOL_TARGET_SIZE);
        console.log(`Picsum池更新: ${this.picsum.length}张`);
      } catch (error) {
        console.error('更新Picsum池失败:', error);
      }
    },

    async fetchBingWallpaper(index) {
      try {
        const res = await fetch(`https://bing.biturl.top/?resolution=1920&format=json&index=${index}&mkt=zh-CN&t=${Date.now()}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.url || null;
      } catch {
        return null;
      }
    },

    addToShownHistory(url) {
      if (!url) return;
      const index = this.shownWallpapers.indexOf(url);
      if (index > -1) {
        this.shownWallpapers.splice(index, 1);
      }
      this.shownWallpapers.unshift(url);
      if (this.shownWallpapers.length > MAX_SHOWN_HISTORY) {
        this.shownWallpapers = this.shownWallpapers.slice(0, MAX_SHOWN_HISTORY);
      }
    },

    getRandomWallpaper(source) {
      const pool = this[source] || [];
      if (pool.length === 0) return null;
      
      // 优先选择未展示过的壁纸
      const unshown = pool.filter(url => !this.shownWallpapers.includes(url));
      const candidate = unshown.length > 0 ? unshown : pool;
      
      const randomIndex = Math.floor(Math.random() * candidate.length);
      return candidate[randomIndex];
    },

    async ensurePoolFilled() {
      // 如果任何池为空或即将用尽，立即更新
      if (this.bing.length < 10 || this.unsplash.length < 10 || this.picsum.length < 10) {
        this.lastUpdated = 0; // 强制更新
        await this.updatePool();
      }
    }
  },

  // 图库 API
  imageAPIs: {
    unsplash: {
      name: 'Unsplash',
      async getUrl() {
        await API.wallpaperLibrary.ensurePoolFilled();
        return API.wallpaperLibrary.getRandomWallpaper('unsplash') || `https://source.unsplash.com/1920x1080/?t=${Date.now()}`;
      }
    },
    picsum: {
      name: 'Lorem Picsum',
      async getUrl() {
        await API.wallpaperLibrary.ensurePoolFilled();
        return API.wallpaperLibrary.getRandomWallpaper('picsum') || `https://picsum.photos/1920/1080?t=${Date.now()}`;
      }
    },
    bing: {
      name: '必应每日',
      async getUrl() {
        await API.wallpaperLibrary.ensurePoolFilled();
        return API.wallpaperLibrary.getRandomWallpaper('bing') || `https://picsum.photos/1920/1080?t=${Date.now()}`;
      }
    }
  },

  // 渐变预设
  gradientPresets: [
    { name: '极光紫', colors: ['#667eea', '#764ba2'] },
    { name: '海洋蓝', colors: ['#2193b0', '#6dd5ed'] },
    { name: '日落橙', colors: ['#ee0979', '#ff6a00'] },
    { name: '森林绿', colors: ['#134e5e', '#71b280'] },
    { name: '薰衣草', colors: ['#a18cd1', '#fbc2eb'] },
    { name: '烈焰红', colors: ['#f12711', '#f5af19'] },
    { name: '深海蓝', colors: ['#0f0c29', '#302b63', '#24243e'] },
    { name: '蜜桃粉', colors: ['#ffecd2', '#fcb69f'] },
    { name: '薄荷绿', colors: ['#00b09b', '#96c93d'] },
    { name: '暗夜黑', colors: ['#232526', '#414345'] },
    { name: '樱花粉', colors: ['#ff9a9e', '#fecfef'] },
    { name: '天空蓝', colors: ['#56ccf2', '#2f80ed'] },
    { name: '葡萄紫', colors: ['#8e2de2', '#4a00e0'] },
    { name: '柠檬黄', colors: ['#f7971e', '#ffd200'] },
    { name: '极地冰', colors: ['#e6dada', '#274046'] },
    { name: '珊瑚橙', colors: ['#ff9966', '#ff5e62'] },
    { name: '星空', colors: ['#0f2027', '#203a43', '#2c5364'] },
    { name: '彩虹', colors: ['#f093fb', '#f5576c'] },
    { name: '翡翠绿', colors: ['#11998e', '#38ef7d'] },
    { name: '玫瑰金', colors: ['#f4c4f3', '#fc67fa'] },
    { name: '冰川', colors: ['#c9d6ff', '#e2e2e2'] },
    { name: '热带', colors: ['#00f260', '#0575e6'] },
    { name: '秋叶', colors: ['#d38312', '#a83279'] },
    { name: '午夜', colors: ['#0f0c29', '#302b63'] }
  ],

  // 图标缓存管理
  iconCache: {
    PREFERRED_SOURCE_KEY: 'iconPreferredSources',
    ICON_DATA_CACHE_KEY: 'iconDataCache',
    
    // 获取域名的首选图标源
    async getPreferredSource(hostname) {
      const cache = await Storage.get(this.PREFERRED_SOURCE_KEY) || {};
      return cache[hostname] || null;
    },
    
    // 保存成功的图标源
    async savePreferredSource(hostname, sourceIndex) {
      const cache = await Storage.get(this.PREFERRED_SOURCE_KEY) || {};
      cache[hostname] = {
        index: sourceIndex,
        lastSuccess: Date.now()
      };
      await Storage.set(this.PREFERRED_SOURCE_KEY, cache);
    },
    
    // 获取缓存的图标数据URL
    async getCachedIcon(hostname) {
      const cache = await Storage.get(this.ICON_DATA_CACHE_KEY) || {};
      return cache[hostname] || null;
    },
    
    // 缓存图标数据URL
    async cacheIcon(hostname, dataUrl) {
      const cache = await Storage.get(this.ICON_DATA_CACHE_KEY) || {};
      cache[hostname] = dataUrl;
      await Storage.set(this.ICON_DATA_CACHE_KEY, cache);
      console.log(`图标已缓存 - 域名: ${hostname}`);
    },
    
    // 清理7天前的记录
    async cleanup() {
      const cache = await Storage.get(this.PREFERRED_SOURCE_KEY) || {};
      const now = Date.now();
      const TTL = 7 * 24 * 60 * 60 * 1000; // 7天
      let changed = false;
      
      for (const [hostname, data] of Object.entries(cache)) {
        if (now - data.lastSuccess > TTL) {
          delete cache[hostname];
          changed = true;
        }
      }
      
      if (changed) {
        await Storage.set(this.PREFERRED_SOURCE_KEY, cache);
      }
    },
    
    // 清理过期的图标数据缓存
    async cleanupIconDataCache() {
      const cache = await Storage.get(this.ICON_DATA_CACHE_KEY) || {};
      const now = Date.now();
      const TTL = 30 * 24 * 60 * 60 * 1000; // 30天
      let changed = false;
      
      for (const [hostname, dataUrl] of Object.entries(cache)) {
        // 简单检查：如果数据URL看起来无效，清理它
        if (!dataUrl || !dataUrl.startsWith('data:image/')) {
          delete cache[hostname];
          changed = true;
        }
      }
      
      if (changed) {
        await Storage.set(this.ICON_DATA_CACHE_KEY, cache);
        console.log('图标数据缓存清理完成');
      }
    }
  },

  // 获取多个备选图标源URL
  getFaviconUrls(pageUrl, { size = 64 } = {}) {
    let hostname = '';
    try {
      hostname = new URL(pageUrl).hostname;
    } catch {
      hostname = pageUrl || 'default';
    }

    // 返回多个备选源，按优先级排序
    // 优先级：1. 网站自身 favicon 2. HTML head 中的 favicon 3. 无需代理的 API
    return [
      // 源1: 网站自身的 favicon.ico（最直接，无需第三方服务）
      `https://${hostname}/favicon.ico`,

      // 源2: 尝试从网站 HTML head 中获取 favicon（需要通过特殊处理）
      `html-head://${hostname}`,

      // 源3: DuckDuckGo Favicon（无需代理，国内可访问）
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`

      // 注意：已移除 Google Favicon API 和 Favicon Kit 以避免被墙问题
    ];
  },

  // 从网站 HTML 中解析 favicon URL
  async parseFaviconFromHtml(html, hostname) {
    try {
      // 创建临时 DOM 元素来解析 HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 查找所有 link 标签中 rel="icon" 或 rel="shortcut icon" 的元素
      const links = doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
      
      // 也查找 link 标签中 rel="apple-touch-icon" 的元素
      const appleLinks = doc.querySelectorAll('link[rel="apple-touch-icon"]');
      
      // 合并所有可能的 favicon 链接
      const allLinks = Array.from(links).concat(Array.from(appleLinks));
      
      // 按优先级排序：首先是绝对 URL，然后是相对 URL
      const sortedLinks = allLinks.sort((a, b) => {
        const aHref = a.getAttribute('href') || '';
        const bHref = b.getAttribute('href') || '';
        
        // 绝对 URL 优先
        const aIsAbsolute = aHref.startsWith('http://') || aHref.startsWith('https://');
        const bIsAbsolute = bHref.startsWith('http://') || bHref.startsWith('https://');
        
        if (aIsAbsolute && !bIsAbsolute) return -1;
        if (!aIsAbsolute && bIsAbsolute) return 1;
        
        // 然后按 sizes 属性优先（如果有指定大小，优先匹配我们需要的大小）
        const aSizes = a.getAttribute('sizes') || '';
        const bSizes = b.getAttribute('sizes') || '';
        
        // 优先包含 "64x64" 或 "any" 的图标
        const aPreferred = aSizes.includes('64x64') || aSizes.includes('any');
        const bPreferred = bSizes.includes('64x64') || bSizes.includes('any');
        
        if (aPreferred && !bPreferred) return -1;
        if (!aPreferred && bPreferred) return 1;
        
        return 0;
      });
      
      // 尝试每个链接，返回第一个有效的绝对 URL
      for (const link of sortedLinks) {
        const href = link.getAttribute('href');
        if (!href) continue;
        
        // 如果是绝对 URL，直接返回
        if (href.startsWith('http://') || href.startsWith('https://')) {
          return href;
        }
        
        // 如果是相对 URL，转换为绝对 URL
        try {
          const absoluteUrl = new URL(href, `https://${hostname}`).href;
          return absoluteUrl;
        } catch {
          // 如果 URL 解析失败，跳过
          continue;
        }
      }
      
      // 如果没有找到 favicon 链接，返回 null
      return null;
    } catch (error) {
      console.warn(`解析 HTML 中的 favicon 失败: ${error.message}`);
      return null;
    }
  },
  
  // 获取单个图标URL（保持向后兼容）
  getFaviconUrl(pageUrl, { size = 64, scaleFactor = 2 } = {}) {
    const urls = this.getFaviconUrls(pageUrl, { size });
    return urls[0]; // 返回首选源
  },

  // 获取位置
  async getLocation(forceNew = false) {
    const now = Date.now();

    const cached = await Storage.get('locationCache');
    const cacheTime = await Storage.get('locationCacheTime');

    if (!forceNew && cached && cacheTime && now - cacheTime < LOCATION_CACHE_TTL) {
      return cached;
    }

    const apis = [
      {
        url: 'https://ipapi.co/json/',
        parse: d => ({ city: d.city || '未知', lat: parseFloat(d.latitude), lon: parseFloat(d.longitude) })
      },
      {
        url: 'http://ip-api.com/json/',
        parse: d => ({ city: d.city || '未知', lat: parseFloat(d.lat), lon: parseFloat(d.lon) })
      }
    ];

    for (const api of apis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const data = await res.json();
        const loc = api.parse(data);
        if (loc.lat && loc.lon) {
          await Storage.set('locationCache', loc);
          await Storage.set('locationCacheTime', now);
          return loc;
        }
      } catch {
        continue;
      }
    }

    if (cached) return cached;

    const fallback = { city: '北京', lat: 39.9, lon: 116.4 };
    await Storage.set('locationCache', fallback);
    await Storage.set('locationCacheTime', now);
    return fallback;
  },

  // 获取天气
  async getWeather(lat, lon, forceNew = false) {
    const now = Date.now();
    const cacheKey = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;

    const cached = await Storage.get('weatherCache');
    const cacheTime = await Storage.get('weatherCacheTime');

    if (!forceNew && cached?.key === cacheKey && cacheTime && now - cacheTime < WEATHER_CACHE_TTL) {
      return cached.data;
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (!data.current) return cached?.data || null;

      const weather = {
        temp: Math.round(data.current.temperature_2m),
        humidity: data.current.relative_humidity_2m,
        windSpeed: Math.round(data.current.wind_speed_10m),
        condition: this.getWeatherCondition(data.current.weather_code),
        icon: this.getWeatherIcon(data.current.weather_code),
        forecast: data.daily?.time.slice(0, 3).map((date, i) => ({
          date: this.formatDate(date),
          maxTemp: Math.round(data.daily.temperature_2m_max[i]),
          minTemp: Math.round(data.daily.temperature_2m_min[i]),
          icon: this.getWeatherIcon(data.daily.weather_code[i])
        })) || []
      };

      await Storage.set('weatherCache', { key: cacheKey, data: weather });
      await Storage.set('weatherCacheTime', now);

      return weather;
    } catch {
      return cached?.data || null;
    }
  },

  formatDate(dateStr) {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return '今天';
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return '明天';
    return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  },

  getWeatherCondition(code) {
    const map = { 0:'晴', 1:'晴', 2:'多云', 3:'阴', 45:'雾', 51:'小雨', 61:'雨', 71:'雪', 80:'阵雨', 95:'雷暴' };
    return map[code] || '未知';
  },

  getWeatherIcon(code) {
    if (code <= 1) return 'fa-sun';
    if (code === 2) return 'fa-cloud-sun';
    if (code === 3) return 'fa-cloud';
    if (code >= 45 && code <= 48) return 'fa-smog';
    if (code >= 51 && code <= 67) return 'fa-cloud-rain';
    if (code >= 71 && code <= 77) return 'fa-snowflake';
    if (code >= 80 && code <= 82) return 'fa-cloud-showers-heavy';
    if (code >= 95) return 'fa-bolt';
    return 'fa-cloud';
  },

  // 电影推荐 - 真实API，带3小时缓存
  async getMovieRecommendation() {
    // 检查缓存
    const cacheTime = await Storage.get('movieCacheTime') || 0;
    const cached = await Storage.get('movieCache');
    const now = Date.now();

    if (cached && (now - cacheTime) < RECOMMENDATION_CACHE_WINDOW) {
      return cached;
    }

    // 尝试从真实API获取中文电影
    const movie = await this.fetchChineseMovieFromAPI();
    
    if (!movie) {
      // 如果API失败，返回备用电影
      const fallbackMovies = [
        { title: '霸王别姬', originalTitle: '霸王别姬', year: '1993', rating: 9.6, genre: '剧情 / 爱情', director: '陈凯歌', poster: 'https://picsum.photos/seed/movie-bawang/300/450.jpg', quote: '风华绝代，人生如戏。' },
        { title: '活着', originalTitle: '活着', year: '1994', rating: 9.3, genre: '剧情 / 历史', director: '张艺谋', poster: 'https://picsum.photos/seed/movie-huozhe/300/450.jpg', quote: '人是为了活着本身而活着的。' },
        { title: '大话西游之大圣娶亲', originalTitle: '大话西游之大圣娶亲', year: '1995', rating: 9.2, genre: '喜剧 / 爱情', director: '刘镇伟', poster: 'https://picsum.photos/seed/movie-dahuaxiyou/300/450.jpg', quote: '曾经有一份真诚的爱情放在我面前。' }
      ];
      const fallbackMovie = fallbackMovies[Math.floor(Math.random() * fallbackMovies.length)];
      
      await Storage.set('movieCache', fallbackMovie);
      await Storage.set('movieCacheTime', now);
      return fallbackMovie;
    }

    // 保存到缓存
    await Storage.set('movieCache', movie);
    await Storage.set('movieCacheTime', now);

    return movie;
  },

  // 从真实API获取中文电影
  async fetchChineseMovieFromAPI() {
    const apis = [
      {
        url: 'https://api.sampleapis.com/movies',
        parse: (data) => {
          if (!Array.isArray(data) || data.length === 0) return null;
          const movie = data[Math.floor(Math.random() * Math.min(10, data.length))];
          return {
            title: movie.title || '电影标题',
            originalTitle: movie.title || '电影标题',
            year: movie.year ? String(movie.year) : '2024',
            rating: movie.imdbID ? 8.5 : (Math.random() * 2 + 7).toFixed(1),
            genre: movie.genres?.join(' / ') || '剧情',
            director: '导演',
            poster: movie.poster && movie.poster.startsWith('http') ? movie.poster : `https://picsum.photos/seed/movie-${Date.now()}/300/450.jpg`,
            quote: movie.description || '好电影总能治愈生活。',
            fullPlot: movie.description || '好电影总能治愈生活。'
          };
        }
      }
    ];

    for (const api of apis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = api.parse(data);
        if (parsed) return parsed;
      } catch (e) {
        continue;
      }
    }

    return null;
  },

  // 每日谚语
  async getDailyProverb(forceNew = false) {
    const todayKey = this.getDateKey();
    const cached = await Storage.get('proverbCache');
    const cacheDate = await Storage.get('proverbCacheDate');

    if (!forceNew && cached && cacheDate === todayKey) {
      return cached;
    }

    const fetched = await this.fetchDailyProverbFromAPI();
    if (fetched) {
      const normalized = this.normalizeProverb(fetched, todayKey);
      await Storage.set('proverbCache', normalized);
      await Storage.set('proverbCacheDate', todayKey);
      await Storage.recordProverb(normalized, { dateKey: todayKey, fetchedAt: normalized.fetchedAt });
      return normalized;
    }

    if (cached) return cached;

    const history = await Storage.get('proverbHistory');
    if (history?.length) return history[0];

    return null;
  },

  async fetchDailyProverbFromAPI() {
    const apis = [
      {
        url: 'https://v1.jinrishici.com/all.json',
        noCache: true,
        timeout: 6000,
        parse: (data) => {
          if (!data?.content) return null;
          return {
            text: data.content,
            author: data.author || '',
            source: data.origin || '今日诗词',
            category: data.category || '诗词'
          };
        }
      },
      {
        url: 'https://v1.hitokoto.cn/?c=d&c=i&c=k&c=l&encode=json&charset=utf-8',
        noCache: true,
        timeout: 5000,
        parse: (data) => {
          if (!data?.hitokoto) return null;
          return {
            text: data.hitokoto,
            author: data.from_who || data.creator || '',
            source: data.from || '一言',
            category: '每日一言'
          };
        }
      }
    ];

    for (const api of apis) {
      try {
        const endpoint = api.noCache
          ? `${api.url}${api.url.includes('?') ? '&' : '?'}t=${Date.now()}`
          : api.url;
        const res = await fetch(endpoint, { signal: AbortSignal.timeout(api.timeout || 5000) });
        if (!res.ok) continue;
        const data = await res.json();
        const parsed = api.parse(data);
        if (parsed?.text) {
          return parsed;
        }
      } catch (error) {
        continue;
      }
    }

    return null;
  },

  normalizeProverb(proverb, dateKey) {
    const sanitized = {
      text: (proverb.text || '').trim(),
      author: (proverb.author || '').trim(),
      source: (proverb.source || '').trim(),
      category: proverb.category || '每日谚语'
    };

    return {
      ...sanitized,
      fetchedAt: new Date().toISOString(),
      dateKey
    };
  },

  getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0];
  },


  // 网页游戏推荐
  getGamesRecommendation() {
    const games = [
      { name: '2048', url: 'https://play2048.co/', icon: '🎮', description: '经典数字合成游戏', color: '#edc22e' },
      { name: 'Wordle', url: 'https://www.nytimes.com/games/wordle/index.html', icon: '📝', description: '猜单词游戏', color: '#6aaa64' },
      { name: 'Tetris', url: 'https://tetris.com/play-tetris', icon: '🧩', description: '俄罗斯方块', color: '#0094d4' },
      { name: 'Pac-Man', url: 'https://www.google.com/logos/2010/pacman10-i.html', icon: '👾', description: '吃豆人经典', color: '#ffcc00' },
      { name: 'Snake', url: 'https://www.google.com/fbx?fbx=snake_arcade', icon: '🐍', description: '贪吃蛇', color: '#4caf50' },
      { name: 'Minesweeper', url: 'https://minesweeper.online/', icon: '💣', description: '扫雷', color: '#757575' }
    ];
    
    return games;
  },


  async getRandomWallpaper(source = 'unsplash') {
    const api = this.imageAPIs[source];
    if (!api) return null;
    try {
      return typeof api.getUrl === 'function' ? await api.getUrl() : api.getUrl;
    } catch { return `https://picsum.photos/1920/1080?t=${Date.now()}`; }
  }
};
