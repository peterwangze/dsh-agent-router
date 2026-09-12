# REVIEW-EVO-023-R0（input）— ARCH-004 B5 events 域批 + 客户端死订阅修复 + 设置页轮询治理

- **任务**: EVO-023-R0（P1）｜**角色**: Code Reviewer Agent（只读审查，不修改产品代码/测试/治理状态）
- **审查对象**: commit `79eead9`（`D:/AI/agent/deepseek/plugins/router`；`git rev-parse HEAD` = 79eead9 全程未变；13 文件 +1006/−111）。**对象完整性**: 审查开始时 `git status --porcelain` 空；审查期间工作树新增 Coordinator 治理记录（`.governance/evidence-log.md` +2 / `plan-tracker.md` +3−1 / `change-triage/EVO-024.json`，非本 Reviewer 所为），`git diff --stat 79eead9 -- lib tests package.json README.md` **空 = 产品/测试面零漂移**，审查对象未被触碰
- **设计依据（只读实读）**: `.governance/arch-004-compatibility-design.md` §0.2/§0.5（L34/L60）/§3 D1-9·D1-10（L129-130）/§4.3 域 4（L230-235）/§5.1(5)（L278）/§5.2（L284）/§7.1（L330-335）/§7.2（L337-341）/§10 B5（L408-415）；宿主一手源 `dsh-api-remotes/lib/types/remote-events.js`
- **工具边界**: read / grep / glob + 只读 git（log/show/rev-parse/grep/status/diff）；**未执行任何测试、未写产品码/测试/治理状态**，唯一产出为本文件
- **结论**: `APPROVED_WITH_NOTES`
- `unresolved_blockers=0`
- 计数: **P0=0 / P1=0 / P2=1 / P3=8**（P2-1 建议本轮或下轮修复；P3 为讨论/精度项，不阻塞）

---

## 1. 独立复算与机核（Reviewer 自跑，非引用 Developer 证据）

### 1.1 镜像 hash（声称 DEDDAD42…E56B3E）

| 项 | 复算结果 |
|---|---|
| `sha256(lib/client.js)` | `deddad42dc76673d3a9399bf249563a7df8be8e8d0207203196713f4a2e56b3e` |
| `sha256(tests/served-client.js)` | `deddad42dc76673d3a9399bf249563a7df8be8e8d0207203196713f4a2e56b3e` |
| git blob（两文件） | 前像 `9128949576492f…3919375` → 后像 `546cd6a0379b19…6318dc`，**两文件同进同出** |
| 文件长度 | 各 394,828 字节，逐字节同一内容（非 174 行子集比对） |

**结论：声称 hash 复算成立**（`DEDDAD42…E56B3E` = 全文件 SHA256 首尾），且镜像 parity 由「git blob 同源 + 全文件哈希相等」双重锁死，强于 diff 行级比对。

### 1.2 转发白名单四表一致性（口径核心）

以宿主一手源 `dsh-api-remotes/lib/types/remote-events.js:12-32` 重建列表，与镜像逐项比对（含**顺序**）：

| 来源 | 项数 | 与宿主源逐项+顺序相等 |
|---|---|---|
| 宿主源（重建） | 19 | — |
| 权威 `lib/host-abi/events.js:50-70` | 19 | ✅ True |
| 客户端镜像 `lib/client.js:5078-5098` | 19 | ✅ True |
| 镜像副本 `tests/served-client.js` | 19 | ✅ True |

- `credentials/updated` **不在**宿主表（`-contains` = False）→ Analyst D-2 死订阅归因成立；
- `credentials/reference-updated` 在宿主源 **:21**、数组第 9 位 → 代码注释「同表 :21」属实；
- 宿主表为 `{event, mode}` 结构，`mode: 'waterfall'` 2 项（`approval/request`、`user-questions/request`）——镜像只取 event 名（见 P3-1）。

### 1.3 §9b 静态白名单扫描复现（自写正则，非引用测试输出）

`lib/client.js` 内 `$on('…')` 字面量 + `event: '…'` 字面量合计 **恰 5 站点**：`settings/document-updated`×2、`credentials/reference-updated`、`llm/adapters-updated`、`agent-preset/selected` —— 全部 ∈ 白名单，且无 `credentials/updated`。断言 `onSites.length >= 5` 恰好卡在边界（当前实现下从成立到不成立只差 1 个站点，见 P3-8）。

另核：`ctx.remote.$on` 的**全部**调用点已收敛到 `const $on = (event, listener) => ctx.remote.$on(event, listener)`（`lib/client.js:5483`）→ 经 3 处 `subscribeClientEvents` 调用（:2139 设置页 / :5516 catalog / :5578 预设切换，同一 `$on` 闭包），**无绕过镜像的裸 `ctx.remote.$on` 调用**（运行时半边覆盖 100% 客户端订阅面）。

