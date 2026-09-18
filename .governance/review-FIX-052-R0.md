# 审查报告 — FIX-052 R0（Code Reviewer）

**结论：APPROVED_WITH_NOTES** ｜ `unresolved_blockers=0` ｜ 结构化事实：`{"verdict":"APPROVED_WITH_NOTES","unresolved_blockers":0,"p":{"P0":0,"P1":0,"P2":5,"P3":3},"round":0,"task":"FIX-052","commit":"4ac01fa","carrier_files":3,"affected_symbols":{"composedPreset(agent?.ctx)":1}}`

- **round**: 0（首轮，无前轮引用）
- **被审对象**: commit `4ac01fa`（HEAD，未 push）；审查基线 = 工作树三文件全文（Read 逐行，等价 HEAD 态）
- **P0 = 0；P1 = 0** ⇒ 按 code-review SKILL 关闭条件「P0=0 且 P1=0」可合并；无未解决 BLOCKING finding。
- **审查员工具边界（如实披露）**：角色 Bash 禁用 → 未执行 `git show`/`git rev-parse`/测试复跑。逐行审查以工作树全文（Read）+ 全仓 Grep 触点枚举代替 diff 存档（先例：review-FIX-002-R8.md:83 同法）；GREEN 动态结果由 Coordinator 机证（25.7s exit 0）承载，本报告不重复声称。

---

## 一、5 维度逐项结论

| 维度 | 结论 | 事实依据 |
|---|---|---|
| 正确性 | ✅ 通过（附 P2×2） | 解析链三段顺序、LRU 淘汰语义、空值防御、fail-safe 全链逐行读通：`lib/preset-defaults.js:663-671`（identity→fromHeader→live）顺序与设计契约一致；`:214-227` 空值早退 + delete/set 刷新序；`:252-260` 父身份优先；`:642-649` next() 拒绝原样上抛；`:703-704` catch 后原样返回 config。边界核验：`sessionPresetIdentityOf('')`→''、`liveCompassPresetOf` 抛错/缺失→''、`composedPreset` 返回对象形态取 `.id`（`:275`）。P2-1/P2-2 见 §三。 |
| 安全性 | ✅ 通过 | 无网络/无 fs/无 exec 面变更；无密钥硬编码（全 diff 零 secret 字面量）；唯一外部输入 = 宿主事件载荷，全部经 `typeof` 形态门 + `slice` 长度截断（preset 64 / session 48 / detail 160，`:159-172`），Map 键注入无路径语义（键为纯内存 Map）；OWASP A01/A03 面不适用（无权限/注入面）。 |
| 可维护性 | ✅ 通过（附 P3×1） | 新增 4 个函数 8~14 行，均单一职责；归属键权威入口单点（消费方只读 `sessionPresetIdentityOf`）；注释与实现一致（逐条对照 FIX-052 段注释 `:184-260` 与实现，无夸大陈述）；P5 合规：旧「罗盘优先」链已删（telemetry 体零内联 `agentPresetsServiceOf(ctx)`，G3 断言锁定）。P3-1 见 §三。 |
| 性能 | ✅ 通过 | 每请求新增 1 次 `agentPresetsServiceOf(ctx)` 探测（`:146-154`，零缓存但仅属性/get 两次查找）+ 3 次 Map/Set O(1) 操作；Map 命中 O(1) 无新增循环；诊断去重稳态下「每 (kind,会话,归属,罗盘) 恰一条」，不产生 per-request 分配；内存单点有界（1024/256/64）。无 N+1、无 O(n²)。 |
| 测试覆盖 | ✅ 通过（附 P2-5 缺口） | 判别面完备性抽查成立（§二 j 项）：A/B/C 三类扰动 + D1/D2/D3 三桶 + E 有界/空值/去重 + F 端到端真实 StatsStore + G 源码契约；断言面与报障①（novel 子代理入 governance 桶）、②（governance 会话入 standard 桶）逐条对应。缺口 = 子代理「父身份缺失→自身头回落」分支无判别（P2-5）。 |

## 二、AI 生成代码专项 5 项

