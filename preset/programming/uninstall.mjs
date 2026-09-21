// Self-uninstaller planted with the preset. pnpm (what `dsh plugin remove`
// forwards to) runs NO lifecycle hooks of removed packages, so the bundle has
// no chance to clean up after itself at uninstall time. This script is the
// immediate, no-restart cleanup; the planted preset also self-removes at the
// next host boot once no profile installs the bundle anymore (see
// force-superpowers.mjs removeIfOrphaned). It refuses to delete a directory
// without this package's installer stamp, so a hand-written preset sharing the
// name is never touched.
//
//   dsh plugin --profile web remove @ziduup/dsh-programming-mode
//   node ~/.dsh/.agent-presets/programming/uninstall.mjs

import { pathToFileURL } from 'node:url'
import { uninstallSelf } from './force-superpowers.mjs'

export { uninstallSelf }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const result = uninstallSelf()
	const detail = result.reason ? `: ${result.reason}` : result.version ? ` (v${result.version})` : ''
	console.log(`[dsh-programming-mode] ${result.action}${detail}`)
}
