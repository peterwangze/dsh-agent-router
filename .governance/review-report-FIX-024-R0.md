# Code Review 报告 — FIX-024 R0（预设切换显示不跟随·微修复）

> Reviewer: Code Reviewer Agent（独立只读审查）
> Round: R0（首轮）
> 审查对象: commit `ba36836`（lib/preset-defaults.js +32 / tests/preset-defaults.mjs +78）——按任务指令 Read 现盘审查（只读约束下未执行 git 命令；commit 构成由 Coordinator 提供并与现盘增量静态吻合）
> 缺陷基准: Coordinator EV-128 三重实测（宿主状态全对 / 定向会话切换实证 / 规律解码：目标=全局默认 → 设置写无差异 → 文档事件不触发 → 选择器停留旧值）
> 验证边界声明: 本审查为纯只读（任务禁令「不运行命令」）——preset-defaults 46/46 exit 0 与 smoke ALL PASSED exit 0 为 Coordinator 复跑提供的既有证据，本审查以现盘断言静态交叉核验其构成（断言计数 46 = A11+B6+C4+D11+E2+F3+G1+H3+I5，精确吻合），不重复执行。

---

## 一、目标锚定（SKILL 独立使用 §governance）

- plan-tracker L63 FIX-024 行：修复 = 种子成功后显式 `ctx.emit('llm/adapters-updated')`（转发白名单内）驱动 GUI 目录刷新；依赖 FIX-023 ✅。实现与入账基准逐字吻合，无范围漂移。
- 无原则违反（P1~P9 逐条过：无数据删除/覆盖路径；失败可观测 P8 满足；宿主依赖具备白名单 + 消费面双重自证 P9 满足；修改纯粹、单 commit 单问题）。

## 二、审查重点逐项验证（附行号证据）

### 1. 正确性 — emit 调用点唯一性 + fail-safe

**调用点唯一性：PASS。**
- 全 lib 唯一 `ctx.emit` = `lib/preset-defaults.js:203`（grep 全仓证实：`\.emit\(` 在 lib/ 仅此 1 处）；helper `notifyModelDirectoryRefresh` 定义 L201-207，唯一调用 L289。
- 失败分支全部前置于调用点（seed L217-290 控制流逐行核验）：
  | 分支 | 位置 | 返回点 |
  |---|---|---|
  | apiProxy 面不可用 | L221-226 | return L225 |
  | globalBefore 不可读（fail-closed） | L227-231 | return L230 |
  | options 不可突变（冻结） | L233-240 | return L239 |
  | selectModel 抛错（回滚①） | L247-254 | return L253 |
  | selectModel err 信封（回滚①） | L255-261 | return L260 |
- 恢复失败（L274-283）**不**阻断 emit——种子已成功（picked 生效），刷新显示当前真实状态，语义正确。
- 重置路径（切无配置预设 → selectModel(全局默认) 成功，L398-403）同经 seed L289 出口 → I3 场景（EV-128 缺陷主体场景）被修复覆盖。

**try/catch fail-safe：PASS。** L202-206：emit 面同步异常 → warn 可观测（P8），绝不击穿种子成功路径。深度核验：真实 cordis `emit`（@deepseek-ai/cordis lib/index.js L280-282）同步逐个调 listener 不等 promise——监听器同步异常会从 `ctx.emit` 传出，恰好落入本 catch（containment 成立）；异步监听器 rejection 走宿主包容（dsh-llm `emitAdaptersUpdated` L1149-1151 同款），与宿主自体发布暴露面等价，非新风险类。

**helper 语义注释准确性：PASS。** L190-200 注记与实证逐条相符（见下节）；「EVO-009/FIX-015 消费方幂等——无注册差异时零实际动作」经源码核验成立（见 §2 副作用面）。

### 2. 宿主契约 — 零参形态 / 白名单 / 副作用面