### 1.4 R-1 旧锚残留（声称「grep 零残留，5 命中全在 §9h 夹具」）

对 10 个旧锚（`preset-defaults.js:163/194/214`、`prestep.js:193`、`wrapper.js:516`、`oauth-llm.js:449`、`service.js:927`、`host-route.js:248/55/263-270`、`host-route.js HOST_ROUTE_PROVIDER`）全仓 `git grep -F`：

- **lib/ 产品面：零残留**（每项 lib= 空）；
- **tests/：唯一命中文件 = `tests/host-abi-health.mjs:687-691`（§9h `ANCHOR_CASES` 五行的 stale 夹具）**→ 声称的「5 命中全在 §9h 夹具」按「产品+测试源码」口径**成立**；
- 其余命中在 `.governance/arch-004-compatibility-design.md:54/231/335/456` 与历史 `review-*-input.md`——属历史记录（设计原文与既往审查报告），**不应**被清扫，不构成残留。

### 1.5 订阅 census（声称 10→9；`settings/updated` 4→3）

静态计数（消费点实读）：`settings/updated` = 3（index 统计持久化 + service 两 consumer **共享单 listener**）、`llm/adapters-updated` = 2（wrapper/oauth-llm，未迁）、`agent/pre-step`/`agent/created`/`agent/request` 各 1、`agent-preset/selected` = 1（经域）→ 合计 9（基线 10）。
共享前提 = `subscribeEvents(ctx…)`（index.js）与 `subscribeEvents(this.ctx…)`（service.js）同键；`RouterService` 由 `new RouterService(ctx)`（`index.js:218`）构造——该前提由 `tests/smoke.mjs` 的 `census['settings/updated'] === 3`（而非 4）机器断言锁定，非仅注释声称。

### 1.6 R-1 新锚对象级抽查（≥6 要求，本轮实查 12 处；grep 级≠对象级，按 EV-180 教训逐项归属确认）

| # | 注释锚（函数名+文件） | 对象级核验 | 结果 |
|---|---|---|---|
| 1 | `llm-selection.js` 的 `llmFaceOf`（wrapper/oauth-llm 消费） | 定义 `llm-selection.js:51`；消费 `wrapper.js:547`、`oauth-llm.js:478` | ✅ |
| 2 | `llm-selection.js` 的 `sessionSelectFaceOf` | 定义 `:109` 起，5 处引用 | ✅ |
| 3 | `llm-selection.js` 的 `liveDefaultSelection` | 域文件 2 处 | ✅ |
| 4 | `preset-defaults.js` 的 `agentsRegistryOf` 消费点 | 导入 `:120`，消费 `:376`、`:444` | ✅ |
| 5 | `preset-defaults.js` 的 `agentPresetsServiceOf`（`livePresetOf` + 遥测） | `livePresetOf` 定义 `:170`、调用 `agentPresetsServiceOf` `:172`；遥测点 `:528` | ✅ |
| 6 | `service.js` 的 `safeListModels` / `resolveModelInfo` 消费点 | `safeListModels` 定义 `:934`、消费 `:923`；`resolveModelInfo` 消费 `:1298/:1346` | ✅ |
| 7 | `host-route.js` 的 `readProvidersEntry` / `syncHostRoute` | `readProvidersEntry` 3 处；`syncHostRoute` 定义 + 消费 | ✅ |
| 8 | `host-abi/version.js` 的 `HOST_ROUTE_PROVIDER`（stats.js 镜像） | `version.js:22 = 'openai-codex'`；`stats.js` 常量 `HOST_ROUTE_ACCOUNT_KEY = 'openai-codex'` **值级相符** | ✅ |
| 9 | `events.js` 锚 `lib/host-route.js` 的 `syncHostRoute`（替 `host-route.js:263-270`） | `events.js:17` 命中 `syncHostRoute`；`host-route.js:270-274` 新增口径注释块 + 本体 | ✅ |
| 10 | 「tests/oauth-main-model.mjs F1-2 断言 lastAction=gated」 | `tests/oauth-main-model.mjs:591`：`check('F1-2: 事件 pass 失败态 gate（lastAction=gated，零写入收敛）'…)`，夹具 `startHostRouteMaintenance()` + 事件发射，确为写级 gate 契约 | ✅ |
| 11 | `ctx-services.js` 的 `sessionProjections = lib/prestep.js 的会话投影读取点` | `prestep.js:196` 裸 `ctx.get('sessionProjections')`（B4 §8a 白名单冻结项 `tests/host-abi-health.mjs:348`）——注释如实（"读取点"，未声称域访问器） | ✅ |
| 12 | `fix-031-attribution.mjs` / `client-render.mjs:1632` → `host-abi/version.js HOST_ROUTE_PROVIDER` | 两文件均含新锚；G13/G14 权威读取点已在 `:685-687`（`readRepo('lib/host-abi/version.js')` 值级读取） | ✅ |

