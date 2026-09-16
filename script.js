document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const todoForm = document.getElementById('todo-form');
    const todoInput = document.getElementById('todo-input');
    const priorityInput = document.getElementById('priority-input');
    const alarmInput = document.getElementById('alarm-input');
    const todoList = document.getElementById('todo-list');
    const taskCount = document.getElementById('task-count');
    const clearCompletedBtn = document.getElementById('clear-completed');
    const sortSelect = document.getElementById('sort-select');
    const filterSelect = document.getElementById('filter-select');
    const micBtn = document.getElementById('mic-btn');
    const micOverlay = document.getElementById('mic-overlay');
    const stopMicBtn = document.getElementById('stop-mic-btn');

    // --- State ---
    let rawTodos = [];
    try {
        rawTodos = JSON.parse(localStorage.getItem('todos')) || [];
        if (!Array.isArray(rawTodos)) rawTodos = [];
    } catch (e) {
        rawTodos = [];
    }
    
    let todos = rawTodos.map(t => ({
        ...t,
        priority: t.priority || 'medium',
        pinned: t.pinned || false,
        favorite: t.favorite || false,
        category: t.category || 'Work',
        tags: t.tags || []
    }));

    let pomoState;
    try {
        pomoState = JSON.parse(localStorage.getItem('pomoStats')) || {
            sessions: 0,
            focusTime: 0,
            lastDate: new Date().toDateString()
        };
    } catch (e) {
        pomoState = { sessions: 0, focusTime: 0, lastDate: new Date().toDateString() };
    }
    
    // Reset daily stats if it's a new day
    if(pomoState.lastDate !== new Date().toDateString()) {
        pomoState = { sessions: 0, focusTime: 0, lastDate: new Date().toDateString() };
    }

    // --- Unlocked Achievements State ---
    let unlockedAchievements = [];
    try {
        unlockedAchievements = JSON.parse(localStorage.getItem('unlockedAchievements')) || [];
    } catch (e) {
        unlockedAchievements = [];
    }

    // --- Appearance Settings State ---
    let appSettings = {
        theme: 'dark',
        accentColor: '#6366f1',
        fontSize: 'medium',
        animations: true
    };
    try {
        const storedSettings = JSON.parse(localStorage.getItem('appSettings'));
        if (storedSettings) appSettings = { ...appSettings, ...storedSettings };
    } catch (e) {}

    // --- Firebase Config JSON State ---
    let firebaseConfig = null;
    try {
        firebaseConfig = JSON.parse(localStorage.getItem('firebaseConfig'));
    } catch (e) {}

    // --- Standalone Alarm State ---
    let standaloneAlarms = [];
    try {
        standaloneAlarms = JSON.parse(localStorage.getItem('standaloneAlarms')) || [];
        if (!Array.isArray(standaloneAlarms)) standaloneAlarms = [];
    } catch (e) {
        standaloneAlarms = [];
    }

    // --- Stopwatch State ---
    let stopwatchStats = {
        sessions: 0,
        totalTimeToday: 0,
        longestSession: 0,
        allSessions: []
    };
    try {
        const storedStopwatch = JSON.parse(localStorage.getItem('stopwatchStats'));
        if (storedStopwatch) stopwatchStats = { ...stopwatchStats, ...storedStopwatch };
    } catch (e) {}

    const selectedDays = new Set();


    // --- Navigation (SPA) ---
    function initNavigation() {
        const navBtns = document.querySelectorAll('.nav-btn');
        const views = document.querySelectorAll('.view-section');
        const pageTitle = document.getElementById('page-title');
        const pageSubtitle = document.getElementById('page-subtitle');
        const sidebar = document.querySelector('.sidebar');
        const menuToggleBtn = document.getElementById('menu-toggle-btn');

        const titles = {
            'dashboard': { t: 'Dashboard', s: 'Overview of your productivity.' },
            'tasks': { t: 'My Tasks', s: 'Manage your priorities.' },
            'pomodoro': { t: 'Focus Time', s: 'Focus on your work.' },
            'calendar': { t: 'Calendar', s: 'Your schedule at a glance.' },
            'achievements': { t: 'Achievements', s: 'Track your milestones.' },
            'settings': { t: 'Settings & Cloud Sync', s: 'Customize your space.' },
            'alarms': { t: 'Standalone Alarms', s: 'Configure your custom reminders.' },
            'stopwatch': { t: 'Stopwatch', s: 'Record live task durations.' }
        };

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                navBtns.forEach(b => b.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));
                
                btn.classList.add('active');
                const target = btn.getAttribute('data-target');
                document.getElementById(`view-${target}`).classList.add('active');
                
                pageTitle.textContent = titles[target].t;
                pageSubtitle.textContent = titles[target].s;

                if(target === 'dashboard') updateDashboard();
                if(target === 'calendar') renderCalendar();
                if(target === 'achievements') renderAchievements();
                if(target === 'settings') initSettingsView();
                if(target === 'alarms') renderAlarms();
                if(target === 'stopwatch') renderStopwatch();

                if (sidebar) {
                    sidebar.classList.remove('mobile-active');
                }
            });
        });

        if (menuToggleBtn && sidebar) {
            menuToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('mobile-active');
            });

            document.addEventListener('click', (e) => {
                if (sidebar.classList.contains('mobile-active') && !sidebar.contains(e.target) && e.target !== menuToggleBtn) {
                    sidebar.classList.remove('mobile-active');
                }
            });
        }
    }

    // --- Voice Input ---
    let recognition = null;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if(finalTranscript) {
                todoInput.value = (todoInput.value + ' ' + finalTranscript).trim();
            }
        };

        recognition.onerror = (e) => {
            console.error("Speech recognition error", e);
            stopMic();
        };
        recognition.onend = () => stopMic();
    } else {
        // Feature not supported, will show alert on click
    }

    micBtn.addEventListener('click', () => {
        if(recognition) {
            try {
                recognition.start();
                micOverlay.style.display = 'flex';
            } catch(e) {
                console.error(e);
            }
        } else {
            alert('Voice input is not supported in your current browser. Please try Chrome or Edge.');
        }
    });

    stopMicBtn.addEventListener('click', stopMic);

    function stopMic() {
        if(recognition) {
            recognition.stop();
        }
        micOverlay.style.display = 'none';
    }

    // --- Todo Event Listeners ---
    todoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = todoInput.value.trim();
        if (text) {
            const durationHoursInput = document.getElementById('duration-hours-input');
            const durationMinutesInput = document.getElementById('duration-minutes-input');
            let hours = parseInt(durationHoursInput.value);
            let minutes = parseInt(durationMinutesInput.value);
            if (isNaN(hours)) hours = 0;
            if (isNaN(minutes)) minutes = 30;

            if (hours < 0 || minutes < 0) {
                alert('Duration cannot be negative.');
                return;
            }
            if (hours === 0 && minutes === 0) {
                alert('Duration must be at least 1 minute.');
                return;
            }

            const repeatInput = document.getElementById('repeat-task-input');
            const isRepeat = repeatInput ? repeatInput.checked : false;

            addTodo(text, priorityInput.value, hours, minutes, 'Work', [], isRepeat);
            todoInput.value = '';
            
            durationHoursInput.value = '0';
            durationMinutesInput.value = '30';
            if (repeatInput) repeatInput.checked = false;
        }
    });

    clearCompletedBtn.addEventListener('click', () => {
        todos = todos.filter(todo => !todo.completed);
        saveAndRender();
    });

    sortSelect.addEventListener('change', renderTodos);
    filterSelect.addEventListener('change', renderTodos);

    // --- Todo Logic ---
    function updateDateTime() {
        const now = new Date();
        const timeEl = document.getElementById('current-time');
        const dateEl = document.getElementById('current-date');
        if (timeEl) timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (dateEl) dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    }

    function addTodo(text, priority, hours, minutes, category = 'Work', tags = [], repeat = false, alarmTime = null) {
        const newTodo = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text,
            completed: false,
            priority: priority,
            createdAt: new Date().toISOString(),
            alarmTime: alarmTime || alarmInput.value || null,
            alarmNotified: false,
            durationHours: parseInt(hours) || 0,
            durationMinutes: parseInt(minutes) || 0,
            category: category,
            tags: tags,
            repeat: repeat,
            updatedAt: new Date().toISOString()
        };
        todos.unshift(newTodo);
        if (!alarmTime) alarmInput.value = '';
        saveAndRender();
    }

    function toggleTodo(id) {
        todos = todos.map(todo => {
            if (todo.id === id) {
                const isCompleting = !todo.completed;
                return { 
                    ...todo, 
                    completed: isCompleting,
                    completedAt: isCompleting ? new Date().toISOString() : null,
                    updatedAt: new Date().toISOString()
                };
            }
            return todo;
        });
        saveAndRender();
        checkAchievements();
    }

    function deleteTodo(id) {
        todos = todos.filter(todo => todo.id !== id);
        saveAndRender();
        // Delete from firestore if sync is active
        if (currentUser && db) {
            db.collection('users').doc(currentUser.uid).collection('todos').doc(id).delete().catch(err => {
                console.error("Firestore delete error", err);
            });
        }
    }

    function saveAndRender() {
        // Ensure updatedAt is present on saved items
        todos = todos.map(t => ({
            ...t,
            updatedAt: t.updatedAt || new Date().toISOString()
        }));

        localStorage.setItem('todos', JSON.stringify(todos));
        renderTodos();
        updateDashboard();
        if(document.getElementById('view-calendar').classList.contains('active')) {
            renderCalendar();
        }

        // Upload to firestore if sync is active
        if (currentUser && db) {
            todos.forEach(todo => {
                uploadTodoToCloud(todo);
            });
        }
    }

    function getProcessedTodos() {
        let filtered = [...todos];
        const filterVal = filterSelect.value;
        const sortVal = sortSelect.value;

        // Filter
        if(filterVal === 'completed') filtered = filtered.filter(t => t.completed);
        else if(filterVal === 'pending') filtered = filtered.filter(t => !t.completed);
        else if(filterVal === 'favorite') filtered = filtered.filter(t => t.favorite);
        else if(filterVal === 'pinned') filtered = filtered.filter(t => t.pinned);
        else if(filterVal === 'high' || filterVal === 'medium' || filterVal === 'low') {
            filtered = filtered.filter(t => t.priority === filterVal);
        }

        // Sort
        filtered.sort((a,b) => {
            // Pinned tasks always go first
            const pinA = a.pinned ? 1 : 0;
            const pinB = b.pinned ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA;

            if(sortVal === 'date-desc') {
                return new Date(b.createdAt) - new Date(a.createdAt);
            } else if(sortVal === 'date-asc') {
                return new Date(a.createdAt) - new Date(b.createdAt);
            } else if(sortVal === 'priority') {
                const val = { 'high': 3, 'medium': 2, 'low': 1 };
                return val[b.priority] - val[a.priority];
            }
            return 0;
        });

        return filtered;
    }

    function getPriorityBadge(priority) {
        const labels = { 'high': '🔴 High', 'medium': '🟡 Med', 'low': '🟢 Low' };
        return `<span class="priority-badge priority-${priority}">${labels[priority]}</span>`;
    }

    function renderTodos() {
        todoList.innerHTML = '';
        const processedTodos = getProcessedTodos();
        
        processedTodos.forEach(todo => {
            const li = document.createElement('li');
            const isPinned = todo.pinned || false;
            const isFav = todo.favorite || false;
            
            li.className = `todo-item ${todo.completed ? 'completed' : ''} ${isPinned ? 'pinned-item' : ''}`;
            li.innerHTML = `
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
                    <div class="custom-checkbox">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                </div>
                <div class="task-content">
                    <div class="task-header-row">
                        <span class="task-text">${escapeHtml(todo.text)}</span>
                        ${getPriorityBadge(todo.priority)}
                    </div>
                    <span class="task-time">
                        ${getTaskTime(todo)}
                        ${todo.alarmTime ? `<span class="alarm-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>${formatAlarmTime(todo.alarmTime)}</span>` : ''}
                        ${todo.category ? `<span class="category-badge" style="background: rgba(255,255,255,0.06); border: 1px solid var(--glass-border); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-left: 6px;">📂 ${todo.category}</span>` : ''}
                        ${todo.tags && todo.tags.length > 0 ? `<span class="tags-badge" style="color: var(--accent-color); font-size: 0.75rem; margin-left: 6px;">🏷️ ${todo.tags.join(', ')}</span>` : ''}
                        <span class="duration-badge" style="background: rgba(255,255,255,0.06); border: 1px solid var(--glass-border); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-left: 6px;" title="Duration">⏱ ${formatTaskDuration(todo.durationHours, todo.durationMinutes)}</span>
                    </span>
                </div>
                
                <div class="task-action-buttons" style="display: flex; gap: 4px;">
                    <button class="pin-btn" aria-label="Pin task" title="Pin Task">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isPinned ? 'var(--accent-color)' : 'none'}" stroke="${isPinned ? 'var(--accent-color)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.33-2.92A3 3 0 0 1 15 9.18V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.18a3 3 0 0 1-1.23 1.9L5.44 14a2 2 0 0 0-.44 1.24z"></path></svg>
                    </button>
                    <button class="fav-btn" aria-label="Favorite task" title="Favorite Task">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'var(--warning-color)' : 'none'}" stroke="${isFav ? 'var(--warning-color)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </button>
                    <button class="edit-btn-task" aria-label="Edit task" title="Edit Task Details">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="delete-btn" aria-label="Delete task" title="Delete Task">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            li.querySelector('.todo-checkbox').addEventListener('change', () => toggleTodo(todo.id));
            li.querySelector('.delete-btn').addEventListener('click', () => deleteTodo(todo.id));
            li.querySelector('.pin-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                togglePinTodo(todo.id);
            });
            li.querySelector('.fav-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavTodo(todo.id);
            });
            li.querySelector('.edit-btn-task').addEventListener('click', (e) => {
                e.stopPropagation();
                openTaskEditor(todo);
            });

            todoList.appendChild(li);
        });

        const activeTasks = todos.filter(todo => !todo.completed).length;
        taskCount.textContent = `${activeTasks} task${activeTasks !== 1 ? 's' : ''} left`;
        clearCompletedBtn.style.display = todos.some(t => t.completed) ? 'block' : 'none';
    }

    // --- Dashboard ---
    function updateDashboard() {
        const total = todos.length;
        const completed = todos.filter(t => t.completed).length;
        const pending = total - completed;
        const highPriority = todos.filter(t => !t.completed && t.priority === 'high').length;
        
        const now = new Date();
        const todayStr = now.toDateString();
        const todayTasks = todos.filter(t => {
            const cDate = t.createdAt ? new Date(t.createdAt) : new Date(parseInt(t.id));
            return (cDate && cDate.toDateString() === todayStr) || (t.alarmTime && new Date(t.alarmTime).toDateString() === todayStr);
        }).length;
        
        const overdue = todos.filter(t => !t.completed && t.alarmTime && new Date(t.alarmTime) < now).length;

        let totalDurationMinutes = 0;
        todos.forEach(t => {
            const h = t.durationHours !== undefined ? t.durationHours : 0;
            const m = t.durationMinutes !== undefined ? t.durationMinutes : 30;
            totalDurationMinutes += h * 60 + m;
        });
        const avgDurationMinutes = todos.length > 0 ? Math.round(totalDurationMinutes / todos.length) : 0;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-completed').textContent = completed;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-today').textContent = todayTasks;
        document.getElementById('stat-overdue').textContent = overdue;
        document.getElementById('stat-high').textContent = highPriority;
        document.getElementById('stat-sessions').textContent = pomoState.sessions;
        document.getElementById('stat-focus-time').textContent = pomoState.focusTime + 'm';
        
        document.getElementById('stat-duration-avg').textContent = formatPlannedTime(avgDurationMinutes);

        // Standalone Alarms metrics
        const activeAlarmsCount = standaloneAlarms.filter(a => a.enabled).length;
        const nextAlarmObj = getNextAlarmTime();

        document.getElementById('stat-active-alarms').textContent = activeAlarmsCount;
        if (nextAlarmObj) {
            const nextDate = nextAlarmObj.timeDate;
            const hourDisplay = nextDate.getHours();
            const minDisplay = nextDate.getMinutes();
            const ampm = hourDisplay >= 12 ? 'PM' : 'AM';
            const displayH = hourDisplay % 12 || 12;
            const displayM = minDisplay < 10 ? '0' + minDisplay : minDisplay;
            
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayStr = dayNames[nextDate.getDay()];
            
            document.getElementById('stat-next-alarm').textContent = `${dayStr} ${displayH}:${displayM} ${ampm}`;
        } else {
            document.getElementById('stat-next-alarm').textContent = "None";
        }

        // Stopwatch metrics
        document.getElementById('stat-stopwatch-sessions').textContent = stopwatchStats.sessions;
        document.getElementById('stat-stopwatch-today').textContent = formatMsToSecs(stopwatchStats.totalTimeToday);
        document.getElementById('stat-stopwatch-longest').textContent = formatMsToSecs(stopwatchStats.longestSession);

        // Recent Tasks Widget
        const recentList = document.getElementById('recent-tasks-list');
        recentList.innerHTML = '';
        todos.slice(0, 5).forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div style="display: flex; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--glass-border);">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${t.completed ? 'var(--success-color)' : (t.priority === 'high' ? 'var(--danger-color)' : 'var(--accent-color)')}"></div>
                    <span style="flex: 1; ${t.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(t.text)}</span>
                </div>
            `;
            recentList.appendChild(li);
        });

        // Recurring Task Templates History Widget
        const recurringHistoryList = document.getElementById('recurring-history-list');
        if (recurringHistoryList) {
            recurringHistoryList.innerHTML = '';
            const repeatingTasks = todos.filter(t => t.repeat);
            if (repeatingTasks.length === 0) {
                recurringHistoryList.innerHTML = '<li style="color:var(--text-secondary); font-size:0.85rem; padding: 8px 0;">No recurring tasks. Check "Repeat" when adding tasks.</li>';
            } else {
                const uniqueRepeating = [];
                const seenText = new Set();
                repeatingTasks.forEach(t => {
                    if (!seenText.has(t.text.toLowerCase())) {
                        seenText.add(t.text.toLowerCase());
                        uniqueRepeating.push(t);
                    }
                });
                
                uniqueRepeating.forEach(t => {
                    const li = document.createElement('li');
                    li.style = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--glass-border); gap: 8px;';
                    li.innerHTML = `
                        <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                            <span style="font-size:0.9rem;">🔄 ${escapeHtml(t.text)}</span>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">Priority: ${t.priority} | Category: ${t.category || 'Work'}</span>
                        </div>
                        <button class="add-btn readd-task-btn" style="padding: 4px 10px; font-size: 0.8rem; margin-left:8px; flex-shrink: 0;" data-id="${t.id}">Re-add</button>
                    `;
                    
                    li.querySelector('.readd-task-btn').addEventListener('click', () => {
                        addTodo(t.text, t.priority, t.durationHours || 0, t.durationMinutes || 30, t.category, t.tags, true, t.alarmTime);
                        showToast(`Re-added "${t.text}" for today!`, "Success");
                    });
                    
                    recurringHistoryList.appendChild(li);
                });
            }
        }

        // AI daily summary widget update
        updateAISummary();
    }

    // --- Pomodoro ---
    let pomoInterval = null;
    let pomoStartTime = 0;
    let pomoDuration = 25 * 60; // seconds
    let pomoAccumulatedTime = 0; // seconds
    let pomoTimeLeft = 25 * 60; // seconds
    let pomoMode = 'study'; // 'study' | 'break'
    let isRunning = false;
    let currentTotalTime = 25 * 60;

    function initPomodoro() {
        const startBtn = document.getElementById('pomo-start');
        const pauseBtn = document.getElementById('pomo-pause');
        const resetBtn = document.getElementById('pomo-reset');
        const studyInput = document.getElementById('setting-study');
        const breakInput = document.getElementById('setting-break');
        const tabs = document.querySelectorAll('.pomo-tab');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                if(isRunning) return; // Prevent switch while running
                tabs.forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                pomoMode = e.target.dataset.mode;
                resetPomodoro();
            });
        });

        startBtn.addEventListener('click', () => {
            if(!isRunning) {
                isRunning = true;
                pomoStartTime = Date.now();
                startBtn.style.display = 'none';
                pauseBtn.style.display = 'block';
                pomoInterval = setInterval(pomoTick, 200);
                document.getElementById('pomo-status').textContent = pomoMode === 'study' ? "Focusing..." : "Relaxing...";
            }
        });

        pauseBtn.addEventListener('click', () => {
            if(isRunning) {
                isRunning = false;
                pomoAccumulatedTime += Math.floor((Date.now() - pomoStartTime) / 1000);
                startBtn.style.display = 'block';
                startBtn.textContent = 'Resume';
                pauseBtn.style.display = 'none';
                clearInterval(pomoInterval);
                document.getElementById('pomo-status').textContent = "Paused";
            }
        });

        resetBtn.addEventListener('click', resetPomodoro);
        studyInput.addEventListener('change', resetPomodoro);
        breakInput.addEventListener('change', resetPomodoro);
        
        resetPomodoro();
    }

    function setCircleProgress(percent) {
        const circle = document.getElementById('timer-progress');
        const circumference = 110 * 2 * Math.PI; // r=110
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = offset;
    }

    function resetPomodoro() {
        clearInterval(pomoInterval);
        isRunning = false;
        pomoAccumulatedTime = 0;
        document.getElementById('pomo-start').style.display = 'block';
        document.getElementById('pomo-start').textContent = 'Start';
        document.getElementById('pomo-pause').style.display = 'none';
        
        const studyMin = parseInt(document.getElementById('setting-study').value) || 25;
        const breakMin = parseInt(document.getElementById('setting-break').value) || 5;
        
        currentTotalTime = (pomoMode === 'study' ? studyMin : breakMin) * 60;
        pomoDuration = currentTotalTime;
        pomoTimeLeft = currentTotalTime;
        
        document.getElementById('pomo-status').textContent = pomoMode === 'study' ? "Ready to focus?" : "Ready for a break?";
        updatePomoDisplay();
    }

    function updatePomoDisplay() {
        const min = Math.floor(pomoTimeLeft / 60).toString().padStart(2, '0');
        const sec = (pomoTimeLeft % 60).toString().padStart(2, '0');
        document.getElementById('timer-time').textContent = `${min}:${sec}`;
        
        const percent = ((currentTotalTime - pomoTimeLeft) / currentTotalTime) * 100;
        setCircleProgress(percent);
    }

    function pomoTick() {
        const elapsedMs = Date.now() - pomoStartTime;
        const totalElapsedSecs = pomoAccumulatedTime + Math.floor(elapsedMs / 1000);
        pomoTimeLeft = Math.max(0, pomoDuration - totalElapsedSecs);
        
        updatePomoDisplay();

        if (pomoTimeLeft <= 0) {
            // Finished
            clearInterval(pomoInterval);
            isRunning = false;
            pomoAccumulatedTime = 0;
            showToast(pomoMode === 'study' ? "Focus session completed!" : "Break time is over!", "Time's Up");
            
            if(pomoMode === 'study') {
                const studyMin = parseInt(document.getElementById('setting-study').value) || 25;
                pomoState.sessions++;
                pomoState.focusTime += studyMin;
                localStorage.setItem('pomoStats', JSON.stringify(pomoState));
                updateDashboard();
                checkAchievements();
                
                // Switch to break
                pomoMode = 'break';
                document.querySelectorAll('.pomo-tab')[0].classList.remove('active');
                document.querySelectorAll('.pomo-tab')[1].classList.add('active');
            } else {
                // Switch to study
                pomoMode = 'study';
                document.querySelectorAll('.pomo-tab')[1].classList.remove('active');
                document.querySelectorAll('.pomo-tab')[0].classList.add('active');
            }
            resetPomodoro();
            
            // Auto-start next phase
            document.getElementById('pomo-start').click();
        }
    }

    // --- Calendar ---
    let currentCalDate = new Date();
    
    function getHoliday(month, day) {
        const holidays = {
            "0-1": "New Year's Day",
            "0-26": "Republic Day",
            "1-14": "Valentine's Day",
            "2-8": "Women's Day",
            "3-22": "Earth Day",
            "4-1": "Labor Day",
            "6-4": "Independence Day (US)",
            "7-15": "Independence Day (IN)",
            "9-2": "Gandhi Jayanti",
            "9-31": "Halloween",
            "11-25": "Christmas Day",
            "11-31": "New Year's Eve"
        };
        return holidays[`${month}-${day}`] || null;
    }

    function initCalendar() {
        document.getElementById('cal-prev').addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() - 1);
            renderCalendar();
        });
        document.getElementById('cal-next').addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() + 1);
            renderCalendar();
        });
        document.getElementById('close-day-panel').addEventListener('click', () => {
            document.getElementById('day-tasks-panel').style.display = 'none';
        });
    }

    function renderCalendar() {
        const monthYear = currentCalDate.toLocaleDateString('default', { month: 'long', year: 'numeric' });
        document.getElementById('cal-month-year').textContent = monthYear;
        
        const grid = document.querySelector('.calendar-grid');
        // Clear old days (keep first 7 weekdays)
        while(grid.children.length > 7) {
            grid.removeChild(grid.lastChild);
        }

        const year = currentCalDate.getFullYear();
        const month = currentCalDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const today = new Date();

        // Empty slots before 1st
        for(let i=0; i<firstDay; i++) {
            const div = document.createElement('div');
            div.className = 'cal-day empty';
            grid.appendChild(div);
        }

        // Days
        for(let d=1; d<=daysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dateStr = dateObj.toDateString();
            
            const div = document.createElement('div');
            div.className = 'cal-day';
            if(dateObj.toDateString() === today.toDateString()) div.classList.add('today');
            
            const span = document.createElement('span');
            span.className = 'day-num';
            span.textContent = d;
            div.appendChild(span);

            // Find tasks for this day
            const dayTasks = todos.filter(t => {
                const tDate = t.alarmTime ? new Date(t.alarmTime) : new Date(t.createdAt);
                return tDate.toDateString() === dateStr;
            });

            if(dayTasks.length > 0) {
                const indicators = document.createElement('div');
                indicators.className = 'day-indicators';
                // Show max 3 dots
                dayTasks.slice(0, 3).forEach(t => {
                    const dot = document.createElement('div');
                    dot.className = 'indicator-dot';
                    dot.style.background = t.completed ? 'var(--success-color)' : (t.priority === 'high' ? 'var(--danger-color)' : 'var(--accent-color)');
                    indicators.appendChild(dot);
                });
                if(dayTasks.length > 3) {
                    const extra = document.createElement('span');
                    extra.style.fontSize = '0.6rem';
                    extra.textContent = '+';
                    indicators.appendChild(extra);
                }
                div.appendChild(indicators);
            }

            const holidayName = getHoliday(month, d);
            if(holidayName) {
                const hol = document.createElement('div');
                hol.className = 'holiday-name';
                hol.textContent = holidayName;
                div.appendChild(hol);
            }

            div.addEventListener('click', () => openDayPanel(dateObj, dayTasks, holidayName));
            grid.appendChild(div);
        }
    }

    function openDayPanel(dateObj, tasks, holidayName) {
        const panel = document.getElementById('day-tasks-panel');
        const list = document.getElementById('day-tasks-list');
        
        let titleText = `Tasks for ${dateObj.toLocaleDateString()}`;
        if(holidayName) {
            titleText += ` - ${holidayName} 🎉`;
        }
        document.getElementById('selected-date-title').textContent = titleText;
        
        list.innerHTML = '';
        if(tasks.length === 0) {
            list.innerHTML = '<li style="color:var(--text-secondary);">No tasks for this day.</li>';
        } else {
            tasks.forEach(t => {
                const li = document.createElement('li');
                const h = t.durationHours !== undefined ? t.durationHours : 0;
                const m = t.durationMinutes !== undefined ? t.durationMinutes : 30;
                li.innerHTML = `
                    <div style="display: flex; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--glass-border);">
                        ${getPriorityBadge(t.priority)}
                        <div style="flex: 1; display: flex; flex-direction: column;">
                            <span style="${t.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${escapeHtml(t.text)}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">⏱ ${h}h ${m}m</span>
                        </div>
                    </div>
                `;
                list.appendChild(li);
            });
        }
        
        panel.style.display = 'block';
    }

    // --- Alarms & Utils ---
    function formatTaskDuration(h, m) {
        const hours = parseInt(h);
        const minutes = parseInt(m);
        if (isNaN(hours) && isNaN(minutes)) {
            return "0 Hours 30 Minutes";
        }
        const hrs = isNaN(hours) ? 0 : hours;
        const mins = isNaN(minutes) ? 0 : minutes;
        
        let parts = [];
        if (hrs > 0) parts.push(`${hrs} Hour${hrs > 1 ? 's' : ''}`);
        if (mins > 0) parts.push(`${mins} Minute${mins > 1 ? 's' : ''}`);
        if (parts.length === 0) return "0 Minutes";
        return parts.join(' ');
    }

    function formatPlannedTime(totalMinutes) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        if (h > 0) {
            return `${h}h ${m}m`;
        }
        return `${m}m`;
    }
    function formatAlarmTime(dateTimeString) {
        const d = new Date(dateTimeString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function getTaskTime(todo) {
        const dateObj = todo.createdAt ? new Date(todo.createdAt) : new Date(parseInt(todo.id));
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function showToast(message, title="Notification") {
        const container = document.getElementById('notification-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <div>
                <div style="font-weight: 600; font-size: 0.95rem;">${title}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">${message}</div>
            </div>
        `;
        container.appendChild(toast);
        
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.value = 800;
            gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch(e) {}
        
        toast.addEventListener('click', () => toast.remove());
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 10000);
    }

    let alarmSoundInterval = null;
    function playAlarmBeeps() {
        if (alarmSoundInterval) clearInterval(alarmSoundInterval);
        
        const playTone = () => {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                osc.connect(gainNode);
                gainNode.connect(ctx.destination);
                osc.type = 'square';
                osc.frequency.value = 880;
                gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            } catch(e) {}
        };
        
        playTone();
        alarmSoundInterval = setInterval(playTone, 1500);
    }

    function stopAlarmBeeps() {
        if (alarmSoundInterval) {
            clearInterval(alarmSoundInterval);
            alarmSoundInterval = null;
        }
    }

    function triggerAlarmModal(todo) {
        document.getElementById('alarm-task-id').value = todo.id;
        document.getElementById('alarm-task-text').textContent = todo.text;
        document.getElementById('custom-snooze-container').style.display = 'none';
        document.getElementById('alarm-alert-modal').style.display = 'flex';
        playAlarmBeeps();
    }

    function checkAlarms() {
        const now = new Date();
        let updated = false;
        todos.forEach(todo => {
            if (!todo.completed && todo.alarmTime && !todo.alarmNotified) {
                const alarmDate = new Date(todo.alarmTime);
                if (now >= alarmDate) {
                    todo.alarmNotified = true;
                    updated = true;
                    triggerAlarmModal(todo);
                }
            }
        });
        if (updated) {
            saveAndRender();
        }

        // Standalone Alarms Check
        checkStandaloneAlarms();
        // Recalculate countdown UI
        calculateNextAlarmCountdown();
    }

    // --- Standalone Alarm Systems ---
    function renderAlarms() {
        renderAlarmsList();
    }

    function checkStandaloneAlarms() {
        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const todayStr = now.toDateString();

        let updated = false;

        standaloneAlarms.forEach(alarm => {
            if (!alarm.enabled) return;

            const [alarmH, alarmM] = alarm.time.split(':').map(Number);
            if (currentHour === alarmH && currentMinute === alarmM) {
                const isRepeatDay = alarm.repeatDays.length === 0 || alarm.repeatDays.includes(currentDay);
                
                if (isRepeatDay && alarm.lastFiredDate !== todayStr) {
                    alarm.lastFiredDate = todayStr;
                    
                    if (alarm.repeatDays.length === 0) {
                        alarm.enabled = false;
                    }
                    
                    updated = true;
                    triggerStandaloneAlarmModal(alarm);
                }
            }
        });

        if (updated) {
            localStorage.setItem('standaloneAlarms', JSON.stringify(standaloneAlarms));
            renderAlarmsList();
            updateDashboard();
        }
    }

    let standaloneAlarmSoundInterval = null;

    function playStandaloneAlarmSound(soundType) {
        if (standaloneAlarmSoundInterval) clearInterval(standaloneAlarmSoundInterval);

        const playTone = () => {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (soundType === 'digital') {
                    const playSingleBeep = (delay) => {
                        const osc = ctx.createOscillator();
                        const gainNode = ctx.createGain();
                        osc.connect(gainNode);
                        gainNode.connect(ctx.destination);
                        osc.type = 'square';
                        osc.frequency.setValueAtTime(987.77, ctx.currentTime + delay);
                        gainNode.gain.setValueAtTime(0.0, ctx.currentTime);
                        gainNode.gain.setValueAtTime(0.1, ctx.currentTime + delay);
                        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);
                        osc.start(ctx.currentTime + delay);
                        osc.stop(ctx.currentTime + delay + 0.16);
                    };
                    playSingleBeep(0);
                    playSingleBeep(0.2);
                } else if (soundType === 'classic') {
                    const osc = ctx.createOscillator();
                    const gainNode = ctx.createGain();
                    osc.connect(gainNode);
                    gainNode.connect(ctx.destination);
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(600, ctx.currentTime);
                    for (let t = 0; t < 0.5; t += 0.05) {
                        osc.frequency.setValueAtTime(t % 0.1 < 0.05 ? 650 : 550, ctx.currentTime + t);
                    }
                    gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.5);
                } else {
                    const notes = [523.25, 659.25, 783.99];
                    notes.forEach((freq, idx) => {
                        const osc = ctx.createOscillator();
                        const gainNode = ctx.createGain();
                        osc.connect(gainNode);
                        gainNode.connect(ctx.destination);
                        osc.type = 'sine';
                        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
                        gainNode.gain.setValueAtTime(0.0, ctx.currentTime);
                        gainNode.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.15);
                        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.15 + 0.35);
                        osc.start(ctx.currentTime + idx * 0.15);
                        osc.stop(ctx.currentTime + idx * 0.15 + 0.4);
                    });
                }
            } catch (e) {
                console.error("Audio Synthesis Error", e);
            }
        };

        playTone();
        standaloneAlarmSoundInterval = setInterval(playTone, 1500);
    }

    function stopStandaloneAlarmSound() {
        if (standaloneAlarmSoundInterval) {
            clearInterval(standaloneAlarmSoundInterval);
            standaloneAlarmSoundInterval = null;
        }
    }

    function triggerVibration(enabled) {
        if (enabled && navigator.vibrate) {
            navigator.vibrate([500, 250, 500]);
        }
    }

    let activeRingingAlarm = null;

    function triggerStandaloneAlarmModal(alarm) {
        activeRingingAlarm = alarm;
        document.getElementById('standalone-alarm-popup-title').textContent = alarm.title || "Alarm Fired!";
        
        const [h, m] = alarm.time.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 || 12;
        const displayM = m < 10 ? '0' + m : m;
        document.getElementById('standalone-alarm-popup-time').textContent = `${displayH}:${displayM} ${ampm}`;
        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const daysText = alarm.repeatDays.length === 0 ? "Once" : alarm.repeatDays.map(d => dayNames[d]).join(', ');
        document.getElementById('standalone-alarm-popup-label').textContent = daysText;

        document.getElementById('standalone-alarm-modal').style.display = 'flex';
        
        playStandaloneAlarmSound(alarm.sound);
        triggerVibration(alarm.vibrate);
    }

    function dismissStandaloneAlarm() {
        document.getElementById('standalone-alarm-modal').style.display = 'none';
        stopStandaloneAlarmSound();
        activeRingingAlarm = null;
    }

    function formatTimeDisplay(time24) {
        const [h, m] = time24.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 || 12;
        const displayM = m < 10 ? '0' + m : m;
        return `${displayH}:${displayM} ${ampm}`;
    }

    function renderAlarmsList() {
        const listEl = document.getElementById('alarms-list');
        if (!listEl) return;
        listEl.innerHTML = "";

        if (standaloneAlarms.length === 0) {
            listEl.innerHTML = `<li style="color: var(--text-secondary); text-align: center; margin-top: 24px;">No alarms configured.</li>`;
            return;
        }

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        standaloneAlarms.forEach(alarm => {
            const li = document.createElement('li');
            li.className = "alarm-item";
            
            const daysDisplay = alarm.repeatDays.length === 0 ? "Once" : 
                                (alarm.repeatDays.length === 7 ? "Every Day" : 
                                alarm.repeatDays.map(d => dayNames[d]).join(', '));

            li.innerHTML = `
                <div class="alarm-details">
                    <span class="alarm-item-time">${formatTimeDisplay(alarm.time)}</span>
                    <span class="alarm-item-title">${escapeHtml(alarm.title)}</span>
                    <span class="alarm-item-days">🔁 ${daysDisplay}</span>
                </div>
                <div class="alarm-actions">
                    <label class="alarm-toggle-switch">
                        <input type="checkbox" class="alarm-toggle-check" ${alarm.enabled ? 'checked' : ''}>
                        <span class="alarm-toggle-slider"></span>
                    </label>
                    <button class="icon-btn alarm-edit-btn" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer;" title="Edit Alarm">✏️</button>
                    <button class="icon-btn alarm-delete-btn" style="background: transparent; border: none; color: var(--danger-color); cursor: pointer;" title="Delete Alarm">🗑️</button>
                </div>
            `;

            li.querySelector('.alarm-toggle-check').addEventListener('change', (e) => {
                alarm.enabled = e.target.checked;
                localStorage.setItem('standaloneAlarms', JSON.stringify(standaloneAlarms));
                updateDashboard();
                calculateNextAlarmCountdown();
            });

            li.querySelector('.alarm-edit-btn').addEventListener('click', () => editAlarm(alarm.id));
            li.querySelector('.alarm-delete-btn').addEventListener('click', () => deleteAlarm(alarm.id));

            listEl.appendChild(li);
        });
    }

    function editAlarm(id) {
        const alarm = standaloneAlarms.find(a => a.id === id);
        if (!alarm) return;

        document.getElementById('edit-alarm-id').value = alarm.id;
        document.getElementById('alarm-time').value = alarm.time;
        document.getElementById('alarm-title').value = alarm.title;
        document.getElementById('alarm-sound').value = alarm.sound;
        document.getElementById('alarm-vibrate').checked = alarm.vibrate;

        selectedDays.clear();
        document.querySelectorAll('.day-select-btn').forEach(btn => {
            const day = parseInt(btn.dataset.day);
            if (alarm.repeatDays.includes(day)) {
                selectedDays.add(day);
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        document.getElementById('clear-alarm-form-btn').style.display = 'inline-block';
        document.getElementById('save-alarm-btn').textContent = "Update Alarm";
    }

    function deleteAlarm(id) {
        standaloneAlarms = standaloneAlarms.filter(a => a.id !== id);
        localStorage.setItem('standaloneAlarms', JSON.stringify(standaloneAlarms));
        renderAlarmsList();
        updateDashboard();
    }

    function calculateNextAlarmCountdown() {
        const countdownEl = document.getElementById('next-alarm-countdown');
        if (!countdownEl) return;

        const nextAlarm = getNextAlarmTime();
        if (!nextAlarm) {
            countdownEl.textContent = "No Active Alarms";
            return;
        }

        const diffMs = nextAlarm.timeDate - new Date();
        if (diffMs <= 0) {
            countdownEl.textContent = "Calculating...";
            return;
        }

        const totalSecs = Math.floor(diffMs / 1000);
        const days = Math.floor(totalSecs / 86400);
        const hrs = Math.floor((totalSecs % 86400) / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;

        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hrs > 0 || days > 0) parts.push(`${hrs}h`);
        if (mins > 0 || hrs > 0 || days > 0) parts.push(`${mins}m`);
        parts.push(`${secs}s`);

        countdownEl.textContent = `In ${parts.join(' ')} (${nextAlarm.title})`;
    }

    function getNextAlarmTime() {
        const activeAlarms = standaloneAlarms.filter(a => a.enabled);
        if (activeAlarms.length === 0) return null;

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentDate = now.getDate();
        const currentDay = now.getDay();

        let nearestAlarm = null;
        let minDiffMs = Infinity;

        activeAlarms.forEach(alarm => {
            const [alarmH, alarmM] = alarm.time.split(':').map(Number);
            
            if (alarm.repeatDays.length === 0) {
                const alarmDateObj = new Date(currentYear, currentMonth, currentDate, alarmH, alarmM, 0, 0);
                if (alarmDateObj <= now) {
                    alarmDateObj.setDate(currentDate + 1);
                }
                const diff = alarmDateObj - now;
                if (diff < minDiffMs) {
                    minDiffMs = diff;
                    nearestAlarm = { alarm, timeDate: alarmDateObj, title: alarm.title };
                }
            } else {
                alarm.repeatDays.forEach(day => {
                    let daysOffset = day - currentDay;
                    if (daysOffset < 0) daysOffset += 7;
                    
                    const alarmDateObj = new Date(currentYear, currentMonth, currentDate, alarmH, alarmM, 0, 0);
                    alarmDateObj.setDate(currentDate + daysOffset);

                    if (alarmDateObj <= now && daysOffset === 0) {
                        alarmDateObj.setDate(alarmDateObj.getDate() + 7);
                    }

                    const diff = alarmDateObj - now;
                    if (diff < minDiffMs) {
                        minDiffMs = diff;
                        nearestAlarm = { alarm, timeDate: alarmDateObj, title: alarm.title };
                    }
                });
            }
        });

        return nearestAlarm;
    }

    // --- Stopwatch systems ---
    function renderStopwatch() {
        renderStopwatchStats();
    }

    let stopwatchInterval = null;
    let stopwatchStartTime = 0;
    let stopwatchElapsedTime = 0;
    let stopwatchLaps = [];
    let stopwatchIsRunning = false;

    function startStopwatch() {
        stopwatchStartTime = Date.now();
        stopwatchIsRunning = true;
        document.querySelector('.timer-display').classList.add('running');
        
        stopwatchInterval = setInterval(updateStopwatchUI, 10);
        toggleStopwatchButtons('running');
    }

    function pauseStopwatch() {
        if (!stopwatchIsRunning) return;
        stopwatchElapsedTime += Date.now() - stopwatchStartTime;
        stopwatchIsRunning = false;
        document.querySelector('.timer-display').classList.remove('running');
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
        toggleStopwatchButtons('paused');
    }

    function resumeStopwatch() {
        if (stopwatchIsRunning) return;
        stopwatchStartTime = Date.now();
        stopwatchIsRunning = true;
        document.querySelector('.timer-display').classList.add('running');
        stopwatchInterval = setInterval(updateStopwatchUI, 10);
        toggleStopwatchButtons('running');
    }

    function stopStopwatch() {
        if (stopwatchIsRunning) {
            stopwatchElapsedTime += Date.now() - stopwatchStartTime;
        }
        stopwatchIsRunning = false;
        document.querySelector('.timer-display').classList.remove('running');
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;

        saveStopwatchSession(stopwatchElapsedTime);
        toggleStopwatchButtons('stopped');
    }

    function resetStopwatch() {
        stopwatchElapsedTime = 0;
        stopwatchLaps = [];
        document.getElementById('stopwatch-time').textContent = "00:00:00.00";
        document.getElementById('stopwatch-laps-list').innerHTML = "";
        toggleStopwatchButtons('initial');
    }

    function recordLap() {
        const currentElapsed = stopwatchIsRunning ? (stopwatchElapsedTime + (Date.now() - stopwatchStartTime)) : stopwatchElapsedTime;
        
        let previousLapTotal = 0;
        if (stopwatchLaps.length > 0) {
            previousLapTotal = stopwatchLaps[stopwatchLaps.length - 1].total;
        }
        const lapDiff = currentElapsed - previousLapTotal;

        const newLap = {
            num: stopwatchLaps.length + 1,
            diff: lapDiff,
            total: currentElapsed
        };
        stopwatchLaps.push(newLap);

        renderLaps();
    }

    function formatMsToTime(ms) {
        let totalCentis = Math.floor(ms / 10);
        let centis = totalCentis % 100;
        let totalSecs = Math.floor(totalCentis / 100);
        let secs = totalSecs % 60;
        let totalMins = Math.floor(totalSecs / 60);
        let mins = totalMins % 60;
        let hrs = Math.floor(totalMins / 60);

        const pad = (n) => n < 10 ? '0' + n : n;

        return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(centis)}`;
    }

    function updateStopwatchUI() {
        const elapsed = stopwatchElapsedTime + (Date.now() - stopwatchStartTime);
        document.getElementById('stopwatch-time').textContent = formatMsToTime(elapsed);
    }

    function toggleStopwatchButtons(state) {
        const startBtn = document.getElementById('stopwatch-start');
        const pauseBtn = document.getElementById('stopwatch-pause');
        const resumeBtn = document.getElementById('stopwatch-resume');
        const lapBtn = document.getElementById('stopwatch-lap');
        const stopBtn = document.getElementById('stopwatch-stop');
        const resetBtn = document.getElementById('stopwatch-reset');

        startBtn.style.display = 'none';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        lapBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        resetBtn.style.display = 'none';

        if (state === 'initial') {
            startBtn.style.display = 'inline-block';
        } else if (state === 'running') {
            pauseBtn.style.display = 'inline-block';
            lapBtn.style.display = 'inline-block';
            stopBtn.style.display = 'inline-block';
        } else if (state === 'paused') {
            resumeBtn.style.display = 'inline-block';
            lapBtn.style.display = 'inline-block';
            stopBtn.style.display = 'inline-block';
        } else if (state === 'stopped') {
            resetBtn.style.display = 'inline-block';
        }
    }

    function renderLaps() {
        const tbody = document.getElementById('stopwatch-laps-list');
        if (!tbody) return;
        tbody.innerHTML = "";

        [...stopwatchLaps].reverse().forEach(lap => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid var(--glass-border)";
            tr.innerHTML = `
                <td style="padding: 8px;">Lap ${lap.num}</td>
                <td style="padding: 8px; font-family: monospace;">+${formatMsToTime(lap.diff)}</td>
                <td style="padding: 8px; font-family: monospace; text-align: right;">${formatMsToTime(lap.total)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function saveStopwatchSession(durationMs) {
        if (durationMs <= 0) return;

        const newSession = {
            id: Date.now().toString(),
            date: new Date().toDateString(),
            durationMs,
            laps: stopwatchLaps.map(l => l.diff)
        };

        stopwatchStats.allSessions.push(newSession);
        stopwatchStats.sessions++;
        
        if (durationMs > stopwatchStats.longestSession) {
            stopwatchStats.longestSession = durationMs;
        }

        let todayTime = 0;
        const todayStr = new Date().toDateString();
        stopwatchStats.allSessions.forEach(s => {
            if (s.date === todayStr) {
                todayTime += s.durationMs;
            }
        });
        stopwatchStats.totalTimeToday = todayTime;

        localStorage.setItem('stopwatchStats', JSON.stringify(stopwatchStats));
        
        renderStopwatchStats();
        updateDashboard();
    }

    function renderStopwatchStats() {
        document.getElementById('sw-stats-sessions').textContent = stopwatchStats.sessions;
        
        let totalDuration = 0;
        stopwatchStats.allSessions.forEach(s => totalDuration += s.durationMs);
        
        const avgMs = stopwatchStats.sessions > 0 ? (totalDuration / stopwatchStats.sessions) : 0;
        
        document.getElementById('sw-stats-avg').textContent = formatMsToSecs(avgMs);
        document.getElementById('sw-stats-longest').textContent = formatMsToSecs(stopwatchStats.longestSession);
    }

    function formatMsToSecs(ms) {
        if (ms <= 0) return "0s";
        const totalSecs = ms / 1000;
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = (totalSecs % 60).toFixed(1);

        let parts = [];
        if (hrs > 0) parts.push(`${hrs}h`);
        if (mins > 0) parts.push(`${mins}m`);
        if (parseFloat(secs) > 0 || parts.length === 0) parts.push(`${secs}s`);
        return parts.join(' ');
    }

    function escapeHtml(unsafe) {
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // --- Initialization ---
    // --- Pin, Favorites and Task Editor logic ---
    function togglePinTodo(id) {
        todos = todos.map(t => t.id === id ? { ...t, pinned: !t.pinned, updatedAt: new Date().toISOString() } : t);
        saveAndRender();
    }

    function toggleFavTodo(id) {
        todos = todos.map(t => t.id === id ? { ...t, favorite: !t.favorite, updatedAt: new Date().toISOString() } : t);
        saveAndRender();
    }

    function openTaskEditor(todo) {
        document.getElementById('edit-task-id').value = todo.id;
        document.getElementById('edit-task-text').value = todo.text;
        document.getElementById('edit-task-desc').value = todo.description || '';
        document.getElementById('edit-task-priority').value = todo.priority || 'medium';
        document.getElementById('edit-task-category').value = todo.category || 'Work';
        document.getElementById('edit-task-alarm').value = todo.alarmTime || '';
        document.getElementById('edit-task-tags').value = todo.tags ? todo.tags.join(', ') : '';
        document.getElementById('edit-task-duration-hours').value = todo.durationHours !== undefined ? todo.durationHours : 0;
        document.getElementById('edit-task-duration-minutes').value = todo.durationMinutes !== undefined ? todo.durationMinutes : 30;
        
        const repeatCheck = document.getElementById('edit-task-repeat');
        if (repeatCheck) repeatCheck.checked = todo.repeat || false;

        document.getElementById('task-edit-modal').style.display = 'flex';
    }

    function initTaskEditor() {
        document.getElementById('close-edit-modal').addEventListener('click', () => {
            document.getElementById('task-edit-modal').style.display = 'none';
        });
        document.getElementById('cancel-edit-btn').addEventListener('click', () => {
            document.getElementById('task-edit-modal').style.display = 'none';
        });
        
        document.getElementById('edit-task-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-task-id').value;
            const text = document.getElementById('edit-task-text').value.trim();
            const desc = document.getElementById('edit-task-desc').value.trim();
            const priority = document.getElementById('edit-task-priority').value;
            const category = document.getElementById('edit-task-category').value;
            const alarm = document.getElementById('edit-task-alarm').value;
            const tagsText = document.getElementById('edit-task-tags').value.trim();
            
            const hoursVal = parseInt(document.getElementById('edit-task-duration-hours').value);
            const minsVal = parseInt(document.getElementById('edit-task-duration-minutes').value);
            const hours = isNaN(hoursVal) ? 0 : hoursVal;
            const minutes = isNaN(minsVal) ? 0 : minsVal;

            if (hours < 0 || minutes < 0) {
                alert('Duration cannot be negative.');
                return;
            }
            if (hours === 0 && minutes === 0) {
                alert('Duration must be at least 1 minute.');
                return;
            }
            
            const repeatInput = document.getElementById('edit-task-repeat');
            const isRepeat = repeatInput ? repeatInput.checked : false;

            const tags = tagsText ? tagsText.split(',').map(tag => tag.trim()).filter(t => t.length > 0) : [];

            todos = todos.map(t => {
                if (t.id === id) {
                    const originalAlarm = t.originalAlarmTime || t.alarmTime;
                    const alarmChanged = t.alarmTime !== alarm;
                    return {
                        ...t,
                        text,
                        description: desc,
                        priority,
                        category,
                        alarmTime: alarm || null,
                        originalAlarmTime: alarmChanged ? alarm : originalAlarm,
                        alarmNotified: alarmChanged ? false : t.alarmNotified,
                        tags,
                        durationHours: hours,
                        durationMinutes: minutes,
                        repeat: isRepeat,
                        updatedAt: new Date().toISOString()
                    };
                }
                return t;
            });

            saveAndRender();
            document.getElementById('task-edit-modal').style.display = 'none';
        });
    }

    // --- Snooze Logic ---
    function initAlarmTriggerControls() {
        const modal = document.getElementById('alarm-alert-modal');
        const snoozeBtns = document.querySelectorAll('.snooze-btn');
        const customContainer = document.getElementById('custom-snooze-container');
        const customSnoozeTime = document.getElementById('custom-snooze-time');
        const applyCustomSnooze = document.getElementById('apply-custom-snooze');
        const dismissBtn = document.getElementById('dismiss-alarm-btn');
        const completeBtn = document.getElementById('complete-alarm-btn');

        snoozeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.time;
                const taskId = document.getElementById('alarm-task-id').value;
                
                if (mode === 'custom') {
                    customContainer.style.display = 'block';
                } else {
                    snoozeTask(taskId, mode);
                    modal.style.display = 'none';
                    stopAlarmBeeps();
                }
            });
        });

        applyCustomSnooze.addEventListener('click', () => {
            const taskId = document.getElementById('alarm-task-id').value;
            const customVal = customSnoozeTime.value;
            if (!customVal) {
                alert('Please pick a custom time.');
                return;
            }
            snoozeTask(taskId, 'custom', customVal);
            modal.style.display = 'none';
            stopAlarmBeeps();
        });

        dismissBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            stopAlarmBeeps();
        });

        completeBtn.addEventListener('click', () => {
            const taskId = document.getElementById('alarm-task-id').value;
            toggleTodo(taskId);
            modal.style.display = 'none';
            stopAlarmBeeps();
        });
    }

    function snoozeTask(id, durationMinutes, customTimeVal) {
        let snoozeTime = new Date();
        
        if (durationMinutes === 'tomorrow') {
            snoozeTime.setDate(snoozeTime.getDate() + 1);
            snoozeTime.setHours(9, 0, 0, 0);
        } else if (durationMinutes === 'custom') {
            snoozeTime = new Date(customTimeVal);
        } else {
            const mins = parseInt(durationMinutes);
            snoozeTime.setMinutes(snoozeTime.getMinutes() + mins);
        }

        todos = todos.map(t => {
            if (t.id === id) {
                return {
                    ...t,
                    alarmTime: snoozeTime.toISOString(),
                    alarmNotified: false,
                    updatedAt: new Date().toISOString()
                };
            }
            return t;
        });

        saveAndRender();
        showToast(`Snoozed until ${snoozeTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, "Task Snoozed");
    }

    // --- Appearance & Theme Settings ---
    function applyAppearanceSettings() {
        document.body.className = `theme-${appSettings.theme}`;
        if (!appSettings.animations) {
            document.body.classList.add('no-animations');
        } else {
            document.body.classList.remove('no-animations');
        }
        
        document.documentElement.style.setProperty('--accent-color', appSettings.accentColor);
        let hoverColor = appSettings.accentColor;
        if (appSettings.accentColor === '#6366f1') hoverColor = '#4f46e5';
        else if (appSettings.accentColor === '#10b981') hoverColor = '#059669';
        else if (appSettings.accentColor === '#f59e0b') hoverColor = '#d97706';
        else if (appSettings.accentColor === '#ef4444') hoverColor = '#dc2626';
        else if (appSettings.accentColor === '#ec4899') hoverColor = '#db2777';
        document.documentElement.style.setProperty('--accent-hover', hoverColor);

        document.documentElement.className = `font-${appSettings.fontSize}`;
        
        const themeBtns = document.querySelectorAll('.theme-btn');
        themeBtns.forEach(btn => {
            if (btn.dataset.theme === appSettings.theme) {
                themeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                btn.style.borderColor = 'white';
            } else {
                btn.style.borderColor = 'transparent';
            }
        });

        const accentBtns = document.querySelectorAll('.accent-btn');
        accentBtns.forEach(btn => {
            if (btn.dataset.accent === appSettings.accentColor) {
                accentBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                btn.style.borderColor = 'white';
            } else {
                btn.style.borderColor = 'transparent';
            }
        });

        const fontSizeSelect = document.getElementById('font-size-select');
        if (fontSizeSelect) fontSizeSelect.value = appSettings.fontSize;

        const animToggle = document.getElementById('animations-toggle');
        if (animToggle) animToggle.checked = appSettings.animations;
    }

    function initSettingsView() {
        initThemeControls();
        initExportControls();
        initFirebaseSyncControls();
    }

    function initThemeControls() {
        const themeBtns = document.querySelectorAll('.theme-btn');
        themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                appSettings.theme = btn.dataset.theme;
                saveSettings();
            });
        });

        const accentBtns = document.querySelectorAll('.accent-btn');
        accentBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                appSettings.accentColor = btn.dataset.accent;
                saveSettings();
            });
        });

        const fontSizeSelect = document.getElementById('font-size-select');
        fontSizeSelect.addEventListener('change', () => {
            appSettings.fontSize = fontSizeSelect.value;
            saveSettings();
        });

        const animToggle = document.getElementById('animations-toggle');
        animToggle.addEventListener('change', () => {
            appSettings.animations = animToggle.checked;
            saveSettings();
        });
    }

    function saveSettings() {
        localStorage.setItem('appSettings', JSON.stringify(appSettings));
        applyAppearanceSettings();
    }

    // --- Data Export Controls ---
    function initExportControls() {
        document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);
        document.getElementById('export-csv-btn').addEventListener('click', exportToCSV);
        document.getElementById('export-excel-btn').addEventListener('click', exportToExcel);
    }

    function exportToCSV() {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Task Name,Description,Priority,Status,Category,Due Date,Due Time,Completion Date,Tags,Duration\r\n";
        
        todos.forEach(todo => {
            const name = `"${(todo.text || '').replace(/"/g, '""')}"`;
            const desc = `"${(todo.description || '').replace(/"/g, '""')}"`;
            const priority = todo.priority || 'medium';
            const status = todo.completed ? "Completed" : "Pending";
            const category = todo.category || "Work";
            
            let dueDate = "";
            let dueTime = "";
            if (todo.alarmTime) {
                const dt = new Date(todo.alarmTime);
                dueDate = dt.toISOString().split('T')[0];
                dueTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            }
            
            let compDate = "";
            if (todo.completedAt) {
                compDate = new Date(todo.completedAt).toISOString().split('T')[0];
            }
            
            const tags = `"${(todo.tags || []).join(', ').replace(/"/g, '""')}"`;
            const duration = `"${formatTaskDuration(todo.durationHours, todo.durationMinutes)}"`;
            
            const row = [name, desc, priority, status, category, dueDate, dueTime, compDate, tags, duration].join(",");
            csvContent += row + "\r\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `focuspro_tasks_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportToExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Excel library is loading, please try again.');
            return;
        }
        
        const excelData = todos.map(todo => {
            let dueDate = "";
            let dueTime = "";
            if (todo.alarmTime) {
                const dt = new Date(todo.alarmTime);
                dueDate = dt.toISOString().split('T')[0];
                dueTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            }
            
            let compDate = "";
            if (todo.completedAt) {
                compDate = new Date(todo.completedAt).toISOString().split('T')[0];
            }

            return {
                "Task Name": todo.text || "",
                "Description": todo.description || "",
                "Priority": todo.priority ? todo.priority.toUpperCase() : "MEDIUM",
                "Status": todo.completed ? "COMPLETED" : "PENDING",
                "Category": todo.category || "Work",
                "Due Date": dueDate,
                "Due Time": dueTime,
                "Completion Date": compDate,
                "Tags": (todo.tags || []).join(', '),
                "Duration": formatTaskDuration(todo.durationHours, todo.durationMinutes)
            };
        });
        
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Tasks");
        
        XLSX.writeFile(workbook, `focuspro_tasks_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    function exportToPDF() {
        if (typeof window.jspdf === 'undefined') {
            alert('PDF library is loading, please try again.');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        
        doc.setFont("helvetica");
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text("FocusPro Productivity Tasks Report", 14, 18);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 24);
        
        const headers = [["Task Name", "Description", "Priority", "Status", "Category", "Due Date/Time", "Completed", "Tags", "Duration"]];
        
        const rows = todos.map(todo => {
            let dueDateTime = "";
            if (todo.alarmTime) {
                dueDateTime = new Date(todo.alarmTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
            }
            
            let compDate = "";
            if (todo.completedAt) {
                compDate = new Date(todo.completedAt).toLocaleDateString();
            }

            return [
                todo.text || "",
                todo.description || "",
                (todo.priority || 'medium').toUpperCase(),
                todo.completed ? "COMPLETED" : "PENDING",
                todo.category || "Work",
                dueDateTime,
                compDate,
                (todo.tags || []).join(', '),
                formatTaskDuration(todo.durationHours, todo.durationMinutes)
            ];
        });
        
        doc.autoTable({
            startY: 28,
            head: headers,
            body: rows,
            theme: 'grid',
            headStyles: { fillBox: true, fillColor: [99, 102, 241], textColor: [255, 255, 255] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { horizontal: 14 }
        });
        
        doc.save(`focuspro_tasks_${new Date().toISOString().split('T')[0]}.pdf`);
    }

    // --- Firebase Synchronization System ---
    let db = null;
    let auth = null;
    let currentUser = null;

    function initFirebase() {
        if (!firebaseConfig) {
            console.log("Firebase not configured. Offline mode active.");
            return;
        }
        
        try {
            if (firebase.apps.length === 0) {
                firebase.initializeApp(firebaseConfig);
            }
            db = firebase.firestore();
            auth = firebase.auth();
            
            db.enablePersistence().catch(err => {
                console.error("Firestore persistence error", err);
            });

            auth.onAuthStateChanged(user => {
                currentUser = user;
                updateFirebaseUI();
                if (user) {
                    setupFirestoreRealtimeSync();
                }
            });
        } catch(e) {
            console.error("Firebase init failed", e);
        }
    }

    function updateFirebaseUI() {
        const loggedOutEl = document.getElementById('firebase-logged-out');
        const loggedInEl = document.getElementById('firebase-logged-in');
        
        if (currentUser) {
            loggedOutEl.style.display = 'none';
            loggedInEl.style.display = 'block';
            document.getElementById('user-email').textContent = currentUser.email;
            document.getElementById('user-avatar').textContent = (currentUser.email || 'U').substring(0, 1).toUpperCase();
        } else {
            loggedOutEl.style.display = 'block';
            loggedInEl.style.display = 'none';
        }
    }

    function initFirebaseSyncControls() {
        const configTextarea = document.getElementById('firebase-config-input');
        if (firebaseConfig) {
            configTextarea.value = JSON.stringify(firebaseConfig, null, 2);
        }

        document.getElementById('save-firebase-config').addEventListener('click', () => {
            const rawVal = configTextarea.value.trim();
            if (!rawVal) {
                localStorage.removeItem('firebaseConfig');
                firebaseConfig = null;
                alert('Config cleared. Local mode active.');
                location.reload();
                return;
            }
            try {
                const parsed = JSON.parse(rawVal);
                localStorage.setItem('firebaseConfig', JSON.stringify(parsed));
                firebaseConfig = parsed;
                alert('Firebase configuration saved successfully! Reloading...');
                location.reload();
            } catch(e) {
                alert('Invalid JSON configuration object.');
            }
        });

        document.getElementById('google-login-btn').addEventListener('click', () => {
            if (!auth) {
                alert('Firebase not initialized. Paste a config first.');
                return;
            }
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(err => {
                alert(`Google Sign-In failed: ${err.message}`);
            });
        });

        const emailAuthForm = document.getElementById('email-auth-form');
        emailAuthForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!auth) return;
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            
            auth.signInWithEmailAndPassword(email, password).catch(err => {
                alert(`Login failed: ${err.message}`);
            });
        });

        document.getElementById('email-signup-btn').addEventListener('click', () => {
            if (!auth) return;
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            
            if (!email || !password) {
                alert('Enter email and password.');
                return;
            }

            auth.createUserWithEmailAndPassword(email, password).then(cred => {
                alert('Account created!');
            }).catch(err => {
                alert(`Sign Up failed: ${err.message}`);
            });
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            if (auth) {
                auth.signOut().then(() => {
                    location.reload();
                });
            }
        });

        document.getElementById('manual-sync-btn').addEventListener('click', () => {
            if (currentUser) {
                syncDataManual();
            }
        });
    }

    let syncUnsubscribe = null;
    function setupFirestoreRealtimeSync() {
        if (!db || !currentUser) return;
        
        const userTodosRef = db.collection('users').doc(currentUser.uid).collection('todos');
        
        migrateLocalDataToFirestoreOnce();

        syncUnsubscribe = userTodosRef.onSnapshot(snapshot => {
            let cloudList = [];
            snapshot.forEach(doc => {
                cloudList.push({ id: doc.id, ...doc.data() });
            });
            if (cloudList.length > 0) {
                mergeTodosWithCloud(cloudList);
            }
            document.getElementById('sync-status').textContent = "Synced with cloud";
            document.getElementById('sync-status').className = "text-success";
        }, err => {
            console.error("Firestore sync error", err);
            document.getElementById('sync-status').textContent = "Offline / Sync Paused";
            document.getElementById('sync-status').className = "text-danger";
        });

        syncAchievementsFromCloud();
    }

    function uploadTodoToCloud(todo) {
        if (!db || !currentUser) return;
        db.collection('users').doc(currentUser.uid).collection('todos').doc(todo.id).set(todo).catch(err => {
            console.error("Firestore write error", err);
        });
    }

    function mergeTodosWithCloud(cloudTodos) {
        let changed = false;
        const localMap = new Map(todos.map(t => [t.id, t]));
        const cloudMap = new Map(cloudTodos.map(t => [t.id, t]));
        
        cloudMap.forEach((cloudTodo, id) => {
            const localTodo = localMap.get(id);
            if (!localTodo) {
                todos.push(cloudTodo);
                changed = true;
            } else {
                const localTime = new Date(localTodo.updatedAt || localTodo.createdAt || 0).getTime();
                const cloudTime = new Date(cloudTodo.updatedAt || cloudTodo.createdAt || 0).getTime();
                
                if (cloudTime > localTime) {
                    todos = todos.map(t => t.id === id ? cloudTodo : t);
                    changed = true;
                } else if (localTime > cloudTime) {
                    uploadTodoToCloud(localTodo);
                }
            }
        });

        todos.forEach(localTodo => {
            if (!cloudMap.has(localTodo.id)) {
                // If it exists locally but not in cloud, delete locally
                todos = todos.filter(t => t.id !== localTodo.id);
                changed = true;
            }
        });

        if (changed) {
            localStorage.setItem('todos', JSON.stringify(todos));
            renderTodos();
            updateDashboard();
        }
    }

    let migrationDone = false;
    function migrateLocalDataToFirestoreOnce() {
        if (migrationDone || !currentUser || !db) return;
        migrationDone = true;
        
        db.collection('users').doc(currentUser.uid).collection('todos').get().then(snapshot => {
            if (snapshot.empty && todos.length > 0) {
                todos.forEach(t => {
                    uploadTodoToCloud(t);
                });
                console.log("Local database migrated successfully!");
            }
        });
    }

    function syncAchievementsToCloud() {
        if (!db || !currentUser) return;
        db.collection('users').doc(currentUser.uid).collection('metadata').doc('achievements').set({
            unlockedAchievements: unlockedAchievements,
            updatedAt: new Date().toISOString()
        }).catch(err => console.error("Firestore upload error", err));
    }

    function syncAchievementsFromCloud() {
        if (!db || !currentUser) return;
        db.collection('users').doc(currentUser.uid).collection('metadata').doc('achievements').get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                if (data.unlockedAchievements && data.unlockedAchievements.length > unlockedAchievements.length) {
                    unlockedAchievements = data.unlockedAchievements;
                    localStorage.setItem('unlockedAchievements', JSON.stringify(unlockedAchievements));
                    if (document.getElementById('view-achievements').classList.contains('active')) {
                        renderAchievements();
                    }
                }
            }
        });
    }

    function syncDataManual() {
        if (!db || !currentUser) return;
        document.getElementById('sync-status').textContent = "Syncing...";
        
        db.collection('users').doc(currentUser.uid).collection('todos').get().then(snapshot => {
            let cloudList = [];
            snapshot.forEach(doc => {
                cloudList.push({ id: doc.id, ...doc.data() });
            });
            mergeTodosWithCloud(cloudList);
            syncAchievementsFromCloud();
            document.getElementById('sync-status').textContent = "Sync complete! ✓";
            document.getElementById('sync-status').className = "text-success";
        }).catch(err => {
            document.getElementById('sync-status').textContent = "Sync failed ✕";
            document.getElementById('sync-status').className = "text-danger";
        });
    }

    // --- Achievements Gamification Engine ---
    const achievementDefinitions = [
        { id: 'first_task', name: 'First Task Completed', desc: 'Complete your first task to start your journey.', icon: '🎯', goal: 1 },
        { id: 'tasks_10', name: '10 Tasks Completed', desc: 'Reach 10 tasks completed.', icon: '🚀', goal: 10 },
        { id: 'tasks_50', name: '50 Tasks Completed', desc: 'Reach 50 tasks completed.', icon: '🔥', goal: 50 },
        { id: 'tasks_100', name: '100 Tasks Completed', desc: 'Reach 100 tasks completed.', icon: '👑', goal: 100 },
        { id: 'streak_7', name: '7-Day Streak', desc: 'Complete tasks 7 days in a row.', icon: '📅', goal: 7 },
        { id: 'streak_30', name: '30-Day Streak', desc: 'Complete tasks 30 days in a row.', icon: '🛡️', goal: 30 },
        { id: 'productivity_master', name: 'Productivity Master', desc: 'Complete 150 tasks or 20 Focus sessions, and unlock at least 5 achievements.', icon: '🧠', goal: 1 },
        { id: 'early_bird', name: 'Early Bird', desc: 'Complete a task before 8:00 AM.', icon: '🌅', goal: 1 },
        { id: 'night_owl', name: 'Night Owl', desc: 'Complete a task after 10:00 PM.', icon: '🌌', goal: 1 },
        { id: 'pomo_champion', name: 'Focus Champion', desc: 'Complete 10 Focus study sessions.', icon: '🏆', goal: 10 }
    ];

    function getConsecutiveStreak() {
        const completedDates = todos
            .filter(t => t.completed && t.completedAt)
            .map(t => new Date(t.completedAt).toDateString());
        
        const uniqueDates = [...new Set(completedDates)].map(d => new Date(d));
        if (uniqueDates.length === 0) return 0;
        
        uniqueDates.sort((a, b) => a - b);
        
        let streak = 0;
        let tempStreak = 1;
        
        for (let i = 0; i < uniqueDates.length; i++) {
            if (i > 0) {
                const diffTime = Math.abs(uniqueDates[i] - uniqueDates[i - 1]);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    tempStreak++;
                } else if (diffDays > 1) {
                    streak = Math.max(streak, tempStreak);
                    tempStreak = 1;
                }
            }
        }
        streak = Math.max(streak, tempStreak);

        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const hasTodayOrYesterday = completedDates.includes(today) || completedDates.includes(yesterday);
        
        return hasTodayOrYesterday ? streak : 0;
    }

    function checkAchievements() {
        const completedList = todos.filter(t => t.completed);
        const compCount = completedList.length;
        const streak = getConsecutiveStreak();
        const unlockedIds = new Set(unlockedAchievements.map(a => a.id));
        let newlyUnlocked = false;

        function unlock(id) {
            if (unlockedIds.has(id)) return;
            const def = achievementDefinitions.find(a => a.id === id);
            if (!def) return;
            const newUnlock = {
                id: id,
                unlockedAt: new Date().toISOString()
            };
            unlockedAchievements.push(newUnlock);
            unlockedIds.add(id);
            localStorage.setItem('unlockedAchievements', JSON.stringify(unlockedAchievements));
            newlyUnlocked = true;
            triggerAchievementUnlockPopup(def);
            syncAchievementsToCloud();
        }

        if (compCount >= 1) unlock('first_task');
        if (compCount >= 10) unlock('tasks_10');
        if (compCount >= 50) unlock('tasks_50');
        if (compCount >= 100) unlock('tasks_100');
        if (streak >= 7) unlock('streak_7');
        if (streak >= 30) unlock('streak_30');
        if (pomoState.sessions >= 10) unlock('pomo_champion');

        const earlyBirdCompleted = completedList.some(t => {
            if (!t.completedAt) return false;
            const hr = new Date(t.completedAt).getHours();
            return hr < 8;
        });
        if (earlyBirdCompleted) unlock('early_bird');

        const nightOwlCompleted = completedList.some(t => {
            if (!t.completedAt) return false;
            const hr = new Date(t.completedAt).getHours();
            return hr >= 22;
        });
        if (nightOwlCompleted) unlock('night_owl');

        const unlockedCountExcludingMaster = unlockedAchievements.filter(a => a.id !== 'productivity_master').length;
        if ((compCount >= 150 || pomoState.sessions >= 20) && unlockedCountExcludingMaster >= 5) {
            unlock('productivity_master');
        }

        if (newlyUnlocked && document.getElementById('view-achievements').classList.contains('active')) {
            renderAchievements();
        }
    }

    function renderAchievements() {
        const grid = document.getElementById('achievements-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        const unlockedIds = new Set(unlockedAchievements.map(a => a.id));
        const compCount = todos.filter(t => t.completed).length;
        const streak = getConsecutiveStreak();
        
        document.getElementById('achievements-unlocked-count').textContent = `${unlockedAchievements.length}/${achievementDefinitions.length}`;
        const pct = (unlockedAchievements.length / achievementDefinitions.length) * 100;
        document.getElementById('achievements-progress-fill').style.width = `${pct}%`;

        achievementDefinitions.forEach(def => {
            const isUnlocked = unlockedIds.has(def.id);
            const card = document.createElement('div');
            card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
            
            let progressHtml = '';
            if (!isUnlocked) {
                let current = 0;
                if (def.id.startsWith('tasks_')) current = compCount;
                else if (def.id === 'first_task') current = compCount;
                else if (def.id.startsWith('streak_')) current = streak;
                else if (def.id === 'pomo_champion') current = pomoState.sessions;
                
                if (def.goal > 1) {
                    progressHtml = `<div class="achievement-progress-text">${Math.min(current, def.goal)} / ${def.goal}</div>`;
                }
            } else {
                const unlockedInfo = unlockedAchievements.find(a => a.id === def.id);
                const unlockDateStr = new Date(unlockedInfo.unlockedAt).toLocaleDateString();
                progressHtml = `<div style="font-size: 0.65rem; color: var(--success-color); margin-top: 4px;">Unlocked ${unlockDateStr}</div>`;
            }

            card.innerHTML = `
                <div class="achievement-icon">${def.icon}</div>
                <div class="achievement-title">${def.name}</div>
                <div class="achievement-desc">${def.desc}</div>
                ${progressHtml}
            `;
            grid.appendChild(card);
        });

        const logsList = document.getElementById('achievement-log-list');
        logsList.innerHTML = '';
        if (unlockedAchievements.length === 0) {
            logsList.innerHTML = '<li style="color:var(--text-secondary); padding: 12px 0;">No achievements unlocked yet.</li>';
        } else {
            const sortedUnlocks = [...unlockedAchievements].sort((a,b) => new Date(b.unlockedAt) - new Date(a.unlockedAt));
            sortedUnlocks.forEach(unlock => {
                const def = achievementDefinitions.find(a => a.id === unlock.id);
                if (!def) return;
                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="display: flex; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--glass-border);">
                        <span style="font-size: 1.5rem;">${def.icon}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: 600;">${def.name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">${new Date(unlock.unlockedAt).toLocaleString()}</div>
                        </div>
                    </div>
                `;
                logsList.appendChild(li);
            });
        }
    }

    function triggerAchievementUnlockPopup(def) {
        const popup = document.getElementById('achievement-popup');
        if (!popup) return;
        document.getElementById('achievement-popup-name').textContent = def.name;
        document.getElementById('achievement-popup-desc').textContent = def.desc;
        popup.style.display = 'block';
        
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const playTone = (freq, delay, duration) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();
                osc.connect(gainNode);
                gainNode.connect(ctx.destination);
                osc.type = 'sine';
                osc.frequency.value = freq;
                gainNode.gain.setValueAtTime(0.08, ctx.currentTime + delay);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + duration);
            };
            playTone(523.25, 0, 0.15);
            playTone(659.25, 0.15, 0.15);
            playTone(783.99, 0.3, 0.4);
        } catch(e) {}

        setTimeout(() => {
            popup.style.display = 'none';
        }, 5000);
    }

    // --- AI Daily Summary Generator ---
    function updateAISummary() {
        const now = new Date();
        const todayStr = now.toDateString();

        const todayTasks = todos.filter(t => {
            const createDate = t.createdAt ? new Date(t.createdAt) : new Date(parseInt(t.id));
            const alarmDate = t.alarmTime ? new Date(t.alarmTime) : null;
            return (createDate && createDate.toDateString() === todayStr) || (alarmDate && alarmDate.toDateString() === todayStr);
        });

        const todayCompleted = todayTasks.filter(t => t.completed && t.completedAt && new Date(t.completedAt).toDateString() === todayStr);
        const todayPending = todayTasks.filter(t => !t.completed);
        const todayHighPriority = todayTasks.filter(t => t.priority === 'high');

        const totalTasksCount = todos.length;
        const totalCompletedCount = todos.filter(t => t.completed).length;

        const sessions = pomoState.sessions;
        const focusTime = pomoState.focusTime;

        const overallCompletionRate = totalTasksCount > 0 ? Math.round((totalCompletedCount / totalTasksCount) * 100) : 0;
        const todayProductivityPercentage = todayTasks.length > 0 ? Math.round((todayCompleted.length / todayTasks.length) * 100) : 0;

        let aiFeedback = '';
        if (todayTasks.length === 0) {
            aiFeedback = "You haven't scheduled any tasks for today. Start small and set a goal to kick off your productivity streak!";
        } else if (todayProductivityPercentage === 100) {
            aiFeedback = `Incredible! You completed 100% of today's work. ${focusTime > 0 ? `Your ${focusTime} minutes of focus was highly productive.` : ''} Keep up this phenomenal work!`;
        } else if (todayProductivityPercentage >= 70) {
            aiFeedback = `Excellent progress! You completed ${todayProductivityPercentage}% of today's tasks. ${todayHighPriority.length > 0 ? "Be sure to double-check high-priority tasks first tomorrow." : "Keep this strong momentum going!"}`;
        } else if (todayProductivityPercentage >= 40) {
            aiFeedback = `Solid work. You completed ${todayProductivityPercentage}% of today's tasks. Try using the Pomodoro timer to focus through blocks of pending work tomorrow.`;
        } else {
            aiFeedback = `You've got ${todayPending.length} pending tasks left. Don't worry—tomorrow is a new opportunity to focus on high-priority items. Start with 1 Pomodoro session to break the ice!`;
        }

        const summaryEl = document.getElementById('ai-summary-content');
        if (!summaryEl) return;
        summaryEl.innerHTML = `
            <div class="ai-stats-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 0.8rem;">
                <div class="ai-stat-item" style="background: rgba(0,0,0,0.15); padding: 6px 10px; border-radius: 6px; display: flex; justify-content: space-between;"><span>Today's Work:</span> <strong>${todayCompleted.length}/${todayTasks.length}</strong></div>
                <div class="ai-stat-item" style="background: rgba(0,0,0,0.15); padding: 6px 10px; border-radius: 6px; display: flex; justify-content: space-between;"><span>Completion Rate:</span> <strong>${todayProductivityPercentage}%</strong></div>
                <div class="ai-stat-item" style="background: rgba(0,0,0,0.15); padding: 6px 10px; border-radius: 6px; display: flex; justify-content: space-between;"><span>High Priority:</span> <strong>${todayHighPriority.length}</strong></div>
                <div class="ai-stat-item" style="background: rgba(0,0,0,0.15); padding: 6px 10px; border-radius: 6px; display: flex; justify-content: space-between;"><span>Focus Time:</span> <strong>${focusTime}m (${sessions}s)</strong></div>
            </div>
            <div class="ai-feedback-text" style="background: rgba(255, 255, 255, 0.03); border-left: 3px solid var(--accent-color); padding: 8px 12px; border-radius: 0 8px 8px 0; font-style: italic;">
                "${aiFeedback}"
            </div>
        `;
    }

    // --- Initialization Hooks ---
    initNavigation();
    initPomodoro();
    renderTodos();
    updateDateTime();
    updateDashboard();
    initCalendar();
    
    // Custom initializations
    applyAppearanceSettings();
    initTaskEditor();
    initAlarmTriggerControls();
    initFirebase();
    checkAchievements();

    // Standalone Alarms & Stopwatch initializations
    function initAlarmsView() {
        renderAlarmsList();
        calculateNextAlarmCountdown();
        
        const clearBtn = document.getElementById('clear-alarm-form-btn');
        clearBtn.addEventListener('click', () => {
            document.getElementById('alarm-create-form').reset();
            document.getElementById('edit-alarm-id').value = "";
            selectedDays.clear();
            document.querySelectorAll('.day-select-btn').forEach(btn => btn.classList.remove('active'));
            clearBtn.style.display = 'none';
            document.getElementById('save-alarm-btn').textContent = "Save Alarm";
        });

        document.querySelectorAll('.day-select-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const day = parseInt(btn.dataset.day);
                if (selectedDays.has(day)) {
                    selectedDays.delete(day);
                    btn.classList.remove('active');
                } else {
                    selectedDays.add(day);
                    btn.classList.add('active');
                }
            });
        });

        document.getElementById('alarm-create-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const timeVal = document.getElementById('alarm-time').value;
            const titleVal = document.getElementById('alarm-title').value.trim() || "Wake Up!";
            const soundVal = document.getElementById('alarm-sound').value;
            const vibrateVal = document.getElementById('alarm-vibrate').checked;
            const alarmId = document.getElementById('edit-alarm-id').value;

            if (!timeVal) {
                alert("Please select an alarm time.");
                return;
            }

            const repeatDays = Array.from(selectedDays);

            if (alarmId) {
                standaloneAlarms = standaloneAlarms.map(a => a.id === alarmId ? {
                    ...a,
                    time: timeVal,
                    title: titleVal,
                    repeatDays,
                    sound: soundVal,
                    vibrate: vibrateVal,
                    enabled: true,
                    lastFiredDate: ""
                } : a);
                document.getElementById('edit-alarm-id').value = "";
                document.getElementById('clear-alarm-form-btn').style.display = 'none';
                document.getElementById('save-alarm-btn').textContent = "Save Alarm";
            } else {
                const newAlarm = {
                    id: Date.now().toString(),
                    time: timeVal,
                    title: titleVal,
                    repeatDays,
                    sound: soundVal,
                    vibrate: vibrateVal,
                    enabled: true,
                    lastFiredDate: ""
                };
                standaloneAlarms.push(newAlarm);
            }

            localStorage.setItem('standaloneAlarms', JSON.stringify(standaloneAlarms));
            
            document.getElementById('alarm-create-form').reset();
            selectedDays.clear();
            document.querySelectorAll('.day-select-btn').forEach(btn => btn.classList.remove('active'));

            renderAlarmsList();
            updateDashboard();
        });

        document.getElementById('dismiss-standalone-alarm-btn').addEventListener('click', dismissStandaloneAlarm);
    }

    function initStopwatchView() {
        toggleStopwatchButtons('initial');
        renderStopwatchStats();

        document.getElementById('stopwatch-start').addEventListener('click', startStopwatch);
        document.getElementById('stopwatch-pause').addEventListener('click', pauseStopwatch);
        document.getElementById('stopwatch-resume').addEventListener('click', resumeStopwatch);
        document.getElementById('stopwatch-lap').addEventListener('click', recordLap);
        document.getElementById('stopwatch-stop').addEventListener('click', stopStopwatch);
        document.getElementById('stopwatch-reset').addEventListener('click', resetStopwatch);
    }

    initAlarmsView();
    initStopwatchView();
    
    setInterval(updateDateTime, 1000);
    setInterval(checkAlarms, 1000);
});
