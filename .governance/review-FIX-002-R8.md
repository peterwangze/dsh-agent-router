# Review Record (machine-written by review-record)

- task: FIX-002
- round: R8
- date: 2026-08-22
- reviewer: Code Reviewer
- report: .governance/review-FIX-002-R8.md
- wiring: pending

**审查结论**: **APPROVED_WITH_NOTES**

unresolved_blockers=0

---

# R8 完整审查报告（原文恢复）

> 出处：review-record CLI --report 覆盖预防——Reviewer 落盘原文经备份恢复（2026-08-23）。

# Review Record — FIX-002-R8

- task: FIX-002（双层接管修正——用户主权语义）
- round: **R8**（FIX-002 专线第 2 轮复审；R7 为第 1 轮，round<3，无熔断触发）
- date: 2026-08-23
- reviewer: Code Reviewer（同 R7 角色，重 spawn 复审）
- prev_report: `.governance/review-FIX-002-R7.md`（含 F1-F8 完整 findings + 原文恢复段）
- verdict: **APPROVED_WITH_NOTES**
- unresolved_blockers: **0**
- wiring: pending

## 复审头部声明（code-reviewer.md 复审四条逐条兑现）

1. **round 声明**：R8 = FIX-002 专线第 2 轮（R7 NEEDS_CHANGE → 两批次返工 → 本轮验证修复）。round<3，不触发熔断建议。
2. **前轮引用**：本文逐条比对 `.governance/review-FIX-002-R7.md` F1-F8，每条标注「已修复 / 未修复 / 新引入」。
3. **不得不看前轮直接 APPROVED**：本轮全部结论以 R7 findings 为基准逐条验证（见下表）。
4. **熔断提示**：不适用（round<3 且本轮为通过终态）。

## 输入清单（全部读取现状，两 commit 72b2670/0b3c15d 已在 HEAD）

| 输入 | 状态 |
|---|---|
| `.governance/review-FIX-002-R7.md` | 已读全文（含机器存根 + 原文恢复段） |
| `lib/client.js` L3120-3339（takeoverMemory 块 L3211-3277） | 已读现状 |
| `lib/wrapper.js` L380-527（legacyStripped + syncDefaultModel L421-527） | 已读现状 |
| `tests/client-render.mjs`（全文 939 行） | 已读现状 |
| `tests/smoke.mjs` L1500-2079（admission 段） | 已读现状 |
| `lib/schemas.js` L305-334（F8 现状确认） | 已读现状 |
| grep 触点枚举（takeoverMemory/FIX-002/legacyStripped/takeoverDefaultModel across lib/） | 已执行——改动触点收敛见 §diff 纪律 |

**Reviewer 无执行权限**：以下测试事实为 Coordinator 提供，本轮引用时逐处标注来源，未由 Reviewer 复跑：批次 1 内联 harness 89/89→TDD-RED 90/3（恰三条 F3-2 失败）→93/93；F2 探针 A1/A2/B1 过；批次 2 `node tests/smoke.mjs` 695 ok/0 FAIL/exit=0（基线 687+8）；TEMP 探针三版本矩阵（current 72b2670+ / preF2 d264f03 / preFix002 f1c4c91）——5 条核心断言旧代码实测必败、2 条推演型如实标注。

---

## F1-F8 逐条处置表（复审核心）

