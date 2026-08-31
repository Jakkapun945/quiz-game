const socket = io(CONFIG.BACKEND_URL);

let currentPin = null;
let currentNickname = null;
let playerId = null;
let hasAnswered = false;

function showAlert(msg, type = 'danger') {
    const alertBox = document.getElementById('alertBox');
    alertBox.className = `alert alert-${type}`;
    alertBox.innerText = msg;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 4000);
}

// Initialize Player Session
window.addEventListener('DOMContentLoaded', () => {
    const joinPin = sessionStorage.getItem('join_pin');
    const joinNickname = sessionStorage.getItem('join_nickname');
    const savedPlayerId = localStorage.getItem('player_id');
    const savedPin = localStorage.getItem('player_pin');

    if (joinPin && joinNickname) {
        currentPin = joinPin;
        currentNickname = joinNickname;
        document.getElementById('playerNicknameDisplay').innerText = currentNickname;
        socket.emit('join_game', { pin: currentPin, nickname: currentNickname });
        sessionStorage.removeItem('join_pin');
        sessionStorage.removeItem('join_nickname');
    } else if (savedPlayerId && savedPin) {
        currentPin = savedPin;
        playerId = savedPlayerId;
        socket.emit('reconnect_player', { pin: savedPin, playerId: savedPlayerId });
    } else {
        alert('กรุณากรอก Game PIN และชื่อเล่นจากหน้าแรก');
        window.location.href = 'index.html';
    }
});

// Join Success
socket.on('join_success', (data) => {
    playerId = data.playerId;
    currentPin = data.pin;
    localStorage.setItem('player_id', playerId);
    localStorage.setItem('player_pin', currentPin);
    document.getElementById('quizName').innerText = data.quizTitle;
    document.getElementById('playerNicknameDisplay').innerText = data.nickname;
});

socket.on('join_error', (msg) => {
    alert(msg);
    localStorage.removeItem('player_id');
    localStorage.removeItem('player_pin');
    window.location.href = 'index.html';
});

// Reconnect
socket.on('reconnect_success', (data) => {
    playerId = data.playerId;
    currentNickname = data.nickname;
    document.getElementById('playerNicknameDisplay').innerText = data.nickname;
    showAlert('🔄 เชื่อมต่อห้องเดิมสำเร็จ!', 'success');

    if (data.status === 'QUESTION' && data.questionText) {
        hasAnswered = data.hasResponded;
        showQuestionScreen(data);
        if (hasAnswered) showWaitScreen();
    }
});

socket.on('reconnect_error', (msg) => {
    showAlert(msg);
    localStorage.removeItem('player_id');
    localStorage.removeItem('player_pin');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
});

// Question Received
socket.on('player_question', (data) => {
    hasAnswered = false;
    showQuestionScreen(data);
});

function showQuestionScreen(data) {
    document.getElementById('playerLobby').style.display = 'none';
    document.getElementById('playerAnswerWait').style.display = 'none';
    document.getElementById('playerResultScreen').style.display = 'none';
    document.getElementById('playerQuestion').style.display = 'block';

    document.getElementById('questionPromptDisplay').innerText = data.questionText;
    document.getElementById('textA').innerText = data.options.a;
    document.getElementById('textB').innerText = data.options.b;
    document.getElementById('textC').innerText = data.options.c;
    document.getElementById('playerTimer').innerText = data.timeLimit;

    const btns = document.querySelectorAll('.answer-btn');
    btns.forEach(b => b.classList.remove('disabled'));
}

socket.on('timer_tick', ({ timeRemaining }) => {
    const el = document.getElementById('playerTimer');
    if (el) el.innerText = timeRemaining;
});

// Submit Answer
function sendAnswer(option) {
    if (hasAnswered) return;
    hasAnswered = true;

    const btns = document.querySelectorAll('.answer-btn');
    btns.forEach(b => b.classList.add('disabled'));

    socket.emit('submit_answer', {
        pin: currentPin,
        playerId: playerId,
        selectedOption: option
    });

    showWaitScreen();
}

function showWaitScreen() {
    document.getElementById('playerQuestion').style.display = 'none';
    document.getElementById('playerAnswerWait').style.display = 'block';
}

socket.on('answer_received', ({ rank }) => {
    document.getElementById('myRankWait').innerText = `#${rank}`;
});

socket.on('answer_error', (msg) => showAlert(msg));

