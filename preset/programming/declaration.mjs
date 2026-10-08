// declaration — the 编程模式 preset as a DECLARATION ROW for dsh 0.2.x hosts.
//
// Why this file exists. dsh 0.2.0 replaced preset discovery: a preset used to be
// a directory `$DSH_HOME/.agent-presets/<id>/` holding `agent.cordis.yml`, and
// the roster scanned roots for it. Since 0.2.0 nothing reads that directory;
// a preset is a ROW in the composed profile tree
// (`name: '@deepseek-ai/dsh-agent-preset'`, `config: { id, plugins: [...] }`),
// registered by AgentPresets.register(). The bundle therefore writes this row
// for the profile it is installed in, at <profile>/cordis.patch.yml, and keeps
// the directory planting for 0.1.x hosts (see index.js).
//
// Why the row lives in the PROFILE patch and not `$DSH_HOME/cordis.patch.yml`:
// the home patch outranks the profile layer and applies to EVERY profile, and a
// 0.1.x host boots the same `$DSH_HOME` too. `@deepseek-ai/dsh-agent-preset`
// (singular) does not exist in 0.1.x, so a home-level row would apply to
// profiles that cannot use it at all. The profile patch confines the blast
// radius to the profile the bundle was installed in; index.js removes the block
// again when it boots under an old host.
//
// The composition is NOT duplicated here. `plugins` is the planted
// `agent.cordis.yml` re-indented, so the two host channels stay one source of
// truth. Two references need rewriting because the preset row's `baseUrl` is the
// profile directory, not the preset directory: the injection module gets a
// `file:///` URL (an absolute Windows path would resolve to a `c:` scheme and
// fail to import) and the bundled skills directory gets an absolute path.
//
// Everything is text-level on purpose: the package stays dependency-free, and
// only the marker block is ever touched, so a profile patch that also carries
// the user's own rows is never rewritten around them.

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DECLARATION_ROW_ID = 'preset-programming'

export const BLOCK_BEGIN = (version) => `# >>> dsh-programming-mode preset declaration v${version} >>>`
export const BLOCK_END = '# <<< dsh-programming-mode preset declaration <<<'

const PLUGIN_MODULE_ROW = "name: './force-superpowers.mjs'"
const SKILLS_EXPR_MARK = "new URL('skills/', baseUrl)"
/** Indentation of `plugins:` children in the generated block. */
const PLUGINS_INDENT = 10
/** The metadata file the preset directory carries for 0.1.x hosts. */
const METADATA_FILE = 'preset.yml'
const COMPOSITION_FILE = 'agent.cordis.yml'

/** Single-quote a YAML scalar, doubling internal quotes.
 * `parsePatchList` failing is fatal (the profile refuses to start), so display
 * text never enters the block unquoted. */
export function quoteYaml(value) {
	return `'${String(value).replaceAll("'", "''")}'`
}

/** Read `name` / `description` / `order` from the planted preset.yml.
 * `order` defaults to 10: the shipped presets use 1-4, so 编程模式 still lists
 * after them, which is where it sits today (no order meant "after every
 * ordered row"). Missing name or description is an error — the row would be
 * unlabeled in the picker.
 * @param {string} text - preset.yml contents.
 * @returns {{ name: string, description: string, order: number }} */
export function readPresetMetadata(text) {
	const metadata = {}
	for (const line of text.split(/\r?\n/)) {
		const match = /^([A-Za-z]+):\s*(.*)$/.exec(line.trim())
		if (match === null) continue
		const [, key, raw] = match
		if (key !== 'name' && key !== 'description' && key !== 'order') continue
		const value = raw.trim()
		if (value === '' || value === '~' || value === 'null') continue
		metadata[key] = value.length >= 2 && ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))
			? value.slice(1, -1)
			: value
	}
	if (typeof metadata.name !== 'string' || typeof metadata.description !== 'string') {
		throw new Error(`preset metadata needs name and description (got: ${Object.keys(metadata).join(', ') || 'nothing'})`)
	}
	const order = Number.parseInt(String(metadata.order ?? ''), 10)
	return {
		name: metadata.name,
		description: metadata.description,
		order: Number.isFinite(order) ? order : 10,
	}
}

