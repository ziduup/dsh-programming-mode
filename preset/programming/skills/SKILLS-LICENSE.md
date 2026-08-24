# Bundled Skills — Attribution & License

This preset bundles 14 skill directories under `skills/`.

- **Origin:** [obra/superpowers](https://github.com/obra/superpowers) (Jesse Vincent / Human Layer)
- **License:** MIT — bundled here under the terms of the MIT License; upstream copyright and license notices remain within each skill directory where present, and this notice serves as the attribution required by that license.
- **Modifications:** none to skill content; directories were copied verbatim from a user-level install (`~/.agents/skills`) dated 2026.

## Bundled skills

using-superpowers · brainstorming · writing-plans · executing-plans ·
test-driven-development · systematic-debugging · verification-before-completion ·
requesting-code-review · receiving-code-review · using-git-worktrees ·
subagent-driven-development · finishing-a-development-branch ·
dispatching-parallel-agents · development-loop

## Why bundled

The 编程模式 persona mandates these workflow skills. Without bundling, recipients
without their own superpowers install would get a mode whose rules reference
skills it cannot load. The preset's `skill-filesystem` row scans this
directory via `customSkillDirs`, which outranks user skill roots, so a
recipient's own same-named copies are cleanly shadowed rather than conflicted.
