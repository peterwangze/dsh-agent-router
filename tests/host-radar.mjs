/**
 * ARCH-005 R4 — 升级雷达判别套件（设计 §6 R4 行 / §2-B 四维-c / NEW-1 T-6 吸收）。
 *
 * 看护对象：`scripts/host-radar-probe.mjs`（雷达逻辑单一实现路径——workflow
 * `.github/workflows/host-radar.yml` 只经 CLI 编排，不复制判定逻辑）三模式：
 *  1. probe 模式（--host-source）：对指定宿主树产**四类 diff 报告**工件 JSON
 *     （锚 miss / 白名单增删 / schema 字段 / 包表版本），**exit 0 探测不门控**
 *     （发现差异只产报告不开门控——差异项多少都不红；exit 非零 = 自身故障，
 *     P8 可观测）；基线数据**单源消费**（tests/host-version-snapshot.mjs 的
 *     HOST_BASELINE_REGISTRY 文本提取 + tests/host-contract.mjs 契约常量提取 +
 *     lib/host-abi/events.js 镜像直接 import——零第三份基线拷贝，P5）；
 *  2. dist-tags 模式（--dist-tags / --dist-tags-file）：**全枚举**比对（latest +
 *     next/alpha 等预发布 tag 并集——设计 F-5 处置：宿主 rc/alpha 快速迭代是
 *     既定部署通道；latest-only 对 0.2.1-alpha.x 流动失明）；--seen 承载
 *     「已告警版本」状态（防每周重复 issue）；
 *  3. heartbeat 模式（--heartbeat）：连续 N 次未跑 → stale 判定（雷达心跳
 *     可观测——防雷达静默死亡）。workflow 侧状态载体 = workflow 运行历史（gh run
 *     list 最近 success 的 updatedAt）+ issue 标题前缀 `host-radar: <version> —`；
 *     repo variable 选型经审查裁定不可执行（GITHUB_TOKEN 无 Actions Variables
 *     权限），见 host-radar.yml 选型注记。
 *
 * NEW-1 / T-6 吸收（MUST 判别）：T-6 现场证 = 主包版本不变（0.2.0-rc.2）但
 * 嵌套树静默重写（schemastery 3.18.4→3.18.5，npm 零留痕）——纯 dist-tags 比对
 * 对该形态**永不触发**。选型 (a) probe 周频无条件运行（对主基线版本新装一棵
 * fresh 树跑 probe，包表 diff 对 registry 记录值比对）：本套件以「同 dsh 主版本、
 * schemastery 漂移」双树判别证明检测力。选型依据（registry 端一手实读，
 * 2026-10-17）：`npm view @deepseek-ai/dsh@<ver> dependencies` 返回的是**声明
 * range**（`~3.18.4`），同一已发布版本不可变 ⇒ 备选 (b)「registry 侧包表 diff」
 * 对 T-6 形态（range 内解析漂移）恒零 diff——不可选。
 *
 * 判别夹具（P10-④ 同源纪律）：绿树 = 按 0.2.0-rc.2 主基线形态合成的最小宿主树
 * （事件表自 lib/host-abi/events.js 镜像 import——单一声明源；schema 顶层字段
 * /锚符号/方法名/包版本按主基线常量手写，**绿树 probe 零 diff 断言即机器锁**
 * ——权威常量漂移 ⇒ 绿树失配 ⇒ 本套件红，强制夹具同步，F-J「双份机器锁定」
 * 先例形态）；变异树 = 绿树单点突变（每判据一个突变面）。S7 7d 家族针
 * （InputState/resolveDraftAttachments/kind 判别字段——host-contract.mjs 内联
 * 字面量，不可标记提取）在 probe 侧的拷贝由本套件「机器锁」判据锚定其权威源
 * （tests/host-contract.mjs 源文本逐字在位——单侧漂移即红）。
 *
 * 判别性（红/绿演示口径）：
 *  - 绿树零 diff（负控）；T-6 形态双树（schemastery 3.18.5→3.18.6，dsh 主版本
 *    不变）→ 包表恰 1 mismatch 且其余三类零 diff（**判别力优先**——总 diff 数
 *    必须精确到 1，证明差异定位不靠超集计数）；
 *  - 白名单/schema/锚各突变面精确点名；全突变树 exit 0（探测不门控）；
 *  - P8 fail-loud：宿主树不可达 / dist-tags 非 JSON / registry marker 缺失 /
 *    未知 --baseline / 非法 --last-seen → 全部 exit 1（雷达自身故障可观测，
 *    不静默）。
 *
 * 独立入口：node tests/host-radar.mjs（exit 0/1）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FORWARDED_EVENT_ALLOWLIST } from '../lib/host-abi/events.js'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(ROOT_DIR, 'scripts', 'host-radar-probe.mjs')

let failures = 0
let passed = 0
const check = (label, condition, detail) => {
  if (condition) { passed++; console.log(`  ok  ${label}`) }
  else {
    failures++
    console.error(`FAIL  ${label}${detail === undefined ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`)
  }
}

// 套件封闭性（ARCH-005-R4F）：probe 全部 env 消费面 = DSH_HOST_SOURCE/DSH_BASELINE
// 恰两个（scripts/host-radar-probe.mjs 全文 grep process.env 实证：DSH_HOST_SOURCE
// 两处——模式判定与靶子回落；DSH_BASELINE 一处——基线选择；无第三个）。spawn env
// 先剥离这两个宿主继承项再合并用例显式传入：套件用例假设「零 DSH_* 继承、靶子/基线
// 全由用例显式指定」，CI 基线矩阵 job 的 job 级 DSH_HOST_SOURCE/DSH_BASELINE 注入
// （R3 门控参数化——env 渗入无关用例曾致 0.1.5 job 11 红 / 0.2.0 job 2 红）由此被
// 挡在套件外；env 同效用例的显式传入在净化之后合并——机制判别不削弱。净化单点在
// 此，不逐用例散落。
const PROBE_ENV_KEYS = ['DSH_HOST_SOURCE', 'DSH_BASELINE']

/** 跑雷达脚本（子进程——CLI 是 workflow 的唯一消费面，测试同一形态）。 */
const runRadar = (args, env = {}) => {
  const sanitized = { ...process.env }
  for (const key of PROBE_ENV_KEYS) delete sanitized[key]
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 120_000, env: { ...sanitized, ...env } })
  let json = null
  try { json = JSON.parse(result.stdout) } catch { /* 非 JSON 输出由各判据自行断言 */ }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json }
}

