function setZoom(zoom) {
  // Use native WebView zoom (WKWebView pageZoom / WebView2 ZoomFactor) instead of
  // CSS hacks. `transform: scale` and `html.style.zoom` break complex SPAs like
  // ChatGPT: the page shifts right on Windows and parts of the UI stop repainting
  // on macOS. Native zoom recalculates layout exactly like a browser does.
  const zoomPercent = normalizeZoomPercent(zoom);
  const normalizedZoom = `${zoomPercent}%`;
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    invoke("set_zoom", { percent: zoomPercent }).catch(() => {});
  }

  window.localStorage.setItem("htmlZoom", normalizedZoom);
}

function zoomCommon(zoomChange) {
  const currentZoom = window.localStorage.getItem("htmlZoom") || "100%";
  setZoom(zoomChange(normalizeZoomPercent(currentZoom)));
}

function zoomIn() {
  zoomCommon((currentZoom) => `${Math.min(currentZoom + 10, 200)}%`);
}

function zoomOut() {
  zoomCommon((currentZoom) => `${Math.max(currentZoom - 10, 30)}%`);
}

function normalizeZoomPercent(zoom) {
  const parsed = parseFloat(zoom);
  return Number.isFinite(parsed) ? parsed : 100;
}

let pasteAsPlainTextPending = false;

function triggerPasteAsPlainText() {
  pasteAsPlainTextPending = true;
  document.execCommand("paste");
  setTimeout(() => {
    pasteAsPlainTextPending = false;
  }, 100);
}

function toggleNativeFullscreen(appWindow) {
  appWindow
    .isFullscreen()
    .then((fullscreen) => appWindow.setFullscreen(!fullscreen))
    .catch((error) => {
      console.warn("[Pake] Failed to toggle native fullscreen:", error);
    });
}

function handleWindowFullscreenShortcut(event) {
  if (
    !event.isTrusted ||
    event.repeat ||
    event.key !== "F11" ||
    !isNonMacDesktop()
  ) {
    return;
  }

  const appWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (!appWindow) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  toggleNativeFullscreen(appWindow);
}

function getDesktopPlatform() {
  return (
    navigator.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent
  );
}

function isNonMacDesktop() {
  return /win|linux/i.test(getDesktopPlatform());
}

function hasImmersiveHeader(config = window["pakeConfig"] || {}) {
  return /mac/i.test(getDesktopPlatform())
    ? config.hide_title_bar === true
    : config.hide_window_decorations === true;
}

function isEditableElement(element) {
  if (!element) return false;

  const tagName = element.tagName;
  return (
    tagName === "INPUT" || tagName === "TEXTAREA" || element.isContentEditable
  );
}

function hasSelectedText() {
  return Boolean(window.getSelection?.()?.toString());
}

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function isTextInputElement(element) {
  return (
    element?.tagName === "INPUT" &&
    !NON_TEXT_INPUT_TYPES.has((element.type || "text").toLowerCase())
  );
}

function selectEditableElement(element) {
  if (typeof element.select === "function") {
    element.select();
    return true;
  }

  if (element.isContentEditable) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection?.();
    if (!selection) return false;

    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  return false;
}

function canPasteIntoEditableElement(element) {
  if (!isEditableElement(element)) return false;

  if (element.tagName === "INPUT") {
    return (
      isTextInputElement(element) &&
      element.disabled !== true &&
      element.readOnly !== true
    );
  }

  if (element.tagName === "TEXTAREA") {
    return element.disabled !== true && element.readOnly !== true;
  }

  return true;
}

