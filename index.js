// dsh-programming-mode — profile-boot installer for the 编程模式 agent preset.
//
// A DSH bundle cannot register an agent-preset root: the launcher composes the
// `agent-presets` row last and pins its `roots` config to the shipped root.
// Distribution therefore works by planting the bundled preset directory into
// the roster's first user-trust preset root. Discovery is uncached (every
// list() re-reads the roots), so the preset appears in the mode picker right
// after this plugin has planted it.
//
// dsh 0.2.0 replaced that model: nothing reads a preset DIRECTORY anymore. A
// preset is a declaration ROW in the composed profile tree
// (`name: '@deepseek-ai/dsh-agent-preset'`), registered by AgentPresets
// .register(). So this installer detects which host it runs on and serves the
// channel that host understands:
//
//   roster (0.1.x)  — plant the preset directory (unchanged path)
//   registry (0.2+) — plant the directory AND write a declaration row into the
//                     profile's own cordis.patch.yml
//
// Both channels share one composition: the declaration row's `plugins` is the
// planted `agent.cordis.yml`, re-indented (see declaration.mjs).

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// The declaration-row writer lives INSIDE the preset directory, not at the
// package root: the planted copy imports it by relative path, and a module
// reaching outside the planted directory would break the preset the moment the
// bundle is uninstalled. One file, two consumers (this installer and the
// planted injection module) — see preset/programming/declaration.mjs.
import {
	blockProblems,
	buildDeclaration,
	hasBlock,
	isListLike,
	profilePatchPath,
	readPresetMetadata,
	removeBlock,
	replaceBlock,
	writeProfilePatch,
} from './preset/programming/declaration.mjs'

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))

export const name = 'programming-mode-installer'

const PRESET_ID = 'programming'
const STAMP_FILENAME = '.dsh-programming-mode.installed.json'

function readOwnVersion() {
	try {
		const manifest = JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'))
		return String(manifest.version ?? '0.0.0')
	} catch {
		return '0.0.0'
	}
}

// The roster knows its own roots better than any guess: prefer the first
// user-trust root it reports (that is where authoring writes land), fall back
// to the derived default ($DSH_HOME or ~/.dsh + .agent-presets).
function resolveTargetParent(agentPresets) {
	try {
		const roots = agentPresets?.roots
		if (Array.isArray(roots)) {
			const hit = roots.find((root) => root && root.trust === 'user' && typeof root.path === 'string')
			if (hit) return dirname(hit.path)
		}
	} catch {
		// fall through to the derived default below
	}
	const envHome = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== ''
		? process.env.DSH_HOME.trim()
		: join(homedir(), '.dsh')
	return join(envHome, '.agent-presets')
}

function readStamp(targetDir) {
	try {
		const stamp = JSON.parse(readFileSync(join(targetDir, STAMP_FILENAME), 'utf8'))
		return typeof stamp?.version === 'string' ? stamp : null
	} catch {
		return null
	}
}

function writeStamp(targetDir, version, channel) {
	writeFileSync(
		join(targetDir, STAMP_FILENAME),
		JSON.stringify({ version, channel, source: 'dsh-programming-mode', plantedAt: new Date().toISOString() }, null, 2) + '\n',
	)
}

/**
 * Plant (or update) the bundled 编程模式 preset into a preset root.
 * Exported separately from apply() so tests can drive it with explicit paths.
 * @param {{
 *   sourceDir?: string,
 *   targetParent?: string,
 *   presetId?: string,
 *   version?: string,
 *   agentPresets?: { roots?: Array<{ path?: string, trust?: string }> },
 * }} [options]
 */
