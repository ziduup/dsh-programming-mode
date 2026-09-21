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

import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const STAMP_FILENAME = '.dsh-programming-mode.installed.json'
const INSTALLER_PACKAGE = '@ziduup/dsh-programming-mode'

export const name = 'programming-mode-force-superpowers'

const SKILL_NAME = 'using-superpowers'
// UI provenance: source.kind === 'plugin' shows record.plugin as the producer
// label (same family as '@deepseek-ai/dsh-system-prompt'), instead of the raw
// skill name. Keep `name` on the side for machine-readable identity.
const PRODUCER_LABEL = '@deepseek-ai/dsh-programming-mode'

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

/**
 * Orphan handling (runs at mount time). When no profile installs the bundle
 * anymore the planted preset must NOT simply be deleted: sessions record the
 * preset id they ran under (`agentPreset: "programming"`), the host resolves a
 * resume through `presets.resolve()` with NO fallback, and a missing preset
 * makes every recorded session unresumable (`resume failed for session ...`).
 * Instead the preset is converted in place into a TOMBSTONE: the composition is
 * replaced with a copy of dsh's shipped `standard` preset (rows reference
 * packages by name, so the copy needs nothing from this bundle), the metadata
 * is relabeled, and the injection module's row goes away. Recorded sessions
 * keep opening and run with standard-mode behavior; the picker shows one
 * honestly-labeled husk entry instead of silently broken sessions. The stamp
 * gains `tombstone: true` so a later reinstall re-plants the full mode even at
 * the same version. Unreadable or zero profile manifests mean "cannot tell";
 * a missing shipped standard preset means "cannot build the tombstone" — both
 * keep the preset untouched. Exported for offline testing.
 */
export function removeIfOrphaned(options = {}) {
	const dir = options.dir ?? here
	const envHome = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME.trim() : ''
	const profilesDir = join(options.dshHome ?? (envHome || join(homedir(), '.dsh')), 'profiles')
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
	const shippedStandard = options.shippedStandardDir ?? locateShippedStandard(profilesDir)
	if (shippedStandard === undefined) {
		return { action: 'kept', reason: 'shipped standard preset not found; keeping the planted preset so recorded sessions stay resumable' }
	}
	const stamp = tombstone(dir, shippedStandard)
	return { action: 'tombstoned', dir, version: stamp.version }
}

const TOMBSTONE_METADATA = [
	'name: 编程模式（已卸载）',
	'description: 编程模式插件已卸载。此条目仅为让历史会话继续可打开而保留，行为等同标准模式；不需要历史会话时可直接删除本目录。',
	'order: 99',
	'',
].join('\n')

function locateShippedStandard(profilesDir) {
	const candidates = [join(profilesDir, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets', 'standard')]
	for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
		if (entry.isDirectory()) candidates.push(join(profilesDir, entry.name, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets', 'standard'))
	}
	return candidates.find((candidate) => existsSync(join(candidate, 'agent.cordis.yml')))
}

function tombstone(dir, shippedStandardDir) {
	copyFileSync(join(shippedStandardDir, 'agent.cordis.yml'), join(dir, 'agent.cordis.yml'))
	writeFileSync(join(dir, 'preset.yml'), TOMBSTONE_METADATA)
	rmSync(join(dir, 'skills'), { recursive: true, force: true })
	let stamp = {}
	try {
		stamp = JSON.parse(readFileSync(join(dir, STAMP_FILENAME), 'utf8'))
	} catch {}
	stamp.tombstone = true
	stamp.tombstonedAt = new Date().toISOString()
	writeFileSync(join(dir, STAMP_FILENAME), JSON.stringify(stamp, null, 2) + '\n')
	return stamp
}

/**
 * Manual immediate cleanup, no restart needed:
 *   node ~/.dsh/.agent-presets/programming/uninstall.mjs
 * Refuses directories without this package's installer stamp.
 */
export function uninstallSelf(dir = here) {
	return deleteStamped(dir)
}

function injectionSource(label) {
	return { kind: 'plugin', plugin: label, name: SKILL_NAME, form: 'instructions' }
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
 * injection. Matches either our current `plugin`-kind shape or the earlier
 * `skill-invocation` shape, so an upgrade in the middle of a session stays
 * idempotent (a session that already received the old shape is not injected
 * again by the new shape).
 */
function alreadyInjected(agent, label) {
	const events = agent.session.events
	if (!Array.isArray(events)) return false
	for (let i = events.length - 1; i >= 0; i -= 1) {
		const event = events[i]
		if (event.type !== 'user/message') continue
		const src = event.data?.source
		if (src?.kind === 'plugin' && src.plugin === label) return true
		if (src?.kind === 'skill-invocation' && src.name === SKILL_NAME) return true
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
	const fate = removeIfOrphaned()
	if (fate.action === 'tombstoned') {
		console.log(`[dsh-programming-mode] bundle no longer installed in any profile — planted preset converted to a tombstone ("编程模式（已卸载）"); recorded sessions stay resumable with standard-mode behavior`)
		return
	}
	const skillName = config.skillName ?? SKILL_NAME
	const label = config.producerLabel ?? PRODUCER_LABEL
	ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
		const decision = await next()
		if (decision.kind === 'reject') return decision
		signal.throwIfAborted()
		if (alreadyInjected(agent, label)) return decision
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
			source: injectionSource(label),
		}
		console.log(`[dsh-programming-mode] forced first-step injection of "${skillName}" for agent ${agent.id ?? '?'}`)
		return { kind: 'enter', messages: [...decision.messages, message] }
	})
}
