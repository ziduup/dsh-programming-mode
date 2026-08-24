# 设计说明:植入器与信任模型

本文记录 dsh-programming-mode 的两个核心设计决策,便于审计与二次开发。

## 1. 为什么是"植入"而不是"注册 preset 根"

DSH 的 agent preset 机制中,`agentPresets` 服务扫描若干**根目录**来发现 preset。理论上让 bundle 注册自己的根目录最优雅,但不可行:

- 启动器(`composeProfile`)在组合**所有** patch 层之后,会用最后一个 overlay 把 `agent-presets` 行的 `roots` 配置整体替换为部署随附根目录(`roots` 不做深合并——patch 对 config 键的语义就是替换);
- 因此任何 bundle 在更早层级写入的 `roots` 都会被启动器覆盖。

所以本插件选择:**profile 启动时把捆绑的 preset 目录复制进 roster 的第一个 `user` 信任根**(默认 `$DSH_HOME/.agent-presets/`)。roster 的发现过程不缓存(每次 `list()` 重扫),文件落盘即出现在模式选择器。

目标根目录的解析优先级:

1. `ctx.get('agentPresets')` 可用时,取 `agentPresets.roots` 中第一个 `trust === 'user'` 的条目(尊重部署自定义根);
2. 否则回退 `$DSH_HOME/.agent-presets`(再回退 `~/.dsh/.agent-presets`)。

## 2. 植入策略与版本戳

| 目标目录状态 | 行为 | 理由 |
|---|---|---|
| 不存在 | 全新植入 + 写版本戳 | 首次安装 |
| 版本戳 == 本包版本 | 无操作 | **保留接收方的本地修改**——preset 属于用户后,不应每次启动都被抹平 |
| 版本戳 != 本包版本 | 覆盖文件 + 刷新戳 | 升级语义:发布者的新版本胜过旧本地副本 |
| 存在但无版本戳 | 拒绝触碰 | 该目录不是我们植入的(可能是用户手写或 `copy()` 创建的同名 preset),覆盖等于破坏用户数据 |

版本戳文件:`.dsh-programming-mode.installed.json`,内容含 `version / source / plantedAt`。

已知权衡:升级采用 `cpSync force` 覆盖而非先删后植,**不会清理**旧版本遗留的多余文件;换取的是绝无误删风险。若未来需要精确镜像,应先校验目录确由本包管理后再重建。

## 3. 卸载语义

`dsh plugin remove` 只移除 bundle 层,**不删除**已植入的 preset——它已落进用户的可写根、可能含用户修改。彻底移除需手动删除 `$DSH_HOME/.agent-presets/programming/`。这是刻意的:静默删除用户目录里的东西比留下多一份更危险。

## 4. 技能为什么捆绑在 preset 里

编程模式的人设强制要求 14 个 superpowers 技能可用。技能发现按 provider rank 解析:

| rank | 来源 |
|---|---|
| 100/200 | 项目 `.dsh/skills`、`.agents/skills` |
| 300 | **`customSkillDirs`(本 preset 的 skills/)** |
| 400/500 | 用户 `~/.dsh/skills`、`~/.agents/skills` |

捆绑目录位于 rank 300,高于全部用户级根:接收方即使自备同名技能也会被干净遮蔽,不产生冲突或双份加载;而完全没有的接收方开箱即得。`includeDefaultRoots` 保持默认 `true`,项目与用户根照常生效,只是同名词让位给捆绑版。
