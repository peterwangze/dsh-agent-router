# Review Record (machine-written by review-record)

- task: EVO-003
- round: R2
- date: 2026-08-22
- reviewer: Code Reviewer
- report: .governance/review-EVO-003-R2.md
- wiring: pending

**审查结论**: **APPROVED_WITH_NOTES**

unresolved_blockers=0

---

# EVO-003-R2 完整审查报告（原文恢复）

> 出处：review-record CLI --report 覆盖预防——备份恢复（2026-08-23）。

# Review Record: EVO-003-R2 — Phase 2 统计集成独立审查（round 2）

- **round**: R2（审查链第 2 轮；R1 已闭 Phase 1 并移交前置项 F1/F2/F4）
- **审查对象**: commit `c2d01ea`（8 文件 +417/-197）
- **reviewer**: Code Reviewer（subagent）
- **date**: 2026-08-23
- **verdict**: **APPROVED_WITH_NOTES**
- **unresolved_blockers**: 0

## §0 输入清单与过程披露

| 输入 | 状态 |
| --- | --- |
| `.governance/diff-EVO-003-Phase2-c2d01ea.patch`（910 行） | ✅ 全文通读 |
| `.governance/review-EVO-003-R1.md` | ⚠️ **已被 review-record 机器 stub 覆盖（仅存 12 行摘要），完整 R1 报告无备份**。R1 事实以 evidence-log EV-042（结构化摘要：F1/F2/F4 定义、8 裁量点全 adopt、P0=0/P1×2/P2×4/P3×7、F12 备忘）+ 本任务书引用为准。→ PROCESS-1 |
| `docs/architecture/evolution-roadmap-v1.md` §2.1（v0.3.1 出口八项）/ §4.3（CSV 11 列 L370）/ §4.4（五实例字段整体迁移 L380-383）/ BC-E2/E7-a | ✅ 实读 |
| `.governance/execution-packets.json` EVO-003 包（quality_budget/done_definition/scope） | ✅ 实读（L112-195） |
| 七文件现状：lib/stats.js（990 行全文）/ lib/service.js（统计段+构造+accountHealth+record 调用点）/ lib/schemas.js / lib/rpc.js / lib/index.js / tests/stats.mjs / tests/smoke.mjs | ✅ 实读 + grep 残留核查 |
| lib/tool.js record 调用点（L179/L198）、lib/wrapper.js settings/updated 先例（L516）、lib/client.js（days/selfReport 消费面） | ✅ 交叉核验 |

**测试事实来源声明**：本 Reviewer 无命令执行权限（角色硬约束），smoke 849/0、stats 99/0、metrics/routing-paths/parity、TDD 红灯、真实 ~/.dsh 未触碰（隔离后 Test-Path=False）均引自 **Coordinator 任务书申报**（Developer subagent d4a8975f 报告 + EV-051），标注为"申报事实"；本审查的可复查事实为代码/测试文本本身。算术自洽：733+116=849 ✓；80+19=99 ✓（新增 19 = F1×8 + F2×2 + F4×1 + W-4 内核×8）；描述符 16→17 三处一致（smoke L195/L196/L1777）✓。

**过程披露**：本次未使用 pwsh/Bash（角色禁令遵守）；唯一写操作 = 本报告文件。

## §1 前轮（R1）findings 比对——修复验证

