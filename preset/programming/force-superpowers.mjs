// force-superpowers — the 编程模式 preset's first-step skill injection, plus
// the preset's orphan self-removal.
//
// This module ships INSIDE the preset directory and the composition references
// it by relative path (`./force-superpowers.mjs`), never by the bundle's package
// name. The planted copy is therefore self-contained: it resolves
// `using-superpowers` at request time from this preset's own bundled skills/
// and never imports DSH internals or the bundle. A row naming the package
// instead breaks every session recorded on this preset the moment that
// package disappears — `ERR_MODULE_NOT_FOUND` at mount, surfacing to the user
// as "resume failed for session ...".
//
// The hook is scoped to this preset's agents (the row sits in the preset
// composition, so its event dispatch covers exactly the agents joined to it)
// and runs on `agent/pre-step`: it appends the resolved skill's full content to
// the entering batch, so the skill is mechanically present before the model
// replies, independent of whether the model calls the `skill` tool.
//
// Lifecycle: pnpm (what `dsh plugin remove` forwards to) runs no lifecycle
// hooks of removed packages and the market dispatches no uninstall events, so
// the bundle cannot clean up the planted directory at uninstall time. This
// module mounts at every host boot from the planted preset itself, making it
// the cleanup point: when NO profile's package.json references the installer
// package anymore, the preset converts itself into a tombstone (standard-mode
// composition, relabeled metadata) so "uninstall, restart" is the whole story
// — and every session recorded on the preset keeps opening, because the host
// hard-fails a resume whose preset is missing.
//
// Two tombstone shapes, one orphan check: dsh 0.1.x discovers the preset through
// the planted DIRECTORY, so the tombstone rewrites that directory's
// `agent.cordis.yml`; dsh 0.2.x discovers it through a declaration ROW the
// installer wrote into the profile patch, so the tombstone replaces that row
// with the host's own `standard` composition (read through the registry, which
// needs no filesystem guessing). Either way the id stays registered with a
// composition that only names host-shipped packages, which is what keeps a
// resume from throwing `agent-preset/not-found` / `agent-preset/invalid`.

