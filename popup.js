const slider = document.getElementById('slider');
const val = document.getElementById('val');
const muteBtn = document.getElementById('muteBtn');
const muteBtnLabel = document.getElementById('muteBtnLabel');
const resetBtn = document.getElementById('resetBtn');
const wave1 = document.getElementById('wave1');
const wave2 = document.getElementById('wave2');
const subtitle = document.getElementById('subtitle');
const footerHint = document.getElementById('footerHint');

const SITES_KEY = 'sites';
let hostname = null;
let sites = {};

function paintTrack(percent) {
  slider.style.background = `linear-gradient(90deg, var(--accent-1) 0%, var(--accent-2) ${percent}%, var(--track-bg) ${percent}%)`;
}

function paintIcon(percent, muted) {
  const silent = muted || percent === 0;
  wave1.style.opacity = silent ? 0.25 : 1;
  wave2.style.opacity = silent || percent < 50 ? 0.25 : 1;
}

function paintMuteBtn(muted) {
  muteBtn.classList.toggle('is-muted', muted);
  muteBtnLabel.textContent = muted ? 'Unmute' : 'Mute';
}

function setDisplay(percent, muted) {
  slider.value = percent;
  val.textContent = percent;
  paintTrack(percent);
  paintIcon(percent, muted);
}

function getEntry() {
  return sites[hostname] || { volume: 1, muted: false, volumeBeforeMute: 1 };
}

function saveEntry(entry) {
  sites[hostname] = entry;
  chrome.storage.sync.set({ [SITES_KEY]: sites });
}

function disableControls(disabled) {
  slider.disabled = disabled;
  muteBtn.disabled = disabled;
  resetBtn.disabled = disabled;
}

function showUnsupported() {
  subtitle.textContent = 'Not available on this page';
  footerHint.textContent = 'Open a regular website tab to control its volume.';
  setDisplay(100, false);
  paintMuteBtn(false);
  disableControls(true);
}

function renderFromEntry() {
  const entry = getEntry();
  const percent = Math.round((entry.muted ? 0 : (entry.volume ?? 1)) * 100);
  setDisplay(percent, entry.muted);
  paintMuteBtn(entry.muted);
  slider.disabled = entry.muted;
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  let url = null;
  try {
    url = tab && tab.url ? new URL(tab.url) : null;
  } catch (e) {
    url = null;
  }

  if (!url || !/^https?:$/.test(url.protocol)) {
    showUnsupported();
    return;
  }

  hostname = url.hostname;
  subtitle.textContent = hostname;

  chrome.storage.sync.get([SITES_KEY], (result) => {
    sites = result[SITES_KEY] || {};
    renderFromEntry();
  });
});

slider.addEventListener('input', () => {
  if (!hostname) return;
  const percent = Number(slider.value);
  setDisplay(percent, false);
  paintMuteBtn(false);
  saveEntry({ volume: percent / 100, muted: false, volumeBeforeMute: percent / 100 });
});

muteBtn.addEventListener('click', () => {
  if (!hostname) return;
  const isMuted = muteBtn.classList.contains('is-muted');
  if (!isMuted) {
    const currentPercent = Number(slider.value);
    saveEntry({
      volume: currentPercent / 100,
      volumeBeforeMute: currentPercent / 100,
      muted: true,
    });
    slider.disabled = true;
    paintIcon(currentPercent, true);
    paintMuteBtn(true);
  } else {
    const entry = getEntry();
    const vol = typeof entry.volumeBeforeMute === 'number' ? entry.volumeBeforeMute : 1;
    const percent = Math.round(vol * 100);
    setDisplay(percent, false);
    paintMuteBtn(false);
    saveEntry({ volume: vol, volumeBeforeMute: vol, muted: false });
    slider.disabled = false;
  }
});

resetBtn.addEventListener('click', () => {
  if (!hostname) return;
  setDisplay(100, false);
  paintMuteBtn(false);
  slider.disabled = false;
  saveEntry({ volume: 1, muted: false, volumeBeforeMute: 1 });
});
