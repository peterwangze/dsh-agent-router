# Code Review 报告 — FIX-049 R0（原生多模态贴图误切 twin——门控漂移窗口修复）

> Reviewer: Code Reviewer Agent（round 0）· 审查日期: 2026-09-19
> 审查对象: **staged diff**（HEAD=`5b90285`）· 3 文件 +281/−11
> 依据: agents/code-reviewer.md + skills/code-review/SKILL.md · 只读审查（实读 + 静态推演，Bash 写操作零执行）

---

## 1. 审查结论

## **APPROVED_WITH_NOTES** — `unresolved_blockers=0`

| 硬门槛 | 结果 |
| --- | --- |
| P0 阻塞问题数 = 0 | ✅ P0=0（P1=0，P2×2，P3×6——全部非阻塞，台账见 §2） |
| 5 维度 100% 有结论 | ✅ 见 §3 |
| 每条发现 P0~P3 标注 | ✅ 见 §2 |
| 设计一致性（FIX-018 意图） | ✅ 见 §4 |
| AI 专项五查 | ✅ 见 §5 |

**一句话**：修复方向正确、插入点精确、判定语义零改动、失败全路径保守回落不破图；两处 P2（防抖失败残留无 TTL + 注释兜底论证不严谨；新增降级 trace 的严重度分级与四形态细分不足）建议下轮或台账收敛，均不阻塞合并。

---

## 2. 发现清单（P0~P3）

### P2-1 防抖失败残留无时间维度——注释「30s 轮询兜底」论证不完整
- **位置**: `lib/client.js:4429-4435`（防抖注释 + Map 定义）、`:4463-4465`（key 构造与失败入防抖）
- **事实**（逐行实读推演）: key = `${snapshotSig}|${current.provider}/${current.model}`。`capabilitySig` 只随 `catalog.mainModelImage` 快照值变化（`:4614`，服务端按 defaults 计算），与会话当前选择无直接耦合。刷新失败也 `capabilityRefreshKeys.set(sessionId, key)`（`:4465`）且条目无 TTL。
- **影响**: 刷新失败（RPC 不可达/超时）后，若用户停留在同一模型（或手动切回该模型）再贴图，同 key 防抖命中 → 不刷新 → 直接保守切 twin；若该模型原生多模态，即 FIX-049 目标场景复发，且 FIX-012 永不还原使其停留。注释声称「目录 30s 轮询兜底保留」——**该兜底仅当服务端判定真变化时有效**（sig 字符串不变时轮询写回相同值 → deps 不变 → effect 不重跑；即使重跑 key 也不变），对「失败残留 + 稳定判定」场景兜底不成立。
- **缓解面（经推演确认，降低定级依据）**: ①触发前提是异常态（本机 daemon 常态 <100ms）；②后果安全侧（保守切换不破图，图经 twin 必可达）；③用户**切到任一其他模型再切回**即解锁（中间 key 改写 Map 条目，`sig|B ≠ sig|A`）；④重试风暴防护本身是正当设计目标。
- **建议**: 防抖条目值改为 `{ key, at }` 并加短冷却 TTL（如 10–30s），或失败与成功分策略（成功长防抖、失败短冷却）；至少修正注释的兜底表述，如实写明适用条件。

### P2-2 新增降级 trace 可观测性不足（严重度倒挂 + 四形态不可分辨 + 错误细节丢失）
- **位置**: `lib/client.js:4623`（`capability-refresh` 加入 console.info 分支）、`:4690`（detail 四态合一）、`:4473`（rejection handler `() => null` 丢弃错误对象）
- **事实**: ①`capability-refresh`（= 刷新失败/超时/防抖/仍不匹配 → 保守切换，**降级路径**）走 `console.info`；而 `skip-capability`（= suppress 直传成功，**正常路径**）走 `console.warn`（`:4624` else-if 分支）——严重度倒挂。②detail 字符串 `'refresh unavailable/failed/timed out/debounced — conservative switch'` 将 `freshCatalog === null` 的四种来源合并为一条，排障时不可分辨。③RPC 拒绝的错误消息在 `:4473` 被丢弃，无法定位失败原因。
- **影响**: 违反 project-principles P8「失败与降级 MUST 可观测」的精神——事件存在（非静默）但分级失当、细节不足；真机排障时无法区分「daemon 宕机」与「正常防抖」。
- **建议**: 失败形态（unavailable/failed/timed out）改走 warn 并在 detail 携带截断错误消息（对齐 `:4703` selectModel 错误处理先例）；防抖命中可维持 info。`refreshMainModelImage` 需把 rejection 的 error 透出（如 `{ value: null, reason }` 或模块级诊断面）。

