(function () {
  const SITES_KEY = 'sites';
  let currentVolume = 1;
  let hostname = null;
  const trackedElements = new Set();

  function clamp(v) {
    return Math.min(1, Math.max(0, v));
  }

  function isInSync(el) {
    return Math.abs(el.volume - currentVolume) <= 0.001 && el.muted === (currentVolume <= 0);
  }

  function applyVolumeToElement(el) {
    try {
      el.volume = currentVolume;
      el.muted = currentVolume <= 0;
    } catch (e) {
      /* some elements may reject volume assignment (e.g. WebAudio-driven players) */
    }
  }

  function trackElement(el) {
    applyVolumeToElement(el);
    if (!trackedElements.has(el)) {
      trackedElements.add(el);
      el.addEventListener('volumechange', () => {
        if (!isInSync(el)) applyVolumeToElement(el);
      });
    }
  }

  // Regular querySelectorAll cannot see into open shadow roots, which some
  // custom video-player elements use to host their <video>/<audio> tag.
  function collectMediaElements(root, out) {
    root.querySelectorAll('audio, video').forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectMediaElements(el.shadowRoot, out);
    });
  }

  function applyVolume(vol) {
    currentVolume = clamp(vol);
    const elements = [];
    collectMediaElements(document, elements);
    elements.forEach(trackElement);
  }

  function volumeFromSiteEntry(entry) {
    if (!entry) return 1;
    if (entry.muted) return 0;
    return typeof entry.volume === 'number' ? entry.volume : 1;
  }

  function loadInitialVolume() {
    chrome.runtime.sendMessage({ type: 'GET_TAB_HOSTNAME' }, (response) => {
      hostname = (response && response.hostname) || null;
      if (!hostname) return;
      chrome.storage.sync.get([SITES_KEY], (result) => {
        const sites = result[SITES_KEY] || {};
        applyVolume(volumeFromSiteEntry(sites[hostname]));
      });
    });
  }

  loadInitialVolume();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[SITES_KEY] && hostname) {
      const sites = changes[SITES_KEY].newValue || {};
      applyVolume(volumeFromSiteEntry(sites[hostname]));
    }
  });

  // On a page that mutates its DOM heavily (e.g. YouTube's sidebar, chat,
  // progress bar), a MutationObserver callback can fire dozens of times per
  // second. Doing a shadow-DOM-aware `querySelectorAll('*')` walk on every
  // single firing is what caused the browser-wide lag reported earlier, so
  // the hot path here only runs the cheap tag-only query, debounced, and the
  // expensive shadow walk is confined to a slow periodic fallback below.
  const MUTATION_DEBOUNCE_MS = 250;
  let mutationDebounce = null;

  const observer = new MutationObserver(() => {
    if (mutationDebounce) return;
    mutationDebounce = setTimeout(() => {
      mutationDebounce = null;
      document.querySelectorAll('audio, video').forEach(trackElement);
    }, MUTATION_DEBOUNCE_MS);
  });

  function startObserving() {
    const root = document.documentElement || document.body;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    startObserving();
  }

  // Fast fallback net: re-assert volume on already-tracked elements in case a
  // page resets it outside of a 'volumechange' event we'd otherwise catch.
  setInterval(() => {
    trackedElements.forEach((el) => {
      if (!el.isConnected) {
        trackedElements.delete(el);
        return;
      }
      if (!isInSync(el)) applyVolumeToElement(el);
    });
  }, 1500);

  // Slow fallback net: catches media elements added inside a shadow root,
  // which the cheap document-wide query above cannot see into. Bounded to
  // once every few seconds so it never becomes the hot path.
  setInterval(() => {
    const elements = [];
    collectMediaElements(document, elements);
    elements.forEach(trackElement);
  }, 5000);
})();