import { copyFileSync, createReadStream, existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { buildDeclaration, hasBlock, profilePatchPath, removeBlock, replaceBlock, writeProfilePatch } from './declaration.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const STAMP_FILENAME = '.dsh-programming-mode.installed.json'
const INSTALLER_PACKAGE = '@ziduup/dsh-programming-mode'
const PRESET_ID = 'programming'

export const name = 'programming-mode-force-superpowers'

const SKILL_NAME = 'using-superpowers'
// Sessions injected by 0.3.8 and earlier carry this producer label on a
// `plugin`-kind source. `alreadyInjected()` still matches it, so a session
// opened after the upgrade is not injected a second time.
const LEGACY_PRODUCER_LABEL = '@deepseek-ai/dsh-programming-mode'

function deleteStamped(dir) {
	let stamp
	try {
		stamp = JSON.parse(readFileSync(join(dir, STAMP_FILENAME), 'utf8'))
	} catch {
		return { action: 'skipped', reason: `${dir} has no installer stamp; refusing to delete a preset we did not plant` }
	}
	if (stamp.source !== 'dsh-programming-mode') {
		return { action: 'skipped', reason: `${dir} was planted by "${stamp.source}"; refusing to delete` }
	}
	rmSync(dir, { recursive: true, force: true })
	return { action: 'removed', dir, version: stamp.version }
}

/** Whether any profile still installs the bundle. Unreadable or zero profile
 * manifests mean "cannot tell", which keeps the preset untouched.
 * @param {string} profilesDir - the `<dshHome>/profiles` directory.
 * @returns {{ action: 'orphaned' } | { action: 'kept', reason: string }} */
function orphanState(profilesDir) {
	let profileDirs
	try {
		profileDirs = readdirSync(profilesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
	} catch {
		return { action: 'kept', reason: `cannot read ${profilesDir}` }
	}
	let readable = 0
	for (const entry of profileDirs) {
		let manifest
		try {
			manifest = JSON.parse(readFileSync(join(profilesDir, entry.name, 'package.json'), 'utf8'))
		} catch {
			continue
		}
		readable += 1
		if (manifest.dependencies && Object.hasOwn(manifest.dependencies, INSTALLER_PACKAGE)) {
			return { action: 'kept', reason: `installer still installed in profile ${entry.name}` }
		}
	}
	if (readable === 0) return { action: 'kept', reason: 'no readable profile manifest; refusing to assume orphaned' }
	return { action: 'orphaned' }
}

/**
 * Uninstall settlement (runs at mount time), in two independent halves.
 *
 * The ROW half is per profile: the profile whose patch declares this preset
 * answers for itself, so uninstalling from one profile cleans that profile even
 * while another still installs the bundle. Judging only globally (the old
 * behaviour) left the row fully active on the uninstalled profile, which is
 * what made an uninstalled profile keep offering a working 编程模式.
 *
 * The DIRECTORY half is global: the planted preset directory is shared by every
 * profile under one `$DSH_HOME`, so it may only be touched once no profile
 * installs the bundle anymore.
 *
 * Both halves ask the same question before they act — does any recorded session
 * still need this preset? A session records the preset it ran under
 * (`agentPreset`), the host resolves a resume through `presets.resolve()` with
 * NO fallback, and a missing preset makes that session unopenable. So:
 *
 *   no history  — remove the row (and delete the directory when it is unowned):
 *                 nothing is left behind, no manual step is needed anywhere;
 *   history     — rewrite the row (and the directory on a 0.1.x host) into an
 *                 honestly-labeled TOMBSTONE: the composition is replaced with
 *                 the host's shipped `standard` composition (its rows name
 *                 packages by specifier, so the husk needs nothing from this
 *                 bundle), the metadata is relabeled, and the injection row
 *                 goes away. Recorded sessions keep opening with standard-mode
 *                 behavior instead of failing, and the stamp gains
 *                 `tombstone: true` so a reinstall re-plants the full mode.
 *
 * Any step that cannot be completed keeps the preset exactly as it is — a
 * half-tombstone is worse than none, because a composition that fails to
 * activate breaks the resume this whole mechanism protects.
 *
 * @param {{
 *   dir?: string,
 *   dshHome?: string,
 *   patchPath?: string,
 *   readDocument?: (id: string) => Promise<{ content: string }>,
 *   shippedStandardDir?: string,
 *   sessionsDir?: string,
 * }} [options] - `patchPath` + `readDocument` drive the 0.2.x declaration-row
 *   half (the host's own values come from `apply()`); `shippedStandardDir` and
 *   `sessionsDir` keep the directory half and the history scan injectable for
 *   tests. Returns a plain object when nothing has to be decided, and a Promise
 *   for a settlement that has to read the session logs.
 */
export function removeIfOrphaned(options = {}) {
	const dir = options.dir ?? here
	const profilesDir = profilesDirOf(options)
	const patchPath = options.patchPath
	const profileDir = patchPath === undefined ? undefined : dirname(patchPath)
	const thisProfileInstalls = profileDir === undefined ? undefined : profileInstalls(profileDir)
	const orphan = orphanState(profilesDir)
	// The normal installed state: the profile that declares this preset still
	// installs the bundle (and so does someone else, if anyone).
	if (orphan.action === 'kept' && thisProfileInstalls !== false) return orphan
	return settleUninstalled({
		dir,
		profilesDir,
		patchPath,
		orphan,
		sessionsDir: options.sessionsDir ?? join(dshHomeOf(options), 'sessions'),
		readDocument: options.readDocument,
		shippedStandardDir: options.shippedStandardDir,
	})
}

function dshHomeOf(options) {
	const envHome = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME.trim() : ''
	return options.dshHome ?? (envHome || join(homedir(), '.dsh'))
}

function profilesDirOf(options) {
	return join(dshHomeOf(options), 'profiles')
}

/**
 * Whether ONE profile's manifest still installs this bundle. An unreadable
 * manifest answers "yes": cleanup must never run on a guess.
 * @param {string} profileDir - the profile directory holding the patch.
 * @returns {boolean}
 */
function profileInstalls(profileDir) {
	try {
		const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
		return Boolean(manifest?.dependencies && Object.hasOwn(manifest.dependencies, INSTALLER_PACKAGE))
	} catch {
		return true
	}
}

/**
 * Whether any recorded session still needs this preset to open.
 *
 * The scan reads every `session.v*.jsonl.zstd` under `<dshHome>/sessions`
 * (project directory → session directory → log), streaming each log through
 * zstd and stopping at the first hit, so a large history costs one pass and not
 * one resident copy. The needle is the durable `agentPreset` field itself — the
 * same field the host reads to resolve a resume. Anything unreadable, and any
 * runtime whose zlib has no zstd support, reports a hit: keeping a husk is
 * recoverable, deleting a preset a session needs is not.
 * @param {string} sessionsDir - the `<dshHome>/sessions` directory.
 * @param {string} presetId - the preset id sessions record.
 * @returns {Promise<boolean>}
 */
async function sessionsNeedPreset(sessionsDir, presetId) {
	const needle = `"agentPreset":"${presetId}"`
	let projects
	try {
		projects = readdirSync(sessionsDir, { withFileTypes: true })
	} catch (error) {
		// A missing sessions directory is a real answer (a fresh home).
		return error?.code === 'ENOENT' ? false : true
	}
	for (const project of projects) {
		if (!project.isDirectory()) continue
		let sessions
		try {
			sessions = readdirSync(join(sessionsDir, project.name), { withFileTypes: true })
		} catch {
			return true
		}
		for (const session of sessions) {
			if (!session.isDirectory()) continue
			const sessionDir = join(sessionsDir, project.name, session.name)
			let files
			try {
				files = readdirSync(sessionDir)
			} catch {
				return true
			}
			for (const file of files) {
				if (!file.endsWith('.jsonl.zstd')) continue
				if (await logMentions(join(sessionDir, file), needle)) return true
			}
		}
	}
	return false
}

/** Whether one session log contains `needle`, streamed so a big log is never
 * held whole; an unreadable or undecodable log reports a hit. */
function logMentions(file, needle) {
	return new Promise((resolve) => {
		if (typeof zlib.createZstdDecompress !== 'function') {
			resolve(true)
			return
		}
		let settled = false
		const source = createReadStream(file)
		const stream = source.pipe(zlib.createZstdDecompress())
		const finish = (found) => {
			if (settled) return
			settled = true
			source.destroy()
			stream.destroy()
			resolve(found)
		}
		let tail = ''
		stream.on('data', (chunk) => {
			const text = tail + chunk.toString('utf8')
			if (text.includes(needle)) finish(true)
			else tail = text.slice(-needle.length)
		})
		stream.on('end', () => finish(false))
		stream.on('error', () => finish(true))
		source.on('error', () => finish(true))
	})
}

/**
 * Settle a profile that no longer installs the bundle, then the shared
 * directory when nobody does. See {@link removeIfOrphaned} for the semantics.
 * @returns {Promise<{ action: string, reason?: string, targetFile?: string, detail?: string }>}
 */
async function settleUninstalled(options) {
	const { dir, profilesDir, patchPath, orphan, sessionsDir } = options
	const needed = await sessionsNeedPreset(sessionsDir, PRESET_ID)
	const detail = []
	if (patchPath !== undefined && existsSync(patchPath)) {
		if (needed) {
			const row = await tombstoneRow({ patchPath, readDocument: options.readDocument })
			// A row that cannot be tombstoned is left exactly as it is; the
			// directory half must not run either, or the row would point at a
			// husk while a recorded session still expects the full mode.
			if (row.action !== 'tombstoned') return { action: 'kept', reason: row.reason, targetFile: patchPath }
			detail.push(`row tombstoned in ${patchPath}`)
		} else {
			try {
				const action = removeDeclarationBlock(patchPath)
				detail.push(`declaration row ${action} in ${patchPath}`)
			} catch (error) {
				return { action: 'kept', reason: `cannot rewrite ${patchPath}: ${String(error)}`, targetFile: patchPath }
			}
		}
	}
	if (orphan.action !== 'orphaned') {
		return { action: needed ? 'tombstoned' : 'removed', targetFile: patchPath, detail: detail.join('; ') }
	}
	if (needed) {
		const husk = await tombstoneDir(dir, options)
		detail.push(husk.action === 'tombstoned' ? `directory tombstoned in ${dir}` : `directory kept: ${husk.reason}`)
		return { action: husk.action === 'tombstoned' ? 'tombstoned' : 'kept', reason: husk.reason, targetFile: patchPath, detail: detail.join('; ') }
	}
	// No profile installs the bundle and no session needs the preset: drop every
	// remaining declaration block first (a profile that has not booted since its
	// own uninstall may still carry one that references this directory), then
	// the directory itself.
	const blocks = removeEveryDeclarationBlock(profilesDir)
	if (blocks.removed.length > 0) detail.push(`declaration rows removed in ${blocks.removed.join(', ')}`)
	if (blocks.failed.length > 0) detail.push(`declaration rows left in ${blocks.failed.join(', ')}`)
	try {
		rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
		detail.push(`preset directory deleted (${dir})`)
		return { action: 'removed', targetFile: patchPath, detail: detail.join('; ') }
	} catch (error) {
		// A live watcher can hold the directory open (the mounted preset watches
		// its own skills). Fall back to the husk rather than leaving a directory
		// that still looks like an installed preset.
		const husk = await tombstoneDir(dir, options)
		detail.push(`cannot delete ${dir}: ${String(error)}`)
		return { action: husk.action === 'tombstoned' ? 'tombstoned' : 'kept', reason: husk.reason, targetFile: patchPath, detail: detail.join('; ') }
	}
}

/** Remove this preset's declaration block from one profile patch.
 * @param {string} patchPath - profile patch that may carry our block.
 * @returns {'removed' | 'unchanged'} */
function removeDeclarationBlock(patchPath) {
	const current = readFileSync(patchPath, 'utf8')
	if (!hasBlock(current)) return 'unchanged'
	writeProfilePatch(patchPath, removeBlock(current))
	return 'removed'
}

/** Remove our declaration block from every profile patch that carries one.
 * @param {string} profilesDir - the `<dshHome>/profiles` directory.
 * @returns {{ removed: string[], failed: string[] }} */
function removeEveryDeclarationBlock(profilesDir) {
	const removed = []
	const failed = []
	let entries
	try {
		entries = readdirSync(profilesDir, { withFileTypes: true })
	} catch {
		return { removed, failed }
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) continue
		const patchPath = join(profilesDir, entry.name, 'cordis.patch.yml')
		if (!existsSync(patchPath)) continue
		try {
			if (removeDeclarationBlock(patchPath) === 'removed') removed.push(patchPath)
		} catch {
			failed.push(patchPath)
		}
	}
	return { removed, failed }
}

/**
 * Rewrite the directory into the tombstone husk, leaving any profile's
 * declaration row alone. The standard composition comes from the registry when
 * the host exposes one (0.2.x) and from the shipped preset directory otherwise
 * (0.1.x); when neither can be read the directory is left as it is.
 * @param {string} dir - planted preset directory.
 * @param {{ readDocument?: (id: string) => Promise<{ content?: string }>, profilesDir?: string, shippedStandardDir?: string }} options
 * @returns {Promise<{ action: string, reason?: string }>}
 */
async function tombstoneDir(dir, options) {
	let pluginsText
	if (typeof options.readDocument === 'function') {
		try {
			pluginsText = (await options.readDocument('standard'))?.content
		} catch {
			pluginsText = undefined
		}
	}
	if (typeof pluginsText === 'string' && pluginsText.trim() !== '') {
		try {
			writeFileSync(join(dir, 'agent.cordis.yml'), pluginsText.endsWith('\n') ? pluginsText : `${pluginsText}\n`)
			writeFileSync(join(dir, 'preset.yml'), TOMBSTONE_METADATA)
			rmSync(join(dir, 'skills'), { recursive: true, force: true })
		} catch (error) {
			return { action: 'kept', reason: `cannot tombstone ${dir}: ${String(error)}` }
		}
		markTombstone(dir)
		return { action: 'tombstoned', dir }
	}
	const shippedStandardDir = options.shippedStandardDir ?? locateShippedStandard(options.profilesDir ?? profilesDirOf({}))
	if (shippedStandardDir === undefined) {
		return { action: 'kept', reason: 'shipped standard preset not found; keeping the planted preset so recorded sessions stay resumable' }
	}
	tombstone(dir, shippedStandardDir)
	return { action: 'tombstoned', dir }
}

/**
 * Rewrite ONE profile's declaration row into the tombstone, leaving the shared
 * planted directory untouched — another profile may still install the bundle
 * and need the full mode. Only the row half of the settlement runs here; the
 * directory husk is {@link tombstoneDir}'s job, and it only runs once no
 * profile installs the bundle.
 *
 * The standard plugins come from the registry (`readDocument`), never from a
 * filesystem guess: where a shipped preset lives changed between dsh versions
 * (directory -> patch row), and the 0.1.x layout probe chain was exactly the
 * part that silently stopped matching. A row whose plugins are all
 * host-shipped keeps activating after this bundle is gone, which is what keeps
 * a recorded session open.
 * @param {{ patchPath: string, readDocument?: (id: string) => Promise<{ content: string }> }} options
 * @returns {Promise<{ action: string, targetFile?: string, reason?: string }>} */
async function tombstoneRow(options) {
	const { patchPath } = options
	let current
	try {
		current = readFileSync(patchPath, 'utf8')
	} catch (error) {
		return { action: 'kept', reason: `cannot read ${patchPath}: ${String(error)}` }
	}
	if (!hasBlock(current)) return { action: 'kept', reason: `${patchPath} carries no declaration row for this preset` }
	if (typeof options.readDocument !== 'function') {
		return { action: 'kept', reason: 'host exposes no preset document reader; keeping the declaration row so recorded sessions stay resumable' }
	}
	let pluginsText
	try {
		const document = await options.readDocument('standard')
		pluginsText = document?.content
	} catch (error) {
		return { action: 'kept', reason: `cannot read the shipped standard composition: ${String(error)}` }
	}
	if (typeof pluginsText !== 'string' || pluginsText.trim() === '') {
		return { action: 'kept', reason: 'shipped standard composition is empty; keeping the declaration row' }
	}
	let block
	try {
		block = buildDeclaration({
			version: TOMBSTONE_VERSION,
			pluginsText,
			presetId: PRESET_ID,
			name: '编程模式（已卸载）',
			description: '编程模式插件已卸载。此条目仅为让历史会话继续可打开而保留，行为等同标准模式。',
			order: 99,
		})
	} catch (error) {
		return { action: 'kept', reason: `cannot build the tombstone row: ${String(error)}` }
	}
	try {
		writeFileAtomic(patchPath, replaceBlock(current, block))
	} catch (error) {
		return { action: 'kept', reason: `cannot rewrite ${patchPath}: ${String(error)}` }
	}
	return { action: 'tombstoned', targetFile: patchPath }
}

function writeFileAtomic(path, text) {
	const temporary = `${path}.dsh-programming-mode.tmp`
	writeFileSync(temporary, text)
	renameSync(temporary, path)
}

/** Version stamped into a declaration-row tombstone. The installer re-plants as
 * soon as it sees this marker (or any version change), so the exact value only
 * has to be stable within one release. */
const TOMBSTONE_VERSION = 'tombstone'

const TOMBSTONE_METADATA = [
	'name: 编程模式（已卸载）',
	'description: 编程模式插件已卸载。此条目仅为让历史会话继续可打开而保留，行为等同标准模式；不需要历史会话时可直接删除本目录。',
	'order: 99',
	'',
].join('\n')

/**
 * Where dsh's shipped `standard` preset lives, tried in order:
 *
 * 1. inside the profiles tree (dsh installed into a profile) — both the legacy
 *    `config/agent-presets` layout and the 0.1.5-rc.x layout where the dsh
 *    package carries `dsh-agent-presets` as its own nested dependency;
 * 2. the RUNNING CLI installation — a global `npm -g` install never puts
 *    `@deepseek-ai/dsh` under the profiles tree, so the profiles scan alone
 *    made the tombstone unreachable there (0.3.7 and earlier). The host's own
 *    entry script (`process.argv[1]`, e.g. …/@deepseek-ai/dsh/lib/bin.js)
 *    identifies the running installation; walk up to its package root and
 *    probe the same layouts there.
 *
 * Exported for dry-run/testing. Returns the directory holding
 * `agent.cordis.yml`, or undefined when nothing matches (the caller then
 * refuses to tombstone — a missing shipped standard must keep the planted
 * preset so recorded sessions stay resumable).
 * @param {string} profilesDir - the `<dshHome>/profiles` directory.
 */
export function locateShippedStandard(profilesDir) {
	const candidates = [join(profilesDir, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets', 'standard')]
	for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			candidates.push(join(profilesDir, entry.name, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets', 'standard'))
			candidates.push(join(profilesDir, entry.name, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'standard'))
			candidates.push(join(profilesDir, entry.name, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'standard'))
		}
	}
	const cliRoot = dshInstallRoot(process.argv?.[1])
	if (cliRoot !== undefined) {
		candidates.push(join(cliRoot, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'standard'))
		candidates.push(join(cliRoot, 'config', 'agent-presets', 'standard'))
	}
	return candidates.find((candidate) => existsSync(join(candidate, 'agent.cordis.yml')))
}

/**
 * Walk up from the host's entry script to the dsh package root: the first
 * directory whose `node_modules` carries `dsh-agent-presets` with a shipped
 * standard composition. Bounded depth so an unexpected argv cannot scan the
 * whole drive; undefined when argv is not a file inside a dsh installation.
 * @param {string | undefined} entryScript - `process.argv[1]` of the host.
 */
function dshInstallRoot(entryScript) {
	if (typeof entryScript !== 'string' || entryScript.length === 0) return undefined
	let dir = dirname(entryScript)
	for (let depth = 0; depth < 8; depth += 1) {
		if (existsSync(join(dir, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'standard', 'agent.cordis.yml'))) return dir
		const parent = dirname(dir)
		if (parent === dir) return undefined
		dir = parent
	}
	return undefined
}

/** Record on the installer stamp that this planted copy is a tombstone, so a
 * reinstall repairs the full mode even at the same version.
 * @param {string} dir - planted preset directory. */
function markTombstone(dir) {
	let stamp = {}
	try {
		stamp = JSON.parse(readFileSync(join(dir, STAMP_FILENAME), 'utf8'))
	} catch {}
	stamp.tombstone = true
	stamp.tombstonedAt = new Date().toISOString()
	try {
		writeFileSync(join(dir, STAMP_FILENAME), JSON.stringify(stamp, null, 2) + '\n')
	} catch {}
	return stamp
}

function tombstone(dir, shippedStandardDir) {
	copyFileSync(join(shippedStandardDir, 'agent.cordis.yml'), join(dir, 'agent.cordis.yml'))
	writeFileSync(join(dir, 'preset.yml'), TOMBSTONE_METADATA)
	// The module file stays: uninstall.mjs imports it, and the planted preset
	// keeps a row that loads it by relative path. The row is gone from the
	// composition, so nothing mounts it — the file is inert ballast, not a load.
	rmSync(join(dir, 'skills'), { recursive: true, force: true })
	return markTombstone(dir)
}

/**
 * Manual immediate cleanup, no restart needed:
 *   node ~/.dsh/.agent-presets/programming/uninstall.mjs
 * Refuses directories without this package's installer stamp.
 */
export function uninstallSelf(dir = here) {
	return deleteStamped(dir)
}

/**
 * The injected message's durable source: the host's own skill-invocation
 * source, the same record `@deepseek-ai/dsh-skill` attaches to the
 * `<skill_content>` body the `skill` tool loads. `kind: 'plugin'` is retired —
 * session format v4 (dsh 0.2.x) refuses it on write AND on read, failing the
 * whole run with "format v4 message requires a producer-owned source kind" —
 * while these three members are admitted by every released validator, v0
 * through v4. `name` is the only member carrying identity, so the UI labels
 * the injected context row with the skill name.
 * @param {string} skillName - the skill whose body this message carries.
 */
function injectionSource(skillName) {
	return { kind: 'skill-invocation', name: skillName, form: 'instructions' }
}

/**
 * Replicate `@deepseek-ai/dsh-skill`'s `renderSkillContent` inline instead of
 * importing it: the planted module is self-contained (no runtime dependency on
 * DSH internals). The output matches the canonical `<skill_content>` shape the
 * `skill` tool produces, so the model sees the same framing whether the skill
 * was loaded via the tool or forced by this hook.
 * @param {object} skill - resolved skill (name/provider/resourceBase/content).
 */
function renderSkillContent(skill) {
	const base = skill.resourceBase
	let hint
	if (base === undefined) {
		hint = [`Resources for this skill are managed by provider "${String(skill.provider)}".`, 'Load referenced resources only as needed.']
	} else if (base.kind === 'directory') {
		hint = [`Base directory for this skill: ${String(base.path)}`, 'Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.']
	} else if (base.kind === 'url') {
		hint = [`Base URL for this skill: ${String(base.url)}`, 'Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.']
	} else {
		hint = [`Resources for this skill: ${String(base.description)}`, 'Load referenced resources only as needed.']
	}
	const nameAttr = String(skill.name).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
	return [
		`<skill_content name="${nameAttr}">`,
		'<skill_resources>',
		...hint,
		'</skill_resources>',
		'',
		'<skill_instructions>',
		skill.content,
		'</skill_instructions>',
		'</skill_content>',
	].join('\n')
}

/**
 * Whether this agent's durable session history already carries the forced
 * injection. Matches the current shape and the two retired ones — the
 * `plugin`-kind source released up to 0.3.8, and the pre-0.3.4
 * `skill-invocation` source, which carries the same `name` — so an upgrade in
 * the middle of a session stays idempotent.
 */
function alreadyInjected(agent, skillName, legacyLabel) {
	const events = agent.session.events
	if (!Array.isArray(events)) return false
	for (let i = events.length - 1; i >= 0; i -= 1) {
		const event = events[i]
		if (event.type !== 'user/message') continue
		const src = event.data?.source
		if (src?.kind === 'skill-invocation' && src.name === skillName) return true
		if (src?.kind === 'plugin' && src.plugin === legacyLabel) return true
	}
	return false
}

/**
 * Register the first-step injection. On every agent's first pre-step where the
 * skill resolves, inject the full `using-superpowers` content into the entering
 * message batch. This is a mechanical guarantee — the skill instructions reach
 * the model with the first request regardless of whether the model calls the
 * `skill` tool.
 */
export function apply(ctx, config = {}) {
	// `ctx.baseUrl` is the profile directory under both host models, so the
	// declaration row (0.2.x) is found where the installer wrote it. The host's
	// own document reader supplies the tombstone composition; when neither is
	// available the module falls back to the 0.1.x directory tombstone.
	const agentPresets = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined
	const readDocument = typeof agentPresets?.readDocument === 'function'
		? (id) => agentPresets.readDocument(id)
		: undefined
	let settled = false
	const fate = removeIfOrphaned({ patchPath: profilePatchPath(ctx?.baseUrl), readDocument })
	if (fate instanceof Promise) {
		// A settlement reads the registry (for the tombstone composition) and the
		// session logs (for the history question). Never hold the preset mount on
		// it: registration has to complete for the mount to settle, so a slow read
		// would stall every session that picks this mode. The hook registers now
		// and stops injecting if this profile's row did get settled — the reload
		// that follows drops this module from the tree anyway.
		void fate.then((outcome) => {
			if (outcome?.action === 'tombstoned' || outcome?.action === 'removed') {
				settled = true
				reportSettlement(outcome)
			}
		}, (error) => {
			console.log(`[dsh-programming-mode] uninstall check failed, keeping the preset: ${String(error)}`)
		})
	} else if (fate.action === 'tombstoned' || fate.action === 'removed') {
		reportSettlement(fate)
		return
	}
	registerInjection(ctx, config, () => settled)
}

function reportSettlement(fate) {
	const detail = fate.detail === undefined || fate.detail === '' ? '' : ` (${fate.detail})`
	if (fate.action === 'removed') {
		console.log(`[dsh-programming-mode] uninstalled with no session recorded under this preset — removed it entirely, nothing left to clean up${detail}`)
		return
	}
	console.log(`[dsh-programming-mode] uninstalled, but recorded sessions still run under this preset — kept a tombstone ("编程模式（已卸载）") so they stay openable with standard-mode behavior${detail}`)
}

function registerInjection(ctx, config, isTombstoned) {
	const skillName = config.skillName ?? SKILL_NAME
	const legacyLabel = config.producerLabel ?? LEGACY_PRODUCER_LABEL
	ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
		if (isTombstoned()) return next()
		const decision = await next()
		if (decision.kind === 'reject') return decision
		signal.throwIfAborted()
		if (alreadyInjected(agent, skillName, legacyLabel)) return decision
		const skills = ctx.get('skills')
		if (!skills) return decision
		const skill = await skills.get(skillName, {
			cwd: agent.session.header.cwd,
			signal,
			scope: agent,
		})
		signal.throwIfAborted()
		if (!skill?.content) return decision
		const message = {
			id: `forced:${skillName}:${agent.id ?? 'session'}`,
			role: 'user',
			content: [{ type: 'text', text: renderSkillContent(skill) }],
			source: injectionSource(skillName),
		}
		console.log(`[dsh-programming-mode] forced first-step injection of "${skillName}" for agent ${agent.id ?? '?'}`)
		return { kind: 'enter', messages: [...decision.messages, message] }
	})
}