| R1 项 | 级别 | R2 验证 | 事实依据 |
| --- | --- | --- | --- |
| F1（persist=false 时 load/heal/quarantine/prune 写盘路径未门控） | P1 | ✅ **已修复** | stats.js：load() L520 首行门控、prune() L745、#quarantine L603、#loadDailyFile heal L662（`&& this.persist`）、reset() 磁盘段 L932、#writeIndex L495 / #writeIndexSync L502；测15（stats.mjs L393-425）8 断言含字节级不动+内存零折叠。残留缺口见 R2-F2 |
| F2（record() #fold/getAgentName 在 try 外） | P1 | ✅ **已修复** | stats.js L282-309：#fold/recent 构造/入队/定时器全纳入第二层 try，catch 吞错；测16（L427-448）注入 getAgentName 抛错 → record 不 throw + store 保持可用。观测缺口见 R2-F3 |
| F4（测5 未断言丢弃子集身份） | P2 | ✅ **已修复** | stats.mjs L166：`'2,3,4'` 身份断言（错丢最新必败——shift 改 pop 时得 '0,1,2'） |
| R1-F3（CSV 公式注入 =+-@ 未防护） | P2（建议性） | ⚠️ **维持未改**（carried）——csvEscape（stats.js L177-181）仅处理引号/逗号/换行。Phase 2 RPC 面已上线路径，UI 接入前建议闭环 |
| R1 其余 P2×3/P3×7（Phase 1 内核面） | — | 未逐条复验（R1 完整报告已失——PROCESS-1）；Phase 1 代码本轮 diff 触及处以本轮结论为准 |
| F12 备忘（ok/enabled 包装留接线层） | — | ✅ 遵守：service.statsSnapshot() L2813 `{ ok: true, enabled: this.isEnabled(), ...this.stats.snapshot() }`——RPC 语义归 service，聚合归 store |

**R1 前置项 F1/F2/F4 三项全闭环**，闭合验证成立。

## §2 五维度结论

| 维度 | 结论 | 要点 |
| --- | --- | --- |
| ① 正确性 | ✅ 通过（含 3 项 P2 边界发现） | 委托迁移逐字段等价（§5c）；W-4 往返单次翻转原子性成立（§5d）；边界缺口：并发翻转竞态（R2-F1）、false 期显式 flush 契约洞（R2-F2）、吞错无计数（R2-F3） |
| ② 安全性 | ✅ 通过 | 统计行白名单无凭据/task 内容（字段面 v/at/agentId/provider/model/ok/ms/tokens/costEstimate[errorClass]，error 截 300 字符）；statsExport 不落工作区文件（§4.3 排除理由遵守）；无新注入面；CSV 公式注入为 R1 遗留建议项（carried）；DSH_HOME 隔离防测试触碰用户数据（P7） |
| ③ 可维护性 | ✅ 通过 | service.js 统计逻辑零残留 inline（grep 实证：totals/recent/series/accountSeries/minuteKey/RECENT_CAP/SERIES_WINDOW 仅存迁移注释与 getter 委托）；单一事实源归 stats.js；注释质量高（每决策点有出处注释）；F7 注释语言惯例 nit |
| ④ 性能 | ✅ 通过 | E7-a 红线保持：record() 全同步（shaping + #fold + 一次 queue.push，无 IO），flush 异步批量 + 有界队列；export 分位惰性 + 超量确定性采样；snapshot 仅 RPC 频率调用；无 N+1/O(n²) 新增 |
| ⑤ 测试覆盖 | ✅ 通过 | 新增 19（stats）+116（smoke）断言覆盖 F1/F2/F4/W-4/statsExport/schema/descriptor 全新路径；判别性抽查 7 条全部强判别（§6）；缺口与发现对应（竞态/契约洞无测试——与 R2-F1/F2 绑定） |

## §3 发现列表（P0~P3 + 位置 + 事实）

**P0 = 0，P1 = 0。**

