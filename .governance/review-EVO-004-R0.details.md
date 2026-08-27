# Review Record: EVO-004-R1 — C-3 统计 UI 面 + P2 遗留六修 独立代码审查

- **data**: 2026-08-23
- **task**: EVO-004
- **round**: R1（审查链第 1 轮；无前轮——本切片首审）
- **审查对象**: 相对 main `6dd6e5b` 的 7 commits：`31a8c74`(R1-F3) `4d08990`(R2-F1) `a9f98b2`(R2-F2) `9fd6110`(R2-F3) `dd5d310`(R8-F2) `d8ee97c`(R8-F1) `8938a54`(①②UI)——6 文件 +380/-44
- **权威审查面**: `.governance/diff-EVO-004-7commits.patch`（44KB，662 行全文通读）
- **reviewer**: Code Reviewer Agent（独立于 Developer；只读）
- **verdict**: **APPROVED_WITH_NOTES**
- **unresolved_blockers**: 0

## §0 输入清单与过程披露

| 输入 | 状态 |
| --- | --- |
| `.governance/diff-EVO-004-7commits.patch` | ✅ 全文通读（662 行） |
| lib/stats.js（1019 行全文）/ lib/client.js（相关区段）/ lib/service.js（statExport 段 + loadOauthProxyDispatcher 段 + deleteOauth/applyStatsSettings） | ✅ 实读 |
| lib/rpc.js（descriptor 16-17）/ lib/schemas.js（OAUTH_PRESET_VALUES / statsResult / statsExportRequest|Result / check 透传语义） | ✅ 实读 |
| tests/stats.mjs（新 18-21 组）/ tests/client-render.mjs（fakeWindow / R8-F1 / ①按天 / ②导出）/ tests/smoke.mjs（R8-F2 + EVO-003 Phase 2 契约面） | ✅ 实读 |
| 前轮基线：`.governance/review-EVO-003-R2.md`（R1-F3/R2-F1/F2/F3 定义源）与 `.governance/review-EVO-002-R8.md`（R8-F1/F2 定义源） | ✅ 实读（findings 定义源对照） |

**测试事实来源声明**：本 Reviewer 无命令执行权限（角色硬约束：Write/Edit/Bash 禁止）。**未执行任何测试**——smoke/stats/client-render 的实际运行结果**未经本审查独立验证**，一切"旧代码必败"判别均为**静态推演**（读断言代码 + 对照修复点）；如实标注，不以"测试通过"作为本审结论依据（事实红线）。唯一写操作 = 本报告文件。

**过程披露**：全程只调用 read/grep/glob；无 pwsh/Bash；无 Write/Edit 于产品代码；无 AskUserQuestion；无子 agent。

## §1 五维度结论

| 维度 | 结论 | 要点 |
| --- | --- | --- |
| ① 正确性 | ✅ 通过（附边界发现） | 六修修复点逐一静态验证成立：R1-F3 转义逻辑正确、R2-F1 串行链可靠（末写胜出）、R2-F2 门控位置正确、R2-F3 计数注入无误计、R8-F1 三消费判据同源、R8-F2 有界化+close 正确。①② UI 字段/接线逐字段对齐（§3）。边界发现：R8-F2 close 期在途请求竞态（P1）、R2-F3 首层吞错不计数（P2/P3）、days wire 透传（P3） |
| ② 安全性 | ✅ 通过 | R1-F3 公式注入防护覆盖全部 11 列；downloadCsv Blob + data: URL 回落无注入面（text/csv MIME、encodeURIComponent 编码）；无 SQL/命令注入；无敏感数据落盘（CSV 不落工作区，§4.3）；行白名单无凭据。R8-F1 非成员 preset 回落通用删除=无独立凭据文件、通用删除安全（服务端成员校验兜底 P7） |
| ③ 可维护性 | ✅ 通过 | isPresetAccount 单一判据函数收敛旧"两宽一严"；注释质量高（每修复点有出处/机制说明）；R8-F2 注释机制错误已修正（"随 GC 回收"→"Map 强引用"）；命名与既有族平行。P5 重复定义风险（见 P3） |
| ④ 性能 | ✅ 通过 | R8-F2 缓存有界化（仅保留最近 1 个 proxyUrl）消除无界增长；#persistTransition 为 O(1) 链式；drain 门控 O(1)；每日视图/导出均为既有序遍历；无新增 N+1 / O(n²) |
| ⑤ 测试覆盖 | ✅ 通过 | 新增断言：stats.mjs +11（R1-F3×5 / R2-F1×1 / R2-F2×2 / R2-F3×3）、client-render.mjs +8（R8-F1×2 / ①×3 / ②×3）、smoke.mjs +1（R8-F2）——合计 +20，与任务书"smoke 857→877 (+20)"的**套件聚合增量**吻合（+20 = 8+11+1）。全部新旧断言均为"旧代码必败"强判别（§2 表"判别性"列逐条推演） |

