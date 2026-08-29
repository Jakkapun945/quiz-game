-- ⚡ Supabase SQL Schema for Quiz Game (Poll/Survey Mode)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Quizzes Table (ตั้งค่าหัวข้อ Poll)
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    host_password TEXT NOT NULL,
    time_limit_seconds INT DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Questions Table (คำถาม 1 ข้อ, 3 ตัวเลือก, ไม่มีคำตอบถูก/ผิด)
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    order_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Game Sessions Table
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
    game_pin VARCHAR(6) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'LOBBY',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Players Table
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    socket_id VARCHAR(100),
    is_connected BOOLEAN DEFAULT true,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Responses Table (เก็บข้อมูลคำตอบ + เวลาที่ใช้ตอบ)
CREATE TABLE IF NOT EXISTS responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    selected_option VARCHAR(1) NOT NULL,
    response_time_ms INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Quiz Templates Table (สำหรับบันทึก Template Quiz ที่สร้างเสร็จแล้วเพื่อนำมาใช้ซ้ำ)
CREATE TABLE IF NOT EXISTS quiz_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    time_limit_seconds INT DEFAULT 20,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Disable Row Level Security (RLS) เพื่อให้เซิร์ฟเวอร์และ Anon Key สามารถ Insert/Select ข้อมูลเกมได้
ALTER TABLE quizzes DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_templates DISABLE ROW LEVEL SECURITY;


