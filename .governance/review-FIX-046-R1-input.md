# FIX-046 R1 复审报告（Reviewer 输入件）

| 字段 | 值 |
|---|---|
| task_id | FIX-046 |
| **round** | **1**（复审；round < 3，未触 fuse） |
| **前轮引用** | `.governance/review-FIX-046-R0-input.md`（R0：APPROVED_WITH_NOTES / unresolved_blockers=0） |
| reviewer_role | Code Reviewer（只读——未修改任何代码、未执行任何命令） |
| 复审对象 | commit `3869e79`（4 文件 / +343 −47）：`lib/client.js`（含镜像 `tests/served-client.js`）、`tests/client-render.mjs`、`tests/rpc-shadow-guard.mjs`；**未触碰 `lib/rpc.js`**（与 Coordinator 裁定一致） |
| 审查方式 | 当前工作树逐行实读 + 与 R0 实读内容的逐处对照 + 静态推演链（文件:行号可复查） |
| **结论** | **APPROVED_WITH_NOTES** |
| **unresolved_blockers** | **0**（P0 = 0；P1 = 0；P2 = 0（新）；P3 = 6 条新发现 + 6 条 R0 遗留未修（已登记、非阻塞）） |

**R1 结论一句话依据**：R0 的 6 条 P2（F-1…F-6）**全部处置到位**（逐条有行为面或注释面证据，见 §2），真修复（客户端 `$mount` 补齐两条 descriptor）+ 防再分叉守卫（双侧 19==19、顺序、唯一、非空闸、两条 codec 深等）经静态核验**成立且判据语义精确**（§3）；R1 新引入的发现全部为 P3（无 P0/P1/P2），不构成阻塞。

---

## 1. 未验证项（MUST 显式标注；本轮同样零命令执行）

| 编号 | 未验证内容 | 处理 |
|---|---|---|
| U-1 | 门控数字：`run-all` exit 0 / `ALL 20 SUITES + 4 RUNNER MODULES PASSED (24.9s~25.7s)` / `#SKIP 2`；`client-render` 248；`rpc-shadow-guard` 30；`host-abi-health` 190；耗时 | **本人未复现**（工具边界禁止 Bash）。作者数字与 Coordinator 复跑数字**均采信**；本报告只做**静态自洽核验**（§6：`client-render` 静态计数 248 ✓ 与当前总数一致；`rpc-shadow-guard` 30 ✓ 可完全静态复原；`host-abi-health` 190 不变 ✓ 因该文件本批未改） |
| U-2 | commit `3869e79` 本体（4 文件 / +343−47 / 除此外无其他改动） | **未复核**（无法 `git show`）。本报告基于**当前工作树**实读；R0 与 R1 的差异面按"R0 会话实读内容 ↔ 当前工作树"逐处对照得出（未证工作树与 `3869e79` 完全一致） |
| U-3 | 镜像 `tests/served-client.js` **逐字节**相等（作者 SHA256 `C96C39F8…` / 407294 bytes；Coordinator SequenceEqual=True） | **本人未哈希复算**。结构性核验通过（§3-⑤）；两条来源均采信 |
| U-4 | RED 复算（旧实现 5/6 必败、R1 新增两用例必红） | **未复现**（无法取旧版本代码）。基于 R0 已确立的旧实现行为 + 当前断言面静态推演（§3-⑥） |
| U-5 | 真机 V-9 读数（面板短码 `host-face-shape: hostFaceDiagnostics`）与 `$mount` 17/19 对账 | 采信 Coordinator（EV-216/EV-217），未自行取证 |
| U-6 | 宿主 `$mount`/网关内部行为（描述符按 `method` 注册、是否按 codec 校验响应） | **仓内不可核验**（宿主包不在本仓索引面）⇒ §3-②/N-5 的相关结论均限定为"本仓可判定的部分" |

---

## 2. 逐条比对前轮 findings（R0 F-1…F-16）

