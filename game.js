/**
 * The Cursed Crucible - Main Game Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startScreen = document.getElementById('startScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const victoryScreen = document.getElementById('victoryScreen');

    const startBtn = document.getElementById('startBtn');
    const reigniteBtn = document.getElementById('reigniteBtn');
    const restartBtn = document.getElementById('restartBtn');
    const continueBtn = document.getElementById('continueBtn');
    const victoryRestartBtn = document.getElementById('victoryRestartBtn');

    const currentScoreEl = document.getElementById('currentScore');
    const highScoreEl = document.getElementById('highScore');
    const finalScoreEl = document.getElementById('finalScore');
    const finalHighScoreEl = document.getElementById('finalHighScore');
    const victoryScoreEl = document.getElementById('victoryScore');

    const scoreCard = document.getElementById('scoreCard');
    const highScoreCard = document.getElementById('highScoreCard');
    const gameViewport = document.getElementById('gameViewport');
    const newBestBadge = document.getElementById('newBestBadge');
    const musicToggleBtn = document.getElementById('musicToggleBtn');
    const soundToggleBtn = document.getElementById('soundToggleBtn');
    const evolutionDrawer = document.getElementById('evolutionDrawer');
    const drawerHandle = document.getElementById('drawerHandle');
    const previewItemContainer = document.getElementById('previewItemContainer');
    const comboDisplay = document.getElementById('comboDisplay');
    const comboCountEl = document.getElementById('comboCount');
    const warningFlash = document.getElementById('warningFlash');
    const mergeFlash = document.getElementById('mergeFlash');

    let currentScore = 0;
    let highScore = parseInt(localStorage.getItem('cursed_crucible_highscore') || '0', 10);
    let physics = null;
    let isNewHighScore = false;
    let comboCount = 0;
    let comboTimer = null;
    const COMBO_WINDOW_MS = 1800;

    highScoreEl.textContent = highScore;

    function startGame() {
        if (window.gameAudio) window.gameAudio.resume();

        startScreen.classList.remove('active');
        gameOverScreen.classList.remove('active');
        victoryScreen.classList.remove('active');

        currentScore = 0;
        currentScoreEl.textContent = '0';
        isNewHighScore = false;
        comboCount = 0;
        hideCombo();
        scoreCard.classList.remove('pop-effect');
        warningFlash.classList.remove('active');

        if (physics) {
            physics.resetWorld();
        } else {
            physics = new window.CruciblePhysics('canvasContainer', {
                onScore: (pts, mergeX, mergeY, tierColor, tierLabel) => addScore(pts, mergeX, mergeY, tierColor, tierLabel),
                onGameOver: () => triggerGameOver(),
                triggerShake: () => triggerScreenShake(),
                onNextIngredientRoll: (nextTier) => updateNextIngredientPreview(nextTier),
                onWarningStateChange: (isWarning) => updateWarningFlash(isWarning),
                onMergeFlash: (normX, normY) => triggerMergeFlash(normX, normY),
                onAscension: () => triggerVictory()
            });
            setupInputs();
        }
    }

    function setupInputs() {
        const canvas = physics.canvas;
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            physics.mouseX = ((e.clientX - rect.left) / rect.width) * physics.width;
        });
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                const rect = canvas.getBoundingClientRect();
                physics.mouseX = ((e.touches[0].clientX - rect.left) / rect.width) * physics.width;
            }
        }, { passive: true });
        canvas.addEventListener('click', () => physics.dropItem());
        canvas.addEventListener('touchend', () => physics.dropItem());
    }

    function addScore(points, mergeX, mergeY, tierColor, tierLabel) {
        comboCount++;
        clearTimeout(comboTimer);
        comboTimer = setTimeout(() => {
            comboCount = 0;
            hideCombo();
        }, COMBO_WINDOW_MS);

        let multiplier = 1;
        if (comboCount >= 5) multiplier = 3;
        else if (comboCount >= 3) multiplier = 2;
        else if (comboCount >= 2) multiplier = 1.5;

        const finalPoints = Math.round(points * multiplier);
        currentScore += finalPoints;
        currentScoreEl.textContent = currentScore;

        if (comboCount >= 2) showCombo(comboCount);

        scoreCard.classList.remove('pop-effect');
        void scoreCard.offsetWidth;
        scoreCard.classList.add('pop-effect');

        if (mergeX !== undefined && mergeY !== undefined) {
            spawnScorePopup(finalPoints, mergeX, mergeY, multiplier > 1);
            if (tierLabel) spawnTierNamePopup(tierLabel, mergeX, mergeY, tierColor);
        }

        if (currentScore > highScore) {
            highScore = currentScore;
            highScoreEl.textContent = highScore;
            localStorage.setItem('cursed_crucible_highscore', highScore.toString());
            isNewHighScore = true;
            highScoreCard.classList.add('pop-effect');
            setTimeout(() => highScoreCard.classList.remove('pop-effect'), 600);
        }
    }

    function spawnScorePopup(points, worldX, worldY, isCombo) {
        const rect = physics.canvas.getBoundingClientRect();
        const viewport = gameViewport.getBoundingClientRect();
        const screenX = rect.left - viewport.left + (worldX / physics.width) * rect.width;
        const screenY = rect.top - viewport.top + (worldY / physics.height) * rect.height;

        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = `+${points}`;

        if (isCombo) {
            popup.style.fontSize = '20px';
            popup.style.color = '#ff8c00';
            popup.style.textShadow = '0 0 12px rgba(255, 140, 0, 0.8), 0 2px 4px rgba(0, 0, 0, 0.8)';
        }

        popup.style.left = `${screenX}px`;
        popup.style.top = `${screenY}px`;
        popup.style.transform = 'translateX(-50%)';

        gameViewport.appendChild(popup);
        setTimeout(() => popup.remove(), 1200);
    }

    function spawnTierNamePopup(tierLabel, worldX, worldY, tierColor) {
        const rect = physics.canvas.getBoundingClientRect();
        const viewport = gameViewport.getBoundingClientRect();
        const screenX = rect.left - viewport.left + (worldX / physics.width) * rect.width;
        const screenY = rect.top - viewport.top + (worldY / physics.height) * rect.height + 20;

        const popup = document.createElement('div');
        popup.className = 'tier-name-popup';
        popup.textContent = tierLabel;
        popup.style.color = tierColor || '#c77dff';
        popup.style.left = `${screenX}px`;
        popup.style.top = `${screenY}px`;
        popup.style.transform = 'translateX(-50%)';

        gameViewport.appendChild(popup);
        setTimeout(() => popup.remove(), 1500);
    }

    function showCombo(count) {
        comboCountEl.textContent = `×${count}`;
        comboDisplay.classList.remove('active');
        void comboDisplay.offsetWidth;
        comboDisplay.classList.add('active');
    }

    function hideCombo() {
        comboDisplay.classList.remove('active');
    }

    function triggerScreenShake() {
        gameViewport.classList.remove('shake-effect');
        void gameViewport.offsetWidth;
        gameViewport.classList.add('shake-effect');
        setTimeout(() => gameViewport.classList.remove('shake-effect'), 300);
    }

    function updateWarningFlash(isWarning) {
        if (isWarning) warningFlash.classList.add('active');
        else warningFlash.classList.remove('active');
    }

    function triggerMergeFlash(normX, normY) {
        mergeFlash.style.setProperty('--flash-x', `${normX * 100}%`);
        mergeFlash.style.setProperty('--flash-y', `${normY * 100}%`);
        mergeFlash.classList.remove('flash');
        void mergeFlash.offsetWidth;
        mergeFlash.classList.add('flash');
    }

    function updateNextIngredientPreview(nextTier) {
        if (!physics) return;
        const data = physics.getTierData(nextTier);
        previewItemContainer.innerHTML = '';

        const circle = document.createElement('div');
        circle.className = `tier-icon-circle tier${nextTier}-color`;
        circle.style.width = '28px';
        circle.style.height = '28px';
        circle.style.borderWidth = '1px';
        circle.style.boxShadow = `0 0 10px ${data.color}`;

        const tierKeyMap = { 1: 'tier1', 2: 'tier2', 3: 'tier3' };
        const tierKey = tierKeyMap[nextTier];

        let processedImgUrl = null;
        if (window.gamePhysics && window.gamePhysics.images[tierKey] instanceof HTMLCanvasElement) {
            processedImgUrl = window.gamePhysics.images[tierKey].toDataURL();
        }

        if (processedImgUrl) {
            const img = new Image();
            img.src = processedImgUrl;
            img.className = 'tier-img';
            img.onerror = () => {
                img.style.display = 'none';
                circle.appendChild(createProceduralFallback(nextTier));
            };
            circle.appendChild(img);
        } else {
            circle.appendChild(createProceduralFallback(nextTier));
        }

        previewItemContainer.appendChild(circle);
    }

    function createProceduralFallback(tier) {
        const fallback = document.createElement('div');
        fallback.className = 'tier-fallback';
        if (tier === 1) fallback.classList.add('icon-soul');
        if (tier === 2) fallback.classList.add('icon-tooth');
        if (tier === 3) fallback.classList.add('icon-vial');
        if (tier === 4) fallback.classList.add('icon-ring');
        if (tier === 5) fallback.classList.add('icon-skull');
        if (tier === 6) fallback.classList.add('icon-crown');
        return fallback;
    }

    function triggerGameOver() {
        finalScoreEl.textContent = currentScore;
        finalHighScoreEl.textContent = highScore;
        warningFlash.classList.remove('active');

        if (isNewHighScore) newBestBadge.classList.add('show');
        else newBestBadge.classList.remove('show');

        gameOverScreen.classList.add('active');
    }

    function triggerVictory() {
        victoryScoreEl.textContent = currentScore;
        warningFlash.classList.remove('active');
        victoryScreen.classList.add('active');
    }

    // UI Click Event Listeners
    drawerHandle.addEventListener('click', () => evolutionDrawer.classList.toggle('open'));

    document.addEventListener('click', (e) => {
        if (!evolutionDrawer.contains(e.target) && evolutionDrawer.classList.contains('open')) {
            evolutionDrawer.classList.remove('open');
        }
    });

    startBtn.addEventListener('click', () => startGame());
    reigniteBtn.addEventListener('click', () => startGame());

    continueBtn.addEventListener('click', () => {
        victoryScreen.classList.remove('active');
        physics.isPaused = false;
    });

    victoryRestartBtn.addEventListener('click', () => startGame());

    restartBtn.addEventListener('click', () => {
        if (confirm("Reset current spell? The cauldron will be cleared.")) {
            startGame();
        }
    });

    musicToggleBtn.addEventListener('click', () => {
        if (window.gameAudio) {
            const isMuted = window.gameAudio.toggleMusic();
            if (isMuted) musicToggleBtn.classList.add('muted');
            else musicToggleBtn.classList.remove('muted');
        }
    });

    soundToggleBtn.addEventListener('click', () => {
        if (window.gameAudio) {
            const isMuted = window.gameAudio.toggleSound();
            if (isMuted) soundToggleBtn.classList.add('muted');
            else soundToggleBtn.classList.remove('muted');
        }
    });

    // Ambient background elements
    const dust = document.getElementById('ambientDust');
    if (dust) {
        for (let i = 0; i < 35; i++) {
            const ember = document.createElement('div');
            ember.className = 'ember-particle';
            const size = 1 + Math.random() * 3;
            const colors = ['#9d4edd', '#c77dff', '#bf55ec', '#ff007f', '#ffb703'];
            ember.style.width = `${size}px`;
            ember.style.height = `${size}px`;
            ember.style.background = colors[Math.floor(Math.random() * colors.length)];
            ember.style.left = `${Math.random() * 100}%`;
            ember.style.top = `${60 + Math.random() * 40}%`;
            ember.style.animationDuration = `${8 + Math.random() * 15}s`;
            ember.style.animationDelay = `${Math.random() * 10}s`;
            ember.style.opacity = Math.random() * 0.5;
            dust.appendChild(ember);
        }
        for (let i = 0; i < 15; i++) {
            const star = document.createElement('div');
            star.style.position = 'absolute';
            star.style.width = `${1 + Math.random() * 2}px`;
            star.style.height = star.style.width;
            star.style.background = '#bf55ec';
            star.style.borderRadius = '50%';
            star.style.left = `${Math.random() * 100}%`;
            star.style.top = `${Math.random() * 100}%`;
            star.style.opacity = Math.random() * 0.35;
            star.style.pointerEvents = 'none';
            star.style.boxShadow = '0 0 4px #bf55ec';
            dust.appendChild(star);
        }
    }
});