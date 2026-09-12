# REVIEW-EVO-024-R0（Code Review 输入报告）

- **Task**: EVO-024-R0（P1）— ARCH-004 实施链 B6「静态看护成体系批」（收官批）代码审查
- **审查对象**: `D:/AI/agent/deepseek/plugins/router` commit `4315991`（HEAD 即 4315991；8 文件 +854/−25）
- **审查工具边界**: 只读——read/grep/glob + 只读 git + 只读文件系统探查；**未执行测试、未执行写操作、未修改代码与治理状态**（唯一写入 = 本报告文件）
- **对象完整性**: 审查开始 `git status --porcelain` **空**；`git show --stat 4315991` 文件集 == 声明 8 文件（`.github/workflows/ci.yml` / `README.md` / `lib/oauth-llm.js` / `lib/wrapper.js` / `package.json` / `tests/host-contract.mjs` / `tests/run-all.mjs` / `tests/smoke.mjs`），无夹带、无演示残留
- **设计依据**: `.governance/arch-004-compatibility-design.md` §5.1（L260-278）/§5.2/§5.3（L286-291）/§10 B6（L417-420）；B6 归口来源 `.governance/review-EVO-023-R0-input.md:105`（B5 裁决①「wrapper/oauth 剩余 4 处订阅收敛归口 B6」）+ `.governance/plan-tracker.md:34`

## 2. 审查结论

**APPROVED_WITH_NOTES**（`unresolved_blockers=0`）

- P0 = **0** / P1 = **2** / P2 = **4** / P3 = **8**
- 硬门槛：P0=0 ✅ / 5 维 100% ✅ / 每条发现带级别 ✅ / 设计一致性完成 ✅ / AI 专项 5 项完成 ✅
- **一句话理由**：守卫常量与宿主真机源码逐项零幻觉（六面 wire schema 锚行号逐行命中、19 事件逐字逐序、8 导出逐名命中、11 原型项含 getter 命中）、四处订阅收敛语义逐字等价且 census 1/1 可达、四红演示静态推演全部成立、范围与工作树纪律干净；仅存 2 项**测试基础设施级** P1（CI ubuntu 首跑受 `smoke.mjs` 的 Windows PowerShell 硬依赖必定红 + `run-all` 把 4 个零断言 runner 模块计入「24 套件」产生幻影 PASS），两者修复面小、均不触产品代码，故判通过并附限期遗留。

## 3. 硬门槛裁决（逐维）

| 维度 | 结论 | 判定依据（可复查事实） |
|------|------|------------------------|
| 正确性 | **通过**（产品面零缺陷；2 项 P1 在门控基础设施面） | 四处订阅收敛语义逐字等价（`lib/wrapper.js:653-666`、`lib/oauth-llm.js:546-561` 的 ns 过滤 `ns === ROUTER_NS \|\| ns === void 0` 与父提交逐字一致；disposer 等价；consumer 名互异；未声明 gate → 无抑制面变化）；`subscribeEvents` 单 listener 去重按 `WeakMap(target)→event` 键控，四模块共用同一 ctx 对象（`lib/index.js:218/243/248`、`service.js:637-638` `constructor(ctx…)` → cordis Service `this.ctx = ctx`（宿主 cordis `lib/index.js:1741/1770`））→ census `settings/updated`=1、`llm/adapters-updated`=1 可达（`tests/smoke.mjs:2992-2993` 断言与 `tests/smoke.mjs:2969-2973` 计数桩口径一致）；S1-S7 断言与真机源码逐项一致（见 §5/§6） |
| 安全性 | **通过** | `.github/workflows/ci.yml` 全文零 secrets/零 token/零凭据；无外部下载（install-entry 在线检查走本地 fixture server）；守卫诊断只输出面名/字段名/事件名/文件名，无凭据或用户数据（`tests/host-contract.mjs:71-77` detail 面）；S7 只读宿主源码；本次 diff 无新输入面、无注入面、无权限面变更 |
| 可维护性 | **通过**（P3-5/P3-6 为标签与留档 nit） | 基线常量集中（`tests/host-contract.mjs:127-286`）+ 注释锚行号 + 文件头刷新步骤（:41-46）；命名表意（`CONSUMER_BARE_CTX_GET_ALLOWLIST`/`WIRE_SCHEMA_WHITELIST`）；检查工具三件套 `check/note/deepEqual` 与 `rpc-shadow-guard` 先例同形；`stripComments`/`blockOf`/`arrayOf` 为通用纯函数无重复实现；产品面 diff 纯收敛无并存旧路径（P5 合规） |
| 性能 | **通过** | 静态扫描为 O(文件数 × 常量数)（`readdirSync('lib')` 顶层 12 文件）；`run-all` 顺序执行符合套件隔离约束并注释理由（`tests/run-all.mjs:10-16`）；产品面 diff 无新增常驻 timer/无新增订阅（census 只减）；P3-1/P3-2 属门控健壮性非产品性能 |
| 测试覆盖 | **通过但附 2 项 P1** | 新增 host-contract 80 断言（静态清点 = 70 + S7 10，与 `plan-tracker:34`「80 断言/S7 靶子 10/10」一致）；四红演示逐项静态推演成立（§5）；缺口 = 4 个幻影套件条目（P1-2）与 CI 平台面未覆盖（P1-1） |

