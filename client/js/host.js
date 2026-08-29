const socket = io(CONFIG.BACKEND_URL);

let currentPin = null;
let hostPassword = null;

function showAlert(msg, type = 'danger') {
    const alertBox = document.getElementById('alertBox');
    alertBox.className = `alert alert-${type}`;
    alertBox.innerText = msg;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 4000);
}

// Initialize Host Session
window.addEventListener('DOMContentLoaded', () => {
    const pendingQuizRaw = sessionStorage.getItem('pending_quiz');
    hostPassword = sessionStorage.getItem('host_password');

    if (!pendingQuizRaw || !hostPassword) {
        alert('ไม่พบข้อมูล กรุณาสร้างห้องจากหน้าหลักก่อน');
        window.location.href = 'index.html';
        return;
    }

    const currentQuiz = JSON.parse(pendingQuizRaw);
    document.getElementById('quizTitleDisplay').innerText = currentQuiz.title;

    socket.emit('create_session', {
        quizData: currentQuiz,
        hostPassword: hostPassword
    });
});

// Session Created
socket.on('session_created', ({ pin }) => {
    currentPin = pin;
    document.getElementById('pinDisplay').innerText = pin;
});

// Lobby Update
socket.on('lobby_update', ({ players, count }) => {
    document.getElementById('playerCount').innerText = `ผู้เล่นเข้าร่วมแล้ว: ${count} คน`;
    const container = document.getElementById('playersGrid');
    container.innerHTML = '';
    players.forEach(p => {
        const card = document.createElement('div');
        card.className = `player-card ${p.isConnected ? '' : 'offline'}`;
        card.innerText = `${p.nickname} ${p.isConnected ? '' : '(หลุด)'}`;
        container.appendChild(card);
    });
});

socket.on('error_msg', (msg) => showAlert(msg));

// Start Game
function startGame() {
    if (!currentPin) return;
    socket.emit('start_game', { pin: currentPin, hostPassword });
}

// Host Question
socket.on('host_question', (data) => {
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('questionScreen').style.display = 'block';

    document.getElementById('questionTextDisplay').innerText = data.questionText;
    document.getElementById('optA').innerText = data.options.a;
    document.getElementById('optB').innerText = data.options.b;
    document.getElementById('optC').innerText = data.options.c;
    document.getElementById('hostTimer').innerText = data.timeLimit;
    document.getElementById('answersReceivedBadge').innerText = `ตอบแล้ว 0 / ${data.totalPlayers} คน`;
});

socket.on('timer_tick', ({ timeRemaining }) => {
    const el = document.getElementById('hostTimer');
    if (el) el.innerText = timeRemaining;
});

socket.on('answer_submitted', ({ answeredCount, totalPlayers }) => {
    document.getElementById('answersReceivedBadge').innerText = `ตอบแล้ว ${answeredCount} / ${totalPlayers} คน`;
});

