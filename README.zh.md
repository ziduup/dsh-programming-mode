# dsh-programming-mode

[English below](#english) | 中文

**编程模式**：一个 DeepSeek Harness 组合包(bundle)，在标准模式的全部能力之上，强制执行 Superpowers 工程纪律。一条命令即可安装。

## 这是什么

编程模式 = 部署自带 `standard` 模式的全部能力 + 强制 Superpowers 工程纪律的人设:

1. 行动前先查技能(using-superpowers)
2. 创作前先头脑风暴(brainstorming),设计批准后才实现
3. 多步任务先写计划(writing-plans → executing-plans)
4. 实现走 TDD 红绿重构(test-driven-development)
5. 调试先找根因(systematic-debugging)
6. 完成前必须跑验证(verification-before-completion)
7. 重要工作请求代码审查(requesting/receiving-code-review)
8. **需求文档与开发计划一律用中文撰写**
9. **首条消息强制注入 using-superpowers**：新会话的第一条请求前自动注入技能全文，纪律从第一句就生效

本包**捆绑了全部 14 个所需技能**,安装即用、无需自备技能。

> **Skills 归属**:捆绑的 14 个技能源自 [Superpowers 方法论](https://github.com/obra/superpowers)(MIT),署名声明见 `preset/programming/skills/SKILLS-LICENSE.md`。

## 安装

```sh
# 从 GitHub(推荐)
dsh plugin --profile web add github:ziduup/dsh-programming-mode

# 从本地目录 / tarball
dsh plugin --profile web add ./dsh-programming-mode
dsh plugin --profile web add ./dsh-programming-mode-<版本>.tgz
```

安装后重启该 profile,模式选择器里即出现 **编程模式**。

## 升级行为

安装后在 profile 启动时,本包将捆绑的 preset 目录植入 roster 的第一个用户根(默认 `$DSH_HOME/.agent-presets/`)。升级按版本戳判断:

| 目标目录状态 | 行为 |
|---|---|
| 不存在 | 全新植入,写入版本戳 |
| 版本戳 == 本包版本 | 无操作(**保留你的本地修改**) |
| 版本戳 != 本包版本 | 覆盖文件并刷新版本戳(升级) |
| 存在但无版本戳 | **拒绝触碰**(不是我们植入的,可能是你手写的同名 preset) |

## 卸载

```sh
dsh plugin --profile web remove dsh-programming-mode
```

卸载组合包**不会删除**已植入的 preset——它已属于你的用户目录、可能含你的修改。不需要时手动删除 `$DSH_HOME/.agent-presets/programming/` 即可。

## ⚠️ 信任声明

- agent preset 与 shell 访问权限同级:安装本 preset 即表示信任它引用的全部插件行。
- 若从 GitHub 安装,pnpm 会要求你在 `pnpm-workspace.yaml` 中 `allowBuilds` 授权构建脚本——这等于允许包代码在安装时于本机执行;建议锁定 commit(`github:ziduup/dsh-programming-mode#<sha>`)。从 npm 或 tarball 安装的是预构建产物,无此门槛。

## 自行构建

```sh
pnpm pack   # 产出 tarball,可用 dsh plugin add ./dsh-programming-mode-<版本>.tgz 安装
```

## 作者

子都([ziduup](https://github.com/ziduup)) · 仓库:[ziduup/dsh-programming-mode](https://github.com/ziduup/dsh-programming-mode)

---

<a name="english"></a>
## English summary

A DeepSeek Harness bundle that ships the 编程模式 (Programming Mode) agent preset: the full `standard` coding agent with its persona replaced by the mandatory Superpowers discipline (skills-first, brainstorm before building, plans before code, TDD, systematic debugging, verification before completion, code review; requirement and plan documents written in Chinese). The bundle plants the bundled, self-contained preset (14 superpowers skills included) into the roster's first user-trust root at profile boot; version-stamped planting preserves local edits between equal versions and refuses to touch directories it did not plant.
