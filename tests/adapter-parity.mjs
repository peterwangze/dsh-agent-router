// FIX-001 / RISK-003 看护网：twin adapter 与宿主 dsh-llm adapter 接口奇偶回归。
//
// 事实源：宿主 adapter 契约 6 方法（dsh-llm lib/types/index.d.ts LlmAdapter：
// providerInfo/providerRetryPolicy/listModels/resolveModel/prepareCall/stream）。
// 宿主 adapterStream 对每次分发先调 adapter.prepareCall（宿主 lib/index.js
// :1568）——twin 是手工对象字面量（无基类继承），缺任一契约方法即全量断裂
// （FIX-001 实证：prepareCall 缺失 → "registration.adapter.prepareCall is
// not a function" → 接管路由全部失败）。
//
// 本文件独立可跑（node tests/adapter-parity.mjs），并导出 runner 供 smoke
// 接线（接线由后续任务统一执行——本热修不触碰 smoke.mjs，其正被 EVO-002 锁定）。
import { createWrapAdapter } from '../lib/wrapper.js'

/** 宿主 LlmAdapter 契约方法清单（types/index.d.ts 公开面；新增方法时同步
 *  此清单——若宿主导出基类可改为动态枚举，见下方 ADAPTER_CONTRACT 说明）。 */
const ADAPTER_CONTRACT = [
  'providerInfo',
  'providerRetryPolicy',
  'listModels',
  'resolveModel',
  'prepareCall',
  'stream',
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
  // 1. 接口奇偶（核心看护）：契约 6 方法在 twin 上逐一 typeof === 'function'。
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
  {
    const { llm, calls } = makeFakeLlm()
    const active = [{ modality: 'image', stateOf: null, marker: () => '', rewrite: () => null }]
    const twin = createWrapAdapter(llm, 'fake-prov', active)
    const prepared = await twin.prepareCall('fake-prov+多模态', 'm1')
    check('prepareCall returns prepared object', prepared && typeof prepared === 'object' && typeof prepared.stream === 'function')
    check('prepared model carries wrapRoute rewrite', prepared.model.provider === 'fake-prov+多模态')
    check('prepared model aggregates declared modalities', Array.isArray(prepared.model.inputModalities) && prepared.model.inputModalities.includes('text') && prepared.model.inputModalities.includes('image'))
    let chunks = []
    for await (const chunk of prepared.stream({ provider: 'fake-prov+多模态', model: 'm1', messages: [] })) chunks.push(chunk)
    check('prepared dispatch goes through twin stream (not native)', calls.stream === 1 && calls.nativeStream === 0 && chunks.some((c) => c.text === 'twin-delegated'))
  }

  // 3. prepared 不绕过改写：原生模型纯文本 + 带图消息 → prepared.stream 分发
  //    后 fake llm.stream 收到的 messages 无图片块（twin 改写生效）。
  {
    const { llm, calls } = makeFakeLlm({ inputModalities: ['text'] })
    const active = [{
      modality: 'image',
      stateOf: null,
      marker: () => 'MARKER',
      rewrite: () => null, // rewrite 返回 null = 图片块整体移除（v3 语义）
    }]
    const twin = createWrapAdapter(llm, 'fake-prov', active)
    const prepared = await twin.prepareCall('fake-prov+多模态', 'm1')
    const seen = []
    llm.stream = async function* (options) {
      seen.push(...options.messages)
      yield { type: 'text', text: 'ok' }
    }
    const imageMessage = { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', source: { kind: 'base64', mediaType: 'image/png', data: 'aGk=' } }] }
    for await (const chunk of prepared.stream({ provider: 'fake-prov+多模态', model: 'm1', messages: [imageMessage] })) { void chunk }
    const sawImage = seen.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'))
    check('prepared dispatch rewrites image blocks for text-only source model', sawImage === false)
    check('prepared dispatch keeps system marker injection', seen.length > 0)
  }

  // 4. 原生多模态对照组：直传分支图片块保留（prepared 链路不破坏直传语义）。
  {
    const { llm } = makeFakeLlm({ inputModalities: ['text', 'image'] })
    const active = [{ modality: 'image', stateOf: null, marker: () => 'MARKER', rewrite: () => null }]
    const twin = createWrapAdapter(llm, 'fake-prov', active)
    const prepared = await twin.prepareCall('fake-prov+多模态', 'm1')
    const seen = []
    llm.stream = async function* (options) {
      seen.push(...options.messages)
      yield { type: 'text', text: 'ok' }
    }
    const imageMessage = { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', source: { kind: 'base64', mediaType: 'image/png', data: 'aGk=' } }] }
    for await (const chunk of prepared.stream({ provider: 'fake-prov+多模态', model: 'm1', messages: [imageMessage] })) { void chunk }
    const sawImage = seen.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'image'))
    check('prepared dispatch preserves image blocks when source model is multimodal', sawImage === true)
  }
}

const invoked = import.meta.url === `file://${process.argv[1]}`
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
