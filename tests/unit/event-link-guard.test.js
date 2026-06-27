import fs from "fs";
import path from "path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadEventHelpers({
  withTauri = false,
  pakeConfig = {},
  userAgent = "Mozilla/5.0",
} = {}) {
  const readInject = (filename) =>
    fs.readFileSync(
      path.join(process.cwd(), "src-tauri/src/inject", filename),
      "utf-8",
    );

  const invokeCalls = [];
  const invoke = (command, payload) => {
    invokeCalls.push([command, payload]);
    return Promise.resolve();
  };
  const eventListeners = {};
  const elementsById = new Map();
  const registerListener = (type, handler, options) => {
    eventListeners[type] = eventListeners[type] || [];
    eventListeners[type].push({ handler, options });
  };
  const createElement = (tagName = "div") => ({
    tagName: tagName.toUpperCase(),
    style: {},
    children: [],
    addEventListener: () => {},
    getBoundingClientRect: () => ({ right: 0, bottom: 0 }),
    appendChild(child) {
      this.children.push(child);
      if (child.id) elementsById.set(child.id, child);
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      if (child.id) elementsById.delete(child.id);
    },
    click: () => {},
    set id(value) {
      this._id = value;
      elementsById.set(value, this);
    },
    get id() {
      return this._id;
    },
  });
  const body = createElement("body");
  body.scrollHeight = 0;

  const context = {
    console,
    URL,
    Event: class {},
    Notification: function Notification() {},
    setTimeout,
    clearTimeout,
    scrollTo: () => {},
    navigator: {
      userAgent,
      language: "en-US",
      clipboard: {
        writeText: vi.fn(),
      },
    },
    window: {
      history: {
        back: () => {},
        forward: () => {},
      },
      location: {
        href: "https://example.com/app",
        origin: "https://example.com",
        pathname: "/app",
        reload: () => {},
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
      },
      addEventListener: registerListener,
      dispatchEvent: () => {},
      open: () => ({}),
      isAuthLink: () => false,
      isAuthPopup: () => false,
      matchMedia: () => ({ matches: false }),
      pakeConfig,
    },
    document: {
      addEventListener: registerListener,
      createElement,
      getElementById: (id) => elementsById.get(id) || null,
      getElementsByTagName: () => [{ style: {} }],
      body,
      execCommand: () => {},
    },
  };
  context.window.navigator = context.navigator;
  if (withTauri) {
    context.window.__TAURI__ = {
      core: { invoke },
      window: {
        getCurrentWindow: () => ({
          startDragging: () => {},
          isFullscreen: () => Promise.resolve(false),
          setFullscreen: () => {},
        }),
      },
    };
  }

  runInNewContext(readInject("event.js"), context);
  runInNewContext(readInject("shortcuts.js"), context);
  runInNewContext(readInject("context-menu.js"), context);
  return { ...context, eventListeners, invokeCalls };
}

function runDomReady(context) {
  context.eventListeners.DOMContentLoaded.forEach(({ handler }) => handler());
}

function getClickGuard(context) {
  return context.eventListeners.click.find(
    ({ handler }) => handler.name === "detectAnchorElementClick",
  ).handler;
}

function getShortcutKeydown(context) {
  return context.eventListeners.keydown.find(
    ({ handler }) => handler.name === "handleShortcutKeydown",
  );
}

function makeAnchor(href, target = "_blank") {
  return {
    href,
    target,
    download: "",
    getAttribute: (name) => (name === "href" ? href : ""),
  };
}

