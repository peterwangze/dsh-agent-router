# FIX-018 R0 Code Review 报告——多模态主模型贴图被多余切 twin

| 项 | 值 |
|---|---|
| 审查对象 | 两 commits（base `6b2ada3`）：`1d77817`（缺陷 1 修复：lib/client.js + lib/service.js + lib/schemas.js + tests/fix-012-image-takeover.mjs，176+/11-）+ `e70028c`（缺陷 2 证明：lib/wrapper.js 注释 + tests/adapter-parity.mjs + tests/routing-paths.mjs，82+/1-） |
| 仓库 | D:\AI\agent\deepseek\plugins\router（dsh-agent-router） |
| 审查者 | Code Reviewer Agent（只读审查；未修改代码、未运行测试/构建命令、未与用户交互；仅只读 `git show`/`git log` 圈定 diff 范围） |
| 审查依据 | code-review SKILL（5 维度 + P0~P3 分级 + 事实依据红线） |
| 门控证据 | 16/16 套件（fix-012 28 / routing 115 / parity 17 / 其余全绿）——按任务指令采信 Coordinator 复核，本报告不重复执行 |
| 方法注记 | 宿主取证抽验对象 = 本机 DSH 安装态（npx checkout `@deepseek-ai/dsh-llm` / `@deepseek-ai/dsh-host-apiproxy` lib/index.js）；注释引证行号逐一吻合，判读为同一版本。流程注记：两 commits 经 --no-verify 旁路（Coordinator 治理面已补正），按任务指令不纳入审查 |
| 日期 | 2026-08-31 |

---

## 一、修复声称逐项核验

| # | 声称 | 判定 | 事实依据 |
|---|------|------|---------|
| 1 | 缺陷 1：客户端拿不到模态信息 → 服务端单点判定（decideImagePrecheck 复用）→ catalog 下发 mainModelImage → 客户端 image 来源接管门控 + capabilitySig 进 deps | ✅ 属实（端到端静态走查成立） | 客户端零探测前提**经宿主源码独立抽验属实**：dsh-host-apiproxy lib/index.js:1024-1029（buildModelCatalog 条目仅投影 {id,name,description?,reasoning?}，:1015 拿到的 inputModalities 确在组装面被丢弃）、:2582-2594（session.models current 仅 selection 展开）。服务端单点：lib/service.js:1257-1270（mainModelImageCapability：no-default-selection/llm-unavailable/probe-failed 三类诊断源，异常 fail-safe false）+ :3162（catalog 每轮下发）。客户端门控：lib/client.js:3300-3312（currentModelAcceptsImage 正向判定 + 签名）、:3386-3396（仅 image 来源、imageConditional 且 imageCount>0 时抑制；未切换=无记忆写入）、:3437（deps 含 capabilitySig）。双面 schema：lib/schemas.js:346-353 + lib/client.js:87-89 镜像声明（两侧 wire 校验器均「未知字段透传」，schemas.js:250 注释 + client.js:56-62 实现核对） |
| 2 | 缺陷 2（证明非修复）：三断言锁死「原模型多模态时 twin 直传图片」 | ⚠️ 部分成立 | ①探测可达 ✅：wrapper.js:296-302（original()=llm.registration(provider).adapter 直调）+ **实适配器** lib/oauth-llm.js:331-334（resolveModel 返回 inputModalities=['text','image']，:26/:76 同源）+ 宿主 dsh-llm lib/index.js:1527-1531（registration=adapters.get，NO_ADAPTER 抛错）——抽验逐一吻合。prestep 剥离 ✅：lib/prestep.js:250-252（slice 剥 -router）+ :261（sourceAcceptsModality 同单点）+ [G7] stub 对未剥离 provider 抛错（tests/routing-paths.mjs:1095-1098）→ 判别力为真。②TTL 论断 ⚠️：wrapper.js:289 **无条件缓存含失败**（accepts=false 同样入缓存 60s，:241）；「缓存不可能存注册前失败」的可达性论证只覆盖 twin 注册事件链，未覆盖本 commit 自己新增的周期探测面 → **P2-1**。③软引导残留：wrapper.js:267-271 披露方向正确，但用户可见披露面缺失 → **P3-2** |
| 3 | 判别 RED=旧代码 F18-1/F18-5a 恰 2 FAIL；GREEN 28 断言 | ✅ 静态推演成立 | 旧代码（base 6b2ada3）武装条件无能力门控：F18-1/F18-5a（多模态贴图不切断言）旧代码必切 → calls.length>0 → 恰 2 FAIL；F18-2/3/4 旧代码亦绿（回归护栏，非 RED）；F18-5b 旧代码因 F18-5a 已切 + deps 无 capabilitySig（空转）而空过——恰 2 FAIL 与声称一致。GREEN 侧：F18-5b 对「deps 缺 capabilitySig」真判别（第二轮仅 catalog 变化，deps 不含 sig 则 effect 不重跑 → mmTwinSelect 必败）；28 断言计数按已采门控证据采信 |
| 4 | 门控 16/16 | 按指令采信 | Coordinator 已复核；本审查未运行测试（角色约束） |

