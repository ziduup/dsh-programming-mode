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

    const PRESET_ID = "programming"
    const STORAGE_KEY = "dsh-programming-mode.experts"
    const PANEL_ID = "programming.experts-panel"
    const LAUNCHER_ID = "programming.experts-launcher"
    const PANEL_W = 268
    const PANEL_H = 208

    /** 六位专家。`skill` 同时是命令名，宿主按 `/<skill>` 扫整条消息。 */
    const EXPERTS = [
      { id: "brainstorming", mark: "问", name: "需求拷问者", skill: "brainstorming", duty: "把模糊需求问成可执行的决策", hue: "#4c6ef5" },
      { id: "writing-plans", mark: "计", name: "计划制定者", skill: "writing-plans", duty: "把方案写成别人能照抄的计划", hue: "#0ca678" },
      { id: "test-driven-development", mark: "测", name: "TDD 践行者", skill: "test-driven-development", duty: "先写会红的测试，再写最小实现", hue: "#f08c00" },
      { id: "systematic-debugging", mark: "排", name: "排错专家", skill: "systematic-debugging", duty: "找根因，不修症状", hue: "#e8590c" },
      { id: "ponytail", mark: "简", name: "极简主义者", skill: "ponytail", duty: "能不写就不写，删比加优先", hue: "#7048e8" },
      { id: "verification-before-completion", mark: "验", name: "交付前验证员", skill: "verification-before-completion", duty: "拿证据证明完成，不靠嘴", hue: "#c2255c" },
    ]

    /** 草稿末尾是否已经是这条命令（前面必须是行首或空白，否则 `x/name` 会被误判）。 */
    function endsWithCmd(text, skill) {
      const needle = `/${skill}`
      const tail = text.trimEnd()
      if (!tail.endsWith(needle)) return false
      const at = tail.length - needle.length
      return at === 0 || /\s/.test(tail[at - 1])
    }

    /**
     * 拼出要插进草稿的文本。
     * 尾空格必须保留：宿主正则 `(?=\s|$)` 要求命令名后面是空白或行尾。
     * @returns `{ text: null, reason: "already" }` 表示草稿末尾已经是它。
     */
    function insertCmd(draft, skill) {
      const cmd = `/${skill} `
      const text = typeof draft === "string" ? draft : ""
      if (endsWithCmd(text, skill)) return { text: null, reason: "already" }
      if (text.trim().length === 0) return { text: cmd }
      if (text.endsWith("\n")) return { text: cmd }
      return { text: `\n${cmd}` }
    }

    const DEFAULT_STATE = { v: 2, open: null, pos: null }

    function isPos(value) {
      return Boolean(value) && Number.isFinite(value.x) && Number.isFinite(value.y)
    }

    /**
     * 读回开关与位置。任何读失败（键缺失、JSON 坏、storage 不可用）都回退默认值：
     * 绝不抛错，也绝不因为读不懂就清掉用户的键。
     */
    function readState(storage) {
      try {
        const raw = storage && storage.getItem(STORAGE_KEY)
        if (typeof raw !== "string" || raw.length === 0) return DEFAULT_STATE
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== "object") return DEFAULT_STATE
        const open = parsed.open === true ? true : parsed.open === false ? false : null
        const pos = isPos(parsed.pos) ? { x: parsed.pos.x, y: parsed.pos.y } : null
        return { v: 2, open, pos }
      } catch {
        return DEFAULT_STATE
      }
    }

    function writeState(storage, state) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, open: state.open, pos: state.pos }))
      } catch {
        // 存不下就只在内存里活着（spec §6：localStorage 不可用时退化为内存态）。
      }
    }

    /** 把浮窗夹进视口。视口比面板窄时归零，不产生负坐标。 */
    function clampPos(pos, width, height, viewportWidth, viewportHeight) {
      const maxX = Math.max(0, viewportWidth - width)
      const maxY = Math.max(0, viewportHeight - height)
      return {
        x: Math.min(Math.max(0, pos.x), maxX),
        y: Math.min(Math.max(0, pos.y), maxY),
      }
    }

    /**
     * 三态里唯一会「自动」的转换：未决 + 编程模式 → 打开，且只发生一次。
     * 无变化时返回同一个对象，调用方可以用引用相等判断要不要落盘。
     */
    function autoOpen(state, preset) {
      if (state.open !== null) return state
      if (preset !== PRESET_ID) return state
      return { ...state, open: true }
    }

    /** 点头像的决策：先判可用性，再判重复，最后才拼文本。纯函数，真机行为全靠它。 */
    function resolveClick(target, skill) {
      if (!target) return { kind: "no-input" }
      if (target.preset !== PRESET_ID) return { kind: "not-programming" }
      const { text, reason } = insertCmd(target.draft, skill)
      if (text === null) return { kind: reason === "already" ? "already" : "no-input" }
      return { kind: "insert", text }
    }

    /** 挂载两个插槽入口。 */
    function apply(ctx) {
      // 空实现：Task 4 / Task 5 分别把启动器与浮窗接进来。
    }

    // ponytail: 测试出口。产物没有构建步骤，没有独立模块可供 import，
    // 所以纯函数只能从这里暴露。这个键会随包发布（约 2KB），但宿主只要求
    // 插件对象带 apply，多一个键不会被拒；将来引入构建链时删掉。
    return {
      inject: ["slots"],
      apply,
      __test: {
        EXPERTS, PRESET_ID, STORAGE_KEY,
        insertCmd, clampPos, autoOpen, resolveClick, readState, writeState,
      },
    }
  },
})
