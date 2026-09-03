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
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// In-memory active sessions
const activeSessions = new Map(); // PIN -> session object

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// In-memory fallback templates if Supabase is not connected
const memoryTemplates = [
    {
        id: 'tmpl-demo-1',
        title: 'แบบสอบถามสีที่ชื่นชอบ',
        description: 'โพลสำรวจความคิดเห็นเรื่องสียอดนิยม',
        time_limit_seconds: 20,
        question_text: 'คุณชอบสีอะไรมากที่สุด?',
        option_a: 'สีแดง 🔴',
        option_b: 'สีฟ้า 🔵',
        option_c: 'สีเหลือง 🟡',
        created_at: new Date().toISOString()
    }
];

// ===== API: Get Quiz Templates =====
app.get('/api/templates', async (req, res) => {
    try {
        if (supabase) {
            const { data, error } = await supabase
                .from('quiz_templates')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return res.json({ success: true, templates: data });
        }
        return res.json({ success: true, templates: memoryTemplates, mode: 'memory' });
    } catch (err) {
        console.error('Error fetching templates:', err.message);
        return res.json({ success: true, templates: memoryTemplates, mode: 'fallback' });
    }
});

// ===== API: Save New Quiz Template =====
app.post('/api/templates', async (req, res) => {
    try {
        const { title, description, time_limit_seconds, question_text, option_a, option_b, option_c } = req.body;

        if (!title || !question_text || !option_a || !option_b || !option_c) {
            return res.status(400).json({ success: false, message: 'กรอกข้อมูลไม่ครบถ้วน' });
        }

        const templateObj = {
            title: title.trim(),
            description: (description || '').trim(),
            time_limit_seconds: parseInt(time_limit_seconds) || 20,
            question_text: question_text.trim(),
            option_a: option_a.trim(),
            option_b: option_b.trim(),
            option_c: option_c.trim()
        };

        if (supabase) {
            const { data, error } = await supabase
                .from('quiz_templates')
                .insert([templateObj])
                .select()
                .single();
            if (error) throw error;
            return res.json({ success: true, template: data, message: 'บันทึก Template ลง Supabase สำเร็จ!' });
        } else {
            const fallbackTmpl = {
                id: 'tmpl-' + Date.now(),
                ...templateObj,
                created_at: new Date().toISOString()
            };
            memoryTemplates.unshift(fallbackTmpl);
            return res.json({ success: true, template: fallbackTmpl, message: 'บันทึก Template สำเร็จ (Demo Mode)' });
        }
    } catch (err) {
        console.error('Error saving template:', err.message);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึก Template' });
    }
});

// ===== API: Delete Quiz Template =====
app.delete('/api/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (supabase) {
            const { error } = await supabase.from('quiz_templates').delete().eq('id', id);
            if (error) throw error;
        } else {
            const index = memoryTemplates.findIndex(t => t.id === id);
            if (index !== -1) memoryTemplates.splice(index, 1);
        }
        return res.json({ success: true, message: 'ลบ Template เรียบร้อยแล้ว' });
    } catch (err) {
        console.error('Error deleting template:', err.message);
        return res.status(500).json({ success: false, message: 'ไม่สามารถลบ Template ได้' });
    }
});

// Helper: Generate unique 6-digit Game PIN
function generateGamePin() {
    let pin;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (activeSessions.has(pin));
    return pin;
}

// Helper: Save session data to Supabase Database
async function persistSessionToSupabase(session) {
    if (!supabase) return;
    try {
        // 1. Insert Quiz
        const { data: quizRow, error: qErr } = await supabase.from('quizzes').insert([{
            title: session.quiz.title,
            description: session.quiz.description || '',
            host_password: session.hostPasswordHash,
            time_limit_seconds: session.quiz.time_limit_seconds || 20
        }]).select().single();
        if (qErr) throw qErr;

        // 2. Insert Question
        const q = session.quiz.question;
        const { data: questionRow, error: qnErr } = await supabase.from('questions').insert([{
            quiz_id: quizRow.id,
            question_text: q.question_text,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c
        }]).select().single();
        if (qnErr) throw qnErr;

        // 3. Insert Game Session
        const { data: sessionRow, error: sErr } = await supabase.from('game_sessions').insert([{
            quiz_id: quizRow.id,
            game_pin: session.pin,
            status: session.status
        }]).select().single();
        if (sErr) throw sErr;

        // Save generated DB IDs to session
        session.dbQuizId = quizRow.id;
        session.dbQuestionId = questionRow.id;
        session.dbSessionId = sessionRow.id;
        console.log(`💾 Persisted Session & Quiz to Supabase. Session ID: ${sessionRow.id}`);
    } catch (err) {
        console.error('⚠️ Supabase Persist Session Error:', err.message);
    }
}

