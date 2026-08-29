const supabase = require('./db');

async function testFullSave() {
    console.log('🧪 Starting Full Supabase Persistence Test...');

    if (!supabase) {
        console.error('❌ Supabase is not configured in .env!');
        return;
    }

    try {
        // 1. Insert Quiz
        console.log('1️⃣ Inserting Test Quiz...');
        const { data: quiz, error: quizErr } = await supabase.from('quizzes').insert([{
            title: '🎮 แบบทดสอบจำลอง (Test Quiz)',
            description: 'ทดสอบบันทึกข้อมูลลง Supabase อัตโนมัติ',
            host_password: 'test_hashed_password',
            time_limit_seconds: 20
        }]).select().single();

        if (quizErr) throw quizErr;
        console.log(`✅ Quiz inserted successfully! ID: ${quiz.id}`);

        // 2. Insert Question
        console.log('2️⃣ Inserting Test Question...');
        const { data: question, error: qErr } = await supabase.from('questions').insert([{
            quiz_id: quiz.id,
            question_text: 'ระบบ Supabase เชื่อมต่อสำเร็จหรือไม่?',
            option_a: 'สำเร็จ 100% 🟢',
            option_b: 'กำลังตรวจสอบ 🟡',
            option_c: 'ยังไม่สำเร็จ 🔴',
            order_number: 1
        }]).select().single();

        if (qErr) throw qErr;
        console.log(`✅ Question inserted successfully! ID: ${question.id}`);

        // 3. Insert Game Session
        console.log('3️⃣ Inserting Test Game Session...');
        const testPin = Math.floor(100000 + Math.random() * 900000).toString();
        const { data: session, error: sessErr } = await supabase.from('game_sessions').insert([{
            quiz_id: quiz.id,
            game_pin: testPin,
            status: 'FINISHED'
        }]).select().single();

        if (sessErr) throw sessErr;
        console.log(`✅ Game Session inserted successfully! PIN: ${session.game_pin}`);

        // 4. Insert Player
        console.log('4️⃣ Inserting Test Player...');
        const { data: player, error: playErr } = await supabase.from('players').insert([{
            session_id: session.id,
            nickname: 'Pond (Player 1)',
            socket_id: 'test-socket-id-123',
            is_connected: true
        }]).select().single();

        if (playErr) throw playErr;
        console.log(`✅ Player inserted successfully! Nickname: ${player.nickname}`);

        // 5. Insert Response
        console.log('5️⃣ Inserting Test Response...');
        const { data: response, error: respErr } = await supabase.from('responses').insert([{
            player_id: player.id,
            question_id: question.id,
            selected_option: 'a',
            response_time_ms: 1420
        }]).select().single();

        if (respErr) throw respErr;
        console.log(`✅ Response inserted successfully! Option: ${response.selected_option} (${response.response_time_ms}ms)`);

        // 6. Insert Quiz Template
        console.log('6️⃣ Inserting Quiz Template...');
        const { data: template, error: tmplErr } = await supabase.from('quiz_templates').insert([{
            title: '🌸 Template: สีที่คุณชื่นชอบ',
            description: 'เทมเพลตสำหรับทดสอบความเร็ว',
            time_limit_seconds: 15,
            question_text: 'คุณชอบบรรยากาศแบบไหนมากที่สุด?',
            option_a: 'สวนซากุระ 🌸',
            option_b: 'ริมชายหาด 🏖️',
            option_c: 'ยอดดอย ⛰️'
        }]).select().single();

        if (tmplErr) throw tmplErr;
        console.log(`✅ Template inserted successfully! Title: ${template.title}`);

        console.log('\n🎉 ALL TABLES VERIFIED AND SAVED SUCCESSFULLY IN SUPABASE!');
    } catch (err) {
        console.error('❌ Supabase Save Error:', err.message);
    }
}

testFullSave();
