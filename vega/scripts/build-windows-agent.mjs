import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryDir = resolve(projectDir, '..')
const output = resolve(repositoryDir, 'dist/windows/vega-agent.exe')
mkdirSync(dirname(output), { recursive: true })

const result = spawnSync(
  'go',
  ['build', '-trimpath', '-ldflags=-s -w', '-o', output, './cmd/vega-agent'],
  {
    cwd: resolve(repositoryDir, 'vega-agent'),
    env: {
      ...process.env,
      GOOS: 'windows',
      GOARCH: 'amd64',
      CGO_ENABLED: '0',
      GOCACHE: process.env.GOCACHE || resolve(tmpdir(), 'vega-agent-gocache')
    },
    stdio: 'inherit'
  }
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