**零处不实锚**——R-1 清扫的机械性与准确性本轮均成立。

### 1.7 R-5 接线面数

`CTX_SERVICES` 11 键（`ctx-services.js:50-62`）→ `ctxServiceFaceProbes()` 派生 11 面（`:167-172`）+ `llm:adapter`（`probeLlmAdapterFace`）+ `session:select`（`probeSessionSelectFace`）= **13 面**，`lib/index.js:227-232` 注册 + 启动自检。两 probe 均为**同步**返回 FaceHealth 形状（`llm-selection.js:67-96`）→ `runFaceProbes`（`health.js:93-114`）无 Promise 误判、无并发交错（复检为同步段）。host-abi 桶 `export *`（`index.js:9-15`）无重名导出（48 个导出名去重核验：零冲突）。

---

## 2. 声称逐条核验（Developer claims × 9）

| # | 声称 | 核验方法与事实 | 结论 |
|---|---|---|---|
| 1 | events.js 域落地：MANAGED_EVENTS 五事件 + isForwardedEvent + 白名单运行时拒绝 + 共享 listener 注册表（按 consumer 摘除/清零 dispose）+ gate 位 + await 语义透传 | `events.js:35-41/50-78/101-136/155-219` 实读；五事件清单与 §4.3 域 4 一致，scoped 三钩子不在清单；拒绝路径 `:169-172`（code=not-forwarded）；注册表 `:183-214`（`entry.consumers` 摘除 → 清零 `dispose` + `table.delete`）；gate `:123-126/89-94`；透传 `:129-135` | ✅ 成立（残余见 P2-1/P3-1/P3-2） |
| 2 | 消费点收敛 index.js 统计持久化 + service.js 宿主路由维护；preset-defaults agent-preset/selected 入域；scoped 钩子保留直订 | `index.js:260-276`、`service.js:2856-2885`、`preset-defaults.js:480`；ns 过滤语义逐字保持（router/undefined→user、llm-pi-ai→llm）；`agent/created`/`agent/request`/`agent/pre-step` 直订未动（`preset-defaults.js:475`、`prestep.js`） | ✅ 成立（census 4→3 见 §1.5） |
| 3 | D-2 修复：`:2093` 改订 `credentials/reference-updated` + 判别（正名派发 → load() → catalog RPC；旧名零订阅） | 现码 `client.js:2143` 正名；旧名全仓零订阅（§1.3）；`tests/client-render.mjs:2105-2110` 判别断言在旧码下**必红**（`deadSubs.length===0` 直接失败、`refSubs.length===1` 失败）→ 判别力静态成立 | ✅ 成立（判别力独立复核，非仅采信运行结论） |
| 4 | D1-10：隐藏暂停 + visibilitychange 唤醒补拍；双 RPC 同拍单 2s timer；可见态 2 RPC/拍、隐藏态 0 | `client.js:2172-2182`（`visible()`/`tick()`/单 `setInterval(tick, 2000)`/`visibilitychange` 注册与卸载）；`poll()` 内含 stats + presetDiagnostics（`:2159-2171`）；判别 `tests/client-render.mjs:2112-2135` | ✅ 成立（口径精度见 P3-7） |
| 5 | 浏览器镜像 subscribeClientEvents 值级 parity 锁定 | §1.1 镜像同源；§1.2 四表白名单值/序全等；`tests/host-abi-health.mjs:559-608`（§9e：`JSON.stringify` 值级 + 拒绝/派发/聚合/卸载行为 parity） | ✅ 成立（失败路径 parity 见 P3-5） |
| 6 | R-1 清扫 8 项锚 → 函数名+文件式 + events.js 锚 + stats.js/fix-031/client-render → version.js + §9h 守卫 | §1.4 残留核验 + §1.6 十二处对象级抽查全命中 | ✅ 成立（守卫强度见 P3-3） |
| 7 | R-5：ctxServiceFaceProbes（11 面派生）+ 13 面注册 + 启动自检；hostFaceDiagnostics 全绿纯缓存读/非全绿一次失败驱动复检 | `ctx-services.js:167-172`、`index.js:227-232`、`service.js:3459-3466`（`cached.length===0 \|\| some(state!=='ok') → runFaceProbes(this.ctx)`）；§1.7 | ✅ 成立（无 debounce，Coordinator 裁决 ③ 已接受；幂等/并发见 §4.1） |
| 8 | R-3：F-6 faces 去重行为断言（导出 HostHealthCard 走 §8g bundle 装载真实渲染） | `client.js:5656-5658` exports `FORWARDED_EVENT_ALLOWLIST`/`subscribeClientEvents`/`HostHealthCard`；`tests/host-abi-health.mjs:663-683`（§9g：同名 `llm` 仅一行取 RPC 权威态、本地独有面保留、徽章口径随去重） | ✅ 成立 |
| 9 | 证据：RED→GREEN 23/23（host-abi-health 133 断言）；死名红演示 4 条→复原双绿；R-1 grep 零残留；订阅基线 10→9 | R-1 零残留 ✅ 独立复算；census 10→9 ✅ 静态复算；**RED/GREEN 运行结果未复跑**（工具边界：禁执行测试，Coordinator 已独立复跑并机录）——以判别力静态分析替代 | ⚠️ 部分未验证（见 §8） |

