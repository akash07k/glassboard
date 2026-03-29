// marked is loaded on demand via dynamic import to keep the main bundle small
let markedParse: ((src: string) => string) | null = null;

async function loadMarked(): Promise<(src: string) => string> {
  if (markedParse) return markedParse;
  const { marked } = await import("marked");
  markedParse = (src: string) => marked.parse(src, { async: false }) as string;
  return markedParse;
}

// --- Settings: config.json defaults → localStorage overrides ---
const STORAGE_KEY = "glassboard_settings";

function loadDefaults(): any {
  const el = document.getElementById("app-defaults");
  if (el) try { return JSON.parse(el.textContent || ""); } catch (e) {}
  return {};
}

function loadSaved(): any {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}; } catch (e) { return {}; }
}

function saveSetting(key: string, value: any): void {
  const saved = loadSaved();
  saved[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function getSetting(key: string, fallback?: any): any {
  const saved = loadSaved();
  if (key in saved) return saved[key];
  return fallback;
}

const defaults: any = loadDefaults();

// --- Sound Engine ---
const soundsConfig: any = (defaults && defaults.sounds) || { enabled: true, profile: "default", volume: 0.7, events: {} };
const soundCache: Record<string, HTMLAudioElement> = {};
const soundLastPlayed: Record<string, number> = {};

let soundsUnlocked = false;

function initSounds(): void {
  const profile = getSetting("sound_profile", soundsConfig.profile || "default");
  const events = soundsConfig.events || {};
  Object.keys(events).forEach(function (name: string) {
    const evt = events[name];
    if (!evt.file) return;
    const audio = new Audio("/sounds/" + profile + "/" + evt.file);
    audio.preload = "auto";
    audio.load();
    soundCache[name] = audio;
  });
}

// Browsers block audio until a user gesture.
// Only unlock via the explicit activate button — not on random keydown/click,
// because screen reader navigation (Tab, arrow keys) would trigger it prematurely.
function unlockAudio(): void {
  if (soundsUnlocked) return;
  soundsUnlocked = true;
  const keys = Object.keys(soundCache);
  if (keys.length > 0) {
    const test = new Audio(soundCache[keys[0]].src);
    test.volume = 0;
    test.play().then(() => { test.pause(); }).catch(() => {});
  }
}

// Sound toggle button — first click unlocks audio, subsequent clicks toggle mute
const soundToggleBtn = document.getElementById("activate-sounds") as HTMLButtonElement | null;
let soundsMuted = getSetting("sound_muted", false);

if (soundToggleBtn) {
  // Restore button state from persisted mute setting
  if (soundsMuted) {
    soundToggleBtn.textContent = "Sounds off";
    soundToggleBtn.setAttribute("aria-pressed", "false");
  }

  soundToggleBtn.addEventListener("click", () => {
    const lr = document.getElementById("live-region");
    if (!soundsUnlocked) {
      // First click: unlock audio context, respect persisted mute preference
      unlockAudio();
      if (!soundsMuted) playSound("SessionStart");
      soundToggleBtn.textContent = soundsMuted ? "Sounds off" : "Sounds on";
      soundToggleBtn.setAttribute("aria-pressed", soundsMuted ? "false" : "true");
      if (lr) lr.textContent = soundsMuted ? "Sounds ready (muted)" : "Sounds activated";
    } else {
      // Toggle mute
      soundsMuted = !soundsMuted;
      saveSetting("sound_muted", soundsMuted);
      soundToggleBtn.textContent = soundsMuted ? "Sounds off" : "Sounds on";
      soundToggleBtn.setAttribute("aria-pressed", soundsMuted ? "false" : "true");
      if (lr) lr.textContent = soundsMuted ? "Sounds muted" : "Sounds unmuted";
    }
  });
}

// --- OS Notifications ---
// Request permission on first user interaction
function requestNotificationPermission(): void {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  document.removeEventListener("click", requestNotificationPermission);
}
document.addEventListener("click", requestNotificationPermission);

function sendNotification(title: string, body: string): void {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const notifyWhenFocused = getSetting("notify_when_focused", soundsConfig.notifyWhenFocused || false);
  if (!notifyWhenFocused && document.hasFocus()) return;
  new Notification(title, { body: body });
}

// Only the focused tab plays sounds — prevents overlapping noise from multiple tabs
let tabFocused = document.hasFocus();
window.addEventListener("focus", function () { tabFocused = true; });
window.addEventListener("blur", function () { tabFocused = false; });

function playSound(eventName: string): void {
  if (soundsMuted) return;

  const soundWhenBackground = getSetting("sound_when_background", soundsConfig.soundWhenBackground || false);
  if (!tabFocused && !soundWhenBackground) return;

  const masterEnabled = getSetting("sound_enabled", soundsConfig.enabled);
  if (!masterEnabled) return;

  const evtConfig = soundsConfig.events ? soundsConfig.events[eventName] : null;
  if (!evtConfig) return;

  const eventEnabled = getSetting("sound_event_" + eventName + "_enabled", evtConfig.enabled);
  if (!eventEnabled) return;

  const interval = getSetting("sound_event_" + eventName + "_repeatInterval", evtConfig.repeatInterval || 0);
  if (interval > 0) {
    const now = Date.now();
    const last = soundLastPlayed[eventName] || 0;
    if (now - last < interval * 1000) return;
    soundLastPlayed[eventName] = now;
  }

  const cached = soundCache[eventName];
  if (!cached) return;

  const masterVol = getSetting("sound_volume", soundsConfig.volume || 0.7);
  const eventVol = getSetting("sound_event_" + eventName + "_volume", evtConfig.volume || 0.7);
  const count = getSetting("sound_event_" + eventName + "_repeatCount", evtConfig.repeatCount || 1);
  const vol = masterVol * eventVol;

  for (let r = 0; r < count; r++) {
    (function (delay: number) {
      setTimeout(function () {
        const clone = new Audio(cached.src);
        clone.volume = vol;
        clone.play().catch(function () {});
      }, delay);
    })(r * 300);
  }
}

initSounds();

// --- Sound Settings UI ---
const soundMasterToggle = document.getElementById("sound-master-toggle") as HTMLInputElement | null;
const soundMasterVolume = document.getElementById("sound-master-volume") as HTMLInputElement | null;

if (soundMasterToggle) {
  soundMasterToggle.checked = getSetting("sound_enabled", soundsConfig.enabled);
  soundMasterToggle.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("sound_enabled", this.checked);
  });
}

