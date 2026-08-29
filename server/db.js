const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey && supabaseUrl !== 'https://your-supabase-project.supabase.co') {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('⚡ Connected to Supabase Database successfully.');
    } catch (err) {
        console.error('⚠️ Failed to initialize Supabase client:', err.message);
    }
} else {
    console.log('ℹ️ Supabase environment variables not set. Server running with fallback memory storage for demo.');
}

module.exports = supabase;