## §2 发现列表（P0~P3 + 位置 + 事实 + 建议）

**P0 = 0，P1 = 1，P2 = 3，P3 = 6。**

| # | 级别 | 位置 | 事实与影响 | 建议 |
| --- | --- | --- | --- | --- |
| EVO-004-P1 | **P1** | lib/service.js L3453-3459 `loadOauthProxyDispatcher` | **旧 dispatcher close 的在途请求竞态**：proxyUrl 从 A 切到 B 时，首个 B 请求进入 → 缓存 miss → 创建 B dispatcher → 淘汰循环对 A 执行 `await old.close()`。若此刻有 A 请求仍在途（config 切换前发起、尚未完成），close(A) 会中断该请求的连接池/底层 socket（undici ProxyAgent.close 关闭其 client），导致该在途调用失败（可重试，非数据丢失/损坏）。触发窗 = 配置热变更 + 旧代理请求并发在途。非 P7 数据类，但属可靠性边界。**注意**：这恰是修复动机（显式 close 释放资源）的固有权衡——有界语义正确，缺的是"在途请求保护"。 | 低风险增强（可选，不阻塞）：a) 若需在途不中断，改为不 sync close（依赖 GC/或延迟 close 至该实例请求计数归零）；b) 或 JSDoc 明示"config 切换会优先 close 旧 dispatcher，在途旧代理请求可能被中断"。若采纳 b) 至少消除"未声明行为"。 |
| EVO-004-P2 | **P2** | lib/stats.js L180-185 `csvEscape` | **公式注入防护未覆盖 `\t`/`\r`（OWASP 扩展集合）**：正则 `/^[=+\-@]/` 仅覆盖 =+-@。OWASP 清单还含 leading `\t`（tab）与 `\r`——二者可由数据或环境注入（如 agentId 来自含控制字符的配置）。对首字符 `\t` 的字段：`/[",\n\r]/` 命中 `\n\r` 包裹 → 走双引号路径，但 `'` 前缀未加（首字符非 =+-@）→ Excel 仍可能求值。暴露面窄（config 驱动字段罕见首字符 tab），属边界未完全处理，按 P2 立案。 | csvEscape 的前缀判定扩大为 `/^[=+\-@\t\r]/`（\r 已在双引号包裹集，仍可加 `'` 双保险）——P3 级别即可；列为遗留护栏增强。 |
| EVO-004-P2 | **P2** | lib/stats.js L283-285 `record()` 首层 catch | **首层吞错无计数（吞咽点不对称）**：R2-F3 目标达成（第二层 catch 计 recordErrors，覆盖 getAgentName 注入）。但 record() 有二层 try：首层（L270-285，field coercion / `this.now()`）失败仍 `catch { return }` 静默返回，**不计 recordErrors**。若 `this.now()`（自定义注入）抛错，或未来 coercion 逻辑扩展抛出，则该事件静默丢失且零观测。与 R2-F3"吞错必须可观测"的 P8 精神不完全一致（该路径为无副作用的本地计算，当前无实际抛源，故 P2 起步）。 | 首层 catch 也计入 `this.selfReport.recordErrors += 1`（统一"record 路径吞错全计数"）；或注释明示首层为 benign coercion fast-path、刻意不计数。 |
| EVO-004-P3 | P3 | lib/stats.js L343-345 `#fold` | **getAgentName 先行调用的原子性脆弱**：#fold 首行 `const name = (this.getAgentName && this.getAgentName(...)) || ...` 必须先于任何 totals/Map 变异才能保证"注入抛错 → 零副作用"。当前实现如此（抛错时 totals 未写入，测 21 `totals.length===0` 依赖此点）。但此顺序无运行时强制——若未来重排（如先 build total 再解析 name），注入抛错会留下半折叠态。属设计脆弱性，非现缺陷。 | 注释放置 getAgentName 位于 #fold 首行（先于任何变异）是原子性依赖点；或包裹为纯 name 解析先行。 |
| EVO-004-P3 | P3 | lib/client.js L117-141 `wStats` | **客户端 wire codec 未声明 `days`/`selfReport`**：wStats（客户端 RPC 结果验证器）止于 accountSeries，未含 days/selfReport，而 schemas.js statsResult（L539/L543）已声明。**功能上良性**——客户端 wireCheck（L54-62 object 分支）"未知字段透传"（不剥离），故 response.value.days 到达客户端、每日视图可渲染（生产路径成立，非静默失效）。仅为声明/健壮性缺位。 | 在 wStats 补 `days: wv.json(true), selfReport: wv.object({...}, true)` 与 schemas 对齐（作为 wire 契约自文档化）；非阻塞。 |
| EVO-004-P3 | P3 | lib/schemas.js L543-552 `statsResult.selfReport` | **statsResult.selfReport 未声明 `recordErrors`**（仍 8 字段），而 stats.js selfReport 现 9 字段。**功能上良性**——schemas `check()`（L252-268）同构"未知字段透传"，recordErrors 经 wire 到达。为 schema 声明滞后（schemas.js 属于本包范围外未改动的 6 文件）。R2-F3 的 P8 可观测出口经 snapshot→statsSnapshot→wire 成立。 | 下次触及 schemas.js 时在 selfReport 补 `recordErrors: v.number()`；并注明本切片刻意未改 schemas.js（范围纪律）。 |
| EVO-004-P3 | P3 | lib/client.js L1048 `OAUTH_PRESET_MEMBER_VALUES` | **P5 重复定义风险（镜像常量可漂移）**：客户端 `OAUTH_PRESET_MEMBER_VALUES = ['chatgpt-codex']` 与服务端 `schemas.js OAUTH_PRESET_VALUES = ['chatgpt-codex']` 为独立字面量。当前**逐值一致**（已核验），注释明示"客户端无法 import——本地镜像"。若未来新增 preset 而不同步两处，判据会漂移（R8-F1 的统一语义被破坏）。现值与规约一致，风险可控。 | 建议由 catalog/config 镜像携带 preset 列表（服务端为单一事实源），客户端消费镜像而非硬编码——列为泛化护栏（P5 延伸）。 |
| EVO-004-P3 | P3 | lib/client.js L2314-2327 / lib/service.js L3258 | **非成员 preset 账号"可见可删但不可改"**：R8-F1 后未知 preset（'zzz'）账号落到通用 OAuth 卡（可删除——修复意图达成）。但服务端 `updateOauth`/`addOauth`（service.js L3258 `if (preset && !OAUTH_PRESET_VALUES.includes(preset)) return {ok:false}`）会在用户尝试保存该账号的任意字段编辑时**拒绝**（未知 preset）。删除路径正常（通用 unset 条目，无独立凭据文件）；编辑路径会失败。属遗留/异常数据 UX 边角，非本轮 R8-F1 目标破坏。 | （可选）通用卡对该账号的保存失败给明确文案（服务端已返 message）；或编辑时清空 preset 字段。列为观察，不要求改动。 |
| EVO-004-P3 | P3 | lib/client.js L947-981 `downloadCsv` | **Blob 分支未获测试覆盖**：测试只触发 `window.open(data:URL)` 回落（fakeWindow 无 `document`/`createObjectURL` 全守卫 → 走回落）；Blob+anchor 浏览器主路径未被 client-render 断言覆盖（真实 DOM 分支）。另：Blob 路径 `revokeObjectURL` 在 click 后立即调用（Chrome/Edge 正常；个别浏览器历史上需微延时——现代版已稳定）。 | 可选：新增一个 document 存根的 Blob 分支断言（fakeWindow 提供 createObjectURL + appendChild/removeChild 桩）；列为 P3 覆盖增强。 |
| EVO-004-P3 | P3 | 任务书元数据 | **"smoke 857→877 (+20)" 的模块归因**：diff 中 smoke.mjs 仅 +1 断言（R8-F2），而 +20 实为**套件聚合**（client-render +8 + stats +11 + smoke +1 = 20）。任务书将 +20 标注为 "smoke"，与 stats +11 并提时易误读为 smoke 单模块。属描述精度，非代码缺陷。 | Coordinator 台账可注明 +20 为聚合值；本审查基于实际断言计数（+20 与 +8/+11/+1 自洽）。 |

