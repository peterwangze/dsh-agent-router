# Review 报告 — FIX-031（审查轮 R0）

- **Task**: FIX-031 统计归因单点化 + 路由透明性（用户裁决方案 A；DEC-029 验收北极星）
- **审查对象**: commit 770d9e0（工作区已含该 commit 的最新代码；8 文件 +1179/−140）
- **Reviewer**: Code Reviewer Agent（R0）· 只读审查
- **方法与限制**: 无 Bash 权限——diff 语义从 Developer 报告 + 新旧对照重构；全部结论锚定当前工作区文件/行号。测试执行声明（62 断言 GREEN / stash 法 RED 46 FAIL / 全量测试网零回退）**无法由本 Reviewer 复跑，标注「测试执行声明待 Coordinator 机验」**——任务书声明 Coordinator 已另行机验（EV-163）。commit 文件数恰 8 的 C4 范围校验同样待机验。

---

## 一、5 维度逐项结论

### 维度 1：正确性 —— 通过（含 1 项 P1 边界发现）

**主路径核验（逐行 + 夹具复算）**：
- 归一化单点 `normalizeAttribution`（lib/stats.js:145-175）：后缀剥离（:150-152）→ 别名折回（:153）→ 种类判定（:154-166）→ agent 键归一（:167）。纯函数、非法形态落清洁缺省（G7 夹具覆盖 null/42/'string'/{}）。幂等性成立（G8：`chatgpt-oauth→oauth:chatgpt` 再过单点不变——别名目标键无 `chatgpt-oauth` 反向成员）。
- 双权威源合并 `#accountView`（lib/stats.js:607-684）：同 (账号,日期,模型) 格有 scope 覆盖 → `merged = scopeModelCalls + otherCalls`（:630-632）；无覆盖 → call 侧兜底全计（含 mainCalls）。夹具复算：A4（19+113 scope + 1 专业 call = 133，requestCalls=132/callRows=2）、D1-D2（113 scope 吸收 18 twin call + 3 专业 = 116）、D8（同日跨模型不吞并）——合并算式与断言值逐项吻合。
- 吸收判定依据 `attribution.mainModel`（#fold :795/:804 mainCalls/otherCalls 分解位）：wrapper onCall 上报 `agentId: MAIN_MODEL_AGENT_ID`（lib/wrapper.js:589）、oauth-llm 上报 `agentId:'main'`（lib/oauth-llm.js:393/421，读侧归一）、tool.js 上报专业 agent id（lib/tool.js:185/204，不吸收）——**每请求单 call 行成立**（service.js 仅池失败路径补记 :1191，agentId=专业 id → otherCalls，不构成双产）。
- setPersist 空内存判据（stats.js:1049）：totals/accountTotals/days/detail + **presetStats/accountScope** 六项齐备——scope-only 态不再误判空内存双计（C8 夹具：7 scope 行关→开往返后 calls===7）。判据完备性核验：series/accountSeries/agentDays/accountDays/recentBy* 均由 call/scope 行派生，六项已覆盖全部独立源，无遗漏维度。
- 读侧迁移：load 经 #shapeOf → #fold/#foldScope 同过归一化（stats.js:1118-1124）；盘面行不改写（#lineForWrite 取站点原值 :691-710；E2/E5 夹具证盘上 `twin`/`-router` 保留、新写行字段集基线不变）。
- reset() 清零含 accountScope/presetStats（stats.js:1519-1520）✓。

**边界发现 F-1（P1）跨天双计**：scope 行 `at` = 请求解析时刻（preset-defaults.js:638-643，handler 在 `next()` 返回后即记），call 行 `at` = 流结束时刻（wrapper.js:381 startedAt / :390 `Date.now()-startedAt`，oauth-llm.js:397 同型；record 缺省 at=now，stats.js:431）。跨 UTC 午夜请求（起点 23:59:5x、终点 00:00:0x；UTC 午夜 = 北京 08:00，活跃时段）落两日：day1 scope 计 1，day2 无 scopeDay → 兜底分支计 callModel.calls（含 mainCalls）再计 1 → **同一请求账号级合计 2**。触发面窄（该账号当日首请求恰跨午夜才无 scope 覆盖）、幅度 1/次，方向为多计——与用户报障症状同类。D 组夹具全部同日，未覆盖此边界。修复建议（3 行）：wrapper `report()` 与 oauth-llm/tool 记录补 `at: startedAt`（record 已支持 at 注入，stats.js:425），两侧对齐请求起点后边界消失。