function insertTextIntoEditableElement(element, text) {
  if (!text) return false;

  if (document.execCommand("insertText", false, text)) {
    return true;
  }

  if (
    element &&
    (isTextInputElement(element) || element.tagName === "TEXTAREA") &&
    typeof element.setRangeText === "function"
  ) {
    const valueLength =
      typeof element.value === "string" ? element.value.length : 0;
    const start =
      typeof element.selectionStart === "number"
        ? element.selectionStart
        : valueLength;
    const end =
      typeof element.selectionEnd === "number" ? element.selectionEnd : start;
    element.setRangeText(text, start, end, "end");
    element.dispatchEvent?.(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}

let clipboardPasteFallbackTarget;
let clipboardPasteFallbackArmedAt = 0;
// An armed fallback older than this is a leftover from a keyup the window
// never saw (alt-tab mid-press); firing it on a later plain "v" keyup would
// paste unexpectedly.
const CLIPBOARD_PASTE_FALLBACK_TTL_MS = 5000;

function pasteClipboardText(activeElement) {
  const readText = navigator.clipboard?.readText;
  if (typeof readText !== "function") {
    return;
  }

  readText
    .call(navigator.clipboard)
    .then((text) => {
      insertTextIntoEditableElement(activeElement, text);
    })
    .catch(() => {});
}

function handleClipboardShortcut(event) {
  if (
    event.isTrusted !== true ||
    !isNonMacDesktop() ||
    !event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return false;
  }

  const key = event.key?.toLowerCase();
  const activeElement = document.activeElement;
  const isEditable = isEditableElement(activeElement);

  if (key === "c" && (isEditable || hasSelectedText())) {
    document.execCommand("copy");
    event.preventDefault();
    return true;
  }

  if (key === "x" && isEditable) {
    document.execCommand("cut");
    event.preventDefault();
    return true;
  }

  if (key === "v" && canPasteIntoEditableElement(activeElement)) {
    // Let the native WebView paste event run first so images, files, and rich
    // clipboard formats remain intact. If the platform does not emit paste,
    // keyup applies the existing text-only fallback. Key-repeat must not
    // re-arm: after a native paste already fired and disarmed the fallback,
    // a repeat keydown re-arming it would make keyup paste text a second
    // time. Repeats only refresh the TTL of a still-armed target.
    if (!event.repeat) {
      clipboardPasteFallbackTarget = activeElement;
      clipboardPasteFallbackArmedAt = Date.now();
    } else if (clipboardPasteFallbackTarget === activeElement) {
      clipboardPasteFallbackArmedAt = Date.now();
    }
    return false;
  }

  if (key === "a" && isEditable && selectEditableElement(activeElement)) {
    event.preventDefault();
    return true;
  }

  return false;
}

function handleClipboardPasteFallback(event) {
  if (
    event.isTrusted !== true ||
    !isNonMacDesktop() ||
    event.key?.toLowerCase() !== "v"
  ) {
    return false;
  }

  const activeElement = clipboardPasteFallbackTarget;
  const armedAt = clipboardPasteFallbackArmedAt;
  clipboardPasteFallbackTarget = undefined;
  if (
    !activeElement ||
    Date.now() - armedAt > CLIPBOARD_PASTE_FALLBACK_TTL_MS ||
    document.activeElement !== activeElement ||
    !canPasteIntoEditableElement(activeElement)
  ) {
    return false;
  }

  pasteClipboardText(activeElement);
  return true;
}

function handlePaste(event) {
  clipboardPasteFallbackTarget = undefined;
  if (!pasteAsPlainTextPending) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const text = event.clipboardData?.getData("text/plain") || "";
  if (text) {
    document.execCommand("insertText", false, text);
  }
}

const DOWNLOADABLE_FILE_EXTENSIONS = {
  documents: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "rtf",
    "odt",
    "ods",
    "odp",
    "pages",
    "numbers",
    "key",
    "epub",
    "mobi",
  ],
  archives: [
    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
    "gzip",
    "bz2",
    "xz",
    "lzma",
    "deb",
    "rpm",
    "pkg",
    "msi",
    "exe",
    "dmg",
    "apk",
    "ipa",
  ],
  data: [
    "json",
    "xml",
    "csv",
    "sql",
    "db",
    "sqlite",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "log",
  ],
  code: [
    "js",
    "ts",
    "jsx",
    "tsx",
    "css",
    "scss",
    "sass",
    "less",
    "sh",
    "bat",
    "ps1",
  ],
  fonts: ["ttf", "otf", "woff", "woff2", "eot"],
  design: ["ai", "psd", "sketch", "fig", "xd"],
  system: [
    "iso",
    "img",
    "bin",
    "torrent",
    "jar",
    "war",
    "indd",
    "fla",
    "swf",
    "raw",
  ],
};

const ALL_DOWNLOADABLE_EXTENSIONS = Object.values(
  DOWNLOADABLE_FILE_EXTENSIONS,
).flat();

const PREVIEWABLE_MEDIA_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tiff",
  "tif",
  "avif",
  "heic",
  "heif",
  "mp4",
  "webm",
  "mov",
  "m4v",
  "mkv",
  "avi",
  "ogv",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
];

