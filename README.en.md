# dsh-programming-mode (Programming Mode bundle)

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/ziduup/dsh-programming-mode) [![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fziduup%2Fdsh-programming-mode%2Fmain%2Fpackage.json&query=$.version&label=version&color=blue)](CHANGELOG.md) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文](README.md) · English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **bundle** that ships the **编程模式** agent preset: the full `standard` coding agent with its persona replaced by a mandatory Superpowers engineering discipline.

> **dsh 0.2.0 desktop support arrives in 0.4.0** (0.3.8 and earlier were 0.1.x CLI only). One package, one composition — the installer picks whichever discovery channel the host speaks.

## What it enforces

1. Skills before action (`using-superpowers`)
2. Design/brainstorming before building (`brainstorming`)
3. Plans before code (`writing-plans` → `executing-plans`)
4. Test-driven development, RED-GREEN-REFACTOR (`test-driven-development`)
5. Systematic debugging, root cause first (`systematic-debugging`)
6. Verification before completion, evidence over assertions (`verification-before-completion`)
7. Code review on significant work (`requesting-code-review` / `receiving-code-review`)
8. Requirement and plan documents written in Chinese for user audit
9. The full `using-superpowers` skill is mechanically injected into a new session's very first request batch (engine-level, independent of whether the model calls the `skill` tool), so the discipline applies from the first sentence
10. Always-on code-volume discipline (Ponytail): the 7-rung minimal-code ladder (YAGNI → reuse → stdlib → native → installed dependency → one line → minimum) runs at default `full` intensity in the persona every turn; it governs implementation volume only and never overrides the process rules above. The user can switch with "ponytail lite/ultra" or turn it off with "stop ponytail".

## Install

There is exactly one install command shape: `dsh plugin --profile <profile> add <source>`. dsh is a thin pnpm forwarder here — it initializes the profile, runs pnpm inside it, then folds every dependency that declares `dsh.bundle` into the profile's `dsh.profile.bundles` layer stack. **There is no separate `npm install` step**: "npm channel" only means the package resolves from the npm registry, one *source* among GitHub and a local tarball. Package page: [npmjs.com/package/@ziduup/dsh-programming-mode](https://www.npmjs.com/package/@ziduup/dsh-programming-mode).

```sh
# source 1: npm registry (recommended — the registry path is steadier)
dsh plugin --profile web add @ziduup/dsh-programming-mode

# source 2: GitHub (git direct install)
dsh plugin --profile web add github:ziduup/dsh-programming-mode

# source 3: local directory / tarball
dsh plugin --profile web add ./dsh-programming-mode
dsh plugin --profile web add ./dsh-programming-mode-<version>.tgz
```

**dsh 0.2.0 desktop build (supported since 0.4.0)**: install from the plugin market inside the app. The desktop profile is owned by the app and the CLI refuses it: `profile "desktop" is managed exclusively by the Electron application`.

> Installing by hand only does half the job: `cd ~/.dsh/profiles/web && pnpm add @ziduup/dsh-programming-mode` lands the package in `node_modules` but does **not** update `dsh.profile.bundles`, so the mode never appears — only `dsh plugin add` performs that reconciliation.

Restart the profile; the 编程模式 preset then appears in the mode picker. On the dsh 0.2.0 desktop build you may need to restart twice: the first boot only writes the declaration row, and the picker reads it on the next one.

If it is still missing after a restart, separate "never registered" from "registered but `broken`": the 0.2.0 picker does not list presets whose activation failed, and the usual cause is one row of the composition resolving to a stale 0.1.x package the host then disables as peer-incompatible, so the service that row should provide never arrives (a missing engine row leaves the workflow tools waiting forever). Since 0.4.0 the declaration row's drift is corrected against the same kernel version's `dsh-web-app/presets/standard.patch.yml` (`workflow-ptc`, `tool-ralph` disabled, `tool-plugin-manager`); check your own compositions against that file the same way.

If the mode *is* selectable but every run fails with `format v4 message requires a producer-owned source kind`, that is the first-step injection source used up to 0.3.8 colliding with session format v4 on 0.2.0: v4 admits only producer-owned kinds, and the retired `kind: 'plugin'` shape is hard-refused on both the write and the read path. Since 0.4.0 the injection carries the host's own `skill-invocation` record (the same one the `skill` tool attaches to its `<skill_content>` body), which every released validator admits, v0 through v4. Upgrade to 0.4.0 and new sessions run; existing logs are unaffected.

At profile boot the installer serves whichever discovery channel the host speaks:

| Host | Channel | What it writes |
|---|---|---|
| dsh 0.1.x | preset directory scan | plants the bundled preset into the roster's first user-trust root (default `$DSH_HOME/.agent-presets/`) |
| dsh 0.2.0+ | profile-patch declaration row | plants that same directory **and** writes a marker-fenced `- insert:` declaration row into the profile's own `cordis.patch.yml` |

