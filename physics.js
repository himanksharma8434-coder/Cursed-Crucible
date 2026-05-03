import Matter from 'matter-js';

/**
 * The Cursed Crucible - Physics & Render Engine (Fully Optimized)
 * Built using Matter.js and high-fidelity HTML5 Canvas rendering.
 * Features: procedural fire, volumetric liquid, ambient fog, rune glyphs,
 * trail effects, advanced particles, cinematic rendering, and stable Suika physics.
 */

class CruciblePhysics {
    constructor(canvasContainerId, gameCallbacks) {
        this.container = document.getElementById(canvasContainerId);
        this.callbacks = gameCallbacks;

        // Force mobile optimizations since this is packaged inside an APK
        this.isMobile = true;

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

        // Fixed Timestep Accumulator Setup (Decouples physics from screen refresh rate e.g. 90Hz/120Hz)
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.timestep = 1000 / 60; // 16.666ms (60 Hz)

        // Active Items Tracking (Saves high-overhead Composite.allBodies traversing every frame)
        this.items = [];

        // Screen Shake Tracking
        this.shakeDuration = 0;
        this.shakeMagnitude = 0;

        // Visual Assets Loader
        this.images = {};
        this.loadAssets();

        // Object Pooling for Particles and Trails (Prevents Garbage Collection lag)
        this.maxParticles = 250;
        this.particlePool = [];
        for (let i = 0; i < this.maxParticles; i++) {
            this.particlePool.push({
                active: false,
                x: 0, y: 0, vx: 0, vy: 0, radius: 0, maxRadius: 0,
                color: '', opacity: 0, decay: 0, isRing: false, isSpark: false
            });
        }

        this.maxTrails = 60;
        this.trailPool = [];
        for (let i = 0; i < this.maxTrails; i++) {
            this.trailPool.push({
                active: false,
                x: 0, y: 0, radius: 0, color: '', opacity: 0, decay: 0
            });
        }

        // Bubbles System
        this.bubbles = this.initBubbles(20);

        // Ambient fog system
        this.fogParticles = this.initFogParticles(8);

        // Ambient rune glyphs floating
        this.runeGlyphs = this.initRuneGlyphs();

        // Fire particles around the cauldron
        this.fireParticles = this.initFireParticles(30);

        // Background embers (Replaces high-overhead DOM elements)
        this.backgroundEmbers = this.initBackgroundEmbers(30);

        // Frame counter for animation timing
        this.frameCount = 0;
        this.textParticles = [];

        // Matter.js Setup and Gradient Caching
        this.initCachedGradients();
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

    spawnTextParticle(x, y, text, color, size) {
        this.textParticles.push({
            x, y, text, color, size,
            vy: -1.5 - Math.random(),
            life: 1.0,
            decay: 0.015 + Math.random() * 0.01
        });
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

        // Capped to 1 on mobile to prevent extreme rendering lag
        const dpr = 1;
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
        const finalCount = Math.floor(count / 2);
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
        const finalCount = Math.floor(count / 2);
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

    initBackgroundEmbers(count) {
        const finalCount = Math.floor(count / 2);
        const arr = [];
        const colors = ['#9d4edd', '#c77dff', '#bf55ec', '#ff007f', '#ffb703'];
        for (let i = 0; i < finalCount; i++) {
            arr.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                size: 1 + Math.random() * 2,
                speed: 0.3 + Math.random() * 0.5,
                opacity: 0.15 + Math.random() * 0.3,
                color: colors[Math.floor(Math.random() * colors.length)],
                wavePhase: Math.random() * Math.PI * 2,
                waveSpeed: 0.01 + Math.random() * 0.02
            });
        }
        return arr;
    }

