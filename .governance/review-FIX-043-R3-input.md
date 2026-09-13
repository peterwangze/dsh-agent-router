# 代码审查报告 — FIX-043 批 C（R3）

- **Task ID**: FIX-043（批 C：lib 面锚族清扫 + R1 P2-2/P2-3 收口）
- **Round**: **R3**（前轮 = `.governance/review-FIX-043-R1.md` / `review-FIX-043-R1-input.md`（批 B，APPROVED_WITH_NOTES / `unresolved_blockers=0`）与 `.governance/review-FIX-043-R2.md` / `review-FIX-043-R2-input.md`（批 E，同终态））
- **轮次语义**: **非 NEEDS_CHANGE 触发的复审**，而是「批 E 通过终态之后、新工作单元（批 C）的新一轮完整审查」。本批被 R1 明确指派收口 **P2-2 / P2-3**；R2 **P2-2**（「宿主靶子不可稳定符号化」总括断言）与本批 P2-3 同族，其收口动作落在批 F（本报告 §2.4/§3 逐项落判）。
- **审查对象**: commit `2ea0bc905a0d0f9312fe4fe11f7afbb6cedbcca7`（短号 `2ea0bc9`；父 = `cfe7756` = 批 E；提交时间 2026-09-13 11:16:42 +08:00）
- **并行交付边界（MUST 遵守，已执行）**: 批 D（tests 面）commit **`ce8d908`** 是 `2ea0bc9` 的**子提交**，**不属于本批**。独立实测 `git diff --name-only 2ea0bc9 ce8d908` = **9 个 tests 文件**（`adapter-parity` / `client-render` / `fix-010-gui-fidelity` / `fix-012-image-takeover` / `fix-029-host-contract` / `metrics` / `oauth-main-model` / `run-all` / `smoke`），与本批 11 文件**零交集** ⇒ 本报告**仅就 `2ea0bc9` 落判**，批 D 变更未计入、未被据以判红、亦未算作本批越界。
- **审查者**: Code Reviewer Agent（只读；唯一写操作 = 本文件）
- **审查范围（`--numstat` 实测，与声称逐数吻合）**: **11 文件 +108/−59** —— `lib/oauth-llm.js` 16/13、`lib/index.js` 8/6、`lib/prestep.js` 14/2、`lib/oauth-credentials.js` 2/2、`lib/host-abi/client-remotes.js` 3/3、`lib/service.js` 10/0、`lib/host-route.js` 3/2、`lib/host-abi/events.js` 4/4、`lib/wrapper.js` 8/7、`lib/client.js` 20/10、`tests/served-client.js` 20/10
- **审查时间**: 2026-09-13 ≈11:18–11:27 +08:00（单次时钟采样 11:25:57）
- **结论**: **APPROVED_WITH_NOTES**
- **`unresolved_blockers=0`**

---

## 0. 结论与硬门槛裁决

| 硬门槛 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | **0** | 通过 |
| 5 维度全覆盖 | = 100% | 5/5（§4） | 通过 |
| 每条发现标注级别 | = 100% | 6/6（§6） | 通过 |
| 设计一致性检查 | 已完成 | 已比对 `arch-004-compatibility-design.md` §5.1(a) 与 project-principles P4/P5/P8/P9/P10-④（§7） | 通过 |
| AI 代码专项 5 项 | 全部完成 | 5/5（§5） | 通过 |

**结论 `APPROVED_WITH_NOTES` / `unresolved_blockers=0`**。

- **无 P0、无 P1**；硬门槛全通过。
- **R1 两项被指派遗留全部实质性闭合**（§3）：**R1 P2-2 = 已闭合（取 (a)，裁定经本审查独立实读复现成立）**；**R1 P2-3 = 已闭合（5 处裸锚逐处逐类判定全部属实）**。
- **Developer 声称 1/2/4/5/6、M4 = 全部独立复现吻合**（§1）；**声称 3、9 亦逐条落判成立**（§2.3、§1.7）。
- **本批最大风险面（证据对象裁定 + 逐处语义重判）经 15 处宿主/在仓对象只读实读逐字核验，零幻觉、零事实错误**（§2.5）；全部改写后的句子真值与对象一致。
- **唯一 P2 = 交付物的下游依赖**：`ANCHOR_CASES` 需求清单 A~J 的**条目值不在仓库内任何载体**（仅 commit message 指向「交付报告」、evidence-log EV-197 只登记「清单存在」未载值）⇒ **本审查无法逐条核验其 stale/fresh 值**，且批 F 的唯一输入仅存于会话消息（§6 P2-1）。本报告另行提供**独立重建的批 F 覆盖要求表**（§2.4）供交叉核对。
- 全部门控与变异实验**在仓库外隔离副本**执行并**逐字节复原**（§8）；受审前后仓库工作树**逐字不变**、`HEAD` 全程不变（§9）。

> 说明：本批**未被降标审查**——含**产品代码（`lib/**`）注释/锚改写**与**证据对象裁定**两个实质面，故 22 项逐处判定全部与宿主/在仓实体逐字比对，另对两处「刻意保留」做了判据承载性与对象存在性的独立取证。

---

## 1. 独立复算（不采信 Developer 数字）

### 1.1 声称 1 — 口径 a（9 文件 + `lib/client.js`）【三时点逐数吻合】

口径（commit message 声明原文，**内容口径**）= `git grep -nE '([A-Za-z0-9_./-]+\.(js|mjs)):[0-9]+(-[0-9]+)?' -- <文件>`，**剥 `git grep -n` 行使前缀伪匹配**后按**匹配次数**计（本审查实现 = `git grep -oE` 同正则、按输出行数计，输出前缀为 `file:` 故无自匹配噪声）。

| 时点 | 9 文件 | `lib/client.js` | 本审查实测 | 裁决 |
|------|-------|-----------------|-----------|------|
| `813c4a9`（批 A） | 19 | 12 | **19 / 12** | ✅ |
| `cfe7756`（批 E = 批 C 父） | 19（不变） | 0 | **19 / 0** | ✅ |
| `2ea0bc9`（本批） | **2** | 0 | **2 / 0** | ✅ |
| 工作树（含批 D） | 2 | 0 | **2 / 0**（批 D 未触 `lib/**`） | ✅ |

**9 文件 @`813c4a9` 逐文件分解（本审查独立计数，与声称逐字相同）**：`oauth-llm.js` **5** / `index.js` **3** / `prestep.js` **3** / `oauth-credentials.js` **2** / `host-abi/client-remotes.js` **2** / `service.js` **1** / `host-route.js` **1** / `host-abi/events.js` **1** / `wrapper.js` **1** = **19** ✅。

**@`2ea0bc9` 余 2 的归属（本审查逐文件实测）**：`lib/prestep.js` = **1**（⑩ `types/agent.js:297-318` 判据承载锚，刻意保留）、`lib/service.js` = **1**（⑭ `dsh-host-apiproxy lib/index.js:1010-1054`，对象已消失，保留 + 登记）；其余 7 文件 = 0 ✅。

> ⚠ **与 commit message 的一处口径不一致 → §6 P3-1**：commit message「交付后 @工作树：9 文件 = **1**（仅 prestep.js 判据承载锚）」与实测 **2** 不符，且与其自身 ⑭ 条目（明载 service.js 保留原文）**自相矛盾**。Developer 面向 Coordinator 的声称（**2**）为**正确**者。

### 1.2 声称 1（附）— 口径 b（FIX-041 R0 F-3 三形态，仅 `lib/client.js`）【40/24/17 与 ③ 7→0 逐数吻合】

正则**逐字取自** `tests/host-abi-health.mjs:781-782`（非本审查自拟）；按**匹配次数**计：

| 时点 | ① 文件:行号 | ② `L###` | ③ 裸 `:NNN` | 合计 | 声称 | 裁决 |
|------|-----------|---------|-----------|------|------|------|
| `813c4a9` | **12** | **17** | **11** | **40** | 40〔12/17/11〕 | ✅ |
| `cfe7756`（批 B 后） | **0** | **17** | **7** | **24** | 24〔0/17/7〕 | ✅ |
| `2ea0bc9`（本批后） | **0** | **17** | **0** | **17** | 17〔0/17/0〕 | ✅ |
| 工作树 | 0 | 17 | 0 | 17 | — | ✅ |

**③ 7 token / 5 行的逐处取值（@`cfe7756`，本审查逐行扫描）**——与声称「5 行 7 token」**逐数吻合**，且本批**全部清除**：

| 行 | 内容 | token |
|----|------|-------|
| `:2138` | `// （同表 :21，凭据引用变化转发事件）。` | 1 |
| `:4310` | `// ui-conversation :16041-16056）。imageIds 改经 hook 快照读取；typeof` | 1 |
| `:5453` | `// （dynamicCordisContext 属性访问按 fiber.inject 声明门控，:313-314/:342）。` | 2 |
| `:5561` | `// （generation 守卫，宿主 :47/:53）、从 session.models 重拉并写 store` | 2 |
| `:5562` | `// 快照，composer 模型选择器经 uSES 订阅该 store（宿主 :292）→ load 完成` | 1 |

⇒ **③ 7 → 0 成立**（@`2ea0bc9` 全文 ③ 匹配 = **0**，零残留）。

### 1.3 声称 9（前半）— 9 文件三形态存量化与「零新增」【成立，且存量登记穷举比对无遗漏】

对 9 文件逐文件、三形态、三时点独立计数（`form1/form2/form3`）：

