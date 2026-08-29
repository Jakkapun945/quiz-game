# 🎮 Quiz Game — Real-time Quiz System (รองรับผู้เล่นจำนวนมาก)

ระบบเกมตอบคำถาม real-time สไตล์ Kahoot! พัฒนาด้วย **Node.js, Express, Socket.IO, HTML/CSS/JS, และ Supabase** โดยสามารถนำไป Deploy ได้ฟรี 100% บน **Vercel** (Frontend) และ **Render** (Backend)

---

## 🌟 ฟีเจอร์เด่น (Features)

1. **📱 Real-time Gameplay:** คำถามและตัวเลือกส่งตรงไปยังผู้เล่นทุกคนพร้อมกันแบบ Real-time ด้วย Socket.IO
2. **🔐 Host Password Authentication:** ป้องกันคนอื่นสวมรอยเริ่มเกมหรือแก้ไข Quiz
3. **🛡️ Server-side Input Validation:** ตรวจสอบและกรองความปลอดภัยของข้อมูลทุกชนิด (XSS sanitization, length check, option restriction)
4. **🔄 Reconnection Logic:** ผู้เล่นที่เน็ตหลุดหรือกดรีเฟรชหน้าจอ สามารถกลับเข้าห้องเดิมได้ทันทีด้วย Token ใน localStorage
5. **🏥 Render Keep-Alive (Cron Ping):** มีระบบ Cron Ping ตัวเองทุก 14 นาที ป้องกัน Render Free Tier หลับ (Cold start)
6. **⏱️ Anti-Duplicate Answer Guard:** ป้องกันผู้เล่นส่งคำตอบซ้ำในข้อเดียวกัน
7. **📊 Score & Leaderboard System:** คำนวณคะแนนตามความแม่นยำและความเร็วในการตอบ พร้อมแท่นรับรางวัล Top 3 Podium
8. **🎨 Kahoot-style Vibrant UI:** ดีไซน์ด้วยโทนสีสว่างสดใส, Responsive บนทุกอุปกรณ์มือถือ/แท็บเล็ต/คอมพิวเตอร์

---

## 📁 โครงสร้างโปรเจค (Monorepo)

```
quiz-game/
├── .gitignore
├── README.md
│
├── client/                    # ← Vercel Deploy ฝั่งนี้
│   ├── index.html             # หน้าแรก (สร้าง Quiz / เข้าร่วมเล่นเกม)
│   ├── host.html              # หน้าควบคุมของ Host (Lobby, Timer, Leaderboard, Podium)
│   ├── play.html              # หน้าจอสำหรับผู้เล่น (4 ปุ่มสี, Feedback คะแนน, Rank)
│   ├── css/
│   │   └── style.css          # Design system และ CSS Animations
│   └── js/
│       ├── config.js          # สลับ URL ระหว่าง Localhost และ Render
│       ├── host.js            # Socket.IO Handler ฝั่ง Host
│       └── player.js          # Socket.IO Handler ฝั่ง Player (+ Reconnection)
│
└── server/                    # ← Render Deploy ฝั่งนี้
    ├── package.json
    ├── .env.example
    ├── schema.sql             # SQL Script สำหรับ setup Supabase Database
    ├── db.js                  # Supabase Client connection
    ├── validation.js          # Input Validation & Sanitization
    ├── keepAlive.js           # Cron Ping ป้องกัน Cold Start
    └── server.js              # Express + Socket.IO Main Server Logic
```

---

## 🛠️ วิธีการรันบนเครื่อง Local (Local Development)

### 1. รัน Backend Server
```bash
cd server
npm install
npm start
```
 Server จะทำงานที่ `http://localhost:3000`

### 2. เปิด Frontend Client
- เปิดไฟล์ `client/index.html` บน Web Browser (หรือใช้ VS Code Live Server / extension เปิดที่พอร์ต 5500)

---

## ⚡ วิธี Setup Supabase Database

1. ไปที่ [supabase.com](https://supabase.com) แล้วสร้าง Project ใหม่
2. เข้าไปที่เมนู **SQL Editor** ใน Supabase Dashboard
3. คัดลอกคำสั่ง SQL จากไฟล์ `server/schema.sql` วางใน SQL Editor แล้วกด **RUN**
4. ไปที่ **Settings -> API** แล้วคัดลอก `Project URL` และ `anon key` นำไปใส่ใน `.env` ของ `server`

---

## 🚀 ขั้นตอนการ Deploy ขึ้น Production ($0 Cost)

### Step 1: Push Code ขึ้น GitHub
```bash
git init
git add .
git commit -m "Initial commit: Quiz Game App"
git remote add origin https://github.com/YOUR_USERNAME/quiz-game.git
git push -u origin main
```

### Step 2: Deploy Backend บน Render
1. สมัคร/เข้าสู่ระบบ [render.com](https://render.com) แล้วเลือก **New Web Service**
2. เชื่อมต่อ GitHub Repository `quiz-game`
3. ตั้งค่า Service:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. เพิ่ม **Environment Variables**:
   - `SUPABASE_URL` = `(จาก Supabase Settings -> API)`
   - `SUPABASE_ANON_KEY` = `(จาก Supabase Settings -> API)`
   - `CLIENT_URL` = `https://your-app.vercel.app` (URL จาก Vercel)
   - `SELF_URL` = `https://your-service.onrender.com` (URL ของ Render ตัวเองสำหรับ Cron Ping)

### Step 3: Deploy Frontend บน Vercel
1. สมัคร/เข้าสู่ระบบ [vercel.com](https://vercel.com) แล้วเลือก **Add New -> Project**
2. Import GitHub Repository `quiz-game`
3. ตั้งค่า:
   - **Root Directory:** `client`
   - **Framework Preset:** `Other`
   - **Output Directory:** `.`
4. กด **Deploy**

### Step 4: เชื่อมโยง URL
1. แก้ไขไฟล์ `client/js/config.js` ให้ `BACKEND_URL` ชี้ไปที่ Render URL ของคุณ
2. อัปเดต Environment Variable `CLIENT_URL` บน Render ให้เป็น Vercel URL ของคุณ