    initMatter() {
        const { Engine, World, Bodies, Events } = Matter;

        // Reset physics engine solver iterations to defaults for mobile performance
        this.engine = Engine.create({
            gravity: { y: 2.8 },
            positionIterations: 6,
            velocityIterations: 4
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

        // Halved segments count (12 segments instead of 24) to reduce collision solver constraints checks by 50%
        const numSegments = 12;
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

    removeItem(body) {
        const idx = this.items.indexOf(body);
        if (idx !== -1) {
            // O(1) in-place swap-and-pop deletion to prevent shifting and GC array allocations
            this.items[idx] = this.items[this.items.length - 1];
            this.items.pop();
        }
    }

    dropItem() {
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
            frictionAir: 0.001,
            density: 0.005,    // CONSTANT DENSITY - radius size handles mass difference naturally!
            label: `tier_${tier}`
        });

        item.tier = tier;
        item.creationTime = Date.now();

        // Slight random initial spin helps rolling and settling
        Body.setAngularVelocity(item, (Math.random() - 0.5) * 0.1);

        World.add(this.world, item);
        this.items.push(item);

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
            this.removeItem(bodyA);
            this.removeItem(bodyB);

            if (window.gameAudio) window.gameAudio.playMerge();
            this.callbacks.triggerShake();

            const tierData = this.getTierData(tier);

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
                this.items.push(merged);

                setTimeout(() => { merged.justMerged = false; }, 400);

                this.createMergeBlast(midX, midY, nextData.color, nextData.radius);
                if (nextTier >= 4) {
                    this.createMergeRing(midX, midY, nextData.color);
                }
            } else {
                this.callbacks.onScore(1000, midX, midY, '#bf55ec', '★ ASCENSION ★');
                this.createEpicSupernova(midX, midY);
                // Trigger the victory
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
        const finalCount = Math.floor(count / 2);
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

    spawnParticle(x, y, vx, vy, radius, color, decay, isRing = false, isSpark = false, maxRadius = 0) {
        let p = null;
        for (let i = 0; i < this.maxParticles; i++) {
            if (!this.particlePool[i].active) {
                p = this.particlePool[i];
                break;
            }
        }
        if (!p) {
            p = this.particlePool[Math.floor(Math.random() * this.maxParticles)];
        }
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.radius = radius;
        p.maxRadius = maxRadius;
        p.color = color;
        p.opacity = 1.0;
        p.decay = decay;
        p.isRing = isRing;
        p.isSpark = isSpark;
    }

    spawnTrail(x, y, radius, color, opacity, decay) {
        let t = null;
        for (let i = 0; i < this.maxTrails; i++) {
            if (!this.trailPool[i].active) {
                t = this.trailPool[i];
                break;
            }
        }
        if (!t) {
            t = this.trailPool[Math.floor(Math.random() * this.maxTrails)];
        }
        t.active = true;
        t.x = x;
        t.y = y;
        t.radius = radius;
        t.color = color;
        t.opacity = opacity;
        t.decay = decay;
    }

    addTrail(x, y, color) {
        for (let i = 0; i < 5; i++) {
            this.spawnTrail(
                x + (Math.random() - 0.5) * 6,
                y + i * 8,
                2 + Math.random() * 3,
                color,
                0.5 - i * 0.08,
                0.03
            );
        }
    }

    createMistSplash(x, y, color) {
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 2.5;
            this.spawnParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 1.5,
                2 + Math.random() * 5,
                color,
                0.02 + Math.random() * 0.02,
                false, false
            );
        }
    }

