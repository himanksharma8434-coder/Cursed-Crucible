/**
 * The Cursed Crucible - Physics & Render Engine
 * Built using Matter.js and high-fidelity HTML5 Canvas rendering.
 * Features: procedural fire, volumetric liquid, ambient fog, rune glyphs,
 * trail effects, advanced particles, cinematic rendering, and stable Suika physics.
 */

class CruciblePhysics {
    constructor(canvasContainerId, gameCallbacks) {
        this.container = document.getElementById(canvasContainerId);
        this.callbacks = gameCallbacks;

        // Detect mobile for performance optimizations
        this.isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        // Canvas Setup
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // Virtual resolution for 9:16 layout coordinates
        this.width = 450;
        this.height = 750;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Game Configuration
        this.cauldronRimY = 300;
        this.dropZoneY = 90;
        this.currentTierIndex = 0;
        this.nextTierIndex = 0;
        this.dropCooldown = false;
        this.isGameOver = false;
        this.warningTimer = null;
        this.warningTimeRemaining = 2.0;
        this.isAboveLine = false;

        // Visual Assets Loader
        this.images = {};
        this.loadAssets();

        // Particles System
        this.particles = [];
        this.bubbles = this.initBubbles(20);

        // Ambient fog system
        this.fogParticles = this.initFogParticles(8);

        // Ambient rune glyphs floating
        this.runeGlyphs = this.initRuneGlyphs();

        // Fire particles around the cauldron
        this.fireParticles = this.initFireParticles(30);

        // Screen-space trail for dropped items
        this.trails = [];

        // Frame counter for animation timing
        this.frameCount = 0;

        // Matter.js Setup
        this.initMatter();

        // Start Loop
        this.animate();
    }

    loadAssets() {
        const assets = {
            bg: 'assets/images/dungeon_bg.png',
            cauldron: 'assets/images/witch_cauldron.png',
            tier1: 'assets/images/tier1_soul.png',
            tier2: 'assets/images/tier2_tooth.png',
            tier3: 'assets/images/tier3_vial.png'
        };

        for (const [key, src] of Object.entries(assets)) {
            const img = new Image();
            img.src = src;
            img.onload = () => {
                if (key === 'bg') {
                    this.images[key] = img;
                } else {
                    this.images[key] = this.removeBackground(img);
                }
            };
            img.onerror = () => {
                console.warn(`Asset failed to load: ${src}. Procedural fallbacks will render.`);
            };
        }
    }

