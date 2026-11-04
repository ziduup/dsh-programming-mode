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

    /** 没存过位置时的默认落点：右下角，右边留 24px，下边留 72px 给 composer。 */
    function defaultPos(width, height, viewportWidth, viewportHeight) {
      return clampPos(
        { x: viewportWidth - width - 24, y: viewportHeight - height - 72 },
        width, height, viewportWidth, viewportHeight,
      )
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

    /**
     * 真正落到草稿里。
     * `captureInsertion()` 返回的是**当前选区**而不是折叠光标（宿主 `caretSpan()` 直接返回
     * `projection.selection`）：草稿里有选中文字时插入会替换掉选中内容，违反「原有内容一个字不动」，
     * 所以选中状态一律拒绝。
     * `insertText` 在裁决/提交中、或 `draftRev` 过期时静默返回 false，也会因 span 过期抛异常。
     * @returns "ok" | "selection" | "failed"
     */
    function insertInto(target, text) {
      const actions = target.inputActions
      try {
        const span = actions.captureInsertion()
        if (span.start !== span.end) return "selection"
        return actions.insertText(text, span) === true ? "ok" : "failed"
      } catch {
        return "failed"
      }
    }

    /**
     * 会话 → 浮窗的单向中继。
     * 必须存在：`inputActions` 只在会话作用域下发，而浮窗为了全窗口唯一必须挂根作用域，
     * 两者不可能在同一个组件里闭合（spec §4.1）。
     */
    function createLink() {
      const subs = new Set()
      let current = null
      const notify = () => {
        for (const fn of [...subs]) fn()
      }
      return {
        get: () => current,
        attach(next) {
          const prev = current
          const same =
            prev !== null &&
            prev.sessionId === next.sessionId &&
            prev.preset === next.preset &&
            prev.draft === next.draft &&
            prev.inputActions === next.inputActions
          if (same) return
          current = next
          notify()
        },
        detach(sessionId) {
          if (!current || current.sessionId !== sessionId) return
          current = null
          notify()
        },
        subscribe(fn) {
          subs.add(fn)
          return () => {
            subs.delete(fn)
          }
        },
      }
    }

    const link = createLink()

    /** localStorage 不可用时（隐私模式、被策略禁用）的替身：位置与开关退化为内存态。 */
    const memoryStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }

    function safeStorage() {
      try {
        const storage = globalThis.localStorage
        const probe = "__dpm_probe__"
        storage.setItem(probe, "1")
        storage.removeItem(probe)
        return storage
      } catch {
        return memoryStorage
      }
    }

    /** 开关与位置的唯一真相源。根作用域浮窗与会话作用域启动器都订阅它。 */
    const panelStore = {
      state: DEFAULT_STATE,
      loaded: false,
      subs: new Set(),
      get() {
        return panelStore.state
      },
      set(next) {
        const prev = panelStore.state
        if (prev.open === next.open && prev.pos === next.pos) return
        panelStore.state = next
        panelStore.loaded = true
        writeState(safeStorage(), next)
        for (const fn of [...panelStore.subs]) fn()
      },
      subscribe(fn) {
        panelStore.subs.add(fn)
        return () => {
          panelStore.subs.delete(fn)
        }
      },
    }

    /** 从 localStorage 取一次初始状态。只在 apply() 里调，`get()` 因此保持纯读（getSnapshot 不该有副作用）。 */
    function initStore() {
      if (panelStore.loaded) return
      panelStore.state = readState(safeStorage())
      panelStore.loaded = true
    }

    // 颜色一律走宿主主题变量，并带兜底值：变量没定义时退化成中性灰，不会变成透明。
    const CSS = `
.dpm-panel{position:fixed;z-index:60;pointer-events:auto;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;max-height:calc(100vh - 16px);overflow:auto;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));background:var(--dsw-alias-bg-layer-3,#fff);box-shadow:0 12px 32px rgba(0,0,0,.18);font-size:12px;color:var(--dsw-alias-label-primary,#111);user-select:none}
.dpm-head{display:flex;align-items:center;gap:6px;cursor:grab;touch-action:none}
.dpm-head:active{cursor:grabbing}
.dpm-title{font-size:12px;font-weight:600}
.dpm-grow{flex:1}
.dpm-close{border:0;background:transparent;cursor:pointer;padding:2px 4px;border-radius:6px;font-size:14px;line-height:1;color:var(--dsw-alias-label-tertiary,#888)}
.dpm-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}
.dpm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.dpm-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));background:var(--dsw-alias-settings-card-fill,#fafafa);color:inherit;font:inherit;cursor:pointer}
.dpm-card:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dpm-card[data-off="true"]{opacity:.45;cursor:not-allowed}
.dpm-mark{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;background:var(--dpm-hue,#4c6ef5)}
.dpm-name{font-size:11px;line-height:1.2;text-align:center}
.dpm-note{min-height:14px;font-size:11px;color:var(--dsw-alias-label-secondary,#555)}
.dpm-launcher{border:0;background:transparent;cursor:pointer;padding:2px 6px;border-radius:8px;font-size:14px;line-height:1;color:var(--dsw-alias-label-tertiary,#888)}
.dpm-launcher:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#111)}
.dpm-launcher[aria-expanded="true"]{color:var(--dsw-alias-state-business-primary,#4c6ef5)}
`

    /** 幂等注入样式表。必须在 apply() 里调：模块体副作用只允许发生在 factory 之后。 */
    function injectStyles() {
      if (typeof document === "undefined") return
      const key = "@ziduup/dsh-programming-mode/experts.css"
      if (document.querySelector(`style[data-plugin-css="${key}"]`) !== null) return
      const tag = document.createElement("style")
      tag.dataset.plugin = "@ziduup/dsh-programming-mode"
      tag.dataset.pluginCss = key
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    const h = React.createElement

    /**
     * 会话作用域的 `✦`：把当前会话的插入凭据送进中继，并开合浮窗。
     * 任何模式下都渲染 —— 用户关掉面板之后，得有一条路把它叫回来（spec §4.5）。
     */
    function ExpertsLauncher({ sessionId, useSessions, useInput, usePanelInfo, inputActions }) {
      // 两个守卫缺一不可：① 主视图持有该会话（retainedBy.mainView，宿主 layout:60 自己在用）；
      // ② 当前没有别的面板盖在上面（activePanelId === null，宿主 layout:58 用同一个判据决定标题）。
      // 少了②，打开设置面板时中继还指着看不见的 composer，用户会看到「插入成功」却什么都没有。
      const isCurrent =
        useSessions((state) => ((state.byId[sessionId]?.retainedBy?.mainView ?? 0) > 0)) &&
        usePanelInfo((info) => info.activePanelId == null)
      const preset = useSessions((state) => {
        const value = state.byId[sessionId]?.projectionValues?.agentPreset
        return typeof value === "string" ? value : undefined
      })
      const draft = useInput((input) => input.draft)
      const open = React.useSyncExternalStore(panelStore.subscribe, () => panelStore.get().open)

      React.useEffect(() => {
        if (!isCurrent) {
          link.detach(sessionId)
          return undefined
        }
        link.attach({ sessionId, preset, draft, inputActions })
        return undefined
      }, [isCurrent, sessionId, preset, draft, inputActions])

      React.useEffect(() => () => link.detach(sessionId), [sessionId])

      return h(
        "button",
        {
          type: "button",
          className: "dpm-launcher",
          "aria-label": "编程专家",
          "aria-expanded": open === true,
          // 真机验收锚点：Task 4 Step 5 靠它确认中继拿到的 preset（不是产品特性）。
          "data-preset": preset ?? "",
          title: open === true ? "收起编程专家" : "召唤编程专家",
          onClick: () => {
            const current = panelStore.get()
            panelStore.set({ ...current, open: current.open === true ? false : true })
          },
        },
        "✦",
      )
    }

    /**
     * 根作用域的全窗口唯一浮窗：渲染、拖动、持久化、点头像。
     * 它没有 `inputActions`（那是会话作用域才有的），插入一律走 `link`。
     */
    function ExpertsPanel() {
      const state = React.useSyncExternalStore(panelStore.subscribe, panelStore.get)
      const target = React.useSyncExternalStore(link.subscribe, link.get)
      const linkPreset = target === null ? undefined : target.preset

      const panelRef = React.useRef(null)
      const dragRef = React.useRef(null)
      const toastTimer = React.useRef(0)
      const [dragPos, setDragPos] = React.useState(null)
      const [measured, setMeasured] = React.useState(PANEL_H)
      const [note, setNote] = React.useState("")

      const toast = React.useCallback((text) => {
        setNote(text)
        clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setNote(""), 2400)
      }, [])

      // 唯一一次自动出现：未决 + 当前会话是编程模式。之后 open 只由用户改。
      React.useEffect(() => {
        const current = panelStore.get()
        const next = autoOpen(current, linkPreset)
        if (next !== current) panelStore.set(next)
      }, [linkPreset])

      // 用 layout effect 量高度：在绘制前夹一次位置，避免首次出现时先画错再跳。
      React.useLayoutEffect(() => {
        if (panelRef.current) setMeasured(panelRef.current.offsetHeight || PANEL_H)
      }, [state.open])

      React.useEffect(() => () => clearTimeout(toastTimer.current), [])

      // Esc 关面板。冒泡阶段监听 + 检查 defaultPrevented：composer 已经吃掉的 Esc 不抢。
      React.useEffect(() => {
        if (state.open !== true) return undefined
        const onKey = (event) => {
          if (event.key !== "Escape" || event.defaultPrevented) return
          panelStore.set({ ...panelStore.get(), open: false })
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
      }, [state.open])

      // 窗口变小后重新夹一次，防止面板飞到屏幕外。
      React.useEffect(() => {
        if (state.open !== true) return undefined
        const onResize = () => {
          const current = panelStore.get()
          if (current.pos === null) return
          const next = clampPos(current.pos, PANEL_W, measured, window.innerWidth, window.innerHeight)
          if (next.x !== current.pos.x || next.y !== current.pos.y) panelStore.set({ ...current, pos: next })
        }
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
      }, [state.open, measured])

      const fallbackPos = defaultPos(PANEL_W, measured, window.innerWidth, window.innerHeight)
      const pos = dragPos || state.pos || fallbackPos

      const onPointerDown = React.useCallback((event) => {
        // 标题栏里的按钮（×）不该触发拖拽：显式 pointer capture 会把 pointerup 改投到标题栏，
        // 有吞掉按钮 click 的风险（引擎相关），直接从源头挡掉。
        if (event.button !== 0 || event.target.closest("button") !== null) return
        dragRef.current = {
          pointerId: event.pointerId,
          dx: event.clientX - pos.x,
          dy: event.clientY - pos.y,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
      }, [pos.x, pos.y])

      const onPointerMove = React.useCallback((event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        setDragPos(clampPos(
          { x: event.clientX - drag.dx, y: event.clientY - drag.dy },
          PANEL_W, measured, window.innerWidth, window.innerHeight,
        ))
      }, [measured])

      const onPointerUp = React.useCallback((event) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        dragRef.current = null
        if (dragPos) panelStore.set({ ...panelStore.get(), pos: dragPos })
        setDragPos(null)
      }, [dragPos])

      const summon = (expert) => {
        const current = link.get()
        const decision = resolveClick(current, expert.skill)
        if (decision.kind === "no-input") return toast("当前没有活动的输入框")
        if (decision.kind === "not-programming") return toast("编程专家只在编程模式下可用")
        if (decision.kind === "already") return toast(`已召唤过：${expert.name}`)
        const result = insertInto(current, decision.text)
        if (result === "ok") return toast(`已召唤：${expert.name}（/${expert.skill}）`)
        if (result === "selection") return toast("先取消选中的文字，再点头像")
        const payload = decision.text.replace(/^\n/, "")
        // writeText 返回 Promise：权限被拒（后台未获焦等）走 rejection，同步 try/catch 抓不到。
        void navigator.clipboard.writeText(payload).catch(() => {})
        return toast(`插入失败，已复制：${payload.trim()}`)
      }

      if (state.open !== true) return null

      const off = target === null || linkPreset !== PRESET_ID

      return h(
        "div",
        { ref: panelRef, className: "dpm-panel", style: { left: pos.x, top: pos.y, width: PANEL_W } },
        h(
          "div",
          {
            className: "dpm-head",
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
          },
          h("span", { className: "dpm-title" }, "编程专家"),
          h("span", { className: "dpm-grow" }),
          h(
            "button",
            {
              type: "button",
              className: "dpm-close",
              "aria-label": "关闭面板",
              onClick: () => panelStore.set({ ...panelStore.get(), open: false }),
            },
            "×",
          ),
        ),
        h(
          "div",
          { className: "dpm-grid" },
          EXPERTS.map((expert) =>
            h(
              "button",
              {
                key: expert.id,
                type: "button",
                className: "dpm-card",
                // 不用 disabled：标准模式下点了要有提示，disabled 会把点击吞掉。
                "data-off": off ? "true" : "false",
                title: `${expert.duty}（/${expert.skill}）`,
                onClick: () => summon(expert),
              },
              h("span", { className: "dpm-mark", style: { "--dpm-hue": expert.hue } }, expert.mark),
              h("span", { className: "dpm-name" }, expert.name),
            ),
          ),
        ),
        h("div", { className: "dpm-note" }, note),
      )
    }

    /** 挂载两个插槽入口：浮窗挂根作用域（全窗口唯一），启动器挂会话作用域（拿得到 inputActions）。 */
    function apply(ctx) {
      initStore()
      injectStyles()
      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          { name: "shell.overlay", id: PANEL_ID, order: 60 },
          ExpertsPanel,
        ),
      )
      ctx.slots.inject("conversation.input.right", () =>
        ctx.slots.register(
          { name: "conversation.input.right", id: LAUNCHER_ID, order: 50 },
          ExpertsLauncher,
        ),
      )
    }

    // ponytail: 测试出口。产物没有构建步骤，没有独立模块可供 import，
    // 所以纯函数只能从这里暴露。这个键会随包发布（约 2KB），但宿主只要求
    // 插件对象带 apply，多一个键不会被拒；将来引入构建链时删掉。
    return {
      inject: ["slots"],
      apply,
      __test: {
        EXPERTS, PRESET_ID, STORAGE_KEY,
        insertCmd, clampPos, autoOpen, resolveClick, readState, writeState, createLink, defaultPos, insertInto,
      },
    }
  },
})
