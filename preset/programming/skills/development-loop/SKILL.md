---
name: development-loop
description: Use when coding tasks need persistent state, bounded iteration, resume-safe progress, or coordination with Superpowers skills; especially long-running fixes, feature work, refactors, CI repair, and tasks at risk of losing context or drifting scope.
---

# Development Loop

## Overview

Use this skill to run coding work as a bounded, evidence-led loop. This skill orchestrates goal, state, verification, and persistence; it does not replace Superpowers skills.

## Superpowers Coordination

Always honor applicable Superpowers skills before acting:

| Situation | Required skill |
| --- | --- |
| Creative work, feature design, behavior changes | `brainstorming` |
| Feature, bugfix, or refactor implementation | `test-driven-development` |
| Unexpected behavior, failing tests, unclear bug cause | `systematic-debugging` |
| Work needs isolation from a dirty/shared workspace | `using-git-worktrees` |
| Implementation plan is already written | `executing-plans` |
| Independent subtasks can run safely in parallel | `dispatching-parallel-agents` or `subagent-driven-development` |
| Receiving review feedback | `receiving-code-review` |
| Substantial implementation is ready for review | `requesting-code-review` |
| Before claiming complete, fixed, or passing | `verification-before-completion` |

If a required Superpowers skill has a hard gate, follow that gate. Do not use this loop to bypass design approval, TDD, debugging discipline, review, or verification.

## State Files

For nontrivial loop work, use `.loop/` in the project root. If it is missing, create only the needed files:

```text
.loop/
  checklist.md
  memory.md
  deferred.md
  audit-log.md
```

Use the files this way:

| File | Purpose |
| --- | --- |
| `.loop/checklist.md` | Current goal, success criteria, active task, done items, blockers |
| `.loop/memory.md` | Confirmed facts, decisions, failed attempts, root causes |
| `.loop/deferred.md` | Ideas that are out of scope for the current goal |
| `.loop/audit-log.md` | Per-iteration actions, rationale, commands, results |

## Loop Protocol

Each iteration must follow this order:

1. **Goal**: Convert the user request into verifiable success criteria. Prefer machine-checkable criteria such as test, lint, build, CI, diff scope, or rendered output.
2. **Context**: Read relevant instructions, `.loop/` state, current failures, and only the files needed for the next decision.
3. **Plan**: State the smallest useful step and its verification method. For multi-step work, maintain a visible checklist.
4. **Execute**: Make surgical changes only. Do not add speculative features, unrelated refactors, or broad cleanup.
5. **Verify**: Run the smallest relevant check first, then broader checks as risk increases. Record exact verification commands and outcomes.
6. **Reflect**: If verification fails, identify the root cause or uncertainty before changing code again. Do not repeat the same strategy twice without new evidence.
7. **Persist**: Update `.loop/checklist.md`, `.loop/memory.md`, `.loop/deferred.md`, and `.loop/audit-log.md` before pausing, resuming, or finalizing.

## Stop Conditions

Stop the loop when any condition is met:

| Condition | Action |
| --- | --- |
| Success criteria pass | Run final verification, persist results, then report completion |
| Two consecutive iterations show no new evidence or progress | Mark blocker in `.loop/checklist.md` and ask for human input |
| Maximum iteration budget is reached | Summarize current state, remaining work, and next recommended step |
| Risk boundary appears | Pause for human confirmation before destructive, deployment, database, credential, billing, or broad filesystem actions |

Default to a 5-iteration budget unless the user specifies another limit.

## Anti-Drift Rules

- Put tempting but unrelated improvements in `.loop/deferred.md`.
- Do not weaken tests, delete checks, lower acceptance criteria, or replace real behavior with mocks to make verification pass.
- Do not claim completion from intent. Completion requires verification evidence.
- If the task becomes broader than the original goal, pause and ask whether to expand scope.
- If state files conflict with observed code or command output, trust current evidence and update the state file.

## Invocation Pattern

Use prompts shaped like:

```text
Use $development-loop to complete: <task>.
Goal: <machine-checkable result>.
Budget: max 5 iterations, stop after 2 no-progress iterations.
Persist state in .loop/.
```
