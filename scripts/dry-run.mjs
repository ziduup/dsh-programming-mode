// Dry-run: exercise plantPreset against a throwaway directory to verify the
// four planting policies (fresh plant, idempotent no-op, version upgrade,
// foreign-dir refusal), that the planted preset is self-contained (its
// force-superpowers row references ./force-superpowers.mjs, never the bundle
// package), that the planted injection module works without the bundle
// installed, and the uninstall lifecycle (orphan self-removal when no profile
// installs the bundle, manual self-uninstaller). Runs offline; nothing outside
// scripts/tmp-plant-test is touched.
//
// Usage: node scripts/dry-run.mjs

import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zstdCompressSync } from 'node:zlib'
import { declarePreset, plantPreset } from '../index.js'
import { hasBlock } from '../preset/programming/declaration.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
// The real installer stamps the running package's version into the declaration
// marker, so the two checks that drive it read the version instead of pinning
// a literal that has to be edited on every release.
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const sandbox = join(here, 'tmp-plant-test')
rmSync(sandbox, { recursive: true, force: true })
mkdirSync(join(sandbox, 'root'), { recursive: true })
// force-superpowers.mjs reads DSH_HOME at call time; point it at the sandbox
// so the orphan check scans fake profiles, never the developer's real ones.
process.env.DSH_HOME = join(sandbox, 'dsh-home')
// locateShippedStandard also probes the RUNNING CLI via process.argv[1]; pin
// it to a sandbox path so tests 7-9 stay hermetic no matter where this script
// runs from (test 12 overrides it deliberately and restores the pin).
const argvPin = join(sandbox, 'nothing', 'bin.js')
const argvBackup = process.argv[1]
process.argv[1] = argvPin
const fakeProfileManifest = join(sandbox, 'dsh-home', 'profiles', 'web', 'package.json')
mkdirSync(join(sandbox, 'dsh-home', 'profiles', 'web'), { recursive: true })
writeFileSync(fakeProfileManifest, JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: { '@ziduup/dsh-programming-mode': 'file:./x.tgz' } }))

function show(result) {
	console.log(`[${result.action}] ${result.targetDir ?? ''}${result.reason ? ` — ${result.reason}` : ''}${!result.reason && result.version ? ` — v${result.version}` : ''}`)
}

const STAMP_FILENAME = '.dsh-programming-mode.installed.json'

function stampVersion(dir) {
	return JSON.parse(readFileSync(join(dir, STAMP_FILENAME), 'utf8')).version
}

console.log('== 1. fresh plant ==')
show(plantPreset({ targetParent: join(sandbox, 'root'), version: '0.1.0' }))
const planted = join(sandbox, 'root', 'programming')
console.log('   top-level entries:', readdirSync(planted).join(', '))
console.log('   bundled skills:', readdirSync(join(planted, 'skills')).filter((entry) => entry !== 'SKILLS-LICENSE.md').length)

console.log('== 2. same version replant -> unchanged ==')
writeFileSync(join(planted, 'user-edit-marker.txt'), 'local edit')
show(plantPreset({ targetParent: join(sandbox, 'root'), version: '0.1.0' }))
console.log('   user edit preserved:', existsSync(join(planted, 'user-edit-marker.txt')))

console.log('== 3. version upgrade -> overwrite ==')
show(plantPreset({ targetParent: join(sandbox, 'root'), version: '0.2.0' }))
console.log('   stamp now:', stampVersion(planted))

console.log('== 4. foreign dir without stamp -> refused ==')
mkdirSync(join(sandbox, 'foreign', 'programming'), { recursive: true })
writeFileSync(join(sandbox, 'foreign', 'programming', 'agent.cordis.yml'), '# mine\n[]')
show(plantPreset({ targetParent: join(sandbox, 'foreign') }))