**判别性推演（静态，抽样 4 条"旧代码必败"确认）**：
- 测18 R1-F3 `cell(r,1)==="'=1+1"`：旧 csvEscape（仅 [, "\n\r] 包裹）对 `=1+1` 无前缀 → `'=1+1` 不存在 → 必败 ✓
- 测19 R2-F1 `store.persist===true`：旧码首行 `wamt===this.persist` 早退——p1(off) 在途 persist 仍 true 时 p2(on) `true===true` 早退 no-op → 终态 false → 必败 ✓
- 测20 R2-F2 `!existsSync(dailyPath)`：旧 #drain 无 persist 门控，false 期显式 flush 写盘 → 文件存在 → 必败 ✓
- 测21 R2-F3 `statsSelfReport().recordErrors===1`：旧 selfReport 无 recordErrors 键 → undefined!==1 → 必败 ✓
- R8-F1 client-render '怪异账号' 落入通用卡：旧"宽排除 + 严格成员预设卡"均不渲染 → 文本缺失 → 必败 ✓
- ①/② client-render（statsDayLevel / statsExport 按钮）：旧 statsBody 无该消费面 → 必败 ✓

## §3 设计一致性核查

| 基准 | 核对 | 结论 |
| --- | --- | --- |
| C-3 statsExport wire（schemas statsExportRequest/Result ↔ rpc.js descriptor ↔ client.js wStatsExportRequest/Result） | 逐字段比对：`{range:string, level:string}` 与 `{ok:boolean, message:string, csv:string(true)}` 三侧一致；descriptor id/service/namespace/method/invocation 与 rpc.js 同构（client 用本地镜像 codec，符合既有 local-mirror 模式）；**未重复定义类型差异** | ✅ |
| 出口⑤ range/level 合法值对齐 | UI select（7d/30d/90d × agent/account）与 export() 校验 `{7d,30d,90d}` / `{agent,account}` 及 service.statsExport 非法值 → `{ok:false}` 一致 | ✅ |
| 出口②按天视图消费 stats.days | 键名（calls/errors/inputTokens/outputTokens/ms/cost）与 stats.js days 内存态/索引镜像字段逐一一致；day.cost 缺失由 fmtCost(undefined)||0 兜底 | ✅ |
| downloadCsv 正确性/安全 | Blob+anchor（不离开当前页）主路径；无 DOM 回落 data: URL（text/csv MIME + encodeURIComponent）；无 `document`/`window` 面注入风险（\`data:\` 非 script，`window.open('_blank')`）；无 DOM XSS 面 | ✅（附 Blob 未测 P3） |
| P7 数据安全 | CSV 不落工作区文件；行白名单无凭据/task；R8-F1 非成员回落通用删除（无独立凭据文件）不误删 P7 凭据；R1-F3 防公式注入 | ✅ |
| P8 可观测 | R2-F3 recordErrors 计数经 selfReport→snapshot→statsSnapshot→wire（经 `check`/`wireCheck` 未知字段透传）成立；服务面 statsSnapshot 含 days/selfReport | ✅（附 schema 延迟声明 P3） |
| P9 单信面（R8-F2 缓存生命周期） | 有界化（仅保留最近 1 个 proxyUrl）+ 显式 close 旧实例 + 注释机制修正（"随 GC 回收"→"Map 强引用"）与实际行为一致 | ✅（附在途 close 竞态 P1） |
| W-4 / ARCH-002 IBC-1 | R2-F2 门控与 #writeIndex 同构、不破坏 toggle-off（该场景 flush 时 persist 仍 true）；R2-F1 串行链保证末写胜出 | ✅ |
| 原则违反标注 | 无 P0/P1 级原则违反。R8-F2 在途 close 触及 P3（资源管理/边界——以 P1 立案，比原则违反更精确）；R8-F1 触及 P2（设计完整性——判据收敛，非违规）；其余均文件:行号可复查 | ✅ |

## §4 AI 代码专项 5 项

| # | 检查 | 结论 | 事实 |
| --- | --- | --- | --- |
| 1 | mock 残留 | ✅ 无 | 产品代码零 mock/stub；client-render 的 `stats/statsExport/oauthAccounts` 夹具、stats.mjs 的 `getAgentName` 注入、smoke 的 stub ProxyAgent 均为显式命名测试替身（与仓内既有 practice 一致），无渗漏到产品 |
| 2 | 硬编码返回值 | ✅ 无 | 全部为真实计算/文案资源：fmtCost/percentile/CSV 拼接/days 聚合均真实；`{ok:true}...` 为真实服务语义；无写死通过值 |
| 3 | 幻觉 API | ✅ 无 | `Blob`/`URL.createObjectURL`/`document.createElement`/`anchor.click`/`window.open`（前端）/ `ProxyAgent`/`close`/`process.on('exit')`/`Map.keys().next().value`（Node）均为真实 API 且用法正确；`routerRemote.statsExport` 与 rpc.js descriptor method 一致 |
| 4 | 未实现 TODO | ✅ 无 | diff 全文无 TODO/FIXME/占位；`wire 面留待下次增量`（R2-F3 注释）为分期边界明示，非空头承诺（schemas 未改——范围纪律） |
| 5 | 过度实现 | ✅ 无 | 每改动对应既定 finding（R1-F3/R2-F1/F2/F3/R8-F1/F2 + ①②UI 出口）；R8-F2 淘汰循环虽简单（单 entry 场景）但满足"有界"语义且非投机抽象；无超出本包 scope 的泛化 |

## §5 硬门槛自检

| 门槛 | 阈值 | 实测 |
| --- | --- | --- |
| P0 阻塞数 | = 0 | **0** ✅ |
| 5 维度覆盖 | 100% | §1 五行逐一有结论 ✅ |
| 每条发现标注级别 | 100% | §2 全表 P0~P3 + 文件:行号 + 事实 + 建议 ✅ |
| 设计一致性检查 | 已完成 | §3 九项基准逐条 ✅ |
| AI 专项 5 项 | 全部完成 | §4 ✅ |
| 事实红线 | 每条结论指向可复查事实 | ✅（测试未执行已如实标注为未验证；"旧代码必败"为静态推演非实测） |

## §6 结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

- **P0=0 / P1=1 / P2=3 / P3=6**；未解决 BLOCKING（P0）=0。
- 六项 P2 遗留（R1-F3 / R2-F1 / R2-F2 / R2-F3 / R8-F1 / R8-F2）与 ①② 统计 UI 面（出口⑤导出按钮 / 出口②按天视图）**全部实现**，静态逐项验证成立，判别断言"旧代码必败"推演通过（无绕过）；C-3 契约 / P7 / P8 / P9 逐项对齐。
- 唯一 P1（R8-F2 在途请求 close 竞态）为低频率可靠性边界（配置热变更 + 并发在途旧代理请求），可重试、无数据损坏——**不构成阻塞**，建议作为遗留护栏项记入跟踪表（P1>0 按 SKILL "有条件合并，遗留项记录跟踪表"处理）。
- **范围纪律**：恰为任务书允许的 6 文件（client.js / stats.js / service.js / client-render.mjs / stats.mjs / smoke.mjs）；rpc.js / schemas.js 未动（其 wire 接线正确性已单独核验——P5 重复定义风险按既有 local-mirror 模式判定为可接受）；无 mock/硬编码/幻觉/未实现 TODO/过度实现。
- 测试数值（smoke +1 / stats +11 / client-render +8 = 套件 +20）与任务书"##§8 计数与断言数吻合"静态自洽；**但运行结果未经本审查验证**（无命令执行权限）——最终合并应由 Coordinator 依据实际测试运行（门控命令全绿）确认，本审仅提供代码/契约维度通过判定。

**结构化结论**：
`{"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":1,"P2":3,"P3":6},"fixed":{"R1-F3":"closed","R2-F1":"closed","R2-F2":"closed","R2-F3":"closed","R8-F1":"closed","R8-F2":"closed","exit-daily-view":"implemented","exit-export-button":"implemented"},"scope":{"files_allowed":6,"files_changed":6,"rpc_schemas_untouched":"yes","wire_alignment":"field-exact"},"test_facts_source":"static-analysis-only-not-executed"}`

---
*审查者：Code Reviewer Agent（EVO-004 · R1）· 2026-08-23 · 依据 agents/code-reviewer.md + skills/code-review/SKILL.md + .governance/diff-EVO-004-7commits.patch（权威面）+ review-EVO-003-R2.md / review-EVO-002-R8.md（findings 定义源）+ lib/{stats,client,service,rpc,schemas}.js + tests/{stats,client-render,smoke}.mjs 现状交叉核验。所有测试运行结果为未验证（如实标注）。*