**其余边界核销**：模型名错配丢计——同请求 scope 行 `config.model` 与 twin call 行 `options.model` 同为宿主分发模型串，构造上同串，非缺陷（宿主内部重派发是否双发 agent/request 属宿主行为假设，见 F-3 附注）；pool 失败重试每候选记一行（otherCalls 自计）语义合理。

### 维度 2：安全性 —— 通过（零发现）

- 输入规整：recordScope 对 preset/provider/model 分别 slice 64/64/96（stats.js:499-502）；record 全字段类型校验 + 非负钳制（:430-441）；`normalizeAttribution` 对任意 junk 不抛（G7）。
- 注入防护：CSV 公式注入守卫保留（`csvEscape` 前导 `=+-@` 前缀单引号，stats.js:314-319）；导出行经统一转义。
- 敏感数据：落盘白名单不含错误文本/凭据（文件头 §4.2 声明 + E0 锚定的盘面字段集证实）；recent 的 error 仅内存切片 300 字符（:464-465）不入盘。
- 权限面：本 commit 无新用户输入通路、无命令执行、无文件路径扩张。

### 维度 3：可维护性 —— 通过（含 F-2/F-4 两项发现）

- 单点结构清晰：词表/别名/前缀常量集中 stats.js:80-109；wrapper 复用导出（wrapper.js:28/34）而非自定义；client.js 镜像有明确权威源声明 + parity 测试锚定真实包（G9-G12 直接 `loadBrowserBundle(lib/client.js)`）。
- F-2（P2）：stats.js:103-108 注释宣称 ACCOUNT_KEY_ALIASES「由 tests/fix-031-attribution.mjs G 组源码契约断言锁定不漂移」——**该断言不存在**（G 组 libNames 含 oauth-llm.js/host-route.js 但仅用于 G1/G2 归一化/字面量扫描，从未锚定别名值 ↔ `oauth-llm.js:43 OAUTH_PROVIDER` 或 `host-route.js:55 HOST_ROUTE_PROVIDER`）。行为夹具（B3/G7）硬编码 'chatgpt-oauth'——权威常量变更时测试不红、真实系统账号再分裂（D1 回归向量）/宿主路由误分类（FIX-019 幽灵卡回归向量）。注释承诺了不存在的守卫，比缺守卫更糟。修复：G 组补两条 readRepo 正则锚定（依赖面约束 stats.js 不能 import，正则源码契约是既定先例形态——G3/F4/H 组同型）。
- F-4（P3）：client.js:4050 `const WRAP_SUFFIX = '-router'`（会话接管段，既有）与 FIX-031 新增 client.js:70 `WRAP_ROUTE_SUFFIX` 同工厂作用域双定义，未合并。G2 以文件级断言放行（注释明示双面各自定义为既有约定），但同面内重复定义违反单一定义精神——下次触碰该段时合并。

### 维度 4：性能 —— 通过（零发现）

- `#accountView` 每次 snapshot/export 全量重建，复杂度 O(账号×日×模型)，数据源为内存 Map，量级（5 账号×90 天×数模型）微秒级；snapshot 由 RPC 拉取触发、无高频轮询路径（客户端按加载/刷新拉取）。
- 归一化为纯字符串操作、无正则回溯风险；record/recordScope 仍为同步微秒级 + 有界队列（不变量保持）。
- 无 N+1、无重复遍历热点（day/model 双层循环各一次）。

### 维度 5：测试覆盖 —— 通过（声明待机验；含覆盖缺口 F-1/F-2/F-3 对应项）

- 新增 tests/fix-031-attribution.mjs：**62 断言点数吻合**（A6+B8+C8+D8+E6+F4+G13+H9 = 62，B4b 计入）。
- 断言质量抽查 14 条（≥8 要求）：A4（合并计数三元组 133/132/2——锁合并算式而非字符串包含）、A6（agent 键空间精确排序比对）、B1（递归收集 snapshot 全部字符串值子串扫描——恒真风险排除：扫描器对 'main-model' 不误判 bare-main、对 'host-route' 不误判 -router，边界自查通过）、B3（两键归一 + 用量相加 20 token）、B5（三级 CSV 列位扫描）、C7（重启重放）、C8（W-4 往返判据——旧实现必败的双计 14）、D1/D6（快照与 CSV 同源 116）、D8（跨模型不吞并）、E0（**真实 store 落盘探针取行形状**——P10④ 锚定，非心智模型伪造）、E2（盘面不改写）、F4（service.js 白盒正则锚定）、G8（幂等）、G10/G11（双面值 parity，语料含双后缀/未知/'?'）。抽查全部为行为锁或源码契约锁，无恒真/过松断言。
- stats.mjs 对齐：R2-2/R2-3b 旧断言从锁定缺陷形态改为锁定修复形态（:640-648）；smoke.mjs：账号行断言改清洁标签 + accountKind（:1642-1646），内部键白盒断言保留（:514 `accountTotals.get('oauth:oauth2')`——F 组语义的服务层锚）。
- 覆盖缺口：无跨午夜夹具（F-1）、无别名权威锚定（F-2）、无 preset 缺失/遥测降级场景（F-3、P10⑤ 部分场景）。