| # | 级别 | 位置 | 事实与影响 | 建议 |
| --- | --- | --- | --- | --- |
| R2-F1 | **P2** | lib/stats.js L569-598 `setPersist` + lib/service.js L2847 | **并发翻转竞态**：`setPersist(false)` 进行中（await flush 期间 `this.persist` 仍为 true）时调用 `setPersist(true)` → L571 `want === this.persist` 早退 no-op → false 转换完成后终态倒置（settings=true、store=false），统计静默停止持久化至下次 settings/updated 或重启。applyStatsSettings 是 fire-and-forget（`void ...catch`），两次快速 settings 提交可触发。影响面：P7 可丢数据类 + 可自愈；触发窗 = 单次 flush 时长（本地盘 ms 级），UI 双击难以命中但脚本化写 settings 可达。单次翻转自身原子性无问题（flush resolve → persist=false 赋值间无 await 点） | 过渡串行化：链入 `#flushing` 同型的 transition promise（或挂起目标值在 await 后复读），保证最后写入者胜出 |
| R2-F2 | **P2** | lib/stats.js L420-460 `flush()/#drain()` | **false 期 flush 契约洞**：#drain 无 persist 门控。正常态 false 期队列为空（record L299 早退）→ flush 空转无害（#writeIndex 已门控）；但 toggle-off 时 `await this.flush()` 若写失败（盘满），批次 unshift 回队（L446）后 persist=false 生效，残留队列在 false 期被**显式** flush() 调用时会写盘——违反 F1 "不读不写"文档契约。生产面无自动调用方（close L969 已门控、flushSync L464 已门控、定时器已清），仅公共 API 直接调用可达 | `#drain()` 起点加 `if (!this.persist) { return }`（与 #writeIndex 同构防御；不影响 toggle-off 语义——该场景 flush 时 persist 仍为 true） |
| R2-F3 | **P2** | lib/stats.js L307-309 `record()` catch | **吞错零观测**：F2 修复后注入函数抛错被静默吞掉，本条事件丢失但 selfReport 八项计数（dropped/skippedLines/…/detailDropped）无一命中——"存储自诊断计数"（§4.2/E7-a 可观测面）对 record 路径失败失明，故障期静默丢统计无痕迹 | catch 内加 `this.selfReport.recordErrors = (…) + 1` 类计数（或复用 dropped + 注释区分语义），wire 面留待下次增量 |
| R2-F4 | P3 | lib/service.js L2847 | applyStatsSettings 空 catch：setPersist→load() 失败（如 load 折叠期 getAgentName 经 settings 抛错）时无计数无日志，持久化停在降级态（persist=true 未加载历史——新记录仍会持久化，不损数据） | catch 内计数入 store.selfReport 或经 ctx.logger.warn |
| R2-F5 | P3 | lib/stats.js L583-587 | `setPersist(true)` 于 close() 后半激活（persist 置 true + 重挂 exit handler，但 #closed 阻断入队、flushSync 早退）——API 契约缺口。当前接线不可达（index.js 每次 apply 新建 RouterService/store，close 仅属旧实例生命周期） | setPersist 起点加 `if (this.#closed) return`，或在 JSDoc 声明 close 后不再可用 |
| R2-F6 | P3 | tests/smoke.mjs L33-36 | DSH_HOME 临时目录 mkdtempSync 后无 rmSync，每次 smoke 运行遗留一个空 `router-smoke-home-*` 目录；注释"进程退出即弃"表述误导（弃的是 env 绑定，目录残留）。对比：W-4 work 目录有起止清理（L1246/L1265） | 收尾 rmSync（process.on('exit') 或测试尾部），注释改为"进程退出即失效" |
| R2-F7 | P3 | lib/index.js L167-183 | 新增注释块为英文，与库内既有中文注释惯例不一致（周边 L156/L185 均中文）——可读性 nit | 统一为中文（非阻塞） |
| carried | P2 | lib/stats.js L177-181 | R1-F3 CSV 公式注入（=+-@ 前缀）未防护——RPC statsExport 已注册（17 号描述符），UI 按钮接入（client.js 零改动，本包范围外）前建议闭环 | csvEscape 增加首字符 =+-@ 时前缀 `'` 的 RFC 建议 |
| R2-F8 | P3（治理记账） | .governance/execution-packets.json L151 | R1 裁量① 附条件义务"quality_budget 字面修订：'仅 fs/path'→'Node 内建零包依赖'"**未落地**——包内 maintainability threshold 仍为旧文面，而 stats.js 实际 import node:os（L56，R1 已 adopt 的先例） | Coordinator 更新包文面（随 R2 通过落账批次） |
| PROCESS-1 | 过程（不计 P 级） | .governance/review-EVO-003-R1.md | 完整 R1 报告被 review-record 机器 stub 覆盖且无备份（对比：EVO-002-R7 有"完整报告备份防覆盖恢复"惯例，EV-050）。R1 事实仅存于 EV-042 结构化摘要——本轮输入完整性受损但可复核 | 复审链落账时对完整报告做 `review-{task}-R{n}-full.md` 备份或让 review-record 追加而非覆盖；建议补立项治理工具缺陷（EV-046 已累计同类线索） |

## §4 疑区逐项裁决（任务书 (a)-(h)）

