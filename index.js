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
//
// Dual role: the same package is also mounted as a preset row
// (`config.role: force-superpowers`, see preset/programming/agent.cordis.yml)
// that only registers the `agent/pre-step` hook injecting the full
// using-superpowers skill on a session's first step. Instance dispatch is by
// row id, so the profile-level installer row and the preset-level fork row can
// share this one entry point.

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

export function apply(ctx, config = {}) {
	// Preset-level fork row: this instance only forces the first-step skill
	// injection; it must not plant anything (the installer row owns planting).
	if (config.role === 'force-superpowers') {
		registerFirstStepInjection(ctx, config)
		return
	}

	// Installer role (profile patch row): plant the bundled preset.
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

const SKILL_NAME = 'using-superpowers'
const INJECTION_SOURCE = { kind: 'skill-invocation', name: SKILL_NAME, form: 'instructions' }

/**
 * Replicate `@deepseek-ai/dsh-skill`'s `renderSkillContent` inline instead of
 * importing it: the bundle is a self-contained npm package with no runtime
 * dependency on DSH internals. The output matches the canonical
 * `<skill_content>` shape the `skill` tool produces, so the model sees the same
 * framing whether the skill was loaded via the tool or forced by this hook.
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
 * injection (or an equivalent user-gesture skill load with the same source
 * shape). Scans from the tail so a resume/compaction stays idempotent.
 */
function alreadyInjected(agent) {
	const events = agent.session.events
	if (!Array.isArray(events)) return false
	for (let i = events.length - 1; i >= 0; i -= 1) {
		const event = events[i]
		if (event.type !== 'user/message') continue
		const src = event.data?.source
		if (src?.kind === INJECTION_SOURCE.kind && src.name === SKILL_NAME) return true
	}
	return false
}

/**
 * Preset-level fork: on every agent's first pre-step where the skill resolves,
 * inject the full `using-superpowers` content into the entering message batch.
 * This is a mechanical guarantee — the skill instructions reach the model with
 * the first request regardless of whether the model calls the `skill` tool.
 */
function registerFirstStepInjection(ctx, config = {}) {
	const skillName = config.skillName ?? SKILL_NAME
	ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
		const decision = await next()
		if (decision.kind === 'reject') return decision
		signal.throwIfAborted()
		if (alreadyInjected(agent)) return decision
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
			source: { ...INJECTION_SOURCE, name: skillName },
		}
		console.log(`[dsh-programming-mode] forced first-step injection of "${skillName}" for agent ${agent.id ?? '?'}`)
		return { kind: 'enter', messages: [...decision.messages, message] }
	})
}
