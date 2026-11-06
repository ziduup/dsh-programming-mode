import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { loadBundle } from "./load-bundle.mjs"

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))

test("产物按包名注册", async () => {
  const { spec } = await loadBundle()
  assert.equal(spec.id, pkg.name)
  assert.equal(typeof spec.factory, "function")
})

test("工厂返回可挂载的插件对象", async () => {
  const { plugin } = await loadBundle()
  assert.deepEqual(plugin.inject, ["slots"])
  assert.equal(typeof plugin.apply, "function")
})

// 这组断言是「配置回显」：它只能抓住转录错误（写错字段名、漏掉清单项），
// 抓不到「宿主是否接受这份声明」——后者只有真机能验。42 绿不等于宿主兼容。
test("package.json 声明了 client 半边且没有多余字段", () => {
  assert.equal(pkg.version, "0.5.1")
  assert.equal(pkg.type, "module")
  assert.equal(pkg.exports["."], "./index.js")
  assert.equal(pkg.exports["./client"], "./lib/client.js")
  assert.equal(pkg.exports["./package.json"], "./package.json")
  assert.ok(pkg.files.includes("lib/client.js"))
  assert.equal(pkg.dsh.client.platform, "web")
  assert.equal(pkg.dsh.client.external, undefined)
  assert.equal(pkg.dsh.client.inject, undefined)
  assert.equal(pkg.engines.dsh, ">=0.2.1-rc.5")
  assert.equal(pkg.scripts.test, 'node --test "test/*.test.mjs"')
})
