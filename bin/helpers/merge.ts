import path from 'path';
import fsExtra from 'fs-extra';

import combineFiles from '@/utils/combine';
import logger from '@/options/logger';
import {
  generateSafeFilename,
  generateIdentifierSafeName,
  getSafeAppName,
  generateLinuxPackageName,
} from '@/utils/name';
import {
  PakeAppOptions,
  PakeTauriConfig,
  SupportedPlatform,
  TauriPlatform,
  WindowConfig,
} from '@/types';
import { tauriConfigDirectory, npmDirectory } from '@/utils/dir';
import { LINUX_TARGET_TYPES } from '@/utils/targets';

/**
 * Pure transform from CLI options to the window-config slice that gets
 * merged into pake.json. Exposed for snapshot testing so option drift
 * (e.g. a new flag added in cli-program.ts but forgotten here) is caught.
 *
 * Keep this function side-effect free.
 */
export function buildWindowConfigOverrides(
  options: PakeAppOptions,
  platform: SupportedPlatform = asSupportedPlatform(process.platform),
): Partial<WindowConfig> {
  const platformHideOnClose = options.hideOnClose ?? platform === 'darwin';
  const platformHideTitleBar =
    platform === 'darwin' ? options.hideTitleBar : false;
  const trayEnabled = options.tray !== 'never';
  return {
    width: options.width,
    height: options.height,
    fullscreen: options.fullscreen,
    maximize: options.maximize,
    resizable: options.resizable ?? true,
    hide_title_bar: platformHideTitleBar,
    activation_shortcut: options.activationShortcut,
    always_on_top: options.alwaysOnTop,
    dark_mode: options.darkMode,
    disabled_web_shortcuts: options.disabledWebShortcuts,
    hide_on_close: platformHideOnClose,
    incognito: options.incognito,
    title: options.title,
    enable_wasm: options.wasm,
    enable_drag_drop: options.enableDragDrop,
    start_to_tray: options.startToTray && trayEnabled,
    force_internal_navigation: options.forceInternalNavigation,
    internal_url_regex: options.internalUrlRegex,
    enable_find: options.enableFind,
    zoom: options.zoom,
    min_width: options.minWidth,
    min_height: options.minHeight,
    ignore_certificate_errors: options.ignoreCertificateErrors,
    new_window: options.newWindow,
    webview_devtools: options.webviewDevtools,
  };
}

type PlatformIconInfo = {
  fileExt: string;
  path: string;
  message: string;
};

export function getDefaultTrayIconPath(
  platform: SupportedPlatform,
  safeAppName: string,
  macTrayIconExists = false,
): string {
  if (platform !== 'darwin') {
    return '';
  }

  return macTrayIconExists ? `png/${safeAppName}_512.png` : '';
}

function asSupportedPlatform(platform: NodeJS.Platform): SupportedPlatform {
  if (platform !== 'win32' && platform !== 'darwin' && platform !== 'linux') {
    throw new Error(
      `Pake only supports win32, darwin, and linux; detected '${platform}'.`,
    );
  }
  return platform;
}

function toNsisLanguage(language: string): string {
  const languageMap: Record<string, string> = {
    'en-US': 'English',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'zh-CN': 'SimpChinese',
    'zh-TW': 'TradChinese',
  };
  return languageMap[language] ?? language;
}

async function copyTemplateConfigs(): Promise<void> {
  const srcTauriDir = path.join(npmDirectory, 'src-tauri');
  await fsExtra.ensureDir(tauriConfigDirectory);

  const sourceFiles = [
    'tauri.conf.json',
    'tauri.macos.conf.json',
    'tauri.windows.conf.json',
    'tauri.linux.conf.json',
    'pake.json',
  ];

  await Promise.all(
    sourceFiles.map(async (file) => {
      const sourcePath = path.join(srcTauriDir, file);
      const destPath = path.join(tauriConfigDirectory, file);
      if (
        (await fsExtra.pathExists(sourcePath)) &&
        !(await fsExtra.pathExists(destPath))
      ) {
        await fsExtra.copy(sourcePath, destPath);
      }
    }),
  );
}

