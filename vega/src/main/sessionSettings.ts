import { execFile } from 'node:child_process'
import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface DisplayModeInfo {
  id: string
  width: number
  height: number
  refreshRate: number
  current: boolean
  preferred: boolean
}

export interface DisplayOutputInfo {
  name: string
  connected: boolean
  primary: boolean
  enabled: boolean
  width: number
  height: number
  x: number
  y: number
  currentMode: string
  modes: DisplayModeInfo[]
}

export interface DisplayConfig {
  name: string
  enabled: boolean
  mode: string
  x: number
  y: number
  primary: boolean
}

export interface WallpaperInfo {
  id: string
  name: string
  path: string
  uri: string
  source: string
}

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])

async function commandAvailable(name: string): Promise<boolean> {
  const paths = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const dir of paths) {
    try {
      await access(join(dir, name), constants.X_OK)
      return true
    } catch {
      // Try next PATH entry.
    }
  }
  return false
}

async function run(name: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(name, args, { windowsHide: true })
  return stdout.toString()
}

export async function listDisplays(): Promise<DisplayOutputInfo[]> {
  if (!(await commandAvailable('xrandr'))) return []
  const out = await run('xrandr', ['--query'])
  const outputs: DisplayOutputInfo[] = []
  let current: DisplayOutputInfo | null = null

  for (const line of out.split('\n')) {
    const outputMatch = line.match(/^(\S+)\s+(connected|disconnected)(?:\s+primary)?(?:\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+))?/)
    if (outputMatch) {
      current = {
        name: outputMatch[1],
        connected: outputMatch[2] === 'connected',
        primary: /\sprimary(?:\s|$)/.test(line),
        enabled: Boolean(outputMatch[3]),
        width: Number(outputMatch[3] ?? 0),
        height: Number(outputMatch[4] ?? 0),
        x: Number(outputMatch[5] ?? 0),
        y: Number(outputMatch[6] ?? 0),
        currentMode: outputMatch[3] && outputMatch[4] ? `${outputMatch[3]}x${outputMatch[4]}` : '',
        modes: []
      }
      outputs.push(current)
      continue
    }

    if (!current || !current.connected) continue
    const modeMatch = line.match(/^\s+(\d+)x(\d+)\s+(.+)$/)
    if (!modeMatch) continue
    const [, width, height, rates] = modeMatch
    for (const token of rates.trim().split(/\s+/)) {
      const currentRate = token.includes('*')
      const preferred = token.includes('+')
      const refreshRate = Number(token.replace(/[+*]/g, ''))
      if (!Number.isFinite(refreshRate)) continue
      const id = `${width}x${height}@${refreshRate}`
      current.modes.push({
        id,
        width: Number(width),
        height: Number(height),
        refreshRate,
        current: currentRate,
        preferred
      })
      if (currentRate) current.currentMode = id
    }
  }

  return outputs
}

export async function applyDisplayConfig(config: DisplayConfig): Promise<void> {
  if (!(await commandAvailable('xrandr'))) throw new Error('xrandr não está disponível')
  const args = ['--output', config.name]
  if (!config.enabled) {
    args.push('--off')
  } else {
    const [resolution, refresh] = config.mode.split('@')
    args.push('--mode', resolution)
    if (refresh) args.push('--rate', refresh)
    args.push('--pos', `${Math.max(0, config.x)}x${Math.max(0, config.y)}`)
    if (config.primary) args.push('--primary')
  }
  await run('xrandr', args)
}

async function collectWallpapers(dir: string, source: string, depth = 0): Promise<WallpaperInfo[]> {
  if (depth > 3) return []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const rows: WallpaperInfo[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      rows.push(...(await collectWallpapers(fullPath, source, depth + 1)))
      continue
    }
    if (!entry.isFile() || !imageExtensions.has(extname(entry.name).toLowerCase())) continue
    const info = await stat(fullPath).catch(() => null)
    if (!info || info.size === 0) continue
    rows.push({
      id: fullPath,
      name: basename(entry.name, extname(entry.name)).replace(/[-_]+/g, ' '),
      path: fullPath,
      uri: pathToFileURL(fullPath).toString(),
      source
    })
  }
  return rows
}

export async function listWallpapers(): Promise<WallpaperInfo[]> {
  const dirs: Array<[string, string]> = [
    ['/usr/share/backgrounds', 'Sistema'],
    ['/usr/share/wallpapers', 'Sistema'],
    ['/usr/local/share/backgrounds', 'Sistema'],
    [join(homedir(), 'Pictures', 'Wallpapers'), 'Usuário'],
    [join(homedir(), 'Imagens', 'Wallpapers'), 'Usuário']
  ]
  const rows = (await Promise.all(dirs.map(([dir, source]) => collectWallpapers(dir, source)))).flat()
  const unique = new Map<string, WallpaperInfo>()
  for (const row of rows) unique.set(row.path, row)
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function applyWallpaper(path: string): Promise<string> {
  const uri = pathToFileURL(path).toString()
  if (await commandAvailable('plasma-apply-wallpaperimage')) {
    await run('plasma-apply-wallpaperimage', [path])
    return 'Plasma'
  }
  if (await commandAvailable('gsettings')) {
    await run('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri', uri])
    await run('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri]).catch(() => '')
    return 'GSettings'
  }
  if (await commandAvailable('xfconf-query')) {
    await run('xfconf-query', ['-c', 'xfce4-desktop', '-p', '/backdrop/screen0/monitor0/image-path', '-s', path])
    return 'XFCE'
  }
  if (await commandAvailable('swww')) {
    await run('swww', ['img', path])
    return 'swww'
  }
  throw new Error('Nenhum aplicador de wallpaper compatível encontrado')
}