| 前轮 | 级别 | 状态 | 证据（R1 实读） |
|---|---|---|---|
| F-1 失败行替换 diag 全集 | P2 | **已修复** | `lib/client.js:3898-3900`：`[{ failureRow }, ...diag]` 并列置顶；判别用例 `FIX-046-8`（`tests/client-render.mjs:2328-2329`）要求失败短码与本地条目 `inject-face-missing` **同时**在文本中（旧实现替换全集 ⇒ 必红）。本地条目存在性另有 B2 组 `tests/client-render.mjs:2131` 佐证（apply 期自检写入镜像环 `lib/client.js:5604-5607`） |
| F-2 短码默认折叠不可见 | P2 | **已修复** | `lib/client.js:3903-3904`：失败短码渲染进 **summary**（`t('hostHealthRpcFailed')(failure.code)`）；判别 `tests/client-render.mjs:2276-2277` 用 `summaryTextOf`（`:2249-2254`，取 `details.dshrouter-notice` 的 `summary` 文本）断言折叠态即见；case 6/7 亦含 summary 断言（`:2313`、`:2322`） |
| F-3 绿徽章与失败同排；注释声称不成立 | P2 | **已修复** | `:3903-3904` 失败态徽章渲染失败文案（`failure || degraded > 0` → error 类）；`degraded` 口径**未改**（`:3889` 仍仅由 faces 派生）；注释 `:3885-3887` 改为如实（"原声称已由行为消除"）；判别 `:2280-2281`（`!text.includes(zh.hostHealthOk)` 且 summary 含失败码） |
| F-4 幂等防线判据不全 + 证据不成立 | P2 | **已修复（改述为事实）** | `lib/client.js:2264-2271`：明确声明「本行**不是**自激重渲染防线」、点名 `setFaceHealth`/`setHostHealth` 未被覆盖、登记「R0 已证伪…在判别夹具中不可复现」。与 R0 建议的"二选一（补闸门 / 删声称）"第二支一致；无残留未证声称（§3-④） |
| F-5 六形态中两条零覆盖 | P2 | **已修复** | case 6 = `plain`（`:2308-2313`，非信封 → `host-face-result-invalid`）；case 7 = `noRemote`（`:2318-2322`，命名空间缺失 → `host-face-missing`）；夹具分支 `:353-360`；状态化 stub `:2238-2243` |
| F-6 commit message 未证断言 + 已复制进测试注释 | P2 | **已修复（载体面）** | 夹具形态注释 `:274-281`、组注释 `:2210-2216`、case 4 注释 `:2290` 均改述为**本仓锚**并登记 `EV-216`（stats 成功反证）/`EV-217`（客户端 `$mount` 缺 descriptor）；commit message 不可回改 ⇒ 以留痕勘正为准（符合既定处置） |
| F-7 判别组 RED 口径夸大 | P3 | **已修复** | `:2204-2209`：明确 case 2/3/4/5/6 必红；case 1 = 非回归对照（新旧皆绿）；FIX-046-2b（面探针标题）为面数据源保留守卫、非判别；真机 `?` 归 EV-214/EV-217 |
| F-8 夹具模式名漂移（`'reject'`） | P3 | **已修复** | `:270-273` 模式清单 = `ok/absent/throw/notOk/noVersions/plain`，与实现 `:353-360` 一致；`noRemote` 由独立机制文档化（`:283-284`）；全文件无 `'reject'` |
| F-9 P10-④ 宿主锚不可核验 | P3 | **已修复（形态面）** | 锚改为本仓面：`lib/service.js` `hostFaceDiagnostics()` 三键 + `lib/schemas.js` `hostFaceDiagnosticsResult` + `tests/host-abi-health.mjs` 同型 `{ok:false,error:{code}}` 用例（`:274-281`、`:2210-2216`）；残留见 N-4（新引入裸行号锚） |
| F-10 codec 锚定声明未被行使 | P3 | **未修复（已登记遗留）** | 夹具成功分支仍 `faces: [], diag: []`（`:361-365`），注释 `:346-348` 仍称条目形状锚定 `faceHealthCodec`/`hostDiagEntryCodec` ⇒ 两 codec 在渲染组零行使（R1 的 codec 校验落在 `$mount` 声明面，见 §3-②，不覆盖渲染路径） |
| F-11 双源皆缺时 notice 不上屏 | P3 | **未修复（已登记遗留）** | `lib/client.js:3861` 早退条件未含 `failure`（本轮未动该行） |
| F-12 重跑失败未清 `hostHealth` | P3 | **未修复（已登记遗留）** | `:2290-2298` 失败分支无 `setHostHealth(null)` |
| F-13 客户端失败诊断仅入镜像环（宿主 RPC/导出面不可见） | P3 | **未修复（设计如此，已登记）** | `:5139-5153` / `:5509` vs `lib/service.js:3483` |
| F-14 EN 面 detail 未 i18n | P3 | **未修复（已登记遗留）** | `:2277/2281/2287/2296` 中文字面量；en 表仅 label（`:960-961`） |
| F-15 effect 体长超建议值 | P3 | **未修复（已登记遗留）** | 现 `:2244-2305` ≈ 62 行（因新增 F-4 更正注释而增长） |
| F-16 相邻静默面（`stats`/`presetDiagnostics` 吞错） | P3 | **未修复（范围外，已登记）** | `:2173`/`:2214-2215` 未动（本批注释 `:2237-2239` 仍把 presetDiagnostics 定性为刻意例外） |