if (soundMasterVolume) {
  soundMasterVolume.value = String(Math.round(getSetting("sound_volume", soundsConfig.volume) * 100));
  soundMasterVolume.addEventListener("input", function (this: HTMLInputElement) {
    saveSetting("sound_volume", parseInt(this.value, 10) / 100);
  });
}

const profileInput = document.getElementById("sound-profile") as HTMLInputElement | null;
if (profileInput) {
  profileInput.value = getSetting("sound_profile", soundsConfig.profile || "default") as string;
  profileInput.addEventListener("change", function(this: HTMLInputElement) {
    saveSetting("sound_profile", this.value);
    // Re-initialize sounds with new profile
    for (const key of Object.keys(soundCache)) delete soundCache[key];
    initSounds();
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Sound profile changed to " + this.value;
  });
}

const soundWhenBg = document.getElementById("sound-when-background") as HTMLInputElement | null;
if (soundWhenBg) {
  soundWhenBg.checked = getSetting("sound_when_background", soundsConfig.soundWhenBackground || false);
  soundWhenBg.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("sound_when_background", this.checked);
  });
}

const notifyWhenFocused = document.getElementById("notify-when-focused") as HTMLInputElement | null;
if (notifyWhenFocused) {
  notifyWhenFocused.checked = getSetting("notify_when_focused", soundsConfig.notifyWhenFocused || false);
  notifyWhenFocused.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("notify_when_focused", this.checked);
  });
}

document.querySelectorAll("[data-sound-event]").forEach(function (cb) {
  const input = cb as HTMLInputElement;
  const name = input.dataset.soundEvent!;
  const evtDefault: any = (soundsConfig.events && soundsConfig.events[name]) || {};
  input.checked = getSetting("sound_event_" + name + "_enabled", evtDefault.enabled);
  input.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("sound_event_" + name + "_enabled", this.checked);
  });
});

document.querySelectorAll("[data-sound-vol]").forEach(function (slider) {
  const input = slider as HTMLInputElement;
  const name = input.dataset.soundVol!;
  const evtDefault: any = (soundsConfig.events && soundsConfig.events[name]) || {};
  input.value = String(Math.round(getSetting("sound_event_" + name + "_volume", evtDefault.volume || 0.7) * 100));
  input.addEventListener("input", function (this: HTMLInputElement) {
    saveSetting("sound_event_" + name + "_volume", parseInt(this.value, 10) / 100);
  });
});

document.querySelectorAll("[data-sound-announce]").forEach(function (cb) {
  const input = cb as HTMLInputElement;
  const name = input.dataset.soundAnnounce!;
  const evtDefault: any = (soundsConfig.events && soundsConfig.events[name]) || {};
  input.checked = getSetting("sound_event_" + name + "_announce", evtDefault.announce !== false);
  input.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("sound_event_" + name + "_announce", this.checked);
  });
});

document.querySelectorAll("[data-sound-notify]").forEach(function (cb) {
  const input = cb as HTMLInputElement;
  const name = input.dataset.soundNotify!;
  const evtDefault: any = (soundsConfig.events && soundsConfig.events[name]) || {};
  input.checked = getSetting("sound_event_" + name + "_notify", evtDefault.notify === true);
  input.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("sound_event_" + name + "_notify", this.checked);
  });
});

document.querySelectorAll("[data-sound-ri]").forEach(function (el) {
  const input = el as HTMLInputElement;
  const name = input.dataset.soundRi!;
  const evtDefault: any = (soundsConfig.events && soundsConfig.events[name]) || {};
  input.value = String(getSetting("sound_event_" + name + "_repeatInterval", evtDefault.repeatInterval || 0));
  input.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("sound_event_" + name + "_repeatInterval", parseFloat(this.value) || 0);
  });
});

document.querySelectorAll("[data-sound-rc]").forEach(function (el) {
  const input = el as HTMLInputElement;
  const name = input.dataset.soundRc!;
  const evtDefault: any = (soundsConfig.events && soundsConfig.events[name]) || {};
  input.value = String(getSetting("sound_event_" + name + "_repeatCount", evtDefault.repeatCount || 1));
  input.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("sound_event_" + name + "_repeatCount", parseInt(this.value, 10) || 1);
  });
});

// --- Display Toggles ---
document.querySelectorAll("[data-toggle]").forEach(function (cb) {
  const input = cb as HTMLInputElement;
  const type = input.dataset.toggle!;
  const configDefault = defaults.toggles ? defaults.toggles[type] : input.defaultChecked;
  input.checked = getSetting("toggle_" + type, configDefault);
  input.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("toggle_" + type, this.checked);
    applyToggles();
  });
});

function applyToggles(): void {
  document.querySelectorAll(".message").forEach(function (msg) {
    const el = msg as HTMLElement;
    const cb = document.querySelector('[data-toggle="' + el.dataset.type + '"]') as HTMLInputElement | null;
    if (cb && !cb.checked) el.hidden = true;
    else if (!el.classList.contains("search-hidden")) el.hidden = false;
  });
  // Re-apply bookmarks-only filter if active
  const bkOnly = document.getElementById("bookmarks-only") as HTMLInputElement | null;
  if (bkOnly?.checked) {
    document.querySelectorAll(".message").forEach((el) => {
      if ((el as HTMLElement).dataset.bookmarked !== "true") (el as HTMLElement).hidden = true;
    });
  }
}
applyToggles();