**(a) F1 门控完备性 —— ✅ 通过（附 R2-F2 边界）**。五处磁盘路径门控实证：load L520 / prune L745 / #quarantine L603 / heal 回写 L662 / reset 磁盘段 L932（内存清零在门控前同步完成——"纯内存清零=现状 resetStats"语义正确）；index 写双路门控 L495/L502。**flush 定时器**：#armTimer L411 含 `!this.persist` 守卫 + setPersist(false) clearTimers——false 期不会触发写尝试 ✓。遗漏触点仅一处：flush()/#drain() 本体（R2-F2，需显式调用+残留队列才可达）。测15 用"三类会被写路径触碰的现场"（超期文件/坏行文件/目录占位名+超期 index 项）字节级断言不删不重写不隔离——现场构造完备，判别性强。

**(b) F2 try 包裹正确性 —— ✅ 通过（附 R2-F3）**。第二层 try 覆盖 #fold/recent 构造/入队/阈值 flush/定时器全段；外层 try（L263-278）管 shaping。catch 语义：注入函数抛错只损失本条，**不会留下半折叠状态**——#fold 内 name 解析（L334）先于任何计数自增，getAgentName 抛错时 totals 尚未写入（首个 total 对象字面量在 L335-338 求值前 name 已求值）……精确地说：`const name = (this.getAgentName && this.getAgentName(rec.agentId)) || rec.agentId`（L334）是 #fold 第一行，抛错时零副作用 ✓。dropped/skipped 计数语义区分正确：dropped = 队列满丢最旧（L301-304，仅入队后可达——注入抛错不误计）；skippedLines/skippedVersionLines = 加载路径（persist=false 时 load 早退不可达）。缺口=吞错本身无计数（R2-F3）。

**(c) 委托迁移等价性 —— ✅ 通过**。snapshot 输出形状逐字段比对（stats.js L802-857 vs 迁移前 service.js 旧码，diff L344-395 删除段）：totals 10 字段（agentId/name/provider/model/calls/errors/inputTokens/outputTokens/totalMs/lastAt||undefined）✓；series cutoff 过滤+排序+**桶原位删除副作用**保持 ✓；accountTotals 含 models 嵌套 8 字段 + provider 排序 ✓；accountSeries 同构 ✓；recent 条目 `ok !== false` 归一、token>0 才携带、error 截 300 ✓——**零语义漂移**，增量仅 days/selfReport（wire 面 optional，schemas L539/L546-557，向后兼容）。差异点（良性，更严不是更松）：provider/model 空串归一 '?'（旧 `?? '?'` 不拦空串）；token 负数钳 0；series 折叠加 90 分钟窗口门（L387——live 记录 at≈now 恒真，仅影响 load 回填，Phase 1 已裁语义）。accountHealth（service.js L1104-1109）经 getter 读 StatsStore 活 Map——与迁移前直读活 Map 时序等价 ✓。并发：record 全同步、#drain splice 同步取批、#flushing 合并句柄防并发 drain、await 间隙新事件留队下轮取——单线程事件循环下无双计/丢失窗口 ✓。

**(d) W-4 往返语义 —— ✅ 通过（附 R2-F1）**。开→关原子性：`await this.#flushing`（收尾在途）→ `await this.flush()`（排空）→ `this.persist = false`（flush resolve 后同微任务连续执行，无交错点）→ clearTimers ✓——"flush 进行中 setPersist(false)"窗口被正确串行化。关→开防双计：memoryEmpty 四路检查（totals/accountTotals/days/detail，L588）逻辑正确——非空内存的唯一来源是 fold（record 或 load），两者都已含磁盘数据，reload 必双计；空内存（false 期重启）→ load 全量恢复 ✓（测17 store b：calls===2 + name 回退 agentId 证 getAgentName 缝）。**index 镜像重建不遗漏 false 期事件**：false 期 record 仍走 #fold 更新 days（持久化门控仅在入队段 L299），重开时 #writeIndex 以 days 全量重建（L594）——false 期聚合进镜像（非权威、明细不落盘，重启后被明细优先原则自然覆盖，无双计、与"droppable by design"一致，测17 `!rows.some(draw)` 锁定明细面）。服务面三次翻转测试判别性强（§6 抽查 3）。竞态缺口见 R2-F1（连续翻转，非单次翻转内）。