// ── 合成宿主树（绿树 = 0.2.1-rc.2 主基线形态；mutate 单点突变）────────────────
// schema 顶层字段 / LlmAdapter 方法 / 锚符号 / 7d 针：按主基线常量手写——绿树
// 零 diff 断言 = 夹具与权威常量的机器锁（见文件头「判别夹具」段；ARCH-006 随
// 0.2.1-rc.2 主基线刷新：包表版本 0.2.0-rc.2→0.2.1-rc.2 + llm_listConfigurable
// Providers schema 6→9 字段 + 事件表随镜像 import 自动 +1）。
const KEY_DSH_PACKAGES = [
  'dsh', 'dsh-api-remotes', 'dsh-api-session-controller', 'dsh-client-ui-model-selection',
  'dsh-client-ui-conversation', 'dsh-llm', 'dsh-client-ui-settings', 'dsh-client-locale',
]
const LLM_ADAPTER_METHODS = ['providerInfo', 'providerRetryPolicy', 'imageRequestPricing', 'listModels', 'resolveModel', 'prepareCall']
const SCHEMA_FIELDS = {
  llm_listConfigurableProviders_result: ['provider', 'displayName', 'settingsNs', 'settingsPath', 'declared', 'defaultBaseURL', 'baseURLEnv', 'nativeAuth', 'error'],
  llm_listProviders_result: ['id', 'name'],
  session_modelCatalog_result: ['default', 'routableProviders', 'groups', 'failures'],
  settings_describe_result: ['writable', 'hasDocument', 'namespaces'],
  credentials_describe_result: ['configured', 'source', 'writable'],
  agentPresets_list_result: ['presets'],
}
const NEEDLE_SELECT_MODEL = 'selectModel(request)'
const NEEDLE_AGENT = ["selectionFor(agent)", "stateOf(agent.session, 'modelSelection')", 'projectionState.pending']
const NEEDLE_DIRECTORY_FOR = 'directoryFor(sessionId: SessionId): ModelDirectory'
const NEEDLE_ATTACHMENT_IDS = 'readonly attachmentIds: readonly DraftAttachmentId[]'
const NEEDLE_RESOLVE_DRAFT = 'resolveDraftAttachments(ids: readonly DraftAttachmentId[]): readonly ComposerAttachment[]'

/**
 * 构造最小合成宿主 scope 树（@deepseek-ai 目录形态——pack 树/扁平装树同形）。
 * mutate 支持面（每面 = 一类判据的突变点）：
 *  - dshVersion / dshPackagesVersion / cordis / schemastery：包表版本漂移（T-6 形态）
 *  - dropPackages: [name]：包缺席（pack 树缺 cordis/schemastery 形态 → status absent）
 *  - dropEvents: [event] / addEvents: [event]：白名单增删
 *  - schemaOverrides: { symbol: fields[] }：schema 顶层字段漂移
 *  - dropFiles: [scope 相对路径]：锚/判据面文件缺失（锚 miss）
 *  - dropAgentSymbols: [needle]：锚符号缺失（捏造符号 miss 形态）
 *  - llmMethods: n：LlmAdapter 方法声明数（< 6 → 方法 miss）
 *  - inputState: 'green' | 'imageIds'：InputState 7d 针形态（负向锚命中）
 */