async function persistResultsToSupabase(session) {
    if (!supabase || !session.dbSessionId) return;
    try {
        // 1. Update Game Session Status
        await supabase.from('game_sessions').update({ status: 'FINISHED' }).eq('id', session.dbSessionId);

        // 2. Insert Players & Responses
        for (const player of session.players.values()) {
            const { data: playerRow, error: pErr } = await supabase.from('players').insert([{
                session_id: session.dbSessionId,
                nickname: player.nickname,
                socket_id: player.socketId,
                is_connected: player.isConnected
            }]).select().single();

            if (!pErr && playerRow) {
                const resp = session.responses.get(player.id);
                if (resp) {
                    await supabase.from('responses').insert([{
                        player_id: playerRow.id,
                        question_id: session.dbQuestionId,
                        selected_option: resp.selectedOption,
                        response_time_ms: resp.responseTimeMs
                    }]);
                }
            }
        }
        console.log(`💾 Persisted Players & Responses to Supabase for Session PIN: ${session.pin}`);
    } catch (err) {
        console.error('⚠️ Supabase Persist Results Error:', err.message);
    }
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
            revealedPositions: new Set(), // Track which podium positions have been revealed
            timer: null,
            timeRemaining: 0,
            questionStartTime: null
        };

        activeSessions.set(pin, session);
        socket.join(pin);

        // Async persist to Supabase if available
        persistSessionToSupabase(session);

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

        // Note: Do NOT end the question early when all players respond.
        // Let the countdown timer run naturally down to 0 so results/answers are not shown prematurely.
    });

    // ===== HOST: Skip Timer Early =====
    socket.on('skip_timer', async ({ pin, hostPassword }) => {
        const session = activeSessions.get(pin);
        if (!session || session.status !== 'QUESTION') return;
        if (session.hostSocketId !== socket.id) return;

        const match = await bcrypt.compare(hostPassword || '', session.hostPasswordHash);
        if (!match) return;

        clearInterval(session.timer);
        showResults(session);
    });

    // ===== HOST: Reveal Podium Name =====
    socket.on('reveal_podium', ({ pin, position }) => {
        const session = activeSessions.get(pin);
        if (!session) return;
        if (session.hostSocketId !== socket.id) return;
        if (session.status !== 'RESULTS') return;

        // Validate position (0 = 1st, 1 = 2nd, 2 = 3rd)
        if (typeof position !== 'number' || position < 0 || position > 2) return;
        if (session.revealedPositions.has(position)) return; // Already revealed

        session.revealedPositions.add(position);

        // Get top3 data
        const rankedPlayers = session.responseOrder.map((pid, index) => {
            const player = session.players.get(pid);
            const resp = session.responses.get(pid);
            return {
                rank: index + 1,
                nickname: player ? player.nickname : 'Unknown',
                responseTimeMs: resp.responseTimeMs
            };
        });
        const top3 = rankedPlayers.slice(0, 3);
        const revealed = top3[position];
        if (!revealed) return;

        // Broadcast to all players in the room
        session.players.forEach((player) => {
            if (player.isConnected) {
                io.to(player.socketId).emit('podium_revealed', {
                    position,
                    nickname: revealed.nickname,
                    responseTimeMs: revealed.responseTimeMs,
                    isPlayerTop3: player.nickname === revealed.nickname
                });
            }
        });

        console.log(`🎭 Podium position ${position} revealed: ${revealed.nickname} (PIN: ${pin})`);
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
    // IMPORTANT: Do NOT send nicknames in top3 to players — nicknames are revealed
    // one by one via the 'podium_revealed' event when the Host clicks each position.
    const top3Hidden = top3.map(p => ({
        rank: p.rank,
        responseTimeMs: p.responseTimeMs
        // nickname is intentionally omitted to prevent early reveal
    }));

    session.players.forEach((player) => {
        if (player.isConnected) {
            const myResp = session.responses.get(player.id);
            const myRank = session.responseOrder.indexOf(player.id);

            io.to(player.socketId).emit('show_results_player', {
                top3: top3Hidden,
                statsPercent,
                mySelectedOption: myResp ? myResp.selectedOption : null,
                myResponseTimeMs: myResp ? myResp.responseTimeMs : null,
                myRank: myRank !== -1 ? myRank + 1 : null,
                isTop3: myRank !== -1 && myRank < 3
            });
        }
    });

    console.log(`📊 Results shown for PIN ${session.pin}. Responses: ${totalResponses}/${session.players.size}`);
    
    // Async persist players & responses to Supabase
    persistResultsToSupabase(session);
}

// Initialize KeepAlive
initKeepAlive();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Quiz Game Server running on port ${PORT}`);
    console.log(`🔗 CORS Allowed Origin: ${clientUrl}`);
});