// Show Results (Fastest 3 + Stats %)
socket.on('show_results', (data) => {
    document.getElementById('questionScreen').style.display = 'none';
    document.getElementById('resultsScreen').style.display = 'block';

    // Podium: Top 3 fastest responders
    const podium = document.getElementById('podium');
    podium.innerHTML = '';

    const medals = ['👑 1st', '🥈 2nd', '🥉 3rd'];
    const placeClasses = ['place-1', 'place-2', 'place-3'];

    // Podium display order: 2nd, 1st, 3rd
    const displayOrder = [1, 0, 2];
    displayOrder.forEach(i => {
        const p = data.top3[i];
        if (p) {
            const div = document.createElement('div');
            div.className = `podium-place ${placeClasses[i]}`;
            const timeFormatted = (p.responseTimeMs / 1000).toFixed(2);
            div.innerHTML = `
                <div class="podium-crown">${medals[i]}</div>
                <div class="podium-name">${p.nickname}</div>
                <div class="podium-score">${timeFormatted} วินาที</div>
            `;
            podium.appendChild(div);
        }
    });

    // Stats Bars
    const statsContainer = document.getElementById('statsContainer');
    statsContainer.innerHTML = '';
    const colors = { a: '#e21b3c', b: '#1368ce', c: '#ffa602' };
    const icons = { a: '▲', b: '◆', c: '●' };

    ['a', 'b', 'c'].forEach(key => {
        const stat = data.statsPercent[key];
        const bar = document.createElement('div');
        bar.style.cssText = 'margin-bottom: 16px;';
        bar.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: 700; font-size: 1.1rem;">
                <span>${icons[key]} ${stat.label}</span>
                <span>${stat.percent}% (${stat.count} คน)</span>
            </div>
            <div style="background: rgba(255,255,255,0.1); border-radius: 10px; height: 30px; overflow: hidden;">
                <div style="background: ${colors[key]}; height: 100%; width: ${stat.percent}%; border-radius: 10px; transition: width 1s ease-out;"></div>
            </div>
        `;
        statsContainer.appendChild(bar);
    });

    document.getElementById('totalResponsesText').innerText = data.totalResponses;
    document.getElementById('totalPlayersText').innerText = data.totalPlayers;

    // Full response list
    const list = document.getElementById('responseList');
    list.innerHTML = '';
    data.allResponses.forEach(r => {
        const li = document.createElement('li');
        li.className = 'leaderboard-item';
        const timeFormatted = (r.responseTimeMs / 1000).toFixed(2);
        const optionLabels = { a: '🔴 A', b: '🔵 B', c: '🟡 C' };
        li.innerHTML = `
            <span>#${r.rank} ${r.nickname}</span>
            <span>${optionLabels[r.selectedOption] || r.selectedOption} — ${timeFormatted}s</span>
        `;
        list.appendChild(li);
    });
});

async function saveAsTemplate() {
    const pendingQuizRaw = sessionStorage.getItem('pending_quiz');
    if (!pendingQuizRaw) {
        return showAlert('ไม่พบข้อมูล Quiz ที่จะบันทึก');
    }

    const currentQuiz = JSON.parse(pendingQuizRaw);
    const q = currentQuiz.question;

    const payload = {
        title: currentQuiz.title,
        description: currentQuiz.description || '',
        time_limit_seconds: currentQuiz.time_limit_seconds || 20,
        question_text: q.question_text,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c
    };

    const saveBtn = document.getElementById('saveTemplateBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = '⏳ กำลังบันทึก...';
    }

    try {
        const res = await fetch(`${CONFIG.BACKEND_URL}/api/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        // Also save to localStorage as local fallback
        const localTemplates = JSON.parse(localStorage.getItem('quiz_templates') || '[]');
        const newLocal = { id: 'tmpl-' + Date.now(), ...payload, created_at: new Date().toISOString() };
        localTemplates.unshift(newLocal);
        localStorage.setItem('quiz_templates', JSON.stringify(localTemplates));

        if (saveBtn) {
            saveBtn.innerText = '✅ บันทึกเป็น Template เรียบร้อย!';
        }
        showAlert(data.message || 'บันทึก Template สำเร็จ!', 'success');
    } catch (err) {
        console.error('Error saving template:', err);
        // Save to localStorage as fallback
        const localTemplates = JSON.parse(localStorage.getItem('quiz_templates') || '[]');
        const newLocal = { id: 'tmpl-' + Date.now(), ...payload, created_at: new Date().toISOString() };
        localTemplates.unshift(newLocal);
        localStorage.setItem('quiz_templates', JSON.stringify(localTemplates));

        if (saveBtn) {
            saveBtn.innerText = '✅ บันทึกเรียบร้อย (เครื่องส่วนตัว)';
        }
        showAlert('บันทึก Template ไว้ในเบราว์เซอร์เรียบร้อยแล้ว!', 'success');
    }
}