// --- Markdown Toggle ---
const markdownToggle = document.getElementById("toggle-markdown") as HTMLInputElement | null;

if (markdownToggle) {
  const mdDefault = defaults.renderMarkdown || false;
  markdownToggle.checked = getSetting("renderMarkdown", mdDefault);

  // Pre-load marked chunk during init so toggleMarkdown doesn't race with SSE/pagination
  if (markdownToggle.checked) {
    loadMarked().then(() => toggleMarkdown(true)).catch(() => {});
  }

  markdownToggle.addEventListener("change", function (this: HTMLInputElement) {
    saveSetting("renderMarkdown", this.checked);
    toggleMarkdown(this.checked);
  });
}

async function toggleMarkdown(on: boolean): Promise<void> {
  const els = document.querySelectorAll(".message-content");
  if (on) {
    let parse: (src: string) => string;
    try {
      parse = await loadMarked();
    } catch {
      const lr = document.getElementById("live-region");
      if (lr) lr.textContent = "Failed to load markdown renderer";
      return;
    }
    els.forEach(function (el) {
      const htmlEl = el as HTMLElement;
      if (!htmlEl.dataset.original) htmlEl.dataset.original = htmlEl.textContent || "";
      const pre = htmlEl.querySelector("pre");
      if (pre) {
        const parsed = parse(pre.textContent || "");
        htmlEl.textContent = "";
        const doc = new DOMParser().parseFromString(parsed, "text/html");
        while (doc.body.firstChild) htmlEl.appendChild(doc.body.firstChild);
        htmlEl.classList.add("rendered");
      }
    });
  } else {
    els.forEach(function (el) {
      const htmlEl = el as HTMLElement;
      if (htmlEl.dataset.original) {
        htmlEl.textContent = "";
        const pre = document.createElement("pre");
        pre.textContent = htmlEl.dataset.original;
        htmlEl.appendChild(pre);
        htmlEl.classList.remove("rendered");
      }
    });
  }
}

// --- Search ---
const searchInput = document.getElementById("search-input") as HTMLInputElement | null;
const searchStatus = document.getElementById("search-status");
let searchMatches: HTMLElement[] = [];
let searchIndex = -1;
if (searchInput) searchInput.addEventListener("input", performSearch);

function performSearch(): void {
  if (!searchInput) return;
  const q = searchInput.value.toLowerCase().trim();
  const msgs = document.querySelectorAll(".message");
  searchMatches = []; searchIndex = -1;
  msgs.forEach(function (msg) {
    const el = msg as HTMLElement;
    el.classList.remove("search-match", "search-hidden");
    if (!q) return; // Don't touch hidden state — applyToggles handles it
    if (el.textContent!.toLowerCase().includes(q)) {
      searchMatches.push(el); el.classList.add("search-match"); el.hidden = false;
    } else { el.classList.add("search-hidden"); el.hidden = true; }
  });
  if (!q) {
    if (searchStatus) searchStatus.textContent = "";
    applyToggles();
    return;
  }
  if (searchStatus) {
    searchStatus.textContent = searchMatches.length + " messages match";
    playSound(searchMatches.length > 0 ? "search_match" : "search_no_match");
  }
}

function nextMatch(): void { if (!searchMatches.length) return; searchIndex = (searchIndex + 1) % searchMatches.length; searchMatches[searchIndex].focus(); }
function prevMatch(): void { if (!searchMatches.length) return; searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length; searchMatches[searchIndex].focus(); }
function clearSearch(): void {
  if (!searchInput) return;
  searchInput.value = ""; performSearch();
  if (searchStatus) searchStatus.textContent = "Search cleared";
  const c = document.getElementById("conversation"); if (c) c.focus();
}

// --- Preview Sound Buttons ---
document.addEventListener("click", function (e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest(".preview-sound-btn") as HTMLElement | null;
  if (!btn) return;
  const name = btn.dataset.preview;
  if (!name || !soundCache[name]) return;
  unlockAudio();
  const evtConfig: any = (soundsConfig.events && soundsConfig.events[name]) || {};
  const masterVol = getSetting("sound_volume", soundsConfig.volume || 0.7);
  const eventVol = getSetting("sound_event_" + name + "_volume", evtConfig.volume || 0.7);
  const count = getSetting("sound_event_" + name + "_repeatCount", evtConfig.repeatCount || 1);
  const vol = masterVol * eventVol;
  const lr = document.getElementById("live-region");
  for (let r = 0; r < count; r++) {
    (function (delay: number) {
      setTimeout(function () {
        const clone = new Audio(soundCache[name].src);
        clone.volume = vol;
        clone.play().catch(function () {
          if (lr) lr.textContent = "Sound preview failed — activate sounds first";
        });
      }, delay);
    })(r * 300);
  }
});

// --- Copy Buttons ---
document.addEventListener("click", function (e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest(".copy-btn") as HTMLElement | null;
  if (!btn) return;
  const article = btn.closest(".message") as HTMLElement | null;
  if (!article) return;
  const md = article.dataset.copy || article.textContent || "";
  navigator.clipboard.writeText(md).then(function () {
    btn.textContent = "Copied";
    playSound("copy");
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Message copied as markdown";
    setTimeout(function () { btn.textContent = "Copy"; }, 1500);
  }).catch(function () {
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Copy failed";
  });
});

// --- Navigation ---
function visibleMsgs(): HTMLElement[] { return Array.from(document.querySelectorAll(".message:not([hidden])")) as HTMLElement[]; }
function focusIdx(): number { return visibleMsgs().indexOf(document.activeElement as HTMLElement); }

function jumpMsg(dir: string): void {
  const m = visibleMsgs(); if (!m.length) return;
  const i = focusIdx();
  if (i === -1) { m[dir === "next" ? 0 : m.length - 1].focus(); return; }
  const next = dir === "next" ? Math.min(i + 1, m.length - 1) : Math.max(i - 1, 0);
  if (next === i) { playSound("navigation_boundary"); }
  m[next].focus();
}

