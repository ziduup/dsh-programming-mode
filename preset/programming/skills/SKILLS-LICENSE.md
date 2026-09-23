# Bundled Skills — Attribution & License

This preset bundles 21 skill directories under `skills/`: 15 from [obra/superpowers](https://github.com/obra/superpowers) and 6 from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

## Superpowers (15)

- **Origin:** [obra/superpowers](https://github.com/obra/superpowers) (Jesse Vincent / Human Layer)
- **Upstream version:** v6.4.1 — copied **verbatim** from the upstream `skills/` directory; the bundle tracks upstream one-to-one.
- **License:** MIT — bundled here under the terms of the MIT License; upstream copyright and license notices remain within each skill directory where present, and this notice serves as the attribution required by that license.
- **Modifications:** none to skill content, with one documented exception: `subagent-driven-development/implementer-prompt.md` carries an appended `## Harness notes (this harness only)` section (a harness-specific adaptation, not upstream content) — see CHANGELOG 0.3.1. Directory list refreshed at bundle v0.4.0: `diagnosing-superpowers` added (new in upstream v6.4.x). Earlier refreshes: v0.2.0 added `writing-skills`, removed `development-loop` (dropped by upstream).

## Ponytail (6)

- **Origin:** [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (Dietrich Gebert)
- **Source:** copied **verbatim** from the upstream `skills/` directory of the `ponytail` repository; the bundle tracks upstream's `skills/` one-to-one (the compact ladder that the persona embeds comes from upstream's `.clinerules/ponytail.md`). Verified against upstream v4.10.0 — all six are byte-identical, so no update was needed.
- **License:** MIT — bundled here under the terms of the MIT License; upstream copyright and license notices remain within each skill directory where present, and this notice serves as the attribution required by that license.
- **Modifications:** none to skill content.

## Bundled skills (21)

brainstorming · diagnosing-superpowers · dispatching-parallel-agents ·
executing-plans · finishing-a-development-branch · receiving-code-review ·
requesting-code-review · subagent-driven-development ·
systematic-debugging · test-driven-development · using-git-worktrees ·
using-superpowers · verification-before-completion · writing-plans ·
writing-skills · ponytail · ponytail-audit · ponytail-debt ·
ponytail-gain · ponytail-help · ponytail-review

## Why bundled

The 编程模式 persona mandates these workflow skills. Without bundling, recipients
without their own superpowers install would get a mode whose rules reference
skills it cannot load. The preset's `skill-filesystem` row scans this
directory via `customSkillDirs`, which outranks user skill roots, so a
recipient's own same-named copies are cleanly shadowed rather than conflicted.

The six ponytail skills ship so the code-volume discipline (persona rule 9) can
be loaded in full — with its intensity ladder and the review/audit/debt/gain/help
companions — on demand; the compact ladder itself is always present via the
persona.
