// ==UserScript==
// @name         3CX Slack — thème, avatars et emojis
// @namespace    https://decindustrie.3cx.no/
// @version      2.0.0-beta.23
// @description  Ajoute les noms, avatars, emojis, notifications et contrôles Slack à 3CX.
// @author       DEC Industrie
// @homepageURL  https://github.com/BriceWillus/3CX-modern-theme
// @updateURL    https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-avatars.user.js
// @downloadURL  https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-avatars.user.js
// @resource     decSlackThemeCss https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-stylish.css
// @match        https://decindustrie.3cx.no:5001/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_info
// @grant        GM_getResourceText
// @grant        GM.getResourceText
// @grant        unsafeWindow
// @connect      *
// ==/UserScript==

(() => {
  "use strict";

  const SCRIPT_MARKER = "__dec3cxSlackAvatars";
  const AVATAR_CLASS = "dec-slack-message-avatar";
  const STYLE_ID = "dec-slack-message-avatar-styles";
  const MANAGED_THEME_STYLE_ID = "dec-slack-managed-theme-styles";
  const UPDATE_NOTICE_ID = "dec-slack-update-notice";
  const SCRIPT_VERSION = typeof GM_info === "object" ? String(GM_info?.script?.version || "") : "";
  const THEME_CSS_URL =
    "https://raw.githubusercontent.com/BriceWillus/3CX-modern-theme/main/3cx-slack-stylish.css";
  const THEME_REFRESH_MS = 30 * 60 * 1000;
  const PARTICIPANT_SELECTOR =
    'app-chat-participants li, app-chat-participants [data-qa="chat-participant"]';
  const MESSAGE_SELECTOR = "chat-message";
  const CHAT_TOAST_SELECTOR = "chat-toast-component";
  const CHAT_TOAST_STACK_ID = "dec-slack-chat-toast-stack";
  const ENTER_OTHER_CLASS = "dec-slack-enter-other";
  const ENTER_OWN_CLASS = "dec-slack-enter-own";
  const LATEST_READ_CLASS = "dec-slack-latest-read";
  const READ_AVATAR_CLASS = "dec-slack-read-avatar";
  const HIDDEN_READ_RECEIPT_CLASS = "dec-slack-native-read-hidden";
  const REDUNDANT_READ_RECEIPT_CLASS = "dec-slack-redundant-read";
  const HIDDEN_SENT_RECEIPT_CLASS = "dec-slack-native-sent-hidden";
  const SENT_RECEIPT_COPY_CLASS = "dec-slack-sent-receipt-copy";
  const NATIVE_DOUBLE_CHECK_SELECTOR =
    ".lucide-check-check, [lucideCheckCheck], [lucidecheckcheck]";
  const TYPING_INDICATOR_ID = "dec-slack-typing-indicator";
  const HIDDEN_NATIVE_TYPING_CLASS = "dec-slack-native-typing-hidden";
  const CONTROLS_ID = "dec-slack-controls";
  const CONTROLS_CONTENT_ID = "dec-slack-controls-content";
  const FREE_EDITION_BANNER_CLASS = "dec-slack-free-edition-hidden";
  const LIBRARY_PANEL_ID = "dec-slack-message-library";
  const LIBRARY_STYLE_ID = "dec-slack-message-library-styles";
  const STORAGE_FAVORITES = "decSlackFavoritesV1";
  const STORAGE_GALLERY_EXPLORER_LINKS = "decSlackGalleryExplorerLinks";
  const PIN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3 21 8l-4 1-3 5-1 4-7-7 4-1 5-3z"/><path d="m2 22 6-6"/></svg>';
  const UNPIN_ICON = PIN_ICON.replace("</svg>", '<path d="m3 3 18 18"/></svg>');
  const NOTE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6z"/><path d="m14 5 5 5"/></svg>';
  const GALLERY_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L6 21"/></svg>';
  const STORAGE_LAYOUT = "decSlackLayout";
  const STORAGE_THEME = "decSlackTheme";
  const STORAGE_ACCENT = "decSlackAccent";
  const STORAGE_EMOJI_MANIFEST = "decSlackEmojiManifest";
  const STORAGE_SEARCH_COLLAPSED = "decSlackSearchCollapsed";
  const STORAGE_CONTROLS_COLLAPSED = "decSlackControlsCollapsed";
  const STORAGE_THEME_CSS = "decSlackThemeCss";
  const STORAGE_LAST_SCRIPT_VERSION = "decSlackLastScriptVersion";
  const STORAGE_NOTIFICATION_SOUND = "decSlackNotificationSound";
  const STORAGE_NOTIFICATION_SOUND_ID = "decSlackNotificationSoundId";
  const STORAGE_NOTIFICATION_VOLUME = "decSlackNotificationVolume";
  const STORAGE_CHAT_SESSION_ID = "decSlackChatSessionId";
  const STORAGE_OWN_PROFILE = "decSlackOwnProfile";
  const CUSTOM_EMOJI_CLASS = "dec-slack-custom-emoji";
  const EMOJI_AUTOCOMPLETE_ID = "dec-slack-emoji-autocomplete";
  const NOTIFICATION_SOUND_MENU_ID = "dec-slack-notification-sound-menu";
  const SILENT_NOTIFICATION_SOUND_ID = "__silent__";
  const CUSTOM_EMOJI_REFRESH_MS = 5 * 60 * 1000;
  const IS_FIREFOX = /firefox/i.test(navigator.userAgent);
  const ANIMATED_AVATAR_CHUNK = "deCg"; // PNG : auxiliaire, privé, copiable sans risque.
  const ANIMATED_AVATAR_MAGIC = "DEC3CXG1";
  const ANIMATED_AVATAR_MAX_GIF = 1024 * 1024;
  const ANIMATED_AVATAR_MAX_PNG = ANIMATED_AVATAR_MAX_GIF + 256 * 1024;
  // Limite constatée sur ce serveur : 102400 octets par corps multipart.
  // Garder une marge pour l'envoi du PNG enrichi et ses champs de formulaire.
  const ANIMATED_AVATAR_FORM_LIMIT = 100 * 1024;
  const ANIMATED_AVATAR_UPLOAD_LIMIT = ANIMATED_AVATAR_FORM_LIMIT - 4 * 1024;
  const animatedAvatarCache = new Map();
  const animatedAvatarRedispatch = new WeakSet();
  const avatarCrcTable = Uint32Array.from({ length:256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    return crc >>> 0;
  });
  let animatedAvatarImport = null;
  let animatedAvatarVerification = null;
  let animatedAvatarImportSerial = 0;
  let animatedAvatarRequests = 0;

  /*
   * URL HTTPS du manifeste partagé. Exemple :
   * https://intranet.exemple/3cx-slack/3cx-slack-emojis.json
   *
   * Une fois cette URL renseignée dans le script distribué à l'équipe,
   * tous les utilisateurs reçoivent les mêmes emojis automatiquement.
   */
  const CUSTOM_EMOJI_MANIFEST_URL =
    "https://bricewillus.github.io/3CX-modern-theme/3cx-slack-emojis.json";

  /*
   * Variante sans manifeste : les définitions placées ici sont directement
   * embarquées dans le userscript et voyagent avec lui.
   *
   * Exemple :
   * ah_ultime: "https://intranet.exemple/3cx-slack/emojis/ah_ultime.gif",
   */
  const INLINE_CUSTOM_EMOJIS = {};

  const knownMessages = new WeakSet();
  const receiptAnalysisCache = new WeakMap();
  const knownChatToasts = new WeakMap();
  const initialChatToasts = new WeakSet();
  const enhancedChatToasts = new WeakSet();
  const customEmojis = new Map();
  const customNotificationSounds = new Map();
  const updateNoticeMessages = new Set();
  let autoUpdatesInitialized = false;
  let managedThemeCss = "";
  let themeRefreshPromise = null;
  let lastThemeCssCheck = 0;
  let updateNoticeTimer = 0;
  let updateNoticeFlushTimer = 0;
  let initialMessageScan = true;
  let chatToastObserver = null;
  let chatToastStackInitialized = false;
  let chatToastPositionScheduled = false;
  let emojiAutocompleteState = null;
  let emojiAutocompleteInitialized = false;
  let suppressAnimationsUntil = performance.now() + 1200;
  let customEmojiRevision = 0;
  let customNotificationSound = null;
  let defaultNotificationSoundId = "";
  let notificationAudio = null;
  let notificationAudioObjectUrl = "";
  let notificationAudioLoadPromise = null;
  let notificationAudioLoadError = null;
  let notificationAudioContext = null;
  let notificationMasterGain = null;
  let notificationMediaSource = null;
  let notificationBufferSource = null;
  let notificationAudioBuffer = null;
  let notificationAudioBufferUrl = "";
  let lastNotificationAt = -Infinity;
  let activeChatNotificationObserver = null;
  let activeChatNotificationState = null;
  const activeChatDesktopNotices = new Map();
  let cachedChatSessionId = (() => {
    try {
      return window.sessionStorage.getItem(STORAGE_CHAT_SESSION_ID) || "";
    } catch {
      return "";
    }
  })();
  let originalPreviewObserver = null;
  let currentOwnProfile = null;
  const libraryMessages = new Map();
  const libraryConversations = new Map();
  const libraryMessageOwners = new WeakMap();
  const librarySelectedChatOwners = new WeakMap();
  let libraryVisibleRoute = "";
  let libraryAccount = "";
  let libraryFavorites = [];
  let libraryOpenTab = "";
  let librarySearch = "";
  let libraryFilter = "all";
  let libraryShowExplorerLinks = readSetting(STORAGE_GALLERY_EXPLORER_LINKS,"false") === "true";
  let libraryAllChats = false;
  let libraryRevision = 0;
  let libraryReturnFocus = null;
  let libraryInitialized = false;
  let libraryPendingJump = null;
  let libraryNoteEditor = null;
  const nativeOriginalImages = new Map();
  let originalDownloadToken = null;
  let originalDownloadTokenPromise = null;
  let originalAuthEpoch = 0;
  let originalAuthRetryAfter = 0;

  if (window[SCRIPT_MARKER]) {
    return;
  }
  window[SCRIPT_MARKER] = true;

  function readSetting(key, fallbackValue) {
    try {
      return window.localStorage.getItem(key) || fallbackValue;
    } catch {
      return fallbackValue;
    }
  }

  function writeSetting(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Le thème reste fonctionnel même si le stockage est désactivé.
    }
  }

  function normalizeHex(value, fallbackValue = "#4a154b") {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallbackValue;
  }

  function normalizeNotificationVolume(value) {
    const volume = Number(value);
    return Number.isFinite(volume) ? Math.max(0, Math.min(300, Math.round(volume))) : 100;
  }

  function hexToRgb(hex) {
    const value = normalizeHex(hex).slice(1);
    return {
      red: Number.parseInt(value.slice(0, 2), 16),
      green: Number.parseInt(value.slice(2, 4), 16),
      blue: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  function rgbToHex({ red, green, blue }) {
    return `#${[red, green, blue]
      .map((channel) =>
        Math.max(0, Math.min(255, Math.round(channel)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }

  function mixHex(sourceHex, targetHex, targetRatio) {
    const source = hexToRgb(sourceHex);
    const target = hexToRgb(targetHex);
    const ratio = Math.max(0, Math.min(1, targetRatio));

    return rgbToHex({
      red: source.red + (target.red - source.red) * ratio,
      green: source.green + (target.green - source.green) * ratio,
      blue: source.blue + (target.blue - source.blue) * ratio,
    });
  }

  function rgba(hex, alpha) {
    const { red, green, blue } = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const preferences = {
    layout: readSetting(STORAGE_LAYOUT, "left") === "split" ? "split" : "left",
    theme: readSetting(STORAGE_THEME, "dark") === "light" ? "light" : "dark",
    accent: normalizeHex(readSetting(STORAGE_ACCENT, "#4a154b")),
    searchCollapsed: readSetting(STORAGE_SEARCH_COLLAPSED, "false") === "true",
    controlsCollapsed: readSetting(STORAGE_CONTROLS_COLLAPSED, "false") === "true",
    notificationSound: readSetting(STORAGE_NOTIFICATION_SOUND, "true") !== "false",
    notificationSoundId: readSetting(STORAGE_NOTIFICATION_SOUND_ID, ""),
    notificationVolume: normalizeNotificationVolume(readSetting(STORAGE_NOTIFICATION_VOLUME, "100")),
  };

  function applyAccentVariables() {
    const root = document.documentElement;
    const accent = preferences.accent;
    const { red, green, blue } = hexToRgb(accent);
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const lightTheme = preferences.theme === "light";

    root.style.setProperty("--dec-accent", accent);
    root.style.setProperty("--dec-accent-rgb", `${red}, ${green}, ${blue}`);
    root.style.setProperty("--dec-accent-dark", mixHex(accent, "#000000", 0.34));
    root.style.setProperty("--dec-accent-darker", mixHex(accent, "#000000", 0.56));
    root.style.setProperty(
      "--dec-accent-hover",
      mixHex(accent, "#ffffff", lightTheme ? 0.05 : 0.18),
    );
    root.style.setProperty("--dec-accent-soft", rgba(accent, lightTheme ? 0.1 : 0.24));
    root.style.setProperty("--dec-accent-border", rgba(accent, lightTheme ? 0.25 : 0.42));
    root.style.setProperty("--dec-accent-ring", rgba(accent, 0.24));
    root.style.setProperty("--dec-accent-own", rgba(accent, lightTheme ? 0.075 : 0.12));
    root.style.setProperty("--dec-accent-own-hover", rgba(accent, lightTheme ? 0.12 : 0.18));
    root.style.setProperty("--dec-accent-own-border", rgba(accent, lightTheme ? 0.16 : 0.2));
    root.style.setProperty("--dec-on-accent", luminance > 0.62 ? "#1d1c1d" : "#ffffff");
  }

  function controlElements(controls) {
    return Object.fromEntries(
      [
        ["toggleButton", "toggle"],
        ["layoutButton", "layout"],
        ["themeButton", "theme"],
        ["searchButton", "search"],
        ["soundButton", "sound"],
        ["colorInput", "accent"],
      ].map(([name, key]) => [name, controls.querySelector(`[data-dec-control='${key}']`)]),
    );
  }

  function setControlActive(button, active) {
    button.dataset.active = String(active);
    button.setAttribute("aria-pressed", String(active));
  }

  function updateControls() {
    const controls = document.getElementById(CONTROLS_ID);
    if (!controls) {
      return;
    }

    const { toggleButton, layoutButton, themeButton, searchButton, soundButton, colorInput } =
      controlElements(controls);

    const content = document.getElementById(CONTROLS_CONTENT_ID);
    const collapsed = preferences.controlsCollapsed;
    controls.dataset.collapsed = String(collapsed);
    if (content) {
      content.hidden = collapsed;
    }
    if (toggleButton) {
      toggleButton.textContent = collapsed ? "›" : "‹";
      toggleButton.title = collapsed ? "Déplier le panneau de réglages" : "Replier le panneau de réglages";
      toggleButton.setAttribute("aria-label", toggleButton.title);
      toggleButton.setAttribute("aria-expanded", String(!collapsed));
      if (collapsed && content?.contains(document.activeElement)) {
        toggleButton.focus();
      }
    }
    if (collapsed) {
      closeNotificationSoundMenu();
    }

    const splitLayout = preferences.layout === "split";
    const lightTheme = preferences.theme === "light";

    setControlActive(layoutButton, splitLayout);
    layoutButton.title = splitLayout ? "Tout aligner à gauche" : "Afficher mes messages à droite";

    setControlActive(themeButton, lightTheme);
    themeButton.textContent = lightTheme ? "☾" : "☀";
    themeButton.title = lightTheme ? "Passer au thème sombre" : "Passer au thème clair";

    setControlActive(searchButton, preferences.searchCollapsed);
    searchButton.textContent = preferences.searchCollapsed ? "⌄" : "⌕";
    searchButton.title = preferences.searchCollapsed
      ? "Déplier la barre de recherche"
      : "Replier la barre de recherche";

    const soundEnabled = Boolean(customNotificationSound) && preferences.notificationVolume > 0;
    soundButton.dataset.active = String(soundEnabled);
    soundButton.dataset.available = String(customNotificationSounds.size > 0);
    soundButton.textContent = soundEnabled ? "🔔" : "🔕";
    soundButton.title = customNotificationSound
      ? `Son de notification : ${customNotificationSound.label} · ${preferences.notificationVolume} %`
      : "Notifications personnalisées silencieuses";
    soundButton.setAttribute(
      "aria-label",
      customNotificationSound
        ? `Choisir le son de notification. Son actuel : ${customNotificationSound.label}. Volume : ${preferences.notificationVolume} %`
        : "Choisir le son de notification. Mode silencieux actif",
    );
    renderNotificationSoundMenu();

    colorInput.value = preferences.accent;
    colorInput.title = `Couleur du thème : ${preferences.accent}`;
  }

  function applyPreferences() {
    const root = document.documentElement;
    root.classList.toggle("dec-slack-layout-split", preferences.layout === "split");
    root.classList.toggle("dec-slack-theme-light", preferences.theme === "light");
    root.classList.toggle("dec-slack-search-collapsed", preferences.searchCollapsed);
    root.classList.remove("dec-slack-chat-header-collapsed");
    applyAccentVariables();
    updateControls();
  }

  function notificationSoundMenu() {
    return document.getElementById(NOTIFICATION_SOUND_MENU_ID);
  }

  function closeNotificationSoundMenu({ restoreFocus = false } = {}) {
    const menu = notificationSoundMenu();
    const button = document.querySelector(`#${CONTROLS_ID} [data-dec-control='sound']`);
    if (!menu || !button) {
      return;
    }

    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      button.focus();
    }
  }

  function renderNotificationSoundMenu() {
    const menu = notificationSoundMenu();
    if (!menu) {
      return;
    }

    const selectedId = customNotificationSound
      ? preferences.notificationSoundId
      : SILENT_NOTIFICATION_SOUND_ID;
    const options = [
      {
        id: SILENT_NOTIFICATION_SOUND_ID,
        label: "Silencieux",
        detail: "Aucun son de notification",
      },
      ...[...customNotificationSounds.values()].map((definition) => ({
        id: definition.id,
        label: definition.label,
        detail: definition.filename || "Son personnalisé",
      })),
    ];
    const desktopPermission = browserNotificationPermission();
    const menuSignature = JSON.stringify([
      options.map(({ id, label, detail }) => [id, label, detail, id === selectedId]),
      desktopPermission,
    ]);
    if (menu.dataset.decSoundMenuSignature === menuSignature) {
      return;
    }
    const fragment = document.createDocumentFragment();
    const sounds = document.createElement("div");
    sounds.setAttribute("role", "listbox");
    sounds.setAttribute("aria-label", "Sons de notification");

    options.forEach((option) => {
      const selected = option.id === selectedId;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dec-slack-sound-option";
      button.style.scrollMarginTop = "90px";
      button.dataset.soundId = option.id;
      button.dataset.active = String(selected);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(selected));

      const check = document.createElement("span");
      check.className = "dec-slack-sound-option-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = selected ? "✓" : "";

      const label = document.createElement("span");
      label.className = "dec-slack-sound-option-label";
      label.textContent = option.label;

      const detail = document.createElement("small");
      detail.textContent = option.detail;
      button.append(check, label, detail);
      button.addEventListener("click", () => {
        selectNotificationSound(option.id, { persist: true, preview: true });
        closeNotificationSoundMenu({ restoreFocus: true });
      });
      sounds.appendChild(button);
    });
    fragment.appendChild(sounds);

    const volumeControl = document.createElement("div");
    volumeControl.style.cssText = "position:sticky;top:-8px;z-index:2;padding:10px 8px 7px;border-bottom:1px solid var(--slack-line,#56525b);margin-bottom:5px;background:var(--slack-panel,#242429)";
    const volumeLabel = document.createElement("label");
    volumeLabel.htmlFor = "dec-slack-notification-volume";
    volumeLabel.style.cssText = "display:flex;justify-content:space-between;gap:12px;font-size:12px;margin-bottom:7px";
    const output = document.createElement("output");
    output.setAttribute("for", "dec-slack-notification-volume");
    output.dataset.decNotificationVolume = "true";
    output.textContent = `${preferences.notificationVolume} %`;
    volumeLabel.append("Volume du son", output);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = "dec-slack-notification-volume";
    slider.min = "0"; slider.max = "300"; slider.step = "1";
    slider.value = String(preferences.notificationVolume);
    slider.setAttribute("aria-label", "Volume des notifications");
    slider.setAttribute("aria-valuetext", `${preferences.notificationVolume} %`);
    slider.style.cssText = "display:block;width:100%;margin:0;accent-color:var(--dec-accent,#4a154b);cursor:pointer";
    slider.addEventListener("input", () => {
      preferences.notificationVolume = normalizeNotificationVolume(slider.value);
      writeSetting(STORAGE_NOTIFICATION_VOLUME, String(preferences.notificationVolume));
      output.textContent = `${preferences.notificationVolume} %`;
      slider.setAttribute("aria-valuetext", output.textContent);
      applyNotificationVolume();
      updateControls();
    });
    slider.addEventListener("change", () => playCustomNotification({ preview:true }));
    const limits = document.createElement("div");
    limits.style.cssText = "display:flex;justify-content:space-between;font-size:10px;color:var(--slack-muted,#b8b5bc);margin-top:4px";
    const minimum = document.createElement("span"), maximum = document.createElement("span");
    minimum.textContent = "0 %"; maximum.textContent = "300 %";
    limits.append(minimum, maximum);
    volumeControl.append(volumeLabel, slider, limits);
    fragment.insertBefore(volumeControl, sounds);

    if (desktopPermission === "default") {
      const allow = document.createElement("button");
      allow.type = "button";
      allow.className = "dec-slack-sound-option";
      const allowLabel = document.createElement("span");
      allowLabel.className = "dec-slack-sound-option-label";
      allowLabel.textContent = "Autoriser les notifications du navigateur";
      allow.appendChild(allowLabel);
      allow.addEventListener("click", async () => {
        try { await window.Notification.requestPermission(); } catch { /* Le son reste disponible. */ }
        renderNotificationSoundMenu();
      });
      fragment.appendChild(allow);
    } else if (desktopPermission !== "granted") {
      const status = document.createElement("p");
      status.style.cssText = "padding:4px 8px;margin:0;font-size:11px;color:var(--slack-muted,#b8b5bc)";
      status.textContent = desktopPermission === "denied" ? "Notifications bloquées dans les réglages du site." :
        "Notifications du navigateur indisponibles.";
      fragment.appendChild(status);
    }

    menu.dataset.decSoundMenuSignature = menuSignature;
    menu.replaceChildren(fragment);
  }

  function ensureControls() {
    if (!document.body || document.getElementById(CONTROLS_ID)) {
      updateControls();
      return;
    }

    const controls = document.createElement("div");
    controls.id = CONTROLS_ID;
    controls.setAttribute("role", "toolbar");
    controls.setAttribute("aria-label", "Réglages du thème 3CX Slack");
    controls.innerHTML = `
      <button
        type="button"
        class="dec-slack-control-button dec-slack-controls-toggle"
        data-dec-control="toggle"
        aria-controls="${CONTROLS_CONTENT_ID}"
        aria-expanded="true"
        aria-label="Replier le panneau de réglages"
      ></button>
      <div id="${CONTROLS_CONTENT_ID}" class="dec-slack-controls-content">
      <button
        type="button"
        class="dec-slack-control-button dec-slack-layout-button"
        data-dec-control="layout"
        aria-label="Changer l'alignement des messages"
      ><span aria-hidden="true">⇆</span></button>
      <button
        type="button"
        class="dec-slack-control-button"
        data-dec-control="theme"
        aria-label="Changer le thème clair ou sombre"
      ></button>
      <button
        type="button"
        class="dec-slack-control-button"
        data-dec-control="search"
        aria-label="Replier ou déplier la barre de recherche"
      ></button>
      <div class="dec-slack-sound-picker">
        <button
          type="button"
          class="dec-slack-control-button"
          data-dec-control="sound"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="${NOTIFICATION_SOUND_MENU_ID}"
        ></button>
        <div
          id="${NOTIFICATION_SOUND_MENU_ID}"
          class="dec-slack-sound-menu"
          role="dialog"
          aria-label="Notifications"
          hidden
        ></div>
      </div>
      <label
        class="dec-slack-control-button dec-slack-color-control"
        title="Changer la couleur du thème"
      >
        <span class="dec-slack-color-swatch" aria-hidden="true"></span>
        <input
          type="color"
          data-dec-control="accent"
          aria-label="Choisir la couleur du thème"
        >
      </label>
      </div>
    `;

    const { toggleButton, layoutButton, themeButton, searchButton, soundButton, colorInput } =
      controlElements(controls);

    toggleButton.addEventListener("click", () => {
      preferences.controlsCollapsed = !preferences.controlsCollapsed;
      writeSetting(STORAGE_CONTROLS_COLLAPSED, String(preferences.controlsCollapsed));
      applyPreferences();
    });

    layoutButton.addEventListener("click", () => {
      preferences.layout = preferences.layout === "split" ? "left" : "split";
      writeSetting(STORAGE_LAYOUT, preferences.layout);
      applyPreferences();
    });

    themeButton.addEventListener("click", () => {
      preferences.theme = preferences.theme === "light" ? "dark" : "light";
      writeSetting(STORAGE_THEME, preferences.theme);
      applyPreferences();
    });

    searchButton.addEventListener("click", () => {
      preferences.searchCollapsed = !preferences.searchCollapsed;
      writeSetting(STORAGE_SEARCH_COLLAPSED, String(preferences.searchCollapsed));
      applyPreferences();
    });

    bindSoundControls(controls, soundButton);

    colorInput.addEventListener("input", () => {
      preferences.accent = normalizeHex(colorInput.value, preferences.accent);
      writeSetting(STORAGE_ACCENT, preferences.accent);
      applyPreferences();
    });

    document.body.appendChild(controls);
    updateControls();
  }

  function bindSoundControls(controls, soundButton) {
    soundButton.addEventListener("click", () => {
      const menu = notificationSoundMenu();
      if (!menu) {
        return;
      }
      const opening = menu.hidden;
      menu.hidden = !opening;
      soundButton.setAttribute("aria-expanded", String(opening));
      if (opening) {
        renderNotificationSoundMenu();
        menu.querySelector('.dec-slack-sound-option[data-active="true"]')?.focus();
      }
    });

    notificationSoundMenu()?.addEventListener("keydown", (event) => {
      if (event.target.matches?.('input[type="range"]')) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }
      const options = [...notificationSoundMenu().querySelectorAll(".dec-slack-sound-option")].filter(option => !option.disabled);
      if (options.length === 0) {
        return;
      }
      event.preventDefault();
      const currentIndex = options.indexOf(document.activeElement);
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : event.key === "ArrowDown"
              ? (currentIndex + 1 + options.length) % options.length
              : (currentIndex - 1 + options.length) % options.length;
      options[nextIndex].focus();
    });

    document.addEventListener("pointerdown", (event) => {
      if (!controls.contains(event.target)) {
        closeNotificationSoundMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !notificationSoundMenu()?.hidden) {
        event.preventDefault();
        closeNotificationSoundMenu({ restoreFocus: true });
      }
    });
  }

  function closeUpdateNotice() {
    window.clearTimeout(updateNoticeTimer);
    window.clearTimeout(updateNoticeFlushTimer);
    updateNoticeTimer = 0;
    updateNoticeFlushTimer = 0;
    updateNoticeMessages.clear();
    document.getElementById(UPDATE_NOTICE_ID)?.remove();
  }

  function renderUpdateNotice() {
    updateNoticeFlushTimer = 0;
    if (document.hidden || !document.body || updateNoticeMessages.size === 0) {
      return;
    }
    let notice = document.getElementById(UPDATE_NOTICE_ID);
    if (!notice) {
      notice = document.createElement("div");
      notice.id = UPDATE_NOTICE_ID;
      notice.dataset.decCreated = "true";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      notice.innerHTML = `
        <div class="dec-slack-update-copy">
          <strong>Thème 3CX</strong>
          <span data-dec-update-message></span>
        </div>
        <button type="button" aria-label="Fermer la notification de mise à jour">×</button>
      `;
      notice.querySelector("button").addEventListener("click", closeUpdateNotice);
      document.body.appendChild(notice);
    }
    notice.querySelector("[data-dec-update-message]").textContent =
      [...updateNoticeMessages].join("\n");
    window.clearTimeout(updateNoticeTimer);
    updateNoticeTimer = window.setTimeout(closeUpdateNotice, 12000);
  }

  function queueUpdateNotice(message) {
    updateNoticeMessages.add(message);
    window.clearTimeout(updateNoticeTimer);
    updateNoticeTimer = 0;
    if (!document.hidden) {
      window.clearTimeout(updateNoticeFlushTimer);
      updateNoticeFlushTimer = window.setTimeout(renderUpdateNotice, 300);
    }
  }

  function normalizedThemeCss(value) {
    const css = typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
    return css && !css.startsWith("<") && css.includes("#dec-slack-controls") &&
      css.includes("chat-message") ? css : "";
  }

  function readCachedThemeCss() {
    try {
      const cached = JSON.parse(window.localStorage.getItem(STORAGE_THEME_CSS) || "null");
      const css = normalizedThemeCss(cached?.css);
      return cached?.url === THEME_CSS_URL && css ? { ...cached, css } : null;
    } catch {
      return null;
    }
  }

  function applyManagedThemeCss(value, { notify = false, persist = true } = {}) {
    const css = normalizedThemeCss(value);
    if (!css) {
      return false;
    }
    const previousCss = managedThemeCss;
    let style = document.getElementById(MANAGED_THEME_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = MANAGED_THEME_STYLE_ID;
      style.dataset.decCreated = "true";
      (document.head || document.documentElement).appendChild(style);
    }
    if (style.textContent !== css) {
      style.textContent = css;
    }
    managedThemeCss = css;
    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_THEME_CSS, JSON.stringify({
          url: THEME_CSS_URL,
          scriptVersion: SCRIPT_VERSION,
          css,
        }));
      } catch {
        // Le CSS chargé reste utilisable si le cache est plein ou désactivé.
      }
    }
    if (notify && previousCss && previousCss !== css) {
      queueUpdateNotice("Le style CSS a été mis à jour automatiquement.");
    }
    if (previousCss !== css) {
      scheduleUpdate();
    }
    return previousCss !== css;
  }

  function requestThemeCss() {
    const url = `${THEME_CSS_URL}?t=${Date.now()}`;
    if (hasUserscriptHttpRequest()) {
      return new Promise((resolve, reject) => {
        userscriptHttpRequest({
          method: "GET",
          url,
          responseType: "text",
          timeout: 15000,
          onload(response) {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`HTTP ${response.status}`));
              return;
            }
            const css = normalizedThemeCss(response.responseText);
            css ? resolve(css) : reject(new Error("Le CSS distant est vide ou invalide."));
          },
          onerror() { reject(new Error("Impossible de télécharger le thème.")); },
          ontimeout() { reject(new Error("Délai de chargement du thème dépassé.")); },
        });
      });
    }
    return window.fetch(url, { cache: "no-store", credentials: "omit" }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const css = normalizedThemeCss(await response.text());
      if (!css) {
        throw new Error("Le CSS distant est vide ou invalide.");
      }
      return css;
    });
  }

  function refreshManagedThemeCss({ force = false } = {}) {
    if (themeRefreshPromise) {
      return themeRefreshPromise;
    }
    if (!force && lastThemeCssCheck && Date.now() - lastThemeCssCheck < THEME_REFRESH_MS) {
      return Promise.resolve(false);
    }
    lastThemeCssCheck = Date.now();
    themeRefreshPromise = requestThemeCss()
      .then((css) => applyManagedThemeCss(css, { notify: true }))
      .catch((error) => {
        console.warn("[3CX Slack] Le thème en cache est conservé : actualisation impossible.", error);
        return false;
      })
      .finally(() => { themeRefreshPromise = null; });
    return themeRefreshPromise;
  }

  async function initializeManagedThemeCss() {
    const cached = readCachedThemeCss();
    if (cached) {
      applyManagedThemeCss(cached.css, { persist: false });
    }
    if (!cached || cached.scriptVersion !== SCRIPT_VERSION) {
      try {
        const bundled = typeof GM_getResourceText === "function"
          ? GM_getResourceText("decSlackThemeCss")
          : typeof GM === "object" && typeof GM.getResourceText === "function"
            ? await GM.getResourceText("decSlackThemeCss") : "";
        applyManagedThemeCss(bundled, { notify: Boolean(cached) });
      } catch (error) {
        console.warn("[3CX Slack] Impossible de lire le thème fourni avec le script.", error);
      }
    }
    await refreshManagedThemeCss();
  }

  function initializeAutoUpdates() {
    if (autoUpdatesInitialized) {
      return;
    }
    autoUpdatesInitialized = true;
    installAvatarStyles();
    if (SCRIPT_VERSION) {
      const previousVersion = readSetting(STORAGE_LAST_SCRIPT_VERSION, "");
      writeSetting(STORAGE_LAST_SCRIPT_VERSION, SCRIPT_VERSION);
      const updatesDisabled = typeof GM_info === "object" &&
        (GM_info?.scriptWillUpdate === false || GM_info?.script?.options?.check_for_updates === false);
      if (updatesDisabled && previousVersion !== SCRIPT_VERSION) {
        queueUpdateNotice("Le CSS se met à jour automatiquement. Active les mises à jour du script dans Tampermonkey.");
      } else if (!previousVersion) {
        queueUpdateNotice("Mises à jour automatiques du script et du CSS activées.");
      } else if (previousVersion !== SCRIPT_VERSION) {
        queueUpdateNotice(`Script mis à jour en version ${SCRIPT_VERSION}.`);
      }
    }
    void initializeManagedThemeCss();
    window.setInterval(() => void refreshManagedThemeCss(), THEME_REFRESH_MS);
    window.addEventListener("online", () => void refreshManagedThemeCss({ force: true }));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        renderUpdateNotice();
        void refreshManagedThemeCss();
      }
    });
  }

  const avatarPalette = [
    "#4a154b",
    "#1264a3",
    "#2e7d5b",
    "#9b3a72",
    "#8a6116",
    "#345a8a",
    "#6b4c9a",
    "#a43c35",
  ];
  const profileCache = new Map();

  function hideFreeEditionBanner() {
    document.querySelectorAll("app-edition-banner").forEach((banner) => {
      const text = String(banner.textContent || "").replace(/\s+/g, " ").trim();
      banner.classList.toggle(
        FREE_EDITION_BANNER_CLASS,
        /édition amateur gratuite|votre système fonctionne en mode gratuit/i.test(text),
      );
    });
  }

  function installAvatarStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${UPDATE_NOTICE_ID} {
        position: fixed !important;
        z-index: 2147483100 !important;
        right: 16px !important;
        bottom: 16px !important;
        display: flex !important;
        align-items: start !important;
        gap: 14px !important;
        box-sizing: border-box !important;
        width: min(360px, calc(100vw - 32px)) !important;
        padding: 14px !important;
        color: var(--slack-ink, #f8f8fa) !important;
        background: var(--slack-panel, #242429) !important;
        border: 1px solid var(--dec-accent-border, #65536a) !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.25) !important;
        font: 13px/1.45 "Segoe UI", Arial, sans-serif !important;
      }
      #${UPDATE_NOTICE_ID} .dec-slack-update-copy {
        display: grid !important;
        flex: 1 !important;
        gap: 4px !important;
        white-space: pre-line !important;
      }
      #${UPDATE_NOTICE_ID} button {
        display: grid !important;
        place-items: center !important;
        flex: 0 0 24px !important;
        width: 24px !important;
        height: 24px !important;
        padding: 0 !important;
        color: inherit !important;
        background: transparent !important;
        border: 0 !important;
        border-radius: 5px !important;
        font: 20px/1 "Segoe UI", Arial, sans-serif !important;
        cursor: pointer !important;
      }
      #${UPDATE_NOTICE_ID} button:focus-visible {
        outline: 2px solid var(--dec-accent, #ad80b5) !important;
      }

      app-edition-banner.${FREE_EDITION_BANNER_CLASS} {
        display: none !important;
      }

      #${CONTROLS_CONTENT_ID} {
        display: flex !important;
        align-items: center !important;
        gap: 4px !important;
      }

      #${CONTROLS_CONTENT_ID}[hidden] {
        display: none !important;
      }

      #${CONTROLS_ID} .dec-slack-controls-toggle {
        flex: 0 0 28px !important;
        font-size: 20px !important;
      }

      chat-message .message-inner:has(> .${AVATAR_CLASS})::before {
        content: none !important;
        display: none !important;
        background-image: none !important;
      }

      chat-message .message-inner > .${AVATAR_CLASS} {
        position: static !important;
        z-index: 4 !important;
        inset: auto !important;
        grid-column: 1 !important;
        grid-row: 1 / 3 !important;
        align-self: start !important;
        justify-self: start !important;
        margin: 0 !important;
        display: grid !important;
        place-items: center !important;
        box-sizing: border-box !important;
        width: 36px !important;
        height: 36px !important;
        overflow: hidden !important;
        color: #fff !important;
        background-color: #58666e !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-size: cover !important;
        border: 0 !important;
        border-radius: 7px !important;
        box-shadow: 0 0 0 1px rgba(29, 28, 29, 0.10) !important;
        font-family: "Segoe UI", Arial, sans-serif !important;
        font-size: 12px !important;
        font-weight: 750 !important;
        line-height: 1 !important;
        letter-spacing: 0.01em !important;
        text-transform: uppercase !important;
        pointer-events: none !important;
        user-select: none !important;
      }

      chat-message:has(> .new-day-title):has(> .message-name)
        .message-inner > .${AVATAR_CLASS} {
        grid-row: 2 / 4 !important;
      }

      chat-message .message-text-internal > span > .${CUSTOM_EMOJI_CLASS},
      chat-message .message-text-internal .${CUSTOM_EMOJI_CLASS} {
        display: inline-block !important;
        box-sizing: border-box !important;
        width: 22px !important;
        min-width: 22px !important;
        max-width: 22px !important;
        height: 22px !important;
        min-height: 22px !important;
        max-height: 22px !important;
        margin: -5px 2px -5px !important;
        padding: 0 !important;
        object-fit: contain !important;
        vertical-align: middle !important;
        border: 0 !important;
        border-radius: 4px !important;
        background: transparent !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function extensionFromText(text) {
    const match = String(text || "")
      .trim()
      .match(/(?:^|\s)(\d{1,5})\s*$/);
    return match ? match[1] : "";
  }

  function initialsFromName(name) {
    const words = String(name || "")
      .replace(/\d+\s*$/, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return "?";
    }

    return words
      .slice(0, 2)
      .map((word) => word.charAt(0))
      .join("")
      .toLocaleUpperCase("fr-FR");
  }

  function colorForExtension(extension) {
    const value = [...String(extension || "0")].reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    );
    return avatarPalette[value % avatarPalette.length];
  }

  function normalizeCustomEmojiCode(value) {
    const code = String(value || "")
      .trim()
      .replace(/^:+|:+$/g, "")
      .toLocaleLowerCase("fr-FR");

    return /^[a-z0-9][a-z0-9_+-]{0,63}$/.test(code) ? code : "";
  }

  function customEmojiDefinition(codeValue, entry, baseUrl) {
    const code = normalizeCustomEmojiCode(codeValue);
    const rawUrl = typeof entry === "string" ? entry : entry?.url;
    const label =
      typeof entry === "object" && entry ? String(entry.label || entry.title || "").trim() : "";

    if (!code || !rawUrl) {
      return null;
    }

    try {
      const url = new URL(String(rawUrl).trim(), baseUrl || window.location.href);
      const supportedProtocol =
        url.protocol === "https:" ||
        url.protocol === "http:" ||
        (url.protocol === "data:" && url.href.startsWith("data:image/"));

      return supportedProtocol ? { code, url: url.href, label } : null;
    } catch {
      return null;
    }
  }

  function customEmojiDefinitionsFrom(source, baseUrl) {
    const definitions = new Map();
    const entries =
      source && typeof source === "object" && !Array.isArray(source)
        ? source.emojis && typeof source.emojis === "object"
          ? source.emojis
          : source
        : {};

    Object.entries(entries).forEach(([code, entry]) => {
      const definition = customEmojiDefinition(code, entry, baseUrl);
      if (definition) {
        definitions.set(definition.code, definition);
      }
    });

    return definitions;
  }

  function definitionMapsAreEqual(first, second, compare) {
    if (first.size !== second.size) {
      return false;
    }
    return [...first].every(([key, definition]) => {
      const other = second.get(key);
      return other && compare(definition, other);
    });
  }

  function customEmojiMapsAreEqual(first, second) {
    return definitionMapsAreEqual(
      first,
      second,
      (definition, other) => other.url === definition.url && other.label === definition.label,
    );
  }

  function normalizeNotificationSoundId(value) {
    const id = String(value || "")
      .trim()
      .toLocaleLowerCase("fr-FR")
      .replace(/\s+/g, "_");
    return /^[a-z0-9][a-z0-9_+-]{0,63}$/.test(id) ? id : "";
  }

  function notificationSoundDefinition(idValue, entry, baseUrl) {
    const id = normalizeNotificationSoundId(idValue);
    const rawUrl = typeof entry === "string" ? entry : entry?.url;
    if (!id || !rawUrl) {
      return null;
    }

    try {
      const url = new URL(String(rawUrl).trim(), baseUrl || window.location.href);
      const isAudioDataUrl = url.protocol === "data:" && url.href.startsWith("data:audio/");
      if (url.protocol !== "https:" && url.protocol !== "http:" && !isAudioDataUrl) {
        return null;
      }

      const rawVolume = typeof entry === "object" && entry ? Number(entry.volume) : 0.7;
      const volume = Number.isFinite(rawVolume) ? Math.min(1, Math.max(0, rawVolume)) : 0.7;
      const pathname = decodeURIComponent(url.pathname || "");
      const filename = pathname.split("/").filter(Boolean).at(-1) || "";
      const label =
        typeof entry === "object" && entry ? String(entry.label || entry.title || "").trim() : "";
      return {
        id,
        url: url.href,
        volume,
        filename,
        label: label || filename.replace(/\.[^.]+$/, "") || id,
      };
    } catch {
      return null;
    }
  }

  function notificationSoundDefinitionsFrom(source, baseUrl) {
    const definitions = new Map();
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return { definitions, defaultId: "" };
    }

    const entries =
      source.notificationSounds &&
      typeof source.notificationSounds === "object" &&
      !Array.isArray(source.notificationSounds)
        ? source.notificationSounds
        : {};
    Object.entries(entries).forEach(([id, entry]) => {
      const definition = notificationSoundDefinition(id, entry, baseUrl);
      if (definition) {
        definitions.set(definition.id, definition);
      }
    });

    /* Compatibilité avec les manifestes et les anciennes versions du script,
       qui ne connaissaient qu'un unique champ notificationSound. */
    const legacyDefinition = notificationSoundDefinition(
      "default",
      source.notificationSound,
      baseUrl,
    );
    if (definitions.size === 0 && legacyDefinition) {
      definitions.set(legacyDefinition.id, legacyDefinition);
    }

    let defaultId = normalizeNotificationSoundId(source.defaultNotificationSound);
    if (!definitions.has(defaultId) && legacyDefinition) {
      defaultId =
        [...definitions.values()].find((definition) => definition.url === legacyDefinition.url)
          ?.id || "";
    }
    if (!definitions.has(defaultId)) {
      defaultId = definitions.keys().next().value || "";
    }
    return { definitions, defaultId };
  }

  function notificationSoundDefinitionsAreEqual(first, second) {
    return (
      first === second ||
      (Boolean(first) &&
        Boolean(second) &&
        first.url === second.url &&
        first.volume === second.volume)
    );
  }

  function notificationSoundMapsAreEqual(first, second) {
    return definitionMapsAreEqual(
      first,
      second,
      (definition, other) =>
        notificationSoundDefinitionsAreEqual(definition, other) &&
        definition.label === other.label &&
        definition.filename === other.filename,
    );
  }

  function audioMimeType(url, responseHeaders = "") {
    const headerMime = String(responseHeaders).match(/^content-type:\s*([^;\r\n]+)/im)?.[1] || "";
    const extension = new URL(url).pathname.split(".").pop()?.toLowerCase();
    const extensionMime = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      oga: "audio/ogg",
      m4a: "audio/mp4",
      aac: "audio/aac",
    }[extension];

    // GitHub Pages sert notamment les MP3 en audio/mp3. Chrome attend le
    // type standard audio/mpeg lorsqu'on recrée le fichier dans un Blob.
    return extensionMime || headerMime || "application/octet-stream";
  }

  function userscriptHttpRequest(details) {
    if (typeof GM_xmlhttpRequest === "function") {
      return GM_xmlhttpRequest(details);
    }
    if (typeof GM === "object" && typeof GM.xmlHttpRequest === "function") {
      return GM.xmlHttpRequest(details);
    }
    return null;
  }

  function hasUserscriptHttpRequest() {
    return (
      typeof GM_xmlhttpRequest === "function" ||
      (typeof GM === "object" && typeof GM.xmlHttpRequest === "function")
    );
  }

  function audioDataUrl(bytes, mimeType) {
    const view = new Uint8Array(bytes);
    const chunks = [];
    const chunkSize = 0x8000;
    for (let index = 0; index < view.length; index += chunkSize) {
      chunks.push(String.fromCharCode(...view.subarray(index, index + chunkSize)));
    }
    return `data:${mimeType};base64,${btoa(chunks.join(""))}`;
  }

  function requestNotificationAudioSource(definition) {
    if (definition.url.startsWith("data:audio/")) {
      return Promise.resolve({
        playbackUrl: definition.url,
        bytes: null,
      });
    }

    if (hasUserscriptHttpRequest()) {
      return new Promise((resolve, reject) => {
        userscriptHttpRequest({
          method: "GET",
          url: definition.url,
          responseType: "arraybuffer",
          async onload(response) {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`HTTP ${response.status}`));
              return;
            }

            try {
              let bytes = response.response;
              if (bytes instanceof Blob) {
                bytes = await bytes.arrayBuffer();
              } else if (ArrayBuffer.isView(bytes)) {
                bytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
              }

              if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
                throw new Error("Le fichier audio est vide ou illisible.");
              }

              const mimeType = audioMimeType(definition.url, response.responseHeaders || "");
              const blob = new Blob([bytes], { type: mimeType });
              resolve({
                // Firefox accepte de façon plus constante une URL data dans
                // un userscript qu'une URL blob créée par le bac à sable GM.
                playbackUrl: IS_FIREFOX ? audioDataUrl(bytes, mimeType) : URL.createObjectURL(blob),
                bytes,
              });
            } catch (error) {
              reject(error);
            }
          },
          onerror() {
            reject(new Error("Impossible de télécharger le son personnalisé."));
          },
          ontimeout() {
            reject(new Error("Délai de chargement du son dépassé."));
          },
          timeout: 15000,
        });
      });
    }

    return window
      .fetch(definition.url, {
        cache: "force-cache",
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.arrayBuffer().then((bytes) => {
          const blob = new Blob([bytes], {
            type: audioMimeType(definition.url, response.headers.get("content-type") || ""),
          });
          return {
            playbackUrl: URL.createObjectURL(blob),
            bytes,
          };
        });
      });
  }

  function ensureNotificationAudioContext() {
    if (notificationAudioContext) {
      return notificationAudioContext;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    try {
      notificationAudioContext = new AudioContextClass();
      notificationMasterGain = notificationAudioContext.createGain();
      notificationMasterGain.gain.value = preferences.notificationVolume / 100;
      notificationMasterGain.connect(notificationAudioContext.destination);
      return notificationAudioContext;
    } catch {
      notificationAudioContext = null;
      notificationMasterGain = null;
      return null;
    }
  }

  function applyNotificationVolume(audio = notificationAudio, definition = customNotificationSound) {
    const multiplier = preferences.notificationVolume / 100;
    if (notificationMasterGain) {
      notificationMasterGain.gain.setValueAtTime(multiplier, notificationAudioContext.currentTime);
    }
    if (audio && definition) {
      audio.volume = Math.max(0, Math.min(1, definition.volume * (notificationMediaSource ? 1 : multiplier)));
    }
  }

  function routeNotificationMedia(audio, context) {
    if (!context || !notificationMasterGain || audio !== notificationAudio ||
        typeof context.createMediaElementSource !== "function") return;
    try {
      const url = new URL(audio.src, window.location.href);
      // Une URL distante sans CORS serait rendue muette par Web Audio.
      if (!["blob:", "data:"].includes(url.protocol) && url.origin !== window.location.origin) return;
      if (!notificationMediaSource) {
        notificationMediaSource = context.createMediaElementSource(audio);
        notificationMediaSource.connect(notificationMasterGain);
      }
    } catch { /* Conserver la lecture HTMLAudio lorsqu'elle est disponible. */ }
  }

  function stopNotificationBuffer() {
    const source = notificationBufferSource;
    notificationBufferSource = null;
    if (source) { try { source.stop(); } catch { /* Source déjà terminée. */ } }
  }

  function clearNotificationAudio() {
    stopNotificationBuffer();
    notificationMediaSource?.disconnect();
    notificationMediaSource = null;
    notificationAudio?.pause();
    notificationAudio = null;
    notificationAudioLoadPromise = null;
    notificationAudioLoadError = null;
    notificationAudioBuffer = null;
    notificationAudioBufferUrl = "";

    if (notificationAudioObjectUrl) {
      URL.revokeObjectURL(notificationAudioObjectUrl);
      notificationAudioObjectUrl = "";
    }
  }

  function resolvedNotificationSoundId(requestedId) {
    if (requestedId === SILENT_NOTIFICATION_SOUND_ID) {
      return SILENT_NOTIFICATION_SOUND_ID;
    }
    const normalizedId = normalizeNotificationSoundId(requestedId);
    if (customNotificationSounds.has(normalizedId)) {
      return normalizedId;
    }
    if (!requestedId && !preferences.notificationSound) {
      return SILENT_NOTIFICATION_SOUND_ID;
    }
    return (
      (customNotificationSounds.has(defaultNotificationSoundId)
        ? defaultNotificationSoundId
        : customNotificationSounds.keys().next().value) || SILENT_NOTIFICATION_SOUND_ID
    );
  }

  function selectNotificationSound(requestedId, { persist = false, preview = false } = {}) {
    const selectedId = resolvedNotificationSoundId(requestedId);
    const selectedSound =
      selectedId === SILENT_NOTIFICATION_SOUND_ID
        ? null
        : customNotificationSounds.get(selectedId) || null;
    const soundChanged = !notificationSoundDefinitionsAreEqual(
      customNotificationSound,
      selectedSound,
    );

    if (soundChanged) {
      clearNotificationAudio();
    }
    customNotificationSound = selectedSound;
    preferences.notificationSoundId = selectedSound
      ? selectedSound.id
      : SILENT_NOTIFICATION_SOUND_ID;
    preferences.notificationSound = Boolean(selectedSound);

    if (persist) {
      writeSetting(STORAGE_NOTIFICATION_SOUND_ID, preferences.notificationSoundId);
      /* Conservé pour qu'un retour temporaire à une ancienne version du script
         respecte encore le choix silencieux/actif. */
      writeSetting(STORAGE_NOTIFICATION_SOUND, String(preferences.notificationSound));
    }

    updateControls();
    if (selectedSound) {
      if (preview) {
        /* La préécoute suit le même chemin GM/Blob/AudioContext que les vraies
           notifications : cela évite le blocage de l'URL GitHub en lecture directe. */
        playCustomNotification({ preview: true });
      } else if (soundChanged) {
        void prepareNotificationAudio();
      }
    }
  }

  function prepareNotificationAudio() {
    if (!customNotificationSound) {
      return Promise.resolve(null);
    }

    if (
      notificationAudio &&
      notificationAudio.dataset.decSoundUrl === customNotificationSound.url
    ) {
      applyNotificationVolume();
      return Promise.resolve(notificationAudio);
    }

    if (notificationAudioLoadPromise) {
      return notificationAudioLoadPromise;
    }

    const definition = customNotificationSound;
    notificationAudioLoadError = null;
    let currentLoadPromise = null;
    currentLoadPromise = requestNotificationAudioSource(definition)
      .then(async ({ playbackUrl, bytes }) => {
        if (customNotificationSound?.url !== definition.url) {
          if (playbackUrl.startsWith("blob:")) {
            URL.revokeObjectURL(playbackUrl);
          }
          return null;
        }

        notificationAudio?.pause();
        if (notificationAudioObjectUrl) {
          URL.revokeObjectURL(notificationAudioObjectUrl);
        }

        notificationAudioObjectUrl = playbackUrl.startsWith("blob:") ? playbackUrl : "";
        notificationAudio = new Audio(playbackUrl);
        const audio = notificationAudio;
        notificationAudio.dataset.decSoundUrl = definition.url;
        notificationAudio.preload = "auto";
        applyNotificationVolume(audio, definition);

        const audioContext = ensureNotificationAudioContext();
        if (audioContext && bytes) {
          try {
            const buffer = await audioContext.decodeAudioData(bytes.slice(0));
            if (customNotificationSound?.url !== definition.url || notificationAudio !== audio) return null;
            notificationAudioBuffer = buffer;
            notificationAudioBufferUrl = definition.url;
          } catch (error) {
            if (customNotificationSound?.url !== definition.url || notificationAudio !== audio) return null;
            notificationAudioBuffer = null;
            notificationAudioBufferUrl = "";
            notificationAudioLoadError = error;
          }
        }

        return customNotificationSound?.url === definition.url && notificationAudio === audio ? audio : null;
      })
      .catch((error) => {
        if (customNotificationSound?.url !== definition.url) return null;
        notificationAudioLoadError = error;
        // Dernier repli : la lecture directe d'une URL audio ne nécessite pas
        // que le serveur autorise fetch/CORS dans Firefox.
        try {
          notificationAudio = new Audio(definition.url);
          notificationAudio.dataset.decSoundUrl = definition.url;
          notificationAudio.preload = "auto";
          applyNotificationVolume(notificationAudio, definition);
          return notificationAudio;
        } catch {
          return null;
        }
      })
      .finally(() => {
        if (notificationAudioLoadPromise === currentLoadPromise) {
          notificationAudioLoadPromise = null;
        }
      });

    notificationAudioLoadPromise = currentLoadPromise;
    return currentLoadPromise;
  }

  function playCustomNotification({ preview = false, onlyWhenAway = false } = {}) {
    if (!preferences.notificationSound || !customNotificationSound || preferences.notificationVolume === 0 ||
        (onlyWhenAway && notificationPageHasFocus())) {
      return;
    }

    const now = performance.now();
    if (!preview && now - lastNotificationAt < 750) {
      return;
    }
    lastNotificationAt = now;

    const requestedSound = customNotificationSound;
    const audioContext = ensureNotificationAudioContext();
    const resumeContext = audioContext
      ? audioContext.resume().catch((error) => {
          if (preview) {
            console.warn("[3CX Slack] Le navigateur a bloqué l’activation du moteur audio.", error);
          }
        })
      : Promise.resolve();

    void prepareNotificationAudio().then((audio) => {
      if (!preferences.notificationSound || customNotificationSound?.url !== requestedSound.url ||
          preferences.notificationVolume === 0 ||
          (onlyWhenAway && notificationPageHasFocus())) {
        return;
      }

      if (!audio) {
        if (preview && notificationAudioLoadError) {
          console.warn(
            "[3CX Slack] Impossible de charger le son personnalisé.",
            notificationAudioLoadError,
          );
        }
        return;
      }

      if (
        audioContext &&
        notificationAudioBuffer &&
        notificationAudioBufferUrl === requestedSound.url
      ) {
        void resumeContext.then(() => {
          if (
            !preferences.notificationSound ||
            preferences.notificationVolume === 0 ||
            customNotificationSound?.url !== requestedSound.url ||
            (onlyWhenAway && notificationPageHasFocus())
          ) {
            return;
          }

          const source = audioContext.createBufferSource();
          const gain = audioContext.createGain();
          stopNotificationBuffer();
          audio.pause();
          source.buffer = notificationAudioBuffer;
          gain.gain.value = requestedSound.volume;
          source.connect(gain);
          gain.connect(notificationMasterGain);
          applyNotificationVolume(audio, requestedSound);
          notificationBufferSource = source;
          source.onended = () => {
            source.disconnect(); gain.disconnect();
            if (notificationBufferSource === source) notificationBufferSource = null;
          };
          source.start(0);
        });
        return;
      }

      stopNotificationBuffer();
      routeNotificationMedia(audio, audioContext);
      applyNotificationVolume(audio, requestedSound);
      audio.pause();
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch((error) => {
          if (preview) {
            console.warn("[3CX Slack] Le navigateur n'a pas pu lire le son personnalisé.", error);
          }
        });
      }
    });
  }

  function updateExistingCustomEmojiImages() {
    document.querySelectorAll(`img.${CUSTOM_EMOJI_CLASS}[data-dec-emoji-code]`).forEach((image) => {
      const definition = customEmojis.get(image.dataset.decEmojiCode || "");
      if (!definition) {
        return;
      }

      if (image.src !== definition.url) {
        image.src = definition.url;
      }
      image.title = definition.label
        ? `:${definition.code}: — ${definition.label}`
        : `:${definition.code}:`;
    });
  }

  function applyCustomEmojiManifest(manifest, manifestUrl = "") {
    const effectiveManifestUrl = manifestUrl || window.location.href;
    const nextDefinitions = customEmojiDefinitionsFrom(INLINE_CUSTOM_EMOJIS, window.location.href);
    const remoteDefinitions = customEmojiDefinitionsFrom(manifest, effectiveManifestUrl);
    const nextNotificationSoundCatalog = notificationSoundDefinitionsFrom(
      manifest,
      effectiveManifestUrl,
    );

    remoteDefinitions.forEach((definition, code) => {
      nextDefinitions.set(code, definition);
    });

    const emojisChanged = !customEmojiMapsAreEqual(customEmojis, nextDefinitions);
    const soundCatalogChanged =
      defaultNotificationSoundId !== nextNotificationSoundCatalog.defaultId ||
      !notificationSoundMapsAreEqual(
        customNotificationSounds,
        nextNotificationSoundCatalog.definitions,
      );

    if (!emojisChanged && !soundCatalogChanged) {
      return;
    }

    if (emojisChanged) {
      customEmojis.clear();
      nextDefinitions.forEach((definition, code) => {
        customEmojis.set(code, definition);
      });
      customEmojiRevision += 1;
      updateExistingCustomEmojiImages();
      scheduleUpdate();
    }

    if (soundCatalogChanged) {
      const requestedId = preferences.notificationSoundId;
      customNotificationSounds.clear();
      nextNotificationSoundCatalog.definitions.forEach((definition, id) => {
        customNotificationSounds.set(id, definition);
      });
      defaultNotificationSoundId = nextNotificationSoundCatalog.defaultId;
      selectNotificationSound(requestedId, {
        /* Cette écriture effectue aussi la migration de l'ancien booléen vers
           l'identifiant précis du son, sans lancer de préécoute au chargement. */
        persist: customNotificationSounds.size > 0 || Boolean(requestedId),
        preview: false,
      });
    }
  }

  function readCachedCustomEmojiManifest() {
    if (!CUSTOM_EMOJI_MANIFEST_URL) {
      return null;
    }

    try {
      const cached = JSON.parse(window.localStorage.getItem(STORAGE_EMOJI_MANIFEST) || "null");
      return cached?.url === CUSTOM_EMOJI_MANIFEST_URL ? cached.manifest : null;
    } catch {
      return null;
    }
  }

  function requestCustomEmojiManifest(url) {
    if (hasUserscriptHttpRequest()) {
      return new Promise((resolve, reject) => {
        userscriptHttpRequest({
          method: "GET",
          url,
          headers: {
            Accept: "application/json",
          },
          onload(response) {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`HTTP ${response.status}`));
              return;
            }

            try {
              resolve(JSON.parse(response.responseText));
            } catch {
              reject(new Error("Le manifeste ne contient pas de JSON valide."));
            }
          },
          onerror() {
            reject(new Error("Erreur réseau lors du chargement du manifeste."));
          },
          ontimeout() {
            reject(new Error("Délai de chargement du manifeste dépassé."));
          },
          timeout: 15000,
        });
      });
    }

    return window
      .fetch(url, {
        cache: "no-store",
        credentials: "same-origin",
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      });
  }

  async function refreshCustomEmojiManifest() {
    if (!CUSTOM_EMOJI_MANIFEST_URL) {
      applyCustomEmojiManifest({});
      return;
    }

    try {
      const manifest = await requestCustomEmojiManifest(CUSTOM_EMOJI_MANIFEST_URL);
      applyCustomEmojiManifest(manifest, CUSTOM_EMOJI_MANIFEST_URL);

      try {
        window.localStorage.setItem(
          STORAGE_EMOJI_MANIFEST,
          JSON.stringify({
            url: CUSTOM_EMOJI_MANIFEST_URL,
            manifest,
          }),
        );
      } catch {
        // Le dernier manifeste chargé reste utilisable en mémoire.
      }
    } catch (error) {
      console.warn("[3CX Slack] Impossible d'actualiser les emojis partagés.", error);
    }
  }

  function createCustomEmojiImage(definition, originalToken) {
    const image = document.createElement("img");
    image.className = CUSTOM_EMOJI_CLASS;
    image.dataset.decEmojiCode = definition.code;
    image.src = definition.url;
    image.alt = originalToken;
    image.title = definition.label ? `${originalToken} — ${definition.label}` : originalToken;
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;
    return image;
  }

  function replaceCustomEmojiCodes(container) {
    if (!container || customEmojis.size === 0) {
      return;
    }

    const currentSignature = `${customEmojiRevision}|${container.textContent}`;
    if (container.dataset.decEmojiSignature === currentSignature) {
      return;
    }

    const textNodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(`.${CUSTOM_EMOJI_CLASS}, a, code, pre, textarea, [contenteditable="true"]`)
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return node.nodeValue?.includes(":") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    textNodes.forEach((textNode) => {
      const text = textNode.nodeValue || "";
      const matcher = /:([a-z0-9][a-z0-9_+-]{0,63}):/gi;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let replaced = false;
      let match;

      while ((match = matcher.exec(text))) {
        const definition = customEmojis.get(normalizeCustomEmojiCode(match[1]));
        if (!definition) {
          continue;
        }

        if (match.index > cursor) {
          fragment.append(text.slice(cursor, match.index));
        }
        fragment.append(createCustomEmojiImage(definition, match[0]));
        cursor = match.index + match[0].length;
        replaced = true;
      }

      if (!replaced) {
        return;
      }

      if (cursor < text.length) {
        fragment.append(text.slice(cursor));
      }
      textNode.replaceWith(fragment);
    });

    container.dataset.decEmojiSignature = `${customEmojiRevision}|${container.textContent}`;
  }

  function enhanceCustomEmojis() {
    if (customEmojis.size === 0) {
      return;
    }

    document
      .querySelectorAll(
        `${MESSAGE_SELECTOR} .message-text-internal, chat-message app-chat-message-text > span`,
      )
      .forEach(replaceCustomEmojiCodes);
  }

  function initializeCustomEmojis() {
    const cachedManifest = readCachedCustomEmojiManifest();
    applyCustomEmojiManifest(
      cachedManifest || {},
      CUSTOM_EMOJI_MANIFEST_URL || window.location.href,
    );
    void refreshCustomEmojiManifest();

    if (CUSTOM_EMOJI_MANIFEST_URL) {
      window.setInterval(() => void refreshCustomEmojiManifest(), CUSTOM_EMOJI_REFRESH_MS);
    }
  }

  function emojiComposerFromTarget(target) {
    const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    return (
      element?.closest?.(
        "app-chat-message-input emoji-text-input [contenteditable='true'], " +
          "#chat-form-controls emoji-text-input .message-input, " +
          "#chat-form-controls textarea, " +
          "#chat-form-controls [contenteditable='true']",
      ) || null
    );
  }

  function composerCaretInfo(composer) {
    if (composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement) {
      const caret = composer.selectionStart;
      if (caret === null) {
        return null;
      }
      return {
        text: composer.value,
        caret,
      };
    }

    if (!composer.isContentEditable) {
      return null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !composer.contains(selection.anchorNode)) {
      return null;
    }

    const caretRange = selection.getRangeAt(0);
    if (!caretRange.collapsed) {
      return null;
    }

    const beforeCaret = caretRange.cloneRange();
    beforeCaret.selectNodeContents(composer);
    beforeCaret.setEnd(caretRange.endContainer, caretRange.endOffset);
    return {
      text: composer.textContent || "",
      caret: beforeCaret.toString().length,
    };
  }

  function emojiTokenAtCaret(text, caret) {
    const beforeCaret = String(text || "").slice(0, caret);
    const match = beforeCaret.match(/(^|[\s([{])(:[a-z0-9_+-]*)$/i);
    if (!match) {
      return null;
    }

    const token = match[2];
    return {
      token,
      start: caret - token.length,
      end: caret,
    };
  }

  function ensureEmojiAutocompletePanel() {
    let panel = document.getElementById(EMOJI_AUTOCOMPLETE_ID);
    if (panel || !document.body) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = EMOJI_AUTOCOMPLETE_ID;
    panel.setAttribute("role", "listbox");
    panel.setAttribute("aria-label", "Emojis personnalisés");
    panel.hidden = true;
    panel.addEventListener("pointerdown", (event) => {
      // Garde le curseur dans le champ pendant le clic sur une proposition.
      event.preventDefault();
    });
    panel.addEventListener("click", (event) => {
      const option = event.target.closest("[data-dec-emoji-suggestion]");
      if (!option) {
        return;
      }
      insertEmojiSuggestion(option.dataset.decEmojiSuggestion || "");
    });
    document.body.appendChild(panel);
    return panel;
  }

  function closeEmojiAutocomplete() {
    const panel = document.getElementById(EMOJI_AUTOCOMPLETE_ID);
    if (panel) {
      panel.hidden = true;
      panel.replaceChildren();
    }
    emojiAutocompleteState = null;
  }

  function positionEmojiAutocomplete() {
    const panel = document.getElementById(EMOJI_AUTOCOMPLETE_ID);
    const composer = emojiAutocompleteState?.composer;
    if (!panel || panel.hidden || !composer?.isConnected) {
      return;
    }

    const anchor = composer.closest(".message-input-wrap") || composer;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 280), 560, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
  }

  function renderEmojiAutocomplete() {
    const panel = ensureEmojiAutocompletePanel();
    const state = emojiAutocompleteState;
    if (!panel || !state || state.matches.length === 0) {
      closeEmojiAutocomplete();
      return;
    }

    const fragment = document.createDocumentFragment();
    state.matches.forEach((definition, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "dec-slack-emoji-suggestion";
      option.dataset.decEmojiSuggestion = definition.code;
      option.dataset.decEmojiLiteral = String(Boolean(definition.literal));
      option.dataset.active = String(index === state.activeIndex);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === state.activeIndex));

      const preview = definition.literal
        ? document.createElement("span")
        : document.createElement("img");
      if (definition.literal) {
        preview.className = "dec-slack-emoji-suggestion-literal-icon";
        preview.textContent = ":";
        preview.setAttribute("aria-hidden", "true");
      } else {
        preview.src = definition.url;
        preview.alt = "";
        preview.loading = "lazy";
        preview.decoding = "async";
      }

      const text = document.createElement("span");
      text.className = "dec-slack-emoji-suggestion-code";
      text.textContent = definition.literal ? ":" : `:${definition.code}:`;

      option.append(preview, text);
      if (definition.label) {
        const label = document.createElement("small");
        label.textContent = definition.label;
        option.append(label);
      }
      fragment.appendChild(option);
    });

    panel.replaceChildren(fragment);
    panel.hidden = false;
    positionEmojiAutocomplete();
    panel.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }

  function updateEmojiAutocomplete(composer) {
    if (!composer || customEmojis.size === 0) {
      closeEmojiAutocomplete();
      return;
    }

    const caretInfo = composerCaretInfo(composer);
    const tokenInfo = caretInfo ? emojiTokenAtCaret(caretInfo.text, caretInfo.caret) : null;
    if (!tokenInfo) {
      closeEmojiAutocomplete();
      return;
    }

    const normalizedToken = tokenInfo.token.toLocaleLowerCase("fr-FR");
    const matches = [...customEmojis.values()]
      .filter((definition) =>
        `:${definition.code}:`.toLocaleLowerCase("fr-FR").startsWith(normalizedToken),
      )
      .sort((first, second) => first.code.localeCompare(second.code, "fr-FR"));

    if (normalizedToken === ":") {
      matches.unshift({
        code: "",
        url: "",
        label: "Conserver le caractère :",
        literal: true,
      });
    }

    if (matches.length === 0) {
      closeEmojiAutocomplete();
      return;
    }

    const previousCode = emojiAutocompleteState?.matches[emojiAutocompleteState.activeIndex]?.code;
    const preservedIndex = matches.findIndex((definition) => definition.code === previousCode);
    emojiAutocompleteState = {
      composer,
      start: tokenInfo.start,
      end: tokenInfo.end,
      matches,
      activeIndex: preservedIndex >= 0 ? preservedIndex : 0,
    };
    renderEmojiAutocomplete();
  }

  function contentEditableRangeFromOffsets(root, start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startPoint = null;
    let endPoint = null;
    let node = walker.nextNode();

    while (node) {
      const nextOffset = offset + node.data.length;
      if (!startPoint && start <= nextOffset) {
        startPoint = { node, offset: Math.max(0, start - offset) };
      }
      if (!endPoint && end <= nextOffset) {
        endPoint = { node, offset: Math.max(0, end - offset) };
        break;
      }
      offset = nextOffset;
      node = walker.nextNode();
    }

    if (!startPoint || !endPoint) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    return range;
  }

  function insertEmojiSuggestion(code) {
    const state = emojiAutocompleteState;
    const selectedDefinition = state?.matches.find((definition) => definition.code === code);
    if (selectedDefinition?.literal) {
      closeEmojiAutocomplete();
      return;
    }
    const definition = customEmojis.get(code);
    if (!state || !definition || !state.composer?.isConnected) {
      closeEmojiAutocomplete();
      return;
    }

    const composer = state.composer;
    const replacement = `:${definition.code}:`;
    composer.focus({ preventScroll: true });

    if (composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement) {
      composer.setRangeText(replacement, state.start, state.end, "end");
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: replacement,
        }),
      );
      closeEmojiAutocomplete();
      return;
    }

    const range = contentEditableRangeFromOffsets(composer, state.start, state.end);
    if (!range) {
      closeEmojiAutocomplete();
      return;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const inserted = document.execCommand("insertText", false, replacement);
    if (!inserted) {
      range.deleteContents();
      const text = document.createTextNode(replacement);
      range.insertNode(text);
      range.setStartAfter(text);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: replacement,
        }),
      );
    }
    closeEmojiAutocomplete();
  }

  function initializeEmojiAutocomplete() {
    if (emojiAutocompleteInitialized) {
      return;
    }
    emojiAutocompleteInitialized = true;
    ensureEmojiAutocompletePanel();

    document.addEventListener(
      "input",
      (event) => {
        const composer = emojiComposerFromTarget(event.target);
        if (composer) {
          updateEmojiAutocomplete(composer);
        }
      },
      true,
    );

    document.addEventListener(
      "keydown",
      (event) => {
        const state = emojiAutocompleteState;
        if (!state || emojiComposerFromTarget(event.target) !== state.composer) {
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          closeEmojiAutocomplete();
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          state.activeIndex =
            (state.activeIndex + direction + state.matches.length) % state.matches.length;
          renderEmojiAutocomplete();
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const selectedDefinition = state.matches[state.activeIndex];
          if (selectedDefinition?.literal) {
            closeEmojiAutocomplete();
            if (event.key === "Tab") {
              event.preventDefault();
            }
            return;
          }
          event.preventDefault();
          insertEmojiSuggestion(selectedDefinition.code);
        }
      },
      true,
    );

    document.addEventListener(
      "pointerdown",
      (event) => {
        const panel = document.getElementById(EMOJI_AUTOCOMPLETE_ID);
        if (
          emojiAutocompleteState &&
          !panel?.contains(event.target) &&
          emojiComposerFromTarget(event.target) !== emojiAutocompleteState.composer
        ) {
          closeEmojiAutocomplete();
        }
      },
      true,
    );

    window.addEventListener("resize", positionEmojiAutocomplete);
    document.addEventListener("scroll", positionEmojiAutocomplete, true);
  }

  // Le PNG reste une vraie image fixe. Son bloc privé contient le GIF original
  // et le recadrage choisi dans 3CX ; aucun service externe ni identifiant ajouté.
  function avatarBytesToBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    }
    return btoa(binary);
  }

  function avatarBase64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function avatarCrc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ avatarCrcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function avatarGifInfo(bytes) {
    if (bytes.length < 14 || bytes.length > ANIMATED_AVATAR_MAX_GIF) return null;
    const text = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
    if (!/^GIF8[79]a$/.test(text(0, 6))) return null;
    const width = bytes[6] | (bytes[7] << 8), height = bytes[8] | (bytes[9] << 8);
    if (!width || !height || width > 1024 || height > 1024) return null;
    const headerEnd = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0);
    let offset = headerEnd, frames = 0, control = null, firstFrame = null;
    const skipBlocks = () => {
      while (offset < bytes.length) {
        const length = bytes[offset++];
        if (!length) return true;
        offset += length;
        if (offset > bytes.length) return false;
      }
      return false;
    };
    while (offset < bytes.length) {
      const start = offset, marker = bytes[offset++];
      if (marker === 0x3b) return frames ? { width, height, frames, firstFrame } : null;
      if (marker === 0x21) {
        const label = bytes[offset++];
        if (!skipBlocks()) return null;
        if (label === 0xf9) {
          if (offset - start !== 8 || bytes[start + 2] !== 4) return null;
          control = bytes.slice(start, offset);
        }
      } else if (marker === 0x2c) {
        if (offset + 9 > bytes.length) return null;
        const x = bytes[offset] | (bytes[offset + 1] << 8);
        const y = bytes[offset + 2] | (bytes[offset + 3] << 8);
        const w = bytes[offset + 4] | (bytes[offset + 5] << 8);
        const h = bytes[offset + 6] | (bytes[offset + 7] << 8);
        if (!w || !h || x + w > width || y + h > height) return null;
        const packed = bytes[offset + 8];
        offset += 9 + (packed & 128 ? 3 * (1 << ((packed & 7) + 1)) : 0);
        if (offset >= bytes.length || bytes[offset] < 2 || bytes[offset] > 8) return null;
        offset++; // Taille initiale des codes LZW.
        if (!skipBlocks() || ++frames > 600) return null;
        if (frames === 1) {
          firstFrame = new Uint8Array(headerEnd + (control?.length || 0) + offset - start + 1);
          firstFrame.set(bytes.subarray(0, headerEnd));
          if (control) firstFrame.set(control, headerEnd);
          firstFrame.set(bytes.subarray(start, offset), headerEnd + (control?.length || 0));
          firstFrame[firstFrame.length - 1] = 0x3b;
        }
        control = null;
      } else return null;
    }
    return null;
  }

  function avatarPngChunks(bytes) {
    if (bytes.length < 33 || bytes.length > ANIMATED_AVATAR_MAX_PNG ||
        ![137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), chunks = [];
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset), end = offset + length + 12;
      if (end > bytes.length) return null;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      chunks.push({ offset, end, length, type });
      if (chunks.length === 1 && (type !== "IHDR" || length !== 13)) return null;
      if (type === "IEND") return length === 0 && end === bytes.length ? chunks : null;
      offset = end;
    }
    return null;
  }

  function avatarEmbedGif(png, gif, crop) {
    const chunks = avatarPngChunks(png), info = avatarGifInfo(gif);
    if (!chunks || !info || !avatarValidCrop(crop, info)) throw new Error("Avatar invalide");
    const payload = new Uint8Array(24 + gif.length), view = new DataView(payload.buffer);
    payload.set(new TextEncoder().encode(ANIMATED_AVATAR_MAGIC));
    [crop.x, crop.y, crop.width, crop.height].forEach((value, index) => view.setUint32(8 + index * 4, value));
    payload.set(gif, 24);
    const chunk = new Uint8Array(payload.length + 12), chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, payload.length);
    chunk.set(new TextEncoder().encode(ANIMATED_AVATAR_CHUNK), 4);
    chunk.set(payload, 8);
    chunkView.setUint32(chunk.length - 4, avatarCrc32(chunk.subarray(4, chunk.length - 4)));
    // Remplacer un éventuel ancien bloc plutôt que d'empiler les animations.
    const kept = chunks.filter((item) => item.type !== ANIMATED_AVATAR_CHUNK);
    const length = 8 + kept.reduce((total, item) => total + item.end - item.offset, 0) + chunk.length;
    if (length > ANIMATED_AVATAR_MAX_PNG) throw new Error("Avatar trop volumineux");
    const result = new Uint8Array(length);
    result.set(png.subarray(0, 8));
    let offset = 8;
    for (const item of kept) {
      if (item.type === "IEND") { result.set(chunk, offset); offset += chunk.length; }
      result.set(png.subarray(item.offset, item.end), offset);
      offset += item.end - item.offset;
    }
    return result;
  }

  function avatarValidCrop(crop, info) {
    return crop && [crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) &&
      crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 &&
      crop.x + crop.width <= info.width && crop.y + crop.height <= info.height;
  }

  function avatarUploadSizeError(length) {
    return `Avatar trop lourd (${(length / 1024).toFixed(1).replace(".", ",")} Kio). ` +
      "3CX limite l'import à 100 Kio pour le PNG et le GIF réunis. " +
      "Le thème réserve 4 Kio de marge ; réduis le GIF avant de réessayer.";
  }

  function avatarCheckUploadSize(png) {
    if (png.length > ANIMATED_AVATAR_UPLOAD_LIMIT) throw new Error(avatarUploadSizeError(png.length));
    return png;
  }

  function avatarExtractGif(png) {
    const chunks = avatarPngChunks(png);
    if (!chunks) return null;
    const matches = chunks.filter((item) => item.type === ANIMATED_AVATAR_CHUNK);
    if (matches.length !== 1) return null;
    const chunk = matches[0];
    if (chunk.length < 38 || chunk.length > ANIMATED_AVATAR_MAX_GIF + 24) return null;
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    if (view.getUint32(chunk.end - 4) !== avatarCrc32(png.subarray(chunk.offset + 4, chunk.end - 4))) return null;
    const payload = png.subarray(chunk.offset + 8, chunk.end - 4);
    if (String.fromCharCode(...payload.subarray(0, 8)) !== ANIMATED_AVATAR_MAGIC) return null;
    const crop = { x:view.getUint32(chunk.offset + 16), y:view.getUint32(chunk.offset + 20),
      width:view.getUint32(chunk.offset + 24), height:view.getUint32(chunk.offset + 28) };
    const gif = payload.slice(24), info = avatarGifInfo(gif);
    return info?.frames > 1 && avatarValidCrop(crop, info) ? { gif, crop, width:info.width, height:info.height } : null;
  }

  function animatedAvatarUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.origin === window.location.origin && /^\/user_images\/[^/]+\.png$/i.test(url.pathname)
        ? url.href : "";
    } catch { return ""; }
  }

  function animatedAvatarNotice(text) {
    ensureMessageLibrary();
    libraryNotice(text);
  }

  async function avatarFirstFramePng(info) {
    const url = URL.createObjectURL(new Blob([info.firstFrame], { type:"image/gif" }));
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve; image.onerror = reject; image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = info.width; canvas.height = info.height;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas.toDataURL("image/png");
    } finally { URL.revokeObjectURL(url); }
  }

  function stopAnimatedAvatarImport() {
    const state = animatedAvatarImport;
    if (!state) return;
    state.restore();
    window.clearTimeout(state.timer);
    animatedAvatarImport = null;
  }

  function installAnimatedAvatarCrop(state) {
    // Tampermonkey isole le script : seules ces deux méthodes de la page sont
    // temporairement enveloppées, pour le PNG de CET import et sa sortie 128 px.
    const page = typeof unsafeWindow === "object" ? unsafeWindow : window;
    const canvasPrototype = page.HTMLCanvasElement.prototype;
    const contextPrototype = page.CanvasRenderingContext2D.prototype;
    const originalExport = canvasPrototype.toDataURL, originalDraw = contextPrototype.drawImage;
    const exportToPage = (callback) => typeof exportFunction === "function" ? exportFunction(callback, page) : callback;
    const canvases = new WeakMap();
    const draw = exportToPage(function(image, ...args) {
      const result = originalDraw.call(this, image, ...args);
      if (animatedAvatarImport === state && image?.src === state.png && args.length === 8 &&
          this.canvas.width === 128 && this.canvas.height === 128 &&
          document.querySelector("img-cropper canvas")) {
        const [x,y,width,height,dx,dy,dw,dh] = args;
        const crop = { x, y, width, height };
        if (dx === 0 && dy === 0 && dw === 128 && dh === 128 && avatarValidCrop(crop, state.info)) {
          canvases.set(this.canvas, crop);
        }
      }
      return result;
    });
    const output = exportToPage(function(...args) {
      const png = originalExport.apply(this, args), crop = canvases.get(this);
      if (animatedAvatarImport !== state || !crop || !png.startsWith("data:image/png;base64,")) return png;
      try {
        const enriched = avatarCheckUploadSize(avatarEmbedGif(avatarBase64ToBytes(png.split(",")[1]), state.gif, crop));
        state.exported = true;
        state.failed = false;
        state.error = "";
        return `data:image/png;base64,${avatarBytesToBase64(enriched)}`;
      } catch (error) {
        state.error = error instanceof Error ? error.message : "L'animation n'a pas pu être intégrée. Annule cet import et réessaie.";
        if (!state.failed) animatedAvatarNotice(state.error);
        state.failed = true;
        state.exported = false;
        // Ce PNG sert uniquement à l'aperçu : la validation est bloquée tant
        // que le résultat enrichi ne respecte pas la limite du serveur.
        return png;
      }
    });
    state.restore = () => {
      if (canvasPrototype.toDataURL === output) canvasPrototype.toDataURL = originalExport;
      if (contextPrototype.drawImage === draw) contextPrototype.drawImage = originalDraw;
    };
    try {
      canvasPrototype.toDataURL = output;
      contextPrototype.drawImage = draw;
      if (canvasPrototype.toDataURL !== output || contextPrototype.drawImage !== draw) throw new Error("Sandbox");
    } catch (error) { state.restore(); throw error; }
    state.timer = window.setTimeout(stopAnimatedAvatarImport, 5 * 60 * 1000);
  }

  function redispatchAvatarFile(input) {
    animatedAvatarRedispatch.add(input);
    input.dispatchEvent(new Event("change", { bubbles:true }));
  }

  async function prepareAnimatedAvatarFile(input, file, serial) {
    try {
      if (file.size > ANIMATED_AVATAR_MAX_GIF) throw new Error(avatarUploadSizeError(file.size));
      const gif = new Uint8Array(await file.arrayBuffer()), info = avatarGifInfo(gif);
      if (!info) throw new Error("GIF invalide ou trop grand : maximum 1024 × 1024 pixels et 600 images.");
      if (info.frames < 2) { if (serial === animatedAvatarImportSerial) redispatchAvatarFile(input); return; }
      if (gif.length > ANIMATED_AVATAR_UPLOAD_LIMIT) throw new Error(avatarUploadSizeError(gif.length));
      const png = await avatarFirstFramePng(info);
      if (serial !== animatedAvatarImportSerial || !input.isConnected || !/^#\/settings(?:\/general)?(?:$|[?])/i.test(location.hash)) return;
      const state = { gif, info, png, seenCropper:false, exported:false, failed:false, restore:() => {},
        previousPreview:input.closest('app-profile-image')?.querySelector('img')?.src || "" };
      installAnimatedAvatarCrop(state);
      animatedAvatarImport = state;
      const transfer = new DataTransfer();
      transfer.items.add(new File([avatarBase64ToBytes(png.split(",")[1])], file.name.replace(/\.gif$/i, "") + ".png", { type:"image/png" }));
      input.files = transfer.files;
      state.previousUrl = document.querySelector('app-header wc-account-menu app-avatar img')?.src || "";
      animatedAvatarVerification = null;
      redispatchAvatarFile(input);
      animatedAvatarNotice("GIF préparé : valide le recadrage puis enregistre ton profil pour partager l'animation.");
    } catch (error) {
      if (serial !== animatedAvatarImportSerial) return;
      stopAnimatedAvatarImport();
      animatedAvatarNotice(error instanceof Error ? error.message : "Impossible de préparer le GIF.");
      // Laisser le fichier et le profil existants intacts en cas d'erreur.
    }
  }

  function initializeAnimatedAvatars() {
    const style = document.createElement("style");
    style.dataset.decCreated = "true";
    style.textContent = `
      .dec-animated-avatar-relative { position:relative !important; }
      .dec-animated-avatar-ready { background-image:none !important; }
      .dec-animated-avatar-ready > img:not(.dec-animated-avatar-image) { opacity:0 !important; }
      .dec-animated-avatar-layer { position:absolute !important; inset:0 !important; display:block !important;
        overflow:hidden !important; border-radius:inherit; pointer-events:none !important; z-index:1; }
      .dec-animated-avatar-image { position:absolute !important; max-width:none !important; max-height:none !important;
        min-width:0 !important; min-height:0 !important; margin:0 !important; padding:0 !important;
        border:0 !important; border-radius:0 !important; object-fit:fill !important; }
      @media (prefers-reduced-motion:reduce) {
        .dec-animated-avatar-layer { display:none !important; }
        .dec-animated-avatar-ready > img:not(.dec-animated-avatar-image) { opacity:1 !important; }
        .dec-animated-avatar-ready { background-image:var(--dec-static-avatar) !important; }
      }`;
    (document.head || document.documentElement).appendChild(style);
    const confirmCrop = (event) => {
      if (!animatedAvatarImport) return;
      const dialog = event.target?.closest?.('app-modal-dialog');
      if (!dialog?.querySelector('img-cropper')) return;
      const ok = dialog.querySelector('[data-qa="modal-ok"]');
      if (ok && !ok.disabled && (event.type === "keydown" ? event.key === "Enter" : ok.contains(event.target))) {
        if (animatedAvatarImport.failed) {
          event.preventDefault();
          event.stopImmediatePropagation();
          animatedAvatarNotice(animatedAvatarImport.error || "L'avatar animé n'est pas prêt. Annule cet import et réessaie.");
          return;
        }
        animatedAvatarImport.confirmed = true;
        animatedAvatarImport.seenCropper = true;
        if (animatedAvatarImport.exported && !animatedAvatarImport.failed) {
          animatedAvatarVerification = { previousUrl:animatedAvatarImport.previousUrl,
            gifCrc:avatarCrc32(animatedAvatarImport.gif), until:Date.now()+5*60*1000 };
        }
      }
    };
    document.addEventListener("click", confirmCrop, true);
    document.addEventListener("keydown", confirmCrop, true);
    document.addEventListener("change", (event) => {
      const input = event.target;
      if (!input?.matches?.('app-profile-image input[type="file"]') ||
          !/^#\/settings(?:\/general)?(?:$|[?])/i.test(location.hash)) return;
      if (animatedAvatarRedispatch.delete(input)) return;
      const serial = ++animatedAvatarImportSerial;
      stopAnimatedAvatarImport();
      animatedAvatarVerification = null;
      const file = input.files?.[0];
      if (!file || !(/\.gif$/i.test(file.name) || file.type === "image/gif")) return;
      event.stopImmediatePropagation(); event.preventDefault();
      void prepareAnimatedAvatarFile(input, file, serial);
    }, true);
    document.addEventListener("load", (event) => {
      if (event.target?.matches?.('app-avatar img:not(.dec-animated-avatar-image)')) scheduleUpdate();
    }, true);
    window.addEventListener("hashchange", () => {
      animatedAvatarImportSerial++;
      stopAnimatedAvatarImport();
    });
    window.addEventListener("pagehide", () => {
      stopAnimatedAvatarImport();
      document.querySelectorAll('.dec-animated-avatar-layer').forEach((layer) => removeAnimatedAvatarLayer(layer.parentElement));
      for (const entry of animatedAvatarCache.values()) {
        entry.controller?.abort();
        if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      }
      animatedAvatarCache.clear();
    });
  }

  async function readAnimatedAvatarBytes(response) {
    if (Number(response.headers.get("content-length")) > ANIMATED_AVATAR_MAX_PNG) throw new Error("Avatar trop volumineux");
    const reader = response.body?.getReader();
    if (!reader) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > ANIMATED_AVATAR_MAX_PNG) throw new Error("Avatar trop volumineux");
      return bytes;
    }
    const pieces = [];
    let length = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        length += item.value.length;
        if (length > ANIMATED_AVATAR_MAX_PNG) throw new Error("Avatar trop volumineux");
        pieces.push(item.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
    return bytes;
  }

  function requestAnimatedAvatar(url) {
    let entry = animatedAvatarCache.get(url);
    if (entry && (!entry.retryAt || entry.retryAt > Date.now())) return entry;
    if (animatedAvatarRequests >= 4) return null;
    // Limiter la mémoire sans invalider les animations actuellement affichées.
    if (animatedAvatarCache.size >= 512) {
      const active = new Set([...document.querySelectorAll('app-avatar img:not(.dec-animated-avatar-image), [data-dec-avatar-source]')]
        .map((node) => animatedAvatarUrl(node.dataset.decAvatarSource || node.src || "")));
      const unused = [...animatedAvatarCache].find(([key, value]) => !value.pending && !active.has(key));
      if (!unused) return null;
      if (unused[1].objectUrl) URL.revokeObjectURL(unused[1].objectUrl);
      animatedAvatarCache.delete(unused[0]);
    }
    entry = { pending:true, objectUrl:"", animation:null, retryAt:0 };
    animatedAvatarCache.set(url, entry);
    animatedAvatarRequests++;
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 15000);
    entry.controller = controller;
    void fetch(url, { credentials:"same-origin", signal:controller.signal, redirect:"error" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Avatar indisponible");
        const bytes = await readAnimatedAvatarBytes(response);
        if (animatedAvatarCache.get(url) !== entry) return;
        entry.animation = avatarExtractGif(bytes);
        if (entry.animation) {
          entry.gifCrc = avatarCrc32(entry.animation.gif);
          // Les PNG sans animation occupent peu de place. Les GIF, eux, sont
          // bornés à 16 Mo au total ; évincer d'abord les profils hors de l'écran.
          const active = new Set([...document.querySelectorAll('.dec-animated-avatar-layer')].map((node) => node.dataset.avatarUrl));
          let size = [...animatedAvatarCache.values()].reduce((total, item) => total + (item.animation?.gif.length || 0), 0);
          for (const [key, cached] of animatedAvatarCache) {
            if (size <= 16 * 1024 * 1024) break;
            if (key === url || !cached.animation || active.has(key)) continue;
            size -= cached.animation.gif.length;
            if (cached.objectUrl) URL.revokeObjectURL(cached.objectUrl);
            animatedAvatarCache.delete(key);
          }
          if (size <= 16 * 1024 * 1024) entry.objectUrl = URL.createObjectURL(new Blob([entry.animation.gif], { type:"image/gif" }));
          else { entry.animation = null; entry.retryAt = Date.now() + 60000; }
        }
        entry.checked = true;
      })
      .catch(() => { entry.retryAt = Date.now() + 60000; })
      .finally(() => {
        window.clearTimeout(timeout); animatedAvatarRequests--; entry.pending = false;
        if (animatedAvatarCache.get(url) === entry) scheduleUpdate();
      });
    return entry;
  }

  function removeAnimatedAvatarLayer(host) {
    host.querySelector(":scope > .dec-animated-avatar-layer")?.remove();
    host.classList.remove("dec-animated-avatar-ready", "dec-animated-avatar-relative");
    host.style.removeProperty("--dec-static-avatar");
  }

  function applyAnimatedAvatarLayer(host, source) {
    const url = animatedAvatarUrl(source);
    let layer = host.querySelector(":scope > .dec-animated-avatar-layer");
    if (layer && layer.dataset.avatarUrl !== url) { removeAnimatedAvatarLayer(host); layer = null; }
    if (!layer && host.classList.contains("dec-animated-avatar-ready")) removeAnimatedAvatarLayer(host);
    if (!url) return;
    const entry = requestAnimatedAvatar(url);
    if (!entry?.animation || layer) return;
    layer = document.createElement("span");
    layer.className = "dec-animated-avatar-layer";
    layer.dataset.decCreated = "true";
    layer.dataset.avatarUrl = url;
    layer.setAttribute("aria-hidden", "true");
    const image = document.createElement("img"), { crop, width, height } = entry.animation;
    image.className = "dec-animated-avatar-image"; image.alt = ""; image.draggable = false;
    for (const [property, value] of Object.entries({ width:width/crop.width*100, height:height/crop.height*100,
      left:-crop.x/crop.width*100, top:-crop.y/crop.height*100 })) image.style.setProperty(property, `${value}%`, "important");
    image.onload = () => {
      if (!layer.isConnected) return;
      if (getComputedStyle(host).position === "static") host.classList.add("dec-animated-avatar-relative");
      host.style.setProperty("--dec-static-avatar", `url(${JSON.stringify(url)})`);
      host.classList.add("dec-animated-avatar-ready");
    };
    image.onerror = () => {
      removeAnimatedAvatarLayer(host);
      entry.animation = null;
      if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      entry.objectUrl = "";
    };
    layer.appendChild(image); host.appendChild(layer); image.src = entry.objectUrl;
  }

  function enhanceAnimatedAvatars() {
    const state = animatedAvatarImport;
    if (state) {
      if (document.querySelector("img-cropper canvas")) state.seenCropper = true;
      else if (state.seenCropper) {
        // Le résultat enrichi n'est retenu que si la boîte a été validée.
        const preview = document.querySelector('app-profile-image img[data-qa="profile-image"], app-profile-image img[data-qa="thumbnail"]');
        if ((state.confirmed || preview?.src !== state.previousPreview) && preview?.src.startsWith("data:image/png;base64,")) {
          let animation = null;
          try { animation = avatarExtractGif(avatarBase64ToBytes(preview.src.split(",")[1])); } catch { /* Aperçu natif incomplet. */ }
          if (state.exported && !state.failed && animation) {
            animatedAvatarVerification = { previousUrl:state.previousUrl, gifCrc:avatarCrc32(state.gif), until:Date.now()+5*60*1000 };
          } else if (!state.failed) animatedAvatarNotice("Le recadrage de cette version de 3CX n'a pas conservé le GIF. L'avatar reste fixe.");
        }
        stopAnimatedAvatarImport();
      }
    }
    document.querySelectorAll('.dec-animated-avatar-layer').forEach((layer) => {
      const host = layer.parentElement;
      if (!host.hasAttribute('data-dec-avatar-source') && !host.querySelector('img:not(.dec-animated-avatar-image)')) removeAnimatedAvatarLayer(host);
    });
    document.querySelectorAll('app-avatar img:not(.dec-animated-avatar-image)').forEach((image) => applyAnimatedAvatarLayer(image.parentElement, image.src));
    document.querySelectorAll('[data-dec-avatar-source]').forEach((host) => applyAnimatedAvatarLayer(host, host.dataset.decAvatarSource));
    const verification = animatedAvatarVerification;
    if (!verification) return;
    if (Date.now() > verification.until) { animatedAvatarVerification = null; return; }
    const url = animatedAvatarUrl(document.querySelector('app-header wc-account-menu app-avatar img')?.src || "");
    if (!url || url === verification.previousUrl) return;
    const entry = requestAnimatedAvatar(url);
    if (!entry?.checked) return;
    animatedAvatarVerification = null;
    if (entry.gifCrc === verification.gifCrc) {
      animatedAvatarNotice("Avatar animé enregistré : les utilisateurs du thème verront le GIF, les autres l'image fixe.");
    } else animatedAvatarNotice("3CX a supprimé les données d'animation à l'enregistrement. L'avatar reste fixe ; le partage du GIF n'a pas fonctionné.");
  }

  function participantProfileFromRow(row) {
    const line = row.querySelector("app-extension-line-view");
    const nameElement = row.querySelector('[data-qa="name"]');
    const fullName = String(
      nameElement?.textContent || line?.textContent || row.textContent || "",
    ).trim();
    const extension = extensionFromText(fullName);

    if (!extension) {
      return null;
    }

    const name =
      nameElement?.textContent?.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim() ||
      line?.querySelector(".text-truncate")?.textContent?.trim() ||
      fullName.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim();

    const image = row.querySelector("app-avatar img.avatar-content, app-avatar img");
    const initialElement = row.querySelector("app-avatar .avatar-content:not(img)");
    const initials = initialElement?.textContent?.trim() || initialsFromName(name);

    return {
      extension,
      name,
      imageUrl: image?.src || "",
      initials,
    };
  }

  function readCachedOwnProfile() {
    try {
      const value = JSON.parse(window.localStorage.getItem(STORAGE_OWN_PROFILE) || "null");
      if (!value || typeof value !== "object") {
        return null;
      }
      const extension = String(value.extension || "").trim();
      const name = String(value.name || "").trim();
      if (!/^\d{1,5}$/.test(extension) || !name) {
        return null;
      }
      return {
        extension,
        name,
        imageUrl: String(value.imageUrl || ""),
        initials: String(value.initials || "").trim() || initialsFromName(name),
      };
    } catch {
      return null;
    }
  }

  function writeCachedOwnProfile(profile) {
    try {
      window.localStorage.setItem(
        STORAGE_OWN_PROFILE,
        JSON.stringify({
          extension: profile.extension,
          name: profile.name,
          imageUrl: profile.imageUrl || "",
          initials: profile.initials || initialsFromName(profile.name),
        }),
      );
    } catch {
      // L'identité reste utilisable pendant la session si le stockage est bloqué.
    }
  }

  function ownProfileFromVisibleMessages(profiles) {
    const names = [...document.querySelectorAll("chat-message > .message-name.message-right")];
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const fullName = String(names[index].textContent || "").trim();
      const extension = extensionFromText(fullName);
      if (!extension) {
        continue;
      }
      const name = fullName.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim();
      const known = profiles.get(extension);
      return {
        extension,
        name: known?.name || name,
        imageUrl: known?.imageUrl || "",
        initials: known?.initials || initialsFromName(known?.name || name),
      };
    }
    return null;
  }

  function ownProfileFromDirectParticipants() {
    const contact = directConversationProfileFromHeader();
    if (!contact) {
      return null;
    }

    const participants = [...document.querySelectorAll(PARTICIPANT_SELECTOR)]
      .map(participantProfileFromRow)
      .filter(Boolean);
    const ownCandidates = participants.filter((profile) => profile.extension !== contact.extension);
    return ownCandidates.length === 1 ? ownCandidates[0] : null;
  }

  function ownProfileImageFromApplicationHeader() {
    const candidates = [
      ...document.querySelectorAll(
        '[data-qa="profile-image"], ' +
          '.avatar-content[data-qa="profile-image"], ' +
          '.avatar-contant[data-qa="profile-image"]',
      ),
    ];

    for (const candidate of candidates) {
      const image = candidate.matches("img") ? candidate : candidate.querySelector("img");
      const imageUrl = image?.currentSrc || image?.src || "";
      if (imageUrl) {
        return imageUrl;
      }

      for (const element of [candidate, ...candidate.querySelectorAll("*")]) {
        const backgroundImage = window.getComputedStyle(element).backgroundImage;
        const match = String(backgroundImage || "").match(/^url\(["']?(.*?)["']?\)$/);
        if (match?.[1]) {
          return match[1];
        }
      }
    }
    return "";
  }

  function synchronizeOwnProfile(profiles) {
    const detected = ownProfileFromVisibleMessages(profiles) || ownProfileFromDirectParticipants();
    const cached = readCachedOwnProfile();
    const applicationProfileImage = ownProfileImageFromApplicationHeader();
    const matchingCached = detected && cached?.extension === detected.extension ? cached : null;
    const profile = detected
      ? {
          ...detected,
          imageUrl: applicationProfileImage || detected.imageUrl || matchingCached?.imageUrl || "",
          initials:
            detected.initials || matchingCached?.initials || initialsFromName(detected.name),
        }
      : cached
        ? {
            ...cached,
            imageUrl: applicationProfileImage || cached.imageUrl || "",
          }
        : null;

    if (!profile?.name) {
      currentOwnProfile = {
        extension: "",
        name: "Moi",
        imageUrl: applicationProfileImage,
        initials: "",
      };
      document.documentElement.style.setProperty("--slack-me-name", JSON.stringify("Moi"));
      if (applicationProfileImage) {
        document.documentElement.style.setProperty(
          "--slack-me-avatar",
          `url(${JSON.stringify(applicationProfileImage)})`,
        );
      } else {
        document.documentElement.style.removeProperty("--slack-me-avatar");
      }
      return;
    }

    if (applicationProfileImage && !profile.imageUrl) {
      profile.imageUrl = applicationProfileImage;
    }
    currentOwnProfile = profile;
    writeCachedOwnProfile(profile);
    document.documentElement.style.setProperty("--slack-me-name", JSON.stringify(profile.name));
    document.documentElement.style.setProperty(
      "--slack-me-avatar",
      profile.imageUrl ? `url(${JSON.stringify(profile.imageUrl)})` : initialsAvatarCssUrl(profile),
    );
  }

  function buildParticipantMap() {
    const profiles = new Map(profileCache);

    document.querySelectorAll(PARTICIPANT_SELECTOR).forEach((row) => {
      const profile = participantProfileFromRow(row);
      if (profile) {
        profiles.set(profile.extension, profile);
        profileCache.set(profile.extension, profile);
      }
    });

    // Si le panneau d'informations est fermé, la liste des conversations
    // contient souvent le même profil, y compris les avatars en initiales.
    document.querySelectorAll("chat-item").forEach((item) => {
      const nameElement = item.querySelector("[data-qa='header-name'], .header-name");
      const fullName = String(nameElement?.textContent || "").trim();
      const extension = extensionFromText(fullName);

      if (!extension || profiles.has(extension)) {
        return;
      }

      const image = item.querySelector("app-avatar img.avatar-content, app-avatar img");
      const initialElement = item.querySelector("app-avatar .avatar-content:not(img)");
      const name = fullName.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim();
      const profile = {
        extension,
        name,
        imageUrl: image?.src || "",
        initials: initialElement?.textContent?.trim() || initialsFromName(name),
      };

      profiles.set(extension, profile);
      profileCache.set(extension, profile);
    });

    // Repli utile lorsque le panneau des participants est temporairement fermé :
    // les avatars déjà affichés ailleurs dans 3CX portent leur extension en alt.
    document.querySelectorAll("app-avatar img[alt]").forEach((image) => {
      const extension = String(image.getAttribute("alt") || "").trim();
      if (!/^\d{1,5}$/.test(extension) || profiles.has(extension)) {
        return;
      }

      const profile = {
        extension,
        name: "",
        imageUrl: image.src || "",
        initials: "",
      };
      profiles.set(extension, profile);
      profileCache.set(extension, profile);
    });

    return profiles;
  }

  function directConversationProfileFromHeader() {
    const header = document.querySelector("chat-messages-header");
    const fullName = String(
      header?.querySelector("[data-qa='chat-name'], #showParticipants")?.textContent || "",
    ).trim();
    const extension = extensionFromText(fullName);

    // Les conversations directes affichent « Nom Prénom 62 » dans l'en-tête.
    // Un groupe ne se termine normalement pas par un numéro d'extension.
    if (!header || !extension) {
      return null;
    }
    if (
      header.querySelector('[data-qa="chat-name"]') &&
      header.querySelector("app-avatar img[alt]")?.getAttribute("alt") !== extension
    ) {
      return null;
    }

    const name = fullName.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim();
    if (!name) {
      return null;
    }

    const avatar = header.querySelector("app-avatar");
    const image = avatar?.querySelector("img.avatar-content, img");
    const initialElement = avatar?.querySelector(".avatar-content:not(img)");

    return {
      extension,
      name,
      imageUrl: image?.src || "",
      initials: initialElement?.textContent?.trim() || initialsFromName(name),
    };
  }

  function initialsAvatarCssUrl(profile) {
    const initials = String(profile.initials || initialsFromName(profile.name))
      .slice(0, 3)
      .toLocaleUpperCase("fr-FR");
    const background = colorForExtension(profile.extension);
    const escapedInitials = initials
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">',
      `<rect width="72" height="72" rx="14" fill="${background}"/>`,
      '<text x="36" y="38" fill="white" font-family="Segoe UI,Arial,sans-serif" font-size="25" font-weight="700" text-anchor="middle" dominant-baseline="middle">',
      escapedInitials,
      "</text></svg>",
    ].join("");

    return `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}")`;
  }

  function synchronizeDirectConversationProfile() {
    const chat = document.querySelector("chat-component");
    if (!chat) {
      return;
    }

    const profile = directConversationProfileFromHeader();
    if (!profile) {
      // Évite de conserver le contact précédent lorsqu'Angular réutilise
      // le même composant lors d'un changement de conversation.
      chat.style.removeProperty("--slack-other-name");
      chat.style.removeProperty("--slack-other-avatar");
      delete chat.dataset.decSlackDirectProfile;
      return;
    }

    const profileKey = `${profile.extension}|${profile.name}|${profile.imageUrl}|${profile.initials}`;
    if (chat.dataset.decSlackDirectProfile === profileKey) {
      return;
    }

    chat.dataset.decSlackDirectProfile = profileKey;
    chat.style.setProperty("--slack-other-name", JSON.stringify(profile.name));
    chat.style.setProperty(
      "--slack-other-avatar",
      profile.imageUrl ? `url(${JSON.stringify(profile.imageUrl)})` : initialsAvatarCssUrl(profile),
    );
  }

  function visibleCssColor(value) {
    const color = String(value || "").trim();
    if (!color || color === "transparent" || color === "none" || color === "currentcolor") {
      return "";
    }
    if (
      /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color) ||
      /^rgb\([^)]*\/\s*0(?:\.0+)?%?\s*\)$/i.test(color)
    ) {
      return "";
    }
    return color;
  }

  function cssColorMetrics(value) {
    const color = String(value || "").trim();
    let channels = null;
    const rgbMatch = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
    if (rgbMatch) {
      channels = rgbMatch.slice(1, 4).map(Number);
    } else if (hexMatch) {
      channels = [0, 2, 4].map((offset) =>
        Number.parseInt(hexMatch[1].slice(offset, offset + 2), 16),
      );
    }
    if (!channels) {
      return { saturation: 0, luminance: 0.5 };
    }
    const [red, green, blue] = channels.map((channel) => channel / 255);
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    return {
      saturation: maximum === 0 ? 0 : (maximum - minimum) / maximum,
      luminance: 0.2126 * red + 0.7152 * green + 0.0722 * blue,
    };
  }

  function nativePresenceColor(element) {
    if (!element) {
      return "";
    }
    const nodes = [element, ...element.querySelectorAll("*")];
    const nativeNodeState = (node) => {
      const classes = String(node.className?.baseVal || node.className || "")
        .split(/\s+/)
        .filter((className) => !className.startsWith("dec-slack-"))
        .sort()
        .join(".");
      const attributes = [...node.attributes]
        .filter(
          (attribute) => attribute.name !== "class" && !attribute.name.startsWith("data-dec-"),
        )
        .map((attribute) => `${attribute.name}=${attribute.value}`)
        .sort()
        .join(";");
      return `${node.tagName}:${classes}:${attributes}`;
    };
    const signature = [
      nativeNodeState(element.parentElement || element),
      ...nodes.map(nativeNodeState),
      String(element.textContent || "").trim(),
    ].join("|");
    if (element.dataset.decPresenceColor && element.dataset.decPresenceSignature === signature) {
      return element.dataset.decPresenceColor;
    }

    const wasHidden = element.classList.contains("dec-slack-native-presence-hidden");
    if (wasHidden) {
      element.classList.remove("dec-slack-native-presence-hidden");
    }
    const colorCandidates = [];
    try {
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        const compactNode =
          rect.width > 0 && rect.height > 0 && rect.width <= 24 && rect.height <= 24;
        for (const pseudo of [null, "::before", "::after"]) {
          const style = window.getComputedStyle(node, pseudo);
          const pseudoWidth = Number.parseFloat(style.width);
          const pseudoHeight = Number.parseFloat(style.height);
          const compactPseudo =
            pseudo &&
            pseudoWidth > 0 &&
            pseudoHeight > 0 &&
            pseudoWidth <= 24 &&
            pseudoHeight <= 24;
          if (!compactNode && !compactPseudo) {
            continue;
          }
          const candidates = [{ value: style.backgroundColor, weight: 120 }];
          if (Number.parseFloat(style.borderTopWidth) > 0) {
            candidates.push({ value: style.borderTopColor, weight: 35 });
          }
          if (node.namespaceURI === "http://www.w3.org/2000/svg") {
            candidates.push(
              { value: style.fill, weight: 120 },
              { value: style.stroke, weight: 75 },
              { value: style.color, weight: 25 },
            );
          } else if (compactNode || (pseudo && style.content !== "none")) {
            candidates.push({ value: style.color, weight: 20 });
          }
          const semanticMarker = /(?:presence|status|availability|indicator|dot)/i.test(
            [
              node.className?.baseVal || node.className,
              node.getAttribute?.("data-qa"),
              node.getAttribute?.("data-status"),
              node.getAttribute?.("data-presence"),
            ]
              .filter(Boolean)
              .join(" "),
          );
          const circularMarker =
            /50%/.test(style.borderRadius) ||
            Number.parseFloat(style.borderRadius) >=
              Math.min(pseudoWidth || rect.width, pseudoHeight || rect.height) / 2;
          for (const candidate of candidates) {
            const color = visibleCssColor(candidate.value);
            if (color) {
              const metrics = cssColorMetrics(color);
              const extremeNeutral =
                metrics.saturation < 0.08 && (metrics.luminance < 0.08 || metrics.luminance > 0.92);
              colorCandidates.push({
                color,
                score:
                  candidate.weight +
                  (semanticMarker ? 170 : 0) +
                  (circularMarker ? 55 : 0) +
                  (Math.max(pseudoWidth || rect.width, pseudoHeight || rect.height) <= 16
                    ? 30
                    : 0) +
                  metrics.saturation * 110 -
                  (extremeNeutral ? 140 : 0),
              });
            }
          }
        }
      }
    } finally {
      if (wasHidden) {
        element.classList.add("dec-slack-native-presence-hidden");
      }
    }
    const bestColor =
      colorCandidates.sort((left, right) => right.score - left.score)[0]?.color || "";
    if (bestColor) {
      element.dataset.decPresenceColor = bestColor;
      element.dataset.decPresenceSignature = signature;
    }
    return bestColor;
  }

  function nativeConversationPresenceFromHeader(header, ignoredTitle, visibleTitle) {
    const nativeSemanticSelector =
      "[class*='status' i], [class*='presence' i], [data-status], " +
      "[data-presence], [data-qa*='status' i], [data-qa*='presence' i]";
    const candidateSelector = `${nativeSemanticSelector}, small, .text-muted`;
    const ignoredLabels = new Set(
      [visibleTitle, ignoredTitle.textContent]
        .map((value) =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean),
    );
    const candidates = [];

    [...header.querySelectorAll(candidateSelector)].forEach((element) => {
      if (
        element === ignoredTitle ||
        ignoredTitle.contains(element) ||
        element.closest(".dec-slack-conversation-actions") ||
        element.closest(".dec-slack-conversation-title-card") ||
        element.closest("button, a, [role='button']")
      ) {
        return;
      }

      const rawLabels = [
        element.textContent,
        element.getAttribute("title"),
        element.getAttribute("aria-label"),
        element.getAttribute("data-status-text"),
        element.getAttribute("data-presence-text"),
        element.getAttribute("data-label"),
      ];
      const label = rawLabels
        .map((value) =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .find(
          (value) =>
            value &&
            value.length <= 100 &&
            !ignoredLabels.has(value) &&
            !/^\d{1,5}$/.test(value) &&
            !/@/.test(value) &&
            !/^(?:appel|email|participants? au chat)/i.test(value),
        );
      const parent = element.parentElement;
      const parentCanContainDot =
        parent && parent !== header && !parent.querySelector("button, a, [role='button']");
      const color =
        nativePresenceColor(element) || (parentCanContainDot ? nativePresenceColor(parent) : "");
      if (!label && !color) {
        return;
      }

      candidates.push({
        label: label || "",
        color,
        source: element,
        score:
          (label ? 50 : 0) +
          (color ? 100 : 0) +
          (element.matches(nativeSemanticSelector) ? 24 : 0) +
          (element.hasAttribute("data-status") ? 12 : 0) +
          (element.hasAttribute("data-presence") ? 12 : 0),
      });
    });

    const best = candidates
      .filter((candidate) => candidate.label)
      .sort((left, right) => right.score - left.score)[0];
    if (!best) {
      return { label: "", color: "" };
    }

    let relatedColorCandidate = null;
    if (!best.color) {
      relatedColorCandidate =
        candidates.find(
          (candidate) =>
            candidate.color &&
            (candidate.source.contains(best.source) ||
              best.source.contains(candidate.source) ||
              candidate.source.parentElement === best.source.parentElement),
        ) || null;
      best.color = relatedColorCandidate?.color || "";
    }
    let sourceToHide = best.source;
    if (
      relatedColorCandidate &&
      best.source.parentElement === relatedColorCandidate.source.parentElement &&
      best.source.parentElement !== header &&
      !best.source.parentElement.querySelector("button, a, [role='button']")
    ) {
      sourceToHide = best.source.parentElement;
    }
    sourceToHide.classList.add("dec-slack-native-presence-hidden");
    return { label: best.label, color: best.color };
  }

  function enhanceConversationHeader() {
    const header = document.querySelector(
      "#chat-window > chat-messages-header, chat-messages-header",
    );
    const title = header?.querySelector("#showParticipants");
    if (!header || !title) {
      return;
    }

    header.classList.add("dec-slack-conversation-header");
    title.classList.add("dec-slack-conversation-title", "dec-slack-native-title-hidden");

    const profile = directConversationProfileFromHeader();
    const rawTitle = String(title.textContent || "").trim();
    const visibleTitle = profile?.name || rawTitle;
    const nativePresence = profile
      ? nativeConversationPresenceFromHeader(header, title, visibleTitle)
      : { label: "", color: "" };
    const presence = nativePresence.label;
    /* La liste des conversations conserve toujours la pastille native complète,
       même lorsque 3CX sépare le libellé personnalisé dans l'en-tête. */
    const conversationListPresenceColor = profile
      ? nativePresenceColor(activeConversationChatItem())
      : "";
    const presenceColor = conversationListPresenceColor || nativePresence.color;
    if (!profile) {
      header
        .querySelectorAll(".dec-slack-native-presence-hidden")
        .forEach((element) => element.classList.remove("dec-slack-native-presence-hidden"));
    }
    const headerContent = header.querySelector(".header") || header;
    let titleCard = header.querySelector(
      ".dec-slack-conversation-title-card[data-dec-created='true']",
    );
    if (!titleCard) {
      titleCard = document.createElement("button");
      titleCard.type = "button";
      titleCard.className = "dec-slack-conversation-title-card";
      titleCard.dataset.decCreated = "true";

      const name = document.createElement("span");
      name.className = "dec-slack-conversation-title-name";
      const statusLine = document.createElement("span");
      statusLine.className = "dec-slack-conversation-presence";
      const statusDot = document.createElement("span");
      statusDot.className = "dec-slack-conversation-presence-dot";
      statusDot.setAttribute("aria-hidden", "true");
      const statusText = document.createElement("span");
      statusText.className = "dec-slack-conversation-presence-text";
      statusLine.append(statusDot, statusText);
      titleCard.append(name, statusLine);
      headerContent.appendChild(titleCard);
    }

    titleCard.querySelector(".dec-slack-conversation-title-name").textContent = visibleTitle;
    const statusLine = titleCard.querySelector(".dec-slack-conversation-presence");
    const statusText = titleCard.querySelector(".dec-slack-conversation-presence-text");
    const statusDot = titleCard.querySelector(".dec-slack-conversation-presence-dot");
    statusLine.hidden = !presence;
    delete statusLine.dataset.status;
    statusText.textContent = presence;
    if (presenceColor) {
      statusDot.style.setProperty("background-color", presenceColor, "important");
    } else {
      statusDot.style.removeProperty("background-color");
    }
    titleCard.setAttribute("aria-label", presence ? `${visibleTitle}, ${presence}` : visibleTitle);
    titleCard.onclick = () => title.click();

    const actionCandidates = [
      ...new Set(header.querySelectorAll("button, a.btn, [role='button'], .btn")),
    ].filter(
      (control) =>
        control !== title &&
        !title.contains(control) &&
        control !== titleCard &&
        !titleCard.contains(control) &&
        !control.closest(".dropdown-menu, [role='menu']"),
    );
    const actionButtons = actionCandidates.filter(
      (control) => !actionCandidates.some((other) => other !== control && other.contains(control)),
    );
    actionButtons.forEach((button) => {
      button.classList.add("dec-slack-conversation-action");
    });

    let actionContainer = header.querySelector(
      ".dec-slack-conversation-actions[data-dec-created='true']",
    );
    if (!actionContainer) {
      actionContainer = document.createElement("div");
      actionContainer.className = "dec-slack-conversation-actions";
      actionContainer.dataset.decCreated = "true";
      actionContainer.setAttribute("role", "toolbar");
      actionContainer.setAttribute("aria-label", "Actions de la conversation");
      headerContent.appendChild(actionContainer);
    }

    actionButtons.forEach((button) => {
      if (!actionContainer.contains(button)) {
        actionContainer.appendChild(button);
      }
    });
  }

  function createAvatarElement() {
    const avatar = document.createElement("span");
    avatar.className = AVATAR_CLASS;
    avatar.dataset.decCreated = "true";
    avatar.setAttribute("aria-hidden", "true");
    return avatar;
  }

  function applyProfileToAvatar(avatar, profile, fallbackName, extension) {
    const imageUrl = profile?.imageUrl || "";
    avatar.dataset.decAvatarSource = imageUrl;
    const initials = profile?.initials || initialsFromName(profile?.name || fallbackName);
    const profileKey = `${extension}|${imageUrl}|${initials}`;

    if (avatar.dataset.profileKey === profileKey) {
      return;
    }

    avatar.dataset.profileKey = profileKey;
    avatar.dataset.extension = extension;
    avatar.title = profile?.name || fallbackName || `Extension ${extension}`;

    if (imageUrl) {
      avatar.textContent = "";
      avatar.style.backgroundColor = "#e6e1e6";
      avatar.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
    } else {
      avatar.textContent = initials;
      avatar.style.backgroundColor = colorForExtension(extension);
      avatar.style.backgroundImage = "none";
    }
  }

  function normalizedTypingText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("fr-FR");
  }

  function containsTypingText(value) {
    const text = normalizedTypingText(value);
    if (!text || text.length > 180) {
      return false;
    }
    return /\b(?:typing|is typing|are typing|ecrit|ecrivent|en train d'ecrire|en cours d'ecriture|redige|redigent|redaction en cours)\s*(?:\.{2,3}|…)?$/.test(
      text,
    );
  }

  function nativeTypingElementText(element) {
    return [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-status"),
    ]
      .filter(Boolean)
      .join(" ");
  }

  function activeConversationChatItem() {
    const directProfile = directConversationProfileFromHeader();
    const nativeTitle = String(
      document.querySelector(
        "chat-messages-header [data-qa='chat-name'], chat-messages-header #showParticipants",
      )?.textContent || "",
    ).trim();
    const expectedLabels = [
      nativeTitle,
      directProfile ? `${directProfile.name} ${directProfile.extension}` : "",
      directProfile?.name,
    ]
      .filter(Boolean)
      .map(normalizedTypingText);
    const items = [...document.querySelectorAll("chat-item")];
    const routeId = String(window.location.hash.match(/^#\/chat\/([^/?#]+)/)?.[1] || "");
    const routeFragment = routeId ? `/chat/${routeId}` : "";
    const routeItem = routeFragment
      ? items.find((item) =>
          [item, ...item.querySelectorAll("[href], [routerlink], [ng-reflect-router-link]")].some(
            (element) =>
              [
                element.getAttribute("href"),
                element.getAttribute("routerlink"),
                element.getAttribute("ng-reflect-router-link"),
              ].some((value) =>
                String(value || "")
                  .split(/[?#]/)
                  .includes(routeFragment),
              ),
          ),
        )
      : null;

    return (
      routeItem ||
      items.find((item) => {
        const label = normalizedTypingText(
          item.querySelector("[data-qa='header-name'], .header-name")?.textContent || "",
        );
        return expectedLabels.some(
          (expected) => label === expected || label.startsWith(`${expected} `),
        );
      }) ||
      items.find((item) =>
        Boolean(
          item.matches(".active, .selected, [aria-current='page'], [data-selected='true']") ||
            item.closest(".active, .selected, [aria-current='page'], [data-selected='true']"),
        ),
      ) ||
      null
    );
  }

  function nativeTypingElements() {
    const header = document.querySelector("chat-messages-header");
    if (!header) {
      return [];
    }

    const activeItem = activeConversationChatItem();
    const candidates = new Set(header.querySelectorAll("*"));
    if (activeItem) {
      candidates.add(activeItem);
    }
    activeItem?.querySelectorAll("*").forEach((element) => candidates.add(element));
    const matches = [...candidates].filter(
      (element) =>
        !element.closest(`#${TYPING_INDICATOR_ID}`) &&
        !element.closest('[data-dec-created="true"], [data-qa="chat-name"], [data-qa="header-name"], .header-name') &&
        !element.querySelector('[data-qa="chat-name"], [data-qa="header-name"], .header-name') &&
        !element.querySelector("chat-message, #chat-form-controls, app-chat-message-input") &&
        containsTypingText(nativeTypingElementText(element)),
    );

    /* Ne conserve que le nœud le plus précis portant le texte. Sans ce filtre,
       toute la barre d'en-tête pourrait être masquée avec son enfant natif. */
    return matches.filter(
      (element) => !matches.some((other) => other !== element && element.contains(other)),
    );
  }

  function imageUrlFromCssBackground(value) {
    const match = String(value || "").match(/^url\(["']?(.*?)["']?\)$/i);
    return match?.[1] || "";
  }

  function typingProfileCandidates(profiles) {
    const currentParticipants = new Map();
    document.querySelectorAll(PARTICIPANT_SELECTOR).forEach((row) => {
      const profile = participantProfileFromRow(row);
      if (profile?.extension) {
        currentParticipants.set(profile.extension, profile);
      }
    });
    const restrictToCurrentParticipants = currentParticipants.size > 0;
    const candidates = restrictToCurrentParticipants
      ? new Map(currentParticipants)
      : new Map(profiles);

    document
      .querySelectorAll(
        `${MESSAGE_SELECTOR} > .message-name, ` +
          `${MESSAGE_SELECTOR} > .message-row > .sender-name`,
      )
      .forEach((nameElement) => {
        const fullName = String(nameElement.textContent || "").trim();
        const extension = extensionFromText(fullName);
        if (!extension || (restrictToCurrentParticipants && !currentParticipants.has(extension))) {
          return;
        }

        const name = fullName.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim();
        const known = candidates.get(extension);
        const avatar = nameElement.parentElement?.querySelector(`.${AVATAR_CLASS}`);
        const imageUrl =
          known?.imageUrl || imageUrlFromCssBackground(avatar?.style.backgroundImage);
        candidates.set(extension, {
          extension,
          name: known?.name || name,
          imageUrl,
          initials:
            known?.initials ||
            String(avatar?.textContent || "").trim() ||
            initialsFromName(known?.name || name),
        });
      });

    return [...candidates.values()].filter(
      (profile) =>
        profile?.extension && profile.extension !== currentOwnProfile?.extension && profile.name,
    );
  }

  function profilesFromTypingElements(elements, profiles) {
    if (elements.length === 0) {
      return [];
    }

    const directProfile = directConversationProfileFromHeader();
    if (directProfile) {
      return [directProfile];
    }

    const combinedText = normalizedTypingText(elements.map(nativeTypingElementText).join(" "));
    const candidates = typingProfileCandidates(profiles);
    // Le nom transmis par 3CX reste exploitable lorsque le panneau des
    // participants est fermé et que la personne n'est pas encore en cache.
    for (const name of namesFromTypingElements(elements)) {
      const extension = extensionFromText(name);
      const cleanName = extension ? name.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim() : name;
      if ((extension && extension === currentOwnProfile?.extension) ||
          normalizedTypingText(cleanName) === normalizedTypingText(currentOwnProfile?.name)) continue;
      if (extension && candidates.some(profile => profile.extension === extension)) continue;
      const normalizedName = normalizedTypingText(cleanName);
      const named = candidates.filter(profile => normalizedTypingText(profile.name) === normalizedName ||
        normalizedTypingText(profile.name).startsWith(`${normalizedName} `));
      if (!extension && named.length === 1) continue;
      if (!cleanName) continue;
      const known = extension ? profiles.get(extension) : null;
      candidates.push({ extension:extension || `typing:${libraryHash(normalizedName)}`, name:known?.name || cleanName,
        imageUrl:known?.imageUrl || "", initials:known?.initials || initialsFromName(cleanName) });
    }
    const matchedExtensions = new Set();

    elements.forEach((element) => {
      element.querySelectorAll("app-avatar img[alt], img.avatar-content[alt]").forEach((image) => {
        const extension = String(image.getAttribute("alt") || "").trim();
        if (/^\d{1,5}$/.test(extension)) {
          matchedExtensions.add(extension);
        }
      });
    });

    const firstNameCounts = new Map();
    candidates.forEach((profile) => {
      const firstName = normalizedTypingText(profile.name).split(" ")[0];
      if (firstName) {
        firstNameCounts.set(firstName, (firstNameCounts.get(firstName) || 0) + 1);
      }
    });

    const matchPosition = new Map();
    candidates.forEach((profile) => {
      const normalizedName = normalizedTypingText(profile.name);
      const firstName = normalizedName.split(" ")[0];
      const escapedExtension = String(profile.extension).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const fullNamePosition = normalizedName ? combinedText.search(
        new RegExp(`(?:^|[^\\p{L}])${escapedName}(?=[^\\p{L}]|$)`, "u"),
      ) : -1;
      const uniqueFirstNamePosition =
        firstName && firstNameCounts.get(firstName) === 1
          ? combinedText.search(
              new RegExp(
                `(?:^|[^a-z0-9])${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`,
              ),
            )
          : -1;
      const extensionPosition = /^\d{1,5}$/.test(profile.extension) ? combinedText.search(
        new RegExp(`(?:^|\\D)${escapedExtension}(?:\\D|$)`),
      ) : -1;
      const positions = [fullNamePosition, uniqueFirstNamePosition, extensionPosition].filter(
        (position) => position >= 0,
      );
      if (positions.length > 0) {
        matchedExtensions.add(profile.extension);
        matchPosition.set(profile.extension, Math.min(...positions));
      }
    });

    return candidates
      .filter((profile) => matchedExtensions.has(profile.extension))
      .sort(
        (left, right) =>
          (matchPosition.get(left.extension) ?? Number.MAX_SAFE_INTEGER) -
          (matchPosition.get(right.extension) ?? Number.MAX_SAFE_INTEGER),
      );
  }

  function namesFromTypingElements(elements) {
    const names = new Map();
    for (const element of elements) {
      const text = [element.textContent, element.getAttribute("aria-label"), element.getAttribute("title"), element.getAttribute("data-status")]
        .find(value => containsTypingText(value));
      const match = String(text || "").trim().match(/^(.*?)\s+(?:(?:is|are)\s+typing|typing|(?:est|sont)\s+en\s+train\s+d['’][eé]crire|en\s+train\s+d['’][eé]crire|[eé]crivent|[eé]crit|r[eé]digent|r[eé]dige)\s*[.…]*$/iu);
      if (!match) continue;
      for (const name of match[1].split(/\s*,\s*|\s+(?:et|and)\s+/iu)) {
        const normalized = normalizedTypingText(name);
        if (!normalized || /^(?:quelqu'un|un participant|une personne|plusieurs|someone|somebody|a participant|\d+\s+(?:personnes|participants|people|users))/.test(normalized)) continue;
        names.set(normalized, name.trim());
      }
    }
    return [...names.values()];
  }

  function ensureTypingIndicator() {
    const messages = [...document.querySelectorAll(MESSAGE_SELECTOR)];
    const lastMessage = messages.at(-1) || null;
    const modern = document.documentElement.classList.contains("dec-slack-ui-v2");
    const main = modern ? document.querySelector("app-chat-messages .chat-massages-main") : null;
    const host = modern ? main?.parentElement : lastMessage?.parentElement;
    if (!host || (!modern && !lastMessage)) {
      document.getElementById(TYPING_INDICATOR_ID)?.remove();
      return null;
    }

    let indicator = document.getElementById(TYPING_INDICATOR_ID);
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = TYPING_INDICATOR_ID;
      indicator.hidden = true;
      indicator.setAttribute("role", "status");
      indicator.setAttribute("aria-live", "polite");

      const avatars = document.createElement("span");
      avatars.className = "dec-slack-typing-avatars";
      const dots = document.createElement("span");
      dots.className = "dec-slack-typing-dots";
      dots.setAttribute("aria-hidden", "true");
      for (let index = 0; index < 3; index += 1) {
        dots.appendChild(document.createElement("i"));
      }
      indicator.append(avatars, dots);
    }

    const previous = modern ? main : lastMessage;
    if (indicator.parentElement !== host || previous.nextSibling !== indicator) {
      host.insertBefore(indicator, previous.nextSibling);
    }
    return indicator;
  }

  function messageScrollContainer(message) {
    let element = message?.parentElement || null;
    while (element && element !== document.body) {
      const style = window.getComputedStyle(element);
      const canScrollVertically = /^(auto|scroll|overlay)$/.test(style.overflowY);
      if (canScrollVertically && element.scrollHeight > element.clientHeight + 1) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  function refreshNativeReadTracking(referenceMessage) {
    if (document.hidden || !referenceMessage) {
      return;
    }

    window.requestAnimationFrame(() => {
      const scroller = messageScrollContainer(referenceMessage);
      if (!scroller) {
        return;
      }

      /* 3CX marque le fil comme lu au passage du vrai dernier message dans la
         zone visible. On ne force ce recalcul que si l'utilisateur est deja
         au bas du fil, afin de ne jamais le deplacer pendant une relecture. */
      const distanceFromBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      if (distanceFromBottom > 80) {
        return;
      }

      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById(TYPING_INDICATOR_ID);
    if (!indicator) {
      return false;
    }

    if (document.documentElement.classList.contains("dec-slack-ui-v2")) {
      // La place réservée reste identique, visible ou non.
      if (!indicator.hidden) indicator.hidden = true;
      if (indicator.hasAttribute("aria-label")) indicator.removeAttribute("aria-label");
      return true;
    }

    const referenceMessage = indicator.previousElementSibling?.matches?.(MESSAGE_SELECTOR)
      ? indicator.previousElementSibling
      : [...document.querySelectorAll(MESSAGE_SELECTOR)].at(-1) || null;
    indicator.remove();
    refreshNativeReadTracking(referenceMessage);
    return true;
  }

  function enhanceTypingIndicator(profiles) {
    const elements = nativeTypingElements();
    const activeElements = new Set(elements);
    document.querySelectorAll(`.${HIDDEN_NATIVE_TYPING_CLASS}`).forEach((element) => {
      if (!activeElements.has(element)) {
        element.classList.remove(HIDDEN_NATIVE_TYPING_CLASS);
      }
    });

    const typingProfiles = profilesFromTypingElements(elements, profiles);
    const nativeNames = namesFromTypingElements(elements);
    const onlySelf = nativeNames.length > 0 && nativeNames.every(name => {
      const extension = extensionFromText(name);
      const cleanName = extension ? name.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim() : name;
      return (extension && extension === currentOwnProfile?.extension) ||
        normalizedTypingText(cleanName) === normalizedTypingText(currentOwnProfile?.name);
    });
    if (elements.length === 0 || onlySelf) {
      /* Même cache, ce nœud restait le dernier enfant de la liste. Certaines
         versions de 3CX en deduisaient que le dernier chat-message natif
         n'etait pas encore arrive en bas et conservaient le badge non lu. */
      removeTypingIndicator();
      return;
    }

    const indicator = ensureTypingIndicator();
    if (!indicator) {
      return;
    }

    elements.forEach((element) => {
      /* Dans la colonne des conversations, l'état natif reste utile pour voir
         l'activité même lorsque le fil n'est pas au premier plan. */
      if (!element.closest("chat-item")) {
        element.classList.add(HIDDEN_NATIVE_TYPING_CLASS);
      }
    });
    const profileKey = typingProfiles
      .map(
        (profile) => `${profile.extension}|${profile.name}|${profile.imageUrl}|${profile.initials}`,
      )
      .join(";");

    if (indicator.dataset.decTypingProfiles !== profileKey) {
      indicator.dataset.decTypingProfiles = profileKey;
      const avatarContainer = indicator.querySelector(".dec-slack-typing-avatars");
      const avatars = typingProfiles.map((profile) => {
        const avatar = document.createElement("span");
        avatar.className = "dec-slack-typing-avatar";
        avatar.setAttribute("aria-hidden", "true");
        applyProfileToAvatar(avatar, profile, profile.name, profile.extension);
        return avatar;
      });
      avatarContainer.replaceChildren(...avatars);
    }

    const names = typingProfiles.map((profile) => profile.name);
    const label = names.length === 0 ? "Un participant écrit…" :
      names.length === 1 ? `${names[0]} écrit…` : `${names.join(", ")} écrivent…`;
    indicator.setAttribute("aria-label", label);
    indicator.hidden = false;
  }

  function enhanceMessage(message, profiles) {
    const nameElement = message.querySelector(":scope > .message-name");
    const messageInner = message.querySelector(".message-inner");
    if (!messageInner) {
      return;
    }

    const ownMessage = messageInner.classList.contains("message-right");
    let visibleName = "";
    let extension = "";
    let avatarProfile = null;

    if (nameElement) {
      visibleName = String(nameElement.textContent || "").trim();
      extension = extensionFromText(visibleName);
      if (!extension) {
        return;
      }

      const knownProfile = profiles.get(extension);
      avatarProfile =
        ownMessage && currentOwnProfile?.imageUrl
          ? {
              ...knownProfile,
              ...currentOwnProfile,
              extension,
              name: currentOwnProfile.name || knownProfile?.name || "Moi",
            }
          : knownProfile;
    } else {
      const startsMessageGroup = messageInner.querySelector(":scope > .message-text.new-sender");
      if (!startsMessageGroup) {
        return;
      }

      avatarProfile = ownMessage ? currentOwnProfile : directConversationProfileFromHeader();
      if (!avatarProfile) {
        return;
      }
      visibleName = avatarProfile.name || (ownMessage ? "Moi" : "Interlocuteur");
      extension = avatarProfile.extension || (ownMessage ? "self" : "contact");
    }

    let avatar = messageInner.querySelector(`:scope > .${AVATAR_CLASS}`);
    if (!avatar) {
      avatar = createAvatarElement();
      messageInner.prepend(avatar);
    }

    applyProfileToAvatar(avatar, avatarProfile, visibleName.replace(/\s*\d+\s*$/, ""), extension);
  }

  function receiptHasReadMarker(receipt) {
    if (!receipt) {
      return false;
    }

    const labels = [receipt, ...receipt.querySelectorAll("[title], [aria-label]")].flatMap(
      (node) => ["title", "aria-label"].map((attribute) =>
        (node.getAttribute(attribute) || "").trim(),
      ),
    );
    if (labels.some((label) =>
      /^(?:d[ée]livr[ée]s?|delivered|envoy[ée]s?|sent|non lu|unread)(?:$|\s)/i.test(label),
    )) {
      return false;
    }
    if (labels.some((label) => /^(vu|lu|read|seen)(?:\s+(?:par|by)\b.*)?$/i.test(label))) {
      return true;
    }

    // Le même double coche sert à « Délivré » et « Lu » ; seul « Lu » est bleu.
    const icons = [
      ...(receipt.matches(NATIVE_DOUBLE_CHECK_SELECTOR) ? [receipt] : []),
      ...receipt.querySelectorAll(NATIVE_DOUBLE_CHECK_SELECTOR),
    ];
    return icons.some((icon) => icon.classList.contains("fillIconBlueVariant"));
  }

  function receiptLooksRead(receipt) {
    if (receipt.querySelector('[data-qa="delivery-status"], svg.lucide')) {
      return receiptHasReadMarker(receipt);
    }
    if (receiptHasReadMarker(receipt)) {
      return true;
    }

    const nodes = [receipt, ...receipt.querySelectorAll("*")];
    const metadata = nodes
      .flatMap((node) => [
        node.className?.baseVal || node.className,
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.getAttribute?.("data-qa"),
        node.getAttribute?.("data-status"),
        node.getAttribute?.("data-icon"),
        node.getAttribute?.("href"),
        node.getAttribute?.("xlink:href"),
      ])
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("en-US");

    /* 3CX a utilisé plusieurs bibliothèques d'icônes selon ses versions.
       On ne considère jamais « delivered » comme une preuve de lecture. */
    if (
      /(?:^|[\s_-])(?:read|seen|double[-_ ]?check|check[-_ ]?double|check[-_ ]?all|done[-_ ]?all)(?:$|[\s_-])/.test(
        metadata,
      )
    ) {
      return true;
    }

    const visibleText = String(receipt.textContent || "");
    if ((visibleText.match(/[✓✔☑]/g) || []).length >= 2) {
      return true;
    }

    const renderedStateCache = new WeakMap();
    const isRenderedInsideReceipt = (node) => {
      if (renderedStateCache.has(node)) {
        return renderedStateCache.get(node);
      }

      const visited = [];
      let rendered = true;
      for (
        let current = node;
        current && current !== receipt.parentElement;
        current = current.parentElement
      ) {
        if (renderedStateCache.has(current)) {
          rendered = renderedStateCache.get(current);
          break;
        }
        visited.push(current);
        const style = window.getComputedStyle(current);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number.parseFloat(style.opacity) === 0
        ) {
          rendered = false;
          break;
        }
      }
      visited.forEach((element) => renderedStateCache.set(element, rendered));
      return rendered;
    };
    const checkIcons = nodes.filter((node) => {
      const value = [
        node.className?.baseVal || node.className,
        node.getAttribute?.("data-icon"),
        node.getAttribute?.("href"),
        node.getAttribute?.("xlink:href"),
      ]
        .filter(Boolean)
        .join(" ");
      return /(?:check|done)/i.test(value) && isRenderedInsideReceipt(node);
    });
    const leafCheckIcons = checkIcons.filter(
      (node) => !checkIcons.some((other) => other !== node && node.contains(other)),
    );
    if (leafCheckIcons.length >= 2) {
      return true;
    }

    const visibleShapes = nodes.filter(
      (node) => node.matches?.("path, polyline, polygon, line") && isRenderedInsideReceipt(node),
    );
    if (visibleShapes.length >= 2) {
      return true;
    }

    const subpathCount = visibleShapes.reduce((total, node) => {
      const pathData = node.getAttribute?.("d") || "";
      return total + (pathData.match(/[Mm]/g) || []).length;
    }, 0);
    if (subpathCount >= 2) {
      return true;
    }

    let pseudoGraphicCount = 0;
    let pseudoCheckGlyphCount = 0;
    nodes.forEach((node) => {
      if (!isRenderedInsideReceipt(node)) {
        return;
      }
      ["::before", "::after"].forEach((pseudo) => {
        const style = window.getComputedStyle(node, pseudo);
        const content = String(style.content || "");
        const hasContent = !/^(?:none|normal|""|'')$/i.test(content);
        const hasImage = [style.backgroundImage, style.maskImage, style.webkitMaskImage].some(
          (value) => value && value !== "none",
        );
        if (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity) !== 0 &&
          (hasContent || hasImage)
        ) {
          pseudoGraphicCount += 1;
          pseudoCheckGlyphCount += (content.match(/[✓✔☑]/g) || []).length;
        }
      });
    });
    return pseudoGraphicCount >= 2 || pseudoCheckGlyphCount >= 2;
  }

  function receiptVisualSignature(receipt) {
    const clone = receipt.cloneNode(true);
    clone.querySelectorAll("[data-dec-created], [data-dec-read-profile]").forEach((element) => {
      delete element.dataset.decCreated;
      delete element.dataset.decReadProfile;
    });
    [clone, ...clone.querySelectorAll("*")].forEach((element) => {
      [...element.classList]
        .filter((className) => className.startsWith("dec-slack-"))
        .forEach((className) => element.classList.remove(className));
    });
    const renderedSignature = [receipt, ...receipt.querySelectorAll("*")]
      .flatMap((element) =>
        [null, "::before", "::after"].map((pseudo) => {
          const style = window.getComputedStyle(element, pseudo);
          return [
            pseudo || "self",
            style.content,
            style.backgroundImage,
            style.maskImage,
            style.webkitMaskImage,
            style.width,
            style.height,
            style.fontFamily,
          ].join(":");
        }),
      )
      .join(";");
    return [
      receipt.parentElement?.className,
      receipt.parentElement?.getAttribute("data-status"),
      clone.className?.baseVal || clone.className,
      clone.getAttribute("aria-label"),
      clone.getAttribute("title"),
      clone.getAttribute("data-status"),
      clone.innerHTML,
      renderedSignature,
    ]
      .filter(Boolean)
      .join("|");
  }

  function nativeClassSignature(element) {
    const className = element?.className?.baseVal || element?.className || "";
    return String(className)
      .split(/\s+/)
      .filter((name) => name && !name.startsWith("dec-slack-"))
      .sort()
      .join(".");
  }

  function nativeAttributeSignature(element) {
    if (!element?.attributes) {
      return "";
    }
    return [...element.attributes]
      .filter(
        (attribute) =>
          attribute.name !== "class" &&
          !attribute.name.startsWith("data-dec-") &&
          !attribute.name.startsWith("aria-dec-"),
      )
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .sort()
      .join(";");
  }

  function receiptAnalysisKey(receipt) {
    const parent = receipt.parentElement;
    const messageInner = receipt.closest(".message-inner");
    const message = receipt.closest(MESSAGE_SELECTOR);
    const nativeState = (element) =>
      [nativeClassSignature(element), nativeAttributeSignature(element)].join(":");

    /* innerHTML capture les changements d'icône natifs (simple/double check)
       sans forcer de recalcul de style. Les classes injectées par le thème sont
       retirées de la clé afin que nos propres mises à jour ne l'invalident pas. */
    return [
      nativeState(message),
      nativeState(messageInner),
      nativeState(parent),
      nativeState(receipt),
      receipt.innerHTML,
    ].join("|");
  }

  function analyzeReceipt(receipt) {
    const key = receiptAnalysisKey(receipt);
    const cached = receiptAnalysisCache.get(receipt);
    if (cached?.key === key) {
      return cached.analysis;
    }

    const presentationClasses = [
      HIDDEN_READ_RECEIPT_CLASS,
      HIDDEN_SENT_RECEIPT_CLASS,
      REDUNDANT_READ_RECEIPT_CLASS,
    ];
    const activePresentationClasses = presentationClasses.filter((className) =>
      receipt.classList.contains(className),
    );
    receipt.classList.remove(...presentationClasses);

    let analysis;
    try {
      analysis = {
        isRead: receiptLooksRead(receipt),
        signature: receiptVisualSignature(receipt),
      };
    } finally {
      if (activePresentationClasses.length > 0) {
        receipt.classList.add(...activePresentationClasses);
      }
    }
    receiptAnalysisCache.set(receipt, { key, analysis });
    return analysis;
  }

  function fullWidthReceiptHost(message) {
    if (message.querySelector(":scope > .message-name")) {
      return message;
    }
    return message.querySelector(".message-outter-wrapper") || message;
  }

  function ensureSentReceiptCopy(receipt, host) {
    let copy = Array.from(host.children).find(
      (child) =>
        child.classList.contains(SENT_RECEIPT_COPY_CLASS) && child.dataset.decCreated === "true",
    );
    if (!copy) {
      copy = receipt.cloneNode(true);
      copy.removeAttribute("id");
      copy.classList.remove(
        HIDDEN_READ_RECEIPT_CLASS,
        HIDDEN_SENT_RECEIPT_CLASS,
        REDUNDANT_READ_RECEIPT_CLASS,
        READ_AVATAR_CLASS,
      );
      copy.classList.add(SENT_RECEIPT_COPY_CLASS);
      copy.dataset.decCreated = "true";
      copy.setAttribute("aria-hidden", "true");
      host.appendChild(copy);
    }
    receipt.classList.add(HIDDEN_SENT_RECEIPT_CLASS);
  }

  function restoreNativeReceipts(messages) {
    messages.forEach((message) => {
      message.classList.remove(LATEST_READ_CLASS);
      message.querySelectorAll('delivered-check:not([data-dec-created="true"])').forEach((receipt) => {
        receipt.classList.remove(
          HIDDEN_READ_RECEIPT_CLASS,
          HIDDEN_SENT_RECEIPT_CLASS,
          REDUNDANT_READ_RECEIPT_CLASS,
          READ_AVATAR_CLASS,
          "dec-v2-receipt-hidden",
        );
        receipt.style.removeProperty("--dec-read-receipt-avatar");
        delete receipt.dataset.decReadProfile;
      });
      message.querySelectorAll(
        `.${READ_AVATAR_CLASS}[data-dec-created="true"], ` +
        '.dec-v2-read-avatar[data-dec-created="true"], ' +
        `.${SENT_RECEIPT_COPY_CLASS}[data-dec-created="true"]`,
      ).forEach((decoration) => decoration.remove());
    });
  }

  function enhanceReadReceipts() {
    const contact = directConversationProfileFromHeader();
    if (!contact) {
      restoreNativeReceipts([...document.querySelectorAll(MESSAGE_SELECTOR)]);
      return;
    }
    const nativeReceipts = [
      ...document.querySelectorAll(
        `${MESSAGE_SELECTOR} delivered-check:not([data-dec-created="true"])`,
      ),
    ];
    const records = nativeReceipts
      .map((receipt) => ({
        receipt,
        message: receipt.closest(MESSAGE_SELECTOR),
        ...analyzeReceipt(receipt),
      }))
      .filter((record) => record.message);
    const readRecords = records.filter((record) => record.isRead);
    const latestRead = readRecords.at(-1) || null;
    const latestMessage = latestRead?.message || null;
    const latestReceipt = latestRead?.receipt || null;
    const directProfile = latestRead ? contact : null;
    const portraitHost = latestMessage ? fullWidthReceiptHost(latestMessage) : null;
    const validSentHosts = new Set();

    document.querySelectorAll(`${MESSAGE_SELECTOR}.${LATEST_READ_CLASS}`).forEach((message) => {
      if (message !== latestMessage) {
        message.classList.remove(LATEST_READ_CLASS);
      }
    });
    latestMessage?.classList.add(LATEST_READ_CLASS);

    records.forEach(({ receipt, message, isRead }) => {
      const host = fullWidthReceiptHost(message);
      receipt.classList.remove(READ_AVATAR_CLASS);
      receipt.style.removeProperty("--dec-read-receipt-avatar");
      delete receipt.dataset.decReadProfile;

      if (isRead) {
        receipt.classList.remove(HIDDEN_SENT_RECEIPT_CLASS);
        receipt.classList.toggle(REDUNDANT_READ_RECEIPT_CLASS, receipt !== latestReceipt);
        Array.from(host.children)
          .filter((child) => child.classList.contains(SENT_RECEIPT_COPY_CLASS))
          .forEach((copy) => copy.remove());
      } else {
        receipt.classList.remove(HIDDEN_READ_RECEIPT_CLASS, REDUNDANT_READ_RECEIPT_CLASS);
        ensureSentReceiptCopy(receipt, host);
        validSentHosts.add(host);
      }
    });

    document
      .querySelectorAll(`.${SENT_RECEIPT_COPY_CLASS}[data-dec-created="true"]`)
      .forEach((copy) => {
        if (!validSentHosts.has(copy.parentElement)) {
          copy.remove();
        }
      });

    document.querySelectorAll(`delivered-check.${HIDDEN_READ_RECEIPT_CLASS}`).forEach((receipt) => {
      if (receipt !== latestReceipt || !directProfile) {
        receipt.classList.remove(HIDDEN_READ_RECEIPT_CLASS);
      }
    });

    document
      .querySelectorAll(`.${READ_AVATAR_CLASS}[data-dec-created="true"]`)
      .forEach((portrait) => {
        if (portrait.parentElement !== portraitHost || !directProfile) {
          portrait.remove();
        }
      });

    if (!latestReceipt || !portraitHost || !directProfile) {
      return;
    }

    const avatarCss = directProfile.imageUrl
      ? `url(${JSON.stringify(directProfile.imageUrl)})`
      : initialsAvatarCssUrl(directProfile);
    const profileKey = `${directProfile.extension}|${directProfile.name}|${avatarCss}`;
    latestReceipt.classList.add(HIDDEN_READ_RECEIPT_CLASS);

    let portrait = Array.from(portraitHost.children).find(
      (child) => child.classList.contains(READ_AVATAR_CLASS) && child.dataset.decCreated === "true",
    );
    if (!portrait) {
      portrait = document.createElement("span");
      portrait.className = READ_AVATAR_CLASS;
      portrait.dataset.decCreated = "true";
      portraitHost.appendChild(portrait);
    }

    if (portrait.dataset.decReadProfile !== profileKey) {
      portrait.dataset.decAvatarSource = directProfile.imageUrl || "";
      portrait.dataset.decReadProfile = profileKey;
      portrait.style.setProperty("--dec-read-receipt-avatar", avatarCss);
      portrait.setAttribute("role", "img");
      portrait.setAttribute("aria-label", `Lu par ${directProfile.name}`);
      portrait.title = `Lu par ${directProfile.name}`;
    }
  }

  function markMessage(message, isNearConversationEnd) {
    if (knownMessages.has(message)) {
      return;
    }

    knownMessages.add(message);

    // Ne pas animer les centaines de messages déjà affichés au chargement.
    if (
      initialMessageScan ||
      !isNearConversationEnd ||
      performance.now() < suppressAnimationsUntil
    ) {
      return;
    }

    const ownMessage = Boolean(
      message.querySelector(".message-inner.message-right, .message-align.sent-by-me"),
    );
    const enterClass = ownMessage ? ENTER_OWN_CLASS : ENTER_OTHER_CLASS;
    message.classList.add(enterClass);

    const clearAnimationClass = () => {
      message.classList.remove(ENTER_OTHER_CLASS, ENTER_OWN_CLASS);
    };

    message.addEventListener("animationend", clearAnimationClass, {
      once: true,
    });
    window.setTimeout(clearAnimationClass, 700);
  }

  // Favoris privés au compte connecté ; la galerie ne conserve que les métadonnées
  // des pièces jointes rencontrées pendant cette session, jamais les tickets 3CX.
  function libraryElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    element.dataset.decCreated = "true";
    return element;
  }

  function libraryButton(label, action, className = "") {
    const button = libraryElement("button", className, label);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  }

  function libraryChat() {
    const id = window.location.hash.match(/^#\/chat\/(\d+)(?:[/?]|$)/)?.[1];
    if ((id || "") !== libraryVisibleRoute) {
      libraryVisibleRoute = id || "";
      libraryMessages.clear();
      libraryNoteEditor = null;
      libraryRevision++;
    }
    if (!id) return null;
    const normalize = value => String(value || "").replace(/\s+/g," ").trim();
    const selected = document.querySelector("chat-item.selected");
    const selectedTitle = normalize(selected?.querySelector('[data-qa="header-name"], .header-name')?.textContent);
    const selectedOwner = selected && librarySelectedChatOwners.get(selected);
    // L'URL peut déjà désigner B alors que la sélection et l'en-tête désignent A.
    if (selectedOwner && selectedOwner.title === selectedTitle &&
        (selectedOwner.chatId !== id || selectedOwner.account !== libraryAccount)) return null;
    const header = [...document.querySelectorAll("chat-messages-header")].find(element => {
      const title = normalize(element.querySelector('[data-qa="chat-name"], #showParticipants')?.textContent);
      return title && (!selectedTitle || selectedTitle === title) && element.getClientRects().length;
    });
    if (!header) return null;
    const title = normalize(header.querySelector('[data-qa="chat-name"], #showParticipants')?.textContent);
    return {id,title,selected,selectedTitle,scope:header.closest("app-chat-messages, chat-component")};
  }

  function libraryFilePath(value) {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin ||
          !/^\/MyPhone\/downloadChatFile\/[^/]+$/i.test(url.pathname)) return "";
      return url.pathname;
    } catch { return ""; }
  }

  function libraryAttachments(message) {
    const attachments = new Map();
    message.querySelectorAll("app-chat-message-file-preview, app-chat-message-file, file-preview, preview-text-message")
      .forEach((preview) => {
        const image = preview.querySelector('img[src*="/MyPhone/downloadChatFile/"]');
        const link = preview.querySelector('a[href*="/MyPhone/downloadChatFile/"]');
        const path = libraryFilePath(image?.getAttribute("src") || link?.getAttribute("href"));
        const name = (preview.querySelector("a[download]")?.getAttribute("download") ||
          image?.getAttribute("title") || preview.querySelector('[data-qa="message-filename"]')?.textContent || link?.getAttribute("download") ||
          preview.querySelector("[title]")?.getAttribute("title") || preview.textContent || "Pièce jointe")
          .replace(/^(?:ouvrir|open|télécharger|download)\s+/i, "").trim().slice(0,500);
        if (!path && !preview.matches("app-chat-message-file")) return;
        const id = path ? path.replace(/\.preview$/i, "") : `document:${libraryHash(name)}`;
        attachments.set(id, { id, name, kind: image ? "image" : "document",
          previewPath: image ? `${id}.preview` : "" });
      });
    return [...attachments.values()];
  }

  function libraryLink(value, label = "") {
    if (typeof value !== "string") return null;
    let candidate = value.trim();
    if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
    else if (candidate.startsWith("//")) candidate = `${window.location.protocol}${candidate}`;
    if (!/^https?:\/\//i.test(candidate)) return null;
    try {
      const url = new URL(candidate);
      if (!["http:","https:"].includes(url.protocol) || !url.hostname || libraryFilePath(url.href)) return null;
      return {url:url.href,label:String(label || "").trim().slice(0,500),host:url.host};
    } catch { return null; }
  }

  function libraryExplorerLink(value, label = "") {
    if (typeof value !== "string") return null;
    let candidate = value.trim();
    if (/^file:/i.test(candidate)) {
      try {
        const url = new URL(candidate);
        if (url.protocol !== "file:" || !url.hostname || url.search || url.hash) return null;
        candidate = "\\\\" + url.hostname + decodeURIComponent(url.pathname).replace(/\//g,"\\");
      } catch { return null; }
    }
    const match = candidate.match(/^\\\\([^\\/\s<>:"|?*]+)\\(.+)$/u);
    if (!match || /^\.+$/.test(match[1]) || !match[2].split("\\")[0].trim() ||
        /[\x00-\x1f<>:"/|?*]/u.test(match[2])) return null;
    return {path:candidate,label:String(label || "").trim().slice(0,500),host:match[1]};
  }

  function libraryTextExplorerLinks(text) {
    const value = String(text || "");
    const starts = [...value.matchAll(/\\\\[^\\/\s<>:"|?*]+\\/gu)].slice(0,50);
    const links = new Map();
    for (let index=0;index<starts.length;index++) {
      const match = starts[index];
      if (match.index && /[\p{L}\p{N}_\\@]/u.test(value[match.index-1])) continue;
      let candidate = value.slice(match.index,starts[index+1]?.index);
      const followingUrl = candidate.search(/\s+(?:https?:\/\/|www\.)/i);
      if (followingUrl >= 0) candidate = candidate.slice(0,followingUrl);
      candidate = candidate.split(/[\r\n\x00-\x1f<>:"/|?*“”«»]/u)[0].trim();
      const opening = value[match.index-1];
      const closing = {"(":")","[":"]","{":"}","'":"'"}[opening];
      if (closing && candidate.endsWith(closing)) candidate = candidate.slice(0,-1).trimEnd();
      candidate = candidate.replace(/\.+$/u,"");
      const link = libraryExplorerLink(candidate);
      if (link && !links.has(link.path.toLocaleLowerCase("fr-FR"))) {
        links.set(link.path.toLocaleLowerCase("fr-FR"),link);
      }
    }
    return [...links.values()];
  }

  function libraryExplorerLinks(message) {
    const source = message.querySelector("app-chat-message-text, .message-text-internal");
    if (!source) return [];
    const links = new Map();
    source.querySelectorAll("a[href]").forEach(anchor => {
      if (anchor.closest('[data-dec-created="true"]') || links.size >= 50) return;
      const link = libraryExplorerLink(anchor.getAttribute("href"),anchor.textContent) ||
        libraryExplorerLink(anchor.textContent);
      if (link && !links.has(link.path.toLocaleLowerCase("fr-FR"))) links.set(link.path.toLocaleLowerCase("fr-FR"),link);
    });
    for (const link of libraryTextExplorerLinks(libraryLinkSourceText(source))) {
      if (!links.has(link.path.toLocaleLowerCase("fr-FR"))) links.set(link.path.toLocaleLowerCase("fr-FR"),link);
      if (links.size >= 50) break;
    }
    return [...links.values()];
  }

  function libraryLinkSourceText(source) {
    const copy = source.cloneNode(true);
    copy.querySelectorAll("br").forEach(element => element.replaceWith(document.createTextNode("\n")));
    copy.querySelectorAll("p,div,li,pre").forEach(element => {
      element.prepend(document.createTextNode("\n")); element.append(document.createTextNode("\n"));
    });
    copy.querySelectorAll('a, [data-dec-created="true"]').forEach(element => element.replaceWith(document.createTextNode(" ")));
    return copy.textContent || "";
  }

  function libraryTextLinks(text) {
    const links = new Map();
    const value = String(text || "");
    for (const match of value.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi)) {
      if (match.index && /[\p{L}\p{N}_@]/u.test(value[match.index-1])) continue;
      let candidate = match[0];
      let previous;
      do {
        previous = candidate;
        candidate = candidate.replace(/[.,;:!?…»”’]+$/u,"");
        for (const [open,close] of [["(",")"],["[","]"],["{","}"]]) {
          if (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) {
            candidate = candidate.slice(0,-1);
          }
        }
      } while (candidate !== previous);
      const link = libraryLink(candidate);
      if (link) links.set(link.url,link);
      if (links.size >= 50) break;
    }
    return [...links.values()];
  }

  function libraryLinks(message) {
    const source = message.querySelector("app-chat-message-text, .message-text-internal");
    if (!source) return [];
    const links = new Map();
    source.querySelectorAll("a[href]").forEach(anchor => {
      if (anchor.closest('[data-dec-created="true"]') || links.size >= 50) return;
      if (libraryExplorerLink(anchor.getAttribute("href")) || libraryExplorerLink(anchor.textContent)) return;
      const link = libraryLink(anchor.getAttribute("href"),anchor.textContent);
      if (link && !links.has(link.url)) links.set(link.url,link);
    });
    // Le texte des ancres est déjà traité : ne pas ajouter une URL différente
    // simplement parce que le libellé visible diffère de leur destination.
    let text = libraryLinkSourceText(source);
    for (const link of libraryTextExplorerLinks(text)) text = text.replaceAll(link.path," ");
    for (const link of libraryTextLinks(text)) {
      if (!links.has(link.url)) links.set(link.url,link);
      if (links.size >= 50) break;
    }
    return [...links.values()];
  }

  function libraryDay(value, now = new Date()) {
    const text = String(value || "").trim().toLocaleLowerCase("fr-FR");
    const explicit = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const iso = text.match(/^\d{4}-\d{2}-\d{2}$/);
    if (iso) return iso[0];
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (explicit) date.setFullYear(Number(explicit[3]), Number(explicit[2])-1, Number(explicit[1]));
    else if (/^(hier|yesterday)$/.test(text)) date.setDate(date.getDate()-1);
    else if (!/^(aujourd'hui|today)$/.test(text)) {
      const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
      const target = days.indexOf(text);
      if (target < 0) return text;
      date.setDate(date.getDate() - (date.getDay()-target+7)%7);
    }
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }

  function libraryHash(value) {
    let a = 2166136261, b = 5381;
    for (const c of value) {
      a = Math.imul(a ^ c.charCodeAt(0), 16777619);
      b = Math.imul(b, 33) ^ c.charCodeAt(0);
    }
    return `${(a>>>0).toString(36)}${(b>>>0).toString(36)}`;
  }

  function libraryMessageText(message) {
    const source = message.querySelector("app-chat-message-text, .message-text-internal");
    if (!source) return "";
    const copy = source.cloneNode(true);
    copy.querySelectorAll("img").forEach(img => img.replaceWith(document.createTextNode(img.alt || "")));
    copy.querySelectorAll("[data-dec-created='true']").forEach(el => el.remove());
    return (copy.textContent || "").trim();
  }

  function readLibraryFavorites() {
    try {
      const entries = JSON.parse(window.localStorage.getItem(`${STORAGE_FAVORITES}:${libraryAccount}`) || "[]");
      return Array.isArray(entries) ? entries.filter(entry => entry && typeof entry.id === "string" &&
        /^\d+$/.test(entry.chatId) && Array.isArray(entry.attachments)).slice(0,500).map(entry => ({
          ...entry,
          // Les liens de téléchargement authentifiés ne sont jamais relus du stockage.
          attachments: entry.attachments.map(file => ({ ...file, id: /^document:[a-z0-9]+$/.test(file.id) ? file.id : libraryFilePath(file.id),
            previewPath: libraryFilePath(file.previewPath) })).filter(file => file.id),
          links: Array.isArray(entry.links) ? entry.links.map(link => libraryLink(link?.url,link?.label)).filter(Boolean) : [],
          explorerLinks: Array.isArray(entry.explorerLinks) ? entry.explorerLinks.map(link =>
            libraryExplorerLink(link?.path,link?.label)).filter(Boolean) : [],
        })) : [];
    } catch { return []; }
  }

  function libraryNotice(text) {
    let notice = document.getElementById("dec-slack-library-notice");
    if (!notice) {
      notice = libraryElement("div", "", text);
      notice.id = "dec-slack-library-notice";
      notice.setAttribute("role", "status");
      document.body.appendChild(notice);
    }
    notice.textContent = text;
    window.clearTimeout(libraryNotice.timer);
    libraryNotice.timer = window.setTimeout(() => notice.remove(), 6000);
  }

  function saveLibraryFavorites(next) {
    if (!libraryAccount) return false;
    try {
      window.localStorage.setItem(`${STORAGE_FAVORITES}:${libraryAccount}`, JSON.stringify(next));
      libraryFavorites = next;
      libraryRevision++;
      return true;
    } catch {
      libraryNotice("Le navigateur n’a pas pu enregistrer les favoris. Vérifie l’espace de stockage disponible.");
      return false;
    }
  }

  function toggleLibraryFavorite(entry) {
    const found = libraryFavorites.some(item => item.id === entry.id);
    if (!found && libraryFavorites.length >= 500) {
      libraryNotice("La limite de 500 favoris est atteinte. Retire une épingle pour en ajouter une autre.");
      return;
    }
    const next = found ? libraryFavorites.filter(item => item.id !== entry.id) :
      [...libraryFavorites, { ...entry, note: "", savedAt: Date.now() }];
    if (saveLibraryFavorites(next)) {
      updateLibraryPins();
      renderMessageLibrary(true);
    }
  }

  function updateLibraryPins() {
    const ids = new Set(libraryFavorites.map(entry => entry.id));
    for (const [id, item] of libraryMessages) {
      const button = item.message.querySelector(":scope > .dec-library-pin");
      if (!button) continue;
      const pinned = ids.has(id);
      button.dataset.pinned = String(pinned);
      button.setAttribute("aria-pressed", String(pinned));
      button.title = pinned ? "Retirer des favoris" : "Épingler ce message";
      button.setAttribute("aria-label", button.title);
    }
  }

  function jumpToLibraryMessage(entry) {
    const chat = libraryChat();
    if (chat?.id !== entry.chatId) {
      libraryPendingJump = { id: entry.id, chatId: entry.chatId, until: Date.now()+10000 };
      window.location.hash = `/chat/${entry.chatId}`;
      return;
    }
    const message = libraryMessages.get(entry.id)?.message;
    if (!message?.isConnected) {
      libraryNotice("Ce message est plus haut dans l’historique. Remonte le fil pour le charger ; son favori reste disponible ici.");
      return;
    }
    if (modernScrollState) { modernScrollState.pinned = false; modernScrollState.settleUntil = 0; }
    message.scrollIntoView({ block: "center", behavior: "auto" });
    message.classList.add("dec-library-highlight");
    window.setTimeout(() => message.classList.remove("dec-library-highlight"),2000);
  }

  function closeMessageLibrary(restoreFocus = true) {
    const panel = document.getElementById(LIBRARY_PANEL_ID);
    if (panel) panel.hidden = true;
    libraryOpenTab = "";
    libraryNoteEditor = null;
    document.querySelectorAll("[data-dec-library-tab]").forEach(button => button.setAttribute("aria-expanded","false"));
    if (restoreFocus && libraryReturnFocus?.isConnected) libraryReturnFocus.focus();
  }

  function openMessageLibrary(tab, button) {
    ensureMessageLibrary();
    if (libraryOpenTab === tab && !document.getElementById(LIBRARY_PANEL_ID).hidden) {
      closeMessageLibrary(); return;
    }
    libraryReturnFocus = button || document.activeElement;
    libraryOpenTab = tab;
    libraryNoteEditor = null;
    librarySearch = "";
    const panel = document.getElementById(LIBRARY_PANEL_ID);
    panel.hidden = false;
    panel.querySelector("input").value = "";
    document.querySelectorAll("[data-dec-library-tab]").forEach(el =>
      el.setAttribute("aria-expanded",String(el.dataset.decLibraryTab === tab)));
    renderMessageLibrary(true);
    panel.querySelector("input").focus();
  }

  function finishLibraryNote(save) {
    const editor = libraryNoteEditor;
    if (!editor) return;
    if (save) {
      const next = libraryFavorites.map(entry => entry.id === editor.id ?
        {...entry,note:editor.value.trim()} : entry);
      if (!saveLibraryFavorites(next)) return;
    }
    libraryNoteEditor = null;
    renderMessageLibrary(true);
    const card = [...document.querySelectorAll(`#${LIBRARY_PANEL_ID} .dec-library-card`)]
      .find(element => element.dataset.entryId === editor.id);
    card?.querySelector(".dec-library-note-toggle")?.focus();
  }

  function libraryNoteControl(entry) {
    const host = libraryElement("div","dec-library-note");
    if (libraryNoteEditor?.id === entry.id) {
      const editor = libraryNoteEditor;
      const input = libraryElement("textarea");
      input.placeholder = "Note personnelle…";
      input.maxLength = 4000;
      input.setAttribute("aria-label",`Note personnelle — ${entry.author}, ${entry.date} ${entry.time}`);
      input.value = editor.value;
      input.addEventListener("input", () => { editor.value = input.value; });
      input.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); finishLibraryNote(false);
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault(); event.stopPropagation(); finishLibraryNote(true);
        }
      });
      const actions = libraryElement("div","dec-library-note-actions");
      actions.append(libraryButton("Enregistrer", () => finishLibraryNote(true)),
        libraryButton("Annuler", () => finishLibraryNote(false)));
      host.append(input,actions);
    } else {
      const hasNote = Boolean(entry.note?.trim());
      const button = libraryButton("", () => {
        libraryNoteEditor = {id:entry.id,value:entry.note || ""};
        renderMessageLibrary(true);
        document.querySelector(`#${LIBRARY_PANEL_ID} textarea`)?.focus();
      }, `dec-library-note-toggle ${hasNote ? "dec-library-note-text" : "dec-library-add-note"}`);
      button.title = hasNote ? "Modifier la note personnelle" : "Ajouter une note personnelle";
      button.setAttribute("aria-label",button.title);
      if (hasNote) button.textContent = entry.note;
      else {
        button.innerHTML = NOTE_ICON;
        button.appendChild(libraryElement("span","","note"));
      }
      host.appendChild(button);
    }
    return host;
  }

  function ensureMessageLibrary() {
    if (!document.getElementById(LIBRARY_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = LIBRARY_STYLE_ID;
      style.textContent = `
        #${LIBRARY_PANEL_ID} { position:fixed; z-index:2147483000; top:70px; right:16px; bottom:20px;
          display:flex; flex-direction:column; width:min(410px,calc(100vw - 32px)); box-sizing:border-box;
          background:var(--slack-panel,#242429); color:var(--slack-ink,#f8f8fa); border:1px solid var(--slack-line,#56525b);
          border-radius:12px; box-shadow:0 10px 36px #0005; overflow:hidden; font:14px/1.45 "Segoe UI",sans-serif; }
        #${LIBRARY_PANEL_ID}[hidden] { display:none!important; }
        #${LIBRARY_PANEL_ID} * { box-sizing:border-box; }
        #${LIBRARY_PANEL_ID} header { display:flex; align-items:center; gap:8px; padding:14px 16px 8px; }
        #${LIBRARY_PANEL_ID} h2 { flex:1; margin:0; font-size:17px; color:inherit; }
        #${LIBRARY_PANEL_ID} button { cursor:pointer; color:inherit; background:transparent; border:1px solid var(--slack-line,#56525b); border-radius:7px; padding:5px 9px; font:inherit; }
        #${LIBRARY_PANEL_ID} button:hover { background:var(--slack-hover,#ffffff12); }
        #${LIBRARY_PANEL_ID} button:focus-visible, #${LIBRARY_PANEL_ID} input:focus-visible,
        #${LIBRARY_PANEL_ID} textarea:focus-visible { outline:2px solid var(--slack-blue,#79b8ff); outline-offset:2px; }
        #${LIBRARY_PANEL_ID} .dec-library-tools { display:flex; gap:6px; flex-wrap:wrap; padding:8px 16px; }
        #${LIBRARY_PANEL_ID} input, #${LIBRARY_PANEL_ID} textarea { width:100%; color:inherit; background:var(--slack-hover,#ffffff0a); border:1px solid var(--slack-line,#56525b); border-radius:7px; padding:8px; font:inherit; }
        #${LIBRARY_PANEL_ID} .dec-library-tools button[aria-pressed='true'] { color:var(--slack-blue,#79b8ff); border-color:currentColor; }
        #${LIBRARY_PANEL_ID} .dec-library-explorer-options { display:flex; justify-content:flex-start; width:100%; }
        #${LIBRARY_PANEL_ID} .dec-library-explorer-toggle { display:inline-flex; align-items:center; gap:7px; padding:3px 0; border:0; background:transparent; color:var(--slack-muted,#b8b5bc); font-size:12px; }
        #${LIBRARY_PANEL_ID} .dec-library-switch-track { position:relative; display:block; width:28px; height:16px; border:1px solid currentColor; border-radius:99px; }
        #${LIBRARY_PANEL_ID} .dec-library-switch-track::after { content:""; position:absolute; top:2px; left:2px; width:10px; height:10px; border-radius:50%; background:currentColor; }
        #${LIBRARY_PANEL_ID} .dec-library-explorer-toggle[aria-checked='true'] { color:var(--slack-blue,#79b8ff); }
        #${LIBRARY_PANEL_ID} .dec-library-explorer-toggle[aria-checked='true'] .dec-library-switch-track::after { transform:translateX(12px); }
        #${LIBRARY_PANEL_ID} .dec-library-summary { margin:0; padding:2px 16px 10px; color:var(--slack-muted,#b8b5bc); font-size:12px; }
        #${LIBRARY_PANEL_ID} .dec-library-list { overflow:auto; flex:1; min-height:0; padding:0 12px 12px; overscroll-behavior:contain; }
        #${LIBRARY_PANEL_ID} .dec-library-card { padding:12px; margin:8px 0; border:1px solid var(--slack-line,#56525b); border-radius:9px; overflow-wrap:anywhere; }
        #${LIBRARY_PANEL_ID} .dec-library-card-own { background:var(--dec-accent-own,rgba(74,21,75,.12)); }
        #${LIBRARY_PANEL_ID} .dec-library-card-own:hover { background:var(--dec-accent-own-hover,rgba(74,21,75,.18)); }
        #${LIBRARY_PANEL_ID} .dec-library-meta { display:flex; align-items:flex-start; gap:8px; font-size:12px; color:var(--slack-muted,#b8b5bc); margin-bottom:7px; }
        #${LIBRARY_PANEL_ID} .dec-library-meta-label { flex:1; min-width:0; padding-top:4px; }
        #${LIBRARY_PANEL_ID} .dec-library-card-pin { display:grid; place-items:center; flex:0 0 26px; width:26px; height:26px; padding:4px; border:0; background:transparent; }
        #${LIBRARY_PANEL_ID} .dec-library-card-pin[aria-pressed='true'] { color:var(--slack-blue,#79b8ff); }
        #${LIBRARY_PANEL_ID} .dec-library-text { display:block; width:100%; text-align:left; color:inherit; border:0; padding:0; margin:6px 0 10px; white-space:pre-wrap; max-height:180px; overflow:auto; }
        #${LIBRARY_PANEL_ID} .dec-library-card img { display:block; max-width:100%; max-height:180px; object-fit:contain; margin:auto; background:transparent!important; border-radius:5px; }
        #${LIBRARY_PANEL_ID} .dec-library-file { display:block; width:100%; text-align:left; margin:6px 0; }
        #${LIBRARY_PANEL_ID} .dec-library-file span { display:block; margin-top:5px; }
        #${LIBRARY_PANEL_ID} .dec-library-link span { margin-top:0; color:var(--slack-blue,#79b8ff); font-weight:600; }
        #${LIBRARY_PANEL_ID} .dec-library-link small { display:block; margin-top:4px; color:var(--slack-muted,#b8b5bc); font-size:12px; overflow-wrap:anywhere; }
        #${LIBRARY_PANEL_ID} .dec-library-card textarea { min-height:52px; max-height:180px; resize:vertical; margin:6px 0; font-size:13px; }
        #${LIBRARY_PANEL_ID} .dec-library-note { margin-top:6px; }
        #${LIBRARY_PANEL_ID} .dec-library-note-toggle { border:0; background:transparent; padding:3px 0; font-size:12px; }
        #${LIBRARY_PANEL_ID} .dec-library-add-note { display:inline-flex; align-items:center; gap:5px; color:var(--slack-muted,#b8b5bc); }
        #${LIBRARY_PANEL_ID} .dec-library-note-text { display:block; max-width:calc(100% - 12px); margin-left:12px; text-align:left; white-space:pre-wrap; overflow-wrap:anywhere; color:var(--slack-blue,#79b8ff); opacity:.85; }
        #${LIBRARY_PANEL_ID} .dec-library-note-actions { display:flex; gap:7px; margin-top:4px; }
        #${LIBRARY_PANEL_ID} .dec-library-note-actions button { font-size:12px; padding:3px 7px; }
        #${LIBRARY_PANEL_ID} .dec-library-empty { padding:24px 10px; color:var(--slack-muted,#b8b5bc); }
        chat-message:has(> .dec-library-pin) { position:relative!important; }
        chat-message > .dec-library-pin { position:absolute!important; top:3px; right:44px; z-index:8;
          display:grid!important; place-items:center; width:28px; height:28px; padding:4px; color:var(--slack-muted,#aaa);
          background:var(--slack-panel,#242429); border:1px solid var(--slack-line,#56525b); border-radius:7px; cursor:pointer; opacity:0; }
        chat-message:hover > .dec-library-pin, chat-message:focus-within > .dec-library-pin,
        chat-message > .dec-library-pin[data-pinned='true'] { opacity:1; }
        chat-message > .dec-library-pin[data-pinned='true'] { color:var(--slack-blue,#79b8ff); }
        chat-message > .dec-library-pin[data-pinned='true'] svg { fill:currentColor; fill-opacity:.25; }
        html.dec-slack-layout-split chat-message.dec-library-own > .dec-library-pin { right:auto; left:8px; }
        chat-message.dec-library-highlight { outline:2px solid var(--slack-blue,#79b8ff)!important; outline-offset:-2px; }
        #dec-slack-library-notice { position:fixed; z-index:2147483500; bottom:20px; left:50%; transform:translateX(-50%);
          width:max-content; max-width:calc(100vw - 32px); padding:12px 18px; color:var(--slack-ink,#fff);
          background:var(--slack-panel,#242429); border:1px solid var(--slack-line,#777); border-radius:9px; box-shadow:0 6px 24px #0005; font:14px/1.4 "Segoe UI",sans-serif; }
        chat-message app-chat-message-file-preview, chat-message app-chat-message-file-preview img { background:transparent!important; }
        @media(hover:none) { chat-message > .dec-library-pin { opacity:1; } }
        @media(max-width:600px) { #${LIBRARY_PANEL_ID} { top:60px; right:8px; bottom:8px; width:calc(100vw - 16px); } }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
    const controls = document.getElementById(CONTROLS_CONTENT_ID);
    if (controls) for (const [tab,label,icon] of [["favorites","Favoris",PIN_ICON],["gallery","Galerie",GALLERY_ICON]]) {
      if (controls.querySelector(`[data-dec-library-tab='${tab}']`)) continue;
      const button = libraryButton("", () => openMessageLibrary(tab,button), "dec-slack-control-button");
      button.innerHTML = icon;
      button.dataset.decLibraryTab = tab;
      button.title = label;
      button.setAttribute("aria-label",label);
      button.setAttribute("aria-controls",LIBRARY_PANEL_ID);
      button.setAttribute("aria-expanded","false");
      controls.appendChild(button);
    }
    if (!document.getElementById(LIBRARY_PANEL_ID)) {
      const panel = libraryElement("aside");
      panel.id = LIBRARY_PANEL_ID;
      panel.hidden = true;
      panel.setAttribute("aria-label","Favoris et galerie");
      const header = libraryElement("header");
      const title = libraryElement("h2");
      title.id = "dec-library-title";
      panel.setAttribute("aria-labelledby",title.id);
      const close = libraryButton("×", () => closeMessageLibrary());
      close.setAttribute("aria-label","Fermer le panneau");
      header.append(title,close);
      const tools = libraryElement("div","dec-library-tools");
      const search = libraryElement("input");
      search.type = "search";
      search.placeholder = "Rechercher dans les favoris…";
      search.setAttribute("aria-label","Rechercher dans le panneau");
      search.addEventListener("input", () => { librarySearch = search.value; renderMessageLibrary(true); });
      tools.appendChild(search);
      const filters = libraryElement("div","dec-library-tools dec-library-filters");
      const summary = libraryElement("p","dec-library-summary");
      const list = libraryElement("div","dec-library-list");
      panel.append(header,tools,filters,summary,list);
      document.body.appendChild(panel);
    }
    if (!libraryInitialized) {
      libraryInitialized = true;
      document.addEventListener("keydown",event => {
        if (event.key === "Escape" && libraryOpenTab && !document.querySelector("modal-container.show")) {
          event.preventDefault();
          if (libraryNoteEditor) finishLibraryNote(false);
          else closeMessageLibrary();
        }
      });
      window.addEventListener("storage",event => {
        if (event.key === `${STORAGE_FAVORITES}:${libraryAccount}`) {
          libraryFavorites = readLibraryFavorites(); libraryRevision++;
          updateLibraryPins(); renderMessageLibrary(true);
        }
      });
    }
  }

  function renderMessageLibrary(force = false) {
    const panel = document.getElementById(LIBRARY_PANEL_ID);
    if (!panel || panel.hidden || !libraryOpenTab) return;
    if (libraryNoteEditor && !libraryFavorites.some(entry => entry.id === libraryNoteEditor.id)) libraryNoteEditor = null;
    if (!force && libraryNoteEditor) return;
    const chat = libraryChat();
    const waitingForChat = !chat && /^#\/chat\/\d+(?:[/?]|$)/.test(window.location.hash);
    const signature = JSON.stringify([libraryOpenTab,chat?.id,libraryRevision,librarySearch,libraryFilter,libraryAllChats,libraryShowExplorerLinks,libraryNoteEditor?.id]);
    if (!force && panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    const favorites = libraryOpenTab === "favorites";
    panel.querySelector("h2").textContent = favorites ? "Favoris" : "Galerie";
    panel.querySelector("input").placeholder = favorites ? "Rechercher dans les favoris…" : "Nom, lien ou auteur…";
    const filters = panel.querySelector(".dec-library-filters");
    filters.replaceChildren();
    if (favorites) {
      for (const [all,label] of [[false,"Cette conversation"],[true,"Toutes les conversations"]]) {
        const button = libraryButton(label, () => { libraryAllChats = all; renderMessageLibrary(true); });
        button.setAttribute("aria-pressed",String(libraryAllChats === all)); filters.appendChild(button);
      }
    } else {
      for (const [kind,label] of [["all","Tout"],["image","Images"],["document","Documents"],["link","Liens"]]) {
        const button = libraryButton(label, () => { libraryFilter = kind; renderMessageLibrary(true); });
        button.setAttribute("aria-pressed",String(libraryFilter === kind)); filters.appendChild(button);
      }
      if (libraryFilter === "all" || libraryFilter === "link") {
        const options = libraryElement("div","dec-library-explorer-options");
        const toggle = libraryButton("", () => {
          libraryShowExplorerLinks = !libraryShowExplorerLinks;
          writeSetting(STORAGE_GALLERY_EXPLORER_LINKS,String(libraryShowExplorerLinks));
          renderMessageLibrary(true);
        }, "dec-library-explorer-toggle");
        toggle.setAttribute("role","switch");
        toggle.setAttribute("aria-label","Liens Explorateur");
        toggle.setAttribute("aria-checked",String(libraryShowExplorerLinks));
        toggle.title = "Afficher aussi les chemins réseau Windows";
        const track = libraryElement("span","dec-library-switch-track");
        track.setAttribute("aria-hidden","true");
        toggle.append(track,libraryElement("span","","Liens Explorateur"));
        options.appendChild(toggle); filters.appendChild(options);
      }
    }
    const query = librarySearch.trim().toLocaleLowerCase("fr-FR");
    const list = panel.querySelector(".dec-library-list");
    const scrollTop = list.scrollTop;
    list.replaceChildren();
    let entries = favorites ? libraryFavorites.filter(entry => libraryAllChats || entry.chatId === chat?.id) :
      [...(libraryConversations.get(chat?.id)?.values() || [])].filter(entry => entry.chatId === chat?.id &&
        (entry.attachments.length || entry.links?.length || entry.explorerLinks?.length));
    entries = entries.filter(entry => !query || [entry.text,entry.author,entry.chatTitle,entry.note,
      ...entry.attachments.map(file => file.name), ...(entry.links || []).flatMap(link => [link.url,link.label,link.host]),
      ...(entry.explorerLinks || []).flatMap(link => [link.path,link.label,link.host])]
      .join(" ").toLocaleLowerCase("fr-FR").includes(query));
    entries.sort((a,b) => favorites ? b.savedAt-a.savedAt : `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    let count = 0;
    for (const entry of entries) {
      const files = favorites ? entry.attachments : entry.attachments.filter(file => libraryFilter === "all" || file.kind === libraryFilter);
      const links = favorites || libraryFilter === "all" || libraryFilter === "link" ? entry.links || [] : [];
      const explorerLinks = favorites || (libraryShowExplorerLinks && (libraryFilter === "all" || libraryFilter === "link")) ?
        entry.explorerLinks || [] : [];
      if (!favorites && !files.length && !links.length && !explorerLinks.length) continue;
      count += favorites ? 1 : files.length+links.length+explorerLinks.length;
      const card = libraryElement("article","dec-library-card");
      card.dataset.entryId = entry.id;
      card.classList.toggle("dec-library-card-own",Boolean(libraryAccount && String(entry.authorKey || "") === libraryAccount));
      const meta = libraryElement("div","dec-library-meta");
      meta.appendChild(libraryElement("span","dec-library-meta-label",`${entry.author} · ${entry.date} ${entry.time}${favorites && libraryAllChats ? ` · ${entry.chatTitle}` : ""}`));
      const pinned = libraryFavorites.some(item => item.id === entry.id);
      const pin = libraryButton("", () => toggleLibraryFavorite(entry), "dec-library-card-pin");
      pin.innerHTML = pinned ? UNPIN_ICON : PIN_ICON;
      pin.title = pinned ? "Retirer l’épingle" : "Épingler";
      pin.setAttribute("aria-label",pin.title);
      pin.setAttribute("aria-pressed",String(pinned));
      meta.appendChild(pin);
      card.appendChild(meta);
      const onlyLinkText = links.length === 1 && (libraryLink(entry.text)?.url === links[0].url || entry.text === links[0].label);
      const onlyExplorerText = explorerLinks.length === 1 &&
        (libraryExplorerLink(entry.text)?.path === explorerLinks[0].path || entry.text === explorerLinks[0].label);
      if (entry.text && !onlyLinkText && !onlyExplorerText) {
        const message = libraryButton(entry.text, () => jumpToLibraryMessage(entry), "dec-library-text");
        message.title = "Retrouver ce message dans la conversation";
        card.appendChild(message);
      }
      for (const file of files) {
        const button = libraryButton("", () => jumpToLibraryMessage(entry), "dec-library-file");
        button.setAttribute("aria-label",`Retrouver ${file.name} dans la conversation`);
        if (file.kind === "image" && file.previewPath) {
          const image = libraryElement("img");
          image.alt = ""; image.loading = "lazy"; image.decoding = "async";
          const native = nativeOriginalImages.get(file.id);
          image.src = native?.expires > Date.now() ? native.url : file.previewPath;
          image.addEventListener("error", () => {
            if (image.getAttribute("src") !== file.previewPath) image.src = file.previewPath;
            else image.hidden = true;
          });
          if (/\.(?:png|webp|gif)$/i.test(file.name) && !(native?.expires > Date.now())) {
            image.dataset.decOriginalPreviewUrl = new URL(file.id,window.location.origin).href;
            image.dataset.decOriginalPreviewState = "pending";
            const previewObserver = ensureOriginalPreviewObserver();
            if (previewObserver) previewObserver.observe(image);
            else window.setTimeout(() => loadOriginalImagePreview(image),0);
          }
          button.appendChild(image);
        }
        button.appendChild(libraryElement("span","",file.name)); card.appendChild(button);
      }
      for (const link of links) {
        const button = libraryButton("", () => jumpToLibraryMessage(entry), "dec-library-file dec-library-link");
        button.setAttribute("aria-label",`Retrouver le lien ${link.url} dans la conversation`);
        button.title = "Retrouver le message contenant ce lien";
        const label = link.label && libraryLink(link.label)?.url !== link.url ? link.label : link.host;
        button.append(libraryElement("span","",label),libraryElement("small","",link.url));
        card.appendChild(button);
      }
      for (const link of explorerLinks) {
        const button = libraryButton("", () => jumpToLibraryMessage(entry), "dec-library-file dec-library-link dec-library-explorer-link");
        button.setAttribute("aria-label","Retrouver le chemin " + link.path + " dans la conversation");
        button.title = "Retrouver le message contenant ce chemin réseau";
        const label = link.label && libraryExplorerLink(link.label)?.path !== link.path ? link.label : "Explorateur · " + link.host;
        button.append(libraryElement("span","",label),libraryElement("small","",link.path));
        card.appendChild(button);
      }
      if (favorites) card.appendChild(libraryNoteControl(entry));
      list.appendChild(card);
    }
    if (!count) list.appendChild(libraryElement("p","dec-library-empty",!favorites && waitingForChat ? "Chargement du contenu…" : query ? "Aucun résultat." :
      favorites ? "Épingle un message à l’aide du bouton qui apparaît à son survol." : "Aucun élément chargé pour ce filtre."));
    const kindLabel = {image:"image",document:"document",link:"lien"}[libraryFilter] || "élément";
    panel.querySelector(".dec-library-summary").textContent = !favorites && waitingForChat ? "Chargement de la conversation…" : favorites ?
      `${count} favori${count>1?"s":""} · Enregistrés dans ce navigateur pour ton compte.` :
      `${count} ${kindLabel}${count>1?"s":""} · ${chat?.title || "Ouvre une conversation"}. Remonte le fil pour compléter la galerie.`;
    list.scrollTop = scrollTop;
  }

  function enhanceMessageLibrary(records) {
    const account = currentOwnProfile?.extension || document.querySelector('app-header app-avatar img[alt]')?.getAttribute("alt") || "";
    if (account !== libraryAccount) {
      libraryAccount = account;
      libraryFavorites = account ? readLibraryFavorites() : [];
      libraryConversations.clear(); libraryMessages.clear(); nativeOriginalImages.clear();
      originalDownloadToken = null; originalDownloadTokenPromise = null; originalAuthRetryAfter = 0; originalAuthEpoch++;
      libraryPendingJump = null; libraryRevision++; closeMessageLibrary(false);
    }
    ensureMessageLibrary();
    const chat = libraryChat();
    libraryMessages.clear();
    if (!chat || !account) { renderMessageLibrary(); return; }
    let gallery = libraryConversations.get(chat.id);
    if (!gallery) { gallery = new Map(); libraryConversations.set(chat.id,gallery); }
    const duplicates = new Map();
    for (const record of records) {
      const {message,own,profile,time} = record;
      if (chat.scope && !chat.scope.contains(message)) continue;
      if (chat.scope?.matches("app-chat-messages") && message.closest("app-chat-messages") !== chat.scope) continue;
      const attachments = libraryAttachments(message);
      const links = libraryLinks(message);
      const explorerLinks = libraryExplorerLinks(message);
      const text = libraryMessageText(message);
      if (!text && !attachments.length && !links.length && !explorerLinks.length) continue;
      const day = time?.getAttribute("title") || message.querySelector(".new-day-title")?.textContent || "";
      const date = libraryDay(day);
      const clock = time?.textContent.trim() || "";
      // Ne pas utiliser le profil reconstruit depuis l'en-tête : il peut déjà
      // correspondre à B tandis que ces nœuds Angular contiennent encore A.
      const nativeSender = message.querySelector(".sender-name, .message-name")?.textContent.trim() || "";
      const nativeFingerprint = JSON.stringify([own,nativeSender,date,clock,text,attachments.map(file=>file.id),
        links.map(link=>link.url),explorerLinks.map(link=>link.path)]);
      const owner = libraryMessageOwners.get(message);
      if (owner && (owner.chatId !== chat.id || owner.account !== account) &&
          owner.fingerprint === nativeFingerprint) {
        message.querySelector(":scope > .dec-library-pin")?.remove();
        continue;
      }
      // Un composant recyclé n'est réattribué que lorsque son contenu natif
      // change. Les messages déjà indexés restent rattachés à leur discussion.
      libraryMessageOwners.set(message,{chatId:chat.id,account,fingerprint:nativeFingerprint});
      const author = own ? "Moi" : profile?.name || message.querySelector(".sender-name,.message-name")?.textContent.trim() || "Participant";
      const authorKey = own ? account : profile?.extension || author;
      const fingerprint = JSON.stringify([authorKey,date,clock,text,attachments.map(file=>file.id)]);
      const ordinal = duplicates.get(fingerprint) || 0;
      duplicates.set(fingerprint,ordinal+1);
      const id = `${chat.id}:${libraryHash(fingerprint)}:${ordinal}`;
      const entry = {id,chatId:chat.id,chatTitle:chat.title,author,authorKey,date,time:clock,text,attachments,links,explorerLinks};
      libraryMessages.set(id,{message,entry});
      if ((attachments.length || links.length || explorerLinks.length) && JSON.stringify(gallery.get(id)) !== JSON.stringify(entry)) {
        gallery.set(id,entry); libraryRevision++;
      }
      // Une limite de métadonnées borne les longues sessions sans précharger les fichiers.
      if (gallery.size > 2000) gallery.delete(gallery.keys().next().value);
      message.classList.toggle("dec-library-own",own);
      let pin = message.querySelector(":scope > .dec-library-pin");
      if (!pin) {
        pin = libraryButton("", () => {
          const item = libraryMessages.get(pin.dataset.messageId);
          if (item) toggleLibraryFavorite(item.entry);
        }, "dec-library-pin");
        pin.innerHTML = PIN_ICON;
        message.appendChild(pin);
      }
      pin.dataset.messageId = id;
    }
    if (chat.selected && chat.selectedTitle) {
      librarySelectedChatOwners.set(chat.selected,{chatId:chat.id,account,title:chat.selectedTitle});
    }
    updateLibraryPins();
    if (libraryPendingJump?.chatId === chat.id && records.length) {
      const target = libraryMessages.get(libraryPendingJump.id);
      if (target || Date.now() > libraryPendingJump.until) {
        const pending = libraryPendingJump; libraryPendingJump = null;
        window.requestAnimationFrame(() => {
          if (libraryChat()?.id === pending.chatId) jumpToLibraryMessage({id:pending.id,chatId:pending.chatId});
        });
      }
    }
    renderMessageLibrary();
  }

  function currentChatSessionId() {
    const link = document.querySelector(
      'a[href*="/MyPhone/downloadChatFile/"][href*="sessionId="]',
    );

    if (link?.href) {
      try {
        const sessionId = new URL(link.href).searchParams.get("sessionId");
        if (sessionId) {
          cachedChatSessionId = sessionId;
          try {
            window.sessionStorage.setItem(STORAGE_CHAT_SESSION_ID, sessionId);
          } catch {
            // La valeur reste disponible en mémoire jusqu'au prochain reload.
          }
        }
      } catch {
        // Une URL de pièce jointe malformée ne bloque pas les autres aperçus.
      }
    }

    return cachedChatSessionId;
  }

  function originalUrlForPreview(image, sessionId) {
    const filename =
      image.closest("a[download]")?.getAttribute("download") ||
      (image.closest("app-chat-message-file-preview") ? image.getAttribute("title") : "") ||
      "";
    if (!/\.(?:png|webp|gif)$/i.test(filename)) {
      return "";
    }

    const previewUrl = image.currentSrc || image.src || "";
    if (
      !previewUrl.includes("/MyPhone/downloadChatFile/") ||
      !/\.preview(?:[?#].*)?$/.test(previewUrl)
    ) {
      return "";
    }

    try {
      const originalUrl = new URL(previewUrl.replace(/\.preview(?:[?#].*)?$/, ""));
      if (originalUrl.origin !== window.location.origin) {
        return "";
      }
      if (sessionId) originalUrl.searchParams.set("sessionId", sessionId);
      return originalUrl.href;
    } catch {
      return "";
    }
  }

  async function originalDownloadRequest(path, options) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(),10000);
    try {
      return await fetch(new URL(path,window.location.origin).href, {
        ...options, credentials:"same-origin", redirect:"error", cache:"no-store", signal:controller.signal,
      });
    } finally { window.clearTimeout(timer); }
  }

  async function originalDownloadAccessToken() {
    if (Date.now() < originalAuthRetryAfter) throw new Error("Réessai différé");
    if (originalDownloadToken?.expires > Date.now()) return originalDownloadToken.value;
    if (originalDownloadTokenPromise) return originalDownloadTokenPromise;
    const epoch = originalAuthEpoch;
    const pending = (async () => {
      // Même renouvellement que le client 3CX : le cookie de session reste dans
      // le navigateur. Aucun mot de passe, jeton ou ticket n'est stocké ni journalisé.
      const response = await originalDownloadRequest("/connect/token", {
        method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},
        body:new URLSearchParams({grant_type:"refresh_token",client_id:"Webclient"}).toString(),
      });
      if (!response.ok) throw new Error("Session 3CX indisponible");
      const token = await response.json();
      if (epoch !== originalAuthEpoch || typeof token.access_token !== "string" || !token.access_token) {
        throw new Error("Session 3CX modifiée");
      }
      originalDownloadToken = { value:token.access_token,
        expires:Date.now()+Math.max(0,Math.min(60,Number(token.expires_in)||60)-5)*1000 };
      return token.access_token;
    })();
    originalDownloadTokenPromise = pending;
    try { return await pending; }
    catch (error) { if (epoch === originalAuthEpoch) originalAuthRetryAfter = Date.now()+60000; throw error; }
    finally { if (originalDownloadTokenPromise === pending) originalDownloadTokenPromise = null; }
  }

  async function originalDownloadTicket() {
    const epoch = originalAuthEpoch;
    const token = await originalDownloadAccessToken();
    const response = await originalDownloadRequest("/xapi/v1/MyUser/Pbx.IssueDownloadTicket", {
      method:"POST", headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        originalDownloadToken = null; originalAuthRetryAfter = Date.now()+60000;
      }
      throw new Error("Ticket de téléchargement indisponible");
    }
    const result = await response.json();
    if (epoch !== originalAuthEpoch || typeof result.Ticket !== "string" || !result.Ticket) {
      throw new Error("Ticket de téléchargement invalide");
    }
    return result.Ticket;
  }

  function probeOriginalImage(url) {
    return new Promise((resolve,reject) => {
      const probe = new Image();
      probe.decoding = "async";
      const finish = callback => {
        window.clearTimeout(timer); probe.onload = null; probe.onerror = null; callback();
      };
      const timer = window.setTimeout(() => finish(() => reject(new Error("Image trop longue à charger"))),15000);
      probe.onload = () => finish(() => resolve(url));
      probe.onerror = () => finish(() => reject(new Error("Image indisponible")));
      probe.src = url;
    });
  }

  function rememberOriginalImage(url) {
    const parsed = new URL(url,window.location.origin);
    const path = libraryFilePath(parsed.href);
    if (!path || path.endsWith(".preview")) return;
    if (nativeOriginalImages.get(path)?.url !== parsed.href) libraryRevision++;
    nativeOriginalImages.set(path,{url:parsed.href,expires:Date.now()+120000});
    if (nativeOriginalImages.size > 300) nativeOriginalImages.delete(nativeOriginalImages.keys().next().value);
  }

  function captureNativeOriginalImages() {
    document.querySelectorAll('app-file-preview-dialog img[src*="/MyPhone/downloadChatFile/"]')
      .forEach(image => { if (image.complete && image.naturalWidth) rememberOriginalImage(image.src); });
  }

  async function loadOriginalImagePreview(image) {
    const originalUrl = image.dataset.decOriginalPreviewUrl || "";
    if (!originalUrl || image.dataset.decOriginalPreviewState === "loading") {
      return;
    }

    image.dataset.decOriginalPreviewState = "loading";
    try {
      const url = new URL(originalUrl);
      const native = nativeOriginalImages.get(url.pathname);
      let resolved;
      if (native?.expires > Date.now()) {
        try { resolved = await probeOriginalImage(native.url); } catch { nativeOriginalImages.delete(url.pathname); }
      }
      if (!resolved && url.searchParams.has("sessionId")) {
        try { resolved = await probeOriginalImage(url.href); } catch { /* Interface récente : essayer un ticket. */ }
      }
      if (!resolved) {
        url.search = "";
        url.searchParams.set("ticket",await originalDownloadTicket());
        resolved = await probeOriginalImage(url.href);
      }
      if (image.isConnected && image.dataset.decOriginalPreviewUrl === originalUrl) {
        image.srcset = "";
        image.src = resolved;
        image.dataset.decOriginalPreviewState = "ready";
        delete image.dataset.decOriginalPreviewRetryAfter;
        rememberOriginalImage(resolved);
        scheduleUpdate();
      }
    } catch {
      if (image.dataset.decOriginalPreviewUrl === originalUrl) {
        image.dataset.decOriginalPreviewState = "failed";
        image.dataset.decOriginalPreviewRetryAfter = String(Date.now()+60000);
      }
    }
  }

  function ensureOriginalPreviewObserver() {
    if (originalPreviewObserver || !("IntersectionObserver" in window)) {
      return originalPreviewObserver;
    }

    originalPreviewObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          originalPreviewObserver.unobserve(entry.target);
          loadOriginalImagePreview(entry.target);
        });
      },
      {
        rootMargin: "600px 0px",
      },
    );
    return originalPreviewObserver;
  }

  function enhanceOriginalImagePreviews() {
    captureNativeOriginalImages();
    const sessionId = currentChatSessionId();

    const previewObserver = ensureOriginalPreviewObserver();
    document
      .querySelectorAll(
        'chat-message file-preview a[download] img[src*="/MyPhone/downloadChatFile/"][src*=".preview"], ' +
          'chat-message app-chat-message-file-preview img[src*="/MyPhone/downloadChatFile/"][src*=".preview"]',
      )
      .forEach((image) => {
        const originalUrl = originalUrlForPreview(image, sessionId);
        if (!originalUrl) {
          return;
        }

        if (image.dataset.decOriginalPreviewUrl !== originalUrl) {
          image.dataset.decOriginalPreviewUrl = originalUrl;
          image.dataset.decOriginalPreviewState = "pending";
        }

        if (
          image.dataset.decOriginalPreviewState === "loading" ||
          (image.dataset.decOriginalPreviewState === "failed" &&
            Number(image.dataset.decOriginalPreviewRetryAfter) > Date.now())
        ) {
          return;
        }

        image.loading = "lazy";
        if (previewObserver) {
          previewObserver.observe(image);
        } else {
          loadOriginalImagePreview(image);
        }
      });
  }

  function notificationPageHasFocus() {
    return !document.hidden && document.hasFocus();
  }

  function browserNotificationPermission() {
    try {
      return typeof window.Notification === "function" ? window.Notification.permission : "unsupported";
    } catch { return "unsupported"; }
  }

  function closeActiveChatDesktopNotices() {
    for (const notice of activeChatDesktopNotices.values()) notice.close();
    activeChatDesktopNotices.clear();
  }

  function showActiveChatDesktopNotification(state, record) {
    if (notificationPageHasFocus() || browserNotificationPermission() !== "granted") return;
    const tag = `dec-3cx-open-chat-${state.id}`;
    try {
      activeChatDesktopNotices.get(tag)?.close();
      const notice = new window.Notification(`3CX · ${record.sender || state.title || "Nouveau message"}`, {
        body:record.body.slice(0,240), tag, renotify:true, silent:true,
        icon:new URL("/assets/manifest/icon_192x192.png", window.location.origin).href,
      });
      activeChatDesktopNotices.set(tag, notice);
      notice.onclick = () => {
        window.focus();
        if (window.location.hash !== `#/chat/${state.id}`) window.location.hash = `/chat/${state.id}`;
        notice.close();
      };
      notice.onclose = () => {
        if (activeChatDesktopNotices.get(tag) === notice) activeChatDesktopNotices.delete(tag);
      };
    } catch {
      // Une autorisation absente ou une API indisponible ne bloque pas le son.
    }
  }

  function activeChatNotificationRecords(scope, title) {
    const counts = new Map();
    let sender = "";
    const records = [];
    for (const message of scope.querySelectorAll(MESSAGE_SELECTOR)) {
      const align = message.querySelector(".message-inner, .message-align");
      const time = message.querySelector(".message-data small, .message-title-time, .message-time-info small, small[title]");
      if (!align || !time?.textContent.trim()) continue;
      const own = align.classList.contains("message-right") || align.classList.contains("sent-by-me");
      const nativeName = message.querySelector(".sender-name, .message-name")?.textContent.trim();
      if (nativeName && !own) sender = nativeName;
      const text = libraryMessageText(message);
      const attachments = libraryAttachments(message);
      const file = message.querySelector("app-chat-message-file, app-chat-message-file-preview, file-preview, preview-text-message");
      const audio = message.querySelector("audio, app-chat-message-audio, app-chat-message-voice");
      if (!text && !attachments.length && !file && !audio) continue;
      const signature = libraryHash(JSON.stringify([own, libraryDay(time.getAttribute("title") || ""),
        time.textContent.trim(), text, attachments.map(item => item.id), Boolean(file), Boolean(audio)]));
      const ordinal = (counts.get(signature) || 0) + 1;
      counts.set(signature, ordinal);
      records.push({ message, own, signature, ordinal, key:`${signature}:${ordinal}`,
        sender:own ? "Moi" : sender || title,
        body:text || (audio ? "Message vocal reçu" : attachments[0]?.kind === "image" ? "Image reçue" : "Pièce jointe reçue") });
    }
    return { records, counts };
  }

  function scanActiveChatNotifications() {
    const id = window.location.hash.match(/^#\/chat\/(\d+)(?:[/?]|$)/)?.[1];
    const scope = document.querySelector("chat-component app-chat-messages, app-chat-messages");
    if (!id || !scope) { activeChatNotificationState = null; return; }
    const title = scope.querySelector('chat-messages-header [data-qa="chat-name"], #showParticipants')?.textContent.trim() || "";
    const account = document.querySelector('app-header wc-account-menu app-avatar img[alt]:not(.dec-animated-avatar-image)')?.getAttribute("alt") || "";
    let state = activeChatNotificationState;
    if (!state || state.id !== id || state.scope !== scope || state.account !== account || state.title !== title) {
      state = { id, scope, account, title, ready:false, tail:null, tailKeys:[], seen:new Map() };
      activeChatNotificationState = state;
    }
    const { records, counts } = activeChatNotificationRecords(scope, title);
    if (!records.length) return; // Angular peut vider le conteneur avant de le repeupler.
    let start = records.length;
    if (state.ready) {
      const retained = records.findIndex(record => record.message === state.tail);
      if (retained >= 0) start = retained + 1;
      else if (state.tailKeys.length) {
        // Recréation du DOM : retrouver la fin connue sans rejouer l'historique.
        for (let index = 0; index <= records.length - state.tailKeys.length; index++) {
          if (state.tailKeys.every((key, offset) => records[index + offset].key === key)) {
            start = index + state.tailKeys.length;
            break;
          }
        }
      }
    }
    const incoming = records.slice(start).filter(record => !record.own &&
      record.ordinal > (state.seen.get(record.signature) || 0));
    for (const [key, count] of counts) state.seen.set(key, Math.max(count, state.seen.get(key) || 0));
    while (state.seen.size > 2000) state.seen.delete(state.seen.keys().next().value);
    state.ready = true;
    state.tail = records[records.length - 1].message;
    state.tailKeys = records.slice(-3).map(record => record.key);
    if (!incoming.length || notificationPageHasFocus() || performance.now() < suppressAnimationsUntil) return;
    playCustomNotification({ onlyWhenAway:true });
    showActiveChatDesktopNotification(state, incoming[incoming.length - 1]);
  }

  function activeChatMutationNeedsScan(mutation) {
    const element = mutationElement(mutation.target);
    if (element?.closest?.(`${CHAT_TOAST_SELECTOR}, [data-dec-created="true"], #${CONTROLS_ID}`)) return false;
    if (mutation.type === "childList") {
      const changed = [...mutation.addedNodes, ...mutation.removedNodes];
      if (changed.length && changed.every(isUserscriptOwnedNode)) return false;
    }
    if (element?.closest?.(MESSAGE_SELECTOR)) return true;
    if (mutation.type !== "childList") return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE &&
      !isUserscriptOwnedNode(node) && (node.matches(MESSAGE_SELECTOR) || node.querySelector(MESSAGE_SELECTOR)));
  }

  function initializeActiveChatNotifications() {
    if (activeChatNotificationObserver) return;
    scanActiveChatNotifications();
    // MutationObserver reste utilisable quand requestAnimationFrame est suspendu
    // dans un onglet masqué. Aucun rescan visuel ni minuterie ne conditionne l'alerte.
    activeChatNotificationObserver = new MutationObserver(mutations => {
      if (mutations.some(activeChatMutationNeedsScan)) scanActiveChatNotifications();
    });
    activeChatNotificationObserver.observe(document.documentElement, {
      childList:true, characterData:true, attributes:true, attributeFilter:["src", "title"], subtree:true,
    });
    window.addEventListener("hashchange", () => { activeChatNotificationState = null; scanActiveChatNotifications(); });
    const syncFocus = () => {
      if (notificationPageHasFocus()) closeActiveChatDesktopNotices();
      scanActiveChatNotifications();
    };
    window.addEventListener("focus", syncFocus);
    window.addEventListener("blur", syncFocus);
    document.addEventListener("visibilitychange", syncFocus);
    // L'activation audio doit suivre une interaction réelle avec 3CX.
    const activateAudio = () => {
      if (!preferences.notificationSound || !customNotificationSound) return;
      const context = ensureNotificationAudioContext();
      if (context?.state === "suspended") void context.resume().catch(() => {});
      void prepareNotificationAudio();
    };
    document.addEventListener("pointerdown", activateAudio, { passive:true, capture:true });
    document.addEventListener("keydown", activateAudio, { passive:true, capture:true });
    window.addEventListener("pagehide", closeActiveChatDesktopNotices);
  }

  function chatToastSignature(toast) {
    const copy = toast.cloneNode(true);
    copy.querySelectorAll("button").forEach((button) => button.remove());
    return String(copy.textContent || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function isCompleteChatToast(toast) {
    return Boolean(replyButtonFromToast(toast) && ignoreButtonFromToast(toast));
  }

  function replyButtonFromToast(toast) {
    return toast?.querySelector('[data-qa="reply-in-chat"], button.btn-primary');
  }

  function ignoreButtonFromToast(toast) {
    return toast?.querySelector('[data-qa="ignore-chat"], button.btn-gray, button.btn-border');
  }

  function positionChatToastStack() {
    let top = 12;
    document
      .querySelectorAll(
        "chat-searcher-component.layout-type4-header, " +
          ".layout-type4-header, [layout-type4-header], app-header, " +
          "#dec-slack-controls",
      )
      .forEach((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display !== "none" && style.visibility !== "hidden" && rect.height > 0) {
          top = Math.max(top, rect.bottom + 12);
        }
      });
    const modernToastHost = document.querySelector("chat-toast-container");
    if (modernToastHost && document.documentElement.classList.contains("dec-slack-ui-v2")) {
      modernToastHost.style.setProperty("--dec-slack-chat-toast-host-top", `${Math.ceil(top)}px`);
      return;
    }

    let nextTop = Math.ceil(top);
    document.querySelectorAll(`${CHAT_TOAST_SELECTOR}.dec-slack-chat-toast`).forEach((toast) => {
      if (!toast.isConnected) {
        return;
      }
      const style = window.getComputedStyle(toast);
      if (style.display === "none" || style.visibility === "hidden") {
        return;
      }

      toast.style.setProperty("--dec-slack-chat-toast-top", `${nextTop}px`);
      nextTop += Math.max(toast.getBoundingClientRect().height, 78) + 12;
    });
  }

  function scheduleChatToastPositioning() {
    if (chatToastPositionScheduled) {
      return;
    }
    chatToastPositionScheduled = true;
    window.requestAnimationFrame(() => {
      chatToastPositionScheduled = false;
      positionChatToastStack();
    });
  }

  function ensureChatToastPositioning() {
    if (!chatToastStackInitialized) {
      chatToastStackInitialized = true;
      window.addEventListener("resize", scheduleChatToastPositioning);
      document.addEventListener("scroll", scheduleChatToastPositioning, true);
    }
    scheduleChatToastPositioning();
  }

  function enhanceChatToastAppearance(toast) {
    /* Ne jamais déplacer ce composant hors de son parent Angular natif.
       3CX doit pouvoir le mettre à jour puis le détruire dans son propre
       conteneur, sans erreur removeChild ni reconstruction de l'application. */
    ensureChatToastPositioning();
    if (enhancedChatToasts.has(toast)) {
      scheduleChatToastPositioning();
      return;
    }
    enhancedChatToasts.add(toast);
    toast.classList.add("dec-slack-chat-toast");
    toast.setAttribute("role", "button");
    toast.setAttribute("tabindex", "0");
    toast.setAttribute("aria-label", "Ouvrir la conversation de cette notification");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "dec-slack-chat-toast-close";
    closeButton.setAttribute("aria-label", "Fermer la notification");
    closeButton.title = "Fermer";
    closeButton.textContent = "×";
    toast.appendChild(closeButton);

    const eventHitsCloseButton = (event) => {
      if (event.target.closest?.(".dec-slack-chat-toast-close")) {
        return true;
      }
      if (!(event instanceof MouseEvent)) {
        return false;
      }
      const rect = closeButton.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    };

    const dismissToast = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      ignoreButtonFromToast(toast)?.click();
    };

    /* Le gestionnaire natif « Répondre » est attaché à la bulle entière.
       L'interception en phase capture donne toujours la priorité à la croix,
       même si une couche transparente du bouton natif la recouvre. */
    toast.addEventListener(
      "pointerdown",
      (event) => {
        if (eventHitsCloseButton(event)) {
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    toast.addEventListener(
      "click",
      (event) => {
        if (eventHitsCloseButton(event)) {
          dismissToast(event);
        }
      },
      true,
    );

    toast.addEventListener("click", (event) => {
      // Évite la récursion lorsque le clic natif Répondre remonte jusqu'ici.
      if (
        event.target.closest(
          '[data-qa="reply-in-chat"], [data-qa="ignore-chat"], ' +
            "button.btn-primary, button.btn-gray, button.btn-border",
        )
      ) {
        return;
      }
      replyButtonFromToast(toast)?.click();
    });

    toast.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        replyButtonFromToast(toast)?.click();
      } else if (event.key === "Escape") {
        event.preventDefault();
        ignoreButtonFromToast(toast)?.click();
      }
    });
    scheduleChatToastPositioning();
  }

  function processChatToastNotification(toast) {
    if (!toast?.isConnected || !isCompleteChatToast(toast)) {
      return;
    }

    enhanceChatToastAppearance(toast);
    const signature = chatToastSignature(toast);
    if (!signature || knownChatToasts.get(toast) === signature) {
      return;
    }

    knownChatToasts.set(toast, signature);
    if (initialChatToasts.has(toast)) {
      initialChatToasts.delete(toast);
      return;
    }

    playCustomNotification();
  }

  function chatToastsFromMutation(mutation) {
    const toasts = new Set();
    const targetElement =
      mutation.target.nodeType === Node.ELEMENT_NODE
        ? mutation.target
        : mutation.target.parentElement;
    const targetToast = targetElement?.closest?.(CHAT_TOAST_SELECTOR);
    if (targetToast) {
      toasts.add(targetToast);
    }

    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      if (node.matches(CHAT_TOAST_SELECTOR)) {
        toasts.add(node);
      }
      node.querySelectorAll(CHAT_TOAST_SELECTOR).forEach((toast) => {
        toasts.add(toast);
      });
    });

    return toasts;
  }

  function initializeChatToastNotifications() {
    if (chatToastObserver) {
      return;
    }

    ensureChatToastPositioning();
    document.querySelectorAll(CHAT_TOAST_SELECTOR).forEach((toast) => {
      initialChatToasts.add(toast);
      processChatToastNotification(toast);
    });

    chatToastObserver = new MutationObserver((mutations) => {
      const candidateToasts = new Set();
      let toastLayoutChanged = false;
      mutations.forEach((mutation) => {
        const mutationToasts = chatToastsFromMutation(mutation);
        if (mutationToasts.size > 0) {
          toastLayoutChanged = true;
        }
        mutationToasts.forEach((toast) => {
          candidateToasts.add(toast);
        });
        mutation.removedNodes.forEach((node) => {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node.matches(CHAT_TOAST_SELECTOR) || node.querySelector(CHAT_TOAST_SELECTOR))
          ) {
            toastLayoutChanged = true;
          }
        });
      });
      candidateToasts.forEach(processChatToastNotification);
      if (toastLayoutChanged) {
        scheduleChatToastPositioning();
      }
    });
    chatToastObserver.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  function enhanceVisibleMessages() {
    installAvatarStyles();
    hideFreeEditionBanner();
    ensureControls();
    const modern = Boolean(document.querySelector("chat-component app-layout-type4"));
    document.documentElement.classList.toggle("dec-slack-ui-v2", modern);
    if (modern) {
      enhanceModernChat();
      initialMessageScan = false;
      return;
    }
    enhanceConversationHeader();
    synchronizeDirectConversationProfile();
    const profiles = buildParticipantMap();
    synchronizeOwnProfile(profiles);
    const messages = [...document.querySelectorAll(MESSAGE_SELECTOR)];
    const animationStartIndex = Math.max(0, messages.length - 3);

    messages.forEach((message, index) => {
      markMessage(message, index >= animationStartIndex);
      enhanceMessage(message, profiles);
    });
    enhanceReadReceipts();
    enhanceTypingIndicator(profiles);
    enhanceCustomEmojis();
    enhanceMessageLibrary(messages.map(message => ({
      message,
      own: Boolean(message.querySelector(".message-inner.message-right")),
      profile: directConversationProfileFromHeader(),
      time: message.querySelector(".message-title-time, .message-time-info small, small[title]"),
    })));
    enhanceOriginalImagePreviews();
    initialMessageScan = false;
  }

  /* UI de septembre 2026. Les nœuds Angular restent à leur emplacement.
     Seules nos décorations portent data-dec-created et peuvent être retirées. */
  function modernText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function modernDecoration(parent, className, tag = "span") {
    let element = [...parent.children].find((child) => child.classList.contains(className));
    if (!element) {
      element = document.createElement(tag);
      element.className = className;
      element.dataset.decCreated = "true";
      parent.appendChild(element);
    }
    return element;
  }

  function modernOwnProfile(profiles) {
    const avatar = document.querySelector("app-header wc-account-menu app-avatar");
    const image = avatar?.querySelector('img[data-qa="profile-image"]');
    const extension = image?.getAttribute("alt") || "";
    const cached = readCachedOwnProfile();
    const known = profiles.get(extension) || (cached?.extension === extension ? cached : null);
    return {
      extension,
      name: known?.name || "Moi",
      imageUrl: image?.src || "",
      initials: avatar?.querySelector(".avatar-content:not(img)")?.textContent?.trim() || "M",
    };
  }

  function enhanceModernHeader(contact = directConversationProfileFromHeader()) {
    const header = document.querySelector("chat-messages-header");
    const title = header?.querySelector('[data-qa="chat-name"]');
    if (!title) return;
    header.classList.add("dec-v2-header");
    const identity = [...header.children].find((child) => child.contains(title));
    identity?.classList.add("dec-v2-native-identity");
    const action = header.querySelector(
      '[data-qa="show-menu"], [data-qa="add-user"], [data-qa="make-call"]',
    );
    const actions = action && [...header.children].find((child) => child.contains(action));
    if (actions !== identity) actions?.classList.add("dec-v2-actions");
    const card = modernDecoration(header, "dec-v2-title-card", "button");
    card.type = "button";
    card.onclick = () => title.click();
    modernText(modernDecoration(card, "dec-v2-title"), contact?.name || title.textContent.trim());
    const line = modernDecoration(card, "dec-v2-presence");
    const description = header.querySelector('[data-qa="chat-description"]');
    const label = contact ? description?.textContent.trim() || "" : "";
    line.hidden = !label || containsTypingText(label);
    modernText(modernDecoration(line, "dec-v2-presence-label"), label);
    const dot = modernDecoration(line, "dec-v2-presence-dot");
    const nativeDot = identity?.querySelector('[data-qa="status-indicator"]');
    const color = nativeDot ? window.getComputedStyle(nativeDot).backgroundColor : "";
    dot.hidden = !color || color === "transparent" || color === "rgba(0, 0, 0, 0)";
    if (!dot.hidden && dot.style.backgroundColor !== color) dot.style.backgroundColor = color;
  }

  function modernMessageRecords(profiles, contact = directConversationProfileFromHeader()) {
    let previousProfile = null;
    return [...document.querySelectorAll("app-chat-messages chat-message")]
      .map((message) => {
        const align = message.querySelector(".message-align");
        if (!align) return null;
        const nativeName = message.querySelector(
          ":scope > .message-name, .message-row > .message-name, " +
            ":scope > .message-row > .sender-name",
        );
        const own = Boolean(
          align.classList.contains("sent-by-me") || nativeName?.classList.contains("sent-by-me"),
        );
        const fullName = nativeName?.textContent.trim() || "";
        const extension = extensionFromText(fullName);
        const newSender = Boolean(
          nativeName || message.querySelector(".message-content.new-sender"),
        );
        const boundary = message.previousElementSibling?.matches(".day-title");
        const profile = own
          ? currentOwnProfile
          : contact ||
            (extension
              ? profiles.get(extension) || {
                  extension,
                  name: fullName.replace(/\s*\d+\s*$/, ""),
                  imageUrl: "",
                  initials: initialsFromName(fullName),
                }
              : !newSender && !boundary
                ? previousProfile
                : null);
        previousProfile = profile;
        const time = [...message.querySelectorAll(".message-data small")].find((el) =>
          /^\s*\d{1,2}:\d{2}\s*$/.test(el.textContent),
        );
        return {
          message,
          align,
          own,
          profile,
          time,
          boundary,
          newSender,
          nativeName,
          key: own ? "own" : profile?.extension || profile?.name || "",
        };
      })
      .filter(Boolean);
  }

  function enhanceModernReceipts(records, contact = directConversationProfileFromHeader()) {
    if (!contact) {
      restoreNativeReceipts(records.map((record) => record.message));
      return;
    }
    const receipts = records.map((record) => ({
      ...record,
      receipt: record.message.querySelector("delivered-check:not([data-dec-created])"),
    }));
    const read = receiptHasReadMarker;
    // L'interlocuteur a aussi lu ses propres messages. Le portrait suit le
    // dernier message reçu ou le dernier de mes envois confirmé lu par 3CX.
    const latest = receipts.filter((r) => !r.own || read(r.receipt)).at(-1);
    receipts.forEach(({ message, own, receipt }) => {
      message.classList.remove(LATEST_READ_CLASS);
      message
        .querySelectorAll(`.${READ_AVATAR_CLASS}, .${SENT_RECEIPT_COPY_CLASS}`)
        .forEach((el) => el.remove());
      if (receipt) {
        receipt.classList.remove(
          HIDDEN_READ_RECEIPT_CLASS,
          HIDDEN_SENT_RECEIPT_CLASS,
          REDUNDANT_READ_RECEIPT_CLASS,
        );
        const isRead = read(receipt);
        receipt.classList.toggle(
          "dec-v2-receipt-hidden",
          !own || (isRead && message !== latest?.message),
        );
      }
      let portrait = message.querySelector(":scope > .dec-v2-read-avatar");
      if (message === latest?.message && contact) {
        receipt?.classList.add("dec-v2-receipt-hidden");
        portrait = portrait || modernDecoration(message, "dec-v2-read-avatar");
        applyProfileToAvatar(portrait, contact, contact.name, contact.extension);
        portrait.setAttribute("aria-label", `Lu par ${contact.name}`);
        portrait.setAttribute("role", "img");
      } else portrait?.remove();
    });
  }

  function decorateModernMessage({ message, own, profile, time, nativeName }, start, end) {
    message.classList.add("dec-v2-message");
    message.classList.toggle("dec-v2-own", own);
    message.classList.toggle("dec-v2-group-start", start);
    message.classList.toggle("dec-v2-group-end", end);
    // Un auteur de groupe non identifié conserve son rendu natif.
    message.classList.toggle("dec-v2-has-author", Boolean(profile));
    nativeName?.parentElement?.classList.add("dec-v2-native-sender-row");
    if (start && profile) {
      const heading = modernDecoration(message, "dec-v2-message-heading");
      modernText(modernDecoration(heading, "dec-v2-author"), profile.name);
      modernText(modernDecoration(heading, "dec-v2-time"), time?.textContent.trim() || "");
      const portrait = modernDecoration(message, "dec-v2-message-avatar");
      applyProfileToAvatar(portrait, profile, profile.name, profile.extension);
      portrait.setAttribute("aria-hidden", "true");
    } else {
      message.querySelector(":scope > .dec-v2-message-heading")?.remove();
      message.querySelector(":scope > .dec-v2-message-avatar")?.remove();
    }
  }

  function enhanceModernChat() {
    ensureTypingIndicator();
    const contact = directConversationProfileFromHeader();
    enhanceModernHeader(contact);
    scheduleChatToastPositioning();
    const profiles = buildParticipantMap();
    currentOwnProfile = modernOwnProfile(profiles);
    const records = modernMessageRecords(profiles, contact);
    records.forEach((record, index) => {
      const { message, boundary, newSender, key } = record;
      const previous = records[index - 1];
      const next = records[index + 1];
      const start = !previous || boundary || newSender || !key || previous.key !== key;
      const end = !next || next.boundary || next.newSender || !key || next.key !== key;
      decorateModernMessage(record, start, end);
      markMessage(message, index >= records.length - 3);
    });
    enhanceModernReceipts(records, contact);
    enhanceCustomEmojis();
    enhanceMessageLibrary(records);
    enhanceOriginalImagePreviews();
    enhanceTypingIndicator(profiles);
    synchronizeModernScroll(records);
  }

  // Suit le bas après la décoration et le chargement des images, puis laisse
  // l'utilisateur relire librement l'historique. Un seul suivi par conversation.
  let modernScrollState = null;

  function disposeModernScroll() {
    const state = modernScrollState;
    if (!state) return;
    state.resizeObserver?.disconnect();
    for (const [type, listener, capture = false] of state.listeners) {
      state.scroller.removeEventListener(type, listener, capture);
    }
    modernScrollState = null;
  }

  function scheduleModernScroll(state) {
    if (state.scheduled || !state.pinned) return;
    state.scheduled = true;
    window.requestAnimationFrame(() => {
      state.scheduled = false;
      if (
        state !== modernScrollState ||
        !state.pinned ||
        !state.scroller.isConnected ||
        document.hidden ||
        state.key !== window.location.hash
      )
        return;
      state.adjusting = true;
      state.scroller.scrollTop = state.scroller.scrollHeight;
      window.requestAnimationFrame(() => {
        if (state === modernScrollState) state.adjusting = false;
      });
    });
  }

  function synchronizeModernScroll(records) {
    const key = window.location.hash;
    const scroller = document.querySelector("app-chat-messages .chat-massages-main > .scrollable");
    if (!scroller || !/^#\/chat\/[^/?]+/.test(key)) {
      disposeModernScroll();
      return;
    }
    if (modernScrollState?.key !== key || modernScrollState.scroller !== scroller) {
      disposeModernScroll();
      const state = {
        key,
        scroller,
        pinned: true,
        scheduled: false,
        adjusting: false,
        settleUntil: performance.now() + 1500,
        listeners: [],
        observed: new Set(),
      };
      modernScrollState = state;
      const distance = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
      const release = () => {
        state.pinned = false;
        state.settleUntil = 0;
      };
      const listen = (type, listener) => {
        scroller.addEventListener(type, listener, { passive: true });
        state.listeners.push([type, listener]);
      };
      listen("wheel", (event) => {
        if (event.deltaY < 0) release();
      });
      listen("touchmove", release);
      listen("pointerdown", (event) => {
        // Un clic sur le texte ne coupe pas le suivi, une prise de scrollbar oui.
        if (event.target === scroller) release();
      });
      listen("keydown", (event) => {
        if (
          ["ArrowUp", "PageUp", "Home"].includes(event.key) ||
          (event.key === " " && event.shiftKey)
        )
          release();
      });
      listen("scroll", () => {
        if (state.adjusting) return;
        if (performance.now() < state.settleUntil) {
          scheduleModernScroll(state);
          return;
        }
        state.pinned = distance() <= 4;
      });
      const onLoad = () => scheduleModernScroll(state);
      scroller.addEventListener("load", onLoad, true);
      state.listeners.push(["load", onLoad, true]);
      // Les images changent de hauteur sans mutation DOM. Observer les enfants
      // de la liste détecte ces changements sans rescanner à chaque mouvement.
      if (typeof window.ResizeObserver === "function") {
        state.resizeObserver = new window.ResizeObserver(() => scheduleModernScroll(state));
        state.resizeObserver.observe(scroller);
      }
    }
    const state = modernScrollState;
    const children = new Set([...scroller.children]);
    for (const child of state.observed) {
      if (!children.has(child)) {
        state.resizeObserver?.unobserve(child);
        state.observed.delete(child);
      }
    }
    for (const child of children) {
      if (!state.observed.has(child)) {
        state.resizeObserver?.observe(child);
        state.observed.add(child);
      }
    }
    if (records.length) scheduleModernScroll(state);
  }

  let updateScheduled = false;

  function scheduleUpdate() {
    if (updateScheduled) {
      return;
    }

    updateScheduled = true;
    window.requestAnimationFrame(() => {
      updateScheduled = false;
      enhanceVisibleMessages();
      enhanceAnimatedAvatars();
    });
  }

  function mutationElement(node) {
    if (node?.nodeType === Node.ELEMENT_NODE) {
      return node;
    }
    return node?.parentElement || null;
  }

  function isInsideIgnoredUpdateArea(node) {
    const element = mutationElement(node);
    return Boolean(
      element?.closest?.(
        "#chat-form-controls, app-chat-message-input, " +
          `#${CONTROLS_ID}, ` +
          `#${EMOJI_AUTOCOMPLETE_ID}, ` +
          `#${CHAT_TOAST_STACK_ID}, ` +
          CHAT_TOAST_SELECTOR,
      ),
    );
  }

  function isUserscriptOwnedNode(node) {
    const element = mutationElement(node);
    return Boolean(
      element?.closest?.(
        '[data-dec-created="true"], ' +
          `.${AVATAR_CLASS}, ` +
          `.${READ_AVATAR_CLASS}, ` +
          `.${SENT_RECEIPT_COPY_CLASS}, ` +
          `#${TYPING_INDICATOR_ID}`,
      ),
    );
  }

  function mutationNeedsUpdate(mutation) {
    /* La saisie, l'autocomplétion et nos notifications possèdent leurs propres
       gestionnaires. Les rescanner à chaque caractère était le principal coût
       perceptible pendant l'écriture d'un message. */
    if (isInsideIgnoredUpdateArea(mutation.target)) {
      return false;
    }

    if (mutation.type !== "childList") {
      return true;
    }

    const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return (
      changedNodes.length === 0 ||
      changedNodes.some((node) => !isInsideIgnoredUpdateArea(node) && !isUserscriptOwnedNode(node))
    );
  }

  applyPreferences();
  ensureControls();
  initializeAutoUpdates();
  initializeCustomEmojis();
  initializeEmojiAutocomplete();
  initializeChatToastNotifications();
  initializeActiveChatNotifications();
  initializeAnimatedAvatars();

  const observer = new MutationObserver((mutations) => {
    if (mutations.some(mutationNeedsUpdate)) {
      scheduleUpdate();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  window.addEventListener("hashchange", () => {
    // Le rechargement d'une conversation recrée des messages anciens :
    // ils ne doivent pas être pris pour de nouveaux messages entrants.
    suppressAnimationsUntil = performance.now() + 1200;
    disposeModernScroll();
    // Effacer immédiatement les cartes de l'ancienne vue ; leur cache reste
    // disponible uniquement sous l'identifiant de leur propre conversation.
    libraryMessages.clear();
    libraryNoteEditor = null;
    renderMessageLibrary(true);
    scheduleUpdate();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleUpdate();
    }
  });

  // Filet de sécurité pour le rendu virtuel d'Angular/3CX.
  window.setInterval(() => {
    /* Les notifications et leur son ont un observateur dédié. En arrière-plan,
       le rescan visuel peut attendre le retour sur l'onglet. */
    if (!document.hidden) {
      scheduleUpdate();
    }
  }, 8000);
  scheduleUpdate();
})();
