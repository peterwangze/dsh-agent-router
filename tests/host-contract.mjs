/**
 * EVO-024（ARCH-004 设计 §5.1(a) D3 静态层 / §10 B6 收官批）：宿主面契约静态看护体系。
 *
 * 定位：D3 三层防线的最外一层（静态层）——**不依赖宿主 checkout 存在**。
 * 宿主面基线与源码锚点以「静态常量 + 宿主源码锚（包名/文件/符号）」冻结（先例
 * tests/host-version-snapshot.mjs 的 HOST_BASELINE_REGISTRY 主基线项），因此本套件
 * 在用户侧 / 异构 CI 环境（BR-03：插件装在别处、宿主 cache 路径漂移）同样可跑；宿主
 * checkout 可达时（环境变量 DSH_HOST_SOURCE / DSH_HOST_PACKAGES 优先，**npm 全局树**
 * 探测 [%APPDATA% 路径 + `npm root -g` 兜底——ARCH-005 R0 修 F-A：宿主 0.2.0 起经
 * npm 全局安装供给，旧 `_npx` 候选链对 0.2.0 树失明]，本地 _npx 缓存降序兜底）
 * 追加 S7 增强靶子组：直读宿主源码逐字核验常量（缺失只记 skip，
 * 不失败）。靶子解析为**单一实现路径**且**确定性**（同类多候选共存时按声明序/
 * 目录名降序取首命中——readdirSync 顺序非契约，非确定性选择会把 RISK-003 预警指向非
 * 运行宿主副本，产生不可复现的假红/假绿），并在启动行打印实际读取路径（可诊断）。
 * 同一靶子同时供 S3 宿主侧包表半边使用（设计 §5.1(a)「inject 声明 vs 宿主
 * node_modules 实际包表」——插件自身 node_modules 不含 client inject 包）。
 *
 * 与 §6.1 诊断环形的边界（设计明文）：本文件是**静态守卫**——只读源码、声明面
 * 与契约形状常量，**不重复运行时探测**（面存在性 = D4 probe / failsafe 环形；
 * 调用期自证 = host-abi 域 guard；行为 parity = tests/host-abi-health.mjs §7）。
 *
 * 五守卫（设计 §5.1 第 1-5 条）：
 *  S1 契约快照四类面：llm 适配器契约（含 twin + oauth-llm 枚举，复用
 *     adapter-parity F2 动态枚举模式）/ 宿主协议对象导出面 / remote 面方法形状
 *     （CLIENT_REMOTE_FACES）/ ctx 服务面（CTX_SERVICES）/ 转发事件白名单（28 项）
 *  S2 宿主源码形状锚点（P10-④：桩形态锚定宿主源码；高风险非导出面以形状
 *     签名断言，宿主漂移即红）
 *  S3 声明面比对：package.json `dsh.client.inject` + peerDeps 8 项 vs
 *     inject-manifest.js 代码侧常量；fiber inject 名单 vs 域面；cordis.patch.yml
 *     两宿主行 id 存在性（宿主对不存在条目仅 stderr 警告——静默面守卫）；
 *     **宿主侧包表半边**：inject 三 client 包 vs 宿主 `@deepseek-ai` 实际包表
 *     （设计 §5.1(a)；插件侧 node_modules 不含这些包，故只能在宿主靶子上核验，
 *     宿主不可达 → 与 S7 同语义 skip）
 *  S4 消费点黑名单：高危面名禁域模块外裸 ctx.get（白名单分级放行 = B4 §8a
 *     快照口径）；**域管事件名**（MANAGED_EVENTS）禁域外裸 ctx.on（scoped
 *     生命周期钩子 agent/pre-step、agent/created、agent/request 直订合法）
 *  S5 字段级 wire schema 白名单断言（S-5）：消费字段 ⊆ 宿主 schema 字段
 *     （锚 dsh-api-remotes 的 lib/client.js 六 schema——逐面宿主符号见 WIRE_SCHEMA_WHITELIST 的 anchor 字段，S7 增强组按该符号定位宿主源码）
 *  S6 转发事件白名单静态比对（W-4）：客户端转发面订阅事件名 ⊆ 白名单 +
 *     镜像值级 parity + Node 面 ctx.on 事件名 ⊆ {域管事件, scoped 钩子}
 *
 * FIX-055 增补组（REVIEW-FIX-054-R0 P2-1/P3-1/P3-2 + FIX-055-R0 P2-1/P2-2/P3-1/P3-2/P3-3 收口）：
 *  S8 宿主 v4 **row admission（写入面守卫）**：直连宿主模块
 *     `assertV4RowAdmission`（一手入口）——`buildReminderMessage` 产出的 user/message
 *     行必须被接受；`source.kind='plugin'` 必须被拒且错误含 `producer-owned source
 *     kind`。**边界**：该入口仅在 `kind==='plugin'` 时调 `source()`（宿主 :142-152），
 *     正向 `plugin:dsh-agent-router` 不触发逐消息准入 ⇒ S8 仅证明该行在入口/恢复
 *     判据上不被拒，**不单独构成 source() 受理证据**（由 S8b 承担）。
 *  S8b 宿主 v4 **logical admission（逐消息 source() 准入）**：直连宿主已导出的
 *     `assertReleasedV4Relationships(artifact, knownEventTypes)`（0.2.1-rc.2 定义
 *     :1027-1042、导出 :1552）——经 `assertV4MessageSources`（:132-137）对每条已知
 *     事件消息执行 `source()`：最小 v4 artifact（events=[reminder user/message 行 +
 *     surfaceOp:'append']）正向必须通过；kind 缺失 / kind 空串 / kind='plugin'（带
 *     旧完整形状 `{kind,plugin}`）三负向控制必须各自被拒。
 *     基线感知（S8/S8b 共用单点解析）：since=0.2.1（v4 会话格式定型代际）——0.2.0/
 *     0.1.5 记可见 skip。**缺包语义（FIX-055-R0 P2-2）**：完整宿主树（本机 npm 全局
 *     树，origin='npm-global(...)'）缺 v4 包 = **红**（完整安装不应缺）；显式/部分树
 *     （DSH_HOST_SOURCE / DSH_HOST_PACKAGES / _npx）缺包 = 可见 skip 带原因。
 *  S9 插件名单源守卫（P3-2 + FIX-055-R0 P3-2/P3-3）+ 宿主锚守卫（P3-1）：
 *     package.json name === lib/index.js 注册名 === cordis.patch.yml 两宿主行插件名
 *     === install.ps1 `$script:PluginName` === install.sh `PLUGIN` === lib/prestep.js
 *     PLUGIN_NAME（import 实模块，不复制字面量；YAML 解析支持形态见 9a 注释）。
 *     lib/prestep.js 注释引用的每个宿主锚按「行号窗口 + 内容模式」在实装宿主文件内
 *     看护（锚行号 = 0.2.1-rc.2 实读、随下方 1b 步骤维护；窗口吸收补丁级挪行；模式
 *     移出窗口即红 → 人工复核注释/基线后刷新）。
 *
 * **CI 覆盖口径（FIX-055-R0 P2-2）**：guard-matrix pinned 宿主树 = 恰好
 * HOST_KEY_PACKAGES 8 包，不 pin v4/persistence——`dsh-session-format-v3-to-v4` 在
 * registry 无 0.1.5-rc.2 发行版（最早 0.1.7-alpha.1），纯增量 pin 会在 0.1.5 矩阵 job
 * 的 `npm pack` 失败；条件 pin 需 yaml 矩阵分支或注册表新字段（超出本批授权面）。
 * 故真实 v4 admission 的 CI 覆盖 = 仅在包在场的树（本机完整树）执行；CI pinned 树
 * 以可见 skip 回显、不红——如需 CI 覆盖，先按基线扩展 pin 机制（注册表驱动、无
 * 版本字面量）再收紧本文件 skip 判据。
 *
 * 判别性（红/绿演示——EVO-024 验收各附红→绿实证；演示用临时改动已全部复原，不入提交）：
 *  1. 黑名单：往消费者加一行裸 `ctx.get('sessionController')` → S4 红（分级放行
 *     越界：sessionController 白名单计数 0）；
 *  2. 白名单：往 lib/client.js 转发订阅面加一个白名单外事件名 → S6 红；
 *     往任意 lib/*.js 加裸 `ctx.on('settings/updated', …)` → S4 域管事件守卫红；
 *  3. 字段断言：从 S5 的 schema 白名单删一个被消费字段（如 listConfigurableProviders
 *     的 `declared`）→ 字段断言红（消费字段 ⊆ 白名单被击穿）；
 *  4. 声明面：改 package.json inject / peerDeps 或删 cordis.patch.yml 一行 id → S3 红；
 *  5. 宿主侧包表半边：DSH_HOST_SOURCE 指向缺少任一 inject client 包的宿主 root → S3
 *     宿主侧断言红（宿主 checkout 可达时；
 *     见 FIX-036 实证——临时 root = 宿主关键文件副本 + 缺一个 client 包 → 红）。
 *
 * 如何刷新本套件（宿主升级后，与 host-version-snapshot 刷新步骤同步执行）：
 *  1. 以宿主 checkout 实读核验本文件各 *_BASELINE / WIRE_SCHEMA / ANCHOR 常量
 *     （S2/S5/S7 锚点按宿主实读核验的包名/文件/符号更新——FIX-043 批 A 已去行号；
 *     FIX-055 新增的宿主行号锚（S9b）为 0.2.1-rc.2 实读行、随 1b 步骤维护）；消费字段漂移则同步更新
 *     对应域模块（lib/host-abi/*.js）与浏览器镜像（lib/client.js）——镜像
 *     parity 由 S1c/S5 双向锁定；
 *  1b. FIX-055 面同步刷新：S8 的基线代际判据（since=0.2.1）随 v4 会话格式代际更新；
 *     S9b 的锚行号/内容模式按 lib/prestep.js 注释引用行实读核验（行号漂移由窗口吸收，
 *     模式移出窗口即红）；宿主导入面变更时同步 prestep.js 注释锚。
 *  2. 跑 `node tests/host-contract.mjs` 确认绿，再跑全量门控 `node tests/run-all.mjs`。
 *
 * 基线参数化（ARCH-005 R3——看护矩阵化，设计 §2-B 四维-c / §6 R3 行）：
 *  - 版本数据**单源消费** HOST_BASELINE_REGISTRY（tests/host-version-snapshot.mjs 文本
 *    提取——该文件为独立入口不可 import；R0 批曾持 HOST_VERSION_BASELINE 副本 + 机器
 *    锁定「主基线项相等」，R3 起随参数化**删除副本**：提取/选择失败即红并收口退出，
 *    「刷新漏改副本」的漂移面从机制上消失，P5）；
 *  - `DSH_BASELINE` 环境变量选择**目标基线**（值 = 档案 id（'0.1.5'/'0.2.0'）或 status
 *    关键词（'frozen'/'primary'）；未设/空白 = 默认 primary——本地默认行为不变）。
 *    选择只作用于**靶子面**：版本一致性判据（FIX-037 ③）与 S7/S5/S2 的**宿主侧**判据
 *    按所选基线档案项判定；**声明面**判据（S3 的覆盖判据 declaredRangeCovers 等）恒取 primary
 *    项——frozen 选择不放松声明面（与 host-version-snapshot F-1 收紧同族纪律）；
 *  - 锚/S5 条目 `since` 字段成文分代（R3 交付②，与 R0 白名单逐项 since 注记同族）：
 *    条目当前形态定型于哪代基线；所选基线**低于**条目 since 时该条目的宿主侧判据记
 *    **可见 skip**（非静默——如 frozen 基线下 agentPresets.list 的 {presets} 白名单
 *    形态〔0.2.0 收缩定型〕对 0.1.5 树合法不同），静态/插件面判据不受影响恒跑；
 *  - S7 7a 的期望集按**逐事件 since**（lib/host-abi/events.js 镜像数组行内注记——R0
 *    登记形态）分代过滤：所选基线低于事件 since 时该事件不入期望集（0.1.5 表 19 项 ⊂
 *    镜像 28 项在 frozen 基线下判 19 ⊆ 19）；宿主侧超集照旧绿 + 打印增量，消费项除名即红。
 *
 * 独立入口：node tests/host-contract.mjs（exit 0/1）。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { LlmAdapter, BlockAssembler } from '@deepseek-ai/dsh-llm'
import * as dshMessage from '@deepseek-ai/dsh-llm/message'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createWrapAdapter } from '../lib/wrapper.js'
import { createOauthAdapter } from '../lib/oauth-llm.js'
import { RouterService } from '../lib/service.js'
import { CLIENT_REMOTE_FACES, createClientRemotes } from '../lib/host-abi/client-remotes.js'
import { CTX_SERVICES, ctxServiceFaceProbes } from '../lib/host-abi/ctx-services.js'
import { FORWARDED_EVENT_ALLOWLIST, isForwardedEvent, MANAGED_EVENTS } from '../lib/host-abi/events.js'
import { CLIENT_PACKAGE_INJECT, FIBER_INJECT } from '../lib/host-abi/inject-manifest.js'
import { buildReminderMessage, PLUGIN_NAME } from '../lib/prestep.js'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── 计数与断言工具（rpc-shadow-guard.mjs 独立入口风格：check() + exit 0/1）────
let failures = 0
let passed = 0
let skipped = 0
const check = (label, condition, detail) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else {
    failures++
    console.error(`FAIL  ${label}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}
const note = (label) => { skipped++; console.log(`  --  ${label}`) }
const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const readLib = (name) => readFileSync(join(ROOT_DIR, 'lib', name), 'utf8')
const readHostAbi = (name) => readFileSync(join(ROOT_DIR, 'lib', 'host-abi', name), 'utf8')
const readTest = (name) => readFileSync(join(ROOT_DIR, 'tests', name), 'utf8')

/** 注释剥离（偏移量保持：注释字符换空格、换行保留）——host-abi-health.mjs 同法。 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (line) => line.replace(/[^\n]/g, ' '))

/** 取以 startMarker 开头、花括号配对的代码块（先剥注释——块内注释含花括号不误判）。 */
const blockOf = (source, startMarker) => {
  const start = source.indexOf(startMarker)
  if (start < 0) return ''
  let depth = 0
  let opened = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (char === '{') { depth += 1; opened = true } else if (char === '}') {
      depth -= 1
      if (opened && depth === 0) return source.slice(start, index + 1)
    }
  }
  return source.slice(start)
}

/** 取以 startMarker 定位、方括号配对的数组字面量（注释须先剥离）。 */
const arrayOf = (source, startMarker) => {
  const start = source.indexOf(startMarker)
  if (start < 0) return ''
  const open = source.indexOf('[', start)
  if (open < 0) return ''
  let depth = 0
  for (let index = open; index < source.length; index++) {
    const char = source[index]
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open, index + 1)
    }
  }
  return ''
}

/** 从代码块按正则提取消费字段（去重排序——动态提取，非手抄）。 */
const fieldsIn = (block, pattern) => [...new Set([...block.matchAll(pattern)].map((match) => match[1]))].sort()

