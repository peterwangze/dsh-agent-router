// FIX-009 判别测试：image-solo 请求体合法性 + 4xx 快速失败（TDD——先红后绿）。
//
// 根因链（RCA 实采，2026-08-30）：
//   用户只发图片（无文本）→ 主 agent 在 wrapper 路由（如 glm-router/glm-5.3
//   纯文本模型）→ wrapper stream 深改写把图片块整体移除（rewrite: () => null）
//   → 原 user message content 变空 [] → 下游 pi-ai 序列化 {role:'user',
//   content:''} → GLM 端点 400 {"code":"1213","message":"未正常接收到prompt参数。"}。
//   会话实证（~/.dsh/sessions/...ec6b01b0）：turn 15/16 image-solo 均在 330ms
//   内以 400/1213 INVALID_REQUEST 失败。
//
// 判别断言：
//   A. image-solo 经 wrapper 改写后，委托方的 user message 必须非空
//      （旧实现产生 content:[] → 本断言必败 = 红）；
//   B. image+text 双路径控制组：改写后保留文本块 → 非空（绿）；
//   C. 4xx 快速失败：runChat 遇 400/INVALID_REQUEST 桩错误只调用一次
//      llm.stream（不重试不重发），错误带 provider/model 诊断。
//
// 门控：本文件独立运行（node tests/fix-009-image-solo.mjs），exit 0 全绿；
// 修复 wrapper.js 后 A 转绿即可并入 smoke 门控。
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, contentHasImage } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import { installAdmissionWrapper, WRAP_SUFFIX, IMAGE_SOLO_PLACEHOLDER } from '../lib/wrapper.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(label, condition) {
  if (condition) console.log(`  ok  ${label}`)
  else { failures++; console.error(`FAIL  ${label}`) }
}

// P2-2（REL-005，review-FIX-009-R0）：DSH_HOME 用系统临时目录 mkdtemp 隔离
// （原固定相对路径 `.tmp-fix009-home` 无清理、.gitignore 未覆盖），结束经
// finally 兜底删除；.gitignore 补 `.tmp-fix0*-home/` 作残留防御。
const fix009Home = mkdtempSync(join(tmpdir(), 'dsh-router-fix009-'))
process.env.DSH_HOME = fix009Home

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