0.2.0 replaced preset discovery: nothing reads a preset directory anymore, `dsh-agent-preset-registry` only serves entries registered through `AgentPresets.register()` — which is exactly why directory planting alone left the mode invisible on the desktop build. Both channels share one composition (the declaration row's `plugins` is the planted `agent.cordis.yml`, block-shifted by ten spaces), so there is no second copy to drift. The channel is chosen by reading the composed tree for the host's preset provider package; it is deliberately **not** read off the `agentPresets` service, which is not in the store yet when a plugin's `apply()` runs (measured on a real host).

Planting is version-stamped, idempotent between equal versions, and never touches a directory without our stamp. The declaration row side follows the same policy — append only when no block exists, leave the file alone at the same version, replace only our block on upgrade — so your own patch rows survive byte for byte. That row never names this package: it references only host-shipped packages and files the installer planted under `$DSH_HOME/.agent-presets/`, which is what lets it keep activating after the bundle is gone.

The planted copy is self-contained: its only bundle-owned row (`force-superpowers`) ships inside the preset directory as `./force-superpowers.mjs`, so it never holds a dangling reference to the bundle, and it settles itself once its profile (or every profile) stops installing the bundle — deleted when no session needs it, a tombstone when one does (see Uninstall).

## Uninstall

```sh
# dsh CLI / 0.1.x hosts
dsh plugin --profile web remove @ziduup/dsh-programming-mode

# dsh 0.2.0 desktop build: click uninstall in the plugin market inside the app
# (the desktop profile is owned by the app; the CLI cannot uninstall for it)
```

Uninstalling happens in two steps, each with a known edge:

**Step 1 (dsh side): the bundles list can be left dangling.** `dsh plugin remove` (the CLI path, verified with 0.3.8) cleans dependencies, node_modules, the lockfile AND the `dsh.profile.bundles` entry — boot works. But some uninstall paths do not guarantee that: one real uninstall on this machine left the bundles entry behind (dependencies cleaned, list not), and the next boot failed outright with `cannot resolve profile bundle "@ziduup/dsh-programming-mode"`, refusing to start the whole profile. If you hit that error, delete that one line from the `dsh.profile.bundles` array in the profile's `package.json` (only that line).

**Step 2 (this bundle): the automatic settlement after an uninstall.** pnpm runs no lifecycle hooks of removed packages and the market dispatches no uninstall events, so cleanup is done by the planted preset itself — **clicking uninstall is enough; nothing is left for you to run afterwards**. When it runs depends on the channel that persists it:

- **dsh 0.2.0+**: the declaration row lives in the profile patch and activates on every boot, so "uninstall → restart → settled" is the whole story.
- **dsh 0.1.x**: presets mount lazily per session, so activation happens when the mode picker is opened or an old session is resumed, not on every boot.

The settlement has two halves, judged separately:

- **The row is per profile**: whichever profile no longer installs the bundle has its own row cleaned, regardless of the others. (Up to 0.3.8 the check was global only, so uninstalling from A while B still installed the bundle left A offering a fully working 编程模式.)
- **The directory is global**: it is shared by every profile under one `$DSH_HOME`, so it is only touched once no profile installs the bundle anymore.

What "cleaned" means is decided by **session history**: sessions permanently record the preset they ran under (the `agentPreset` field), and the host hard-fails a resume whose preset is missing with no fallback. So the settlement scans the session logs under `<DSH_HOME>/sessions` (streamed zstd, stopping at the first hit):

- **no session ever ran under 编程模式** → the row and the directory are deleted, the picker entry disappears entirely, no tombstone;
- **some session did** → a **tombstone** survives: on 0.2.0 the declaration row is swapped for the host's own standard composition (read through the registry's `readDocument('standard')`, no filesystem guessing), on 0.1.x the planted directory is rewritten to that same standard composition, and the metadata is relabeled to 编程模式（已卸载）. Those sessions stay openable (running with standard-mode behavior) at the cost of one honestly-labeled picker entry (dsh's preset metadata has no "hide from picker" field today, so the entry cannot be hidden).

Reinstalling the bundle repairs the tombstone into the full mode automatically. To settle immediately instead of waiting for the next boot (the script deletes the directory and drops our marker block from each profile's patch, leaving every other row of yours untouched):

```sh
node ~/.dsh/.agent-presets/programming/uninstall.mjs            # scans every profile's patch
node ~/.dsh/.agent-presets/programming/uninstall.mjs --patch C:/Users/<you>/.dsh/profiles/desktop/cordis.patch.yml
```

Uninstalling from a single profile (while others still install the bundle) never touches the shared directory and never touches the other profiles — they keep the full mode. On the 0.2.0 desktop profile, `dsh plugin remove` can be refused by a `bundle-in-use` guard while a session runs under the mode — close that session first.

## Self-contained

All twenty-one required workflow skills ship inside the preset (`preset/programming/skills/`): fifteen derived from [obra/superpowers](https://github.com/obra/superpowers) and six from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), both MIT — see [skills attribution](preset/programming/skills/SKILLS-LICENSE.md). You need nothing in your own skill roots; the bundled copy outranks user skill roots by provider rank, so same-named local skills are shadowed cleanly instead of conflicting.

## Trust note

An agent preset carries the same authority as shell access. Installing one means trusting every plugin row it references — review `agent.cordis.yml` before installing someone else's build.

## License

MIT © 子都 (ziduup). Bundled skills retain their upstream MIT terms with attribution in `SKILLS-LICENSE.md`.