/**
 * S2/S5「对象归属声明」**完备性**判据（FIX-043 批 E / R1 P1-1 收口；先例 = host-abi-health.mjs §9h-3
 * 「入表完备性」）。由来：`expectPackage` / `expectFile` / `expectSymbol` 是**判据自身的声明面**——
 * 缺失时下游 `?? []` 归一使新判据**平凡满足**（R1 变异 M-B5 实证：删三字段 ⇒ exit 0 fail-open）。
 * 本函数把「未声明 / 空数组 / 类型畸形」变为**判红**，使「静默省略」不再等价于「通过」。
 * 返回空数组 = 声明完备。**非恒真谓词**：删任一字段 / 置空 / 改类型即非空（M-B5 同形变异判红）。
 */
const declarationGapsOf = (spec) => {
  const gaps = []
  if (typeof spec.expectPackage !== 'string' || spec.expectPackage.trim() === '') gaps.push('expectPackage')
  for (const field of ['expectFile', 'expectSymbol']) {
    const value = spec[field]
    if (!Array.isArray(value) || value.length === 0 || value.some((token) => typeof token !== 'string' || token.trim() === '')) gaps.push(field)
  }
  return gaps
}

/**
 * S2 专用：宿主符号 → 宿主文件映射（`expectSymbolHost`）的完备性 + **字段间自洽**。
 * 该映射是「宿主符号可达性」核验的唯一输入 ⇒ 缺失/畸形即判红；且它 MUST 与 `expectFile` /
 * `expectSymbol` 自洽（映射文件 ∈ expectFile；映射符号并集 === expectSymbol）——否则符号可只在
 * `expectSymbol` 里声明而**逃逸宿主核验**（与 R1 M-B3「字段与锚脱钩」同族的静默面）。
 */
const symbolHostGapsOf = (spec) => {
  const gaps = []
  const hostMap = spec.expectSymbolHost
  const malformed = !Array.isArray(hostMap) || hostMap.length === 0
    || hostMap.some((entry) => typeof entry?.file !== 'string' || entry.file.trim() === ''
      || !Array.isArray(entry.symbols) || entry.symbols.length === 0
      || entry.symbols.some((token) => typeof token !== 'string' || token.trim() === ''))
  if (malformed) return ['expectSymbolHost']
  if (hostMap.some((entry) => !(spec.expectFile ?? []).includes(entry.file))) gaps.push('expectSymbolHost.file∉expectFile')
  const mapped = [...new Set(hostMap.flatMap((entry) => entry.symbols))].sort()
  const declared = [...new Set(spec.expectSymbol ?? [])].sort()
  if (mapped.join('|') !== declared.join('|')) gaps.push('expectSymbolHost.symbols≠expectSymbol')
  return gaps
}

// ── 冻结基线（唯一事实源 = 宿主 checkout 只读实读；刷新步骤见文件头）──────────
/** llm 适配器契约（宿主 dsh-llm 的 LlmAdapter 类原型；六方法符号见下方基线常量，S7 增强组按方法名逐字核验）。 */
const LLM_ADAPTER_PROTO_BASELINE = ['providerInfo', 'providerRetryPolicy', 'imageRequestPricing', 'listModels', 'resolveModel', 'prepareCall']
/** 静态补集：stream 为抽象声明（不在 LlmAdapter.prototype，FIX-001b F2 先例）。 */
const ADAPTER_CONTRACT_BASELINE = [...LLM_ADAPTER_PROTO_BASELINE, 'stream']
/** 宿主协议对象导出面（dsh-llm/message 导出名——宿主 lib/message.js 实读 8 项）。 */
const MESSAGE_EXPORTS_BASELINE = ['CONTEXT_SUMMARY_MAX_CHARS', 'boundContextSummary', 'createAssistantMessage', 'createMessage', 'createSystemMessage', 'createToolResultMessage', 'createUserMessage', 'freezeMessage']
/** BlockAssembler 原型面（宿主 dsh-llm 的 BlockAssembler 原型 11 项；本包消费 push/usage/finish/blocks——lib/service.js 的 assembler.push/usage/finish/blocks 消费块）。 */
const BLOCK_ASSEMBLER_PROTO_BASELINE = ['push', 'ensure', 'assemble', 'mustGet', 'assembled', 'blocks', 'interruptedBlocks', 'usage', 'finish', 'replayState', 'message']

/**
 * 宿主基线档案（ARCH-005 R3——P5 单源：**文本提取**消费权威注册表，无版本常量副本）。
 * 权威 = `tests/host-version-snapshot.mjs` 的 `HOST_BASELINE_REGISTRY`（该文件为独立入口
 * 〔顶层执行 + `process.exit`〕不可 import 复用——R0 批曾持 HOST_VERSION_BASELINE 副本 +
 * 「主基线项相等」机器锁定；R3 起随基线参数化删除副本：下方提取/选择失败即**判红收口退出**
 * 〔fail-closed，先例 host-version-snapshot 的 F-3 前置优雅判红〕，「刷新漏改副本」的漂移面
 * 从机制上消失）。宿主升级后按该文件头注释刷新（R3 起刷新点不含本文件版本常量——已无副本）。
 * 用途：①primaryBaseline = 主基线项（声明面覆盖判据 declaredRangeCovers 的判据值 / S3 派生）；②
 * targetBaseline = DSH_BASELINE 所选**目标基线**（靶子面判据：版本一致性〔FIX-037 ③〕
 * + S7/S5/S2 宿主侧判据按档案项与条目 since 分代）——选择规则与 host-version-snapshot §0b
 * 一致：值 = 档案 id 或 status 关键词，未设/空白 = 默认 primary（本地默认行为不变），
 * 未知值即红（P8：基线切换失败可观测，不静默回退默认）。
 */
const HOST_BASELINE_REGISTRY = (() => {
  const literal = arrayOf(stripComments(readTest('host-version-snapshot.mjs')), 'const HOST_BASELINE_REGISTRY = Object.freeze(')
  if (!literal) return null
  try {
    const parsed = new Function(`return ${literal}`)()
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch { return null /* 提取失败 → 下方判据红（fail-closed） */ }
})()
const primaryBaseline = HOST_BASELINE_REGISTRY?.find((entry) => entry?.status === 'primary') ?? null
const DSH_BASELINE_RAW = String(process.env.DSH_BASELINE ?? '').trim()
const targetBaseline = DSH_BASELINE_RAW === ''
  ? primaryBaseline
  : HOST_BASELINE_REGISTRY?.find((entry) => entry?.id === DSH_BASELINE_RAW || entry?.status === DSH_BASELINE_RAW) ?? null
// 提取与选择的 fail-closed 判据（先例 host-version-snapshot F-3——提取失败时版本一致性
// 判据与声明面覆盖判据均失去数据源，继续跑只会产出失真结论，故显式判红后收口
// 退出，不静默降级——P8）。
{
  const registryShapeOk = Array.isArray(HOST_BASELINE_REGISTRY)
    && HOST_BASELINE_REGISTRY.every((entry) => ['id', 'status', 'dsh', 'dshPackages'].every((key) => typeof entry?.[key] === 'string' && entry[key].trim() !== ''))
  check('基线档案: HOST_BASELINE_REGISTRY 自 host-version-snapshot.mjs 文本提取成功且形态完备（ARCH-005 R3 单源消费——无版本常量副本可漏改；提取失败即红）',
    registryShapeOk, { extracted: HOST_BASELINE_REGISTRY })
  const primaryCount = Array.isArray(HOST_BASELINE_REGISTRY) ? HOST_BASELINE_REGISTRY.filter((entry) => entry?.status === 'primary').length : -1
  check('基线档案: 注册表恰一 primary 项（主基线锚定——声明面/版本判据的数据前提；R0 批「基线副本」机器锁定的 R3 后继形态）',
    primaryCount === 1, { primaryCount })
  check(`基线选择: DSH_BASELINE=${DSH_BASELINE_RAW || '<unset → primary>'} 解析为在册基线（值 = 档案 id / status 关键词；未知值即红——P8 基线切换失败可观测）`,
    targetBaseline !== null, { valid: (HOST_BASELINE_REGISTRY ?? []).map((entry) => `${entry?.id}/${entry?.status}`) })
  if (!registryShapeOk || primaryCount !== 1 || targetBaseline === null) {
    console.error(`\n${failures} FAILURE(S) (${passed} passed) — 基线档案提取/选择失败，收口退出（fail-closed：后续判据失去可信数据源，不产出失真结论）`)
    process.exit(1)
  }
}
/**
 * 基线代际比较（since 分代判定的谓词）：`since` 取档案 id 形态（'0.1.5'/'0.2.0'/
 * '0.2.1'）或逐事件注记的完整版本（'0.1.5-rc.2'/'0.2.1-rc.2'）——按 major.minor.**patch**
 * 数值序比较，预发布后缀不参与（0.1.5 与 0.1.5-rc.2 同代，与 R0 白名单注记口径一致）。
 * ARCH-006 精化：注册表出现同 minor 的相邻档案项（0.2.0/0.2.1）后，仅比 major.minor
 * 会把「定型于 0.2.1 的条目」误判为「0.2.0 也适用」⇒ 比较升级为三元组（既有全部
 * since/档案项组合的判定结果不变——此前不存在仅 patch 不同的组合；0.2.1-rc.2 定型
 * 条目对 0.2.0/0.1.5 基线记可见 skip 不误红）。
 */
const versionTripleOf = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version))
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0]
}
const baselineIncludes = (since) => {
  const [a, b] = [versionTripleOf(since), versionTripleOf(targetBaseline.id)]
  return a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] <= b[2])))
}
/**
 * 版本一致性判据的关键包 = `dsh` CLI + **S7 直读包**（`dsh-api-remotes` /
 * `dsh-api-session-controller` / `dsh-client-ui-model-selection` / `dsh-llm` /
 * `dsh-client-ui-conversation`——FIX-048 增 InputState 形状锚同族靶子）+ **S3 判据两包**
 * （`dsh-client-ui-settings` / `dsh-client-locale`；`dsh-api-remotes` 为 S3/S7 共用）——
 * R0 P2-2 点名场景「早于 `dsh-client-ui-settings` 的旧缓存副本使 S3 半边报红而版本判据
 * 仍打绿」由此同源可判（FIX-037 R0 P2-2 收口）。
 */
const HOST_KEY_PACKAGES = ['dsh', 'dsh-api-remotes', 'dsh-api-session-controller', 'dsh-client-ui-model-selection', 'dsh-client-ui-conversation', 'dsh-llm', 'dsh-client-ui-settings', 'dsh-client-locale']

/** remote.* 面方法形状基线（宿主 dsh-api-remotes TYPERT_REMOTE 描述符实读；域内 CLIENT_REMOTE_FACES 为代码侧权威）。 */
const CLIENT_REMOTE_FACES_BASELINE = {
  llm: ['listProviders', 'listConfigurableProviders', 'discoverModels'],
  settings: ['describe', 'mutate'],
  credentials: ['describe', 'set', 'unset'],
  agentPresets: ['list'],
  session: ['modelCatalog', 'selectModel'],
}
/** Node 侧 ctx 服务面基线（§4.3 域 3 的 11 服务 × 方法形状契约）。 */
const CTX_SERVICES_BASELINE = {
  llm: ['registerAdapter', 'listModels'],
  credentials: [],
  settings: ['mutate'],
  fs: [],
  attachments: [],
  subagents: [],
  agentDefaultModel: ['currentSelection', 'saveSelection'],
  sessionController: ['selectModel'],
  sessionProjections: ['stateOf'],
  agents: ['get'],
  agentPresets: ['composedPreset'],
}
/**
 * 宿主转发事件白名单（宿主 dsh-api-remotes 的 lib/types/remote-events.js 事件表 28 项，逐字逐序；
 * ARCH-005 R0 随 0.2.0-rc.2 主基线登记刷新——19→27 纯增量；ARCH-006 随 0.2.1-rc.2 主基线
 * 登记刷新——27→28 纯增量（新增 plugin-market/changed），新增项与 lib/host-abi/events.js
 * 镜像同步（每项 since 注记在镜像侧）；S7 增强组经 API_REMOTE_FORWARDED_EVENTS 单向消费断言核验：
 * 镜像 ⊆ 宿主实读表，宿主侧超集绿 + 打印增量清单，宿主侧除名消费项即红）。
 */
const FORWARDED_EVENT_BASELINE = [
  'agent-preset/selected',
  'approval/request',
  'api-session/activity',
  'api-session/added',
  'api-session/error',
  'api-session/removed',
  'api-session/status',
  'commands/change',
  'deepseek-account/session-expired',
  'deepseek-account/model-sign-in-required',
  'credentials/record-updated',
  'credentials/reference-updated',
  'goal/activation-changed',
  'cordis/request-run',
  'cordis/request-run-resolved',
  'cordis/dynamic-package',
  'cordis/dynamic-retract',
  'cordis/inspect-query',
  'cordis/inspect-query-resolved',
  'llm/adapters-updated',
  'permission-presets/catalog-changed',
  'plugin-manager/changed',
  'plugin-manager/install-log',
  'plugin-manager/install-state',
  'plugin-market/changed',
  'settings/document-updated',
  'schedule/changed',
  'user-questions/request',
]
/** 客户端 inject 三包基线（@deepseek-ai/dsh-client-runtime 0.1.5 起宿主消亡，B0/D1-1 已删）。 */
const CLIENT_PACKAGE_INJECT_BASELINE = ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-api-remotes']
/** 客户端 fiber inject 九面基线（inject-manifest 域 FIBER_INJECT 镜像源 = lib/client.js inject 数组）。 */
const FIBER_INJECT_BASELINE = ['slots', 'locale', 'remote', 'remote.llm', 'remote.settings', 'remote.credentials', 'remote.agentPresets', 'remote.session', 'modelDirectories']
/** peerDeps 8 项宿主供给包（记录性声明口径 = 覆盖主基线的共同 ^ 范围——见上方 declaredRangeCovers，权威判据在 host-version-snapshot）。 */
const PEER_DEP_BASELINE = [
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-agent',
  '@deepseek-ai/dsh-agent-default-model',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-subagent',
  '@deepseek-ai/dsh-system-prompt',
  '@deepseek-ai/dsh-credentials',
]
/**
 * 声明面覆盖谓词（ARCH-006——F-2 / R0 承接的语义演进）：**文本提取**消费权威套件
 * host-version-snapshot.mjs 的 caretRangeContains（该文件为独立入口不可 import——与
 * 上方 HOST_BASELINE_REGISTRY 提取同纪律，P5 单源零第二份谓词拷贝）。声明面口径从
 * 「逐字 === ^primary.dshPackages」演进为「收敛同一 ^ 范围且**覆盖主基线** dshPackages」
 * （装载门 satisfies(includePrerelease) 镜像——^0.2.0-rc.2 ⊇ 0.2.1-rc.2，声明面零改动
 * 收编）；**恒取 primary 项**（不随 DSH_BASELINE 所选目标基线变——frozen 选择不放松
 * 声明面，与 host-version-snapshot F-1 同族纪律）。提取失败 → null → 下方 S3 判据红
 * （fail-closed，先例 HOST_BASELINE_REGISTRY 提取判据组）。
 */
