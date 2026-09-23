# dsh-programming-mode

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/ziduup/dsh-programming-mode) [![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fziduup%2Fdsh-programming-mode%2Fmain%2Fpackage.json&query=$.version&label=version&color=blue)](CHANGELOG.md) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.en.md) · 中文

> **编程模式**：一个 DeepSeek Harness 组合包（bundle），在标准模式的全部能力之上强制执行 Superpowers 工程纪律。一条命令即可安装。

## 目录

- [这是什么](#这是什么)
- [安装](#安装)
- [升级行为](#升级行为)
- [卸载](#卸载)
- [安全与信任](#安全与信任)
- [自行构建](#自行构建)
- [作者与许可](#作者与许可)

## 这是什么

编程模式 = 部署自带 `standard` 模式的全部能力 + 强制 Superpowers 工程纪律的人设：

1. 行动前先查技能（using-superpowers）
2. 创作前先头脑风暴（brainstorming），设计批准后才实现
3. 多步任务先写计划（writing-plans → executing-plans）
4. 实现走 TDD 红绿重构（test-driven-development）
5. 调试先找根因（systematic-debugging）
6. 完成前必须跑验证（verification-before-completion）
7. 重要工作请求代码审查（requesting / receiving-code-review）
8. **需求文档与开发计划一律用中文撰写**
9. **首条消息强制注入 using-superpowers**：新会话的第一条请求前自动注入技能全文，纪律从第一句就生效
10. **代码量纪律（Ponytail）常驻**：默认 full 强度，7 级阶梯（YAGNI → 复用 → stdlib → 原生 → 已有依赖 → 一行 → 最少可用）始终生效；只管实现代码量，不触碰上面的流程规则（测试 / 计划 / 验证 / 审查归 Superpowers），用户可说 "ponytail lite/ultra" 或 "停止 ponytail" 调整

本包**捆绑了全部 21 个所需技能**，安装即用、无需自备技能。

> **技能归属**：捆绑的 21 个技能中，15 个源自 [Superpowers 方法论](https://github.com/obra/superpowers)（MIT），6 个源自 [Ponytail](https://github.com/DietrichGebert/ponytail)（MIT），署名声明见 `preset/programming/skills/SKILLS-LICENSE.md`。

## 安装

```sh
# 从 npm（推荐，registry 通道更稳）
dsh plugin --profile web add @ziduup/dsh-programming-mode

# 从 GitHub（git 直装）
dsh plugin --profile web add github:ziduup/dsh-programming-mode

# 从本地目录 / tarball
dsh plugin --profile web add ./dsh-programming-mode
dsh plugin --profile web add ./dsh-programming-mode-<版本>.tgz
```

安装后重启该 profile，模式选择器里即出现 **编程模式**。

## 升级行为

安装后在 profile 启动时，本包将捆绑的 preset 目录植入 roster 的第一个用户根（默认 `$DSH_HOME/.agent-presets/`）。升级按版本戳判断：

| 目标目录状态 | 行为 |
|---|---|
| 不存在 | 全新植入，写入版本戳 |
| 版本戳 == 本包版本 | 无操作（**保留你的本地修改**） |
| 版本戳 != 本包版本 | 覆盖文件并刷新版本戳（升级） |
| 存在但无版本戳 | **拒绝触碰**（不是我们植入的，可能是你手写的同名 preset） |

植入副本是**自包含**的：本包对 preset 的唯一注入点 `force-superpowers` 行挂载 preset 目录内的相对模块 `./force-superpowers.mjs`，不依赖本包名（也不会 import 本包），不会出现"悬空引用导致会话无法 resume"。

## 卸载

```sh
dsh plugin --profile web remove @ziduup/dsh-programming-mode
```

卸载即完成，**无需手动清理**。pnpm（`dsh plugin remove` 的真身）不执行被卸载包的任何生命周期钩子，市场也没有卸载事件，因此清理由植入的 preset 自己在每次 host 启动挂载时完成：当所有 profile 的 package.json 都不再引用本包（即已被卸载），它会把自己转换成**墓碑**——组合替换为 dsh 自带标准模式的组合（按包名引用，不依赖本包）、元数据改名为「编程模式（已卸载）」。这样设计的原因：会话会永久记录它运行时所属的 preset，而 host 对「preset 不存在」的会话 resume 直接报错、无回退——直接删除目录会让所有历史会话打不开。墓碑保证历史会话照常可打开（以标准模式行为运行），选择器里只剩一个诚实标注的条目；不需要历史会话时，手动删除该目录（或运行卸载器）即可彻底清除。重装本包后，installer 检测到墓碑标记会自动重种完整模式。想立即转换（不等重启）：

```sh
node ~/.dsh/.agent-presets/programming/uninstall.mjs
```

## 安全与信任

- agent preset 与 shell 访问权限同级：安装本 preset 即表示信任它引用的全部插件行。
- 若从 GitHub 安装，pnpm 会要求你在 `pnpm-workspace.yaml` 中 `allowBuilds` 授权构建脚本——这等于允许包代码在安装时于本机执行；建议锁定 commit（`github:ziduup/dsh-programming-mode#<sha>`）。从 npm 或 tarball 安装的是预构建产物，无此门槛。

## 自行构建

```sh
pnpm pack   # 产出 tarball，可用 dsh plugin add ./dsh-programming-mode-<版本>.tgz 安装
```

## 作者与许可

子都（[ziduup](https://github.com/ziduup)）· 仓库：[ziduup/dsh-programming-mode](https://github.com/ziduup/dsh-programming-mode) · [MIT](LICENSE)
