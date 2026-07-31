// ==UserScript==
// @name         3CX Slack — thème, avatars et emojis
// @namespace    https://decindustrie.3cx.no/
// @version      1.4.1
// @description  Ajoute les noms, avatars, emojis, notifications et contrôles Slack à 3CX.
// @author       DEC Industrie
// @match        https://decindustrie.3cx.no:5001/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(() => {
  "use strict";

  const SCRIPT_MARKER = "__dec3cxSlackAvatars";
  const AVATAR_CLASS = "dec-slack-message-avatar";
  const STYLE_ID = "dec-slack-message-avatar-styles";
  const PARTICIPANT_SELECTOR = "app-chat-participants li";
  const MESSAGE_SELECTOR = "chat-message";
  const ENTER_OTHER_CLASS = "dec-slack-enter-other";
  const ENTER_OWN_CLASS = "dec-slack-enter-own";
  const CONTROLS_ID = "dec-slack-controls";
  const STORAGE_LAYOUT = "decSlackLayout";
  const STORAGE_THEME = "decSlackTheme";
  const STORAGE_ACCENT = "decSlackAccent";
  const STORAGE_EMOJI_MANIFEST = "decSlackEmojiManifest";
  const STORAGE_SEARCH_COLLAPSED = "decSlackSearchCollapsed";
  const STORAGE_CHAT_HEADER_COLLAPSED = "decSlackChatHeaderCollapsed";
  const STORAGE_NOTIFICATION_SOUND = "decSlackNotificationSound";
  const STORAGE_CHAT_SESSION_ID = "decSlackChatSessionId";
  const CUSTOM_EMOJI_CLASS = "dec-slack-custom-emoji";
  const CUSTOM_EMOJI_REFRESH_MS = 5 * 60 * 1000;

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
  const customEmojis = new Map();
  let initialMessageScan = true;
  let suppressAnimationsUntil = performance.now() + 1200;
  let customEmojiRevision = 0;
  let customNotificationSound = null;
  let notificationAudio = null;
  let lastNotificationAt = 0;
  let cachedChatSessionId = (() => {
    try {
      return window.sessionStorage.getItem(STORAGE_CHAT_SESSION_ID) || "";
    } catch {
      return "";
    }
  })();
  let originalPreviewObserver = null;

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
    chatHeaderCollapsed:
      readSetting(STORAGE_CHAT_HEADER_COLLAPSED, "false") === "true",
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
    const chatHeaderButton = controls.querySelector(
      "[data-dec-control='chat-header']",
    );
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

    chatHeaderButton.dataset.active = String(
      preferences.chatHeaderCollapsed,
    );
    chatHeaderButton.setAttribute(
      "aria-pressed",
      String(preferences.chatHeaderCollapsed),
    );
    chatHeaderButton.textContent = preferences.chatHeaderCollapsed ? "▱" : "▤";
    chatHeaderButton.title = preferences.chatHeaderCollapsed
      ? "Déplier l’en-tête de la conversation"
      : "Replier l’en-tête de la conversation";

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
    root.classList.toggle(
      "dec-slack-chat-header-collapsed",
      preferences.chatHeaderCollapsed,
    );
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
        data-dec-control="chat-header"
        aria-label="Replier ou déplier l’en-tête de la conversation"
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
    const chatHeaderButton = controls.querySelector(
      "[data-dec-control='chat-header']",
    );
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

    chatHeaderButton.addEventListener("click", () => {
      preferences.chatHeaderCollapsed = !preferences.chatHeaderCollapsed;
      writeSetting(
        STORAGE_CHAT_HEADER_COLLAPSED,
        String(preferences.chatHeaderCollapsed),
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
      chat-message:has(> .message-name)
        .message-inner:has(> .${AVATAR_CLASS})::before {
        content: none !important;
        display: none !important;
        background-image: none !important;
      }

      chat-message:has(> .message-name)
        .message-inner > .${AVATAR_CLASS} {
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

  function prepareNotificationAudio() {
    if (!customNotificationSound) {
      return null;
    }

    if (
      !notificationAudio ||
      notificationAudio.dataset.decSoundUrl !== customNotificationSound.url
    ) {
      notificationAudio?.pause();
      notificationAudio = new Audio(customNotificationSound.url);
      notificationAudio.dataset.decSoundUrl = customNotificationSound.url;
      notificationAudio.preload = "auto";
    }

    notificationAudio.volume = customNotificationSound.volume;
    return notificationAudio;
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

    const audio = prepareNotificationAudio();
    if (!audio) {
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
      notificationAudio?.pause();
      notificationAudio = null;
      customNotificationSound = nextNotificationSound;
      if (preferences.notificationSound) {
        prepareNotificationAudio();
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
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
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
    if (!nameElement) {
      return;
    }

    const visibleName = String(nameElement.textContent || "").trim();
    const extension = extensionFromText(visibleName);
    const messageInner = message.querySelector(".message-inner");

    if (!extension || !messageInner) {
      return;
    }

    let avatar = messageInner.querySelector(`:scope > .${AVATAR_CLASS}`);
    if (!avatar) {
      avatar = createAvatarElement();
      messageInner.prepend(avatar);
    }

    applyProfileToAvatar(
      avatar,
      profiles.get(extension),
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
    if (!ownMessage) {
      playCustomNotification();
    }
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

  function enhanceVisibleMessages() {
    installAvatarStyles();
    ensureControls();
    synchronizeDirectConversationProfile();
    const profiles = buildParticipantMap();
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

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.documentElement, {
    childList: true,
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
