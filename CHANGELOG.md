# 更新日志

本项目的所有重要变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-10-08

> 首个支持 **dsh 0.2.0 桌面版**的版本。0.3.8 及更早只覆盖 0.1.x CLI / web profile；同一个包、同一份组合，安装器按宿主模型自动选通道。

### 新增

- **两条发现通道（桌面版支持）**：dsh 0.2.0 换成注册表模型，`dsh-agent-preset-registry` 只认 `AgentPresets.register()` 登记的条目，**整个运行时不读 preset 目录**——0.1.x 上赖以工作的目录植入，在桌面版上等于没发生，这正是「装完看不到编程模式」的根因。0.4.0 改为**一套组合、两条发现通道**：0.1.x 照旧植入 `$DSH_HOME/.agent-presets/programming/`；0.2.0+ 额外在**所在 profile 自己的 `cordis.patch.yml`** 里写一条标记块包住的 `- insert:` 声明行。两条通道共用同一份 `agent.cordis.yml`（声明行的 `plugins` 就是它整块右移 10 空格），不存在两份副本。通道由**组合树里的 preset 提供者包名**判定，不读 `agentPresets` 服务（实测插件 `apply()` 跑的那一刻该服务还没进 store）。
- **卸载后自动结算：点一下就干净，没有第二步**：pnpm 不执行被卸载包的任何生命周期钩子、市场也没有卸载事件，所以结算由植入的 preset 自己做。**声明行按 profile 判**（哪个 profile 不再装本包就清哪个的行，与别的 profile 无关），**植入目录按全局判**（目录是同一 `$DSH_HOME` 下所有 profile 共享的，只有没有任何 profile 再装本包时才动）。清成什么样由**会话历史**决定：先扫 `<DSH_HOME>/sessions/**/session.v*.jsonl.zstd`（流式过 zstd、命中即停，找的正是宿主自己读的 `agentPreset` 字段）——**没有任何会话用过编程模式 → 行和目录一起删除**，选择器里彻底消失；**有会话用过 → 留一条「编程模式（已卸载）」墓碑**，那些会话照常打开（宿主对「preset 不存在」的 resume 硬失败、无回退）。两条路径都零手动动作。清理失败一律保守回退——读不到 registry、读不到会话日志、删目录被占用（宿主在 watch 技能目录）时退回「保持原样」或「墓碑」，绝不半途而废。
- **`uninstall.mjs` 顺带摘声明行**：`declarationTargets()` 扫 `$DSH_HOME/profiles/*/cordis.patch.yml` 找我们的标记块（也可 `--patch <路径>` 指定），`uninstallDeclaration()` 只删我们那一块。

### 修复

