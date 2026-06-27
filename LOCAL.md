# Local Usage

This repository is a customized local version of Pake. Until this package is published to npm or crates.io, use it by cloning the repository, building the CLI, and linking the local checkout globally.

## Why Use a Local Link

`pnpm install -g pake-cli`, `npm install -g pake-cli`, `npx pake`, and `npx pake-cli` can fetch the original package from the npm registry. To use the customized code, either run this repository's `dist/cli.js` directly or link the current checkout with `pnpm link --global`.

## Install

Run these commands from the repository root in PowerShell.

```powershell
cd E:\REPO-HDD\Pake
pnpm install
pnpm run cli:build
pnpm link --global
```

To run with the pnpm version pinned by this project, use `corepack`.

```powershell
cd E:\REPO-HDD\Pake
corepack pnpm@10.26.2 install
corepack pnpm@10.26.2 run cli:build
corepack pnpm@10.26.2 link --global
```

## Verify

```powershell
pake --version
Get-Command pake
```

If `Get-Command pake` points to an executable linked from this repository, the local customized CLI is active.

## Use

```powershell
pake https://example.com --name MyApp
```

To run the CLI temporarily without a global link, execute the built file directly.

```powershell
node .\dist\cli.js https://example.com --name MyApp
```

`dist/cli.js` is generated from the `bin/` source files. Rebuild it after changing anything under `bin/`.

```powershell
pnpm run cli:build
```

Or rebuild with the pinned pnpm version.

```powershell
corepack pnpm@10.26.2 run cli:build
```