---

## 3. 三项预载裁决复核（认同/反对 + 锚点）

| # | Coordinator 裁决 | 我的复核 | 立场 |
|---|---|---|---|
| ① | wrapper.js/oauth-llm.js 剩余 4 处订阅收敛锁外 → 归口 B6（非本批缺陷） | 事实成立：`lib/wrapper.js:649`、`lib/oauth-llm.js:541` 仍裸 `ctx.on('settings/updated')`（另各 1 处 `llm/adapters-updated`）→ 设计 D1-9「4 处 settings/updated 收敛」本批**只完成 2/4**（4→3，非 4→1）。归属证据链完整：`plan-tracker:34`（EVO-024 = B6 批，范围明列「B5 归口剩余 4 处订阅收敛（wrapper/oauth）」）+ `events.js:12-15` 文件头如实声明本批消费者范围 + `tests/smoke.mjs:2950-2960` census 注释如实标注「不在本批锁内」。**无隐匿、无双重实现并存**（P5 口径：未迁移 ≠ 新旧并存） | **认同**（非缺陷；B6 范围已在治理台账绑定） |
| ② | 域 gate = 整 handler 抑制 vs host-route F-1 写级 gate 分层并存；host-route 不声明域 gate 正确 | 机制核对成立：域 gate 在 `dispatchTo` 的 `continue` 处整消费点跳过（`events.js:123-126`），而 F-1 的写级门在 `syncHostRoute` 内部分支（`host-route.js:275` `gateWrites`，事件 pass 仍执行只读状态/user-modified 检查）。若 host-route 声明域 gate，将整体跳过该 pass 而丢只读面 → `tests/oauth-main-model.mjs:591` F1-2（`lastAction=gated` + `mutate ≤2`）契约回退。两机制同源不同粒度，注释在 `host-route.js:270-274` + `events.js:20-24` 双向成文，无「并存双实现」——**单一分发实现 + 两种门控粒度** | **认同**（口径分层正确；域 gate 当前仅测试消费，`tests/host-abi-health.mjs:211-221` §2 覆盖，`lib/` 内零生产消费者——符合裁决②的预期后果） |
| ③ | §5 标签如实更新 + 读时复检自愈替代延迟自检接受 | 实现与接受口径一致：`service.js:3459-3466` 为**读时**复检（非延迟 timer），无 debounce（设计 §5.2 原文「debounce 30s」未实现）——但复检仅在「快照空或含非 ok」时发生，且 `router/hostFaceDiagnostics` RPC **不在 2s 轮询路径**（`client.js:2159-2171` 仅 stats + presetDiagnostics；RPC 单调用点 `client.js:2203` 位于一次性 effect `:2190-2208`），故「探针不进 2s 轮询」在实现层面成立（非绿态下的重复读才会重复探针，见 P3-7 附注）。boot 期陈旧 missing 于面板首次打开即自愈——首个可见快照即新鲜 | **认同**（接受成立；残余仅「非绿快照下每次 RPC 读 = 一次全量同步 probe（13 次 ctx.get）」，代价有界，且属裁决范围） |

---

## 4. 五维度逐一结论

### 4.1 正确性 — 通过（1×P2）

- **共享 listener 注册表**：同目标同事件名 → 单宿主 listener；`dispatchTo` 用 `entry.consumers.slice()` 快照遍历防分发中改表（`events.js:122`）；按 consumer 摘除 + 清零才 `dispose` + `table.delete`（`:204-213`）；`disposeAll` 幂等（`splice(0)` 清空，`:216`）；卸载抛错吞并（`:210/:217`）；目标键 `WeakMap` 防泄漏（`:101`）。**并发/生命周期语义正确**。
- **卸载路径覆盖**：index.js `ctx.effect` 返回 disposer（`:272-275`）、service.js `startHostRouteMaintenance` 返回 disposer（`:2880-2883`）、preset-defaults `disposeSelected`（`:482-484`）、客户端 4 处（React cleanup / `ctx.effect`）——各调用点只摘除自身 consumer，无跨模块误摘（§9d 有机器断言）。
- **ns 过滤语义逐字保持**：`router|undefined→user`、`llm-pi-ai→llm`（`service.js:2861-2870`），原单 handler if/else 拆分后语义等价（smoke B5 组逐 ns 计数断言）。
- **await 语义透传**：单 consumer thenable 原样返回（`events.js:135`）——**承重**：`preset-defaults.js:441` 的 `onPresetSelected` 是 `async`，透传丢失即改变播种链语义；多 consumer `Promise.all`；无 thenable 零 Promise 分配。声称属实。
- **R-5 复检幂等/并发**：两 probe 与 11 个 ctx 探针全同步（`health.js:96-110`），`hostFaceDiagnostics()` 无 `await` 断点 → 多面板并发调用互相不交错，最后写者即最新快照；幂等（同 ctx 重复探测结果相同，状态变化才入环形 `:105-108`）。
- **缺陷 P2-1**：attach 抛错后的条目被当作「已活」缓存（见 §5）。

