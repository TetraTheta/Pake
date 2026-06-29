# Pake

This is a customized local fork of Pake for packaging webpages as lightweight desktop apps.

This fork is not published to npm or any other registry. `pnpm install -g pake-cli`, `npm install -g pake-cli`, `npx pake`, and `npx pake-cli` may fetch the upstream package, so build and run this checkout locally to use the customized code.

For the full upstream project introduction, screenshots, and community information, see the [upstream README](https://github.com/tw93/Pake#readme).

## Getting Started

- **CLI packaging**: see [CLI Usage](docs/cli-usage.md) for all command options.
- **GitHub Actions build**: see [GitHub Actions Online Building](docs/github-actions-usage.md).
- **Advanced customization**: see [Advanced Usage](docs/advanced-usage.md).
- **Troubleshooting**: see [FAQ](docs/faq.md).

## Local CLI Setup

Run these commands from the repository root in PowerShell.

```powershell
pnpm install
pnpm run cli:build
pnpm link --global
```

To use the pnpm version pinned by this project, run through `corepack`.

```powershell
corepack pnpm@10.26.2 install
corepack pnpm@10.26.2 run cli:build
corepack pnpm@10.26.2 link --global
```

Verify the link:

```powershell
pake --version
Get-Command pake
```

If `Get-Command pake` points to an executable linked from this repository, the local CLI is active.

You can also run the built CLI temporarily without a global link.

```powershell
node .\dist\cli.js https://example.com --name MyApp
```

After changing CLI source under `bin/`, regenerate `dist/cli.js`.

```powershell
pnpm run cli:build
```

## Usage

```bash
pake https://github.com --name GitHub

pake https://weekly.tw93.fun --name Weekly --icon https://cdn.tw93.fun/pake/weekly.icns --width 1200 --height 800 --hide-title-bar
```

First-time packaging can be slow because Tauri prerequisites and build caches are prepared. Later builds reuse local caches.

## Icon Sizes

When `--icon` is not provided, Pake fetches the website icon and converts it to the platform format below.

| Platform            | Output icon      | Sizes                           |
| ------------------- | ---------------- | ------------------------------- |
| Windows             | `.ico`           | 16, 24, 32, 48, 64, 128, 256    |
| macOS               | `.icns`          | 16, 32, 64, 128, 256, 512, 1024 |
| macOS tray          | `.png`           | 512                             |
| macOS tray override | `.png` or `.ico` | 32 to 512 recommended           |
| Linux               | `.png`           | 512                             |

`--tray minimized` creates the tray icon on demand when the window is hidden, keeping startup lighter than `--tray always`.

## Development

Rust `>=1.85` and Node `>=22` are recommended. Node `>=18` may also work. See the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for platform setup.

```bash
pnpm i
pnpm run dev
pnpm run build
```

Useful checks:

```bash
pnpm run cli:build
npx vitest run
pnpm test -- --no-build
```

## License

Pake is open source under GPL-3.0. See [LICENSE](./LICENSE) and [Pake Output Exception](./LICENSE-EXCEPTION). Apps you build with Pake are yours to use and distribute.
