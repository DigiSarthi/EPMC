/* ==========================================================================
   A Little Appreciation For You ❤️ — Animations & 60 FPS Canvas Engine
   ========================================================================== */

(function (window) {
  'use strict';

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hasGSAP = () => typeof window.gsap !== 'undefined';

  let canvasRafId = null;
  let activeTypingTimers = [];
  let ambientParticles = [];
  let ambientCanvas = null;
  let ambientCtx = null;
  let canvasWidth = 0;
  let canvasHeight = 0;

  /* ------------------------------------------------------------------------
     Utility: Clear any pending typing timers (prevents overlap on replay)
     ------------------------------------------------------------------------ */
  function clearTypingTimers() {
    activeTypingTimers.forEach((id) => clearTimeout(id));
    activeTypingTimers = [];
  }

  /* ------------------------------------------------------------------------
     60 FPS Ambient Romantic Canvas (Glowing Bokeh, Floating Hearts & Petals)
     ------------------------------------------------------------------------ */
  function getAdaptiveCounts() {
    const isSmallScreen = window.innerWidth < 640;
    const lowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
    if (prefersReducedMotion()) {
      return { sparkles: 16, hearts: 8, petals: 6 };
    }
    if (isSmallScreen || lowCores) {
      return { sparkles: 24, hearts: 12, petals: 10 };
    }
    return { sparkles: 42, hearts: 20, petals: 16 };
  }

  function createParticle(type, randomY) {
    const blushPalette = [
      'rgba(244, 143, 177, ',
      'rgba(248, 187, 208, ',
      'rgba(216, 59, 114, ',
      'rgba(209, 196, 233, ',
      'rgba(255, 245, 238, ',
      'rgba(235, 188, 128, '
    ];
    const colorPrefix = blushPalette[Math.floor(Math.random() * blushPalette.length)];
    const y = randomY
      ? Math.random() * canvasHeight
      : type === 'petal'
        ? -20
        : canvasHeight + 20 + Math.random() * 60;

    if (type === 'sparkle') {
      return {
        type: 'sparkle',
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        r: 1.4 + Math.random() * 3.4,
        vx: (Math.random() - 0.5) * 0.28,
        vy: -0.15 - Math.random() * 0.35,
        alpha: 0.25 + Math.random() * 0.55,
        twinkleSpeed: 0.012 + Math.random() * 0.02,
        phase: Math.random() * Math.PI * 2,
        colorPrefix
      };
    }

    if (type === 'heart') {
      return {
        type: 'heart',
        x: Math.random() * canvasWidth,
        y,
        size: 7 + Math.random() * 13,
        vy: -0.35 - Math.random() * 0.65,
        swayAmp: 0.3 + Math.random() * 0.8,
        swaySpeed: 0.008 + Math.random() * 0.015,
        phase: Math.random() * Math.PI * 2,
        rotation: (Math.random() - 0.5) * 0.5,
        alpha: 0.22 + Math.random() * 0.38,
        colorPrefix
      };
    }

    return {
      type: 'petal',
      x: Math.random() * canvasWidth,
      y,
      rx: 4 + Math.random() * 5,
      ry: 7 + Math.random() * 7,
      vx: -0.25 + Math.random() * 0.65,
      vy: 0.4 + Math.random() * 0.75,
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.025,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.28 + Math.random() * 0.36,
      colorPrefix
    };
  }

  function drawHeartPath(ctx, x, y, size, rotation, fillStyle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.beginPath();
    const s = size * 0.5;
    ctx.moveTo(0, s * 0.4);
    ctx.bezierCurveTo(-s, -s * 0.45, -s * 1.15, s * 0.7, 0, s * 1.45);
    ctx.bezierCurveTo(s * 1.15, s * 0.7, s, -s * 0.45, 0, s * 0.4);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }

  function drawAmbientFrame(animate) {
    if (!ambientCtx) return;
    ambientCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    for (let i = 0; i < ambientParticles.length; i++) {
      const p = ambientParticles[i];

      if (p.type === 'sparkle') {
        if (animate) {
          p.x += p.vx;
          p.y += p.vy;
          p.phase += p.twinkleSpeed;
          if (p.y < -12) p.y = canvasHeight + 12;
          if (p.x < -12) p.x = canvasWidth + 12;
          if (p.x > canvasWidth + 12) p.x = -12;
        }
        const a = Math.max(0.08, p.alpha * (0.55 + 0.45 * Math.sin(p.phase)));
        const grad = ambientCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.8);
        grad.addColorStop(0, p.colorPrefix + a.toFixed(2) + ')');
        grad.addColorStop(1, p.colorPrefix + '0)');
        ambientCtx.fillStyle = grad;
        ambientCtx.beginPath();
        ambientCtx.arc(p.x, p.y, p.r * 2.8, 0, Math.PI * 2);
        ambientCtx.fill();
      } else if (p.type === 'heart') {
        if (animate) {
          p.phase += p.swaySpeed;
          p.x += Math.sin(p.phase) * p.swayAmp;
          p.y += p.vy;
          if (p.y < -36) {
            p.y = canvasHeight + 28;
            p.x = Math.random() * canvasWidth;
          }
        }
        drawHeartPath(
          ambientCtx,
          p.x,
          p.y,
          p.size,
          p.rotation + Math.sin(p.phase) * 0.16,
          p.colorPrefix + p.alpha.toFixed(2) + ')'
        );
      } else if (p.type === 'petal') {
        if (animate) {
          p.phase += 0.018;
          p.x += p.vx + Math.sin(p.phase) * 0.35;
          p.y += p.vy;
          p.rotation += p.rotSpeed;
          if (p.y > canvasHeight + 24) {
            p.y = -20;
            p.x = Math.random() * canvasWidth;
          }
        }
        ambientCtx.save();
        ambientCtx.translate(p.x, p.y);
        ambientCtx.rotate(p.rotation);
        ambientCtx.beginPath();
        ambientCtx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2);
        ambientCtx.fillStyle = p.colorPrefix + p.alpha.toFixed(2) + ')';
        ambientCtx.fill();
        ambientCtx.restore();
      }
    }
  }

  function populateAmbientParticles() {
    const counts = getAdaptiveCounts();
    ambientParticles = [];
    for (let i = 0; i < counts.sparkles; i++) ambientParticles.push(createParticle('sparkle', true));
    for (let i = 0; i < counts.hearts; i++) ambientParticles.push(createParticle('heart', true));
    for (let i = 0; i < counts.petals; i++) ambientParticles.push(createParticle('petal', true));
  }

  function resizeAmbientCanvas() {
    if (!ambientCanvas || !ambientCtx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    ambientCanvas.width = Math.floor(canvasWidth * dpr);
    ambientCanvas.height = Math.floor(canvasHeight * dpr);
    ambientCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    populateAmbientParticles();
    if (prefersReducedMotion()) {
      drawAmbientFrame(false);
    }
  }

  function initAmbientCanvas(canvasEl) {
    if (!canvasEl) return;
    ambientCanvas = canvasEl;
    ambientCtx = canvasEl.getContext('2d');
    if (!ambientCtx) return;

    resizeAmbientCanvas();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeAmbientCanvas, 180);
    });

    if (prefersReducedMotion()) {
      drawAmbientFrame(false);
      return;
    }

    function loop() {
      if (!document.hidden) {
        drawAmbientFrame(true);
      }
      canvasRafId = window.requestAnimationFrame(loop);
    }

    if (canvasRafId) window.cancelAnimationFrame(canvasRafId);
    canvasRafId = window.requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------------
     Interactive Heart Burst & Touch Sparkles
     ------------------------------------------------------------------------ */
  function createBurstHearts(originX, originY, count) {
    const layer = document.getElementById('explosionLayer');
    if (!layer) return;

    const total = prefersReducedMotion() ? Math.min(8, count) : count;
    const colors = ['#ff5e95', '#f48fb1', '#d83b72', '#ce93d8', '#f6c177', '#ff8ab4'];
    const symbols = ['❤️', '💖', '💕', '✨', '🌸'];

    for (let i = 0; i < total; i++) {
      const el = document.createElement('span');
      el.className = 'burst-heart';
      el.textContent = symbols[i % symbols.length];
      const size = 14 + Math.random() * 20;
      el.style.left = `${originX}px`;
      el.style.top = `${originY}px`;
      el.style.fontSize = `${size}px`;
      el.style.color = colors[i % colors.length];
      layer.appendChild(el);

      const angle = (Math.PI * 2 * i) / total + (Math.random() - 0.5) * 0.45;
      const dist = 70 + Math.random() * Math.min(window.innerWidth * 0.42, 260);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 24;

      if (hasGSAP() && !prefersReducedMotion()) {
        window.gsap.fromTo(
          el,
          { x: -size / 2, y: -size / 2, scale: 0.25, opacity: 1, rotation: 0 },
          {
            x: dx,
            y: dy,
            scale: 0.7 + Math.random() * 0.85,
            opacity: 0,
            rotation: (Math.random() - 0.5) * 140,
            duration: 0.95 + Math.random() * 0.65,
            ease: 'power3.out',
            onComplete: () => el.remove()
          }
        );
      } else {
        el.style.transition = 'transform 0.9s ease-out, opacity 0.9s ease-out';
        window.requestAnimationFrame(() => {
          el.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
          el.style.opacity = '0';
        });
        setTimeout(() => el.remove(), 950);
      }
    }
  }

  function spawnFloatingEmoji(x, y, emoji) {
    const pop = document.createElement('span');
    pop.className = 'floating-emoji-pop';
    pop.textContent = emoji;
    pop.style.left = `${x}px`;
    pop.style.top = `${y}px`;
    document.body.appendChild(pop);

    if (hasGSAP() && !prefersReducedMotion()) {
      window.gsap.fromTo(
        pop,
        { x: -12, y: 0, scale: 0.6, opacity: 1 },
        {
          x: (Math.random() - 0.5) * 56,
          y: -95 - Math.random() * 45,
          scale: 1.35,
          opacity: 0,
          duration: 1.15,
          ease: 'power2.out',
          onComplete: () => pop.remove()
        }
      );
    } else {
      setTimeout(() => pop.remove(), 700);
    }
  }

  function celebrationHeartShower() {
    const layer = document.getElementById('explosionLayer');
    if (!layer) return;
    const count = prefersReducedMotion() ? 10 : 28;
    const symbols = ['❤️', '💖', '💕', '🌸', '✨', '💗'];

    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'burst-heart';
      el.textContent = symbols[i % symbols.length];
      el.style.left = `${6 + Math.random() * 88}vw`;
      el.style.top = `${window.innerHeight + 20}px`;
      el.style.fontSize = `${16 + Math.random() * 20}px`;
      layer.appendChild(el);

      if (hasGSAP() && !prefersReducedMotion()) {
        window.gsap.to(el, {
          y: -(window.innerHeight + 120),
          x: (Math.random() - 0.5) * 110,
          rotation: (Math.random() - 0.5) * 90,
          opacity: 0,
          duration: 2.4 + Math.random() * 1.6,
          delay: Math.random() * 0.7,
          ease: 'power1.out',
          onComplete: () => el.remove()
        });
      } else {
        setTimeout(() => el.remove(), 900);
      }
    }
  }

  /* ------------------------------------------------------------------------
     Scene Transitions & Per-Scene Choreography
     ------------------------------------------------------------------------ */
  function playScene1Intro() {
    const targets = ['#scene1 .eyebrow-tag', '#introHeartBtn', '#introLine1', '#introLine2', '#btnToScene2'];
    if (!hasGSAP() || prefersReducedMotion()) {
      targets.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.style.opacity = '1';
          el.style.transform = 'none';
        }
      });
      return;
    }

    const tl = window.gsap.timeline();
    tl.fromTo('#scene1 .eyebrow-tag', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, ease: 'power3.out' })
      .fromTo('#introHeartBtn', { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.0, ease: 'back.out(1.45)' }, '-=0.35')
      .fromTo('#introLine1', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.95, ease: 'power3.out' }, '-=0.3')
      .fromTo('#introLine2', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, '+=0.25')
      .fromTo('#btnToScene2', { y: 18, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.4)' }, '+=0.2');
  }

  function transitionScenes(fromEl, toEl, onReady) {
    if (!fromEl || !toEl) return;

    const finishSwap = () => {
      fromEl.classList.remove('is-active');
      fromEl.setAttribute('aria-hidden', 'true');
      toEl.classList.add('is-active');
      toEl.setAttribute('aria-hidden', 'false');
      window.scrollTo({ top: 0, behavior: 'auto' });

      if (hasGSAP() && !prefersReducedMotion()) {
        window.gsap.fromTo(
          toEl,
          { opacity: 0, y: 22, scale: 0.985 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.72,
            ease: 'power3.out',
            onComplete: () => {
              if (typeof onReady === 'function') onReady();
            }
          }
        );
      } else {
        toEl.style.opacity = '1';
        if (typeof onReady === 'function') onReady();
      }
    };

    if (hasGSAP() && !prefersReducedMotion()) {
      window.gsap.to(fromEl, {
        opacity: 0,
        y: -18,
        scale: 0.985,
        duration: 0.45,
        ease: 'power2.in',
        onComplete: finishSwap
      });
    } else {
      finishSwap();
    }
  }

  function typeSingleLine(bubbleEl, textEl, text, onDone) {
    if (!bubbleEl || !textEl) {
      if (onDone) onDone();
      return;
    }

    textEl.textContent = '';

    if (hasGSAP() && !prefersReducedMotion()) {
      window.gsap.to(bubbleEl, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
    } else {
      bubbleEl.style.opacity = '1';
      bubbleEl.style.transform = 'none';
    }

    if (prefersReducedMotion()) {
      textEl.textContent = text;
      const t = setTimeout(() => onDone && onDone(), 350);
      activeTypingTimers.push(t);
      return;
    }

    const chars = Array.from(text);
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    textEl.appendChild(cursor);

    let index = 0;
    function step() {
      if (index < chars.length) {
        cursor.insertAdjacentText('beforebegin', chars[index]);
        index += 1;
        const speed = chars[index - 1] === '.' || chars[index - 1] === '!' || chars[index - 1] === '?' ? 120 : 36;
        activeTypingTimers.push(setTimeout(step, speed));
      } else {
        cursor.remove();
        activeTypingTimers.push(setTimeout(() => onDone && onDone(), 520));
      }
    }

    activeTypingTimers.push(setTimeout(step, 220));
  }

  function playScene2Dialogue(lines, onAllDone) {
    clearTypingTimers();

    const moodBadge = document.getElementById('moodBadge');
    const nextBtn = document.getElementById('btnToScene3');
    const moods = ['🤨', '😤', '🥺'];

    if (nextBtn) nextBtn.classList.add('is-hidden');

    lines.forEach((_, idx) => {
      const b = document.getElementById(`dialogueBubble${idx + 1}`);
      const t = document.getElementById(`typedLine${idx + 1}`);
      if (b) {
        b.style.opacity = '0';
        b.style.transform = 'translateY(14px)';
      }
      if (t) t.textContent = '';
    });

    function runLine(i) {
      if (i >= lines.length) {
        if (nextBtn) {
          nextBtn.classList.remove('is-hidden');
          if (hasGSAP() && !prefersReducedMotion()) {
            window.gsap.fromTo(
              nextBtn,
              { y: 16, opacity: 0, scale: 0.92 },
              { y: 0, opacity: 1, scale: 1, duration: 0.65, ease: 'back.out(1.5)' }
            );
          }
        }
        if (typeof onAllDone === 'function') onAllDone();
        return;
      }

      if (moodBadge && moods[i]) {
        moodBadge.textContent = moods[i];
        if (hasGSAP() && !prefersReducedMotion()) {
          window.gsap.fromTo(moodBadge, { scale: 0.5, rotate: -14 }, { scale: 1, rotate: 0, duration: 0.45, ease: 'back.out(2)' });
        }
      }

      typeSingleLine(
        document.getElementById(`dialogueBubble${i + 1}`),
        document.getElementById(`typedLine${i + 1}`),
        lines[i],
        () => runLine(i + 1)
      );
    }

    runLine(0);
  }

  function animateEnvelopeOpen(onComplete) {
    const flap = document.getElementById('envelopeFlap');
    const seal = document.getElementById('waxSeal');
    const letter = document.querySelector('.envelope-letter');
    const envelopeEl = document.getElementById('loveEnvelope');

    const rect = envelopeEl
      ? envelopeEl.getBoundingClientRect()
      : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    if (!hasGSAP() || prefersReducedMotion()) {
      createBurstHearts(cx, cy, 14);
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const tl = window.gsap.timeline({
      onComplete: () => {
        if (typeof onComplete === 'function') onComplete();
      }
    });

    tl.to(seal, { scale: 1.25, opacity: 0, duration: 0.25, ease: 'power2.in' })
      .to(flap, { rotateX: 165, duration: 0.42, ease: 'power2.inOut' }, '-=0.1')
      .to(letter, { y: -36, scale: 1.05, duration: 0.35, ease: 'back.out(1.6)' }, '-=0.15')
      .add(() => createBurstHearts(cx, cy, 34), '-=0.12')
      .to('#envelopeStage', { opacity: 0, scale: 0.92, duration: 0.35, ease: 'power2.in' }, '+=0.15');
  }

  function resetEnvelopeVisuals() {
    if (hasGSAP()) {
      window.gsap.set(['#waxSeal', '#envelopeFlap', '.envelope-letter', '#envelopeStage'], { clearProps: 'all' });
    }
  }

  function playVideoEntrance() {
    const frame = document.getElementById('videoFrameOuter');
    const tag = document.querySelector('.video-tag');
    const footnote = document.getElementById('videoFootnote');
    if (!hasGSAP() || prefersReducedMotion()) return;

    const tl = window.gsap.timeline();
    tl.fromTo(tag, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out' })
      .fromTo(frame, { scale: 0.88, y: 24, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.85, ease: 'power3.out' }, '-=0.25')
      .fromTo(footnote, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }, '-=0.3');
  }

  function playScene4Finale() {
    celebrationHeartShower();
    if (!hasGSAP() || prefersReducedMotion()) return;

    const tl = window.gsap.timeline();
    tl.fromTo('#finaleHeartWrap', { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: 'back.out(1.6)' })
      .fromTo('#finaleLine1', { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, '-=0.3')
      .fromTo('#finaleLine2', { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.85, ease: 'power3.out' }, '+=0.2')
      .fromTo('#finaleLine3', { y: 22, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.95, ease: 'power3.out' }, '+=0.25')
      .fromTo('#finaleSignature', { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out' }, '+=0.15')
      .fromTo('#finaleActions', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power2.out' }, '-=0.2');
  }

  window.RuchiAnimations = {
    initAmbientCanvas,
    createBurstHearts,
    spawnFloatingEmoji,
    celebrationHeartShower,
    playScene1Intro,
    transitionScenes,
    playScene2Dialogue,
    clearTypingTimers,
    animateEnvelopeOpen,
    resetEnvelopeVisuals,
    playVideoEntrance,
    playScene4Finale
  };
})(window);