### 4.2 安全性 — 通过（0 发现）

- 白名单镜像与宿主一手源**值/序全等**（§1.2）→ 无越权面扩大、无过度收紧误伤（当前 5 站点全在表内，§1.3）。
- 诊断条目字段白名单 + 截断（`health.js:37-44`：kind/face/consumer/code/detail，detail≤160）；域内新记事件只含事件名、consumer 标签、错误消息（≤120）、短码——**零凭据值、零 token、零路径细节**；`event-subscribe-rejected` 仅带事件名（`:170`）。
- 无新增网络/fs/凭据通道；无硬编码密钥；`isForwardedEvent` 对非串/空串防御（`:77`）；`gateKeyOf` 截断 64 防键膨胀（`:83`）。
- 未新增外部输入解析面（白名单比对是集合查询，无正则注入面）。

### 4.3 可维护性 — 通过（4×P3）

- 单域 ≤400 行（`events.js` 220 行）；桶零逻辑；域间无横依赖（`events.js` 仅 import `health.js`）；注释与实现一致（逐条比对无虚指，§1.6/§3①）。
- 客户端镜像 ~115 行重复逻辑：属本仓既定镜像纪律（bundle 无 ESM 面），值级 parity 已锁（§9e）。
- 域 gate 设施当前无生产消费者（裁决②的预期结果），有 §2 测试 + 双向注释，非死代码。
- P3-3/P3-4/P3-5/P3-8（守卫强度、MANAGED_EVENTS 未运行时强制、镜像失败路径 parity、§9b 文本级近似）。
- **编程要求 4（一 commit 一问题）**：本 commit 承载 B5 + R-1 + R-5 + R-3 四类改动 → 与「一个 commit 承载一个问题修改」存在表面张力，但三项 R 项在规划期即绑定（`plan-tracker:35`「绑定 = R-1 … / R-5 … / R-3 …」）→ **属规划内绑定，非擅自扩范围**；回滚粒度 = 整批（与设计 §7.4「每批可 revert」一致）。记为 P3-9。

### 4.4 性能 — 通过（0 阻塞）

- **零新增常驻 timer**：`client.js` 新增 `visibilitychange` 事件监听（非 timer）；2s timer 数量不变（1）；30s catalog 兜底不变（:5517）；无新 interval/timeout。
- 2s 双 RPC：可见 2 RPC/拍（=1 RPC/s，符合设计「≤1 RPC/s 量级」）；隐藏 0（`:2173` 门控）；隐藏态 timer 空转（计一次布尔判断，可忽略）。
- 分发开销：单事件 1 次数组快照（`slice`，消费者 1-2）+ 逐 consumer 调用；无 thenable 时零 Promise 分配；诊断仅在拒绝/gate/handler 错误时写（无热路径写入）。
- probe 成本：apply 一次 13 次同步 `ctx.get`；RPC 读在非全绿时重复一次（无 debounce，协商接受）；渲染路径零 probe（既有 `client.js` 单调用点断言未破）。
- 残余：隐藏态仍存在 30s catalog 兜底 RPC（D1-8 设计保留，非本批问题，见 P3-7）。

### 4.5 测试覆盖 — 通过（2×P3 缺口）

- 覆盖矩阵：§9a 清单/口径、§9b 静态白名单 + P5 迁移残留、§9c 运行时拒绝 + 放行 + 宿主面不受白名单约束、§9d 聚合/摘除/清零 + 异步 await 语义、§9e 镜像值级+行为 parity、§9f R-5 faces 生产性 + 空 ctx 反向 + 全绿纯读/非全绿复检、§9g F-6 去重、§9h R-1 锚；`client-render` B5 组（D-2 判别 + 定时器 census + 可见/隐藏/唤醒）；`smoke` B5 组（census + 事件链 count + R-5 三断言）。**核心路径与错误路径（白名单拒绝、handler 抛错吞并）均有断言。**
- **未覆盖（P2-1 相关）**：`attach` 抛错路径与「宿主返回无卸载器」路径零测试（`event-subscribe-failed` 在 tests 内仅出现在 served-client.js 镜像副本中，无驱动用例）→ 该分支行为无看护。
- 未覆盖（P3-1）：waterfall/同步返回值语义；未覆盖（P3-5）：镜像失败路径 parity。
- 边界/生命周期：多面板/幂等卸载由 §9d/§9e-2 覆盖；快速可见性切换未覆盖（P3-7 讨论）。