console.log('== 5. planted preset does not reference the bundle package ==')
const composition = readFileSync(join(planted, 'agent.cordis.yml'), 'utf8')
assert.ok(!composition.includes('@ziduup/dsh-programming-mode'), 'planted composition still references the bundle package')
assert.ok(composition.includes("'./force-superpowers.mjs'"), 'planted composition does not reference the bundled injection module')
assert.ok(existsSync(join(planted, 'force-superpowers.mjs')), 'bundled injection module missing from the planted preset')
const injectedModuleSource = readFileSync(join(planted, 'force-superpowers.mjs'), 'utf8')
assert.ok(!/\bimport\s*\(?\s*['"]@ziduup/.test(injectedModuleSource), 'injection module imports the bundle package')
assert.ok(injectedModuleSource.includes("INSTALLER_PACKAGE = '@ziduup/dsh-programming-mode'"), 'orphan check lost its installer-package constant')
console.log('   no bundle-package import; ./force-superpowers.mjs present')

console.log('== 6. planted injection module works without the bundle installed ==')
const mod = await import(pathToFileURL(join(planted, 'force-superpowers.mjs')).href)
assert.equal(typeof mod.apply, 'function', 'module exports no apply()')
const skills = {
	async get(skillName) {
		return { name: skillName, provider: 'dry-run', content: 'SKILL BODY', resourceBase: { kind: 'directory', path: '/skills' } }
	},
}
let handler
const ctx = {
	on(event, registered) {
		assert.equal(event, 'agent/pre-step')
		handler = registered
	},
	get(name) {
		return name === 'skills' ? skills : undefined
	},
}
mod.apply(ctx)
assert.equal(typeof handler, 'function', 'apply() registered no agent/pre-step handler')

const signal = { throwIfAborted() {} }
const next = async () => ({ kind: 'enter', messages: [{ id: 'original' }] })
const agent = { id: 'dry-run', session: { header: { cwd: sandbox }, events: [] } }
const injected = await handler({ agent, signal }, next)
assert.equal(injected.kind, 'enter')
assert.equal(injected.messages.length, 2, 'first pre-step did not inject the skill')
assert.equal(injected.messages[0].id, 'original')
assert.match(injected.messages[1].content[0].text, /<skill_content name="using-superpowers">/)
assert.match(injected.messages[1].content[0].text, /SKILL BODY/)
// The source must be `skill-invocation`: dsh 0.2.x (session format v4) refuses
// a `plugin`-kind source on write AND on read — "format v4 message requires a
// producer-owned source kind", which fails the whole run — and these are
// exactly the members the released v0->v1 validator admits for this kind, so
// no member may be added back either.
assert.deepEqual(
	Object.keys(injected.messages[1].source).sort(),
	['form', 'kind', 'name'],
	'injection source members drifted from the released skill-invocation shape',
)
assert.equal(injected.messages[1].source.kind, 'skill-invocation')
assert.equal(injected.messages[1].source.name, 'using-superpowers')
console.log('   hook injected using-superpowers into the first pre-step batch')

// Every shape this plugin has ever written dedupes: the current one, the
// plugin-kind source released up to 0.3.8, and the pre-0.3.4 skill-invocation.
for (const source of [
	{ kind: 'skill-invocation', name: 'using-superpowers', form: 'instructions' },
	{ kind: 'plugin', plugin: '@deepseek-ai/dsh-programming-mode', form: 'instructions' },
	{ kind: 'skill-invocation', name: 'using-superpowers' },
]) {
	agent.session.events = [{ type: 'user/message', data: { source } }]
	const again = await handler({ agent, signal }, next)
	assert.equal(again.messages.length, 1, `already-injected session received a second injection (${JSON.stringify(source)})`)
}
agent.session.events = [{ type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'some-other-skill', form: 'instructions' } } }]
const other = await handler({ agent, signal }, next)
assert.equal(other.messages.length, 2, 'an unrelated skill injection suppressed the forced one')
const rejected = await handler({ agent, signal }, async () => ({ kind: 'reject', reason: 'x' }))
assert.deepEqual(rejected, { kind: 'reject', reason: 'x' })
console.log('   idempotent across resume, and reject decisions pass through')

console.log('== 7. installer still installed in a profile -> preset kept ==')
assert.equal(mod.removeIfOrphaned().action, 'kept')
assert.ok(existsSync(planted), 'preset touched while the installer is still installed')
console.log('   kept:', mod.removeIfOrphaned().reason)

console.log('== 7b. per-profile uninstall: the row goes, the shared directory stays ==')
// Two profiles under one $DSH_HOME: `alpha` no longer installs the bundle while
// `web` still does. The ROW half is per profile, so alpha is cleaned by its own
// uninstall; the planted directory is shared, so it must survive for `web`.
// Judging only globally (how this module settled before the 0.4.0 change) left
// alpha's row fully active — an uninstalled profile kept offering a working 编程模式.
const alphaDir = join(sandbox, 'dsh-home', 'profiles', 'alpha')
mkdirSync(alphaDir, { recursive: true })
writeFileSync(join(alphaDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-alpha', private: true, dependencies: {} }))
writeFileSync(join(alphaDir, 'cordis.yml'), '# alpha profile root\n[]\n')
const alphaPatch = join(alphaDir, 'cordis.patch.yml')
const alphaUserRows = "# alpha's own rows\n- insert:\n    - id: keep-me\n      name: '@deepseek-ai/dsh-tool-todo'\n"
writeFileSync(alphaPatch, alphaUserRows)
const alphaBaseUrl = pathToFileURL(join(alphaDir, 'cordis.yml')).href
assert.equal(declarePreset({ ctx: { baseUrl: alphaBaseUrl }, plantedDir: planted, version: '0.4.0' }).action, 'declared', 'alpha declaration not written')
const alphaCleaned = await mod.removeIfOrphaned({ dir: planted, dshHome: join(sandbox, 'dsh-home'), patchPath: alphaPatch })
assert.equal(alphaCleaned.action, 'removed', `per-profile cleanup did not remove the row: ${alphaCleaned.reason ?? alphaCleaned.action}`)
const alphaAfter = readFileSync(alphaPatch, 'utf8')
assert.ok(!hasBlock(alphaAfter), 'alpha kept the declaration row after uninstalling')
assert.ok(alphaAfter.includes('keep-me'), "alpha cleanup dropped the profile's own rows")
assert.ok(existsSync(join(planted, 'skills')), 'the shared directory was touched while another profile still installs the bundle')
console.log('   row removed on the uninstalled profile, shared directory untouched:', alphaCleaned.detail)

console.log('== 7c. per-profile uninstall with recorded sessions -> row tombstone only ==')
// One recorded session names the preset, so the row must survive as a
// tombstone — and only the ROW: the directory is still `web`'s full mode.
const sessionLog = join(sandbox, 'dsh-home', 'sessions', '--E-work--', 'session-1', 'session.v4.jsonl.zstd')
mkdirSync(dirname(sessionLog), { recursive: true })
writeFileSync(sessionLog, zstdCompressSync(Buffer.from('{"type":"session","version":4,"id":"session-1","cwd":"E:\\\\work","isSeeded":false,"delegationDepth":0,"agentPreset":"programming"}\n')))
assert.equal(declarePreset({ ctx: { baseUrl: alphaBaseUrl }, plantedDir: planted, version: '0.4.0' }).action, 'declared', 'alpha declaration not re-written')
const alphaStandard = "- id: persona\n  name: '@deepseek-ai/dsh-persona'\n"
const alphaReadDocument = async (id) => {
	if (id !== 'standard') throw new Error(`unexpected preset: ${id}`)
	return { content: alphaStandard }
}
const alphaTomb = await mod.removeIfOrphaned({ dir: planted, dshHome: join(sandbox, 'dsh-home'), patchPath: alphaPatch, readDocument: alphaReadDocument })
assert.equal(alphaTomb.action, 'tombstoned', `per-profile tombstone failed: ${alphaTomb.reason ?? alphaTomb.action}`)
const alphaTombPatch = readFileSync(alphaPatch, 'utf8')
assert.ok(alphaTombPatch.includes('编程模式（已卸载）'), 'alpha row not relabeled')
assert.ok(alphaTombPatch.includes("name: '@deepseek-ai/dsh-persona'"), 'alpha row did not adopt the standard composition')
assert.ok(!alphaTombPatch.includes('force-superpowers'), 'alpha tombstone kept our injection row')
assert.ok(existsSync(join(planted, 'skills')), 'per-profile tombstone dropped the shared skills directory')
assert.match(readFileSync(join(planted, 'agent.cordis.yml'), 'utf8'), /force-superpowers/, 'per-profile tombstone rewrote the shared composition')
assert.equal(JSON.parse(readFileSync(join(planted, STAMP_FILENAME), 'utf8')).tombstone, undefined, 'per-profile tombstone marked the shared directory')
console.log('   row tombstoned on the uninstalled profile; shared full mode left for the other profile')
// Leave the shared sandbox as the later tests expect it: the scenario above is
// over, and alpha's tombstone block is not part of their fixtures.
writeFileSync(alphaPatch, alphaUserRows)

console.log('== 8. orphan without a shipped standard preset -> kept (sessions must stay resumable) ==')
writeFileSync(fakeProfileManifest, JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {} }))
assert.equal((await mod.removeIfOrphaned()).action, 'kept')
assert.ok(existsSync(planted), 'preset touched while no tombstone could be built')
console.log('   kept:', (await mod.removeIfOrphaned()).reason)

console.log('== 9. orphan with shipped standard preset -> tombstone ==')
const standardComposition = '# tombstone source: shipped standard composition\n- id: persona\n  name: \'@deepseek-ai/dsh-persona\'\n'
const shippedStandard = join(sandbox, 'dsh-home', 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets', 'standard')
mkdirSync(shippedStandard, { recursive: true })
writeFileSync(join(shippedStandard, 'agent.cordis.yml'), standardComposition)
const fate = await mod.removeIfOrphaned()
assert.equal(fate.action, 'tombstoned')
assert.equal(readFileSync(join(planted, 'agent.cordis.yml'), 'utf8'), standardComposition, 'tombstone did not adopt the shipped standard composition')
assert.match(readFileSync(join(planted, 'preset.yml'), 'utf8'), /已卸载/, 'tombstone metadata not relabeled')
assert.ok(existsSync(join(planted, 'force-superpowers.mjs')), 'tombstone dropped the module uninstall.mjs imports')
assert.ok(!existsSync(join(planted, 'skills')), 'tombstone kept the bundled skills')
const tombStamp = JSON.parse(readFileSync(join(planted, '.dsh-programming-mode.installed.json'), 'utf8'))
assert.equal(tombStamp.tombstone, true, 'stamp missing the tombstone marker')
console.log('   tombstoned: standard composition adopted, metadata relabeled, skills dropped')

console.log('== 10. reinstall over a tombstone -> full mode re-planted even at the same version ==')
show(plantPreset({ targetParent: join(sandbox, 'root'), version: '0.2.0' }))
assert.equal(stampVersion(planted), '0.2.0')
assert.match(readFileSync(join(planted, 'agent.cordis.yml'), 'utf8'), /force-superpowers/, 'repair did not restore the injection row')
assert.ok(existsSync(join(planted, 'skills')), 'repair did not restore the bundled skills')
assert.equal(JSON.parse(readFileSync(join(planted, '.dsh-programming-mode.installed.json'), 'utf8')).tombstone, undefined, 'repair did not clear the tombstone marker')
console.log('   tombstone repaired into the full mode')

console.log('== 11. manual self-uninstaller still works standalone, refuses foreign dirs ==')
assert.match(mod.uninstallSelf(join(sandbox, 'foreign', 'programming')).reason, /no installer stamp/, 'uninstaller deleted a dir without a stamp')
const { uninstallSelf } = await import(pathToFileURL(join(planted, 'uninstall.mjs')).href)
const manual = uninstallSelf()
assert.equal(manual.action, 'removed')
assert.ok(!existsSync(planted), 'planted preset survived its own uninstaller')
console.log(`   planted dir removed via uninstall.mjs (v${manual.version}); foreign dir refused`)

console.log('== 11b. uninstall with no session history anywhere -> nothing left behind ==')
// The other half of the settlement: when no recorded session names the preset,
// an uninstall leaves nothing at all — every declaration block goes and the
// directory is deleted, so a user never has to run a second command. Its own
// home, so the history the tests above planted cannot leak in.
const cleanHome = join(sandbox, 'clean-home')
const cleanProfile = join(cleanHome, 'profiles', 'alpha')
const cleanPlanted = join(cleanHome, '.agent-presets', 'programming')
const cleanPatch = join(cleanProfile, 'cordis.patch.yml')
mkdirSync(cleanProfile, { recursive: true })
writeFileSync(join(cleanProfile, 'package.json'), JSON.stringify({ name: 'dsh-profile-alpha', private: true, dependencies: {} }))
mkdirSync(join(cleanPlanted, 'skills'), { recursive: true })
writeFileSync(join(cleanPlanted, 'agent.cordis.yml'), "- id: force-superpowers\n  name: './force-superpowers.mjs'\n")
writeFileSync(join(cleanPlanted, STAMP_FILENAME), JSON.stringify({ version: '0.3.8', channel: 'roster', source: 'dsh-programming-mode' }))
const cleanBlock = [
	'# >>> dsh-programming-mode preset declaration v0.3.8 >>>',
	'- insert:',
	'    - id: preset-programming',
	"      name: '@deepseek-ai/dsh-agent-preset'",
	'      config:',
	'        id: programming',
	'        plugins:',
	'          - id: force-superpowers',
	"            name: 'file:///x/force-superpowers.mjs'",
	'# <<< dsh-programming-mode preset declaration <<<',
	'',
].join('\n')
const cleanUserRows = "# alpha's own rows\n- insert:\n    - id: keep-me\n      name: '@deepseek-ai/dsh-tool-todo'\n"
writeFileSync(cleanPatch, cleanUserRows + cleanBlock)
// A session that ran under ANOTHER preset is not history this cleanup must
// protect: the scan matches the preset id exactly, not "any agentPreset".
const otherLog = join(cleanHome, 'sessions', '--E-other--', 'session-9', 'session.v4.jsonl.zstd')
mkdirSync(dirname(otherLog), { recursive: true })
writeFileSync(otherLog, zstdCompressSync(Buffer.from('{"type":"session","version":4,"id":"session-9","cwd":"E:\\\\other","isSeeded":false,"delegationDepth":0,"agentPreset":"standard"}\n')))
const cleanFate = await mod.removeIfOrphaned({ dir: cleanPlanted, dshHome: cleanHome })
assert.equal(cleanFate.action, 'removed', `history-free uninstall did not clean up: ${cleanFate.reason ?? cleanFate.action}`)
assert.ok(!existsSync(cleanPlanted), 'preset directory survived a history-free uninstall')
const cleanAfter = readFileSync(cleanPatch, 'utf8')
assert.ok(!cleanAfter.includes('dsh-programming-mode'), 'a declaration block survived the history-free uninstall')
assert.ok(cleanAfter.includes('keep-me'), "history-free cleanup dropped the profile's own rows")
console.log('   directory deleted and every declaration row removed:', cleanFate.detail)

console.log('== 12. shipped-standard discovery: every supported layout ==')
// (a) legacy layout inside the profiles tree (the shape test 9 plants).
assert.equal(mod.locateShippedStandard(join(sandbox, 'dsh-home', 'profiles')), shippedStandard, 'legacy profiles-tree layout not discovered')
console.log('   legacy profiles-tree layout discovered')
// (b) 0.1.5-rc.x layout: the dsh package carries dsh-agent-presets as its own
//     nested dependency inside a profile. Fresh home — (a)'s legacy dir would
//     otherwise win the first-candidate ordering by design.
const nestedStandard = join(sandbox, 'nested-home', 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'standard')
mkdirSync(nestedStandard, { recursive: true })
writeFileSync(join(nestedStandard, 'agent.cordis.yml'), standardComposition)
assert.equal(mod.locateShippedStandard(join(sandbox, 'nested-home', 'profiles')), nestedStandard, 'nested dsh-agent-presets layout not discovered')
console.log('   nested dsh-agent-presets layout discovered')
// (c) running-CLI layout via the argv walk-up — the npm -g case that no
//     profiles-tree scan can reach (the 0.3.7 tombstone gap).
const fakeCliStandard = join(sandbox, 'fake-cli', 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'standard')
mkdirSync(join(sandbox, 'cli-home', 'profiles'), { recursive: true })
mkdirSync(fakeCliStandard, { recursive: true })
writeFileSync(join(fakeCliStandard, 'agent.cordis.yml'), standardComposition)
process.argv[1] = join(sandbox, 'fake-cli', 'lib', 'bin.js')
assert.equal(mod.locateShippedStandard(join(sandbox, 'cli-home', 'profiles')), fakeCliStandard, 'running-CLI layout not discovered from argv walk-up')
console.log('   running-CLI layout discovered via argv walk-up')
// (d) real-installation smoke: when a dsh CLI is actually on PATH (developer
//     machine), discovery must hit its shipped standard; CI (no dsh) skips.
process.argv[1] = argvBackup
const shimDir = (process.env.PATH ?? '').split(delimiter).map((entry) => entry.trim()).filter(Boolean).find((dir) => existsSync(join(dir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh')))
if (shimDir !== undefined) {
	const realRoot = process.platform === 'win32'
		? join(shimDir, 'node_modules', '@deepseek-ai', 'dsh')
		: join(shimDir, '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh')
	const realStandard = join(realRoot, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'standard')
	if (existsSync(join(realStandard, 'agent.cordis.yml'))) {
		process.argv[1] = join(realRoot, 'lib', 'bin.js')
		assert.equal(mod.locateShippedStandard(join(sandbox, 'cli-home', 'profiles')), realStandard, 'real CLI installation not discovered via PATH shim')
		console.log('   real installation discovered:', realStandard)
	} else {
		console.log('   dsh on PATH but without a bundled dsh-agent-presets at the expected layout; skipped')
	}
} else {
	console.log('   no dsh CLI on PATH; real-installation smoke skipped (CI)')
}
process.argv[1] = argvPin

// ── dsh 0.2.x channel: the preset as a declaration row in the profile patch ──
// Test 11 deleted the planted copy, so re-plant at the current version first:
// every test below reads the planted preset the way a fresh install leaves it.
// (plantPreset comes from the static import at the top of this file.)
plantPreset({ targetParent: join(sandbox, 'root'), version: '0.4.0' })
// Every test below works on a throwaway PROFILE (a directory holding the two
// files that identify one), next to the throwaway $DSH_HOME the existing tests
// already pin. Nothing outside scripts/tmp-plant-test is touched.
const { apply: installerApply, detectModel, removeDeclaration } = await import('../index.js')
const {
	BLOCK_BEGIN,
	buildDeclaration,
	blockProblems,
	DECLARATION_ROW_ID,
	isListLike,
	readPresetMetadata,
	removeBlock,
	replaceBlock,
	profilePatchPath,
} = await import('../preset/programming/declaration.mjs')
const { uninstallDeclaration, declarationTargets } = await import(pathToFileURL(join(sandbox, 'root', 'programming', 'uninstall.mjs')).href)

// The throwaway profile lives under the throwaway $DSH_HOME so the manual
// uninstaller's own $DSH_HOME/profiles scan (test 18c) sees it exactly the way
// it sees a real one.
const profileDir = join(sandbox, 'dsh-home', 'profiles', 'desktop')
mkdirSync(profileDir, { recursive: true })
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-desktop', private: true, dependencies: {} }, null, 2) + '\n')
writeFileSync(join(profileDir, 'cordis.yml'), '[]\n')
const profilePatch = join(profileDir, 'cordis.patch.yml')
const profileBaseUrl = pathToFileURL(join(profileDir, 'cordis.yml')).href
const plantedHere = join(sandbox, 'root', 'programming')

console.log('== 13. declaration row generated from the planted composition ==')
const metadata = readPresetMetadata(readFileSync(join(plantedHere, 'preset.yml'), 'utf8'))
assert.equal(metadata.name, '编程模式')
assert.equal(metadata.order, 10, 'order should default to 10 when preset.yml carries none')
const moduleUrl = pathToFileURL(join(plantedHere, 'force-superpowers.mjs')).href
const skillsDir = join(plantedHere, 'skills')
const block = buildDeclaration({
	version: '0.4.0',
	compositionText: readFileSync(join(plantedHere, 'agent.cordis.yml'), 'utf8'),
	metadata,
	moduleUrl,
	skillsDir,
})
assert.deepEqual(blockProblems(block), [], `generated block is unsound: ${blockProblems(block).join('; ')}`)
const blockLines = block.split('\n')
assert.equal(blockLines[0], '# >>> dsh-programming-mode preset declaration v0.4.0 >>>', 'unexpected begin marker')
assert.ok(block.includes('        plugins:'), 'no plugins key')
assert.ok(block.includes('- insert:'), 'block is not wrapped in - insert:')
assert.ok(block.includes(`    - id: preset-programming`), 'no preset-programming row')
// The 0.2.x standard's row drift must be applied to THIS channel only: the
// 0.1.x composition keeps naming the worker-thread provider (the ptc package
// does not exist there), while the declaration row has to match what the
// 0.2.x host mounts — otherwise workflowEngine is never provided and the
// registry reports the preset as `broken`.
assert.ok(block.includes("name: '@deepseek-ai/dsh-workflow-ptc'"), 'declaration did not adopt the 0.2.x workflow provider row')
assert.ok(!block.includes('dsh-workflow-worker-thread'), 'declaration still names the 0.1.5 workflow provider')
assert.ok(block.includes('          - id: tool-plugin-manager'), 'declaration is missing the 0.2.x plugin-manager row')
const ralphRows = block.split('\n').filter((line) => line.includes("name: '@deepseek-ai/dsh-tool-ralph'"))
assert.equal(ralphRows.length, 1, 'tool-ralph row missing from the declaration')
const blockRowLines = block.split('\n')
const ralphAt = blockRowLines.findIndex((line) => line.includes("name: '@deepseek-ai/dsh-tool-ralph'"))
assert.equal(blockRowLines[ralphAt + 1].trim(), 'disabled: true', 'tool-ralph is not disabled the way the 0.2.x standard disables it 2')
const rosterComposition = readFileSync(join(plantedHere, 'agent.cordis.yml'), 'utf8')
assert.ok(rosterComposition.includes('dsh-workflow-worker-thread'), 'the 0.1.x composition must keep the worker-thread provider')
assert.ok(block.includes("      name: '@deepseek-ai/dsh-agent-preset'"), 'row does not name the preset plugin')
assert.ok(block.includes('        id: programming'), 'config does not carry the preset id')
assert.ok(block.includes(`        name: '${metadata.name}'`), 'config does not carry the preset name')
assert.ok(block.includes('        order: 10'), 'config does not carry the roster order')
assert.ok(block.includes(`name: '${moduleUrl}'`), 'injection row does not use the planted module URL')
assert.ok(block.includes(`- '${skillsDir}'`), 'skill dir row does not use the planted skills path')
// Comments are inert in YAML, so only executable lines can carry a stale
// reference (agent.cordis.yml documents baseUrl in prose).
const codeLines = block.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('#'))
assert.ok(!codeLines.some((line) => line.includes("'./force-superpowers.mjs'")), 'still references the preset-relative module')
assert.ok(!codeLines.some((line) => line.includes("new URL('skills/'")), 'still derives the skills dir from baseUrl')
assert.ok(!codeLines.some((line) => line.includes('baseUrl')), 'still mentions baseUrl')
const firstPluginLine = block.split('\n').find((line) => line.trimStart().startsWith('# ') === false && block.indexOf(line) > block.indexOf('        plugins:'))
assert.equal(firstPluginLine.length - firstPluginLine.trimStart().length, 10, 'plugins children are not at indent 10')
console.log('   block: insert row, preset-programming, plugins at indent 10, planted-file references only')

console.log('== 14. profile patch lifecycle ==')
const userRows = `# my profile patch\n- id: ui-theme\n  name: '@deepseek-ai/dsh-client-ui-theme'\n  config:\n    preference: light\n`
writeFileSync(profilePatch, userRows)
assert.equal(profilePatchPath(profileBaseUrl), profilePatch, 'profile patch path not derived from baseUrl')
const declared = declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: plantedHere, version: '0.4.0' })
assert.equal(declared.action, 'declared', `fresh write did not declare: ${declared.reason ?? ''}`)
const afterDeclare = readFileSync(profilePatch, 'utf8')
assert.ok(afterDeclare.startsWith(userRows), 'user rows were not preserved verbatim')
assert.ok(hasBlock(afterDeclare, '0.4.0'), 'block missing after declare')
const unchanged = declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: plantedHere, version: '0.4.0' })
assert.equal(unchanged.action, 'unchanged', 'same version rewrote the profile patch (local edits would be lost)')
assert.equal(readFileSync(profilePatch, 'utf8'), afterDeclare, 'unchanged run still modified the file')
writeFileSync(profilePatch, `${userRows}${afterDeclare.slice(userRows.length).replace('v0.4.0', 'v0.3.8').replace('order: 10', 'order: 11')}`)
const redeclared = declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: plantedHere, version: '0.4.0' })
assert.equal(redeclared.action, 'updated', 'different version did not replace the block')
const afterUpdate = readFileSync(profilePatch, 'utf8')
assert.ok(afterUpdate.includes(userRows.trim()), 'upgrade dropped the user rows')
assert.equal((afterUpdate.match(/preset-programming/g) ?? []).length, 1, 'upgrade left more than one declaration row')
console.log('   create / same-version no-op / upgrade replaces only our block')