function jumpType(type: string): void {
  const m = visibleMsgs(), i = focusIdx();
  for (let j = i + 1; j < m.length; j++) if (m[j].dataset.type === type) { m[j].focus(); return; }
  for (let k = 0; k <= i; k++) if (m[k].dataset.type === type) { m[k].focus(); return; }
}

function jumpLatest(): void {
  const m = visibleMsgs();
  if (m.length) m[m.length - 1].focus();
}

function jumpLatestOfType(type: string): void {
  const m = visibleMsgs();
  for (let i = m.length - 1; i >= 0; i--) {
    if (m[i].dataset.type === type) { m[i].focus(); return; }
  }
  playSound("navigation_boundary");
}

function jumpTurn(dir: string): void {
  const turns = Array.from(document.querySelectorAll(".turn-group")) as HTMLElement[];
  if (!turns.length) return;
  // Find which turn contains the current focus
  const focused = document.activeElement;
  let currentTurnIdx = -1;
  for (let i = 0; i < turns.length; i++) {
    if (turns[i].contains(focused)) { currentTurnIdx = i; break; }
  }
  let next: number;
  if (currentTurnIdx === -1) {
    next = dir === "next" ? 0 : turns.length - 1;
  } else {
    next = dir === "next"
      ? Math.min(currentTurnIdx + 1, turns.length - 1)
      : Math.max(currentTurnIdx - 1, 0);
  }
  turns[next].focus();
}

function announceShortcuts(): void {
  const r = document.getElementById("live-region");
  if (r) r.textContent = "Alt+J next message, Alt+K previous, Alt+T next turn, Alt+Shift+T previous turn, Alt+G latest message, Alt+U latest user, Alt+Shift+U cycle user messages, Alt+A latest assistant, Alt+Shift+A cycle assistant responses, Alt+B bookmark, Alt+Shift+B next bookmark, Alt+E export, Alt+S search, Alt+N next match, Alt+Shift+N previous match, Alt+/ announce shortcuts, Escape clear.";
}

// --- Keys ---
document.addEventListener("keydown", function (e: KeyboardEvent) {
  if (e.key === "Escape") { e.preventDefault(); clearSearch(); return; }
  if (!e.altKey) return;
  switch (e.key) {
    case "j": e.preventDefault(); jumpMsg("next"); break;
    case "k": e.preventDefault(); jumpMsg("prev"); break;
    case "u": e.preventDefault(); e.shiftKey ? jumpType("user") : jumpLatestOfType("user"); break;
    case "a": e.preventDefault(); e.shiftKey ? jumpType("assistant_text") : jumpLatestOfType("assistant_text"); break;
    case "g": e.preventDefault(); jumpLatest(); break;
    case "t": e.preventDefault(); e.shiftKey ? jumpTurn("prev") : jumpTurn("next"); break;
    case "b":
      e.preventDefault();
      if (e.shiftKey) {
        // Jump to next bookmark
        const msgs = visibleMsgs();
        const idx = focusIdx();
        for (let i = idx + 1; i < msgs.length; i++) {
          if ((msgs[i] as HTMLElement).dataset.bookmarked === "true") { msgs[i].focus(); return; }
        }
        for (let i = 0; i <= idx; i++) {
          if ((msgs[i] as HTMLElement).dataset.bookmarked === "true") { msgs[i].focus(); return; }
        }
      } else {
        // Toggle bookmark on focused message
        const focused = document.activeElement?.closest(".message");
        if (focused) {
          const bkBtn = focused.querySelector(".bookmark-btn") as HTMLButtonElement | null;
          if (bkBtn) bkBtn.click();
        }
      }
      break;
    case "e": e.preventDefault(); doExport(); break;
    case "s": e.preventDefault(); if (searchInput) searchInput.focus(); break;
    case "n": e.preventDefault(); e.shiftKey ? prevMatch() : nextMatch(); break;
    case "N": e.preventDefault(); prevMatch(); break;
    case "/": e.preventDefault(); announceShortcuts(); break;
  }
});

// --- Reset Settings ---
const resetBtn = document.getElementById("reset-settings");
if (resetBtn) {
  resetBtn.addEventListener("click", function () {
    localStorage.removeItem(STORAGE_KEY);
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "All settings reset to defaults";
    window.location.reload();
  });
}

// --- Submit selects on Enter or mouse click (not arrow key navigation) ---
document.querySelectorAll("nav form select").forEach(function (s) {
  const sel = s as HTMLSelectElement;
  let mouseSelected = false;
  sel.addEventListener("mousedown", function () { mouseSelected = true; });
  sel.addEventListener("change", function (this: HTMLSelectElement) {
    if (mouseSelected) {
      mouseSelected = false;
      (this.closest("form") as HTMLFormElement).submit();
    }
  });
  sel.addEventListener("keydown", function (this: HTMLSelectElement, e: KeyboardEvent) {
    if (e.key !== "Enter") mouseSelected = false; // Reset on any keyboard navigation
    if (e.key === "Enter") {
      e.preventDefault();
      (this.closest("form") as HTMLFormElement).submit();
    }
  });
});

// --- Export ---
const exportBtn = document.getElementById("export-btn");
const exportFormat = document.getElementById("export-format") as HTMLSelectElement | null;
if (exportBtn) exportBtn.addEventListener("click", doExport);

if (exportFormat) {
  const savedFmt = getSetting("exportFormat", defaults.exportFormat || "txt");
  exportFormat.value = savedFmt;
  exportFormat.addEventListener("change", function (this: HTMLSelectElement) {
    saveSetting("exportFormat", this.value);
  });
}

function doExport(): void {
  const c = document.getElementById("conversation") as HTMLElement | null; if (!c) return;
  const fmt = exportFormat ? exportFormat.value : "txt";
  playSound("export");
  window.location.href = "/api/sessions/" + c.dataset.project + "/" + c.dataset.session + "/export?format=" + fmt;
}

