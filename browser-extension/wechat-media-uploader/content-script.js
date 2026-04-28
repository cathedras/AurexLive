(async function bootstrapAurexLiveWechatUploader() {
  if (window.__aurexLiveWechatUploaderLoaded) {
    return;
  }

  window.__aurexLiveWechatUploaderLoaded = true;

  const BRIDGE_SOURCE = 'aurexlive-wechat-uploader';
  const EXTENSION_ERROR_URL = 'https://localhost:3000/v1/extension-error';
  const DEFAULT_CONFIG = {
    backendUploadUrl: 'https://localhost:3000/v1/upload',
    preserveOriginalDownload: false,
  };

  let statusBar = null;
  let contextMenu = null;
  let contextMenuTarget = null;
  let pendingImportIntentId = null;
  let cachedConfig = { ...DEFAULT_CONFIG };
  let pendingArmAck = null;

  function waitForBody() {
    if (document.body) {
      return Promise.resolve(document.body);
    }

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.body) {
          return;
        }

        observer.disconnect();
        resolve(document.body);
      });

      observer.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function ensureStatusBar() {
    if (statusBar) {
      return statusBar;
    }

    const body = await waitForBody();
    statusBar = document.createElement('div');
    statusBar.id = 'aurexlive-wechat-uploader-status';
    statusBar.setAttribute('role', 'status');
    statusBar.style.cssText = [
      'position: fixed',
      'top: 16px',
      'right: 16px',
      'z-index: 2147483647',
      'max-width: 320px',
      'padding: 10px 12px',
      'border-radius: 10px',
      'background: rgba(18, 18, 18, 0.88)',
      'color: #fff',
      'font: 13px/1.45 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      'box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25)',
      'backdrop-filter: blur(12px)',
      'display: none'
    ].join(';');
    body.appendChild(statusBar);
    return statusBar;
  }

  async function ensureContextMenu() {
    if (contextMenu) {
      return contextMenu;
    }

    const body = await waitForBody();
    contextMenu = document.createElement('div');
    contextMenu.id = 'aurexlive-wechat-uploader-menu';
    contextMenu.style.cssText = [
      'position: fixed',
      'z-index: 2147483647',
      'min-width: 220px',
      'padding: 6px',
      'border-radius: 12px',
      'background: rgba(24, 24, 24, 0.96)',
      'box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28)',
      'backdrop-filter: blur(12px)',
      'display: none'
    ].join(';');

    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.textContent = 'Import To AurexLive';
    importButton.style.cssText = [
      'width: 100%',
      'padding: 10px 12px',
      'border: 0',
      'border-radius: 8px',
      'background: transparent',
      'color: #fff',
      'text-align: left',
      'font: 13px/1.35 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      'cursor: pointer'
    ].join(';');

    importButton.addEventListener('mouseenter', () => {
      importButton.style.background = 'rgba(255, 255, 255, 0.12)';
    });
    importButton.addEventListener('mouseleave', () => {
      importButton.style.background = 'transparent';
    });
    importButton.addEventListener('click', () => {
      void handleContextMenuImport().catch((error) => {
        handleAsyncError(error, 'Failed to start WeChat import.');
      });
    });

    contextMenu.appendChild(importButton);
    body.appendChild(contextMenu);
    return contextMenu;
  }

  async function showStatus(message, tone = 'info') {
    const node = await ensureStatusBar();
    const palette = {
      info: 'rgba(18, 18, 18, 0.88)',
      success: 'rgba(14, 92, 54, 0.92)',
      error: 'rgba(127, 29, 29, 0.94)',
    };

    node.textContent = message;
    node.style.display = 'block';
    node.style.background = palette[tone] || palette.info;

    window.clearTimeout(node.__hideTimer);
    node.__hideTimer = window.setTimeout(() => {
      node.style.display = 'none';
    }, 5000);
  }

  async function reportExtensionError(payload = {}) {
    try {
      const response = await fetch(EXTENSION_ERROR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'wechat-web-extension',
          component: 'content-script',
          stage: 'runtime',
          severity: 'error',
          page: window.location.href,
          timestamp: new Date().toISOString(),
          ...payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Extension error report failed with ${response.status}`);
      }

      return await response.json().catch(() => ({ success: true }));
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function injectBridgeScript() {
    const existing = document.getElementById('aurexlive-wechat-uploader-bridge');
    if (existing) {
      return;
    }

    const script = document.createElement('script');
    script.id = 'aurexlive-wechat-uploader-bridge';
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  }

  function getStorageArea() {
    if (chrome.storage && chrome.storage.sync) {
      return chrome.storage.sync;
    }

    return chrome.storage.local;
  }

  function getStorageAreaName() {
    return chrome.storage && chrome.storage.sync ? 'sync' : 'local';
  }

  async function loadConfig() {
    const storage = getStorageArea();
    const result = await storage.get(DEFAULT_CONFIG);
    return {
      backendUploadUrl: String(result.backendUploadUrl || DEFAULT_CONFIG.backendUploadUrl).trim(),
      preserveOriginalDownload: Boolean(result.preserveOriginalDownload),
    };
  }

  function syncConfigToBridge(config = cachedConfig) {
    window.postMessage({
      source: BRIDGE_SOURCE,
      type: 'aurexlive-config',
      payload: config,
    }, window.location.origin);
    return config;
  }

  async function refreshConfig() {
    cachedConfig = await loadConfig();
    return syncConfigToBridge(cachedConfig);
  }

  function normalizeFileName(rawFileName, fallbackUrl) {
    if (rawFileName) {
      return rawFileName;
    }

    try {
      const url = new URL(fallbackUrl);
      return url.searchParams.get('encryfilename') || 'wechat-media.bin';
    } catch {
      return 'wechat-media.bin';
    }
  }

  function getValidationUrl(uploadUrl) {
    const parsed = new URL(uploadUrl);
    parsed.pathname = parsed.pathname.replace(/\/v1\/upload\/?$/, '/v1/settings/wechat-import/validate');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  }

  async function validateWechatImport(uploadUrl, payload) {
    const validationUrl = getValidationUrl(uploadUrl);
    const response = await fetch(validationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || `Validation request failed with ${response.status}`);
    }

    return {
      ...result,
      validationUrl,
    };
  }

  function isEditableTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
  }

  function getContextMenuAnchor(target) {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    return target.closest('a, button, [role="button"], [tabindex], div, span');
  }

  function hideContextMenu() {
    if (!contextMenu) {
      return;
    }

    contextMenu.style.display = 'none';
    contextMenuTarget = null;
  }

  async function showContextMenu(event) {
    const anchor = getContextMenuAnchor(event.target);
    if (!anchor || isEditableTarget(anchor)) {
      hideContextMenu();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const menu = await ensureContextMenu();
    contextMenuTarget = anchor;
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 236)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 64)}px`;
    menu.style.display = 'block';
  }

  function dispatchPrimaryClick(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const mouseEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
    });

    return target.dispatchEvent(mouseEvent);
  }

  function waitForArmAck(intentId) {
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingArmAck?.intentId === intentId) {
          pendingArmAck = null;
        }
        reject(new Error('Timed out while arming the WeChat import action.'));
      }, 1500);

      pendingArmAck = {
        intentId,
        resolve: () => {
          window.clearTimeout(timeoutId);
          if (pendingArmAck?.intentId === intentId) {
            pendingArmAck = null;
          }
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          if (pendingArmAck?.intentId === intentId) {
            pendingArmAck = null;
          }
          reject(error);
        },
      };
    });
  }

  async function armImportIntent(config) {
    pendingImportIntentId = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ackPromise = waitForArmAck(pendingImportIntentId);

    window.postMessage({
      source: BRIDGE_SOURCE,
      type: 'aurexlive-arm-import',
      payload: {
        intentId: pendingImportIntentId,
        preserveOriginalDownload: config.preserveOriginalDownload,
      },
    }, window.location.origin);

    await ackPromise;
  }

  async function handleContextMenuImport() {
    const target = contextMenuTarget;
    hideContextMenu();

    if (!target) {
      return;
    }

    await armImportIntent(cachedConfig);
    await showStatus('Waiting for WeChat media download to start...');
    dispatchPrimaryClick(target);
  }

  function handleAsyncError(error, fallbackMessage) {
    const message = error instanceof Error ? error.message : String(error);
    const finalMessage = message || fallbackMessage;

    if (finalMessage.includes('Extension context invalidated')) {
      return;
    }

    reportExtensionError({
      stage: 'content-script',
      message: finalMessage,
      stack: error instanceof Error ? error.stack : '',
      meta: {
        fallbackMessage,
      },
    }).catch(() => {});

    showStatus(finalMessage, 'error').catch(() => {});
  }

  window.addEventListener('message', (event) => {
    void (async () => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const data = event.data;
      if (!data || data.source !== BRIDGE_SOURCE) {
        return;
      }

      if (data.type === 'aurexlive-arm-import-ack') {
        if (data.payload?.intentId && pendingArmAck?.intentId === data.payload.intentId) {
          pendingArmAck.resolve();
        }
        return;
      }

      if (data.type === 'aurexlive-extension-error') {
        reportExtensionError(data.payload || {}).catch(() => {});
        return;
      }

      if (data.type === 'aurexlive-arm-import-failed') {
        if (data.payload?.intentId && pendingArmAck?.intentId === data.payload.intentId) {
          pendingArmAck.reject(new Error(data.payload.message || 'Failed to arm the WeChat import action.'));
        }
        return;
      }

      if (data.type === 'wechat-media-detected') {
        if (!data.payload?.intentId || data.payload.intentId !== pendingImportIntentId) {
          return;
        }

        pendingImportIntentId = null;
        const config = syncConfigToBridge(cachedConfig);
        const fileName = normalizeFileName(data.payload?.fileName, data.payload?.mediaUrl);
        let validation;

        try {
          validation = await validateWechatImport(config.backendUploadUrl, { fileName });
        } catch (error) {
          handleAsyncError(error, 'Validation failed.');
          return;
        }

        if (!validation.allowed) {
          await showStatus(`Blocked by WeChat import settings: ${(validation.reasons || []).join(' ')}`, 'error').catch(() => {});
          return;
        }

        await showStatus(`Validated ${fileName}. Preparing upload...`).catch(() => {});
        window.postMessage({
          source: BRIDGE_SOURCE,
          type: 'aurexlive-upload-request',
          payload: {
            mediaUrl: data.payload?.mediaUrl,
            fileName,
            backendUploadUrl: config.backendUploadUrl,
            validationUrl: validation.validationUrl,
          },
        }, window.location.origin);
        return;
      }

      if (data.type === 'wechat-media-import-cancelled') {
        if (data.payload?.intentId && data.payload.intentId === pendingImportIntentId) {
          pendingImportIntentId = null;
        }

        if (data.payload?.message) {
          await showStatus(data.payload.message, 'error').catch(() => {});
        }
        return;
      }

      if (data.type === 'aurexlive-upload-status') {
        const payload = data.payload || {};
        if (payload.status === 'success') {
          await showStatus(`Uploaded ${payload.fileName} successfully.`, 'success').catch(() => {});
        } else if (payload.status === 'error') {
          reportExtensionError({
            stage: 'upload-status',
            message: payload.message,
            meta: {
              fileName: payload.fileName,
              uploadResult: payload.uploadResult || null,
            },
          }).catch(() => {});
          await showStatus(`Upload failed: ${payload.message}`, 'error').catch(() => {});
        } else if (payload.status === 'progress') {
          await showStatus(payload.message || 'Uploading...').catch(() => {});
        }
      }
    })().catch((error) => handleAsyncError(error, 'WeChat import handler failed.'));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== getStorageAreaName()) {
      return;
    }

    if (changes.backendUploadUrl || changes.preserveOriginalDownload) {
      refreshConfig().catch((error) => {
        showStatus(`Failed to refresh WeChat import settings: ${error.message}`, 'error');
      });
    }
  });

  document.addEventListener('contextmenu', (event) => {
    if (contextMenu && contextMenu.contains(event.target)) {
      return;
    }

    showContextMenu(event);
  }, true);

  document.addEventListener('click', (event) => {
    if (contextMenu && contextMenu.contains(event.target)) {
      return;
    }

    hideContextMenu();
  }, true);

  document.addEventListener('scroll', () => {
    hideContextMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideContextMenu();
    }
  });

  window.addEventListener('error', (event) => {
    reportExtensionError({
      stage: 'window-error',
      message: event.message || 'Unhandled extension error',
      stack: event.error && event.error.stack ? event.error.stack : '',
      meta: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    }).catch(() => {});
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason || 'Unhandled rejection');

    reportExtensionError({
      stage: 'unhandledrejection',
      message: reason,
      stack: event.reason && event.reason.stack ? event.reason.stack : '',
    }).catch(() => {});
  });

  injectBridgeScript();
  await refreshConfig();
  await ensureContextMenu();
  showStatus('AurexLive WeChat uploader is ready. Right-click a file to import it.');
})();