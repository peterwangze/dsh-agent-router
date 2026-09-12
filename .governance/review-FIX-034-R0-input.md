# REVIEW-FIX-034-R0-input — oauth-llm 契约补齐 + 守卫扩展代码审查（Round 0）

- **Task ID**: FIX-034-R0（P1）
- **Reviewer**: Code Reviewer Agent（只读审查）
- **审查对象**: 工作区未提交 diff（`git diff lib/oauth-llm.js tests/adapter-parity.mjs`，基线 faefd82）
- **审查日期**: 2026-09-12
- **工具边界**: read/grep/glob + 只读 git；未执行测试/写操作（测试结论以 Developer 证据 + Coordinator 复跑裁终）
- **宿主基线**: @deepseek-ai/dsh-llm 0.1.5-rc.2（node_modules/.pnpm/@deepseek-ai+dsh-llm@0.1.5-rc.2_.../ 实读）

---

## 0. 范围核实

| 项 | 结果 | 证据 |
|---|---|---|
| diff 恰 2 产品文件 | ✅ | `git diff --stat`：lib/oauth-llm.js +31/−4（hunk 计）、tests/adapter-parity.mjs +68/−1；另 2 改动文件为 .governance 记录（台账，非产品代码，不入审查对象） |
| wrapper.js 零净改动 | ✅ | `git diff lib/wrapper.js` 输出为空（实测）——与任务上下文「借用后零净改动已还原」一致 |
| triage 文件清单含 wrapper.js | ⚠️ 披露即可 | FIX-034.json files 含 lib/wrapper.js；实际 F2-2 无需 wrapper 改动（fail-safe 已由 FIX-033 commit c89d635 落盘，wrapper.js:352-361 实读确认 try/catch 回落存在），7c 仅补判别测试——范围收缩非扩张，透明无违规 |
| EVO-020 在途隔离 | ✅ | 在途文件（lib/client.js / host-abi 等）与本 diff 零重叠，审查未受污染 |

---

## 1. Developer 声称逐条核验

### 声称 1：oauth-llm imageRequestPricing 恒 undefined + 工厂导出 —— ✅ 核实

**宿主锚点逐一实读**（0.1.5-rc.2 安装实体）：

| 声称锚点 | 实读结果 | 判定 |
|---|---|---|
| lib/index.js:1645 原型空体 | `imageRequestPricing(_provider, _model) {}`——空体 → 返回 undefined | ✅ 精确 |
| lib/index.js:1639 同步零 I/O 注释 | :1636-1644 JSDoc："The default declares none, so consumers fall back to their own neutral estimate. Implementations must answer synchronously without I/O; the token meter resolves this per measurement"（:1639 行含 "must answer synchronously without I/O"） | ✅ 精确 |
| lib/index.js:1996-1998 消费点 | `imageRequestPricing(provider, model) { return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model); }` | ✅ 精确 |
| types.d.ts:171-178 | `LlmImageRequestPricing { priceImages(images: readonly ImageAttachmentRef[]): readonly LlmImageRequestPrice[] }` 方法式接口 | ✅ 精确 |
| types.d.ts:159-164 | `LlmImageRequestPrice { visualTokens: number; text: string }` | ✅ 精确 |

**断裂机理核实**：:1997 可选链 `?.` 只保护「provider 未注册」；已注册适配器缺方法时 `adapter.imageRequestPricing(...)` 直调即 TypeError——oauth-llm 注释中的断裂描述准确（oauth-llm.js:329-333）。oauth-llm 为手工对象字面量（无基类继承，FIX-001 同型），补齐必要性成立。

**「恒 undefined」裁量评估**（审查重点①）——**裁量正确**：
- 事实链：oauth-llm 是自有适配器（ChatGPT 订阅端点 chatgpt.com/backend-api/codex/responses），无上游适配器可委派——与 twin（wrapper.js 包装既有原适配器，:355-356 透传 base.imageRequestPricing）的结构性差异真实存在；
- 语义对齐：宿主基类默认 = "declares none → 消费者回落自身中性估算"（:1638-1639 原文）；oauth 路由无公开按图计价表，恒 undefined 恰 = 宿主默认语义的可观察行为，不虚构数字符合事实纪律（原则 1）；
- twin 透传 ≠ oauth 应透传：twin 有原适配器定价可归属（FIX-033 已论证），oauth 无可归属对象——两者差异**有据**，非不一致。
- 实现质量：`return undefined`（oauth-llm.js:342-344）纯同步字面量——零 I/O 天然满足、无委托链天然不抛，注释披露推理链完整。