// --- Message Renderer (for incremental DOM updates) ---

interface MessageData {
  type: string;
  text?: string;
  content?: string;
  toolName?: string;
  toolUseId?: string;
  description?: string;
  input?: string;
  subtype?: string;
  command?: string;
  output?: string;
  turnIndex?: number;
  index?: number;
}

function messageLabel(msg: MessageData, index: number): string {
  switch (msg.type) {
    case "user": return "User message " + (index + 1);
    case "assistant_text": return "Assistant response " + (index + 1);
    case "assistant_thinking": return "Assistant thinking " + (index + 1);
    case "tool_call": return "Tool call " + (index + 1) + ": " + msg.toolName;
    case "tool_result": { const tn = clientToolNameMap.get(msg.toolUseId || "") || "Tool"; return tn + " output " + (index + 1); }
    case "system": return "System message " + (index + 1);
    case "local_command": return "Command " + (index + 1) + ": " + (msg.command || "");
    case "queued": return "Queued message " + (index + 1);
    default: return "Message " + (index + 1);
  }
}

function typeHeading(msg: MessageData): string {
  switch (msg.type) {
    case "user": return "User";
    case "assistant_text": return "Assistant";
    case "assistant_thinking": return "Thinking";
    case "system": return "System: " + msg.subtype;
    case "local_command": return "Command: " + (msg.command || "");
    case "queued": return "Queued";
    default: return msg.type;
  }
}

function messageText(msg: MessageData): string {
  switch (msg.type) {
    case "user": return msg.text || "";
    case "assistant_text": return msg.text || "";
    case "assistant_thinking": return msg.text || "";
    case "system": return msg.text || "";
    case "tool_result": return msg.content || "";
    case "local_command": return msg.output || msg.command || "";
    case "queued": return msg.text || "";
    default: return "";
  }
}

function headingTag(type: string): string {
  if (type === "user") return "h3";
  if (type === "assistant_text") return "h4";
  return "h2";
}

function copyTextClient(msg: MessageData): string {
  switch (msg.type) {
    case "user": return "## User\n" + msg.text;
    case "assistant_text": return "## Assistant\n" + msg.text;
    case "assistant_thinking": return "## Thinking\n" + msg.text;
    case "tool_call": return "### Tool: " + msg.toolName + " — " + msg.description + "\n```\n" + msg.input + "\n```";
    case "tool_result": return "### Tool Output\n```\n" + msg.content + "\n```";
    case "system": return "*" + msg.text + "*";
    case "local_command": return "> " + (msg.command || "") + "\n" + (msg.output || "");
    case "queued": return msg.text || "";
    default: return "";
  }
}

function renderMessageToDOM(msg: MessageData, index: number): HTMLElement {
  const article = document.createElement("article");
  article.className = "message message-" + msg.type;
  article.dataset.type = msg.type;
  article.setAttribute("aria-label", messageLabel(msg, index));
  article.tabIndex = -1;
  const tag = headingTag(msg.type);

  if (msg.type === "tool_call") {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const h = document.createElement(tag);
    h.textContent = msg.toolName + ": " + msg.description;
    summary.appendChild(h);
    details.appendChild(summary);
    const pre = document.createElement("pre");
    pre.className = "tool-input";
    pre.textContent = msg.input || "";
    details.appendChild(pre);
    article.appendChild(details);
  } else if (msg.type === "tool_result") {
    const details2 = document.createElement("details");
    const summary2 = document.createElement("summary");
    const h2 = document.createElement(tag);
    const sourceTool = clientToolNameMap.get(msg.toolUseId || "") || "Tool";
    h2.textContent = sourceTool + " output";
    summary2.appendChild(h2);
    details2.appendChild(summary2);
    const pre2 = document.createElement("pre");
    pre2.className = "tool-output";
    pre2.textContent = msg.content || "";
    details2.appendChild(pre2);
    article.appendChild(details2);
  } else {
    const heading = document.createElement(tag);
    heading.textContent = typeHeading(msg);
    article.appendChild(heading);
    const div = document.createElement("div");
    div.className = "message-content";
    const pre3 = document.createElement("pre");
    const rawText = messageText(msg);
    pre3.textContent = rawText;
    div.appendChild(pre3);
    article.appendChild(div);

    // Apply markdown rendering if toggle is on and marked is loaded
    if (markdownToggle?.checked && markedParse) {
      (div as HTMLElement).dataset.original = rawText;
      const parsed = markedParse(rawText);
      div.textContent = "";
      const doc = new DOMParser().parseFromString(parsed, "text/html");
      while (doc.body.firstChild) div.appendChild(doc.body.firstChild);
      div.classList.add("rendered");
    }
  }

  // Add copy button
  const copyBtn = document.createElement("button");
  copyBtn.className = "copy-btn";
  copyBtn.type = "button";
  copyBtn.setAttribute("aria-label", "Copy this message as markdown");
  copyBtn.textContent = "Copy";
  article.appendChild(copyBtn);

  // Add bookmark button
  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.className = "bookmark-btn";
  bookmarkBtn.type = "button";
  bookmarkBtn.dataset.index = String(index);
  bookmarkBtn.setAttribute("aria-label", "Bookmark this message");
  bookmarkBtn.setAttribute("aria-pressed", "false");
  bookmarkBtn.textContent = "Bookmark";
  article.appendChild(bookmarkBtn);

  // Set data-copy for the copy handler
  article.dataset.copy = copyTextClient(msg);

  // Respect current toggle state
  const toggleCb = document.querySelector('[data-toggle="' + msg.type + '"]') as HTMLInputElement | null;
  if (toggleCb && !toggleCb.checked) article.hidden = true;

  return article;
}

// --- Pagination ---
const conversation = document.getElementById("conversation") as HTMLElement | null;
const paginationStatus = document.getElementById("pagination-status");