console.log('== 14b. a freshly created profile patch (comments + `[]`) ==')
// The shape dsh itself ships in a new profile's cordis.patch.yml. Appending
// after the `[]` placeholder yields a document the host's YAML parser rejects
// ("end of the stream or a document separator is expected"), which fails the
// profile load before any plugin — ours included — gets to run. Found on the
// real 0.1.x host, reproduced here against its own loadOptionalPatches.
const shippedTemplate = '# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries (id-targeted config\n# overrides, disables, and insert lists; `!!js` expressions allowed).\n[]\n'
writeFileSync(profilePatch, shippedTemplate)
assert.equal(declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: plantedHere, version: '0.4.0' }).action, 'declared', 'fresh profile patch was not declared')
const afterTemplate = readFileSync(profilePatch, 'utf8')
assert.ok(afterTemplate.startsWith('# Your patch layer'), 'declaring dropped the template comments')
assert.ok(hasBlock(afterTemplate, '0.4.0'), 'declaring into a fresh profile patch wrote no row')
const templateHead = afterTemplate.slice(0, afterTemplate.indexOf(BLOCK_BEGIN('0.4.0')))
assert.ok(!templateHead.split('\n').includes('[]'), 'the row was appended after the `[]` placeholder the host cannot parse after')
assert.equal(removeDeclaration(profilePatch).action, 'removed', 'self-heal did not remove the row from a fresh patch')
const afterRemove = readFileSync(profilePatch, 'utf8')
assert.ok(afterRemove.includes('[]'), 'removing the row left no top-level array (the host would reject the file)')
assert.ok(afterRemove.startsWith('# Your patch layer'), 'removing the row dropped the template comments')
console.log('   row replaces the placeholder; removing it restores comments + []')