- **桌面版选择器里没有「编程模式」——preset 登记成功但被判 `broken`**：0.2.0 注册表的 `list()` 会给每个 preset 附带 `broken` 字段（激活失败或行不可用时的诊断），选择器不列这类条目。用影子 profile 在真实 0.2.0 宿主上跑一个只读探针，拿到的是 `programming` 的 `broken: "tool-workflow …: waiting for workflowEngine / tool-ralph …: waiting for workflowEngine"`——声明行里的 `workflow-worker-thread`（0.1.5 时代的引擎提供者行）在桌面版上解析到 `$DSH_HOME/profiles/node_modules` 里那份 0.1.5 共享树，宿主按 peer 不兼容把它禁用，`workflowEngine` 于是没人提供，两行消费者一直等下去。**修复**：声明行（0.2.x 通道）按 0.2.0 的 `standard.patch.yml` 校正三处行漂移——`workflow-worker-thread` → `workflow-ptc`（`@deepseek-ai/dsh-workflow-ptc`）、`tool-ralph` 补 `disabled: true`、补上 0.2.0 新增的 `tool-plugin-manager`（disabled）。0.1.x 通道（植入目录 / CLI）继续用原组合：`dsh-workflow-ptc` 在 0.1.5 上不存在，两个通道因此必须分开校正，转换集中在 `declaration.mjs` 的 `HOST_0_2_ROW_FIXES`，仍是「一份组合、按宿主校正」。
- **升级路径上的声明行丢了版本号**：`plantPreset` 的 `'updated'` 分支只返回 `{ from, to }`，而 `apply()` 交给声明行的是 `result.version`——真实 0.2.0 桌面宿主上做 0.3.8 → 0.4.0 升级时，标记块写成 `# >>> … declaration vundefined >>>`，此后每次启动都因 `hasBlock(text, version)` 不匹配而把同一份内容重写一遍。`'updated'` 现在同时返回 `version`。
- **新 profile 的 patch 模板形状**（真实宿主上才发现，dry-run 测不到）：dsh 给新 profile 的 `cordis.patch.yml` 就是「注释 + `[]`」。往 `[]` 后面追加声明行得到 `[]` + `- insert:`，宿主 `yaml.load` 直接抛 `end of the stream or a document separator is expected`，**profile 在加载阶段就起不来**——自愈代码根本没机会跑。`replaceBlock` 现在把「没有行的补丁」当空文件处理：保留注释、去掉 `[]` 占位、只写块；`removeBlock` 反向还原成「注释 + `[]`」。实测还原结果与宿主编译模板逐字节一致。
- **宿主探测读错了地方**（同上，真实宿主上才发现）：原实现用 `typeof agentPresets.register === 'function'` 判断宿主模型。实测在真实 0.1.5-rc.2 宿主上，插件 `apply()` 跑的那一刻只有 2/90 行有 fiber，`ctx.get('agentPresets')` 恒为 `undefined`，连等一个 `setImmediate` 都不出现；`entry.options.inject` 又会让条目静默停住（apply 根本不跑）。改用**读组合树**（`ctx.loader.entries()` 里的 preset 提供者包名），树在任何条目启动前就完整，服务退作第二意见。
- **桌面版能选到「编程模式」，但一选中本轮运行就失败：`format v4 message requires a producer-owned source kind`**：`force-superpowers` 给首条 `using-superpowers` 注入的 `source` 用的是 `{ kind: 'plugin', plugin: '@deepseek-ai/dsh-programming-mode', form: 'instructions' }`。`kind: 'plugin'` 是 v0–v3 时代的形状，**日志格式 v4 已把它废弃**：v4 的准入只要求 `kind` 是非空字符串且不等于 `'plugin'`（`dsh-session-format-v3-to-v4` 的 `assertV4SourceRowAdmission`），写入（编码器）与读取（行准入、artifact 校验）三条路径都会硬拒——这条注入既写不进日志也读不出来，`user/message` 一落盘整轮就失败。0.1.x 通道不受影响（它写 v0–v3 日志），所以只有 0.2.0 桌面版会撞上。**修复**：改用宿主自己的 skill-invocation 形状 `{ kind: 'skill-invocation', name: <技能名>, form: 'instructions' }`——就是 `@deepseek-ai/dsh-skill` 给 `skill` 工具那份 `<skill_content>` 挂的同一个记录，成员恰好是 v0→v1 校验器为这个 kind 承认的三个（`kind`/`name`/`form`，一个不多一个不少），v0 到 v4 每个已发布的校验器都放行；UI 的上下文注入行因此显示技能名。`alreadyInjected()` 保留两种历史形状的匹配（≤0.3.8 的 `plugin` 形状、0.3.4 之前的 `skill-invocation`），升级中途的会话不会被注入第二次。
- **卸载必须「点一下就干净」：从某个 profile 卸载后，那个 profile 里的模式却照样完整可用**。原孤儿检查只看**全局**（`$DSH_HOME/profiles/*/package.json` 里只要还有**任何**一个 profile 装着本包就判 `kept`），真机实测返回 `kept: installer still installed in profile web`——于是桌面版卸载后它的声明行原封不动，模式照跑，用户看到的就是「卸载了还能选编程模式」。修复见上「新增」第二条。
- **墓碑分两级，绝不动别人还在用的东西**：只给被卸载的那个 profile 写墓碑行，共享目录保持完整模式；只有全局也孤儿时才处理目录。

