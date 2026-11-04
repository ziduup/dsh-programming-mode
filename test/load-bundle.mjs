// 以假的 window.__ModuleLoader__ 装载客户端产物。
// 存在的理由：产物是「注册脚本」不是模块，普通 import 拿不到内部函数；
// 而 factory(require) 正好是宿主自己的装载入口，测试复用它最诚实。
let cached

const FAKE_REACT = {
  createElement: () => null,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useRef: () => ({ current: undefined }),
  useState: () => [undefined, () => {}],
  useSyncExternalStore: () => undefined,
}

export async function loadBundle() {
  if (cached) return cached
  let registered
  globalThis.window = {
    __ModuleLoader__: {
      load(spec) {
        registered = spec
      },
    },
  }
  await import(`../lib/client.js?ts=${Date.now()}`)
  if (!registered) throw new Error("bundle did not call window.__ModuleLoader__.load")
  const plugin = registered.factory((id) => {
    if (id === "react") return FAKE_REACT
    throw new Error(`unexpected require: ${id}`)
  })
  cached = { spec: registered, plugin }
  return cached
}