/** Rows the 0.2.x host standard has moved on from. The bundled composition is
 * authored against the 0.1.x standard (that is what the roster channel and the
 * 0.1.x CLI mount), and the declaration row is the 0.2.x channel only — so the
 * differences are patched here instead of forking the composition, which would
 * give the two channels two sources of truth.
 *
 * Measured against `dsh-web-app/presets/standard.patch.yml` of 0.2.0-rc.2, the
 * whole drift is three rows:
 *   - `dsh-workflow-worker-thread` was replaced by `dsh-workflow-ptc` (the
 *     provider row inside the `delegation` group's `workflowEngine` realm);
 *   - `tool-ralph` is disabled there;
 *   - `tool-plugin-manager` (`@deepseek-ai/dsh-plugin-manager/tools`, disabled)
 *     is new.
 * The first one is not cosmetic: `@deepseek-ai/dsh-workflow-worker-thread`
 * resolves to the stale 0.1.5 copy the CLI left in `$DSH_HOME/profiles/
 * node_modules`, the host disables that row as peer-incompatible, `workflowEngine`
 * is then never provided, and `tool-workflow` / `tool-ralph` wait for it forever —
 * the registry lists the preset as `broken` and the mode picker hides it. Named
 * for what the row has to become, not for what it replaces.
 * @type {Map<string, (indent: string) => string>} */
const HOST_0_2_ROW_FIXES = new Map([
	['- id: workflow-worker-thread', (indent) => `${indent}- id: workflow-ptc`],
	["name: '@deepseek-ai/dsh-workflow-worker-thread'", (indent) => `${indent}name: '@deepseek-ai/dsh-workflow-ptc'`],
	["name: '@deepseek-ai/dsh-tool-ralph'", (indent) => `${indent}name: '@deepseek-ai/dsh-tool-ralph'\n${indent}disabled: true`],
	// The row after `present` is a sibling, so its `- id:` line sits two columns
	// left of a key line — the one relative indentation YAML fixes for this style.
	["name: '@deepseek-ai/dsh-tool-present'", (indent) => `${indent}name: '@deepseek-ai/dsh-tool-present'\n${indent.slice(2)}- id: tool-plugin-manager\n${indent}name: '@deepseek-ai/dsh-plugin-manager/tools'\n${indent}disabled: true`],
])

/** Rewrite the lines that cannot survive the change of host: the two references
 * that were relative to the preset directory, and the rows the 0.2.x standard
 * moved on from. Indentation is kept per line; the caller shifts every line as a
 * whole, so relative structure (`config:`, nested lists, block scalars) stays.
 * @param {string} line - one line of the planted agent.cordis.yml.
 * @param {{ moduleUrl: string, skillsDir: string }} refs
 * @returns {string} one or more lines, newline-separated. */
function transformLine(line, refs) {
	const indent = /^[ \t]*/.exec(line)?.[0] ?? ''
	const body = line.trim()
	if (body === '') return ''
	const fix = HOST_0_2_ROW_FIXES.get(body)
	if (fix !== undefined) return fix(indent)
	if (body === PLUGIN_MODULE_ROW) return `${indent}name: '${refs.moduleUrl}'`
	if (body.includes(SKILLS_EXPR_MARK)) return `${indent}- '${refs.skillsDir}'`
	return replaceTrailingWhitespace(line)
}

const replaceTrailingWhitespace = (line) => line.replace(/[ \t]+$/, '')

/** Build the marker block: the preset as a declaration row.
 * @param {{
 *   version: string,
 *   compositionText: string,
 *   metadata: { name: string, description: string, order: number },
 *   presetId?: string,
 *   moduleUrl: string,
 *   skillsDir: string,
 *   name?: string,
 *   description?: string,
 *   order?: number,
 *   pluginsText?: string,
 * }} options - either a full preset (compositionText + metadata) or an explicit
 *   declaration (name/description/order/pluginsText), which is how the tombstone
 *   row passes the host's own standard composition through unchanged.
 * @returns {string} the block, newline-terminated. */