| 项 | 结论 | 依据 |
|---|---|---|
| mock 残留 | ✅ 无（本 diff 范围内） | 新增测试夹具 stub 的宿主面方法名逐字取自宿主真实导出/方法（`composedPreset`/`agent/created`/`agent-preset/selected`），无「宿主不存在面」的伪方法；`makeRig` 刻意不提供 `agents`/`agentPresets` 属性面（与真实 cordis inject 未含 'agents' 一致，FIX-023 保真纪律） |
| 硬编码返回值 | ✅ 无 | 无 `return true`/桩式常量返回；测试桩的 `composedPreset(){ return state.compassPreset \|\| undefined }` 是**可运行时翻转的判别装置**（非恒真，B2/D3 依赖翻转） |
| 幻觉 API | ✅ 无——宿主锚点 7/7 实读命中 | 逐条实读宿主 checkout 核验（§四 h） |
| 未实现 TODO | ✅ 无 | 全 diff 零 `TODO`/`FIXME`/占位/空实现；退化路径均有实现（非 stub） |
| 过度实现 | ✅ 无 | 变更面严格收敛：归属键 + 解析链 + 诊断 + 判别测试；未顺手重构播种路径（`livePresetOf` 保留罗盘优先且语义不动——正确的范围纪律）；`stats.js` 零触碰 |

## 三、发现列表（P0=0 / P1=0 / P2=5 / P3=3）

