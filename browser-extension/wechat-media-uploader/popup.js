const DEFAULT_CONFIG = {
  backendUploadUrl: 'https://localhost:3000/v1/upload',
  preserveOriginalDownload: false,
};

let storageArea = null;

function initStorage() {
  try {
    if (typeof chrome === 'undefined') return;
    // Prefer sync, fallback to local
    if (chrome.storage && chrome.storage.sync) storageArea = chrome.storage.sync;
    else if (chrome.storage && chrome.storage.local) storageArea = chrome.storage.local;
  } catch {
    // chrome.storage not available
  }
}

function promisifyStorageGet(defaults) {
  return new Promise((resolve) => {
    if (!storageArea) {
      resolve(defaults);
      return;
    }
    try {
      const result = storageArea.get(defaults);
      // result could be a Promise (MV3) or undefined (callback-based API)
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(() => resolve(defaults));
      } else {
        // Callback-based API (older Chromium / QQ Browser)
        storageArea.get(defaults, (items) => {
          resolve(items || defaults);
        });
      }
    } catch {
      resolve(defaults);
    }
  });
}

function promisifyStorageSet(data) {
  return new Promise((resolve) => {
    if (!storageArea) {
      resolve();
      return;
    }
    try {
      const result = storageArea.set(data);
      if (result && typeof result.then === 'function') {
        result.then(resolve).catch(() => resolve());
      } else {
        // Callback-based API
        storageArea.set(data, resolve);
      }
    } catch {
      resolve();
    }
  });
}

async function restoreOptions() {
  const config = await promisifyStorageGet(DEFAULT_CONFIG);
  const urlInput = document.getElementById('backendUploadUrl');
  const checkInput = document.getElementById('preserveOriginalDownload');
  if (urlInput) {
    urlInput.value = config.backendUploadUrl || DEFAULT_CONFIG.backendUploadUrl;
  }
  if (checkInput) {
    checkInput.checked = Boolean(config.preserveOriginalDownload);
  }
}

async function saveOptions() {
  const urlInput = document.getElementById('backendUploadUrl');
  const checkInput = document.getElementById('preserveOriginalDownload');
  const statusNode = document.getElementById('status');

  if (!urlInput || !statusNode) return;

  const backendUploadUrl = urlInput.value.trim();
  const preserveOriginalDownload = checkInput ? checkInput.checked : false;

  if (!backendUploadUrl) {
    statusNode.textContent = 'Please provide a backend upload URL.';
    return;
  }

  if (!storageArea) {
    statusNode.textContent = 'Extension storage API is not available.';
    return;
  }

  await promisifyStorageSet({ backendUploadUrl, preserveOriginalDownload });
  statusNode.textContent = 'Settings saved.';
}

// Initialize storage on load
initStorage();

// Wait for DOM and then restore options
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    restoreOptions();
    const saveButton = document.getElementById('saveButton');
    if (saveButton) saveButton.addEventListener('click', saveOptions);
  });
} else {
  // DOM already ready
  restoreOptions();
  const saveButton = document.getElementById('saveButton');
  if (saveButton) saveButton.addEventListener('click', saveOptions);
}