try {
console.log('fix-009 image-solo request body (RED on current code):')
{
  const root = new Context()
  const llm = new LlmRuntime(root)
  const delegateCalls = []
  llm.registerAdapter(['text-provider'], makeTextAdapter(delegateCalls))
  const fakeService = {
    isEnabled: () => true,
    getState: () => ({ enabled: true, takeoverDefaultModel: false }),
    listImageVisionAgents: () => [['vision', { name: '视觉', type: 'chat', enabled: true, capabilities: ['image'] }]],
    listImageGenerationAgents: () => [],
  }
  installAdmissionWrapper(root, fakeService)
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  await tick()

  // A. image-solo：用户只发图片（无文本）。wrapper 改写后委托消息必须含非空
  //    content（旧实现整体移除图片块 → content:[] → 端点 400/1213）。
  const solo = createUserMessage({ content: [{ type: 'image', attachment: { attachmentId: 'sha256:solo', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'solo.png' } }], source: { kind: 'user' } })
  const soloAssembler = { finish: { kind: 'pending' } }
  for await (const chunk of llm.stream({ provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1', system: undefined, messages: [solo] })) {
    if (chunk.type === 'finish') soloAssembler.finish = chunk.reason
  }
  const soloCall = delegateCalls[delegateCalls.length - 1]
  // 契约不变量（修复目标）：委托请求中不存在空 content 的 user 消息，且
  // 整体请求含至少一个非空 text part——下游端点（GLM 400/1213 实证）与
  // deepseek/pi-ai 适配器都要求 user 消息内容非空。image-solo 注入精确
  // 占位文案（IMAGE_SOLO_PLACEHOLDER，行为指令形态、不含图片内容）。
  const soloMessages = Array.isArray(soloCall?.messages) ? soloCall.messages : []
  const emptyUserMessage = soloMessages.some((message) => message?.role === 'user' && Array.isArray(message.content) && message.content.length === 0)
  const hasNonEmptyText = soloMessages.some((message) => Array.isArray(message.content) && message.content.some((block) => block.type === 'text' && block.text && block.text.trim().length > 0))
  const soloPlaceholderInjected = soloMessages.some((message) => Array.isArray(message.content) && message.content.some((block) => block.type === 'text' && block.text === IMAGE_SOLO_PLACEHOLDER))
  check('A1: image-solo turn completes (wrapper delegates)', soloAssembler.finish?.kind === 'stop')
  check('A2: no user message with empty content reaches the delegate (RED: currently [])', soloMessages.length > 0 && !emptyUserMessage)
  check('A3: request carries a non-empty text part (prompt contract)', hasNonEmptyText)
  check('A4: image-solo injects exact placeholder text', soloPlaceholderInjected)

  // B. image+text 双路径回归：有文本时改写保留文本 → 非空（旧实现已绿）。
  const duo = createUserMessage({ content: [{ type: 'text', text: '看图' }, { type: 'image', attachment: { attachmentId: 'sha256:duo', mediaType: 'image/png', bytes: 4, width: 2, height: 2, name: 'duo.png' } }], source: { kind: 'user' } })
  for await (const chunk of llm.stream({ provider: `text-provider${WRAP_SUFFIX}`, model: 'brain-1', system: undefined, messages: [duo] })) {}
  const duoCall = delegateCalls[delegateCalls.length - 1]
  const duoContent = Array.isArray(duoCall?.messages?.[0]?.content) ? duoCall.messages[0].content : null
  check('B1: image+text delegate keeps text part', Array.isArray(duoContent) && duoContent.some((block) => block.type === 'text' && block.text === '看图'))
  check('B2: image+text delegate has no raw image block', Array.isArray(duoContent) && duoContent.every((block) => block.type !== 'image'))
}

// C. 4xx 快速失败：runChat 遇 400/INVALID_REQUEST 桩 → 单次调用、错误带诊断。
console.log('fix-009 4xx fast-fail (no retry):')
{
  const { RouterService } = await import('../lib/service.js')
  const root = new Context()
  let streamCalls = 0
  const failingLlm = {
    async *stream() {
      streamCalls += 1
      const error = new Error('400: {"code":"1213","message":"未正常接收到prompt参数。"}')
      error.code = 'INVALID_REQUEST'
      throw error
    },
    async resolveModelInfo() { return { inputModalities: ['text'] } },
    listConfigurableProviders: async () => [],
    registration() { return { adapter: { resolveModel: async () => ({ inputModalities: ['text'] }) } } },
  }
  root.provide('llm', failingLlm)
  root.provide('settings', { describe: () => [] })
  const service = new RouterService(root)
  service.attach({ get: () => ({ agents: { vision: { name: 'vision', type: 'chat', enabled: true, capabilities: ['image'], provider: 'fake-provider', model: 'fake-model' } }, enabled: true }) })
  let caught = null
  try {
    await service.run({ agentId: 'vision', task: '识别', extra: '', images: [] })
  } catch (error) {
    caught = error
  }
  check('C1: 400 INVALID_REQUEST surfaces as error (not swallowed)', !!caught)
  check('C2: 400 INVALID_REQUEST calls llm.stream exactly once (no retry)', streamCalls === 1)
  check('C3: error message carries provider/model diagnosis', !!caught && /fake-provider\/fake-model/.test(caught.message) && /400/.test(caught.message))
}

console.log(failures === 0 ? '\nALL FIX-009 DISCRIMINANT TESTS PASSED' : `\n${failures} FIX-009 ASSERTION(S) FAILED (RED — fix pending)`)
} finally {
  // P2-2（REL-005）：临时 DSH_HOME 兜底清理（正常/异常退出均执行）。
  try { rmSync(process.env.DSH_HOME, { recursive: true, force: true }) } catch { /* 清理失败忽略：.gitignore 兜底 */ }
}
process.exit(failures === 0 ? 0 : 1)
