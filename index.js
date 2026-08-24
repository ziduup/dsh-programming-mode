// dsh-programming-mode — profile-boot installer for the 编程模式 agent preset.
//
// A DSH bundle cannot register an agent-preset root: the launcher composes the
// `agent-presets` row last and pins its `roots` config to the shipped root.
// Distribution therefore works by planting the bundled preset directory into
// the roster's first user-trust preset root. Discovery is uncached (every
// list() re-reads the roots), so the preset appears in the mode picker right
// after this plugin has planted it.
//
// Planting policy (deliberate, documented in README.zh.md):
// - target absent            -> plant fresh, write version stamp
// - stamp matches our version-> no-op (preserve local edits)
// - stamp differs (upgrade)  -> overwrite files, refresh stamp
// - no stamp (foreign dir)   -> refuse to touch, warn once per boot
//
// Uninstalling the bundle does NOT delete a planted preset: it already lives
// in the user's own writable root and may carry their edits. Deleting the
// directory removes the mode.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
		return typeof stamp.version === 'string' ? stamp.version : null
	} catch {
		return null
	}
}

function writeStamp(targetDir, version) {
	writeFileSync(
		join(targetDir, STAMP_FILENAME),
		JSON.stringify({ version, source: 'dsh-programming-mode', plantedAt: new Date().toISOString() }, null, 2) + '\n',
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

	if (!existsSync(sourceDir)) {
		return { action: 'error', reason: `bundled preset missing: ${sourceDir}`, targetDir }
	}

	if (!existsSync(targetDir)) {
		mkdirSync(targetParent, { recursive: true })
		cpSync(sourceDir, targetDir, { recursive: true })
		writeStamp(targetDir, version)
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
	if (stamped === version) {
		return { action: 'unchanged', version, targetDir }
	}

	cpSync(sourceDir, targetDir, { recursive: true, force: true })
	writeStamp(targetDir, version)
	return { action: 'updated', from: stamped, to: version, targetDir }
}

export function apply(ctx) {
	let agentPresets
	try {
		agentPresets = ctx.get('agentPresets')
	} catch {
		agentPresets = undefined
	}
	const result = plantPreset({ agentPresets })
	const detail = result.reason ?? (result.action === 'updated' ? `${result.from} -> ${result.to}` : result.version ?? '')
	console.log(`[dsh-programming-mode] ${result.action}${detail ? `: ${detail}` : ''}`)
}