**新引入（R1）**：无 P0/P1/P2 级新问题；6 条 P3 见 §4（N-1…N-6）。

---

## 3. 本轮五个重点核验项（Coordinator 指定）

### ① 双侧集合相等守卫的判据强度（`tests/rpc-shadow-guard.mjs` §4）
- **判据清单（实读）**：`:113` 客户端包可加载且导出 `ROUTER_REMOTE`（window 垫片求值、不 apply）｜`:127` 双侧 id 集合相等（失败直印双向差集 `:121-126`）｜`:130` 顺序逐位一致｜`:132` 各自 id 唯一｜`:137` 双侧非空（fail-closed 前置闸）｜`:160` 两条新增 codec 深等（含 typeSymbol）｜`:162` 全部客户端 descriptor 的 result/parameter codec 声明在场。
- **可静默通过形态枚举（逐项判定）**：
  - 客户端取不到面（`clientIds = []`）→ `:113` + `:127` + `:137` 三处同时红 ⇒ **不可静默**（空集对空集被非空闸拦下）✓。
  - 任一侧增/删 ⇒ 集合差非空 ⇒ `:127` 红，且差集打印两侧 ⇒ 诊断直接可用 ✓。
  - 顺序漂移 / 重复 id ⇒ `:130` / `:132` 红 ✓。
  - **残留形态（N-1，P3）**：parity 循环（`:150-159`）只比对 `result.schema` / `result.typeSymbol` / `parameters[0].codec.schema` / `parameters[0].codec.typeSymbol`，**未纳入 `method` / `service` / `namespace` / `invocation.kind`**。若客户端把 `method` 写成异名而 `id` 不变，守卫全绿，而浏览器侧 `remote.router.<method>` 仍然缺失 = 同型缺陷复发。缓解项：`tests/client-render.mjs:638-639` 对**新增两条**在挂载面断言 `descriptor.method === id.split('/')[1]`（客户端侧已闭合）；服务端侧 §1（`:45-49`）只判"声明名可调用"，**异名但实存的**方法不被捕获。
- **`exports.ROUTER_REMOTE` 是否引入宿主运行时副作用**：**否**。证据：`lib/client.js:5810-5814` 为普通属性赋值，与既有 ≥11 个判别钩子同型先例（`:5793-5831`：ModelTakeover / createClientRemotes / FORWARDED_EVENT_ALLOWLIST / subscribeClientEvents / HostHealthCard / setRouterCatalog …）⇒ 宿主本已容忍非契约导出；`$mount` 调用点唯一且使用同一 const（`:5610`）⇒ 无第二事实源；导出物为模块级常量对象，无 RPC/无状态、无惰性 getter ✓。
- **正向结论**：守卫的**空集 fail-closed**、**差集诊断**、**顺序+唯一**三重冗余成立，且判据在"任一侧增删"这一目标形态上**不可静默**（达标）；未覆盖的 `method` 轴见 N-1。

### ② 新增两条客户端 codec 与 `lib/schemas.js` 逐键同构
- **关键前提（本轮新增的强证据）**：服务端 `v` 与客户端 `wv` 是**同构手写 spec 构造器**——`lib/schemas.js:357-362` 产出 `{ parse, spec: { kind, properties, optional } }`，`lib/client.js:205-211` 产出同一形态 ⇒ 守卫的 `JSON.stringify(specOf(...))` 深等**是语义精确判据**，不是框架内部串比较 ⇒ §4 的 `codecMismatches` 断言具备真实判别力（不存在"两边都序列化成 `{}`"的假绿形态）。
- **逐键对照（含键序，键序影响 JSON 深等）**：