| 文件 | @`813c4a9` | @`cfe7756` | @`2ea0bc9` |
|------|-----------|-----------|-----------|
| `lib/oauth-llm.js` | 5/0/3 | 5/0/3 | **0/0/0** |
| `lib/index.js` | 3/0/0 | 3/0/0 | **0/0/0** |
| `lib/prestep.js` | 3/2/0 | 3/2/0 | **1/2/0** |
| `lib/oauth-credentials.js` | 2/0/3 | 2/0/3 | **0/0/3** |
| `lib/host-abi/client-remotes.js` | 2/0/1 | 2/0/1 | **0/0/1** |
| `lib/service.js` | 3/2/1 | 3/2/1 | **3/2/1** |
| `lib/host-route.js` | 1/0/5 | 1/0/5 | **0/0/4** |
| `lib/host-abi/events.js` | 1/0/1 | 1/0/1 | **0/0/0** |
| `lib/wrapper.js` | 1/0/4 | 1/0/4 | **0/0/1** |

- **「本批新文本保证零新增 ①②③ 匹配」成立**：三形态在 9 文件上的**逐格差值均 ≤ 0**（无任何一格上升）✅。
- **口径 a（仅 `.js`/`.mjs`）与 form1（含 `.ts`）的 2 项差额可定量归因**：`service.js` form1 = 3 而口径 a = 1，差额 = **`transport.ts:22` ×2**（已在存量登记中列明）✅。
- **@`2ea0bc9` 存量残量穷举（本审查实测，共 18 token）**：form1 **4**（`prestep.js` 1 = ⑩ 保留、`service.js` 3 = ⑭ 保留 1 + `transport.ts:22` ×2）；form2 **4**（`prestep.js` `L520`/`L343`、`service.js` `L719-722`/`L270`）；form3 **10**（`oauth-credentials.js` `:145-174`/`:175-227`/`:429`；`client-remotes.js` `:124-125`；`service.js` `:2582-2594`（⑭ 同句）；`host-route.js` `:1714`/`:2408`/`:803`/`:768-775`；`wrapper.js` `:1568`）。⇒ 与声称 9 的登记清单**逐项一一对应、零遗漏**（详见 §1.7）。

### 1.4 声称 5 — 镜像字节恒等【成立，四重证据】

| 项 | 声称 | 本审查独立实测 | 裁决 |
|----|------|---------------|------|
| `git hash-object`（两侧） | 同 `03cad685` | 均 = **`03cad68596520645315dcf31447232ce77560c4e`** | ✅ |
| blob 相等（最强证据） | — | `git rev-parse 2ea0bc9:lib/client.js` = `2ea0bc9:tests/served-client.js` = 同上；父 `cfe7756` 两侧同为 `7913db8c…` | ✅ |
| SHA256（工作树两侧） | 同 `6836C5C0…712E` | 均 = **`6836C5C0E7D0E89B74D938246FCB9837019330D09CC4CEB79B910419EF7A712E`** | ✅ |
| size | 397488 | 两侧均 **397488 B** | ✅ |
| `git diff --no-index` | exit 0 | **exit 0** | ✅ |
| 守卫 §3 | 绿 | `host-abi-health.mjs` 基线实跑 **178 断言 exit 0**（含 `served-client mirror stays byte-identical to lib/client.js`） | ✅ |
| 行尾族系 | 工作树 CRLF 5715 = 批前 LF 5705 + 净增 10 行 | blob `2ea0bc9` = **391773 B**、CRLF 实测 **5715**；`391773 + 5715 = 397488` ✅；父 blob 390850、批 B 工作树 396555 ⇒ `396555 − 390850 = 5705` ✅；`5715 = 5705 + 10`（`lib/client.js` 净增行 = 20−10） | ✅ |

### 1.5 声称 6 — 门控 / 断言 / `#SKIP`【逐数吻合】

| 项 | 声称 | 本审查独立实测 | 裁决 |
|----|------|---------------|------|
| `node tests/run-all.mjs` | exit 0 ×4（22.3/22.3/23.1/22.6s） | **exit 0**（24.7s，仓库内实跑；受测树 = `ce8d908` 工作树） | ✅ |
| 汇总行 | `ALL 20 SUITES + 4 RUNNER MODULES PASSED` | `ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (24.7s)  #SKIP 2 (smoke.mjs×2)` | ✅（"via smoke.mjs" 段在 `2ea0bc9` 的 `run-all.mjs` 中**已存在**——本审查实读该修订 blob，`console.log` 模板逐字含 `(via ${SMOKE_SUITE})`；声称系**节引**，非不实） |
| `#SKIP` | 2 | **2**（`smoke.mjs`：`0o600 POSIX` / `POSIX online checks`） | ✅ |
| `tests/host-contract.mjs` | **118** exit 0（本批未改该文件） | **仓库外副本 @`2ea0bc9` 全树实跑 = 118 断言 exit 0** | ✅ |
| `tests/host-abi-health.mjs` | **178** exit 0（本批未改该文件） | **同副本 = 178 断言 exit 0** | ✅ |
| 工作树零改动 | — | 受审前 / 受审后 `git status --short` **逐字相同**（`.governance/**` 三类 M + 六份 FIX-043 报告 `??`）；非 `.governance` diff = **0**；`HEAD` 全程不变 | ✅ |

### 1.6 声称 7 — 仓库外副本变异 M1–M4【M4 独立复现，且以**更强变异**加证】

副本：`%TEMP%\fix043r3-c`（`git archive 2ea0bc9` 展开 = **403 文件** + `node_modules` junction 指向本仓），**全部变异在副本内**、逐次以 `git hash-object` 与修订 blob 比对复原（`lib/oauth-llm.js` 基线/复原 hash 均 = `30901622786292fdceb848323cd3344cdf1c2c7a` = `2ea0bc9` blob）✅；副本已清理。

| # | 变异（本审查执行） | 结果 | 裁决 |
|---|-------------------|------|------|
| 基线 | 副本 @`2ea0bc9` 未变异 | `host-abi-health` **exit 0 / 178**；`host-contract` **exit 0 / 118** | ✅ |
| **M4-a（= 声称 M4 同形）** | 把本批清除的锚 `lib/index.js:254-258` **单点写回** `lib/oauth-llm.js`（合法 JS 注释行；`node --check` exit 0） | `host-abi-health` **exit 0 / 178**；`host-contract` **exit 0 / 118** ⇒ **未判红** | ✅ **与声称逐数一致** |
| **M4-b（本审查加固，超越声称）** | 把 `lib/oauth-llm.js` **整体回退**至 `813c4a9`（= 复原该文件**全部**批 C 改动：5 个 form1 + 3 个裸锚） | 仍 **health exit 0 / 178 + contract exit 0 / 118** ⇒ 该文件的批 C 改动**整体不受机器看护** | ✅ 结论**更强**且同向 |
| 复原 | 逐字节回写 `2ea0bc9` blob | `hash-object` = 基线值；health **exit 0 / 178** | ✅ |

**「该锚此刻确实不受机器看护」的静态确证（不依赖变异）**：`tests/**` 全域搜索『254-258 / 1123-1128 / 430-436 / 4803-4806 / 4832-4835』= **零命中**（唯一近邻命中为 `tests/fix-029-host-contract.mjs:18` 的 `:16041-16056`，见 §2.4 风险 (7)）；`lib/oauth-llm.js` 的 `ANCHOR_CASES` 条目（`host-abi-health.mjs:887`）仅登记 `stale: ['runCodexResponsesChat :2906-2929']` / `fresh: ['`runCodexResponsesChat`']` ⇒ **本批清除的锚零登记、零 needle**。⇒ **M4 的描述准确，属如实披露**（据此判红将属误判——本审查未如此判）。

> **副产品（对测试覆盖维度的正面证据）**：本审查首次 M4 尝试因误插入非法 `*` 起首行而使 `host-contract` **exit 1（Node 崩溃）** ⇒ 反证 `tests/host-contract.mjs:69 import { createOauthAdapter } from '../lib/oauth-llm.js'` 构成该文件的**语法级耦合**（注释改动若破坏语法即被门控捕获）；该次尝试的输入已丢弃、未计入结论。

### 1.7 声称 9（后半）— 口径外存量登记【穷举比对：**零遗漏、零虚列**】

本审查对 @`2ea0bc9` 的 9 文件残量**逐 token 实测**（§1.3），与声称清单逐项比对：

| 声称登记项 | 实测位置（本审查） | 裁决 |
|-----------|------------------|------|
| `prestep.js §5.3 L520` | `lib/prestep.js:48`（form2 `L520`） | ✅ 存在 |
| `wrapper stream L343` | **实体在 `lib/prestep.js:260`**（`与 wrapper stream L343 语义对齐`），**非** `lib/wrapper.js`（其 form2 = 0） | ✅ 残量存在，归属表述可再精确 → §6 P3-4 |
| `oauth-credentials.js :145-174`·`:175-227`·`:429` | 同（3 处，form3） | ✅ 全中 |
| `client-remotes.js :124-125` | 同（1 处，form3） | ✅ |
| `service.js dsh-fs-local L719-722`·`downloadToWorkspace L270`·`transport.ts:22`×2 | `:719-722`/`:270`（form2）+ `transport.ts:22` ×2（form1） | ✅ 全中 |
| `host-route.js :1714`·`:2408`·`:803`·`:768-775` | 同（4 处，form3） | ✅ 全中 |
| `wrapper.js :1568` | `lib/wrapper.js:393`（form3） | ✅ |
| （另：`service.js` 的 `（:2582-2594`） | 已并入 ⑭「保留 + 登记」 | ✅ |

⇒ 存量登记**穷举且准确**；结合 §1.3 的「零新增」，声称 9 成立。

### 1.8 声称 2 — 逐处判定索引（22 项）的**位置列准确性**【抽查 16 项，全部逐字命中】

对本审查就 `cfe7756`（批前树）逐行实读索引所载位置，锚文本**逐字在位**：

