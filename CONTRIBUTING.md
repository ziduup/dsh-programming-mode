# 贡献指南

感谢关注 编程模式（dsh-programming-mode）！

## 开发环境

- Node.js ≥ 20
- 已安装 DeepSeek Harness CLI（`dsh`）与 pnpm
- 无需额外依赖：本包零运行时依赖

## 本地验证三步

```sh
# 1. 四种植入策略的离线沙箱测试
node scripts/dry-run.mjs

# 2. 安装进一次性 profile
dsh plugin --profile test add ./

# 3. 不启动、只检查组合层是否就位（应看到 "# == dsh-programming-mode"）
dsh --profile test --dump-config
```

改动 preset 组合（`preset/programming/agent.cordis.yml`）后，务必用
`agentPresets.standingKeyFor('programming')` 或真实新会话做一次挂载验证。

## 目录结构

```
index.js            # 启动植入器：plantPreset() 四条策略 + apply()
cordis.patch.yml    # bundle patch：insert 安装器行
preset/programming/ # 植入的 preset 本体（组合 + 元数据 + 14 个捆绑技能）
scripts/dry-run.mjs # 植入策略离线测试
docs/design.zh.md   # 设计说明：为什么植入、版本戳、信任模型
```

## 提交规范

- 一个逻辑变更加一个提交，提交消息用中文
- 行为变更必须同步更新 `CHANGELOG.md`
- 涉及 persona 或技能清单的变更，请在 PR 描述里附一次真实挂载验证的输出
