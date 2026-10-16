# ARCH-005 R1 设计复审报告（Design Reviewer — 返工逐条比对）

> 持久化说明（Coordinator）：本文件为 Design Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 1 --result APPROVED_WITH_NOTES。复审时间 2026-10-17；审查对象 = 返工后双产出（工作树态，先审后提交）。

- **轮次**: R1（复审）｜前轮引用: `review-ARCH-005-R0-DES-input.md`（R0 结论 NEEDS_CHANGE，4×P1）
- **审查对象**: 返工后 `arch-005-decoupling-design.md`（2026-10-17 修订版）+ 并行返工后 `arch-005-host-diff-inventory.md`
- **方法声明**: 零采信独立实读——双树源码逐锚核验（新树 `C:\Users\peter\AppData\Roaming\npm\...\@deepseek-ai\` / 旧树本仓 `node_modules\@deepseek-ai\` / rc.3 `_npx` 树）+ 本机 node 实跑 semver（新树 semver 实现）+ 7a 正则对实际读取对象的真实匹配模拟。全程只读零写入、本仓零修改。核验锚点约 55 处。

---

## 一、最终结论

## **APPROVED_WITH_NOTES**（unresolved_blockers = 0）

R0 全部 4×P1 + 3×P2（本方）+ 2×P3（本方）**逐条验证为已修复且修复事实锚点全部一手复核通过**；Analyst 侧 P1-4/P2-1/P3-2 三项同样实读确认修复。P3-3 争议仲裁 = **返工方正确、我方 R0 提示失效**（详见第四节）。新发现 1 项 P2（T-6 未吸收进 R4 雷达，非阻塞，见第六节）与 0 项 P0/P1。方案 B 推荐、ARCH-004 零推翻声明、批次依赖序在返工后均成立且事实基础已补齐。

---

## 二、逐条比对表（R0 finding × 处置判定 × 证据）

| R0 Finding | 判定 | 独立核实证据（本轮一手） |
|---|---|---|
| **P1-1** 装载门控缺席 | **已修复** | app-boot 实读逐锚命中：`:286` evaluatePluginCompatibility 签名逐字 / `:289` 无 peerDependencies 早退 / `:294` 前缀过滤 / `:295-299` workspace 特判 / `:300` satisfies+includePrerelease / `:320-322` 警告文案（crash/data-loss + `dsh plugin allow-version`）/ `:421`+`:423` setProfileVersionExemption 需 `--accept-risk` / `:930-931` throw / `:940-945` skippedBundles；**`peerDependenciesMeta` 全文件 grep = 0 命中**（DEC-2 依据成立）；stderr 短语 `:516` 实证 `skipping profile bundle ${JSON.stringify(packageName)}`；semver 复算 `0.2.0-rc.2 vs ^0.1.5-rc.2` = **false**。叙事重写覆盖全部 R0 点名位置（F-H/F-I/§0.2 D1/§0.3 FIX-003/§2-B/§4 第 1 轮 B/§5-1/§7.2/ADR 背景+决策④/DEC-2） |
| **P1-2** F-G 编造锚点 | **已修复**（整条重写为反向事实） | 双树实读：新树 `dsh-llm/lib/index.js` **2390 行**、旧树 **2326 行**；六方法 `:1676/:1687/:1697/:1706/:1718/:1734` + registerAdapter `:1833` **逐行命中**；`:2390` 导出表含 BlockAssembler；types/index.js `export class LlmAdapter` 新 `:141`/旧 `:140`；**exports 字段新旧 JSON 逐字相同**（含初版谎称"新增"的全部子路径——旧树已有）；7c 六方法在新树全部在位（7c 不 miss 确证）。§0.2 D3 与 R0 批引用同步清理核验 |
| **P1-3** 批次依赖序缺陷 | **已修复** | §6 显式 A1~A4 + 依赖序 `R0 → R1 → A1 → A2 → A3 → A4 →（R2、R3 并行）→ R4 → R5` 写死于批次表 + DEC-5 + ADR 后续动作三处一致；breaking 4 显式映射（HD-001→R1+A1 / HD-003→A2 / HD-002→A3 / HD-004→A4）；A2 先于 A3 的验收依赖论证成立（A3 端到端消费 remote.router 描述子，validateCodec `:565` throw 实读在位）；与 Analyst §7 顺序（001→003→002→004）完全一致；「悬空适配任务」引用消灭 |
| **P1-4**（Analyst）schemastery 错值 | **已修复** | 独立实读新树 = **3.18.5**（旧树 3.18.1、dsh 主包声明 `~3.18.4`——satisfies 复算吻合）；Analyst 全篇 7 处 + 修订记录 + T-6 登记全部改齐；§7 建议值含「禁止照抄、实施时单点复读」防再错纪律 |
| **P2-1**（Analyst）A-11 锚 | **已修复** | 实读 `dsh-api-session-controller/lib/index.js:2847` 逐字、`:720` = `async selectModel(request)` |
| **P2-2** F-A「全体 skip」失实 | **已修复** | host-contract `:439-481` 候选链 + `:451` 命中条件逐字核对；`_npx` 实测 7 条目中**恰两树**含 `dsh-api-remotes/lib/client.js`（rc.1/rc.3）；node 模拟排序首命中 = **rc.3 树**——设计「跑在过期 rc.3 副本 + FIX-037 ③ 告警、非全体 skip」与机器现实逐位吻合 |
| **P2-3** T-1~T-5 未挂批 | **已修复** | T-1→A4 前置定性 / T-3+T-5→A3 前置验证 / T-2→R0 后 additive 核对 / T-4→A3 端到端观察项——三处一致挂接 |
| **P2-4** 装载门真机判据缺失 | **已修复** | R1-③ 隔离冷装装载门判据（skip 短语断言 + skippedBundles 形态 + 文案形态，锚点全部实核）；A1 同口径复验 + **判别红演示**；R2 双层口径；且诚实声明 R1 后 apply 期 :237/:305 仍断点——验收边界不越称 |
| **P3-1**「全系」口径 | **已修复** | 头部 + F-B 改为「dsh-* 包全系 0.2.0-rc.2，cordis 4.0.5/schemastery 3.18.5 随树」；scoped 声明实读与 F-B 精确一致 |
| **P3-2**（Analyst）HD-005 表区间 | **已修复** | 实读 `dsh-api-remotes/lib/index.js`：表起 `:17`、止 `);` `:126`、编译面 27 项；§4.2 D-2/D-3 连带同步 |
| **P3-3** 7a 引号形态提示 | **仲裁：返工方正确，R0 提示作废**（见第四节） | 实读 + 正则真实匹配模拟 |
| **P3-4** 六/七方法口径 | **已修复** | `host-contract.mjs:178` LLM_ADAPTER_PROTO_BASELINE（6 方法）/ `:180` ADAPTER_CONTRACT_BASELINE（+stream）——两常量实读与 F-C 统一说明逐字吻合，各司其职非冲突 |

---

## 三、新文本锚点抽核（零采信自报——全部通过）

1. **装载门叙事**：F-H 全部 12 个行锚实读命中；DEC-2「optional 不解除门控」的机制依据（门控只遍历 peerDependencies 键、meta 全文件 0 读取）经 grep 确证。
2. **两 regime semver 复算**（新树 semver 实跑）：`0.3.0 vs ^0.2.0-rc.2` = **false**（gate-block）✓；`0.2.1-alpha.5` / `0.2.0` vs `^0.2.0-rc.2` = **true**（gate-pass-unknown）✓；`0.2.0-rc.2 vs ^0.1.5-rc.2||^0.2.0-rc.2` = **true**（方案 A 过门声明）✓；cordis/schemastery 三式 ✓。
3. **dsh-llm 双树同构断言**：行数 2390/2326、七行锚、导出表、exports 逐字相同——全部精确命中。
4. **A2/A3 宿主先例锚**：`dsh-typert-registry:565` + `dsh-llm-pi-ai:1051` volatile 先例 + `:2490` name 锚——三处逐字在位。
5. **F-D 增量事实**：新树 27 项（单引号面逐项 + 编译面计数双确认）、rc.3 树 19 项（实读）——19→27 纯增量、新增 8 项逐名核对、旧 19 ⊆ 新 27 成立。

---

## 四、P3-3 争议仲裁（本轮指定裁决项）

**仲裁结论：返工方正确；我方 R0 P3-3 的「编译产物双引号→7a 提取为空」提示失效，属错锚文件面。**

依据（三方实读）：
1. `tests/host-contract.mjs:864`——7a 的读取对象是 `hostRead('dsh-api-remotes', 'lib', 'types', 'remote-events.js')`，即 **types 单引号面**；
2. 该文件实读为**单引号形态**（`{ event: 'agent-preset/selected', mode: 'emit' }`），正则 `/event:\s*'([^']+)'/g` 真实匹配模拟 = **27 次命中**——现行 `:865` 正则**能命中，不会因引号形态失效**；
3. 双引号形态确实存在，但在 **`lib/index.js` 编译面**——R0 P3-3 把该面的形态错误泛化到了 7a 的实际读取对象上。

