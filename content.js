(function () {
  const SITES_KEY = 'sites';
  const MUTATION_DEBOUNCE_MS = 250;
  const FAST_INTERVAL_MS = 1500;
  const SLOW_INTERVAL_MS = 5000;

  let currentVolume = 1;
  let hostname = null;
  let enforcementActive = false;
  let mutationDebounce = null;
  let fastIntervalId = null;
  let slowIntervalId = null;
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

  function refreshTrackedElements() {
    trackedElements.forEach((el) => {
      if (!el.isConnected) {
        trackedElements.delete(el);
        return;
      }
      if (!isInSync(el)) applyVolumeToElement(el);
    });
  }

  // Regular querySelectorAll cannot see into open shadow roots, which some
  // custom video-player elements use to host their <video>/<audio> tag.
  function collectMediaElements(root, out) {
    root.querySelectorAll('audio, video').forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectMediaElements(el.shadowRoot, out);
    });
  }

  function scanDeep() {
    const elements = [];
    collectMediaElements(document, elements);
    elements.forEach(trackElement);
  }

  // On a page that mutates its DOM heavily (e.g. YouTube's sidebar, chat,
  // progress bar), a MutationObserver callback can fire dozens of times per
  // second. Doing a shadow-DOM-aware `querySelectorAll('*')` walk on every
  // single firing caused browser-wide lag, so the hot path here only runs the
  // cheap tag-only query, debounced, and the expensive shadow walk is
  // confined to a slow periodic fallback. Both only run at all while this
  // site actually has a non-default volume/mute set — see start/stop below.
  const observer = new MutationObserver(() => {
    if (mutationDebounce) return;
    mutationDebounce = setTimeout(() => {
      mutationDebounce = null;
      document.querySelectorAll('audio, video').forEach(trackElement);
    }, MUTATION_DEBOUNCE_MS);
  });

  function observeDom() {
    const root = document.documentElement || document.body;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', observeDom, { once: true });
    }
  }

  // Most tabs never touch the volume for their site (default = 100%,
  // unmuted), so there is nothing to enforce against page scripts. Only pay
  // for the MutationObserver + polling once a site actually has a custom
  // level, and tear it all down again if the user resets back to 100%.
  function startEnforcement() {
    if (enforcementActive) return;
    enforcementActive = true;
    scanDeep();
    observeDom();
    fastIntervalId = setInterval(refreshTrackedElements, FAST_INTERVAL_MS);
    slowIntervalId = setInterval(scanDeep, SLOW_INTERVAL_MS);
  }

  function stopEnforcement() {
    if (!enforcementActive) return;
    enforcementActive = false;
    observer.disconnect();
    if (mutationDebounce) {
      clearTimeout(mutationDebounce);
      mutationDebounce = null;
    }
    if (fastIntervalId) {
      clearInterval(fastIntervalId);
      fastIntervalId = null;
    }
    if (slowIntervalId) {
      clearInterval(slowIntervalId);
      slowIntervalId = null;
    }
    // Restore anything we'd previously overridden before going idle.
    trackedElements.forEach((el) => {
      try {
        el.volume = 1;
        el.muted = false;
      } catch (e) {
        /* ignore */
      }
    });
    trackedElements.clear();
  }

  function applyVolume(vol) {
    currentVolume = clamp(vol);
    if (currentVolume === 1) {
      stopEnforcement();
      return;
    }
    startEnforcement();
    refreshTrackedElements();
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
})();