| # | 级别 | 位置 | 事实依据 | 影响 | 修复建议 |
|---|---|---|---|---|---|
| F-1 | P2 | `lib/preset-defaults.js:252-260`（`presetIdentityAtCreation` 父身份缺失分支 `:255-257`） | 父身份映射未命中（插件热装/重载后父会话未重发 `agent/created`、或父条目被 LRU 淘汰）→ 静默回落**子自身头 `header.agentPreset`**；而该字段实为父 **live 罗盘**现值——宿主 `childSessionMeta`（dsh-subagent L502-513，实读：`const agentPreset = parent.ctx.get("agentPresets")?.composedPreset(parent.ctx)`）现写 | 该退化路径**无任何诊断**（`notePresetDiag` 零条目），但它是报障①「novel 子代理行入 governance 桶」的同形通道（可变量再次成为归属源且不可观测） | 在 `inherited === ''` 且 `parentSession` 非空时记一条诊断（如 `preset-attribution-inherit-miss`，含 parentSession + 回落值），与 `preset-attribution-live-fallback` 同族；P8 对称性即闭合 |
| F-2 | P2 | `lib/preset-defaults.js:672`（divergence 判据）+ `:682`（fallback 判据） | 判据为 `live && live !== preset` 与 `!identity && !fromHeader && preset`。身份条目被 LRU 淘汰 → `identity=''` 且 `fromHeader=''` 时 `preset=''`：若罗盘同时失配（`live===''`）则**两条诊断都不触发**——淘汰场景的归属降级完全静默（`live` 非空时仅落 fallback 一条） | 观测面在 LRU 淘汰边界出现盲区；非法/失配场景的「归属不猜」结果不可追溯 | 追加 `!identity && !fromHeader && !live` 分支的诊断（kind 如 `preset-attribution-unresolved`），或在 detail 中并入 source 枚举；成本 2~3 行，零行为影响 |
| F-3 | P2 | `lib/preset-defaults.js:195`（`ATTRIBUTION_DIAG_LIMIT = 256`）与 `:637`（`attributionLogged.clear()`）；消费面 `:175`（`PRESET_DIAG_LIMIT = 64` 共享环形） | 去重集满 256 条时整体清空 → 已记签名可**再次**写环；归属诊断与 seed/fixup 诊断共用同一 64 条环形 | 会话 churn 大时归属诊断可能反复冲刷环形，把最近发生的 seed-main/fixup-subagent 观测行挤出（用户在设置页看到的是归属噪声而非配置生效事实）——`:191-194` 注释已披露「有界去重是 P8 与可读性交点」，但未评估与既有 64 环的**互相冲刷** | ①把归属诊断移入独立环形（或按 kind 分组限流），或②`clear()` 改为「保留最近 N 条」的 LRU 式淘汰（`delete(oldest)`），或③降低归属诊断上限；并在注释中写明与 `PRESET_DIAG_LIMIT` 的关系 |
| F-4 | P2 | `tests/fix-052-preset-attribution.mjs`（全 20 断言面） | 逐条读断言语义：D1（:269-283）提供**父身份在场**的继承路径；**无**「父未入映射（映射 miss / LRU 淘汰）→ 回落子自身头」的判别用例 | F-1 的分支无测试看护 ⇒ 后续触及该文件的改动可静默改变退化归属（P-v2 原则 4 防护网缺口） | 补 1 条用例：父 `agent/created` 缺席（或先灌满 `SESSION_PRESET_LIMIT` 淘汰父）→ 子创建 → `agent/request` → 断言归属 = 子头值（并把 F-1 的新诊断纳入断言） |
| F-5 | P2 | `lib/preset-defaults.js:270`（`liveCompassPresetOf(agent, ctx)`） | 形参命名 `ctx` 实为**宿主行 ctx**（用于 `agentPresetsServiceOf(ctx)` 面查找），而 `composedPreset` 的参数是 `agent.ctx`（`:273`）——两 ctx 语义不同却同名同形，注释 `:262-269` 未点明区分 | 误读风险：后续维护者可能误传宿主行 ctx 作为 `agent.ctx`（宿主面语义错误），且 JSDoc 未记录两者的来源差异 | 形参更名（如 `hostCtx` / `rowCtx`）或 JSDoc 补一句「`ctx` = 宿主行 ctx（仅用于服务面查找）；`agent.ctx` 为宿主 agent 作用域 ctx（罗盘匹配键）」 |
| F-6 | P3 | `lib/preset-defaults.js:186` 注释 vs `tests/fix-052-preset-attribution.mjs:412-414` 断言 | 注释写「淘汰后解析侧回落创建头快照」；测试 G1 断言的复算口径是 `composedPreset(agent?.ctx)` **恰 1 处** | 两者互补但未交叉引用；未来若把 G1 断言放宽（如允许 2 处）会同时废掉注释承诺，而注释未指向断言 | 在 `:186` 注释尾补一句「单点守卫 = tests/fix-052 G1」 |
| F-7 | P3 | `lib/preset-defaults.js:157-177` / `:180-182`（既有 `presetDiagnostics`） | `presetDiagnostics()` 返回 `entries.slice()`（数组拷贝）——**条目对象本身仍为共享引用**；本批新增诊断走同一通道 | 非本 diff 引入（既有行为），但新增诊断的面扩大后，消费方误改条目将污染环形 | 随下次触及 `presetDiag` 时改浅拷贝条目（`entries.map(e => ({...e}))`）；本批不阻塞 |
| F-8 | P3 | `lib/preset-defaults.js:184-188`（`export const SESSION_PRESET_LIMIT = 1024`） | 1024 有界下「父条目先被淘汰」约需 >1024 个活跃会话且父不再重发 `agent/created`；重启后 resume 会重播 `agent/created` 重新播种（`:522`） | 现实触发概率低；淘汰后果已有 header 兜底（不猜） | 无需动作，仅登记：若未来宿主改为不重播 `agent/created` 的 resume 路径，需重估 1024 与淘汰回落（届时 F-1 诊断成为关键证据面） |

**P4-violation 核查**：本批未发现违反 project-principles 条目 1~10 的行为；F-1 建议正是 P10-④「测试桩宿主面锚定」与 P8「失败/降级可观测」的补强项，非既有违规。

## 四、重点核验 a~k（逐项独立结论）

