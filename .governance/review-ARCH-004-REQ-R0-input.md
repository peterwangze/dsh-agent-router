# ARCH-004-REQ-R0 — 依赖清单事实纪律 + 四维需求映射独立审查（Round 0）

> - **Task ID**: ARCH-004-REQ-R0（P0）
> - **Reviewer**: Requirement Reviewer Agent（Round 0，无前轮 findings 比对项）
> - **审查对象**（只读）: `.governance/arch-004-dependency-inventory.md`（406 行，Analyst 2026-09-12）
> - **交叉参照**: `.governance/arch-004-compatibility-design.md` §1.1 四维需求映射（架构方案优劣不在本审查域）
> - **交叉核验基准**: Coordinator 机核事实 2026-09-12（T-2 证伪 / T-3 降级 / T-9 前提静态不成立 / 宿主全景 0.1.5-rc.2 / dsh-client-runtime 不存在 / dsh.bundle.patch 存续）
> - **方法**: 全文通读 → 四维审查 → 锚点抽验（9 组 / 19 点，覆盖 A/B/C/D/E/F/G 七类中 6 类直接 + E 类部分）→ 事实纪律逐节核查

---

## 审查结论

**APPROVED_WITH_NOTES**

- **unresolved_blockers=0**
- findings 计数：**BLOCKING 0 · WARNING 3 · SUGGESTION 2**（另 INFO 备注 2 条）
- 锚点核验率：**9/9 组完成双侧实读核验（19 个锚点点位：16 精确命中，3 微偏——1 处路径偏差 + 2 处行号/措辞微偏，0 编造，0 错位事实）**
- 一句话理由：清单以双侧可复查锚点兑现「机器可核查」承诺，四维指令转译、两症状归因域、待验证/已证/证伪三分纪律全部成立且与 Coordinator 机核事实零矛盾；仅存在锚点路径笔误、统计口径不可重构、置信度评级滞后于机核裁决三类非阻断修正项。

结论四选一依据（SKILL L21）：零未解决 BLOCKING finding → 通过终态（保留备注）。

---

## 1. 审查基准：Coordinator 机核事实 × 本审查独立复证

| 机核事实 | 本审查独立复证 | 与清单关系 |
|---|---|---|
| T-2 证伪：listConfigurableProviders 0.1.5 schema 与插件消费逐字段兼容（api-remotes client.js:5727-5734 vs 插件 client.js:4856-4878） | ✅ 已复证（锚点核验 #2）：schema 五字段 provider/displayName/settingsNs/settingsPath(array)/declared? 逐字段对上插件解构；宿主多一个 `error?` 插件不消费（无害） | 清单 B-1 标「待验证（T-2）」——**纪律正确，非矛盾**；机核为事后裁决 |
| T-3 降级：modelCatalog groups/failures wire schema 存续（api-remotes client.js:8164-8193），漂移收窄为「渲染层访问 schema 外字段」待验 | ✅ 已复证（锚点核验 #3）：result schema 含 default/routableProviders/groups[{id,name,models[]}]/failures[{id,name,message}] | 清单 B-2 标「待验证（T-3）」——纪律正确；①-1 机制随裁决收窄 |
| T-9 前提静态不成立：probeHostRoute 判据形状存续（dsh-llm index.js:2055-2067）+ openai-codex 仍在 installed catalog（dsh-llm-pi-ai index.js:803-804） | ✅ 已复证（锚点核验 #1）：dsh-llm :2055 校验 `context.contextWindow` 正整数、:2067 透出 `context:{contextWindow}`（字段可选但形状不变）；pi-ai :803-804 文档位明言 openai-codex 为 installed catalog 内置 | 清单 A-4/②-1/T-9 均标「待验证」——纪律正确；但候选 ②-1「置信度：高」被此后证据削弱（→W-2） |
| 宿主全景 0.1.5-rc.2；dsh-client-runtime 不存在（informational + skip-if-missing = 死重不崩溃）；dsh.bundle.patch 存续（dsh-app-boot lib/index.js:293-314） | ✅ 已复证（锚点核验 #5/#6）：arriveGraphRow `if (dependency !== void 0)` 静默跳过实读；dsh-app-boot :286-314 patch 层组合机制段实读 | 与清单 C-8/G-1 结论逐字一致 |