**转发白名单：复核成立。** `@deepseek-ai/dsh-api-remotes/lib/types/remote-events.js` L16-28 `API_REMOTE_FORWARDED_EVENTS` 含 `'llm/adapters-updated'`（L26，与 Coordinator 引用行号一致）；转发循环实证（dsh-host-apiproxy lib/index.js L3689-3695）：`ctx.on(name, (...args) => queue.push(frame({type:"host/remote-event", event:name, args: assertJsonArgs(name, args)})))`。零参 → `args=[]` → `assertJsonArgs` 空数组零迭代平凡通过（L1153-1156），原样转发。

**客户端消费侧：零参兼容成立。** `dsh-client-ui-model-selection` lib/client.js L175-177：`const refresh = () => { for (const directory of this.live.directories.values()) directory.load().catch(() => void 0) }`；L178 `ctx.remote.$on("llm/adapters-updated", refresh)`——`refresh` 不读任何参数，零参形态完全兼容。

**emit 形态与宿主自体发布逐字同形（最强保真论据）。** 宿主原生发布 = dsh-llm `LlmRuntime.emitAdaptersUpdated()`（lib/index.js L1145-1160）：`dispatch("emit", ["llm/adapters-updated"])` + `listener()` 零参调用。插件 `ctx.emit('llm/adapters-updated')` 与宿主发布零参形态一致，客户端无法区分信号来源——无形状漂移风险。

**副作用面（多会话目录刷新波及）：评估成立——幂等只读，无正确性影响。** 全部监听者扫描（@deepseek-ai 全包 grep）共 5 类消费方，逐一核验：
| 消费方 | 位置 | 幂等性判定 |
|---|---|---|
| 客户端 ModelDirectoryResolver.refresh | ui-model-selection L175-179 | 每活跃会话目录一次 `load()`——**只读 RPC**（`sessions.models`），generation 守卫（"Latest operation wins"），失败保留上次良好分组（L41-42 注记 + L57-63），`.catch(() => void 0)` 吞载入失败。无选择写入、无宿主状态突变。PASS |
| 客户端 settings-models refreshModels | dsh-client-ui-settings-models L2776 | 同构只读刷新面。PASS |
| 宿主 dsh-llm invariant 校验 | dsh-llm invariant.js L67-75 | **只读校验**：遍历 provider 验注册可读性，无突变；种子时刻无注册态变更挂起 → 恒过。PASS |
| 插件 oauth-llm sync | lib/oauth-llm.js L477-507 | active/registered 状态差分——无差异零动作；`maybeWarnEmptyModels` 有签名去重（L463-464）防刷屏。PASS |
| 插件 wrapper sync | lib/wrapper.js L521-552 | 包装注册差分（wanted vs wrapHandles）；`syncDefaultModel`（L486-519）三分支均有单次/状态守卫（`tookOverFrom` 一次性 / `legacyStripped` 一次性 / 仅值漂移才写）→ 稳态零设置写、零级联 document-updated。PASS（备注：接管一次性转换若处于待触发态，本 emit 只是提前了既有 sync 语义的收敛时点——FIX-002 既有行为类，非本 diff 引入） |
- 波及成本量化：emit 频率 = 种子成功频率（预设切换/空白预设会话创建，人机操作级）；每次 emit = 每活跃目录 1 次只读 models RPC。性能影响可忽略。
- 无递归风险：本仓无监听者再 emit 该事件；状态变更场景经 registerAdapter → 宿主 announce 的链条有差分终止（深度 1 封顶）。

### 3. 测试 — I1~I5 判别力 + emit 记录面保真