| schema | 服务端 `lib/schemas.js` | 客户端 `lib/client.js` | 判定 |
|---|---|---|---|
| `presetDiagEntryCodec` | `:388-397`：at/kind/applied/preset/session（必填）、target（可选对象 provider+model）、skip/detail（可选） | `:365-370`：同键同序同 optional | ✓ 同构 |
| `presetDiagnosticsResult` | `:400-402`：`{ entries: array(...) }` | `:371` | ✓ |
| `faceHealthCodec` | `:407-411`：name/state 必填、detail 可选 | `:372` | ✓ |
| `hostDiagEntryCodec` | `:416-423`：at/kind 必填；face/consumer/code/detail 可选 | `:373-376`：同键同序同 optional | ✓ |
| `hostFaceDiagnosticsResult` | `:427-435`：`hostVersions{llm,tools,typertProtocol}` **三键全必填** + `faces: array(faceHealthCodec)` + `diag: array(hostDiagEntryCodec)` | `:377-383`：**三键全必填**、同序、faces/diag 同上 | ✓ 同构 |
| request codec | `wireCodecs.emptyRequest = v.object({})`（`:746`） | `wEmpty = wv.object({})`（`:212`） | ✓ |
| typeSymbol | `dsh-agent-router/types#PresetDiagnosticsResult` / `#HostFaceDiagnosticsResult` / `#request` | `resultOf`/`parameter` 同模板（`:386-391`） | ✓ |

- **descriptor 集合面（本仓完全可判）**：客户端 19 条（`lib/client.js:395-421`，静态枚举 = 19 ✓）与服务端 19 条（`lib/rpc.js:43-…`）**逐条 id、顺序、method 一致**；两条新条目 `:405-406` 与 `lib/rpc.js:70-91` 的 `parameters`/`result`/`invocation.kind` 一致 ✓。
- **限定（N-5）**：深等只保证**声明（spec 文本）等价**，两处手写**校验器实现**（`lib/schemas.js:307` `check` vs `lib/client.js:203` `wireCheck`）不在判据内；且客户端渲染路径并不经 codec（`:2286-2298` 手写判定），codec 的实际消费面 = 宿主 `$mount`（U-6 不可核验）⇒ 不得把本条读作"两侧校验行为等价"。

### ③ F-2「折叠态可见」是否真成立
- **成立**。`lib/client.js:3901-3906`：`details` 仍无 `open`（默认折叠），但 `summary` 首 span 现渲染 `t('hostHealthRpcFailed')(failure.code)` ⇒ 折叠态可见文本 = `⚠ 宿主面取数失败：<code>` + ` 宿主面健康 · 宿主版本不可读（下文列出取数失败原因）`；detail 仍在展开体（`:3908`，失败分支只渲染 `failure.detail`，短码不再重复）。
- **可读性**：短码自带命名空间前缀（如 `host-face-shape: hostFaceDiagnostics`），在 summary 内可读；`hostHealthVersionsUnavailable` 的"下文列出取数失败原因"仍与展开体一致（detail 在下方）✓。
- **代价（N-2，P3）**：失败与降级并存时，折叠态**只显示失败文案**，"⚠ n 个宿主面降级/缺失"仅存在于展开体的 faces 行 ⇒ 信息未丢、优先级改变。
- **判别设计**：`summaryTextOf`（`tests/client-render.mjs:2249-2254`）精确取 `details.dshrouter-notice > summary` 的文本 ⇒ 该断言**不**由展开体文本代偿（若未来把短码移回体内，此断言会红）✓ 设计正确。

