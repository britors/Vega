import type { WebPreferences } from 'electron'

export function secureWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false
  }
}