    removeBackground(img) {
        try {
            const canvas = document.createElement('canvas');
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, w, h);
            const px = imgData.data;
            const total = w * h;

            const r = (i) => px[i * 4];
            const g = (i) => px[i * 4 + 1];
            const b = (i) => px[i * 4 + 2];
            const a = (i) => px[i * 4 + 3];

            const isChecker = (i) => {
                if (a(i) < 255) return true;
                const pr = r(i), pg = g(i), pb = b(i);
                const maxC = Math.max(pr, pg, pb);
                const minC = Math.min(pr, pg, pb);
                if (maxC - minC > 30) return false;
                if (pr < 150) return false;
                return true;
            };

            const visited = new Uint8Array(total);
            const queue = new Int32Array(total);
            let head = 0, tail = 0;

            const seed = (idx) => {
                if (!visited[idx] && isChecker(idx)) {
                    visited[idx] = 1;
                    queue[tail++] = idx;
                }
            };

            for (let depth = 0; depth < 5; depth++) {
                for (let x = 0; x < w; x++) {
                    seed(depth * w + x);
                    seed((h - 1 - depth) * w + x);
                }
                for (let y = 0; y < h; y++) {
                    seed(y * w + depth);
                    seed(y * w + w - 1 - depth);
                }
            }

            while (head < tail) {
                const idx = queue[head++];
                const ix = idx % w;
                const iy = Math.floor(idx / w);

                if (ix > 0) seed(idx - 1);
                if (ix < w - 1) seed(idx + 1);
                if (iy > 0) seed(idx - w);
                if (iy < h - 1) seed(idx + w);
            }

            for (let i = 0; i < total; i++) {
                if (visited[i]) px[i * 4 + 3] = 0;
            }

            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const idx = y * w + x;
                    if (visited[idx]) continue;

                    let removed = 0;
                    if (visited[idx - 1]) removed++;
                    if (visited[idx + 1]) removed++;
                    if (visited[idx - w]) removed++;
                    if (visited[idx + w]) removed++;

                    if (removed > 0) {
                        const alpha = px[idx * 4 + 3];
                        const factor = Math.max(0.35, 1 - removed * 0.18);
                        px[idx * 4 + 3] = Math.round(alpha * factor);
                    }
                }
            }

            ctx.putImageData(imgData, 0, 0);
            return canvas;
        } catch (e) {
            console.warn('Canvas pixel access blocked. Falling back to procedural graphics.', e);
            return null;
        }
    }

    resize() {
        const containerWidth = this.container.clientWidth;
        const containerHeight = this.container.clientHeight;

        let cw = containerWidth;
        let ch = (containerWidth * 16) / 9;

        if (ch > containerHeight) {
            ch = containerHeight;
            cw = (containerHeight * 9) / 16;
        }

        // High-DPI screen support for crisp mobile graphics
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;

        this.canvas.style.width = `${cw}px`;
        this.canvas.style.height = `${ch}px`;

        // Center the canvas inside the container
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = `${(containerWidth - cw) / 2}px`;
        this.canvas.style.top = `${(containerHeight - ch) / 2}px`;

        // Scale drawing context to match DPI
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    }

    initFogParticles(count) {
        const finalCount = this.isMobile ? Math.floor(count / 2) : count;
        const arr = [];
        for (let i = 0; i < finalCount; i++) {
            arr.push({
                x: Math.random() * this.width,
                y: 200 + Math.random() * 300,
                radius: 60 + Math.random() * 100,
                speed: 0.15 + Math.random() * 0.25,
                opacity: 0.02 + Math.random() * 0.04,
                phase: Math.random() * Math.PI * 2
            });
        }
        return arr;
    }

    rollNextIngredients() {
        this.currentTierIndex = 6;
        this.nextTierIndex = 6;

        if (this.callbacks.onNextIngredientRoll) {
            this.callbacks.onNextIngredientRoll(this.nextTierIndex);
        }
    }

    initRuneGlyphs() {
        const runes = ['ᚠ', 'ᚡ', 'ᚢ', 'ᚣ', 'ᚤ', 'ᚥ', 'ᚦ', 'ᚧ', 'ᚨ', 'ᚩ', 'ᛃ', 'ᛈ', 'ᛉ', 'ᛊ'];
        const arr = [];
        for (let i = 0; i < 6; i++) {
            arr.push({
                char: runes[Math.floor(Math.random() * runes.length)],
                x: 20 + Math.random() * (this.width - 40),
                y: 100 + Math.random() * 200,
                opacity: 0,
                maxOpacity: 0.06 + Math.random() * 0.08,
                phase: Math.random() * Math.PI * 2,
                speed: 0.3 + Math.random() * 0.5,
                size: 18 + Math.random() * 24
            });
        }
        return arr;
    }

    initFireParticles(count) {
        const finalCount = this.isMobile ? Math.floor(count / 2) : count;
        const arr = [];
        for (let i = 0; i < finalCount; i++) {
            arr.push(this.createFireParticle());
        }
        return arr;
    }

    createFireParticle() {
        const side = Math.random() < 0.5 ? 'left' : 'right';
        const baseX = side === 'left' ? 55 + Math.random() * 30 : 365 + Math.random() * 30;
        return {
            x: baseX,
            y: 620 + Math.random() * 60,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -(0.8 + Math.random() * 1.5),
            radius: 2 + Math.random() * 4,
            life: 1.0,
            decay: 0.015 + Math.random() * 0.02,
            color: Math.random() < 0.4 ? '#bf55ec' : (Math.random() < 0.5 ? '#9d4edd' : '#ff007f')
        };
    }

    initMatter() {
        const { Engine, World, Bodies, Events, Runner } = Matter;

        // Increased engine iterations for stable 'Suika' item stacking
        this.engine = Engine.create({
            gravity: { y: 1.2 },
            positionIterations: 12,
            velocityIterations: 8
        });
        this.world = this.engine.world;

        const wallOpts = {
            isStatic: true,
            friction: 0.4,
            restitution: 0.1,
            render: { visible: false }
        };

        const walls = [];
        const wallThickness = 60; // Thick walls prevent high-velocity clipping

        // Left and Right Vertical Walls
        // Inner edges sit precisely at x=92 and x=358 to match visual cauldron boundaries
        walls.push(Bodies.rectangle(92 - wallThickness / 2, 450, wallThickness, 400, wallOpts));
        walls.push(Bodies.rectangle(358 + wallThickness / 2, 450, wallThickness, 400, wallOpts));

        // Procedural Concave Cauldron Bottom (Smooth Ellipse)
        // Center x=225, Width radius=133, Height radius=70. Connects perfectly from x=92 to x=358.
        const numSegments = 24;
        for (let i = 0; i <= numSegments; i++) {
            const theta = Math.PI * (i / numSegments); // Sweeps from 0 to PI
            const rx = 133 + wallThickness / 2;
            const ry = 70 + wallThickness / 2;

            const x = 225 + rx * Math.cos(theta);
            const y = 600 + ry * Math.sin(theta);

            // Compute tangent angle to face inwards
            const dx = -rx * Math.sin(theta);
            const dy = ry * Math.cos(theta);
            const angle = Math.atan2(dy, dx);

            // Expand segment length slightly to ensure overlapping mesh
            const segLength = (Math.PI * Math.max(rx, ry) / numSegments) * 1.5;

            walls.push(Bodies.rectangle(x, y, segLength, wallThickness, {
                ...wallOpts,
                angle: angle
            }));
        }

        World.add(this.world, walls);

        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);

        Events.on(this.engine, 'collisionStart', (e) => this.handleCollisions(e));

        this.mouseX = this.width / 2;
        this.rollNextIngredients();
    }

    rollNextIngredients() {
        if (this.currentTierIndex === 0) {
            this.currentTierIndex = Math.random() < 0.6 ? 1 : 2;
        } else {
            this.currentTierIndex = this.nextTierIndex;
        }
        this.nextTierIndex = Math.random() < 0.65 ? 1 : 2;

        if (this.callbacks.onNextIngredientRoll) {
            this.callbacks.onNextIngredientRoll(this.nextTierIndex);
        }
    }

    getTierData(tier) {
        const tiers = {
            1: { radius: 17, scoreValue: 2, color: '#4cc9f0', label: 'Soul Wisp', imgKey: 'tier1' },
            2: { radius: 24, scoreValue: 4, color: '#f1faee', label: 'Cracked Tooth', imgKey: 'tier2' },
            3: { radius: 33, scoreValue: 8, color: '#ff007f', label: 'Blood Vial', imgKey: 'tier3' },
            4: { radius: 44, scoreValue: 16, color: '#52b788', label: 'Cursed Ring', imgKey: 'tier4' },
            5: { radius: 56, scoreValue: 32, color: '#ffd166', label: 'Cursed Skull', imgKey: 'tier5' },
            6: { radius: 72, scoreValue: 64, color: '#bf55ec', label: 'Demon Crown', imgKey: 'tier6' }
        };
        return tiers[tier];
    }

    dropItem() {
        // Add this.isPaused to the block list
        if (this.dropCooldown || this.isGameOver || this.isPaused) return;


        const tier = this.currentTierIndex;
        const data = this.getTierData(tier);
        const { Bodies, World, Body } = Matter;

        // Perfectly bound the drop cursor mathematically to the inner walls
        const minX = 92 + data.radius + 2;
        const maxX = 358 - data.radius - 2;
        const dropX = Math.max(minX, Math.min(this.mouseX, maxX));

        const item = Bodies.circle(dropX, this.dropZoneY, data.radius, {
            restitution: 0.15, // Slight bounce gives the items life
            friction: 0.3,     // Low friction ensures they slide gracefully into gaps
            frictionAir: 0.005,
            density: 0.002,    // CONSTANT DENSITY - radius size handles mass difference naturally!
            label: `tier_${tier}`
        });

        item.tier = tier;
        item.creationTime = Date.now();

        // Slight random initial spin helps rolling and settling
        Body.setAngularVelocity(item, (Math.random() - 0.5) * 0.1);

        World.add(this.world, item);

        if (window.gameAudio) window.gameAudio.playDrop();

        this.createMistSplash(dropX, this.dropZoneY, data.color);
        this.addTrail(dropX, this.dropZoneY, data.color);

        this.dropCooldown = true;
        this.rollNextIngredients();
        setTimeout(() => { this.dropCooldown = false; }, 850);
    }

    handleCollisions(event) {
        if (this.isGameOver) return;

        const pairs = event.pairs;
        const { World, Bodies, Composite, Body } = Matter;
        const merges = [];

        // First pass: Flag merges
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;

            if (bodyA.tier && bodyB.tier && bodyA.tier === bodyB.tier) {
                if (bodyA.isMerging || bodyB.isMerging) continue;
                bodyA.isMerging = true;
                bodyB.isMerging = true;

                merges.push({ bodyA, bodyB, tier: bodyA.tier });
            }
        }

        // Second pass: Resolve merges immediately in the same physics tick
        for (const merge of merges) {
            const { bodyA, bodyB, tier } = merge;
            const midX = (bodyA.position.x + bodyB.position.x) / 2;
            const midY = (bodyA.position.y + bodyB.position.y) / 2;

            // Remove bodies instantly to prevent overlap explosions
            Composite.remove(this.world, [bodyA, bodyB]);

            if (window.gameAudio) window.gameAudio.playMerge();
            this.callbacks.triggerShake();

            const tierData = this.getTierData(tier);

            if (this.callbacks.onMergeFlash) {
                this.callbacks.onMergeFlash(midX / this.width, midY / this.height);
            }

            if (tier < 6) {
                const nextTier = tier + 1;
                const nextData = this.getTierData(nextTier);

                this.callbacks.onScore(tierData.scoreValue, midX, midY, nextData.color, nextData.label);

                const merged = Bodies.circle(midX, midY, nextData.radius, {
                    restitution: 0.15,
                    friction: 0.3,
                    density: 0.002, // Constant density scaling
                    label: `tier_${nextTier}`
                });

                merged.tier = nextTier;
                merged.creationTime = Date.now();
                merged.justMerged = true;

                // Carry over momentum + slight upward hop to settle above dense piles
                const avgVx = (bodyA.velocity.x + bodyB.velocity.x) * 0.5;
                const avgVy = (bodyA.velocity.y + bodyB.velocity.y) * 0.5;
                Body.setVelocity(merged, { x: avgVx, y: Math.min(avgVy, 0) - 2.5 });

                Composite.add(this.world, merged);

                setTimeout(() => { merged.justMerged = false; }, 400);

                this.createMergeBlast(midX, midY, nextData.color, nextData.radius);
                if (nextTier >= 4) {
                    this.createMergeRing(midX, midY, nextData.color);
                }
            } else {
                this.callbacks.onScore(1000, midX, midY, '#bf55ec', '★ ASCENSION ★');
                this.createEpicSupernova(midX, midY);
                // Triger the victory
                if (this.callbacks.onAscension && !this.hasAscended) {
                    this.hasAscended = true;
                    setTimeout(() => {
                        this.isPaused = true;
                        this.callbacks.onAscension();
                    }, 1500);
                }
            }
        }
    }

    initBubbles(count) {
        const finalCount = this.isMobile ? Math.floor(count / 2) : count;
        const arr = [];
        for (let i = 0; i < finalCount; i++) {
            arr.push({
                x: 110 + Math.random() * 230,
                y: 500 + Math.random() * 140,
                radius: 2 + Math.random() * 6,
                speed: 0.4 + Math.random() * 0.8,
                pulse: Math.random() * Math.PI
            });
        }
        return arr;
    }

    addTrail(x, y, color) {
        for (let i = 0; i < 5; i++) {
            this.trails.push({
                x: x + (Math.random() - 0.5) * 6,
                y: y + i * 8,
                radius: 2 + Math.random() * 3,
                color,
                opacity: 0.5 - i * 0.08,
                decay: 0.03
            });
        }
    }

    createMistSplash(x, y, color) {
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 2.5;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.5,
                radius: 2 + Math.random() * 5,
                color, opacity: 0.7,
                decay: 0.02 + Math.random() * 0.02
            });
        }
    }

    createMergeBlast(x, y, color, radius) {
        this.particles.push({
            x, y, vx: 0, vy: 0,
            radius: 5, maxRadius: radius * 3,
            color, isRing: true,
            opacity: 0.8, decay: 0.04
        });

        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 1.5 + Math.random() * 3.5,
                color, opacity: 1,
                decay: 0.025 + Math.random() * 0.02,
                isSpark: true
            });
        }
    }

    createMergeRing(x, y, color) {
        this.particles.push({
            x, y, vx: 0, vy: 0,
            radius: 3, maxRadius: 100,
            color, isRing: true,
            opacity: 0.6, decay: 0.02
        });
    }

    createEpicSupernova(x, y) {
        for (let r = 0; r < 3; r++) {
            this.particles.push({
                x, y, vx: 0, vy: 0,
                radius: 5 + r * 10, maxRadius: 200 + r * 30,
                color: r === 0 ? '#fff' : (r === 1 ? '#bf55ec' : '#ff007f'),
                isRing: true,
                opacity: 1 - r * 0.2, decay: 0.015 + r * 0.005
            });
        }

        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 12;
            const colors = ['#bf55ec', '#ff007f', '#c77dff', '#fff', '#ffd166'];
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 2 + Math.random() * 7,
                color: colors[Math.floor(Math.random() * colors.length)],
                opacity: 1, decay: 0.012 + Math.random() * 0.01,
                isSpark: true
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            if (p.isRing) {
                p.radius += 4;
                p.opacity -= p.decay;
            } else {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.04;
                if (p.isSpark) {
                    p.vx *= 0.97;
                    p.vy *= 0.97;
                }
                p.opacity -= p.decay;
            }
            if (p.opacity <= 0 || (p.maxRadius && p.radius >= p.maxRadius)) {
                this.particles.splice(i, 1);
            }
        }

        for (let i = this.trails.length - 1; i >= 0; i--) {
            this.trails[i].opacity -= this.trails[i].decay;
            if (this.trails[i].opacity <= 0) {
                this.trails.splice(i, 1);
            }
        }

        for (let i = 0; i < this.fireParticles.length; i++) {
            const f = this.fireParticles[i];
            f.x += f.vx;
            f.y += f.vy;
            f.life -= f.decay;
            f.radius *= 0.99;
            if (f.life <= 0) {
                this.fireParticles[i] = this.createFireParticle();
            }
        }
    }

    checkGameOverCondition() {
        if (this.isGameOver) return;

        const bodies = Matter.Composite.allBodies(this.world);
        let itemsAboveLine = false;

        for (let i = 0; i < bodies.length; i++) {
            const body = bodies[i];
            if (body.isStatic) continue;

            const rad = body.circleRadius || 10;
            const topEdge = body.position.y - rad;
            const age = Date.now() - (body.creationTime || 0);

            if (topEdge < this.cauldronRimY && age > 1200) {
                if (body.velocity.y < 0.15 && Math.abs(body.velocity.x) < 0.15) {
                    itemsAboveLine = true;
                    break;
                }
            }
        }

        const wasAbove = this.isAboveLine;
        this.isAboveLine = itemsAboveLine;

        if (wasAbove !== itemsAboveLine && this.callbacks.onWarningStateChange) {
            this.callbacks.onWarningStateChange(itemsAboveLine);
        }

        if (itemsAboveLine) {
            if (!this.warningTimer) {
                this.warningTimeRemaining = 2.0;
                this.warningTimer = setInterval(() => {
                    this.warningTimeRemaining -= 0.1;
                    if (this.warningTimeRemaining <= 0) {
                        clearInterval(this.warningTimer);
                        this.warningTimer = null;
                        this.triggerGameOver();
                    }
                }, 100);
            }
        } else if (this.warningTimer) {
            clearInterval(this.warningTimer);
            this.warningTimer = null;
            this.warningTimeRemaining = 2.0;
        }
    }

    triggerGameOver() {
        this.isGameOver = true;
        this.runner.enabled = false;
        if (window.gameAudio) window.gameAudio.playGameOver();
        if (this.callbacks.onWarningStateChange) this.callbacks.onWarningStateChange(false);
        this.callbacks.onGameOver();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.frameCount++;

        this.updateParticles();
        this.checkGameOverCondition();

        const now = Date.now();

        if (this.images.bg) {
            this.ctx.drawImage(this.images.bg, 0, 0, this.width, this.height);
        } else {
            this.drawProceduralBackground(now);
        }

        this.drawAmbientFog(now);
        this.drawRuneGlyphs(now);
        this.drawCauldronBackFluid();
        this.drawFireParticles();
        this.drawTrails();

        const bodies = Matter.Composite.allBodies(this.world);
        for (let i = 0; i < bodies.length; i++) {
            if (!bodies[i].isStatic) this.drawItemBody(bodies[i]);
        }

        if (this.images.cauldron) {
            this.ctx.drawImage(this.images.cauldron, 0, 300, this.width, 440);
        } else {
            this.drawVectorCauldron();
        }

        this.drawCauldronFrontFluidOverlay();
        this.drawWarningLine();
        this.drawDropIndicator();
        this.drawParticles();
        this.drawVignette();
    }

    drawProceduralBackground(now) {
        const pulseOffset = Math.sin(now / 5000) * 15;
        const bgGrad = this.ctx.createRadialGradient(
            225, 350 + pulseOffset, 30,
            225, 375, 480
        );
        bgGrad.addColorStop(0, '#1a1030');
        bgGrad.addColorStop(0.3, '#120a20');
        bgGrad.addColorStop(0.7, '#0a0614');
        bgGrad.addColorStop(1, '#04030a');
        this.ctx.fillStyle = bgGrad;
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (this.frameCount % 3 === 0) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.015;
            for (let i = 0; i < 80; i++) {
                const x = Math.random() * this.width;
                const y = Math.random() * this.height;
                this.ctx.fillStyle = Math.random() < 0.5 ? '#9d4edd' : '#bf55ec';
                this.ctx.fillRect(x, y, 1, 1);
            }
            this.ctx.restore();
        }
    }

    drawAmbientFog(now) {
        this.ctx.save();
        for (const fog of this.fogParticles) {
            fog.x += fog.speed;
            if (fog.x > this.width + fog.radius) fog.x = -fog.radius;

            const breathe = Math.sin(now / 3000 + fog.phase) * 0.015;
            this.ctx.globalAlpha = fog.opacity + breathe;

            const grad = this.ctx.createRadialGradient(fog.x, fog.y, 0, fog.x, fog.y, fog.radius);
            grad.addColorStop(0, 'rgba(157, 78, 221, 0.15)');
            grad.addColorStop(0.5, 'rgba(60, 9, 108, 0.05)');
            grad.addColorStop(1, 'transparent');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(fog.x - fog.radius, fog.y - fog.radius, fog.radius * 2, fog.radius * 2);
        }
        this.ctx.restore();
    }

    drawRuneGlyphs(now) {
        this.ctx.save();
        for (const rune of this.runeGlyphs) {
            rune.phase += 0.005;
            rune.y -= 0.05;
            if (rune.y < 50) {
                rune.y = 320;
                rune.x = 20 + Math.random() * (this.width - 40);
            }

            const opacity = rune.maxOpacity * (0.5 + 0.5 * Math.sin(rune.phase));
            this.ctx.globalAlpha = opacity;
            this.ctx.fillStyle = '#9d4edd';
            this.ctx.font = `${rune.size}px serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(rune.char, rune.x, rune.y);
        }
        this.ctx.restore();
    }

    drawFireParticles() {
        this.ctx.save();
        for (const f of this.fireParticles) {
            this.ctx.globalAlpha = f.life * 0.6;
            this.ctx.shadowBlur = this.isMobile ? 0 : 8;
            this.ctx.shadowColor = f.color;

            const grad = this.ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
            grad.addColorStop(0, f.color);
            grad.addColorStop(0.6, f.color);
            grad.addColorStop(1, 'transparent');

            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }

    drawTrails() {
        for (const t of this.trails) {
            this.ctx.save();
            this.ctx.globalAlpha = t.opacity;
            this.ctx.fillStyle = t.color;
            this.ctx.shadowBlur = this.isMobile ? 0 : 4;
            this.ctx.shadowColor = t.color;
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    drawVignette() {
        const topGrad = this.ctx.createLinearGradient(0, 0, 0, 120);
        topGrad.addColorStop(0, 'rgba(4, 3, 10, 0.7)');
        topGrad.addColorStop(1, 'transparent');
        this.ctx.fillStyle = topGrad;
        this.ctx.fillRect(0, 0, this.width, 120);

        const botGrad = this.ctx.createLinearGradient(0, this.height - 50, 0, this.height);
        botGrad.addColorStop(0, 'transparent');
        botGrad.addColorStop(1, 'rgba(4, 3, 10, 0.4)');
        this.ctx.fillStyle = botGrad;
        this.ctx.fillRect(0, this.height - 50, this.width, 50);
    }

    drawItemBody(body) {
        const tier = body.tier;
        const data = this.getTierData(tier);
        if (!data) return;

        const pos = body.position;
        const angle = body.angle;

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        const pulseIntensity = 0.3 + Math.sin(Date.now() / 400 + tier * 1.5) * 0.15;
        this.ctx.globalAlpha = pulseIntensity;
        const glowGrad = this.ctx.createRadialGradient(0, 0, data.radius * 0.8, 0, 0, data.radius * 1.6);
        glowGrad.addColorStop(0, data.color);
        glowGrad.addColorStop(0.5, data.color + '40');
        glowGrad.addColorStop(1, 'transparent');
        this.ctx.fillStyle = glowGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, data.radius * 1.6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        this.ctx.rotate(angle);

        if (body.justMerged) {
            const age = Date.now() - body.creationTime;
            const scale = 1 + Math.max(0, 1 - age / 300) * 0.3;
            this.ctx.scale(scale, scale);
        }

        const img = this.images[data.imgKey];
        if (img) {
            this.ctx.beginPath();
            this.ctx.arc(0, 0, data.radius, 0, Math.PI * 2);
            this.ctx.closePath();
            this.ctx.clip();

            this.ctx.fillStyle = '#0b0910';
            this.ctx.fill();

            const sz = data.radius * 2.3;
            this.ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
        } else {
            this.drawProceduralVector(tier, data);
        }
        this.ctx.restore();

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        this.ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 500 + tier) * 0.15;
        this.ctx.strokeStyle = data.color;
        this.ctx.lineWidth = 2;
        this.ctx.shadowBlur = this.isMobile ? 0 : 12;
        this.ctx.shadowColor = data.color;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, data.radius + 1.5, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);
        this.ctx.globalAlpha = 0.25;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `bold ${Math.max(8, data.radius * 0.35)}px Cinzel`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.restore();
    }

    drawProceduralVector(tier, data) {
        const r = data.radius;

        this.ctx.shadowBlur = this.isMobile ? 0 : 14;
        this.ctx.shadowColor = data.color;

        const grad = this.ctx.createRadialGradient(-r / 3, -r / 3, r / 8, 0, 0, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.15, data.color);
        grad.addColorStop(0.6, data.color + 'aa');
        grad.addColorStop(1, '#0c0a10');
        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.strokeStyle = data.color + '60';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        switch (tier) {
            case 1:
                this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
                this.ctx.shadowBlur = this.isMobile ? 0 : 6;
                this.ctx.shadowColor = data.color;
                this.ctx.beginPath();
                this.ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
                break;
            case 2:
                this.ctx.font = `bold ${r * 1.1}px Arial`;
                this.ctx.fillText('🦷', 0, 2);
                break;
            case 3:
                this.ctx.font = `${r}px Arial`;
                this.ctx.fillText('🧪', 0, 2);
                break;
            case 4:
                this.ctx.font = `${r}px Arial`;
                this.ctx.fillText('💍', 0, 2);
                break;
            case 5:
                this.ctx.font = `${r}px Arial`;
                this.ctx.fillText('💀', 0, 2);
                break;
            case 6:
                this.ctx.font = `${r * 1.1}px Arial`;
                this.ctx.fillText('👑', 0, 2);
                break;
        }
    }

    clipToBowl(topY) {
        // Redrawn to trace the exact physics-driven ellipse mesh parameters
        this.ctx.beginPath();
        this.ctx.moveTo(92, topY);
        this.ctx.lineTo(92, 600);
        for (let i = 0; i <= 24; i++) {
            const theta = Math.PI - (Math.PI * (i / 24));
            const x = 225 + 133 * Math.cos(theta);
            const y = 600 + 70 * Math.sin(theta);
            this.ctx.lineTo(x, y);
        }
        this.ctx.lineTo(358, topY);
        this.ctx.closePath();
        this.ctx.clip();
    }

    drawCauldronBackFluid() {
        const surfY = 490;

        this.ctx.save();
        this.clipToBowl(surfY);

        const grad = this.ctx.createLinearGradient(0, surfY, 0, 670);
        grad.addColorStop(0, '#6a1fad');
        grad.addColorStop(0.3, '#5a189a');
        grad.addColorStop(0.6, '#3c096c');
        grad.addColorStop(1, '#10002b');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(80, surfY, 290, 180);

        const shimmer = this.ctx.createLinearGradient(0, surfY, 0, surfY + 20);
        shimmer.addColorStop(0, `rgba(199, 125, 255, ${0.1 + Math.sin(Date.now() / 800) * 0.05})`);
        shimmer.addColorStop(1, 'transparent');
        this.ctx.fillStyle = shimmer;
        this.ctx.fillRect(95, surfY, 260, 20);

        const now = Date.now();
        for (const bub of this.bubbles) {
            bub.y -= bub.speed;
            if (bub.y < surfY + 12) {
                bub.y = 648;
                bub.x = 110 + Math.random() * 230;
            }
            const ox = Math.sin((now / 1000) * 2 + bub.pulse) * 5;

            this.ctx.fillStyle = 'rgba(157, 78, 221, 0.12)';
            this.ctx.beginPath();
            this.ctx.arc(bub.x + ox, bub.y, bub.radius + 3, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = 'rgba(199, 125, 255, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(bub.x + ox, bub.y, bub.radius, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            this.ctx.beginPath();
            this.ctx.arc(bub.x + ox - bub.radius * 0.3, bub.y - bub.radius * 0.3, bub.radius * 0.3, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    drawCauldronFrontFluidOverlay() {
        const surfY = 495;

        this.ctx.save();
        this.clipToBowl(surfY - 15);

        const grad = this.ctx.createLinearGradient(0, surfY - 10, 0, surfY + 60);
        grad.addColorStop(0, 'rgba(199, 125, 255, 0.4)');
        grad.addColorStop(0.15, 'rgba(157, 78, 221, 0.3)');
        grad.addColorStop(0.4, 'rgba(157, 78, 221, 0.15)');
        grad.addColorStop(1, 'rgba(60, 9, 108, 0.0)');
        this.ctx.fillStyle = grad;

        const t = Date.now() / 400;
        this.ctx.beginPath();
        this.ctx.moveTo(80, 670);
        this.ctx.lineTo(80, surfY);
        for (let x = 80; x <= 370; x += 6) {
            const wave = Math.sin(x / 25 + t) * 4 + Math.sin(x / 15 + t * 1.5) * 2;
            this.ctx.lineTo(x, surfY + wave);
        }
        this.ctx.lineTo(370, 670);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.06 + Math.sin(t) * 0.03})`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let x = 95; x <= 355; x += 6) {
            const wave = Math.sin(x / 25 + t) * 4 + Math.sin(x / 15 + t * 1.5) * 2;
            if (x === 95) this.ctx.moveTo(x, surfY + wave);
            else this.ctx.lineTo(x, surfY + wave);
        }
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawWarningLine() {
        const y = this.cauldronRimY;

        this.ctx.save();
        if (this.isAboveLine) {
            const flash = Math.sin(Date.now() / 100) > 0;
            this.ctx.strokeStyle = flash ? '#ff0000' : '#880000';
            this.ctx.lineWidth = 3;
            this.ctx.shadowBlur = this.isMobile ? 0 : 20;
            this.ctx.shadowColor = '#ff0000';

            this.ctx.beginPath();
            this.ctx.moveTo(85, y);
            this.ctx.lineTo(365, y);
            this.ctx.stroke();

            const warnGrad = this.ctx.createLinearGradient(0, y - 30, 0, y);
            warnGrad.addColorStop(0, 'transparent');
            warnGrad.addColorStop(1, `rgba(230, 57, 70, ${flash ? 0.15 : 0.05})`);
            this.ctx.fillStyle = warnGrad;
            this.ctx.fillRect(85, y - 30, 280, 30);

            this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#ff3333';
            this.ctx.font = 'bold 12px Cinzel';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            this.ctx.shadowBlur = this.isMobile ? 0 : 8;
            this.ctx.shadowColor = '#ff0000';
            this.ctx.fillText(`⚠ SEAL CRACKING: ${this.warningTimeRemaining.toFixed(1)}s ⚠`, 225, y - 14);
        } else {
            this.ctx.strokeStyle = 'rgba(157, 78, 221, 0.15)';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([4, 6]);
            this.ctx.beginPath();
            this.ctx.moveTo(85, y);
            this.ctx.lineTo(365, y);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    drawDropIndicator() {
        if (this.isGameOver) return;

        const data = this.getTierData(this.currentTierIndex);

        // Exact mathematical alignment for the drop zone
        const minX = 92 + data.radius + 2;
        const maxX = 358 - data.radius - 2;
        const rx = Math.max(minX, Math.min(this.mouseX, maxX));

        this.ctx.save();
        const lineGrad = this.ctx.createLinearGradient(0, this.dropZoneY, 0, 490);
        lineGrad.addColorStop(0, `${data.color}30`);
        lineGrad.addColorStop(0.5, `${data.color}15`);
        lineGrad.addColorStop(1, `${data.color}05`);
        this.ctx.strokeStyle = lineGrad;
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([3, 6]);
        this.ctx.beginPath();
        this.ctx.moveTo(rx, this.dropZoneY + data.radius);
        this.ctx.lineTo(rx, 490);
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.save();
        this.ctx.translate(rx, this.dropZoneY);
        const pulse = 1 + Math.sin(Date.now() / 200) * 0.05;
        const bob = Math.sin(Date.now() / 600) * 3;
        this.ctx.translate(0, bob);
        this.ctx.scale(pulse, pulse);
        this.ctx.globalAlpha = 0.8;

        this.ctx.shadowBlur = this.isMobile ? 0 : 15;
        this.ctx.shadowColor = data.color;

        const img = this.images[data.imgKey];
        if (img) {
            this.ctx.beginPath();
            this.ctx.arc(0, 0, data.radius, 0, Math.PI * 2);
            this.ctx.closePath();
            this.ctx.clip();
            this.ctx.fillStyle = '#0b0910';
            this.ctx.fill();
            const sz = data.radius * 2.3;
            this.ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
        } else {
            this.drawProceduralVector(this.currentTierIndex, data);
        }
        this.ctx.restore();
    }

    drawVectorCauldron() {
        const bodyGrad = this.ctx.createLinearGradient(60, 0, 390, 0);
        bodyGrad.addColorStop(0, 'rgba(30, 29, 36, 0.85)');
        bodyGrad.addColorStop(0.15, 'rgba(30, 29, 36, 0.2)');
        bodyGrad.addColorStop(0.5, 'rgba(30, 29, 36, 0.05)');
        bodyGrad.addColorStop(0.85, 'rgba(30, 29, 36, 0.2)');
        bodyGrad.addColorStop(1, 'rgba(30, 29, 36, 0.85)');

        this.ctx.fillStyle = bodyGrad;
        this.ctx.strokeStyle = 'rgba(70, 65, 85, 0.6)';
        this.ctx.lineWidth = 5;

        // Traced manually to mirror the collision model precisely
        this.ctx.beginPath();
        this.ctx.moveTo(60, 340);
        this.ctx.lineTo(60, 600);
        for (let i = 0; i <= 24; i++) {
            const theta = Math.PI - (Math.PI * (i / 24));
            const x = 225 + 165 * Math.cos(theta);
            const y = 600 + 100 * Math.sin(theta);
            this.ctx.lineTo(x, y);
        }
        this.ctx.lineTo(390, 340);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.strokeStyle = '#4a4659';
        this.ctx.lineWidth = 6;
        this.ctx.shadowBlur = this.isMobile ? 0 : 8;
        this.ctx.shadowColor = 'rgba(157, 78, 221, 0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(225, 340, 165, 20, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(80, 370);
        this.ctx.lineTo(80, 630);
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        this.ctx.beginPath();
        this.ctx.moveTo(370, 380);
        this.ctx.lineTo(370, 620);
        this.ctx.stroke();
    }

    drawParticles() {
        for (const p of this.particles) {
            this.ctx.save();
            this.ctx.globalAlpha = p.opacity;
            if (p.isRing) {
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = Math.max(1, 4 - p.radius * 0.02);
                this.ctx.shadowBlur = this.isMobile ? 0 : 10;
                this.ctx.shadowColor = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.stroke();
            } else if (p.isSpark) {
                this.ctx.shadowBlur = this.isMobile ? 0 : 8;
                this.ctx.shadowColor = p.color;
                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                this.ctx.shadowBlur = this.isMobile ? 0 : 6;
                this.ctx.shadowColor = p.color;
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.restore();
        }
    }

    resetWorld() {
        const { World, Composite } = Matter;

        const bodies = Composite.allBodies(this.world);
        for (let i = bodies.length - 1; i >= 0; i--) {
            if (!bodies[i].isStatic) World.remove(this.world, bodies[i]);
        }

        this.particles = [];
        this.trails = [];
        this.isGameOver = false;
        this.isAboveLine = false;
        this.hasAscended = false; // Add this
        this.isPaused = false;    // Add this

        if (this.warningTimer) {
            clearInterval(this.warningTimer);
            this.warningTimer = null;
        }

        this.runner.enabled = true;
        this.rollNextIngredients();
    }
}

window.CruciblePhysics = CruciblePhysics;