function makeClickEvent(anchor) {
  return {
    target: {
      closest: () => anchor,
    },
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
}

describe("event link guard", () => {
  it("bypasses javascript pseudo-links", () => {
    const { shouldBypassPakeLinkHandling } = loadEventHelpers();

    expect(shouldBypassPakeLinkHandling("javascript:void(0)")).toBe(true);
  });

  it("bypasses hash-only anchors", () => {
    const { shouldBypassPakeLinkHandling } = loadEventHelpers();

    expect(shouldBypassPakeLinkHandling("#captcha-confirm")).toBe(true);
  });

  it("keeps normal navigations under Pake handling", () => {
    const { shouldBypassPakeLinkHandling } = loadEventHelpers();

    expect(shouldBypassPakeLinkHandling("https://example.com/account")).toBe(
      false,
    );
  });

  it("navigates macOS auth URLs in the current window", () => {
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
    });
    const openCalls = [];
    const originalWindowOpen = (url, name, specs) => {
      openCalls.push({ url, name, specs });
      return {};
    };

    const result = openAuthNavigation(
      originalWindowOpen,
      "https://www.linkedin.com/login",
      "_blank",
      "width=1200,height=800",
    );

    expect(openCalls).toEqual([]);
    expect(window.location.href).toBe("https://www.linkedin.com/login");
    expect(result).toBe(window);
  });

  it("keeps blank macOS auth popups on the native popup path", () => {
    const popup = {};
    const { openAuthNavigation, window } = loadEventHelpers({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_5)",
    });
    const openCalls = [];
    const originalWindowOpen = (url, name, specs) => {
      openCalls.push({ url, name, specs });
      return popup;
    };

    const result = openAuthNavigation(
      originalWindowOpen,
      "about:blank",
      "login",
      "width=1200,height=800",
    );

    expect(openCalls).toEqual([
      {
        url: "about:blank",
        name: "login",
        specs: "width=1200,height=800",
      },
    ]);
    expect(window.location.href).toBe("https://example.com/app");
    expect(result).toBe(popup);
  });

  it("navigates target blank auth links in-place when new-window is disabled", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.pakeConfig = { new_window: false };
    context.window.isAuthLink = (url) => url.includes("okta.com");
    runDomReady(context);

    const event = makeClickEvent(
      makeAnchor("https://mycompany.okta.com/sso", "_blank"),
    );
    getClickGuard(context)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(context.window.location.href).toBe("https://mycompany.okta.com/sso");
  });

  it("navigates target blank internal links in-place when new-window is disabled", () => {
    const context = loadEventHelpers({ withTauri: true });
    context.window.pakeConfig = {
      new_window: false,
      internal_url_regex: "^https://app\\.example\\.com",
    };
    runDomReady(context);

    const event = makeClickEvent(
      makeAnchor("https://app.example.com/callback", "_blank"),
    );
    getClickGuard(context)(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(context.window.location.href).toBe(
      "https://app.example.com/callback",
    );
  });

  it("does not install the custom context menu when webview devtools is enabled", () => {
    const context = loadEventHelpers({
      withTauri: true,
      pakeConfig: { webview_devtools: true },
    });
    runDomReady(context);

    expect(context.eventListeners.contextmenu).toBeUndefined();
  });

  it("keeps web shortcuts when webview devtools is enabled", () => {
    const context = loadEventHelpers({
      withTauri: true,
      pakeConfig: { webview_devtools: true },
    });
    runDomReady(context);

    expect(getShortcutKeydown(context)?.options).toBe(true);
  });

  it("handles app shortcuts outside the macOS menu path", () => {
    const context = loadEventHelpers({
      withTauri: true,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    runDomReady(context);
    const listener = getShortcutKeydown(context);
    const preventDefault = vi.fn();

    listener.handler({
      key: "l",
      ctrlKey: true,
      shiftKey: false,
      preventDefault,
    });
    listener.handler({
      key: "w",
      ctrlKey: true,
      shiftKey: false,
      preventDefault,
    });
    listener.handler({
      key: "Delete",
      ctrlKey: true,
      shiftKey: true,
      preventDefault,
    });
    listener.handler({
      key: "w",
      ctrlKey: true,
      shiftKey: false,
      repeat: true,
      preventDefault,
    });

    expect(context.navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/app",
    );
    expect(context.invokeCalls).toContainEqual(["hide_main_window", undefined]);
    expect(context.invokeCalls).toContainEqual([
      "clear_cache_restart",
      undefined,
    ]);
    expect(preventDefault).toHaveBeenCalledTimes(3);
  });

  it("bridges Web Badging API calls to explicit badge commands", async () => {
    const { navigator, invokeCalls } = loadEventHelpers({ withTauri: true });

    await navigator.setAppBadge(3.8);
    await navigator.setAppBadge();
    await navigator.setAppBadge(0);

    expect(invokeCalls).toEqual([
      ["set_dock_badge", { count: 3 }],
      ["set_dock_badge_label", { label: "•" }],
      ["clear_dock_badge", undefined],
    ]);
  });

  it("keeps notification display separate from badge increment", async () => {
    const { window, invokeCalls } = loadEventHelpers({ withTauri: true });

    new window.Notification("Hello", { body: "World", icon: "/icon.png" });
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeCalls).toEqual([
      [
        "send_notification",
        {
          params: {
            title: "Hello",
            body: "World",
            icon: "https://example.com/icon.png",
          },
        },
      ],
      ["increment_dock_badge", undefined],
    ]);
  });
});
