// Configuration for Quiz Game Backend URL
const CONFIG = {
    // Automatically detect environment: local vs production Render URL
    BACKEND_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : 'https://quiz-game-43dj.onrender.com'
};