// Page link click handler (event delegation)
document.addEventListener("click", function (e: Event) {
  const link = (e.target as HTMLElement).closest("a[data-page]") as HTMLAnchorElement | null;
  if (!link) return;
  e.preventDefault();
  const page = parseInt(link.dataset.page || "1", 10);
  loadPageByNumber(page);
});

async function loadPageByNumber(page: number): Promise<void> {
  if (!conversation) return;
  const projectId = conversation.dataset.project;
  const sessionId = conversation.dataset.session;
  const pageSize = parseInt(conversation.dataset.pageSize || "30", 10) || 30;
  const totalCount = parseInt(conversation.dataset.totalCount || "0", 10);
  const totalPages = Math.ceil(totalCount / pageSize);

  // Clamp page
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  // Calculate "before" param: page N shows messages ending at page * pageSize
  const before = Math.min(page * pageSize, totalCount);

  const url = "/api/sessions/" + projectId + "/" + sessionId + "?limit=" + pageSize + "&before=" + before;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const newMessages: MessageData[] = data.messages;

    // Always replace content when navigating by page number
    const existing = conversation.querySelectorAll(".turn-group");
    existing.forEach(function (el) { el.remove(); });
    renderMessagesAsGroups(newMessages, data.startIndex);
    conversation.dataset.loadedFrom = String(data.startIndex);
    conversation.dataset.loadedTo = String(data.endIndex);

    // Update totalCount from server response (may have changed since initial load)
    const serverTotalCount = data.totalCount || totalCount;
    conversation.dataset.totalCount = String(serverTotalCount);
    const serverTotalPages = Math.ceil(serverTotalCount / pageSize);

    updatePaginationNav(data.startIndex, data.endIndex, serverTotalCount, pageSize, page);

    // Keep focus on the current page link in the pagination
    const currentPageLink = document.querySelector('a[data-page="' + page + '"]') as HTMLElement | null;
    if (currentPageLink) currentPageLink.focus();

    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Page " + page + " of " + serverTotalPages + ", messages " + (data.startIndex + 1) + " to " + data.endIndex + " of " + serverTotalCount;

    applyBookmarkStyles();
    applyToggles();
  } catch (e) {
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Failed to load page";
  }
}

function renderMessagesAsGroups(messages: MessageData[], baseIndex: number, insertBefore?: HTMLElement | null): void {
  const turns: { turnIndex: any; msgs: { msg: MessageData; globalIndex: number }[] }[] = [];
  let current: { turnIndex: any; msgs: { msg: MessageData; globalIndex: number }[] } | null = null;
  messages.forEach(function (msg: MessageData, i: number) {
    if (!current || msg.turnIndex !== current.turnIndex) {
      current = { turnIndex: msg.turnIndex, msgs: [] };
      turns.push(current);
    }
    current.msgs.push({ msg: msg, globalIndex: baseIndex + i });
  });

  turns.forEach(function (turn) {
    const section = document.createElement("section");
    section.className = "turn-group";
    section.dataset.turn = String(turn.turnIndex);
    section.setAttribute("aria-label", "Turn " + (turn.turnIndex + 1));
    section.tabIndex = -1;

    turn.msgs.forEach(function (item) {
      const el = renderMessageToDOM(item.msg, item.globalIndex);
      el.dataset.turn = String(item.msg.turnIndex);
      section.appendChild(el);
    });

    if (insertBefore && conversation) {
      conversation.insertBefore(section, insertBefore);
    } else if (conversation) {
      conversation.appendChild(section);
    }
  });
}

function buildPageListClient(totalPages: number, currentPage: number): (number | "gap")[] {
  if (totalPages <= 12) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  let windowStart = Math.max(1, currentPage - 4);
  let windowEnd = windowStart + 9;
  if (windowEnd > totalPages) {
    windowEnd = totalPages;
    windowStart = Math.max(1, windowEnd - 9);
  }
  const result: (number | "gap")[] = [];
  if (windowStart > 1) {
    result.push(1);
    if (windowStart > 2) result.push("gap");
  }
  for (let p = windowStart; p <= windowEnd; p++) result.push(p);
  if (windowEnd < totalPages) {
    if (windowEnd < totalPages - 1) result.push("gap");
    result.push(totalPages);
  }
  return result;
}

function updatePaginationNav(start: number, end: number, total: number, pageSize: number, requestedPage?: number): void {
  const totalPages = Math.ceil(total / pageSize);
  const currentPage = requestedPage || (Math.floor(start / pageSize) + 1);
  const items = buildPageListClient(totalPages, currentPage);

  const pageList = document.querySelector(".page-list");
  if (pageList) {
    pageList.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      if (item === "gap") {
        li.className = "page-gap";
        li.setAttribute("aria-hidden", "true");
        li.textContent = "...";
      } else if (item === currentPage) {
        const a = document.createElement("a");
        a.className = "page-current";
        a.href = "#";
        a.setAttribute("aria-current", "page");
        a.dataset.page = String(item);
        a.textContent = "Page " + item;
        li.appendChild(a);
      } else {
        const a = document.createElement("a");
        a.className = "page-link";
        a.href = "#";
        a.dataset.page = String(item);
        a.textContent = "Page " + item;
        li.appendChild(a);
      }
      pageList.appendChild(li);
    });
  }

  if (paginationStatus) paginationStatus.textContent =
    "Page " + currentPage + " of " + totalPages + ", messages " + (start + 1) + " to " + end + " of " + total;
}

// --- Real-time File Watching via SSE ---
const clientToolNameMap = new Map<string, string>();
let evtSource: EventSource | null = null;
let reconnectDelay = 1000;
const maxReconnectDelay = 30000;