export function buildDeclaration(options) {
	const version = String(options.version)
	const id = String(options.presetId ?? 'programming')
	const name = options.name ?? options.metadata.name
	const description = options.description ?? options.metadata.description
	const order = options.order ?? options.metadata.order
	const pluginLines = (options.pluginsText !== undefined
		? options.pluginsText.split(/\r?\n/)
		// flatMap: a transform may emit several lines (a disabled flag, an added row).
		: options.compositionText.split(/\r?\n/).flatMap((line) => transformLine(line, { moduleUrl: options.moduleUrl, skillsDir: options.skillsDir }).split('\n')))
		.map((line) => replaceTrailingWhitespace(line))
		.filter((line) => line.trim() !== '')
	if (pluginLines.length === 0) throw new Error('declaration has no plugin rows')
	const body = pluginLines.map((line) => `${' '.repeat(PLUGINS_INDENT)}${line.replace(/\s+$/, '')}`).join('\n')
	return [
		BLOCK_BEGIN(version),
		'- insert:',
		`    - id: ${DECLARATION_ROW_ID}`,
		"      name: '@deepseek-ai/dsh-agent-preset'",
		'      config:',
		`        id: ${id}`,
		`        name: ${quoteYaml(name)}`,
		`        description: ${quoteYaml(description)}`,
		`        order: ${Number(order)}`,
		'        plugins:',
		`${body}`,
		BLOCK_END,
		'',
	].join('\n')
}

/** Whether the patch text carries our block, optionally at one exact version.
 * @param {string} text
 * @param {string} [version]
 * @returns {boolean} */
export function hasBlock(text, version) {
	if (typeof text !== 'string') return false
	if (version !== undefined) return text.includes(BLOCK_BEGIN(version))
	return text.includes('# >>> dsh-programming-mode preset declaration') && text.includes(BLOCK_END)
}

/** Whether a patch file contributes no rows yet: only comments, whitespace, or
 * the empty flow sequence a freshly created profile's template carries
 * (`# comments` + `[]`). Appending a block after `[]` is not "adding a row" —
 * the host's YAML parser rejects `[]` followed by `- insert:` with "end of the
 * stream or a document separator is expected", which fails the profile load
 * before any plugin (ours included) gets to run. So this is the common case,
 * not a corner case, and the block has to replace the placeholder.
 * @param {string} text
 * @returns {boolean} */
function hasNoRows(text) {
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (trimmed === '' || trimmed.startsWith('#') || trimmed === '[]' || trimmed === '[ ]') continue
		return false
	}
	return true
}

/** Replace our block in place, or append it when absent.
 * A patch with no rows yet gets the block alone: the block IS the top-level
 * list, and appending it after `[]` would produce a document the host rejects.
 * @param {string} text
 * @param {string} block
 * @returns {string} */
export function replaceBlock(text, block) {
	const current = typeof text === 'string' ? text : ''
	const lines = current.split('\n')
	const begin = lines.findIndex((line) => line.trimStart().startsWith('# >>> dsh-programming-mode preset declaration'))
	const end = lines.findIndex((line) => line.trimStart() === BLOCK_END)
	if (begin !== -1 && end !== -1 && end > begin) {
		const replacement = block.replace(/\n$/, '').split('\n')
		return [...lines.slice(0, begin), ...replacement, ...lines.slice(end + 1)].join('\n')
	}
	if (hasNoRows(current)) {
		// Keep the comments — the shipped template explains the file's format —
		// but drop the empty-list placeholder: `[]` followed by our block is a
		// document the host's YAML parser rejects.
		const kept = lines.filter((line) => line.trim() !== '[]' && line.trim() !== '[ ]').join('\n').replace(/\s+$/, '')
		return kept === '' ? block : `${kept}\n\n${block}`
	}
	const separator = current.endsWith('\n') ? '' : '\n'
	return `${current}${separator}\n${block}`
}

/** Drop our block, leaving every other byte of the file alone.
 * @param {string} text
 * @returns {string} */