console.log('== 15. profile patch that is not a list -> refused, file untouched ==')
const brokenPatch = 'name: not-a-list\n'
writeFileSync(profilePatch, brokenPatch)
assert.equal(isListLike(brokenPatch), false)
const refused = declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: plantedHere, version: '0.4.0' })
assert.equal(refused.action, 'skipped', `non-list patch was not refused: ${refused.action}`)
assert.equal(readFileSync(profilePatch, 'utf8'), brokenPatch, 'refused run modified a file we do not own')
writeFileSync(profilePatch, afterUpdate)
console.log('   refused:', refused.reason)

console.log('== 16. 0.1.x host self-heal: declaration row removed before it can break the boot ==')
assert.equal(detectModel({ list: () => [] }), 'roster', 'roster host misdetected')
const healed = removeDeclaration(profilePatch)
assert.equal(healed.action, 'removed', `self-heal did not remove the block: ${healed.reason ?? ''}`)
const afterHeal = readFileSync(profilePatch, 'utf8')
assert.ok(!hasBlock(afterHeal), 'block survived the self-heal')
assert.ok(afterHeal.includes(userRows.trim()), 'self-heal dropped the user rows')
assert.equal(removeDeclaration(profilePatch).action, 'unchanged', 'second self-heal reported a change')
console.log('   block removed, user rows intact (note: on a real 0.1.x host this runs only after that boot already failed on the row)')