async function handleLocalFile(
  url: string,
  useLocalFile: boolean,
  tauriConf: PakeTauriConfig,
): Promise<void> {
  const pathExists = await fsExtra.pathExists(url);
  if (pathExists) {
    logger.warn('✼ Your input might be a local file.');

    const fileName = path.basename(url);
    const dirName = path.dirname(url);
    const distDir = path.join(npmDirectory, 'dist');
    const distBakDir = path.join(npmDirectory, 'dist_bak');

    if (!useLocalFile) {
      const urlPath = path.join(distDir, fileName);
      await fsExtra.copy(url, urlPath);
    } else {
      fsExtra.moveSync(distDir, distBakDir, { overwrite: true });
      fsExtra.copySync(dirName, distDir, { overwrite: true });

      const filesToCopyBack = ['cli.js'];
      await Promise.all(
        filesToCopyBack.map((file) =>
          fsExtra.copy(path.join(distBakDir, file), path.join(distDir, file)),
        ),
      );
    }

    tauriConf.pake.windows[0].url = fileName;
    tauriConf.pake.windows[0].url_type = 'local';
  } else {
    tauriConf.pake.windows[0].url_type = 'web';
  }
}

async function mergeLinuxConfig(
  options: PakeAppOptions,
  name: string,
  tauriConf: PakeTauriConfig,
  linuxBinaryName: string,
): Promise<void> {
  const linuxBundle = tauriConf.bundle.linux;
  if (!linuxBundle) {
    throw new Error(
      'Linux bundle configuration is missing from tauri.linux.conf.json; cannot build Linux target.',
    );
  }
  delete linuxBundle.deb.files;

  const linuxName = generateLinuxPackageName(name);
  const desktopFileName = `com.pake.${linuxName}.desktop`;
  const iconName = `${linuxName}_512`;
  const { title } = options;

  const chineseName = title && /[\u4e00-\u9fa5]/.test(title) ? title : null;
  const desktopContent = `[Desktop Entry]
Version=1.0
Type=Application
Name=${name}
${chineseName ? `Name[zh_CN]=${chineseName}` : ''}
Comment=${name}
Exec=${linuxBinaryName}
Icon=${iconName}
Categories=Network;WebBrowser;Utility;
MimeType=text/html;text/xml;application/xhtml_xml;
StartupNotify=true
Terminal=false
`;

  const srcAssetsDir = path.join(npmDirectory, 'src-tauri/assets');
  const srcDesktopFilePath = path.join(srcAssetsDir, desktopFileName);
  await fsExtra.ensureDir(srcAssetsDir);
  await fsExtra.writeFile(srcDesktopFilePath, desktopContent);

  const desktopInstallPath = `/usr/share/applications/${desktopFileName}`;
  linuxBundle.deb.files = {
    [desktopInstallPath]: `assets/${desktopFileName}`,
  };

  if (!linuxBundle.rpm) {
    linuxBundle.rpm = {};
  }
  linuxBundle.rpm.files = {
    [desktopInstallPath]: `assets/${desktopFileName}`,
  };

  const validTargets = [
    ...LINUX_TARGET_TYPES,
    ...LINUX_TARGET_TYPES.map((target) => `${target}-arm64`),
  ];
  const baseTarget = options.targets.includes('-arm64')
    ? options.targets.replace('-arm64', '')
    : options.targets;

  if (validTargets.includes(options.targets)) {
    // zst is repacked from the deb payload, so Tauri itself bundles a deb.
    tauriConf.bundle.targets = [baseTarget === 'zst' ? 'deb' : baseTarget];
  } else {
    logger.warn(
      `✼ The target must be one of ${validTargets.join(', ')}, the default 'deb' will be used.`,
    );
  }
}

