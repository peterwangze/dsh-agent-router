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
 * ARCH-007（可调测性 / 校验层）：①分发形态维度 —— `--distribution auto|npm|bundled`
 * 按**内容判据**（抽样包 lib/types 下 .d.ts 计数）识别宿主树形态；bundled 树整树无
 * `.d.ts` 时类型声明锚记 `unavailable`（分发形态所致、单列、不计入 totalDiffs），真
 * 位移仍记 `missing`；②`--matrix` 升级代价矩阵（必须改 / 建议改 / 无需改，逐项定位到
 * package + file + symbol/event）；③**夹具版本零硬编码**：绿色/冻结树版本从 probe
 * dist-tags 报告的 `registry` 面派生（基线换代 0.2.1→0.2.2 时夹具自动跟随，禁把套件
 * 测成旧基线假绿）；④双形态夹具：同一绿树 `declarations:false` 变体 = bundled 形态，
 * 断言「不可验」而非「缺失」，强制 `--distribution npm` 时回到诚实 missing；
 * ⑤guard 崩溃守卫（ARCH-007 P8）：spawn tests/host-contract.mjs 对 bundled 夹具，
 * 断言结构化结论 + 显式「不可验」+ 零栈逃逸；真符号位移仍精确 FAIL。
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

// ── 基线档案面派生（ARCH-007：测试内零版本常量）───────────────────────────────
// probe dist-tags 报告的 `registry` 面 = HOST_BASELINE_REGISTRY 全量（与 probe 同一
// 文本提取路径）。绿树/冻结树版本与断言全部由此派生：注册表换代（如 0.2.1→0.2.2）
// 后夹具自动跟随新主基线；硬编码版本常量只会把套件变成「测旧基线」的假绿。
const registryRun = runRadar(['--dist-tags', '{}'])
const REGISTRY = Array.isArray(registryRun.json?.registry) ? registryRun.json.registry : []
const PRIMARY = REGISTRY.find((entry) => entry?.status === 'primary') ?? null
const FROZEN = REGISTRY.find((entry) => entry?.status !== 'primary') ?? null
if (PRIMARY === null || FROZEN === null) {
  console.error(`host-radar: 无法从 probe dist-tags 报告派生基线档案面（registry=${JSON.stringify(REGISTRY)}；stderr=${registryRun.stderr}）——夹具版本派生失败，fail-closed`)
  process.exit(1)
}
/** 漂移版本（semver build metadata 合法：包表比对是字符串相等，`+drift` 必 mismatch）。 */
const driftVersion = (version) => `${version}+drift`
/** 镜像事件 since 注记（与 host-contract 同读 lib/host-abi/events.js 单源；测试侧不硬编码 28/30）。 */
const EVENT_SINCE = new Map([...readFileSync(join(ROOT_DIR, 'lib', 'host-abi', 'events.js'), 'utf8')
  .matchAll(/^\s*'([^']+)',\s*\/\/\s*since\s+([^\s（]+)/gm)].map((match) => [match[1], match[2]]))
/** S9b 行候选族锚行（与 host-contract 同读 lib/prestep.js 注释单源；测试侧不硬编码行号）。 */
const s9bAnchorLineOf = (regex) => {
  const match = regex.exec(readFileSync(join(ROOT_DIR, 'lib', 'prestep.js'), 'utf8'))
  return match === null ? Number.NaN : Number(match[1])
}
const S9B_MESSAGE_LINE = s9bAnchorLineOf(/`lib\/types\/message\.d\.ts:(\d+)/)
const versionTripleOf = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version))
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0]
}
const includesSince = (since, version) => {
  const [a, b] = [versionTripleOf(since), versionTripleOf(version)]
  return a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] <= b[2])))
}
/** 最高冻结档案项（当前 = 0.2.1；不硬编码 id——注册表换代后夹具自动跟随）。 */
const FROZEN_HIGHEST = REGISTRY.filter((entry) => entry?.status !== 'primary')
  .sort((left, right) => left.id.localeCompare(right.id, 'en', { numeric: true })).at(-1) ?? null

// ── 合成宿主树（绿树 = 主基线档案形态；mutate 单点突变）────────────────────────
// 版本面全部来自 `PRIMARY`/`FROZEN`（probe 报告派生，见上）——基线换代时夹具自动跟随；
// schema 顶层字段 / LlmAdapter 方法 / 锚符号 / 7d 针：按主基线常量手写——绿树零 diff
// 断言 = 夹具与权威常量的机器锁（见文件头「判别夹具」段）。
const KEY_DSH_PACKAGES = [
  'dsh', 'dsh-api-remotes', 'dsh-api-session-controller', 'dsh-agent', 'dsh-client-ui-model-selection',
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
 *  - s9bPersistWorker: true：写合成 dsh-session-persistence-jsonl/lib/worker.cjs（S9b 行候选
 *    夹具；两项内容模式落在 `function source(message)` 符号窗口内）+ dsh-llm/lib/types/message.d.ts
 *    （S9b 另一条锚的绿色面；否则绿树会因该文件缺席而多一条无关 FAIL，掩盖单点突变口径）
 *  - stripS9bPatterns: ['persistence-inline-admission']：把该锚两项内容模式整体改写
 *    （行号候选 + 内容符号候选全部不命中——S9b「全候选失败 → FAIL」分支的夹具形态）
 *  - inputState: 'green' | 'imageIds'：InputState 7d 针形态（负向锚命中）
 *  - base: PRIMARY|FROZEN：整树版本面取哪份基线档案项（默认主基线；冻结树用例）
 *  - declarations: false：整树不写任何 `.d.ts`（bundled 分发形态——类型锚不可验）
 */
function buildTree(dir, mutate = {}) {
  const scope = join(dir, '@deepseek-ai')
  const write = (relpath, content) => {
    const path = join(scope, relpath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  const pkgJson = (name, version) => JSON.stringify({ name: `@deepseek-ai/${name}`, version }, null, 2)
  const base = mutate.base ?? PRIMARY
  const mainVersion = mutate.dshVersion ?? base.dsh
  const packagesVersion = mutate.dshPackagesVersion ?? base.dshPackages
  const declarations = mutate.declarations !== false // false = bundled 分发形态（整树无 .d.ts）
  const dropPackages = new Set(mutate.dropPackages ?? [])
  for (const name of KEY_DSH_PACKAGES) {
    if (dropPackages.has(name)) continue
    write(`${name}/package.json`, pkgJson(name, name === 'dsh' ? mainVersion : packagesVersion))
  }
  for (const [name, version] of [['cordis', mutate.cordis ?? base.cordis], ['schemastery', mutate.schemastery ?? base.schemastery]]) {
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
  if (declarations) {
    write('dsh-client-ui-model-selection/lib/types/client/service.d.ts', `  ${NEEDLE_DIRECTORY_FOR}\n`)
    write('dsh-client-ui-model-selection/lib/types/client/directory.d.ts', '  load()\n')
    // S7 7d 面（dsh-client-ui-conversation 契约文件）
    write('dsh-client-ui-conversation/lib/types/client/contract/input.d.ts', mutate.inputState === 'imageIds'
      ? 'export interface InputState {\n  readonly imageIds: readonly string[];\n}\n'
      : `export interface InputState {\n  ${NEEDLE_ATTACHMENT_IDS};\n}\n`)
    write('dsh-client-ui-conversation/lib/types/client/service.d.ts', `  ${NEEDLE_RESOLVE_DRAFT}\n`)
    write('dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts', "  kind: 'image'\n  kind: 'file'\n")
  }
  // S9b 行候选族夹具（ARCH-007 D4 同族；tests/host-contract.mjs HOST_V4_ANCHORS）：合成
  // dsh-session-persistence-jsonl/lib/worker.cjs——锚 `persistence-inline-admission` 的行号
  // 候选来自 lib/prestep.js 注释（worker.cjs:11641，本合成树远短于该行号 ⇒ 该候选窗口结构上
  // 为空），内容符号候选 = `function source(message)`。`stripS9bPatterns` 把两项内容模式整体
  // 改写 ⇒ 行号候选 + 符号候选全部不命中；宿主真删除/真改名不得被候选放宽吞掉。
  if (mutate.s9bPersistWorker || (mutate.stripS9bPatterns ?? []).includes('persistence-inline-admission')) {
    const stripped = (mutate.stripS9bPatterns ?? []).includes('persistence-inline-admission')
    const admissionPatterns = stripped
      ? ['producer-owned-source-kind', "value['kind'] === 'plugin'"]
      : ['producer-owned source kind', 'value["kind"] === "plugin"']
    write('dsh-session-persistence-jsonl/package.json', pkgJson('dsh-session-persistence-jsonl', packagesVersion))
    write('dsh-session-persistence-jsonl/lib/worker.cjs', [
      "'use strict'",
      '// 合成夹具（tests/host-radar.mjs buildTree）：S9b 内联 admission 判据窗口。',
      'function source(message) {',
      `  // 内联同一判据：${admissionPatterns[0]} 且 ${admissionPatterns[1]} → 拒收`,
      '  return refuse(message)',
      '}',
      '',
      'function refuse() { return { ok: false } }',
      '',
    ].join('\n'))
    // S9b 另一条锚 `message-source-no-catch-all` 的绿色面：行号取自同一 prestep 注释
    // （lib/types/message.d.ts:94-99），两项内容模式落在 ±window 内——缺此文件绿树会多一条
    // 与本突变无关的「宿主文件在位」FAIL，掩盖单点突变（只留 persistence 锚红）的判别口径。
    const messageLines = Array.from({ length: S9B_MESSAGE_LINE + 6 }, () => '')
    messageLines[0] = 'export interface MessageSourceMap {'
    messageLines[S9B_MESSAGE_LINE - 1] = '  // no shared catch-all — each producer declares its own kind'
    messageLines[S9B_MESSAGE_LINE] = '  // `plugin` kind stays adapter-local'
    messageLines[S9B_MESSAGE_LINE + 5] = '}'
    write('dsh-llm/lib/types/message.d.ts', `${messageLines.join('\n')}\n`)
  }
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
  check(`probe: 绿树（${PRIMARY.dshPackages} 主基线形态）四类零 diff + exit 0（负控 + 夹具机器锁）`,
    greenRun.status === 0 && greenRun.json?.summary?.totalDiffs === 0, { status: greenRun.status, summary: greenRun.json?.summary, stderr: greenRun.stderr })
  // 计数随夹具清单派生（不手写数字——清单增删时机器锁不漂移）。
  const packageTableExpected = KEY_DSH_PACKAGES.length + 2 // 关键包 + cordis + schemastery
  check(`probe: 绿树包表 ${packageTableExpected} 项全部 match（${KEY_DSH_PACKAGES.length} 关键包 + cordis + schemastery）`,
    greenRun.json?.packageTable && Object.values(greenRun.json.packageTable).length === packageTableExpected
      && Object.values(greenRun.json.packageTable).every((entry) => entry?.status === 'match'),
    greenRun.json?.packageTable)
  check('probe: 报告载基线档案项（primary 单源提取——无版本常量副本）',
    greenRun.json?.baseline?.id === PRIMARY.id && greenRun.json?.baseline?.status === 'primary'
      && greenRun.json?.baseline?.dsh === PRIMARY.dsh && greenRun.json?.baseline?.schemastery === PRIMARY.schemastery,
    greenRun.json?.baseline)

  // T-6 形态判别（NEW-1 MUST）：dsh 主版本不变、schemastery 范围内漂移 → 恰 1 包表 mismatch。
  const t6Drift = driftVersion(PRIMARY.schemastery)
  const t6 = buildTree(mkdtemp('t6'), { schemastery: t6Drift })
  const t6Run = runRadar(['--host-source', t6])
  check(`probe: T-6 形态（dsh 主版本不变 + schemastery ${PRIMARY.schemastery}→${t6Drift} 树漂移）被检测——恰 1 项包表 mismatch 且精确点名 schemastery（NEW-1 吸收判别）`,
    t6Run.status === 0 && t6Run.json?.summary?.packageMismatches === 1 && t6Run.json?.summary?.totalDiffs === 1
      && t6Run.json?.packageTable?.schemastery?.status === 'mismatch' && t6Run.json?.packageTable?.schemastery?.version === t6Drift,
    { status: t6Run.status, summary: t6Run.json?.summary, schemastery: t6Run.json?.packageTable?.schemastery })
  check('probe: T-6 形态其余三类零 diff（判别力——不靠超集计数蒙混）',
    t6Run.json?.summary?.anchorMisses === 0 && t6Run.json?.summary?.eventHostOnly === 0
      && t6Run.json?.summary?.eventMirrorOnly === 0 && t6Run.json?.summary?.schemaFacesWithDiff === 0,
    t6Run.json?.summary)
  // T-6b：dsh-* 漂移形态（主包不变、子包换代）
  const t6bDrift = driftVersion(PRIMARY.dshPackages)
  const t6bRun = runRadar(['--host-source', buildTree(mkdtemp('t6b'), { dshPackagesVersion: t6bDrift })])
  const t6bExpected = KEY_DSH_PACKAGES.filter((name) => name !== 'dsh').length
  check(`probe: T-6b 形态（dsh 主包不变 + dsh-* ${t6bDrift} 漂移）${t6bExpected} 项包表 mismatch 精确点名（dsh 主包 match）`,
    t6bRun.status === 0 && t6bRun.json?.summary?.packageMismatches === t6bExpected && t6bRun.json?.packageTable?.dsh?.status === 'match',
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
  const agentFaces = (anRun.json?.anchors?.shapeAnchors ?? []).filter((face) => {
    const packages = Array.isArray(face.expectPackage) ? face.expectPackage : [face.expectPackage]
    return packages.includes('dsh-api-session-controller')
  })
  check('probe: 锚 miss 点名（agent.js 缺失 → 两条形状锚按 D4 有序候选逐落点记 missingFiles，不静默吞候选）',
    agentFaces.length === 2
      && agentFaces.every((face) => face.missingFiles.some((file) => file.endsWith('/lib/types/agent.js')))
      && agentFaces.some((face) => face.missingFiles.some((file) => file.endsWith('/lib/types/commands.js')))
      && agentFaces.some((face) => face.missingFiles.some((file) => file.endsWith('dsh-agent/lib/types/model-selection.js'))),
    anRun.json?.anchors?.shapeAnchors)
  check('probe: LlmAdapter 方法 miss 点名（5/6 声明 → missing=[prepareCall]）',
    anRun.json?.anchors?.llmAdapter?.missing?.length === 1 && anRun.json.anchors.llmAdapter.missing[0] === 'prepareCall',
    anRun.json?.anchors?.llmAdapter)
  check('probe: InputState 7d 负向锚命中（imageIds 复活 + attachmentIds miss + imageIdsResurrected=true）',
    anRun.json?.anchors?.inputState?.attachmentIds === false && anRun.json?.anchors?.inputState?.imageIdsResurrected === true,
    anRun.json?.anchors?.inputState)

  // 探测不门控（硬门槛）：四类全突变 → 仍 exit 0（差异只产报告；非零 = 自身故障）。
  const allRun = runRadar(['--host-source', buildTree(mkdtemp('alldiff'), {
    schemastery: t6Drift, dropEvents: [dropped], addEvents: ['host/new-event'],
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
    outRun.status === 0 && written !== null && written.summary?.totalDiffs === 0 && written.baseline?.id === PRIMARY.id,
    { exists: existsSync(outFile) })

  // DSH_HOST_SOURCE / DSH_BASELINE 环境变量机制（R3 同语义复用）
  const envRun = runRadar([], { DSH_HOST_SOURCE: green })
  check('probe: DSH_HOST_SOURCE 环境变量与 --host-source 同效（R3 机制复用——workflow/本地共用同一形态）',
    envRun.status === 0 && envRun.json?.summary?.totalDiffs === 0, { status: envRun.status, stderr: envRun.stderr })
  // 冻结树 = FROZEN 档案项版本形态（版本面零硬编码；0.1.5 只是当前 frozen 实例）
  const frozenTree = buildTree(mkdtemp('frozen'), { base: FROZEN })
  const frozenEnvRun = runRadar(['--host-source', frozenTree], { DSH_BASELINE: FROZEN.id })
  const frozenPrimaryRun = runRadar(['--host-source', frozenTree])
  const frozenPrimaryExpected = (FROZEN.dsh !== PRIMARY.dsh ? 1 : 0)
    + (FROZEN.dshPackages !== PRIMARY.dshPackages ? KEY_DSH_PACKAGES.length - 1 : 0)
    + (FROZEN.cordis !== PRIMARY.cordis ? 1 : 0) + (FROZEN.schemastery !== PRIMARY.schemastery ? 1 : 0)
  check(`probe: DSH_BASELINE=${FROZEN.id}（frozen）→ 包表按 frozen 档案项判零 mismatch（R3 参数化语义复用）`,
    frozenEnvRun.status === 0 && frozenEnvRun.json?.summary?.packageMismatches === 0 && frozenEnvRun.json?.baseline?.id === FROZEN.id,
    { summary: frozenEnvRun.json?.summary, baseline: frozenEnvRun.json?.baseline })
  check(`probe: 同 frozen 树默认 primary → 包表 ${frozenPrimaryExpected} 项 mismatch（基线选择判别——不因环境变量缺省而失判）`,
    frozenPrimaryRun.json?.summary?.packageMismatches === frozenPrimaryExpected
      && frozenPrimaryRun.json?.baseline?.id === PRIMARY.id, frozenPrimaryRun.json?.summary)
  check('probe: 未知 --baseline → exit 1 fail-closed（P8：基线切换失败可观测，不静默回退——R3 §0b 同语义）',
    runRadar(['--host-source', green, '--baseline', 'bogus']).status === 1)
}

console.log('ARCH-007 分发形态判别（内容判据 × 不可验/缺失 × 升级代价矩阵 × guard 崩溃守卫）:')
{
  // ① npm 形态（含 .d.ts）：类型锚可验证——真漂移会以 missing 暴露（对照组）。
  const npmTree = buildTree(mkdtemp('dist-npm'))
  const npmRun = runRadar(['--host-source', npmTree])
  check('distribution: auto 内容判据 → npm / typeAnchors=available（.d.ts 在位 ⇒ 类型锚可验）',
    npmRun.status === 0 && npmRun.json?.distribution?.detected === 'npm'
      && npmRun.json.distribution.byContent === 'npm' && npmRun.json.distribution.typeAnchors === 'available'
      && npmRun.json.summary.anchorUnavailable === 0 && (npmRun.json.anchors.unavailable ?? []).length === 0,
    npmRun.json?.distribution)

  // ② bundled 形态（同一棵树不写任何 .d.ts = 桌面 asar 分发形状）：类型锚整树缺席 ⇒
  //    unavailable（单列、不计 totalDiffs）；JS/事件/schema/包表面零差异 ⇒ totalDiffs 仍 0。
  const bundledTree = buildTree(mkdtemp('dist-bundled'), { declarations: false })
  const bundledRun = runRadar(['--host-source', bundledTree])
  const bundledReport = bundledRun.json
  check('distribution: auto 内容判据 → bundled / typeAnchors=unavailable（0 个 .d.ts ⇒ 分发形态判据生效）',
    bundledRun.status === 0 && bundledReport?.distribution?.detected === 'bundled'
      && bundledReport.distribution.byContent === 'bundled' && bundledReport.distribution.typeAnchors === 'unavailable',
    bundledReport?.distribution)
  check('distribution: bundled 类型锚记 unavailable 而非 missing（不计入 totalDiffs；shapeAnchors 零缺失）',
    bundledReport?.summary?.anchorMisses === 0 && bundledReport.summary.totalDiffs === 0
      && bundledReport.summary.anchorUnavailable > 0
      && (bundledReport.anchors.shapeAnchors ?? []).every((face) => (face.missingFiles ?? []).length === 0 && (face.missingSymbols ?? []).length === 0),
    { summary: bundledReport?.summary })
  check('distribution: anchorUnavailable 单列且定位到 package+file+symbol（不可验面可追溯，非静默吞）',
    bundledReport?.anchors?.unavailable?.length === 1
      && bundledReport.anchors.unavailable[0].files.length === 2
      && bundledReport.anchors.unavailable[0].files.every((file) => file.startsWith('dsh-client-ui-model-selection/'))
      && bundledReport.anchors.unavailable[0].symbols.length === 2
      && /distribution bundled/i.test(bundledReport.anchors.unavailable[0].reason ?? '')
      && /content criterion/i.test(bundledReport.anchors.unavailable[0].reason ?? ''),
    bundledReport?.anchors?.unavailable)
  check('distribution: InputState 4 面 bundled 判不可验（verifiable=false + 3 个缺席声明文件点名）',
    bundledReport?.anchors?.inputState?.verifiable === false
      && bundledReport.anchors.inputState.unavailableFiles.length === 3,
    bundledReport?.anchors?.inputState)

  // ③ 强制标签只改「判读口径命名」，不改实测（byContent 恒为内容实测）：强制 npm 时
  //    bundled 树的 .d.ts 锚回落诚实 missing（取证需要；分发形态不是静默豁免）。
  const forcedNpm = runRadar(['--host-source', bundledTree, '--distribution', 'npm'])
  check('distribution: --distribution npm 强制标签作用于 bundled 树 → 类型锚回落诚实 missing（byContent 仍 bundled 实测）',
    forcedNpm.status === 0 && forcedNpm.json?.distribution?.detected === 'npm'
      && forcedNpm.json.distribution.byContent === 'bundled' && forcedNpm.json.distribution.typeAnchors === 'unavailable'
      && forcedNpm.json.summary.anchorMisses > 0 && forcedNpm.json.summary.anchorUnavailable === 0,
    { distribution: forcedNpm.json?.distribution, summary: forcedNpm.json?.summary })
  const forcedBundled = runRadar(['--host-source', npmTree, '--distribution', 'bundled'])
  check('distribution: --distribution bundled 强制标签作用于 npm 树 → 文件实测仍在位 ⇒ typeAnchors=available（不按标签撒谎）',
    forcedBundled.status === 0 && forcedBundled.json?.distribution?.detected === 'bundled'
      && forcedBundled.json.distribution.byContent === 'npm' && forcedBundled.json.distribution.typeAnchors === 'available'
      && forcedBundled.json.summary.anchorUnavailable === 0 && forcedBundled.json.summary.totalDiffs === 0,
    { distribution: forcedBundled.json?.distribution, summary: forcedBundled.json?.summary })

  // ④ 两事实并行（同一 bundled 树 + agent.js 真符号位移）⇒ unavailable（声明面）与
  //    missing（JS 符号面）同时成立，互不掩盖：分发形态不得吞掉真 ABI 位移。
  const bundledDriftTree = buildTree(mkdtemp('dist-bundled-drift'), { declarations: false, dropAgentSymbols: NEEDLE_AGENT })
  const bundledDriftRun = runRadar(['--host-source', bundledDriftTree])
  check('distribution: bundled 树 + 真符号位移 → missing 与 unavailable 并行（分发形态不吞真 ABI 位移）',
    bundledDriftRun.status === 0 && bundledDriftRun.json?.summary?.anchorMisses > 0
      && bundledDriftRun.json.summary.anchorUnavailable > 0
      && bundledDriftRun.json.anchors.shapeAnchors.some((face) => (face.missingSymbols ?? []).some((entry) => entry.includes('agent.js :: selectionFor('))),
    { summary: bundledDriftRun.json?.summary })

  // ⑤ --matrix：默认可读文本（人读面），--out 同时产结构化工件（机器面）；两者同源。
  const matrixRun = runRadar(['--host-source', bundledTree, '--matrix'])
  check('matrix: bundled 树 → 可读矩阵（必须改 0 = 无真位移；建议改 ≥2 = 分发形态不可验；无需改面逐条）',
    matrixRun.status === 0 && matrixRun.json === null
      && /升级代价矩阵/.test(matrixRun.stdout) && /必须改/.test(matrixRun.stdout)
      && /建议改/.test(matrixRun.stdout) && /无需改/.test(matrixRun.stdout),
    matrixRun.stdout.slice(0, 1200))
  const matrixOut = join(mkdtemp('dist-matrix-out'), 'matrix.json')
  const matrixOutRun = runRadar(['--host-source', bundledTree, '--matrix', '--out', matrixOut])
  const matrixWritten = existsSync(matrixOut) ? JSON.parse(readFileSync(matrixOut, 'utf8')) : null
  check('matrix: --matrix --out 结构化工件（counts + 三桶 + 逐项定位；可读 stdout 不替代工件）',
    matrixOutRun.status === 0 && matrixWritten?.matrix?.counts?.must === 0
      && matrixWritten.matrix.counts.suggest >= 2 && matrixWritten.matrix.counts.none >= 2
      && matrixWritten.matrix.suggest.every((item) => item.category && item.location && item.detail && item.action)
      && matrixWritten.matrix.suggest.some((item) => item.category === 'distribution')
      && matrixWritten.matrix.suggest.some((item) => item.category === 'anchor.unavailable')
      && matrixWritten.matrix.none.every((item) => item.action === '无需动作'),
    matrixWritten?.matrix?.counts)
  check('matrix: 报告仍含 matrix + distribution 面（可读输出与工件单实现路径，无第二份矩阵）',
    matrixWritten?.distribution?.detected === 'bundled' && Array.isArray(matrixWritten.matrix.must)
      && /内容判据/.test(matrixWritten.distribution.source))

  // ⑥ guard 崩溃守卫（P8）：spawn tests/host-contract.mjs 对同一 bundled 夹具——
  //    声明面整体缺席必须走「不可验」结构化分支（显式 note + 汇总行），不得抛栈。
  const guardEnv = (hostSource) => {
    const env = { ...process.env }
    delete env.DSH_HOST_SOURCE; delete env.DSH_BASELINE; delete env.DSH_HOST_PACKAGES
    return { ...env, DSH_HOST_SOURCE: hostSource }
  }
  const runGuard = (hostSource) => {
    const result = spawnSync(process.execPath, [join(ROOT_DIR, 'tests', 'host-contract.mjs')], {
      encoding: 'utf8', timeout: 240_000, env: guardEnv(hostSource),
    })
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
  }
  const stackMarkers = /(?:^|\n)\s+at [^\n]*:\d+:\d+/
  const guardClean = runGuard(bundledTree)
  check('guard P8: bundled 树（声明面整体缺席）→ 结构化结论 + 显式「不可验」+ 零栈逃逸（不崩溃、不静默）',
    guardClean.status !== null && !stackMarkers.test(guardClean.output) && !/ENOENT/.test(guardClean.output)
      && !/node:internal/.test(guardClean.output)
      && /不可验/.test(guardClean.output) && /(?:FAILURE\(S\)|ALL HOST CONTRACT)/.test(guardClean.output),
    guardClean.output.slice(-1500))
  const guardDrift = runGuard(bundledDriftTree)
  check('guard P8: bundled 树 + 真符号位移 → 精确 FAIL 点名（真 ABI 位移 ≠ 分发形态不可验；仍零栈逃逸）',
    guardDrift.status === 1 && /FAIL\s+S2 形状锚点/.test(guardDrift.output)
      && /selectionFor\(/.test(guardDrift.output) && !stackMarkers.test(guardDrift.output),
    guardDrift.output.slice(-1500))
  // ⑥a-2 ARCH-007 D4 反向回归：候选落点放松不得吞真删除——旧位置符号被清空、新位置文件
  //   也不存在（合成树无 commands.js/model-selection.js）⇒ 全部候选不命中，S2 必须精确 FAIL
  //    并同时点名旧符号与新候选文件；若把「候选任一命中」误写成「候选存在即命中」这里会绿。
  const guardAllCandidatesMissing = runGuard(buildTree(mkdtemp('d4-all-candidates-missing'), { dropAgentSymbols: NEEDLE_AGENT }))
  check('guard D4 反向: selectionFor/stateOf 从全部候选落点消失 → S2 精确 FAIL（候选放松不吞真删除）',
    guardAllCandidatesMissing.status === 1 && /FAIL\s+S2 形状锚点: sessionController\.selectModel/.test(guardAllCandidatesMissing.output)
      && /dsh-api-session-controller\/lib\/types\/agent\.js :: selectionFor\(/.test(guardAllCandidatesMissing.output)
      && /dsh-api-session-controller\/lib\/types\/agent\.js :: stateOf\(/.test(guardAllCandidatesMissing.output)
      && /dsh-api-session-controller\/lib\/types\/commands\.js/.test(guardAllCandidatesMissing.output)
      && !/位置漂移/.test(guardAllCandidatesMissing.output) && !stackMarkers.test(guardAllCandidatesMissing.output),
    guardAllCandidatesMissing.output.slice(-1800))
  // ⑥b ARCH-007 A（P1 事实修正回归网）：S7 7a 分代 skip 的参照 = **靶子树实读版本**（非所选基线）。
  //   最高冻结靶子（当前 0.2.1）+ 镜像 30 ⇒ since 更高的事件逐项可见 skip（含 since/靶子版本/
  //   事件名），不红。期望计数由镜像源 since 注记派生（禁硬编码 28/30）。
  const guardOldTarget = runGuard(buildTree(mkdtemp('s7-old-target'), { base: FROZEN_HIGHEST, declarations: false }))
  const oldTargetSkips = FROZEN_HIGHEST === null ? [] : FORWARDED_EVENT_ALLOWLIST
    .filter((event) => !includesSince(EVENT_SINCE.get(event), FROZEN_HIGHEST.dsh))
  const oldTargetExpected = FORWARDED_EVENT_ALLOWLIST.length - oldTargetSkips.length
  check('guard S7 7a 分代: 高代冻结靶子早于镜像事件 since → 逐项可见 skip（含 since/靶子版本/事件名）且不误红',
    FROZEN_HIGHEST !== null && EVENT_SINCE.size === FORWARDED_EVENT_ALLOWLIST.length
      && oldTargetSkips.length > 0 && guardOldTarget.status === 0
      && oldTargetSkips.every((event) => guardOldTarget.output.includes(
        `事件 ${event}（since ${EVENT_SINCE.get(event)}）> 靶子宿主版本 ${FROZEN_HIGHEST.dsh}`))
      && guardOldTarget.output.includes(
        `baseline ${PRIMARY.id} / target ${FROZEN_HIGHEST.dsh} 期望 ${oldTargetExpected}/${FORWARDED_EVENT_ALLOWLIST.length}`),
    { skips: oldTargetSkips, tail: guardOldTarget.output.slice(-1200) })
  //   靶子 0.2.2 + 镜像缺项 ⇒ 精确 FAIL（D1 回归信号）：分代 skip 只能因**靶子代际**成立，
  //   不能因分发形态/基线新而吞掉真实缺项。
  const guardMissingEvent = runGuard(buildTree(mkdtemp('s7-drop-event'), { dropEvents: ['llm/models-updated'] }))
  check('guard S7 7a 反向: 靶子 0.2.2 + 镜像事件缺项 → 精确 FAIL（D1 回归信号；不因分发形态不可验而吞项）',
    guardMissingEvent.status === 1 && /FAIL\s+S7 增强: 白名单镜像/.test(guardMissingEvent.output)
      && /llm\/models-updated/.test(guardMissingEvent.output),
    guardMissingEvent.output.slice(-1500))
  // ⑥c ARCH-007 S9b 行候选族反向回归（D4 同族）：锚 `persistence-inline-admission` 的候选 =
  //    行号候选（lib/prestep.js 注释的 worker.cjs:NN，合成树远短于该行号 ⇒ 该候选窗口为空）+
  //    内容符号候选（`function source(message)`）。同树绿形态只走符号候选命中（可见漂移 note）；
  //    `stripS9bPatterns` 把两项内容模式整体改写 ⇒ **全部候选**不命中，S9b 必须结构化 FAIL 并
  //    点名锚 id 与各候选窗口明细。若把「任一候选命中」误写成「候选存在即命中」，这里会变绿。
  const s9bGreen = runGuard(buildTree(mkdtemp('s9b-candidates-green'), { s9bPersistWorker: true }))
  const s9bStripped = runGuard(buildTree(mkdtemp('s9b-candidates-stripped'), { s9bPersistWorker: true, stripS9bPatterns: ['persistence-inline-admission'] }))
  check('guard S9b 反向: 行号候选中 prestep 行号窗口空 + 内容符号候选窗口内两模式被整体改写 → S9b 精确 FAIL 点名 persistence-inline-admission（全候选不命中不被吞）',
    s9bGreen.status === 0 && /ALL HOST CONTRACT GUARD TESTS PASSED/.test(s9bGreen.output)
      && /ok\s+S9b 宿主锚: persistence-inline-admission[^\n]*命中[^\n]*行 \d+-\d+ 窗口/.test(s9bGreen.output)
      && /persistence-inline-admission[^\n]*位置漂移/.test(s9bGreen.output)
      && !/FAIL\s+S9b 宿主锚: persistence-inline-admission/.test(s9bGreen.output)
      && s9bStripped.status === 1
      && (s9bStripped.output.match(/^FAIL\b/gm) ?? []).length === 1
      && /FAIL\s+S9b 宿主锚: persistence-inline-admission/.test(s9bStripped.output)
      && /在 2 个位置候选中均未命中/.test(s9bStripped.output)
      && /"lineSource":"prestep-comment"/.test(s9bStripped.output)
      && /"lineSource":"content-symbol"/.test(s9bStripped.output)
      && /"window":\[\d+,\d+\]/.test(s9bStripped.output)
      && /"actualWindow":\[/.test(s9bStripped.output)
      && /missingPatterns":\["\/(?:producer-owned source kind|value)\//.test(s9bStripped.output)
      && !/persistence-inline-admission[^\n]*位置漂移/.test(s9bStripped.output)
      && !stackMarkers.test(s9bGreen.output) && !stackMarkers.test(s9bStripped.output),
    { green: s9bGreen.output.slice(-900), stripped: s9bStripped.output.slice(-2000) })

  // ⑦ 参数面 fail-loud（P8）：非法分发标签 / 非 probe 模式用矩阵 ⇒ exit 1 + 枚举点名。
  check('distribution: 非法 --distribution 值 → exit 1 + auto|npm|bundled 枚举点名（不静默回退 auto）',
    (() => { const r = runRadar(['--host-source', npmTree, '--distribution', 'foo']); return r.status === 1 && /auto\|npm\|bundled/.test(r.stderr) })())
  check('matrix: 非 probe 模式使用 --matrix/--distribution → exit 1 + probe-mode 明确诊断（不静默忽略）',
    (() => { const r = runRadar(['--dist-tags', '{}', '--matrix']); return r.status === 1 && /probe-mode/.test(r.stderr) })())
}

console.log('R4 雷达 dist-tags 模式（全枚举——F-5：预发布通道不失明）:')
{
  // 形态 stub 由档案面派生（ARCH-007：测试零版本常量——next/latest 指向 frozen 值 =
  // 档案在册 → 不算新版本；alpha 指向 primary.dsh+drift = 不在册 → 必判新版本）。
  // 判别语义不变：latest-only 查询会漏掉 alpha 通道（F-5 原缺陷形态）。
  const alphaDrift = driftVersion(PRIMARY.dsh)
  const liveForm = JSON.stringify({ next: FROZEN.dsh, latest: FROZEN.dsh, alpha: alphaDrift })
  const live = runRadar(['--dist-tags', liveForm])
  check(`dist-tags: 实测形态全枚举（next/latest/alpha 三 tag 并集）→ alpha 通道 ${alphaDrift} 判为新版本（latest-only 查询将失明——F-5 判别）`,
    live.status === 0 && live.json?.newVersions?.length === 1 && live.json.newVersions[0] === alphaDrift
      && live.json?.tags?.alpha === alphaDrift && live.json?.primary?.dsh === PRIMARY.dsh,
    { status: live.status, json: live.json })
  check('dist-tags: 已告警版本经 --seen 抑制（防周频重复 issue）',
    (() => { const r = runRadar(['--dist-tags', liveForm, '--seen', JSON.stringify([alphaDrift])]); return r.status === 0 && r.json?.newVersions?.length === 0 })(),
    { json: runRadar(['--dist-tags', liveForm, '--seen', JSON.stringify([alphaDrift])]).json })
  check('dist-tags: 档案在册版本（frozen 重挂 tag）不算新版本',
    (() => { const r = runRadar(['--dist-tags', JSON.stringify({ legacy: FROZEN.dsh })]); return r.status === 0 && r.json?.newVersions?.length === 0 })())
  check('dist-tags: --dist-tags-file 文件形态与内联同效（workflow 落盘消费面）',
    (() => {
      const file = join(mkdtemp('dtags'), 'dist-tags.json')
      writeFileSync(file, liveForm)
      const r = runRadar(['--dist-tags-file', file])
      return r.status === 0 && r.json?.newVersions?.length === 1 && r.json.newVersions[0] === alphaDrift
    })())
  check('dist-tags: 报告 registry 面 = HOST_BASELINE_REGISTRY 全量（测试派生夹具版本的唯一来源；单 primary 在场）',
    live.json?.registry?.length === REGISTRY.length
      && live.json.registry.filter((entry) => entry.status === 'primary').length === 1
      && live.json.registry.some((entry) => entry.id === FROZEN.id && entry.status === FROZEN.status),
    live.json?.registry)
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