const declaredRangeCovers = (() => {
  const block = blockOf(stripComments(readTest('host-version-snapshot.mjs')), 'function caretRangeContains(')
  if (!block) return null
  try { return new Function(`return ${block}`)() } catch { return null /* 提取失败 → S3 判据红（fail-closed） */ }
})()
/** cordis.patch.yml 两宿主行（宿主对不存在条目仅 stderr 警告——静默面守卫）。 */
const PATCH_ROWS_BASELINE = [
  { id: 'router', name: 'dsh-agent-router' },
  { id: 'tool-router', name: 'dsh-agent-router/tool' },
]

/**
 * 消费点分级白名单（B4 §8a 快照口径，精确计数——越界新增即红）。
 * 高危面（CONSUMER_BLACKLIST_FACES）禁域模块外裸 ctx.get：白名单只保留 B4
 * 冻结时点的遗留消费点（分级放行，非放行扩张）；fs/settings/router 为低危面直用。
 */
const CONSUMER_BLACKLIST_FACES = ['llm', 'credentials', 'agentDefaultModel', 'sessionController', 'sessionProjections', 'agents', 'agentPresets', 'modelDirectories', 'remote.*', 'remote.router', 'dynamic-inject', 'conversation', 'attachments', 'subagents']
const CONSUMER_BARE_CTX_GET_ALLOWLIST = {
  'service.js': { fs: 5, settings: 2 },
  'host-route.js': {},
  'wrapper.js': { agentDefaultModel: 1 },
  'prestep.js': { sessionProjections: 1, llm: 1 },
  'tool.js': { router: 3 },
  'preset-defaults.js': { agentDefaultModel: 1 },
  'client.js': { 'remote.*': 2, 'dynamic-inject': 1, 'remote.router': 3, conversation: 1, modelDirectories: 2 },
}
/** scoped 生命周期钩子（W-3 收窄口径：veto 语义 / 热路径零介入——直订合法，不在域管清单）。 */
const SCOPED_HOOK_EVENTS = ['agent/pre-step', 'agent/created', 'agent/request']

/**
 * S2 宿主源码形状锚点（P10-④）：高风险非导出面以「形状签名不一致即红」的
 * 静态常量 + 宿主源码锚实现（宿主 checkout 不可假设存在）。consumer 命中
 * 断言 = 该签名必须逐字仍在消费模块源码中（消费面形态漂移即红）；anchor
 * 断言 = 锚点必须带「宿主包名 + 宿主文件 + 宿主符号（调用式）」（禁心智模型式
 * 无锚常量；FIX-043 批 A 判定：原「路径:行号」形态去行号——宿主行号不可在本仓
 * 核验且必然漂移）。
 *
 * FIX-043 批 B（R0 P1-1 收口）：批 A + 批 B 的 anchor 判据是**格式谓词**
 * （任何 `/dsh-[a-z0-9-]+/` 包名 + 任意 `*.js|mjs|ts` 文件 + 任意调用式标识符
 * 都满足）⇒ 凭空捏造的锚（不存在的包/文件/符号）同样通过。故每条锚**声明其对象
 * 归属**——`expectPackage` / `expectFile` / `expectSymbol`（数组，逐项须在锚文本
 * 中逐字出现）；宿主可达时（与 S3/S7 共用 `hostTarget`，只读）再按**声明的包 ×
 * 声明的文件**做宿主文件存在性核验 ⇒ 锚对象不存在即红（fail-closed 的**有界**
 * 形态：宿主不可达时降级为 note，静态守卫不依赖宿主，BR-03 不变）。
 * **范围界定（不制造声明强度超事实）**：`expectSymbol` 只判「该符号名在锚文本中逐字在位」
 * （锚 = 人工刷新面）；宿主可达时按 `expectSymbolHost`（**符号 → 宿主文件**映射）逐符号核验
 * 「该符号逐字在其声明的宿主文件内」——覆盖面 = 映射内声明的符号（= `expectSymbol` 全集，字段间
 * 自洽由完备性判据机器锁定），**不声称**「锚文本内全部 token 都有对象」（face 1 的 anchor 另引
 * `projectionState.pending` 语义链，其宿主核验由 S7 7c 段的具名清单覆盖）。
 * FIX-043 批 E（R1 P3-2 收口）：anchor 内对 S7 判据的**引用渲染**统一为与 S7 逐字一致的**单引号**
 * 形态；下面两个 anchor 因此以**双引号定界**——单引号定界下 `\'` 转义使源文本不再逐字等同判据串，
 * 而 host-abi-health.mjs 的 9h R-1 fresh needle 是按**源文本**匹配的（P3-2 的引号差异即源于此）。
 *
 * ARCH-005 R3（交付②——since 分代成文，与 R0 白名单逐项 since 注记同族）：每条锚声明其
 * 当前形态**定型于哪代基线**（`since` = 档案 id；三锚均 ARCH-004 期定型于 0.1.5-rc.2 实读，
 * 0.2.0 复核存续）。所选目标基线（DSH_BASELINE）低于 since 时该锚的**宿主侧**判据（包×文件
 * 存在性 + 符号逐字在位）记可见 skip（分代判定——锚形态对更老宿主合法不同）；静态判据
 * （锚形态/声明完备性/消费签名）与所选基线无关恒跑。since 缺失或 ∉ 档案 id 集 → 下方
 * 「锚分代」判据红（fail-closed，防「静默省略 = 恒适用」——declarationGapsOf 同族）。
 */
const HOST_SHAPE_ANCHORS = [
  {
    face: 'sessionController.selectModel',
    since: '0.1.5',
    anchor: "dsh-api-session-controller 的 lib/index.js 的 selectModel(request) 面；语义锚 lib/types/agent.js 的 selectionFor(agent) → stateOf(session, 'modelSelection') → projectionState.pending（S7 增强组核验 selectionFor(agent) / stateOf(agent.session, 'modelSelection') / projectionState.pending 三项；selectModel 面不在 S7 判据内——由 lib/host-abi/llm-selection.js 消费面判据覆盖）",
    expectPackage: 'dsh-api-session-controller',
    expectFile: ['lib/index.js', 'lib/types/agent.js'],
    expectSymbol: ['selectModel(', 'selectionFor(', 'stateOf('],
    expectSymbolHost: [
      { file: 'lib/index.js', symbols: ['selectModel('] },
      { file: 'lib/types/agent.js', symbols: ['selectionFor(', 'stateOf('] },
    ],
    consumer: ['lib/host-abi/llm-selection.js'],
    signatures: ['controller.selectModel({ ...selection })', "get('sessionController')"],
  },
  {
    face: 'sessionProjections.stateOf(session, "modelSelection") → {lastUsed, pending}',
    since: '0.1.5',
    anchor: "dsh-api-session-controller 的 lib/types/agent.js：stateOf(session, 'modelSelection') → projectionState.pending（S7 增强组逐字核验）",
    expectPackage: 'dsh-api-session-controller',
    expectFile: ['lib/types/agent.js'],
    expectSymbol: ['stateOf(', 'projectionState.pending'],
    expectSymbolHost: [{ file: 'lib/types/agent.js', symbols: ['stateOf(', 'projectionState.pending'] }],
    consumer: ['lib/prestep.js'],
    signatures: ["stateOf(agent?.session, 'modelSelection')", 'state.pending'],
    // FIX-043 批 F（`:270` 保留项的逐处判定 → **维持保留**，理由如下；原址 `175d3e1:tests/host-contract.mjs` 的
    //   `:270` 经批 A 插入变更后现址 = 本 `extra` 行）：
    //   该签名锚为**判据承载锚**，不是「宿主锚无法符号化」类的无实证保留项——机器绑定结构 =
    //     · **机器锁 1**：本行（S2 的 needle 声明）；
    //     · **机器锁 2**：对象文件 `tests/fix-029-host-contract.mjs`（`:638-641` 对该文件**原文**做
    //       `includes()`，**不经** `stripComments` ⇒ 注释内的锚串同样受断言约束；单侧去行号即判红）；
    //     · **P5 收敛纪律锁**：`lib/prestep.js` 的同一串（**无**守卫绑定，实测 0 命中）——改锚 MUST 三处同步。
    //   处置依令：**先改判据再改锚**，且判据/对象侧均在 tests 面 ⇒ 本批不动该串。R4 §2.1 已独立复算谓词
    //   （现文 `[true,true]` / 假设去行号 `[false,true]`）。登记面 = `tests/host-abi-health.mjs` 的本文件条目 `notes`。
    extra: [{ file: 'tests/fix-029-host-contract.mjs', signatures: ['types/agent.js:297-318', "key === 'modelSelection'"] }],
  },
  {
    face: 'modelDirectories.directoryFor(sessionId).load()',
    since: '0.1.5',
    anchor: 'dsh-client-ui-model-selection 的 lib/types/client/service.d.ts 的 directoryFor(sessionId: SessionId): ModelDirectory 面；lib/types/client/directory.d.ts 的 ModelDirectoryState 与 load()（S7 增强组核验 directoryFor(sessionId: SessionId): ModelDirectory 一项）',
    expectPackage: 'dsh-client-ui-model-selection',
    expectFile: ['lib/types/client/service.d.ts', 'lib/types/client/directory.d.ts'],
    expectSymbol: ['directoryFor(', 'load('],
    expectSymbolHost: [
      { file: 'lib/types/client/service.d.ts', symbols: ['directoryFor('] },
      { file: 'lib/types/client/directory.d.ts', symbols: ['load('] },
    ],
    consumer: ['lib/host-abi/client-remotes.js'],
    signatures: ['directoryService.directoryFor(input.sessionId)', 'directory.load()'],
  },
]

/**
 * S5 字段级 wire schema 白名单（S-5）：消费字段 ⊆ 宿主 schema 字段。
 * schema.*  = 宿主 api-remotes 声明面字段（按 schema 符号实读）；
 * consumed  = 产品消费字段（dynamic 块动态提取——新增字段读取未经白名单即红；
 *             frozen 项为「域内整体透传 + 消费点在浏览器镜像按字段读」的显式声明）。
 * FIX-043 批 B（R0 P1-1 同批收口）：S5 锚逐条声明对象归属（`expectPackage` /
 * `expectFile` / `expectSymbol`，与 S2 同构）——宿主可达时按「声明的包 × 声明的
 * 文件」核验宿主文件存在性，并核验声明的 schema 符号确在宿主 `lib/client.js` 内
 * 出现（S5 的符号本就是宿主源码里的 `<面键>_result$schema` 声明，可逐字定位）。
 *
 * ARCH-005 R3（交付②——since 分代成文）：每条声明其 schema 白名单**当前形态**定型于
 * 哪代基线。四面 0.1.5-rc.2 定型、0.2.0 复核逐字段相同（本批复读 frozen 树实证）；
 * `agentPresets.list` 的 {presets} 收缩形态**定型于 0.2.0**（0.1.5 树实读顶层字段为
 * {presets,authorable}——authorable 移除且插件从未消费，R0 登记）；`llm.
 * listConfigurableProviders` 的 9 字段形态**定型于 0.2.1**（ARCH-006：6→9 纯超集
 * ——defaultBaseURL/baseURLEnv/nativeAuth 新增，消费面仍为旧 6 字段子集）⇒ 所选基线低于
 * since 时：本表白名单形态对更老宿主合法不同——**宿主侧**判据（包×文件/符号存在性）与 S7 7b
 * 顶层字段判等均记可见 skip（分代判定）；静态判据（锚形态/声明完备性/消费 ⊆ 白名单）
 * 与所选基线无关恒跑。since 缺失或 ∉ 档案 id 集 → 下方「锚分代」判据红（fail-closed）。
 */
const WIRE_SCHEMA_WHITELIST = {
  'llm.listConfigurableProviders': {
    since: '0.2.1',
    anchor: 'dsh-api-remotes 的 lib/client.js 的 llm_listConfigurableProviders_result schema（S7 增强组按符号逐字核验）',
    expectPackage: 'dsh-api-remotes',
    expectFile: ['lib/client.js'],
    expectSymbol: ['llm_listConfigurableProviders'],
    // ARCH-006（0.2.1-rc.2 主基线登记）：顶层字段 6→9 纯超集——新增 defaultBaseURL /
    // baseURLEnv / nativeAuth（宿主 0.2.1 实读 client.js 的 llm_listConfigurableProviders_
    // result 逐字段序）；插件消费面（joinProviderDirectoryHost）仍只读旧 6 字段子集
    // ⇒ 消费代码零改动，仅守卫白名单扩张。低代基线（0.2.0/0.1.5）按 since 分代对
    // 宿主侧顶层字段判等记可见 skip（该两代实读为 6 字段形态）。
    schema: ['provider', 'displayName', 'settingsNs', 'settingsPath', 'declared', 'defaultBaseURL', 'baseURLEnv', 'nativeAuth', 'error'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: 'function joinProviderDirectoryHost(', pattern: /entry\.([A-Za-z_]\w*)/g },
  },
  'llm.listProviders': {
    since: '0.1.5',
    anchor: 'dsh-api-remotes 的 lib/client.js 的 llm_listProviders_result schema（S7 增强组按符号逐字核验）',
    expectPackage: 'dsh-api-remotes',
    expectFile: ['lib/client.js'],
    expectSymbol: ['llm_listProviders'],
    schema: ['id', 'name'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: 'function joinProviderDirectoryHost(', pattern: /provider\.([A-Za-z_]\w*)/g },
  },
  'session.modelCatalog': {
    since: '0.1.5',
    anchor: 'dsh-api-remotes 的 lib/client.js 的 session_modelCatalog_result schema（S7 增强组按符号逐字核验）',
    expectPackage: 'dsh-api-remotes',
    expectFile: ['lib/client.js'],
    expectSymbol: ['session_modelCatalog'],
    schema: ['default', 'routableProviders', 'groups', 'failures'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: "models: guard('remote.session'", pattern: /catalog\.([A-Za-z_]\w*)/g },
  },
  'settings.describe': {
    since: '0.1.5',
    anchor: 'dsh-api-remotes 的 lib/client.js 的 settings_describe_result schema（S7 增强组按符号逐字核验）',
    expectPackage: 'dsh-api-remotes',
    expectFile: ['lib/client.js'],
    expectSymbol: ['settings_describe'],
    schema: ['writable', 'hasDocument', 'namespaces'],
    dynamic: { file: 'lib/host-abi/client-remotes.js', marker: "describe: guard('remote.settings'", pattern: /\bvalue\.([A-Za-z_]\w*)/g },
  },
  'credentials.describe': {
    since: '0.1.5',
    anchor: 'dsh-api-remotes 的 lib/client.js 的 credentials_describe_result schema（record<string, {configured, source?, writable}>；S7 增强组按符号逐字核验）',
    expectPackage: 'dsh-api-remotes',
    expectFile: ['lib/client.js'],
    expectSymbol: ['credentials_describe'],
    schema: ['configured', 'source', 'writable'],
    frozen: { consumed: ['configured'], presence: [{ file: 'lib/client.js', pattern: /\?\.configured === true/ }], note: '域内整体透传宿主 map；字段级消费在浏览器镜像账号卡（configured 判定）' },
  },
  'agentPresets.list': {
    since: '0.2.0',
    anchor: 'dsh-api-remotes 的 lib/client.js 的 agentPresets_list_result schema（S7 增强组按符号逐字核验）',
    expectPackage: 'dsh-api-remotes',
    expectFile: ['lib/client.js'],
    expectSymbol: ['agentPresets_list'],
    schema: ['presets'],
    frozen: { consumed: ['presets'], presence: [{ file: 'lib/host-abi/client-remotes.js', pattern: /presets: \[\]/ }], note: '域内整体透传 {presets}；authorable 未被消费（ARCH-005 R0 实读：宿主 0.2.0-rc.2 该 schema 顶层字段已收缩为 {presets}——authorable 移除且插件从未消费，非断裂，基线随主基线登记刷新）' },
  },
}

