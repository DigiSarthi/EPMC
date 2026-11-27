/* ==========================================================================
   A Little Appreciation For You ❤️ — Cinematic Video Controller
   Plays assets/video/ruchi.mp4 with original audio & gates Scene 4 on end.
   ========================================================================== */

(function (window) {
  'use strict';

  const DEFAULT_VIDEO_PATH = 'assets/video/ruchi.mp4';

  let videoEl = null;
  let playOverlay = null;
  let missingNotice = null;
  let localPicker = null;
  let onEndedCallback = null;
  let currentObjectUrl = null;
  let hasEnded = false;
  let isMissingSource = false;

  function showOverlay(el) {
    if (el) el.classList.remove('is-hidden');
  }

  function hideOverlay(el) {
    if (el) el.classList.add('is-hidden');
  }

  function ensureOriginalAudio() {
    if (!videoEl) return;
    videoEl.muted = false;
    videoEl.defaultMuted = false;
    videoEl.volume = 1.0;
  }

  function handleVideoError() {
    isMissingSource = true;
    hideOverlay(playOverlay);
    showOverlay(missingNotice);
  }

  function attemptPlayback() {
    if (!videoEl) return;
    ensureOriginalAudio();
    hideOverlay(playOverlay);

    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          isMissingSource = false;
          hideOverlay(playOverlay);
          hideOverlay(missingNotice);
        })
        .catch(() => {
          // Distinguish between a missing video file vs. browser autoplay restriction
          if (videoEl.error || videoEl.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
            handleVideoError();
          } else {
            showOverlay(playOverlay);
          }
        });
    }
  }

  function init(options) {
    videoEl = document.getElementById('ruchiVideo');
    playOverlay = document.getElementById('videoPlayOverlay');
    missingNotice = document.getElementById('videoMissingNotice');
    localPicker = document.getElementById('localVideoPicker');
    const manualPlayBtn = document.getElementById('btnManualPlay');
    const previewEndingBtn = document.getElementById('btnPreviewEnding');

    onEndedCallback = options && typeof options.onEnded === 'function' ? options.onEnded : null;
    if (!videoEl) return;

    ensureOriginalAudio();

    // Detect missing assets/video/ruchi.mp4 gracefully without using any placeholder video
    videoEl.addEventListener('error', handleVideoError);
    const sourceEl = videoEl.querySelector('source');
    if (sourceEl) {
      sourceEl.addEventListener('error', handleVideoError);
    } else if (!videoEl.getAttribute('src')) {
      isMissingSource = true;
    }

    videoEl.addEventListener('loadeddata', () => {
      isMissingSource = false;
      hideOverlay(missingNotice);
    });

    videoEl.addEventListener('playing', () => {
      ensureOriginalAudio();
      hideOverlay(playOverlay);
      hideOverlay(missingNotice);
    });

    // Strict Gate: Trigger Scene 4 ONLY when the video finishes playing
    videoEl.addEventListener('ended', () => {
      if (hasEnded) return;
      hasEnded = true;
      if (onEndedCallback) onEndedCallback();
    });

    if (manualPlayBtn) {
      manualPlayBtn.addEventListener('click', () => {
        attemptPlayback();
      });
    }

    // Optional local video tester ONLY visible if assets/video/ruchi.mp4 has not been added yet
    if (localPicker) {
      localPicker.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        if (currentObjectUrl) {
          URL.revokeObjectURL(currentObjectUrl);
        }
        currentObjectUrl = URL.createObjectURL(file);
        isMissingSource = false;
        hasEnded = false;

        hideOverlay(missingNotice);
        hideOverlay(playOverlay);

        videoEl.src = currentObjectUrl;
        videoEl.load();
        attemptPlayback();
      });
    }

    // Only visible inside the missing-file notice so the creator can preview Scene 4 before adding ruchi.mp4
    if (previewEndingBtn) {
      previewEndingBtn.addEventListener('click', () => {
        if (!isMissingSource) return;
        hasEnded = true;
        if (onEndedCallback) onEndedCallback();
      });
    }
  }

  /**
   * Called directly inside the "Open My Surprise" user click handler so mobile
   * and desktop browsers allow immediate playback with original audio.
   */
  function startFromUserGesture() {
    if (!videoEl) return;
    hasEnded = false;
    ensureOriginalAudio();

    if (isMissingSource) {
      showOverlay(missingNotice);
      return;
    }

    attemptPlayback();
  }

  function reset() {
    if (!videoEl) return;
    hasEnded = false;
    videoEl.pause();
    try {
      videoEl.currentTime = 0;
    } catch (_) {
      // Ignore if metadata not loaded yet
    }
    hideOverlay(playOverlay);
    if (!currentObjectUrl && !videoEl.getAttribute('src')) {
      const sourceEl = videoEl.querySelector('source');
      if (sourceEl && sourceEl.getAttribute('src') !== DEFAULT_VIDEO_PATH) {
        sourceEl.setAttribute('src', DEFAULT_VIDEO_PATH);
      }
    }
  }

  window.RuchiVideo = {
    init,
    startFromUserGesture,
    reset
  };
})(window);