**AI 代码专项 5 项**

| # | 项 | 结论 | 依据 |
|---|----|------|------|
| 1 | mock 残留 | ✅ 无 | `lib/` 零 mock；`tests/host-contract.mjs:305-308/340` 的 `fakeLlm/probeCtx` 为判别夹具（命名明示）；4 个被 import 的 runner 模块是测试组织形态，非 mock 残留 |
| 2 | 硬编码返回值 | ✅ 无 | 产品面 diff（wrapper/oauth-llm）无硬编码返回；守卫内 `fakeLlm = { registration: () => ({adapter:{}}), stream: async function*(){} }` 属判别设计 |
| 3 | 幻觉 API | ✅ **零幻觉（强证据）** | 逐项真机核对：LlmAdapter 6 方法 `dsh-llm lib/index.js:1624/1635/1645/1653/1665/1681`（`prepareCall` 为 `async prepareCall(…)` :1681）；BlockAssembler 11 项 `:909/952/965/986/996/1023/1033/1062` + getter `usage:1042 / finish:1046 / replayState:1054`；`dsh-llm/message` 8 导出 `lib/types/message.js:10/16/26/34/45/56/73/85` 逐名命中；`defineTool(options)` 单参 `dsh-tools lib/index.js:837`；TypertRemoteService 真被继承 `lib/service.js:636`；六面 wire schema 锚行号逐行命中（`dsh-api-remotes lib/client.js:4315/4701/4712/5727/5735/8164`，字段与顺序见 §5.4）；转发白名单 19 项逐字逐序（`lib/types/remote-events.js:13-31`）；S2/S7 锚字符串真机在位（`dsh-api-session-controller lib/types/agent.js` `selectionFor(agent)`×3 / `stateOf(agent.session, 'modelSelection')` / `projectionState.pending`；`dsh-client-ui-model-selection lib/types/client/service.d.ts` `directoryFor(sessionId: SessionId): ModelDirectory`×1）；`tests/fix-029-host-contract.mjs:7/87` 锚字符串在位 |
| 4 | 未实现 TODO | ✅ 无 | `git show 4315991` 内零 `TODO/FIXME/XXX/HACK` |
| 5 | 过度实现 | ✅ 无越界 | S1–S7 与设计 §5.1 第 1–5 条一一映射，S7 为设计明文增强组（§5.1 L276/§5.3 L289）；未引入设计外能力；唯一可议为分组标签计数（P3-5） |

