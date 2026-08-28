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
9. **首条消息强制注入 using-superpowers**：每个新会话的第一批请求里，`using-superpowers` 技能全文都会**机械地**出现在最前面（引擎注入，不依赖模型自觉调用 `skill` 工具），超极技能纪律从第一句就生效

本包**捆绑了全部 14 个所需技能**(源自 [obra/superpowers](https://github.com/obra/superpowers),MIT,见 `preset/programming/skills/SKILLS-LICENSE.md`),安装即用、无需自备技能。

> **Superpowers 渊源**:本模式的工程纪律与捆绑的 14 个技能源自 [Superpowers 方法论](https://github.com/obra/superpowers)(MIT),逐字节同步自上游 v6.3.0,署名声明见 `preset/programming/skills/SKILLS-LICENSE.md`。

## 安装

```sh
# 从 GitHub(推荐)
dsh plugin --profile web add github:ziduup/dsh-programming-mode

# 从本地目录 / tarball
dsh plugin --profile web add ./dsh-programming-mode
dsh plugin --profile web add ./dsh-programming-mode-<版本>.tgz
```

安装后重启该 profile,模式选择器里即出现 **编程模式**。

## 工作原理与植入策略

一个 bundle 无法直接注册 agent preset 根(启动器会把 `agent-presets` 的 `roots` 配置固定为随附根目录),所以本包在 profile 启动时把捆绑的 preset 目录**植入** roster 第一个 user 信任根(默认 `$DSH_HOME/.agent-presets/`)。roster 每次 `list()` 重新扫描,植入即生效。

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

## 自行构建 / 发布

```sh
pnpm pack          # 产出 tarball,可直接分发
pnpm publish       # 发布到 npm(先确认包名可用或加 scope)
```

`files` 字段只发布 `index.js`、`cordis.patch.yml`、`preset/`;`scripts/` 是开发工具,不随包分发。

## 开发验证

```sh
node scripts/dry-run.mjs   # 四种植入策略的 dry-run(临时沙箱)
dsh plugin --profile <test> add ./
dsh --profile <test> --dump-config   # 应看到 "# == dsh-programming-mode" 层
```

## 作者

子都([ziduup](https://github.com/ziduup)) · 仓库:[ziduup/dsh-programming-mode](https://github.com/ziduup/dsh-programming-mode)

---

<a name="english"></a>
## English summary

A DeepSeek Harness bundle that ships the 编程模式 (Programming Mode) agent preset: the full `standard` coding agent with its persona replaced by the mandatory Superpowers discipline (skills-first, brainstorm before building, plans before code, TDD, systematic debugging, verification before completion, code review; requirement and plan documents written in Chinese). The bundle plants the bundled, self-contained preset (14 superpowers skills included) into the roster's first user-trust root at profile boot; version-stamped planting preserves local edits between equal versions and refuses to touch directories it did not plant.