// Results: Congratulations + Stats (received by all players)
socket.on('show_results_player', (data) => {
    localStorage.removeItem('player_id');
    localStorage.removeItem('player_pin');

    document.getElementById('playerAnswerWait').style.display = 'none';
    document.getElementById('playerQuestion').style.display = 'none';
    document.getElementById('playerLobby').style.display = 'none';
    document.getElementById('playerResultScreen').style.display = 'block';

    // Store data for reveal
    window._playerResultData = data;

    // Render Podium with hidden names
    const podium = document.getElementById('playerPodium');
    podium.innerHTML = '';

    const medals = ['👑 1st', '🥈 2nd', '🥉 3rd'];
    const placeClasses = ['place-1', 'place-2', 'place-3'];

    // Podium display order: 2nd, 1st, 3rd
    const displayOrder = [1, 0, 2];
    displayOrder.forEach(i => {
        if (i < data.top3.length) {
            const div = document.createElement('div');
            div.className = `podium-place ${placeClasses[i]}`;
            div.id = `player-podium-pos-${i}`;
            div.innerHTML = `
                <div class="podium-crown">${medals[i]}</div>
                <div class="podium-name podium-name-hidden">???</div>
                <div class="podium-score podium-score-hidden">--</div>
            `;
            podium.appendChild(div);
        }
    });

    // Top 3 list — also hidden initially
    const top3Container = document.getElementById('playerTop3');
    top3Container.innerHTML = '';
    const listMedals = ['🥇', '🥈', '🥉'];
    data.top3.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'leaderboard-item';
        div.id = `player-top3-item-${i}`;
        div.innerHTML = `
            <span>${listMedals[i]} <span class="top3-name" style="filter: blur(6px); color: rgba(255,255,255,0.3);">???</span></span>
            <span class="top3-time" style="opacity: 0;">--</span>
        `;
        top3Container.appendChild(div);
    });

    // Don't show personal banner yet — wait for reveals
    document.getElementById('personalBanner').style.display = 'none';

    // Stats Bars (show immediately)
    const statsContainer = document.getElementById('playerStatsContainer');
    statsContainer.innerHTML = '';
    const colors = { a: '#e21b3c', b: '#1368ce', c: '#ffa602' };
    const icons = { a: '🔴', b: '🔵', c: '🟡' };

    ['a', 'b', 'c'].forEach(key => {
        const stat = data.statsPercent[key];
        const isMyChoice = data.mySelectedOption === key;
        const bar = document.createElement('div');
        bar.style.cssText = 'margin-bottom: 14px;';
        bar.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-weight: 700;">
                <span>${icons[key]} ${stat.label} ${isMyChoice ? '← คุณเลือก' : ''}</span>
                <span>${stat.percent}%</span>
            </div>
            <div style="background: rgba(255,255,255,0.1); border-radius: 8px; height: 24px; overflow: hidden;">
                <div style="background: ${colors[key]}; height: 100%; width: ${stat.percent}%; border-radius: 8px; transition: width 1s ease-out;"></div>
            </div>
        `;
        statsContainer.appendChild(bar);
    });
});

// Podium Revealed — Host clicked a podium position
socket.on('podium_revealed', (data) => {
    const { position, nickname, responseTimeMs, isPlayerTop3 } = data;
    const timeFormatted = (responseTimeMs / 1000).toFixed(2);

    // Update Podium bar
    const podiumDiv = document.getElementById(`player-podium-pos-${position}`);
    if (podiumDiv) {
        podiumDiv.classList.add('podium-revealed');
        const nameEl = podiumDiv.querySelector('.podium-name');
        nameEl.classList.remove('podium-name-hidden');
        nameEl.innerText = nickname;

        const scoreEl = podiumDiv.querySelector('.podium-score');
        scoreEl.classList.remove('podium-score-hidden');
        scoreEl.innerText = `${timeFormatted} วินาที`;
    }

    // Update Top 3 list item
    const listItem = document.getElementById(`player-top3-item-${position}`);
    if (listItem) {
        const nameSpan = listItem.querySelector('.top3-name');
        nameSpan.style.filter = 'none';
        nameSpan.style.color = '';
        nameSpan.innerText = nickname;
        nameSpan.style.animation = 'revealName 0.8s ease-out forwards';

        const timeSpan = listItem.querySelector('.top3-time');
        timeSpan.style.opacity = '1';
        timeSpan.innerText = `${timeFormatted} วินาที`;
        timeSpan.style.animation = 'revealName 0.8s ease-out forwards';
    }

    // Show personal banner if this reveal is the current player
    if (isPlayerTop3) {
        document.getElementById('personalBanner').style.display = 'block';
    }
});