export function plantPreset(options = {}) {
	const sourceDir = resolve(options.sourceDir ?? join(PACKAGE_DIR, 'preset', PRESET_ID))
	const presetId = String(options.presetId ?? PRESET_ID)
	const targetParent = resolve(options.targetParent ?? resolveTargetParent(options.agentPresets))
	const targetDir = join(targetParent, presetId)
	const version = String(options.version ?? readOwnVersion())
	const channel = options.channel

	if (!existsSync(sourceDir)) {
		return { action: 'error', reason: `bundled preset missing: ${sourceDir}`, targetDir }
	}

	if (!existsSync(targetDir)) {
		mkdirSync(targetParent, { recursive: true })
		cpSync(sourceDir, targetDir, { recursive: true })
		writeStamp(targetDir, version, channel)
		return { action: 'planted', version, targetDir }
	}

	const stamped = readStamp(targetDir)
	if (stamped === null) {
		return {
			action: 'skipped',
			reason: `${targetDir} exists without an installer stamp; refusing to touch a preset we did not plant`,
			targetDir,
		}
	}
	// A tombstone (uninstall leftover, see preset/programming/force-superpowers.mjs)
	// is repaired even at the same version: the user reinstalled the bundle, so
	// the full mode must come back.
	if (stamped.tombstone === true || stamped.version !== version) {
		cpSync(sourceDir, targetDir, { recursive: true, force: true })
		writeStamp(targetDir, version, channel)
		// `version` (not only the `to` in the log line) is what the caller hands
		// the declaration row's marker; omitting it wrote `vundefined` into the
		// profile patch on every upgrade — found on the real 0.2.0 desktop host.
		return { action: 'updated', from: stamped.version, to: version, version, targetDir }
	}
	return { action: 'unchanged', version, targetDir }
}

/** Composed-tree package names that only a dsh 0.2.x host carries. The host's
 * 0.1.x roster (`@deepseek-ai/dsh-agent-presets`, plural) and its 0.2.x
 * registry (`@deepseek-ai/dsh-agent-preset-registry`) both publish a service
 * named `agentPresets`, and reading that service is a race besides: a plugin's
 * apply() runs while sibling rows are still activating, so the provider may not
 * be registered yet — measured on a real host, `ctx.get('agentPresets')` stayed
 * undefined through a whole setImmediate even with the provider row directly
 * before ours. The composed tree is complete before any row starts, which makes
 * it the dependable signal; the service stays as a second opinion for a host
 * that publishes it early.
 * @param {Iterable<{ options?: { name?: string } }> | undefined} entries - the
 *   composed loader entries.
 * @param {{ register?: unknown } | undefined} agentPresets - the host service.
 * @returns {'registry' | 'roster'} */
export function detectModel(agentPresets, entries) {
	for (const name of entryNames(entries)) {
		if (REGISTRY_MARKERS.has(name)) return 'registry'
	}
	return typeof agentPresets?.register === 'function' ? 'registry' : 'roster'
}

const REGISTRY_MARKERS = new Set([
	'@deepseek-ai/dsh-agent-preset-registry',
	'@deepseek-ai/dsh-agent-preset',
])

function entryNames(entries) {
	if (entries === undefined) return []
	try {
		const names = []
		for (const entry of entries) {
			const name = entry?.options?.name
			if (typeof name === 'string') names.push(name)
		}
		return names
	} catch {
		// An exotic loader iterable yields no names; the service check decides.
		return []
	}
}

/**
 * Write the preset as a declaration row into the profile's own patch layer.
 *
 * The row must not name this package. A row that outlived the bundle and still
 * resolved would break the profile at load time, and one that stops resolving
 * would be silently dropped — either way the mode disappears. Everything the row
 * references is a host-shipped `@deepseek-ai/*` package or a file the installer
 * planted under `$DSH_HOME/.agent-presets/`, which pnpm never touches; that is
 * what makes uninstall safe. (The other direction matters just as much: the
 * patch FILE itself must stay parseable — an illegal document fails the profile
 * load, before any plugin of ours runs. See replaceBlock's "no rows yet" branch.)
 *
 * Write policy mirrors the directory stamp: no block -> append; block at our
 * version -> leave the file alone (the user may have edited it); different
 * version -> replace the block only. Never throws: a host must not fail to boot
 * because of us.
 * @param {{ ctx: { baseUrl?: string }, plantedDir: string, version: string }} options
 * @returns {{ action: string, targetFile?: string, reason?: string }} */