---

## 5. 发现列表（P0~P3，含位置/依据/建议）

### P2-1（建议本轮或紧邻批次修复）— attach 失败条目被缓存为「已活」→ 静默死订阅 + 观测误导

- **位置**: `lib/host-abi/events.js:186-199`（`let entry = table.get(event)` → `try { attach } catch { noteHostDiag }` → **无条件** `table.set(event, created)`）；镜像同型 `lib/client.js:5137-5162`。
- **依据（可复查）**: ①`:191-196` attach 抛错时 `created.dispose = null` 且已 `table.set`；②下一次 `subscribeEvents` 同目标同事件 `table.get(event)` 命中该条目 → **不再尝试 attach**，仅 `entry.consumers.push(...consumers)`（`:200`）并记 `noteHostDiag({kind:'event-subscribed', …})`（`:201-203`）——即**正向订阅记录 + 零宿主 listener**；③消费者清零时 `entry.dispose?.()` 为 no-op → 表项删除、下次订阅才重试；④全仓 tests 无该分支驱动用例（见 §4.5）。
- **影响**: 宿主事件面 attach 抛错（ctx 已 dispose / 非法事件名等）后，同事件后续消费者**永久静默收不到事件**，且诊断环形给出「已订阅」的相反信号——与本批「死订阅类缺陷自此有机器防线」的目标正相反；违反 P8（失败/降级可观测）与设计 §4.3 域 4 降级行为（「订阅失败 → 该事件消费者全部进降级名单」）。
- **非回归说明**: 迁移前 attach 抛错会直接冒泡出 install（更响），故本批行为是改进；残余缺陷仅在「条目缓存」这一步。
- **建议**: `if (attach 成功) table.set(event, created)`（失败则不缓存，后续调用自然重试并再记 `event-subscribe-failed`）；或给 `created` 加 `failed: true` 并在后续调用复记 `event-subscribe-failed`（带 consumer 标签）而非 `event-subscribed`；补一条 RED 能力用例（`on: () => { throw … }` → 断言零 listener 注册 + 二次订阅仍记 failed）。

### P3-1（讨论）— 同步返回值被丢弃：waterfall 模式转发事件不可经域消费

- **位置**: `lib/host-abi/events.js:120-136`（只有 thenable 入 `pending`，`:134` 无 thenable 时返回 `undefined`）；白名单镜像丢 `mode`（`:50-70`）。
- **依据**: 宿主表 2 项为 `mode: 'waterfall'`（`remote-events.js:14/31`：`approval/request`、`user-questions/request`）——waterfall 语义依赖监听器**返回值的链式传递**；经域订阅后同步返回值丢失（异步 thenable 不受影响）。
- **影响**: 当前零消费者（§1.3 五站点无 waterfall 项）→ 无现网缺陷；但白名单放行使未来消费者可能静默丢失语义。
- **建议**: 在 `events.js:44-49` 注释显式声明「waterfall 事件不得经域订阅」或对 `mode` 建镜像并在订阅时拒绝；B6 静态层补一条。

### P3-2（讨论）— 异步 rejection 不落环形（sync throw 与 async 失败观测不对称）

- **位置**: `lib/host-abi/events.js:127-132`（`try/catch` 仅覆盖同步抛错；`:135` 直接外传 promise）。
- **依据**: `dispatchTo` 对 sync throw 记 `event-handler-error`；async 消费者 reject 时既无环形记录亦不吞（单 consumer 原样外传、多 consumer `Promise.all` 传播）。迁移前直订同风险（宿主 fire-and-forget → 潜在 unhandled rejection），**非本批引入**；但 `preset-defaults.js:441` 的 `onPresetSelected` 为 async，是实际可 reject 的消费者。
- **建议**: 透传语义不变前提下，在返回前挂 `void promise.catch(err => noteHostDiag({kind:'event-handler-error', …}))`（不改变返回值链）——纯增益观测。

### P3-3（讨论）— §9h 锚守卫是 grep 级（与 F-CTX-1 教训同类）

- **位置**: `tests/host-abi-health.mjs:685-694`（`ANCHOR_CASES` + `source.includes(needle)`）。
- **依据**: 断言只验证「注释文本包含函数名字符串」，不验证**被引用符号确实存在于被引用文件**——若注释把 `safeListModels` 错记为 `oauth-llm.js`，该守卫仍绿。本轮 Reviewer 自行做了对象级抽查 12 处（§1.6）全部命中，故**当轮无实害**。
- **建议**: §9h 用例增加 `fresh` 项的宿主文件归属（如 `{file, fresh: [{needle:'safeListModels', in:'service.js'}]}`，读该文件断言符号）；或移交 B6 的注释锚对象化守卫。

### P3-4（讨论）— MANAGED_EVENTS 无运行时强制；域 API 可绕 W-3 口径

