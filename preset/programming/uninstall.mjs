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
//
// On a dsh 0.2.x host the preset is discovered through a declaration ROW the
// installer wrote into the profile's cordis.patch.yml, not through this
// directory, so removing the row is part of the cleanup. Pass the profile
// patch path (defaults to the one next to DSH_HOME's profiles) to target it:
//
//   node uninstall.mjs --patch C:/Users/<you>/.dsh/profiles/desktop/cordis.patch.yml

import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hasBlock, removeBlock } from './declaration.mjs'
import { uninstallSelf } from './force-superpowers.mjs'

export { uninstallSelf }

/** Which profile patches carry our declaration row: an explicit `--patch`
 * argument, otherwise every profile whose patch contains our block. Scanning
 * beats guessing a profile name — the row only exists where the installer
 * wrote it, and only those files are ever touched.
 * @param {string[]} argv
 * @returns {string[]} */
export function declarationTargets(argv = []) {
	const flag = argv.findIndex((entry) => entry === '--patch')
	if (flag !== -1 && argv[flag + 1] !== undefined) return [argv[flag + 1]]
	const envHome = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== ''
		? process.env.DSH_HOME.trim()
		: join(homedir(), '.dsh')
	const profilesDir = join(envHome, 'profiles')
	let entries = []
	try {
		entries = readdirSync(profilesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
	} catch {
		return []
	}
	return entries
		.map((entry) => join(profilesDir, entry.name, 'cordis.patch.yml'))
		.filter((path) => existsSync(path) && hasBlock(readFileSync(path, 'utf8')))
}

/** Drop our declaration row from one profile patch, leaving every other row.
 * @param {string} patchPath
 * @returns {{ action: string, targetFile?: string, reason?: string }} */
export function uninstallDeclaration(patchPath) {
	if (!existsSync(patchPath)) {
		return { action: 'skipped', reason: 'no profile patch carries a declaration row' }
	}
	const current = readFileSync(patchPath, 'utf8')
	if (!hasBlock(current)) return { action: 'skipped', reason: 'profile patch carries no declaration row' }
	const temporary = `${patchPath}.dsh-programming-mode.tmp`
	writeFileSync(temporary, removeBlock(current))
	renameSync(temporary, patchPath)
	return { action: 'removed', targetFile: patchPath }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const targets = declarationTargets(process.argv.slice(2))
	if (targets.length === 0) console.log('[dsh-programming-mode] declaration: no profile patch carries one')
	for (const target of targets) {
		const patch = uninstallDeclaration(target)
		const detail = patch.reason ? `: ${patch.reason}` : ` from ${patch.targetFile}`
		console.log(`[dsh-programming-mode] declaration ${patch.action}${detail}`)
	}
	const result = uninstallSelf()
	const detail = result.reason ? `: ${result.reason}` : result.version ? ` (v${result.version})` : ''
	console.log(`[dsh-programming-mode] preset ${result.action}${detail}`)
}