### ④ F-4 改述后是否仍含未证声称
- **不含**。`lib/client.js:2264-2271` 逐句核对：(a) "本行不是自激重渲染防线" ✓；(b) "只在 code+detail 均相同时保留原对象" ✓（与 `:2272` 浅比较实现一致）；(c) 点名 `setFaceHealth(localFaces)`（`:2253`）与 `setHostHealth(response.value)`（`:2299`）每次重跑写新身份 ✓；(d) "R0 已证伪的…前提在判别夹具中不可复现（单次构造 root element、settle 复用同一 props 身份 ⇒ deps 稳定）" ✓ 与 `tests/client-render.mjs:150-171/640` 的 `settle`/`renderInto` 实现一致。全段无未证前提作为依据。
- 残留（无害）：末句"影响面为零：notice 写入本身幂等"为新的收敛性陈述，与实现一致（同值 → 原对象 → 无脏标记）✓。

### ⑤ 镜像纪律（结构性核验；未哈希）
- `tests/served-client.js` 与 `lib/client.js` 均为 **5834 行**（两侧 read 各自报告总行数一致）；逐字相同区段已抽查 4 处且**行号一致**：codec+descriptor 区 `355-429`、effect 区 `2284-2290`、卡片区 `3898-3908`、挂载/导出 `5610`/`5814`（grep 双向命中同一文本）。
- **未做哈希复算**（U-3）；机器判据 = `tests/host-abi-health.mjs:161-162`（`mirror === source`），按采信其通过。

### ⑥ F-5 两条新用例是否真能区分旧实现（RED 可复算性）
- **case 6（`plain` → 非信封）**：断言 `:2312-2313` = 文本含 `(host-face-result-invalid)` + 响应戳记 `not-an-envelope` + 非 `暂无诊断事件` + summary 含短码。旧实现（`if (alive && response.ok && response.value)` 形态）对字符串 `'not-an-envelope'`：`response.ok` = `undefined` ⇒ 不写状态、无 notice ⇒ 面板回落 `?` + 「暂无诊断事件」⇒ **断言必红** ✓。
- **case 7（`noRemote` → 命名空间缺失）**：断言 `:2321-2322`。旧实现 `if (!routerRemote) return` ⇒ 静默 ⇒ **必红** ✓。
- **时序可达性（静态推演，非"碰巧"）**：`load` effect 声明序（`:2170-2172`）**先于** host-face effect（`:2244`），且 `load()` 在首个 `await` 之前同步调用 `remote()`（`:2074` 区）⇒ single-shot stub（`:2240`）第一次调用给 `remoteMock`、之后给 `null`；harness 按声明序执行 pending effects（`tests/client-render.mjs:123-130`）⇒ 页面正常渲染 + host-face effect 恰取到 `null`。`remoteAbsentMode`（`:284`/`:602`）同时使 apply 级 `ctx.get('remote.router')` 为 undefined 并在用例后复位（`:2242`）✓。
- **未复算**（U-4）：旧实现代码不可得，以上为静态推演；与作者自陈、Coordinator 复跑结论一致。

---

## 4. R1 新发现（全部 P3，非阻塞）

### N-1 [P3] 双侧等价守卫未覆盖 `method/service/namespace/invocation`
- 位置：`tests/rpc-shadow-guard.mjs:146-161`（parity 循环）
- 事实依据：循环只比 `result.schema` / `result.typeSymbol` / `parameters[0].codec.schema` / `parameters[0].codec.typeSymbol`；`method` 等字段未参与（`:154-157`）。客户端侧缓解：`tests/client-render.mjs:638-639` 对新增两条断言 `method === id.split('/')[1]`；服务端侧 §1（`:45-49`）仅判 `Reflect.get(service, implementation ?? method)` 可调用 ⇒ "异名但实存"的 method 不被捕获。
- 影响：`method` 单侧漂移可静默复现 EV-217 同型缺陷（浏览器侧方法缺失），而守卫宣称的目标是"防再分叉"。
- 建议：在 parity 循环中追加 `method`/`service`/`namespace`/`invocation.kind` 的逐条相等（一行扩展，零额外维护成本）。

### N-2 [P3] 失败态 summary 遮蔽降级面计数
- 位置：`lib/client.js:3903-3904`
- 事实依据：徽章文案为三选一（failure 优先 → 其次 degraded → 否则 ok）；失败与降级并存时折叠态不再显示 `⚠ n 个宿主面降级/缺失`。
- 影响：信息未丢失（展开体 faces 行仍列出），但折叠态可读性取舍改变；无判据覆盖该组合（现有用例单形态渲染）。
- 建议：合并文案（如失败码 + 括注降级计数），或补一条"失败 ∧ 降级并存"用例锁定预期。