console.log('== 17. 0.2.x tombstone: declaration row adopts the host standard composition ==')
// Test 16 removed the block to prove the 0.1.x self-heal, so put a live
// declaration row back first — that is the state a 0.2.x host is in when the
// bundle has just been uninstalled.
assert.equal(declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: plantedHere, version: '0.4.0' }).action, 'declared', 're-declare before the tombstone failed')
const standardPlugins = `- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    prefix: You are a coding agent.\n- id: tool-bash\n  name: '@deepseek-ai/dsh-tool-bash'\n  disabled: !!js process.platform === 'win32'\n`
const fakeRegistry = {
	async readDocument(id) {
		if (id !== 'standard') throw new Error(`unexpected preset: ${id}`)
		return { content: standardPlugins }
	},
}
const plantedMod = await import(pathToFileURL(join(plantedHere, 'force-superpowers.mjs')).href)
const tombstoned = await plantedMod.removeIfOrphaned({
	dir: plantedHere,
	dshHome: join(sandbox, 'dsh-home'),
	patchPath: profilePatch,
	readDocument: fakeRegistry.readDocument,
})
assert.equal(tombstoned.action, 'tombstoned', `declaration tombstone failed: ${tombstoned.reason ?? ''}`)
const tombBlock = readFileSync(profilePatch, 'utf8')
assert.ok(tombBlock.includes('编程模式（已卸载）'), 'tombstone row not relabeled')
assert.ok(tombBlock.includes('        order: 99'), 'tombstone row not sunk to the bottom')
assert.ok(tombBlock.includes('You are a coding agent.'), 'tombstone row did not adopt the standard composition')
assert.ok(!tombBlock.includes('force-superpowers'), 'tombstone row kept our injection module')
assert.ok(!tombBlock.includes('Superpowers'), 'tombstone row kept our persona')
assert.ok(!existsSync(join(plantedHere, 'skills')), 'tombstone kept the bundled skills')
assert.equal(JSON.parse(readFileSync(join(plantedHere, STAMP_FILENAME), 'utf8')).tombstone, true, 'stamp missing the tombstone marker')
console.log('   row relabeled + standard composition adopted, skills dropped, stamp marked')