    createMergeBlast(x, y, color, radius) {
        this.spawnParticle(x, y, 0, 0, 5, color, 0.04, true, false, radius * 3);

        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            this.spawnParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                1.5 + Math.random() * 3.5,
                color,
                0.025 + Math.random() * 0.02,
                false, true
            );
        }
    }

    createMergeRing(x, y, color) {
        this.spawnParticle(x, y, 0, 0, 3, color, 0.02, true, false, 100);
    }

    createEpicSupernova(x, y) {
        for (let r = 0; r < 3; r++) {
            this.spawnParticle(
                x, y, 0, 0, 5 + r * 10,
                r === 0 ? '#fff' : (r === 1 ? '#bf55ec' : '#ff007f'),
                0.015 + r * 0.005,
                true, false, 200 + r * 30
            );
        }

        const colors = ['#bf55ec', '#ff007f', '#c77dff', '#fff', '#ffd166'];
        for (let i = 0; i < 60; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 12;
            this.spawnParticle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                2 + Math.random() * 7,
                colors[Math.floor(Math.random() * colors.length)],
                0.012 + Math.random() * 0.01,
                false, true
            );
        }
    }

    drawTextParticles() {
        if (this.textParticles.length === 0) return;
        this.ctx.save();
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        for (let i = this.textParticles.length - 1; i >= 0; i--) {
            const tp = this.textParticles[i];
            tp.y += tp.vy;
            tp.life -= tp.decay;
            
            if (tp.life <= 0) {
                this.textParticles.splice(i, 1);
                continue;
            }
            
            this.ctx.globalAlpha = Math.max(0, tp.life);
            this.ctx.fillStyle = tp.color;
            this.ctx.font = `bold ${tp.size}px "Cinzel", serif`;
            
            this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
            this.ctx.shadowBlur = 4;
            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 2;
            
            this.ctx.fillText(tp.text, tp.x, tp.y);
        }
        this.ctx.restore();
    }

    updateParticles() {
        // Update particles pool
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particlePool[i];
            if (!p.active) continue;

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
                p.active = false;
            }
        }

        // Update trails pool
        for (let i = 0; i < this.maxTrails; i++) {
            const t = this.trailPool[i];
            if (!t.active) continue;

            t.opacity -= t.decay;
            if (t.opacity <= 0) {
                t.active = false;
            }
        }

        // Update fire particles (always active)
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

        let itemsAboveLine = false;
        const now = Date.now();

        for (let i = 0; i < this.items.length; i++) {
            const body = this.items[i];
            const rad = body.circleRadius || 10;
            const topEdge = body.position.y - rad;
            const age = now - (body.creationTime || 0);

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
        if (window.gameAudio) window.gameAudio.playGameOver();
        if (this.callbacks.onWarningStateChange) this.callbacks.onWarningStateChange(false);
        this.callbacks.onGameOver();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.frameCount++;

        // Delta-Time Accumulator Loop (Decouples physics simulation frequency from display refresh rate)
        const currentTime = performance.now();
        let frameTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Cap frameTime to avoid lag spikes from locking up updates (spiral of death)
        if (frameTime > 250) {
            frameTime = 250;
        }

        this.accumulator += frameTime;

        if (!this.isGameOver && !this.isPaused) {
            while (this.accumulator >= this.timestep) {
                Matter.Engine.update(this.engine, this.timestep);
                this.accumulator -= this.timestep;
            }
        } else {
            this.accumulator = 0;
        }

        this.updateParticles();
        this.checkGameOverCondition();

        // Calculate screen shake offsets
        let dx = 0;
        let dy = 0;
        if (this.shakeDuration > 0) {
            dx = (Math.random() - 0.5) * this.shakeMagnitude;
            dy = (Math.random() - 0.5) * this.shakeMagnitude;
            this.shakeDuration--;
        }

        // Apply screen shake to canvas drawing offset in a single save/restore block
        this.ctx.save();
        this.ctx.translate(dx, dy);

        const now = Date.now();

        if (this.images.bg) {
            this.ctx.drawImage(this.images.bg, 0, 0, this.width, this.height);
        } else {
            this.drawProceduralBackground(now);
        }

        this.drawAmbientFog(now);
        this.drawRuneGlyphs(now);
        this.drawBackgroundEmbers(); // background embers render behind cauldron/items
        this.drawCauldronBackFluid();
        this.drawFireParticles();
        this.drawTrails();

        for (let i = 0; i < this.items.length; i++) {
            this.drawItemBody(this.items[i]);
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
        this.drawTextParticles();
        this.drawVignette();

        this.ctx.restore();
    }

    initCachedGradients() {
        // Cache Procedural Background
        this.cachedBgCanvas = document.createElement('canvas');
        this.cachedBgCanvas.width = this.width;
        this.cachedBgCanvas.height = this.height;
        const bgCtx = this.cachedBgCanvas.getContext('2d');
        const bgGrad = bgCtx.createRadialGradient(225, 375, 30, 225, 375, 480);
        bgGrad.addColorStop(0, '#1a1030');
        bgGrad.addColorStop(0.3, '#120a20');
        bgGrad.addColorStop(0.7, '#0a0614');
        bgGrad.addColorStop(1, '#04030a');
        bgCtx.fillStyle = bgGrad;
        bgCtx.fillRect(0, 0, this.width, this.height);
        
        // Add some static dust/stars to the cached bg
        bgCtx.globalAlpha = 0.3;
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * this.width;
            const y = Math.random() * this.height;
            bgCtx.fillStyle = Math.random() < 0.5 ? '#9d4edd' : '#bf55ec';
            bgCtx.fillRect(x, y, 1, 1);
        }

        // Cache Fog Puff (max radius around 80)
        this.cachedFogCanvas = document.createElement('canvas');
        this.cachedFogCanvas.width = 160;
        this.cachedFogCanvas.height = 160;
        const fogCtx = this.cachedFogCanvas.getContext('2d');
        const fogGrad = fogCtx.createRadialGradient(80, 80, 0, 80, 80, 80);
        fogGrad.addColorStop(0, 'rgba(157, 78, 221, 0.15)');
        fogGrad.addColorStop(0.5, 'rgba(60, 9, 108, 0.05)');
        fogGrad.addColorStop(1, 'transparent');
        fogCtx.fillStyle = fogGrad;
        fogCtx.fillRect(0, 0, 160, 160);

        // Cache Vignette Gradients
        this.topVignetteGrad = this.ctx.createLinearGradient(0, 0, 0, 120);
        this.topVignetteGrad.addColorStop(0, 'rgba(4, 3, 10, 0.7)');
        this.topVignetteGrad.addColorStop(1, 'transparent');

        this.botVignetteGrad = this.ctx.createLinearGradient(0, this.height - 50, 0, this.height);
        this.botVignetteGrad.addColorStop(0, 'transparent');
        this.botVignetteGrad.addColorStop(1, 'rgba(4, 3, 10, 0.4)');

        // Cache Cauldron back fluid gradients
        const surfY = 490;
        this.backFluidGrad = this.ctx.createLinearGradient(0, surfY, 0, 670);
        this.backFluidGrad.addColorStop(0, '#6a1fad');
        this.backFluidGrad.addColorStop(0.3, '#5a189a');
        this.backFluidGrad.addColorStop(0.6, '#3c096c');
        this.backFluidGrad.addColorStop(1, '#10002b');

        this.backFluidShimmerGrad = this.ctx.createLinearGradient(0, surfY, 0, surfY + 20);
        this.backFluidShimmerGrad.addColorStop(0, 'rgba(199, 125, 255, 1.0)');
        this.backFluidShimmerGrad.addColorStop(1, 'transparent');

        // Cache Cauldron front fluid gradient
        const frontSurfY = 495;
        this.frontFluidGrad = this.ctx.createLinearGradient(0, frontSurfY - 10, 0, frontSurfY + 60);
        this.frontFluidGrad.addColorStop(0, 'rgba(199, 125, 255, 0.4)');
        this.frontFluidGrad.addColorStop(0.15, 'rgba(157, 78, 221, 0.3)');
        this.frontFluidGrad.addColorStop(0.4, 'rgba(157, 78, 221, 0.15)');
        this.frontFluidGrad.addColorStop(1, 'rgba(60, 9, 108, 0.0)');

        // Cache Warning Line Gradient
        this.warnLineGrad = this.ctx.createLinearGradient(0, this.cauldronRimY - 30, 0, this.cauldronRimY);
        this.warnLineGrad.addColorStop(0, 'transparent');
        this.warnLineGrad.addColorStop(1, 'rgba(230, 57, 70, 1.0)');

        // Cache drop indicator line gradients per tier
        this.dropLineGradients = {};
        for (let tier = 1; tier <= 6; tier++) {
            const color = this.getTierData(tier).color;
            const grad = this.ctx.createLinearGradient(0, this.dropZoneY, 0, 490);
            grad.addColorStop(0, `${color}30`);
            grad.addColorStop(0.5, `${color}15`);
            grad.addColorStop(1, `${color}05`);
            this.dropLineGradients[tier] = grad;
        }

        // Cache item glow and pre-render procedural canvases per tier (Removes text and path overhead in loop)
        this.itemGlowGradients = {};
        this.cachedItemCanvases = {};
        for (let tier = 1; tier <= 6; tier++) {
            const data = this.getTierData(tier);
            const r = data.radius;

            // 1. Cached Glow Gradients
            const glowGrad = this.ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.6);
            glowGrad.addColorStop(0, data.color);
            glowGrad.addColorStop(0.5, data.color + '40');
            glowGrad.addColorStop(1, 'transparent');
            this.itemGlowGradients[tier] = glowGrad;

            // 2. Offscreen pre-rendered canvases for procedural vectors (emoji/shape caches)
            const itemCanvas = document.createElement('canvas');
            const size = Math.ceil(r * 2 + 6); // pad slightly for stroke width
            itemCanvas.width = size;
            itemCanvas.height = size;
            const itemCtx = itemCanvas.getContext('2d');

            itemCtx.translate(size / 2, size / 2);

            const procGrad = itemCtx.createRadialGradient(-r / 3, -r / 3, r / 8, 0, 0, r);
            procGrad.addColorStop(0, '#ffffff');
            procGrad.addColorStop(0.15, data.color);
            procGrad.addColorStop(0.6, data.color + 'aa');
            procGrad.addColorStop(1, '#0c0a10');

            itemCtx.fillStyle = procGrad;
            itemCtx.beginPath();
            itemCtx.arc(0, 0, r, 0, Math.PI * 2);
            itemCtx.fill();

            itemCtx.strokeStyle = data.color + '60';
            itemCtx.lineWidth = 1;
            itemCtx.beginPath();
            itemCtx.arc(0, 0, r * 0.65, 0, Math.PI * 2);
            itemCtx.stroke();

            itemCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            itemCtx.lineWidth = 1.5;
            itemCtx.beginPath();
            itemCtx.arc(0, 0, r, 0, Math.PI * 2);
            itemCtx.stroke();

            itemCtx.fillStyle = '#fff';
            itemCtx.textAlign = 'center';
            itemCtx.textBaseline = 'middle';

            switch (tier) {
                case 1:
                    itemCtx.fillStyle = 'rgba(255,255,255,0.9)';
                    itemCtx.beginPath();
                    itemCtx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
                    itemCtx.fill();
                    break;
                case 2:
                    itemCtx.font = `bold ${r * 1.1}px Arial`;
                    itemCtx.fillText('🦷', 0, 2);
                    break;
                case 3:
                    itemCtx.font = `${r}px Arial`;
                    itemCtx.fillText('🧪', 0, 2);
                    break;
                case 4:
                    itemCtx.font = `${r}px Arial`;
                    itemCtx.fillText('💍', 0, 2);
                    break;
                case 5:
                    itemCtx.font = `${r}px Arial`;
                    itemCtx.fillText('💀', 0, 2);
                    break;
                case 6:
                    itemCtx.font = `${r * 1.1}px Arial`;
                    itemCtx.fillText('👑', 0, 2);
                    break;
            }

            this.cachedItemCanvases[tier] = itemCanvas;
        }
    }

    drawProceduralBackground(now) {
        this.ctx.drawImage(this.cachedBgCanvas, 0, 0, this.width, this.height);
    }

    drawAmbientFog(now) {
        this.ctx.save();
        for (const fog of this.fogParticles) {
            fog.x += fog.speed;
            if (fog.x > this.width + fog.radius) fog.x = -fog.radius;

            const breathe = Math.sin(now / 3000 + fog.phase) * 0.015;
            this.ctx.globalAlpha = fog.opacity + breathe;

            // Draw using cached fog canvas
            this.ctx.drawImage(this.cachedFogCanvas, fog.x - fog.radius, fog.y - fog.radius, fog.radius * 2, fog.radius * 2);
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
        for (let i = 0; i < this.fireParticles.length; i++) {
            const f = this.fireParticles[i];
            this.ctx.globalAlpha = f.life * 0.8;
            this.ctx.fillStyle = f.color;
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawBackgroundEmbers() {
        for (let i = 0; i < this.backgroundEmbers.length; i++) {
            const e = this.backgroundEmbers[i];
            e.y -= e.speed;
            e.wavePhase += e.waveSpeed;
            e.x += Math.sin(e.wavePhase) * 0.15;
            if (e.y < -10) {
                e.y = this.height + 10;
                e.x = Math.random() * this.width;
            }
            this.ctx.globalAlpha = e.opacity;
            this.ctx.fillStyle = e.color;
            this.ctx.beginPath();
            this.ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawTrails() {
        const useShadow = !this.isMobile;
        for (let i = 0; i < this.maxTrails; i++) {
            const t = this.trailPool[i];
            if (!t.active) continue;

            this.ctx.globalAlpha = t.opacity;
            this.ctx.fillStyle = t.color;
            if (useShadow) {
                this.ctx.shadowBlur = 4;
                this.ctx.shadowColor = t.color;
            }
            this.ctx.beginPath();
            this.ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        if (useShadow) {
            this.ctx.shadowBlur = 0;
        }
        this.ctx.globalAlpha = 1.0;
    }

    drawVignette() {
        this.ctx.fillStyle = this.topVignetteGrad;
        this.ctx.fillRect(0, 0, this.width, 120);

        this.ctx.fillStyle = this.botVignetteGrad;
        this.ctx.fillRect(0, this.height - 50, this.width, 50);
    }

    drawItemBody(body) {
        const tier = body.tier;
        const data = this.getTierData(tier);
        if (!data) return;

        const pos = body.position;
        const angle = body.angle;

        // Consolidated drawing state into 1 save/restore block
        this.ctx.save();
        this.ctx.translate(pos.x, pos.y);

        // 1. Glow Layer (Cached gradient, shadows off on mobile)
        const useShadow = !this.isMobile;
        const pulseIntensity = 0.3 + Math.sin(Date.now() / 400 + tier * 1.5) * 0.15;
        this.ctx.globalAlpha = pulseIntensity;
        this.ctx.fillStyle = this.itemGlowGradients[tier];
        this.ctx.beginPath();
        this.ctx.arc(0, 0, data.radius * 1.6, 0, Math.PI * 2);
        this.ctx.fill();

        // 2. Rotate & Draw Core Body
        this.ctx.globalAlpha = 1.0;
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

        // 3. Draw outline (Outer stroke is drawn on same matrix transformation)
        this.ctx.globalAlpha = 0.4 + Math.sin(Date.now() / 500 + tier) * 0.15;
        this.ctx.strokeStyle = data.color;
        this.ctx.lineWidth = 2;
        if (useShadow) {
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = data.color;
        }
        this.ctx.beginPath();
        this.ctx.arc(0, 0, data.radius + 1.5, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.restore();
    }

    drawProceduralVector(tier, data) {
        // Fast offscreen canvas drawing replaces multiple paths/text drawing in frame
        const canvas = this.cachedItemCanvases[tier];
        if (canvas) {
            this.ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
        }
    }

    clipToBowl(topY) {
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

        // Cached back fluid gradient
        this.ctx.fillStyle = this.backFluidGrad;
        this.ctx.fillRect(80, surfY, 290, 180);

        // Cached back fluid shimmer gradient
        this.ctx.save();
        this.ctx.globalAlpha = 0.1 + Math.sin(Date.now() / 800) * 0.05;
        this.ctx.fillStyle = this.backFluidShimmerGrad;
        this.ctx.fillRect(95, surfY, 260, 20);
        this.ctx.restore();

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

        // Cached front fluid gradient
        this.ctx.fillStyle = this.frontFluidGrad;

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
        const useShadow = !this.isMobile;

        this.ctx.save();
        if (this.isAboveLine) {
            const flash = Math.sin(Date.now() / 100) > 0;
            this.ctx.strokeStyle = flash ? '#ff0000' : '#880000';
            this.ctx.lineWidth = 3;
            if (useShadow) {
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = '#ff0000';
            }

            this.ctx.beginPath();
            this.ctx.moveTo(85, y);
            this.ctx.lineTo(365, y);
            this.ctx.stroke();

            // Cached warning line gradient with alpha adjustment
            this.ctx.save();
            this.ctx.globalAlpha = flash ? 0.15 : 0.05;
            this.ctx.fillStyle = this.warnLineGrad;
            this.ctx.fillRect(85, y - 30, 280, 30);
            this.ctx.restore();

            if (useShadow) this.ctx.shadowBlur = 0;
            this.ctx.fillStyle = '#ff3333';
            this.ctx.font = 'bold 12px Cinzel';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            if (useShadow) {
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = '#ff0000';
            }
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
        // Cached indicator gradient
        this.ctx.strokeStyle = this.dropLineGradients[this.currentTierIndex];
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

        const useShadow = !this.isMobile;
        if (useShadow) {
            this.ctx.shadowBlur = 15;
            this.ctx.shadowColor = data.color;
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
        const useShadow = !this.isMobile;
        if (useShadow) {
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = 'rgba(157, 78, 221, 0.3)';
        }
        this.ctx.beginPath();
        this.ctx.ellipse(225, 340, 165, 20, 0, 0, Math.PI * 2);
        this.ctx.stroke();
        if (useShadow) this.ctx.shadowBlur = 0;

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
        const useShadow = !this.isMobile;
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particlePool[i];
            if (!p.active) continue;

            this.ctx.globalAlpha = p.opacity;
            if (p.isRing) {
                this.ctx.strokeStyle = p.color;
                this.ctx.lineWidth = Math.max(1, 4 - p.radius * 0.02);
                if (useShadow) {
                    this.ctx.shadowBlur = 10;
                    this.ctx.shadowColor = p.color;
                }
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.stroke();
            } else if (p.isSpark) {
                if (useShadow) {
                    this.ctx.shadowBlur = 8;
                    this.ctx.shadowColor = p.color;
                }
                this.ctx.fillStyle = '#fff';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius * 0.4, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                if (useShadow) {
                    this.ctx.shadowBlur = 6;
                    this.ctx.shadowColor = p.color;
                }
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        if (useShadow) {
            this.ctx.shadowBlur = 0;
        }
        this.ctx.globalAlpha = 1.0;
    }

    shake(duration = 15, magnitude = 5) {
        this.shakeDuration = duration;
        this.shakeMagnitude = magnitude;
    }

    resetWorld() {
        const { World } = Matter;

        this.shakeDuration = 0;
        this.shakeMagnitude = 0;

        for (let i = 0; i < this.items.length; i++) {
            World.remove(this.world, this.items[i]);
        }
        this.items = [];

        this.engine = null;
        this.world = null;

        this.initCachedGradients();
        this.initMatter();

        // Reset particle and trail pools
        for (let i = 0; i < this.maxParticles; i++) {
            this.particlePool[i].active = false;
        }
        for (let i = 0; i < this.maxTrails; i++) {
            this.trailPool[i].active = false;
        }

        this.textParticles = [];
        this.isGameOver = false;
        this.isAboveLine = false;
        this.hasAscended = false;
        this.isPaused = false;

        if (this.warningTimer) {
            clearInterval(this.warningTimer);
            this.warningTimer = null;
        }

        this.rollNextIngredients();
    }
}

window.CruciblePhysics = CruciblePhysics;