### N-3 [P3] 断言数链不自洽（可静态复核，建议以套件自打印数字为准）
- 事实依据（全部静态可复查）：
  - 当前 `tests/client-render.mjs` 中 `^\s+check\(` 的静态计数 = **248**，与 R1 报告的 248 **一致** ✓。
  - R1 相对 R0 树（R0 会话实读）的**内容差 = +7**：FIX-046 组内新增 5 条（`:2276`/`:2280`/`:2312`/`:2321`/`:2328`）+ 挂载面 1 条（`:638`）+ B2 组非回归 1 条（`:2102`）；R0 组内 7 条**全部仍在**（`:2262`/`:2269`/`:2271`/`:2273`/`:2287`/`:2294`/`:2302`），未发现删除。
  - ⇒ 若 R1 无其他删除，R0 末态应为 **241**，而 R0 报告记的是 243、R1 报告记的基线是 242 ⇒ **「236→243(+7)」与「242→248(+6)」不能同时成立**（至少一处基线/增量错记 1~2）。
  - 对照组（自洽 ✓，可完全静态复原）：`tests/rpc-shadow-guard.mjs` §1 循环 19 + §2 1 + §3 3 = **23**，§4 新增 7 条（`:113/127/130/132/137/160/162`）= **30** ⇒ 与"23→30"完全吻合；`tests/host-abi-health.mjs` 本批未改 ⇒ **190（0 变化）** ✓。
- 影响：仅证据数字准确性问题（不影响通过性）；但该数字将入治理记录，链式推导会放大偏差。
- 建议：以各套件自打印的 `(N assertions)` 逐轮原位记录；勿跨轮做加法推导。

### N-4 [P3] 锚卫生回归：R1 新引入 3 处裸行号式锚（闸门影响已核验为零）
- 位置：`tests/client-render.mjs:275`（`：3475-3485` → `lib/service.js`）、`:276`（`：427-435` → `lib/schemas.js`）；`tests/rpc-shadow-guard.mjs:75`（`：211` → `tests/client-render.mjs` 客户端包求值处）
- 事实依据（逐项核验）：三处均匹配 `host-abi-health.mjs` 9h-5 扫描面的**形态③裸 `:NNN`** 正则（`:1520`）；`lib/client.js` 本批**零**新增行号式锚（两种形态 grep 均无命中 ✓）。闸门影响：`tests/client-render.mjs`（`ANCHOR_CASES` `:743`）与 `tests/rpc-shadow-guard.mjs`（`:1035`）**均已在册** ⇒ 9h-5 `uncoveredFiles` 不判红；且三处未命中各自条目 `stale` 清单、其 `fresh` 清单全部在位（逐条核对：`this.stats = new StatsStore(...)`（lib/service.js）/ `statsSnapshot()` 委托 / 宿主 dsh-api-gateway 的 `Reflect.get(receiver, implementation)` 解析面）⇒ 9h R-1 不判红。**故不阻塞**。
- 影响：与本项目 FIX-040/043/044 确立的「行号式锚 → 符号名/归属式」卫生方向相反；三处锚**未登记进对应条目** ⇒ 行号漂移后无判据看护（本次形成新漂移面）。
- 责任如实归属：该写法源自 **R0 F-9 修复建议**（我给的示例即 `lib/schemas.js:427-435` 形态），审查侧建议欠精确，开发者按字面采纳 —— 建议下一轮一并改为符号名式（`RouterService.hostFaceDiagnostics()`、`wireCodecs.hostFaceDiagnosticsResult`、`tests/client-render.mjs` 的「客户端包求值（`__ModuleLoader__.load`）」），或在条目中登记并带同句上下文。

### N-5 [P3] 守卫深等只覆盖 spec 文本，不覆盖校验器实现与消费路径
- 位置：`tests/rpc-shadow-guard.mjs:143-161`；`lib/schemas.js:307`（`check`）vs `lib/client.js:203`（`wireCheck`）
- 事实依据：两处为独立手写实现，parity 只比对 spec 字面量；客户端渲染路径不经 codec（`lib/client.js:2286-2298` 手写判定），codec 的真实消费面 = 宿主 `$mount`（U-6）。
- 影响：`check`/`wireCheck` 行为分叉（如未知字段策略）不会被 `rpc-shadow-guard` 捕获。
- 建议：在断言语义中显式声明"本判据 = 声明等价 ≠ 校验行为等价"（现注释 `:140-145` 已部分声明"结构性在场判据"，可再加一句限定），或补一条最小行为对照（同一非法样本两侧 `parse` 同判）。