---

## 二、5 审查维度逐项

### 维度 1：正确性 —— PASS（附 1 项 P2）

- **门控核心链路**：用户实证场景（chatgpt-oauth 贴图 → 切 twin）端到端走查——catalog 轮询下发 mainModelImage（service.js:3162，host-declared 路径：decideImagePrecheck:1214 llm.resolveModelInfo → dsh-llm:1397-1403 adapter.resolveModel → oauth-llm.js:334 声明 image）→ 客户端 current={chatgpt-oauth,gpt-5.6-terra} 与 capability provider+model 匹配 → client.js:3386 抑制 → 不切 twin，图直传主模型。✅ 缺陷修复成立。
- **失败方向安全**（审查重点 1）：判定缺失/漂移/TTL 过期 → currentModelAcceptsImage 返回 false → 回落既有接管（宁多切）；接管后 twin stream 对多模态原模型走直传分支（wrapper.js:376-381）——图仍可达原模型，仅多一层壳。**回落方向不存在漏图路径**。反向（陈旧 accepts=true 抑制窗口）见 P3-1：宿主准入拦截，可观测非静默。
- **时序边界走查**（审查重点 1）：①判定后用户切模型：per-session effect 以 sessions.models 快照 current 比对（client.js:3372-3376），快照变化经 input/session store 重渲染触发 effect（takeoverArmed/imageCount 变化）重评；②多会话：takeoverMemory 按 sessionId 键（:3321），catalog 快照全局默认选择 vs 各会话各自 current——不匹配=保守接管，正确；③TTL 窗口：服务端 60s + 客户端 30s 轮询，sig 变化触发重评（F18-5b 看护）。
- **suppress 分支零副作用**：不写 takeoverMemory → 后续解除武装还原逻辑零影响（:3384-3385 注释声称，走查证实）。已停 twin + 能力反转为接受：走 memory 分支不回切（image 来源永不自动还原，FIX-012 语义），图经 twin 直传仍保真——与「宁多切不漏图」哲学一致。
- **wire 双面同步**（审查重点 2）：schemas.js:346-353 与 client.js:87-89 逐字段镜像；两侧校验器均透传未知字段 → 旧服务端/新客户端（缺字段=可选回落）与新服务端/旧客户端（未知字段透传）双向兼容；smoke.mjs:117-121 既有 parse/reject 断言仍覆盖。无 FIX-011 式字段遮蔽（repo grep `mainModelImage` 18 处命名一致）。但 **tests/served-client.js 第三副本未同步 → P2-2**。
- **decideImagePrecheck 复用副作用**（审查重点 3）：该单点无状态变更（纯读 + wrapper 模块级缓存），route_agent 预检路径（service.js:1320）行为不变；catalog 每 30s 轮询各调一次 llm.resolveModelInfo（①宿主声明路径无 TTL，每次都调——本地适配器廉价调用，P3-4 前瞻备注），wrapper 探测（②）60s TTL → 每两轮轮询至多一次真探测。与 route_agent 共享同一缓存键 → 判定口径全链路一致，无第二套真值。

### 维度 2：安全性 —— PASS

- 无注入面：mainModelImage 四字段为服务端自产结构化数据；source 诊断串含本地适配器 error.message（service.js:1268）——来源为本地异常非外部输入，客户端仅作签名判定消费（不进 DOM/提示词），泄露面可忽略。
- 无硬编码敏感数据：测试 'chatgpt-oauth'/'gpt-5.6-terra' 为与 EVO-009 真实 provider 同名的夹具，合理。
- 失败可观测（P-v2 原则 8）：probe-failed/llm-unavailable/no-default-selection 诊断随 source 下发，异常不静默吞。