**设计一致性**：§5.1 五条逐条落地（契约快照 / 形状锚点 / 声明面+消费点黑名单 / 字段级 wire schema / 转发白名单双检静态半边）；§5.2 边界纪律遵守（本套件不重复运行时探测，文件头 :11-13 明示分工）；§5.3 范围纪律遵守（只做第①②步，CI 第③步「锁版本装宿主」未越界实现）；§10 B6 验收 5 项：黑名单红 ✅ / 白名单红 ✅ / 字段红 ✅ / 宿主换假版本红（S7 可达时值级红，不可达 skip）⚠️ 待验证项见 §7 / 门控单入口 ✅。

## 4. Developer 声称核验（8 条逐条）

| # | 声称 | 核验 | 证据 |
|---|------|------|------|
| 1 | host-contract 五守卫 + S7（S1 契约快照四类面 / S2 形状锚点 / S3 声明面 / S4 黑名单+域管事件 / S5 字段级 wire schema / S6 转发白名单 W-4 / S7 10 项） | **成立**（标签口径见 P3-5） | `tests/host-contract.mjs:294-610` 七组齐备；S7 恰 10 个 `check`（`:562/598×6/603/605/608`），与 plan-tracker「S7 靶子 10/10」吻合 |
| 2 | 四项红演示实证（各红→绿、演示复原未入提交） | **机制成立；实证待复跑**（`git status` 空 + 提交集 == 8 文件 ✅） | 静态推演见 §5；`evidence-log.md:590` 目前仅有 `TRIAGE-EVO-024`，EV 条目待 Coordinator 复跑机录 |
| 3 | run-all 24 套件顺序 + 退出码聚合 + 10min 超时（负向演示 exit 1） | **聚合逻辑成立；「套件」语义有 4 条不成立（P1-2）** | `tests/run-all.mjs:31-33/49-59/74-79`；幻影条目见 P1-2 |
| 4 | census 收敛 10→9→6；域管事件裸订阅守卫零命中（收敛前自然红 4 命中 = wrapper/oauth 四处） | **成立** | 收敛前四处裸订阅见 diff（wrapper 2 + oauth 2）；收敛后 `lib/*.js` 顶层仅剩 3 处 scoped 钩子（`preset-defaults.js:475/549`、`prestep.js:288`，均为 `agent/created|request|pre-step`）；census = 1+1+1+1+1+1 = 6（`smoke.mjs:2992-2996`） |
| 5 | CI yml 结构 + 能/不能覆盖边界如实标注；未实跑 | **结构静态正确；边界标注 1 处不实（P1-1）、1 处前提未闭环（P2-4）** | `ci.yml:28-61`（`name: ci` / `on: push+pull_request+workflow_dispatch` / 单 job `guard` / `runs-on: ubuntu-latest` / checkout@v4 → pnpm/action-setup@v4(version 9) → setup-node@v4(node '24' + cache pnpm，顺序正确) → `pnpm install --frozen-lockfile` → `node tests/run-all.mjs`）；YAML 层级与 `'**'` 引号、`node-version: '24'` 引号（`**` 不加引号会被解为别名）均正确；`pnpm-lock.yaml` 存在（lockfileVersion 9.0，`cache: pnpm` 前提满足） |
| 6 | S7 组宿主不可达时 skip 不失败（BR-03） | **成立** | `host-contract.mjs:555-556` 走 `note()`（只 `skipped++`，:78）；退出码仅由 `failures` 决定（:613-616）；CI（ubuntu）无 `LOCALAPPDATA` → candidates 空 → skip ✅ |
| 7 | §5.1 口径补全：契约快照含 TypertRemoteService/defineTool（不做最小调用断言）/BlockAssembler 11 项/message 8 项 | **成立**（取舍留档缺失见 P3-6） | `:322-323` 原型链断言；`:325` arity；`:317-319` 11 项；`:320-321` 8 项；真机逐项命中（§3 AI-3） |
| 8 | 范围 = 8 锁内文件（显式 `git add`，无 `-A`） | **内容面成立；命令形态不可从提交对象核验** | `git show --stat 4315991` == 8 文件；工作树干净、无 `.governance` 之外夹带 |

