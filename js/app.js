// 主应用模块
const App = {
  wallpaperHistory: [],
  wallpaperIndex: -1,
  wallpaperNewTabTimer: null,
  wallpaperHourlyTimer: null,
  wallpaperDailyTimer: null,

  async init() {
    console.log('App initializing...');
    await this.loadData();

    // 立即渲染基础 UI（不等待任何 API）
    this.initClock();
    this.initGreeting();
    this.initShortcuts();
    this.initSettings();
    Search.init();

    // 后台异步初始化（不阻塞页面）
    this.initBackground();
    this.initWallpaperControls();
    this.startPeriodicWallpaperUpdate();
    this.updateWallpaperTimers(this.data.settings.autoChangeWallpaper || 'never');

    // 清理过期的图标缓存（每次启动时执行一次）
    this.cleanupIconCache();

    // 异步初始化壁纸库（不等待）
    this.initWallpaperLibrary().catch(err => console.warn('壁纸库初始化失败:', err));

    // 异步加载图标（增量加载，先显示占位符）
    this.loadIconsIncrementally();

    // 异步初始化小组件（不阻塞页面）
    const settings = this.data.settings;
    if (settings.showWeather !== false) Widgets.initWeather();
    if (settings.showProverb !== false) Widgets.initProverb();
    if (settings.showTodo !== false) Widgets.initTodo();
    if (settings.showBookmarks !== false) Widgets.initBookmarks();
    if (settings.showNotes !== false) Widgets.initNotes();
    if (settings.showGames !== false) Widgets.initGames();

    console.log('App initialized successfully');
  },
  
  // 清理过期的图标缓存
  async cleanupIconCache() {
    try {
      if (typeof API !== 'undefined' && API.iconCache) {
        await API.iconCache.cleanup();
        await API.iconCache.cleanupIconDataCache();
        await API.iconCache.cleanupNegativeCache();
        console.log('图标缓存清理完成');
      }
    } catch (error) {
      console.warn('清理图标缓存失败:', error);
    }
  },

  async loadData() {
    this.data = await Storage.getAll();
    this.applySettings(this.data.settings);
    Widgets.applyWidgetSettings(this.data.settings);
    
    // 迁移快捷方式数据以确保兼容性
    await this.migrateShortcutsData();
  },
  
  // 迁移快捷方式数据
  async migrateShortcutsData() {
    let shortcuts = this.data.shortcuts || [];
    let hasChanges = false;
    
    console.log('开始迁移快捷方式数据，当前数量:', shortcuts.length);
    
    shortcuts = shortcuts.map((shortcut, index) => {
      const original = { ...shortcut };
      
      // 如果快捷方式缺少新的属性，添加默认值
      if (!shortcut.hasOwnProperty('icon')) {
        shortcut.icon = 'default';
        hasChanges = true;
        console.log(`快捷方式 ${index} 缺少 icon 属性，设置为默认值`);
      }
      if (!shortcut.hasOwnProperty('color')) {
        shortcut.color = '';
        hasChanges = true;
        console.log(`快捷方式 ${index} 缺少 color 属性，设置为默认值`);
      }
      
      return shortcut;
    });
    
    // 如果有变更，保存更新后的数据
    if (hasChanges) {
      console.log('快捷方式数据有变更，正在保存...');
      await Storage.set('shortcuts', shortcuts);
      
      // 清理内存缓存
      Storage._memoryCache.delete('shortcuts');
      Storage._pendingGets.delete('shortcuts');
      
      this.data.shortcuts = shortcuts;
      console.log('快捷方式数据迁移完成并保存');
    } else {
      console.log('快捷方式数据无需迁移');
    }
  },

  // 渲染快捷方式列表
  renderShortcuts() {
    const grid = document.getElementById('shortcutsGrid');
    if (!grid) return;
    
    const shortcuts = this.data.shortcuts || [];
    
    grid.innerHTML = shortcuts.map((shortcut, index) => {
      const name = shortcut.name || '';
      const url = shortcut.url || '';

      const iconValue = shortcut.icon || 'default';
      const customColor = shortcut.color || '';

      const isDataIcon = typeof iconValue === 'string' && iconValue.startsWith('data:');
      const isTextIcon = typeof iconValue === 'string' && iconValue !== 'default' && !isDataIcon;

      let hostname = '';
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = '';
      }

      let iconMarkup = '';
      if (isTextIcon) {
        const multiClass = Array.from(iconValue).length > 1 ? ' multi' : '';
        iconMarkup = `<div class="shortcut-icon-fallback${multiClass}">${iconValue}</div>`;
      } else if (isDataIcon) {
        // 用户上传的自定义图标（已经是 data URL）
        iconMarkup = `
          <div class="favicon-placeholder" style="display:none" aria-hidden="true"></div>
          <img src="${iconValue}" alt="${name}" onerror="this.style.display='none'; this.previousElementSibling.style.display='flex';">
        `;
      } else {
        // 默认：按 cache-first → 网站 favicon → API → 统一占位符 的策略加载
        iconMarkup = `
          <div class="favicon-placeholder" aria-hidden="true"></div>
          <img class="shortcut-icon-img" data-page-url="${url}" ${hostname ? `data-hostname="${hostname}"` : ''} alt="${name}" style="display:none;">
        `;
      }

      return `
        <a href="${url}" class="shortcut-item" data-index="${index}" draggable="true" ${customColor ? `style="--shortcut-icon-color: ${customColor}"` : ''}>
          <button class="shortcut-delete" data-index="${index}">
            <i class="fas fa-times"></i>
          </button>
          <div class="shortcut-icon">
            ${iconMarkup}
          </div>
          <span class="shortcut-name">${name}</span>
        </a>
      `;
    }).join('');

    // 初始化拖拽功能
    Widgets.initShortcutsDragDrop(grid, shortcuts, () => this.renderShortcuts());
  },

  // 增量加载图标 - 批量并行加载，不阻塞页面
  async loadIconsIncrementally() {
    // 使用 requestIdleCallback 在浏览器空闲时加载图标
    const loadBatch = async (images, batchSize = 5, delay = 200) => {
      for (let i = 0; i < images.length; i += batchSize) {
        const batch = images.slice(i, i + batchSize);
        await API.faviconLoader?.applyToImages(batch);

        // 批次之间短暂延迟，避免阻塞主线程
        if (i + batchSize < images.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    };

    // 使用 requestIdleCallback 在浏览器空闲时开始加载
    const startLoading = () => {
      const shortcutImages = document.querySelectorAll('.shortcut-icon-img[data-page-url]');
      const bookmarkImages = document.querySelectorAll('.bookmark-icon-img[data-page-url]');

      // 优先加载快捷方式图标
      loadBatch(Array.from(shortcutImages), 5, 100);

      // 延迟加载书签图标
      setTimeout(() => {
        loadBatch(Array.from(bookmarkImages), 5, 100);
      }, 500);
    };

    // 检查浏览器是否支持 requestIdleCallback
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => startLoading(), { timeout: 2000 });
    } else {
      // 不支持则延迟执行
      setTimeout(() => startLoading(), 100);
    }
  },
  
  // 将图标转换为数据URL并缓存
  async cacheIconAsDataUrl(img, hostname) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 设置画布大小与图标相同
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        // 绘制图标到画布
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // 转换为数据URL
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (error) {
        reject(new Error('无法将图标转换为数据URL'));
      }
    });
  },
  
  // 加载图标，失败时自动降级
  loadIconWithFallback(img, sources, currentIndex, hostname) {
    if (currentIndex >= sources.length) {
      // 所有源都失败，显示降级图标
      console.warn(`所有图标源加载失败，使用降级图标 - 域名: ${hostname}`);
      img.style.display = 'none';
      if (img.nextElementSibling) {
        img.nextElementSibling.style.display = 'flex';
      }
      return;
    }
    
    const currentUrl = sources[currentIndex];
    console.log(`尝试加载图标 - 域名: ${hostname}, 源索引: ${currentIndex}, URL: ${currentUrl}`);
    
    // 设置加载成功和失败的处理
    const onLoad = async () => {
      // 图标加载成功，保存这个源为首选
      if (typeof API !== 'undefined' && API.iconCache) {
        await API.iconCache.savePreferredSource(hostname, currentIndex);
        
        // 将图标缓存为数据URL
        try {
          const cachedIcon = await this.cacheIconAsDataUrl(img, hostname);
          if (cachedIcon) {
            await API.iconCache.cacheIcon(hostname, cachedIcon);
          }
        } catch (error) {
          console.warn(`缓存图标失败 - 域名: ${hostname}, 错误: ${error.message}`);
        }
      }
      
      console.log(`图标加载成功 - 域名: ${hostname}, 源索引: ${currentIndex}`);
      img.style.display = 'block';
    };
    
    const onError = () => {
      console.warn(`图标加载失败 - 域名: ${hostname}, 源索引: ${currentIndex}, URL: ${currentUrl}`);
      // 当前源失败，尝试下一个
      this.loadIconWithFallback(img, sources, currentIndex + 1, hostname);
    };
    
    // 移除旧的事件监听器（如果有）
    img.onload = null;
    img.onerror = null;
    
    // 设置新的事件监听器
    img.onload = onLoad;
    img.onerror = onError;
    
    // 开始加载
    img.src = currentUrl;
  },

  // 初始化壁纸库
  async initWallpaperLibrary() {
    try {
      await API.wallpaperLibrary.init();
      await API.wallpaperLibrary.updatePool();
      console.log('壁纸库初始化完成');
    } catch (error) {
      console.warn('壁纸库初始化失败:', error);
    }
  },

  // 定期更新壁纸库（每30分钟一次）
  startPeriodicWallpaperUpdate() {
    setInterval(async () => {
      try {
        await API.wallpaperLibrary.updatePool();
      } catch (error) {
        console.error('定期更新壁纸库失败:', error);
      }
    }, 30 * 60 * 1000); // 30分钟
  },

  // 壁纸控制初始化
  initWallpaperControls() {
    const prevBtn = document.getElementById('prevWallpaperBtn');
    const refreshBtn = document.getElementById('refreshBgBtn');
    const nextBtn = document.getElementById('nextWallpaperBtn');
    const controls = document.getElementById('wallpaperControls');

    // 根据背景类型显示/隐藏控制按钮
    const settings = this.data.settings;
    if (settings.bgType === 'gradient' || settings.bgType === 'custom') {
      if (controls) controls.style.display = 'none';
    } else {
      if (controls) controls.style.display = 'flex';
    }

    // 加载历史壁纸
    this.loadWallpaperHistory();

    // 上一张
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.prevWallpaper();
      });
    }

    // 随机换一张
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.randomWallpaper();
      });
    }

    // 下一张
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.nextWallpaper();
      });
    }
  },

  async loadWallpaperHistory() {
    const history = await Storage.get('wallpaperHistory');
    if (history && Array.isArray(history)) {
      this.wallpaperHistory = history;
      this.wallpaperIndex = history.length - 1;
    }
  },

  async saveWallpaperHistory() {
    // 只保留最近20张
    if (this.wallpaperHistory.length > 20) {
      this.wallpaperHistory = this.wallpaperHistory.slice(-20);
    }
    await Storage.set('wallpaperHistory', this.wallpaperHistory);
  },

  async prevWallpaper() {
    if (this.wallpaperIndex > 0) {
      this.wallpaperIndex--;
      const url = this.wallpaperHistory[this.wallpaperIndex];
      this.applyWallpaperDirect(url);
      this.showBgInfo('上一张壁纸');
    } else {
      this.showBgInfo('已经是第一张了');
    }
  },

  async nextWallpaper() {
    if (this.wallpaperIndex < this.wallpaperHistory.length - 1) {
      this.wallpaperIndex++;
      const url = this.wallpaperHistory[this.wallpaperIndex];
      this.applyWallpaperDirect(url);
      this.showBgInfo('下一张壁纸');
    } else {
      // 如果已经是最新的，就获取新壁纸
      this.randomWallpaper();
    }
  },

  async randomWallpaper() {
    const refreshBtn = document.getElementById('refreshBgBtn');
    if (refreshBtn) refreshBtn.classList.add('loading');

    try {
      // 根据当前背景类型智能获取壁纸
      const bgType = this.data.settings.bgType;
      
      // 仅在使用图库源时更换壁纸
      if (['bing', 'unsplash', 'picsum'].includes(bgType)) {
        await this.loadWallpaperFromAPI(bgType, true);
      } else {
        this.showBgInfo('当前背景类型不支持自动更换');
      }
    } finally {
      if (refreshBtn) refreshBtn.classList.remove('loading');
    }
  },

  applyWallpaperDirect(url) {
    const bg = document.getElementById('background');
    bg.style.backgroundImage = `url(${url})`;
    Storage.set('currentWallpaper', url);
    this.data.currentWallpaper = url;
  },

  addToWallpaperHistory(url) {
    // 如果在历史中间位置添加新壁纸，删除后面的历史
    if (this.wallpaperIndex < this.wallpaperHistory.length - 1) {
      this.wallpaperHistory = this.wallpaperHistory.slice(0, this.wallpaperIndex + 1);
    }
    
    // 避免重复添加
    if (this.wallpaperHistory[this.wallpaperHistory.length - 1] !== url) {
      this.wallpaperHistory.push(url);
      this.wallpaperIndex = this.wallpaperHistory.length - 1;
      this.saveWallpaperHistory();
    }
  },

  showBgInfo(text) {
    const bgInfo = document.getElementById('bgInfo');
    if (bgInfo) {
      bgInfo.textContent = text;
      bgInfo.classList.add('show');
      setTimeout(() => bgInfo.classList.remove('show'), 2000);
    }
  },

  // 背景初始化
  initBackground() {
    this.loadBackground();
  },

  async loadBackground() {
    const settings = this.data.settings;
    const bg = document.getElementById('background');
    const controls = document.getElementById('wallpaperControls');

    // 根据背景类型显示/隐藏控制按钮
    if (controls) {
      controls.style.display = (settings.bgType === 'gradient' || settings.bgType === 'custom') ? 'none' : 'flex';
    }

    if (settings.bgType === 'gradient') {
      this.applyGradient(settings);
    } else if (settings.bgType === 'custom') {
      if (settings.bgImageUrl) {
        bg.style.backgroundImage = `url(${settings.bgImageUrl})`;
      }
    } else {
      // 对于图库类型，加载壁纸（根据自动更换模式决定）
      await this.loadWallpaperFromAPI(settings.bgType);
    }
  },

  async loadWallpaperFromAPI(source, forceNew = false) {
    const bg = document.getElementById('background');
    const settings = this.data.settings;

    // 检查是否需要换壁纸
    if (!forceNew) {
      const shouldChange = await this.shouldChangeWallpaper();
      if (!shouldChange && this.data.currentWallpaper) {
        bg.style.backgroundImage = `url(${this.data.currentWallpaper})`;
        return;
      }
    }

    try {
      let url = null;

      // 使用统一的API接口，自动从对应的库获取
      if (source === 'bing' || source === 'unsplash' || source === 'picsum') {
        const api = API.imageAPIs[source];
        if (api) {
          url = await api.getUrl();
        }
      } else {
        url = await API.getRandomWallpaper(source);
      }

      if (!url) {
        throw new Error('无法获取壁纸');
      }

      await this.preloadImage(url);
      
      // 记录为已展示的壁纸
      API.wallpaperLibrary.addToShownHistory(url);
      await API.wallpaperLibrary.save();
      
      this.applyWallpaperDirect(url);
      this.addToWallpaperHistory(url);
      
      await Storage.set('lastWallpaperChange', Date.now());

      const sourceNames = {
        unsplash: 'Unsplash',
        picsum: 'Lorem Picsum',
        bing: '必应每日壁纸'
      };
      
      this.showBgInfo(`图片来源: ${sourceNames[source] || source}`);

    } catch (error) {
      console.error('加载壁纸失败:', error);
      this.showBgInfo('壁纸加载失败');
    }
  },

  async shouldChangeWallpaper() {
    const settings = this.data.settings;

    switch (settings.autoChangeWallpaper) {
      case 'newtab':
        return true;
      case 'hourly':
        // Hourly mode is handled by the timer in updateWallpaperTimers()
        // This function should not change on newtab for hourly mode
        return false;
      default:
        // Default behavior: fetch only if no current wallpaper
        return !this.data.currentWallpaper;
    }
  },

  updateWallpaperTimers(mode) {
    // Clear all existing timers
    if (this.wallpaperHourlyTimer) {
      clearInterval(this.wallpaperHourlyTimer);
      this.wallpaperHourlyTimer = null;
    }

    console.log(`Wallpaper auto-change mode set to: ${mode}`);

    if (mode === 'hourly') {
      console.log('Starting hourly wallpaper auto-change timer');
      // Set a timer to change wallpaper every hour (3600000ms)
      // Also trigger immediately if wallpaper is older than 1 hour
      const checkAndChangeWallpaper = async () => {
        const lastChange = this.data.lastWallpaperChange || 0;
        const now = Date.now();
        if (now - lastChange > 3600000) {
          console.log('Hourly wallpaper change triggered');
          await this.randomWallpaper();
        }
      };

      // Check immediately on first load
      checkAndChangeWallpaper();

      // Then set interval for subsequent checks
      this.wallpaperHourlyTimer = setInterval(checkAndChangeWallpaper, 3600000);
    } else if (mode === 'newtab') {
      console.log('Using newtab mode - wallpaper will change on new tab opens');
      // newtab mode is handled via shouldChangeWallpaper() check in loadWallpaperFromAPI()
    }
  },

  preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
  },

  applyGradient(settings) {
    const bg = document.getElementById('background');
    let gradient;
    
    if (settings.gradientColor3 && settings.gradientColor3 !== '#ffffff') {
      gradient = `linear-gradient(${settings.gradientAngle}deg, ${settings.gradientColor1}, ${settings.gradientColor2}, ${settings.gradientColor3})`;
    } else {
      gradient = `linear-gradient(${settings.gradientAngle}deg, ${settings.gradientColor1}, ${settings.gradientColor2})`;
    }
    
    bg.style.backgroundImage = gradient;
  },

  // 时钟
  initClock() {
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('date');
    
    const updateClock = () => {
      const now = new Date();
      const settings = this.data.settings;
      
      let hours = now.getHours();
      let suffix = '';
      
      if (settings.use12Hour) {
        suffix = hours >= 12 ? ' PM' : ' AM';
        hours = hours % 12 || 12;
      }
      
      const timeStr = settings.showSeconds 
        ? `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}${suffix}`
        : `${String(hours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}${suffix}`;
      
      if (clockEl) clockEl.textContent = timeStr;
      
      if (dateEl) {
        const dateOptions = { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        };
        dateEl.textContent = now.toLocaleDateString('zh-CN', dateOptions);
      }
    };

    updateClock();
    setInterval(updateClock, 1000);
  },

  // 问候语
  initGreeting() {
    const greetingEl = document.getElementById('greeting');
    
    if (!greetingEl) return;
    
    if (!this.data.settings.showGreeting) {
      greetingEl.style.display = 'none';
      return;
    }

    const hour = new Date().getHours();
    
    let greeting;
    if (hour < 6) greeting = '夜深了，注意休息 🌙';
    else if (hour < 9) greeting = '早上好 ☀️';
    else if (hour < 12) greeting = '上午好 🌤️';
    else if (hour < 14) greeting = '中午好 🌞';
    else if (hour < 18) greeting = '下午好 ⛅';
    else if (hour < 22) greeting = '晚上好 🌆';
    else greeting = '夜深了，注意休息 🌙';
    
    greetingEl.textContent = greeting;
    greetingEl.style.display = 'block';
  },

  // 快捷方式
  async initShortcuts() {
    const grid = document.getElementById('shortcutsGrid');
    const addBtn = document.getElementById('addShortcutBtn');
    const modal = document.getElementById('shortcutModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelShortcutBtn');
    const saveBtn = document.getElementById('saveShortcutBtn');
    
    if (!grid) return;

    let shortcuts = this.data.shortcuts || [];

    this.renderShortcuts();

    // 删除快捷方式
    grid.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.shortcut-delete');

      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(deleteBtn.dataset.index);
        
        try {
          shortcuts.splice(index, 1);
          this.data.shortcuts = shortcuts;
          
          console.log('删除快捷方式:', {
            index: index,
            remainingShortcuts: shortcuts
          });
          
          await Storage.set('shortcuts', shortcuts);
          
          // 清理内存缓存
          Storage._memoryCache.delete('shortcuts');
          Storage._pendingGets.delete('shortcuts');
          
          this.renderShortcuts();
        } catch (error) {
          console.error('删除快捷方式失败:', error);
          alert('删除失败，请重试');
        }
      }
    });

    // 打开添加弹窗
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (modal) {
          document.getElementById('shortcutName').value = '';
          document.getElementById('shortcutUrl').value = '';
          modal.classList.add('show');
          document.getElementById('shortcutName').focus();
        }
      });
    }

    // 关闭弹窗
    const closeModal = () => {
      if (modal) modal.classList.remove('show');
    };
    
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // 保存快捷方式
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const name = document.getElementById('shortcutName').value.trim();
        let url = document.getElementById('shortcutUrl').value.trim();
        
        if (!name || !url) {
          alert('请填写名称和网址');
          return;
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        try {
          shortcuts.push({ 
            name, 
            url,
            icon: 'default',  // 默认图标
            color: ''         // 默认颜色
          });
          this.data.shortcuts = shortcuts;
          
          console.log('添加快捷方式:', {
            shortcut: { name, url, icon: 'default', color: '' },
            fullArray: shortcuts
          });
          
          await Storage.set('shortcuts', shortcuts);
          
          // 清理内存缓存
          Storage._memoryCache.delete('shortcuts');
          Storage._pendingGets.delete('shortcuts');
          
          this.renderShortcuts();
          closeModal();
        } catch (error) {
          console.error('添加快捷方式失败:', error);
          alert('添加失败，请重试');
        }
      });
    }

    // 回车保存
    const urlInput = document.getElementById('shortcutUrl');
    if (urlInput) {
      urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && saveBtn) {
          saveBtn.click();
        }
      });
    }

    // ==================== 编辑功能 ====================
    const editModal = document.getElementById('editShortcutModal');
    const editNameInput = document.getElementById('editShortcutName');
    const editUrlInput = document.getElementById('editShortcutUrl');
    const editIconTextInput = document.getElementById('editIconText');
    const editIconColorInput = document.getElementById('editIconColor');
    const iconUploadInput = document.getElementById('iconUpload');
    const iconPreview = document.getElementById('editIconPreview');
    const iconFallback = document.getElementById('editIconFallback');
    const uploadIconBtn = document.getElementById('uploadIconBtn');
    const useDefaultIconBtn = document.getElementById('useDefaultIconBtn');
    const removeCustomIconBtn = document.getElementById('removeCustomIconBtn');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');
    const cancelEditShortcutBtn = document.getElementById('cancelEditShortcutBtn');
    const saveEditShortcutBtn = document.getElementById('saveEditShortcutBtn');
    
    let editingIndex = -1;
    let customIconData = null;

    const getInitialFromName = (name) => {
      const firstChar = Array.from((name || '').trim())[0] || '?';
      return /^[a-z]$/i.test(firstChar) ? firstChar.toUpperCase() : firstChar;
    };

    const applyPreviewColor = (color) => {
      if (!iconFallback) return;

      if (color) {
        iconFallback.style.setProperty('--shortcut-icon-color', color);
      } else {
        iconFallback.style.removeProperty('--shortcut-icon-color');
      }
    };

    const updateIconPreview = ({ name, icon, color }) => {
      if (!iconPreview || !iconFallback) return;

      const iconValue = icon || 'default';
      const isDataIcon = typeof iconValue === 'string' && iconValue.startsWith('data:');
      const isTextIcon = typeof iconValue === 'string' && iconValue !== 'default' && !isDataIcon;
      const fallbackText = isTextIcon ? iconValue : '?';

      iconFallback.textContent = fallbackText;
      iconFallback.classList.toggle('multi', Array.from(fallbackText).length > 1);

      applyPreviewColor(color);

      if (isDataIcon) {
        iconPreview.src = iconValue;
        iconPreview.style.display = 'block';
        iconFallback.style.display = 'none';

        iconPreview.onload = () => {
          iconFallback.style.display = 'none';
        };

        iconPreview.onerror = () => {
          iconPreview.style.display = 'none';
          iconFallback.style.display = 'flex';
        };

        return;
      }

      iconPreview.style.display = 'none';
      iconPreview.src = '';
      iconFallback.style.display = 'flex';
    };

    const updateIconPreviewFromForm = () => {
      const name = editNameInput?.value || '';
      const color = editIconColorInput?.value || '';
      const iconText = editIconTextInput?.value?.trim() || '';
      const icon = customIconData ? customIconData : (iconText ? iconText : 'default');
      updateIconPreview({ name, icon, color });
    };

    // 打开编辑模态框
    const openEditModal = (index) => {
      editingIndex = index;
      const shortcut = shortcuts[index];

      const iconValue = shortcut?.icon || 'default';
      const isDataIcon = typeof iconValue === 'string' && iconValue.startsWith('data:');
      const isTextIcon = typeof iconValue === 'string' && iconValue !== 'default' && !isDataIcon;

      editNameInput.value = shortcut.name || '';
      editUrlInput.value = shortcut.url || '';
      editIconColorInput.value = shortcut.color || '#667eea';

      if (editIconTextInput) {
        editIconTextInput.value = isTextIcon ? iconValue : '';
      }

      customIconData = isDataIcon ? iconValue : null;

      updateIconPreviewFromForm();

      editModal?.classList.add('show');
      editNameInput.focus();
    };

    // 上传图标
    if (uploadIconBtn && iconUploadInput) {
      uploadIconBtn.addEventListener('click', () => {
        iconUploadInput.click();
      });

      iconUploadInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          customIconData = event.target.result;
          if (editIconTextInput) editIconTextInput.value = '';
          updateIconPreviewFromForm();
        };
        reader.readAsDataURL(file);
      });
    }

    // 文字图标
    if (editIconTextInput) {
      editIconTextInput.addEventListener('input', () => {
        if (customIconData) {
          customIconData = null;
          if (iconUploadInput) iconUploadInput.value = '';
        }
        updateIconPreviewFromForm();
      });
    }

    // 使用默认图标
    if (useDefaultIconBtn) {
      useDefaultIconBtn.addEventListener('click', () => {
        customIconData = null;
        if (iconUploadInput) iconUploadInput.value = '';
        if (editIconTextInput) editIconTextInput.value = '';
        updateIconPreviewFromForm();
      });
    }

    // 移除自定义图标（上传/文字）
    if (removeCustomIconBtn) {
      removeCustomIconBtn.addEventListener('click', () => {
        customIconData = null;
        if (iconUploadInput) iconUploadInput.value = '';
        if (editIconTextInput) editIconTextInput.value = '';
        updateIconPreviewFromForm();
      });
    }

    const closeEditModal = () => {
      editModal?.classList.remove('show');
      editingIndex = -1;
      customIconData = null;
      if (iconUploadInput) iconUploadInput.value = '';
      if (editIconTextInput) editIconTextInput.value = '';
      if (iconPreview) {
        iconPreview.src = '';
        iconPreview.style.display = 'none';
      }
      iconFallback?.style.removeProperty('--shortcut-icon-color');
      iconFallback?.classList.remove('multi');
    };

    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);
    if (cancelEditShortcutBtn) cancelEditShortcutBtn.addEventListener('click', closeEditModal);
    if (editModal) {
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
      });
    }

    // 保存编辑
    if (saveEditShortcutBtn) {
      saveEditShortcutBtn.addEventListener('click', async () => {
        const name = editNameInput.value.trim();
        let url = editUrlInput.value.trim();
        const color = editIconColorInput.value;
        const iconText = editIconTextInput?.value?.trim() || '';

        if (!name || !url) {
          alert('请填写名称和网址');
          return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }

        // 获取原始快捷方式，确保不丢失其他属性
        const originalShortcut = shortcuts[editingIndex] || {};
        const updatedShortcut = { ...originalShortcut, name, url };

        if (customIconData) {
          updatedShortcut.icon = customIconData;
        } else if (iconText) {
          updatedShortcut.icon = iconText;
        } else {
          updatedShortcut.icon = 'default';
        }

        if (color) {
          updatedShortcut.color = color;
        } else {
          updatedShortcut.color = '';
        }

        try {
          // 更新快捷方式数组（只修改当前索引，使用展开运算符保留其他属性）
          shortcuts[editingIndex] = { ...updatedShortcut };
          this.data.shortcuts = shortcuts;

          console.log('保存快捷方式编辑:', {
            index: editingIndex,
            shortcut: updatedShortcut
          });

          // 保存到存储
          await Storage.set('shortcuts', shortcuts);

          // 清理内存缓存，确保下次读取时获取最新数据
          Storage._memoryCache.delete('shortcuts');
          Storage._pendingGets.delete('shortcuts');

          console.log('快捷方式已保存，重新渲染UI');

          // 重新渲染UI
          this.renderShortcuts();
          closeEditModal();

        } catch (error) {
          console.error('保存快捷方式失败:', error);
          alert('保存失败，请重试');
        }
      });
    }

    // 实时更新预览
    editNameInput?.addEventListener('input', updateIconPreviewFromForm);
    editIconColorInput?.addEventListener('input', updateIconPreviewFromForm);

    // ==================== 右键菜单 ====================
    const contextMenu = document.getElementById('shortcutContextMenu');
    const contextEditBtn = document.getElementById('shortcutContextEdit');
    let contextMenuIndex = -1;

    const hideContextMenu = () => {
      if (!contextMenu) return;
      contextMenu.classList.remove('show');
      contextMenu.setAttribute('aria-hidden', 'true');
      contextMenuIndex = -1;
    };

    const showContextMenu = (x, y) => {
      if (!contextMenu) return;

      contextMenu.style.left = `${x}px`;
      contextMenu.style.top = `${y}px`;
      contextMenu.classList.add('show');
      contextMenu.setAttribute('aria-hidden', 'false');

      // Prevent overflow beyond viewport
      requestAnimationFrame(() => {
        const rect = contextMenu.getBoundingClientRect();
        const padding = 8;

        let left = x;
        let top = y;

        if (left + rect.width > window.innerWidth - padding) {
          left = window.innerWidth - rect.width - padding;
        }
        if (top + rect.height > window.innerHeight - padding) {
          top = window.innerHeight - rect.height - padding;
        }

        contextMenu.style.left = `${Math.max(padding, left)}px`;
        contextMenu.style.top = `${Math.max(padding, top)}px`;
      });
    };

    grid.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('.shortcut-item');
      if (!item) return;

      e.preventDefault();
      e.stopPropagation();

      const index = parseInt(item.dataset.index);
      if (Number.isNaN(index)) return;

      contextMenuIndex = index;
      showContextMenu(e.clientX, e.clientY);
    });

    contextEditBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (contextMenuIndex !== -1) {
        openEditModal(contextMenuIndex);
      }
      hideContextMenu();
    });

    document.addEventListener('click', (e) => {
      if (contextMenu?.classList.contains('show') && !contextMenu.contains(e.target)) {
        hideContextMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    });

    window.addEventListener('blur', hideContextMenu);
    window.addEventListener('scroll', hideContextMenu, true);
  },

  // 设置
  initSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');

    if (settingsBtn && settingsPanel) {
      settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('open');
      });
    }

    if (closeSettingsBtn && settingsPanel) {
      closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.remove('open');
      });
    }

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (settingsPanel && settingsPanel.classList.contains('open') && 
          !settingsPanel.contains(e.target) && 
          settingsBtn && !settingsBtn.contains(e.target)) {
        settingsPanel.classList.remove('open');
      }
    });

    // 初始化渐变预设
    this.initGradientPresets();
    
    // 绑定设置项
    this.bindSettingsEvents();
  },

  initGradientPresets() {
    const container = document.getElementById('gradientPresets');
    if (!container) return;
    
    const presets = API.gradientPresets;
    
    container.innerHTML = presets.map((preset, index) => {
      let gradientStyle;
      if (preset.colors.length === 3) {
        gradientStyle = `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]}, ${preset.colors[2]})`;
      } else {
        gradientStyle = `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})`;
      }
      
      return `
        <div class="gradient-preset ${index === this.data.settings.gradientPresetIndex ? 'active' : ''}" 
             data-index="${index}" 
             style="background: ${gradientStyle};"
             title="${preset.name}">
        </div>
      `;
    }).join('');

    // 点击选择预设
    container.addEventListener('click', async (e) => {
      const preset = e.target.closest('.gradient-preset');
      if (!preset) return;

      const index = parseInt(preset.dataset.index);
      const selectedPreset = presets[index];
      
      container.querySelectorAll('.gradient-preset').forEach(p => p.classList.remove('active'));
      preset.classList.add('active');

      const settings = this.data.settings;
      settings.gradientPresetIndex = index;
      settings.gradientColor1 = selectedPreset.colors[0];
      settings.gradientColor2 = selectedPreset.colors[1];
      settings.gradientColor3 = selectedPreset.colors[2] || '';

      const color1El = document.getElementById('gradientColor1');
      const color2El = document.getElementById('gradientColor2');
      const color3El = document.getElementById('gradientColor3');
      
      if (color1El) color1El.value = settings.gradientColor1;
      if (color2El) color2El.value = settings.gradientColor2;
      if (color3El) color3El.value = settings.gradientColor3 || '#ffffff';

      await this.saveAndApplySettings(settings);
    });
  },

  bindSettingsEvents() {
    const settings = this.data.settings;
    
    // 背景类型
    const bgType = document.getElementById('bgType');
    
    if (bgType) {
      bgType.value = settings.bgType;
      this.toggleBgSettings(settings.bgType);
      
      bgType.addEventListener('change', async (e) => {
        settings.bgType = e.target.value;
        this.toggleBgSettings(e.target.value);
        await this.saveAndApplySettings(settings);
        this.loadBackground();
        
        // 更新壁纸控制按钮显示
        const controls = document.getElementById('wallpaperControls');
        if (controls) {
          controls.style.display = (e.target.value === 'gradient' || e.target.value === 'custom') ? 'none' : 'flex';
        }
      });
    }

    // 渐变颜色
    const color1 = document.getElementById('gradientColor1');
    const color2 = document.getElementById('gradientColor2');
    const color3 = document.getElementById('gradientColor3');
    
    if (color1) color1.value = settings.gradientColor1;
    if (color2) color2.value = settings.gradientColor2;
    if (color3) color3.value = settings.gradientColor3 || '#ffffff';
    
    const colorChangeHandler = async () => {
      if (color1) settings.gradientColor1 = color1.value;
      if (color2) settings.gradientColor2 = color2.value;
      if (color3) settings.gradientColor3 = color3.value !== '#ffffff' ? color3.value : '';
      
      document.querySelectorAll('.gradient-preset').forEach(p => p.classList.remove('active'));
      
      await this.saveAndApplySettings(settings);
    };

    if (color1) color1.addEventListener('input', colorChangeHandler);
    if (color2) color2.addEventListener('input', colorChangeHandler);
    if (color3) color3.addEventListener('input', colorChangeHandler);

    // 渐变角度
    const angleSlider = document.getElementById('gradientAngle');
    const angleValue = document.getElementById('angleValue');
    
    if (angleSlider && angleValue) {
      angleSlider.value = settings.gradientAngle;
      angleValue.textContent = `${settings.gradientAngle}°`;
      
      angleSlider.addEventListener('input', async (e) => {
        settings.gradientAngle = parseInt(e.target.value);
        angleValue.textContent = `${settings.gradientAngle}°`;
        await this.saveAndApplySettings(settings);
      });
    }

    // 自动换壁纸 - 单选按钮
    const autoChangeRadios = document.querySelectorAll('input[name="autoChangeWallpaper"]');
    if (autoChangeRadios.length > 0) {
      const currentValue = settings.autoChangeWallpaper || 'newtab';
      autoChangeRadios.forEach(radio => {
        radio.checked = radio.value === currentValue;
        
        radio.addEventListener('change', async (e) => {
          if (e.target.checked) {
            settings.autoChangeWallpaper = e.target.value;
            // Update wallpaper timers based on selection
            this.updateWallpaperTimers(e.target.value);
            await this.saveAndApplySettings(settings);
          }
        });
      });
    }

    // 自定义图片URL
    const bgImageUrl = document.getElementById('bgImageUrl');
    if (bgImageUrl) {
      bgImageUrl.value = settings.bgImageUrl;
      
      bgImageUrl.addEventListener('change', async (e) => {
        settings.bgImageUrl = e.target.value;
        await this.saveAndApplySettings(settings);
        if (settings.bgType === 'custom') {
          this.loadBackground();
        }
      });
    }

    // 背景模糊
    const bgBlur = document.getElementById('bgBlur');
    const blurValue = document.getElementById('blurValue');
    
    if (bgBlur && blurValue) {
      bgBlur.value = settings.bgBlur;
      blurValue.textContent = `${settings.bgBlur}px`;
      
      bgBlur.addEventListener('input', async (e) => {
        settings.bgBlur = parseInt(e.target.value);
        blurValue.textContent = `${settings.bgBlur}px`;
        document.documentElement.style.setProperty('--bg-blur', `${settings.bgBlur}px`);
        await Storage.set('settings', settings);
      });
    }

    // 背景暗度
    const bgDarkness = document.getElementById('bgDarkness');
    const darknessValue = document.getElementById('darknessValue');
    
    if (bgDarkness && darknessValue) {
      bgDarkness.value = settings.bgDarkness;
      darknessValue.textContent = `${settings.bgDarkness}%`;
      
      bgDarkness.addEventListener('input', async (e) => {
        settings.bgDarkness = parseInt(e.target.value);
        darknessValue.textContent = `${settings.bgDarkness}%`;
        document.documentElement.style.setProperty('--bg-darkness', settings.bgDarkness / 100);
        await Storage.set('settings', settings);
      });
    }

    // 开关设置
const switchSettings = [
  { id: 'blurEffect', key: 'blurEffect' },
  { id: 'showSeconds', key: 'showSeconds' },
  { id: 'use12Hour', key: 'use12Hour' },
  { id: 'showGreeting', key: 'showGreeting', callback: () => {
    const greeting = document.getElementById('greeting');
    if (greeting) {
      greeting.style.display = settings.showGreeting ? 'block' : 'none';
      if (settings.showGreeting) this.initGreeting();
    }
  }},
 { id: 'showWeather', key: 'showWeather', callback: () => Widgets.applyWidgetSettings(settings) },
 { id: 'showProverb', key: 'showProverb', callback: () => Widgets.applyWidgetSettings(settings) },
 // { id: 'showMovie', key: 'showMovie', callback: () => Widgets.applyWidgetSettings(settings) },
 // { id: 'showBook', key: 'showBook', callback: () => Widgets.applyWidgetSettings(settings) },
 // { id: 'showMusic', key: 'showMusic', callback: () => Widgets.applyWidgetSettings(settings) },
 { id: 'showTodo', key: 'showTodo', callback: () => Widgets.applyWidgetSettings(settings) },
 { id: 'showBookmarks', key: 'showBookmarks', callback: () => Widgets.applyWidgetSettings(settings) },
 { id: 'showNotes', key: 'showNotes', callback: () => Widgets.applyWidgetSettings(settings) },
 { id: 'showGames', key: 'showGames', callback: () => Widgets.applyWidgetSettings(settings) }  // ✅ 新增这一行
 ];

    switchSettings.forEach(({ id, key, callback }) => {
      const el = document.getElementById(id);
      if (!el) return;
      
      el.checked = settings[key] !== false;
      
      el.addEventListener('change', async (e) => {
        settings[key] = e.target.checked;
        await this.saveAndApplySettings(settings);
        if (callback) callback();
      });
    });

    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn && !exportBtn.hasAttribute('data-bound')) {
      exportBtn.setAttribute('data-bound', 'true');
      exportBtn.addEventListener('click', async () => {
        if (exportBtn.classList.contains('loading')) return;
        exportBtn.classList.add('loading');
        exportBtn.disabled = true;
        try {
          await this.exportUserData();
        } finally {
          exportBtn.classList.remove('loading');
          exportBtn.disabled = false;
        }
      });
    }

    const importBtn = document.getElementById('importDataBtn');
    if (importBtn && !importBtn.hasAttribute('data-bound')) {
      importBtn.setAttribute('data-bound', 'true');
      importBtn.addEventListener('click', () => {
        this.initImportData();
      });
    }

    // 绑定导航栏导入导出按钮
    const exportBtnNav = document.getElementById('exportDataBtnNav');
    if (exportBtnNav) {
      exportBtnNav.addEventListener('click', async () => {
        if (exportBtnNav.classList.contains('loading')) return;
        exportBtnNav.classList.add('loading');
        try {
          await this.exportUserData();
        } finally {
          exportBtnNav.classList.remove('loading');
        }
      });
    }

    const importBtnNav = document.getElementById('importDataBtnNav');
    if (importBtnNav) {
      importBtnNav.addEventListener('click', () => {
        this.initImportData();
      });
    }

    this.initImportModals();
  },

  toggleBgSettings(type) {
    const gradientSettings = document.getElementById('gradientSettings');
    const imageLibrarySettings = document.getElementById('imageLibrarySettings');
    const customImageSettings = document.getElementById('customImageSettings');

    if (gradientSettings) gradientSettings.style.display = type === 'gradient' ? 'block' : 'none';
    if (imageLibrarySettings) imageLibrarySettings.style.display = ['unsplash', 'picsum', 'bing'].includes(type) ? 'block' : 'none';
    if (customImageSettings) customImageSettings.style.display = type === 'custom' ? 'block' : 'none';
  },

  async exportUserData() {
    try {
      const payload = await Storage.exportData();
      if (!payload) throw new Error('empty export payload');

      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = (payload.meta?.generatedAt || new Date().toISOString()).replace(/[:.]/g, '-');

      const link = document.createElement('a');
      link.href = url;
      link.download = `mytab-export-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出数据失败', error);
      alert('导出失败，请稍后重试。');
    }
  },

  // 初始化导入数据功能
  initImportData() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.click();
    }
  },

  // 处理文件选择
  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 验证文件类型
    if (!file.name.endsWith('.json')) {
      alert('请选择JSON格式的文件');
      return;
    }

    // 验证文件大小 (最大 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('文件过大，请选择小于10MB的文件');
      return;
    }

    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      // 验证数据格式
      this.validateImportData(importData);
      
      // 显示导入确认对话框
      this.showImportConfirm(file.name, importData);
    } catch (error) {
      console.error('文件解析失败', error);
      alert('文件格式不正确或已损坏，请检查文件后重试。');
    } finally {
      // 清除文件选择，允许重复选择同一文件
      event.target.value = '';
    }
  },

  // 验证导入数据格式
  validateImportData(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('文件格式不正确');
    }

    if (!data.meta || !data.data) {
      throw new Error('文件缺少必要的元数据或数据部分');
    }

    if (data.meta.schema !== 'mytab-export-v1') {
      throw new Error('不支持的导出文件格式版本');
    }

    if (!data.data || typeof data.data !== 'object') {
      throw new Error('数据部分格式不正确');
    }
  },

  // 显示导入确认对话框
  showImportConfirm(fileName, importData) {
    const modal = document.getElementById('importConfirmModal');
    const fileNameSpan = document.getElementById('importFileName');
    
    if (modal && fileNameSpan) {
      fileNameSpan.textContent = fileName;
      modal.dataset.importData = JSON.stringify(importData);
      this.showModal(modal);
    }
  },

  // 初始化导入相关模态框
  initImportModals() {
    // 导入确认对话框关闭事件
    const closeImportConfirmBtn = document.getElementById('closeImportConfirmModalBtn');
    if (closeImportConfirmBtn) {
      closeImportConfirmBtn.addEventListener('click', () => {
        this.hideModal('importConfirmModal');
      });
    }

    // 取消导入按钮
    const cancelImportBtn = document.getElementById('cancelImportBtn');
    if (cancelImportBtn) {
      cancelImportBtn.addEventListener('click', () => {
        this.hideModal('importConfirmModal');
      });
    }

    // 确认导入按钮
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    if (confirmImportBtn) {
      confirmImportBtn.addEventListener('click', async () => {
        await this.processImport();
      });
    }

    // 文件输入事件
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
      fileInput.addEventListener('change', (event) => {
        this.handleFileSelect(event);
      });
    }

    // 点击模态框背景关闭
    const importModal = document.getElementById('importConfirmModal');
    if (importModal) {
      importModal.addEventListener('click', (event) => {
        if (event.target === importModal) {
          this.hideModal('importConfirmModal');
        }
      });
    }
  },

  // 处理数据导入
  async processImport() {
    const modal = document.getElementById('importConfirmModal');
    const confirmBtn = document.getElementById('confirmImportBtn');
    
    if (!modal || !confirmBtn) return;

    const importDataStr = modal.dataset.importData;
    if (!importDataStr) {
      alert('导入数据丢失，请重新选择文件');
      return;
    }

    let importData;
    try {
      importData = JSON.parse(importDataStr);
    } catch (error) {
      alert('导入数据格式错误');
      return;
    }

    // 获取导入模式
    const importMode = document.querySelector('input[name="importMode"]:checked')?.value || 'replace';

    // 设置加载状态
    confirmBtn.classList.add('loading');
    confirmBtn.disabled = true;

    try {
      // 执行导入
      await Storage.importData(importData, importMode);
      
      // 隐藏对话框
      this.hideModal('importConfirmModal');
      
      // 重新加载数据并更新界面
      await this.loadData();
      await this.migrateShortcutsData();
      
      // 更新界面显示
      this.renderShortcuts();
      this.applySettings(this.data.settings);
      
      // 显示成功提示
      this.showNotification('数据导入成功！', 'success');
      
    } catch (error) {
      console.error('导入失败', error);
      alert(`导入失败：${error.message}`);
    } finally {
      // 清除加载状态
      confirmBtn.classList.remove('loading');
      confirmBtn.disabled = false;
    }
  },

  // 显示模态框
  showModal(modal) {
    if (modal) {
      modal.classList.add('show');
    }
  },

  // 隐藏模态框
  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      // 清除保存的导入数据
      delete modal.dataset.importData;
    }
  },

  // 显示通知
  showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${message}</span>
        <button class="notification-close">&times;</button>
      </div>
    `;

    // 添加样式
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      opacity: 0;
      transform: translateX(100%);
      transition: all 0.3s ease;
      max-width: 300px;
      font-size: 13px;
    `;

    document.body.appendChild(notification);

    // 显示动画
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateX(0)';
    }, 10);

    // 关闭按钮事件
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      this.hideNotification(notification);
    });

    // 自动关闭
    setTimeout(() => {
      this.hideNotification(notification);
    }, 5000);
  },

  // 隐藏通知
  hideNotification(notification) {
    if (notification) {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  },

  async saveAndApplySettings(settings) {
    await Storage.set('settings', settings);
    this.data.settings = settings;
    this.applySettings(settings);
  },

  applySettings(settings) {
    if (settings.bgType === 'gradient') {
      this.applyGradient(settings);
    }

    document.documentElement.style.setProperty('--primary-color', settings.gradientColor1);
    document.documentElement.style.setProperty('--secondary-color', settings.gradientColor2);
    document.documentElement.style.setProperty('--blur', settings.blurEffect ? 'blur(12px)' : 'none');
    document.documentElement.style.setProperty('--bg-blur', `${settings.bgBlur}px`);
    document.documentElement.style.setProperty('--bg-darkness', settings.bgDarkness / 100);
  }
};

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
  App.init();

});