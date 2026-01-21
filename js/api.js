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
    NEGATIVE_CACHE_KEY: 'iconNegativeCache',

    ICON_DATA_TTL: 30 * 24 * 60 * 60 * 1000, // 30天
    NEGATIVE_TTL: 6 * 60 * 60 * 1000, // 6小时

    // 获取域名的首选图标源（历史兼容，当前已不再依赖多源索引）
    async getPreferredSource(hostname) {
      const cache = await Storage.get(this.PREFERRED_SOURCE_KEY) || {};
      return cache[hostname] || null;
    },

    // 保存成功的图标源（历史兼容）
    async savePreferredSource(hostname, sourceIndex) {
      const cache = await Storage.get(this.PREFERRED_SOURCE_KEY) || {};
      cache[hostname] = {
        index: sourceIndex,
        lastSuccess: Date.now()
      };
      await Storage.set(this.PREFERRED_SOURCE_KEY, cache);
    },

    // 获取缓存的图标数据URL（兼容旧 string 结构）
    async getCachedIcon(hostname) {
      const cache = await Storage.get(this.ICON_DATA_CACHE_KEY) || {};
      const entry = cache[hostname];

      if (!entry) return null;

      if (typeof entry === 'string') {
        return entry.startsWith('data:image/') ? entry : null;
      }

      if (entry && typeof entry === 'object') {
        const dataUrl = entry.dataUrl;
        const updatedAt = entry.updatedAt || 0;
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
        if (updatedAt && Date.now() - updatedAt > this.ICON_DATA_TTL) return null;
        return dataUrl;
      }

      return null;
    },

    // 缓存图标数据URL
    async cacheIcon(hostname, dataUrl, meta = {}) {
      const cache = await Storage.get(this.ICON_DATA_CACHE_KEY) || {};
      cache[hostname] = {
        dataUrl,
        updatedAt: Date.now(),
        source: meta.source || ''
      };
      await Storage.set(this.ICON_DATA_CACHE_KEY, cache);
      console.log(`图标已缓存 - 域名: ${hostname}`);
    },

    async markFailed(hostname) {
      const cache = await Storage.get(this.NEGATIVE_CACHE_KEY) || {};
      cache[hostname] = {
        lastFailure: Date.now()
      };
      await Storage.set(this.NEGATIVE_CACHE_KEY, cache);
    },

    async clearFailed(hostname) {
      const cache = await Storage.get(this.NEGATIVE_CACHE_KEY) || {};
      if (cache[hostname]) {
        delete cache[hostname];
        await Storage.set(this.NEGATIVE_CACHE_KEY, cache);
      }
    },

    async isRecentlyFailed(hostname) {
      const cache = await Storage.get(this.NEGATIVE_CACHE_KEY) || {};
      const entry = cache[hostname];
      if (!entry?.lastFailure) return false;
      return Date.now() - entry.lastFailure < this.NEGATIVE_TTL;
    },

    // 清理7天前的首选源记录（历史兼容）
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

    // 清理过期/无效的图标数据缓存
    async cleanupIconDataCache() {
      const cache = await Storage.get(this.ICON_DATA_CACHE_KEY) || {};
      const now = Date.now();
      let changed = false;

      for (const [hostname, entry] of Object.entries(cache)) {
        if (typeof entry === 'string') {
          if (!entry.startsWith('data:image/')) {
            delete cache[hostname];
            changed = true;
          }
          continue;
        }

        if (!entry || typeof entry !== 'object') {
          delete cache[hostname];
          changed = true;
          continue;
        }

        const dataUrl = entry.dataUrl;
        const updatedAt = entry.updatedAt || 0;
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
          delete cache[hostname];
          changed = true;
          continue;
        }

        if (updatedAt && now - updatedAt > this.ICON_DATA_TTL) {
          delete cache[hostname];
          changed = true;
        }
      }

      if (changed) {
        await Storage.set(this.ICON_DATA_CACHE_KEY, cache);
        console.log('图标数据缓存清理完成');
      }
    },

    async cleanupNegativeCache() {
      const cache = await Storage.get(this.NEGATIVE_CACHE_KEY) || {};
      const now = Date.now();
      let changed = false;

      for (const [hostname, entry] of Object.entries(cache)) {
        if (!entry?.lastFailure || now - entry.lastFailure > this.NEGATIVE_TTL) {
          delete cache[hostname];
          changed = true;
        }
      }

      if (changed) {
        await Storage.set(this.NEGATIVE_CACHE_KEY, cache);
      }
    }
  },

  // Favicon 解析与加载（cache-first）
  faviconLoader: {
    ICON_SIZE: 64,
    _inFlightByHostname: new Map(),

    _ensureUrl(pageUrl) {
      if (!pageUrl) return null;
      try {
        return new URL(pageUrl);
      } catch {
        try {
          return new URL(`https://${pageUrl}`);
        } catch {
          return null;
        }
      }
    },

    _getApiFallbackUrls(hostname) {
      const safeHost = encodeURIComponent(hostname);
      return [
        `https://www.google.com/s2/favicons?domain=${safeHost}&sz=64`,
        `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent('https://' + safeHost)}&size=64`,
        `https://favicons.githubusercontent.com/${safeHost}`,
        `https://favicon.im/${safeHost}`,
        `https://icon.horse/icon/${safeHost}`
      ];
    },

    async _fetchAsDataUrl(url) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(3000),
          credentials: 'omit',
          cache: 'no-store'
        });
        if (!res.ok) return null;

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const looksLikeIcon = url.toLowerCase().includes('favicon') ||
                             url.toLowerCase().endsWith('.ico') ||
                             url.toLowerCase().includes('icon');
        // 更宽松的 content-type 检查，支持各种变体
        const isImageResponse = contentType.startsWith('image/') ||
                              contentType.includes('icon') ||
                              contentType.includes('octet-stream') ||
                              contentType === 'application/x-icon' ||
                              contentType === 'image/vnd.microsoft.icon' ||
                              contentType === 'image/x-icon' ||
                              (looksLikeIcon && (contentType === 'application/octet-stream' || !contentType));
        if (!isImageResponse) return null;

        const blob = await res.blob();
        if (!blob || blob.size === 0) return null;
        if (blob.size > 1024 * 1024) return null;

        // 支持多种图片格式，包括 webp
        const isImage = blob.type.startsWith('image/') || blob.type === 'application/octet-stream' || !blob.type;
        if (!isImage) return null;

        // SVG 直接转 data URL；其他尽量缩放为 64x64 PNG 以减小缓存体积
        if (blob.type === 'image/svg+xml') {
          return await this._blobToDataUrl(blob);
        }

        const resized = await this._rasterBlobToPngDataUrl(blob, this.ICON_SIZE);
        return resized || await this._blobToDataUrl(blob);
      } catch {
        return null;
      }
    },

    _blobToDataUrl(blob) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    },

    async _rasterBlobToPngDataUrl(blob, size) {
      try {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.clearRect(0, 0, size, size);

        const scale = Math.min(size / bitmap.width, size / bitmap.height);
        const drawW = Math.max(1, Math.round(bitmap.width * scale));
        const drawH = Math.max(1, Math.round(bitmap.height * scale));
        const dx = Math.floor((size - drawW) / 2);
        const dy = Math.floor((size - drawH) / 2);

        ctx.drawImage(bitmap, dx, dy, drawW, drawH);
        bitmap.close?.();

        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    },

    async _tryHeadIcons(urlObj) {
      const candidates = [];

      const tryFetchHtml = async (target) => {
        try {
          const res = await fetch(target, {
            signal: AbortSignal.timeout(3000),
            credentials: 'omit',
            cache: 'no-store',
            headers: {
              'accept': 'text/html,application/xhtml+xml'
            }
          });
          if (!res.ok) return null;
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (!contentType.includes('text/html')) return null;
          return await res.text();
        } catch {
          return null;
        }
      };

      const html = await tryFetchHtml(urlObj.origin + '/');
      if (!html) return null;

      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
        const baseUrl = baseHref ? new URL(baseHref, urlObj.origin).toString() : urlObj.origin + '/';

        const links = Array.from(doc.querySelectorAll('link[rel][href]'))
          .map((el) => ({
            rel: (el.getAttribute('rel') || '').toLowerCase(),
            href: el.getAttribute('href') || '',
            sizes: el.getAttribute('sizes') || ''
          }))
          .filter((item) => item.href && !item.href.startsWith('data:'))
          .filter((item) => item.rel.includes('icon') || item.rel.includes('apple-touch-icon'))
          .slice(0, 12);

        const score = (item) => {
          let s = 0;
          if (item.rel.includes('icon')) s += 10;
          if (item.rel.includes('shortcut')) s += 2;
          if (item.rel.includes('apple-touch-icon')) s += 1;

          const match = item.sizes.match(/(\d+)x(\d+)/);
          if (match) {
            const w = parseInt(match[1], 10);
            const h = parseInt(match[2], 10);
            if (!Number.isNaN(w) && !Number.isNaN(h)) s += Math.min(20, Math.floor(Math.max(w, h) / 16));
          }
          return -s;
        };

        links.sort((a, b) => score(a) - score(b));

        for (const item of links) {
          try {
            const abs = new URL(item.href, baseUrl).toString();
            if (!candidates.includes(abs)) candidates.push(abs);
          } catch {
            continue;
          }
        }
      } catch {
        return null;
      }

      // 并行尝试前3个图标，加快速度
      const results = await Promise.allSettled(
        candidates.slice(0, 3).map(url => this._fetchAsDataUrl(url))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          return result.value;
        }
      }

      // 如果并行失败，逐个尝试剩余的
      for (const iconUrl of candidates.slice(3)) {
        const dataUrl = await this._fetchAsDataUrl(iconUrl);
        if (dataUrl) return dataUrl;
      }

      return null;
    },

    async _resolveInternal(urlObj) {
      const hostname = urlObj.hostname;

      const cached = await API.iconCache.getCachedIcon(hostname);
      if (cached) return cached;

      if (await API.iconCache.isRecentlyFailed(hostname)) {
        return null;
      }

      // Step 1: 尝试网站本身（总超时 5s）
      // Step 1a: GET /favicon.ico（超时 2s）
      const rootIconUrl = new URL('/favicon.ico', urlObj.origin).toString();
      const rootResult = await this._fetchAsDataUrlWithTimeout(rootIconUrl, 2000);

      if (rootResult) {
        await API.iconCache.cacheIcon(hostname, rootResult, { source: 'root' });
        await API.iconCache.clearFailed(hostname);
        return rootResult;
      }

      // Step 1b: 解析 HTML <link rel="icon">（超时 3s）
      const headResult = await this._tryHeadIconsWithTimeout(urlObj, 3000);

      if (headResult) {
        await API.iconCache.cacheIcon(hostname, headResult, { source: 'head' });
        await API.iconCache.clearFailed(hostname);
        return headResult;
      }

      // Step 2: 第三方 API（超时 3s，并行多个）
      const apiUrls = this._getApiFallbackUrls(hostname);
      const apiResult = await this.tryAnyApi(apiUrls, 3000);

      if (apiResult) {
        await API.iconCache.cacheIcon(hostname, apiResult, { source: 'api' });
        await API.iconCache.clearFailed(hostname);
        return apiResult;
      }

      // 所有来源都失败：写入负缓存，避免同页/刷新时随机变化
      await API.iconCache.markFailed(hostname);
      return null;
    },

    // 带超时的 favicon.ico 获取
    async _fetchAsDataUrlWithTimeout(url, timeoutMs) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(timeoutMs),
          credentials: 'omit',
          cache: 'no-store'
        });
        if (!res.ok) return null;

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const looksLikeIcon = url.toLowerCase().includes('favicon') ||
                             url.toLowerCase().endsWith('.ico') ||
                             url.toLowerCase().includes('icon');
        const isImageResponse = contentType.startsWith('image/') ||
                               contentType.includes('icon') ||
                               contentType.includes('octet-stream') ||
                               contentType === 'application/x-icon' ||
                               contentType === 'image/vnd.microsoft.icon' ||
                               contentType === 'image/x-icon' ||
                               (looksLikeIcon && (contentType === 'application/octet-stream' || !contentType));
        if (!isImageResponse) return null;

        const blob = await res.blob();
        if (!blob || blob.size === 0) return null;
        if (blob.size > 1024 * 1024) return null;

        const isImage = blob.type.startsWith('image/') || blob.type === 'application/octet-stream' || !blob.type;
        if (!isImage) return null;

        if (blob.type === 'image/svg+xml') {
          return await this._blobToDataUrl(blob);
        }

        const resized = await this._rasterBlobToPngDataUrl(blob, this.ICON_SIZE);
        return resized || await this._blobToDataUrl(blob);
      } catch {
        return null;
      }
    },

    // 带超时的 HTML 图标解析
    async _tryHeadIconsWithTimeout(urlObj, timeoutMs) {
      const tryFetchHtml = async (target) => {
        try {
          const res = await fetch(target, {
            signal: AbortSignal.timeout(timeoutMs),
            credentials: 'omit',
            cache: 'no-store',
            headers: {
              'accept': 'text/html,application/xhtml+xml'
            }
          });
          if (!res.ok) return null;
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (!contentType.includes('text/html')) return null;
          return await res.text();
        } catch {
          return null;
        }
      };

      const html = await tryFetchHtml(urlObj.origin + '/');
      if (!html) return null;

      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const baseHref = doc.querySelector('base[href]')?.getAttribute('href');
        const baseUrl = baseHref ? new URL(baseHref, urlObj.origin).toString() : urlObj.origin + '/';

        const links = Array.from(doc.querySelectorAll('link[rel][href]'))
          .map((el) => ({
            rel: (el.getAttribute('rel') || '').toLowerCase(),
            href: el.getAttribute('href') || '',
            sizes: el.getAttribute('sizes') || ''
          }))
          .filter((item) => item.href && !item.href.startsWith('data:'))
          .filter((item) => item.rel.includes('icon') || item.rel.includes('apple-touch-icon'))
          .slice(0, 12);

        const score = (item) => {
          let s = 0;
          if (item.rel.includes('icon')) s += 10;
          if (item.rel.includes('shortcut')) s += 2;
          if (item.rel.includes('apple-touch-icon')) s += 1;

          const match = item.sizes.match(/(\d+)x(\d+)/);
          if (match) {
            const w = parseInt(match[1], 10);
            const h = parseInt(match[2], 10);
            if (!Number.isNaN(w) && !Number.isNaN(h)) s += Math.min(20, Math.floor(Math.max(w, h) / 16));
          }
          return -s;
        };

        links.sort((a, b) => score(a) - score(b));

        const candidates = [];
        for (const item of links) {
          try {
            const abs = new URL(item.href, baseUrl).toString();
            if (!candidates.includes(abs)) candidates.push(abs);
          } catch {
            continue;
          }
        }

        // 并行尝试图标，最快的返回
        const results = await Promise.allSettled(
          candidates.slice(0, 5).map(url => this._fetchAsDataUrl(url))
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            return result.value;
          }
        }

        return null;
      } catch {
        return null;
      }
    },

    // 尝试任意一个 API 返回成功即可
    async tryAnyApi(apiUrls, timeoutMs = 3000) {
      // 并行请求所有 API，取第一个成功的
      const results = await Promise.allSettled(
        apiUrls.map(url => this._fetchAsDataUrlWithTimeout(url, timeoutMs))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          return result.value;
        }
      }
      return null;
    },

    async resolve(pageUrl) {
      const urlObj = this._ensureUrl(pageUrl);
      if (!urlObj) return null;

      const hostname = urlObj.hostname;
      if (this._inFlightByHostname.has(hostname)) {
        return this._inFlightByHostname.get(hostname);
      }

      const promise = this._resolveInternal(urlObj)
        .catch(() => null)
        .finally(() => {
          this._inFlightByHostname.delete(hostname);
        });

      this._inFlightByHostname.set(hostname, promise);
      return promise;
    },

    async applyToImageElement(img) {
      if (!img || img.dataset.faviconBound === 'true') return;

      const pageUrl = img.dataset.pageUrl || img.getAttribute('data-page-url') || '';
      const urlObj = this._ensureUrl(pageUrl);
      const hostname = urlObj?.hostname || img.dataset.hostname || img.getAttribute('data-hostname');

      img.dataset.faviconBound = 'true';
      img.decoding = 'async';
      img.loading = 'lazy';

      const container = img.parentElement;
      const placeholder = container?.querySelector('.favicon-placeholder');

      const showPlaceholder = () => {
        if (placeholder) placeholder.style.display = 'flex';
        img.style.display = 'none';
      };

      const showIcon = () => {
        if (placeholder) placeholder.style.display = 'none';
        img.style.display = 'block';
      };

      img.onerror = () => {
        showPlaceholder();
      };

      showPlaceholder();

      if (hostname) {
        const cached = await API.iconCache.getCachedIcon(hostname);
        if (cached) {
          img.src = cached;
          showIcon();
          return;
        }

        if (await API.iconCache.isRecentlyFailed(hostname)) {
          return;
        }
      }

      const dataUrl = await this.resolve(pageUrl);
      if (dataUrl) {
        img.src = dataUrl;
        showIcon();
      }
    },

    async applyToImages(images) {
      if (!images) return;
      const list = Array.isArray(images) ? images : Array.from(images);
      await Promise.allSettled(list.map(img => this.applyToImageElement(img)));
    }
  },

  // 获取多个备选图标源URL（向后兼容，仅用于生成URL列表）
  getFaviconUrls(pageUrl, { size = 64 } = {}) {
    let urlObj = null;
    try {
      urlObj = new URL(pageUrl);
    } catch {
      try {
        urlObj = new URL(`https://${pageUrl}`);
      } catch {
        return [];
      }
    }

    const hostname = urlObj.hostname;
    return [
      `${urlObj.origin}/favicon.ico`,
      `https://favicon.im/${encodeURIComponent(hostname)}`,
      `https://icon.horse/icon/${encodeURIComponent(hostname)}`
    ];
  },

  // 获取单个图标URL（保持向后兼容）
  getFaviconUrl(pageUrl, { size = 64, scaleFactor = 2 } = {}) {
    const urls = this.getFaviconUrls(pageUrl, { size });
    return urls[0];
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
        const res = await fetch(api.url, { signal: AbortSignal.timeout(3000) });
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
