// @ziduup/dsh-programming-mode — 客户端半边（手写，无构建链）。
//
// 宿主只认「注册脚本」这一种形态：本文件被 <script> 加载时唯一的副作用是
// 登记工厂，真正的代码在 factory 里、首次 import 时才执行。
//
// ponytail: 手写产物，没有类型检查、没有 HMR。天花板：本文件超过约 600 行，
// 或需要 JSX / 多 chunk 时，改用 tsdown + 一个 __ModuleLoader__ 包装插件重建
// （spec §7 有完整迁移路径）。当前约 490 行，React.createElement 足够。
window.__ModuleLoader__.load({
  id: "@ziduup/dsh-programming-mode",
  factory: (require) => {
    const React = require("react")

    /** 挂载两个插槽入口。 */
    function apply(ctx) {
      // 空实现：Task 4 / Task 5 分别把启动器与浮窗接进来。
    }

    return { inject: ["slots"], apply }
  },
})