### 维度 3：可维护性 —— PASS（附 2 项 P2 关联）

- 注释质量高：service.js:1237-1255 取证注释、client.js:3279-3299 门控语义注释与代码一致；宿主引证行号经抽验逐一吻合（仅 wrapper.js:256 引「:353」轻微漂移，实际直传分支 :369-381，不计发现）。
- P2-1：wrapper.js:249-271 核查注释中论断②与代码事实（:289 无条件缓存）不符，注释是长期文档，过强论断会误导后续维护者。
- P2-2：client wire 契约现存三副本（schemas.js / client.js / served-client.js）纯手工同步，本轮漏一处——副本面本身是结构性风险（与 FIX-011 同类）。

### 维度 4：性能 —— PASS（附 1 项 P3）

- 客户端：capabilitySig 为字符串签名，30s 轮询目录对象身份变化（client.js:3233 仅 identity 比较，每次轮询 bump version 触发重渲染）但 sig 内容不变 → deps 相等 → effect 不重跑，**无轮询抖动**（审查重点 5 重入安全：sig 变化 → 至多一次 selectModel → 不改 catalog → 收敛，无环路）。
- 服务端：catalog RPC 串行 await 判定（:3162）；首调 + 每 60s 一次真探测 + 每轮一次本地 resolveModelInfo——当前适配器实现均为本地廉价调用（oauth-llm.js:331-334 常量返回）。P3-4：若未来适配器 resolveModel 含网络 I/O，该设计会放大 catalog 延迟。

### 维度 5：测试覆盖 —— PASS（附 P2 关联）

- 判别闭环：F18-1~5b 结构经静态推演验证——F18-1/F18-5a 旧代码必败、F18-2/3/4 回归护栏、F18-5b 对 deps 缺失真判别（tests/fix-012-image-takeover.mjs:334-386）；parity test5 三断言对「探测断链→改写→图片块消失+MARKER」判别为真（tests/adapter-parity.mjs:151-186：provider 'fake-oauth' 独立缓存键避模块级 60s 缓存污染，夹具与实适配器形状一致——oauth-llm.js:334 抽验）；[G7] 对「prestep 未剥离/探测断链→注入 reminder」判别为真。
- 盲区：负缓存播种场景（P2-1 的 account-toggle 时序）无断言；served-client.js 镜像无任何测试消费（drift 无护栏，P2-2 关联）。

---

## 三、审查重点 6 项回应索引

| # | 重点 | 结论 | 去向 |
|---|------|------|------|
| 1 | 门控时序边界 + 回落方向 | 回落=接管恒安全（twin 直传兜底）；陈旧接受窗口可观测 | §二.1 + P3-1 |
| 2 | catalog RPC 双面同步 | 双面镜像完整 + 双向兼容；第三副本漏 | §一.1 + P2-2 |
| 3 | decideImagePrecheck 复用开销/缓存语义 | 每 30s 轮询各一次本地 resolveModelInfo + 每 60s 至多一次真探测；口径单点 | §二.1/二.4 + P3-4 |
| 4 | 缺陷 2 证明说服力 | ①③锁死；②论断过强（新周期探测面未纳入论证）；软引导披露不足 | P2-1 + P3-2 |
| 5 | capabilitySig 重入安全 | 签名防抖 + 单次收敛，无环路 | §二.4 |
| 6 | AI 专项 5 项 | 见下节 | §四 |

---

## 四、AI 专项 5 项

| # | 检查 | 判定 | 依据 |
|---|------|------|------|
| 1 | mock 残留 | ✅ 无 | 两 commits 产品代码无 console.log/调试桩；测试 stub（makeApi/mkStubLlm/fake oauthAdapter）为判别测试设计本体 |
| 2 | 硬编码 | ✅ 无 | 无密钥/token；WRAP_SUFFIX 双面各自定义有既有注释声明对齐（client.js:3313） |
| 3 | 幻觉 API | ✅ 无 | 宿主接口引证（dsh-llm registration/resolveModelInfo、apiproxy buildModelCatalog/session.models）经审查者对安装态宿主源码**独立抽验全部属实**；EVO-009 适配器形状引证与 lib/oauth-llm.js:331-334 实代码一致。唯一瑕疵：wrapper.js:256 行号引用轻微漂移（不计发现） |
| 4 | 未实现 TODO | ✅ 无 | lib 四文件 grep TODO/FIXME/XXX 零命中 |
| 5 | 过度实现 | ✅ 无 | +176/-1 产品代码克制，无顺手改动；mainModelImageSignature 忽略 source 字段为正确取舍（诊断变更不触发重评，避免轮询抖动）——见 P3-3 备查 |

