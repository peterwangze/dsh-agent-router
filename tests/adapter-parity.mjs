// FIX-001 / RISK-003 看护网：twin adapter 与宿主 dsh-llm adapter 接口奇偶回归。
//
// 事实源：宿主 adapter 契约（dsh-llm LlmAdapter）。宿主 adapterStream 对每次
// 分发先调 adapter.prepareCall——twin 是手工对象字面量（无基类继承），缺任一
// 契约方法即全量断裂（FIX-001 实证：prepareCall 缺失 → "registration.adapter.
// prepareCall is not a function" → 接管路由全部失败）。
//
// FIX-001b（R6 审查绑定条件）：
// - F1：独立入口守卫改 pathToFileURL 可移植写法（此前 Windows 永假——断言
//   从未执行过，独立运行空转 exit 0 = 假绿）。
// - F2：契约清单改**动态枚举并集**——宿主实际导出 LlmAdapter 基类，原型方法
//   自动进清单（宿主未来新增方法即自动受检 = RISK-003 真实预警）；stream 为
//   抽象声明不在运行时原型，静态补集（纯枚举会漏检）。
// - F3：test 3 marker 断言增强（system 含 MARKER 才是改写路径核心证据）。
//
// 本文件独立可跑（node tests/adapter-parity.mjs），并导出 runner 供 smoke
// 接线（接线由后续任务统一执行）。
import { pathToFileURL } from 'node:url'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { createWrapAdapter, WRAP_SUFFIX } from '../lib/wrapper.js'

/**
 * 宿主 LlmAdapter 契约方法清单 = 动态枚举并集：
 * - `Object.getOwnPropertyNames(LlmAdapter.prototype)` 去掉 constructor——
 *   宿主基类的具体方法（宿主未来新增自动进入本清单，预警真实生效）；
 * - 静态补 `'stream'`——抽象声明（无运行时实现）不在原型上，纯枚举会漏检。
 */
const ADAPTER_CONTRACT = [
  ...new Set([
    ...(typeof LlmAdapter === 'function'
      ? Object.getOwnPropertyNames(LlmAdapter.prototype).filter((name) => name !== 'constructor')
      : []),
    'stream',
  ]),
]

/** 构造 fake llm：registration 返回可控的原生 adapter（记录调用供断言）。 */
function makeFakeLlm({ inputModalities = ['text'] } = {}) {
  const calls = { resolveModel: 0, stream: 0, nativeStream: 0 }
  const nativeAdapter = {
    providerInfo: (provider) => ({ id: provider, name: `Fake ${provider}` }),
    providerRetryPolicy: () => undefined,
    listModels: async () => [{ provider: 'fake-prov', id: 'm1', name: 'm1' }],
    resolveModel: async (provider, model) => {
      calls.resolveModel += 1
      return { provider, id: model, name: model, inputModalities }
    },
    stream: async function* () {
      calls.nativeStream += 1
      yield { type: 'text', text: 'native' }
    },
  }
  const llm = {
    registration: (provider) => ({ adapter: nativeAdapter }),
    stream: async function* (options) {
      calls.stream += 1
      yield { type: 'text', text: 'twin-delegated' }
    },
  }
  return { llm, calls }
}