### 变更

- **卸载安全性是结构性的，不靠时序**：声明行**从不引用本包名**，只引用宿主自带包（`@deepseek-ai/dsh-agent-preset`、standard 组合里的 `@deepseek-ai/*`）和植入在 `$DSH_HOME/.agent-presets/` 下的文件（pnpm 不动用户数据）。所以 `dsh plugin remove` 之后这一行照样能激活，历史会话的 resume 不会遇到 `agent-preset/not-found` / `agent-preset/invalid`。
- **墓碑按宿主持久化通道分两种形态**，共用同一个孤儿检查：0.2.0 上换掉 profile patch 里那一行（改用宿主自带 standard 组合，经注册表的 `readDocument('standard')` 读取，不猜文件布局）；0.1.x 上重写植入目录。0.1.x 的 standard 定位沿用 0.3.8 的四布局探测链。
- **dry-run 扩到 26 项**：新增 7b/7c/11b（卸载结算的三条路径——按 profile 无历史删行、按 profile 有历史只墓碑化本 profile 的行、全局无历史删目录并摘掉所有 profile 的声明行，且「别的 preset 的会话」不算历史）、14b（新 profile 模板形状的声明/删除往返）、17b（宿主无法作答时墓碑拒绝半应用）、18b/18c（无 name 元数据拒绝、卸载器摘行）、19（**用宿主自己的解析器当裁判**——PATH 上有 dsh 时把 `loadOptionalPatches` import 进来喂我们生成的每一种 patch 形状，CI 无 dsh 自动跳过）；13–18 覆盖声明行生成不变量、patch 生命周期、非 list 拒绝、0.1.x 自愈、0.2.0 墓碑与半应用拒绝、`apply()` 双通道；6 断言注入 source 的成员恰为 `kind`/`name`/`form`（多带成员会像 0.3.5 那样打死旧日志），对三种历史形状各验一次去重，并验证无关技能的注入不会误判为「已注入」；12 覆盖 shipped-standard 发现的四种布局。
- **`package.json` 的 `files` 去掉已搬走的根级 `declaration.mjs`**（它现在位于 `preset/programming/`，随 `preset` 一起发布）。
- **README 中英 / design / faq / playbook 同步**：安装后可能需要重启两次（0.2.0 第一次启动负责写行，选择器要等下一次启动）；卸载改为如实三段式（bundles 悬空 / preset 自动结算 / 0.2.0 声明行本身）；单 profile 卸载与墓碑语义；补安装后看不到模式的 0.2.0 专属排查步骤。安装段另写明**命令只有 `dsh plugin add` 一种形态**——dsh 是 pnpm 的转发层，「npm 渠道」指的是包的来源而非 `npm install`，手工 `pnpm add` 不会调和 `dsh.profile.bundles`（层栈不更新，模式不出现）；并标注 0.4.0 起支持桌面版及桌面版的市场安装路径。

### 说明

