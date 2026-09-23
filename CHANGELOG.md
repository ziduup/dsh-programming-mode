# 更新日志

本项目的所有重要变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.6] - 2026-09-23

### 修复

- **persona 行仍用已废弃的 `text` 键，preset 在 dsh-persona 0.1.5+ 上无法挂载**（issue #1）：`@deepseek-ai/dsh-persona` 自 0.1.5-rc.1 起把配置键 `text`（required）改名为 `prefix`（required）并新增 `suffix`，旧键不再位于 schema 内（现行 schema 为 `prefix` required、`suffix`/`complete`/`includeRuntimeContext` 带默认值）。捆绑模板 `agent.cordis.yml` 的 persona 行仍在用 `text: |-`，schema 校验报 `prefix missing required value`，整个 preset 挂载失败，表现为新建/切换到「编程模式」时报 loader 错误且指向 `agent.cordis.yml`。已把该行键名改为 `prefix: |-`，正文一字未动（前后均 4277 字符）。dsh 自带的 `standard`/`minimal`/`cordis`/`ptc` 早已改用 `prefix`。

### 变更

- **superpowers 捆绑技能升级 v6.3.0 → v6.4.1**：8 个技能内容更新（`brainstorming` 新增 "Establish Shared Understanding" 节并把审批门槛改为按阶段授权——"A reply approves the stage actually presented"；`executing-plans` 被上游重写为当前会话 inline 执行；`writing-plans` 新增 Review Focus 节；`writing-skills` 要求解释器调用捆绑脚本；`systematic-debugging`、`test-driven-development`、`using-superpowers`、`requesting-code-review` 同步更新），并新增 `diagnosing-superpowers`（session 出错后归因/报 bug 用）。捆绑技能数 20 → 21，README 中英与 `SKILLS-LICENSE.md` 同步。
- **`subagent-driven-development/implementer-prompt.md` 的本地分歧已保留**：上游 v6.4.1 未改动该文件前 154 行，因此升级对该文件是净零变化；`## Harness notes (this harness only)` 追加段（77 行，防 mid-turn Q&A 死锁，见 0.3.1）逐字节保留。
- **ponytail 无需更新**：6 个技能与上游 v4.10.0 逐字节一致，已是最新。persona 规则 9 内嵌的 7 级阶梯与上游 `.clinerules/ponytail.md` 一致。

### 说明

- 版本戳 0.3.5 → 0.3.6：persona 修复与技能升级都会随重新植入生效。0.3.5 已发布且不含本版改动，故发 0.3.6 而非改写 0.3.5。

## [0.3.5] - 2026-09-23

### 修复

- **首条 using-superpowers 注入让整个会话无法打开**：`force-superpowers` 往 `user/message` 事件写的 `source` 多带了一个 `name` 成员（`{ kind:'plugin', plugin:'@deepseek-ai/dsh-programming-mode', name:'using-superpowers', form:'instructions' }`）。而 `@deepseek-ai/dsh-session-format-v0-to-v1` 对 `kind:'plugin'` 的来源只承认 `kind`/`plugin`/`form`/`sections`/`summary`，`name` 不在其中，于是 v0 日志迁移被硬拒，报 `refuses this format v0 Session: user/message N source has unexpected member "name"`，web 界面表现为「历史加载失败」。已删除该成员——`{ kind:'plugin', plugin:'@deepseek-ai/dsh-programming-mode', form:'instructions' }` 在合法成员表内，且 `alreadyInjected()` 的去重分支 `src.kind === 'plugin' && src.plugin === label` 依旧命中，UI 上仍显示生产者标签，行为不变。

### 新增

- **声明 `engines.dsh`**：市场插件卡片上的「DSH ^x.y.z」徽标由 `dshmarket` 的 `deriveHostCompatibility()` 推导，来源优先级为顶层 `engines.dsh` > `dsh.engines.dsh` > `@deepseek-ai/dsh-*` 的 peerDependencies 范围。本包此前三者皆无，因此卡片上不显示任何 DSH 版本信息，兼容性判定只能是 `unknown`。现声明 `>=0.1.3-alpha.2`：实测修复后的 source 形状在 `dsh-session-format-v0-to-v1` 全部 10 个已发布版本（0.1.3-alpha.2 → 0.1.7-alpha.2）上均通过校验，而带 `name` 的旧形状在同样 10 个版本上全部被拒——旧形状从未在任何已发布版本上合法，它只可能来自该包独立发布前的 0.1.0-rc.x 时代（未取到样本，故以此为下限）。

### 说明

- 版本戳 0.3.4 → 0.3.5：植入器检测到版本戳不一致，profile 下次启动会覆盖既有植入的 preset。**这是本修复生效的必然路径**——若只有本地改动而无新版本，重装或升级 bundle 时会把带 `name` 的旧文件重新植入，故障复现。
- 已写坏的历史会话不会自愈：修复只阻止新会话产生坏记录。本机实测 171 个会话受影响，需另行处理（逐帧重压缩，删掉那一个成员）。

## [0.3.4] - 2026-09-20

### 修复