console.log('== 17b. tombstone refuses to half-apply when the host cannot answer ==')
const failingRegistry = { async readDocument() { throw new Error('registry is gone') } }
const kept = await plantedMod.removeIfOrphaned({
	dir: plantedHere,
	dshHome: join(sandbox, 'dsh-home'),
	patchPath: profilePatch,
	readDocument: failingRegistry.readDocument,
})
assert.equal(kept.action, 'kept', `a failing registry still tombstoned: ${kept.action}`)
assert.equal(readFileSync(profilePatch, 'utf8'), tombBlock, 'kept run modified the tombstone row')
console.log('   kept:', kept.reason)

console.log('== 18. installer apply() drives both channels ==')
// Detection reads the COMPOSED TREE, not the preset service: on a real host
// ctx.get('agentPresets') is still undefined when a plugin's apply() runs (the
// provider row has no fiber yet), so the service alone would send a 0.2.x host
// down the directory channel and the mode would never appear in the picker.
const registryTree = [{ options: { id: 'agent-preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry' } }]
const rosterTree = [{ options: { id: 'agent-presets', name: '@deepseek-ai/dsh-agent-presets' } }]
assert.equal(detectModel(undefined, registryTree), 'registry', 'registry row in the tree not recognized')
assert.equal(detectModel(undefined, rosterTree), 'roster', '0.1.x roster row misread as a registry host')
assert.equal(detectModel(undefined, undefined), 'roster', 'no tree and no service must fall back to the directory channel')
assert.equal(detectModel({ register: () => {} }, undefined), 'registry', 'service register() no longer recognized')
assert.equal(detectModel({ list: () => [] }, registryTree), 'registry', 'the composed tree must outrank the service signal')
// registry host (dsh 0.2.x). The registry service exposes no preset roots, so
// resolveTargetParent falls through to the derived default
// $DSH_HOME/.agent-presets — the very directory a 0.1.x roster scans, which is
// what makes a two-phase downgrade self-heal instead of losing the mode.
writeFileSync(profilePatch, userRows)
const registryCtx = {
	baseUrl: profileBaseUrl,
	get(name) { return name === 'agentPresets' ? { register: () => {}, readDocument: () => ({}) } : undefined },
	loader: { entries: () => registryTree },
}
assert.equal(detectModel(registryCtx.get('agentPresets')), 'registry', 'registry host misdetected')
const registryPlant = join(sandbox, 'dsh-home', '.agent-presets', 'programming')
rmSync(registryPlant, { recursive: true, force: true })
installerApply(registryCtx)
assert.ok(existsSync(join(registryPlant, 'agent.cordis.yml')), 'registry channel did not plant the preset directory')
const registryPatch = readFileSync(profilePatch, 'utf8')
assert.ok(hasBlock(registryPatch, PACKAGE_VERSION), 'registry channel wrote no declaration row')
assert.ok(registryPatch.includes(userRows.trim()), 'registry channel dropped the user rows')
const stampChannel = JSON.parse(readFileSync(join(registryPlant, STAMP_FILENAME), 'utf8')).channel
assert.equal(stampChannel, 'registry', `stamp does not record the channel: ${stampChannel}`)
// An UPGRADE plant (stamp at another version) must carry the version into the
// declaration marker. A real 0.2.0 desktop host upgrading 0.3.8 -> 0.4.0 wrote
// `vundefined` there: plantPreset's 'updated' branch returned `to` but not
// `version`, and apply() hands result.version to the row builder.
writeFileSync(profilePatch, userRows)
writeFileSync(join(registryPlant, STAMP_FILENAME), JSON.stringify({ version: '0.3.8', channel: 'registry', source: 'dsh-programming-mode' }))
installerApply(registryCtx)
const upgradedPatch = readFileSync(profilePatch, 'utf8')
assert.ok(hasBlock(upgradedPatch, PACKAGE_VERSION), 'an upgrade plant wrote no declaration row')
assert.ok(!upgradedPatch.includes('declaration vundefined'), 'the upgrade plant lost the version in the declaration marker')
// roster host (dsh 0.1.x): directory planting plus self-heal of the row above
const rosterCtx = {
	baseUrl: profileBaseUrl,
	get(name) { return name === 'agentPresets' ? { list: () => [], copy: () => {} } : undefined },
}
installerApply(rosterCtx)
assert.ok(!hasBlock(readFileSync(profilePatch, 'utf8')), 'roster host left a 0.2.x-only row in place')
console.log('   registry: directory + row, stamp channel=registry; roster: row self-healed away')