- **位置**: `lib/host-abi/events.js:35-41`（声明）/ `:155-182`（host 面无事件名校验，仅转发面校验白名单）。
- **依据**: `subscribeEvents(ctx, [{event:'<任意名>'}])` 恒被接受；W-3 的域管清单仅用于声明与测试，B6 黑名单（设计 §5.1(3)）只覆盖**裸** `ctx.on/$on` 订阅点。
- **建议**: 在 host 面对「不在 MANAGED_EVENTS 且不是 scoped 白名单」的事件名记 `event-subscribe-unmanaged` 诊断（不阻断），或明示 B6 承担该口径守卫并把 MANAGED_EVENTS 纳入域导出契约。

### P3-5（讨论）— 镜像失败路径 parity 缺口（权威有诊断、镜像静默）

- **位置**: `lib/client.js:5114`（非函数 target → 静默返回空卸载器，无诊断）vs 权威 `lib/host-abi/events.js:179-182`（记 `event-subscribe-failed`）；`lib/client.js:5156-5161`（宿主未返回卸载器时无 `no disposer` 诊断）vs 权威 `:193`。
- **依据**: 两处行为差异未被 §9e 的 parity 断言覆盖（§9e 覆盖白名单拒绝/派发/聚合/卸载四类）。
- **建议**: 镜像补齐同等诊断（同一环形数据面 `health().diag`），或补 parity 断言显式接受差异。

### P3-6（讨论）— `probeSessionSelectFace` 形状漂移归类为 `missing`（非 `degraded`）

- **位置**: `lib/host-abi/llm-selection.js:92-95`（控制器在但 `selectModel` 非函数 → `state:'missing'` + `detail:'host-face-missing'`）。
- **依据**: 与域约定不符——§4.3 错误码「`host-face-missing` = 命名空间未挂载 / `host-face-shape` = 面在但形状不符」，且同仓 `serviceFaceOf`（`ctx-services.js:93-96`）对同型情形返回 `degraded` + `host-face-shape`。B5 新接线（`index.js:229-230`）把该面纳入健康面板 → 形状漂移在徽章上显示为「面缺失」，降级归因精度损失（不影响功能）。
- **建议**: 形状漂移分支改 `degraded` + `host-face-shape`（或注释显式说明该面以「单方法齐备」为存在性判据）；属预存在函数体（B3），本批首次暴露到健康面。

### P3-7（讨论）— 两处声称精度（不构成缺陷）

- **位置**: `lib/client.js:2159-2171`（`poll()` 体在 diff 中为上下文行，未被修改）+ `lib/client.js:5517`（30s catalog 兜底）。
- **依据**: D1-10 措施②「双 RPC 同拍」在迁移前**已成立**（stats 与 presetDiagnostics 原即同函数同拍），B5 有效新增 = ①隐藏暂停 + ③断言锁定；声称「隐藏态 0」的口径**仅限 2s 双 RPC 拍**，30s catalog 兜底在隐藏态继续运行（D1-8 设计明确保留）。
- **建议**: 结论/注释口径写「2s 双 RPC 拍隐藏态 0」以免被读成「隐藏态全 RPC 为 0」。另：快速连续 visibilitychange 可产生即时补拍突发（>1 RPC/s 瞬时），测试只锁稳态——设计措辞为「稳态 ≤1 RPC/s 量级」，属可接受边界。

### P3-8（讨论）— §9b 静态扫描是文本级近似

- **位置**: `tests/host-abi-health.mjs:481-489`（正则 `\$on\(\s*'…'` + `\bevent:\s*'…'`）。
- **依据**: 第二个正则命中 client.js 中**任意** `event:` 字面量（非仅订阅调用）；同时动态事件名不可见。当前恰好 5 站点且全命中白名单（§1.3 复现），断言 `>=5` 无余量——新增 1 处非订阅 `event:` 字面量即可能误红，而动态名订阅则漏检。
- **建议**: 静态半边按设计归属移交 B6（`host-contract.mjs`）并升级为调用点定向扫描；本批维持现状可接受。

### P3-9（讨论）— commit 承载四类改动 vs 编程要求 4

- **位置**: commit `79eead9`（13 文件 +1006/−111），含 B5 + R-1 + R-5 + R-3。
- **依据**: `plan-tracker:35` 明确「绑定 = R-1 … / R-5 … / R-3（可选）」，属规划期绑定的批次内聚合；回滚粒度与设计 §7.4「每批独立 revert」一致。
- **建议**: 无需拆分；后续批次若继续聚合 R 台账项，建议在 commit message 首行显式标注绑定来源（本 commit 已在正文说明）。

---

## 6. AI 生成代码专项 5 项（逐项结论）

