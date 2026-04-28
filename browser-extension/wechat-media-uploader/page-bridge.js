(function bootstrapAurexLiveWechatBridge() {
  if (window.__aurexLiveWechatBridgeLoaded) {
    return;
  }

  window.__aurexLiveWechatBridgeLoaded = true;

  const BRIDGE_SOURCE = 'aurexlive-wechat-uploader';
  const MEDIA_PATH_FRAGMENT = '/cgi-bin/mmwebwx-bin/webwxgetmedia';
  const DEFAULT_CONFIG = {
    preserveOriginalDownload: false,
  };
  let runtimeConfig = { ...DEFAULT_CONFIG };
  let pendingImportIntent = null;

  function postToContentScript(type, payload) {
    window.postMessage({
      source: BRIDGE_SOURCE,
      type,
      payload,
    }, window.location.origin);
  }

  function reportBridgeError(stage, error, meta = {}) {
    const message = error instanceof Error ? error.message : String(error);
    postToContentScript('aurexlive-extension-error', {
      source: 'wechat-web-extension',
      component: 'page-bridge',
      stage,
      severity: 'error',
      message,
      stack: error instanceof Error ? error.stack : '',
      page: window.location.href,
      timestamp: new Date().toISOString(),
      meta,
    });
  }

  function isMediaUrl(candidate) {
    if (typeof candidate !== 'string' || !candidate.includes(MEDIA_PATH_FRAGMENT)) {
      return false;
    }

    try {
      const url = new URL(candidate, window.location.href);
      return url.pathname.includes(MEDIA_PATH_FRAGMENT);
    } catch {
      return false;
    }
  }

  function getFileNameFromUrl(mediaUrl) {
    try {
      const url = new URL(mediaUrl, window.location.href);
      const encodedFileName = url.searchParams.get('encryfilename');
      return encodedFileName ? decodeURIComponent(encodedFileName) : 'wechat-media.bin';
    } catch {
      return 'wechat-media.bin';
    }
  }

  function getMimeType(fileName, response) {
    const contentType = response.headers.get('content-type');
    if (contentType) {
      return contentType;
    }

    const lowerFileName = String(fileName || '').toLowerCase();
    if (lowerFileName.endsWith('.mp3')) return 'audio/mpeg';
    if (lowerFileName.endsWith('.wav')) return 'audio/wav';
    if (lowerFileName.endsWith('.m4a')) return 'audio/mp4';
    if (lowerFileName.endsWith('.mp4')) return 'video/mp4';
    if (lowerFileName.endsWith('.mov')) return 'video/quicktime';
    return 'application/octet-stream';
  }

  async function validateBeforeUpload(validationUrl, fileName, fileSize) {
    const response = await fetch(validationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName,
        fileSize,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      throw new Error(result?.message || `Validation request failed with ${response.status}`);
    }

    if (!result.allowed) {
      throw new Error((result.reasons || []).join(' ') || 'Blocked by WeChat import settings.');
    }
  }

  async function uploadMedia(mediaUrl, backendUploadUrl, validationUrl, rawFileName) {
    const fileName = rawFileName || getFileNameFromUrl(mediaUrl);
    postToContentScript('aurexlive-upload-status', {
      status: 'progress',
      message: `Fetching ${fileName} from WeChat...`,
      fileName,
    });

    const mediaResponse = await fetch(mediaUrl, {
      method: 'GET',
      credentials: 'include',
    });

    if (!mediaResponse.ok) {
      throw new Error(`WeChat media request failed with ${mediaResponse.status}`);
    }

    const mediaBlob = await mediaResponse.blob();
    if (!mediaBlob.size) {
      throw new Error('WeChat returned an empty media file');
    }

    if (validationUrl) {
      postToContentScript('aurexlive-upload-status', {
        status: 'progress',
        message: `Validating ${fileName} against AurexLive policy...`,
        fileName,
      });
      await validateBeforeUpload(validationUrl, fileName, mediaBlob.size);
    }

    postToContentScript('aurexlive-upload-status', {
      status: 'progress',
      message: `Uploading ${fileName} to AurexLive...`,
      fileName,
    });

    const uploadBody = new FormData();
    const normalizedBlob = mediaBlob.type
      ? mediaBlob
      : mediaBlob.slice(0, mediaBlob.size, getMimeType(fileName, mediaResponse));
    uploadBody.append('file', normalizedBlob, fileName);

    const uploadResponse = await fetch(backendUploadUrl, {
      method: 'POST',
      body: uploadBody,
    });

    const uploadResult = await uploadResponse.json().catch(() => null);
    if (!uploadResponse.ok || !uploadResult?.success) {
      const message = uploadResult?.message || `Upload failed with ${uploadResponse.status}`;
      throw new Error(message);
    }

    postToContentScript('aurexlive-upload-status', {
      status: 'success',
      fileName,
      uploadResult,
    });
  }

  const originalWindowOpen = window.open.bind(window);
  window.open = function interceptedWindowOpen(url, name, specs) {
    if (isMediaUrl(url)) {
      if (!pendingImportIntent) {
        return originalWindowOpen(url, name, specs);
      }

      const fileName = getFileNameFromUrl(url);
      postToContentScript('wechat-media-detected', {
        mediaUrl: url,
        fileName,
        intentId: pendingImportIntent.intentId,
      });

      const shouldPreserveOriginalDownload = Boolean(pendingImportIntent.preserveOriginalDownload);
      pendingImportIntent = null;

      if (!shouldPreserveOriginalDownload) {
        return window;
      }
    }

    return originalWindowOpen(url, name, specs);
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }

    const data = event.data;
    if (!data || data.source !== BRIDGE_SOURCE) {
      return;
    }

    if (data.type === 'aurexlive-config') {
      runtimeConfig = {
        ...DEFAULT_CONFIG,
        ...(data.payload || {}),
      };
      return;
    }

    if (data.type === 'aurexlive-arm-import') {
      const payload = data.payload || {};
      if (!payload.intentId) {
        postToContentScript('aurexlive-arm-import-failed', {
          intentId: null,
          message: 'Missing import intent id.',
        });
        return;
      }

      pendingImportIntent = {
        intentId: payload.intentId,
        preserveOriginalDownload: Boolean(payload.preserveOriginalDownload ?? runtimeConfig.preserveOriginalDownload),
      };

      postToContentScript('aurexlive-arm-import-ack', {
        intentId: payload.intentId,
      });

      window.clearTimeout(window.__aurexLiveWechatPendingImportTimer);
      window.__aurexLiveWechatPendingImportTimer = window.setTimeout(() => {
        if (!pendingImportIntent || pendingImportIntent.intentId !== payload.intentId) {
          return;
        }

        pendingImportIntent = null;
        postToContentScript('wechat-media-import-cancelled', {
          intentId: payload.intentId,
          message: 'No WeChat media download was triggered after selecting Import To AurexLive.',
        });
      }, 8000);
      return;
    }

    if (data.type === 'aurexlive-upload-request') {
      const payload = data.payload || {};
      if (!payload.mediaUrl || !payload.backendUploadUrl) {
        postToContentScript('aurexlive-upload-status', {
          status: 'error',
          message: 'Missing media URL or backend upload URL.',
        });
        reportBridgeError('upload-request', new Error('Missing media URL or backend upload URL.'), {
          intentId: payload.intentId || null,
        });
        return;
      }

      try {
        await uploadMedia(payload.mediaUrl, payload.backendUploadUrl, payload.validationUrl, payload.fileName);
      } catch (error) {
        reportBridgeError('upload-media', error, {
          fileName: payload.fileName || null,
          backendUploadUrl: payload.backendUploadUrl || null,
          validationUrl: payload.validationUrl || null,
        });
        postToContentScript('aurexlive-upload-status', {
          status: 'error',
          fileName: payload.fileName,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
})();