import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'

const APP_DIR = '/home/rodrigo/Projetos/Vega/vega'
const SHOT_DIR = '/tmp/vegatest/shots'
fs.mkdirSync(SHOT_DIR, { recursive: true })

async function main() {
  const app = await electron.launch({
    executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
    args: ['--no-sandbox', path.join(APP_DIR, 'out/main/index.js')],
    env: {
      ...process.env,
      DBUS_SYSTEM_BUS_ADDRESS: 'unix:path=/tmp/vegatest/private-bus.sock'
    },
    timeout: 30_000
  })

  app.on('close', () => console.log('electron app closed'))
  const proc = app.process()
  proc.stdout?.on('data', (d) => process.stdout.write('[main stdout] ' + d))
  proc.stderr?.on('data', (d) => process.stdout.write('[main stderr] ' + d))

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  await page.screenshot({ path: path.join(SHOT_DIR, '01-landing.png') })
  console.log(
    '01-landing screenshot taken, status:',
    await page.evaluate(() => document.querySelector('.status-pill')?.textContent)
  )

  const searchInput = page.locator('input[placeholder^="Buscar pacotes"]')
  await searchInput.click()
  await searchInput.fill('firefox')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(SHOT_DIR, '02-search-results.png') })
  console.log('02-search-results screenshot taken')

  // Switch to the Updates tab (read-only: pacman -Qu + flatpak update answering "n").
  // Scoped to .content to avoid matching the sidebar's "Atualizações e Pontos
  // de Restauração" module link, which has the same leading text.
  await page.click('.content button:has-text("Atualizações")')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: path.join(SHOT_DIR, '03-updates.png') })
  console.log('03-updates screenshot taken')

  const bodyText = await page.evaluate(() => document.body.innerText)
  console.log('--- page text snapshot ---')
  console.log(bodyText.slice(0, 3000))

  await app.close()
}

main().catch((err) => {
  console.error('driver failed:', err)
  process.exit(1)
})