| # | 专项 | 结论 | 事实依据 |
|---|---|---|---|
| 1 | mock / 测试桩残留于产品码 | **无** | 产品码新增面无 mock/夹具；`SubscribeClientEvents`/`FORWARDED_EVENT_ALLOWLIST` 为生产实现；test hooks（`subscribeClientEvents`/`HostHealthCard`/`FORWARDED_EVENT_ALLOWLIST` 导出）与既有先例（`createClientRemotes`/`setRouterCatalog`）同构且注释标注用途（`client.js:5656-5658`），非桩代码混入 |
| 2 | 硬编码返回值 / 魔法值 | **无新增不当硬编码** | `HOST_ROUTE_ACCOUNT_KEY='openai-codex'` 为预存在镜像常量（本轮仅改注释，`stats.js:98-100`，值级与 `version.js:22` 相符）；白名单硬编码 = **受 parity 测试看护的宿主声明镜像**（设计指定镜像纪律），非隐式硬编码；`2000/30000/64/120/160` 均沿用既有常量或既有截断纪律 |
| 3 | 幻觉 API 调用 | **无** | 本轮引用的宿主面逐项实读核对：`dsh-api-remotes/lib/types/remote-events.js:12-32`（19 项）与 `:21`（`credentials/reference-updated`）**行号与内容均属实**；`ctx.remote.$on`/`ctx.on` 为既有使用面；无新增宿主 API/字段调用 |
| 4 | 未实现 TODO / 占位 | **无** | 全量新增行扫描 `TODO|FIXME|XXX|placeholder|占位|未实现` 仅 1 命中且为测试断言文案（「非占位/非 TODO」）；「B6 静态半边」为治理台账明列承接（`plan-tracker:34`），非静默 TODO |
| 5 | 过度实现 | **无** | 改动均可追溯到 B5 范围或规划绑定 R 项（§3/P3-9）；`ctxServiceFaceProbes` 由 `CTX_SERVICES` 派生（不手抄清单）为最小实现；无无关重构、无顺手改动、无提前实现 B6 内容（黑名单/契约快照未越界） |

---

## 7. 未验证项（工具边界声明，fail-closed 口径）

以下项**本轮 Reviewer 无法独立复算**（任务工具边界：只读、禁执行测试/写操作），按事实依据红线标注而非判定通过：

1. `23/23` 全量测试网 exit 0（含 `tests/host-abi-health.mjs` 133 断言计数）——**未验证**（Coordinator 已独立复跑并机录；判别力静态分析替代）。
2. RED 阶段的实跑红（§9 MANAGED_EVENTS TypeError / smoke census FAIL / R-5 FAIL / client-render 四条判别 FAIL）——**未验证**；其中「旧名→红」的判别力已由 §2#3 静态复核成立。
3. 「死名红演示 4 条 → 复原双绿」的实跑与复原——**未验证**。
4. 宿主真实运行时的 2s 轮询 RPC 计数（浏览器实测）——**未验证**；本轮仅静态核对 `poll()` 调用面与 timer census。
5. 结论所依赖的产品事实全部为**文件内容/行号/`git show` 输出级证据**，无一项来自运行观测；故本报告的「通过」限定于静态正确性、设计与口径一致性，不等价于运行时验收。

---

## 8. 结论

- **评审维度**: 正确性 ✅ / 安全性 ✅ / 可维护性 ✅ / 性能 ✅ / 测试覆盖 ✅（五项均有结论与依据，见 §4）
- **AI 专项 5 项**: 5/5 通过（§6）
- **硬门槛**: 5 维 100% ✅；每条发现带 P0~P3 + 位置 + 依据 + 建议 ✅；设计一致性（§4.3 域 4 / §5.1(5) / §7.1 / §7.2 / §10 B5）✅；P0=0 ✅
- **发现计数**: P0=0 / P1=0 / P2=1 / P3=8
- **四选一结论**: **APPROVED_WITH_NOTES**
- **`unresolved_blockers=0`**
- **理由（一句话）**: B5 的四项承载（events 域共享订阅/白名单双检、D-2 死订阅正名修复、D1-10 轮询治理、R-5 faces 接线）经独立复算（镜像 SHA256 全等、白名单四表值序全等、census 10→9、R-1 对象级 12 锚全命中）全部成立且无 P0/P1；唯一 P2-1（attach 失败条目被缓存为「已活」→ 静默死订阅 + 观测误导）属错误路径边界，建议本轮或紧邻批次以「attach 成功才入表 + 补一条 RED 用例」收口，其余 P3 为口径精度与守卫强度改进项，不阻塞。
- **遗留项建议**: P2-1 → 建议随 B6（EVO-024）或返工小批修复（成本 ≈ 3 行 + 1 用例）；P3-1/P3-3/P3-4/P3-5/P3-8 → 建议在 B6（静态看护成体系批）承接；P3-6 → 可随任一批次顺带校正。

*（本文件为 REVIEW-EVO-023-R0 的审查输入报告；治理状态机录由 Coordinator 执行，Reviewer 未修改任何产品码/测试/治理文件。）*