**判定：清单与 Coordinator 机核事实零矛盾**——清单从未把 T-2/T-3/T-9 写成已证，机核结果是对其「待验证」标注的裁决而非反驳。清单自身事实纪律经受住了独立抽查。

---

## 2. 四维审查逐项

### 2.1 目标一致性 — PASS

- **四维指令逐条映射**（用户指令原文 → 清单落点，均可追溯）：
  - D1 减少依赖 → 清单本体（63 条 A~G 全量 + L1~L4 分级）+ 死重识别（C-8 dsh-client-runtime 死声明、A-11 apiProxy 零注册回落）；
  - D2 解耦 → Step 4 #1（「适配层只收敛了面没收敛形状」——①-1/①-2 根因定位）+ 单点脆弱面 Top3（A-4/C-4·B-2/A-9）；
  - D3 校验看护 → Step 4 #2（peerDeps 9 + inject 4 = 13 条声明「既不校验也不报警」可数）+ E-8/C-8 + R-候选 1；
  - D4 可调测性 → Step 4 #3（三处常驻 timer 无生命周期门控，锚点可数：client.js:5122/service.js:2855/OAuth 刷新链）+ #4（重试复合面不可见）+ 候选 ②-4 显式「列为 D4 可调测性输入」。
- **每维有可判定完成信号**：Step 1 目标（全部依赖点双侧锚点 + 两症状归因域）可判定——63 条/126 接触点/「未定位到」=0/候选 3+4 + 证伪 4 + 反面证据 10，均为可核对离散量，非定性描述。
- **范围声明明确**：「真机取证不可行（插件已卸载止损）」+ 附录验证边界三条「不做什么」（未运行宿主未真机 / tests 守卫未逐套重读 / 主包版本错位不构成依赖面）。
- **交叉参照闭环**：设计文档 §1.1 将同一四维映射为功能/非功能需求（D4 行含「探针惰性化/采样化」等可验收内容），与清单 Step 4 的 D1~D4 设计输入标注一一对应——需求转译链路完整。

### 2.2 需求可行性 — PASS

- **T-1~T-11 全部附验证方法**且真实可执行：静态 schema 比对（T-2/T-3/T-4/T-11 读描述子/codec/RetryPolicy 默认值）、逐行读（T-1/T-5）、grep（T-1 turn/start）、清单 diff（T-7）、隔离环境计时探针（T-10）；T-6 如实标注需真机/CI（`process.versions.undici`）——未把不可执行项伪装成静态可验。
- **关键假设显式「待验证」**：正文 ⚠️/「待验证」标注 + 文末待验证清单 + 「禁止在设计阶段当作事实引用」红线（L354）；两症状候选全部绑定 T 项验证路径（①→T-2/T-3/T-8；②→T-9/T-10/T-11），Q4 给出实施批次优先序（症状① 先 T-2/T-3 静态比对、症状② 先 T-9 + 隔离重现）。
- **候选机制可复查**：抽验 ②-1 维持链（host-route.js:218-232 probe + :270 gateWrites 仅拦 'llm' 触发 + service.js:2848-2862 tick 不受 gate）与 ②-2 轮询（client.js:5112-5126，apply() 无条件创建 setInterval 30000）——代码事实与清单描述一致。

### 2.3 风险识别 — PASS（含 W-2 注意项）

- R-候选 1~5 全部为依赖风险且有缓解策略指向：R1→D3 静态校验通道（三通道叠加实证：E-8 semver 静默 + C-8 informational 跳过 + D-2 改名零提示）；R2→schema 防线（①-1/①-2 根源）；R3→判据形状版本化；R4→可见性门控/节流；R5→白名单 19 项 vs 消费键系统性比对（已核 4 键的诚实声明）。
- **与 Coordinator 机核事实一致性**：无矛盾。逐条核过 T-9 相关表述——A-4 状态行、候选 ②-1 机制段、R-候选 3、T-9 表行四处均为条件式/待验证表述，无一处把「probe 恒败」写成已证。唯一注意项：②-1 的「置信度：高」评级写作时点依据（机制唯一性 + 锚点齐全）成立，但机核后其核心前提（判据形状漂移）已静态不成立——评级滞后问题见 W-2（非事实错误，是证据更新整合义务）。