## 5. 四项红演示静态推演（守卫判别力核验）

| # | 演示动作 | 是否必红 | 静态推演路径 |
|---|---------|---------|--------------|
| 1 | 往消费者加裸 `ctx.get('sessionController')` | **是** | `:433-437` 分类器把 `'sessionController'` 归入 face；`:209-217` 白名单无该 face（expected=0）→ `:440-442` diffs 非空 → `:447` 红；同时 `:443-445` 命中 `CONSUMER_BLACKLIST_FACES`（`:208` 含 `sessionController`）→ `:448` 红。另 prestep 裸注入（`sessionProjections`/`llm` 计数 1→2）同法红 |
| 2 | 往 `lib/client.js` 转发面加白名单外事件名 | **是** | `:518` 采集 client.js 全文 `event:'…'`（今日 5 站点：`client.js:2140/2143/2144/5516/5578` 全在 19 项表内）→ `:519-520` `outsideForwarded` 非空即红。旁证：往任意 `lib/*.js` 加裸 `ctx.on('settings/updated',…)` → `:469-470` 正则命中 → `:473` 红；亦被 `:531-536` illegalNode 二次捕获 |
| 3 | 从 S5 schema 白名单删被消费字段（如 `declared`） | **是** | 消费侧真读该字段（`lib/host-abi/client-remotes.js:313` `entry.declared`）→ `:494` 动态提取 consumed 含 `declared` → `:502-503` `outside` 非空即红。「字段**新增**消费」同法红。**边界**：宿主侧删/改名字段该断言不红（见 P2-3，由 S7 7b 承担） |
| 4 | 改 package.json inject / peerDeps 或删 `cordis.patch.yml` 一行 id | **是** | `:394-395` 三重 deepEqual（文件 vs 域常量 vs 冻结基线，`package.json` 现为 3 项且序一致）；`:400-403` peerDeps 8 项 + 范围 `^0.1.5-rc.2` 逐项；`:416-420` patch 行正则 == 2 行基线 + `insert` 段完好（真文件 4 空格缩进两行解析命中） |

**S5/S7 采样口径复核（本次审查重点）**：
- S5 动态块提取真锁字段面而非顶层计数：`blockOf` 对 `function joinProviderDirectoryHost(registered, directory)`（**非解构参数 → 无截断风险**，`client-remotes.js:304`）取整个函数体，`/entry\.(\w+)/g` 提取 `provider/displayName/settingsNs/settingsPath/declared`（排序去重）→ 断言 ⊆ `['provider','displayName','settingsNs','settingsPath','declared','error']`；`models: guard('remote.session'` 块提取 `catalog.*` = `{failures, groups}`（`:511-512` 精确等式，`default/routableProviders` 不越界）；`describe: guard('remote.settings'` 块提取 `value.*` = `{hasDocument, namespaces, writable}`。
- S7 7b 是真值级字段锁且**顺序敏感**：`topLevelFields` 取深度 1 双引号键，`deepEqual(fields, expected)` —— 经与真机源码逐面比对**全部一致**（`agentPresets_list_result` presets→authorable；`credentials_describe_result` configured→source→writable；`settings_describe_result` writable→hasDocument→namespaces；`llm_listConfigurableProviders_result` provider→displayName→settingsNs→settingsPath→declared→error；`llm_listProviders_result` id→name；`session_modelCatalog_result` default→routableProviders→groups→failures）。⇒ 宿主侧字段删/增/改名/换序 → 红（宿主可达时）；CI 不可达 → skip（P2-3 已记录口径差）。

## 6. 发现清单

### P1-1 CI 首跑必红：ci.yml 平台与 `smoke.mjs` 的 Windows PowerShell 硬依赖冲突（覆盖边界标注不实）