**(e) statsExport —— ✅ 通过**。CSV 11 列与 §4.3（roadmap L370）**逐列一致**：`date,agent,account,model,calls,errors,inputTokens,outputTokens,p50ms,p95ms,costEstimate`（stats.js L901，smoke L1233 全字符串断言）；range/level 非法值：export() L868/869 throw → service.statsExport L2832 catch → `{ok:false, message}`（含 'range'/'level' 字样，cliModels 先例同构），wire 面只做形状检查（自由字符串先例 protocol/strategy 同构）✓。90d 性能语义：**非全量加载**——export 只遍历内存 detail（上限 250k 行，BC-E2），load 时按 detailDays 窗口（默认 90d=retention）加载明细、更早走 index 聚合种子；cutoff 公式两侧同源（`dateKeyOf(now - N*DAY)`）窗口对齐 ✓。超量分位降级确定性采样（Phase 1 已审）。边界：level 'account' 时 agent 列空串——符合 §4.3 两 level 定义。

**(f) smoke 接线 —— ✅ 通过**。DSH_HOME 隔离实现：smoke.mjs L36 模块顶层 `process.env.DSH_HOME = mkdtempSync(...)`——时机在全部 import（均无模块级 DSH_HOME 读取：stats.js defaultStatsDir/oauth-credentials resolveCredentialPath 均为调用期求值）之后、任何 service 构造/apply 接线之前；进程内 env 绑定不外泄子进程语义正确（spawnSync `node --check` 不消费该变量）；不恢复是正确选择（测试进程退出即失效）。与裁量②构成**双保险实证**：直构 service（L327 等 5 处 `new RouterService(root*)`）默认 persist=false 根本不触盘；apply 接线段（L1777）按 settings 默认 true 才启用——此时靠 env 隔离兜底，两层正交 ✓。描述符 16→17 三处一致（L195 contribution/L196 descriptors/L1777 registeredContribution）+ codec 对象身份断言（L203）✓。

**(g) 裁量②安全性 —— ✅ adopt（详见 §7 裁决表）**。用户可见语义：最终用户唯一到达路径是插件组合根（index.js apply），此处 settings 默认 persist=true → applyStatsSettings → setPersist(true) → load 真实 DSH_HOME——"重启保留"默认生效，不存在用户误解路径；直构=测试/嵌入开发者专用。未来新测试直构期待持久化的 fail-loud 缺口：现状静默不持久化（构造注释 L639-646 有文档但无运行时提示）——风险受控（statsOptions 第三参显式传入 dir/persist 即表达意图，误用会在"重启数据没保留"的测试断言上直接暴露），记 P3 级备注并入 R2-F4 观测建议（若加 warn 可一并覆盖）。

**(h) 测试判别性抽查 —— 7 条，全部强判别**（§6 详表）。

## §5 设计一致性核查

| 基准 | 核对 | 结论 |
| --- | --- | --- |
| §4.4 迁移方式（五实例字段整体迁移 + record/statsSnapshot/resetStats 委托 + DEC-011 先例） | service.js L207-211（构造注入 StatsStore，五字段不再为实例字段）、L2802/L2812/L2821 三委托、L2790-2793 getter 兼容面 | ✅ |
| §4.3 CSV 11 列 + range/level 枚举 + 不落工作区文件 | stats.js L866-902 / service.js L2828-2835（纯文本返回） | ✅ |
| §4.3 errorClass v0.3.2 预留（v1 行格式向前兼容） | 行白名单 L325 条件携带 + recent 条件携带 + wire recent optional | ✅ |
| §4.2 reset 软删除默认 + persist=false 纯内存清零 | stats.js L913-957（false 期盘上原样保留=IBC-1 ②，测15 断言 backupDir==='' 且目录字节不动） | ✅ |
| W-4（ARCH-002 IBC-1 ①②③） | setPersist 往返（§4d）+ schemas stats.persist 三态（默认 true/false 显式/空对象补默认，测 smoke L106-108） | ✅ |
| ADR-006 / E7-a 性能红线 | record 同步 push-only（§2④）；quality_budget performance/reliability/security 三维阈值逐条对上（maintainability 文面欠账 R2-F8） | ✅（附记账项） |
| 出口条件八项机制面申报（①②③⑤⑥⑦⑧机制面，④待 UI） | ①重启保留=load/setPersist(true) 路径+测17 b；②按天聚合=days 视图+wire；③p50/p95=export 列；⑤CSV=RPC 面；⑥retention=prune 90d；⑦四件套=Phase 1 测 1-14；⑧W-4=测17+smoke | ✅ 机制面成立。**注意**：②按天视图与⑤导出按钮的 **UI 面（client.js）零改动**——用户可见闭环留待 UI 批次，Coordinator 台账应保留该开口 |

