// Dry-run: exercise plantPreset against a throwaway directory to verify the
// four planting policies (fresh plant, idempotent no-op, version upgrade,
// foreign-dir refusal) without touching any real DSH home.
//
// Usage: node scripts/dry-run.mjs

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { plantPreset } from '../index.js'

const here = fileURLToPath(new URL('.', import.meta.url))
const sandbox = join(here, 'tmp-plant-test')
rmSync(sandbox, { recursive: true, force: true })
mkdirSync(join(sandbox, 'root'), { recursive: true })

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

console.log('== done; sandbox left at scripts/tmp-plant-test for inspection ==')
