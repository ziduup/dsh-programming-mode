# Bundled Skills — Attribution & License

This preset bundles 20 skill directories under `skills/`: 14 from [obra/superpowers](https://github.com/obra/superpowers) and 6 from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

## Superpowers (14)

- **Origin:** [obra/superpowers](https://github.com/obra/superpowers) (Jesse Vincent / Human Layer)
- **Upstream version:** v6.3.0 (released 2026-08-12) — copied **verbatim** from the upstream `skills/` directory; the bundle tracks upstream one-to-one.
- **License:** MIT — bundled here under the terms of the MIT License; upstream copyright and license notices remain within each skill directory where present, and this notice serves as the attribution required by that license.
- **Modifications:** none to skill content. Directory list refreshed at bundle v0.2.0: `writing-skills` added; `development-loop` removed (dropped by upstream).

## Ponytail (6)

- **Origin:** [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (Dietrich Gebert)
- **Source:** copied **verbatim** from the upstream `skills/` directory of the `ponytail` repository; the bundle tracks upstream's `skills/` one-to-one (the compact ladder that the persona embeds comes from upstream's `.clinerules/ponytail.md`).
- **License:** MIT — bundled here under the terms of the MIT License; upstream copyright and license notices remain within each skill directory where present, and this notice serves as the attribution required by that license.
- **Modifications:** none to skill content.

## Bundled skills (20)

brainstorming · dispatching-parallel-agents · executing-plans ·
finishing-a-development-branch · receiving-code-review ·
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