function buildTree(dir, mutate = {}) {
  const scope = join(dir, '@deepseek-ai')
  const write = (relpath, content) => {
    const path = join(scope, relpath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  const pkgJson = (name, version) => JSON.stringify({ name: `@deepseek-ai/${name}`, version }, null, 2)
  const mainVersion = mutate.dshVersion ?? '0.2.1-rc.2'
  const packagesVersion = mutate.dshPackagesVersion ?? '0.2.1-rc.2'
  const dropPackages = new Set(mutate.dropPackages ?? [])
  for (const name of KEY_DSH_PACKAGES) {
    if (dropPackages.has(name)) continue
    write(`${name}/package.json`, pkgJson(name, name === 'dsh' ? mainVersion : packagesVersion))
  }
  for (const [name, version] of [['cordis', mutate.cordis ?? '4.0.5'], ['schemastery', mutate.schemastery ?? '3.18.5']]) {
    if (dropPackages.has(name)) continue
    write(`${name}/package.json`, pkgJson(name, version))
  }
  // dsh-api-remotes：schema 声明面 + 事件表
  const schemas = Object.entries({ ...SCHEMA_FIELDS, ...(mutate.schemaOverrides ?? {}) })
    .map(([symbol, fields]) => `const ${symbol}$schema = object({${fields.map((field) => `"${field}": string(),`).join('')}})`)
    .join('\n')
  write('dsh-api-remotes/lib/client.js', `${schemas}\n`)
  const events = [
    ...FORWARDED_EVENT_ALLOWLIST.filter((event) => !(mutate.dropEvents ?? []).includes(event)),
    ...(mutate.addEvents ?? []),
  ]
  write('dsh-api-remotes/lib/types/remote-events.js', `${events.map((event) => `event: '${event}',`).join('\n')}\n`)
  // dsh-llm：LlmAdapter 方法声明面
  write('dsh-llm/lib/index.js', `${LLM_ADAPTER_METHODS.slice(0, mutate.llmMethods ?? LLM_ADAPTER_METHODS.length).map((method) => `  ${method}(request) {}`).join('\n')}\n`)
  // S2/S7 锚面（dsh-api-session-controller / dsh-client-ui-model-selection）
  write('dsh-api-session-controller/lib/index.js', `  ${NEEDLE_SELECT_MODEL} {}\n`)
  write('dsh-api-session-controller/lib/types/agent.js', `${NEEDLE_AGENT.filter((needle) => !(mutate.dropAgentSymbols ?? []).includes(needle)).join('\n')}\n`)
  write('dsh-client-ui-model-selection/lib/types/client/service.d.ts', `  ${NEEDLE_DIRECTORY_FOR}\n`)
  write('dsh-client-ui-model-selection/lib/types/client/directory.d.ts', '  load()\n')
  // S7 7d 面（dsh-client-ui-conversation 契约文件）
  write('dsh-client-ui-conversation/lib/types/client/contract/input.d.ts', mutate.inputState === 'imageIds'
    ? 'export interface InputState {\n  readonly imageIds: readonly string[];\n}\n'
    : `export interface InputState {\n  ${NEEDLE_ATTACHMENT_IDS};\n}\n`)
  write('dsh-client-ui-conversation/lib/types/client/service.d.ts', `  ${NEEDLE_RESOLVE_DRAFT}\n`)
  write('dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts', "  kind: 'image'\n  kind: 'file'\n")
  for (const relpath of mutate.dropFiles ?? []) {
    rmSync(join(scope, relpath), { force: true, recursive: true })
  }
  return scope
}

const mkdtemp = (label) => {
  const dir = join(tmpdir(), `arch005-r4-${label}-${process.pid}-${Date.now().toString(36)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

console.log('R4 雷达 probe 模式（四类 diff 报告 + 探测不门控 + 判别力）:')
{
  // 负控：绿树（主基线形态）→ 四类全零 diff、exit 0。
  // 该断言同时是「夹具 × 权威常量」机器锁：注册表/白名单/schema/锚任一漂移 ⇒ 红。
  const green = buildTree(mkdtemp('green'))
  const greenRun = runRadar(['--host-source', green])
  check('probe: 绿树（0.2.1-rc.2 形态）四类零 diff + exit 0（负控 + 夹具机器锁）',
    greenRun.status === 0 && greenRun.json?.summary?.totalDiffs === 0, { status: greenRun.status, summary: greenRun.json?.summary, stderr: greenRun.stderr })
  check('probe: 绿树包表 10 项全部 match（8 关键包 + cordis + schemastery）',
    greenRun.json?.packageTable && Object.values(greenRun.json.packageTable).length === 10
      && Object.values(greenRun.json.packageTable).every((entry) => entry?.status === 'match'),
    greenRun.json?.packageTable)
  check('probe: 报告载基线档案项（primary 0.2.1 单源提取——无版本常量副本）',
    greenRun.json?.baseline?.id === '0.2.1' && greenRun.json?.baseline?.status === 'primary'
      && greenRun.json?.baseline?.dsh === '0.2.1-rc.2' && greenRun.json?.baseline?.schemastery === '3.18.5',
    greenRun.json?.baseline)

  // T-6 形态判别（NEW-1 MUST）：dsh 主版本不变、schemastery 范围内漂移 → 恰 1 包表 mismatch。
  const t6 = buildTree(mkdtemp('t6'), { schemastery: '3.18.6' })
  const t6Run = runRadar(['--host-source', t6])
  check('probe: T-6 形态（dsh 主版本不变 + schemastery 3.18.5→3.18.6 树漂移）被检测——恰 1 项包表 mismatch 且精确点名 schemastery（NEW-1 吸收判别）',
    t6Run.status === 0 && t6Run.json?.summary?.packageMismatches === 1 && t6Run.json?.summary?.totalDiffs === 1
      && t6Run.json?.packageTable?.schemastery?.status === 'mismatch' && t6Run.json?.packageTable?.schemastery?.version === '3.18.6',
    { status: t6Run.status, summary: t6Run.json?.summary, schemastery: t6Run.json?.packageTable?.schemastery })
  check('probe: T-6 形态其余三类零 diff（判别力——不靠超集计数蒙混）',
    t6Run.json?.summary?.anchorMisses === 0 && t6Run.json?.summary?.eventHostOnly === 0
      && t6Run.json?.summary?.eventMirrorOnly === 0 && t6Run.json?.summary?.schemaFacesWithDiff === 0,
    t6Run.json?.summary)
  // T-6b：dsh-* 漂移形态（主包不变、子包换代）
  const t6b = buildTree(mkdtemp('t6b'), { dshPackagesVersion: '0.2.1-alpha.5' })
  const t6bRun = runRadar(['--host-source', t6b])
  check('probe: T-6b 形态（dsh 主包不变 + dsh-* 0.2.1-alpha.5 漂移）7 项包表 mismatch 精确点名（dsh 主包 match）',
    t6bRun.status === 0 && t6bRun.json?.summary?.packageMismatches === 7 && t6bRun.json?.packageTable?.dsh?.status === 'match',
    { summary: t6bRun.json?.summary, dsh: t6bRun.json?.packageTable?.dsh })

  // 白名单增删（F-D 形态）：宿主侧除名 1 项 + 新增 1 项 → 双向精确点名。
  const dropped = 'credentials/reference-updated'
  const evRun = runRadar(['--host-source', buildTree(mkdtemp('events'), { dropEvents: [dropped], addEvents: ['host/new-event'] })])
  check('probe: 白名单漂移双向点名（宿主除名 credentials/reference-updated → mirrorOnly；宿主新增 host/new-event → hostOnly）',
    evRun.json?.forwardedEvents?.mirrorOnly?.length === 1 && evRun.json.forwardedEvents.mirrorOnly[0] === dropped
      && evRun.json?.forwardedEvents?.hostOnly?.length === 1 && evRun.json.forwardedEvents.hostOnly[0] === 'host/new-event',
    evRun.json?.forwardedEvents)

  // schema 字段漂移（agentPresets 0.1.5 形态 {presets,authorable} → hostOnly authorable + baselineOnly presets）
  const scRun = runRadar(['--host-source', buildTree(mkdtemp('schema'), { schemaOverrides: { agentPresets_list_result: ['authorable'] } })])
  check('probe: schema 顶层字段漂移双向点名（agentPresets: 宿主 {authorable} vs 白名单 {presets} → hostOnly=[authorable] baselineOnly=[presets]）',
    scRun.json?.wireSchemas?.['agentPresets.list']?.hostOnly?.length === 1 && scRun.json.wireSchemas['agentPresets.list'].hostOnly[0] === 'authorable'
      && scRun.json?.wireSchemas?.['agentPresets.list']?.baselineOnly?.length === 1 && scRun.json.wireSchemas['agentPresets.list'].baselineOnly[0] === 'presets'
      && scRun.json?.summary?.schemaFacesWithDiff === 1,
    { face: scRun.json?.wireSchemas?.['agentPresets.list'], summary: scRun.json?.summary })

  // 锚 miss：agent.js 缺失（S2 锚 face 1/2 判据面）+ LlmAdapter 5/6 方法 + InputState imageIds 复活
  const anchorTree = buildTree(mkdtemp('anchors'), {
    dropFiles: ['dsh-api-session-controller/lib/types/agent.js'],
    llmMethods: 5,
    inputState: 'imageIds',
  })
  const anRun = runRadar(['--host-source', anchorTree])
  const agentFaces = (anRun.json?.anchors?.shapeAnchors ?? []).filter((face) => face.expectPackage === 'dsh-api-session-controller' && face.missingFiles.some((file) => file.includes('agent.js')))
  check('probe: 锚 miss 点名（agent.js 缺失 → 该包两条形状锚记 missingFiles，agent.js 内符号 miss 逐项点名）',
    agentFaces.length === 2
      && agentFaces.some((face) => face.missingSymbols.includes('dsh-api-session-controller/lib/types/agent.js :: selectionFor('))
      && agentFaces.some((face) => face.missingSymbols.includes('dsh-api-session-controller/lib/types/agent.js :: stateOf(')),
    anRun.json?.anchors?.shapeAnchors)
  check('probe: LlmAdapter 方法 miss 点名（5/6 声明 → missing=[prepareCall]）',
    anRun.json?.anchors?.llmAdapter?.missing?.length === 1 && anRun.json.anchors.llmAdapter.missing[0] === 'prepareCall',
    anRun.json?.anchors?.llmAdapter)
  check('probe: InputState 7d 负向锚命中（imageIds 复活 + attachmentIds miss + imageIdsResurrected=true）',
    anRun.json?.anchors?.inputState?.attachmentIds === false && anRun.json?.anchors?.inputState?.imageIdsResurrected === true,
    anRun.json?.anchors?.inputState)

  // 探测不门控（硬门槛）：四类全突变 → 仍 exit 0（差异只产报告；非零 = 自身故障）。
  const allRun = runRadar(['--host-source', buildTree(mkdtemp('alldiff'), {
    schemastery: '3.18.6', dropEvents: [dropped], addEvents: ['host/new-event'],
    schemaOverrides: { agentPresets_list_result: ['authorable'] }, llmMethods: 4, inputState: 'imageIds',
  })])
  check('probe: 全突变树 exit 0 + 四类 diff 全非零（探测不门控——probe 永不因差异开门控红）',
    allRun.status === 0 && allRun.json?.summary?.anchorMisses > 0 && allRun.json.summary.eventMirrorOnly > 0
      && allRun.json.summary.eventHostOnly > 0 && allRun.json.summary.schemaFacesWithDiff > 0 && allRun.json.summary.packageMismatches > 0,
    { status: allRun.status, summary: allRun.json?.summary })

  // 包缺席形态（R3 pack 树无 cordis/schemastery）→ status=absent（≠ mismatch，不计入告警面）
  const absentRun = runRadar(['--host-source', buildTree(mkdtemp('absent'), { dropPackages: ['cordis', 'schemastery'] })])
  check('probe: 包缺席记 absent 而非 mismatch（pack 树形态不误报漂移；absent 单列可观测）',
    absentRun.status === 0 && absentRun.json?.packageTable?.cordis?.status === 'absent' && absentRun.json?.packageTable?.schemastery?.status === 'absent'
      && absentRun.json?.summary?.packageMismatches === 0 && absentRun.json?.summary?.packageAbsent === 2,
    { summary: absentRun.json?.summary, cordis: absentRun.json?.packageTable?.cordis })

  // --out 工件写盘（workflow 报告工件 = 该文件）
  const outFile = join(mkdtemp('out'), 'report.json')
  const outRun = runRadar(['--host-source', green, '--out', outFile])
  const written = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null
  check('probe: --out 报告工件落盘且与 stdout JSON 同构（workflow artifact 形态）',
    outRun.status === 0 && written !== null && written.summary?.totalDiffs === 0 && written.baseline?.id === '0.2.1',
    { exists: existsSync(outFile) })

  // DSH_HOST_SOURCE / DSH_BASELINE 环境变量机制（R3 同语义复用）
  const envRun = runRadar([], { DSH_HOST_SOURCE: green })
  check('probe: DSH_HOST_SOURCE 环境变量与 --host-source 同效（R3 机制复用——workflow/本地共用同一形态）',
    envRun.status === 0 && envRun.json?.summary?.totalDiffs === 0, { status: envRun.status, stderr: envRun.stderr })
  const frozenTree = buildTree(mkdtemp('frozen'), { dshVersion: '0.1.5-rc.1', dshPackagesVersion: '0.1.5-rc.2', cordis: '4.0.2', schemastery: '3.18.2' })
  const frozenEnvRun = runRadar(['--host-source', frozenTree], { DSH_BASELINE: '0.1.5' })
  const frozenPrimaryRun = runRadar(['--host-source', frozenTree])
  check('probe: DSH_BASELINE=0.1.5（frozen）→ 包表按 frozen 档案项判零 mismatch（R3 参数化语义复用）',
    frozenEnvRun.status === 0 && frozenEnvRun.json?.summary?.packageMismatches === 0 && frozenEnvRun.json?.baseline?.id === '0.1.5',
    { summary: frozenEnvRun.json?.summary, baseline: frozenEnvRun.json?.baseline })
  check('probe: 同 frozen 树默认 primary → 包表 10 项 mismatch（基线选择判别——不因环境变量缺省而失判）',
    frozenPrimaryRun.json?.summary?.packageMismatches === 10, frozenPrimaryRun.json?.summary)
  check('probe: 未知 --baseline → exit 1 fail-closed（P8：基线切换失败可观测，不静默回退——R3 §0b 同语义）',
    runRadar(['--host-source', green, '--baseline', 'bogus']).status === 1)
}

console.log('R4 雷达 dist-tags 模式（全枚举——F-5：预发布通道不失明）:')
{
  // 实测形态 stub（2026-10-17 registry 实跑捕获：next/latest=0.2.0-rc.2 + alpha=0.2.1-alpha.5；
  // ARCH-006 后 primary 已 0.2.1-rc.2 在册——alpha 通道 0.2.1-alpha.5 仍 ∉ 档案 dsh 值集）
  const liveForm = '{"next":"0.2.0-rc.2","latest":"0.2.0-rc.2","alpha":"0.2.1-alpha.5"}'
  const live = runRadar(['--dist-tags', liveForm])
  check('dist-tags: 实测形态全枚举（next/latest/alpha 三 tag 并集）→ alpha 通道 0.2.1-alpha.5 判为新版本（latest-only 查询将失明——F-5 判别）',
    live.status === 0 && live.json?.newVersions?.length === 1 && live.json.newVersions[0] === '0.2.1-alpha.5'
      && live.json?.tags?.alpha === '0.2.1-alpha.5' && live.json?.primary?.dsh === '0.2.1-rc.2',
    { status: live.status, json: live.json })
  check('dist-tags: 已告警版本经 --seen 抑制（防周频重复 issue）',
    (() => { const r = runRadar(['--dist-tags', liveForm, '--seen', '["0.2.1-alpha.5"]']); return r.status === 0 && r.json?.newVersions?.length === 0 })(),
    { json: runRadar(['--dist-tags', liveForm, '--seen', '["0.2.1-alpha.5"]']).json })
  check('dist-tags: 档案在册版本（frozen 重挂 tag）不算新版本',
    (() => { const r = runRadar(['--dist-tags', '{"legacy":"0.1.5-rc.1"}']); return r.status === 0 && r.json?.newVersions?.length === 0 })())
  check('dist-tags: --dist-tags-file 文件形态与内联同效（workflow 落盘消费面）',
    (() => {
      const file = join(mkdtemp('dtags'), 'dist-tags.json')
      writeFileSync(file, liveForm)
      const r = runRadar(['--dist-tags-file', file])
      return r.status === 0 && r.json?.newVersions?.length === 1 && r.json.newVersions[0] === '0.2.1-alpha.5'
    })())
  check('dist-tags: 非 JSON 输入 → exit 1（P8：npm 不可达/坏数据自身故障可观测，不静默）',
    runRadar(['--dist-tags', 'not-json']).status === 1)
}

console.log('R4 雷达 heartbeat 模式（连续 N 次未跑自警）:')
{
  const now = '2026-10-17T00:00:00.000Z'
  const daysAgo = (n) => new Date(new Date(now).getTime() - n * 86_400_000).toISOString()
  const hb = (lastSeen, extra = []) => runRadar(['--heartbeat', '--last-seen', lastSeen, '--now', now, ...extra])
  check('heartbeat: gap 20 天 > 阈值 14 天（周频 × 2 次）→ stale=true（雷达静默死亡检测）',
    (() => { const r = hb(daysAgo(20)); return r.status === 0 && r.json?.stale === true && r.json?.gapDays > 14 })(), hb(daysAgo(20)).json)
  check('heartbeat: gap 3 天 → stale=false（正常周频内）',
    (() => { const r = hb(daysAgo(3)); return r.status === 0 && r.json?.stale === false })())
  check('heartbeat: never（首跑无状态）→ stale=false（首跑不告警）',
    (() => { const r = hb('never'); return r.status === 0 && r.json?.stale === false })())
  check('heartbeat: --interval-days/--misses 参数化（日频应急口径 gap 5 天 > 2×2=4 天 → stale）',
    (() => { const r = hb(daysAgo(5), ['--interval-days', '2', '--misses', '2']); return r.status === 0 && r.json?.stale === true })())
  check('heartbeat: 非法 --last-seen → exit 1（P8 fail-loud）',
    hb('yesterday').status === 1)
}

console.log('R4 雷达 P8 fail-loud（雷达自身故障形态可观测——不静默降级）:')
{
  check('P8: --host-source 指向非宿主树（无 dsh-api-remotes/lib/client.js）→ exit 1 + 明确错误行',
    (() => {
      const r = runRadar(['--host-source', mkdtemp('empty')])
      return r.status === 1 && /host tree/i.test(r.stderr)
    })())
  check('P8: DSH_HOST_SOURCE/DSH_BASELINE 均缺省 + 无 --host-source → exit 1（probe 必须显式瞄准——不自动猜测靶子，F-A 教训）',
    (() => { const r = runRadar([]); return r.status === 1 && /host-source/i.test(r.stderr) })())
  check('P8: registry marker 缺失（--repo 指向无 HOST_BASELINE_REGISTRY 的仓库）→ exit 1 + marker 名点名（R3 marker 守卫形态对齐）',
    (() => {
      const repo = mkdtemp('bogusrepo')
      mkdirSync(join(repo, 'tests'), { recursive: true })
      writeFileSync(join(repo, 'tests/host-version-snapshot.mjs'), 'export const NOTHING = true\n')
      const r = runRadar(['--repo', repo, '--host-source', 'X:/nonexistent'])
      return r.status === 1 && /HOST_BASELINE_REGISTRY/.test(r.stderr)
    })())
  check('P8: 未知模式（无 --host-source/--dist-tags/--heartbeat）→ exit 1 usage（不静默空跑）',
    runRadar(['--baseline', 'primary']).status === 1)
}

console.log('R4 机器锁（probe 内联针 ↔ host-contract.mjs 权威源——单侧漂移即红，F-J 先例形态）:')
{
  const probeSource = readFileSync(SCRIPT, 'utf8')
  const contractSource = readFileSync(join(ROOT_DIR, 'tests', 'host-contract.mjs'), 'utf8')
  // S7 7d 家族针：host-contract.mjs 内联字面量（不可标记提取）→ probe 侧拷贝逐字锁定权威源。
  // （directoryFor/selectionFor 等 7c 针经 HOST_SHAPE_ANCHORS 提取消费——无拷贝面，不入锁。）
  const lockedNeedles = [
    NEEDLE_ATTACHMENT_IDS,
    NEEDLE_RESOLVE_DRAFT,
    "kind: 'image'",
    "kind: 'file'",
  ]
  for (const needle of lockedNeedles) {
    check(`机器锁: 7d/7c 针「${needle}」在 probe 与 host-contract.mjs 双侧逐字在位（单侧漂移即红）`,
      probeSource.includes(needle) && contractSource.includes(needle), { inProbe: probeSource.includes(needle), inContract: contractSource.includes(needle) })
  }
  // 提取 marker 单源：probe 与 ci.yml（R3）共用同一 marker 串——锁向权威注册表文件本身。
  check('机器锁: registry 提取 marker 与权威文件/host-contract 提取形态一致（HOST_BASELINE_REGISTRY 单源——第三份基线拷贝为零）',
    probeSource.includes('const HOST_BASELINE_REGISTRY = Object.freeze(')
      && readFileSync(join(ROOT_DIR, 'tests/host-version-snapshot.mjs'), 'utf8').includes('const HOST_BASELINE_REGISTRY = Object.freeze(')
      && contractSource.includes('const HOST_BASELINE_REGISTRY = Object.freeze('))
  check('机器锁: probe 消费的契约常量提取 marker 与 host-contract.mjs 声明逐字一致（HOST_KEY_PACKAGES/HOST_SHAPE_ANCHORS/WIRE_SCHEMA_WHITELIST/LLM_ADAPTER_PROTO_BASELINE）',
    ['const HOST_KEY_PACKAGES = [', 'const HOST_SHAPE_ANCHORS = [', 'WIRE_SCHEMA_WHITELIST = {', 'const LLM_ADAPTER_PROTO_BASELINE = [']
      .every((marker) => probeSource.includes(marker) && contractSource.includes(marker)))
}

console.log('R4 workflow 编排面守卫（host-radar.yml 状态载体可行性——GITHUB_TOKEN 能力实测，P9）:')
{
  const yml = readFileSync(join(ROOT_DIR, '.github', 'workflows', 'host-radar.yml'), 'utf8')
  // 载体回归锁：repo variable 形态对 GITHUB_TOKEN 不可执行（GitHub 显式阻断——读写均
  // 403 "Resource not accessible by integration"，`actions: write` 不覆盖 Actions
  // Variables API；Variables 读写是 GitHub App / fine-grained PAT 专属权限。实证 =
  // GitHub community discussion #146874 / Stack Overflow 77882485，2026-10-17 复核）。
  // 回退该载体 = stamp 步每跑必红 + seen 读取被 403 误当首跑 → 每周重复 issue。
  check('workflow: 状态载体零 repo variable 残留（GITHUB_TOKEN 不可访问 Actions Variables API——写入每跑必红、读取静默重置；issue 标题/运行历史载体可执行性实证）',
    !yml.includes('actions/variables') && !yml.includes('HOST_RADAR_LAST_SEEN') && !yml.includes('HOST_RADAR_SEEN_VERSIONS'),
    { hasVariablesApi: yml.includes('actions/variables') })
  check('workflow: 心跳 last-seen 载体 = workflow 运行历史（gh run list 最近 success 的 updatedAt——平台侧戳记，零写入零逐出，失败运行天然不刷新）',
    yml.includes('gh run list --workflow host-radar.yml') && yml.includes('--heartbeat --last-seen'),
    { hasRunList: yml.includes('gh run list --workflow host-radar.yml') })
  check('workflow: 已告警版本状态 = 雷达 issue 列表（gh issue list 提取 + 开 issue 即推进——无第二份状态写入，P5 同一动作单路径）',
    yml.includes('gh issue list --state all') && !yml.includes('advance seen versions'))
  check('workflow: 心跳自警 issue 幂等门（open 的 `host-radar heartbeat stale:` 前缀存在即跳过——与 probe 报告 issue 门同型对称；probe job 持续红 ≥2 周期而 radar job 每周成功的形态下不每周重复告警，门缺失即红）',
    yml.includes('startswith("host-radar heartbeat stale:")'),
    { hasGate: yml.includes('startswith("host-radar heartbeat stale:")') })
  // 权限判据限定于真实 permissions: 块（注释里的选型论述会提到「actions: write」字样——
  // 全文匹配会自撞，与 ANCHOR_CASES 自满足陷阱同族）。
  const permBlock = /permissions:\n((?:[ ]{2}[A-Za-z]+:[ ]*(?:read|write|none).*\n?)+)/.exec(yml)?.[1] ?? ''
  check('workflow: 权限最小化（permissions 块 = actions:read 只读运行历史 + issues:write + contents:read；无 actions:write——Variables 写面本就不可达，不虚挂）',
    /actions:[ ]*read/.test(permBlock) && !/actions:[ ]*write/.test(permBlock)
      && /issues:[ ]*write/.test(permBlock) && /contents:[ ]*read/.test(permBlock),
    { permBlock: permBlock.trim() })
  check('workflow: 判定单点——probe/dist-tags/heartbeat 三模式全部经 scripts/host-radar-probe.mjs（yaml 只编排不复制判定）+ dist-tags 查询规格全枚举（DEC-3/F-5）',
    (yml.match(/host-radar-probe\.mjs/g) ?? []).length >= 3 && yml.includes('npm view @deepseek-ai/dsh dist-tags --json'))
  check('workflow: cron 周频（DEC-3）+ workflow_dispatch 手动应急（dist_tags_stub/host_versions/force_issue 三输入）',
    /cron:\s*'30 3 \* \* 1'/.test(yml) && yml.includes('workflow_dispatch:') && yml.includes('dist_tags_stub') && yml.includes('force_issue'))
  // issue-body 构建脚本字段面锁：全部读取路径 ∈ probe 报告真实结构（baseline 面无
  // packageAbsent 字段——前任产物曾引 report.baseline.packageAbsent 打印 undefined）。
  check('workflow: issue-body 内嵌脚本字段面正确（packageAbsent 读自 summary 而非 baseline——真实报告结构）',
    yml.includes('${report.summary.packageAbsent} absent') && !yml.includes('report.baseline.packageAbsent'))
}

console.log(failures === 0
  ? `\nALL HOST RADAR GUARD TESTS PASSED (${passed} assertions)`
  : `\n${failures} FAILURE(S) (${passed} passed)`)
process.exit(failures === 0 ? 0 : 1)
