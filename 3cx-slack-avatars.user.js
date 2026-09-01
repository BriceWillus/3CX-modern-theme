// ==UserScript==
// @name         3CX Slack — thème, avatars et emojis
// @namespace    https://decindustrie.3cx.no/
// @version      1.8.6
// @description  Ajoute les noms, avatars, emojis, notifications et contrôles Slack à 3CX.
// @author       DEC Industrie
// @match        https://decindustrie.3cx.no:5001/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      *
// ==/UserScript==

(() => {
  "use strict";

  const SCRIPT_MARKER = "__dec3cxSlackAvatars";
  const AVATAR_CLASS = "dec-slack-message-avatar";
  const STYLE_ID = "dec-slack-message-avatar-styles";
  const PARTICIPANT_SELECTOR = "app-chat-participants li";
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
  const TYPING_INDICATOR_ID = "dec-slack-typing-indicator";
  const HIDDEN_NATIVE_TYPING_CLASS = "dec-slack-native-typing-hidden";
  const CONTROLS_ID = "dec-slack-controls";
  const STORAGE_LAYOUT = "decSlackLayout";
  const STORAGE_THEME = "decSlackTheme";
  const STORAGE_ACCENT = "decSlackAccent";
  const STORAGE_EMOJI_MANIFEST = "decSlackEmojiManifest";
  const STORAGE_SEARCH_COLLAPSED = "decSlackSearchCollapsed";
  const STORAGE_NOTIFICATION_SOUND = "decSlackNotificationSound";
  const STORAGE_NOTIFICATION_SOUND_ID = "decSlackNotificationSoundId";
  const STORAGE_CHAT_SESSION_ID = "decSlackChatSessionId";
  const STORAGE_OWN_PROFILE = "decSlackOwnProfile";
  const CUSTOM_EMOJI_CLASS = "dec-slack-custom-emoji";
  const EMOJI_AUTOCOMPLETE_ID = "dec-slack-emoji-autocomplete";
  const NOTIFICATION_SOUND_MENU_ID = "dec-slack-notification-sound-menu";
  const SILENT_NOTIFICATION_SOUND_ID = "__silent__";
  const CUSTOM_EMOJI_REFRESH_MS = 5 * 60 * 1000;
  const IS_FIREFOX = /firefox/i.test(navigator.userAgent);

  /*
   * URL HTTPS du manifeste partagé. Exemple :
   * https://intranet.exemple/3cx-slack/3cx-slack-emojis.json
   *
   * Une fois cette URL renseignée dans le script distribué à l'équipe,
   * tous les utilisateurs reçoivent les mêmes emojis automatiquement.
   */
  const CUSTOM_EMOJI_MANIFEST_URL = "https://bricewillus.github.io/3CX-modern-theme/3cx-slack-emojis.json";

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
  let notificationAudioBuffer = null;
  let notificationAudioBufferUrl = "";
  let lastNotificationAt = 0;
  let cachedChatSessionId = (() => {
    try {
      return window.sessionStorage.getItem(STORAGE_CHAT_SESSION_ID) || "";
    } catch {
      return "";
    }
  })();
  let originalPreviewObserver = null;
  let currentOwnProfile = null;

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
    const normalized = String(value || "").trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(normalized)
      ? normalized
      : fallbackValue;
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
    layout:
      readSetting(STORAGE_LAYOUT, "left") === "split" ? "split" : "left",
    theme:
      readSetting(STORAGE_THEME, "dark") === "light" ? "light" : "dark",
    accent: normalizeHex(readSetting(STORAGE_ACCENT, "#4a154b")),
    searchCollapsed:
      readSetting(STORAGE_SEARCH_COLLAPSED, "false") === "true",
    notificationSound:
      readSetting(STORAGE_NOTIFICATION_SOUND, "true") !== "false",
    notificationSoundId: readSetting(STORAGE_NOTIFICATION_SOUND_ID, ""),
  };

  function applyAccentVariables() {
    const root = document.documentElement;
    const accent = preferences.accent;
    const { red, green, blue } = hexToRgb(accent);
    const luminance =
      (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const lightTheme = preferences.theme === "light";

    root.style.setProperty("--dec-accent", accent);
    root.style.setProperty("--dec-accent-rgb", `${red}, ${green}, ${blue}`);
    root.style.setProperty("--dec-accent-dark", mixHex(accent, "#000000", 0.34));
    root.style.setProperty(
      "--dec-accent-darker",
      mixHex(accent, "#000000", 0.56),
    );
    root.style.setProperty(
      "--dec-accent-hover",
      mixHex(accent, "#ffffff", lightTheme ? 0.05 : 0.18),
    );
    root.style.setProperty(
      "--dec-accent-soft",
      rgba(accent, lightTheme ? 0.10 : 0.24),
    );
    root.style.setProperty(
      "--dec-accent-border",
      rgba(accent, lightTheme ? 0.25 : 0.42),
    );
    root.style.setProperty("--dec-accent-ring", rgba(accent, 0.24));
    root.style.setProperty(
      "--dec-accent-own",
      rgba(accent, lightTheme ? 0.075 : 0.12),
    );
    root.style.setProperty(
      "--dec-accent-own-hover",
      rgba(accent, lightTheme ? 0.12 : 0.18),
    );
    root.style.setProperty(
      "--dec-accent-own-border",
      rgba(accent, lightTheme ? 0.16 : 0.20),
    );
    root.style.setProperty(
      "--dec-on-accent",
      luminance > 0.62 ? "#1d1c1d" : "#ffffff",
    );
  }

  function updateControls() {
    const controls = document.getElementById(CONTROLS_ID);
    if (!controls) {
      return;
    }

    const layoutButton = controls.querySelector(
      "[data-dec-control='layout']",
    );
    const themeButton = controls.querySelector("[data-dec-control='theme']");
    const searchButton = controls.querySelector("[data-dec-control='search']");
    const soundButton = controls.querySelector("[data-dec-control='sound']");
    const colorInput = controls.querySelector("[data-dec-control='accent']");

    const splitLayout = preferences.layout === "split";
    const lightTheme = preferences.theme === "light";

    layoutButton.dataset.active = String(splitLayout);
    layoutButton.setAttribute("aria-pressed", String(splitLayout));
    layoutButton.title = splitLayout
      ? "Tout aligner à gauche"
      : "Afficher mes messages à droite";

    themeButton.dataset.active = String(lightTheme);
    themeButton.setAttribute("aria-pressed", String(lightTheme));
    themeButton.textContent = lightTheme ? "☾" : "☀";
    themeButton.title = lightTheme
      ? "Passer au thème sombre"
      : "Passer au thème clair";

    searchButton.dataset.active = String(preferences.searchCollapsed);
    searchButton.setAttribute(
      "aria-pressed",
      String(preferences.searchCollapsed),
    );
    searchButton.textContent = preferences.searchCollapsed ? "⌄" : "⌕";
    searchButton.title = preferences.searchCollapsed
      ? "Déplier la barre de recherche"
      : "Replier la barre de recherche";

    const soundEnabled = Boolean(customNotificationSound);
    soundButton.dataset.active = String(soundEnabled);
    soundButton.dataset.available = String(customNotificationSounds.size > 0);
    soundButton.textContent = soundEnabled ? "🔔" : "🔕";
    soundButton.title = soundEnabled
      ? `Son de notification : ${customNotificationSound.label}`
      : "Notifications personnalisées silencieuses";
    soundButton.setAttribute(
      "aria-label",
      soundEnabled
        ? `Choisir le son de notification. Son actuel : ${customNotificationSound.label}`
        : "Choisir le son de notification. Mode silencieux actif",
    );
    renderNotificationSoundMenu();

    colorInput.value = preferences.accent;
    colorInput.title = `Couleur du thème : ${preferences.accent}`;
  }

  function applyPreferences() {
    const root = document.documentElement;
    root.classList.toggle(
      "dec-slack-layout-split",
      preferences.layout === "split",
    );
    root.classList.toggle(
      "dec-slack-theme-light",
      preferences.theme === "light",
    );
    root.classList.toggle(
      "dec-slack-search-collapsed",
      preferences.searchCollapsed,
    );
    root.classList.remove("dec-slack-chat-header-collapsed");
    applyAccentVariables();
    updateControls();
  }

  function notificationSoundMenu() {
    return document.getElementById(NOTIFICATION_SOUND_MENU_ID);
  }

  function closeNotificationSoundMenu({ restoreFocus = false } = {}) {
    const menu = notificationSoundMenu();
    const button = document.querySelector(
      `#${CONTROLS_ID} [data-dec-control='sound']`,
    );
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
    const menuSignature = JSON.stringify(
      options.map(({ id, label, detail }) => [id, label, detail, id === selectedId]),
    );
    if (menu.dataset.decSoundMenuSignature === menuSignature) {
      return;
    }
    const fragment = document.createDocumentFragment();

    options.forEach((option) => {
      const selected = option.id === selectedId;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dec-slack-sound-option";
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
      fragment.appendChild(button);
    });

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
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-controls="${NOTIFICATION_SOUND_MENU_ID}"
        ></button>
        <div
          id="${NOTIFICATION_SOUND_MENU_ID}"
          class="dec-slack-sound-menu"
          role="listbox"
          aria-label="Sons de notification"
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
    `;

    const layoutButton = controls.querySelector(
      "[data-dec-control='layout']",
    );
    const themeButton = controls.querySelector("[data-dec-control='theme']");
    const searchButton = controls.querySelector("[data-dec-control='search']");
    const soundButton = controls.querySelector("[data-dec-control='sound']");
    const colorInput = controls.querySelector("[data-dec-control='accent']");

    layoutButton.addEventListener("click", () => {
      preferences.layout =
        preferences.layout === "split" ? "left" : "split";
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
      writeSetting(
        STORAGE_SEARCH_COLLAPSED,
        String(preferences.searchCollapsed),
      );
      applyPreferences();
    });

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
        menu
          .querySelector('.dec-slack-sound-option[data-active="true"]')
          ?.focus();
      }
    });

    notificationSoundMenu()?.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }
      const options = [
        ...notificationSoundMenu().querySelectorAll(
          ".dec-slack-sound-option",
        ),
      ];
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

    colorInput.addEventListener("input", () => {
      preferences.accent = normalizeHex(colorInput.value, preferences.accent);
      writeSetting(STORAGE_ACCENT, preferences.accent);
      applyPreferences();
    });

    document.body.appendChild(controls);
    updateControls();
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

  function installAvatarStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
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
      typeof entry === "object" && entry
        ? String(entry.label || entry.title || "").trim()
        : "";

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

  function customEmojiMapsAreEqual(first, second) {
    if (first.size !== second.size) {
      return false;
    }

    return [...first].every(([code, definition]) => {
      const other = second.get(code);
      return (
        other &&
        other.url === definition.url &&
        other.label === definition.label
      );
    });
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
      const isAudioDataUrl =
        url.protocol === "data:" && url.href.startsWith("data:audio/");
      if (
        url.protocol !== "https:" &&
        url.protocol !== "http:" &&
        !isAudioDataUrl
      ) {
        return null;
      }

      const rawVolume =
        typeof entry === "object" && entry ? Number(entry.volume) : 0.7;
      const volume = Number.isFinite(rawVolume)
        ? Math.min(1, Math.max(0, rawVolume))
        : 0.7;
      const pathname = decodeURIComponent(url.pathname || "");
      const filename = pathname.split("/").filter(Boolean).at(-1) || "";
      const label =
        typeof entry === "object" && entry
          ? String(entry.label || entry.title || "").trim()
          : "";
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

    let defaultId = normalizeNotificationSoundId(
      source.defaultNotificationSound,
    );
    if (!definitions.has(defaultId) && legacyDefinition) {
      defaultId =
        [...definitions.values()].find(
          (definition) => definition.url === legacyDefinition.url,
        )?.id || "";
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
    if (first.size !== second.size) {
      return false;
    }
    return [...first].every(([id, definition]) => {
      const other = second.get(id);
      return (
        other &&
        notificationSoundDefinitionsAreEqual(definition, other) &&
        definition.label === other.label &&
        definition.filename === other.filename
      );
    });
  }

  function audioMimeType(url, responseHeaders = "") {
    const headerMime =
      String(responseHeaders).match(/^content-type:\s*([^;\r\n]+)/im)?.[1] ||
      "";
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
      chunks.push(
        String.fromCharCode(...view.subarray(index, index + chunkSize)),
      );
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
                bytes = bytes.buffer.slice(
                  bytes.byteOffset,
                  bytes.byteOffset + bytes.byteLength,
                );
              }

              if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
                throw new Error("Le fichier audio est vide ou illisible.");
              }

              const mimeType = audioMimeType(
                definition.url,
                response.responseHeaders || "",
              );
              const blob = new Blob([bytes], { type: mimeType });
              resolve({
                // Firefox accepte de façon plus constante une URL data dans
                // un userscript qu'une URL blob créée par le bac à sable GM.
                playbackUrl: IS_FIREFOX
                  ? audioDataUrl(bytes, mimeType)
                  : URL.createObjectURL(blob),
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
            type: audioMimeType(
              definition.url,
              response.headers.get("content-type") || "",
            ),
          });
          return {
            playbackUrl: URL.createObjectURL(blob),
            bytes,
          };
        });
      });
  }

  function ensureNotificationAudioContext() {
    // Sur Firefox, HTMLAudio est plus fiable en arrière-plan et évite les
    // différences de suspension d'AudioContext entre Chrome et Gecko.
    if (IS_FIREFOX) {
      return null;
    }
    if (notificationAudioContext) {
      return notificationAudioContext;
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    try {
      notificationAudioContext = new AudioContextClass();
      return notificationAudioContext;
    } catch {
      return null;
    }
  }

  function clearNotificationAudio() {
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
        : customNotificationSounds.keys().next().value) ||
      SILENT_NOTIFICATION_SOUND_ID
    );
  }

  function selectNotificationSound(
    requestedId,
    { persist = false, preview = false } = {},
  ) {
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
      writeSetting(
        STORAGE_NOTIFICATION_SOUND_ID,
        preferences.notificationSoundId,
      );
      /* Conservé pour qu'un retour temporaire à une ancienne version du script
         respecte encore le choix silencieux/actif. */
      writeSetting(
        STORAGE_NOTIFICATION_SOUND,
        String(preferences.notificationSound),
      );
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
      notificationAudio.volume = customNotificationSound.volume;
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

        notificationAudioObjectUrl = playbackUrl.startsWith("blob:")
          ? playbackUrl
          : "";
        notificationAudio = new Audio(playbackUrl);
        notificationAudio.dataset.decSoundUrl = definition.url;
        notificationAudio.preload = "auto";
        notificationAudio.volume = definition.volume;

        const audioContext = ensureNotificationAudioContext();
        if (audioContext && bytes) {
          try {
            notificationAudioBuffer = await audioContext.decodeAudioData(
              bytes.slice(0),
            );
            notificationAudioBufferUrl = definition.url;
          } catch (error) {
            notificationAudioBuffer = null;
            notificationAudioBufferUrl = "";
            notificationAudioLoadError = error;
          }
        }

        return notificationAudio;
      })
      .catch((error) => {
        notificationAudioLoadError = error;
        // Dernier repli : la lecture directe d'une URL audio ne nécessite pas
        // que le serveur autorise fetch/CORS dans Firefox.
        try {
          notificationAudio = new Audio(definition.url);
          notificationAudio.dataset.decSoundUrl = definition.url;
          notificationAudio.preload = "auto";
          notificationAudio.volume = definition.volume;
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

  function playCustomNotification({ preview = false } = {}) {
    if (
      !preferences.notificationSound ||
      !customNotificationSound
    ) {
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
            console.warn(
              "[3CX Slack] Le navigateur a bloqué l’activation du moteur audio.",
              error,
            );
          }
        })
      : Promise.resolve();

    void prepareNotificationAudio().then((audio) => {
      if (
        !preferences.notificationSound ||
        customNotificationSound?.url !== requestedSound.url
      ) {
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
            customNotificationSound?.url !== requestedSound.url
          ) {
            return;
          }

          const source = audioContext.createBufferSource();
          const gain = audioContext.createGain();
          source.buffer = notificationAudioBuffer;
          gain.gain.value = requestedSound.volume;
          source.connect(gain);
          gain.connect(audioContext.destination);
          source.start(0);
        });
        return;
      }

      audio.pause();
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch((error) => {
          if (preview) {
            console.warn(
              "[3CX Slack] Le navigateur n'a pas pu lire le son personnalisé.",
              error,
            );
          }
        });
      }
    });
  }

  function updateExistingCustomEmojiImages() {
    document
      .querySelectorAll(`img.${CUSTOM_EMOJI_CLASS}[data-dec-emoji-code]`)
      .forEach((image) => {
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
    const nextDefinitions = customEmojiDefinitionsFrom(
      INLINE_CUSTOM_EMOJIS,
      window.location.href,
    );
    const remoteDefinitions = customEmojiDefinitionsFrom(
      manifest,
      effectiveManifestUrl,
    );
    const nextNotificationSoundCatalog = notificationSoundDefinitionsFrom(
      manifest,
      effectiveManifestUrl,
    );

    remoteDefinitions.forEach((definition, code) => {
      nextDefinitions.set(code, definition);
    });

    const emojisChanged = !customEmojiMapsAreEqual(
      customEmojis,
      nextDefinitions,
    );
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
      const cached = JSON.parse(
        window.localStorage.getItem(STORAGE_EMOJI_MANIFEST) || "null",
      );
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
      const manifest = await requestCustomEmojiManifest(
        CUSTOM_EMOJI_MANIFEST_URL,
      );
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
      console.warn(
        "[3CX Slack] Impossible d'actualiser les emojis partagés.",
        error,
      );
    }
  }

  function createCustomEmojiImage(definition, originalToken) {
    const image = document.createElement("img");
    image.className = CUSTOM_EMOJI_CLASS;
    image.dataset.decEmojiCode = definition.code;
    image.src = definition.url;
    image.alt = originalToken;
    image.title = definition.label
      ? `${originalToken} — ${definition.label}`
      : originalToken;
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
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (
            !parent ||
            parent.closest(
              `.${CUSTOM_EMOJI_CLASS}, a, code, pre, textarea, [contenteditable="true"]`,
            )
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          return node.nodeValue?.includes(":")
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      },
    );

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
        const definition = customEmojis.get(
          normalizeCustomEmojiCode(match[1]),
        );
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
      .querySelectorAll(`${MESSAGE_SELECTOR} .message-text-internal`)
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
      window.setInterval(
        () => void refreshCustomEmojiManifest(),
        CUSTOM_EMOJI_REFRESH_MS,
      );
    }
  }

  function emojiComposerFromTarget(target) {
    const element =
      target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    return element?.closest?.(
      "#chat-form-controls emoji-text-input .message-input, " +
        "#chat-form-controls textarea, " +
        "#chat-form-controls [contenteditable='true']",
    ) || null;
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
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !composer.contains(selection.anchorNode)
    ) {
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
    panel
      .querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }

  function updateEmojiAutocomplete(composer) {
    if (!composer || customEmojis.size === 0) {
      closeEmojiAutocomplete();
      return;
    }

    const caretInfo = composerCaretInfo(composer);
    const tokenInfo = caretInfo
      ? emojiTokenAtCaret(caretInfo.text, caretInfo.caret)
      : null;
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

    const previousCode =
      emojiAutocompleteState?.matches[emojiAutocompleteState.activeIndex]?.code;
    const preservedIndex = matches.findIndex(
      (definition) => definition.code === previousCode,
    );
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
    const selectedDefinition = state?.matches.find(
      (definition) => definition.code === code,
    );
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
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: replacement,
      }));
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
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: replacement,
      }));
    }
    closeEmojiAutocomplete();
  }

  function initializeEmojiAutocomplete() {
    if (emojiAutocompleteInitialized) {
      return;
    }
    emojiAutocompleteInitialized = true;
    ensureEmojiAutocompletePanel();

    document.addEventListener("input", (event) => {
      const composer = emojiComposerFromTarget(event.target);
      if (composer) {
        updateEmojiAutocomplete(composer);
      }
    }, true);

    document.addEventListener("keydown", (event) => {
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
    }, true);

    document.addEventListener("pointerdown", (event) => {
      const panel = document.getElementById(EMOJI_AUTOCOMPLETE_ID);
      if (
        emojiAutocompleteState &&
        !panel?.contains(event.target) &&
        emojiComposerFromTarget(event.target) !== emojiAutocompleteState.composer
      ) {
        closeEmojiAutocomplete();
      }
    }, true);

    window.addEventListener("resize", positionEmojiAutocomplete);
    document.addEventListener("scroll", positionEmojiAutocomplete, true);
  }

  function participantProfileFromRow(row) {
    const line = row.querySelector("app-extension-line-view");
    const rowText = line?.textContent || row.textContent || "";
    const extension = extensionFromText(rowText);

    if (!extension) {
      return null;
    }

    const name =
      line?.querySelector(".text-truncate")?.textContent?.trim() ||
      rowText.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim();

    const image = row.querySelector("app-avatar img.avatar-content, app-avatar img");
    const initialElement = row.querySelector(
      "app-avatar .avatar-content:not(img)",
    );
    const initials =
      initialElement?.textContent?.trim() || initialsFromName(name);

    return {
      extension,
      name,
      imageUrl: image?.src || "",
      initials,
    };
  }

  function readCachedOwnProfile() {
    try {
      const value = JSON.parse(
        window.localStorage.getItem(STORAGE_OWN_PROFILE) || "null",
      );
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
        initials:
          String(value.initials || "").trim() || initialsFromName(name),
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
    const names = [
      ...document.querySelectorAll(
        "chat-message > .message-name.message-right",
      ),
    ];
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const fullName = String(names[index].textContent || "").trim();
      const extension = extensionFromText(fullName);
      if (!extension) {
        continue;
      }
      const name = fullName
        .replace(new RegExp(`\\s*${extension}\\s*$`), "")
        .trim();
      const known = profiles.get(extension);
      return {
        extension,
        name: known?.name || name,
        imageUrl: known?.imageUrl || "",
        initials:
          known?.initials || initialsFromName(known?.name || name),
      };
    }
    return null;
  }

  function ownProfileFromDirectParticipants() {
    const contact = directConversationProfileFromHeader();
    if (!contact) {
      return null;
    }

    const participants = [
      ...document.querySelectorAll(PARTICIPANT_SELECTOR),
    ]
      .map(participantProfileFromRow)
      .filter(Boolean);
    const ownCandidates = participants.filter(
      (profile) => profile.extension !== contact.extension,
    );
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
      const image = candidate.matches("img")
        ? candidate
        : candidate.querySelector("img");
      const imageUrl = image?.currentSrc || image?.src || "";
      if (imageUrl) {
        return imageUrl;
      }

      for (const element of [candidate, ...candidate.querySelectorAll("*")]) {
        const backgroundImage = window.getComputedStyle(element).backgroundImage;
        const match = String(backgroundImage || "").match(
          /^url\(["']?(.*?)["']?\)$/,
        );
        if (match?.[1]) {
          return match[1];
        }
      }
    }
    return "";
  }

  function synchronizeOwnProfile(profiles) {
    const detected =
      ownProfileFromVisibleMessages(profiles) ||
      ownProfileFromDirectParticipants();
    const cached = readCachedOwnProfile();
    const applicationProfileImage = ownProfileImageFromApplicationHeader();
    const matchingCached =
      detected && cached?.extension === detected.extension ? cached : null;
    const profile = detected
      ? {
          ...detected,
          imageUrl:
            applicationProfileImage ||
            detected.imageUrl ||
            matchingCached?.imageUrl ||
            "",
          initials:
            detected.initials ||
            matchingCached?.initials ||
            initialsFromName(detected.name),
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
      document.documentElement.style.setProperty(
        "--slack-me-name",
        JSON.stringify("Moi"),
      );
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
    document.documentElement.style.setProperty(
      "--slack-me-name",
      JSON.stringify(profile.name),
    );
    document.documentElement.style.setProperty(
      "--slack-me-avatar",
      profile.imageUrl
        ? `url(${JSON.stringify(profile.imageUrl)})`
        : initialsAvatarCssUrl(profile),
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
      const nameElement = item.querySelector(".header-name");
      const fullName = String(nameElement?.textContent || "").trim();
      const extension = extensionFromText(fullName);

      if (!extension || profiles.has(extension)) {
        return;
      }

      const image = item.querySelector(
        "app-avatar img.avatar-content, app-avatar img",
      );
      const initialElement = item.querySelector(
        "app-avatar .avatar-content:not(img)",
      );
      const name = fullName.replace(new RegExp(`\\s*${extension}\\s*$`), "").trim();
      const profile = {
        extension,
        name,
        imageUrl: image?.src || "",
        initials:
          initialElement?.textContent?.trim() || initialsFromName(name),
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
      header?.querySelector("#showParticipants")?.textContent || "",
    ).trim();
    const extension = extensionFromText(fullName);

    // Les conversations directes affichent « Nom Prénom 62 » dans l'en-tête.
    // Un groupe ne se termine normalement pas par un numéro d'extension.
    if (!header || !extension) {
      return null;
    }

    const name = fullName
      .replace(new RegExp(`\\s*${extension}\\s*$`), "")
      .trim();
    if (!name) {
      return null;
    }

    const avatar = header.querySelector("app-avatar");
    const image = avatar?.querySelector("img.avatar-content, img");
    const initialElement = avatar?.querySelector(
      ".avatar-content:not(img)",
    );

    return {
      extension,
      name,
      imageUrl: image?.src || "",
      initials:
        initialElement?.textContent?.trim() || initialsFromName(name),
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
      profile.imageUrl
        ? `url(${JSON.stringify(profile.imageUrl)})`
        : initialsAvatarCssUrl(profile),
    );
  }

  function visibleCssColor(value) {
    const color = String(value || "").trim();
    if (
      !color ||
      color === "transparent" ||
      color === "none" ||
      color === "currentcolor"
    ) {
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
          (attribute) =>
            attribute.name !== "class" &&
            !attribute.name.startsWith("data-dec-"),
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
    if (
      element.dataset.decPresenceColor &&
      element.dataset.decPresenceSignature === signature
    ) {
      return element.dataset.decPresenceColor;
    }

    const wasHidden = element.classList.contains(
      "dec-slack-native-presence-hidden",
    );
    if (wasHidden) {
      element.classList.remove("dec-slack-native-presence-hidden");
    }
    const colorCandidates = [];
    try {
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        const compactNode =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.width <= 24 &&
          rect.height <= 24;
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
          const candidates = [
            { value: style.backgroundColor, weight: 120 },
          ];
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
                metrics.saturation < 0.08 &&
                (metrics.luminance < 0.08 || metrics.luminance > 0.92);
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
    const bestColor = colorCandidates.sort(
      (left, right) => right.score - left.score,
    )[0]?.color || "";
    if (bestColor) {
      element.dataset.decPresenceColor = bestColor;
      element.dataset.decPresenceSignature = signature;
    }
    return bestColor;
  }

  function nativeConversationPresenceFromHeader(
    header,
    ignoredTitle,
    visibleTitle,
  ) {
    const nativeSemanticSelector =
      "[class*='status' i], [class*='presence' i], [data-status], " +
      "[data-presence], [data-qa*='status' i], [data-qa*='presence' i]";
    const candidateSelector = `${nativeSemanticSelector}, small, .text-muted`;
    const ignoredLabels = new Set(
      [visibleTitle, ignoredTitle.textContent]
        .map((value) => String(value || "").replace(/\s+/g, " ").trim())
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
        .map((value) => String(value || "").replace(/\s+/g, " ").trim())
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
        parent &&
        parent !== header &&
        !parent.querySelector("button, a, [role='button']");
      const color =
        nativePresenceColor(element) ||
        (parentCanContainDot ? nativePresenceColor(parent) : "");
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
    title.classList.add(
      "dec-slack-conversation-title",
      "dec-slack-native-title-hidden",
    );

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
        .forEach((element) =>
          element.classList.remove("dec-slack-native-presence-hidden"),
        );
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

    titleCard.querySelector(".dec-slack-conversation-title-name").textContent =
      visibleTitle;
    const statusLine = titleCard.querySelector(
      ".dec-slack-conversation-presence",
    );
    const statusText = titleCard.querySelector(
      ".dec-slack-conversation-presence-text",
    );
    const statusDot = titleCard.querySelector(
      ".dec-slack-conversation-presence-dot",
    );
    statusLine.hidden = !presence;
    delete statusLine.dataset.status;
    statusText.textContent = presence;
    if (presenceColor) {
      statusDot.style.setProperty("background-color", presenceColor, "important");
    } else {
      statusDot.style.removeProperty("background-color");
    }
    titleCard.setAttribute(
      "aria-label",
      presence ? `${visibleTitle}, ${presence}` : visibleTitle,
    );
    titleCard.onclick = () => title.click();

    const actionCandidates = [
      ...new Set(
        header.querySelectorAll("button, a.btn, [role='button'], .btn"),
      ),
    ].filter(
      (control) =>
        control !== title &&
        !title.contains(control) &&
        control !== titleCard &&
        !titleCard.contains(control) &&
        !control.closest(".dropdown-menu, [role='menu']"),
    );
    const actionButtons = actionCandidates.filter(
      (control) =>
        !actionCandidates.some(
          (other) => other !== control && other.contains(control),
        ),
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
      actionContainer.setAttribute(
        "aria-label",
        "Actions de la conversation",
      );
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
    const initials =
      profile?.initials || initialsFromName(profile?.name || fallbackName);
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
    return /\b(?:typing|is typing|are typing|ecrit|ecrivent|en train d'ecrire|en cours d'ecriture|redige|redigent|redaction en cours)\s*(?:\.{2,3}|…)?$/.test(text);
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
      document
        .querySelector("chat-messages-header #showParticipants")
        ?.textContent || "",
    ).trim();
    const expectedLabels = [
      nativeTitle,
      directProfile
        ? `${directProfile.name} ${directProfile.extension}`
        : "",
      directProfile?.name,
    ]
      .filter(Boolean)
      .map(normalizedTypingText);
    const items = [...document.querySelectorAll("chat-item")];
    const routeId = String(
      window.location.hash.match(/^#\/chat\/([^/?#]+)/)?.[1] || "",
    );
    const routeFragment = routeId ? `/chat/${routeId}` : "";
    const routeItem = routeFragment
      ? items.find((item) =>
          [
            item,
            ...item.querySelectorAll(
              "[href], [routerlink], [ng-reflect-router-link]",
            ),
          ].some(
            (element) =>
              [
                element.getAttribute("href"),
                element.getAttribute("routerlink"),
                element.getAttribute("ng-reflect-router-link"),
              ].some((value) => String(value || "").includes(routeFragment)),
          ),
        )
      : null;

    return (
      routeItem ||
      items.find((item) => {
        const label = normalizedTypingText(
          item.querySelector(".header-name")?.textContent || "",
        );
        return expectedLabels.some(
          (expected) => label === expected || label.startsWith(`${expected} `),
        );
      }) ||
      items.find((item) =>
        Boolean(
          item.matches(
            ".active, .selected, [aria-current='page'], [data-selected='true']",
          ) ||
            item.closest(
              ".active, .selected, [aria-current='page'], [data-selected='true']",
            ),
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
    activeItem?.querySelectorAll("*").forEach((element) =>
      candidates.add(element),
    );
    const matches = [...candidates].filter(
      (element) =>
        !element.closest(`#${TYPING_INDICATOR_ID}`) &&
        !element.querySelector("chat-message, #chat-form-controls") &&
        containsTypingText(nativeTypingElementText(element)),
    );

    /* Ne conserve que le nœud le plus précis portant le texte. Sans ce filtre,
       toute la barre d'en-tête pourrait être masquée avec son enfant natif. */
    return matches.filter(
      (element) =>
        !matches.some(
          (other) => other !== element && element.contains(other),
        ),
    );
  }

  function imageUrlFromCssBackground(value) {
    const match = String(value || "").match(/^url\(["']?(.*?)["']?\)$/i);
    return match?.[1] || "";
  }

  function typingProfileCandidates(profiles) {
    const candidates = new Map(profiles);

    document
      .querySelectorAll(`${MESSAGE_SELECTOR} > .message-name`)
      .forEach((nameElement) => {
        const fullName = String(nameElement.textContent || "").trim();
        const extension = extensionFromText(fullName);
        if (!extension) {
          return;
        }

        const name = fullName
          .replace(new RegExp(`\\s*${extension}\\s*$`), "")
          .trim();
        const known = candidates.get(extension);
        const avatar = nameElement.parentElement?.querySelector(
          `.${AVATAR_CLASS}`,
        );
        const imageUrl =
          known?.imageUrl ||
          imageUrlFromCssBackground(avatar?.style.backgroundImage);
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
        profile?.extension &&
        profile.extension !== currentOwnProfile?.extension &&
        profile.name,
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

    const combinedText = normalizedTypingText(
      elements.map(nativeTypingElementText).join(" "),
    );
    const candidates = typingProfileCandidates(profiles);
    const matchedExtensions = new Set();

    elements.forEach((element) => {
      element
        .querySelectorAll("app-avatar img[alt], img.avatar-content[alt]")
        .forEach((image) => {
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
      const escapedExtension = String(profile.extension).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );
      const fullNamePosition = normalizedName
        ? combinedText.indexOf(normalizedName)
        : -1;
      const uniqueFirstNamePosition =
        firstName && firstNameCounts.get(firstName) === 1
          ? combinedText.search(
              new RegExp(
                `(?:^|[^a-z0-9])${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`,
              ),
            )
          : -1;
      const extensionPosition = combinedText.search(
        new RegExp(`(?:^|\\D)${escapedExtension}(?:\\D|$)`),
      );
      const positions = [
        fullNamePosition,
        uniqueFirstNamePosition,
        extensionPosition,
      ].filter((position) => position >= 0);
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

  function ensureTypingIndicator() {
    const messages = [...document.querySelectorAll(MESSAGE_SELECTOR)];
    const lastMessage = messages.at(-1) || null;
    const host = lastMessage?.parentElement;
    if (!lastMessage || !host) {
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

    if (
      indicator.parentElement !== host ||
      lastMessage.nextSibling !== indicator
    ) {
      host.insertBefore(indicator, lastMessage.nextSibling);
    }
    return indicator;
  }

  function messageScrollContainer(message) {
    let element = message?.parentElement || null;
    while (element && element !== document.body) {
      const style = window.getComputedStyle(element);
      const canScrollVertically = /^(auto|scroll|overlay)$/.test(
        style.overflowY,
      );
      if (
        canScrollVertically &&
        element.scrollHeight > element.clientHeight + 1
      ) {
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
      const distanceFromBottom =
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
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

    const referenceMessage =
      indicator.previousElementSibling?.matches?.(MESSAGE_SELECTOR)
        ? indicator.previousElementSibling
        : [...document.querySelectorAll(MESSAGE_SELECTOR)].at(-1) || null;
    indicator.remove();
    refreshNativeReadTracking(referenceMessage);
    return true;
  }

  function enhanceTypingIndicator(profiles) {
    const elements = nativeTypingElements();
    const activeElements = new Set(elements);
    document
      .querySelectorAll(`.${HIDDEN_NATIVE_TYPING_CLASS}`)
      .forEach((element) => {
        if (!activeElements.has(element)) {
          element.classList.remove(HIDDEN_NATIVE_TYPING_CLASS);
        }
      });

    const typingProfiles = profilesFromTypingElements(elements, profiles);
    if (elements.length === 0 || typingProfiles.length === 0) {
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
        (profile) =>
          `${profile.extension}|${profile.name}|${profile.imageUrl}|${profile.initials}`,
      )
      .join(";");

    if (indicator.dataset.decTypingProfiles !== profileKey) {
      indicator.dataset.decTypingProfiles = profileKey;
      const avatarContainer = indicator.querySelector(
        ".dec-slack-typing-avatars",
      );
      const avatars = typingProfiles.map((profile) => {
        const avatar = document.createElement("span");
        avatar.className = "dec-slack-typing-avatar";
        avatar.setAttribute("aria-hidden", "true");
        applyProfileToAvatar(
          avatar,
          profile,
          profile.name,
          profile.extension,
        );
        return avatar;
      });
      avatarContainer.replaceChildren(...avatars);
    }

    const names = typingProfiles.map((profile) => profile.name);
    const label =
      names.length === 1
        ? `${names[0]} écrit…`
        : `${names.join(", ")} écrivent…`;
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
      const startsMessageGroup = messageInner.querySelector(
        ":scope > .message-text.new-sender",
      );
      if (!startsMessageGroup) {
        return;
      }

      avatarProfile = ownMessage
        ? currentOwnProfile
        : directConversationProfileFromHeader();
      if (!avatarProfile) {
        return;
      }
      visibleName = avatarProfile.name || (ownMessage ? "Moi" : "Interlocuteur");
      extension =
        avatarProfile.extension || (ownMessage ? "self" : "contact");
    }

    let avatar = messageInner.querySelector(`:scope > .${AVATAR_CLASS}`);
    if (!avatar) {
      avatar = createAvatarElement();
      messageInner.prepend(avatar);
    }

    applyProfileToAvatar(
      avatar,
      avatarProfile,
      visibleName.replace(/\s*\d+\s*$/, ""),
      extension,
    );
  }

  function receiptLooksRead(receipt) {
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
      (node) =>
        !checkIcons.some(
          (other) => other !== node && node.contains(other),
        ),
    );
    if (leafCheckIcons.length >= 2) {
      return true;
    }

    const visibleShapes = nodes.filter(
      (node) =>
        node.matches?.("path, polyline, polygon, line") &&
        isRenderedInsideReceipt(node),
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
        const hasImage = [
          style.backgroundImage,
          style.maskImage,
          style.webkitMaskImage,
        ].some((value) => value && value !== "none");
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
    clone
      .querySelectorAll("[data-dec-created], [data-dec-read-profile]")
      .forEach((element) => {
        delete element.dataset.decCreated;
        delete element.dataset.decReadProfile;
      });
    [clone, ...clone.querySelectorAll("*")].forEach((element) => {
      [...element.classList]
        .filter((className) => className.startsWith("dec-slack-"))
        .forEach((className) => element.classList.remove(className));
    });
    const renderedSignature = [receipt, ...receipt.querySelectorAll("*")]
      .flatMap((element) => [null, "::before", "::after"].map((pseudo) => {
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
      }))
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
    const nativeState = (element) => [
      nativeClassSignature(element),
      nativeAttributeSignature(element),
    ].join(":");

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
        child.classList.contains(SENT_RECEIPT_COPY_CLASS) &&
        child.dataset.decCreated === "true",
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

  function enhanceReadReceipts() {
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
    const directConversation = Boolean(directConversationProfileFromHeader());
    if (directConversation && records.some((record) => !record.isRead)) {
      const visibleMessages = [...document.querySelectorAll(MESSAGE_SELECTOR)];
      const learnedReadSignatures = new Set(
        records
          .filter((record) => record.isRead)
          .map((record) => record.signature),
      );

      const messagesBeforeContactReply = new WeakSet();
      let contactReplyFound = false;
      for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
        const message = visibleMessages[index];
        if (contactReplyFound) {
          messagesBeforeContactReply.add(message);
        }
        if (message.querySelector(".message-inner.message-left")) {
          contactReplyFound = true;
        }
      }

      records.forEach((record) => {
        if (messagesBeforeContactReply.has(record.message)) {
          learnedReadSignatures.add(record.signature);
        }
      });
      records.forEach((record) => {
        record.isRead ||= learnedReadSignatures.has(record.signature);
      });
    }
    const readRecords = records.filter((record) => record.isRead);
    const latestRead = readRecords.at(-1) || null;
    const latestMessage = latestRead?.message || null;
    const latestReceipt = latestRead?.receipt || null;
    const directProfile = latestRead
      ? directConversationProfileFromHeader()
      : null;
    const portraitHost = latestMessage
      ? fullWidthReceiptHost(latestMessage)
      : null;
    const validSentHosts = new Set();

    document
      .querySelectorAll(`${MESSAGE_SELECTOR}.${LATEST_READ_CLASS}`)
      .forEach((message) => {
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
        receipt.classList.toggle(
          REDUNDANT_READ_RECEIPT_CLASS,
          receipt !== latestReceipt,
        );
        Array.from(host.children)
          .filter((child) => child.classList.contains(SENT_RECEIPT_COPY_CLASS))
          .forEach((copy) => copy.remove());
      } else {
        receipt.classList.remove(
          HIDDEN_READ_RECEIPT_CLASS,
          REDUNDANT_READ_RECEIPT_CLASS,
        );
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

    document
      .querySelectorAll(`delivered-check.${HIDDEN_READ_RECEIPT_CLASS}`)
      .forEach((receipt) => {
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
      (child) =>
        child.classList.contains(READ_AVATAR_CLASS) &&
        child.dataset.decCreated === "true",
    );
    if (!portrait) {
      portrait = document.createElement("span");
      portrait.className = READ_AVATAR_CLASS;
      portrait.dataset.decCreated = "true";
      portraitHost.appendChild(portrait);
    }

    if (portrait.dataset.decReadProfile !== profileKey) {
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
      message.querySelector(".message-inner.message-right"),
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
      image.closest("a[download]")?.getAttribute("download") || "";
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
      const originalUrl = new URL(
        previewUrl.replace(/\.preview(?:[?#].*)?$/, ""),
      );
      if (originalUrl.origin !== window.location.origin) {
        return "";
      }
      originalUrl.searchParams.set("sessionId", sessionId);
      return originalUrl.href;
    } catch {
      return "";
    }
  }

  function loadOriginalImagePreview(image) {
    const originalUrl = image.dataset.decOriginalPreviewUrl || "";
    if (!originalUrl || image.dataset.decOriginalPreviewState === "loading") {
      return;
    }

    image.dataset.decOriginalPreviewState = "loading";
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => {
      if (
        image.isConnected &&
        image.dataset.decOriginalPreviewUrl === originalUrl
      ) {
        image.srcset = "";
        image.src = originalUrl;
        image.dataset.decOriginalPreviewState = "ready";
      }
    };
    probe.onerror = () => {
      if (image.dataset.decOriginalPreviewUrl === originalUrl) {
        image.dataset.decOriginalPreviewState = "failed";
      }
    };
    probe.src = originalUrl;
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
    const sessionId = currentChatSessionId();
    if (!sessionId) {
      return;
    }

    const previewObserver = ensureOriginalPreviewObserver();
    document
      .querySelectorAll(
        'chat-message file-preview a[download] img[src*="/MyPhone/downloadChatFile/"][src*=".preview"]',
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
          image.dataset.decOriginalPreviewState === "ready" ||
          image.dataset.decOriginalPreviewState === "loading" ||
          image.dataset.decOriginalPreviewState === "failed"
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

  function chatToastSignature(toast) {
    const copy = toast.cloneNode(true);
    copy.querySelectorAll("button").forEach((button) => button.remove());
    return String(copy.textContent || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function isCompleteChatToast(toast) {
    return Boolean(
      toast.querySelector("button.btn-primary") &&
        toast.querySelector("button.btn-gray"),
    );
  }

  function positionChatToastStack() {
    let top = 12;
    document
      .querySelectorAll(
        "chat-searcher-component.layout-type4-header, " +
          ".layout-type4-header, #dec-slack-controls",
      )
      .forEach((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.height > 0
        ) {
          top = Math.max(top, rect.bottom + 12);
        }
      });
    let nextTop = Math.ceil(top);
    document
      .querySelectorAll(`${CHAT_TOAST_SELECTOR}.dec-slack-chat-toast`)
      .forEach((toast) => {
        if (!toast.isConnected) {
          return;
        }
        const style = window.getComputedStyle(toast);
        if (style.display === "none" || style.visibility === "hidden") {
          return;
        }

        toast.style.setProperty(
          "--dec-slack-chat-toast-top",
          `${nextTop}px`,
        );
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
    toast.setAttribute(
      "aria-label",
      "Ouvrir la conversation de cette notification",
    );

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "dec-slack-chat-toast-close";
    closeButton.setAttribute("aria-label", "Fermer la notification");
    closeButton.title = "Fermer";
    closeButton.textContent = "×";
    toast.appendChild(closeButton);

    toast.addEventListener("click", (event) => {
      if (event.target.closest(".dec-slack-chat-toast-close")) {
        event.stopPropagation();
        toast.querySelector("button.btn-gray")?.click();
        return;
      }

      // Évite la récursion lorsque le clic natif Répondre remonte jusqu'ici.
      if (event.target.closest("button.btn-primary, button.btn-gray")) {
        return;
      }
      toast.querySelector("button.btn-primary")?.click();
    });

    toast.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toast.querySelector("button.btn-primary")?.click();
      } else if (event.key === "Escape") {
        event.preventDefault();
        toast.querySelector("button.btn-gray")?.click();
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
            (node.matches(CHAT_TOAST_SELECTOR) ||
              node.querySelector(CHAT_TOAST_SELECTOR))
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
    ensureControls();
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
    enhanceOriginalImagePreviews();
    initialMessageScan = false;
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
        "#chat-form-controls, " +
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

    const changedNodes = [
      ...mutation.addedNodes,
      ...mutation.removedNodes,
    ];
    return (
      changedNodes.length === 0 ||
      changedNodes.some(
        (node) =>
          !isInsideIgnoredUpdateArea(node) && !isUserscriptOwnedNode(node),
      )
    );
  }

  applyPreferences();
  ensureControls();
  initializeCustomEmojis();
  initializeEmojiAutocomplete();
  initializeChatToastNotifications();

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
  }, 2500);
  scheduleUpdate();
})();
