// ==UserScript==
// @name         3CX Slack — thème, avatars et emojis
// @namespace    https://decindustrie.3cx.no/
// @version      1.5.8
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
  const CONTROLS_ID = "dec-slack-controls";
  const STORAGE_LAYOUT = "decSlackLayout";
  const STORAGE_THEME = "decSlackTheme";
  const STORAGE_ACCENT = "decSlackAccent";
  const STORAGE_EMOJI_MANIFEST = "decSlackEmojiManifest";
  const STORAGE_SEARCH_COLLAPSED = "decSlackSearchCollapsed";
  const STORAGE_NOTIFICATION_SOUND = "decSlackNotificationSound";
  const STORAGE_CHAT_SESSION_ID = "decSlackChatSessionId";
  const STORAGE_OWN_PROFILE = "decSlackOwnProfile";
  const CUSTOM_EMOJI_CLASS = "dec-slack-custom-emoji";
  const EMOJI_AUTOCOMPLETE_ID = "dec-slack-emoji-autocomplete";
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
  const knownChatToasts = new WeakMap();
  const initialChatToasts = new WeakSet();
  const enhancedChatToasts = new WeakSet();
  const customEmojis = new Map();
  let initialMessageScan = true;
  let chatToastObserver = null;
  let chatToastStackInitialized = false;
  let emojiAutocompleteState = null;
  let emojiAutocompleteInitialized = false;
  let suppressAnimationsUntil = performance.now() + 1200;
  let customEmojiRevision = 0;
  let customNotificationSound = null;
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

    soundButton.dataset.active = String(preferences.notificationSound);
    soundButton.dataset.available = String(Boolean(customNotificationSound));
    soundButton.setAttribute(
      "aria-pressed",
      String(preferences.notificationSound),
    );
    soundButton.textContent = preferences.notificationSound ? "🔔" : "🔕";
    soundButton.title = customNotificationSound
      ? preferences.notificationSound
        ? "Désactiver le son personnalisé"
        : "Activer et tester le son personnalisé"
      : "Aucun son personnalisé dans le manifeste";

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
      <button
        type="button"
        class="dec-slack-control-button"
        data-dec-control="sound"
        aria-label="Activer ou désactiver le son personnalisé"
      ></button>
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
      if (!customNotificationSound) {
        return;
      }

      preferences.notificationSound = !preferences.notificationSound;
      writeSetting(
        STORAGE_NOTIFICATION_SOUND,
        String(preferences.notificationSound),
      );
      updateControls();

      if (preferences.notificationSound) {
        playCustomNotification({ preview: true });
      } else if (notificationAudio) {
        notificationAudio.pause();
        notificationAudio.currentTime = 0;
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

  function notificationSoundDefinitionFrom(source, baseUrl) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return null;
    }

    const entry = source.notificationSound;
    const rawUrl = typeof entry === "string" ? entry : entry?.url;
    if (!rawUrl) {
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
      return { url: url.href, volume };
    } catch {
      return null;
    }
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
    const nextNotificationSound = notificationSoundDefinitionFrom(
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
    const soundChanged = !notificationSoundDefinitionsAreEqual(
      customNotificationSound,
      nextNotificationSound,
    );

    if (!emojisChanged && !soundChanged) {
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

    if (soundChanged) {
      clearNotificationAudio();
      customNotificationSound = nextNotificationSound;
      if (preferences.notificationSound) {
        void prepareNotificationAudio();
      }
      updateControls();
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
      option.dataset.active = String(index === state.activeIndex);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === state.activeIndex));

      const image = document.createElement("img");
      image.src = definition.url;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";

      const text = document.createElement("span");
      text.className = "dec-slack-emoji-suggestion-code";
      text.textContent = `:${definition.code}:`;

      option.append(image, text);
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
        event.preventDefault();
        insertEmojiSuggestion(state.matches[state.activeIndex].code);
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

  function conversationPresenceFromHeader(header, ignoredTitle) {
    const statusPattern =
      /\b(Non enregistré|Voyage d'affaires|Disponible|Absent|Ne pas déranger|Occupé|En réunion|Déjeuner|En déplacement|Hors ligne|Unregistered|Business trip|Available|Away|Do not disturb|Busy|Offline)\b/i;
    const candidates = [];

    header
      .querySelectorAll(
        "[class*='status'], [class*='presence'], [data-status], " +
          "[title], [aria-label], small, .text-muted",
      )
      .forEach((element) => {
        if (
          ignoredTitle.contains(element) ||
          element.closest(".dec-slack-conversation-actions") ||
          element.closest(".dec-slack-conversation-title-card")
        ) {
          return;
        }
        candidates.push(
          element.textContent,
          element.getAttribute("title"),
          element.getAttribute("aria-label"),
          element.getAttribute("data-status"),
        );
      });
    candidates.push(header.textContent);

    for (const candidate of candidates) {
      const match = String(candidate || "").match(statusPattern);
      if (match) {
        return match[1];
      }
    }
    return "";
  }

  function conversationPresenceKind(status) {
    const normalized = String(status || "").toLocaleLowerCase("fr-FR");
    if (/non enregistré|unregistered/.test(normalized)) {
      return "unregistered";
    }
    if (/voyage d'affaires|business trip/.test(normalized)) {
      return "business-trip";
    }
    if (/déjeuner/.test(normalized)) {
      return "lunch";
    }
    if (/disponible|available/.test(normalized)) {
      return "available";
    }
    if (/absent|away|déplacement/.test(normalized)) {
      return "away";
    }
    if (/ne pas déranger|occupé|réunion|do not disturb|busy/.test(normalized)) {
      return "busy";
    }
    return "offline";
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

  function nativePresenceColor(element) {
    if (!element) {
      return "";
    }
    if (element.dataset.decPresenceColor) {
      return element.dataset.decPresenceColor;
    }

    const nodes = [element, ...element.querySelectorAll("*")];
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
        const candidates = [style.backgroundColor];
        if (Number.parseFloat(style.borderTopWidth) > 0) {
          candidates.push(style.borderTopColor);
        }
        if (node.namespaceURI === "http://www.w3.org/2000/svg") {
          candidates.push(style.fill, style.stroke, style.color);
        } else if (compactNode || (pseudo && style.content !== "none")) {
          candidates.push(style.color);
        }
        for (const candidate of candidates) {
          const color = visibleCssColor(candidate);
          if (color) {
            element.dataset.decPresenceColor = color;
            return color;
          }
        }
      }
    }
    return "";
  }

  function hideNativeConversationPresence(header, ignoredTitle, presence) {
    if (!presence) {
      return "";
    }

    const exactStatusPattern =
      /^(Non enregistré|Voyage d'affaires|Disponible|Absent|Ne pas déranger|Occupé|En réunion|Déjeuner|En déplacement|Hors ligne|Unregistered|Business trip|Available|Away|Do not disturb|Busy|Offline)$/i;
    const statusContainerSelector =
      "[class*='status'], [class*='presence'], [data-status], small, .text-muted";
    let color = "";

    [...header.querySelectorAll("*")].forEach((element) => {
      if (
        element === ignoredTitle ||
        ignoredTitle.contains(element) ||
        element.closest(".dec-slack-conversation-actions") ||
        element.closest(".dec-slack-conversation-title-card")
      ) {
        return;
      }

      const text = String(element.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!exactStatusPattern.test(text)) {
        return;
      }

      const semanticContainer = element.closest(statusContainerSelector);
      const target =
        semanticContainer && header.contains(semanticContainer)
          ? semanticContainer
          : element;
      color ||= nativePresenceColor(target);
      target.classList.add("dec-slack-native-presence-hidden");
    });
    return color;
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
    const presence = profile
      ? conversationPresenceFromHeader(header, title)
      : "";
    const presenceColor = profile
      ? hideNativeConversationPresence(header, title, presence)
      : "";
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
    statusLine.dataset.status = conversationPresenceKind(presence);
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
    const stack = document.getElementById(CHAT_TOAST_STACK_ID);
    if (!stack) {
      return;
    }

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
    stack.style.setProperty("top", `${Math.ceil(top)}px`, "important");
  }

  function ensureChatToastStack() {
    let stack = document.getElementById(CHAT_TOAST_STACK_ID);
    if (!stack && document.body) {
      stack = document.createElement("div");
      stack.id = CHAT_TOAST_STACK_ID;
      stack.setAttribute("role", "region");
      stack.setAttribute("aria-label", "Notifications 3CX");
      document.body.appendChild(stack);
    }

    if (!chatToastStackInitialized) {
      chatToastStackInitialized = true;
      window.addEventListener("resize", positionChatToastStack);
      document.addEventListener("scroll", positionChatToastStack, true);
    }
    positionChatToastStack();
    return stack;
  }

  function enhanceChatToastAppearance(toast) {
    const stack = ensureChatToastStack();
    if (stack && toast.parentElement !== stack) {
      stack.appendChild(toast);
    }
    if (enhancedChatToasts.has(toast)) {
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

    ensureChatToastStack();
    document.querySelectorAll(CHAT_TOAST_SELECTOR).forEach((toast) => {
      initialChatToasts.add(toast);
      processChatToastNotification(toast);
    });

    chatToastObserver = new MutationObserver((mutations) => {
      const candidateToasts = new Set();
      mutations.forEach((mutation) => {
        chatToastsFromMutation(mutation).forEach((toast) => {
          candidateToasts.add(toast);
        });
      });
      candidateToasts.forEach(processChatToastNotification);
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

  applyPreferences();
  ensureControls();
  initializeCustomEmojis();
  initializeEmojiAutocomplete();
  initializeChatToastNotifications();

  const observer = new MutationObserver(scheduleUpdate);
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
  window.setInterval(scheduleUpdate, 2500);
  scheduleUpdate();
})();
