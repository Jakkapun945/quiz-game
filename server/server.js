const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const supabase = require('./db');
const { 
    validateNickname, 
    validateOption, 
    validateQuizTitle, 
    validatePassword,
    validateGamePin,
    sanitizeInput 
} = require('./validation');
const initKeepAlive = require('./keepAlive');

const app = express();
const server = http.createServer(app);

const clientUrl = process.env.CLIENT_URL || '*';
app.use(cors({ origin: clientUrl }));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: clientUrl,
        methods: ['GET', 'POST']
    }
});

// In-memory active sessions
const activeSessions = new Map(); // PIN -> session object

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper: Generate unique 6-digit Game PIN
function generateGamePin() {
    let pin;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (activeSessions.has(pin));
    return pin;
}

// Socket.IO Game Logic
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // ===== HOST: Create Session =====
    socket.on('create_session', async (data) => {
        const { quizData, hostPassword } = data;

        if (!quizData || !quizData.title || !quizData.question) {
            return socket.emit('error_msg', 'ข้อมูลไม่สมบูรณ์');
        }

        const passVal = validatePassword(hostPassword);
        if (!passVal.valid) return socket.emit('error_msg', passVal.message);

        const pin = generateGamePin();
        const session = {
            pin,
            hostSocketId: socket.id,
            hostPasswordHash: await bcrypt.hash(passVal.value, 10),
            quiz: quizData,
            status: 'LOBBY',
            players: new Map(),         // playerId -> playerObj
            responses: new Map(),       // playerId -> { selectedOption, responseTimeMs }
            responseOrder: [],          // Array of playerIds in order of response
            timer: null,
            timeRemaining: 0,
            questionStartTime: null
        };

        activeSessions.set(pin, session);
        socket.join(pin);

        socket.emit('session_created', {
            pin,
            quizTitle: quizData.title,
            timeLimit: quizData.time_limit_seconds || 20
        });

        console.log(`🎮 Session Created. PIN: ${pin} | Title: ${quizData.title}`);
    });

    // ===== HOST: Start Game =====
    socket.on('start_game', async ({ pin, hostPassword }) => {
        const session = activeSessions.get(pin);
        if (!session) return socket.emit('error_msg', 'ไม่พบห้องเกมนี้');
        if (session.hostSocketId !== socket.id) return socket.emit('error_msg', 'คุณไม่ใช่ Host ของห้องนี้');

        const match = await bcrypt.compare(hostPassword || '', session.hostPasswordHash);
        if (!match) return socket.emit('error_msg', 'รหัสผ่าน Host ไม่ถูกต้อง');

        session.status = 'QUESTION';
        session.responses = new Map();
        session.responseOrder = [];
        session.questionStartTime = Date.now();

        const q = session.quiz.question;
        const timeLimit = session.quiz.time_limit_seconds || 20;
        session.timeRemaining = timeLimit;

        io.to(pin).emit('game_started');

        // Send question to Host
        io.to(session.hostSocketId).emit('host_question', {
            questionText: q.question_text,
            options: {
                a: q.option_a,
                b: q.option_b,
                c: q.option_c
            },
            timeLimit,
            totalPlayers: session.players.size
        });

        // Send question to all Players
        session.players.forEach((player) => {
            if (player.isConnected) {
                io.to(player.socketId).emit('player_question', {
                    questionText: q.question_text,
                    options: {
                        a: q.option_a,
                        b: q.option_b,
                        c: q.option_c
                    },
                    timeLimit
                });
            }
        });

        // Countdown timer
        clearInterval(session.timer);
        session.timer = setInterval(() => {
            session.timeRemaining--;
            io.to(pin).emit('timer_tick', { timeRemaining: session.timeRemaining });

            if (session.timeRemaining <= 0) {
                clearInterval(session.timer);
                showResults(session);
            }
        }, 1000);
    });

    // ===== PLAYER: Join Game =====
    socket.on('join_game', ({ pin, nickname }) => {
        const pinVal = validateGamePin(pin);
        if (!pinVal.valid) return socket.emit('join_error', pinVal.message);

        const session = activeSessions.get(pinVal.value);
        if (!session) return socket.emit('join_error', 'ไม่พบ Game PIN นี้');
        if (session.status !== 'LOBBY') {
            return socket.emit('join_error', 'เกมกำลังดำเนินอยู่ ไม่สามารถเข้าร่วมได้');
        }

        const nickVal = validateNickname(nickname);
        if (!nickVal.valid) return socket.emit('join_error', nickVal.message);

        // Check duplicate nickname
        for (const p of session.players.values()) {
            if (p.nickname.toLowerCase() === nickVal.value.toLowerCase() && p.isConnected) {
                return socket.emit('join_error', 'ชื่อนี้มีผู้ใช้อื่นในห้องแล้ว');
            }
        }

        const playerId = require('crypto').randomUUID();
        const player = {
            id: playerId,
            nickname: nickVal.value,
            socketId: socket.id,
            isConnected: true
        };

        session.players.set(playerId, player);
        socket.join(pinVal.value);

        socket.emit('join_success', {
            playerId,
            nickname: nickVal.value,
            pin: pinVal.value,
            quizTitle: session.quiz.title
        });

        updateLobbyPlayers(session);
        console.log(`👤 ${nickVal.value} joined PIN ${pinVal.value}`);
    });

    // ===== PLAYER: Reconnect =====
    socket.on('reconnect_player', ({ pin, playerId }) => {
        const session = activeSessions.get(pin);
        if (!session) return socket.emit('reconnect_error', 'ห้องเกมสิ้นสุดลงแล้ว');

        const player = session.players.get(playerId);
        if (!player) return socket.emit('reconnect_error', 'ไม่พบข้อมูลผู้เล่นเดิม');

        player.socketId = socket.id;
        player.isConnected = true;
        socket.join(pin);

        console.log(`🔄 ${player.nickname} reconnected to PIN ${pin}`);

        const hasResponded = session.responses.has(playerId);

        socket.emit('reconnect_success', {
            playerId: player.id,
            nickname: player.nickname,
            status: session.status,
            hasResponded,
            timeRemaining: session.timeRemaining,
            questionText: session.status === 'QUESTION' ? session.quiz.question.question_text : null,
            options: session.status === 'QUESTION' ? {
                a: session.quiz.question.option_a,
                b: session.quiz.question.option_b,
                c: session.quiz.question.option_c
            } : null
        });

        updateLobbyPlayers(session);
    });

    // ===== PLAYER: Submit Response (no correct/wrong, just collect data) =====
    socket.on('submit_answer', ({ pin, playerId, selectedOption }) => {
        const session = activeSessions.get(pin);
        if (!session || session.status !== 'QUESTION') return;

        const optVal = validateOption(selectedOption);
        if (!optVal.valid) return socket.emit('error_msg', optVal.message);

        const player = session.players.get(playerId);
        if (!player) return socket.emit('error_msg', 'ผู้เล่นไม่ถูกต้อง');

        // Anti-duplicate: already responded?
        if (session.responses.has(playerId)) {
            return socket.emit('answer_error', 'คุณตอบคำถามข้อนี้ไปแล้ว');
        }

        const responseTimeMs = Date.now() - session.questionStartTime;

        session.responses.set(playerId, {
            selectedOption: optVal.value,
            responseTimeMs
        });
        session.responseOrder.push(playerId);

        // Ack to the player
        const rank = session.responseOrder.length;
        socket.emit('answer_received', {
            rank,
            responseTimeMs
        });

        // Notify Host of progress
        io.to(session.hostSocketId).emit('answer_submitted', {
            answeredCount: session.responses.size,
            totalPlayers: session.players.size
        });

        // If all connected players have responded, show results early
        const activeCount = Array.from(session.players.values()).filter(p => p.isConnected).length;
        if (session.responses.size >= activeCount) {
            clearInterval(session.timer);
            showResults(session);
        }
    });

    // ===== Disconnect =====
    socket.on('disconnect', () => {
        console.log(`❌ Disconnected: ${socket.id}`);
        for (const session of activeSessions.values()) {
            if (session.hostSocketId === socket.id) {
                clearInterval(session.timer);
                io.to(session.pin).emit('host_disconnected');
                activeSessions.delete(session.pin);
                console.log(`🗑️ Session ${session.pin} removed (Host disconnected)`);
            } else {
                for (const player of session.players.values()) {
                    if (player.socketId === socket.id) {
                        player.isConnected = false;
                        console.log(`⚠️ ${player.nickname} offline in PIN ${session.pin}`);
                        updateLobbyPlayers(session);
                        break;
                    }
                }
            }
        }
    });
});