// ── 锚分代完备性 + 逐事件 since 注记解析（ARCH-005 R3 交付②——分代判定的输入面看护）──
// 两者都是 fail-closed：分代判定（baselineIncludes）失去输入时若静默按「恒适用」/
// 「恒全量」判定，会把「条目属于更高代际」伪装成「在本基线也成立」（§9h-3 入表
// 完备性同族——静默省略 ≠ 通过）。
{
  const validSinceIds = HOST_BASELINE_REGISTRY.map((entry) => entry.id)
  const anchorSinceGaps = HOST_SHAPE_ANCHORS
    .filter((spec) => !validSinceIds.includes(spec.since))
    .map((spec) => `${spec.face}: since=${String(spec.since)}`)
  check('锚分代: HOST_SHAPE_ANCHORS 逐条 since ∈ 档案 id 集（ARCH-005 R3 成文——缺失/未知代际即红，防静默省略 = 恒适用）',
    anchorSinceGaps.length === 0, anchorSinceGaps)
  const schemaSinceGaps = Object.entries(WIRE_SCHEMA_WHITELIST)
    .filter(([, spec]) => !validSinceIds.includes(spec.since))
    .map(([face, spec]) => `${face}: since=${String(spec.since)}`)
  check('锚分代: WIRE_SCHEMA_WHITELIST 逐条 since ∈ 档案 id 集（同上——分代判定 fail-closed）',
    schemaSinceGaps.length === 0, schemaSinceGaps)
}
/**
 * 转发事件逐项 since 注记（ARCH-005 R3——S7 7a 分代判定的输入）：注记面 =
 * `lib/host-abi/events.js` 镜像数组的**行内注释**（R0 登记形态：`'事件名', // since <版本>`）。
 * 镜像**值面**由 S1e 值级 parity 锁定；本处补「注记面」判据——镜像逐项有注记 + 注记不指向
 * 镜像外事件（陈旧注记即红）。分代比较按 major.minor.patch（versionTripleOf——'0.1.5-rc.2' 与 '0.1.5'
 * 同代），与锚/S5 的 since = 档案 id 口径互通。
 */
const FORWARDED_EVENT_SINCE = new Map()
for (const match of readHostAbi('events.js').matchAll(/^\s*'([^']+)',\s*\/\/\s*since\s+(\d+\.\d+\.\d+(?:-rc\.\d+)?)/gm)) {
  FORWARDED_EVENT_SINCE.set(match[1], match[2])
}
{
  const unannotated = FORWARDED_EVENT_ALLOWLIST.filter((event) => !FORWARDED_EVENT_SINCE.has(event))
  check('锚分代: FORWARDED_EVENT_ALLOWLIST 逐项有 since 注记（lib/host-abi/events.js 行内注释——S7 7a 分代判定输入完备；缺注记即红）',
    unannotated.length === 0, unannotated)
  const staleAnnotations = [...FORWARDED_EVENT_SINCE.keys()].filter((event) => !FORWARDED_EVENT_ALLOWLIST.includes(event))
  check('锚分代: since 注记零陈旧项（注记事件 ⊆ 镜像——镜像除名后遗留注记即红）',
    staleAnnotations.length === 0, staleAnnotations)
}

const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8'))
const patch = readFileSync(join(ROOT_DIR, 'cordis.patch.yml'), 'utf8')
const clientSource = readLib('client.js')
const clientStripped = stripComments(clientSource)