**工厂导出**：`export function createOauthAdapter`（:313）——与 wrapper `createWrapAdapter` 同构先例；导出面扩大仅服务测试构造，无安全/耦合代价。

### 声称 2：test 1b 六方法枚举同构守卫 —— ✅ 核实

- ADAPTER_CONTRACT（adapter-parity.mjs:47-55）= `Object.getOwnPropertyNames(LlmAdapter.prototype)` 去 constructor + 静态补 'stream'/'prepareCall'（Set 去重）。宿主原型实读（lib/index.js:1620-1686）：providerInfo/:1624、providerRetryPolicy/:1635、imageRequestPricing/:1645、listModels/:1653、resolveModel/:1665、prepareCall/:1681 → 六方法 + stream = 7 项；
- test 1b（:113-127）循环体与 twin 侧 test 1（:94-101）**逐字同构**（同一 ADAPTER_CONTRACT、同一 typeof === 'function' 判据）——同构性 ✅；
- `createOauthAdapter(null, null)` 构造期安全：工厂体实读（oauth-llm.js:313-462）确认 ctx/service 仅在方法体内惰性消费，构造零依赖 ✅；
- 行为判别（:122-126）：缺方法时降级 'not-a-function' 哨兵不崩溃（TDD RED 期可读失败），`oauthPricing === undefined` 断言对「误声明默认定价 / 异步化（返回 Promise ≠ undefined）/ 抛错」均红——判别力真实 ✅；
- oauth 适配器方法集实读（:314-461）：providerInfo/providerRetryPolicy/imageRequestPricing/listModels/resolveModel/prepareCall/stream 全 7 项契约覆盖 ✅。

### 声称 3：F2-1 夹具勘正（7b）—— ✅ 核实（审查重点②）

- 新夹具（adapter-parity.mjs:301-305）：`{ priceImages(images) { return images.map((ref) => ({ visualTokens: 85, text: \`image:${ref.attachmentId}\` })) } }`；
- 与宿主 schema 逐字段比对：方法式 `priceImages(images)` ✅（types.d.ts:171-178）；逐 occurrence 返回、索引对齐 ✅（:177）；单价 `{visualTokens, text}` ✅（:159-164）；`ref.attachmentId` 字段锚定实读——dsh-attachment types.d.ts:7-9 `interface ImageAttachmentRef { ... attachmentId: AttachmentId }` ✅；
- 旧夹具 `{perImageTokens, perRequestImages}` 字段式确系宿主消费面零命中的伪造形状——P10-④（原则 10-④「测试桩宿主面锚定宿主源码」）勘正成立；
- 透传语义断言不变（:321）：`returned === PRICing` 同形 + `seenArgs[0].provider === 'fake-priced'` 原 provider 委托 ✅。

### 声称 4：F2-2 7c fail-safe 判别 —— ✅ 核实（静态推演精确）

- 断言对象存在性：wrapper.js:352-361（FIX-033 已入仓实体）`imageRequestPricing` try/catch → 抛错回落 undefined ✅；
- 判别力静态推演：临时删 catch → `throw new Error('pricing boom')` 经 twinThrowing.imageRequestPricing 上击 → 测试 try 捕获 `threw=true` → :343 断言红（恰 1 FAIL）——与 Developer 红/绿演示声称精确吻合 ✅（动态复跑归 Coordinator）；
- fail-safe 方向与 providerRetryPolicy（wrapper.js:325-333）同构——注释声称一致 ✅。

### 声称 5：TDD 双级 RED → GREEN 32 断言 + 全量网 23/23 —— ✅ 静态核验 / ⚠️ 动态未验证

- 导入级 RED 静态成立：ESM 具名导入未导出绑定 = 模块实例化 SyntaxError；
- 断言级「恰 2 FAIL」静态精确：导出后缺方法 → 循环项 `oauth-llm adapter implements adapter contract method: imageRequestPricing` 红（1）+ 哨兵滞留 'not-a-function' → 行为断言红（2）——恰 2，全命中缺口，无误伤；
- 32 断言计数静态复核：test0(1) + test1(7) + test1b(7+1=8) + test2(4) + test3(2) + test4(1) + test5(3) + test6(3) + test7(7a/7b/7c=3) = **32** ✅ 与声称精确吻合；
- 全量网 23/23：**未验证**（Reviewer 禁跑测试）——Developer 证据 + EV-176 台账在案，Coordinator 复跑裁终。