console.log('== 18b. metadata without a name -> no row, still no crash ==')
plantPreset({ targetParent: join(sandbox, 'root'), version: '0.4.0' })
const namelessDir = join(sandbox, 'root', 'nameless')
mkdirSync(namelessDir, { recursive: true })
cpSync(join(sandbox, 'root', 'programming'), namelessDir, { recursive: true })
writeFileSync(join(namelessDir, 'preset.yml'), 'description: no name here\n')
const nameless = declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: namelessDir, version: '0.4.0' })
assert.equal(nameless.action, 'error', `nameless metadata did not fail loudly: ${nameless.action}`)
assert.ok(!readFileSync(profilePatch, 'utf8').includes('nameless'), 'a nameless preset still produced a row')
console.log('   held off:', nameless.reason)

console.log('== 18c. manual uninstaller drops the row too ==')
// The roster self-heal in test 18 took the row out again, so a live 0.2.x row
// has to be written back before the uninstaller can be asked to remove one.
assert.equal(declarePreset({ ctx: { baseUrl: profileBaseUrl }, plantedDir: plantedHere, version: '0.4.0' }).action, 'declared', 're-declare before the uninstaller test failed')
const targets = declarationTargets([])
assert.ok(targets.includes(profilePatch), `uninstaller did not find the profile patch: ${targets.join(', ')}`)
assert.equal(uninstallDeclaration(profilePatch).action, 'removed', 'uninstaller left the declaration row')
assert.ok(!hasBlock(readFileSync(profilePatch, 'utf8')), 'declaration row survived uninstallDeclaration')
assert.deepEqual(declarationTargets([]), [], 'uninstaller still sees a row after removing it')
console.log('   declarationTargets scans profiles and uninstallDeclaration removes only our block')