| 索引项 | 位置（批前树） | 实读内容摘要 | 裁决 |
|--------|--------------|-------------|------|
| ① | `oauth-llm.js:231` | `…——dsh-system-prompt lib/index.js:254-258（tool provider schemas` | ✅ |
| ② | `:232` | `解构 + structuredClone）+ dsh-llm-pi-ai lib/index.js:1123-1128（官方 adapter` | ✅ |
| ③ | `:313` / `:328` | `imageRequestPricing（FIX-034 补齐，宿主 lib/index.js:1645 原型新增）` / `lib/index.js:1645，语义与…` | ✅ 两处 |
| ④ | `:333` | `（宿主 lib/index.js:1996-1998）经 adapters.get(provider).adapter.` | ✅ |
| ⑤⑥⑦ | `index.js:84` / `:86` / `:90` | `（register，lib/index.js:128-135）` / `（lib/index.js:269-279）` / `lib/attachments.js:38` | ✅ |
| ⑧⑨ | `prestep.js:14` / `:69` | `vision-router index.js:4803-4806` / `vision-router 同款取舍，index.js:4832-4835` | ✅ |
| ⑪ | `oauth-credentials.js:52` / `:99` | `pi-ai openai-codex.js:30 …` / `openai-codex.js:31 …` | ✅ |
| ⑫⑬ | `client-remotes.js:15` / `:295` | `PROVIDER lib/client.js:36 镜像先例` / `settings-models lib/client.js:889-911 joinProviderDirectory` | ✅ |
| ⑮ | `host-route.js:21` | `- settings.mutate：dsh-settings lib/index.js:430-436 …`（裸 `:439-470` 在 `:22`） | ✅ |
| ⑯ | `events.js:45` | `remote-events.js:12-32 实读 19 项`（裸 `:21` 在 `:46`） | ✅ |
| ⑰ | `wrapper.js:341` | `lib/index.js:1645）——签名 imageRequestPricing(_provider, _model)，` | ✅ |

⇒ **位置列准确**（引用的是**批前树**位置；索引未标时点 → §6 P3-3）。

### 1.9 声称 10 — Developer 的真实环境 R4 逐条上报【未复核，如实登记】

本审查**无其会话内命令级记录**，不对其 §7 的 14 条上报做核验（R4 义务主体 = 执行者；同 R1/R2 口径）。本报告 §9 仅登记**本人**的接触面。

---

## 2. 专项复核

### 2.1 【关键】R1 P2-2 裁定核验 — 取 (a)「恢复原证据对象」【**裁定成立，逐字复现**】

R1 P2-2 的事实面 = 原锚（settings-models）**准确**、但被替换为**命名空间不同**的 model-selection 证据。批 C 取 **处置 (a)**：恢复原证据对象并符号化去行号，model-selection 引用降为**追加**且写明「命名空间不同，不替代」。逐项实读（宿主 `@deepseek-ai` 靶子，**只读**）：

| 断言（批 C 新文本） | 宿主实读（本审查） | 裁决 |
|---------------------|------------------|------|
| `ctx.remote.llm.listProviders()` 调用面 | `dsh-client-ui-settings-models/lib/client.js:991-992` = `const [registered, declared] = await Promise.all([` + `this.ctx.remote.llm.listProviders(),`（后随 `…listConfigurableProviders()` / `describeFace.ensure()`） | ✅ **真**（调用点写作 `this.ctx.remote.llm.…`；文本用 `ctx.remote.llm.…` 系同方法同命名空间的简写 → §6 P3-2） |
| `createModelsOperations(ctx)` 绑定三命名空间 | `:2585 function createModelsOperations(ctx) {`（体至 `:2625}`）；JSDoc `:2581-2582` 逐字写 `declares \`remote.credentials\`, \`remote.llm\`, and \`remote.settings\` in its own \`inject\`` | ✅ |
| `remote.credentials` 读写 | `:2588 ctx.remote.credentials.describe([ref])`、`:2592 ctx.remote.credentials.set(ref, value)`、`:2596 ctx.remote.credentials.unset(ref)` | ✅ **三处逐字** |
| `remote.settings.mutate` | `:2600 ctx.remote.settings.mutate(ns, ops, expectedRevision)` | ✅ |
| `remote.llm.discoverModels` | `:2615 ctx.remote.llm.discoverModels(settingsNs, request)` | ✅ |
| 「恰为同句并列声明的三命名空间消费面」 | `describe/set/unset` → `credentials`；`mutate` → `settings`；`listProviders`/`discoverModels` → `llm` ⇒ **三命名空间全覆盖且无第四者** | ✅ **成立** |
| model-selection 两引用「属不同命名空间」 | `dsh-client-ui-model-selection/lib/client.js:46 this.ctx.remote.session.modelCatalog()`（= `remote.session`）；`:917`/`:940 const models = scope.modelDirectories;`（= `modelDirectories` **服务**，来自 `ctx.inject(["commandUi","modelDirectories"], …)` / `ctx.inject(["slots","modelDirectories"], …)`）⇒ 二者**均不属** `remote.credentials/llm/settings` | ✅ **成立** |

⇒ **R1 P2-2 裁定 (a) 正确且证据充分**；新文本「`后两者属 modelDirectories 服务与 remote.session（命名空间不同），作追加证据保留，不替代上句三命名空间的证据对象`」**与实况逐字相符**。**判「已闭合」。**

### 2.2 R1 P2-3 — 5 处裸锚逐处重判【**5/5 属实**】

| 索引 | 原裸锚 | 批 C 判定 | 本审查独立实读 | 裁决 |
|------|-------|----------|---------------|------|
| ⑱ | `client.js:2138` `（同表 :21，…）` | **准确** | `dsh-api-remotes/lib/types/remote-events.js:12 export const API_REMOTE_FORWARDED_EVENTS = [`，`:21 = { event: 'credentials/reference-updated', mode: 'emit' },`（全表 **19** 项，`:13..:31`） | ✅ 准确，且新文本「`在该表条目内`」避开了超短裸锚 |
| ⑲ | `client.js:4310` `ui-conversation :16041-16056` | **不准**（对象在 `uiSession.provide`） | `dsh-client-ui-conversation/lib/client.js:16041-16056` = `claimActive`/`placeholderText`/`jsxs("div", {className: clsx(InputBar_module_css_default.root…` ⇒ **InputBar JSX**；真实注入面 `:16593 ctx.uiSession.provide({ hooks: ["conversation", "input"], props: ["inputActions"], … })` | ✅ **不准成立**；新代码串式与实体逐字对应（除引号形态 → §6 P3-2） |
| ⑳ | `client.js:5453` `:313-314/:342` | **准确** | `dsh-cordis-client-runner/lib/client.js:312-314` JSDoc（`direct \`ctx.serviceName\` access is gated by the fiber's \`inject\` declaration`）、`:342 return readService(prop, true);` | ✅ 准确 |
| ㉑ | `client.js:5561` `:47/:53` | **漂移** | `dsh-client-ui-model-selection/lib/client.js`：`generation === this.generation` 实位于 **`:48` / `:55` / `:61`**（`:47` = `if (!response.ok) throw …`、`:53` = `return response.value;`） | ✅ **漂移成立**；新式写作 `generation === this.generation 守卫`（可符号化形态） |
| ㉒ | `client.js:5562` `:292` | **不准** | `:290-295` = `directoryFor` 的 **JSDoc**（`:296` 才是 `directoryFor(sessionId) {`）；真实订阅点 = `:128 catalog.store.subscribe`、`:131 projected.subscribe`、`:314 directory.store.subscribe`、`:409 react.useSyncExternalStore((fn) => directory.subscribe(fn), …)` | ✅ **不准成立**；新式写作 `宿主 directory.store.subscribe + ModelSelect 的 uSES 订阅`（均可符号化） |

**「未再使用『不可稳定符号化』类无实证措辞」核验**：全 11 文件搜索 `不可稳定符号化` = **零命中**；该措辞现仅存 **1 处**，位于 `tests/host-abi-health.mjs:878`（批 E 遗留，**不在本批锁面**，属 R2 P2-2 的收口项，已列入 A~J 清单 note 交批 F）⇒ **批 C 未复述、未扩散该措辞** ✅，且**为 `:5561/:5562` 提供了可符号化的处置实证**（正是 R1 P2-3 建议的方向）。

### 2.3 两处刻意保留的正当性【**两处均正当**】

**(A) ⑩ `lib/prestep.js`（锚文本现位于 `:152`）——判据承载 ⇒ 保留原文**

| 主张 | 独立核验（只读） | 裁决 |
|------|----------------|------|
| `tests/host-contract.mjs` S2 `extra.signatures` 以本串作跨文件逐字在位断言 | `:335 extra: [{ file: 'tests/fix-029-host-contract.mjs', signatures: ['types/agent.js:297-318', "key === 'modelSelection'"] }]`；`:638-641` 消费：`const source = readFileSync(join(ROOT_DIR, extra.file), 'utf8')` + `extra.signatures.filter((s) => !source.includes(s))` ⇒ **判据对象 = `tests/fix-029-host-contract.mjs`** | ✅ 属实 |
| 同串亦在对象文件内 | `tests/fix-029-host-contract.mjs:7` = `//   controller types/agent.js:297-318）首层 = picked，由 durable` | ✅ 属实 |
| 判据与对象侧均在 tests 面、不在本批锁面 | 本批 11 文件不含任何 tests 文件（除镜像 `tests/served-client.js`） | ✅ |
| 锚现值与对象语义相符（故保留无事实风险） | `dsh-api-session-controller/lib/types/agent.js`：`:289 selectionFor(agent)`、`:293 stateOf(agent.session, 'modelSelection')`、`:297-299 picked = projectionState.pending …`、`:300-307` 回退链 `loggedHeader` → `defaultModel.currentSelection()` | ✅ **准确** |
| 处置措辞准确性（关键） | 批 C 原文写「**单侧去行号会造成三处形态不一**」（==不会使断言判红的表述），**未**声称「去行号即判红」——与实测语义（needle 对象是 fix-029，非 prestep）**一致** | ✅ 措辞精确，**无超宣示** |

⇒ 保留**正当**（判据绑定 + 三处同步纪律），且**未虚构任何理由**。