- **卸载 bundle 后已植入的 preset 变成死 preset**：`force-superpowers` 行此前以包名 `@ziduup/dsh-programming-mode` 挂载，包被 `dsh plugin remove` 移除后，凡是记录过 `programming` 的会话在 resume 时都会以 `ERR_MODULE_NOT_FOUND` 失败（表面症状：模型/模式操作报 `internal: resume failed for session ...`）。修复方式：注入实现随 preset 一起落盘（新增 `preset/programming/force-superpowers.mjs`，组合行改为相对路径 `./force-superpowers.mjs`），植入的 preset 自此**自包含**——卸载 bundle 后仍可正常挂载、首条 using-superpowers 注入照常生效；`index.js` 随之退化为纯植入器（`role: force-superpowers` 分流删除）。

### 说明

- 版本戳 0.3.3 → 0.3.4：profile 下次启动会把既有植入目录覆盖为新组合（本地修改仍按既有策略处理）。
- **一键卸载（墓碑式）**：pnpm `remove` 不执行任何被卸载包的生命周期钩子，市场也没有卸载事件，bundle 在卸载后没有代码机会自行清理。清理由植入的 preset 自己完成——`force-superpowers.mjs` 在每次 host 启动挂载时检查所有 profile 的 package.json，无人再引用本包即原地转换为**墓碑**：组合替换为 dsh 自带标准模式的组合、元数据改名「编程模式（已卸载）」、捆绑技能移除。不能直接删除目录：会话永久记录其所属 preset，而 host 对「preset 不存在」的 resume 硬失败、无回退，直接删除会让全部历史会话无法打开（本机实测 256 个会话受影响）。墓碑让历史会话照常打开（以标准模式行为运行），重装本包时 installer 检测墓碑标记自动重种完整模式；`uninstall.mjs` 保留为立即转换/彻底清除（带安装戳校验）的手动入口。

## [0.3.3] - 2026-09-08

### 修复

- **v0.3.0 改名后 `cordis.patch.yml` 仍以旧包名 `dsh-programming-mode` 插入 loader 行**：包自 v0.3.0 起更名为 `@ziduup/dsh-programming-mode`，但 bundle patch 的 `name:` 与预设 `force-superpowers` 行的 `name:` 仍是改名前的裸包名，导致通过插件市场/`dsh plugin add` 安装 v0.3.x 后，profile 启动时 loader 以 `Cannot find package 'dsh-programming-mode'` 整体失败（`ERR_MODULE_NOT_FOUND`，`dsh web` 无法启动）。已将两处 `name:` 改为 `@ziduup/dsh-programming-mode`。卸载命令同步更正。
- **预设 `force-superpowers` 行的 `name:` 必须加引号**：`@` 是 YAML 保留指示符，裸写 `name: @ziduup/dsh-programming-mode` 会使预设组合文件无法解析（roster 将其标记为 broken、模式选择器不显示）。已改为 `name: '@ziduup/dsh-programming-mode'`。

## [0.3.1] - 2026-09-07

### 变更

- **`subagent-driven-development` 实施者模板追加 Harness notes**：`implementer-prompt.md` 文末新增 `## Harness notes (this harness only)` 节，转译上游模板"ask questions"措辞为本 harness 可执行的 decide-and-record 协议——根因是本 harness 的 `send_message` 只能在子代理下一回合送达，回合内提问会死锁。报告模板同步新增 `## Decisions I made` 段，作为控制器裁决环的审计面。仅追加一节、未改动上游既有段落，下次升级覆盖时这一节需保留。属 vendor divergence（与上游逐字节对齐策略的局部偏离）。

## [0.3.0] - 2026-09-01

### 新增

- **捆绑 Ponytail 代码量纪律（6 个技能）**：`ponytail`、`ponytail-review`、`ponytail-audit`、`ponytail-debt`、`ponytail-gain`、`ponytail-help` 随 preset 一并植入（源自 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)，MIT，逐字节对齐上游 `skills/`），捆绑技能总数 14 → 20。
- **persona 常驻代码量纪律（第 9 条规则）**：7 级阶梯（YAGNI→复用→stdlib→原生→已有依赖→一行→最少可用）每轮注入系统提示，默认 `full` 强度；明确边界——只管实现代码量，头脑风暴/计划/TDD/系统化调试/验证/审查/中文文档仍归 Superpowers 流程，ladder 永不裁掉信任边界校验、防数据丢失、安全、可访问性；TDD 迭代内 ladder 只作用于 GREEN 步。用户可 `ponytail lite/ultra` 切换、"停止 ponytail" 关闭。
- **授权与文档同步**：`SKILLS-LICENSE.md` 新增 Ponytail 段落（14→20），README 中英更新人设规则与技能数。

### 说明

- 版本戳驱动的升级语义：0.2.1 → 0.3.0 会覆盖既有植入的 preset 并保留用户未改动的本地文件（见设计说明第 2 节）。

## [0.2.1] - 2026-08-27

### 新增

- **首条消息强制注入 `using-superpowers`**：预设组合新增 `force-superpowers` 行（同一安装器包以 `role: force-superpowers` 挂载），在会话的第一次 `agent/pre-step` 把 `using-superpowers` 技能全文机械追加进第一批请求——不依赖模型是否自觉调用 `skill` 工具。每会话只注入一次（按持久历史去重），内容实时取自当前技能视图（编程模式下为捆绑副本，customSkillDirs 优先级最高）。`index.js` 的 `apply` 现按 `config.role` 分流：安装器角色行为不变，`force-superpowers` 角色只注册注入钩子。

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