---

## 2. 五维审查结论

### 2.1 正确性 —— 通过
- 方法语义与宿主基类默认可观察行为严格等价（undefined、同步、零 I/O、不抛）；全部 5 组宿主锚点行号实读零幻觉；
- 守卫枚举与 twin 侧同构；哨兵降级设计使 RED 期失败可读且不崩溃；
- 夹具形状逐字段锚定宿主 schema（含 ImageAttachmentRef.attachmentId 交叉包验证）；7c 判别逻辑静态推演精确。

### 2.2 安全性 —— 通过
- 新增方法零 I/O、零凭据接触、零外部输入解析；产品代码无 eval/动态导入/注入面；
- 工厂导出仅扩大模块导出面（测试构造用），不引入新信任边界。

### 2.3 可维护性 —— 通过（含 P3 讨论 2 条，见 §4）
- 注释携带宿主行号锚点 + 断裂机理 + 裁量理由，可追溯性优秀；守卫复用同一 ADAPTER_CONTRACT 单一事实源（符合原则 5 泛化性——双适配器汇入同一契约清单路径，无平行清单并存）。

### 2.4 性能 —— 通过
- `return undefined` 常量返回，token meter 每次测量取价零开销；测试构造一个对象字面量，琐碎。

### 2.5 测试覆盖 —— 通过
- oauth 侧：契约枚举（6+1）+ 未声明定价行为判别；
- twin 侧：7a/7b/7c 三分支（未声明/声明透传/抛错回落）补全 FIX-033 遗留 F2-2；
- 覆盖缺口评估：7b 夹具的 priceImages 本体不被调用——与 twin 契约范围一致（twin 职责 = 透传，价格计算属宿主 token meter），非缺口。

---

## 3. AI 专项 5 项

| 项 | 结论 | 依据 |
|---|---|---|
| Mock 残留 | 无 | 产品代码零 mock；测试夹具为显式 fake 且形状锚定宿主实体 |
| 硬编码 | 无问题 | 'gpt-x'/85/'image:' 均测试局部常量；产品代码无魔法值（恒 undefined） |
| 幻觉 API | **零幻觉** | 5 组宿主锚点 + LlmAdapter 导出（index.js:2326）+ prepareCall 原型（:1681）+ attachmentId（dsh-attachment types.d.ts:7-9）全部实读命中 |
| TODO | 无 | diff 内零 TODO/FIXME/占位 |
| 过度实现 | 无 | 最小 diff：1 方法 + 1 导出 + 3 组测试；注释量大属锚点文档，与仓库既有风格一致 |

---

## 4. 发现清单（P0~P3）

- **P0：0 条**
- **P1：0 条**
- **P2：0 条**
- **P3：2 条（讨论级，不阻塞）**
  1. **P3-1** tests/adapter-parity.mjs:114 —— test 1b 依赖「createOauthAdapter 构造期不消费 ctx/service」这一隐式不变量（当前成立且注释已披露 :110-112）。若未来工厂改为急切初始化（如构造期探测），测试将以模糊 null 解读失败。建议：维持现状（注释已足）；若后续 oauth 工厂增加构造期逻辑，同步在 1b 引入最小夹具。
  2. **P3-2** lib/oauth-llm.js:322-341 与 lib/wrapper.js:335-350 —— 两段注释高度近似（镜像语义的刻意交叉引用）。宿主未来再演进时需双点同步更新。建议：接受（互引即目的）；若第三适配器出现再抽公共契约注释模块。

---

## 5. 结论

### APPROVED_WITH_NOTES（unresolved_blockers = 0）

- **P 计数**: P0=0 / P1=0 / P2=0 / P3=2（讨论级）
- **一句话理由**: 5 组宿主锚点实读零幻觉，「恒 undefined」裁量与宿主默认语义严格等价且结构性差异有据（twin 可委派 / oauth 无上游），守卫同构、夹具逐字段锚定 schema、fail-safe 判别静态推演精确，32 断言计数复核吻合；2 条 P3 均为讨论级讨论项，零未解决阻塞。
- **未验证项**（移交 Coordinator 复跑裁终，非阻塞）: 全量网 23/23 动态结果；7c 红/绿演示动态复现。
- **纪律声明**: 本文件为 Reviewer 输入报告；机录 REVIEW 行由 Coordinator 经 review-record CLI 写入（Reviewer 不手写治理记录）。