export function removeBlock(text) {
	if (typeof text !== 'string') return text
	const lines = text.split('\n')
	const begin = lines.findIndex((line) => line.trimStart().startsWith('# >>> dsh-programming-mode preset declaration'))
	const end = lines.findIndex((line) => line.trimStart() === BLOCK_END)
	if (begin === -1 || end === -1 || end <= begin) return text
	const kept = [...lines.slice(0, begin), ...lines.slice(end + 1)]
	const compact = kept.join('\n').replace(/^\s*\n/, '')
	// A patch left with no rows at all must still be a valid YAML document:
	// comments alone parse to null, which the host rejects with "must be a
	// top-level YAML array". Restore the empty list the shipped template starts
	// with, keeping any comments that were already there.
	if (hasNoRows(compact)) {
		const comments = compact.replace(/\s+$/, '')
		return comments === '' ? '[]\n' : `${comments}\n[]\n`
	}
	return compact
}

/** Whether the file can receive a patch block at all: a top-level YAML list.
 * Checking this by text rather than by parsing is deliberate — the package has
 * no YAML dependency, and the host throws on a non-sequence patch file.
 * @param {string} text
 * @returns {boolean} */
export function isListLike(text) {
	if (typeof text !== 'string') return false
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (trimmed === '' || trimmed.startsWith('#')) continue
		return trimmed.startsWith('- ') || trimmed.startsWith('-') || trimmed.startsWith('[')
	}
	return true
}

/** Structural invariants of a generated block, asserted before it is written.
 * They catch the two failure modes that matter: a reference that would not
 * resolve at mount time, and a block that is not a YAML list of rows.
 * @param {string} block
 * @returns {string[]} the violated invariants, empty when the block is sound. */
export function blockProblems(block) {
	const problems = []
	const bodies = block.split('\n').map((line) => line.trim())
	if (!bodies.includes('- insert:')) problems.push('block is not wrapped in - insert:')
	if (!bodies.includes(`- id: ${DECLARATION_ROW_ID}`)) problems.push(`block declares no ${DECLARATION_ROW_ID} row`)
	if (!block.includes(BLOCK_END)) problems.push('block has no end marker')
	// Comments are inert in YAML, so only executable lines can carry a stale
	// reference — a comment mentioning `baseUrl` says nothing about resolution.
	const code = block.split('\n').filter((line) => !line.trimStart().startsWith('#'))
	if (code.some((line) => line.trim() === PLUGIN_MODULE_ROW)) problems.push('still references the preset-relative injection module')
	if (code.some((line) => line.includes(SKILLS_EXPR_MARK))) problems.push('still derives the skills directory from baseUrl')
	if (code.some((line) => line.includes('baseUrl'))) problems.push('still mentions baseUrl')
	for (const line of code) {
		if (line.trim() === '') continue
		const indent = line.length - line.trimStart().length
		if (indent % 2 !== 0) problems.push(`odd indentation (${indent}): ${line.slice(0, 40)}`)
	}
	return problems
}

/** Atomic write: a half-written profile patch fails to parse on every host
 * that reads it, so the file is never left in a partial state.
 * @param {string} path
 * @param {string} text */
export function writeProfilePatch(path, text) {
	const temporary = `${path}.dsh-programming-mode.tmp`
	writeFileSync(temporary, text)
	renameSync(temporary, path)
}

/** Absolute path of the profile patch the declaration belongs in.
 * The profile tree's baseUrl is the directory holding `cordis.yml`, which is
 * exactly where the profile's own patch layer lives. Absent on a 0.1.x host
 * (where Include rewrites baseUrl to the preset directory), which is what makes
 * the roster channel fall through to directory planting.
 * @param {string | undefined} baseUrl
 * @returns {string | undefined} */
export function profilePatchPath(baseUrl) {
	if (typeof baseUrl !== 'string' || baseUrl === '') return undefined
	let path
	try {
		path = fileURLToPath(new URL('cordis.patch.yml', baseUrl))
	} catch {
		return undefined
	}
	const dir = dirname(path)
	for (const required of ['package.json', 'cordis.yml']) {
		try {
			readFileSync(join(dir, required))
		} catch {
			return undefined
		}
	}
	return path
}