- 版本戳 0.3.8 → 0.4.0：`preset/programming/declaration.mjs` 是新文件、`index.js` 与 `force-superpowers.mjs` 都有实质变更，须发新版（植入副本随重装/升级生效）。
- 本版不改 `agent.cordis.yml` 组合内容——0.3.7 的会话级验收结论（与 standard 27 工具对齐）继续有效（0.2.0 宿主上的三处行漂移在本版声明行里校正）。
- 真实宿主验证分三轮。**0.1.5-rc.2 CLI + 一次性 profile**：安装 / 不写行 / 有注册表行时写行 / 两步降级自愈 / **卸载后重启无异常** / 墓碑 / 墓碑后 roster 判 `broken: none` / web profile 回归，结束后该 profile 已删除、植入 preset 已还原。**0.2.0-rc.2 桌面宿主 + 桌面 profile 的影子副本**：CLI 仍拒绝 `--profile desktop`（`profile "desktop" is managed exclusively by the Electron application`），故用同 `package.json`、同 patch、`node_modules` 走目录联接（junction）的影子 profile，由桌面版自己的 `dsh.cmd` 启动——实测宿主 `updated: 0.3.8 -> 0.4.0`、把声明行写进 profile patch、组合树里出现 `preset-programming`（与宿主自带四个 preset 行并列），探针在**真实注册表**上读到 `programming|编程模式|order=10`；同一次验证也暴露了当时的组合在 0.2.0 上被判 `broken`（根因与修复见上）。**卸载结算双路径**：在隔离 `$DSH_HOME` 的影子 profile 上「装 → 模拟卸载（从 manifest 去掉依赖）→ 重启」，无历史与有历史各跑一次，判定标准是行与目录的实际状态。
- v4 报错的可复现验证方法：先用探针把 `force-superpowers` 真跑一遍，拿到它真正发出的那条 message，再喂给**桌面版自带的 0.2.0-rc.2 内核**（从 `app.asar` 里 import 它自己的 `dsh-session-format-v3-to-v4`，跑 `encodeEvent` / `assertV4RowAdmission` / `assertReleasedV4Relationships` 三条路径）。修复前三条路径全部复现用户看到的原文报错；修复后三条全部放行，且 0.1.5 共享树里 v0→v1、v2→v3 两代校验器同样承认新形状。
- 已知边界：0.2.0 桌面 profile 被某个会话占用时 `dsh plugin remove` 可能被 `bundle-in-use` 挡下，先关掉用编程模式的会话再卸；0.2.0 上「卸载 → 重启 → 结算完成」一步到位，0.1.x 上要等 preset 被挂载（懒挂载）才触发；声明行的 `@deepseek-ai/*` 子行按 profile 目录向上解析，会先命中 CLI 留下的 0.1.5 共享树而不是 app.asar 的 0.2.0 运行时（本版修掉其中会致命的一处，其余行以 0.1.5 版本挂在 0.2.0 宿主上未观察到故障，彻底解决要宿主提供运行时解析基准）。

## [0.3.8] - 2026-09-28

### 修复

- **卸载后自动墓碑在全局安装 dsh 的机器上从不触发**：`force-superpowers.mjs` 的 `locateShippedStandard()` 此前只扫 `~/.dsh/profiles/**/node_modules/@deepseek-ai/dsh/config/agent-presets/standard`，而 `@deepseek-ai/dsh` 从不装进 profile（本机实测 profile 的 `@deepseek-ai/` 下只有 cosmokit + schemastery），且 0.1.5-rc.2 的 dsh 包内没有 `config/` 目录（presets 实际位于 `@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-presets/presets/standard`）——查找路径与真实布局永不相交，`removeIfOrphaned()` 恒返回 `kept: shipped standard preset not found`，卸载后植入 preset 以完整形态滞留（2026-09-28 首次真实卸载踩中，此前 dry-run 测试 9 用注入的假路径掩盖了该盲区）。现改为按序探测四种布局：profiles 树内 legacy `config/agent-presets`、profile 内 dsh 包嵌套的 `dsh-agent-presets`、profile 内顶层 `dsh-agent-presets`，以及**运行中 CLI 安装**——从宿主入口脚本（`process.argv[1]`，如 `…/@deepseek-ai/dsh/lib/bin.js`）向上定界到 dsh 包根再探测（npm -g 全局安装由此命中）；任一命中即用，全部未命中仍安全保留（缺 standard 不建墓碑的兜底不变）。`locateShippedStandard` 转为具名导出供测试。

### 变更

- **dry-run 新增第 12 项：shipped-standard 发现的全布局断言**（legacy / profile 嵌套 / 运行中 CLI walk-up / 真实安装冒烟——PATH 上有 dsh shim 时断言真实 CLI 布局，CI 无 dsh 自动跳过），并把 `process.argv[1]` 钉到沙箱路径保证测试 7–9 不受宿主环境影响。
- **README 中英卸载章节改为如实两段式**：第一段记录 bundles 悬空失败模式——`dsh plugin remove`（CLI 路径）实测会正确清理，但部分卸载路径不保证（本机出现一次悬空致启动 `cannot resolve profile bundle` 崩溃），workaround = 删 profile package.json 的一行；第二段保留墓碑设计说明，修正触发时机为「每次被挂载时（懒挂载，web 界面首次打开模式选择器或 resume 旧会话时触发）」，补充「选择器条目无法隐藏」（dsh preset 元数据暂无 hidden 字段）与 0.3.8 的全局安装修复说明。

