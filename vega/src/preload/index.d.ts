import type { VegaApi } from './index'
export type { VegaApi } from './index'

declare global {
  interface Window {
    vega: VegaApi
  }
}