**(B) ⑭ `lib/service.js:1325`（+ 同句裸 `:2582-2594`）——对象已消失 ⇒ 保留原文 + 显式登记**

| 主张 | 独立核验（只读） | 裁决 |
|------|----------------|------|
| `dsh-host-apiproxy` 在靶子不存在 | `Test-Path …\node_modules\@deepseek-ai\dsh-host-apiproxy` = **False**；同级包目录枚举 = **240** 项（无该名） | ✅ 属实 |
| 原文两处行号锚均在位（保留而非删除） | `lib/service.js:1325` = `（dsh-host-apiproxy lib/index.js:1010-1054，resolveModelInfo 拿到的`；`:1327` = `仅 {provider,model,reasoningEffort?}（:2582-2594）；llm.providers 仅 provider` | ✅ |
| 新增登记块的事实陈述 | `:1330-1338`：两处行号锚、包不存在、按 P10-④ **不引入替代包名、不做语义改指（无同源实证）**、随宿主装态复核 | ✅ 与实测一致 |
| 与 Coordinator 规则一致 | 派发规则明载「对象已消失 ⇒ **保留原文 + 显式登记**，**未静默改指**」⇒ 处置**依令**；且与 R1/R2 对 `dsh-host-apiproxy` 的三次独立实证一致（本审查为第四次） | ✅ 合规 |

### 2.4 `ANCHOR_CASES` 需求清单（A~J）质量裁定 —【**条目值不可核验；结构面已核验并给出批 F 硬要求**】

**(0) 可核验性（事实依据红线适用）**：本审查对仓库全域搜索 `ANCHOR_CASES 需求` / `A~J` / `交批 F` / `批 F 接线` = **零命中**；commit message 明写「ANCHOR_CASES 需求（交批 F 统一接线，**见交付报告**）」；`evidence-log.md` EV-197 仅登记「**交付物 = `ANCHOR_CASES` 需求清单 A~J（交批 F）**」**未载任何条目值**。⇒ **清单本体（10 条的 stale/fresh 值）不在仓库内任何载体**，**本审查无法逐条判定「是否可机械登记 / 是否有歧义」** ⇒ 该部分**标记「未验证」**（§10-1），并升格为 §6 **P2-1**（下游依赖可靠性）。

**(1) 结构一致性（可核验部分）**：本审查按 diff **独立重建**批 F 的覆盖要求，得 **10 个文件级条目**（= 9 个 lib 文件 + `lib/client.js`），与「A~J **十条**」**数量吻合**：

| 条目对象 | 现有 `ANCHOR_CASES` 条目 | 本批变化 | 批 F 必需动作 |
|---------|------------------------|---------|--------------|
| `lib/oauth-llm.js` | ✅ `:887`（stale 1 / fresh 1） | form1 5→0（①5 处）+ 裸 `:1645`/`:1639`/`:1996-1998`/`:171-178` 清 | **扩 stale（≥4 条文本式）+ fresh（代码串/符号名式）** |
| `lib/index.js` | ❌ **无条目** | form1 3→0（⑤⑥⑦） | **新建条目** |
| `lib/prestep.js` | ❌ **无条目** | form1 3→1（⑧⑨清；**⑩ 保留**） | **新建条目**；**⑩ 文本 MUST NOT 入 stale**（判据绑定，三处同步） |
| `lib/oauth-credentials.js` | ❌ **无条目** | form1 2→0（⑪） | **新建条目** |
| `lib/host-abi/client-remotes.js` | ❌ **无条目** | form1 2→0（⑫⑬） | **新建条目** |
| `lib/service.js` | ✅ `:772` | form1 1→1（**⑭ 保留**） | 无新增 stale（保留项不入表） |
| `lib/host-route.js` | ✅ `:937` | form1 1→0（⑮）+ 裸 `:439-470` 清 | 扩 stale |
| `lib/host-abi/events.js` | ✅ `:728` | form1 1→0（⑯）+ 裸 `:21` 清 | 扩 stale（裸锚须 context 式） |
| `lib/wrapper.js` | ✅ `:891` | form1 1→0（⑰）+ 裸 `:1639`/`:1996-1998`/`:1645` 清 | 扩 stale |
| `lib/client.js` | ✅ `:806`（stale 20 / fresh 17） | ③ **7→0**（⑱–㉒，5 行） | 扩 stale/fresh **5 组**（裸锚须 context 式） |
| （镜像侧 `tests/served-client.js`） | — | 同改（字节恒等） | **不重复登记** ✅ 与 `:774-777` 既有政策一致（§3 恒等判据更强） |

**(2) 批 F MUST 满足的登记形态（本审查从既有语料归纳的硬要求）**：
- **裸锚 needle MUST 带同句上下文**。既有语料的先例一律如此：`'（:1397-1403）'`（`wrapper.js` 条目）、`':5060 先例'`、`'presetDiagnostics :2109'`、`'OAUTH_ROUTE_PROVIDER :36'`、`'权威单点 :124-125'`。本批清除的裸锚含 `:21`/`:47`/`:53`/`:292`/`:429`/`:803`/`:1568` 等**超短/超通用**形态，**裸登记必然歧义**（如 `:21` 会与 `:2109`/时间串/端口串混淆）⇒ 应登记为 `'同表 :21，凭据引用变化转发事件'` 一类**带上下文串**。
- **4 个文件需「新建条目」而非扩面**（`lib/index.js` / `lib/prestep.js` / `lib/oauth-credentials.js` / `lib/host-abi/client-remotes.js`）；其后 `9h-4c`（`staleUnitCount === ANCHOR_CASES.length`）会随条目数自动变化，**数字须按引用时点重跑**（与本批 note 一致）。
- **两处保留锚 MUST NOT 入任何 `stale` 数组**（入表即判红）。
- **R2 P2-2 一并收口**：删除 `tests/host-abi-health.mjs:878` 的「宿主靶子不可稳定符号化」总括断言并刷新 ⑥ 段落数字（本批未做，因该文件不在锁面）。

**(3) 已识别的口径不一致（跨批，交批 F）**：本批已在 `lib/client.js` 判定 `dsh-client-ui-conversation :16041-16056`「**不准**」并清除，但同一对象的同一形态在 **`tests/fix-029-host-contract.mjs:18`**（`// （PropsHooks：input → useInput，dsh-client-ui-conversation :16041-16056）。`）**仍在位** ⇒ 跨文件形态不一致。该文件属 **tests 面**（批 D 面，其 EV-198 自报「未闭合 2 项：fix-029 `:15/:18` … 归后续批」）⇒ **非本批缺陷**，但**批 F 处理时必须一并同步**，否则同一锚在两处判定相反。

### 2.5 反幻觉核验 —【15 处宿主 + 4 处在仓 + 1 处本地参考实现：**零幻觉、零事实错误**】

全部只读实读（`@deepseek-ai` 靶子 / `@earendil-works` / 仓内 / `.tmp-research`）：

