const DEFAULT_CONFIG = {
  backendUploadUrl: 'https://localhost:3000/v1/upload',
  preserveOriginalDownload: false,
};

function getStorageArea() {
  if (chrome.storage && chrome.storage.sync) {
    return chrome.storage.sync;
  }

  return chrome.storage.local;
}

async function restoreOptions() {
  const storage = getStorageArea();
  const config = await storage.get(DEFAULT_CONFIG);
  document.getElementById('backendUploadUrl').value = config.backendUploadUrl || DEFAULT_CONFIG.backendUploadUrl;
  document.getElementById('preserveOriginalDownload').checked = Boolean(config.preserveOriginalDownload);
}

async function saveOptions() {
  const backendUploadUrl = document.getElementById('backendUploadUrl').value.trim();
  const preserveOriginalDownload = document.getElementById('preserveOriginalDownload').checked;
  const statusNode = document.getElementById('status');

  if (!backendUploadUrl) {
    statusNode.textContent = 'Please provide a backend upload URL.';
    return;
  }

  const storage = getStorageArea();
  await storage.set({
    backendUploadUrl,
    preserveOriginalDownload,
  });

  statusNode.textContent = 'Settings saved.';
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.getElementById('saveButton').addEventListener('click', saveOptions);
});