---

## 二、AI 专项 5 项检查

| 项 | 结论 | 依据 |
|---|------|------|
| mock 残留 | ✅ 无 | 产品代码零 mock；测试用真实 StatsStore + 真实源码文件；loadBrowserBundle 为声明的最小 React shim（client-render.mjs 既定先例），非产品面伪造 |
| 硬编码返回值 | ✅ 无 | normalizeAttribution junk→清洁缺省为设计语义（G7 锁定）；词表/别名为数据非假返回 |
| 幻觉 API | ✅ 无 | wrapper.js:28 导入的 MAIN_MODEL_AGENT_ID/WRAP_ROUTE_SUFFIX 均实际导出（stats.js:80/84）；client 镜像为同文件内定义 |
| 未实现 TODO | ✅ 无 | 四产品文件 + 测试文件通读，无 TODO/FIXME/占位桩 |
| 过度实现 | ✅ 无 | accountScope/#accountView/合并规则均对应裁决方案 A 必需件；requestCalls/callRows 透明字段有明确消费面（C6 断言 + statsAccountScopeHint 口径披露 zh/en :615/:931）；HOST_ROUTE_ACCOUNT_KEY 种类有客户端幽灵卡过滤消费（client.js:2458） |

---

## 三、DEC-029 合规性独立核验（含实现偏差裁决）

### 可见面泄漏检查（全部出口）

对「统计可见面」逐一 grep + 读码核验内部键（twin / oauth: / -router / chatgpt-oauth / 裸 main）存在性：

| 出口 | 结论 | 证据 |
|------|------|------|
| snapshot() 全对象 | ✅ 零泄漏 | accountTotals 显式字段映射**不含 accountKey**（stats.js:1297-1319）；totals.provider=accountLabel（:1324）；recent.provider=accountLabel（:456）；recentByAccount/accountDays/accountSeries 键=清洁标签（:1375-1385, :1346）；presetStats models/recent.provider=accountLabel（:543/:553）；#rebuildRecent 同（:1210） |
| 导出 CSV 三级 | ✅ 零泄漏 | agent 级 agent 列=归一 agentId、account 列=accountLabel（:1448-1449，detail 行经 #fold 归一）；account 级 calls 与账号卡同源 #accountView（:1466-1479）；preset 级 provider=清洁标签（:1432）；B5/B6/B7 夹具扫描 |
| 客户端渲染面 | ✅ 零泄漏 | 服务商列/卡片标题全部经 `statsProviderLabelOf` 单点（client.js:107-115；消费点 :1303/:1318/:1382/:3432）；主模型分组卡挂载 + 用户词汇「主模型」（:3401，zh:614/en:930）；badge 仅 provider 类账号（:3433）；H1 断言旧 `provider||agentId` 回退已删 |
| 客户端索引键 | ✅ 零泄漏 | 全部索引按 accountDisplayKeyOf/agentDisplayKeyOf 建键（:2383-2398）——滚动升级兜底镜像 |

### 实现偏差裁决：**合规（两层方案不违反 DEC-029）**

任务书要求「oauth:chatgpt 类内部键映射到账号显示名」；实现拆为「聚合键保留身份命名空间 + 可见面投影清洁标签」。裁决依据：

