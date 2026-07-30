import { describe, expect, it } from 'vitest';
import {
  buildBundleIconPaths,
  buildWindowConfigOverrides,
  getDefaultTrayIconPath,
} from '../../bin/helpers/merge';
import { DEFAULT_PAKE_OPTIONS } from '../../bin/defaults';
import type { PakeAppOptions } from '../../bin/types';

function makeOptions(overrides: Partial<PakeAppOptions> = {}): PakeAppOptions {
  return {
    ...DEFAULT_PAKE_OPTIONS,
    identifier: 'com.pake.test',
    ...overrides,
  };
}

describe('buildWindowConfigOverrides', () => {
  it('matches the default snapshot on macOS', () => {
    const result = buildWindowConfigOverrides(makeOptions(), 'darwin');
    expect(result).toMatchSnapshot();
  });

  it('matches the default snapshot on Windows', () => {
    const result = buildWindowConfigOverrides(makeOptions(), 'win32');
    expect(result).toMatchSnapshot();
  });

  it('matches the default snapshot on Linux', () => {
    const result = buildWindowConfigOverrides(makeOptions(), 'linux');
    expect(result).toMatchSnapshot();
  });

  it('respects explicit hideOnClose=false on macOS', () => {
    const result = buildWindowConfigOverrides(
      makeOptions({ hideOnClose: false }),
      'darwin',
    );
    expect(result.hide_on_close).toBe(false);
  });

  it('defaults hideOnClose to true on macOS when undefined', () => {
    const result = buildWindowConfigOverrides(
      makeOptions({ hideOnClose: undefined }),
      'darwin',
    );
    expect(result.hide_on_close).toBe(true);
  });

  it('defaults hideOnClose to false on Linux/Windows when undefined', () => {
    expect(
      buildWindowConfigOverrides(
        makeOptions({ hideOnClose: undefined }),
        'linux',
      ).hide_on_close,
    ).toBe(false);
    expect(
      buildWindowConfigOverrides(
        makeOptions({ hideOnClose: undefined }),
        'win32',
      ).hide_on_close,
    ).toBe(false);
  });

  it('only forwards hideTitleBar on macOS', () => {
    expect(
      buildWindowConfigOverrides(
        { ...makeOptions(), hideTitleBar: true },
        'darwin',
      ).hide_title_bar,
    ).toBe(true);
    expect(
      buildWindowConfigOverrides(
        { ...makeOptions(), hideTitleBar: true },
        'linux',
      ).hide_title_bar,
    ).toBe(false);
    expect(
      buildWindowConfigOverrides(
        { ...makeOptions(), hideTitleBar: true },
        'win32',
      ).hide_title_bar,
    ).toBe(false);
  });

  it('only forwards hideWindowDecorations on Windows and Linux', () => {
    expect(
      buildWindowConfigOverrides(
        { ...makeOptions(), hideWindowDecorations: true },
        'darwin',
      ).hide_window_decorations,
    ).toBe(false);
    expect(
      buildWindowConfigOverrides(
        { ...makeOptions(), hideWindowDecorations: true },
        'linux',
      ).hide_window_decorations,
    ).toBe(true);
    expect(
      buildWindowConfigOverrides(
        { ...makeOptions(), hideWindowDecorations: true },
        'win32',
      ).hide_window_decorations,
    ).toBe(true);
  });

  it('only enables start_to_tray when both flag and tray are on', () => {
    expect(
      buildWindowConfigOverrides(
        makeOptions({ startToTray: true, tray: 'never' }),
        'darwin',
      ).start_to_tray,
    ).toBe(false);
    expect(
      buildWindowConfigOverrides(
        makeOptions({ startToTray: true, tray: 'minimized' }),
        'darwin',
      ).start_to_tray,
    ).toBe(true);
    expect(
      buildWindowConfigOverrides(
        makeOptions({ startToTray: true, tray: 'always' }),
        'darwin',
      ).start_to_tray,
    ).toBe(true);
  });

  it('forwards window/zoom/wasm/new_window flags verbatim', () => {
    const result = buildWindowConfigOverrides(
      makeOptions({
        width: 1400,
        height: 900,
        zoom: 120,
        minWidth: 800,
        minHeight: 600,
        wasm: true,
        enableDragDrop: true,
        ignoreCertificateErrors: true,
        newWindow: true,
        enableFind: true,
        forceInternalNavigation: true,
        internalUrlRegex: '^https://example\\.com',
      }),
      'darwin',
    );
    expect(result).toMatchObject({
      width: 1400,
      height: 900,
      zoom: 120,
      min_width: 800,
      min_height: 600,
      enable_wasm: true,
      enable_drag_drop: true,
      ignore_certificate_errors: true,
      new_window: true,
      enable_find: true,
      force_internal_navigation: true,
      internal_url_regex: '^https://example\\.com',
    });
  });
});

describe('getDefaultTrayIconPath', () => {
  it('uses the embedded default window icon on Windows and Linux', () => {
    expect(getDefaultTrayIconPath('win32', 'demo', true)).toBe('');
    expect(getDefaultTrayIconPath('linux', 'demo', true)).toBe('');
  });

  it('keeps the generated PNG tray icon path on macOS only when present', () => {
    expect(getDefaultTrayIconPath('darwin', 'demo', true)).toBe(
      'png/demo_512.png',
    );
    expect(getDefaultTrayIconPath('darwin', 'demo', false)).toBe('');
  });
});

describe('buildBundleIconPaths', () => {
  it('adds the macOS PNG window icon next to the ICNS bundle icon', () => {
    expect(buildBundleIconPaths('darwin', 'icons/demo.icns', 'demo')).toEqual([
      'icons/demo.icns',
      'png/demo_512.png',
    ]);
  });

  it('keeps a single icon path on Windows and Linux', () => {
    expect(buildBundleIconPaths('win32', 'png/demo_256.ico', 'demo')).toEqual([
      'png/demo_256.ico',
    ]);
    expect(buildBundleIconPaths('linux', 'png/demo_512.png', 'demo')).toEqual([
      'png/demo_512.png',
    ]);
  });
});