const DOWNLOAD_PATH_PATTERNS = [
  "/download/",
  "/files/",
  "/attachments/",
  "/assets/",
  "/releases/",
  "/dist/",
];

// Language detection utilities
function getUserLanguage() {
  return navigator.language || navigator.userLanguage;
}

function isChineseLanguage(language = getUserLanguage()) {
  return (
    language &&
    (language.startsWith("zh") ||
      language.includes("CN") ||
      language.includes("TW") ||
      language.includes("HK"))
  );
}

// User notification helper
function showDownloadError(filename) {
  const isChinese = isChineseLanguage();
  const message = isChinese
    ? `下载失败: ${filename}`
    : `Download failed: ${filename}`;

  if (window.Notification && Notification.permission === "granted") {
    new Notification(isChinese ? "下载错误" : "Download Error", {
      body: message,
    });
  } else {
    console.error(message);
  }
}

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const extensionIndex = pathname.lastIndexOf(".");
    return extensionIndex > -1 ? pathname.slice(extensionIndex + 1) : "";
  } catch (e) {
    return "";
  }
}

function isPreviewableMedia(url) {
  const extension = getExtension(url);
  return PREVIEWABLE_MEDIA_EXTENSIONS.includes(extension);
}

// Unified file detection - replaces both isDownloadLink and isFileLink
function isDownloadableFile(url) {
  try {
    const extension = getExtension(url);
    if (PREVIEWABLE_MEDIA_EXTENSIONS.includes(extension)) {
      return false;
    }

    const urlObj = new URL(url);
    const hasDownloadHints =
      urlObj.searchParams.has("download") ||
      urlObj.searchParams.has("attachment");

    if (hasDownloadHints) {
      return true;
    }

    return (
      ALL_DOWNLOADABLE_EXTENSIONS.includes(extension) ||
      DOWNLOAD_PATH_PATTERNS.some((pattern) =>
        urlObj.pathname.toLowerCase().includes(pattern),
      )
    );
  } catch (e) {
    return false;
  }
}

function normalizeAnchorHref(rawHref) {
  return typeof rawHref === "string" ? rawHref.trim() : "";
}

function shouldBypassPakeLinkHandling(rawHref) {
  const normalizedHref = normalizeAnchorHref(rawHref).toLowerCase();
  if (!normalizedHref) {
    return false;
  }

  return (
    normalizedHref.startsWith("javascript:") || normalizedHref.startsWith("#")
  );
}

function shouldNavigateAuthInCurrentWindow() {
  return /macintosh|mac os x/i.test(navigator.userAgent);
}

function canNavigateAuthUrl(url) {
  const normalizedUrl = normalizeAnchorHref(url).toLowerCase();
  return normalizedUrl !== "" && normalizedUrl !== "about:blank";
}

function isAppleAuthPopup(url, name) {
  if (name === "AppleAuthentication") {
    return true;
  }

  try {
    return (
      new URL(url, window.location.href).hostname.toLowerCase() ===
      "appleid.apple.com"
    );
  } catch (error) {
    return false;
  }
}

function navigateInCurrentWindow(url) {
  window.location.href = url;
  return window;
}

