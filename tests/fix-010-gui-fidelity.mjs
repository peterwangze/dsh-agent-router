// FIX-010 判别测试：用户原始输入 GUI 呈现保真（会话历史保留图片块）+ 模型侧适配不回退。
//
// 根因链（RCA 实采，2026-08-30，会话实录 ~/.dsh/sessions/...ec6b01b0）：
//   用户会话实际路由 = glm-router（wrapper，request/header 实证）。prestep
//   sessionProvider() 读 agent.options.provider（= agent-default-model 恢复时
//   快照）优先于 agent.session.requestHeader()（= 会话实际路由）。当默认模型
//   切到非 wrapper 纯文本 provider（settings.yaml mtime 18:16:20 → deepseek-
//   official/deepseek-v4-flash，宿主 18:17 重启 resume 后 agent.options 更新）
//   而会话仍走 glm-router → prestep 误判 onWrapperRoute=false →
//   rewriteImageTurnsToMarkers 逃生组改写把 image 块替换为 route_agent 标记
//   文本 → 宿主把 decision.messages 持久化为 user/message（dsh-agent-loop
//   lib/index.js:554）→ GUI 渲染标记文本而非图片（用户实证：图片消失）。
//   对比 v0.3.0 时代同会话：image 块原样持久化（turn 4/13/15/16）。
//
// 判别断言（TDD 先红后绿）：
//   A. 会话 requestHeader=wrapper 路由 + agent.options=非 wrapper 纯文本 →
//      原始 image 块必须保留在 decision.messages（旧实现必败：escape rewrite
//      替换为标记文本）+ reminder 注入保持（accepts=false 纯文本判定链不回退）；
//   B. 控制组：无 requestHeader（新会话）→ 回落 agent.options → 非 wrapper
//      纯文本 → 逃生组改写保持（C-3 纯文本主模型不见裸图块，不回退）；
//   C. 控制组：wrapper 分支纯文本（G4 同型）→ 不改写（防双改写）+ reminder 注入；
//   D. 模型侧适配仍发生：prestep 保留的原始消息流经 wrapper stream →
//      委托请求无裸 image 块（wrapper 输入层改写，F3 日志/模型面解耦成立）。
//
// 门控：独立运行（node tests/fix-010-gui-fidelity.mjs），exit 0 全绿；
// 修复 prestep.js sessionProvider/sessionModel 后 A 转绿。
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, contentHasImage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { installAdmissionWrapper, WRAP_SUFFIX } from '../lib/wrapper.js'
import { installPreStep } from '../lib/prestep.js'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

process.env.DSH_HOME = '.tmp-fix010-home'

// ── 夹具：纯文本原适配器（见图片块即拒，复刻 UNSUPPORTED_CONTENT 语义）──
function makeTextAdapter(delegateCalls) {
  return {
    providerInfo(provider) { return { id: provider, name: 'TextBrain' } },
    providerRetryPolicy() { return undefined },
    async listModels(provider) { return [{ provider, id: 'brain-1', name: 'Brain-1', inputModalities: ['text'] }] },
    async resolveModel(provider, model) {
      return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 100_000 }, defaultMaxTokens: 4096 }
    },
    async prepareCall(provider, model, signal) {
      return { model: await this.resolveModel(provider, model, signal), stream: (options) => this.stream(options) }
    },
    async *stream(options) {
      delegateCalls.push(options)
      for (const message of options.messages) if (contentHasImage(message.content)) throw new Error('UNSUPPORTED_CONTENT')
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'ok' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
}

/** prestep handler 直驱：返回 handler 引用（ctx.on 捕获）+ 驱动函数。 */
function installPrestepHarness(service) {
  let handler
  const ctx = {
    get: (key) => (key === 'llm' ? undefined : undefined),
    on: (_event, fn) => { handler = fn; return () => undefined },
    logger: { warn: () => undefined, info: () => undefined },
  }
  installPreStep(ctx, service)
  return async (agent, messages) => {
    const decision = await handler(
      { agent, messages, turn: 0, step: 0, signal: undefined },
      async () => ({ kind: 'enter', messages }),
    )
    return decision.messages
  }
}

const fakeService = {
  isEnabled: () => true,
  getState: () => ({ enabled: true, takeoverDefaultModel: false }),
  listImageVisionAgents: () => [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]],
  listImageGenerationAgents: () => [],
}

