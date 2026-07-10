import type { VegaApi } from '../../preload'

// Lives inside src/renderer/src (the "web" tsconfig's own include glob) on
// purpose, not in src/preload — a declare global block in a file only
// reachable through a cross-project reference redirect (as it was in
// src/preload/index.d.ts) silently fails to merge under `tsc -p`/`--noEmit`,
// which made every window.vega.* call typecheck as `any` with no error.
declare global {
  interface Window {
    vega: VegaApi
  }
}