function openAuthNavigation(originalWindowOpen, url, name, specs) {
  if (isAppleAuthPopup(url, name)) {
    const authWindow = originalWindowOpen.call(window, url, name, specs);
    if (authWindow) {
      return authWindow;
    }
  }

  if (shouldNavigateAuthInCurrentWindow() && canNavigateAuthUrl(url)) {
    return navigateInCurrentWindow(url);
  }

  const authWindow = originalWindowOpen.call(window, url, name, specs);
  if (!authWindow) {
    return navigateInCurrentWindow(url);
  }

  return authWindow;
}

// Trigger a native browser download via a transient anchor click. The Rust
// on_download handler then writes the file to the Downloads folder. This is
// used for blob:/data: URLs because routing their bytes through the Tauri
// IPC fails on strict-CSP sites (e.g. Gemini), whose connect-src blocks the
// IPC origin. The native download path is independent of the page CSP.
function triggerNativeDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

// process special download protocol['data:','blob:']
function isSpecialDownload(url) {
  return ["blob", "data"].some((protocol) => url.startsWith(protocol));
}

document.addEventListener("DOMContentLoaded", () => {
  const tauri = window.__TAURI__;
  const appWindow = tauri.window.getCurrentWindow();
  const invoke = tauri.core.invoke;
  const pakeConfig = window["pakeConfig"] || {};
  const forceInternalNavigation = pakeConfig.force_internal_navigation === true;
  const internalUrlRegex = pakeConfig.internal_url_regex || "";
  let internalUrlPattern = null;
  if (internalUrlRegex) {
    try {
      internalUrlPattern = new RegExp(internalUrlRegex);
    } catch (e) {
      console.error("[Pake] Invalid internal_url_regex pattern:", e);
    }
  }

  if (!document.getElementById("pake-top-dom") && hasImmersiveHeader()) {
    const topDom = document.createElement("div");
    topDom.id = "pake-top-dom";
    document.body.appendChild(topDom);
  }

  const domEl = document.getElementById("pake-top-dom");

  if (domEl) {
    domEl.addEventListener("touchstart", () => {
      appWindow.startDragging();
    });

    domEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (e.buttons === 1 && e.detail !== 2) {
        appWindow.startDragging();
      }
    });

    domEl.addEventListener("dblclick", () => {
      toggleNativeFullscreen(appWindow);
    });
  }

  if (window["pakeConfig"]?.disabled_web_shortcuts !== true) {
    document.addEventListener("keydown", handleWindowFullscreenShortcut, true);
  }

  document.addEventListener("keydown", handleClipboardShortcut, true);
  document.addEventListener("keyup", handleClipboardPasteFallback, true);
  document.addEventListener("paste", handlePaste, true);

  const isDownloadRequired = (url, anchorElement, e) =>
    anchorElement.download || e.metaKey || e.ctrlKey || isDownloadableFile(url);

  const handleExternalLink = (url) => {
    // Don't try to open blob: or data: URLs with shell
    if (isSpecialDownload(url)) {
      console.warn("Cannot open special URL with shell:", url);
      return;
    }

    invoke("plugin:shell|open", {
      path: url,
    }).catch((error) => {
      console.error("Failed to open URL with shell:", url, error);
    });
  };

  // Check if URL belongs to the same domain (including subdomains)
  const isSameDomain = (url) => {
    try {
      const linkUrl = new URL(url);
      const currentUrl = new URL(window.location.href);

      if (linkUrl.hostname === currentUrl.hostname) return true;

      // Extract root domain (e.g., bilibili.com from www.bilibili.com)
      const getRootDomain = (hostname) => {
        const parts = hostname.split(".");
        return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
      };

      return (
        getRootDomain(currentUrl.hostname) === getRootDomain(linkUrl.hostname)
      );
    } catch (e) {
      return false;
    }
  };

  // Check if URL should be treated as internal based on regex pattern or domain
  const isInternalUrl = (url) => {
    // If regex pattern is configured, use it as the primary check
    if (internalUrlPattern) {
      try {
        return internalUrlPattern.test(url);
      } catch (e) {
        console.error("[Pake] Error testing internal_url_regex:", e);
        // Fall back to domain check on error
        return isSameDomain(url);
      }
    }
    // Default to domain-based check
    return isSameDomain(url);
  };

  const detectAnchorElementClick = (e) => {
    // Safety check: ensure e.target exists and is an Element with closest method
    if (!e.target || typeof e.target.closest !== "function") {
      return;
    }
    const anchorElement = e.target.closest("a");

    if (anchorElement && anchorElement.href) {
      const rawHref = anchorElement.getAttribute("href") || "";
      if (shouldBypassPakeLinkHandling(rawHref)) {
        return;
      }

      const target = anchorElement.target;
      const hrefUrl = new URL(anchorElement.href);
      const absoluteUrl = hrefUrl.href;
      let filename = anchorElement.download || getFilenameFromUrl(absoluteUrl);

      // Keep OAuth/authentication flows inside the app. Without --new-window,
      // navigate in place so the SSO redirect chain and callback stay in the
      // webview instead of falling through to the system browser.
      if (window.isAuthLink(absoluteUrl)) {
        console.log("[Pake] Handling OAuth navigation in-app:", absoluteUrl);
        e.preventDefault();
        e.stopImmediatePropagation();

        if (window.pakeConfig?.new_window) {
          openAuthNavigation(
            originalWindowOpen,
            absoluteUrl,
            "_blank",
            "width=1200,height=800,scrollbars=yes,resizable=yes",
          );
        } else {
          window.location.href = absoluteUrl;
        }

        return;
      }

      // Handle _blank links: internal links stay in-app, external links open in the system browser
      if (target === "_blank") {
        if (forceInternalNavigation) {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.location.href = absoluteUrl;
          return;
        }

        if (isInternalUrl(absoluteUrl)) {
          // With --new-window the Rust on_new_window handler opens an in-app
          // window. Without it, leaving target="_blank" untouched lets the
          // native webview escalate the click to a system-browser "new window".
          //
          // Many SPAs (e.g. Plane) tag in-app links with target="_blank" but
          // route the click themselves via a React onClick that calls
          // preventDefault + client-side navigation. Forcing a full
          // window.location reload here (and stopping propagation) would defeat
          // that handler and reload the whole app on every click. Instead,
          // retarget the link to "_self" so the webview never opens a browser
          // window, then let the page's own handler run. If nothing intercepts
          // the click, the default _self navigation keeps it inside the app.
          if (!window.pakeConfig?.new_window) {
            anchorElement.target = "_self";
          }
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        handleExternalLink(absoluteUrl);
        return;
      }

      if (target === "_new") {
        if (forceInternalNavigation) {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.location.href = absoluteUrl;
          return;
        }

        e.preventDefault();
        handleExternalLink(absoluteUrl);
        return;
      }

      // Process download links.
      if (isDownloadRequired(absoluteUrl, anchorElement, e)) {
        // Let the browser download blob:/data: URLs natively; the Rust
        // on_download handler saves them to the Downloads folder. Routing them
        // through the IPC fails on strict-CSP sites (e.g. Gemini), whose
        // connect-src blocks the IPC origin, and on downloads triggered from a
        // sandboxed iframe where the IPC can't be reached.
        if (isSpecialDownload(absoluteUrl)) {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const userLanguage = getUserLanguage();
        invoke("download_file", {
          params: { url: absoluteUrl, filename, language: userLanguage },
        });
        return;
      }

      // Handle regular links: internal URLs allow normal navigation, external links open in the system browser
      if (!target || target === "_self") {
        // Optimization: Allow previewable media to be handled by the app/browser directly
        // This fixes issues where CDN links are treated as external
        if (isPreviewableMedia(absoluteUrl)) {
          return;
        }

        if (!isInternalUrl(absoluteUrl)) {
          if (forceInternalNavigation) {
            return;
          }

          e.preventDefault();
          e.stopImmediatePropagation();
          handleExternalLink(absoluteUrl);
        }
      }
    }
  };

  // Prevent some special websites from executing in advance, before the click event is triggered.
  document.addEventListener("click", detectAnchorElementClick, true);

  // Rewrite the window.open function.
  const originalWindowOpen = window.open;
  window.open = function (url, name, specs) {
    const normalizedUrl = normalizeAnchorHref(url);
    if (normalizedUrl.startsWith("#")) {
      window.location.href = new URL(normalizedUrl, window.location.href).href;
      return window;
    }

    if (shouldBypassPakeLinkHandling(url)) {
      return originalWindowOpen.call(window, url, name, specs);
    }

    // Avoid macOS WebKit auth-popup crashes by navigating auth URLs in-place.
    if (window.isAuthPopup(url, name)) {
      try {
        const baseUrl = window.location.origin + window.location.pathname;
        const absoluteUrl = new URL(url, baseUrl).href;
        return openAuthNavigation(originalWindowOpen, absoluteUrl, name, specs);
      } catch (error) {
        return openAuthNavigation(originalWindowOpen, url, name, specs);
      }
    }

    try {
      const baseUrl = window.location.origin + window.location.pathname;
      const hrefUrl = new URL(url, baseUrl);
      const absoluteUrl = hrefUrl.href;

      if (!isInternalUrl(absoluteUrl)) {
        if (forceInternalNavigation) {
          return originalWindowOpen.call(window, absoluteUrl, name, specs);
        }

        handleExternalLink(absoluteUrl);
        return null;
      }

      // With --new-window the native handler opens an in-app window; without it,
      // originalWindowOpen would route the internal target to the system browser
      // and strand SSO callbacks, so navigate in place instead.
      if (!window.pakeConfig?.new_window) {
        window.location.href = absoluteUrl;
        return window;
      }

      return originalWindowOpen.call(window, absoluteUrl, name, specs);
    } catch (error) {
      return originalWindowOpen.call(window, url, name, specs);
    }
  };

  // Set the default zoom, There are problems with Loop without using try-catch.
  try {
    setDefaultZoom();
  } catch (e) {
    console.log(e);
  }

  // Fix Chinese input method "Enter" on Safari
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Process") e.stopPropagation();
    },
    true,
  );
});

