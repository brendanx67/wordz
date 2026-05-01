// Cross-platform replacement for the original `cd mcp-server && zip ...`
// build:mcp step. Vercel (Linux) has the system `zip` binary; Windows ships
// bsdtar in System32, which writes zip archives via `-a -cf`. Avoiding the
// system `zip` shim on Windows because Scoop's shim wrapper fails to launch
// the underlying junctioned binary from inside a Bun-spawned shell.
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const mcpDir = resolve(root, 'mcp-server')
const outZip = resolve(root, 'public', 'wordz-mcp.zip')

mkdirSync(dirname(outZip), { recursive: true })
try { rmSync(outZip) } catch { /* ok if missing */ }

const isWin = process.platform === 'win32'

const cmd = isWin
  ? [
      'C:\\Windows\\System32\\tar.exe',
      '-a', '-cf', outZip,
      '--exclude=node_modules', '--exclude=.env', '--exclude=.git',
      '-C', mcpDir, '.',
    ]
  : ['zip', '-rq', outZip, '.', '-x', 'node_modules/*', '.env', '.git/*']

const cwd = isWin ? root : mcpDir
const proc = Bun.spawnSync({ cmd, cwd, stderr: 'inherit', stdout: 'inherit' })
if (proc.exitCode !== 0) {
  console.error(`build-mcp-zip: ${cmd[0]} exited ${proc.exitCode}`)
  process.exit(proc.exitCode ?? 1)
}