| # | 引用（批 C 新文本） | 实读结论 | 裁决 |
|---|--------------------|---------|------|
| 1 | `dsh-system-prompt`「已漂移（现值 `getContextOrder` JSDoc）」 | `lib/index.js:250-257` = `getContextOrder` 的 JSDoc + `:255 getContextOrder(name) {` + `:256 return CONTEXT_ORDERS[name];` | ✅ 漂移成立 |
| 2 | 其替代代码串 `result.schemas.map(({ name, description, parameters }) => ({ … parameters: structuredClone(parameters) }))` | `:322-326` = `const schemas = result.schemas.map(({ name, description, parameters }) => ({ name, description, parameters: structuredClone(parameters) }));` | ✅ 逐字对应（`…` 为显式省略标记） |
| 3 | `dsh-llm-pi-ai`「已漂移（现值 context 模块注释）」 | `lib/index.js:1122 //#region lib/types/context.js` + `:1123-1127` 模块 JSDoc（`@module dsh-llm-pi-ai/context`） | ✅ 漂移成立 |
| 4 | 其替代 `toolsOf(options)` | `:1191 function toolsOf(options) {`（定义）+ `:1223 const tools = toolsOf(options);`（调用） | ✅ 真 |
| 5 | 宿主 `lib/index.js:1645`（`LlmAdapter` 空体默认） | `dsh-llm/lib/index.js:1645 imageRequestPricing(_provider, _model) {}` | ✅ **准确** |
| 6 | 宿主 JSDoc「`must answer synchronously without I/O`（+ token meter …）」 | `:1639-1640` = `estimate. Implementations must answer synchronously without I/O; the` / `token meter resolves this per measurement.` | ✅ **逐字** |
| 7 | 运行时消费点 `LlmRuntime.imageRequestPricing` (:1996-1998 准确) | `:1996-1998` = `imageRequestPricing(provider, model) { return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model); }` | ✅ **准确** |
| 8 | `dsh-host-webserver` 两处「漂移」 | `:128-135` = gzip 中间件 + `WebServer` 类 JSDoc；`:269-279` = `upgradedSockets` close 回调 + upgrade 路由查表 | ✅ 双漂移成立 |
| 9 | 替代式 `register(route)` 择表 / `match(pathname)` 最长前缀 | `:176 register(route) {`、`:177 const table = route.kind === "exact" ? this.exact : this.prefixes;`、`:321` JSDoc「Longest-prefix-wins over the prefix table after an exact-table miss.」、`:322 match(pathname) {`、`:326-329` 循环 + `prefix.length > best.path.length`、`:327 if (pathname !== prefix && !pathname.startsWith(\`${prefix}/\`)) continue;` | ✅ **逐字**；「等价于 `pathname === prefix \|\| pathname.startsWith(prefix + '/')`」= 该 `continue` 条件的德摩根等价 ✅ |
| 10 | `lib/attachments.js:38`（在仓，准确） | `:38 export const ATTACHMENT_ID_RE = /^sha256:[0-9a-f]{64}$/i` | ✅ **准确** |
| 11 | 本地参考实现 `dsh-vision-router`：`activateDeepTools()` +「注释逐字写 `session validation requires an id`」 | `.tmp-research/dsh-vision-router/index.js:4800 const outcome = activateDeepTools()`、`:4804 // user/message events; session validation requires an \`id\`, so the`；符号另有 `:2822`/`:6814` 定义与 5 处调用 | ✅ **逐字** |
| 12 | `adapterHandlesImages` 同款取舍 | `:4832-4835` 策略注释 + `:4836 const adapterHandlesImages = stealthActive || wrapperRegistered` | ✅ 准确 |
| 13 | `@earendil-works/pi-ai` 的 `openai-codex.js:30/:31`（准确） | `dist/auth/oauth/openai-codex.js:30 const DEVICE_REDIRECT_URI = …/deviceauth/callback`、`:31 const DEVICE_CODE_TIMEOUT_SECONDS = 15 * 60;` | ✅ **准确** |
| 14 | 在仓 `lib/client.js:36 OAUTH_ROUTE_PROVIDER`（准确） | `:36 const OAUTH_ROUTE_PROVIDER = 'chatgpt-oauth'`（`813c4a9` 同位置同内容） | ✅ |
| 15 | `dsh-api-remotes/lib/types/remote-events.js:12-32`「实读 19 项」+ `:21` 准确 | `:12 export const API_REMOTE_FORWARDED_EVENTS = [`，`:13..:31` = **19** 项，`:21 = { event: 'credentials/reference-updated', mode: 'emit' },` | ✅ |
| 16 | `dsh-settings:430-436`（漂移）+ 替代式 `mutate(ns, ops, expectedRevision)` / `write(ns, input, mode, expectedRevision)` | `:433 async mutate(ns, ops, expectedRevision) {`（`:437-438` 才含 `{op:'set'\|'unset', path}` 字面量 ⇒ 原区间**已不含其所描述字面量**）、`:443 write(ns, input, mode, expectedRevision) {`（`:439-470` **已不是** `write()` 体，实体为 `:443-472`）⇒ **漂移成立**；`write()` 体内确无「跨 ns 属主限制」检查（按 `registrations.get(ns)` 查注册表，无属主参数） | ✅ 判定与替代式均真 |
| 17 | `dsh-client-ui-settings-models:889-911 joinProviderDirectory(registered, directory)` | `:889 function joinProviderDirectory(registered, directory) {` … `:911 return rows; }`（`:912` 收 `}`） | ✅ 真 |
| 18 | `dsh-api-session-controller/types/agent.js:297-318`（⑩ 保留锚的对象） | `:289 selectionFor(agent)`、`:293 stateOf(…, 'modelSelection')`、`:297-299 picked ← projectionState.pending`、`:305-307 loggedHeader → defaultModel.currentSelection()` | ✅ 语义相符 |
| 19 | `dsh-host-apiproxy`（⑭「对象已消失」） | `Test-Path` = **False**；同级枚举 240 项无此名 | ✅ |
| 20 | `dsh-client-ui-conversation` `uiSession.provide({hooks, props})` | `:16593-16595 ctx.uiSession.provide({ hooks: ["conversation", "input"], props: ["inputActions"],` | ✅ 真（引号形态 → §6 P3-2） |

⇒ **本批引入/改写的锚与符号 100% 可溯源，零幻觉 API / 零幻觉符号 / 零虚构宿主面**。

### 2.6 越界核验【恰 11 文件；零越界；与批 D 划清界限】

- `git show --name-only 2ea0bc9` = **11 文件**（9 个 lib 文件 + `lib/client.js` + `tests/served-client.js`），全部 `M`（**零新建、零删除**）✅。
- **零** `tests/host-contract.mjs`、**零** `tests/host-abi-health.mjs`、**零** `tests/**` 其余文件、**零** `.governance/**`、**零** `README*` / `package.json` / `docs/**` ✅（与 R2 批 E 锁面「2 文件均在锁面内」不同，本批锁面 = 派发声明的 11 文件并集，**实际提交面与锁面一致**）。
- `--numstat` 合计 **+108/−59**，与声称**逐数吻合** ✅。
- **与批 D 的界限**：`2ea0bc9..ce8d908` = 9 个 tests 文件（`+53/−49`），与本批文件集**零交集**；`tests/served-client.js` **未被批 D 触碰** ✅。本报告**未**据批 D 判红、未将其计入本批越界。

---

## 3. 闭合比对表（被指派遗留 + 跨批结转）

| 遗留项 | 出处 | 要求 | 本审查证据 | 裁定 |
|--------|------|------|-----------|------|
| **R1 P2-2** — `lib/client.js:4981-4988` 段落**证据对象被替换**（原锚准确，新证据属不同命名空间） | R1 §3 P2-2（`review-FIX-043-R1-input.md:277-283`） | 保留原 settings-models 两锚的**符号化**形式；model-selection 引用作**追加**而非**替换** | 新文本 `:4983-4996`：恢复 `ctx.remote.llm.listProviders()` + `createModelsOperations(ctx)` 三命名空间消费面，并写明 model-selection 两引用「**命名空间不同，不替代**」；**宿主逐字实读全中**（§2.1：`:991-992` / `:2585-2625` / `:2588` / `:2592` / `:2596` / `:2600` / `:2615`；`createModelsOperations` 的 JSDoc 自述三命名空间）；镜像双写字节恒等 | ✅ **已闭合（取 (a) 且证据充分）** |
| **R1 P2-3** — 裸 `:NNN` 族「余 7 处刻意保留」**枚举仅 6 处** + 保留理由「不可稳定符号化」未获支持 | R1 §3 P2-3（同文件 `:285-294`） | 枚举补齐 7 处；理由改**逐处标注**；`:5561`/`:5562` 判「漂移/错位且可符号化」 | 枚举 **5 行 / 7 token** 逐行补齐（§1.2 表）；5 处逐类判定 **准确 / 不准 / 准确 / 漂移 / 不准** 全部经宿主实读复现（§2.2）；`:5561` 新式 = `generation === this.generation 守卫`、`:5562` 新式 = `宿主 directory.store.subscribe + ModelSelect 的 uES 订阅`（**可符号化形态，实测 `:48/:55/:61` 与 `:128/:131/:314/:409`**）；全文件 `不可稳定符号化` **零命中** | ✅ **已闭合（枚举完整 + 理由逐处 + 存量清零）** |
| **R2 P2-2**（同族）— ⑥ 段落「宿主靶子**不可稳定符号化**」总括断言无实证 | R2 §6 P2-2（`review-FIX-043-R2-input.md:354-364`） | 改逐处标注式并删除总括 | **本批未做**（`tests/host-abi-health.mjs` 不在本批锁面）；该措辞**仍存** `:878`（本审查实测唯一命中）；已列入 A~J 清单 note（本审查 §2.4(2) 以「MUST 一并收口」形式固化） | ⚠ **未闭合，跨批移交批 F**（非本批缺陷；本批未复述/未扩散该措辞） |
| R1 P2-1（⑥ 段落计数） | R1 §3 P2-1 | 「7 处」→「8 处」 | 已由 R2 判「计数面已闭合」；本批未触该文件 | ✅ 保持闭合（R2 结论） |
| R1 P2-4 / P3-1（自报数字口径/分解） | R1 §3 | 台账修正 | 本批**新出现 1 处同类**（commit message 口径计数 1 vs 实 2）→ §6 **P3-1** | ⚠ 新增 1 项 P3（不影响交付物） |
| R2 P2-1（`:623` 裸抛） | R2 §6 P2-1 | 本批尾修（1 处 2 行） | **未做**——`tests/host-contract.mjs` 不在本批锁面（本批零 tests 文件）⇒ 属**批 D/F 面** | ⚠ 结转（缺省归属：后续守卫批） |

---

## 4. 五维度逐项结论

### 维度 1：正确性 — **通过（无 P0/P1）**

- **逐处语义判定正确性**：22 项判定（17 lib 面 + 5 裸锚）**全部**与宿主/在仓实体逐字比对（§2.5 表 20 行、§2.2 表 5 行）——**8 处「漂移」判定**（①②⑤⑥⑮ + ㉑ + 连带 ⑧⑨ 的准确对照）与 **2 处「不准」判定**（⑲㉒）**逐一实证成立**，**零误判、零虚构**。
- **改写后的句子真值**：所有锚的**替代式**（符号名 / 代码串 / 包名+符号）**逐字可复现**；未见任何「指着对象说错话」的情形（§2.5 #2/#9/#16 为三处最典型的代码串式，均与宿主源码逐字对应）。
- **R1 P2-2 裁定**：取 (a) 且**新文本自身声明了命名空间差异**（「**命名空间不同**，作追加证据保留，不替代」），把上一轮的「隐蔽改指」转为**显式边界声明** ✅。
- **保留处置的逻辑正确性**：⑩ 的「判据绑定 ⇒ 三处同步」 与 ⑭ 的「对象消失 ⇒ 保留 + 登记、不改指」均**与其事实一致**；⑩ 的措辞**未**声称「去行号即判红」（事实是 needle 对象在 `fix-029`）——**无超宣示**。
- **镜像一致性**：blob 同一 + SHA256 同一 + `diff --no-index` exit 0 + §3 判据绿（四条独立证据）✅。
- **边界条件 / 并发 / 资源**：本批**零运行时代码变更**（11 文件改动**全部为注释文本**；`lib/service.js` 为纯 `+10` 注释块、`tests/served-client.js` 为镜像双写）；无异步、无共享状态、无资源面。

### 维度 2：安全性 — **通过（无发现）**

- **不进入产品运行路径**：11 文件 diff **全为注释行**（逐行确认：改动行均以 `*` / `//` 起首或以注释块为界；唯一非注释面为**注释内部的引号/符号文本**）。
- 无 `eval` / `new Function` / `execSync` / `spawn` / 动态拼接执行路径；无网络、认证、SQL/DOM 面 ⇒ **无 OWASP Top 10 新增攻击面**。
- 无密钥/token/密码：diff 内出现的 `credentials` / `apiKeyEnv` 均为**描述宿主契约的既存文本**，非凭据值。
- 无新增硬编码绝对路径：本批新文本引用的宿主路径均为**包名 + 相对文件**（`_npx` 靶子路径仅在登记说明中出现，且与既有文本同源）。