| 项 | 结论 | 独立证据 |
|---|---|---|
| **a** 子代理父身份继承载体 | ✅ 成立（附 F-1 诊断缺口） | 载体 = `agent/created` handler 取 `agent.session.header`（`:519`）→ `sessionKeyOf(agent)`（`:294`）与宿主 child 头 `parentSession`（= 父 `parentHeader.id`，dsh-subagent L508 实读）键域**一致**；`childSessionMeta` 头形状三字段（`agentPreset`/`parentSession`/`origin`+`delegationDepth`）与测试 `childAgent` fixture（tests/fix-052 L160-163）同构；回落序（父身份 → 子自身头 → ''）与声称一致（`:252-260`）。父身份缺失分支见 F-1/F-4 |
| **b** LRU 有界性与淘汰语义 | ✅ 成立 | `:214-227` 写入 = `delete`+`set` 刷新序 + `while(size>LIMIT)` 头淘汰；`:230-240` 读命中 `delete`+`set` 刷新（命中刷新序属实）；淘汰后**不写空条目**（`:218` 早退是唯一空值路径）⇒ 解析侧回落 `fromHeader`（`:664-665`），`live` 仅在 preset 仍空时进入（`:668`）——E1（:324-337）以行为级断言实证「淘汰→回落创建头 governance」，与实现推演一致，且不含恒真成分 |
| **c** 诊断去重有界（256）与通道兼容 | ✅ 成立（附 F-3 副作用） | 键 = `kind\0session\0preset\0live`（`:635`），四元组区分度高（session id 与 preset id 不含 NUL）；`>= LIMIT → clear()` 有界（`:637`）防冲刷**本次**；`notePresetDiag` 兼容性 = 新条目复用既有形状（`applied:false` + `preset`/`session`/`detail`，`:159-173`），`presetDiagnostics()` 全量返回 ⇒ 既有消费面（RPC/设置页）形状零破坏，仅新增 kind 值。与 64 条共享环的互相冲刷见 F-3 |
| **d** `composedPreset(` 出现次数 | ✅ 声称核实——**恰 1 处** | 独立 Grep 全仓：`lib/preset-defaults.js` 命中 4 处，其中 3 处为注释（`:106/:246/:264`）、**代码恰 1 处 = `:273`**；测试文件 1 处（L125，rig 桩定义）。G1 断言口径 `composedPreset(agent?.ctx)` 全文件计数 = 1（与实现精确一致，非「≥1」）；telemetry 体内零内联（G3 第二判据 `!/agentPresetsServiceOf\(ctx\)/.test(body)` 亦成立——`:421` 后仅经 `liveCompassPresetOf` 间接调用） |
| **e** 空值不覆盖防御 | ✅ 完备 | `:216-218`：`id`/`value` 非字符串或空 → 不写（含 `''`/`undefined`/`null`/数字/对象全落空→早退）；**不删除既有条目**（无 `delete` 在早退前）；`agent-preset/selected` 面同样走该单点（`:559`）⇒ E2 断言（空串事件不覆盖）与实现一致。边界：非字符串 preset 亦被归一为 ''（防宿主形态漂移） |
| **f** 遥测 fail-safe 保持 | ✅ 保持 | `:642-649`（next() 拒绝 → 记诊断 + **原样 rethrow**，请求链语义不变）；`:650-704` 归因段整体 try/catch，任意异常 → `:703` 吞错 → `:704 return config`（原样交付）。L3/L4/L7/E4 断言面与之一致；新增 `noteAttribution` 自身亦包 try/catch（`:640`）——双保险 |
| **g** 现有预设默认模型行为零变化 | ✅ 成立（静态核验） | 三处证据：①播种解析链 `livePresetOf`（`:285-290`）保持「罗盘 live → header」且 `agent/preset 创建期事实` 段（`:535-539`）逻辑未动；②`agent/created`/`agent-preset/selected` handler 的决策分支（早退序、`sessionNeverProduced`、`modelSet`、`enqueueSeed`）逐行读通与 FIX-032 语义一致，唯一新增为 `:522` 的**纯内存记账**（先于 `isEnabled` 早退——与 D8 热关闭语义（零动作）不冲突，因记账不产生任何宿主面调用/日志）；③`preset-defaults.mjs` 的 A*/B*/C*/D*/E*/F*/G*/H*/I*/J*/K*/M*/N* 断言面无任何一条依赖新增记账（逐条读标签与断言对象）。动态复跑由 Coordinator 机证（ALL 21 SUITES + 4 RUNNER MODULES exit 0）承载 |
| **h** 测试宿主面保真（P10-④） | ✅ 抽查 7/7 锚点真实（零幻觉锚） | 实读宿主 checkout：①`standingMountFor` **L787-793** 实存且体内为 `livePresetMounts().find((candidate) => candidate.key === standingKey)`（L792，逐字相符）；②`composedPreset` **L1550-1552** 实存：`return standingMountFor(agentCtx)?.presetId`（逐字相符）；③`ctx.on("session/event")` → `ctx.emit("agent-preset/selected", session.id, event.data.agentPreset)` **L1325-1328 实存（双参转发属实）**；④`get defaultId()` **L1337-1339** 实存：`return this.settings?.get().default ?? this.config.default`（逐字相符）；⑤`agent.session.append("agent-preset/selected", { agentPreset: preset.id })` **L1749 实存**；⑥`childSessionMeta` **L502-513** 实存，L504 = `parent.ctx.get("agentPresets")?.composedPreset(parent.ctx)`、L508 = `parentSession: parentHeader.id`（逐字相符）；⑦`agentPresetProjectionDefinition`（L1065-1077）证实「重建读 Session 投影、绝不读 header」——测试文件头 L19-42 的锚定叙述与宿主实况一致。锚点全部为**导出名/符号名式**（避开 9h 行号锚守卫，符合任务边界） |
| **i** L9 语义重定正当性 | ✅ 正当，**断言力零损失** | ①旧终态（罗盘优先）已被用户裁决取代，测试语义更新与实现同步属必要；②判别力核验：L9 在旧实现下返回 `'standard'`（罗盘值）⇒ `scopes[0].preset === 'governance'` 断言必败（非恒真）；③L10/L11 在新链下**更强**（header 本就在罗盘之前，断言从「兜底命中」变为「优先命中」）——tests/preset-defaults.mjs:89-91 的自我说明属实；④结论不依赖该文件：新套件 D2/A2/D3（行为级）+ G3（源码顺序）独立承担判别，L9 语义重定无判别力流失 |
| **j** RED 证据方法论与判别力 | ⚠ **部分可核验**：方法论可接受；RED 数字**不可核验**（标「未验证」）；判别力抽查 3/3 成立 | 方法论：临时回退实跑 + `git hash-object` 精确还原——审查员无 Bash（角色禁用）⇒ 无法独立复现 `git show`/hash 核验，该 14 FAIL/1 FAIL 数字标「未验证」（不写成已通过）。判别力抽查（静态推演「旧实现 = 罗盘优先」下断言是否翻红）：①A1（tests/fix-052:174-182）旧实现 preset='governance' ⇒ `preset === 'novel-writing'` 败——**真判别**；②B2（:220-230）旧实现 preset='standard' ⇒ 断言败 + divergence 期望 1 而旧实现只走 header 无诊断 ⇒ 败——**真判别**；③G3（:421-427）旧实现有 2 处 `liveCompassPresetOf`/内联解析 ⇒ 源码顺序或 `inlined` 判据必红——**真判别**；④反例自检：B1（:210-218）为对照（罗盘=身份 ⇒ 零 divergence），不构成恒真断言；无「无条件为真」的 check/step 标签 |
| **k** stats.js 不改的理由 | ✅ 成立（三源佐证） | ①`recordScope(event)`（lib/stats.js:531-559）签名只消费 `{preset, origin, provider, model, at?}`——接受 `sessionId` 无落点、无消费方（`:540` 构造 rec 时白名单化）；②`#foldScope`（:571-597）按 `rec.preset`/`rec.origin` 分流，预设视图不需要会话维度；③落盘契约：`#lineForWrite`（:731，scope 行带 `v:2` 版本门）+ load 端 `#shapeOf` 校验——加字段即触盘面契约，`tests/host-contract.mjs:283` 的字段级白名单为该纪律的机器形态。归属在遥测站点单点决定（`lib/preset-defaults.js:697-702` 只传四字段）⇒ 「不改 stats.js」是**正确的范围纪律**而非省事 |

