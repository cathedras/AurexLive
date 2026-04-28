# AurexLive WeChat Media Uploader Prototype

This unpacked browser extension adds a custom right-click import action to WeChat Web. When you choose that action on a file, the extension intercepts the resulting `webwxgetmedia` popup and uploads the file to AurexLive through the existing `POST /v1/upload` endpoint.

## What This Prototype Does

- Injects a page bridge into WeChat File Helper pages.
- Shows a custom context menu item for explicit imports.
- Overrides `window.open` when the target URL matches `webwxgetmedia` and the import action was explicitly armed.
- Validates the file type immediately against AurexLive WeChat import settings.
- Fetches the media file with the current WeChat session.
- Validates the downloaded file size against AurexLive WeChat import settings.
- Uploads the file to the configured AurexLive backend URL.
- Shows a lightweight in-page status banner.

## Current Scope

- Works only on WeChat web pages matched by the manifest.
- Works only when WeChat opens the media through `window.open(...)` after you select the import item from the custom right-click menu.
- Uses the existing backend upload route at `https://localhost:3000/v1/upload` by default.
- Uses `POST /v1/settings/wechat-import/validate` to enforce allowed extensions and max file size from the AurexLive settings page.
- Requires the browser to trust the local HTTPS development certificate.

## Load The Extension

1. Open the browser extension management page.
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select this folder: `browser-extension/wechat-media-uploader`.

## Configure The Backend URL

1. Click the extension icon.
2. Set the upload URL. The default is `https://localhost:3000/v1/upload`.
3. Optionally enable "Keep the original WeChat download popup" if you want the native download flow to continue.
4. Save settings.

## Test Flow

1. Start AurexLive locally.
2. Confirm `https://localhost:3000/docs` is trusted in the same browser profile.
3. In AurexLive settings, configure the allowed WeChat file extensions and size limit.
3. Open WeChat File Helper.
4. Right-click a WeChat file.
5. Choose `Import To AurexLive` from the custom menu.
6. Wait for the in-page status banner to report success.
7. Verify the uploaded file appears in AurexLive.

## Known Limitations

- If WeChat changes away from `window.open`, this prototype will miss the download trigger.
- The upload uses the full file in memory before POSTing it to the backend.
- Failed TLS trust on `https://localhost:3000` will block the upload request.
- Large files still depend on the backend's current file size limit.