### 维度 3：可维护性 — **通过（含 P3×3）**

- **净效果 = 行号式锚大幅收敛 + 形态升级**：9 文件 form1 **19→2**（余 2 = 刻意保留且均**显式登记**），`lib/client.js` ②③ 归零；锚形态从「易漂移的行号式」转为「符号名 / 代码串 / 包名+符号」式 ⇒ 与项目「锚漂移防复发」主线（FIX-040→043）同向。
- **注释质量**：登记的**判别信息密度高**——⑩ 写明「判据承载 + 三处同步 + 宿主实读结论」；⑭ 写明「对象消失 + 不虚构替代 + 登记为待判定」；两处均**未制造声明强度超事实**（P10-④）。
- **重复/冗余**：新增文本无重复块；`lib/service.js` 的 10 行登记与其描述的 2 个锚一一对应，无泛化表述。
- 命名/函数长度：本批不改代码，不适用；无新增抽象。
- **P3 级瑕疵**：代码串式引用的**逐字保真度**（引号形态、`ctx.` 前缀，§6 P3-2）；索引「位置」列**未标时点**（§6 P3-3）；存量登记中「`wrapper stream L343`」的**归属表述**指向 wrapper.js 而实体在 prestep.js（§6 P3-4）。

### 维度 4：性能 — **通过（无发现）**

- 零运行时代码变更 ⇒ **无性能面影响**；门控总耗时 24.7s（仓库内，含批 D 树）与基线 22~23s 同量级，波动在噪声内。
- 无 O(n²)、无循环内 I/O、无 N+1（本批不引入任何执行路径）。

### 维度 5：测试覆盖 — **通过（含 P2-1 备注）**

- **门控**：`run-all` exit 0（`ALL 20 SUITES + 4 RUNNER MODULES PASSED`、`#SKIP 2`）+ 副本 @`2ea0bc9` 双守卫 **118 / 178** 全绿 ✅。
- **9 个 lib 文件全部被至少一个套件 import**（`oauth-llm` ← adapter-parity/host-contract/oauth-main-model；`index.js` ← oauth-loopback；`prestep` ← fix-010/fix-029/routing-paths；`oauth-credentials` ← audit-001/metrics/oauth-credentials/oauth-loopback/oauth-main-model/oauth-promotion/smoke；`host-abi/client-remotes` ← host-contract；`service` ← 多套件；`host-route` ← fix-031/host-abi-health/oauth-main-model；`host-abi/events` ← host-contract；`wrapper` ← 多套件）⇒ 注释改动若破坏语法即被门控捕获（本审查 §1.6 副产品**实证**了该耦合：非法注释行使 `host-contract` 崩溃）。
- **镜像看护**：§3 字节恒等判据覆盖双写一致性（本批 §1.4 四重证据）⇒ **镜像侧无需重复登记**（与既有政策一致）。
- **残余覆盖缺口（如实披露且经本审查加证）**：本批**新清除的锚在批 F 接线前不受机器看护** —— M4 同形变异（+ 本审查的**整体回退加固变异**）**均未判红**，且 `tests/**` 全域对相关 anchor 串**零命中**（§1.6）。⇒ 该缺口**已被 Developer 主动登记**、本审查**予以确认**并升格为 §6 **P2-1** 的下游依赖（清单不可核验 + 未固化）。
- 覆盖率口径：无覆盖率工具（沿用既有）；断言总量 118 + 178 = **296**（本批**未改**两守卫文件 ⇒ 与批 E 后基线一致 ✅）。

---

## 5. AI 代码专项 5 项检查

| # | 检查项 | 结论 | 事实依据 |
|---|--------|------|---------|
| 1 | **mock 残留** | **无发现** | diff 内 `mock`/`stub`/`fake`/`dummy` 命中 = 0；11 文件改动全为注释文本 |
| 2 | **硬编码返回值** | **无发现** | 零可执行语句变更（`lib/service.js` 为 `+10/−0` 注释块；`tests/served-client.js` 为镜像双写）；无 `return true` / `\|\| true` 形态 |
| 3 | **幻觉 API / 幻觉符号** | **零幻觉（20/20 逐字实证）** | §2.5：15 处宿主对象 + 4 处在仓对象 + 1 处本地参考实现**全部只读实读命中**；两处「对象已消失」（`dsh-host-apiproxy`）**只保留、不虚构替代** |
| 4 | **未实现 TODO** | **无发现** | diff 内新增 `TODO`/`FIXME`/占位 = 0；未闭合项以**显式登记块**写明（⑩「保留原文，不单侧去行号…移交三处同步」；⑭「保留原文 + 失效登记；不静默改指…登记为待判定」），**未声称已修正** |
| 5 | **过度实现** | **无发现（一处台账措辞不足 → §6 P3-1）** | 11 文件 +108/−59 全在注释/锚登记同域；**无「顺带重构」**（`lib/service.js` 的 +10 行为**登记所需**，非功能改动）；两处「保留」是**最小动作**而非补齐式改写；唯一越界争议面（commit message 计数）不涉及代码 |

---

## 6. 发现清单（逐条带级别 + 可复查事实）

### P2-1 — `ANCHOR_CASES` 需求清单（A~J）**条目值不在仓库内任何载体**：本审查不可核验，且为批 F 的唯一输入（下游依赖可靠性）
- **位置**: commit `2ea0bc9` message「ANCHOR_CASES 需求（交批 F 统一接线，**见交付报告**）」；`.governance/evidence-log.md:667`（EV-197，仅登记「交付物 = `ANCHOR_CASES` 需求清单 A~J」，**未载条目值**）
- **事实依据**（可复查）：仓库全域搜索 `ANCHOR_CASES 需求` / `A~J` / `交批 F` / `批 F 接线` = **零命中**；EV-197 正文无 stale/fresh 值；批 C 交付的 `ANCHOR_CASES` **数据面零改动**（本批不含 `tests/host-abi-health.mjs`，`--name-only` 11 文件可证）⇒ 清单**仅存于会话消息**。
- **影响**：① 本审查**无法**逐条判定 A~J 的 stale/fresh 值是否可机械登记、是否遗漏（只能做结构性核验，§2.4(1)）；② 若会话上下文丢失，批 F 将失去「本批清除了哪些锚」的权威登记输入，而其**唯一机器可复现的替代品**是 `git diff cfe7756 2ea0bc9`（本审查据此独立重建了覆盖要求表，§2.4）。
- **修复建议**：Coordinator 在派发批 F 前把 A~J 条目值**固化到仓库侧载体**（evidence-log 证据行 / 批 F 任务包 / `.governance/` 附件），并注明「数字按引用时点重跑」；批 F 接线时以本报告 §2.4(1) 的覆盖要求表交叉核对（**4 新建 + 6 扩面 + 2 保留不入表 + 裸锚须 context 式**）。
- **级别理由**：**非阻塞**——不影响本批代码面、门控与判据强度；但属**交付物可用性/可核验性**缺陷（事实依据红线：无法验证者 MUST 标未验证），且**下游依赖唯一**。

### P3-1 — commit message 口径计数「交付后 9 文件 = **1**」与实测 **2** 不符，且与自身 ⑭ 条目矛盾
- **位置**: commit `2ea0bc9` message「口径计数（内容口径）」节末行
- **事实依据**：`git grep -oE '([A-Za-z0-9_./-]+\.(js|mjs)):[0-9]+(-[0-9]+)?' 2ea0bc9 -- <9 文件>`（按输出行数计，**内容口径**）= **2** = `lib/prestep.js` 1（⑩）+ `lib/service.js` 1（⑭）；同 message 的 ⑭ 条目**明载** `service.js:1325` 的锚「保留原文 + 显式登记失效」⇒ **自相矛盾**。Developer 面向 Coordinator 的声称（**2**）为正确者。
- **影响**：仅台账数字，**不影响任何交付物**（本批无 `ANCHOR_CASES` 数据面改动）；但本批的核心口径数字之一，后续若被直接引用将得错误余量。
- **修复建议**：改为「9 文件 = **2**（`prestep.js` 判据承载锚 + `service.js` 已消失包锚，均刻意保留 + 登记）」。

### P3-2 — 代码串式锚的**逐字保真度**：引号形态与接收者前缀简写
- **位置**: `lib/client.js:4311-4313`（镜像同）：`ctx.uiSession.provide({ hooks: ['conversation','input'], props: ['inputActions'] })`；`:4985-4986`：`ctx.remote.llm.listProviders()`
- **事实依据**：宿主实体为 `dsh-client-ui-conversation/lib/client.js:16593-16595` = `ctx.uiSession.provide({ hooks: ["conversation", "input"], props: ["inputActions"],`（**双引号**）；`dsh-client-ui-settings-models/lib/client.js:992` = `this.ctx.remote.llm.listProviders(),`（**`this.ctx`**）。
- **影响**：语义等价、句子真值无损；但代码串式锚的价值在于**可 grep 复现**，引号形态差异与 `this.` 省略会让「逐字检索」落空（同族于 R1 P3-2 的引号渲染 nit）。
- **修复建议**：代码串式一律照抄宿主源码字符（含引号形态与 `this.` 前缀），或显式标注「引号形态归一」。

