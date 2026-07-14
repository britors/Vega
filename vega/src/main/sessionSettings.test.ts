import { describe, expect, it } from 'vitest'
import { validateWallpaperPathInput } from './sessionSettings'

describe('validateWallpaperPathInput', () => {
  it('aceita paths locais absolutos com Unicode e espaços', () => {
    expect(() => validateWallpaperPathInput('/home/josé/Imagens/東京 noite.jpg')).not.toThrow()
  })

  it('rejeita URI remota, path relativo e extensão executável', () => {
    for (const value of ['https://example.test/image.jpg', 'imagem.jpg', '/tmp/imagem.jpg\r\ncalc.exe', '/tmp/wallpaper.exe']) {
      expect(() => validateWallpaperPathInput(value)).toThrow()
    }
  })
})
