import { describe, expect, it } from 'vitest'
import { validateWallpaperPathInput } from './sessionSettings'

describe('validateWallpaperPathInput', () => {
  it('aceita paths Windows locais com Unicode e espaços', () => {
    expect(() => validateWallpaperPathInput('C:\\Users\\José\\Imagens\\東京 noite.jpg', 'win32')).not.toThrow()
  })

  it('rejeita URI remota, path relativo e extensão executável', () => {
    for (const value of ['https://example.test/image.jpg', 'imagem.jpg', 'C:\\Temp\\imagem.jpg\r\ncalc.exe', 'C:\\Temp\\wallpaper.exe']) {
      expect(() => validateWallpaperPathInput(value, 'win32')).toThrow()
    }
  })
})