### P3-3 — 逐处判定索引的「位置」列**未标时点**（引用批前树行号）
- **位置**: commit `2ea0bc9` message「逐处判定索引（位置 → 判定 → 处置）」22 项
- **事实依据**：索引位置经本审查逐项实读**全部命中 `cfe7756`（批前树）**（§1.8 表）；但同一文件批后行号已位移（例：⑩ 引 `prestep.js:150`，`2ea0bc9` 中该锚文本在 **`:152`**，因 ⑧ 段 +2 行）；索引未声明该列口径。
- **影响**：无判据/门控影响（`ANCHOR_CASES` 登记的是**锚文本**而非位置）；但按本系列「数字必须连口径引用」（FIX-042 R0 F-1 教训）纪律，位置列亦应绑时点，否则后续按索引在当前树查证会得错位。
- **修复建议**：索引头括注「位置列为批前树 `cfe7756` 行号」。

### P3-4 — 存量登记条目「`wrapper stream L343`」的**归属表述**可再精确（实体在 `prestep.js`，非 `wrapper.js`）
- **位置**: Developer 声称清单第 9 条（口径外存量登记）；实体为 `lib/prestep.js:260`（`// 原适配器；与 wrapper stream L343 语义对齐：…`）
- **事实依据**：`lib/prestep.js` form2 = **2**（`L520` @`:48`、`L343` @`:260`）；`lib/wrapper.js` form2 = **0** ⇒ 「wrapper stream L343」是该锚的**指代对象**（wrapper 的 stream 面），**不是**其所在文件。
- **影响**：无判据影响；但按字面理解会去 `lib/wrapper.js` 查找而落空（同类于「归属显式化」既有纪律）。
- **修复建议**：写作「`prestep.js:260` 的 `wrapper stream L343` 指代锚」。

### P3-5 — （跨批观察，非本批缺陷）同一锚在 tests 面仍以旧形态在位
- **位置**: `tests/fix-029-host-contract.mjs:18`（`// （PropsHooks：input → useInput，dsh-client-ui-conversation :16041-16056）。`）
- **事实依据**：本批已在 `lib/client.js:4310` 判 `ui-conversation :16041-16056`「**不准**」并清除（§2.2 ⑲），而同一对象同一形态在该 tests 文件**仍在位**；该文件属 tests 面（不在本批锁面；其 EV-198 自报「未闭合 2 项：fix-029 `:15/:18` … 归后续批」）。
- **影响**：同一锚两处判定相反 ⇒ 后续读者可能据旧锚回溯错误对象；**无判据影响**（S2 对 fix-029 的 needle 仅 2 项，不含该串，本审查实测 `host-contract.mjs:335`）。
- **修复建议**：批 F 处理 `:16041-16056` 族时一并同步该行（与 §2.4(3) 同）。

---

## 7. 设计一致性 / 原则符合性

| 依据 | 检查结论 |
|------|---------|
| `arch-004-compatibility-design.md` §5.1(a)（`tests/host-contract.mjs` B6 静态层宿主面契约快照） | **一致**——本批仅改**注释内锚形态**，未新增/删除契约面、未改判据、未改 B6 四类面语义；两守卫文件零改动（118/178 与批 E 基线一致） |
| **P4**（产品代码变更 MUST 跑全量测试网，零回退） | **满足**——`run-all` exit 0 + 双守卫 118/178 全绿；断言总量 296 **未回退**；镜像字节恒等；**注意**：本批的注释面变更**未被 `--numstat` 之外的行为面放大**（零可执行语句变更） |
| **P5**（同一动作汇入同一实现路径；被取代路径 MUST 删除） | **满足**——行号式锚**未与被取代的符号式并存**（form1 19→2，余 2 为**保留项**而非并存双形态）；替代式均为单一声明；两处保留均**显式登记**，不是「并存双路径」而是「待同步的判据绑定」 |
| **P6**（高质量交付，禁为完成而忽略质量） | **满足**——22 项逐处语义判定 + 两处保留的独立取证 + M4 反向对照**如实披露未看护面**（而非掩饰）；本审查另加**整体回退加固变异**仍未判红，结论同向 |
| **P8**（失败/降级 MUST 可观测） | **满足**——未闭合面、失效面（对象消失）、判据绑定面均以**显式登记块**写明并给出复核入口（`tests/host-contract.mjs` 头部刷新程序）；无静默吞错 |
| **P9**（宿主演进防御） | **正向**——本批把 13 处宿主锚由「行号式」升级为「包名 + 符号 / 代码串」式，直接降低宿主升级导致的锚漂移面；对象消失时**不虚构替代**（⑭） |
| **P10-④**（测试桩宿主面形态 MUST 锚定宿主源码；禁按心智模型伪造） | **满足**——所有替代式锚**逐字来自宿主实读**（§2.5 20 行），并**主动移除**「不可稳定符号化」式的未实证措辞（未复述 R2 P2-2）；`:5561/:5562` 从「不可符号化」改为**可核对符号式** |
| **P1 / 事实依据红线** | **满足**（本批）——22 项判定、2 处保留、M4 披露**全部可复查**；唯一瑕疵为 commit message 计数（P3-1）与三处措辞/时点 nit（P3-2/3/4），均**非事实虚构** |
| **P4-violation / 其它原则违反** | **无**——未发现违反 `project-principles` 任一指令式条目；`P7`（数据安全）不适用（零数据路径改动） |

---

## 8. 变异实验台账（全部在**仓库外**副本执行并逐字节复原）

副本：`%TEMP%\fix043r3-c`（`git archive 2ea0bc9` 展开 = **403 文件**；`node_modules` 为 junction 指向本仓 ⇒ 宿主可达性一致）；**每次复原以 `git hash-object` 与修订 blob 比对**；副本结束时**已删除**；**零仓库内写入**（本报告除外）。

| # | 目标 | 变异 | 结果 | 复原 |
|---|------|------|------|------|
| 0 | 基线 | 副本 @`2ea0bc9` 未变异 | `host-contract` **exit 0 / 118**；`host-abi-health` **exit 0 / 178** | — |
| M4-a | 新清锚看护面 | 单点写回 `lib/index.js:254-258` 至 `lib/oauth-llm.js`（合法注释，`node --check` 0） | **health exit 0 / 178**；**contract exit 0 / 118** ⇒ **未判红** | ✅ `3090162…` |
| M4-b | 同上（加固） | `lib/oauth-llm.js` **整体回退**至 `813c4a9`（`61844ee`，含全部 5 form1 + 3 裸锚） | **仍 health 0 / 178 + contract 0 / 118** | ✅ `3090162…` |
| 复原 | — | 逐字节回写 | `hash-object` 恒等 + health **0 / 178** | ✅ |
| （废案） | — | 首次 M4 尝试误插非法 `*` 起首行 | `host-contract` **exit 1（Node 崩溃）** ⇒ 反证 import 级语法耦合 | 已丢弃重做（未计入结论） |

**静态确证（不依赖变异）**：`tests/**` 对『254-258 / 1123-1128 / 430-436 / 4803-4806 / 4832-4835』**零命中**；`lib/oauth-llm.js` 的 `ANCHOR_CASES` 条目仅含 `runCodexResponsesChat :2906-2929` / `` `runCodexResponsesChat` `` 一对 ⇒ **本批新清锚无机器看护**（M4 描述准确）。

**门控（仓库内）**：`node tests/run-all.mjs` → **exit 0**、`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (24.7s)  #SKIP 2 (smoke.mjs×2)`。
**门控（副本 @`2ea0bc9`）**：`118` + `178` 断言双绿（未受副本缺 `.git` 影响；未跑全量 `smoke`，故无 R2 P3-4 所述副本伪影面）。

---

## 9. 真实性红线声明 / 只读遵守 / R4 逐条上报

- **只读铁律遵守**：本审查**未**对任何仓库文件调用 Write/Edit（**唯一写 = 本报告**）；**未**执行 `git add/commit/checkout/restore/reset`；**未**修改 `.governance/**` 既有记录（R0/R1/R2 报告与 evidence 由 Coordinator 机写）。全部变异只在 `%TEMP%\fix043r3-c`（**仓库外**）执行并逐次字节复原；副本已删除（`Test-Path` = False）。
- **仓库工作树零变化实证**：受审前 / 受审后 `git status --short` **逐字相同**（`.governance/evidence-log.md`、`plan-tracker.md`、`tpa-last-run.json` 为 `M` + 六份 FIX-043 报告 `??`）；`git diff --name-only` 非 `.governance` 项 = **0**；`HEAD = ce8d9080d2afa8bdd3d2b0d52c10640d2a716555` 全程不变。
- **仓库外只读接触面逐条上报（M7.7 R4）**——除第 4 组为**仓库外受控副本写入**（`%TEMP%`，已清理）外，全部**只读**（`Test-Path` / `Get-Content` / `Select-String` / `Get-ChildItem` / `Get-FileHash` / `git cat-file`+重定向**仅用于副本复原**），**宿主靶子零写入、零创建、零删除**：