// === HELPER: Broadcast Lobby Players ===
function updateLobbyPlayers(session) {
    const playerList = Array.from(session.players.values()).map(p => ({
        id: p.id,
        nickname: p.nickname,
        isConnected: p.isConnected
    }));

    io.to(session.pin).emit('lobby_update', {
        players: playerList,
        count: playerList.filter(p => p.isConnected).length
    });
}

// === HELPER: Show Results (Fastest 3 + Stats %) ===
function showResults(session) {
    session.status = 'RESULTS';

    const q = session.quiz.question;

    // Build ranked list by response speed
    const rankedPlayers = session.responseOrder.map((pid, index) => {
        const player = session.players.get(pid);
        const resp = session.responses.get(pid);
        return {
            rank: index + 1,
            playerId: pid,
            nickname: player ? player.nickname : 'Unknown',
            selectedOption: resp.selectedOption,
            responseTimeMs: resp.responseTimeMs
        };
    });

    // Top 3 fastest
    const top3 = rankedPlayers.slice(0, 3);

    // Calculate statistics: % for each option
    const totalResponses = session.responses.size;
    const stats = { a: 0, b: 0, c: 0 };
    session.responses.forEach((resp) => {
        if (stats[resp.selectedOption] !== undefined) {
            stats[resp.selectedOption]++;
        }
    });

    const statsPercent = {
        a: { count: stats.a, percent: totalResponses > 0 ? Math.round((stats.a / totalResponses) * 100) : 0, label: q.option_a },
        b: { count: stats.b, percent: totalResponses > 0 ? Math.round((stats.b / totalResponses) * 100) : 0, label: q.option_b },
        c: { count: stats.c, percent: totalResponses > 0 ? Math.round((stats.c / totalResponses) * 100) : 0, label: q.option_c }
    };

    const resultsPayload = {
        top3,
        statsPercent,
        totalResponses,
        totalPlayers: session.players.size,
        allResponses: rankedPlayers
    };

    // Send to Host (full data)
    io.to(session.hostSocketId).emit('show_results', resultsPayload);

    // Send to all Players (congratulations for top 3 + their own result)
    session.players.forEach((player) => {
        if (player.isConnected) {
            const myResp = session.responses.get(player.id);
            const myRank = session.responseOrder.indexOf(player.id);

            io.to(player.socketId).emit('show_results_player', {
                top3,
                statsPercent,
                mySelectedOption: myResp ? myResp.selectedOption : null,
                myResponseTimeMs: myResp ? myResp.responseTimeMs : null,
                myRank: myRank !== -1 ? myRank + 1 : null,
                isTop3: myRank !== -1 && myRank < 3
            });
        }
    });

    console.log(`📊 Results shown for PIN ${session.pin}. Responses: ${totalResponses}/${session.players.size}`);
}

// Initialize KeepAlive
initKeepAlive();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Quiz Game Server running on port ${PORT}`);
    console.log(`🔗 CORS Allowed Origin: ${clientUrl}`);
});