### P3-1 装配层轮询与按需刷新双写 `setRouterCatalog` 的窄竞态（自愈闭合，无数据损坏）
- **位置**: `lib/client.js:4338-4343`（setRouterCatalog 引用短路）、`:5853-5856`（装配层 refreshCatalog 写点）与 `:4471`（按需写点）
- **事实**: 两处消费同一 RPC 面（P5 成立），但并发在途响应可能乱序落盘（轮询旧值后写）。`setRouterCatalog` 有引用相等短路（`:4339`），服务端每次实时构造新对象 → 乱序写会 version+1 → 若 sig 回退触发 effect 重跑 → 防抖 key 与上次不同（sig 分量回退）→ **再刷一次 RPC 自愈**；仅当该次刷新也失败才误切（安全侧）。超时后迟到的 catalog 成功响应仍会写回缓存（race 已 settle，then 回调继续执行）——数据新鲜无害，wrapped 短路（`:4653`）防还原，FIX-012 保持。
- **建议**: 可接受现状；如需硬化可在 catalog 载荷带单调序号（超出本批范围，不要求）。

### P3-2 `capabilityRefreshKeys` 模块级 Map 无清理面（与 takeoverMemory 同先例，量级可控）
- **位置**: `lib/client.js:4432`；先例 `:4486`（takeoverMemory 同为模块级无全局清理）
- **事实**: 每 sessionId 一条覆盖写（同会话多状态只保留最新 key），条目 ~百字节级；会话关闭不回收。桌面宿主生命周期内按历史会话数线性累积，无上界但增速极低。
- **建议**: 接受（注释已如实声明生命周期）；后续卫生批可考虑 LRU 或会话关闭钩子清理（与 takeoverMemory 一并）。

### P3-3 「刷新成功但判定仍不匹配」分支无专属断言
- **位置**: `tests/fix-012-image-takeover.mjs` fix-049 块（D49-1 命中 / D49-2 失败，中间态未直接覆盖）
- **事实**: `:4690` 的 `'refreshed snapshot still mismatched — conservative switch'` 分支（freshCatalog 非 null 且判定 false）无直接测试。该分支落点与 D49-2 相同（既有切换路径），且刷新成功写回缓存后 sig 变化的下游行为（防抖 key 更新）无断言。
- **建议**: 台账批补一组（remote 返回「仍不匹配的 FRESH」→ 断言切 twin + 第二次贴图零重复 RPC），顺带锁定 P2-1 修复行为。

### P3-4 D49-7 在 RED 期白等 2.4s 真实计时器
- **位置**: `tests/fix-012-image-takeover.mjs:577-580`
- **事实**: `await new Promise(setTimeout 2400)` 在断言前无条件执行——旧代码下 hangRemote 永不调用但等待照跑，RED 期该套件每次多 2.4s。正确性无碍。
- **建议**: 可接受（2s 是被测常量语义）；如在意时长可缩短被测常量注入点或接受现状。

### P3-5 刷新分支后的既有 `selectModel` await 无 cancelled 复查（既有面，非本批引入）
- **位置**: `lib/client.js:4698-4700`
- **事实**: `takeoverMemory.set` 在 `await sessions.selectModel` 后无 `cancelled` 检查——cleanup 竞态下旧 effect 实例仍可能写记忆。**既有代码形态，本批按「保守路径零改动」承诺未触碰**，FIX-049 新增的 `:4685` cancelled 检查覆盖了新 await 点。目标幂等（同 twin 重切换无害）。
- **建议**: 记录为既有卫生项，不要求本批修。