### 2.4 质量基线 — PASS（含 W-1/W-3 注意项）

- **验收标准可测试**：分析型产物的可测试性 = 锚点机器可核查。抽验 9 组 19 点零编造零错位（详见 §3）——「双侧锚点、全部实读、无记忆填空」的方法学承诺在抽样范围内兑现。
- **「待验证」与「已证」严格分离（P1 红线）**：未发现任何把待验证写成已证的条目；反面证据 10 条真实（抽验 #2 skip 守卫、#10 白名单头注释 "the legal key set of ctx.remote.$on" 支撑 $on 无 throw 语义）；唯一 🔴（D-2 改名）本审查独立证实（remote-events.js:21 在列 19 项白名单、旧名不在）。
- **「完成」定义明确**：Step 1 目标 + 统计节 + 验证边界声明三件套。
- 注意项：统计节多处口径不可精确重构（W-3）、单点锚点路径笔误（W-1）——不影响条目级事实，损害摘要级可核查性。

---

## 3. 锚点抽验清单（硬门槛 ≥6 锚点 / ≥4 类——实际 9 组 / 6 类直接 + E 部分）

| # | 类 | 锚点主张 | 插件侧实读 | 宿主侧实读 | 判定 |
|---|----|---------|-----------|-----------|------|
| 1 | A-4/T-9 | probeHostRoute 判据 + resolveModelInfo 形状 | host-route.js:218-232 ✅（:223-229 listModels 非空 + contextWindow 正整数判据逐字） | dsh-llm index.js:2043-2045 ✅ + :2055（正整数校验）/:2067（context 透出，字段可选） | ✅ 一致；证实判据形状存续 |
| 2 | B-1/T-2 | listConfigurableProviders 条目五字段 | client.js:4856-4878 ✅（同步解构 provider/displayName/settingsNs/settingsPath/declared） | api-remotes client.js:5727-5734 ✅（schema 逐字段对上 + 宿主多 error? 插件不消费） | ✅ 一致；证实 T-2 证伪 |
| 3 | B-2/T-3 | modelCatalog groups/failures wire schema | client.js:4934-4941 ✅（Array.isArray 守卫包装，不挡条目字段——与清单「包装层不挡」主张一致） | api-remotes client.js:8164-8193 ✅（groups/failures schema 存续） | ✅ 一致；证实 T-3 降级（注：清单措辞「?? []」vs 实际 Array.isArray 三元——行为等价，→S-2） |
| 4 | D-2 | credentials/updated 改名（唯一 🔴） | client.js:2093 ✅（$on('credentials/updated')） | remote-events.js:12-32 ✅（:21 credentials/reference-updated 在列；19 项白名单无旧名；另证 D-3 :30/D-4 :29/D-5 :13 在列） | ✅ 断裂实证成立 |
| 5 | C-8 | inject informational + skip-if-missing | package.json:22-27 ✅（:23 dsh-client-runtime 死行；另证 E-8 peerDeps ^0.1.0-rc.8 ×9 于 :60-69） | client-modules client.js:252-270 ✅（arriveGraphRow `if (dependency !== void 0)` 静默跳过）；dsh-package-manifest 引文真实存在——但实际路径 lib/types/types.d.ts:42-43，清单多写一级 `types/` | ⚠️ 事实成立；锚点路径偏差（→W-1） |
| 6 | G-1/G-2 | bundle patch 机制存续 | cordis.patch.yml:7-11 ✅（router/tool-router 两 insert 行）+ package.json:16-19 ✅ | dsh-app-boot index.js:286-314 ✅（"dsh":{"bundle":{"patch":...}} 声明读取 + dsh.profile.bundles 序组合机制段） | ✅ 一致 |
| 7 | A-7 | subagents.start('spawn') 参数面 | service.js:1469-1470 ✅（start 函数守卫）/:1501-1514 ✅（label/prompt/parent/signal/agentOptions/toolFilter/persona + result/dispose） | spawn-in-process :13 ✅（default 'spawn'）/:42 ✅（registerProvider）；capabilities agentOptions/toolFilter/persona 实际在 :23-29（清单写 :17-28——同文件同事实行号微偏，→S-2） | ✅ 一致（行号微偏） |
| 8 | F-1 | DSH_HOME 推导 | stats.js:313-322 ✅（DSH_HOME 空串视为未设 → ~/.dsh 回退） | dsh-home-paths index.js:73-76 ✅（explicit > $DSH_HOME > ~/.dsh；空串视为 unset :67-68 注释） | ✅ 一致（含空串语义对齐） |
| 9 | ②-1/②-2 机制 | 维护循环 gate 边界 + 30s 轮询 | service.js:2848-2862 ✅（settings/updated 三路 + setInterval tick 不 gate + boot）+ host-route.js:270 ✅（gateWrites = trigger==='llm' && failures>0）+ client.js:5112-5126 ✅（apply() 无条件 setInterval(30000)，effect 卸载清除） | ——（插件侧机制锚点） | ✅ 机制描述与代码一致 |