| ID | 级别 | 处置 | 事实依据 |
|---|---|---|---|
| F1 | P0 | **已修复** | `lib/client.js:3216` `takeoverMemory = new Map()`（sessionId→原生 provider，"这个 twin 是谁放上的"记忆）。三态完备：接管成功才写记忆（L3257）；解除武装仅当「记忆命中 && 仍停在我们的 twin」才还原（L3258-3267），还原成功才清记忆（失败保留下次重试，L3267）；用户手动改走（原生/别的 twin）= 静默清记忆不写设置（L3268-3270）；用户手动选的 twin（无记忆）零触碰。R7-F1 的「每次 effect 触发剥手动 twin」路径被记忆门控彻底关闭 |
| F2 | P1 | **已修复**（含文档化残留 N3，见新引入） | `lib/wrapper.js:442` 闭包级 `legacyStripped` 标记；L469-472 剥离仅首次执行，**标记在 await 之后置位**（saveSelection 抛错→标记保持 false→下次 sync 重试，与注释 L468 一致）；重装重置标记 = 保留自愈通道（L436-441 注释明确两职责并存，正是 R7-F2 要求保留的通道）。判别测试 smoke.mjs L1988-2032 四段断言守护（首剥恰一次/三连事件零再剥/dispose 零写/重装再剥恰一次——后者守护闭包级设计排斥模块级退化） |
| F3 | P1 | **已修复** | `tests/client-render.mjs:214-216` `takeoverSwitch` fixture 开关变量化（默认 true 保既有断言语义），L226 镜像进 catalog。判别断言组 L783-823：F3-1「开关 false 不接管」（L800，零 selectModel）+ F3-2 ×3「开关 false 不撤销手动 twin」（挂载/贴图/会话切换，L812/815/818）。挂载断言用全新实例 prefix `takeover-off-2`（L807-808 注释明确：同实例同 deps 不重跑 effect 会退化 vacuous）；贴图/切换变体 deps 真实变化（imageCount 0→1、sessionId 变）→ effect 真实重跑，非空转。旧代码必败推演逐处注释（L793-796、L803-806）。Coordinator TEMP 矩阵实测佐证（preFix002 f1c4c91 必败） |
| F4 | P1 | **已修复** | 不变量③还原写路径：6d（smoke.mjs L1953-1967）前置改为「接管在位再关开关」——端态 + **恰一次写** + 写入内容为原生 provider 三重断言（L1967），掏空路径封死；dispose 掏空修复（L1968-1982）：dispose 前重新接管（L1973-1976 验证 armed），原「卸载还原」断言逐字保留（L1981）+ 补恰一次写断言（L1982）。不变量④ F2 形式化（L1988-2032，见 F2 行）。写计数夹具 = `saveSelection` mock 本体（L1709-1712）——wrapper 是测试中该服务唯一消费者，**全部** saveSelection 调用必被捕获；各步用相对计数（`switchOffWrites+1` 等）隔离前史写入，可靠 |
| F5 | P2 | **现状维持（接受遗留）** | `lib/wrapper.js:451-453` tookOverFrom 仍先于 await 置位——R7 已裁决自愈方向安全（写失败时记忆在、下周期不重试但不造成用户主权伤害），本轮未动，维持接受 |
| F6 | P3 | **现状维持（接受遗留）** | `lib/wrapper.js:490-505` 开关在接管写提交瞬间关回的并发窗口未变——R7 裁决下一 sync 事件自愈，维持接受 |
| F7 | P3 | **现状维持（接受遗留）** | `lib/wrapper.js:525` dispose 还原仍 fire-and-forget——维持接受（悬空 twin 边缘场景，快速退出丢一次还原写） |
| F8 | P3 | **现状维持（转后续：发布说明）** | `lib/schemas.js:323-324` `takeoverDefaultModel: v.boolean(true)` 可选字段、缺省按 false（旧缓存客户端不识此字段 → `undefined === true` → false → 不接管，fail-safe 方向正确）；混合窗口残余是固有缓存过渡，归发布说明，不阻塞 |

**P0 计数：0。F1-F4（必修项）全部验证已修复。**

---

## 新引入检查（任务指定疑区 a-f 逐一排查）

**(a) takeoverMemory Map 生命周期** —— key 为 sessionId，多会话/子代理嵌套 sessionId 各自独立键位，**无记忆交叉**（lib/client.js:3257-3269 全部按 sessionId 读写）。armed 期间用户手动切多个 provider：每次新接管以最新来源覆写记忆（L3257），语义正确（还原目标 = 最近一次接管的来源，中间来源的 twin 选择已被用户手动替换、不复存在）。**发现 N1（P3，非阻塞）**：会话在 armed 态终结时无清理钩子，条目随页面生命周期滞留（每条两个字符串，量级可忽略）；无界增长理论上存在、实践中无害。建议后续在宿主提供 session-destroy 事件时补清理，不阻塞本轮。

**(b) F1 三态分支完备性** —— 四象限全覆盖：(armed, native)→接管；(armed, twin)→幂等 no-op；(disarmed, 记忆命中)→条件还原/清记忆；(disarmed, 无记忆)→no-op（手动 twin 零触碰）。armed→disarmed 边界：effect cleanup 的 `cancelled` 在 fetch 后检查（L3246），**selectModel 与 memory.set 之间未复查**——切换瞬间在飞effect 可能滞后写记忆，但 takeoverArmed 是 effect dep，切换立即触发新一轮 effect（disarmed+记忆命中+仍停 twin→还原），一个 effect 周期内自愈，**发现 N2（P3，非阻塞）**。记忆命中但 twin 已卸载：还原写目标是**原生 provider**（L3266），恒有效，不依赖 twin 存续——疑区排除。

