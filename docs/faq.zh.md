# 常见问题

## 和标准模式的区别是什么？

工具完全相同（都来自部署自带的 `standard` 组合），差别在人设与技能供给：编程模式的 persona 把 Superpowers 工程纪律写成强制规则（先查技能、先头脑风暴、先计划、TDD、系统化调试、完成前必验证、代码审查、需求/计划文档用中文），并内置全部所需技能；标准模式只是"能看到"这些技能，不强制使用。

## 为什么要把技能捆绑进 preset？

编程模式的规则引用了具体技能名。如果接收方没有自备 superpowers 技能，规则就成了空话——这正是"装了模式却没反应"的最常见原因。捆绑后开箱即得；捆绑目录的 rank（300）高于用户技能根目录（400/500），你自有的同名技能会被干净遮蔽而非冲突。

## 安装后模式选择器里没出现编程模式？

按顺序检查：

1. 安装是否成功：profile 的 `package.json` 里应有 `dsh-programming-mode`，且出现在 `dsh.profile.bundles` 列表；
2. profile 是否重启过（bundle 层在启动时装配，植入器在启动时运行，启动日志有一行 `[dsh-programming-mode] planted/unchanged/updated`）；
3. `$DSH_HOME/.agent-presets/programming/` 是否存在且含 `agent.cordis.yml`。

## 升级插件会覆盖我对 preset 的本地修改吗？

看版本戳（`~/.dsh/.agent-presets/programming/.dsh-programming-mode.installed.json`）：

- 版本相同 → 不动你的文件；
- 版本不同 → 覆盖为官方新版；
- 目录存在但没有版本戳 → 视为他人创建，永不触碰。

## 卸载插件后编程模式还在吗？

在。卸载只移除 bundle 层，已植入的 preset 属于你的用户目录。不需要时手动删除 `$DSH_HOME/.agent-presets/programming/` 即可。

## 需求文档和开发计划为什么强制中文？

这是作者的使用偏好，也是本模式的默认约定：需求文档、设计规格与实现计划面向人工审计，统一中文便于作者复查。代码、标识符与提交信息仍遵循各仓库自身惯例。若你的团队需要其他语言，直接改 persona 第 8 条即可。
