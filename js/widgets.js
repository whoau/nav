// 小组件模块
const Widgets = {
  location: null,

  // 通用图片重试机制
  retryImageLoad(imgElement, fallbackUrl) {
    const retryCount = imgElement.dataset.retryCount || 0;
    const maxRetries = 2;
    
    if (retryCount < maxRetries) {
      imgElement.dataset.retryCount = parseInt(retryCount) + 1;
      setTimeout(() => {
        imgElement.src = fallbackUrl || `https://picsum.photos/seed/fallback-${Date.now()}/300/450.jpg`;
      }, 1000 * (retryCount + 1));
    } else {
      // 达到最大重试次数，显示fallback
      imgElement.style.display = 'none';
      const fallback = imgElement.nextElementSibling;
      if (fallback && (fallback.classList.contains('movie-cover-fallback') || 
                      fallback.classList.contains('book-cover-fallback') || 
                      fallback.classList.contains('music-cover-fallback'))) {
        fallback.style.display = 'flex';
      }
    }
  },

  // ==================== 天气 ====================
  async initWeather() {
    const refreshBtn = document.getElementById('refreshWeather');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        refreshBtn.classList.add('loading');
        this.location = null;
        this.loadWeather().finally(() => {
          refreshBtn.classList.remove('loading');
        });
      });
    }

    await this.loadWeather();
  },

  async loadWeather() {
    const weatherContent = document.getElementById('weatherContent');
    if (!weatherContent) return;

    weatherContent.innerHTML = `
      <div class="weather-loading">
        <i class="fas fa-circle-notch fa-spin"></i>
        <span>定位中...</span>
      </div>
    `;

    try {
      if (!this.location) {
        this.location = await API.getLocation();
      }

      const weather = await API.getWeather(this.location.lat, this.location.lon);
      if (!weather) throw new Error('获取天气失败');

      weatherContent.innerHTML = `
        <div class="weather-main">
          <div class="weather-icon-wrap">
            <i class="fas ${weather.icon}"></i>
          </div>
          <div class="weather-info">
            <div class="weather-temp">${weather.temp}<span>°C</span></div>
            <div class="weather-condition">${weather.condition}</div>
            <div class="weather-location">
              <i class="fas fa-map-marker-alt"></i>
              ${this.location.city}
            </div>
          </div>
        </div>
        <div class="weather-details">
          <div class="weather-detail-item">
            <i class="fas fa-tint"></i>
            <span>${weather.humidity}%</span>
          </div>
          <div class="weather-detail-item">
            <i class="fas fa-wind"></i>
            <span>${weather.windSpeed}km/h</span>
          </div>
        </div>
        ${weather.forecast?.length > 0 ? `
          <div class="weather-forecast">
            ${weather.forecast.map(day => `
              <div class="forecast-day">
                <div class="day">${day.date}</div>
                <i class="fas ${day.icon}"></i>
                <div class="temp">${day.minTemp}°/${day.maxTemp}°</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;
    } catch (error) {
      weatherContent.innerHTML = `
        <div class="weather-loading">
          <i class="fas fa-cloud-sun" style="font-size:24px;opacity:0.3;"></i>
          <span>加载失败</span>
          <button onclick="Widgets.loadWeather()" class="retry-btn">
            <i class="fas fa-redo"></i> 重试
          </button>
        </div>
      `;
    }
  },

  // ==================== 每日名言 ====================
  async initProverb() {
    const proverbContent = document.getElementById('proverbContent');

    if (!proverbContent) return;

    const refreshBtn = document.getElementById('refreshProverbBtn');
    if (refreshBtn && !refreshBtn.hasAttribute('data-bound')) {
      refreshBtn.setAttribute('data-bound', 'true');
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
        try {
          await this.loadProverb(true);
        } finally {
          refreshBtn.classList.remove('loading');
          refreshBtn.disabled = false;
        }
      });
    }

    await this.loadProverb();
  },

  async loadProverb(forceNew = false) {
    const proverbContent = document.getElementById('proverbContent');
    if (!proverbContent) return;

    proverbContent.innerHTML = `
      <div class="proverb-loading">
        <i class="fas fa-circle-notch fa-spin"></i>
        <span>加载中...</span>
      </div>
    `;

    try {
      const proverb = await API.getDailyProverb(forceNew);
      if (!proverb) throw new Error('获取名言失败');

      let sourceText = '';
      if (proverb.source && proverb.author) {
        sourceText = `${this.escapeHtml(proverb.author)} —— ${this.escapeHtml(proverb.source)}`;
      } else if (proverb.source) {
        sourceText = `${this.escapeHtml(proverb.source)}`;
      } else if (proverb.author) {
        sourceText = `${this.escapeHtml(proverb.author)}`;
      }

      proverbContent.innerHTML = `
        <div class="proverb-text-only">${this.escapeHtml(proverb.text)}</div>
        ${sourceText ? `<div class="proverb-source-only">${sourceText}</div>` : ''}
      `;
    } catch (error) {
      proverbContent.innerHTML = `
        <div class="proverb-loading">
          <i class="fas fa-exclamation-circle" style="font-size:16px;opacity:0.3;"></i>
          <span>加载失败</span>
        </div>
      `;
    }
  },

  // ==================== 网页游戏小组件 ====================
  initGames() {
    const gamesContent = document.getElementById('gamesContent');
    if (!gamesContent) return;

    const games = API.getGamesRecommendation();

    gamesContent.innerHTML = `
      <div class="games-grid">
        ${games.map(game => `
          <a href="${game.url}" target="_blank" class="game-item" style="--game-color: ${game.color}">
            <div class="game-icon">${game.icon}</div>
            <div class="game-name">${game.name}</div>
            <div class="game-desc">${game.description}</div>
          </a>
        `).join('')}
      </div>
    `;
  },


  // ==================== 待办事项 ====================
  async initTodo() {
    const todoList = document.getElementById('todoList');
    const todoInput = document.getElementById('todoInput');
    const addTodoBtn = document.getElementById('addTodoBtn');
    const todoCount = document.getElementById('todoCount');

    if (!todoList || !todoInput || !addTodoBtn) return;

    let todos = await Storage.get('todos') || [];

    const updateCount = () => {
      const incomplete = todos.filter(t => !t.completed).length;
      if (todoCount) todoCount.textContent = incomplete;
    };

    const renderTodos = () => {
      if (todos.length === 0) {
        todoList.innerHTML = `
          <div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:11px;">
            <i class="fas fa-clipboard-list" style="font-size:20px;opacity:0.3;display:block;margin-bottom:6px;"></i>
            暂无待办
          </div>
        `;
      } else {
        todoList.innerHTML = todos.map((todo, index) => `
          <li class="todo-item ${todo.completed ? 'completed' : ''}">
            <div class="todo-checkbox" data-index="${index}"></div>
            <span>${this.escapeHtml(todo.text)}</span>
            <button class="delete-todo" data-index="${index}">
              <i class="fas fa-trash-alt"></i>
            </button>
          </li>
        `).join('');
      }
      updateCount();
    };

    renderTodos();

    const addTodo = async () => {
      const text = todoInput.value.trim();
      if (!text) return;

      todos.unshift({ text, completed: false, id: Date.now() });
      await Storage.set('todos', todos);
      todoInput.value = '';
      renderTodos();
    };

    addTodoBtn.addEventListener('click', addTodo);
    todoInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addTodo();
    });

    todoList.addEventListener('click', async (e) => {
      const checkbox = e.target.closest('.todo-checkbox');
      const deleteBtn = e.target.closest('.delete-todo');

      if (checkbox) {
        const index = parseInt(checkbox.dataset.index);
        todos[index].completed = !todos[index].completed;
        await Storage.set('todos', todos);
        renderTodos();
      }

      if (deleteBtn) {
        const index = parseInt(deleteBtn.dataset.index);
        todos.splice(index, 1);
        await Storage.set('todos', todos);
        renderTodos();
      }
    });
  },

  // ==================== 书签 ====================
  async initBookmarks() {
    const bookmarksList = document.getElementById('bookmarksList');
    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    const bookmarkModal = document.getElementById('bookmarkModal');

    if (!bookmarksList) return;

    let bookmarks = await Storage.get('bookmarks');

    if (!bookmarks || bookmarks.length === 0) {
      bookmarks = [
        { name: 'Google', url: 'https://google.com' },
        { name: 'YouTube', url: 'https://youtube.com' },
        { name: 'GitHub', url: 'https://github.com' },
        { name: 'Twitter', url: 'https://twitter.com' }
      ];
      await Storage.set('bookmarks', bookmarks);
    }

    const renderBookmarks = () => {
      if (bookmarks.length === 0) {
        bookmarksList.innerHTML = `
          <div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:11px;">
            <i class="fas fa-bookmark" style="font-size:20px;opacity:0.3;display:block;margin-bottom:6px;"></i>
            暂无书签
          </div>
        `;
      } else {
        bookmarksList.innerHTML = bookmarks.map((b, index) => {
          let domain = '';
          try { domain = new URL(b.url).hostname; } catch (e) { domain = 'unknown'; }
          return `
            <li class="bookmark-item" data-index="${index}">
              <img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt=""
                onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔖</text></svg>'">
              <span class="bookmark-name">${this.escapeHtml(b.name)}</span>
              <button class="bookmark-delete" data-index="${index}">
                <i class="fas fa-times"></i>
              </button>
            </li>
          `;
        }).join('');
      }
    };

    renderBookmarks();

    bookmarksList.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.bookmark-delete');
      const bookmarkItem = e.target.closest('.bookmark-item');

      if (deleteBtn) {
        e.stopPropagation();
        const index = parseInt(deleteBtn.dataset.index);
        bookmarks.splice(index, 1);
        await Storage.set('bookmarks', bookmarks);
        renderBookmarks();
        return;
      }

      if (bookmarkItem) {
        const index = parseInt(bookmarkItem.dataset.index);
        const bookmark = bookmarks[index];
        if (bookmark?.url) window.open(bookmark.url, '_blank');
      }
    });

    if (addBookmarkBtn) {
      addBookmarkBtn.addEventListener('click', () => {
        if (bookmarkModal) {
          document.getElementById('bookmarkName').value = '';
          document.getElementById('bookmarkUrl').value = '';
          bookmarkModal.classList.add('show');
        }
      });
    }

    const saveBookmarkBtn = document.getElementById('saveBookmarkBtn');
    const cancelBookmarkBtn = document.getElementById('cancelBookmarkBtn');
    const closeBookmarkModalBtn = document.getElementById('closeBookmarkModalBtn');

    const closeModal = () => bookmarkModal?.classList.remove('show');

    saveBookmarkBtn?.addEventListener('click', async () => {
      const name = document.getElementById('bookmarkName').value.trim();
      let url = document.getElementById('bookmarkUrl').value.trim();

      if (!name || !url) { alert('请填写完整'); return; }
      if (!url.startsWith('http')) url = 'https://' + url;

      bookmarks.push({ name, url });
      await Storage.set('bookmarks', bookmarks);
      renderBookmarks();
      closeModal();
    });

    cancelBookmarkBtn?.addEventListener('click', closeModal);
    closeBookmarkModalBtn?.addEventListener('click', closeModal);
    bookmarkModal?.addEventListener('click', (e) => {
      if (e.target === bookmarkModal) closeModal();
    });
  },

  // ==================== 便签 ====================
  async initNotes() {
    const notesArea = document.getElementById('notesArea');
    const notesSaved = document.getElementById('notesSaved');

    if (!notesArea) return;

    const notes = await Storage.get('notes') || '';
    notesArea.value = notes;

    let saveTimeout;
    notesArea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      notesSaved?.classList.remove('show');

      saveTimeout = setTimeout(async () => {
        await Storage.set('notes', notesArea.value);
        notesSaved?.classList.add('show');
        setTimeout(() => notesSaved?.classList.remove('show'), 2000);
      }, 500);
    });
  },

  // ==================== 拖放功能 ====================
  initShortcutsDragDrop(grid, shortcuts, renderCallback) {
    // Prevent duplicate initialization
    if (grid.dataset.dragInitialized === 'true') {
      return;
    }
    grid.dataset.dragInitialized = 'true';

    let draggedElement = null;
    let draggedIndex = null;
    let isDragging = false;
    let touchStartTime = 0;
    let touchItem = null;
    let overElement = null;
    
    const getItemIndex = (element) => {
      if (!element) return -1;
      const index = parseInt(element.dataset.index);
      return isNaN(index) ? -1 : index;
    };

    const performReorder = async (fromIndex, toIndex) => {
      if (fromIndex === toIndex || fromIndex === -1 || toIndex === -1) return;

      const draggedShortcut = shortcuts[fromIndex];
      shortcuts.splice(fromIndex, 1);
      
      // Adjust insert index if dragging forward to prevent off-by-one errors
      const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      shortcuts.splice(insertIndex, 0, draggedShortcut);
      
      await Storage.set('shortcuts', shortcuts);
      renderCallback();
    };

    // Mouse drag events
    grid.addEventListener('dragstart', (e) => {
      // Don't allow dragging if clicking on delete button
      if (e.target.closest('.shortcut-delete')) return;
      
      const item = e.target.closest('.shortcut-item');
      if (!item) return;
      
      draggedElement = item;
      draggedIndex = getItemIndex(item);
      
      if (draggedIndex === -1) return;
      
      isDragging = true;
      item.classList.add('dragging');
      item.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', item.innerHTML);
    });

    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const item = e.target.closest('.shortcut-item');
      if (!item || !isDragging) return;
      
      // Clear previous over state
      if (overElement && overElement !== item) {
        overElement.classList.remove('drag-over');
      }
      
      // Only mark as over if not the dragged item
      if (item !== draggedElement) {
        item.classList.add('drag-over');
        overElement = item;
      }
    });

    grid.addEventListener('dragleave', (e) => {
      const item = e.target.closest('.shortcut-item');
      if (item && item !== draggedElement) {
        item.classList.remove('drag-over');
        if (overElement === item) {
          overElement = null;
        }
      }
    });

    grid.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const dropTarget = e.target.closest('.shortcut-item');
      if (!dropTarget || !isDragging || dropTarget === draggedElement) {
        this.clearDragState(grid);
        isDragging = false;
        overElement = null;
        return;
      }
      
      const dropIndex = getItemIndex(dropTarget);
      performReorder(draggedIndex, dropIndex);
      
      this.clearDragState(grid);
      isDragging = false;
      overElement = null;
    });

    grid.addEventListener('dragend', () => {
      this.clearDragState(grid);
      isDragging = false;
      overElement = null;
    });

    // Touch support for mobile devices
    grid.addEventListener('touchstart', (e) => {
      // Don't allow dragging if clicking on delete button
      if (e.target.closest('.shortcut-delete')) return;
      
      const item = e.target.closest('.shortcut-item');
      if (!item) return;
      
      touchStartTime = Date.now();
      touchItem = item;
    });

    grid.addEventListener('touchmove', (e) => {
      if (!touchItem) return;
      
      // Remove delay - start dragging immediately for fluid interaction
      e.preventDefault();
      
      if (!isDragging) {
        isDragging = true;
        draggedElement = touchItem;
        draggedIndex = getItemIndex(touchItem);
        touchItem.classList.add('dragging');
        touchItem.style.opacity = '0.5';
      }
      
      // Find element under touch position
      const touch = e.touches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      const item = element?.closest('.shortcut-item');
      
      if (item && item !== touchItem) {
        if (overElement && overElement !== item) {
          overElement.classList.remove('drag-over');
        }
        item.classList.add('drag-over');
        overElement = item;
      }
    });

    grid.addEventListener('touchend', (e) => {
      if (isDragging && overElement && overElement !== draggedElement) {
        const dropIndex = getItemIndex(overElement);
        performReorder(draggedIndex, dropIndex);
      }
      
      touchStartTime = 0;
      touchItem = null;
      this.clearDragState(grid);
      isDragging = false;
      overElement = null;
    });

    // Prevent navigation when clicking on shortcuts during drag
    // Use capturing phase to intercept before navigation
    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.shortcut-item');
      if (item && isDragging) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  },

  clearDragState(grid) {
    grid.querySelectorAll('.shortcut-item').forEach(item => {
      item.classList.remove('dragging', 'drag-over');
      item.style.opacity = '1';
    });
  },

  // ==================== 工具函数 ====================
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  applyWidgetSettings(settings) {
    const widgets = {
      weatherWidget: settings.showWeather !== false,
      proverbWidget: settings.showProverb !== false,
      todoWidget: settings.showTodo !== false,
      bookmarksWidget: settings.showBookmarks !== false,
      notesWidget: settings.showNotes !== false,
      gamesWidget: settings.showGames !== false
    };

    Object.entries(widgets).forEach(([id, show]) => {
      const el = document.getElementById(id);
      if (el) {
        if (id === 'proverbWidget') {
          el.style.display = show ? 'block' : 'none';
        } else {
          el.style.display = show ? 'flex' : 'none';
        }
      }
    });
  }
};