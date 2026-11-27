/* ==========================================================================
   A Little Appreciation For You ❤️ — Main Application Flow & Interactions
   ========================================================================== */

(function (window, document) {
  'use strict';

  const DIALOGUE_LINES = [
    'Madam ji, ek complaint hai aapse!',
    'Kehti ho na ki main tumhari tarif nahi karta?',
    'Achhaaaa... toh aaj kuch dikhata hoon! 🥺❤️'
  ];

  let currentSceneNumber = 1;
  let isTransitioning = false;
  let surpriseOpened = false;

  function updateChapterDots(activeNum) {
    const dots = document.querySelectorAll('[data-scene-dot]');
    dots.forEach((dot) => {
      const num = Number(dot.getAttribute('data-scene-dot'));
      dot.classList.toggle('is-active', num === activeNum);
      dot.classList.toggle('is-completed', num < activeNum);
    });
  }

  function goToScene(targetNum, afterEnter) {
    if (isTransitioning || targetNum === currentSceneNumber) return;
    const fromEl = document.getElementById(`scene${currentSceneNumber}`);
    const toEl = document.getElementById(`scene${targetNum}`);
    if (!fromEl || !toEl) return;

    isTransitioning = true;
    currentSceneNumber = targetNum;
    updateChapterDots(targetNum);

    window.RuchiAnimations.transitionScenes(fromEl, toEl, () => {
      isTransitioning = false;
      if (typeof afterEnter === 'function') afterEnter();
    });
  }

  function dismissLoadingScreen() {
    const loader = document.getElementById('loadingScreen');
    if (loader && !loader.classList.contains('is-loaded')) {
      loader.classList.add('is-loaded');
      setTimeout(() => {
        loader.style.display = 'none';
      }, 720);
      window.RuchiAnimations.playScene1Intro();
    }
  }

  function bindScene1Interactions() {
    const heartBtn = document.getElementById('introHeartBtn');
    const continueBtn = document.getElementById('btnToScene2');

    if (heartBtn) {
      heartBtn.addEventListener('click', (e) => {
        const rect = heartBtn.getBoundingClientRect();
        const x = e.clientX || rect.left + rect.width / 2;
        const y = e.clientY || rect.top + rect.height / 2;
        window.RuchiAnimations.createBurstHearts(x, y, 16);
      });
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        goToScene(2, () => {
          window.RuchiAnimations.playScene2Dialogue(DIALOGUE_LINES);
        });
      });
    }
  }

  function bindScene2Interactions() {
    const reactionPills = document.querySelectorAll('.reaction-pill');
    const replyEl = document.getElementById('reactionReply');
    const toScene3Btn = document.getElementById('btnToScene3');

    reactionPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const emoji = pill.getAttribute('data-emoji') || '❤️';
        const reply = pill.getAttribute('data-reply') || '';
        const rect = pill.getBoundingClientRect();
        const x = e.clientX || rect.left + rect.width / 2;
        const y = e.clientY || rect.top;

        pill.classList.add('is-tapped');
        if (replyEl && reply) {
          replyEl.textContent = reply;
        }
        window.RuchiAnimations.spawnFloatingEmoji(x, y, emoji);
        window.RuchiAnimations.spawnFloatingEmoji(x + 18, y - 6, '❤️');
      });
    });

    if (toScene3Btn) {
      toScene3Btn.addEventListener('click', () => {
        window.RuchiAnimations.clearTypingTimers();
        goToScene(3);
      });
    }
  }

  function triggerVideoReveal() {
    if (surpriseOpened) return;
    surpriseOpened = true;

    const envelopeStage = document.getElementById('envelopeStage');
    const videoStage = document.getElementById('videoStage');

    // Reveal the video container & invoke playback inside the direct user gesture
    // so mobile iOS/Android & desktop browsers allow original unmuted audio.
    if (videoStage) {
      videoStage.classList.remove('is-hidden');
      videoStage.setAttribute('aria-hidden', 'false');
      videoStage.style.opacity = '0';
      videoStage.style.position = 'absolute';
      videoStage.style.pointerEvents = 'none';
    }

    window.RuchiVideo.startFromUserGesture();

    window.RuchiAnimations.animateEnvelopeOpen(() => {
      if (envelopeStage) envelopeStage.classList.add('is-hidden');
      if (videoStage) {
        videoStage.style.position = 'relative';
        videoStage.style.opacity = '1';
        videoStage.style.pointerEvents = 'auto';
        window.RuchiAnimations.playVideoEntrance();
      }
    });
  }

  function bindScene3Interactions() {
    const openBtn = document.getElementById('btnOpenSurprise');
    const envelopeEl = document.getElementById('loveEnvelope');

    if (openBtn) {
      openBtn.addEventListener('click', triggerVideoReveal);
    }

    if (envelopeEl) {
      envelopeEl.addEventListener('click', triggerVideoReveal);
      envelopeEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerVideoReveal();
        }
      });
    }
  }

  function bindScene4Interactions() {
    const showerBtn = document.getElementById('btnHeartShower');
    const replayBtn = document.getElementById('btnReplay');

    if (showerBtn) {
      showerBtn.addEventListener('click', (e) => {
        const rect = showerBtn.getBoundingClientRect();
        window.RuchiAnimations.createBurstHearts(rect.left + rect.width / 2, rect.top, 20);
        window.RuchiAnimations.celebrationHeartShower();
      });
    }

    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        surpriseOpened = false;
        window.RuchiVideo.reset();
        window.RuchiAnimations.resetEnvelopeVisuals();

        const envelopeStage = document.getElementById('envelopeStage');
        const videoStage = document.getElementById('videoStage');
        if (envelopeStage) envelopeStage.classList.remove('is-hidden');
        if (videoStage) {
          videoStage.classList.add('is-hidden');
          videoStage.setAttribute('aria-hidden', 'true');
        }

        const replyEl = document.getElementById('reactionReply');
        if (replyEl) replyEl.textContent = 'Tap a reaction while you read ✨';
        document.querySelectorAll('.reaction-pill').forEach((p) => p.classList.remove('is-tapped'));

        goToScene(1, () => {
          window.RuchiAnimations.playScene1Intro();
        });
      });
    }
  }

  function bindAmbientTouchSparkles() {
    let lastSparkleTime = 0;
    document.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, video, input, label, .love-envelope')) return;
      const now = Date.now();
      if (now - lastSparkleTime < 220) return;
      lastSparkleTime = now;
      window.RuchiAnimations.spawnFloatingEmoji(e.clientX, e.clientY, Math.random() > 0.4 ? '✨' : '💕');
    });
  }

  function initApp() {
    window.RuchiAnimations.initAmbientCanvas(document.getElementById('ambientCanvas'));

    window.RuchiVideo.init({
      onEnded: () => {
        goToScene(4, () => {
          window.RuchiAnimations.playScene4Finale();
        });
      }
    });

    bindScene1Interactions();
    bindScene2Interactions();
    bindScene3Interactions();
    bindScene4Interactions();
    bindAmbientTouchSparkles();
    updateChapterDots(1);

    // Dismiss loading screen smoothly once fonts/assets settle, with a safe fallback timer
    const minDisplayDelay = new Promise((resolve) => setTimeout(resolve, 650));
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

    Promise.race([
      Promise.all([minDisplayDelay, fontsReady]),
      new Promise((resolve) => setTimeout(resolve, 1800))
    ]).then(dismissLoadingScreen);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})(window, document);