**抽验结论：编造锚点 0、错位事实 0**；类覆盖 A/B/C/D/F/G 直接核验 + E（E-8 声明面经 package.json 核验），满足并超过硬门槛。

---

## 4. 事实纪律核查表（逐节）

| 节 | 核查内容 | 判定 |
|---|---|---|
| 头部背景事实 | 三条关键背景（client-runtime 缺失 / peerDeps 静默满足 / bundle.patch 存续）均标「Coordinator 机核 + 本文复核」双源 | ✅ 双源标注，本审查独立三证 |
| 2.1~2.7（A~G 63 条） | 每条六字段；✅ 条目均双侧锚点；⚠️ 条目均为「面在、字段级未比对」且指向 T 项；🔴 仅 1 条（D-2）且证据链完整（白名单实读 + subscribe 无校验实读 → 静默失效定性） | ✅ 抽验 9 组零编造；分级标注与证据强度相称 |
| 症状① 归因域 | 3 候选各附机制/双侧证据/置信度/待验证缺口；4 证伪项防确认偏差；①-3 明示「结构性疑点/独立证据不足」 | ✅ 置信度分级有锚点支撑且明示缺口（①-2 前提已被机核证伪——评级滞后见 W-2） |
| 症状② 归因域 | 4 候选同构；②-1「高」的依据（机制唯一性）与缺口（判据未验）同句明示；②-4 如实标「低」 | ✅（②-1 评级滞后见 W-2） |
| 反面证据（10 条） | 逐条附实读锚点；抽验 #2/#10 成立 | ✅ 真实列出，非装饰 |
| Step 3/3.5/3.6/4/5 | Q1~Q4 全答；目标对齐 >30 字（整段，含 126 接触点/14/15 模块实证）；事实依据四分（已验证/🔴/待验证 11/线索边界——历史断裂链显式声明「仅用于排序不作证据」）；架构影响 5 条；risk 候选 5 条 | ✅ 无缺节 |
| 统计节 | 条目总数 63 重构 ✅（14+12+8+8+8+10+3）；⚠️=11「T-1~T-11 对应」口径与逐条标记不一致；28% vs 38/126≈30.2%；「6 条未定级（E-5~E-7）」范围仅 3 条且 E-6 实标 L3；B 类 12 条无分级列与 L1/L2/L3 计数不可互重构 | ⚠️ →W-3 |
| 待验证清单（T-1~T-11） | 每项双侧锚点 + 验证方法 + 影响面；「禁止当作事实引用」红线前置 | ✅ |

---

## 5. Findings 明细（每条带锚点）

### WARNING（3——均非阻断，需在消费/下一轮修正）

