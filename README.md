# Hashed preload marker suffixes remain in emitted JavaScript

Vite 8.3.8 with a manual Rolldown 1.3.2 override builds successfully but emits JavaScript that does not parse. **That override is outside Vite 8.3.8's declared `~1.2.18` range.** The supported Rolldown 1.2.19 combination and Vite 8.4.0-beta.1 with Rolldown 1.3.2 both pass this repro. Verified on 2026-11-18.

This documents the compatibility boundary around [Rolldown #11157](https://github.com/rolldown/rolldown/pull/11157) and [Vite #23221](https://github.com/vitejs/vite/issues/23221). The consumer fix is already present in Vite's main branch and 8.4.0-beta.1; this is not a claim that the unsupported override is covered by Vite 8.3.8's dependency contract.

## Steps

Use Node.js 24.22.3 and pnpm 12.16.1, as pinned in the manifests and `.node-version`.

```sh
pnpm run install:fixtures
pnpm repro:official
pnpm repro
pnpm repro:beta
```

`repro:official` and `repro:beta` exit 0. `repro` exits 1 because an emitted JavaScript chunk fails Node's module parser. No browser globals are executed.

The only application code is:

```js
// fixture/main.js
globalThis.load = () => import('./lazy.js');

// fixture/lazy.js
import './lazy.css';
export const answer = 42;
```

`index.html` loads `main.js`; `lazy.css` contains one rule. Every case builds this same fixture.

## Expected

```text
Vite 8.3.8 / Rolldown 1.2.19: validJavaScript = true
```

Vite replaces the complete preload placeholder with its dependency list. The relevant generated expression has this shape:

```js
preload(() => import('./lazy.js'), __vite__mapDeps([0, 1]))
```

The displayed asset name and helper identifier are simplified; `pnpm show:official` prints the actual entry.

## Actual

```text
Vite 8.3.8 / Rolldown 1.3.2: validJavaScript = false
SyntaxError: missing ) after argument list
```

Rolldown emits a unique `__VITE_PRELOAD__<32 hexadecimal characters>` identifier. Vite 8.3.8 consumes only the `__VITE_PRELOAD__` prefix, leaving the suffix immediately after the dependency expression:

```text
preload(() => import('./lazy.js'), __vite__mapDeps([0, 1])<32-hex-suffix>)
```

The remaining suffix adds 32 bytes per preload call and makes the output invalid. `pnpm show` prints the actual entry before the assertion fails.

## Analysis

[Rolldown #11157](https://github.com/rolldown/rolldown/pull/11157), merge commit `dcfba11ddf4001fcf859d892bfcd5e4daa4ade3c`, changed the native build-import-analysis plugin to generate unique marker identifiers. Its description explicitly says that the change requires a Vite-side update.

In [Vite 8.3.8's consumer](https://github.com/vitejs/vite/blob/v8.3.8/packages/vite/src/node/plugins/importAnalysisBuild.ts), `preloadMarkerRE` matches the fixed prefix, and replacements end at `markerStartPos + preloadMarker.length`.

[Vite 8.4.0-beta.1's consumer](https://github.com/vitejs/vite/blob/v8.4.0-beta.1/packages/vite/src/node/plugins/importAnalysisBuild.ts) matches the optional 32-character suffix and consumes the whole match. The beta case in this repository verifies that it emits parseable JavaScript with Rolldown 1.3.2.

These are published npm packages. No upstream source was patched or recompiled. Source was inspected and the combinations above were executed on 2026-11-18.

The `BUILD_OPTIONS` JSON environment variable lets the same repro test Vite build options. These also failed with Vite 8.3.8 / Rolldown 1.3.2 on 2026-11-18:

```sh
BUILD_OPTIONS='{"minify":false}' pnpm repro
BUILD_OPTIONS='{"modulePreload":false}' pnpm repro
BUILD_OPTIONS='{"modulePreload":{"polyfill":false}}' pnpm repro
```

## How it was found

A Vite application overrode Rolldown to obtain the native MagicString sourcemap fix in [Rolldown #11628](https://github.com/rolldown/rolldown/pull/11628). A build-size comparison exposed the unconsumed marker suffixes. Reduction showed that React, a router, a framework, source maps and minification are not required: one Vite dynamic import is sufficient.

The main application was not included in this repository. All inputs here are synthetic.

## Files

- `baseline/`: Vite 8.3.8 with Rolldown 1.2.19, within Vite's declared range.
- `candidate/`: the same Vite version, manually overriding Rolldown to 1.3.2.
- `beta/`: Vite 8.4.0-beta.1 with Rolldown 1.3.2, demonstrating the existing consumer fix.
- Each dependency graph has an exact manifest, its own pnpm workspace configuration and a frozen lockfile. Separate graphs avoid a runtime module-loader override.
- `fixture/`: shared HTML, JavaScript and CSS.
- `repro.js`: builds the selected graph with default production settings and asserts that every emitted JavaScript chunk parses. `--show` prints the entry.

All runs used macOS arm64, Node.js 24.22.3 and pnpm 12.16.1.
