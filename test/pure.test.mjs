import test from "node:test"
import assert from "node:assert/strict"
import { loadBundle } from "./load-bundle.mjs"

const { plugin } = await loadBundle()
const { insertCmd } = plugin.__test

test("空草稿 → 命令本身", () => {
  assert.deepEqual(insertCmd("", "brainstorming"), { text: "/brainstorming " })
})

test("只有空白字符的草稿当作空草稿", () => {
  assert.deepEqual(insertCmd("   \n ", "brainstorming"), { text: "/brainstorming " })
})

test("有内容 → 换行后追加，原文一字不动", () => {
  assert.deepEqual(insertCmd("把登录接口重构一下", "brainstorming"), { text: "\n/brainstorming " })
})

test("已以换行结尾 → 直接追加，不多插空行", () => {
  assert.deepEqual(insertCmd("第一行\n", "brainstorming"), { text: "/brainstorming " })
})

test("末尾已有同一命令 → 不重复插入", () => {
  assert.deepEqual(insertCmd("随便写点\n/brainstorming", "brainstorming"), { text: null, reason: "already" })
  assert.deepEqual(insertCmd("/brainstorming ", "brainstorming"), { text: null, reason: "already" })
})

test("命令前面不是空白 → 不算已召唤", () => {
  assert.deepEqual(insertCmd("前面粘着/brainstorming", "brainstorming"), { text: "\n/brainstorming " })
})

test("不同技能互不影响", () => {
  assert.deepEqual(insertCmd("x\n/brainstorming", "ponytail"), { text: "\n/ponytail " })
})

test("草稿不是字符串 → 当作空草稿", () => {
  assert.deepEqual(insertCmd(undefined, "ponytail"), { text: "/ponytail " })
})

test("六位专家的技能名与 ID 一致且不重复", () => {
  const { EXPERTS } = plugin.__test
  assert.equal(EXPERTS.length, 6)
  assert.deepEqual(
    EXPERTS.map((e) => e.skill),
    [
      "brainstorming",
      "writing-plans",
      "test-driven-development",
      "systematic-debugging",
      "ponytail",
      "verification-before-completion",
    ],
  )
  assert.equal(new Set(EXPERTS.map((e) => e.skill)).size, 6)
})

const { clampPos, autoOpen, resolveClick, readState, writeState, STORAGE_KEY } = plugin.__test

/** 假 storage：只实现用到的三个方法。 */
function fakeStorage(initial) {
  const map = new Map()
  if (initial !== undefined) map.set(STORAGE_KEY, initial)
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  }
}

test("没存过 → 默认三态", () => {
  assert.deepEqual(readState(fakeStorage()), { v: 2, open: null, pos: null })
})

test("坏 JSON → 回退默认值且不抛", () => {
  assert.deepEqual(readState(fakeStorage("{oops")), { v: 2, open: null, pos: null })
})

test("读回已存的开合与位置", () => {
  const raw = JSON.stringify({ open: false, pos: { x: 40, y: 60 } })
  assert.deepEqual(readState(fakeStorage(raw)), { v: 2, open: false, pos: { x: 40, y: 60 } })
})

test("open 不是布尔 → 视为未决", () => {
  assert.equal(readState(fakeStorage(JSON.stringify({ open: "yes" }))).open, null)
})

test("坐标不是有限数 → pos 回退 null", () => {
  assert.equal(readState(fakeStorage(JSON.stringify({ open: true, pos: { x: "a", y: 2 } }))).pos, null)
})

test("storage 抛错 → 读回默认值、写不抛", () => {
  const broken = {
    getItem() { throw new Error("denied") },
    setItem() { throw new Error("denied") },
  }
  assert.deepEqual(readState(broken), { v: 2, open: null, pos: null })
  assert.doesNotThrow(() => writeState(broken, { open: true, pos: null }))
})

test("写回只保留 v/open/pos", () => {
  const storage = fakeStorage()
  writeState(storage, { open: true, pos: { x: 1, y: 2 }, junk: "x", v: 9 })
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), { v: 2, open: true, pos: { x: 1, y: 2 } })
})

test("视口内的位置不动", () => {
  assert.deepEqual(clampPos({ x: 100, y: 100 }, 268, 208, 1440, 900), { x: 100, y: 100 })
})

test("负坐标贴边", () => {
  assert.deepEqual(clampPos({ x: -50, y: -9 }, 268, 208, 1440, 900), { x: 0, y: 0 })
})

test("超出右下角夹回", () => {
  assert.deepEqual(clampPos({ x: 2000, y: 2000 }, 268, 208, 1440, 900), { x: 1172, y: 692 })
})

test("视口比面板还窄 → 夹到 0，不出现负值", () => {
  assert.deepEqual(clampPos({ x: 50, y: 200 }, 268, 208, 200, 300), { x: 0, y: 92 })
})

test("未决 + 编程模式 → 打开", () => {
  assert.equal(autoOpen({ v: 2, open: null, pos: null }, "programming").open, true)
})

test("未决 + 标准模式 → 原样返回同一个对象", () => {
  const state = { v: 2, open: null, pos: null }
  assert.equal(autoOpen(state, "standard"), state)
})

test("用户关过 → 编程模式也不再自动开", () => {
  const state = { v: 2, open: false, pos: null }
  assert.equal(autoOpen(state, "programming"), state)
})

test("已打开 → 切到标准模式不改状态", () => {
  const state = { v: 2, open: true, pos: null }
  assert.equal(autoOpen(state, "standard"), state)
})

test("没有活动输入框 → no-input", () => {
  assert.equal(resolveClick(null, "brainstorming").kind, "no-input")
})

test("标准模式 → 不插入", () => {
  assert.equal(resolveClick({ preset: "standard", draft: "", inputActions: {} }, "brainstorming").kind, "not-programming")
})

test("preset 缺失 → 按不可用处理", () => {
  assert.equal(resolveClick({ preset: undefined, draft: "", inputActions: {} }, "brainstorming").kind, "not-programming")
})

test("编程模式空草稿 → 插入", () => {
  assert.deepEqual(
    resolveClick({ preset: "programming", draft: "", inputActions: {} }, "brainstorming"),
    { kind: "insert", text: "/brainstorming " },
  )
})

test("编程模式已召唤过 → already", () => {
  assert.equal(resolveClick({ preset: "programming", draft: "/brainstorming ", inputActions: {} }, "brainstorming").kind, "already")
})
