// 声明行（0.2.x 通道）的行级转换。这一层是「同一份 0.1.x 组合，按宿主改写」，
// 所以每条断言都成对：源文件保持不变，生成的声明才是被改过的那一份。
import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { blockProblems, buildDeclaration, readPresetMetadata } from "../preset/programming/declaration.mjs"

const presetDir = new URL("../preset/programming/", import.meta.url)
const compositionText = await readFile(new URL("agent.cordis.yml", presetDir), "utf8")
const metadata = readPresetMetadata(await readFile(new URL("preset.yml", presetDir), "utf8"))

function build(version = "test") {
  return buildDeclaration({
    version,
    compositionText,
    metadata,
    moduleUrl: "file:///home/test/.dsh/.agent-presets/programming/force-superpowers.mjs",
    skillsDir: "C:\\Users\\test\\.dsh\\.agent-presets\\programming\\skills",
  })
}

// 0.1.x 宿主上 `/list-agents` 是合法子路径，那一条行必须原样留着：
// 两个通道共用这一份组合，改源文件等于同时打断旧宿主。
test("0.1.x 组合保留 list-agents 行", () => {
  assert.ok(compositionText.includes("dsh-tool-subagent-control/list-agents"))
})

test("0.2.x 声明删掉 list-agents 行，且不留孤立的 name 键", () => {
  const block = build()
  assert.ok(!block.includes("dsh-tool-subagent-control/list-agents"))
  assert.equal(block.split("- id: tool-subagent-control").length - 1, 1)
})

test("0.2.x 声明用 modelSelection/modelDiscovery 取代 modelSelectionSettings", () => {
  const block = build()
  assert.ok(!block.includes("modelSelectionSettings"))
  assert.ok(block.includes("modelSelection: true"))
  assert.ok(block.includes("modelDiscovery: true"))
})

test("0.2.x 声明不再携带 backgroundMode", () => {
  assert.ok(!build().includes("backgroundMode"))
})

test("生成的声明通过结构不变量检查", () => {
  assert.deepEqual(blockProblems(build()), [])
})

// 逐条证明 tripwire 会红：把退役行塞回生成结果，blockProblems 必须报出来。
test("blockProblems 拦得住退回旧 subpath 的声明", () => {
  const regressed = build().replace(
    "modelSelection: true",
    "name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'",
  )
  assert.ok(blockProblems(regressed).some((problem) => problem.includes("list-agents")))
})