## §6 测试判别性抽查（≥5 要求 → 实抽 7）

| # | 断言 | 判别性推演 |
| --- | --- | --- |
| 1 | stats.mjs L166 `'2,3,4'` 子集身份 | 强——丢弃方向反转（shift→pop）得 '0,1,2' 必败；仅计数断言（len===3）无法区分的缺陷正被此断言捕获 |
| 2 | stats.mjs L410-415 F1 字节级不动（badContent 全等 + 目录列表全等） | 强——任何写路径触发现场（prune 删/heal 重写/quarantine rename/index 重写）必败；配合 totals.length===0（读折叠面）覆盖"不读不写"两侧 |
| 3 | stats.mjs L464 重开活内存不双计（calls===1） | 强——若误走 load 全量恢复得 2 必败；与 L474-476（重启空内存恢复 calls===2）构成二分支互斥判别 |
| 4 | stats.mjs L458/467 toggle-off 先 flush / false 期显式 flush 零写入 | 强——行数 1→1 精确锁定两次状态；漏 flush 得 0，false 期误写得 2 |
| 5 | smoke L1233 statsExport 11 列全串等值 + 数据行前缀 | 强——列名/列序/分组键（date,agent,account,model 逐段）任何漂移必败；比 contains 断言严格 |
| 6 | smoke L1255-1263 服务面三次翻转（off flush / false 纯内存 / on 不双计） | 强——与 store 面测17 互补，覆盖 applyStatsSettings→setPersist 接缝（settings 读取/三态解析/fire-and-forget 时序，sleep(80) 容忍异步收尾；tmpdir 单文件 ms 级操作，flaky 风险低） |
| 7 | smoke L203 descriptor codec 对象身份（`=== wireCodecs.statsExportRequest`） | 强——重复构造 codec 实例/挂错 codec 的接线漂移必败（比方法名匹配严格） |

## §7 四项裁量点裁决

| # | 裁量点 | 裁决 | 依据 |
| --- | --- | --- | --- |
| ① | runStatsTests 接入 smoke 且独立入口并存 | **adopt** | 与 runAttachmentTests/runOauthCredentialTests/runLoopbackTests（smoke L8-11）完全同构的导出/接入先例；双入口满足执行包 next_commands（`node tests/stats.mjs`）与聚合回归双场景；计数归属清晰（116 = smoke 面新增，19 = stats 面新增） |
| ② | RouterService 构造默认 persist=false、组合根按 settings 启用 | **adopt** | 生产行为不变实证：index.js L153-183 唯一生产构造点，apply 即 applyStatsSettings（settings 默认 true）——用户"重启保留"默认生效；直构防污染真实 DSH_HOME 与 smoke env 隔离构成正交双保险（§4f）；statsOptions 仅测试注入的第三参设计显式。备注：直构期待持久化的未来误用无 fail-loud（P3，并入 R2-F4） |
| ③ | setPersist 同进程往返非空内存跳过 reload 防双计 | **adopt** | 防双计逻辑正确（§4d）：非空内存⟹磁盘数据已折叠，reload 必双计；memoryEmpty 四路检查完备（四者任一非空都意味着有 fold 历史）；index 镜像重建完备（days 含 false 期聚合，非权威镜像语义自洽）。附条件：R2-F1 竞态修复建议随下批收尾（非本轮阻塞） |
| ④ | 净减 -92 vs 设计预估 ~220（完整性以零残留为准） | **adopt** | 零残留实证（§2③grep + §5）：统计逻辑零 inline 残留，minuteKey/RECENT_CAP/SERIES_WINDOW 单一事实源迁 stats.js（L81-84/L172-174），service.js 仅存委托+getter+迁移注释；~-220 预估基于 roadmap 撰写期 2965 基线，其后 EVO-002 多 Step 已使 service.js 涨至 3395（本 commit 前 3487），现行统计段实为 165 行——口径变更事实成立。出口⑧"行数净降"按净变化语义满足；建议 Coordinator 随 R2 落账刷新 roadmap §2.1 ⑧ 的绝对数字（陈旧基线） |

