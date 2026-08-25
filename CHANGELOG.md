# 更新日志

本项目的所有重要变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-08-25

### 变更

- 捆绑技能整体升级至上游 obra/superpowers **v6.3.0**（2026-08-12 发布），14 个技能与上游 `skills/` 目录**逐字节一致**。
- 新增 `writing-skills`；移除 `development-loop`（上游 v6.x 已删除该技能）。
- 随上游演进而来：`subagent-driven-development` 审查提示词体系重构（re-review/task-reviewer + 三个配套脚本）、`test-driven-development` 以 writing-good-tests 取代 testing-anti-patterns、`using-superpowers` 平台参考更新（新增 antigravity/hermes/pi，移除 copilot）、`brainstorming` 可视化伴侣脚本更新。

## [0.1.0] - 2026-02-11

### 新增

- **编程模式 agent preset**：标准模式全部能力之上，人设强制执行 Superpowers 工程纪律八条（技能优先、先头脑风暴、先计划后编码、TDD 红绿重构、系统化调试找根因、完成前必验证、交付前代码审查、需求与计划文档一律中文）。
- **捆绑技能**：内置全部 14 个所需 superpowers 技能（源自 obra/superpowers，MIT，见 `preset/programming/skills/SKILLS-LICENSE.md`），通过 `skill-filesystem` 的 `customSkillDirs` 提供，rank 高于用户技能根目录，接收方无需自备且同名不冲突。
- **启动植入器**：bundle 激活时把 preset 植入 roster 第一个 user 信任根目录；四条植入策略（全新植入 / 同版本幂等保留本地修改 / 版本升级覆盖 / 无版本戳目录拒绝触碰），版本戳写入 `.dsh-programming-mode.installed.json`。
- **验证工具**：`scripts/dry-run.mjs` 覆盖四种植入策略的离线沙箱测试。

### 说明

- 版本号采用常规三段式，不携带 superpowers 字样；Superpowers 渊源以 README 与 SKILLS-LICENSE.md 声明为准。
- npm 发布待网络条件允许后补发；当前安装源为 GitHub。