### 说明

- 版本戳 0.3.7 → 0.3.8：植入的 `force-superpowers.mjs` 变更随重装/升级生效（重装时 installer 检测版本戳不一致整体覆盖）。0.3.7 已发布且不含本版改动，故发 0.3.8。
- 本版不改 `agent.cordis.yml` 组合——0.3.7 的会话级验收结论（与 standard 27 工具对齐）继续有效。
- 配套两份上游 issue 已起草待提交 deepseek-harness：① `dsh plugin remove` 不清 `dsh.profile.bundles` 导致卸载后启动崩；② `preset.yml` 元数据建议增加 `hidden` 字段（resume 可解析、选择器不列，墓碑场景刚需）。本版发布时两者均未提交。

## [0.3.7] - 2026-09-28

### 修复

- **preset 相对 `standard` 缺 4 行能力，编程模式并非"标准模式全部能力"**（外部 issue 逐行对比发现）：把 `agent.cordis.yml` 与本机 dsh-agent-presets 0.1.5-rc.2 的 `presets/standard/agent.cordis.yml` 逐 row（id / name / disabled / isolate / config）比对后确认，除刻意差异（persona、`skill-filesystem.customSkillDirs`、`force-superpowers` 新增行）外缺以下四项。四项均自初始提交即缺失（`git log -S` 对 `dsh-tool-present`、`command-goal`、`modelSelectionSettings` 均无记录，非回归），官方 `cordis`/`ptc`/`standard` 三个 preset 全都带这四项（仅 `minimal` 刻意不带），README "标准模式的全部能力" 的承诺此前并未完全兑现。已补齐：
  - **补 `present` 行**（`@deepseek-ai/dsh-tool-present`）：此前该工具不注册，模型交付文件后无法"登记"，web 界面「交付物」面板在编程模式会话里永远为空（文件本身写成功，只是拿不到 `deliverables/presented` 事件）。
  - **补 `command-goal` 行**（`@deepseek-ai/dsh-command-goal`）：此前 `/goal` 斜杠命令在编程模式会话里不存在，只能由模型侧 goal 工具操作目标（`tool-goal` 行本来就有）。
  - **`tool-web` 的 `fetch: false` 改回 `fetch: true`**：`dsh-tool-web` 的 `apply()` 仅当 `resolved.fetch` 为真时调用 `applyWebFetchTool`，此前 `web_fetch` 整个不注册，且 `web_search` 提示语退化为"只看搜索摘要"变体；改回后与 standard 一致，可抓取网页全文。
  - **`delegation` 组 `tool-subagent`（spawn）补 `modelSelectionSettings: true`**：`dsh-tool-subagent` 仅在该值为真时安装模型选择策略（注册 `list_subagent_models` 工具、`subagent` 工具描述追加 provider/model/reasoning_effort 选择说明），此前子代理只能继承父路由；fork 行 standard 同样刻意不设（保 KV cache 复用），保持不动。
  - 补齐后重跑逐行 diff：除刻意的 persona、`customSkillDirs`、`force-superpowers` 外与 standard 零差异，行序也一致（`force-superpowers` 为刻意新增行，插在 `tool-skill` 之后）。

### 说明

- 版本戳 0.3.6 → 0.3.7：本版只加能力行、不动任何既有行为，按补丁发版。0.3.6 已发布且不含本版改动，故发 0.3.7 而非改写 0.3.6。
- 目的 section 的注释随 `command-goal` 行同步改写：goal 服务与会话驱动仍在宿主面（Gateway 以 Remote endpoint 提供，entry-local realm 会遮蔽唯一的 `goals` 实例），但"/goal 命令留在宿主面"的旧表述已不成立。

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
