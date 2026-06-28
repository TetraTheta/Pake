import chalk from 'chalk';
import { program, Option } from 'commander';
import packageJson from '../../package.json';
import { DEFAULT_PAKE_OPTIONS as DEFAULT } from '../defaults';
import { validateNumberInput, validateUrlInput } from '../utils/validate';

export function getCliProgram() {
  const { green, yellow } = chalk;
  const logo = `${chalk.green(' ____       _')}
${green('|  _ \\ __ _| | _____')}
${green('| |_) / _` | |/ / _ \\')}
${green('|  __/ (_| |   <  __/')}  ${yellow('https://github.com/tw93/pake')}
${green('|_|   \\__,_|_|\\_\\___|  can turn any webpage into a desktop app with Rust.')}
`;

  return program
    .addHelpText('beforeAll', logo)
    .usage(`[url] [options]`)
    .helpOption('-h, --help', 'Show help')
    .showHelpAfterError()
    .argument('[url]', 'Web URL or local HTML file to package', validateUrlInput)
    .option('--name <string>', 'App name shown by the OS')
    .addOption(
      new Option(
        '--identifier <string>',
        'App identifier / bundle ID',
      ).hideHelp(),
    )
    .option('--icon <string>', 'Custom app icon file or URL', DEFAULT.icon)
    .option(
      '--width <number>',
      'Initial window width in pixels',
      validateNumberInput,
      DEFAULT.width,
    )
    .option(
      '--height <number>',
      'Initial window height in pixels',
      validateNumberInput,
      DEFAULT.height,
    )
    .option(
      '--use-local-file',
      'Copy local HTML assets into the app bundle',
      DEFAULT.useLocalFile,
    )
    .option('--fullscreen', 'Start the window in fullscreen', DEFAULT.fullscreen)
    .option('--hide-title-bar', 'Hide the macOS title bar', DEFAULT.hideTitleBar)
    .option('--multi-arch', 'Build a universal macOS binary', DEFAULT.multiArch)
    .option(
      '--inject <files>',
      'Inject local CSS/JS files into the page',
      (val, previous) => {
        if (!val) return DEFAULT.inject;

        // Split by comma and trim whitespace, filter out empty strings
        const files = val
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

        // If previous values exist (from multiple --inject options), merge them
        return previous ? [...previous, ...files] : files;
      },
      DEFAULT.inject,
    )
    .option('--debug', 'Build a debug app with verbose output', DEFAULT.debug)
    .addOption(
      new Option(
        '--webview-devtools',
        'Enable WebView developer tools in release builds',
      )
        .default(DEFAULT.webviewDevtools)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--proxy-url <url>',
        'Proxy URL for all network requests (http://, https://, socks5://)',
      )
        .default(DEFAULT.proxyUrl)
        .hideHelp(),
    )
    .addOption(
      new Option('--user-agent <string>', 'Custom user agent')
        .default(DEFAULT.userAgent)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--targets <string>',
        'Output target for the current platform',
      ).default(DEFAULT.targets),
    )
    .addOption(
      new Option(
        '--app-version <string>',
        'App version written to Tauri metadata',
      )
        .default(DEFAULT.appVersion)
        .hideHelp(),
    )
    .addOption(
      new Option('--always-on-top', 'Keep the window above other windows')
        .default(DEFAULT.alwaysOnTop)
        .hideHelp(),
    )
    .addOption(
      new Option('--maximize', 'Start window maximized')
        .default(DEFAULT.maximize)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--dark-mode',
        'Force app to use dark mode (supports macOS, Windows, and Linux)',
      )
        .default(DEFAULT.darkMode)
        .hideHelp(),
    )
    .addOption(
      new Option('--disabled-web-shortcuts', 'Disable common web keyboard shortcuts')
        .default(DEFAULT.disabledWebShortcuts)
        .hideHelp(),
    )
    .addOption(
      new Option('--activation-shortcut <string>', 'Global shortcut that restores the app')
        .default(DEFAULT.activationShortcut)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--tray <mode>',
        'Tray visibility: always, minimized, or never',
      )
        .choices(['always', 'minimized', 'never'])
        .default(DEFAULT.tray),
    )
    .addOption(
      new Option(
        '--system-tray-icon <string>',
        'macOS-only tray icon override; other platforms ignore it',
      )
        .default(DEFAULT.systemTrayIcon)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--hide-on-close [boolean]',
        'Hide window on close instead of exiting (default: true for macOS, false for others)',
      )
        .default(DEFAULT.hideOnClose)
        .argParser((value) => {
          if (value === undefined) return true; // --hide-on-close without value
          if (value === 'true') return true;
          if (value === 'false') return false;
          throw new Error('--hide-on-close must be true or false');
        })
        .hideHelp(),
    )
    .addOption(new Option('--title <string>', 'Window title override').hideHelp())
    .addOption(
      new Option('--incognito', 'Use a private webview session')
        .default(DEFAULT.incognito)
        .hideHelp(),
    )
    .addOption(
      new Option('--wasm', 'Enable WebAssembly support')
        .default(DEFAULT.wasm)
        .hideHelp(),
    )
    .addOption(
      new Option('--enable-drag-drop', 'Enable webview drag and drop')
        .default(DEFAULT.enableDragDrop)
        .hideHelp(),
    )
    .addOption(
      new Option('--keep-binary', 'Copy the raw executable next to the installer')
        .default(DEFAULT.keepBinary)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--no-bundle',
        'Skip installer packaging and output only the raw executable',
      )
        .default(DEFAULT.bundle)
        .hideHelp(),
    )
    .addOption(
      new Option('--multi-instance', 'Allow multiple app processes')
        .default(DEFAULT.multiInstance)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--multi-window',
        'Allow one app process to open multiple windows',
      )
        .default(DEFAULT.multiWindow)
        .hideHelp(),
    )
    .addOption(
      new Option('--start-to-tray', 'Start hidden in the tray when tray is enabled')
        .default(DEFAULT.startToTray)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--force-internal-navigation',
        'Keep all navigation inside the Pake window',
      ).default(DEFAULT.forceInternalNavigation),
    )
    .addOption(
      new Option(
        '--internal-url-regex <string>',
        'Regex for URLs that should stay inside the app',
      ).default(DEFAULT.internalUrlRegex),
    )
    .addOption(
      new Option(
        '--safe-domain <domains>',
        'Comma-separated domains kept inside the app',
      ).default(DEFAULT.safeDomain),
    )
    .addOption(
      new Option(
        '--enable-find',
        'Enable in-page Find UI with Cmd/Ctrl+F/G shortcuts',
      )
        .default(DEFAULT.enableFind)
        .hideHelp(),
    )
    .addOption(
      new Option('--installer-language <string>', 'Windows installer language')
        .default(DEFAULT.installerLanguage)
        .hideHelp(),
    )
    .addOption(
      new Option('--zoom <number>', 'Initial page zoom level (50-200)')
        .default(DEFAULT.zoom)
        .argParser((value) => {
          const zoom = Number(value);
          if (!Number.isFinite(zoom) || zoom < 50 || zoom > 200) {
            throw new Error('--zoom must be a number between 50 and 200');
          }
          return zoom;
        })
        .hideHelp(),
    )
    .addOption(
      new Option('--min-width <number>', 'Minimum window width')
        .default(DEFAULT.minWidth)
        .argParser(validateNumberInput)
        .hideHelp(),
    )
    .addOption(
      new Option('--min-height <number>', 'Minimum window height')
        .default(DEFAULT.minHeight)
        .argParser(validateNumberInput)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--ignore-certificate-errors',
        'Ignore certificate errors (for self-signed certificates)',
      )
        .default(DEFAULT.ignoreCertificateErrors)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--iterative-build',
        'Build app bundle only for faster local iteration',
      )
        .default(DEFAULT.iterativeBuild)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--new-window',
        'Allow sites to open new windows (for auth flows, tabs, branches)',
      ).default(DEFAULT.newWindow),
    )
    .addOption(
      new Option(
        '--install',
        'Auto-install app to /Applications (macOS) after build and remove local bundle',
      )
        .default(DEFAULT.install)
        .hideHelp(),
    )
    .addOption(
      new Option('--camera', 'Request camera permission on macOS')
        .default(DEFAULT.camera)
        .hideHelp(),
    )
    .addOption(
      new Option('--microphone', 'Request microphone permission on macOS')
        .default(DEFAULT.microphone)
        .hideHelp(),
    )
    .version(packageJson.version, '-v, --version')
    .configureHelp({
      sortSubcommands: true,
      visibleOptions: (command) => {
        const options = [...command.options];
        const helpOption = (command as unknown as { _helpOption?: Option })
          ._helpOption;
        if (helpOption) {
          options.push(helpOption);
        }
        return options;
      },
      optionTerm: (option) => {
        return option.flags;
      },
      optionDescription: (option) => {
        return option.description;
      },
    });
}