- **位置**: `.github/workflows/ci.yml:39`（`runs-on: ubuntu-latest`）+ `:61`（gate）+ `tests/smoke.mjs:53-58`（未改动的既有套件，被本批 CI 首次拉入自动化门控）
- **依据**: `tests/smoke.mjs:54` `existsSync(install.ps1)` 为真（仓库内存在 install.ps1）→ `:57` 无条件 `spawnSync('powershell', ['-NoProfile','-NonInteractive','-Command', parseScript], {stdio:'ignore'})`；`:58` 断言 `result.status === 0`。Linux 运行器只提供 PowerShell 7（`pwsh`），**不存在** Windows PowerShell（`powershell`）→ `spawnSync` ENOENT → `status === null` ≠ 0 → 该 check 失败 → `smoke.mjs:3035` `process.exit(1)` → `run-all.mjs:59/74-79` 聚合非零 → CI job 红。同仓已有正确先例未被采用：`tests/install-entry.mjs:74-77`（探测 `powershell`/`pwsh`）+ `:267-270`（缺失则 skip）。
- **影响**: B6 交付的「CI 第①步 / RISK-001 主轨道」在首次 push 即红，且是 `ci.yml:8-13` 与 README 均未披露的失败面；「本 job 跑的就是本地同一条门控命令」在该平台不成立（等价性只在 Windows 成立）。
- **建议**: 三选一——(a) `smoke.mjs` 按 `install-entry` 模式探测后 skip（需 Coordinator 扩锁 `smoke.mjs`，同 EVO-023 census 扩锁先例）；(b) `ci.yml:39` 改 `windows-latest`（代价：Linux 面不覆盖）；(c) 维持 ubuntu，但在 `ci.yml` 边界注释与 README 如实标注该平台必红/需分叉——**不得保持现状并视 CI 为绿**。
- **标注**: 静态判定（代码路径无条件 + 平台二元组）；未实跑，可在本地剥离 `powershell` 的 PATH 下复现该断言失败，或在首跑 CI 日志即时确认。

### P1-2 `run-all` 把 4 个「runner 模块」当套件执行 → 4 条零断言幻影 PASS（门控假绿面）