### P3-6 `response.value` 直写共享缓存无形状校验（信任面与既有一致）
- **位置**: `lib/client.js:4470-4471`
- **事实**: value 未校验形状即 `setRouterCatalog`——但下游 `currentModelAcceptsImage`（读 `.mainModelImage` 得 undefined → false → 保守切换）与 `multimodalAgentsOf`（`catalog.ok !== true` → `[]`）均天然容忍；信任级别与既有 `:5856` 装配层写点完全一致（本机 daemon RPC）。无注入面（`catalog({})` 零参数）。
- **建议**: 接受（fail-safe 方向正确）；不要求修改。

### 附: N5b 夹具改名 `attState([])` → `inputStateOf([])`（零语义，知会）
- **位置**: `tests/fix-012-image-takeover.mjs:316`；`:280` 证实 `attState = inputStateOf`（块级别名，同一函数引用）
- **事实**: 纯命名统一，断言值零变化。不构成 P 级发现，知会 diff 纯粹性即可。

---

## 3. 五维度逐项结论

### 维度 1: 正确性 — **PASS**
- **插入点正确性**（验收 1）: 新分支位于 `capabilitySuppressed` 判定后（`:4670-4674`）、既有切换前（`:4698`）——覆盖「快照旧/当前新」场景的前提是该场景必然落在此处：快照与当前不匹配 → `currentModelAcceptsImage(catalog, current)`=false → 不 suppress → 进刷新分支 ✓；快照缺失（旧服务端）→ 同路径 ✓（D49-6）。快照命中时 suppress 短路在前，零多余 RPC（D49-5 护栏锁定）✓。
- **await 后 cancelled**（验收 1）: `:4685` 在 `await refreshMainModelImage` 后立即检查，其后至 return 全同步 ✓。刷新内部缓存写回发生在 await 期间，即使 cancelled，写回的是新鲜数据且下一 effect 实例受益——无陈旧写入路径 ✓。
- **超时竞速**（验收 3）: `Promise.race([catalog.then(onOk, ()=>null), timedOut])` + `.finally(clearTimeout)`——先 settle 即清 timer，**零计时器泄漏** ✓；同步抛错（`remote.catalog()` 构造期）传播至 effect 既有 try/catch（`:4707`）→ `trace('error')` ✓；`remote`/`catalog` 形状守卫在防抖 set 之前（`:4461-4462`）——无刷新面不污染 Map ✓。
- **重入闭合**: 刷新成功仍不匹配 → 保守切换 → 下次 effect 重跑时 wrapped 短路（`:4653`）→ 无 RPC 循环；刷新命中 → suppress + sig 变化驱动重评后走 suppress 短路 ✓。
- **防抖语义**（验收 2）: 「连续切多个模型后回到原选择」——切走再切回经中间 key 改写解锁可刷新 ✓；**唯一漏刷新面 = 失败残留原地重试**（P2-1，已分级）。「30s 轮询兜底」仅在服务端判定真变化时释放防抖（P2-1 论证瑕疵）。
- **边界条件**: `router` 非 function 直用、`remote` null、`catalog` 非 function、`response.ok=false`、`response.value` 空、RPC 拒绝、超时——全部 resolve null → 保守回落 ✓。

### 维度 2: 安全性 — **PASS**
- 新增 RPC 面 `catalog({})` 零用户输入参数，无注入面 ✓；无敏感数据/硬编码密钥 ✓；写共享缓存 fail-safe（P3-6）；客户端 UI 逻辑无权限边界变化 ✓。OWASP 关键项扫描无命中。

### 维度 3: 可维护性 — **PASS**
- `refreshMainModelImage` 32 行（<50）职责单一；命名达意；JSDoc 完整且含服务端新鲜性论证（经核实属实，见 §6 声称 7）；模块注释与代码一致——唯 P2-1 注释兜底表述需修正。镜像纪律维持（SHA256 恒等，独立复算 `47616C78…94D6`）。

