# dsh-programming-mode (Programming Mode bundle)

English summary — 完整文档见 [README.zh.md](README.zh.md)。

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
dsh plugin --profile web add github:ziduup/dsh-programming-mode
```

Restart the profile; the 编程模式 preset then appears in the mode picker. At profile boot the installer plants the bundled preset into the roster's first user-trust preset root — version-stamped, idempotent between equal versions, and it never touches directories it did not plant. Uninstalling the bundle does not delete a planted preset.

## Self-contained

All twenty required workflow skills ship inside the preset (`preset/programming/skills/`): fourteen derived from [obra/superpowers](https://github.com/obra/superpowers) and six from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), both MIT — see [skills attribution](preset/programming/skills/SKILLS-LICENSE.md). You need nothing in your own skill roots; the bundled copy outranks user skill roots by provider rank, so same-named local skills are shadowed cleanly instead of conflicting.

## Trust note

An agent preset carries the same authority as shell access. Installing one means trusting every plugin row it references — review `agent.cordis.yml` before installing someone else's build.

## License

MIT © 子都 (ziduup). Bundled skills retain their upstream MIT terms with attribution in `SKILLS-LICENSE.md`.