async function mergeIcons(
  options: PakeAppOptions,
  name: string,
  tauriConf: PakeTauriConfig,
  platform: SupportedPlatform,
  safeAppName: string,
): Promise<void> {
  const platformIconMap: Record<SupportedPlatform, PlatformIconInfo> = {
    win32: {
      fileExt: '.ico',
      path: `png/${safeAppName}_256.ico`,
      message: 'Windows icon must be .ico and 256x256px.',
    },
    linux: {
      fileExt: '.png',
      path: `png/${generateLinuxPackageName(name)}_512.png`,
      message: 'Linux icon must be .png and 512x512px.',
    },
    darwin: {
      fileExt: '.icns',
      path: `icons/${safeAppName}.icns`,
      message: 'macOS icon must be .icns type.',
    },
  };

  const iconInfo = platformIconMap[platform];
  const resolvedIconPath = options.icon ? path.resolve(options.icon) : null;
  const exists =
    resolvedIconPath && (await fsExtra.pathExists(resolvedIconPath));

  if (exists) {
    let updateIconPath = true;
    const customIconExt = path.extname(resolvedIconPath).toLowerCase();

    if (customIconExt !== iconInfo.fileExt) {
      updateIconPath = false;
      logger.warn(`✼ ${iconInfo.message}, but you give ${customIconExt}`);
      delete tauriConf.bundle.icon;
    } else {
      const iconPath = path.join(npmDirectory, 'src-tauri/', iconInfo.path);

      const absoluteDestPath = path.resolve(iconPath);
      if (resolvedIconPath !== absoluteDestPath) {
        try {
          await fsExtra.copy(resolvedIconPath, iconPath);
        } catch (error) {
          if (
            !(
              error instanceof Error &&
              error.message.includes(
                'Source and destination must not be the same',
              )
            )
          ) {
            throw error;
          }
        }
      }
    }

    if (updateIconPath) {
      tauriConf.bundle.icon = [iconInfo.path];
    } else {
      logger.warn(`✼ No app icon will be configured.`);
    }
  } else {
    if (options.icon) {
      logger.warn('✼ Custom icon path may be invalid; no app icon configured.');
    }
    delete tauriConf.bundle.icon;
  }

  if (platform === 'win32' && tauriConf.bundle.icon?.[0]) {
    await fsExtra.copy(
      path.join(npmDirectory, 'src-tauri', tauriConf.bundle.icon[0]),
      path.join(npmDirectory, 'src-tauri', 'icons', 'icon.ico'),
    );
  }

  // Empty means "use Tauri's embedded default window icon" at runtime.
  // This keeps raw Windows executables independent from bundled resource files.
  let trayIconPath = getDefaultTrayIconPath(platform, safeAppName);
  if (platform === 'darwin') {
    const macTrayIconPath = `png/${safeAppName}_512.png`;
    const absoluteMacTrayIconPath = path.join(
      npmDirectory,
      'src-tauri',
      macTrayIconPath,
    );
    trayIconPath = getDefaultTrayIconPath(
      platform,
      safeAppName,
      await fsExtra.pathExists(absoluteMacTrayIconPath),
    );
  }

  if (options.systemTrayIcon.length > 0) {
    if (platform !== 'darwin') {
      logger.warn(
        '✼ --system-tray-icon is only supported on macOS and will be ignored on this platform.',
      );
    } else {
      try {
        const resolvedTrayIconPath = path.resolve(options.systemTrayIcon);
        if (!(await fsExtra.pathExists(resolvedTrayIconPath))) {
          throw new Error('file does not exist');
        }
        const iconExt = path.extname(resolvedTrayIconPath).toLowerCase();
        if (iconExt === '.png' || iconExt === '.ico') {
          const trayIconFile = `png/${safeAppName}${iconExt}`;
          trayIconPath = trayIconFile;
          await fsExtra.copy(
            resolvedTrayIconPath,
            path.join(npmDirectory, 'src-tauri', trayIconFile),
          );
        } else {
          logger.warn(
            `✼ macOS tray icon must be .png or .ico, but you provided ${iconExt}.`,
          );
          logger.warn('✼ The generated app icon will be used for the tray.');
        }
      } catch (err) {
        logger.warn(
          `✼ Failed to apply macOS tray icon "${options.systemTrayIcon}": ${err instanceof Error ? err.message : String(err)}`,
        );
        logger.warn('✼ The generated app icon will be used for the tray.');
      }
    }
  }

  tauriConf.bundle.resources = trayIconPath ? [trayIconPath] : [];
  tauriConf.pake.system_tray_path = trayIconPath;
  delete tauriConf.app.trayIcon;
}

async function injectCustomCode(
  options: PakeAppOptions,
  tauriConf: PakeTauriConfig,
): Promise<void> {
  const { inject, proxyUrl, multiInstance, multiWindow, wasm } = options;
  const injectFilePath = path.join(
    npmDirectory,
    'src-tauri/src/inject/custom.js',
  );

  if (inject?.length > 0) {
    const injectArray = Array.isArray(inject) ? inject : [inject];
    if (
      !injectArray.every(
        (item) => item.endsWith('.css') || item.endsWith('.js'),
      )
    ) {
      logger.error('The injected file must be in either CSS or JS format.');
      return;
    }
    const files = injectArray.map((filepath) =>
      path.isAbsolute(filepath) ? filepath : path.join(process.cwd(), filepath),
    );
    tauriConf.pake.inject = files;
    await combineFiles(files, injectFilePath);
  } else {
    tauriConf.pake.inject = [];
    await fsExtra.writeFile(injectFilePath, '');
  }

  tauriConf.pake.proxy_url = proxyUrl || '';
  tauriConf.pake.multi_instance = multiInstance;
  tauriConf.pake.multi_window = multiWindow;

  if (wasm) {
    tauriConf.app.security = {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    };
  }
}