## §8 AI 代码专项 5 项

| # | 检查 | 结论 | 事实 |
| --- | --- | --- | --- |
| 1 | mock 残留 | ✅ 无 | 全部真实 fs（mkdtempSync/tmpdir/起止清理）；w4 假 scope `{get:…}` 为 settings 接缝测试替身，与 getState（service.js L657-659）真实语义一致，仓内既有实践 |
| 2 | 硬编码返回值 | ✅ 无 | reset RPC `{ok:true}` 为真实语义；statsExport 返回计算值；无写死通过值 |
| 3 | 幻觉 API 调用 | ✅ 无 | process.on/removeListener('exit')、setTimeout/setInterval/clearTimeout/clearInterval、readdir(withFileTypes)、mkdtempSync 均 Node 真实 API 且用法正确；ctx.on('settings/updated') 与 wrapper.js L516 既有用法逐字同形（含 ns 过滤）；TypertRemoteService 方法派发名 statsExport 与 rpc.js method 一致 |
| 4 | 未实现 TODO | ✅ 无 | diff 全文无 TODO/FIXME/占位实现；errorClass/costEstimate 为 roadmap §4.3 明文的 v0.3.2 前向预留（非空头承诺） |
| 5 | 过度实现 | ✅ 无 | days/selfReport 增量字段均为 §4.3/§4.2 明文要求；statsExportResult message 行数统计为最小实现；无超出本包 scope 的投机抽象（pricing 表接线、client.js 均正确克制未动） |

## §9 硬门槛自检

| 门槛 | 阈值 | 实测 |
| --- | --- | --- |
| P0 阻塞数 | = 0 | **0** ✅ |
| 5 维度覆盖 | 100% | §2 五行逐一有结论 ✅ |
| 每条发现标注级别 | 100% | §3 全表 P0~P3 + 位置 + 事实 ✅ |
| 设计一致性检查 | 已完成 | §5 八项基准逐条 ✅ |
| AI 专项 5 项 | 全部完成 | §8 ✅ |
| 复审链义务（code-reviewer.md L62-66） | round 号声明 + 前轮逐条比对 + 不盲 APPROVED | 头部 R2 声明 + §1 比对表 + R1 输入受损披露 ✅ |

## §10 结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

- P0=0 / P1=0 / **P2×3**（R2-F1 setPersist 并发翻转竞态、R2-F2 false 期 flush 契约洞、R2-F3 record 吞错零观测）+ carried P2×1（R1-F3 CSV 公式注入）/ P3×4（R2-F4/F5/F6/F7）+ 治理记账 P3×1（R2-F8 包文面欠账）+ PROCESS-1（R1 报告覆盖）。
- 三项 P2 均为边界/观测增强（触发条件窄、P7 数据类、可自愈或不可达于生产自动路径），不构成本轮阻塞；建议与 UI 面（client.js 按天视图/导出按钮/清空确认）同批收尾闭环。
- 前置项 F1/F2/F4 全闭环，Phase 2 七子项与 §4.3/§4.4/W-4/ADR-006/E7-a/P7 设计基准一致，委托迁移零语义漂移，裁量①-④全 adopt（③附 R2-F1 条件）。
- Phase 2 代码面通过；v0.3.1 出口条件②⑤的用户可见 UI 面仍为开口（client.js 零改动——包 scope 如此约定，Coordinator 台账跟踪）。

**结构化结论**：`{"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":0,"P2":3,"P3":4},"carried":{"R1-F3":"P2-csv-injection"},"discretions":{"①":"adopt","②":"adopt","③":"adopt-with-R2-F1-followup","④":"adopt"},"preconditions":{"F1":"closed","F2":"closed","F4":"closed"},"test_facts_source":"coordinator-reported"}`