| # | 时间（+08:00） | 命令（摘要） | 退出码 | 影响路径 |
|---|---------------|-------------|--------|---------|
| 1 | ≈11:19 | `Get-Content` 逐段读 `dsh-client-ui-settings-models\lib\client.js`（`:886-915` / `:988-996` / `:2578-2626`）+ `Select-String 'const inject = ['` | 0 | `…\@deepseek-ai\dsh-client-ui-settings-models\lib\client.js`（**只读**） |
| 2 | ≈11:19 | `Get-Content` 逐段读 `dsh-client-ui-model-selection\lib\client.js`（`:44-62` / `:126-134` / `:288-298` / `:310-316` / `:405-412` / `:915-942`） | 0 | `…\dsh-client-ui-model-selection\lib\client.js`（**只读**） |
| 3 | ≈11:20 | `Get-Content` 读 `dsh-llm\lib\index.js`（`:1635-1650` / `:1990-2002`）；`Select-String 'const inject = ['` @settings-models | 0 | `…\dsh-llm\lib\index.js`（**只读**） |
| 4 | ≈11:20 | `Get-Content` 读 `dsh-system-prompt\lib\index.js`（`:250-264` / `:316-330`）+ `Select-String 'structuredClone(parameters)'`/`'getContextOrder'`；`dsh-llm-pi-ai\lib\index.js`（`:1118-1132`）+ `Select-String 'toolsOf('` | 0 | `…\dsh-system-prompt\lib\index.js`、`…\dsh-llm-pi-ai\lib\index.js`（**只读**） |
| 5 | ≈11:21 | `Get-Content` 读 `dsh-host-webserver\lib\index.js`（`:126-138` / `:266-282` / `:320-340`）+ `Select-String 'register(route)'`/`'match(pathname)'`/`'!pathname.startsWith'` | 0 | `…\dsh-host-webserver\lib\index.js`（**只读**） |
| 6 | ≈11:21 | `Get-Content` 读 `dsh-client-ui-conversation\lib\client.js`（`:16038-16060` / `:16593-16602`）+ `Select-String 'uiSession.provide'`；`dsh-cordis-client-runner\lib\client.js`（`:310-316` / `:340-344`）+ `Select-String 'readService('` | 0 | 上述 2 文件（**只读**） |
| 7 | ≈11:22 | `Get-Content` 读 `dsh-settings\lib\index.js`（`:423-478`）+ `Select-String 'write('`；`Get-Content` 读 `dsh-api-remotes\lib\types\remote-events.js`（`:10-33`）；`Test-Path …\@earendil-works` + `Get-ChildItem` | 0 | 上述 3 路径（**只读**；`@earendil-works` 目录枚举） |
| 8 | ≈11:22 | `Get-ChildItem -Recurse -Include '*.js','*.d.ts'` + `Select-String 'DEVICE_REDIRECT_URI','DEVICE_CODE_TIMEOUT_SECONDS'`（pi-ai 全树） | 0 | `…\@earendil-works\pi-ai\**`（**只读**） |
| 9 | ≈11:23 | `Get-Content` 读 `dsh-api-session-controller\lib\types\agent.js`（`:288-320`）；`Test-Path …\dsh-host-apiproxy` + `Get-ChildItem`（240 项枚举） | 0 / **False** | `…\dsh-api-session-controller\lib\types\agent.js`、`…\@deepseek-ai\`（**只读**；**包不存在**） |
| 10 | ≈11:23 | `Get-Content` / `Select-String` 读 `.tmp-research\dsh-vision-router\index.js`（`:4800-4840` + 符号定位） | 0 | `.tmp-research\dsh-vision-router\index.js`（**仓内既有研究副本，只读**） |
| 11 | ≈11:24 | `git archive`/`Expand-Archive` → `%TEMP%\fix043r3-c`、`cmd mklink /J node_modules` → 副本内 `node tests/host-{contract,abi-health}.mjs`（基线/M4-a/M4-b/复原）；`Remove-Item` 清理 | 0 / 变异常态 0 | **仓库外** `%TEMP%\fix043r3-c`（**唯一写入面，已删除**；仓库零写入） |
| 12 | ≈11:25 | 仓库内 `node tests/run-all.mjs`（读仓库 + 经 junction 读宿主，**只读**） | 0 | 仓库工作目录 + 宿主靶子（**只读**） |

- **仓库外写入面**：仅 `%TEMP%\fix043r3-c\`（副本树）与 `%TEMP%\fix043r3-c.zip`（取件），**均在仓库外、均已删除**；**仓库内零写入**（本报告除外）。**未触碰** `$HOME` 下任何配置目录 / `$DSH_HOME` / 任何仓库外既有目录（未删除、未移动、未重建）。

---

## 10. 未验证项（如实登记，**不作为通过依据**）

1. **`ANCHOR_CASES` 需求清单 A~J 的条目值**（§2.4(0)）：清单本体不在仓库内任何载体，**本审查无法逐条判定**其 stale/fresh 值可机械登记性/歧义/遗漏 ⇒ **标「未验证」**，并因此登记 §6 P2-1。本报告给出的覆盖要求表（10 文件 / 4 新建 + 6 扩面）是**本审查据 diff 独立重建**，**不是**对 Developer 清单的核验。
2. **Developer 的真实环境命令级 R4 上报（声称 10）**：本审查无其会话内命令级记录，**未复核**（R4 义务主体 = 执行者）。
3. **批 D（`ce8d908`）的任何面**：不在本审查目标内，本报告仅在「划清界限」与「跨批观察 P3-5」处引用其**自报**信息（EV-198），**未做独立核验**。
4. **`tests/host-abi-health.mjs:878` 的 R2 P2-2 项（「不可稳定符号化」）**：本审查仅确认其**仍在位**且不在本批锁面，**未**评估批 F 改写后的形态（尚未发生）。
5. **CI 侧 `#SKIP` 实时值**：本审查无 CI 访问权限；全部 skip 结论限于**本地 Windows 口径 `#SKIP 2`**（本审查一次实跑 + 副本双守卫绿）。
6. **`.tmp-research/dsh-vision-router/index.js` 之外的宿主参考实现**：本批引用仅涉该文件 2 处（⑧⑨），已实读；未扩展搜索其他本地参考实现副本。

---

## 11. 交付结论摘要（供 Coordinator）

- **结论**: **`APPROVED_WITH_NOTES`** / **`unresolved_blockers=0`**
- **P0 = 0；P1 = 0；P2 = 1；P3 = 5**
- **两项被指派遗留闭合裁定**：
  1. **R1 P2-2 = 已闭合** —— 取 **(a)** 实施；**裁定经本审查独立实读成立**：`dsh-client-ui-settings-models/lib/client.js:991-992`（`remote.llm.listProviders()`）与 `:2585-2625` 的 `createModelsOperations(ctx)`（`:2588/:2592/:2596` credentials 读写、`:2600` settings.mutate、`:2615` llm.discoverModels）**恰为同句并列声明的三命名空间消费面**；model-selection 的 `scope.modelDirectories`（`:917/:940`）与 `remote.session.modelCatalog()`（`:46`）**确属不同命名空间** ⇒ 「追加、不替代」的声明**与实况逐字相符**。
  2. **R1 P2-3 = 已闭合** —— 5 行 / 7 token 枚举**完整**；5 处逐类判定 **准确 / 不准 / 准确 / 漂移 / 不准** 全部经宿主实读复现（`:5561` 实为 `:48/:55/:61`；`:5562` 的 `:292` 实为 `directoryFor` 的 JSDoc、真实订阅点 `:128/:131/:314/:409`）；全文件「不可稳定符号化」**零命中**（未复述 R2 P2-2 措辞）。
- **两处刻意保留 = 均正当**：⑩（判据承载：`host-contract.mjs:335` 的 `extra.signatures` 对 `tests/fix-029-host-contract.mjs` 逐字在位断言，`:638-641` 消费实证；同串在对象文件 `:7`；锚对象 `agent.js:289/293/297-299` 实读准确；措辞**未**超宣示）；⑭（`dsh-host-apiproxy` `Test-Path` = **False** ⇒ 对象已消失；保留原文 + 显式登记、**未静默改指**，符合派发规则与 P10-④）。
- **独立复算全部吻合**：11 文件 +108/−59 ✅ / 口径 a 19→19→**2**（9 文件）+ 12→0→0（`client.js`）✅ / 口径 b 40→24→**17**（12/17/11 → 0/17/7 → **0/17/0**，③ 5 行 7 token → 0）✅ / 镜像 blob 同 `03cad685` + SHA256 同 `6836C5C0…712E` + 397488 B + `diff --no-index` exit 0 + §3 绿 ✅ / 门控 exit 0 + `#SKIP 2` + **118 / 178** ✅ / 22 项判定位置列**批前树逐字命中** ✅ / 存量登记穷举**零遗漏** ✅ / **M4 未判红经同形 + 加固双变异复现** ✅ / 20 项对象实读**零幻觉** ✅。
- **下游依赖（批 F 输入）**：`ANCHOR_CASES` 覆盖要求 = **10 个文件级条目**（`oauth-llm`/`index`/`prestep`/`oauth-credentials`/`client-remotes`/`service`/`host-route`/`events`/`wrapper`/`client`），其中 **4 个需新建条目**（`index.js`/`prestep.js`/`oauth-credentials.js`/`host-abi/client-remotes.js`）、**6 个需扩面**；**裸锚 needle MUST 带同句上下文**；**两处保留锚 MUST NOT 入 `stale`**；**镜像侧不重复登记**（与既有政策一致）；**R2 P2-2（`:878` 措辞 + ⑥ 段落数字）MUST 一并收口**；**`:16041-16056` 族跨文件（`tests/fix-029-host-contract.mjs:18`）须同步**。
- **复审义务 = 无**（本结论非 NEEDS_CHANGE ⇒ 不触发 M7.4 的 T1 返工-复审链；本轮为 R3，未触及 T2 熔断）。
- **建议遗留计划**：
  | 项 | 归属 | 内容 |
  |----|------|------|
  | P2-1 | Coordinator（**批 F 派发前**） | 把 A~J 条目值固化到仓库侧载体；以 §2.4 覆盖要求表交叉核对 |
  | P3-1 | 任一批顺带 / 台账 | commit message 口径计数 1 → **2** |
  | P3-2 | 后续锚批 | 代码串式照抄宿主字符（引号形态 / `this.` 前缀） |
  | P3-3 | 台账 | 索引「位置」列括注「批前树 `cfe7756`」 |
  | P3-4 | 任一批顺带 | 「`wrapper stream L343`」归属显式化为 `prestep.js:260` |
  | P3-5 | 批 F（随 `:16041-16056` 族） | 同步 `tests/fix-029-host-contract.mjs:18` |
  | R2 P2-2 / R2 P2-1 | 批 F / 后续守卫批 | 保持未闭合登记（本批未触其锁面） |

---

**审查者**：Code Reviewer Agent（只读审查；唯一产出物 = 本文件）
**报告路径**：`.governance/review-FIX-043-R3-input.md`
**下一步**：Coordinator 用 `review-record` 机写 canonical 报告与 REVIEW 证据行（本报告不作为机录替代）。
