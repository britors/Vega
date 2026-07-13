export function updaterEnabled(platform: NodeJS.Platform, packaged: boolean, override?: string): boolean {
  return platform === 'win32' && (packaged || override === '1' || override === 'true')
}

export function safeUpdaterError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/https?:\/\/\S+/gi, '[URL redigida]')
    .replace(/[A-Za-z]:\\[^\r\n]*/g, '[path redigido]')
    .slice(0, 300) || 'Falha desconhecida no atualizador.'
}