1. **DEC-029 两条不变量的约束域**：①禁止的是「路由层中间构件成为独立实体」——核验聚合空间内路由构件已消灭（normalizeAttribution 先剥后键：`-router` 后缀、`chatgpt-oauth` 路由别名在进 accountTotals 前折回；F2 夹具证内部键空间无 -router 残留）。保留的 `oauth:`/`oauth:pool:`/`cli:` 是**真实实体身份命名空间**（订阅账号/账号池/子代理条目——均为用户可见配置实体），非路由构件。②「实现路径不可见」明文约束**用户可见面**——上表全部出口零泄漏。
2. **兼容约束属实**：service.js:1205-1209 `accountHealth()` 白盒消费 `accountTotals.get('oauth:'+accountId)`，由池策略 orderPoolCandidates（:1213-1231）消费；service.js 不在授权修改清单（commit 恰 8 文件待机验，工作区 service.js 无 FIX-031 改动痕迹）。聚合键清洁化将使 healthy/usage-lowest 策略静默失效——偏差理由成立且有 F4/smoke:514 双重回归锁。
3. **无泄漏缺口**：可见面出口全枚举（snapshot/CSV×3/客户端渲染/索引键）逐一核验，投影完备；accountKey 仅存在于进程内 Map 与 #accountView 行内部（snapshot 映射时丢弃）。

### 单点性独立核验（P5）

- `function normalizeAttribution` 全仓唯一定义 = stats.js（G1；本 Reviewer 独立 grep 复核）。
- `'-router'` 引号字面量 = stats.js:80 / client.js:70 / **client.js:4050**（第三处为 F-4 既有残留，文件级通过、面内重复）。
- 合并路径唯一：`#accountView` 定义 1 处 + snapshot/export 消费 2 处 = 3 次出现（G5）；无第二套分键/映射实现。
- wrapper 自有 '-router' 字面量与 `agentId:'twin'` 已删（wrapper.js:28/34/589；G3 正则锚定）。

### 镜像一致性（tests/served-client.js ↔ lib/client.js）

FIX-031 修改段逐区比对**行号级一致**（:63-115 镜像函数 / :614,:930 locale / :1303-1382 渲染 / :2380-2417 索引 / :2452-2461 过滤 / :2630-2648 行装配 / :3394-3443 卡片区）；镜像尾部仅多 exports 挂面（:5207-5209）。关键事实：FIX-031 的 parity 守卫（G9-G12）**直接加载真实 lib/client.js** 求值，不依赖 served-client.js——镜像漂移不构成判别测试的假绿面（F-6 仅为备注：镜像全文件同步无守卫，fix-029 C4 只锚一段，既有结构）。

---

## 四、项目原则违反标注

| 条目 | 结论 | 说明 |
|------|------|------|
| P4 | ⚠️ 无新违反（F-5 建议） | 新判别组 + stats/smoke 对齐齐备；测试执行声明待 Coordinator 机验（本 Reviewer 无 Bash）。仓库无 npm test 汇入点（package.json 无 scripts 段——RISK-001 既有缺口），fix-031-attribution.mjs 仅靠约定入网；建议后续补 scripts.test（本 commit 不加属 C4 纯粹性正确取舍） |
| P5 | ✅ 符合（F-4 残留） | 多触发源单点汇入（四站点→#fold/#foldScope）+ 旧路径删除（wrapper 字面量/'twin'、旧无 provider 明细形态）核验通过；client.js:4050 面内重复字面量为既有残留未合并（P3） |
| P8 | ⚠️ F-3 | scope 行现为计数权威，但其静默丢弃路径（无 preset/无 header/!isEnabled——preset-defaults.js:618-637、stats.js:503）零观测：混合日（同账号他请求有 scope）下主模型 call 行被吸收 → **少计不可见**。requestCalls/callRows 透明字段（C6）提供事后对账面但无丢弃事件。建议 selfReport 补 scopeDropped 计数 |
| P9 | ⚠️ F-2 附带 | 两处权威常量镜像（ACCOUNT_KEY_ALIASES↔oauth-llm.js:43、HOST_ROUTE_ACCOUNT_KEY↔host-route.js:55）无锚定守卫且注释虚指守卫存在；另：计数权威隐含宿主行为假设「每次适配器分发对应一条 agent/request 事件」无 parity 守卫（透明字段可对账，风险受控） |
| P10④ | ✅ 符合 | E0 真实 store 落盘探针取行形状（v1/v2 字段集白名单锚定）；G9-G12 求值真实浏览器包；夹具零心智模型伪造 |
| P10⑤ | ⚠️ 部分 | 重启恢复（C7）/开关往返（C8）/历史数据（E 组）覆盖；缺「目标值等于默认值」型（preset 缺失请求）与遥测降级场景（F-3 关联） |
| P10③ | ⚠️ 待闭环项 F-7 | 显示层验收需真机显示证据——snapshot/CSV 级验证不能替代 GUI 验收（本审查为 API/源码级）；Coordinator 闭环前须补真机证据 |

---

## 五、发现列表

