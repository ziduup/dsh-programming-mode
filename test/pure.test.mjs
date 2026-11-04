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