**(c) legacyStripped × tookOverFrom 交互** —— 遗留剥离后（tookOverFrom=null、已在原生）用户再开开关：L449-454 接管分支正常触发（tookOverFrom===null + provider 原生 + wrappable），正常接管路径，疑区排除。标记置位失败重试：L470-471 标记在 await 后置位，saveSelection 抛错→catch（L474-476）→标记保持 false→下次 sync 重试，疑区排除。**文档化残留 N3（P3，非阻塞）**：闭包级标记非持久化——重装后标记重置，若用户在开关关闭态手动选了 twin，重装后首个 sync 会再剥一次（每次安装至多一次）。这是 R7-F2 明确要求保留的自愈通道（重装丢失 tookOverFrom 记忆的滞留接管还原）的必然代价，代码注释 L436-441 已如实文档化，且被 smoke.mjs L2023-2029「重装自愈」断言主动守护（排斥模块级标记退化）。两目标（不反复剥 vs 重装自愈）在无持久化存储下不可兼得，取闭包级 + 文档化 = 合理设计裁决，接受。

**(d) 批次 2 断言质量抽查** —— L1967「恰 1 写」：捕获点 L1963 在 re-arm 写（L1959-1961）之后，L1963-L1967 间仅一个 sync 事件，计数确定性与写路径一一对应，可靠。L2016「三连事件零写」：三事件各自 await tick，期间仅一个存活 wrapper（首个已于 L1978 dispose），legacyStripped=true 守护三分支全跳过，零写断言可靠。写计数夹具真实性：`defaultWrites` 由 agentDefaultModel 服务的 saveSelection mock 直接 push（L1709-1712），wrapper 是唯一调用方——「真实捕获全部 saveSelection 调用」成立。推演型断言标注恰当性：L793-796/L803-806 旧代码必败推演逐处注释且与旧代码行为（R7 报告记载的 `!armed && wrapped` 无记忆分支）吻合；Coordinator TEMP 矩阵对 5 条核心断言实测旧代码必败、2 条推演型如实标注未冒充实测——诚实标注，无虚报。

**(e) F3 与 F4 断言语义重叠/互补性** —— 不冗余、正交互补：F3 客户端会话级（takeoverMemory 记忆门控）护 DEC-022 ⑤；F4-6d/7 服务端全局默认（tookOverFrom）护 ③；F4-9 服务端遗留剥离（legacyStripped）护 ④——三条独立状态机三个独立夹具。服务端 6b（tookOverFrom≠null 路径的用户回退尊重）与 F4-9 one-shot（legacyStripped 路径的再选尊重）覆盖不同代码分支，互补不重复。可维护性维度无问题。

**(f) diff 纪律（范围外改动排查）** —— Reviewer 无 git 执行权限，以 grep 触点枚举 + 现状交叉验证代替：`takeoverMemory`/`FIX-002-R7` 在 client.js 全部命中收敛于 L3211-3269（ModelTakeover 块内）；`legacyStripped`/F2 注释在 wrapper.js 收敛于 L436-472；`takeoverDefaultModel` 其余命中（schemas.js:216-220,323-324 / service.js:2944-2946 / wrapper.js:427-472,502-507 / client.js:3229-3237）均为 FIX-002 原有触点（R7 已审）或本两批次声明的文件。**未发现 R7 未发现的范围外产品代码改动**；与 Coordinator 提供的文件清单（批次 1 三文件、批次 2 仅 smoke.mjs）一致。

---

## 新引入 findings 汇总（全部非阻塞）

| ID | 级别 | 位置 | 结论 |
|---|---|---|---|
| N1 | P3 | lib/client.js:3216 | takeoverMemory 无会话销毁清理——armed 态终结的会话条目滞留（每条两个字符串，页面生命周期）。后续有 session-destroy 钩子时补清理即可 |
| N2 | P3 | lib/client.js:3256-3257 | selectModel 与 memory.set 之间未复查 cancelled——切换瞬间的在飞 effect 可能滞后写记忆，下一 effect 周期（takeoverArmed dep 变化必触发）自愈。可在 await 后补 `if (cancelled) return` |
| N3 | P3（文档化设计取舍） | lib/wrapper.js:436-442 | 闭包级 legacyStripped 重装重置 → 每次安装至多一次手动 twin 剥离——R7-F2 要求保留的自愈通道的必然代价，注释已文档化 + L2023-2029 断言守护，接受 |