返工方「复核存疑登记不改」+ R0 批注「实施时以靶子实读引号形态为准」的处置正确且保留了恰当的防漂移谨慎。附带核验：靶子刷新后 7a 现行 deepEqual 会因 27≠19 转红——F-D 已如实登记为预期行为，无新问题。

---

## 五、批次表完备性复核 + 需求侧联动落位

- **breaking 4 全承载** ✓；**T-1~T-5 逐项挂接** ✓；**R2 硬依赖 A1~A4** ✓（双处写死）；**与 Analyst §7 修复顺序一致** ✓（A1→A2→A3→A4 ≡ 001→003→002→004，含 A2 先行的验收依赖论证——论证事实锚 `:565` 本轮实核）。additive（HD-006~011）按 SOP 第 2 步分级 + T-2 非阻塞核对——处置合理。HD-005 镜像同步落 R0 批 ✓。
- **F-4/F-5/F-6/F-7/F-8** 五项联动均如实落位，无虚挂。

---

## 六、新发现 Findings（非阻塞）

**NEW-1【P2｜Architect｜R4 雷达未吸收 T-6「主包版本不变 ≠ 树不变」现场证】**
- 位置：§2-B 四维-c 雷达规格 / §6 R4 批 / DEC-3 / §7.2 风险表
- 问题：T-6 是**已发生的活体样本**（2026-10-16 22:50 新树 287 包整树原地重写、dsh 主包版本串不变、schemastery 3.18.4→3.18.5、零 npm CLI 日志留痕）。设计 R4 的触发条件 = `dist-tags` 比对**主包**版本 →「发现新版本即触发 probe-mode」——T-6 形态事件（主包版本稳定、嵌套树静默重写）**永不触发**。现有部分缓解：host-version-snapshot 断言含 cordis/schemastery 键 + R3 CI matrix 精确 pin + integrity + 运行面 FaceHealth 降级可见——故雷达层盲区为**结构性但不致命**。
- 建议（随 R4 批实施前吸收，一段话级修改）：R4/DEC-3 补「probe-mode 周频无条件运行（或雷达附加已发布版本树包表 diff 比对档案）」，或在 §7.2 显式登记该残余风险并声明本地快照断言为唯一缓解。

---

## 七、硬门槛与 P-violation

- 候选方案 3 ✓；ADR 字段完整 ✓（背景段已按装载门事实重写，实核无残留「零 enforcement」旧叙事）；蓝军 3 轮 ✓（第 1 轮 B 已按两 regime 修正）；无循环依赖 ✓；独立评审 = 本报告（R1）。
- 本轮 **0 项 P0/P1**；P-violation 新增登记：无（NEW-1 为完备性建议级）。

## 复审判定汇总

- R0 findings 处置：**11/11 已修复**（含 Analyst 侧 3 项）+ P3-3 仲裁返工方胜；**未修复 0 / 部分修复 0 / 新引入 0**。
- 结论 **APPROVED_WITH_NOTES**，`unresolved_blockers = 0`；唯一跟踪项 = NEW-1（P2，建议 R4 批实施前吸收，不阻塞 §6 依赖序任何一批启动）。
