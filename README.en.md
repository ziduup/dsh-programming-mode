# dsh-programming-mode (Programming Mode bundle)

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/ziduup/dsh-programming-mode) [![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fziduup%2Fdsh-programming-mode%2Fmain%2Fpackage.json&query=$.version&label=version&color=blue)](CHANGELOG.md) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文](README.md) · English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) **bundle** that ships the **编程模式** agent preset: the full `standard` coding agent with its persona replaced by a mandatory Superpowers engineering discipline.

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

```sh
# from npm (recommended, registry channel)
dsh plugin --profile web add @ziduup/dsh-programming-mode

# from GitHub (git direct install)
dsh plugin --profile web add github:ziduup/dsh-programming-mode
```

Restart the profile; the 编程模式 preset then appears in the mode picker. At profile boot the installer plants the bundled preset into the roster's first user-trust preset root — version-stamped, idempotent between equal versions, and it never touches directories it did not plant. The planted copy is self-contained: its only bundle-owned row (`force-superpowers`) ships inside the preset directory as `./force-superpowers.mjs`, so it never holds a dangling reference to the bundle, and it removes itself at the next boot once no profile installs the bundle anymore (see Uninstall).

## Uninstall

```sh
dsh plugin --profile web remove @ziduup/dsh-programming-mode
```

Uninstalling is complete on its own — no manual cleanup. pnpm (what `dsh plugin remove` forwards to) runs no lifecycle hooks of removed packages and the market dispatches no uninstall events, so cleanup is done by the planted preset itself at every host boot: when no profile's package.json references this package anymore, it converts itself into a **tombstone** — the composition is replaced with a copy of dsh's shipped standard preset (rows reference packages by name, needing nothing from this bundle) and the metadata is relabeled to 编程模式（已卸载）. The reason: sessions permanently record the preset they ran under, and the host hard-fails a resume whose preset is missing with no fallback — deleting the directory outright would make every recorded session unopenable. The tombstone keeps history openable (running with standard-mode behavior) at the cost of one honestly-labeled picker entry; once you no longer need those sessions, delete the directory (or run the uninstaller). Reinstalling the bundle repairs the tombstone into the full mode automatically. To convert immediately without waiting for a restart:

```sh
node ~/.dsh/.agent-presets/programming/uninstall.mjs
```

## Self-contained

All twenty-one required workflow skills ship inside the preset (`preset/programming/skills/`): fifteen derived from [obra/superpowers](https://github.com/obra/superpowers) and six from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), both MIT — see [skills attribution](preset/programming/skills/SKILLS-LICENSE.md). You need nothing in your own skill roots; the bundled copy outranks user skill roots by provider rank, so same-named local skills are shadowed cleanly instead of conflicting.

## Trust note

An agent preset carries the same authority as shell access. Installing one means trusting every plugin row it references — review `agent.cordis.yml` before installing someone else's build.

## License

MIT © 子都 (ziduup). Bundled skills retain their upstream MIT terms with attribution in `SKILLS-LICENSE.md`.