- **位置**: `tests/run-all.mjs:35-37`（枚举规则 `endsWith('.mjs') && name !== SELF`）；`tests/attachments.mjs:78` / `tests/audit-001-concurrency.mjs:203` / `tests/client-render.mjs:14` / `tests/install-entry.mjs:208`
- **依据**: 四模块只 `export async function runX(check)`，**无顶层执行、无 `process.exit`**（四文件 grep 零 `process.exit`；`check` 为形参且模块内无自身定义 → 顶层不可能产生断言）→ 子进程执行即 0 退出 → `run-all.mjs:60` 打印 `PASS <name>`。其断言实际由 `smoke.mjs` 承载：`:6-13` import、`:2315 runClientRender` / `:2318 runAttachmentTests` / `:2337 runAudit001ConcurrencyTests` / `:3032 runInstallEntryTests`。
- **影响**: ①「24 套件」计数虚高 4（独立套件实为 20——其余 20 个均有 `process.exit` 失败闸：如 `adapter-parity.mjs` 顶层执行 `await runAdapterParityTests` + `process.exit(1)`）；②per-suite PASS/FAIL 粒度对 4 模块零判别力；若 `smoke.mjs` 的调用被移除/改名，门控仍打印这 4 条 PASS（**静默覆盖丢失**，与 P4 看护方向相反）；③README「全量测试网：枚举 tests/*.mjs 顺序执行并聚合退出码 / 任一套件失败 → 退出码非零」与 `ci.yml:8-13` 的套件列举对这 4 条不成立；④`RUN_ALL_TIMEOUT_MS`/单套件超时对四模块无意义。
- **建议**: `run-all` 增加显式 runner 排除清单（或 `*.runner.mjs`/`_*.mjs` 命名约定）并把启动行改为「N suites + M runner modules（由 smoke 承载）」；或给四模块加 main guard 使其独立可跑。若采用排除清单，**必须同时静态断言 smoke.mjs 仍 import 并调用这四个 runner**，否则排除即等于丢覆盖。

### P2-1 S3 未实现设计 §5.1 第 3 条「inject 包名单 vs 宿主 `node_modules/@deepseek-ai/` 实际包表」半边

- **位置**: `tests/host-contract.mjs:394-398`（只做 package.json vs 域常量 vs 冻结基线三重比对）
- **依据**: 设计 §5.1 L272 明文列出该比对；本机实测三条 client inject 包 **插件自身 node_modules 不存在、宿主 checkout 存在**（`dsh-client-ui-settings` / `dsh-client-locale` / `dsh-api-remotes`：plugin-nm=False ×3 / host-nm=True ×3）→ 该核验只能在宿主侧做。
- **影响**: 宿主侧 client 包名消亡/改名（D1-1 同类事件）在全绿下静默，冻结基线不刷新则不可见。
- **建议**: S7 组追加数行 `CLIENT_PACKAGE_INJECT_BASELINE.every(p => existsSync(join(hostRoot, p)))`（`hostRoot` 即 `@deepseek-ai` 目录，路径形态已实测成立）；不可达照旧 skip。

### P2-2 S7 靶子选择非确定性（多 npx 缓存共存时可能核验非当前宿主副本）

- **位置**: `tests/host-contract.mjs:542-554`（candidates 拼接 + `readdirSync(npxRoot)` + `.find(...)`）
- **依据**: 本机 `%LOCALAPPDATA%\npm-cache\_npx` 下**两个**缓存目录共存（`1da1392061ab1944` / `1e7f6d9597241db0`），`readdirSync` 顺序非契约（两目录当前 dsh-llm/api-remotes/tools/typert-protocol 均为 `0.1.5-rc.2`，故当前良性）；`DSH_HOST_SOURCE` 未设时取「首个命中」且不打印所读靶子路径。
- **影响**: RISK-003 预警可能指向非运行宿主副本 → 假红/假绿且不可复现（依赖 FS 枚举顺序）。
- **建议**: candidates 排序（或按 mtime 取最新）+ 打印所选 `hostRoot` 与各关键包版本；或将 `DSH_HOST_SOURCE` 定为唯一权威，`_npx` 探测仅作兜底并显式声明。

### P2-3 S5/README 口径差：宿主侧字段删/改名在无宿主 checkout 环境（= CI）不红

- **位置**: `tests/host-contract.mjs:255-286`（`schema` 为冻结常量）、`:502-503`（只校验 `consumed ⊆ 常量`）、`:555-609`（宿主侧真值核验只在 S7）、`README.md` 新增段「字段级 wire schema 白名单…字段增删/改名不再静默」
- **依据**: S5 方向性是**单向**的——消费侧新增字段读取 → 红；宿主侧删除/改名 → 消费点读 undefined、产品静默错列 → S5 仍绿。唯一宿主侧锁定是 S7 7b（值级 deepEqual，已核对与真机一致），而 CI（ubuntu、无 `LOCALAPPDATA`、不装宿主 checkout）必然 skip。
- **影响**: README 的绝对化表述超出机械防线实际能力；对本轮评审关注点「是否真锁字段删增/改名」的准确回答是：**宿主可达时是（含顺序敏感值级锁），CI 与用户侧否**。
- **建议**: README/文件头改为「消费侧新增字段即红；宿主侧字段删增/改名在宿主源码可达时（S7）值级锁红，不可达只记 skip」，或在 §5.3 第③步（锁版本装宿主）落地后回填。

### P2-4 ci.yml「公开 registry 可解析」为未闭环断言（首跑前提未核验）

- **位置**: `.github/workflows/ci.yml:15-22`（宿主依赖解析段）+ `:58`
- **依据**: 本机 `~/.npmrc` 无 `@deepseek-ai` scope 定制（走默认 registry）但**存在凭据行**（内容按脱敏处理未读取）；`pnpm-lock.yaml` 的 `resolution` 不含 tarball URL；本机安装成功**不能**证明「公开（无凭据）可解析」。本环境无网络核验（未执行 `npm view`）。
- **影响**: 若 `@deepseek-ai/*` 为受限可见，CI 在无 token 下 `pnpm install --frozen-lockfile` 失败（与 P1-1 叠加成双因红）。
- **建议**: 注释改为「待 CI 首跑确认」，或 CI 配 `NODE_AUTH_TOKEN`（并在注释说明范围），或首跑前于无凭据环境核验一次。

### P3（8 条，可选）

| # | 位置 | 问题 | 建议 |
|---|------|------|------|
| P3-1 | `tests/run-all.mjs:51-56` | 未显式设 `maxBuffer`（默认 1MiB/流）：套件输出增长会把「通过」变成 FAIL 且诊断误导（ENOBUFS） | 显式 `maxBuffer: 64*1024*1024` |
| P3-2 | `tests/run-all.mjs:51-58`；`ci.yml:36-38` | 超时只终止直接子进程、不回收进程树（smoke/install-entry 会 spawn pwsh/node/server）；CI job 未设 `timeout-minutes` | job 级 `timeout-minutes` + 注释说明超时语义边界 |
| P3-3 | `host-contract.mjs:469` / `:531` | 域管事件守卫只匹配字面量名（`ctx.on(\`x\`` 或变量名不可见；当前代码无此形态） | 注释显式声明字面量假设，或补一次「无变量化订阅」断言 |
| P3-4 | `host-contract.mjs:518` | S6 转发事件采样面 = client.js 全文 `event:'…'` 字面量（未限定订阅站点；今日 5 站点全命中，未来新增无关 `event:` 字面量会假红） | 收敛到 `subscribeClientEvents(` 块锚（S5 块锚模式） |
| P3-5 | `host-contract.mjs:15-30` | 标签口径：标题「五守卫（设计 §5.1 第 1-5 条）」下实列 S1–S6 六组；S1 标「四类面」而列 5 个面组（设计原文四类面 = LlmAdapter / TypertRemoteService / defineTool / BlockAssembler+dsh-llm-message） | 对齐标签与设计条目编号 |
| P3-6 | `host-contract.mjs:325-327` | defineTool 仅 arity + 消费 options 键守卫；「不做最小调用断言（P10-④ 避免伪造宿主面）」的取舍未在文件内留档 | 补一行注记并写明代价（宿主 defineTool 语义变化不红） |
| P3-7 | `tests/smoke.mjs:2996` | 总量断言仍为 `<= 10`（迁移基线口径），B6 后实测 6 | 可收紧为 `<= 6`（非回归，属可收紧项） |
| P3-8 | `README.md` 新增「CI 第①步」段 | 步骤序列写作 `checkout → setup-node → install → gate`，漏列 `setup pnpm`（`ci.yml:44-45`） | 补全或在文中以「见 ci.yml」代替序列 |

## 7. 遗留项与关闭期限建议

| ID | 内容 | 建议期限 | 备注 |
|----|------|---------|------|
| L-1（P1-1） | CI 平台/PowerShell 冲突与覆盖边界标注 | **本轮收尾前**（≤10 行改动：smoke 探测或平台切换或注释如实化）；若延期，`plan-tracker` 须记录「CI 首跑预期红 + 原因 + 处置」 | 触 `tests/smoke.mjs` 需 Coordinator 扩锁 |
| L-2（P1-2） | run-all 幻影套件（排除清单 + 计数声明 + smoke 调用存在性断言） | **本轮或最迟下一批（B7/EVO-025）前** | 完全落在本批自有文件内，成本低 |
| L-3（P2-1/P2-2/P2-3/P2-4） | S7 宿主包表核验 / 靶子确定性 / README 字段口径 / registry 前提 | 随下一批机械处理或 CI 首跑后回填 | 均为增强或表述修正 |
| L-4（P3-1…P3-8） | 门控健壮性与标签 nit | 可台账化，非阻塞 | — |

## 8. 未验证 / 待验证（事实依据红线）

| 项 | 状态 |
|----|------|
| CI 首跑实况（平台、registry 可见性、24 条实际输出、时长） | **未验证**——Developer 如实声明「未实跑（push 后首跑）」；本报告对 CI 的两条判定为静态推理（P1-1 依据代码路径 + 平台二元组；P2-4 依据无网络核验） |
| 「四项红演示各红→绿」「退出码聚合负向演示」「S7 靶子 10/10」的实跑取证 | **部分可核**：机制静态推演全部成立（§5）；`plan-tracker:34` 有记载；`evidence-log.md:590` 目前仅 `TRIAGE-EVO-024`，EV 条目待 Coordinator 复跑后机录 |
| host-contract 运行时绿 | **静态复算通过**：常量 ↔ 仓库源码 ↔ 宿主真机源码三方逐项一致；断言数静态清点 = 70（无宿主）+ 10（S7）= 80，与 `plan-tracker:34` 一致；本 Reviewer 未执行测试 |
| `git add` 命令形态（显式 vs `-A`） | **不可核验**（提交对象不含命令）；内容面 == 声明 8 文件 ✅ |
| `lib/host-abi/ctx-services.js` 的 `CTX_SERVICES` 宿主侧方法形状真值 | **未逐项复验**（属 B4/EVO-021/022 已审面）；本轮只核 S1d 的域内单点 ↔ 冻结基线一致性 |
| README「worktree junction 规矩（EV-178）」的操作正确性 | **未实跑验证**；表述与 EV-178 事故教训方向一致（先删 junction 再 `git worktree remove`），命令形态合理 |

## 9. 证据索引（可复查事实）

- 收敛 diff：`lib/wrapper.js:32（import）/653-666`；`lib/oauth-llm.js:44/546-561`；收敛前四处裸订阅见 `git show 4315991`
- 域实现：`lib/host-abi/events.js:35-41（MANAGED_EVENTS 五事件）/50-70（19 项镜像）/101-110（WeakMap 共享注册表）/155-219（subscribeEvents + 消费者摘除）`；宿主 cordis `lib/index.js:1741/1770`（`Service: this.ctx = ctx`）
- census：`tests/smoke.mjs:2950-2996`（注释基线 10 → B5 9 → B6 6；断言 1/1 + scoped 3 + 总量 ≤10）
- 守卫：`tests/host-contract.mjs` 全文（S1 `:294-369` / S2 `:372-389` / S3 `:392-421` / S4 `:424-483` / S5 `:486-513` / S6 `:516-537` / S7 `:540-610`）
- 门控：`tests/run-all.mjs:31-79`；`package.json` scripts（`test`/`test:contract`）
- CI：`.github/workflows/ci.yml:28-61`
- 宿主真机锚点（只读核验）：`@deepseek-ai/dsh-api-remotes/lib/client.js:4315/4701/4712/5727/5735/8164`；`lib/types/remote-events.js:13-31`；`@deepseek-ai/dsh-llm/lib/index.js:909-1062/1624-1681`、`lib/types/message.js:10-85`；`@deepseek-ai/dsh-tools/lib/index.js:837`；`@deepseek-ai/dsh-api-session-controller/lib/types/agent.js`（`selectionFor(agent)`×3）；`@deepseek-ai/dsh-client-ui-model-selection/lib/types/client/service.d.ts`（`directoryFor(...)`×1）
- 归口来源：`.governance/review-EVO-023-R0-input.md:105`；`.governance/plan-tracker.md:34`
- 设计依据：`.governance/arch-004-compatibility-design.md:260-278/286-291/417-420`

---

**结论（四选一）**: `APPROVED_WITH_NOTES` · `unresolved_blockers=0` · P0=0 / P1=2 / P2=4 / P3=8
**复审提示**: 本报告为 Round 0；若 Coordinator 判 P1 需返工，返工后由同一 Reviewer 复审并按前轮 findings 逐条标注「已修复/未修复/新引入」。