## 五、范围核验与范围外观察裁定

**范围核验**：✅ 变更面 = 声明三文件（`lib/preset-defaults.js` + `tests/fix-052-preset-attribution.mjs` 新增 + `tests/preset-defaults.mjs` L9/节头）。Grep 触点复核：`composedPreset` 仅命中上述 + 注释；`preset-attribution-*`/`sessionPresetIdentity*`/`SESSION_PRESET_LIMIT` 全仓命中均收敛于三文件（无第四文件引入）；未发现越范围产品代码/测试/文档改动。`tests/fix-031-attribution.mjs` G6/D16b/H7 三条既有正则断言面（readRepo('lib/preset-defaults.js')）逐条比对**未被本 diff 破坏**（`provider: config.provider,` 在位、零 `normalizeAttribution(`/`./stats.js` import/`WRAP_SUFFIX`、`composedPreset(agent?.ctx)` 在位）。`tests/host-abi-health.mjs` 的 `preset-defaults.js` 订阅面断言（L486-487/505-507）亦不被破坏（`ctx.on('agent/created'` 在位、`ctx.on('agent-preset/selected'` 零命中、`subscribeEvents(ctx,` 在位）。

**范围外观察 6 条 —— 仅第 1 条可裁定，其余 5 条不可核验**：
- **#1 `tests/fix-031-attribution.mjs:752` H7 标签语义过期** → 裁定 **后续卫生批（不阻塞本批）**。事实：H7 断言体 = `/composedPreset\(agent?\.ctx\)/.test(presetDefaultsSource)`，标签写「EV-159 live 罗盘优先保持终态」；FIX-052 后该 token 仍存在（单点消费 `:273`）但**语义已从「优先」降为「最后兜底」** ⇒ 标签不实、断言不失效（无判别力损失）。修复面属 `tests/fix-031-attribution.mjs`（**不在本批锁面**）；本任务内强修会把 FIX-052 的 commit 混入无关测试文件（违反「一个 commit 承载一个问题修改」）。建议卫生批把标签改为「归属链单点守卫（罗盘读取单点）」并保留正则。
- **#2~#6**：⚠ **无法核验**——移交清单本体不在任何可读产物中：`.governance/review-FIX-052-R0-input.md:54` 仅列首条，全 `.governance` 树（grep「范围外观察 / Developer 移交 / H7 标签」）除此之外**零命中** FIX-052 的观察清单；`change-triage/FIX-052.json` 亦不含。Coordinator 侧如需逐条裁定，请补移交清单（或指认承载文件）；本报告**不臆测其余 5 条内容**（事实依据红线）。