// Bridge the Web Notification + Web Badging APIs to Pake's Rust commands so
// pages running inside the webview can drive the macOS dock badge (and
// taskbar badge on Linux/Windows). Installs synchronously instead of waiting
// for DOMContentLoaded so feature-detection on Notification/setAppBadge
// returns the polyfill before site scripts run.
(function () {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;

  let permVal = "granted";
  let lastNotifTime = 0;
  let lastNotif = null;
  // Pages that drive the badge directly via setAppBadge own its lifecycle;
  // notifications-driven counts auto-clear on the next user interaction.
  let pageManagedBadge = false;
  let autoBadgeActive = false;

  const normalizeBadgeCount = (count) => {
    if (typeof count !== "number" || !Number.isFinite(count)) {
      throw new TypeError("Badge count must be a finite number.");
    }
    const normalized = Math.floor(count);
    return normalized > 0 ? Math.min(normalized, 99999) : null;
  };
  const setBadge = (count) => {
    pageManagedBadge = true;
    autoBadgeActive = false;
    return invoke("set_dock_badge", { count }).catch(() => {});
  };
  const clearBadge = () => invoke("clear_dock_badge").catch(() => {});
  const setLabel = (label) => {
    pageManagedBadge = true;
    autoBadgeActive = false;
    return invoke("set_dock_badge_label", { label }).catch(() => {});
  };
  const incrementAutoBadge = () => {
    if (pageManagedBadge) return Promise.resolve();
    autoBadgeActive = true;
    return invoke("increment_dock_badge").catch(() => {});
  };

  window.addEventListener("focus", () => {
    if (lastNotif?.onclick && Date.now() - lastNotifTime < 5000) {
      lastNotif.onclick(new Event("click"));
      lastNotif = null;
    }
  });

  const clearAutoBadge = () => {
    if (pageManagedBadge || !autoBadgeActive) return;
    autoBadgeActive = false;
    clearBadge();
  };
  document.addEventListener("click", clearAutoBadge, true);
  document.addEventListener("keydown", clearAutoBadge, true);

  const wrappedNotification = function (title, options) {
    const body = options?.body || "";
    let icon = options?.icon || "";
    if (icon.startsWith("/")) {
      icon = window.location.origin + icon;
    }

    const notif = {
      onclick: null,
      onclose: null,
      onshow: null,
      onerror: null,
      close: () => {},
    };

    lastNotifTime = Date.now();
    lastNotif = notif;
    invoke("send_notification", { params: { title, body, icon } })
      .then(() => incrementAutoBadge())
      .then(() => {
        if (notif.onshow) notif.onshow(new Event("show"));
      });

    return notif;
  };

  wrappedNotification.requestPermission = async () => "granted";
  Object.defineProperty(wrappedNotification, "permission", {
    enumerable: true,
    get: () => permVal,
    set: (v) => {
      permVal = v;
    },
  });

  try {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      writable: true,
      value: wrappedNotification,
    });
  } catch (_) {}

  // Web Badging API: https://wicg.github.io/badging/
  // setAppBadge() with no argument shows an indicator dot; with a number,
  // shows the count (0 clears). clearAppBadge() removes the badge entirely.
  const setAppBadge = (count) => {
    if (count === undefined) return setLabel("•");
    let normalized;
    try {
      normalized = normalizeBadgeCount(count);
    } catch (error) {
      return Promise.reject(error);
    }
    if (normalized === null) {
      pageManagedBadge = false;
      autoBadgeActive = false;
      return clearBadge();
    }
    return setBadge(normalized);
  };
  const clearAppBadge = () => {
    pageManagedBadge = false;
    autoBadgeActive = false;
    return clearBadge();
  };
  try {
    Object.defineProperty(navigator, "setAppBadge", {
      configurable: true,
      writable: true,
      value: setAppBadge,
    });
    Object.defineProperty(navigator, "clearAppBadge", {
      configurable: true,
      writable: true,
      value: clearAppBadge,
    });
  } catch (_) {}
})();

