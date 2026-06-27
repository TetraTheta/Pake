document.addEventListener("DOMContentLoaded", () => {
  const invoke = window.__TAURI__?.core?.invoke;
  const pakeConfig = window["pakeConfig"] || {};

  if (!invoke || pakeConfig.webview_devtools) {
    return;
  }

  // Language detection and texts
  const isChinese = isChineseLanguage();

  const menuTexts = {
    // Media operations
    downloadImage: isChinese ? "下载图片" : "Download Image",
    downloadVideo: isChinese ? "下载视频" : "Download Video",
    downloadFile: isChinese ? "下载文件" : "Download File",
    copyAddress: isChinese ? "复制地址" : "Copy Address",
    openInBrowser: isChinese ? "浏览器打开" : "Open in Browser",
  };

  // Menu theme configuration
  const MENU_THEMES = {
    dark: {
      menu: {
        background: "#2d2d2d",
        border: "1px solid #404040",
        color: "#ffffff",
        shadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
      },
      item: {
        divider: "#404040",
        hoverBg: "#404040",
      },
    },
    light: {
      menu: {
        background: "#ffffff",
        border: "1px solid #e0e0e0",
        color: "#333333",
        shadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
      },
      item: {
        divider: "#f0f0f0",
        hoverBg: "#d0d0d0",
      },
    },
  };

  // Theme detection and menu styles
  function getTheme() {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    return prefersDark ? "dark" : "light";
  }

  function getMenuStyles(theme = getTheme()) {
    return MENU_THEMES[theme] || MENU_THEMES.light;
  }

  // Menu configuration constants
  const MENU_CONFIG = {
    id: "pake-context-menu",
    minWidth: "120px", // Compact width for better UX
    borderRadius: "6px", // Slightly more rounded for modern look
    fontSize: "13px",
    zIndex: "999999",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    // Menu item dimensions
    itemPadding: "8px 16px", // Increased vertical padding for better comfort
    itemLineHeight: "1.2",
    itemBorderRadius: "3px", // Subtle rounded corners for menu items
    itemTransition: "background-color 0.1s ease",
  };

  // Create custom context menu
  function createContextMenu() {
    const contextMenu = document.createElement("div");
    contextMenu.id = MENU_CONFIG.id;
    const styles = getMenuStyles();

    contextMenu.style.cssText = `
      position: fixed;
      background: ${styles.menu.background};
      border: ${styles.menu.border};
      border-radius: ${MENU_CONFIG.borderRadius};
      box-shadow: ${styles.menu.shadow};
      padding: 4px 0;
      min-width: ${MENU_CONFIG.minWidth};
      font-family: ${MENU_CONFIG.fontFamily};
      font-size: ${MENU_CONFIG.fontSize};
      color: ${styles.menu.color};
      z-index: ${MENU_CONFIG.zIndex};
      display: none;
      user-select: none;
    `;
    document.body.appendChild(contextMenu);
    return contextMenu;
  }

  function createMenuItem(text, onClick, divider = false) {
    const item = document.createElement("div");
    const styles = getMenuStyles();

    item.style.cssText = `
      padding: ${MENU_CONFIG.itemPadding};
      cursor: pointer;
      user-select: none;
      font-weight: 400;
      line-height: ${MENU_CONFIG.itemLineHeight};
      transition: ${MENU_CONFIG.itemTransition};
      white-space: nowrap;
      border-radius: ${MENU_CONFIG.itemBorderRadius};
      margin: 2px 4px;
      border-bottom: ${divider ? `1px solid ${styles.item.divider}` : "none"};
    `;
    item.textContent = text;

    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = styles.item.hoverBg;
    });

    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "transparent";
    });

    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
      hideContextMenu();
    });

    return item;
  }

  function showContextMenu(x, y, items) {
    let contextMenu = document.getElementById(MENU_CONFIG.id);

    // Always recreate menu to ensure theme is up-to-date
    if (contextMenu) {
      contextMenu.remove();
    }
    contextMenu = createContextMenu();

    items.forEach((item) => {
      contextMenu.appendChild(item);
    });

    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";
    contextMenu.style.display = "block";

    // Adjust position if menu goes off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = x - rect.width + "px";
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = y - rect.height + "px";
    }
  }

  function hideContextMenu() {
    const contextMenu = document.getElementById(MENU_CONFIG.id);
    if (contextMenu) {
      contextMenu.style.display = "none";
    }
  }

  function downloadImage(imageUrl) {
    // Convert relative URLs to absolute
    if (imageUrl.startsWith("/")) {
      imageUrl = window.location.origin + imageUrl;
    } else if (imageUrl.startsWith("./")) {
      imageUrl = new URL(imageUrl, window.location.href).href;
    } else if (
      !imageUrl.startsWith("http") &&
      !imageUrl.startsWith("data:") &&
      !imageUrl.startsWith("blob:")
    ) {
      imageUrl = new URL(imageUrl, window.location.href).href;
    }

    // Generate filename from URL
    const filename = getFilenameFromUrl(imageUrl) || "image";

    // Handle different URL types
    if (isSpecialDownload(imageUrl)) {
      // Download blob:/data: natively so it works under strict CSP; the Rust
      // on_download handler saves it to the Downloads folder.
      triggerNativeDownload(imageUrl, filename);
    } else {
      // Regular HTTP(S) image
      const userLanguage = getUserLanguage();
      invoke("download_file", {
        params: {
          url: imageUrl,
          filename: filename,
          language: userLanguage,
        },
      }).catch((error) => {
        console.error("Failed to download image:", filename, error);
        showDownloadError(filename);
      });
    }
  }

  // Check if element is media (image or video)
  function getMediaInfo(target) {
    // Check for img tags
    if (target.tagName.toLowerCase() === "img") {
      return { isMedia: true, url: target.src, type: "image" };
    }

    // Check for video tags
    if (target.tagName.toLowerCase() === "video") {
      return {
        isMedia: true,
        url: target.src || target.currentSrc,
        type: "video",
      };
    }

    // Check for elements with background images
    if (target.style && target.style.backgroundImage) {
      const bgImage = target.style.backgroundImage;
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch) {
        return { isMedia: true, url: urlMatch[1], type: "image" };
      }
    }

    // Check for parent elements with background images
    const parentWithBg =
      target && typeof target.closest === "function"
        ? target.closest('[style*="background-image"]')
        : null;
    if (parentWithBg) {
      const bgImage = parentWithBg.style.backgroundImage;
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch) {
        return { isMedia: true, url: urlMatch[1], type: "image" };
      }
    }

    return { isMedia: false, url: "", type: "" };
  }

  // Simplified menu builder
  function buildMenuItems(type, data) {
    const userLanguage = getUserLanguage();
    const items = [];

    switch (type) {
      case "media":
        const downloadText =
          data.type === "image"
            ? menuTexts.downloadImage
            : menuTexts.downloadVideo;
        items.push(
          createMenuItem(downloadText, () => downloadImage(data.url)),
          createMenuItem(menuTexts.copyAddress, () =>
            navigator.clipboard.writeText(data.url),
          ),
          createMenuItem(menuTexts.openInBrowser, () =>
            invoke("plugin:shell|open", { path: data.url }),
          ),
        );
        break;

      case "link":
        if (data.isFile) {
          items.push(
            createMenuItem(menuTexts.downloadFile, () => {
              const filename = getFilenameFromUrl(data.url);
              invoke("download_file", {
                params: { url: data.url, filename, language: userLanguage },
              }).catch((error) => {
                console.error("Failed to download file:", filename, error);
                showDownloadError(filename);
              });
            }),
          );
        }
        items.push(
          createMenuItem(menuTexts.copyAddress, () =>
            navigator.clipboard.writeText(data.url),
          ),
          createMenuItem(menuTexts.openInBrowser, () =>
            invoke("plugin:shell|open", { path: data.url }),
          ),
        );
        break;
    }

    return items;
  }

  // Handle right-click context menu
  document.addEventListener(
    "contextmenu",
    function (event) {
      const target = event.target;

      // Check for media elements (images/videos)
      const mediaInfo = getMediaInfo(target);

      // Check for links (but not if it's media)
      const linkElement =
        target && typeof target.closest === "function"
          ? target.closest("a")
          : null;
      const isLink = linkElement && linkElement.href && !mediaInfo.isMedia;

      // Only show custom menu for media or links
      if (mediaInfo.isMedia || isLink) {
        event.preventDefault();
        event.stopPropagation();

        let menuItems = [];

        if (mediaInfo.isMedia) {
          menuItems = buildMenuItems("media", mediaInfo);
        } else if (isLink) {
          const linkUrl = linkElement.href;
          menuItems = buildMenuItems("link", {
            url: linkUrl,
            isFile: isDownloadableFile(linkUrl),
          });
        }

        showContextMenu(event.clientX, event.clientY, menuItems);
      }
      // For all other elements, let browser's default context menu handle it
    },
    true,
  );

  // Hide context menu when clicking elsewhere
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideContextMenu();
    }
  });
});