## 六、硬门槛裁决

| 门槛 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| P1 关键问题数 | = 0（合并条件） | 0 | ✅ |
| 5 维度全覆盖 | 100% | §一 逐项有结论 | ✅ |
| 每条发现标注级别 | 100% | P2×5 + P3×3，均含 文件:行号 + 依据 + 建议 | ✅ |
| 设计一致性检查 | 已完成 | 与用户裁决（归属键 = 会话身份不变量，禁 live 挂载/部署默认）逐条对齐；P5 旧链删除；P8 双降级可观测；P10-④ 锚点实证 | ✅ |
| AI 专项 5 项 | 全部完成 | §二 逐项 | ✅ |

**结论：APPROVED_WITH_NOTES（`unresolved_blockers=0`）** —— 零 BLOCKING finding；F-1~F-5（P2）建议随本任务或下批台账处理，F-6~F-8（P3）登记即可。复验建议（移交 Coordinator）：F-1/F-2 补诊断 + F-4 补判别用例可合并为一次 `lib/preset-defaults.js` + 新测试套件的微批，避免多轮触碰。

（审查员自查：未调用 Write/Edit/Bash/Agent/AskUserQuestion——纯 Read/Grep/Glob；报告全文经消息返回，由 Coordinator 持久化为本文件。）