| # | 级别 | 位置 | 问题 | 修复建议 | 关闭计划 |
|---|------|------|------|----------|----------|
| F-1 | **P1** | stats.js:619-637（合并按日分支）× preset-defaults.js:638-643 × wrapper.js:381-390 × oauth-llm.js:392-399 | 跨 UTC 午夜请求双计：scope 行 at=请求起点、call 行 at=流终点，两行落不同日时 day2 无 scope 覆盖触发兜底全计 → 同一请求计 2 次（触发条件：该账号当日首个请求恰跨午夜；UTC 午夜=北京 08:00 活跃时段） | wrapper report()/oauth-llm/tool 记录补 `at: startedAt`（record 已支持注入），两侧对齐请求起点；补一条跨午夜判别夹具 | 建议本轮微 commit 修复（3 行）；若遗留须入 plan-tracker 遗留区 + 版本内关闭 |
| F-2 | P2 | stats.js:103-108（及 :98-100） | 注释宣称别名表「由 G 组源码契约断言锁定不漂移」——该断言不存在；权威常量（oauth-llm.js:43 / host-route.js:55）变更时测试不红 → D1/幽灵卡静默回归向量 | G 组补两条 readRepo 正则锚定（同 G3/F4 形态） | 随 F-1 微 commit 或独立测试补丁 |
| F-3 | P2 | preset-defaults.js:618-637 / stats.js:503 | scope 静默丢弃零观测（P8）：无 preset/header 缺失/插件停用路径无计数事件；scope 为计数权威后 → 混合日少计不可见 | recordScope 的 `!preset` 早退补 selfReport.scopeDropped；遥测 handler 降级路径经 notePresetDiag 留痕 | 下次增量（观测面补强，不阻塞本轮） |
| F-4 | P3 | client.js:4050 | 同作用域 '-router' 双定义（:70 WRAP_ROUTE_SUFFIX 与 :4050 WRAP_SUFFIX 未合并） | 下次触碰会话接管段时改引 WRAP_ROUTE_SUFFIX | 遗留项 |
| F-5 | P3 | package.json | 仓库无测试汇入 script；新测试文件仅约定入网（RISK-001 主轨道既有缺口） | 后续补 scripts.test 枚举全量套件 | RISK-001 承载 |
| F-6 | P3 | tests/served-client.js | 手工镜像无全文件同步守卫（fix-029 C4 仅锚一段）；本轮 G9-G12 锚真实包，风险受控 | 可选：后续加逐段 hash 对比或生成式镜像 | 遗留项（既有结构） |
| F-7 | P3 | 验收流程 | P10③：显示层验收缺真机显示证据（本审查为源码/快照级） | Coordinator 闭环前采集真机截图（账号卡/服务商列/导出 CSV）入 evidence-log | FIX-031 关闭条件 |

---

## 六、硬门槛裁决

| 门槛 | 阈值 | 实测 | 判定 |
|------|------|------|------|
| P0 阻塞问题数 | = 0 | **0**（P1×1 / P2×2 / P3×4） | ✅ |
| 5 维度全覆盖 | 100% | 5/5 逐项有结论 | ✅ |
| 每条发现标注级别 | 100% | F-1~F-7 全部 P1~P3 + 位置 + 依据 + 建议 | ✅ |
| 设计一致性检查 | 已完成 | 偏差裁决=合规（第三节，含全部出口泄漏检查 + service.js 白盒证据链） | ✅ |
| AI 专项 5 项 | 全部完成 | 5/5 逐项结论 | ✅ |

**附加核验**：测试断言抽查 14/62 条（要求 ≥8）全部为有效行为锁/源码契约锁；62 断言点数与任务书声明一致；RED→GREEN 与全量测试网执行为 Coordinator 机验项（本审查标注待机验，非由本 Reviewer 复跑）。

---

## 七、审查结论

# APPROVED_WITH_NOTES

**unresolved_blockers=0**

- 硬门槛全过、零 P0：归一化单点/双权威源合并/可见面零泄漏三项主架构核验成立，实现偏差（聚合键身份命名空间 + 显示面投影）裁决合规且理由属实（service.js 白盒约束 + 范围外文件）。
- 保留备注：F-1（P1）为合并规则真实边界缺陷（跨午夜双计，症状类别与用户三轮报障同类）——**强烈建议本轮以微 commit 修复**（at: startedAt 对齐，3 行 + 1 夹具）；F-2/F-3 建议随附或列入版本内计划；F-4~F-6 遗留项；F-7 为闭环前置条件（真机显示证据）。
- 本结论不替代测试执行机验与 P10③ 真机验收。
