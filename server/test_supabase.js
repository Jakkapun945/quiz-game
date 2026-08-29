const supabase = require('./db');

async function testConnection() {
    console.log('🔍 Checking Supabase Connection...');
    
    if (!supabase) {
        console.log('❌ Result: Supabase is NOT connected!');
        console.log('📌 Cause: .env file contains placeholder values (your_supabase_project_url_here)');
        console.log('💡 How to fix: Put your real SUPABASE_URL and SUPABASE_ANON_KEY in server/.env file');
        process.exit(1);
    }

    try {
        const { data, error } = await supabase.from('quiz_templates').select('count', { count: 'exact' });
        if (error) {
            console.log('⚠️ Supabase client initialized, but table query failed:', error.message);
            console.log('💡 Tip: Make sure you ran server/schema.sql in Supabase SQL Editor!');
        } else {
            console.log('✅ Result: Connected to Supabase Database successfully!');
            console.log(`📊 Found ${data ? data.length : 0} records in quiz_templates table.`);
        }
    } catch (err) {
        console.error('❌ Connection error:', err.message);
    }
}

testConnection();