async function generateMacEntitlements(
  camera: boolean,
  microphone: boolean,
): Promise<void> {
  const entitlementEntries: string[] = [];
  if (camera) {
    entitlementEntries.push(
      '    <key>com.apple.security.device.camera</key>\n    <true/>',
    );
  }
  if (microphone) {
    entitlementEntries.push(
      '    <key>com.apple.security.device.audio-input</key>\n    <true/>',
    );
  }
  const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
${entitlementEntries.join('\n')}
  </dict>
</plist>
`;
  const entitlementsPath = path.join(
    npmDirectory,
    'src-tauri',
    'entitlements.plist',
  );
  await fsExtra.writeFile(entitlementsPath, entitlementsContent);
}

async function writeAllConfigs(
  tauriConf: PakeTauriConfig,
  platform: SupportedPlatform,
): Promise<void> {
  const platformConfigPaths: Record<SupportedPlatform, string> = {
    win32: 'tauri.windows.conf.json',
    darwin: 'tauri.macos.conf.json',
    linux: 'tauri.linux.conf.json',
  };

  const configPath = path.join(
    tauriConfigDirectory,
    platformConfigPaths[platform],
  );
  const bundleConf = { bundle: tauriConf.bundle };
  await fsExtra.outputJSON(configPath, bundleConf, { spaces: 4 });

  const pakeConfigPath = path.join(tauriConfigDirectory, 'pake.json');
  await fsExtra.outputJSON(pakeConfigPath, tauriConf.pake, { spaces: 4 });

  const tauriConf2 = JSON.parse(JSON.stringify(tauriConf));
  delete tauriConf2.pake;
  if (process.env.NODE_ENV === 'development') {
    tauriConf2.bundle = bundleConf.bundle;
  }
  const configJsonPath = path.join(tauriConfigDirectory, 'tauri.conf.json');
  await fsExtra.outputJSON(configJsonPath, tauriConf2, { spaces: 4 });
}

export async function mergeConfig(
  url: string,
  options: PakeAppOptions,
  tauriConf: PakeTauriConfig,
) {
  await copyTemplateConfigs();

  const {
    appVersion,
    userAgent,
    useLocalFile,
    identifier,
    name = 'pake-app',
    installerLanguage,
    wasm,
    camera,
    microphone,
  } = options;

  const platform = asSupportedPlatform(process.platform);
  if (options.hideTitleBar && platform !== 'darwin') {
    logger.warn(
      '✼ --hide-title-bar is only supported on macOS and will be ignored on this platform.',
    );
  }
  const tauriConfWindowOptions = buildWindowConfigOverrides(options, platform);
  Object.assign(tauriConf.pake.windows[0], { url, ...tauriConfWindowOptions });

  tauriConf.productName = name;
  tauriConf.identifier = identifier;
  tauriConf.version = appVersion;

  const linuxBinaryName = `pake-${generateLinuxPackageName(name)}`;
  tauriConf.mainBinaryName =
    platform === 'linux'
      ? linuxBinaryName
      : `pake-${generateIdentifierSafeName(name)}`;

  if (platform === 'win32') {
    const windowsBundle = tauriConf.bundle.windows;
    if (!windowsBundle) {
      throw new Error(
        'Windows bundle configuration is missing from tauri.windows.conf.json; cannot build Windows target.',
      );
    }
    windowsBundle.nsis ??= { languages: [] };
    windowsBundle.nsis.languages = [toNsisLanguage(installerLanguage)];
  }

  await handleLocalFile(url, useLocalFile, tauriConf);

  const platformMap: Record<SupportedPlatform, TauriPlatform> = {
    win32: 'windows',
    linux: 'linux',
    darwin: 'macos',
  };
  const currentPlatform = platformMap[platform];

  if (userAgent.length > 0) {
    tauriConf.pake.user_agent[currentPlatform] = userAgent;
  }
  tauriConf.pake.system_tray[currentPlatform] = options.tray !== 'never';
  tauriConf.pake.tray_icon_mode = options.tray;

  if (platform === 'linux') {
    await mergeLinuxConfig(options, name, tauriConf, linuxBinaryName);
  }

  if (platform === 'darwin') {
    const validMacTargets = ['app', 'dmg'];
    if (validMacTargets.includes(options.targets)) {
      tauriConf.bundle.targets = [options.targets];
    }
  }

  const safeAppName = getSafeAppName(name);
  await mergeIcons(options, name, tauriConf, platform, safeAppName);

  await injectCustomCode(options, tauriConf);

  if (platform === 'darwin') {
    await generateMacEntitlements(camera, microphone);
  }

  await writeAllConfigs(tauriConf, platform);
}