无 P0/P1 新引入。

---

## 五维度结论

| 维度 | 结论 |
|---|---|
| 正确性 | F1 三态分支完备（四象限全覆盖）；F2 标记时序正确（await 后置位=失败重试）；边界（armed/disarmed 切换、twin 卸载、多 provider 切换）逐一推演排除，残余 N1/N2/N3 均 P3 自愈或可忽略 |
| 安全性 | 无新增输入面；settings 写全部经宿主 saveSelection 服务；无硬编码凭据/注入面（本两批次 diff 触点已枚举） |
| 可维护性 | 注释质量高（F1/F2/F4 修复点均有决策注释，N3 取舍如实文档化）；断言按不变量编号组织可追溯；F3/F4 正交不冗余 |
| 性能 | takeoverMemory 查询 O(1)；每次 effect 一次 sessions.models RPC 为既有模式未加重；无新增循环/分配热点 |
| 测试覆盖 | 核心（①③④⑤）均有真实写路径断言 + 计数判别；判别性经旧代码推演注释 + Coordinator TEMP 矩阵实测双佐证；推演型断言诚实标注 |

## AI 代码专项 5 项

- mock 残留：无（测试 mock 均在测试文件内，产品代码零 mock——grep 触点确认）
- 硬编码返回值：无（分支均走真实 currentSelection/saveSelection/sessions RPC 结果）
- 幻觉 API：无（sessions.models/selectModel、defaultModel.currentSelection/saveSelection、ctx.on('llm/adapters-updated'/'settings/updated') 均为 R7 已核实存在的宿主面）
- 未实现 TODO：无
- 过度实现：无（修改严格对准 F1-F4，无顺手改）

## 设计一致性（DEC-022 不变量基准，与 R7 同一基准）

| 不变量 | 裁决 | 依据 |
|---|---|---|
| ① 默认 false 双层零触碰 | **通过** | 服务端 wrapper.js:503-507（wanted 门控）+ smoke 6c（L1947-1951）；客户端 client.js:3237（takeoverArmed 门控）+ F3-1（L800） |
| ② true 一次性接管+来源记忆+改回尊重 | **通过** | 服务端 one-shot（L451）+ 6b（L1946）；客户端记忆成功才写（L3257）+ F3-2 ×3（L812/815/818） |
| ③ 开关关回/卸载还原（仅当仍停在我们的 twin） | **通过** | 服务端 6d 真实还原写（L1967）+ dispose 重 armed 后还原（L1976-1982）；客户端条件还原（L3265-3267） |
| ④ 历史遗留首次剥还原 | **通过** | smoke 第 9 段四重断言（L2005/2016/2022/2029）——首剥恰一次、零再剥、dispose 零写、重装自愈 |
| ⑤ 客户端会话级同受开关约束 | **通过** | client.js:3237 + F3-1 判别断言 |
| ⑥ P3 零回归 | **通过（Coordinator 事实）** | `node tests/smoke.mjs` 695 ok/0 FAIL/exit=0（基线 687+8）——Coordinator 提供，Reviewer 未执行 |

## 硬门槛自检

- ✅ P0 阻塞计数 = 0（F1 已修复验证，无新引入 P0/P1）
- ✅ 5 维度 100% 覆盖
- ✅ 每条发现（F1-F8 处置 + N1-N3）带级别 + 文件:行号 + 事实依据；Coordinator 提供的测试事实逐处标注来源，未冒充实测
- ✅ 复审四条全兑现（头部 round 声明 / 前轮引用 / 逐条比对 / 熔断不适用）
- ✅ 设计一致性 DEC-022 ①-⑥ 逐条裁决
- ✅ AI 专项 5 项逐一结论
- ✅ unresolved_blockers=0（独立结构字段，APPROVED_WITH_NOTES 终态要求）

## 结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）——F1-F4 必修项全部验证已修复；F5-F8 维持 R7 裁决（接受遗留/转后续）；新引入 N1-N3 均 P3 非阻塞（N1/N2 建议后续小改，N3 为文档化设计取舍）。FIX-002 复审链可在本终态结束。

## 给 Coordinator 的编排提示（决定权在 Coordinator）

- N1/N2（P3）可并入后续小任务或遗留清单，不阻塞 FIX-002 关闭。
- F8（混合缓存窗口）建议进发布说明 checklist。
- 本报告为通过终态；终态编排（任务关闭/证据落账）由 Coordinator 执行。