console.log('== 19. the host loader accepts every patch shape we can write ==')
// With a real dsh on PATH, run our own output through the very loader that
// parses the profile patch at boot (loadOptionalPatches -> the host's YAML
// dialect). A shape it rejects is a profile that cannot start, which is how the
// `[]` placeholder defect behind 14b reached the real host in the first place.
const oracleShim = (process.env.PATH ?? '').split(delimiter).map((entry) => entry.trim()).filter(Boolean).find((dir) => existsSync(join(dir, process.platform === 'win32' ? 'dsh.cmd' : 'dsh')))
const oracleLib = oracleShim === undefined
	? undefined
	: join(oracleShim, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')
if (oracleLib !== undefined && existsSync(oracleLib)) {
	const host = await import(pathToFileURL(oracleLib).href)
	const oracleFile = join(sandbox, 'oracle.patch.yml')
	const oracleCases = [
		['user rows + block', replaceBlock(userRows, block)],
		['shipped template + block', replaceBlock(shippedTemplate, block)],
		['comment only + block', replaceBlock('# just a comment\n', block)],
	]
	for (const [label, text] of oracleCases) {
		writeFileSync(oracleFile, text)
		const patches = host.loadOptionalPatches('oracle', oracleFile)
		const ours = patches.filter((entry) => entry.insert?.some((row) => row.id === DECLARATION_ROW_ID)).length
		assert.equal(ours, 1, `the host loader did not admit our row in: ${label}`)
	}
	// The removal round-trip has to leave a loadable file as well, or the
	// uninstall/self-heal path breaks the profile it just cleaned.
	writeFileSync(oracleFile, replaceBlock(shippedTemplate, block))
	host.loadOptionalPatches('oracle', oracleFile)
	const oracleRemoved = removeBlock(readFileSync(oracleFile, 'utf8'))
	writeFileSync(oracleFile, oracleRemoved)
	assert.deepEqual(host.loadOptionalPatches('oracle', oracleFile), [], 'removal left a row behind')
	assert.equal(oracleRemoved, shippedTemplate, 'removal did not restore the shipped template byte-for-byte')
	console.log(`   host loader admitted our row in ${oracleCases.length} shapes; removal round-trip restores the template`)
} else {
	console.log('   no dsh installation on PATH; host-loader oracle skipped (CI)')
}

console.log('== done; sandbox left at scripts/tmp-plant-test for inspection ==')
