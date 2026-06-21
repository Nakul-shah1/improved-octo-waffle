/**
 * NSFW Filter - Content Script
 * Scans images and videos on the page using NSFWJS model.
 * Supports Google Images and Bing Images real-time filtering.
 */

(function () {
  'use strict';

  // State
  let model = null;
  let settings = {
    sensitivity: 'medium',    // low, medium, high
    action: 'blur',           // blur, remove
    whitelist: [],
    blockedKeywords: [],
    enabled: true
  };

  // Sensitivity thresholds for each class
  const THRESHOLDS = {
    low:    { Porn: 0.7, Hentai: 0.7, Sexy: 0.8 },
    medium: { Porn: 0.5, Hentai: 0.5, Sexy: 0.65 },
    high:   { Porn: 0.3, Hentai: 0.3, Sexy: 0.5 }
  };

  const NSFW_CLASSES = ['Porn', 'Hentai', 'Sexy'];

  // ─── Settings ──────────────────────────────────────────────

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        {
          nsfw_sensitivity: 'medium',
          nsfw_action: 'blur',
          nsfw_whitelist: [],
          nsfw_blockedKeywords: [],
          nsfw_enabled: true
        },
        (data) => {
          settings.sensitivity = data.nsfw_sensitivity;
          settings.action = data.nsfw_action;
          settings.whitelist = data.nsfw_whitelist || [];
          settings.blockedKeywords = data.nsfw_blockedKeywords || [];
          settings.enabled = data.nsfw_enabled;
          resolve();
        }
      );
    });
  }

  // ─── Model Loading ─────────────────────────────────────────

  async function loadModel() {
    if (model) return model;

    // Wait for TF.js to be ready
    const waitForTF = () =>
      new Promise((resolve) => {
        if (window.tf && window.__nsfw_tf_ready) {
          resolve();
        } else {
          const check = setInterval(() => {
            if (window.tf && window.__nsfw_tf_ready) {
              clearInterval(check);
              resolve();
            }
          }, 100);
        }
      });

    await waitForTF();

    // Load NSFWJS model from bundled files (MobileNetV2 - LayersModel format)
    const modelUrl = chrome.runtime.getURL('models/nsfwjs/model.json');
    model = await tf.loadLayersModel(modelUrl);
    console.log('[NSFW Filter] Model loaded successfully');
    return model;
  }

  // ─── Image Classification ──────────────────────────────────

  async function classifyImage(img) {
    if (!model) await loadModel();

    try {
      // NSFWJS MobileNetV2 expects 224x224 images, normalized to [0, 1]
      const tensor = tf.tidy(() => {
        let t = tf.browser.fromPixels(img);
        t = tf.image.resizeBilinear(t, [224, 224]);
        t = t.toFloat().div(255.0);
        t = t.expandDims(0);
        return t;
      });

      const predictions = await model.predict(tensor);
      const data = await predictions.data();
      tensor.dispose();
      predictions.dispose();

      // NSFWJS MobileNetV2 output classes
      const classes = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
      const result = {};
      classes.forEach((cls, i) => {
        result[cls] = data[i];
      });
      return result;
    } catch (e) {
      console.warn('[NSFW Filter] Classification error:', e);
      return null;
    }
  }

  function isNSFW(predictions) {
    if (!predictions) return false;
    const threshold = THRESHOLDS[settings.sensitivity];
    for (const cls of NSFW_CLASSES) {
      if (predictions[cls] >= threshold[cls]) {
        return true;
      }
    }
    return false;
  }

  // ─── Video Classification ──────────────────────────────────

  async function classifyVideoFrame(video) {
    if (!model) await loadModel();

    try {
      // Create a canvas to grab a frame at 224x224
      const canvas = document.createElement('canvas');
      canvas.width = 224;
      canvas.height = 224;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 224, 224);

      const tensor = tf.tidy(() => {
        let t = tf.browser.fromPixels(canvas);
        t = t.toFloat().div(255.0);
        t = t.expandDims(0);
        return t;
      });

      const predictions = await model.predict(tensor);
      const data = await predictions.data();
      tensor.dispose();
      predictions.dispose();

      const classes = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
      const result = {};
      classes.forEach((cls, i) => {
        result[cls] = data[i];
      });
      return result;
    } catch (e) {
      console.warn('[NSFW Filter] Video frame classification error:', e);
      return null;
    }
  }

  // ─── Element Processing ────────────────────────────────────

  const processedImages = new WeakSet();
  const processedVideos = new WeakSet();

  async function processImage(img) {
    if (processedImages.has(img)) return;
    if (!img.src && !img.currentSrc) return;
    if (img.naturalWidth < 32 || img.naturalHeight < 32) return;

    processedImages.add(img);

    const predictions = await classifyImage(img);
    if (predictions && isNSFW(predictions)) {
      applyAction(img, 'image', predictions);
    }
  }

  async function processVideo(video) {
    if (processedVideos.has(video)) return;
    if (video.videoWidth < 64 || video.videoHeight < 64) return;

    processedVideos.add(video);

    // Wait for video to have enough data
    if (video.readyState < 2) {
      video.addEventListener('loadeddata', () => {
        classifyAndHandleVideo(video);
      }, { once: true });
    } else {
      classifyAndHandleVideo(video);
    }
  }

  async function classifyAndHandleVideo(video) {
    const predictions = await classifyVideoFrame(video);
    if (predictions && isNSFW(predictions)) {
      applyAction(video, 'video', predictions);
    }
  }

  function applyAction(element, type, predictions) {
    const maxClass = NSFW_CLASSES.reduce((a, b) =>
      predictions[a] > predictions[b] ? a : b
    );
    const confidence = (predictions[maxClass] * 100).toFixed(1);

    if (settings.action === 'remove') {
      element.style.display = 'none';
      element.dataset.nsfwBlocked = 'true';
      element.dataset.nsfwInfo = `${maxClass} ${confidence}%`;

      // For Google/Bing images, also hide the parent container
      hideSearchImageParent(element);
    } else {
      // Blur
      element.style.filter = 'blur(40px)';
      element.style.transition = 'filter 0.3s';
      element.dataset.nsfwBlocked = 'true';
      element.dataset.nsfwInfo = `${maxClass} ${confidence}%`;

      // Add click to reveal
      element.addEventListener('click', function reveal(e) {
        if (element.dataset.nsfwRevealed === 'true') {
          element.style.filter = 'blur(40px)';
          element.dataset.nsfwRevealed = 'false';
        } else {
          element.style.filter = 'none';
          element.dataset.nsfwRevealed = 'true';
        }
      });
    }

    // Dispatch event for dashboard stats
    window.dispatchEvent(new CustomEvent('nsfw-detected', {
      detail: { type, class: maxClass, confidence, action: settings.action }
    }));
  }

  // ─── Google / Bing Image Search Filtering ──────────────────

  function hideSearchImageParent(element) {
    // Google Images
    const googleParent = element.closest('.islir, .rg_i, .H8Rx8c, [data-ved], .PKXrZc');
    if (googleParent) {
      googleParent.style.display = 'none';
      return;
    }

    // Bing Images
    const bingParent = element.closest('.iusc, .mimg, .imgpt, .dgControl_list > li');
    if (bingParent) {
      bingParent.style.display = 'none';
      return;
    }

    // Generic: try to hide the closest list item or figure
    const genericParent = element.closest('li, figure, .image, .img-container, [class*="image"], [class*="img"]');
    if (genericParent && genericParent !== element) {
      // Only hide if the parent is reasonably sized (not the whole page)
      const rect = genericParent.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.8 && rect.height < window.innerHeight * 0.8) {
        genericParent.style.display = 'none';
      }
    }
  }

  // ─── Keyword-Based Site Blocking ────────────────────────────

  function checkKeywordBlocking() {
    if (settings.blockedKeywords.length === 0) return;

    const pageText = document.body.innerText.toLowerCase();
    const pageTitle = document.title.toLowerCase();
    const url = window.location.href.toLowerCase();

    for (const keyword of settings.blockedKeywords) {
      const kw = keyword.toLowerCase().trim();
      if (!kw) continue;

      if (pageTitle.includes(kw) || url.includes(kw)) {
        // Block the entire page content
        document.body.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;flex-direction:column;gap:16px;">
            <div style="font-size:48px;">🛡️</div>
            <h1 style="font-size:24px;margin:0;">Page Blocked</h1>
            <p style="color:#888;">This page was blocked by NSFW Filter based on keyword: <strong>${escapeHtml(kw)}</strong></p>
            <button onclick="history.back()" style="padding:10px 24px;background:#e94560;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">Go Back</button>
          </div>
        `;
        return;
      }

      // Also check image alt texts and surrounding text
      if (pageText.includes(kw)) {
        // Scan images near keyword mentions
        document.querySelectorAll('img').forEach(img => {
          const alt = (img.alt || '').toLowerCase();
          const parentText = (img.parentElement?.innerText || '').toLowerCase();
          if (alt.includes(kw) || parentText.includes(kw)) {
            applyAction(img, 'image', { Porn: 1, Hentai: 0, Sexy: 0 });
          }
        });
      }
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Whitelist Check ───────────────────────────────────────

  function isWhitelisted() {
    const hostname = window.location.hostname;
    return settings.whitelist.some(domain => {
      const d = domain.toLowerCase().trim();
      return hostname === d || hostname.endsWith('.' + d);
    });
  }

  // ─── DOM Scanning ──────────────────────────────────────────

  function scanExistingElements() {
    if (!settings.enabled || isWhitelisted()) return;

    // Scan images
    const images = document.querySelectorAll('img:not([data-nsfw-blocked])');
    images.forEach(img => {
      if (img.complete && img.naturalWidth > 0) {
        processImage(img);
      } else {
        img.addEventListener('load', () => processImage(img), { once: true });
      }
    });

    // Scan videos
    const videos = document.querySelectorAll('video:not([data-nsfw-blocked])');
    videos.forEach(video => {
      processVideo(video);
    });

    // Keyword blocking
    checkKeywordBlocking();
  }

  function observeMutations() {
    if (!settings.enabled || isWhitelisted()) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check if the added node is an image/video
          if (node.tagName === 'IMG') {
            if (node.complete) processImage(node);
            else node.addEventListener('load', () => processImage(node), { once: true });
          }
          if (node.tagName === 'VIDEO') {
            processVideo(node);
          }

          // Check children
          node.querySelectorAll?.('img:not([data-nsfw-blocked])').forEach(img => {
            if (img.complete) processImage(img);
            else img.addEventListener('load', () => processImage(img), { once: true });
          });

          node.querySelectorAll?.('video:not([data-nsfw-blocked])').forEach(video => {
            processVideo(video);
          });
        }

        // Handle attribute changes (e.g., src changes for lazy-loaded images)
        if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
          const target = mutation.target;
          if (target.tagName === 'IMG' && !processedImages.has(target)) {
            if (target.complete) processImage(target);
            else target.addEventListener('load', () => processImage(target), { once: true });
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  // ─── Google / Bing Specific Handlers ───────────────────────

  function setupSearchEngineFiltering() {
    const hostname = window.location.hostname;

    if (hostname.includes('google.')) {
      // Google Images: intercept the image result containers
      const googleObserver = new MutationObserver(() => {
        document.querySelectorAll('.islir, .H8Rx8c, .PKXrZc, img.rg_i').forEach(img => {
          if (!processedImages.has(img) && img.src) {
            processImage(img);
          }
        });
      });
      googleObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (hostname.includes('bing.com')) {
      // Bing Images
      const bingObserver = new MutationObserver(() => {
        document.querySelectorAll('.iusc, .mimg, img[m]').forEach(img => {
          if (!processedImages.has(img) && img.src) {
            processImage(img);
          }
        });
      });
      bingObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ─── Message Listener ──────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'get-stats') {
      const blocked = document.querySelectorAll('[data-nsfw-blocked]').length;
      sendResponse({ blocked });
    }
    if (message.type === 'rescan') {
      processedImages = new WeakSet();
      processedVideos = new WeakSet();
      scanExistingElements();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ─── Initialization ────────────────────────────────────────

  async function init() {
    await loadSettings();

    if (!settings.enabled) {
      console.log('[NSFW Filter] Extension disabled');
      return;
    }

    if (isWhitelisted()) {
      console.log('[NSFW Filter] Site whitelisted:', window.location.hostname);
      return;
    }

    // Preload model in background
    loadModel().catch(e => console.warn('[NSFW Filter] Model preload failed:', e));

    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }

  function onReady() {
    scanExistingElements();
    observeMutations();
    setupSearchEngineFiltering();
    console.log('[NSFW Filter] Active on', window.location.hostname);
  }

  // Listen for settings changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.nsfw_sensitivity) settings.sensitivity = changes.nsfw_sensitivity.newValue;
    if (changes.nsfw_action) settings.action = changes.nsfw_action.newValue;
    if (changes.nsfw_whitelist) settings.whitelist = changes.nsfw_whitelist.newValue || [];
    if (changes.nsfw_blockedKeywords) settings.blockedKeywords = changes.nsfw_blockedKeywords.newValue || [];
    if (changes.nsfw_enabled) settings.enabled = changes.nsfw_enabled.newValue;
  });

  init();
})();
