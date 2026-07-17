(function () {
  const SITES_KEY = 'sites';
  let currentVolume = 1;
  let hostname = null;
  const trackedElements = new WeakSet();

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

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') {
          trackElement(node);
        }
        if (typeof node.querySelectorAll === 'function') {
          const nested = [];
          collectMediaElements(node, nested);
          nested.forEach(trackElement);
        }
      });
    }
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

  // Re-assert volume periodically as a fallback net: some players (video.js,
  // HLS, ads) reset el.volume/muted back to their own default outside of a
  // 'volumechange' event we'd otherwise catch immediately.
  setInterval(() => {
    const elements = [];
    collectMediaElements(document, elements);
    elements.forEach((el) => {
      if (!isInSync(el)) applyVolumeToElement(el);
    });
  }, 1500);
})();
