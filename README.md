# Volume Control

A Chrome extension that syncs volume **per website**: set the level once for a site, and every open tab on that same site — plus any tab you open on it later — shares the same volume.

## Features

- **Per-site volume sync** — volume is keyed by hostname, so `youtube.com` and `netflix.com` each keep their own independent level. Changing the volume on one tab instantly applies to every other open tab on the same site.
- **Quick Mute/Unmute** — one click silences the current site and remembers the previous level to restore on unmute.
- **Reset** — instantly restores the current site to 100%.
- **Per-tab badge** — the toolbar icon shows the active tab's volume percentage (or `X` on a red badge when muted/silenced), and updates automatically as you switch tabs.
- **Works across iframes** — third-party embeds (e.g. ads) inside a page are muted together with the parent site, since volume is resolved from the tab's top-level hostname rather than each frame's own origin.
- **Shadow DOM aware** — looks inside open shadow roots to catch `<video>`/`<audio>` elements some custom players hide there.
- **Resilient to page scripts** — listens for `volumechange` events and periodically re-asserts the target volume, in case a site's own player resets it after load.

## Installation (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this folder.
4. Refresh any already-open tabs so the content script gets injected into them.

## Usage

1. Click the extension icon on a website.
2. Drag the slider to set the volume for that site — it applies immediately to every tab open on the same site.
3. Use **Mute** to instantly silence the site, or **Reset** to jump back to 100%.
4. The toolbar badge always shows the current tab's volume at a glance, without needing to open the popup.

The popup is unavailable (controls disabled) on non-`http(s)` pages such as `chrome://` pages, since there is no page content to control there.

## How it works

| File | Responsibility |
|---|---|
| `manifest.json` | Manifest V3 configuration — permissions, content script registration, action/background wiring. |
| `content.js` | Injected into every frame of every page. Resolves the tab's hostname (via a message to the background worker, so it's consistent even inside cross-origin iframes), applies the stored volume to all `<audio>`/`<video>` elements (including ones inside open shadow roots), and keeps re-applying it if the page tries to change it. |
| `popup.js` / `popup.html` | The toolbar popup UI. Detects the active tab's site on open and reads/writes that site's volume entry. |
| `background.js` | Service worker. Keeps the per-tab badge in sync with each tab's site volume, and answers "what's my tab's hostname" requests from content scripts. |

### Storage schema

Volume state lives in `chrome.storage.sync` under a single key:

```json
{
  "sites": {
    "youtube.com": { "volume": 0.6, "muted": false, "volumeBeforeMute": 0.6 },
    "netflix.com": { "volume": 1, "muted": true, "volumeBeforeMute": 1 }
  }
}
```

- `volume` — the applied level (0 to 1), matching `HTMLMediaElement.volume`.
- `muted` — whether the site is currently force-silenced.
- `volumeBeforeMute` — the level to restore when unmuting.

A site with no entry defaults to 100% (unmuted).

## Known limitations

- Audio driven entirely through the Web Audio API (not routed via an `<audio>`/`<video>` element's `volume`/`muted` properties) is outside this extension's reach.
- Media inside a **closed** shadow root cannot be detected — there is no public API to inspect it.
- `chrome.storage.sync` syncs across a user's signed-in Chrome browsers; switch both storage calls to `chrome.storage.local` if you'd rather keep settings device-local only.