### N-6 [P3] `host-face-shape` 失败 detail 的因果轴不全
- 位置：`lib/client.js:2281`（`detail` 文案："宿主服务端未注册该方法——插件与宿主服务端版本不一致？"）；同族表述 `tests/client-render.mjs:351`（"旧服务端形态"）、`:2264`
- 事实依据：EV-217 已确证真机该短码的**实际成因**是客户端 `$mount` 列表缺 descriptor（浏览器侧方法不存在），而文案只指向宿主侧。文案带问号（非断言），但对下一轮排障是**方向性提示**。
- 影响：若同型缺陷以其他形式复发，面板 detail 可能把排障引向宿主侧；与 P1 事实原则的"不臆测"精神有张力。
- 建议：中性化为「宿主面方法缺失（浏览器侧挂载列表或宿主命名空间未提供该方法）」；`tests/client-render.mjs:351` 的"旧服务端形态"同步改为"方法缺失形态（真机 V-9 实测短码同形）"。

---

## 5. 硬门槛裁决（R1）

| 门槛项 | 阈值 | 判定 | 依据 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | **通过（0）** | §2/§4 无 P0；R1 新发现全为 P3 |
| 5 维度全覆盖 | = 100% | **通过** | §6 五维度逐一有 R1 结论 |
| 每条发现标注级别 | = 100% | **通过** | §4 N-1…N-6 全含 P0~P3 标签 + 位置 + 事实依据 + 建议；§2 前轮条目全含级别与状态 |
| 设计一致性检查 | 已完成 | **完成** | ①真修复与 EV-217 根因一致（客户端 `$mount` 补齐，非宿主侧扩面）②**未触碰 `lib/rpc.js`**（与 Coordinator「不授权扩面」裁定一致：grep `acceptsUndefined` 零命中、服务端 descriptor 未改）③P5 单点化：同一动作（descriptor 集合）由「双侧集合相等守卫」机器看护，旧分叉被消除而非并存 ④FIX-046 三条任务语义仍成立（失败条目替代空态 → 现为并列置顶且不隐藏 diag；失败时版本行「不可读」；降级面数语义未篡改）⑤既有纪律未破：`.hostFaceDiagnostics(` 调用点仍 = 1（`lib/client.js:2284`）、render 期零 probe、不进 2s 轮询（`tests/host-abi-health.mjs:148-160` 判据在改动后仍成立：`:2284`/`:2299`/`:3863` 在场） |
| AI 代码专项 5 项 | 全部完成 | **完成** | ①mock 残留：产品代码零 mock；新增守卫的 react 垫片完整（工厂仅解构 4 hook，`lib/client.js:29`）且对未知 require **fail-loud**（`:101-104`）②硬编码：夹具版本号/信封样例为测试常量（已声明非定因断言）；产品侧无新增魔数 ③幻觉 API：新增消费者符号全部实存（`wv`/`wireNode` `:202-211`、`ROUTER_REMOTE` `:392`、`exports.ROUTER_REMOTE` `:5814`；守卫侧 `pathToFileURL`/`globalThis.window` 真实）④未实现 TODO：`lib/client.js` 与守卫零 TODO/FIXME（grep 验证）；无死模式（`'reject'` 已除）；`remoteAbsentMode` 有读点（`tests/client-render.mjs:602`）非死变量 ⑤过度实现：本批 = 真修复（2 descriptor + 5 镜像 codec）+ 1 条防分叉守卫 + 判别补全；守卫 §4 的 7 条断言直接对应 P5 纪律与根因，非过度；未扩面到 `lib/rpc.js`/宿主面 |