const imgPlusText = () => [
  createUserMessage({
    content: [
      { type: 'image', attachment: { attachmentId: 'sha256:fix010', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'shot.png' } },
      { type: 'text', text: '看图' },
    ],
    source: { kind: 'user' },
  }),
]
const hasImageBlock = (msgs) => msgs.some((m) => Array.isArray(m?.content) && m.content.some((b) => b?.type === 'image'))
const hasMarkerText = (msgs) => msgs.some((m) => Array.isArray(m?.content) && m.content.some((b) => b?.type === 'text' && typeof b.text === 'string' && b.text.includes('请直接调用 route_agent 工具')))
const hasReminder = (msgs) => msgs.some((m) => Array.isArray(m?.content) && m.content.some((b) => b?.type === 'text' && typeof b.text === 'string' && b.text.includes('本轮消息包含图片')))

console.log('fix-010 GUI fidelity (RED on current code):')
{
  const run = installPrestepHarness(fakeService)

  // A. 会话实际路由 = wrapper（requestHeader=text-provider-router），但 agent.options
  //    （默认选择快照）= 非 wrapper 纯文本 provider —— FIX-010 回归形态。
  //    旧实现：sessionProvider 读 agent.options → onWrapperRoute=false → 逃生组改写
  //    → image 块被替换为标记文本 → hasImageBlock 必败（红）。
  //    修复后：requestHeader 优先 → onWrapperRoute=true → image 块保留（绿）。
  const outA = await run(
    {
      options: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      session: { requestHeader: () => ({ config: { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' } }) },
    },
    imgPlusText(),
  )
  check('A1: wrapper 路由会话（options 非 wrapper）保留原始 image 块（RED: escape rewrite 替换）', hasImageBlock(outA))
  check('A2: 同场景标记文本不进入会话历史（无 minimalImageRewrite 污染）', !hasMarkerText(outA))
  check('A3: 纯文本判定链不回退——reminder 注入保持（accepts=false）', hasReminder(outA))

  // B. 控制组：无 requestHeader（新会话首轮）→ 回落 agent.options → 非 wrapper
  //    纯文本 → 逃生组改写保持（C-3：纯文本主模型不见裸图块）。
  const outB = await run(
    { options: { provider: 'text-only-prov', model: 't1' }, session: { requestHeader: () => undefined } },
    imgPlusText(),
  )
  check('B1: 新会话回落 options：非 wrapper 纯文本 → 逃生组改写保持（无裸图块）', !hasImageBlock(outB) && hasMarkerText(outB))
  check('B2: 新会话回落 options：reminder 注入保持', hasReminder(outB))

  // C. 控制组：wrapper 分支纯文本（G4 同型）→ 不改写（防双改写）+ reminder 注入。
  const outC = await run(
    {
      options: { provider: `text-only-prov${WRAP_SUFFIX}`, model: 't1' },
      session: { requestHeader: () => ({ config: { provider: `text-only-prov${WRAP_SUFFIX}`, model: 't1' } }) },
    },
    imgPlusText(),
  )
  check('C1: wrapper 分支纯文本：image 块保留（无消息层改写）', hasImageBlock(outC))
  check('C2: wrapper 分支纯文本：reminder 注入保持', hasReminder(outC))
}

// D. 模型侧适配仍发生：prestep 保留的原始消息流经 wrapper stream →
//    委托请求无裸 image 块（输入层改写，F3 解耦）。
console.log('fix-010 model-side adaptation (wrapper stream still rewrites):')
{
  const root = new Context()
  const llm = new LlmRuntime(root)
  const delegateCalls = []
  llm.registerAdapter(['text-provider'], makeTextAdapter(delegateCalls))
  installAdmissionWrapper(root, fakeService)
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  await tick()

  // 复用 A 场景的 prestep 输出（image 块保留）→ 喂给 wrapper 路由 stream。
  const run = installPrestepHarness(fakeService)
  const preserved = await run(
    {
      options: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      session: { requestHeader: () => ({ config: { provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1' } }) },
    },
    imgPlusText(),
  )
  const userMessages = preserved.filter((m) => m.role === 'user')
  for await (const chunk of llm.stream({ provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1', system: undefined, messages: userMessages })) {
    if (chunk.type === 'finish') var finishReason = chunk.reason
  }
  const lastCall = delegateCalls[delegateCalls.length - 1]
  const delegateHasBareImage = Array.isArray(lastCall?.messages) && lastCall.messages.some((m) => Array.isArray(m.content) && contentHasImage(m.content))
  check('D1: prestep 保留的图片消息流经 wrapper → 委托请求无裸 image 块（模型面适配）', finishReason?.kind === 'stop' && !delegateHasBareImage)
  check('D2: 委托请求 user 消息非空（image-solo 契约不回归）', Array.isArray(lastCall?.messages) && lastCall.messages.some((m) => Array.isArray(m.content) && m.content.length > 0))
}

console.log(failures === 0 ? '\nALL FIX-010 DISCRIMINANT TESTS PASSED' : `\n${failures} FIX-010 ASSERTION(S) FAILED (RED — fix pending)`)
process.exit(failures === 0 ? 0 : 1)
