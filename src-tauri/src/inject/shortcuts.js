const shortcuts = {
  "[": () => window.history.back(),
  "]": () => window.history.forward(),
  "-": () => zoomOut(),
  "=": () => zoomIn(),
  "+": () => zoomIn(),
  0: () => setZoom("100%"),
  r: () => window.location.reload(),
  ArrowUp: () => scrollTo(0, 0),
  ArrowDown: () => scrollTo(0, document.body.scrollHeight),
};

const appShortcuts = {
  l: () => navigator.clipboard.writeText(window.location.href),
  w: () => window.__TAURI__?.core?.invoke("hide_main_window"),
  h: () => {
    window.location.href = window.pakeConfig.url;
  },
  Delete: () => window.__TAURI__?.core?.invoke("clear_cache_restart"),
};

function handleShortcut(event) {
  if (event.shiftKey && appShortcuts[event.key]) {
    event.preventDefault();
    appShortcuts[event.key]();
    return;
  }

  if (!event.shiftKey && appShortcuts[event.key.toLowerCase()]) {
    event.preventDefault();
    appShortcuts[event.key.toLowerCase()]();
    return;
  }

  if (shortcuts[event.key]) {
    event.preventDefault();
    shortcuts[event.key]();
  }
}

function handleShortcutKeydown(event) {
  if (event.repeat) {
    return;
  }

  if (/windows|linux/i.test(navigator.userAgent) && event.ctrlKey) {
    handleShortcut(event);
  }
  if (/macintosh|mac os x/i.test(navigator.userAgent) && event.metaKey) {
    handleShortcut(event);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (window["pakeConfig"]?.disabled_web_shortcuts === true) {
    return;
  }

  document.addEventListener("keydown", handleShortcutKeydown, true);
});
