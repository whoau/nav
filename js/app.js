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

    // 初始化壁纸库
    await this.initWallpaperLibrary();

    this.initClock();
    this.initGreeting();
    this.initShortcuts();
    this.initSettings();
    this.initBackground();
    this.initWallpaperControls();
    this.startPeriodicWallpaperUpdate();
    // Initialize wallpaper timers based on current settings
    this.updateWallpaperTimers(this.data.settings.autoChangeWallpaper || 'never');
    Search.init();

    // 初始化小组件
    const settings = this.data.settings;
    if (settings.showWeather !== false) Widgets.initWeather();
    if (settings.showProverb !== false) Widgets.initProverb();
    //if (settings.showMovie !== false) Widgets.initMovie();
    // if (settings.showBook !== false) Widgets.initBook();
     //if (settings.showMusic !== false) Widgets.initMusic();
    if (settings.showTodo !== false) Widgets.initTodo();
    if (settings.showBookmarks !== false) Widgets.initBookmarks();
    if (settings.showNotes !== false) Widgets.initNotes();
    if (settings.showGames !== false) Widgets.initGames();
    console.log('App initialized successfully');
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
    
    shortcuts = shortcuts.map(shortcut => {
      // 如果快捷方式缺少新的属性，添加默认值
      if (!shortcut.hasOwnProperty('icon')) {
        shortcut.icon = 'default';
        hasChanges = true;
      }
      if (!shortcut.hasOwnProperty('color')) {
        shortcut.color = '';
        hasChanges = true;
      }
      return shortcut;
    });
    
    // 如果有变更，保存更新后的数据
    if (hasChanges) {
      await Storage.set('shortcuts', shortcuts);
      this.data.shortcuts = shortcuts;
    }
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

    const renderShortcuts = () => {
      grid.innerHTML = shortcuts.map((shortcut, index) => {
        let domain = '';
        try {
          domain = new URL(shortcut.url).hostname;
        } catch (e) {
          domain = 'unknown';
        }
        const iconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
        const initial = shortcut.name.charAt(0).toUpperCase();
        
        const hasCustomIcon = shortcut.icon && shortcut.icon !== 'default';
        const customColor = shortcut.color || '';
        const hasCustomDataIcon = shortcut.icon && shortcut.icon.startsWith('data:');
        
        return `
          <a href="${shortcut.url}" class="shortcut-item" data-index="${index}" data-has-custom-icon="${hasCustomDataIcon}" draggable="true" ${customColor ? `style="--shortcut-icon-color: ${customColor}"` : ''}>
            <button class="shortcut-delete" data-index="${index}">
              <i class="fas fa-times"></i>
            </button>
            <div class="shortcut-icon">
              ${hasCustomDataIcon 
                ? `<img src="${shortcut.icon}" alt="${shortcut.name}"><div class="shortcut-icon-fallback" style="display: none;">${initial}</div>`
                : hasCustomIcon
                  ? `<div class="shortcut-icon-fallback">${initial}</div>`
                  : `<img src="${iconUrl}" alt="${shortcut.name}" 
                     onerror="this.parentElement.innerHTML='<div class=\\'shortcut-icon-fallback\\'>${initial}</div>';">`
              }
            </div>
            <span class="shortcut-name">${shortcut.name}</span>
          </a>
        `;
      }).join('');
      
      // Re-initialize drag and drop after rendering
      Widgets.initShortcutsDragDrop(grid, shortcuts, renderShortcuts);
    };

    renderShortcuts();

    // 删除快捷方式
    grid.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.shortcut-delete');

      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(deleteBtn.dataset.index);
        shortcuts.splice(index, 1);
        await Storage.set('shortcuts', shortcuts);
        renderShortcuts();
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
        
        shortcuts.push({ name, url });
        await Storage.set('shortcuts', shortcuts);
        renderShortcuts();
        closeModal();
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
    
    // 打开编辑模态框
    const openEditModal = (index) => {
      editingIndex = index;
      const shortcut = shortcuts[index];
      
      // 填充表单数据
      editNameInput.value = shortcut.name || '';
      editUrlInput.value = shortcut.url || '';
      editIconColorInput.value = shortcut.color || '#667eea';
      customIconData = shortcut.icon && shortcut.icon.startsWith('data:') ? shortcut.icon : null;
      
      // 更新图标预览
      updateIconPreview(shortcut);
      
      // 显示模态框
      editModal?.classList.add('show');
      editNameInput.focus();
    };
    
    // 更新图标预览
    const updateIconPreview = (shortcut) => {
      const hasCustomIcon = shortcut.icon && shortcut.icon !== 'default';
      const initial = shortcut.name ? shortcut.name.charAt(0).toUpperCase() : '?';
      
      if (hasCustomIcon && shortcut.icon.startsWith('data:')) {
        // 自定义上传的图标
        iconPreview.src = shortcut.icon;
        iconPreview.style.display = 'block';
        iconFallback.style.display = 'none';
        iconPreview.onload = () => {
          // 如果图标加载成功，隐藏fallback
          iconFallback.style.display = 'none';
        };
        iconPreview.onerror = () => {
          // 如果图标加载失败，显示fallback
          iconPreview.style.display = 'none';
          iconFallback.style.display = 'flex';
          iconFallback.textContent = initial;
          iconFallback.style.background = shortcut.color || 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
        };
      } else {
        // 使用默认图标或网站favicon
        iconPreview.style.display = 'none';
        iconFallback.style.display = 'flex';
        iconFallback.textContent = initial;
        iconFallback.style.background = shortcut.color || 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
      }
    };
    
    // 上传图标
    if (uploadIconBtn && iconUploadInput) {
      uploadIconBtn.addEventListener('click', () => {
        iconUploadInput.click();
      });
      
      iconUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            customIconData = event.target.result;
            iconPreview.src = customIconData;
            iconPreview.style.display = 'block';
            iconFallback.style.display = 'none';
          };
          reader.readAsDataURL(file);
        }
      });
    }
    
    // 使用默认图标
    if (useDefaultIconBtn) {
      useDefaultIconBtn.addEventListener('click', () => {
        customIconData = null;
        iconPreview.style.display = 'none';
        iconFallback.style.display = 'flex';
        iconFallback.textContent = editNameInput.value ? editNameInput.value.charAt(0).toUpperCase() : '?';
        iconFallback.style.background = 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
      });
    }
    
    // 移除自定义图标
    if (removeCustomIconBtn) {
      removeCustomIconBtn.addEventListener('click', () => {
        customIconData = null;
        iconUploadInput.value = ''; // 清空文件输入
        iconPreview.style.display = 'none';
        iconPreview.src = '';
        iconFallback.style.display = 'flex';
        iconFallback.textContent = editNameInput.value ? editNameInput.value.charAt(0).toUpperCase() : '?';
        iconFallback.style.background = editIconColorInput.value || 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
      });
    }
    
    // 关闭编辑模态框
    const closeEditModal = () => {
      editModal?.classList.remove('show');
      editingIndex = -1;
      customIconData = null;
      iconUploadInput.value = ''; // 清空文件输入
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
        
        if (!name || !url) {
          alert('请填写名称和网址');
          return;
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        // 更新快捷方式
        const updatedShortcut = { name, url };
        
        // 如果有自定义图标，保存图标数据
        if (customIconData) {
          updatedShortcut.icon = customIconData;
        } else {
          updatedShortcut.icon = 'default';
        }
        
        // 保存颜色
        if (color) {
          updatedShortcut.color = color;
        }
        
        shortcuts[editingIndex] = updatedShortcut;
        await Storage.set('shortcuts', shortcuts);
        renderShortcuts();
        closeEditModal();
      });
    }
    
    // 实时更新预览
    if (editNameInput) {
      editNameInput.addEventListener('input', () => {
        if (iconFallback.style.display !== 'none') {
          iconFallback.textContent = editNameInput.value ? editNameInput.value.charAt(0).toUpperCase() : '?';
        }
      });
    }
    
    if (editIconColorInput) {
      editIconColorInput.addEventListener('input', () => {
        if (iconFallback.style.display !== 'none') {
          iconFallback.style.background = editIconColorInput.value;
        }
      });
    }

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