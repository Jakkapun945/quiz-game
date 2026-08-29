// Sakura Petals Floating Animation Script
document.addEventListener('DOMContentLoaded', () => {
    const container = document.createElement('div');
    container.className = 'sakura-petals-container';
    document.body.appendChild(container);

    const petalCount = 35;
    for (let i = 0; i < petalCount; i++) {
        const petal = document.createElement('div');
        petal.className = 'sakura-petal';
        
        // Randomize sakura petal parameters for realistic natural flow
        const size = Math.random() * 12 + 8; // 8px to 20px
        const left = Math.random() * 100; // 0% to 100% horizontal position
        const fallDuration = Math.random() * 7 + 5; // 5s to 12s fall speed
        const swayDuration = Math.random() * 4 + 2; // 2s to 6s sway duration
        const delay = Math.random() * 10; // staggered start delay
        const opacity = Math.random() * 0.4 + 0.5; // 0.5 to 0.9 opacity

        petal.style.width = `${size}px`;
        petal.style.height = `${size * 1.4}px`;
        petal.style.left = `${left}%`;
        petal.style.opacity = opacity;
        petal.style.animation = `sakuraFall ${fallDuration}s linear infinite, sakuraSway ${swayDuration}s ease-in-out infinite alternate`;
        petal.style.animationDelay = `${delay}s, ${Math.random() * 2}s`;

        container.appendChild(petal);
    }
});