**5 维度 R1 结论**：正确性 ✓（六形态路径完整 + 新增两条用例；逻辑与 R0 一致，仅 F-1/F-2/F-3 渲染语义按建议修正）｜安全性 ✓（无新增输入面/权限面；summary 与 detail 均经文本子节点渲染，无注入面；新增导出为常量，无敏感数据）｜可维护性 ✓（真修复点注释详实且含根因与勘正；N-1/N-4/N-5/N-6 为注释与判据的精度建议）｜性能 ✓（**注意一条行为变化**：客户端现已挂载 `presetDiagnostics`，生产环境 2s 轮询将按设计同时发起 stats + presetDiagnostics **每拍 2 RPC**（`lib/client.js:2211-2219`），与 D1-10 设计/判据 `tests/client-render.mjs:2183-2184`（≤1 RPC/s）一致；此前生产侧该 RPC 因描述符缺失而恒不触发——本批**顺带修复了预设诊断轮的静默失效**）｜测试覆盖 ✓（六形态全覆盖 + 挂载面断言 + 30 条双侧守卫；残留 F-10/N-1）。

---

## 6. 静态核验记录（可复查）

| 核验项 | 结果 | 依据 |
|---|---|---|
| 客户端 descriptor = 19 条，id/顺序/method 与服务端逐条一致 | 成立 | `lib/client.js:395-421`（静态枚举 19）↔ `lib/rpc.js:43-…` |
| 两条新 descriptor 的 codec 与权威 shape 逐键同构（键序 + optional 一致） | 成立 | `lib/client.js:365-383` ↔ `lib/schemas.js:388-435/746` |
| 客户端/服务端 codec 构造器同构（使深等判据语义精确） | 成立 | `lib/schemas.js:357-362` ↔ `lib/client.js:205-211` |
| 两条确实进入 `$mount` 列表 | 成立 | `tests/client-render.mjs:638-639`（断言 `captured.mount.descriptors`）+ `lib/client.js:5610` 单一挂载点 |
| `exports.ROUTER_REMOTE` 无宿主运行时副作用 | 成立 | `lib/client.js:5810-5814` + 既有钩子先例 `:5793-5831` |
| 守卫断言数 = 30（23 旧 + 7 新） | 成立 | §1 循环 19 + §2 1 + §3 3 + §4 7（`:113/127/130/132/137/160/162`） |
| `client-render` 当前断言静态计数 = 248 | 成立 | `^\s+check\(` 命中 248 行（与报告数字一致） |
| R1 相对 R0 的断言增量 = +7（报告记 +6） | **不一致** | 见 N-3 |
| `host-abi-health` 本批零改动 ⇒ 190 不变 | 成立 | 该文件不在 4 文件清单；`lib/client.js` 改动点仍满足其 §3/§9h 判据（`:2284`/`:2299`/`:3863`；无新增行号锚） |
| 镜像结构性一致（未哈希） | 成立 | 两侧同 5834 行；`355-429`/`2284-2290`/`3898-3908`/`5610`/`5814` 逐字同 |
| 锚卫生（9h-4/4b/4c 与本批无交集；9h-5 不判红） | 成立 | 守卫本批未改；两目标文件均在 `ANCHOR_CASES`（`:743`/`:1035`），`fresh` 清单逐条在位 |
| `lib/rpc.js` 未扩面 | 成立 | grep `acceptsUndefined` 全仓零命中；`ROUTER_DESCRIPTORS` 两条新条目为 FIX-030-C/ARCH-004 既有面（非本批新增） |

---

## 7. 交付与后续

- 本报告路径：`.governance/review-FIX-046-R1-input.md`（唯一允许写入；未修改任何产品/测试文件，未执行任何命令）。
- **CONCLUSION = APPROVED_WITH_NOTES，unresolved_blockers=0** ⇒ 可作为 pass 终态消费（round 1 < 3，未触 fuse；不存在 BLOCKING/未解决 blocker）。
- 建议（非阻塞，供 Coordinator 决定是否纳入同一批或登记遗留）：N-1（守卫补 `method` 轴，一行扩展）与 N-4（3 处锚改符号名式）**成本极低且直接服务于本任务的反分叉目标**，建议顺手闭合；N-3 建议更正证据数字；N-2/N-5/N-6 为文案与判据精度项；F-10…F-15 维持 R0 的遗留登记。
- 镜像/门控复跑：本轮的哈希与全量门控由 Coordinator 已复跑（U-1/U-3），本人未复现；如需第三方复现，建议以 `node tests/run-all.mjs` + 两侧 `Get-FileHash` 一次性留档。