### 维度 4: 性能 — **PASS**
- 防抖杜绝重复 RPC；2s 竞速上限封顶等待；`setRouterCatalog` 引用短路抑制无效重渲染；Map 操作 O(1)；无 N+1/O(n²)。常驻开销 = 每 effect 触发至多一次目录 RPC（armed+贴图场景），可接受。

### 维度 5: 测试覆盖 — **PASS**（P3-3 一处缺口）
- 十组 D49 静态推演 RED 判别力**全部成立**（逐组推演见 §6 声称 8）；D49-5 双侧皆过护栏设计合理（守护「suppress 短路先于刷新分支」的次序不被未来重构破坏——若次序颠倒 `d49HitCalls>0` 即红）。核心路径/边界/错误路径覆盖齐备；唯一中间态缺口 P3-3。

---

## 4. 设计一致性 + 判定语义保持（验收 5/8）

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| FIX-018 意图「正向判定命中即直传」 | ✅ 时序上成立 | 服务端 `service.js:1344-1347` 明证：**GUI selectModel 会 saveDefaultModelSelection，会话当前选择与默认选择在常规流一致**——用户切模型即更新服务端 defaults，按需刷新拿到的就是新选中模型的实时判定（夹具 FRESH.defaults=MM2 与该机制一致） |
| `currentModelAcceptsImage` 零改动 | ✅ | diff 仅函数前注释追加 FIX-049 条目，函数体（`:4409-4414`）未动 |
| `mainModelImageSignature` 零改动 | ✅ | `:4417-4421` 未动 |
| FIX-002 开关驱动不刷新 | ✅ | 刷新分支条件 `imageConditional && imageCount > 0`（`:4683`）——开关开启时 `imageConditional=false` 不进刷新；armed 前段开关门控（`:4610`）未动 |
| FIX-012 永不还原零改动 | ✅ | 还原路径（`:4713-4751`）未触碰；D49-4a/4b 锁定 suppress 无记忆 → 发送归零零调用 |
| 变更仅 3 staged 文件 | ✅ | `git status/diff --cached --stat` 实证：lib/client.js、tests/served-client.js、tests/fix-012-image-takeover.mjs；工作区另有 .governance 两文件未 staged（不在审查面） |
| client-render.mjs 零修改论证 | ✅ 成立 | 其 ModelTakeover 断言（client-render.mjs:1117-1141/1148+）**手工构造 props 直调 `reg.render`，不经槽位 inject 合并**——装配层新增 router 透传不可达该断言面；其场景要么 imageCount=0（刷新分支不触发）、要么已 wrapped（短路在前）、要么 router=undefined → null → 保守切换=旧行为 |

---

## 5. AI 专项五查 + P8 可观测（验收 9/10）

| # | 检查项 | 结论 |
| --- | --- | --- |
| 1 | mock 残留 | ✅ 无——产品代码零 mock；测试 fake 锚定宿主 InputState/resolveDraftAttachments 契约（`tests/fix-012:217-238` P10-④ 锚定注释） |
| 2 | 硬编码 | ✅ `CAPABILITY_REFRESH_TIMEOUT_MS = 2000` 有量级论证注释（本机 daemon 常态 <100ms、2s 覆盖慢机）；self-certified 探测为适配器本地 `resolveModel` 直调（wrapper.js:281-299，**非真实 LLM 请求**），毫秒级——2s 充分 |
| 3 | 幻觉 API | ✅ 零——`remote.catalog({})`（`:2081`/:5853-5856 既有消费先例）、`setRouterCatalog`（`:4338` 实存 + `:6023` 测试导出）、`useRouterCatalog`（`:4345`）、`??` 运算符（`:5856` 既有同款）全部实存实读核验 |
| 4 | 未实现 TODO | ✅ 无 |
| 5 | 过度实现 | ✅ 无——方向 A 最小侵入，无多余抽象/配置面/第二刷新路径 |
| P8 | 可观测 | ⚠️ 部分——失败路径有事件非静默（trace + catch 兜底 trace error），但 P2-2：降级 trace 走 info、四失败形态不可分辨、RPC 错误细节丢弃 |

