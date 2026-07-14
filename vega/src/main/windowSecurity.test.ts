import { describe, expect, it } from 'vitest'
import { secureWebPreferences } from './windowSecurity'

describe('secureWebPreferences', () => {
  it('isola o renderer e desativa integração Node', () => {
    expect(secureWebPreferences('preload.js')).toMatchObject({
      preload: 'preload.js',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    })
  })
})