// ═══════════════════════════════════════════════════════════════════════════
// 宿主靶子解析（S3 宿主侧包表半边 + S7 增强组**共用单一实现路径**；只读零写入）
// 优先级：DSH_HOST_SOURCE > DSH_HOST_PACKAGES > npm 全局树 > 本地 _npx 缓存降序。
// npm 全局树候选（ARCH-005 R0 修 F-A）：宿主 0.2.0 起经 `npm i -g` 供给——scope 目录 =
// `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai`（APPDATA 探测），
// 自定义 prefix 环境以 `npm root -g` 兜底（仅 APPDATA 路径未命中时才 spawn——常径零子进程）；
// 该树 dsh 主包在 scope 目录**外两层**（候选携带 dshRoot 使版本一致性判据可读主包）。
// _npx 多缓存共存时按目录名**降序**取首个命中——readdirSync 顺序非契约
// （P2-2：非确定性选择会把 RISK-003 预警指向非运行宿主副本 → 不可复现的假红/假绿）；
// 解析结果与实际读取路径打印在启动行（可诊断性——先例：本文件原有 S7 skip note）。
// 版本一致性判据（FIX-037 ③，FIX-036 R0 P2-2 补强；ARCH-005 R3 起对 **DSH_BASELINE 所选
// 目标基线档案项**——默认 primary，本地默认行为不变）：
// 本机两候选可同为基线版本，但「降序确定性」不等于「指向运行宿主」——故追加关键包
// 版本比对并打印（选定靶子 + 全部候选），不一致即显式告警 + note（走可见 skip 面，
// 门控日志可判定 S3/S7 结论的适用范围；不引入宿主硬依赖红——BR-03「静态守卫不依赖
// 宿主」不变）。
console.log(`基线选择: DSH_BASELINE=${DSH_BASELINE_RAW || '<unset → primary>'} → ${targetBaseline.id}(${targetBaseline.status})（靶子面判据按该档案项判定；声明面恒取 primary ${primaryBaseline.id}——ARCH-005 R3）`)
console.log('宿主靶子解析（S3 宿主侧包表半边 + S7 增强组共用；只读宿主源码，零写入）:')
const hostTarget = (() => {
  const candidates = []
  if (process.env.DSH_HOST_SOURCE) candidates.push({ root: process.env.DSH_HOST_SOURCE, origin: 'DSH_HOST_SOURCE' })
  if (process.env.DSH_HOST_PACKAGES) candidates.push({ root: process.env.DSH_HOST_PACKAGES, origin: 'DSH_HOST_PACKAGES' })
  // npm 全局树候选（ARCH-005 R0 / F-A）：APPDATA 标准路径优先；未命中再 `npm root -g` 兜底。
  const globalNpmScopeRoots = []
  if (process.env.APPDATA) {
    globalNpmScopeRoots.push(join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
  }
  if (!globalNpmScopeRoots.some((root) => existsSync(root))) {
    try {
      const npmRoot = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', timeout: 10_000, shell: true, windowsHide: true })
      const prefix = npmRoot.status === 0 ? String(npmRoot.stdout ?? '').trim() : ''
      if (prefix) globalNpmScopeRoots.push(join(prefix, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
    } catch { /* npm 不可用 → 跳过兜底（静态守卫不依赖宿主，BR-03） */ }
  }
  for (const scopeRoot of globalNpmScopeRoots) {
    // dsh 主包目录 = scope 目录上两层（<prefix>/node_modules/@deepseek-ai/dsh）——版本判据用。
    candidates.push({ root: scopeRoot, dshRoot: join(scopeRoot, '..', '..'), origin: `npm-global(${scopeRoot})` })
  }
  if (process.env.LOCALAPPDATA) {
    try {
      const npxRoot = join(process.env.LOCALAPPDATA, 'npm-cache', '_npx')
      for (const entry of readdirSync(npxRoot).sort().reverse()) {
        candidates.push({ root: join(npxRoot, entry, 'node_modules', '@deepseek-ai'), origin: `_npx/${entry}` })
      }
    } catch { /* 无 _npx 缓存 → 仅显式候选（不失败：静态守卫不依赖宿主，BR-03） */ }
  }
  const hit = candidates.find(({ root }) => existsSync(join(root, 'dsh-api-remotes', 'lib', 'client.js')))
  /** 读包版本（缺包/坏 package.json → null，不抛——只让一致性判据显式失配）。
   *  dsh 主包对 npm-global 候选经 dshRoot 读取（scope 目录内无 dsh 主包副本）。 */
  const versionOf = (candidate, name) => {
    const paths = name === 'dsh' && candidate.dshRoot
      ? [join(candidate.root, name, 'package.json'), join(candidate.dshRoot, 'package.json')]
      : [join(candidate.root, name, 'package.json')]
    for (const path of paths) {
      try { return JSON.parse(readFileSync(path, 'utf8')).version ?? null } catch { /* 试下一路径 */ }
    }
    return null
  }
  const versionsOf = (candidate) => Object.fromEntries(HOST_KEY_PACKAGES.map((name) => [name, versionOf(candidate, name)]))
  const expectedOf = (name) => (name === 'dsh' ? targetBaseline.dsh : targetBaseline.dshPackages)
  const versions = hit ? versionsOf(hit) : null
  const mismatches = versions
    ? HOST_KEY_PACKAGES.filter((name) => versions[name] !== expectedOf(name)).map((name) => `${name}@${versions[name] ?? 'absent'} ≠ ${expectedOf(name)}`)
    : []
  return {
    root: hit?.root ?? null,
    origin: hit?.origin ?? null,
    candidates,
    versions,
    versionsOf: (root) => versionsOf(candidates.find((candidate) => candidate.root === root) ?? { root }),
    mismatches,
  }
})()
const versionLine = (versions) => HOST_KEY_PACKAGES.map((name) => `${name}@${versions[name] ?? 'absent'}`).join(' / ')
if (hostTarget.root) {
  const others = hostTarget.candidates.filter(({ root }) => root !== hostTarget.root).map(({ origin }) => origin)
  console.log(`      · 靶子 = ${hostTarget.root}（来源 ${hostTarget.origin}；候选 ${hostTarget.candidates.length} 个${others.length > 0 ? `，降序取首命中，未选：${others.join(' / ')}` : ''}）`)
  console.log(`      · 靶子关键包版本: ${versionLine(hostTarget.versions)}（基线[${targetBaseline.id}/${targetBaseline.status}] dsh ${targetBaseline.dsh} / dsh-* ${targetBaseline.dshPackages}）`)
  for (const candidate of hostTarget.candidates) {
    if (candidate.root === hostTarget.root) continue
    console.log(`      · 未选候选 ${candidate.origin}: ${versionLine(hostTarget.versionsOf(candidate.root))}`)
  }
  if (hostTarget.mismatches.length > 0) {
    console.log(`      · 版本一致性告警（FIX-037 ③）: ${hostTarget.mismatches.join('; ')}`)
    note(`S3/S7 宿主靶子版本一致性: 关键包 ≠ 所选基线 ${targetBaseline.id}(${targetBaseline.status})（${hostTarget.mismatches.join('; ')}）→ 靶子可能非所选基线副本（RISK-003 预警对象不确定），S3/S7 结论仅对该副本成立`)
  } else {
    console.log(`      · 版本一致性: 关键包版本 === 所选基线 ${targetBaseline.id} 档案项（靶子与所选实测基线同版——RISK-003 预警对象可判定）`)
  }
} else {
  console.log('      · 不可达（DSH_HOST_SOURCE 未设且本地无 _npx 缓存）→ S3 宿主侧半边与 S7 组均记 skip（BR-03：静态守卫不依赖宿主）')
}

/**
 * FIX-055-R0 P2-2：宿主树完整度判定（S8/S8b/S9b 共用单点）。
 * 完整安装 = 本机 npm 全局树（origin='npm-global(...)'；v4/persistence 随宿主发行）
 * ⇒ 缺包判红（完整安装不应缺）；DSH_HOST_SOURCE / DSH_HOST_PACKAGES / _npx 为
 * 显式或部分树（CI guard-matrix pinned 树 = 恰好 HOST_KEY_PACKAGES 8 包，刻意不
 * pin v4/persistence——v4 包无 0.1.5-rc.2 发行版，纯增量 pin 会打断 0.1.5 矩阵 job）
 * ⇒ 缺包记可见 skip 带原因（包缺失 ≠ 契约漂移）。
 */
const hostTreeIsComplete = hostTarget.origin !== null && hostTarget.origin.startsWith('npm-global')

/**
 * 宿主源码按需读取（**单一实现路径**：S2/S5 的「声明面 → 靶子」核验共用；只读、零写入、按路径缓存）。
 * 返回 `null` = 宿主靶子不可达或该包×文件不存在 ⇒ 调用方按其语义降级（note / 跳过），BR-03 不变。
 * 与 S7 增强靶子组自带 `hostRead` 的边界：S7 是**整套**读取（缺失即响亮失败），本函数只承担
 * 「声明的对象归属是否在靶子中存在」这一核验面，避免 S2/S5 各自开第二条读取路径（P5 单点化）。
 */
const hostSourceOf = (() => {
  const cache = new Map()
  return (packageName, file) => {
    // 声明面畸形（非字符串）时返回 null 而非裸抛（P8 / §9h-2c 先例：非法输入只判红，不崩栈）。
    if (!hostTarget.root || typeof packageName !== 'string' || typeof file !== 'string') return null
    const key = `${packageName}/${file}`
    if (!cache.has(key)) {
      const path = join(hostTarget.root, packageName, file)
      cache.set(key, existsSync(path) ? readFileSync(path, 'utf8') : null)
    }
    return cache.get(key)
  }
})()

// ── 基线档案单源消费说明（ARCH-005 R3）────────────────────────────────────────
// R0 批此处曾持「基线副本机器一致性守卫」（HOST_VERSION_BASELINE 副本 vs 权威文件
// HOST_BASELINE_REGISTRY 主基线项的文本比对锁定，FIX-037 R0 P2-1）。R3 起副本删除、
// 改为文件头部**直接文本提取**整个注册表并按 DSH_BASELINE 选择目标基线（提取/选择
// 失败即红收口——见上方「基线档案」判据组）：「双份常量机器锁定」的义务由「单份
// 常量 + 提取判据」承接，刷新漏改面从机制上消失（P5：同一数据单一路径）。

// ═══════════════════════════════════════════════════════════════════════════
console.log('S1 契约快照四类面（宿主面形状漂移即红；宿主新增方法自动入集 = RISK-003 预警）:')

// S1a llm 适配器契约（adapter-parity F2 动态枚举模式：宿主原型枚举 ∪ 静态补集）
{
  const enumerated = typeof LlmAdapter === 'function'
    ? Object.getOwnPropertyNames(LlmAdapter.prototype).filter((name) => name !== 'constructor')
    : []
  const contract = [...new Set([...enumerated, ...ADAPTER_CONTRACT_BASELINE.filter((name) => name === 'stream')])]
  const missing = LLM_ADAPTER_PROTO_BASELINE.filter((name) => !enumerated.includes(name))
  check('S1a 契约快照: LlmAdapter.prototype 动态枚举 ⊇ 基线 6 方法（宿主删/改方法即红；锚宿主 dsh-llm 的 LlmAdapter 类原型）', missing.length === 0, missing)
  console.log(`      · 快照 diff: 枚举 ${enumerated.length} 项 [${enumerated.join(',')}]${enumerated.some((name) => !LLM_ADAPTER_PROTO_BASELINE.includes(name)) ? '（宿主新增方法已自动入集——twin/oauth 未跟进即下方红）' : ''}`)
  const active = [{ modality: 'image', stateOf: null, marker: () => '', rewrite: () => null }]
  const fakeLlm = { registration: () => ({ adapter: {} }), stream: async function* () {} }
  const twin = createWrapAdapter(fakeLlm, 'contract-probe', active)
  const oauth = createOauthAdapter(null, null)
  const twinMissing = contract.filter((method) => typeof twin[method] !== 'function')
  const oauthMissing = contract.filter((method) => typeof oauth[method] !== 'function')
  check('S1a 契约快照: twin 适配器实现全部契约方法（宿主枚举 ∪ 静态补集；缺任一即红）', twinMissing.length === 0, twinMissing)
  check('S1a 契约快照: oauth-llm 适配器实现全部契约方法（EVO-009 手工对象字面量同型守卫）', oauthMissing.length === 0, oauthMissing)
}

// S1b 宿主协议对象导出面（BlockAssembler / dsh-llm-message / TypertRemoteService / defineTool）
{
  const assemblerProto = typeof BlockAssembler === 'function' ? Object.getOwnPropertyNames(BlockAssembler.prototype).filter((name) => name !== 'constructor') : []
  const assemblerMissing = BLOCK_ASSEMBLER_PROTO_BASELINE.filter((name) => !assemblerProto.includes(name))
  check('S1b 契约快照: BlockAssembler.prototype ⊇ 基线 11 项（消费面 push/blocks/usage/finish——lib/service.js 的 assembler.push/usage/finish/blocks 消费块）', assemblerMissing.length === 0, assemblerMissing)
  const messageMissing = MESSAGE_EXPORTS_BASELINE.filter((name) => !(name in dshMessage))
  check('S1b 契约快照: dsh-llm/message 导出面 ⊇ 基线 8 项（createUserMessage 消费面 = lib/service.js 与 lib/prestep.js 的 dsh-llm/message import 行；createAssistantMessage 消费面 = lib/service.js 同一 import 行；CONTEXT_SUMMARY_MAX_CHARS 值级常量面）', messageMissing.length === 0, messageMissing)
  check('S1b 契约快照: RouterService extends TypertRemoteService（宿主基类面——lib/service.js 的 `export class RouterService extends TypertRemoteService` 继承锚）',
    typeof RouterService === 'function' && typeof TypertRemoteService === 'function' && Object.getPrototypeOf(RouterService) === TypertRemoteService)
  const toolBlock = blockOf(stripComments(readLib('tool.js')), 'ctx.tools.register(defineTool(')
  check('S1b 契约快照: defineTool 函数契约（宿主 dsh-tools lib/index.js 实读：函数 + 单参数 options）', typeof defineTool === 'function' && defineTool.length === 1)
  check('S1b 契约快照: 消费面 options 键守卫（name/description/parameters 键 + execute 方法式——lib/tool.js 的 ctx.tools.register(defineTool( 块锚宿主 defineTool options 契约）',
    ['name', 'description', 'parameters'].every((key) => new RegExp(`\\b${key}:`).test(toolBlock)) && /(?:^|[\s,{])async execute\(/.test(toolBlock), toolBlock.slice(0, 80))
}

// S1c remote 面方法形状（CLIENT_REMOTE_FACES 代码侧权威 + 浏览器镜像 parity）
{
  check('S1c 契约快照: CLIENT_REMOTE_FACES === 基线五命名空间方法集（域内权威单点）', deepEqual(CLIENT_REMOTE_FACES, CLIENT_REMOTE_FACES_BASELINE), CLIENT_REMOTE_FACES)
  const mirrorMarker = 'CLIENT_REMOTE_FACES = {'
  let mirror = null
  const mirrorLiteral = blockOf(clientStripped, mirrorMarker)
  if (mirrorLiteral) {
    try { mirror = new Function(`return ${mirrorLiteral}`)() } catch { mirror = null }
  }
  check('S1c 契约快照: 浏览器镜像 CLIENT_REMOTE_FACES === 权威单点（值级 parity；漂移即红——B2 镜像纪律）', mirror !== null && deepEqual(mirror, CLIENT_REMOTE_FACES))
  const probeCtx = { get: (name) => (name === 'remote.llm' ? { listProviders: () => {}, listConfigurableProviders: () => {} } : undefined) }
  const faces = createClientRemotes(probeCtx).health().faces
  check('S1c 契约快照: 面形状漂移 → degraded（缺 discoverModels）+ 面缺失 → missing（形状探针口径与基线一致）',
    faces.find((face) => face.name === 'llm')?.state === 'degraded' && String(faces.find((face) => face.name === 'llm')?.detail).includes('discoverModels')
    && faces.find((face) => face.name === 'session')?.state === 'missing')
}

// S1d ctx 服务面（CTX_SERVICES 单点 + probe 派生）
{
  check('S1d 契约快照: CTX_SERVICES === 基线 11 服务 × 方法形状（域内单点派生）', deepEqual(CTX_SERVICES, CTX_SERVICES_BASELINE), CTX_SERVICES)
  const probes = ctxServiceFaceProbes()
  check('S1d 契约快照: ctxServiceFaceProbes 由 CTX_SERVICES 单点派生（无手抄清单；面名 ctx: 前缀防客户端面遮蔽）',
    probes.length === Object.keys(CTX_SERVICES).length && probes.every((item) => typeof item.probe === 'function' && item.name.startsWith('ctx:'))
    && probes.map((item) => item.name.slice(4)).sort().join(',') === Object.keys(CTX_SERVICES).sort().join(','))
}

// S1e 转发事件白名单（28 项 + 镜像 parity + 判定函数；ARCH-005 R0 随 0.2.0-rc.2 基线登记刷新，
//     ARCH-006 随 0.2.1-rc.2 基线登记刷新——27→28 吸收 plugin-market/changed）
{
  check('S1e 契约快照: FORWARDED_EVENT_ALLOWLIST === 宿主 28 项基线（逐字逐序——锚宿主 dsh-api-remotes 的 lib/types/remote-events.js 事件表，0.2.1-rc.2 主基线）',
    FORWARDED_EVENT_ALLOWLIST.length === 28 && deepEqual(FORWARDED_EVENT_ALLOWLIST, FORWARDED_EVENT_BASELINE), FORWARDED_EVENT_ALLOWLIST)
  const mirrorLiteral = arrayOf(clientStripped, 'FORWARDED_EVENT_ALLOWLIST = [')
  let mirror = null
  if (mirrorLiteral) {
    try { mirror = new Function(`return ${mirrorLiteral}`)() } catch { mirror = null }
  }
  check('S1e 契约快照: 浏览器镜像 FORWARDED_EVENT_ALLOWLIST === 权威单点（值级 parity）', mirror !== null && deepEqual(mirror, FORWARDED_EVENT_ALLOWLIST))
  check('S1e 契约快照: isForwardedEvent 判定与镜像一致（含空/非串防御；D-2 死名被判否）',
    isForwardedEvent('credentials/reference-updated') === true && isForwardedEvent('credentials/updated') === false
    && isForwardedEvent('') === false && isForwardedEvent(undefined) === false)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S2 宿主源码形状锚点（P10-④：形状签名 + 宿主源码锚；消费面漂移即红）:')
// FIX-043 批 A 判定（锚形态判据改写）：由「路径:行号」改为「宿主包名 + 宿主文件 + 宿主符号
//   （调用式）」——行号在宿主侧不可核验且必然漂移（W3.3 试点同法去行号）；「禁心智模型式无锚
//   常量」语义不变。
// FIX-043 批 E 判定（R1 P1-1 + P1-2 收口）：①**声明面完备性**——`expectPackage/expectFile/
//   expectSymbol(/expectSymbolHost)` 缺失或畸形时，批 B 的判据因 `?? []` 归一而**平凡满足**
//   （R1 M-B5 实证：删三字段 ⇒ exit 0）⇒ 增完备性判据，使「静默省略」判红。②**符号宿主可达性**——
//   批 B 只核验「包×文件存在」（R1 M-B4 实证：真包 + 真文件 + 捏造符号仍 exit 0）⇒ 取处置 (a)：
//   增 `expectSymbolHost`（符号 → 宿主文件映射，单点声明）并按**声明的文件**逐符号核验宿主源码
//   （与 S5 的「包×文件 + 符号逐字」形态对齐）；宿主不可达 → note（BR-03 不变）。
//   **可诊断性**：声明面缺口与宿主缺失清单均结构化输出（P8，不静默吞错）。
{
  const anchorFieldsOf = (spec) => ({
    pkg: typeof spec.expectPackage === 'string' ? [spec.expectPackage] : (spec.expectPackage ?? []),
    files: spec.expectFile ?? [],
    symbols: spec.expectSymbol ?? [],
  })
  for (const anchorCase of HOST_SHAPE_ANCHORS) {
    const anchorHostForm = /dsh-[a-z0-9-]+/.test(anchorCase.anchor) && /[\w./-]+\.(?:js|mjs|ts)/.test(anchorCase.anchor) && /[A-Za-z_$][\w$]*\(/.test(anchorCase.anchor)
    check(`S2 形状锚点: ${anchorCase.face} 锚点带「宿主包名 + 宿主文件 + 宿主符号」（禁无锚心智模型常量）`, anchorHostForm, anchorCase.anchor)
    // 声明面完备性（FIX-043 批 E / R1 P1-1；先例 §9h-3「入表完备性」）——缺失/空/畸形/字段脱钩即红。
    const declarationGaps = [...declarationGapsOf(anchorCase), ...symbolHostGapsOf(anchorCase)]
    check(`S2 形状锚点: ${anchorCase.face} 对象归属声明完备（expectPackage/expectFile/expectSymbol/expectSymbolHost 齐全且字段间自洽——缺失即红，防判据平凡满足）`,
      declarationGaps.length === 0, { declarationGaps })
    const declared = anchorFieldsOf(anchorCase)
    const undeclared = [...declared.pkg, ...declared.files, ...declared.symbols].filter((token) => !anchorCase.anchor.includes(token))
    check(`S2 形状锚点: ${anchorCase.face} 锚文本含其声明的对象归属（expectPackage/expectFile/expectSymbol 逐项逐字在位——字段与锚脱钩即红）`,
      undeclared.length === 0, { undeclared, anchor: anchorCase.anchor })
    if (hostTarget.root && baselineIncludes(anchorCase.since)) {
      const absent = declared.pkg.flatMap((name) => declared.files.filter((file) => !existsSync(join(hostTarget.root, name, file))).map((file) => `${name}/${file}`))
      check(`S2 形状锚点: ${anchorCase.face} 声明的宿主包×文件在宿主靶子中存在（捏造包/文件即红；靶子 ${hostTarget.origin}）`,
        absent.length === 0, { absent, hostRoot: hostTarget.root })
      // 符号宿主可达性（FIX-043 批 E / R1 P1-2 取处置 a；M-B4 同形：真包真文件 + 捏造符号曾 exit 0）。
      // 声明面不完备时包名可能非字符串 ⇒ 用安全标签（上方完备性判据已判红，此处不裸抛、可诊断）。
      const declaredPackage = typeof anchorCase.expectPackage === 'string' ? anchorCase.expectPackage : '<expectPackage 未声明>'
      // FIX-043 批 F / R2 P2-1 收口：`expectSymbolHost` **省略/畸形**时先归一为空表，再 `.flatMap`——
      //   否则运行时裸抛 TypeError 并**截断其后全部诊断输出**（判据仍 fail-closed：对偶的
      //   `symbolHostGapsOf` 完备性判据已在上方判红，故本处只承担「不崩栈 + 诊断完整」的 P8 义务）。
      //   `entry.symbols` 同法兜底（畸形条目不得击穿诊断面）；`hostSourceOf` 对非字符串 file 已返 null。
      const symbolHostMap = Array.isArray(anchorCase.expectSymbolHost) ? anchorCase.expectSymbolHost : []
      const absentSymbols = symbolHostMap.flatMap((entry) => (Array.isArray(entry?.symbols) ? entry.symbols : [])
        .filter((symbol) => !(hostSourceOf(declaredPackage, entry.file) ?? '').includes(symbol))
        .map((symbol) => `${declaredPackage}/${entry.file} :: ${symbol}`))
      check(`S2 形状锚点: ${anchorCase.face} 声明的宿主符号逐字在宿主源码内（捏造符号即红；靶子 ${hostTarget.origin}）`,
        absentSymbols.length === 0, { absentSymbols, hostRoot: hostTarget.root })
    } else if (hostTarget.root) {
      // ARCH-005 R3 分代：锚形态定型于更高代际——对所选基线的宿主侧核验记可见 skip
      // （静态判据——锚形态/声明完备性/消费签名——不受影响恒跑；非静默降级）。
      note(`S2 形状锚点: ${anchorCase.face} since=${anchorCase.since} > 所选基线 ${targetBaseline.id} → 宿主侧「包×文件/符号」核验记 skip（锚形态定型于更高代际——ARCH-005 R3 分代判定；静态判据仍生效）`)
    } else {
      note(`S2 形状锚点: ${anchorCase.face} 宿主靶子不可达 → 「声明包×文件存在性 + 符号逐字在位」核验跳过（锚文本字段判据仍生效；BR-03 静态守卫不依赖宿主）`)
    }
    let hits = 0
    for (const file of anchorCase.consumer) {
      const source = stripComments(readFileSync(join(ROOT_DIR, file), 'utf8'))
      const missing = anchorCase.signatures.filter((signature) => !source.includes(signature))
      hits += anchorCase.signatures.length - missing.length
      check(`S2 形状锚点: ${anchorCase.face} ← ${file} 形状签名逐字在位（${anchorCase.signatures.length} 项）`, missing.length === 0, missing)
    }
    for (const extra of anchorCase.extra ?? []) {
      const source = readFileSync(join(ROOT_DIR, extra.file), 'utf8')
      const missing = extra.signatures.filter((signature) => !source.includes(signature))
      check(`S2 形状锚点: ${anchorCase.face} ← ${extra.file} 桩锚定宿主源码（P10-④ 判别夹具同源）`, missing.length === 0, missing)
    }
    check(`S2 形状锚点: ${anchorCase.face} 消费命中非空（锚点未失效）`, hits > 0)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S3 声明面比对（inject / peerDeps / fiber 面 / patch 条目存在性——静默面守卫）:')
{
  check('S3 声明面: dsh.client.inject === inject-manifest 代码侧常量 CLIENT_PACKAGE_INJECT（B0/B1 单源，成体系比对）',
    deepEqual(pkg.dsh?.client?.inject, CLIENT_PACKAGE_INJECT) && deepEqual(CLIENT_PACKAGE_INJECT, CLIENT_PACKAGE_INJECT_BASELINE), pkg.dsh?.client?.inject)
  check('S3 声明面: inject 零死行（@deepseek-ai/dsh-client-runtime 宿主 0.1.5 起消亡——D1-1）',
    !(pkg.dsh?.client?.inject ?? []).includes('@deepseek-ai/dsh-client-runtime'))
  check('S3 声明面: dsh.client.platform === web（客户端装配面声明）', pkg.dsh?.client?.platform === 'web')

  const peerNames = Object.keys(pkg.peerDependencies ?? {}).sort()
  check('S3 声明面: peerDependencies = 基线 8 项宿主供给包（集合相等）', deepEqual(peerNames, [...PEER_DEP_BASELINE].sort()), peerNames)
  check('S3 声明面: caretRangeContains 覆盖谓词自 host-version-snapshot.mjs 文本提取成功（ARCH-006 单源消费——提取失败即红，先例 HOST_BASELINE_REGISTRY 提取判据组）',
    typeof declaredRangeCovers === 'function')
  const peerRangesS3 = PEER_DEP_BASELINE.map((name) => pkg.peerDependencies?.[name])
  const commonPeerRangeS3 = peerRangesS3[0] && peerRangesS3.every((range) => range === peerRangesS3[0]) ? peerRangesS3[0] : null
  check(`S3 声明面: peerDeps 8 项版本范围收敛同一记录性口径 ${commonPeerRangeS3 ?? '<split/absent>'} 且覆盖主基线 ${primaryBaseline.dshPackages}（ARCH-006 覆盖语义——范围不再覆盖 primary（frozen 回退/假版本）即红，权威判据 = host-version-snapshot 声明面组）`,
    typeof declaredRangeCovers === 'function' && commonPeerRangeS3 !== null && declaredRangeCovers(commonPeerRangeS3, primaryBaseline.dshPackages), peerRangesS3)

  check('S3 声明面: FIBER_INJECT === 基线九面（inject-manifest 单源）', deepEqual(FIBER_INJECT, FIBER_INJECT_BASELINE), FIBER_INJECT)
  const fiberRemoteFaces = FIBER_INJECT.filter((name) => name.startsWith('remote.')).map((name) => name.slice('remote.'.length))
  check('S3 声明面: fiber inject 的 remote.* 面 ⊆ CLIENT_REMOTE_FACES（声明面 vs 域面交叉一致）',
    fiberRemoteFaces.every((name) => Object.hasOwn(CLIENT_REMOTE_FACES, name)))
  const injectMirrorBlock = arrayOf(clientStripped, 'const inject = [')
  const injectMirror = [...new Set([...injectMirrorBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]))]
  check('S3 声明面: lib/client.js fiber inject 数组 === FIBER_INJECT（浏览器镜像 parity；dsh-abi-health 源提取锁定的同源复核）',
    deepEqual(injectMirror, FIBER_INJECT), injectMirror)

  check('S3 声明面: package.json dsh.bundle.patch 指向 ./cordis.patch.yml 且文件存在',
    pkg.dsh?.bundle?.patch === './cordis.patch.yml' && existsSync(join(ROOT_DIR, 'cordis.patch.yml')))
  const rows = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)\s*\n\s*name:\s*(\S+)\s*$/gm)].map((match) => ({ id: match[1], name: match[2] }))
  check('S3 声明面: cordis.patch.yml 两宿主行 id/name 存在性 === 基线（宿主对不存在条目仅 stderr 警告——静默面守卫）',
    deepEqual(rows, PATCH_ROWS_BASELINE), rows)
  check('S3 声明面: patch insert 段结构完好（insert 块存在 + 行数 = 2）',
    /^-\s*insert:\s*$/m.test(patch) && rows.length === 2)

  // S3 宿主侧半边（设计 §5.1(a)「inject 声明 vs 宿主 node_modules 实际包表」）：
  // 三类 client inject 包由宿主供给——插件自身 node_modules 内不存在（实测），
  // 故该半边的判据只能是宿主包表；宿主侧包名消亡/改名（D1-1 同类事件）在全绿
  // 下静默的问题由本断言兜底。宿主不可达 → 与 S7 同语义 skip（BR-03 不失败）。
  if (hostTarget.root) {
    // hostRoot 即宿主 `@deepseek-ai` scope 目录本身（解析判据 = dsh-api-remotes/lib/client.js
    // 在其下）——故拼包目录须剥 scope 前缀（scope=目录名，非子层）。
    const missingClientPackages = CLIENT_PACKAGE_INJECT_BASELINE
      .filter((name) => !existsSync(join(hostTarget.root, name.slice(name.indexOf('/') + 1))))
    check('S3 声明面: inject 三 client 包在宿主 @deepseek-ai 包表实际在位（设计 §5.1(a) 宿主侧半边；消亡/改名即红——D1-1 同类事件）',
      missingClientPackages.length === 0, missingClientPackages)
  } else {
    note('S3 声明面: 宿主 checkout 不可达 → inject 包表宿主侧半边跳过（设计 §5.1(a)；与 S7 增强组同语义，BR-03）')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S4 消费点黑名单（高危面禁裸 ctx.get + 域管事件禁裸 ctx.on——P5 单点化机器 enforcement）:')
{
  const libFiles = readdirSync(join(ROOT_DIR, 'lib')).filter((name) => name.endsWith('.js'))
  const diffs = []
  const blacklistViolations = []
  const found = {}
  for (const file of libFiles) {
    const source = stripComments(readLib(file))
    const counts = {}
    for (const match of source.matchAll(/ctx\.get\(([^)\n]*)\)/g)) {
      const argument = match[1].trim()
      const face = argument.startsWith('`remote.') ? 'remote.*' : argument === 'name' ? 'dynamic-inject' : argument.startsWith("'") ? argument.slice(1, -1) : argument
      counts[face] = (counts[face] ?? 0) + 1
    }
    found[file] = counts
    const expected = CONSUMER_BARE_CTX_GET_ALLOWLIST[file] ?? {}
    for (const key of new Set([...Object.keys(counts), ...Object.keys(expected)])) {
      if ((counts[key] ?? 0) !== (expected[key] ?? 0)) diffs.push(`${file}:${key} found=${counts[key] ?? 0} expected=${expected[key] ?? 0}`)
    }
    for (const face of CONSUMER_BLACKLIST_FACES) {
      if ((counts[face] ?? 0) !== (expected[face] ?? 0)) blacklistViolations.push(`${file}:${face}`)
    }
  }
  check('S4 黑名单: lib/*.js（非 host-abi）裸 ctx.get = 分级白名单精确快照（B4 §8a 口径；越界新增即红）', diffs.length === 0, diffs)
  check('S4 黑名单: 高危面名裸 ctx.get 仅剩分级放行清单（sessionController/sessionProjections/agents/agentPresets/modelDirectories/remote.* 域外零新增）', blacklistViolations.length === 0, blacklistViolations)
  check('S4 黑名单: host-route.js 零裸消费（B4 七处散点已切换域访问器——不回归）', !/ctx\.get\(/.test(stripComments(readLib('host-route.js'))))

  const domainSources = {
    'host-abi/ctx-services.js': readHostAbi('ctx-services.js'),
    'host-abi/llm-selection.js': readHostAbi('llm-selection.js'),
    'host-abi/client-remotes.js': readHostAbi('client-remotes.js'),
    'host-abi/inject-manifest.js': readHostAbi('inject-manifest.js'),
  }
  const homed = ['llm', 'credentials', 'agentDefaultModel', 'sessionController', 'sessionProjections', 'agents', 'agentPresets', 'modelDirectories', 'remote.*']
  const homeless = homed.filter((face) => {
    const needle = face === 'remote.*' ? 'remote.${name}' : `'${face}'`
    return !Object.values(domainSources).some((source) => source.includes(needle))
  })
  check('S4 黑名单: 每个高危面都有域模块归属单点（域内解析形态在位——face 无家可归即红）', homeless.length === 0, homeless)

  // 域管事件名裸订阅守卫（W-3 口径：scoped 钩子直订合法，域管事件必须经 events 域）
  const bareManaged = []
  for (const file of libFiles) {
    const source = stripComments(readLib(file))
    for (const event of MANAGED_EVENTS) {
      const bare = new RegExp(`(?:ctx|this\\.ctx)\\.on\\(\\s*'${event.replace(/[/-]/g, (char) => `\\${char}`)}'`)
      if (bare.test(source)) bareManaged.push(`${file}:${event}`)
    }
  }
  check('S4 域管事件: MANAGED_EVENTS 域外零裸 ctx.on（五事件全部经 events 域 subscribeEvents——B5/B6 订阅收敛终态）', bareManaged.length === 0, bareManaged)
  const scopedDirect = SCOPED_HOOK_EVENTS.filter((event) => libFiles.some((file) => stripComments(readLib(file)).includes(`ctx.on('${event}'`)))
  check('S4 域管事件: scoped 生命周期钩子保留直订经域外（W-3 收窄口径：agent/pre-step + agent/created + agent/request 三面）',
    deepEqual(scopedDirect.sort(), [...SCOPED_HOOK_EVENTS].sort()), scopedDirect)
  const subscribeSites = libFiles.flatMap((file) => {
    const source = stripComments(readLib(file))
    return [...source.matchAll(/event:\s*'([^']+)'/g)].map((match) => ({ file, event: match[1] }))
  })
  const unhomed = MANAGED_EVENTS.filter((event) => !subscribeSites.some((site) => site.event === event))
  check('S4 域管事件: 五事件各有 ≥1 域订阅站点（事件面单点无遗漏——收敛不丢消费者）', unhomed.length === 0, unhomed)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S5 字段级 wire schema 白名单断言（S-5：消费字段 ⊆ 宿主 schema 字段）:')
{
  const joinBlock = blockOf(stripComments(readHostAbi('client-remotes.js')), 'function joinProviderDirectoryHost(')
  // FIX-043 批 B（R0 P1-1 收口，与 S2 同构）：S5 锚由「硬编码包名/文件 + 面键派生符号」升级为
  //   「锚文本 ⇒ 声明的对象归属」+「宿主可达 ⇒ 声明的包×文件在宿主树存在 + schema 符号逐字在
  //   宿主 lib/client.js 中出现」——`expectSymbol` 后缀 `_result` 由面键单点派生（与 S7 的
  //   `schemaCases` 同一约定），消除手抄漂移面（P5）。宿主不可达时降级为 note（BR-03 不变）。
  //   宿主源码按**按需**读取（仅在宿主可达时 `stat` 判在；符号核验走一次性读取，无重复大文件驻留）。
  // FIX-043 批 E（R1 P1-1 同批收口，与 S2 同构）：增**声明面完备性**判据（缺失/空/畸形即红）。
  //   读取路径收口到 `hostSourceOf`（S2/S5 单一实现路径，P5）——不再各自 `readFileSync`。
  const hostApiText = hostSourceOf('dsh-api-remotes', 'lib/client.js')
  for (const [face, spec] of Object.entries(WIRE_SCHEMA_WHITELIST)) {
    const anchorHostForm = /dsh-api-remotes/.test(spec.anchor) && /lib\/client\.js/.test(spec.anchor) && spec.anchor.includes(`${face.replace('.', '_')}_result`)
    check(`S5 字段: ${face} 锚点带「宿主包名 + 宿主文件 + schema 符号」（S-5 单一声明源可复核）`, anchorHostForm, spec.anchor)
    const declarationGaps = declarationGapsOf(spec)
    check(`S5 字段: ${face} 对象归属声明完备（expectPackage/expectFile/expectSymbol 齐全——缺失即红，防判据平凡满足）`,
      declarationGaps.length === 0, { declarationGaps })
    const declaredFiles = typeof spec.expectFile === 'string' ? [spec.expectFile] : (spec.expectFile ?? [])
    const declaredSymbols = (spec.expectSymbol ?? []).map((name) => `${name}_result`)
    const declared = [spec.expectPackage, ...declaredFiles, ...declaredSymbols]
    const undeclared = declared.filter((token) => typeof token !== 'string' || !spec.anchor.includes(token))
    check(`S5 字段: ${face} 锚文本含其声明的对象归属（expectPackage/expectFile/expectSymbol 逐项逐字在位）`,
      undeclared.length === 0, { undeclared, anchor: spec.anchor })
    if (hostTarget.root && spec.expectPackage && baselineIncludes(spec.since)) {
      const absentFiles = declaredFiles.filter((file) => !existsSync(join(hostTarget.root, spec.expectPackage, file))).map((file) => `${spec.expectPackage}/${file}`)
      check(`S5 字段: ${face} 声明的宿主包×文件在宿主靶子中存在（捏造包/文件即红；靶子 ${hostTarget.origin}）`,
        absentFiles.length === 0, { absentFiles, hostRoot: hostTarget.root })
      if (hostApiText !== null) {
        const absentSymbols = declaredSymbols.filter((name) => !hostApiText.includes(name))
        check(`S5 字段: ${face} 声明的 schema 符号逐字在宿主 lib/client.js 内（捏造符号即红）`,
          absentSymbols.length === 0, { absentSymbols })
      }
    } else if (hostTarget.root && !baselineIncludes(spec.since)) {
      // ARCH-005 R3 分代：白名单形态定型于更高代际——对所选基线的宿主侧核验记可见 skip
      // （如 frozen 基线下 agentPresets.list 的 {presets} 形态对 0.1.5 树合法不同——其
      // 0.1.5 顶层字段为 {presets,authorable}；静态判据——锚形态/声明完备性/消费 ⊆ 白名单——
      // 不受影响恒跑）。
      note(`S5 字段: ${face} since=${spec.since} > 所选基线 ${targetBaseline.id} → 「声明包×文件/schema 符号」核验记 skip（白名单形态定型于更高代际——ARCH-005 R3 分代判定；静态判据仍生效）`)
    } else {
      note(`S5 字段: ${face} 宿主靶子不可达 → 「声明包×文件/schema 符号」核验跳过（锚文本字段判据仍生效；BR-03）`)
    }
    let consumed
    if (spec.dynamic) {
      const block = blockOf(stripComments(readFileSync(join(ROOT_DIR, spec.dynamic.file), 'utf8')), spec.dynamic.marker)
      consumed = fieldsIn(block, spec.dynamic.pattern)
      check(`S5 字段: ${face} 消费字段动态提取非空（${spec.dynamic.file} 块锚 ${JSON.stringify(spec.dynamic.marker)}）`, consumed.length > 0)
    } else {
      consumed = [...spec.frozen.consumed].sort()
      for (const presence of spec.frozen.presence) {
        check(`S5 字段: ${face} frozen 消费声明有源码实证（${presence.file}）`, presence.pattern.test(readFileSync(join(ROOT_DIR, presence.file), 'utf8')))
      }
    }
    const outside = consumed.filter((field) => !spec.schema.includes(field))
    check(`S5 字段: ${face} 消费字段 ⊆ schema 白名单（${consumed.join(',')} ⊆ ${spec.schema.join(',')}）`, outside.length === 0, outside)
  }
  check('S5 字段: hostApiFace 逐字段消费面（joinProviderDirectoryHost 六字段处理——字段漂移 = 显示层静默错列）',
    ['provider', 'displayName', 'settingsNs', 'settingsPath', 'declared'].every((field) => new RegExp(`entry\\.${field}\\b`).test(joinBlock)))
  const mirrorJoinBlock = blockOf(stripComments(clientSource), 'function joinProviderDirectoryHost(')
  const mirrorFields = fieldsIn(mirrorJoinBlock, /entry\.([A-Za-z_]\w*)/g)
  check('S5 字段: 浏览器镜像逐字段消费面与权威单点一致（B2 镜像纪律；字段面漂移即红）',
    deepEqual(mirrorFields, fieldsIn(joinBlock, /entry\.([A-Za-z_]\w*)/g)), { mirrorFields })
  check('S5 字段: modelCatalog 消费面 = {groups, failures}（default/routableProviders 未消费——白名单容纳不越界）',
    deepEqual(fieldsIn(blockOf(stripComments(readHostAbi('client-remotes.js')), "models: guard('remote.session'"), /catalog\.([A-Za-z_]\w*)/g), ['failures', 'groups']))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S6 转发事件白名单静态比对（W-4）：客户端转发面 ⊆ 白名单 + Node 面事件名归口:')
{
  const forwardedSites = [...new Set([...clientStripped.matchAll(/event:\s*'([^']+)'/g)].map((match) => match[1]))]
  const outsideForwarded = forwardedSites.filter((event) => !FORWARDED_EVENT_ALLOWLIST.includes(event))
  check('S6 白名单: lib/client.js 全部转发订阅事件名 ⊆ FORWARDED_EVENT_ALLOWLIST（≥4 站点——非空判别）', forwardedSites.length >= 4 && outsideForwarded.length === 0, forwardedSites)
  check('S6 白名单: 客户端裸 $on(字面量) 订阅站点归零（统一经 subscribeClientEvents 白名单受检面）',
    !/\$on\(\s*'/.test(clientStripped))
  check('S6 白名单: D-2 死订阅名 credentials/updated 零残留 + 正名 credentials/reference-updated 在位',
    !forwardedSites.includes('credentials/updated') && forwardedSites.includes('credentials/reference-updated'))
  check('S6 白名单: 客户端转发面进入 events 域 API（subscribeClientEvents 镜像在位 + 白名单拒绝运行时可观测）',
    /subscribeClientEvents/.test(clientStripped) && /event-subscribe-rejected/.test(clientStripped))

  const nodeOnSites = []
  for (const file of readdirSync(join(ROOT_DIR, 'lib')).filter((name) => name.endsWith('.js'))) {
    const source = stripComments(readLib(file))
    for (const match of source.matchAll(/(?:ctx|this\.ctx)\.on\(\s*'([^']+)'/g)) nodeOnSites.push({ file, event: match[1] })
  }
  const allowedNodeEvents = [...MANAGED_EVENTS, ...SCOPED_HOOK_EVENTS]
  const illegalNode = nodeOnSites.filter((site) => !allowedNodeEvents.includes(site.event))
  check('S6 白名单: Node 面裸 ctx.on 事件名 ⊆ {域管事件（经域后本应零裸点）, scoped 钩子}（域外新增事件名即红）',
    illegalNode.length === 0, illegalNode)
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('S7 增强靶子（宿主 checkout 可达时直读源码核验常量；不可达 → skip，BR-03 不依赖）:')
{
  if (!hostTarget.root) {
    note('S7 增强靶子: 宿主 checkout 不可达（见上方「宿主靶子解析」行）→ 跳过（静态守卫不依赖宿主；CI 第①步同理）')
  } else {
    const hostRoot = hostTarget.root
    const hostRead = (...parts) => readFileSync(join(hostRoot, ...parts), 'utf8')
    // 7a 转发事件白名单宿主声明源（ARCH-005 R0：全等 → **单向消费断言**——设计 §2-B 四维-c / F-D：
    //   判据 = 镜像 ⊆ 宿主实读表（宿主侧除名消费事件即红）；宿主侧超集（additive 增量）为绿 +
    //   打印增量清单（吸收留痕——基线登记义务的可见提示，不制造人工刷新红）。引号形态以靶子
    //   实读为准（0.2.0 树该文件为单引号面——复审 R1 P3-3 仲裁，现行正则可命中）。
    //   ARCH-005 R3：期望集按**逐事件 since** 分代（注记面 = lib/host-abi/events.js 镜像数组行内
    //   注记，R0 登记形态；解析完备性由「锚分代」判据组锁定）——所选基线低于事件 since 时该事件
    //   不入期望集（frozen 基线下 0.2.0 新增 8 项不期望存在于 0.1.5 宿主表 ⇒ 判 19 ⊆ 19），
    //   宿主侧超集照旧绿 + 打印增量，消费项除名即红。
    const eventsSource = hostRead('dsh-api-remotes', 'lib', 'types', 'remote-events.js')
    const hostEvents = [...eventsSource.matchAll(/event:\s*'([^']+)'/g)].map((match) => match[1])
    const expectedMirror = FORWARDED_EVENT_ALLOWLIST.filter((event) => baselineIncludes(FORWARDED_EVENT_SINCE.get(event)))
    const futureMirror = FORWARDED_EVENT_ALLOWLIST.filter((event) => !baselineIncludes(FORWARDED_EVENT_SINCE.get(event)))
    const mirrorMissing = expectedMirror.filter((event) => !hostEvents.includes(event))
    check(`S7 增强: 白名单镜像 ⊆ 宿主 API_REMOTE_FORWARDED_EVENTS（单向消费断言——所选基线 ${targetBaseline.id} 期望 ${expectedMirror.length} 项全部在宿主 ${hostEvents.length} 项实读表内；宿主除名消费事件即红）`, mirrorMissing.length === 0, mirrorMissing)
    if (futureMirror.length > 0) {
      note(`S7 增强: 镜像 ${futureMirror.length} 项 since > 所选基线 ${targetBaseline.id}，不入本基线期望集（ARCH-005 R3 分代判定——期望集按所选基线的 since 注记面派生，不对宿主 ${hostEvents.length} 项实读表的代际作判定）: [${futureMirror.join(', ')}]`)
    }
    const hostExtras = hostEvents.filter((event) => !FORWARDED_EVENT_ALLOWLIST.includes(event))
    console.log(`      · 宿主侧超集增量（单向断言消化面——待登记进镜像基线）: ${hostExtras.length} 项${hostExtras.length > 0 ? ` [${hostExtras.join(', ')}]` : ''}`)
    // 7b 字段级 wire schema 宿主声明源（逐面取值级字段表）
    const hostClientLines = hostRead('dsh-api-remotes', 'lib', 'client.js').split(/\r?\n/)
    const schemaBlockOf = (fileName) => {
      const line = hostClientLines.findIndex((text) => text.includes(`${fileName}$schema = `))
      if (line < 0) return ''
      return hostClientLines.slice(line, line + 60).join('\n')
    }
    const topLevelFields = (block) => {
      const start = block.indexOf('{')
      if (start < 0) return []
      const out = []
      let depth = 0
      for (let index = start; index < block.length; index++) {
        const char = block[index]
        if (char === '{') depth += 1
        else if (char === '}') { depth -= 1; if (depth === 0) break } else if (depth === 1 && char === '"') {
          const end = block.indexOf('"', index + 1)
          const next = block.slice(end + 1).match(/^\s*:/)
          if (end > index && next) out.push(block.slice(index + 1, end))
          index = end
        }
      }
      return [...new Set(out)]
    }
    // FIX-043 批 A：schemaCases 与 S5 锚点符号同源单点派生（约定 = 面键去点 + `_result`，与
    //   S5 的 `anchorHostForm` 判据同一表达式）——消除两处手抄映射的漂移面（P5 单点化）。
    const schemaCases = Object.keys(WIRE_SCHEMA_WHITELIST).map((face) => [`${face.replace('.', '_')}_result`, face])
    for (const [schemaName, face] of schemaCases) {
      if (!baselineIncludes(WIRE_SCHEMA_WHITELIST[face].since)) {
        // ARCH-005 R3 分代：白名单形态定型于更高代际（agentPresets.list 的 {presets} 收缩
        // 定型于 0.2.0——0.1.5 树实读为 {presets,authorable}）→ 对所选基线的顶层字段判等
        // 记可见 skip；S5 静态判据（消费 ⊆ 白名单）与所选基线无关恒跑。
        note(`S7 增强: 宿主 schema ${face} since=${WIRE_SCHEMA_WHITELIST[face].since} > 所选基线 ${targetBaseline.id} → 顶层字段判等记 skip（白名单形态定型于更高代际——ARCH-005 R3 分代判定）`)
        continue
      }
      const fields = topLevelFields(schemaBlockOf(schemaName))
      const expected = WIRE_SCHEMA_WHITELIST[face].schema
      check(`S7 增强: 宿主 schema ${face} 顶层字段 === 白名单（${fields.join(',')}）`, deepEqual(fields, expected), fields)
    }
    // 7c 形状锚点源码在位（selectionFor / directoryFor / LlmAdapter 方法行）
    const agentTypes = hostRead('dsh-api-session-controller', 'lib', 'types', 'agent.js')
    check("S7 增强: 宿主 selectionFor 锚在位（types/agent.js + stateOf(session, 'modelSelection') + projectionState.pending）",
      agentTypes.includes('selectionFor(agent)') && agentTypes.includes("stateOf(agent.session, 'modelSelection')") && agentTypes.includes('projectionState.pending'))
    const directoryTypes = hostRead('dsh-client-ui-model-selection', 'lib', 'types', 'client', 'service.d.ts')
    check('S7 增强: 宿主 modelDirectories 锚在位（directoryFor(sessionId: SessionId): ModelDirectory）', directoryTypes.includes('directoryFor(sessionId: SessionId): ModelDirectory'))
    const llmIndex = hostRead('dsh-llm', 'lib', 'index.js')
    const llmMissing = LLM_ADAPTER_PROTO_BASELINE.filter((method) => !new RegExp(`\\b${method}\\(`).test(llmIndex))
    check('S7 增强: 宿主 LlmAdapter 契约方法源码在位（6 方法声明——快照基线可溯源）', llmMissing.length === 0, llmMissing)
    // 7d（FIX-048）InputState 形状锚（P10-④ 的静态半边：客户端输入快照桩形态
    //  锚定宿主源码）。FIX-048 根因 = 宿主 0.1.5-rc.1 M2 附件统一编址后
    //  InputState 以 attachmentIds 承载附件（image/file 统一），插件只读旧
    //  imageIds 字段 → imageCount 恒 0 → 贴图接管静默失效（EV-158 窗口）。
    //  正向锚 = attachmentIds 字段声明逐字在位；负向锚 = 宿主契约文件重现
    //  imageIds 字段声明即红（提示契约再漂移需人工评估——届时按实读重评双
    //  形态回落策略，非机械改码）。kind 解析面（方案 A 依赖）与 kind 判别字段
    //  一并锚定，与服务面消费（lib/client.js 的 conversation.resolveDraftAttachments）
    //  构成同源证据链。
    const inputContract = hostRead('dsh-client-ui-conversation', 'lib', 'types', 'client', 'contract', 'input.d.ts')
    const inputStateBlock = (inputContract.match(/export interface InputState \{[\s\S]*?\n\}/) ?? [''])[0]
    check('S7 增强: 宿主 InputState 含 attachmentIds 字段声明（FIX-048 正向锚——M2 统一编址形态）',
      inputStateBlock.includes('readonly attachmentIds: readonly DraftAttachmentId[]'))
    check('S7 增强: 宿主 InputState 契约文件零 imageIds 字段声明（FIX-048 负向锚——重现即红，契约再漂移需人工评估）',
      inputStateBlock !== '' && !/readonly imageIds\s*:/.test(inputContract))
    const conversationService = hostRead('dsh-client-ui-conversation', 'lib', 'types', 'client', 'service.d.ts')
    check('S7 增强: 宿主 conversation 服务声明 resolveDraftAttachments kind 解析面（FIX-048 方案 A 面锚）',
      conversationService.includes('resolveDraftAttachments(ids: readonly DraftAttachmentId[]): readonly ComposerAttachment[]'))
    const composerSlots = hostRead('dsh-client-ui-conversation', 'lib', 'types', 'client', 'contract', 'slots.d.ts')
    check("S7 增强: 宿主 ComposerAttachment kind 判别字段在位（FIX-048 kind 语义锚——kind: 'image' | kind: 'file'）",
      composerSlots.includes("kind: 'image'") && composerSlots.includes("kind: 'file'"))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX-055（REVIEW-FIX-054-R0 P2-1 / FIX-055-R0 P2-1 delta）：宿主 v4 合约**双组**。
// S8（row）与 S8b（logical）共用同一宿主模块解析（基线/可达性/缺包/入口/import
// 单点判定、skip 原因只打印一次）——避免两条解析路径与重复 skip 噪声（P5）。
const hostV4Contract = await (async () => {
  const V4_SINCE = '0.2.1'
  const V4_PACKAGE = 'dsh-session-format-v3-to-v4'
  if (!baselineIncludes(V4_SINCE)) {
    note(`S8/S8b 宿主 v4 合约: 所选基线 ${targetBaseline.id} < ${V4_SINCE}（v4 会话格式定型于 ${V4_SINCE}）→ 两组记 skip（基线分代；CI 三基线矩阵旧树不误红）`)
    return { status: 'skip' }
  }
  if (!hostTarget.root) {
    note('S8/S8b 宿主 v4 合约: 宿主靶子不可达（见上方「宿主靶子解析」行）→ 两组记 skip（BR-03：静态守卫不依赖宿主）')
    return { status: 'skip' }
  }
  const packageDir = join(hostTarget.root, V4_PACKAGE)
  if (!existsSync(packageDir)) {
    if (hostTreeIsComplete) {
      check(`S8/S8b 宿主 v4 合约: 完整宿主树（${hostTarget.origin}）缺 ${V4_PACKAGE} → 红（FIX-055-R0 P2-2：本机完整 npm 全局树应含该包）`, false, { root: hostTarget.root, origin: hostTarget.origin })
    } else {
      note(`S8/S8b 宿主 v4 合约: 靶子树不含 ${V4_PACKAGE}（${hostTarget.origin} = 显式/部分树；CI pinned 树 = 恰好 HOST_KEY_PACKAGES 8 包，刻意不含该包）→ 两组记 skip（包缺失 ≠ 契约漂移；本机完整树实跑）`)
    }
    return { status: 'skip' }
  }
  const entry = join(packageDir, 'lib', 'index.js')
  if (!existsSync(entry)) {
    check(`S8/S8b 宿主 v4 合约: 宿主包 ${V4_PACKAGE} 的 lib/index.js 在位（靶子 ${hostTarget.root}——包存在而入口消失 = 契约漂移）`, false, { expected: entry })
    return { status: 'fail' }
  }
  let module = null
  let importError = null
  try { module = await import(pathToFileURL(entry).href) } catch (error) { importError = error }
  check(`S8/S8b 宿主 v4 合约: 宿主模块 ${V4_PACKAGE} 可 import（真实入口 ${entry}）`, module !== null, { importError: importError === null ? null : String(importError?.message ?? importError) })
  return module === null ? { status: 'fail' } : { status: 'ok', module, entry }
})()

console.log('S8 宿主 v4 row admission（写入面守卫；FIX-055 P2-1——仅证明该行在入口/恢复判据上不被拒，逐消息 source() 受理证据由 S8b 承载）:')
if (hostV4Contract.status === 'ok') {
  const admission = hostV4Contract.module.assertV4RowAdmission
  check('S8 row admission: 宿主导出 assertV4RowAdmission（宿主 lib/index.js:1107 定义 / :1552 导出，0.2.1-rc.2 实读）', typeof admission === 'function', { exportedType: typeof admission })
  if (typeof admission === 'function') {
    const reminder = buildReminderMessage('FIX-055 row admission 探针')
    const row = { type: 'user/message', seq: 1, data: reminder }
    let accepted = true
    let acceptError = null
    try { admission(row) } catch (error) { accepted = false; acceptError = error }
    check('S8 正向: buildReminderMessage 产出的 user/message 行被真实 v4 row admission 接受，且 source 无 plugin 字段（row 入口对正向 kind 不触发 source()——受理证据见 S8b）', accepted && reminder?.source?.kind === `plugin:${PLUGIN_NAME}` && !Object.hasOwn(reminder?.source ?? {}, 'plugin'), { accepted, source: reminder?.source ?? null, acceptError: acceptError === null ? null : `${acceptError?.name}: ${acceptError?.message}` })
    let rejected = false
    let rejectName = null
    let rejectMessage = ''
    try { admission({ ...row, data: { ...reminder, source: { kind: 'plugin' } } }) } catch (error) { rejected = true; rejectName = error?.name ?? null; rejectMessage = String(error?.message ?? '') }
    check("S8 负向: source.kind='plugin' 被真实 v4 row admission 拒收（SessionFormatError 且错误含 'producer-owned source kind'——宿主 lib/index.js:126 一手判据）", rejected && rejectName === 'SessionFormatError' && rejectMessage.includes('producer-owned source kind'), { rejected, rejectName, rejectMessage })
  }
}

console.log('S8b 宿主 v4 logical admission（逐消息 source() 准入；FIX-055-R0 P2-1——assertReleasedV4Relationships → assertV4MessageSources → source()）:')
if (hostV4Contract.status === 'ok') {
  const relationships = hostV4Contract.module.assertReleasedV4Relationships
  check('S8b logical admission: 宿主导出 assertReleasedV4Relationships（宿主 lib/index.js:1027-1042 定义 / :1552 导出，0.2.1-rc.2 实读）', typeof relationships === 'function', { exportedType: typeof relationships })
  if (typeof relationships === 'function') {
    const reminder = buildReminderMessage('FIX-055 logical admission 探针')
    const artifactOf = (message) => ({
      header: { id: 'fix-055-logical-admission' },
      inheritedEventCount: 0,
      events: [{ seq: 0, type: 'user/message', surfaceOp: 'append', data: message }],
    })
    const knownEventTypes = new Set(['user/message'])
    let accepted = true
    let acceptError = null
    try { relationships(artifactOf(reminder), knownEventTypes) } catch (error) { accepted = false; acceptError = error }
    check(`S8b 正向: reminder user/message 行通过真实 logical admission（source() 真正接受 plugin:${PLUGIN_NAME}；source 无 plugin 字段）`, accepted && reminder?.source?.kind === `plugin:${PLUGIN_NAME}` && !Object.hasOwn(reminder?.source ?? {}, 'plugin'), { accepted, source: reminder?.source ?? null, acceptError: acceptError === null ? null : `${acceptError?.name}: ${acceptError?.message}` })
    const withoutSource = { ...reminder }
    delete withoutSource.source
    const negativeCases = [
      ['kind 缺失', withoutSource],
      ['kind 空串', { ...reminder, source: { kind: '' } }],
      ["kind='plugin'（旧完整形状 {kind,plugin}）", { ...reminder, source: { kind: 'plugin', plugin: PLUGIN_NAME } }],
    ]
    const outcomes = negativeCases.map(([label, message]) => {
      try { relationships(artifactOf(message), knownEventTypes); return { label, rejected: false, name: null, message: '' } }
      catch (error) { return { label, rejected: true, name: error?.name ?? null, message: String(error?.message ?? '') } }
    })
    const allRejected = outcomes.every((outcome) => outcome.rejected && outcome.name === 'SessionFormatError' && outcome.message.includes('producer-owned source kind'))
    check(`S8b 负向控制: ${outcomes.length} 种非法 source（kind 缺失 / kind 空串 / kind='plugin' 带旧 plugin 字段）全部被真实 logical admission 拒收（SessionFormatError + producer-owned source kind）`, allRejected, outcomes)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX-055：插件名单源守卫（REVIEW-FIX-054-R0 P3-2 收口）+ 宿主锚守卫（P3-1 收口）。
console.log('S9 插件名单源守卫（FIX-055 P3-2）+ 宿主锚守卫（FIX-055 P3-1）:')
{
  // 9a 插件名单源（静态，恒跑；PLUGIN_NAME 经 import 实模块取值，不复制字面量）。
  //    cordis.patch.yml 支持的布局（FIX-055-R0 P3-3）：块序列 `- id: <id>` 后紧跟
  //    `name: <name>`（当前非引号布局；值允许单/双引号标量，注释先剥离）。
  //    flow style / 嵌套 mapping 等其它形态不在支持面：解析失配 → 判红，需人工
  //    同步本解析器（fail-closed，不静默通过）。
  /** YAML 行注释剥离（`#` 至行尾；名字不含 `#`，故不做引号内例外）。 */
  const stripYamlComments = (source) => source.replace(/(^|\s)#[^\n]*/g, '$1')
  /** YAML 标量去引号（单/双引号包裹时取内层；非引号原样）。 */
  const yamlScalar = (raw) => {
    const value = raw.trim()
    if (value.length >= 2 && ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))) return value.slice(1, -1)
    return value
  }
  const indexSource = readLib('index.js')
  const indexName = /export const name = ['"]([^'"]+)['"]/.exec(indexSource)?.[1] ?? null
  const patchPluginNames = (() => {
    const names = new Map()
    let currentId = null
    for (const line of stripYamlComments(patch).split(/\r?\n/)) {
      const idMatch = /^\s*-\s*id:\s*(.+?)\s*$/.exec(line)
      if (idMatch !== null) { currentId = yamlScalar(idMatch[1]); continue }
      const nameMatch = /^\s*name:\s*(.+?)\s*$/.exec(line)
      if (nameMatch !== null && currentId !== null) names.set(currentId, yamlScalar(nameMatch[1]))
    }
    return names
  })()
  const reminder = buildReminderMessage('FIX-055 插件名单源守卫探针')
  check(`S9a 插件名单源: package.json name === PLUGIN_NAME（lib/prestep.js 实模块 import；${JSON.stringify(pkg.name)} vs ${JSON.stringify(PLUGIN_NAME)}）`, pkg.name === PLUGIN_NAME, { packageName: pkg.name, pluginName: PLUGIN_NAME })
  check(`S9a 插件名单源: lib/index.js 注册名 === PLUGIN_NAME（${JSON.stringify(indexName)} vs ${JSON.stringify(PLUGIN_NAME)}）`, indexName === PLUGIN_NAME, { indexName, pluginName: PLUGIN_NAME })
  check(`S9a 插件名单源: cordis.patch.yml 宿主行 router 插件名 === PLUGIN_NAME（${JSON.stringify(patchPluginNames.get('router') ?? null)}）`, patchPluginNames.get('router') === PLUGIN_NAME, { patchNames: Object.fromEntries(patchPluginNames), pluginName: PLUGIN_NAME })
  check("S9a 插件名单源: cordis.patch.yml 宿主行 tool-router 插件名 === '<PLUGIN_NAME>/tool'（子面名自同一单源派生）", patchPluginNames.get('tool-router') === `${PLUGIN_NAME}/tool`, { toolRouterName: patchPluginNames.get('tool-router') ?? null, expected: `${PLUGIN_NAME}/tool` })
  // 安装器第四/五源（FIX-055-R0 P3-2：只读 install.ps1 / install.sh，仅断言不改文件）
  const installPs1Source = readFileSync(join(ROOT_DIR, 'install.ps1'), 'utf8')
  const installShSource = readFileSync(join(ROOT_DIR, 'install.sh'), 'utf8')
  const installPs1Name = /^\$script:PluginName\s*=\s*['"]([^'"]+)['"]/m.exec(installPs1Source)?.[1] ?? null
  const installShMatch = /^PLUGIN\s*=\s*(?:"([^"]+)"|'([^']+)')/m.exec(installShSource)
  const installShName = installShMatch === null ? null : (installShMatch[1] ?? installShMatch[2])
  check(`S9a 插件名单源: install.ps1 $script:PluginName === PLUGIN_NAME（install.ps1 实读；${JSON.stringify(installPs1Name)} vs ${JSON.stringify(PLUGIN_NAME)}）`, installPs1Name === PLUGIN_NAME, { installPs1Name, pluginName: PLUGIN_NAME })
  check(`S9a 插件名单源: install.sh PLUGIN === PLUGIN_NAME（install.sh 实读；${JSON.stringify(installShName)} vs ${JSON.stringify(PLUGIN_NAME)}）`, installShName === PLUGIN_NAME, { installShName, pluginName: PLUGIN_NAME })
  check(`S9a reminder 源形态: buildReminderMessage 产物 source.kind === 'plugin:${PLUGIN_NAME}' 且无 plugin 字段（kind 单点派生 + 迁移同形）`, reminder?.source?.kind === `plugin:${PLUGIN_NAME}` && !Object.hasOwn(reminder?.source ?? {}, 'plugin'), { source: reminder?.source ?? null, expectedKind: `plugin:${PLUGIN_NAME}` })

  // 9b 宿主锚守卫：逐条对应 lib/prestep.js 注释引用的宿主锚；行号 = 0.2.1-rc.2 实读、
  //    与注释同源；窗口吸收宿主补丁级挪行；内容模式移出窗口 = 锚漂移 → 红
  //    （人工复核注释与基线后刷新，不机械改码）。
  const HOST_V4_ANCHORS = [
    { id: 'admission-source', package: 'dsh-session-format-v3-to-v4', file: 'lib/index.js', line: 126, window: 6, face: 'v4 source 准入拒收串（source()）', patterns: [/producer-owned source kind/, /value\["kind"\] === "plugin"/] },
    { id: 'producer-kind-fallback', package: 'dsh-session-format-v3-to-v4', file: 'lib/index.js', line: 92, window: 6, face: 'producerKind 未登记插件回落口径', patterns: [/function producerKind\(plugin, role\)/, /plugin:\$\{plugin\}/] },
    { id: 'rewrite-plugin-source', package: 'dsh-session-format-v3-to-v4', file: 'lib/index.js', line: 101, window: 8, face: '迁移丢弃 plugin 字段（rewritePluginSource）', patterns: [/function rewritePluginSource/, /key !== "plugin"/] },
    { id: 'persistence-inline-admission', package: 'dsh-session-persistence-jsonl', file: 'lib/worker.cjs', line: 11641, window: 6, face: '持久化内联同一 admission 判据', patterns: [/producer-owned source kind/, /value\["kind"\] === "plugin"/] },
    { id: 'message-source-no-catch-all', package: 'dsh-llm', file: 'lib/types/message.d.ts', line: 97, window: 5, face: 'MessageSourceMap 无 catch-all plugin kind 声明', patterns: [/no shared catch-all/, /`plugin` kind/] },
  ]
  const ANCHOR_SINCE = '0.2.1'
  if (!baselineIncludes(ANCHOR_SINCE)) {
    note(`S9b 宿主锚: 所选基线 ${targetBaseline.id} < ${ANCHOR_SINCE}（锚定型于 v4 会话格式代际）→ ${HOST_V4_ANCHORS.length} 条锚记 skip（基线分代；CI 三基线矩阵旧树不误红）`)
  } else if (!hostTarget.root) {
    note(`S9b 宿主锚: 宿主靶子不可达 → ${HOST_V4_ANCHORS.length} 条锚记 skip（BR-03：静态守卫不依赖宿主）`)
  } else {
    const anchorPackages = [...new Set(HOST_V4_ANCHORS.map((anchor) => anchor.package))]
    for (const packageName of anchorPackages.filter((name) => !existsSync(join(hostTarget.root, name)))) {
      const affected = HOST_V4_ANCHORS.filter((anchor) => anchor.package === packageName).map((anchor) => anchor.id)
      if (hostTreeIsComplete) {
        check(`S9b 宿主锚: 完整宿主树（${hostTarget.origin}）缺 ${packageName} → 红（FIX-055-R0 P2-2：本机完整 npm 全局树应含该包；${affected.join(' / ')}）`, false, { packageName, root: hostTarget.root, affected })
      } else {
        note(`S9b 宿主锚: 靶子树不含 ${packageName}（${hostTarget.origin} = 显式/部分树；CI pinned 树 = 恰好 HOST_KEY_PACKAGES 8 包，刻意不含该包）→ ${affected.join(' / ')} 记 skip（本机完整 npm 全局树实跑；包缺失 ≠ 锚漂移）`)
      }
    }
    for (const anchor of HOST_V4_ANCHORS) {
      const packageDir = join(hostTarget.root, anchor.package)
      if (!existsSync(packageDir)) continue // 已按包记 skip（CI pinned 树形态）
      const anchorFile = join(packageDir, anchor.file)
      if (!existsSync(anchorFile)) {
        check(`S9b 宿主锚: ${anchor.id} 宿主文件在位（${anchor.package}/${anchor.file}——包存在而文件消失 = 契约漂移）`, false, { expected: anchorFile })
        continue
      }
      const lines = readFileSync(anchorFile, 'utf8').split(/\r?\n/)
      const start = Math.max(1, anchor.line - anchor.window)
      const end = Math.min(lines.length, anchor.line + anchor.window)
      const windowLines = lines.slice(start - 1, end)
      const missing = anchor.patterns.filter((pattern) => !windowLines.some((line) => pattern.test(line)))
      check(`S9b 宿主锚: ${anchor.id}（${anchor.face}）命中 ${anchor.package}/${anchor.file} 行 ${start}-${end} 窗口（期望行 ${anchor.line}；${anchor.patterns.length} 项内容模式全部在场——窗口外即锚漂移）`, missing.length === 0, { expectedLine: anchor.line, window: [start, end], fileLines: lines.length, missingPatterns: missing.map((pattern) => String(pattern)), actualWindow: windowLines.map((line, index) => `${start + index}: ${line.trim().slice(0, 160)}`) })
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(failures === 0
  ? `\nALL HOST CONTRACT GUARD TESTS PASSED (${passed} assertions${skipped > 0 ? `, ${skipped} skipped` : ''})`
  : `\n${failures} FAILURE(S) (${passed} passed${skipped > 0 ? `, ${skipped} skipped` : ''})`)
process.exit(failures === 0 ? 0 : 1)