function setDefaultZoom() {
  const htmlZoom = window.localStorage.getItem("htmlZoom");
  if (htmlZoom) {
    setZoom(htmlZoom);
  } else if (window.pakeConfig?.zoom && window.pakeConfig.zoom !== 100) {
    setZoom(`${window.pakeConfig.zoom}%`);
  }
}

function getFilenameFromUrl(url) {
  try {
    const urlPath = new URL(url).pathname;
    let filename = urlPath.substring(urlPath.lastIndexOf("/") + 1);

    // If no filename or no extension, generate one
    if (!filename || !filename.includes(".")) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      // Detect image type from URL or data URI
      if (url.startsWith("data:image/")) {
        // Read only the MIME subtype: stop at ';' (params) or ',' (data),
        // whichever comes first, so we never fold the encoding/payload into
        // the extension. Map structured suffixes (svg+xml -> svg) and jpeg.
        const semicolon = url.indexOf(";");
        const comma = url.indexOf(",");
        let end = url.length;
        if (semicolon !== -1) end = Math.min(end, semicolon);
        if (comma !== -1) end = Math.min(end, comma);
        let ext = url.substring(11, end).split("+")[0];
        if (ext === "jpeg") ext = "jpg";
        filename = `image-${timestamp}.${ext}`;
      } else {
        // Default to common image extensions based on common patterns
        if (url.includes("jpg") || url.includes("jpeg")) {
          filename = `image-${timestamp}.jpg`;
        } else if (url.includes("png")) {
          filename = `image-${timestamp}.png`;
        } else if (url.includes("gif")) {
          filename = `image-${timestamp}.gif`;
        } else if (url.includes("webp")) {
          filename = `image-${timestamp}.webp`;
        } else if (url.includes("svg")) {
          filename = `image-${timestamp}.svg`;
        } else {
          filename = `image-${timestamp}.png`; // default
        }
      }
    }

    return filename;
  } catch (e) {
    // Fallback for invalid URLs
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `image-${timestamp}.png`;
  }
}