---

## 五、发现列表

### P2-1 缺陷 2 证明②论断不完整——新增周期探测面可向共享负缓存播种，「直传保真」存在 ≤60s 有界失效窗口

- **位置**：lib/wrapper.js:289（`modalityCache.set(key, { accepts, at: now })` 无条件缓存含失败）、:241（TTL 60s）、:260-266（论断②注释）；lib/service.js:3162 + :1257-1270 + :1222-1229（新增调用链）
- **事实依据**：论断②「缓存不可能缓存注册前的失败」的论证仅覆盖 twin 与原 provider 的注册事件链耦合；但 1d77817 自己新增了与 twin 无关的周期调用方：catalog 30s 轮询 → mainModelImageCapability → decideImagePrecheck → sourceAcceptsModality(original, ...)——当默认选择指向未注册 provider（启动次序 / 账号禁用中），original() catch 返回 undefined（service.js:1222-1228）→ accepts=false **被写入共享 modalityCache 60s**。时序实案：账号 toggle 禁用→启用后 60s 内，停在 twin 上的会话贴图 → twin.stream 探测命中负缓存 → 走改写分支 → 图片降级为标记文本（wrapper.js:384-399），「主模型自己看图」承诺在该窗口失效。
- **边界（如实）**：≤60s 自愈；fail-safe 方向（改写不击穿端点、不丢流程）；主路径（客户端门控后不切 twin）完全不受影响；route_agent 预检路径在 FIX-018 之前已存在同类播种面，本修复将其周期化放大。
- **建议**：①wrapper.js:286-289 改为「探测失败（original 不可达/resolveModel 缺失/抛错）不写缓存，仅成功探测写缓存」——负缓存收益本就存疑（失败大概率是瞬态）；②同步修正 :260-266 注释为「负缓存播种面=所有探测调用方（含 catalog 周期探测）」；③补判别断言：未注册→播种→注册→TTL 内 twin 请求（修复后应直传）。

### P2-2 served-client.js 镜像未同步——CONTRIBUTING 检查项违规，第三副本 drift 无护栏

- **位置**：tests/served-client.js:3307-3383（ModelTakeover 无能力门控：无 currentModelAcceptsImage/capabilitySuppressed，:3322 armed 条件仍旧，:3383 deps 无 capabilitySig）；全文无 mainModelImage（repo grep 实证，含 :82-119 区域 wCatalog）
- **事实依据**：CONTRIBUTING.md:21 明确要求「修改 lib/client.js 后已同步渲染测试镜像 `Copy-Item lib\client.js tests\served-client.js -Force`」；1d77817 改 lib/client.js 176 行未同步。**用户可见功能不受影响**：package.json:11 `"./client": "./lib/client.js"` 锚定实际下发面（已含门控）；served-client.js 无运行时消费面（exports/files 均不含，无测试 import）。危害在判别面：经 FIX012_CLIENT_SOURCE 机制（tests/fix-012-image-takeover.mjs:157-162）指向该镜像跑 F18 组将假 RED。
- **建议**：本轮立即执行镜像同步（一行 Copy-Item）；中期考虑以构建步或 CI 一致性断言替代手工 checklist（三副本手工同步已两次出险：FIX-011、本轮）。

### P3-1 陈旧 accepts=true 抑制窗口（≤30s 轮询）内贴图 → 宿主准入拦截——可观测可恢复，记录边界

- **位置**：lib/client.js:3386（抑制判定基于 catalog 快照）；:3435-3437（sig 反转才重评）
- **事实依据**：能力反转（适配器注销/账号禁用）后至下次目录刷新（≤30s 轮询）窗口内，快照仍 accepts=true → 贴图不切 twin → 发送时宿主 prompt 准入 MODEL_DOES_NOT_SUPPORT_IMAGES 拦截（dsh-host-apiproxy :2749-2760，tests/fix-012 头注释引证）。失败显式 Toast 非静默；sig 反转后 F18-5b 链路自动补接管。与「宁多切不漏图」方向相反的唯一暴露面，量级可接受。
- **建议**：无需修改；README 已知边界节可补一句。