---

## 6. 独立核验声明（Developer 声称 8 项逐条）

| # | 声称 | 核验结果 |
| --- | --- | --- |
| 1 | 方向 A：模块级直调 `catalog({})` 同一消费面、写回共享缓存闭环、原值返回即时判定 | **实**——`:4460-4476` 实读；消费面与装配层 `:5853-5856` 同一 RPC；`setRouterCatalog → listeners → version → 重渲染 → capabilitySig` 闭环逐环节实读成立 |
| 2 | 竞速上限 2000ms、超时回落保守切换 | **实**——`:4435`/:4466-4475；超时 resolve null → `:4690` trace → 既有切换；无计时器泄漏 |
| 3 | 防抖 Map + 失败也入防抖 + 30s 轮询兜底 | **部分实**——机制属实（`:4429-4465`）；但「30s 轮询兜底」的适用条件被过度概括（仅判定真变化时有效，见 P2-1） |
| 4 | effect 插入点 suppress 判定后/切换前；仅 `imageConditional && imageCount > 0`；await 后 cancelled | **实**——`:4683-4691`/:4685 逐行核对 |
| 5 | 装配点 inject 增 router + el() 透传（AttachButton 先例）+ deps 增 router | **实**——`:5981`/:5986（透传）/:4761（deps）；先例 `:5945`（AttachButton 同款 `router: routerRemote`）；`routerRemote` 模块级 const（`:5849`）deps 恒稳定 |
| 6 | 判定语义零改动 | **实**——见 §4 逐项 |
| 7 | 服务端新鲜性：catalog RPC 实时重算、host-declared 无缓存、60s TTL 按 `provider\0model\0modality` 分键 | **实**——`service.js:3605-3607`（每次 catalog 组装实时 await）、`:1351-1365`（无 memoization，catch fail-safe false）、`wrapper.js:247-299`（分键+TTL+探测实现逐行核对）；补充独立发现：判定对象按 defaults，生效前提「GUI selectModel 同步 saveDefaultModelSelection」由 `service.js:1344-1347` 注释明证 |
| 8 | 测试 D49 十组、RED 9 失败→GREEN 全绿、既有断言纯追加 | **实**（静态推演口径）——D49-0a/0b（旧源码两正则必不命中）、D49-1（旧代码切 twin → `calls.length===0` 与 `freshCalls===1` 双重必败）、D49-2/3/6/7（RPC 计数 0≠1/0≠1/0≠1/0≠1 必败）、D49-4a（同 D49-1）+ 4b（旧代码 4a 的切换调用残留 `calls.length≥1` 必败）——**9 组 RED 判别逐组推演成立**；D49-5 双侧皆过（护栏，声称如实）；N5b 夹具改名零语义（`attState===inputStateOf`，`:280`）非断言语义变更 |

**Coordinator 机器验证采信情况**: 镜像 SHA256 独立复算一致（`47616C78F515E119D9CC7EDB086F3D9706C62488013EE4BDEC91063FD06394D6` 双文件恒等）；run-all ALL 20 SUITES exit 0 为 Coordinator 独立复跑（本审查 Bash 权限受限未重跑，静态判别力推演独立完成）。

---

## 7. 结论依据

- P0=0、P1=0：无阻塞项。
- P2×2（P2-1 防抖失败残留 + 注释兜底论证、P2-2 降级 trace 可观测性）均为异常路径/可观测性改进，不破图、不破坏既有语义，可作台账或下轮收敛。
- 修复对报障场景的生效链经服务端证据闭合（defaults 跟随 GUI selectModel），插入点与失败回落语义正确，测试判别力充分。
- **APPROVED_WITH_NOTES / unresolved_blockers=0**——可进入 review-record 机录与 commit 链。
