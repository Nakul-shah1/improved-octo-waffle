/**
 * NSFW Filter - Popup Script
 * Handles all dashboard UI interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const toggleEnabled = document.getElementById('toggleEnabled');
  const sensitivityGroup = document.getElementById('sensitivityGroup');
  const actionGroup = document.getElementById('actionGroup');
  const sensitivityHint = document.getElementById('sensitivityHint');
  const actionHint = document.getElementById('actionHint');
  const whitelistInput = document.getElementById('whitelistInput');
  const addWhitelistBtn = document.getElementById('addWhitelist');
  const whitelistTags = document.getElementById('whitelistTags');
  const keywordInput = document.getElementById('keywordInput');
  const addKeywordBtn = document.getElementById('addKeyword');
  const keywordTags = document.getElementById('keywordTags');
  const rescanBtn = document.getElementById('rescanBtn');
  const blockedCount = document.getElementById('blockedCount');

  // State
  let settings = {};

  // Hints
  const SENSITIVITY_HINTS = {
    low: 'Only blocks obvious NSFW content — fewer false positives',
    medium: 'Balanced detection — recommended',
    high: 'Aggressive blocking — may flag borderline content'
  };

  const ACTION_HINTS = {
    blur: 'NSFW content will be heavily blurred (click to reveal)',
    remove: 'NSFW content will be completely hidden from the page'
  };

  // ─── Load Settings ─────────────────────────────────────────

  function loadSettings() {
    chrome.runtime.sendMessage({ type: 'get-settings' }, (data) => {
      settings = data;
      render();
    });
  }

  function saveSettings() {
    chrome.runtime.sendMessage({ type: 'save-settings', settings });
  }

  // ─── Render ────────────────────────────────────────────────

  function render() {
    // Toggle
    toggleEnabled.checked = settings.nsfw_enabled;

    // Sensitivity
    sensitivityGroup.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === settings.nsfw_sensitivity);
    });
    sensitivityHint.textContent = SENSITIVITY_HINTS[settings.nsfw_sensitivity];

    // Action
    actionGroup.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === settings.nsfw_action);
    });
    actionHint.textContent = ACTION_HINTS[settings.nsfw_action];

    // Whitelist
    renderTags(whitelistTags, settings.nsfw_whitelist, 'whitelist');

    // Keywords
    renderTags(keywordTags, settings.nsfw_blockedKeywords, 'keywords');

    // Stats
    loadStats();
  }

  function renderTags(container, items, type) {
    container.innerHTML = '';
    items.forEach((item, index) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `
        ${escapeHtml(item)}
        <button class="tag-remove" data-type="${type}" data-index="${index}">×</button>
      `;
      container.appendChild(tag);
    });
  }

  function loadStats() {
    chrome.runtime.sendMessage({ type: 'get-stats' }, (response) => {
      blockedCount.textContent = response?.blocked || 0;
    });
  }

  // ─── Event Handlers ────────────────────────────────────────

  // Toggle
  toggleEnabled.addEventListener('change', () => {
    settings.nsfw_enabled = toggleEnabled.checked;
    saveSettings();
  });

  // Sensitivity
  sensitivityGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    settings.nsfw_sensitivity = btn.dataset.value;
    saveSettings();
    render();
  });

  // Action
  actionGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    settings.nsfw_action = btn.dataset.value;
    saveSettings();
    render();
  });

  // Add whitelist
  function addWhitelist() {
    const domain = whitelistInput.value.trim().toLowerCase();
    if (!domain) return;
    if (settings.nsfw_whitelist.includes(domain)) return;
    settings.nsfw_whitelist.push(domain);
    whitelistInput.value = '';
    saveSettings();
    render();
  }

  addWhitelistBtn.addEventListener('click', addWhitelist);
  whitelistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWhitelist();
  });

  // Add keyword
  function addKeyword() {
    const keyword = keywordInput.value.trim().toLowerCase();
    if (!keyword) return;
    if (settings.nsfw_blockedKeywords.includes(keyword)) return;
    settings.nsfw_blockedKeywords.push(keyword);
    keywordInput.value = '';
    saveSettings();
    render();
  }

  addKeywordBtn.addEventListener('click', addKeyword);
  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addKeyword();
  });

  // Remove tags (delegated)
  document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.tag-remove');
    if (!removeBtn) return;

    const type = removeBtn.dataset.type;
    const index = parseInt(removeBtn.dataset.index);

    if (type === 'whitelist') {
      settings.nsfw_whitelist.splice(index, 1);
    } else if (type === 'keywords') {
      settings.nsfw_blockedKeywords.splice(index, 1);
    }
    saveSettings();
    render();
  });

  // Rescan
  rescanBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'rescan' }, () => {
          setTimeout(loadStats, 1000);
        });
      }
    });
  });

  // ─── Helpers ───────────────────────────────────────────────

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Init ──────────────────────────────────────────────────

  loadSettings();
});