**判别力：PASS（与声明完全一致）。**
| 断言 | 判别对象 | 旧实现（无 emit） | 新实现 |
|---|---|---|---|
| I1（L716-724） | 种子成功 → 恰 1 次 emit + **args.length===0** 零参形状守卫 | 必败（0 信号）✓RED | 绿 |
| I2（L725-733） | err 信封失败分支 → 零 emit + options 回滚成立 | 负向守卫（设计如此，测试头 L50 如实标注） | 绿 |
| I3（L734-744） | **重置路径（G→G 同值写）也 emit——EV-128 缺陷主体场景** | 必败 ✓RED | 绿 |
| I4（L745-756） | emit 抛错注入 → warn + rejected===null + options/picked 照常生效 | 必败（无 warn）✓RED | 绿 |
| I5（L757-764） | subagent 纯 options 路径 → 零 emit（信号不越出主会话种子成功路径） | 负向守卫 | 绿 |
- I3 对 EV-128 场景（目标=全局默认）形成直接回归看护；I2/I5 防 emit 过度泛化（信号只随真实选择面变更）。
- 记录面保真：fixture `emit(event, ...args)` 记录 `{event, args}`（L164-166）与真实 cordis emit 形态同构；I1 的 `args.length===0` 断言把零参形状锁进测试网——第四次 mock 保真度防线前移到位。
- 计数交叉验证：46 断言（A11+B6+C4+D11+E2+F3+G1+H3+I5）与 Coordinator「46/46 exit 0」精确吻合。

### 4. AI 专项（5 项全查）

| 检查项 | 结论 |
|---|---|
| mock 残留 | 无——新增 fixture 面仅 emit 记录，无残留桩逻辑 |
| 硬编码返回值 | 无 |
| 幻觉 API | 无——`ctx.emit` 为 cordis 标准 Context 面（cordis lib/index.js L280 实证）；事件名在转发白名单；消费面零参兼容三方实证 |
| 未实现 TODO | 无 |
| 过度实现 | 无——helper + 唯一调用点 + 注释 + 5 断言，零多余分支/零配置面/零投机泛化 |

## 三、发现列表

**BLOCKING（P0）：0 · P1：0 · P2：0 · P3（台账级，无动作义务）：3**

| # | 级别 | 位置 | 描述 | 建议 |
|---|---|---|---|---|
| N-1 | P3 | lib/preset-defaults.js:202-206 | 同步监听器异常经 `ctx.emit` 传入 helper catch 时，warn 文案统一为 "model directory refresh signal failed"，不含监听器原始上下文（宿主自体发布对 INVARIANT 有 defer+rethrow 专道）。行为安全（种子路径零击穿），仅可观测文案粒度差异 | 台账记录即可；如未来需要区分，可在 warn 中附 `error.stack` 首行 |
| N-2 | P3 | tests/preset-defaults.mjs:731,763 | I2/I5 零 emit 判据用 `ctx.emitted.length === 0` 全事件口径（当前模块仅此一种 emit，等价且更严）；未来若新增其他 emit 类型需同步收紧为按事件名过滤 | 观察项 |
| N-3 | P3 | 验收边界 | 真机端到端（用户重启后 governance 预设切换 → 选择器立即刷新）为最终验收项——本审查实证了机制链全部环节，真机复验仍待用户执行（与 tracker L63「进行中」状态一致，非本审查阻塞） | Coordinator 按流程转用户复验 |

## 四、硬门槛裁决

| 门槛 | 阈值 | 裁决 |
|---|---|---|
| P0 阻塞数 | =0 | ✅ 0 |
| 5 维度全覆盖 | 100% | ✅ 正确性✓ 安全性✓（事件广播无载荷、无注入/敏感数据/权限面变化）可维护性✓（单一职责 helper、注释与实证逐条相符）性能✓（低频广播、幂等只读刷新）测试覆盖✓（I1-I5 判别力 + 46/46） |
| 每发现分级 | 100% | ✅ N-1~N-3 均 P3 |
| 设计一致性 | 已完成 | ✅ 与 FIX-024 入账基准逐字吻合，无范围漂移 |
| AI 专项 5 项 | 全完成 | ✅ 见 §2.4 |

## 五、结论

## **APPROVED**

- 硬门槛全部通过，零 BLOCKING 发现；**unresolved_blockers=0**。
- 修复最小且纯粹（P 编程要求 4：单 commit 单问题）；宿主契约三方源码实证（白名单 L26 / 转发循环 verbatim / 客户端零参消费）；副作用面全量监听者扫描逐一幂等核验通过；与宿主自体发布零参同形，形状漂移风险归零。
- 遗留：P3×3 台账级（无动作义务）；真机复验 = 用户重启后验证（N-3，流程内既有验收项）。