export function declarePreset(options) {
	const { ctx, plantedDir, version } = options
	const patchPath = profilePatchPath(ctx?.baseUrl)
	if (patchPath === undefined) {
		return { action: 'skipped', reason: 'no profile patch file next to this profile root; declaration row not written' }
	}
	let current = ''
	if (existsSync(patchPath)) {
		try {
			current = readFileSync(patchPath, 'utf8')
		} catch (error) {
			return { action: 'error', reason: `cannot read ${patchPath}: ${String(error)}` }
		}
	}
	if (!isListLike(current)) {
		return { action: 'skipped', reason: `${patchPath} is not a top-level YAML list; refusing to touch a profile patch we do not own` }
	}
	let metadata
	let compositionText
	try {
		metadata = readPresetMetadata(readFileSync(join(plantedDir, 'preset.yml'), 'utf8'))
		compositionText = readFileSync(join(plantedDir, 'agent.cordis.yml'), 'utf8')
	} catch (error) {
		return { action: 'error', reason: `cannot read the planted preset: ${String(error)}` }
	}
	let block
	try {
		block = buildDeclaration({
			version,
			compositionText,
			metadata,
			moduleUrl: pathToFileURL(join(plantedDir, 'force-superpowers.mjs')).href,
			skillsDir: join(plantedDir, 'skills'),
		})
	} catch (error) {
		return { action: 'error', reason: `cannot build the declaration row: ${String(error)}` }
	}
	const problems = blockProblems(block)
	if (problems.length > 0) {
		return { action: 'error', reason: `generated declaration is unsound: ${problems.join('; ')}` }
	}
	if (hasBlock(current, version)) {
		return { action: 'unchanged', targetFile: patchPath }
	}
	const redeclaring = hasBlock(current)
	try {
		writeProfilePatch(patchPath, replaceBlock(current, block))
	} catch (error) {
		return { action: 'error', reason: `cannot write ${patchPath}: ${String(error)}` }
	}
	return { action: redeclaring ? 'updated' : 'declared', targetFile: patchPath }
}

/** Drop our declaration row from the profile patch. Only ever called by a
 * 0.1.x host: `@deepseek-ai/dsh-agent-preset` does not exist there, and a row
 * naming it keeps the profile from starting until it is gone.
 * @param {string | undefined} patchPath
 * @returns {{ action: string, targetFile?: string, reason?: string }} */
export function removeDeclaration(patchPath) {
	if (patchPath === undefined || !existsSync(patchPath)) {
		return { action: 'skipped', reason: 'no profile patch to clean' }
	}
	let current
	try {
		current = readFileSync(patchPath, 'utf8')
	} catch (error) {
		return { action: 'error', reason: `cannot read ${patchPath}: ${String(error)}` }
	}
	if (!hasBlock(current)) return { action: 'unchanged', targetFile: patchPath }
	try {
		writeProfilePatch(patchPath, removeBlock(current))
	} catch (error) {
		return { action: 'error', reason: `cannot rewrite ${patchPath}: ${String(error)}` }
	}
	return { action: 'removed', targetFile: patchPath }
}

/** The composed entries, or undefined when this host exposes no loader. Never
 * throws: a host that cannot answer must still boot with the directory channel.
 * @param {{ loader?: { entries?: () => Iterable<unknown> } }} ctx
 * @returns {unknown[] | undefined} */
function loaderEntries(ctx) {
	try {
		const entries = ctx.loader?.entries?.()
		return entries === undefined ? undefined : [...entries]
	} catch {
		return undefined
	}
}

export function apply(ctx) {
	let agentPresets
	try {
		agentPresets = ctx.get('agentPresets')
	} catch {
		agentPresets = undefined
	}
	const channel = detectModel(agentPresets, loaderEntries(ctx))
	if (channel === 'roster') {
		// Old host: directory planting is the whole story. Clear a declaration row
		// left behind by a newer host, or the profile would refuse to boot.
		const healed = removeDeclaration(profilePatchPath(ctx?.baseUrl))
		if (healed.action === 'removed') {
			console.log(`[dsh-programming-mode] removed the 0.2.x declaration row from ${healed.targetFile} (this host reads preset directories)`)
		}
	}
	const result = plantPreset({ agentPresets, channel })
	const detail = result.reason ?? (result.action === 'updated' ? `${result.from} -> ${result.to}` : result.version ?? '')
	console.log(`[dsh-programming-mode] ${result.action}${detail ? `: ${detail}` : ''}`)
	if (channel !== 'registry') return
	// Plant the assets first: the declaration row points at them, and a row
	// whose files are half-planted fails to activate.
	if (result.action !== 'planted' && result.action !== 'updated' && result.action !== 'unchanged') {
		console.log(`[dsh-programming-mode] skipped the declaration row: preset planting ${result.action}`)
		return
	}
	const declared = declarePreset({ ctx, plantedDir: result.targetDir, version: result.version })
	const declaredDetail = declared.reason ?? (declared.action === 'updated' ? 'replaced an older row' : undefined)
	console.log(`[dsh-programming-mode] ${declared.action} the preset declaration row${declaredDetail ? `: ${declaredDetail}` : ''}`)
}
