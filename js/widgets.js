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
        this.loadWeather(true).finally(() => {
          refreshBtn.classList.remove('loading');
        });
      });
    }

    // 异步加载天气，不阻塞页面
    this.loadWeather().catch(err => console.warn('天气加载失败:', err));
  },

  async loadWeather(forceNew = false) {
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
        this.location = await API.getLocation(forceNew);
      }

      const weather = await API.getWeather(this.location.lat, this.location.lon, forceNew);
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

    // 异步加载谚语，不阻塞页面
    this.loadProverb().catch(err => console.warn('谚语加载失败:', err));
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
          try { domain = new URL(b.url).hostname; } catch { domain = ''; }

          return `
            <li class="bookmark-item" data-index="${index}">
              <div class="favicon-placeholder" aria-hidden="true"></div>
              <img class="bookmark-icon-img" data-page-url="${b.url}" ${domain ? `data-hostname="${domain}"` : ''} alt="${this.escapeHtml(b.name)}" style="display:none;">
              <span class="bookmark-name">${this.escapeHtml(b.name)}</span>
              <button class="bookmark-delete" data-index="${index}">
                <i class="fas fa-times"></i>
              </button>
            </li>
          `;
        }).join('');

        // 图标将在 loadIconsIncrementally 中批量异步加载
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
    let draggedIndex = -1;
    let isDragging = false;
    let didDrop = false;

    let touchStartTime = 0;
    let touchItem = null;
    let touchGhost = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;

    let overElement = null;
    let placeholder = null;
    let placeholderAnchorNode = null;

    const getItemIndex = (element) => {
      if (!element) return -1;
      const index = parseInt(element.dataset.index);
      return Number.isNaN(index) ? -1 : index;
    };

    const performReorder = async (fromIndex, toIndex) => {
      if (fromIndex === toIndex || fromIndex === -1 || toIndex === -1) return;

      try {
        const draggedShortcut = shortcuts[fromIndex];
        shortcuts.splice(fromIndex, 1);

        // Adjust insert index if dragging forward to prevent off-by-one errors
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        shortcuts.splice(insertIndex, 0, draggedShortcut);

        console.log('快捷方式重排序:', {
          fromIndex,
          toIndex,
          shortcut: draggedShortcut,
          newArray: shortcuts
        });

        await Storage.set('shortcuts', shortcuts);
        
        // 清理内存缓存
        if (typeof Storage !== 'undefined') {
          Storage._memoryCache.delete('shortcuts');
          Storage._pendingGets.delete('shortcuts');
        }
        
        renderCallback();
      } catch (error) {
        console.error('快捷方式重排序失败:', error);
      }
    };

    const getAnimatableItems = () => {
      return Array.from(grid.querySelectorAll('.shortcut-item')).filter((item) => {
        if (item === draggedElement) return false;
        if (item.style.display === 'none') return false;
        return true;
      });
    };

    const captureRects = () => {
      const rects = new Map();
      getAnimatableItems().forEach((item) => {
        rects.set(item, item.getBoundingClientRect());
      });
      return rects;
    };

    const animateFromRects = (prevRects) => {
      prevRects.forEach((prevRect, item) => {
        const nextRect = item.getBoundingClientRect();
        const dx = prevRect.left - nextRect.left;
        const dy = prevRect.top - nextRect.top;

        if (dx === 0 && dy === 0) return;

        item.getAnimations().forEach((animation) => animation.cancel());
        item.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0, 0)' }
          ],
          {
            duration: 220,
            easing: 'cubic-bezier(0.2, 0, 0, 1)'
          }
        );
      });
    };

    const ensurePlaceholder = (referenceItem) => {
      if (placeholder) return;
      placeholder = document.createElement('div');
      placeholder.className = 'shortcut-placeholder';

      if (referenceItem) {
        placeholder.style.width = `${referenceItem.offsetWidth}px`;
        placeholder.style.height = `${referenceItem.offsetHeight}px`;
      }
    };

    const movePlaceholder = (referenceItem, insertAfter) => {
      if (!placeholder) return;

      if (!referenceItem) {
        if (grid.lastElementChild === placeholder) return;
        const prevRects = captureRects();
        grid.appendChild(placeholder);
        animateFromRects(prevRects);
        return;
      }

      if (insertAfter) {
        if (referenceItem.nextSibling === placeholder) return;
        const prevRects = captureRects();
        referenceItem.after(placeholder);
        animateFromRects(prevRects);
        return;
      }

      if (referenceItem.previousSibling === placeholder) return;
      const prevRects = captureRects();
      grid.insertBefore(placeholder, referenceItem);
      animateFromRects(prevRects);
    };

    const updatePlaceholderPosition = (clientX, clientY, eventTarget) => {
      if (!placeholder || !isDragging) return;

      const element = eventTarget || document.elementFromPoint(clientX, clientY);

      // Keep placeholder stable when hovering over it
      if (element?.closest?.('.shortcut-placeholder')) return;

      const targetItem = element?.closest?.('.shortcut-item') || null;

      if (!targetItem || targetItem === draggedElement || targetItem.style.display === 'none') {
        if (overElement) {
          overElement.classList.remove('drag-over');
          overElement = null;
        }
        return;
      }

      if (overElement && overElement !== targetItem) {
        overElement.classList.remove('drag-over');
      }
      if (targetItem !== draggedElement) {
        targetItem.classList.add('drag-over');
        overElement = targetItem;
      }

      const rect = targetItem.getBoundingClientRect();
      const offsetY = clientY - rect.top;
      const offsetX = clientX - rect.left;

      let insertAfter = false;
      if (offsetY > rect.height * 0.6) {
        insertAfter = true;
      } else if (offsetY < rect.height * 0.4) {
        insertAfter = false;
      } else {
        insertAfter = offsetX > rect.width / 2;
      }

      movePlaceholder(targetItem, insertAfter);
    };

    const removeTouchGhost = () => {
      if (touchGhost) {
        touchGhost.remove();
        touchGhost = null;
      }
    };

    const ensureTouchGhost = (item, touch) => {
      if (touchGhost) return;

      const rect = item.getBoundingClientRect();
      touchOffsetX = touch.clientX - rect.left;
      touchOffsetY = touch.clientY - rect.top;

      touchGhost = item.cloneNode(true);
      touchGhost.classList.add('dragging');
      touchGhost.style.position = 'fixed';
      touchGhost.style.left = '0';
      touchGhost.style.top = '0';
      touchGhost.style.width = `${rect.width}px`;
      touchGhost.style.height = `${rect.height}px`;
      touchGhost.style.margin = '0';
      touchGhost.style.pointerEvents = 'none';
      touchGhost.style.zIndex = '2000';
      touchGhost.style.opacity = '0.95';
      touchGhost.style.transition = 'none';
      touchGhost.style.boxShadow = '0 14px 40px rgba(0, 0, 0, 0.35)';

      document.body.appendChild(touchGhost);
    };

    const moveTouchGhost = (touch) => {
      if (!touchGhost) return;
      touchGhost.style.transform = `translate(${touch.clientX - touchOffsetX}px, ${touch.clientY - touchOffsetY}px)`;
    };

    const persistDomOrder = async () => {
      const orderedIndices = Array.from(grid.querySelectorAll('.shortcut-item'))
        .map((el) => parseInt(el.dataset.index))
        .filter((i) => !Number.isNaN(i));

      if (orderedIndices.length !== shortcuts.length) return;

      const current = shortcuts.slice();
      const orderedShortcuts = orderedIndices.map((i) => current[i]);

      shortcuts.splice(0, shortcuts.length, ...orderedShortcuts);
      await Storage.set('shortcuts', shortcuts);
      renderCallback();
    };

    const resetDragState = () => {
      this.clearDragState(grid);
      removeTouchGhost();
      draggedElement = null;
      draggedIndex = -1;
      isDragging = false;
      didDrop = false;
      overElement = null;
      placeholder = null;
      placeholderAnchorNode = null;
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

      didDrop = false;
      isDragging = true;
      grid.classList.add('reordering');

      item.classList.add('dragging');
      item.style.opacity = '0.5';

      ensurePlaceholder(item);
      placeholderAnchorNode = item.nextSibling;

      // Better Firefox compatibility
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');

        const dragImage = item.cloneNode(true);
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-9999px';
        dragImage.style.left = '-9999px';
        dragImage.style.opacity = '0.9';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2);
        setTimeout(() => dragImage.remove(), 0);
      }

      // Hide original element but keep it as the drag source
      setTimeout(() => {
        if (!draggedElement || !placeholder) return;
        draggedElement.style.display = 'none';
        if (!placeholder.isConnected) {
          grid.insertBefore(placeholder, placeholderAnchorNode);
        }
      }, 0);
    });

    grid.addEventListener('dragover', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

      updatePlaceholderPosition(e.clientX, e.clientY, e.target);
    });

    grid.addEventListener('dragleave', (e) => {
      const item = e.target.closest('.shortcut-item');
      if (item && item === overElement) {
        item.classList.remove('drag-over');
        overElement = null;
      }
    });

    grid.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isDragging || !draggedElement || !placeholder) {
        resetDragState();
        return;
      }

      didDrop = true;

      if (!placeholder.isConnected) {
        grid.insertBefore(placeholder, placeholderAnchorNode);
      }

      // Place the dragged element at placeholder position
      placeholder.replaceWith(draggedElement);
      draggedElement.style.display = '';

      grid.classList.remove('reordering');

      // Persist new order based on the DOM order
      await persistDomOrder();

      resetDragState();
    });

    grid.addEventListener('dragend', () => {
      if (!isDragging) {
        resetDragState();
        return;
      }

      // Drag canceled (e.g. dropped outside)
      if (!didDrop) {
        grid.classList.remove('reordering');
        renderCallback();
      }

      resetDragState();
    });

    // Touch support for mobile devices (with placeholder + animations)
    grid.addEventListener('touchstart', (e) => {
      if (e.target.closest('.shortcut-delete')) return;

      const item = e.target.closest('.shortcut-item');
      if (!item) return;

      touchStartTime = Date.now();
      touchItem = item;
    });

    grid.addEventListener('touchmove', (e) => {
      if (!touchItem) return;

      const touch = e.touches[0];
      if (!touch) return;

      // Prevent page scrolling while dragging
      e.preventDefault();

      if (!isDragging) {
        isDragging = true;
        didDrop = false;

        draggedElement = touchItem;
        draggedIndex = getItemIndex(touchItem);
        if (draggedIndex === -1) return;

        grid.classList.add('reordering');

        touchItem.classList.add('dragging');
        touchItem.style.opacity = '0.5';

        ensurePlaceholder(touchItem);
        placeholderAnchorNode = touchItem.nextSibling;
        if (!placeholder.isConnected) {
          grid.insertBefore(placeholder, placeholderAnchorNode);
        }

        ensureTouchGhost(touchItem, touch);
        moveTouchGhost(touch);

        // Hide original element after placeholder is in place
        requestAnimationFrame(() => {
          if (draggedElement) draggedElement.style.display = 'none';
        });
      }

      moveTouchGhost(touch);
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      updatePlaceholderPosition(touch.clientX, touch.clientY, element);
    });

    const finalizeTouchDrag = async () => {
      touchStartTime = 0;
      touchItem = null;

      if (!isDragging) {
        resetDragState();
        return;
      }

      if (!draggedElement || !placeholder) {
        resetDragState();
        return;
      }

      didDrop = true;

      if (!placeholder.isConnected) {
        grid.insertBefore(placeholder, placeholderAnchorNode);
      }

      placeholder.replaceWith(draggedElement);
      draggedElement.style.display = '';

      grid.classList.remove('reordering');
      await persistDomOrder();
      resetDragState();
    };

    grid.addEventListener('touchend', () => {
      finalizeTouchDrag().catch(() => {
        resetDragState();
      });
    });

    grid.addEventListener('touchcancel', () => {
      resetDragState();
      touchStartTime = 0;
      touchItem = null;
    });

    // Prevent navigation when clicking on shortcuts during drag
    // Use capturing phase to intercept before navigation
    grid.addEventListener(
      'click',
      (e) => {
        const item = e.target.closest('.shortcut-item');
        if (item && isDragging) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true
    );
  },

  clearDragState(grid) {
    grid.classList.remove('reordering');
    grid.querySelectorAll('.shortcut-placeholder').forEach((el) => el.remove());

    grid.querySelectorAll('.shortcut-item').forEach((item) => {
      item.classList.remove('dragging', 'drag-over');
      item.style.opacity = '';
      item.style.display = '';
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