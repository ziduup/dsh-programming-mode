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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { plantPreset } from '../index.js'

const here = fileURLToPath(new URL('.', import.meta.url))
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

function stampVersion(dir) {
	return JSON.parse(readFileSync(join(dir, '.dsh-programming-mode.installed.json'), 'utf8')).version
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
assert.equal(injected.messages[1].source.kind, 'plugin')
assert.equal(injected.messages[1].source.plugin, '@deepseek-ai/dsh-programming-mode')
console.log('   hook injected using-superpowers into the first pre-step batch')

agent.session.events = [{ type: 'user/message', data: { source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-programming-mode' } } }]
const again = await handler({ agent, signal }, next)
assert.equal(again.messages.length, 1, 'already-injected session received a second injection')
const rejected = await handler({ agent, signal }, async () => ({ kind: 'reject', reason: 'x' }))
assert.deepEqual(rejected, { kind: 'reject', reason: 'x' })
console.log('   idempotent across resume, and reject decisions pass through')

console.log('== 7. installer still installed in a profile -> preset kept ==')
assert.equal(mod.removeIfOrphaned().action, 'kept')
assert.ok(existsSync(planted), 'preset touched while the installer is still installed')
console.log('   kept:', mod.removeIfOrphaned().reason)

console.log('== 8. orphan without a shipped standard preset -> kept (sessions must stay resumable) ==')
writeFileSync(fakeProfileManifest, JSON.stringify({ name: 'dsh-profile-web', private: true, dependencies: {} }))
assert.equal(mod.removeIfOrphaned().action, 'kept')
assert.ok(existsSync(planted), 'preset touched while no tombstone could be built')
console.log('   kept:', mod.removeIfOrphaned().reason)

console.log('== 9. orphan with shipped standard preset -> tombstone ==')
const standardComposition = '# tombstone source: shipped standard composition\n- id: persona\n  name: \'@deepseek-ai/dsh-persona\'\n'
const shippedStandard = join(sandbox, 'dsh-home', 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets', 'standard')
mkdirSync(shippedStandard, { recursive: true })
writeFileSync(join(shippedStandard, 'agent.cordis.yml'), standardComposition)
const fate = mod.removeIfOrphaned()
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

console.log('== done; sandbox left at scripts/tmp-plant-test for inspection ==')