function connectWatcher(): void {
  if (!conversation) return;
  const projectId = conversation.dataset.project;
  const sessionId = conversation.dataset.session;
  if (!projectId || !sessionId) return;

  evtSource = new EventSource("/api/watch/" + projectId + "/" + sessionId);

  evtSource.onopen = function () {
    reconnectDelay = 1000;
  };

  const allEventNames = [
    "UserPromptSubmit", "AssistantResponse", "Thinking", "PreToolUse",
    "PostToolUse", "PostToolUseFailure", "Stop", "StopFailure", "TurnComplete",
    "SessionStart", "SessionEnd", "Notification", "SubagentStart", "SubagentStop",
    "TaskCreated", "TaskCompleted", "TeammateIdle", "InstructionsLoaded",
    "ConfigChange", "CwdChanged", "FileChanged", "WorktreeCreate", "WorktreeRemove",
    "PreCompact", "PostCompact", "Elicitation", "ElicitationResult",
    "PermissionRequest", "System"
  ];

  allEventNames.forEach(function (name: string) {
    evtSource!.addEventListener(name, function (e: Event) {
      const msg: MessageData = JSON.parse((e as MessageEvent).data);
      // Track tool names so tool_result messages can reference their source tool
      if (name === "PreToolUse" && msg.toolName && msg.toolUseId) {
        clientToolNameMap.set(msg.toolUseId, msg.toolName);
      }
      appendWatchedMessage(msg, name);
      playSound(name);
      // OS notification when tab is not focused and notify is enabled
      if (shouldNotify(name)) {
        const fullTitle = document.title.replace(/ - Glassboard$/, "");
        const sessionName = fullTitle.split(":")[0].trim() || "Glassboard";
        const label = msg.type === "user" ? "User" : msg.type === "assistant_text" ? "Assistant" : name;
        let body = msg.text || msg.content || msg.type;
        const maxLen = getSetting("notify_max_length", (soundsConfig && soundsConfig.notifyMaxLength) || 500);
        if (body && body.length > maxLen) body = body.slice(0, maxLen) + "...";
        sendNotification(sessionName + " — " + label, body);
      }
    });
  });

  let reconnecting = false;
  evtSource.onerror = function () {
    if (reconnecting) return;
    reconnecting = true;
    evtSource!.close();
    setTimeout(function () {
      reconnecting = false;
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
      connectWatcher();
    }, reconnectDelay);
  };
}

function shouldAnnounce(eventName: string): boolean {
  const evtConfig = soundsConfig.events ? soundsConfig.events[eventName] : null;
  if (!evtConfig) return true;
  return getSetting("sound_event_" + eventName + "_announce", evtConfig.announce !== false);
}

function shouldNotify(eventName: string): boolean {
  const evtConfig = soundsConfig.events ? soundsConfig.events[eventName] : null;
  if (!evtConfig) return false;
  return getSetting("sound_event_" + eventName + "_notify", evtConfig.notify === true);
}

function appendWatchedMessage(msg: MessageData, eventName: string): void {
  if (!conversation) return;
  const el = renderMessageToDOM(msg, msg.index || 0);
  el.dataset.turn = String(msg.turnIndex);

  const lastTurnGroup = conversation.querySelector(".turn-group:last-of-type") as HTMLElement | null;
  if (lastTurnGroup && lastTurnGroup.dataset.turn == String(msg.turnIndex)) {
    lastTurnGroup.appendChild(el);
  } else {
    const section = document.createElement("section");
    section.className = "turn-group";
    section.dataset.turn = String(msg.turnIndex);
    section.setAttribute("aria-label", "Turn " + ((msg.turnIndex || 0) + 1));
    section.tabIndex = -1;
    section.appendChild(el);
    conversation.appendChild(section);
  }

  // Apply markdown to newly added message if toggle is on but markedParse not yet loaded
  if (markdownToggle?.checked && !markedParse) {
    loadMarked().then(() => {
      const content = el.querySelector(".message-content") as HTMLElement | null;
      if (content && markedParse) {
        const pre = content.querySelector("pre");
        if (pre) {
          content.dataset.original = pre.textContent || "";
          const parsed = markedParse(pre.textContent || "");
          content.textContent = "";
          const doc = new DOMParser().parseFromString(parsed, "text/html");
          while (doc.body.firstChild) content.appendChild(doc.body.firstChild);
          content.classList.add("rendered");
        }
      }
    }).catch(() => {});
  }

  // Respect active search filter on newly appended messages
  const activeQuery = searchInput?.value.toLowerCase().trim();
  if (activeQuery) {
    if (el.textContent?.toLowerCase().includes(activeQuery)) {
      el.classList.add("search-match");
      searchMatches.push(el);
    } else {
      el.classList.add("search-hidden");
      el.hidden = true;
    }
  }

  const loadedTo = parseInt(conversation.dataset.loadedTo || "0", 10) || 0;
  conversation.dataset.loadedTo = String(loadedTo + 1);
  conversation.dataset.totalCount = String(parseInt(conversation.dataset.totalCount || "0", 10) + 1);

  if (shouldAnnounce(eventName)) {
    const lr = document.getElementById("live-region");
    if (lr) {
      const label = msg.type === "user" ? "User" : msg.type === "assistant_text" ? "Assistant" : msg.type;
      lr.textContent = "New message: " + label;
    }
  }
}

connectWatcher();

// --- Bookmarks ---
const bookmarkIndices: Set<number> = new Set();
let allBookmarks: number[] = [];

async function loadBookmarksFromServer(): Promise<void> {
  if (!conversation) return;
  const sessionId = conversation.dataset.session;
  if (!sessionId) return;
  try {
    const resp = await fetch("/api/bookmarks/" + sessionId);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    allBookmarks = data.indices || [];
    bookmarkIndices.clear();
    allBookmarks.forEach((i: number) => bookmarkIndices.add(i));
    applyBookmarkStyles();
    populateBookmarksList();
  } catch {}
}

