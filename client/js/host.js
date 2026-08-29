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
