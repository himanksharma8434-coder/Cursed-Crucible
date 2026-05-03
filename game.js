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
                triggerShake: () => { if (physics) physics.shake(12, 5); },
                onNextIngredientRoll: (nextTier) => updateNextIngredientPreview(nextTier),
                onWarningStateChange: (isWarning) => updateWarningFlash(isWarning),
                onAscension: () => triggerVictory()
            });
            setupInputs();
        }
    }

    function setupInputs() {
        const canvas = physics.canvas;
        canvas.addEventListener('pointermove', (e) => {
            const rect = canvas.getBoundingClientRect();
            physics.mouseX = ((e.clientX - rect.left) / rect.width) * physics.width;
        });
        canvas.addEventListener('pointerup', () => {
            physics.dropItem();
        });
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
        requestAnimationFrame(() => requestAnimationFrame(() => {
            scoreCard.classList.add('pop-effect');
        }));

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
        if (physics) {
            physics.spawnTextParticle(worldX, worldY, `+${points}`, isCombo ? '#ff8c00' : '#ffd166', isCombo ? 28 : 22);
        }
    }

    function spawnTierNamePopup(tierLabel, worldX, worldY, tierColor) {
        if (physics) {
            physics.spawnTextParticle(worldX, worldY + 25, tierLabel, tierColor || '#c77dff', 14);
        }
    }

    function showCombo(count) {
        comboCountEl.textContent = `×${count}`;
        comboDisplay.classList.remove('active');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            comboDisplay.classList.add('active');
        }));
    }

    function hideCombo() {
        comboDisplay.classList.remove('active');
    }



    function updateWarningFlash(isWarning) {
        if (isWarning) warningFlash.classList.add('active');
        else warningFlash.classList.remove('active');
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

    // Ambient background elements (Rendered inside Canvas for maximum performance)
});