export async function runAdapterParityTests(check) {
  // 0. 契约清单健康自检（FIX-001b F2）：动态枚举必须产出 ≥5 项具体方法且
  //    必含 prepareCall——宿主导出形状变化（枚举失效）本身就要红。
  check('ADAPTER_CONTRACT dynamic enum yields core methods (F2)', ADAPTER_CONTRACT.length >= 5 && ADAPTER_CONTRACT.includes('prepareCall') && ADAPTER_CONTRACT.includes('resolveModel') && ADAPTER_CONTRACT.includes('stream'))

  // 1. 接口奇偶（核心看护）：契约方法在 twin 上逐一 typeof === 'function'。
  //    宿主未来新增契约方法而 twin 未跟进 → 此处红 = RISK-003 预警。
  {
    const { llm } = makeFakeLlm()
    const active = [{ modality: 'image', stateOf: null, marker: () => '', rewrite: () => null }]
    const twin = createWrapAdapter(llm, 'fake-prov', active)
    for (const method of ADAPTER_CONTRACT) {
      check(`twin implements adapter contract method: ${method}`, typeof twin[method] === 'function')
    }
  }

  // 2. prepareCall 行为：返回 {model, stream}；model 经 twin resolveModel
  //    （wrapRoute 改写 + inputModalities 聚合）；stream 经 twin stream。
  //    （FIX-001b：wrapRoute 从 WRAP_SUFFIX 组装——此前硬编码 'fake-prov+多模态'
  //    系把显示名当路由名，断言永红但因守卫缺陷从未执行过。）
  {
    const { llm, calls } = makeFakeLlm()
    const active = [{ modality: 'image', stateOf: null, marker: () => '', rewrite: () => null }]
    const twin = createWrapAdapter(llm, 'fake-prov', active)
    const prepared = await twin.prepareCall('fake-prov' + WRAP_SUFFIX, 'm1')
    check('prepareCall returns prepared object', prepared && typeof prepared === 'object' && typeof prepared.stream === 'function')
    check('prepared model carries wrapRoute rewrite', prepared.model.provider === 'fake-prov' + WRAP_SUFFIX)
    check('prepared model aggregates declared modalities', Array.isArray(prepared.model.inputModalities) && prepared.model.inputModalities.includes('text') && prepared.model.inputModalities.includes('image'))
    let chunks = []
    for await (const chunk of prepared.stream({ provider: 'fake-prov' + WRAP_SUFFIX, model: 'm1', messages: [] })) chunks.push(chunk)
    check('prepared dispatch goes through twin stream (not native)', calls.stream === 1 && calls.nativeStream === 0 && chunks.some((c) => c.text === 'twin-delegated'))
  }

  // 3. prepared 不绕过改写：原生模型纯文本 + 带图消息 → prepared.stream 分发
  //    后 fake llm.stream 收到的 messages 无图片块（twin 改写生效）+ system
  //    含 marker（改写路径核心证据——FIX-001b F3 增强）。
  //    （provider 'fake-text'：与 test 4 隔离——wrapper 能力探测缓存是模块级
  //    60s TTL，同 provider+model+modality 键会互相污染判定。）
  {
    const { llm } = makeFakeLlm({ inputModalities: ['text'] })
    const active = [{
      modality: 'image',
      stateOf: null,
      marker: () => 'MARKER',
      rewrite: () => null, // rewrite 返回 null = 图片块整体移除（v3 语义）
    }]
    const twin = createWrapAdapter(llm, 'fake-text', active)
    const prepared = await twin.prepareCall('fake-text' + WRAP_SUFFIX, 'm1')
    const seen = []
    let seenSystem
    llm.stream = async function* (options) {
      seen.push(...options.messages)
      seenSystem = options.system
      yield { type: 'text', text: 'ok' }
    }
    const imageMessage = { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', source: { kind: 'base64', mediaType: 'image/png', data: 'aGk=' } }] }
    for await (const chunk of prepared.stream({ provider: 'fake-text' + WRAP_SUFFIX, model: 'm1', messages: [imageMessage] })) { void chunk }
    const sawImage = seen.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'))
    check('prepared dispatch rewrites image blocks for text-only source model', sawImage === false)
    check('prepared dispatch injects marker into system (F3)', typeof seenSystem === 'string' && seenSystem.includes('MARKER'))
  }

  // 4. 原生多模态对照组：直传分支图片块保留（prepared 链路不破坏直传语义）。
  //    （provider 'fake-mm'：独立键避免与 test 3 的探测缓存互相污染。）
  {
    const { llm } = makeFakeLlm({ inputModalities: ['text', 'image'] })
    const active = [{ modality: 'image', stateOf: null, marker: () => 'MARKER', rewrite: () => null }]
    const twin = createWrapAdapter(llm, 'fake-mm', active)
    const prepared = await twin.prepareCall('fake-mm' + WRAP_SUFFIX, 'm1')
    const seen = []
    llm.stream = async function* (options) {
      seen.push(...options.messages)
      yield { type: 'text', text: 'ok' }
    }
    const imageMessage = { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', source: { kind: 'base64', mediaType: 'image/png', data: 'aGk=' } }] }
    for await (const chunk of prepared.stream({ provider: 'fake-mm' + WRAP_SUFFIX, model: 'm1', messages: [imageMessage] })) { void chunk }
    const sawImage = seen.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'))
    check('prepared dispatch preserves image blocks when source model is multimodal', sawImage === true)
  }
}

// FIX-001b F1：pathToFileURL 可移植比较（Windows 下 argv[1] 反斜杠路径 vs
// import.meta URL 格式不匹配——此前守卫永假，独立运行空转 exit 0 = 假绿）。
const invoked = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (invoked) {
  let failures = 0
  let oks = 0
  const check = (name, ok) => {
    if (ok) { oks += 1; console.log(`  ok  ${name}`) }
    else { failures += 1; console.log(`  FAIL ${name}`) }
  }
  await runAdapterParityTests(check)
  if (failures > 0) {
    console.log(`ADAPTER PARITY TESTS FAILED (${failures} failures, ${oks} ok)`)
    process.exit(1)
  }
  console.log(`ALL ADAPTER PARITY TESTS PASSED (${oks} assertions)`)
}