### P3-2 软引导残留面缺用户可见披露——「缺陷 1 修复后为什么还走专业 agent」将复发为用户疑问

- **位置**：lib/service.js:3114（系统提示「带图片的任务…应路由给带 image 能力的 agent」正向引导句仍在）vs :3120（FIX-005 中性句）；lib/tool.js:68（工具描述中性句）；lib/wrapper.js:267-271（残留面结论仅代码注释披露）
- **事实依据**：e70028c 自证：用户实证的 route_agent 中转来源=目录段软引导（软约束）+ 缺陷 1 多余切换。缺陷 1 修复后，多模态主模型大脑仍可能因 :3114 主动路由——届时用户无 UI/文档可查该残留面（现有披露全在 commit message 与代码注释）。中性句（:3120/tool.js:68）与正向句（:3114）并存属 FIX-005 既有取舍，非本轮引入。
- **建议**：README 故障排查/已知行为节补「多模态主模型也可能主动调用 route_agent（提示软引导，非强制）」一段；可选：:3114 句尾追加「（主模型已原生多模态时无需路由）」半句收敛。

### P3-3 mainModelImageSignature 不含 source——诊断变更不触发重评（正确取舍，备查）

- **位置**：lib/client.js:3307-3312
- **事实依据**：签名仅 acceptsImage/provider/model；source（诊断串）变化不触发 effect。判定行为只由前三者决定 → 语义等价且防抖。若未来 source 信任级（host-declared vs self-certified）参与门控判定，须同步扩展签名——现无此依赖。
- **建议**：在签名函数注释补一行「source 有意不入签名」即可，不单独立项。

### P3-4 catalog 判定路径无服务级缓存——每轮轮询各一次 llm.resolveModelInfo（前瞻备注）

- **位置**：lib/service.js:3162（每轮 await）+ :1214（decideImagePrecheck ①路径每次调用）
- **事实依据**：60s TTL 仅覆盖 wrapper 探测（②路径）；①宿主声明路径每 30s 轮询都调 llm.resolveModelInfo。当前全部适配器 resolveModel 为本地廉价调用（oauth-llm.js:331-334 常量返回；pi-ai 配置查询），开销可接受。若未来适配器 resolveModel 含网络 I/O，catalog RPC 延迟将被 30s 轮询放大。
- **建议**：未来触碰时在 mainModelImageCapability 加 30~60s 结果级 memo；不要求本轮处理。

### 范围外备注（不计发现、不计计数）

- --no-verify 旁路：按任务指令不纳入审查（Coordinator 治理面已补正）。
- 客户端 wCatalog agents 条目缺 `modalities` 字段声明（client.js:90-96 vs smoke.mjs:185 服务端含 modalities）：未知字段透传不致错，pre-existing，非本轮范围。
- takeoverMemory 模块级 Map 生命周期与组件树一致（既有设计），本轮未触碰。

---

## 六、结论

- **结论：APPROVED_WITH_NOTES**
- **unresolved_blockers = 0**
- 计数：**P0 = 0，P1 = 0，P2 = 2，P3 = 4**
- 判定说明：FIX-018 缺陷 1 的修复链（服务端单点判定 → catalog 下发 → 客户端门控 → deps 看护）端到端成立，核心前提「客户端拿不到模态信息」经审查者对宿主安装态源码独立抽验属实；缺陷 2 证明的①③两腿（探测可达 / prestep 剥离）经实适配器与判别测试双重复核锁死。两项 P2 均不阻塞：P2-1 为证明完整性缺口 + ≤60s 有界 fail-safe 窗口（建议下轮收编：失败不写缓存 + 注释修正 + 判别断言）；P2-2 为镜像纪律违规、功能面零影响（本轮补一行同步即可）。判别 RED/GREEN 结构经静态推演与声称一致（恰 2 FAIL）；门控 16/16 按任务指令采信 Coordinator 复核。
- 修复声称偏差记录：声称 #2「TTL 缓存不可能存注册前失败」与代码事实不符（wrapper.js:289 无条件缓存；P2-1），不影响缺陷 1 修复正确性；声称 #1/#3/#4 核验属实。