- **W-1【锚点路径笔误】** C-8 宿主锚点写 `<host>dsh-package-manifest/lib/types/types/types.d.ts:42-43`，实际文件为 `lib/types/types.d.ts`（多写一级 `types/`；引文 "Informational package-name dependencies, not Cordis service injection" 真实存在于 :42-43）。清单方法论承诺「机器可核查、双侧锚点」，按字面路径核验会 file-not-found。**修正建议**：改为正确路径（设计文档 §0.1 的相对引用 `types.d.ts:42-43` 无此错）。
- **W-2【置信度评级滞后于机核裁决，消费前必须整合】** 候选 ②-1「置信度：高」（清单 L304）与候选 ①-2「中」（L284）的评级基于写作时点未验证的前提；Coordinator 机核已裁决：T-9 前提静态不成立（dsh-llm :2055/:2067 + pi-ai :803-804，本审查复证）→ ②-1 的「probe 恒败→30s 双落盘」主链条失去静态前提；T-2 证伪（api-remotes :5727-5734 逐字段兼容，本审查复证）→ ①-2 前提不成立；T-3 降级 → ①-1 机制收窄为「渲染层访问 schema 外字段」。清单自身的三分纪律无违规（当时确为待验证），但**该清单是 Architect 设计的事实输入——若设计侧按滞后置信度排火力即引入偏差**。**修正建议**：Coordinator 将机核三裁决批注回清单（或随任务流转明示），设计/实施批次的症状②优先序按更新后证据重排。
- **W-3【统计节口径不可重构】** ①「⚠️ 存续但字段级待验证 = 11（T-1~T-11 对应）」——逐条核对 B-1/B-2/F-7/C-8/E-8 带 ⚠️ 而 C-8/E-8 非 T 项；T-4（B-11）/T-5（C-5）/T-7（F-8）所在条目为 ✅+文字注；A-13/C-4/E-6 为 ✅+「待验证」注。②「38 接触点，占全清单 28%」——38/126≈30.2%。③「另有 6 条为外部库/运行时面（E-5~E-7，未定级）」——命名范围仅 3 条且 E-6 实标 L3；B 类 12 条无分级列，24/21/12 的 L1/L2/L3 计数与逐条分级不可互重构。权威待办以 T 表为准（11 项无误），但摘要数字损害「机器可核查」承诺的摘要层。**修正建议**：统一 ⚠️ 标记口径、修正百分比与未定级条目枚举。

### SUGGESTION（2）

- **S-1** 锚点行号微偏两处：A-7 capabilities 实际 `:23-29`（清单写 :17-28——:17-19 为文档注释提及，事实同源）；建议全清单复核一遍行号漂移。
- **S-2** B-2 机制描述「仅做 `groups ?? []` / `failures ?? []` 包装」——实际为 `Array.isArray(...) ? ... : []` 三元守卫（client.js:4940），行为等价（均只挡数组缺失不挡条目字段）但措辞不精确；①-1 机制论证不受影响。

### INFO（2——供 Coordinator 参考，不计入 findings）

- **INFO-1** 本审查独立复证了 Coordinator 三项机核（T-2/T-3/T-9），锚点与结论完全一致——机核事实可作为已裁决事实直接批注回清单。
- **INFO-2** D-2/D-3/D-4/D-5 四个事件键的白名单在列状态经 remote-events.js 全表（19 项）一次核验：仅 D-2 断裂，其余三键存续——与清单 D 类逐条状态一致。

### 违反条目标注

无 P-violation 级 finding：未发现 P1 违规（把待验证写成已证——零例）；W-1/W-3 属锚点/统计精度缺陷，W-2 属证据更新整合义务，均不构成质量原则违反条目。

---

## 6. 复审比对栏

Round 0——无前轮 findings，「已修复/未修复/新引入」比对不适用。

## 7. 边界声明

- 本审查未评估设计文档架构方案优劣（方案 A/B/C、七域划分、批次计划等属并行 Design Reviewer 域）；仅取其 §1.1 四维映射做需求转译闭环交叉参照。
- 抽验为抽样核验（9 组/19 点），非 63 条全量复验；未抽验条目按锚点形态一致性采信。
- 本审查未修改清单/设计文档/产品代码/治理状态；唯一产出物即本文件。