function applyBookmarkStyles(): void {
  document.querySelectorAll(".message").forEach((el) => {
    const article = el as HTMLElement;
    const btn = article.querySelector(".bookmark-btn") as HTMLButtonElement | null;
    const idx = btn ? parseInt(btn.dataset.index || "-1", 10) : -1;
    if (bookmarkIndices.has(idx)) {
      article.classList.add("message-bookmarked");
      article.dataset.bookmarked = "true";
      if (btn) {
        btn.textContent = "Unbookmark";
        btn.setAttribute("aria-label", "Remove bookmark");
        btn.setAttribute("aria-pressed", "true");
        btn.classList.add("bookmarked");
      }
    } else {
      article.classList.remove("message-bookmarked");
      delete article.dataset.bookmarked;
      if (btn) {
        btn.textContent = "Bookmark";
        btn.setAttribute("aria-label", "Bookmark this message");
        btn.setAttribute("aria-pressed", "false");
        btn.classList.remove("bookmarked");
      }
    }
  });
}

function populateBookmarksList(): void {
  const list = document.getElementById("bookmarks-list");
  const legend = document.querySelector(".bookmarks-panel legend");
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);

  if (legend) legend.textContent = "Bookmarks (" + allBookmarks.length + ")";

  // Show/hide the panel
  const panel = document.querySelector(".bookmarks-panel") as HTMLElement | null;
  if (panel) panel.hidden = allBookmarks.length === 0;

  allBookmarks.forEach((idx) => {
    const li = document.createElement("li");
    // Try to find the message in DOM for a preview
    const msgEl = document.querySelector('.bookmark-btn[data-index="' + idx + '"]');
    const article = msgEl?.closest(".message") as HTMLElement | null;
    const type = article?.dataset.type || "message";
    const preview = article?.querySelector(".message-content pre, .tool-input, .tool-output")?.textContent?.slice(0, 80) || "";

    const label = document.createElement("strong");
    label.textContent = (type === "user" ? "User" : type === "assistant_text" ? "Assistant" : type) + " message " + (idx + 1);
    li.appendChild(label);

    if (preview) {
      const p = document.createElement("p");
      p.textContent = preview + (preview.length >= 80 ? "..." : "");
      li.appendChild(p);
    }

    const gotoBtn = document.createElement("button");
    gotoBtn.className = "bookmark-goto";
    gotoBtn.type = "button";
    gotoBtn.dataset.gotoIndex = String(idx);
    gotoBtn.textContent = "Go to";
    li.appendChild(gotoBtn);

    list.appendChild(li);
  });
}

// Toggle bookmark on click
document.addEventListener("click", async (e: Event) => {
  const btn = (e.target as HTMLElement).closest(".bookmark-btn") as HTMLButtonElement | null;
  if (!btn || !conversation) return;
  const idx = parseInt(btn.dataset.index || "-1", 10);
  const sessionId = conversation.dataset.session;
  if (idx < 0 || !sessionId) return;

  try {
    const resp = await fetch("/api/bookmarks/" + sessionId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: idx }),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    allBookmarks = data.indices;
    bookmarkIndices.clear();
    allBookmarks.forEach((i: number) => bookmarkIndices.add(i));
    applyBookmarkStyles();
    populateBookmarksList();

    const isNowBookmarked = bookmarkIndices.has(idx);
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = isNowBookmarked ? "Bookmarked" : "Bookmark removed";
    playSound(isNowBookmarked ? "bookmark_add" : "bookmark_remove");
  } catch {
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Failed to update bookmark";
  }
});

// Go-to bookmark handler
document.addEventListener("click", async (e: Event) => {
  const btn = (e.target as HTMLElement).closest(".bookmark-goto") as HTMLButtonElement | null;
  if (!btn || !conversation) return;
  const idx = parseInt(btn.dataset.gotoIndex || "-1", 10);
  if (idx < 0) return;

  const projectId = conversation.dataset.project;
  const sessionId = conversation.dataset.session;
  const pageSize = parseInt(conversation.dataset.pageSize || "30", 10);

  // Load the page containing this index
  const before = idx + pageSize;
  const url = "/api/sessions/" + projectId + "/" + sessionId + "?limit=" + pageSize + "&before=" + before;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();

    // Replace conversation content
    const existing = conversation.querySelectorAll(".turn-group");
    existing.forEach((el: Element) => el.remove());
    renderMessagesAsGroups(data.messages, data.startIndex);
    conversation.dataset.loadedFrom = String(data.startIndex);
    conversation.dataset.loadedTo = String(data.endIndex);
    conversation.dataset.totalCount = String(data.totalCount || conversation.dataset.totalCount);

    const goToPageSize = parseInt(conversation.dataset.pageSize || "30", 10);
    updatePaginationNav(data.startIndex, data.endIndex, parseInt(conversation.dataset.totalCount || "0", 10), goToPageSize);
    applyBookmarkStyles();
    applyToggles();

    // Focus the target message
    const targetBtn = document.querySelector('.bookmark-btn[data-index="' + idx + '"]');
    const targetMsg = targetBtn?.closest(".message") as HTMLElement | null;
    if (targetMsg) targetMsg.focus();

    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Jumped to message " + (idx + 1);
  } catch {
    const lr = document.getElementById("live-region");
    if (lr) lr.textContent = "Failed to load message";
  }
});

// Bookmarks filter mode
const bookmarksOnlyCheckbox = document.getElementById("bookmarks-only") as HTMLInputElement | null;
if (bookmarksOnlyCheckbox) {
  bookmarksOnlyCheckbox.addEventListener("change", function(this: HTMLInputElement) {
    if (this.checked) {
      document.querySelectorAll(".message").forEach((el) => {
        const article = el as HTMLElement;
        if (article.dataset.bookmarked !== "true") article.hidden = true;
      });
      const visible = document.querySelectorAll('.message[data-bookmarked="true"]').length;
      const lr = document.getElementById("live-region");
      if (lr) lr.textContent = "Showing " + visible + " bookmarked messages";
    } else {
      applyToggles(); // Restore normal toggle visibility
      const lr = document.getElementById("live-region");
      if (lr) lr.textContent = "Showing all messages";
    }
  });
}

loadBookmarksFromServer();
