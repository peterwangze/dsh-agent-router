# 代码审查报告 — FIX-043 批 D（R4）

- **Task ID**: FIX-043（批 D：tests 面锚族清扫 19 处 + 口径外同对象收敛 + R2 P2-2 同类面贡献）
- **Round**: **R4**（同任务审查链下一轮；语义 = 新工作单元的独立审查，**非** NEEDS_CHANGE 复审）
- **前轮基准**: `.governance/review-FIX-043-R2.md` / `review-FIX-043-R2-input.md`（批 E，`APPROVED_WITH_NOTES` / `unresolved_blockers=0`，含 P2-2「不可稳定符号化」无实证判例）；`.governance/review-FIX-043-R3-input.md` **本审查开始时不存在**（批 C 并行审查同期进行）⇒ 本报告**未**据 R3 判红/判绿；后续若 R3 落地，本报告结论不以其为前提。
- **审查对象**: commit **`ce8d908`**（短号；父 = `2ea0bc9` = 批 C，并行交付的 lib 面，**不属于本批**）
- **审查范围（`--numstat` 实测）**: 9 文件 **+53/−49**（adapter-parity 17/17、client-render 14/13、fix-010 2/2、fix-012 7/5、fix-029 2/2、metrics 1/1、oauth-main-model 3/3、run-all 2/1、smoke 5/5）——与声称逐数吻合（§1.1）
- **审查者**: Code Reviewer Agent（只读；唯一写操作 = 本文件）
- **审查时间**: 2026-09-13 11:20 – 11:4x +08:00
- **结论**: **APPROVED_WITH_NOTES**
- **unresolved_blockers=0**

---

## 0. 结论与硬门槛裁决

| 硬门槛 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | **0** | 通过 |
| 5 维度全覆盖 | = 100% | 5/5（§4） | 通过 |
| 每条发现标注级别 | = 100% | 6/6（§5） | 通过 |
| 设计一致性检查 | 已完成 | 已比对 P4/P5/P8/P9/P10-④ 与 `arch-004` §5.1（§6） | 通过 |
| AI 代码专项 5 项 | 全部完成 | 5/5 逐一有结论（§4.5） | 通过 |

**结论 `APPROVED_WITH_NOTES` / `unresolved_blockers=0`；P0 = 0，P1 = 0，P2 = 1，P3 = 5。**

- **保留项处置 = 成立**（§2.2）：`tests/host-contract.mjs:335` 的 `extra.signatures` 确对 `tests/fix-029-host-contract.mjs` 构成**逐字在位断言**；谓词独立复算：现文 `[true,true]` → 去行号 `[false,true]` ⇒ 单侧去行号必判红 ⇒ 「先改判据再改锚」成立。
- **语义等价 = 成立，且证据强于声称**（§2.3）：9/9 文件「注释与字符串字面量内容之外」的代码字符序列**逐字节相同**；7 处字符串变更**全部**位于 `check(`/`console.log(` 的**首参标签位**。census 计数**不足以**支撑该结论（→ P2-1），但结论经本审查以更强判据独立证明为真。
- **反幻觉核验 = 零幻觉**（§2.4）：5 处「行号/归属错」的**勘正结论逐条正确**，其余锚改写对象**逐字在位**（宿主 20+ 处、在仓 4 处实读复核）。
- **跨批一致性 = 一致（5/5 共享对象，0 不一致）**（§2.6）；唯一差异为**措辞精度**（→ P3-1）。
- **门控**：本审查独立实跑 `node tests/run-all.mjs` **exit 0 ×2**（23.1s / 26.7s），`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED`、`#SKIP 2 (smoke.mjs×2)`；`host-contract.mjs` **118** / `host-abi-health.mjs` **178** 断言（独立实跑汇总行）；`node --check` ×9 OK。
- 本批为**测试套件内注释/标签文本**改动：零 `lib/**`、零守卫文件、零 `.governance/**`、零 README/package.json/docs（§1.1）。
- 受审前后仓库工作树零变化：`HEAD = ce8d908…` 全程不变；锁面 9 文件 `git diff --name-only HEAD` = **0**；非 `.governance` 未跟踪文件 = **0**；本审查临时脚本置于 `%TEMP%\fix043r4` 并已删除（§8）。

---

## 1. 独立复算（不采信 Developer 数字）

### 1.1 越界面 / 规模 【逐数吻合】

| 项 | 声称 | 本审查独立实测 | 裁决 |
|----|------|---------------|------|
| 提交文件数 | 9 | `git show --name-only ce8d908` = **9**（全在 `tests/`） | ✅ |
| 行数 | +53/−49 | `--numstat` 求和 = **+53/−49** | ✅ |
| 零 `lib/**` | 声称 | 命中 = **0** | ✅ |
| 零 `tests/host-contract.mjs` / `host-abi-health.mjs` / `served-client.js` | 声称 | 精确匹配 = **0** | ✅ |
| 零 `.governance/**` / README / package.json / docs | 声称 | = **0** | ✅ |
| 与批 C（`2ea0bc9`）划界 | 声称 | 批 C 面 = 10 `lib/**` + `tests/served-client.js`；与本批**零交集** | ✅ |
| 新增/删除文件 | — | 无 `A`/`D`，全部 `M` | ✅ |

### 1.2 声称 1 — 口径数字 19 → 1 【三时点 + 逐文件分布全部吻合】

口径 = `git grep -nE '([A-Za-z0-9_./-]+\.(js|mjs)):[0-9]+(-[0-9]+)?' <rev> -- <9 文件>`（**行数口径**）。

| 时点 | 声称 | 本审查实测（总/逐文件） | 裁决 |
|------|------|----------------------|------|
| `813c4a9`（批 A） | 19 | **19**（client-render 5 / fix-029 3 / oauth-main-model 2 / fix-012 2 / adapter-parity 2 / smoke 2 / fix-010 1 / metrics 1 / run-all 1） | ✅ 逐文件分布**逐数一致** |
| `cfe7756`（批 E = 派发时 HEAD） | 19（分布一致） | **19**，分布同上 | ✅ |
| `HEAD`（`ce8d908` 交付后 = 工作树） | 1 | **1** | ✅ |

**余 1 项身份确认**：`tests/fix-029-host-contract.mjs:7` = `//   controller types/agent.js:297-318）首层 = picked，由 durable` —— 与声称「余 1 = `fix-029:7` 的 `types/agent.js:297-318` 登记保留项」**逐字吻合** ✅。

**19 项逐处清单独立复现**（@`813c4a9` 逐行实读）：`adapter-parity:37/:106`、`client-render:379/:515/:518/:1855/:2105`、`fix-010:12`、`fix-012:6/:17`、`fix-029:7/:381/:389`、`metrics:528`、`oauth-main-model:313/:314`、`run-all:66`、`smoke:2282/:2496` —— 与 Developer 索引 1–19 **位置一一对应，零多余零遗漏** ✅。

### 1.3 声称 5 — 口径外同对象收敛 【实质全部成立；计数单位未标注 → P3-3】

- **「实测不入 19 口径」成立**：口径正则对**新增行**命中 = **0**；口径外形态（裸 `:NNN` / `L###` / `*.d.ts:NNN`）仅出现在**被删除行**：实测 **21 行 / 25 token**（adapter-parity 13 行、client-render 5 行、fix-012 2 行、smoke 1 行）。
- **枚举逐条在场**：`directoryFor :187`、`directory.d.ts:52`、`L342/L335/L581`、跨行 `lib/client.js: 157-161 / :729-736 / :799`、`(:2596-2630)`、`(:2749-2760)`、adapter-parity 10 行裸 `:NNN`、smoke `:721-729`/`:541-543` —— **逐条在 `ce8d908^` 文本内实存** ✅（含跨行 `.js:` 形态，该形态**不被口径正则捕获**，Developer 主动收敛 = P5 正向）。
- **计数口径**：提交信息「14 处」仅在**按改写位置（站点）计**时成立（A1+B1+C1+D10+E1 = 14）；按**引用**计 = 22（A2+B6+C2+D10+E2），按本审查 token 计 = 25。三口径均**不自相矛盾**，但「处」的定义未标注（R2 P3-1 同族）→ **P3-3**。

### 1.4 声称 6 — 门控 【一致；本审查为独立第 4/5 次跑】

| 项 | 声称 | 本审查独立实测 | 裁决 |
|----|------|---------------|------|
| `node tests/run-all.mjs` | exit 0 ×3（22.8 / 22.5 / 22.9s） | **exit 0 ×2**（23.1s / 26.7s） | ✅ 结论一致；耗时同量级 |
| 汇总行 | `ALL 20 SUITES + 4 RUNNER MODULES PASSED` | 逐字一致（末行含 `#SKIP 2 (smoke.mjs×2)`） | ✅ |
| `#SKIP` | 2 | **2**（0o600 POSIX / POSIX online checks，均 smoke.mjs） | ✅ |
| 并发披露 | 前 2 次于批 C 未提交树、第 3 次干净树、无重跑 | 本审查**只见双批已提交树**（HEAD = `ce8d908`，锁面 9 文件 diff vs HEAD = 0，批 C 已在历史内）⇒ 第 3 次结论可复现；前 2 次时点**无法回溯复现**（登记未验证项） | ✅ 披露属实（可核部分） |

### 1.5 声称 7 — census / 语法 / 结构守恒 【数字吻合；证据强度不足 → P2-1】

| 项 | 声称 | 本审查独立实测 | 裁决 |
|----|------|---------------|------|
| 9 文件断言 census（`check(` + `checks.push(`） | 234/23/84/29/20/547/14/37/0 | **逐文件逐数一致**（client-render 234 / fix-029 23 / oauth-main-model 84 / fix-012 29 / adapter-parity 20 / smoke 547 / fix-010 14 / metrics 37 / run-all 0） | ✅ |
| 「HEAD == 工作树逐文件恒等」 | 声称 | 成立但**平凡**：`git diff --name-only HEAD -- <9 文件>` = **0**，工作树与 HEAD 逐字节相同 | ⚠ 无信息量（P2-1） |
| `node --check` ×9 | OK | **exit 0 ×9** | ✅ |
| `host-contract.mjs` / `host-abi-health.mjs` 断言 | 118 / 178（未变） | **118** / **178**（汇总行 + `ok` 行计数双口径一致；两文件本批未改 ⇒ 恒真） | ✅ |
| 「纯注释/断言标签文本，零判据谓词变更」 | 声称 | **结论为真**，但**非 census 所能支撑**（§2.3 以更强判据独立证明） | ⚠ P2-1 |

### 1.6 声称 4 — 保留项可达性实证 【逐字复现】

对 `tests/host-contract.mjs:335` 的 `extra` 签名谓词（`signatures = ['types/agent.js:297-318', "key === 'modelSelection'"]`）在**内存内**（零仓库写）复算：

| 输入 | 谓词结果（按签名顺序） |
|------|---------------------|
| 现文 `tests/fix-029-host-contract.mjs` | **[true, true]** ✅ 与声称一致 |
| 假设去行号（内存内替换为 `types/agent.js 的 selection.current getter`，长度差 +19） | **[false, true]** ✅ 与声称**逐位一致** |

⇒ 声称「保留是**判据绑定**，非『不可稳定符号化』」**成立**（R2 P2-2 同类面的正向贡献）。

---

## 2. 专项复核

### 2.1 【验收标准 3】保留项的判据绑定 — 核心只读核验

**机制实读**（`tests/host-contract.mjs`，本批 diff 外，只读）：

```js
:335  extra: [{ file: 'tests/fix-029-host-contract.mjs', signatures: ['types/agent.js:297-318', "key === 'modelSelection'"] }],
:638  for (const extra of anchorCase.extra ?? []) {
:639    const source = readFileSync(join(ROOT_DIR, extra.file), 'utf8')      // ← 未过 stripComments
:640    const missing = extra.signatures.filter((signature) => !source.includes(signature))
:641    check(`S2 形状锚点: ${anchorCase.face} ← ${extra.file} 桩锚定宿主源码（P10-④ 判别夹具同源）`, missing.length === 0, missing)
```

**裁决**：`extra.signatures` **确**对 `tests/fix-029-host-contract.mjs` 形成**逐字在位断言**（原样文本 `.includes()`，且**不经**注释剥离 ⇒ 注释内的锚串同样受断言约束）。单侧去行号 ⇒ `missing = ['types/agent.js:297-318']` ⇒ 该 `check` 判红 ⇒ exit≠0。**「先改判据再改锚」的保留处置成立** ✅。

**三处同步的精确边界（本审查补充，供批 F/批 C）**：

| 站点 | 是否受**机器**约束 | 依据 |
|------|------------------|------|
| `tests/fix-029-host-contract.mjs:7`（锚串本体） | **是**（判红） | `host-contract.mjs:335` + `:638-641` |
| `tests/host-contract.mjs:335`（守卫 needle） | **是**（改锚须同步改 needle） | 同上 |
| `lib/prestep.js:152` | **否**（无守卫绑定该串） | `lib/prestep.js` 在该 anchor 面仅作 `consumer`（`:333`），其签名为 `["stateOf(agent?.session, 'modelSelection')", 'state.pending']`，**不含** `297-318`；全仓 `git grep '297-318'` = 4 处（fix-029:7 / prestep.js:152 / host-contract.mjs:335 / host-abi-health.mjs:998），无一处把 prestep.js 的该串机器绑定；`ANCHOR_CASES` **无** `file: ['lib','prestep.js']` 条目（实测 0 命中） |

⇒ 「三处同步」是 **P5 收敛纪律**（2 处机器锁 + 1 处纪律锁），提交信息将其表述为 `extra` 对「本文件与 lib/prestep.js」双绑 → **P3-1**。批 C 在 `lib/prestep.js:154-156` 留下的在仓注释表述**更精确**（「该断言的对象文件 = `tests/fix-029-host-contract.mjs`，同串亦在其内」）。

### 2.2 【验收标准 4】语义等价核验（机器判据，非计数）

**方法**（不采信 census）：自写扫描器（`%TEMP%`，只读仓库）对 `ce8d908^` / `ce8d908` 两版逐文件做——
1. 注释 → 同偏移空白（保换行）；2. 字符串字面量**内容** → 空白（保定界符）；3. 正则字面量**逐字保留为代码**（含引号/转义/字符类处理，保守取向 = **多检不多漏**）；4. 模板字面量逐字保留。
取变换后**全部非空白字符序列**比较。

| 文件 | 「注释/字符串内容之外」的代码字符序列 | 变更的字符串（计数） | 变更字符串位置判定 |
|------|-----------------------------------|-------------------|-----------------|
| `tests/adapter-parity.mjs` | **逐字节相同** | 3 | 全部为 `check(` **首参标签**（:126 / :289 / :321） |
| `tests/client-render.mjs` | **逐字节相同** | 1 | `check(` 首参标签（:2106） |
| `tests/fix-029-host-contract.mjs` | **逐字节相同** | 2 | `check(` 首参标签（:381 / :389） |
| `tests/metrics.mjs` | **逐字节相同** | 1 | `console.log(` 唯一实参（:528，观测面文本） |
| `tests/fix-010-gui-fidelity.mjs` | **逐字节相同** | 0 | 纯注释 |
| `tests/fix-012-image-takeover.mjs` | **逐字节相同** | 0 | 纯注释 |
| `tests/oauth-main-model.mjs` | **逐字节相同** | 0 | 纯注释 |
| `tests/run-all.mjs` | **逐字节相同** | 0 | 纯注释（`stripComments` 的 JSDoc 内，且该文件自身判据先剥离注释 ⇒ 零语义影响） |
| `tests/smoke.mjs` | **逐字节相同** | 0 | 纯注释 |

**裁决**：
- **零判据谓词变更**（比声称的结论更强：不是"计数未变"，而是**谓词代码逐字节未动**）；`check(label, predicate)` 三参形态下 label 与 predicate 为独立实参，label 变更**不可能**影响断言真值；7 处变更字符串**均为内联字面量**（未绑定到变量、未进入 `.includes()/.test()/===` 等判据位）。
- **`run-all.mjs` / `metrics.mjs` 重点面**：前者 = 注释（且该文件的反向守卫只认剥离注释后的代码文本）；后者 = `console.log` 观测文本，**不参与任何断言**（metrics.mjs 的 37 次 `checks.push(` 全在别处，未受影响）。
- **census 的作用边界**：census 只能证明「断言**位点数**未变」，不能证明「谓词语义未变」（`check('x', a===b)` → `check('x', c===d)` 计数恒等）；「HEAD == 工作树恒等」在锁面文件干净时**平凡真** ⇒ 以 census 作「纯文本改动」的证据**不成立**（→ **P2-1**，结论另经上表证明为真）。

### 2.3 【验收标准 5】反幻觉核验 — 24 处宿主/在仓对象实读

**A. 5 处「行号/归属错」勘正（重点）**

| # | 原锚 | 勘正声称 | 本审查实读（宿主 `@deepseek-ai` 树 / 仓库，只读） | 裁决 |
|---|------|---------|------------------------------------------|------|
| 1 | `client-render:379` `service.js:193` | 归属错；实为 model-selection 的 `directoryFor` 内 `lib/client.js:302` | 该包 `lib/` 仅 `client.js` / `index.js`（**无** service.js）；宿主全树 `resolved no scope` 命中 5 处，model-selection 的在 **`lib/client.js:302`**（`if (actx === void 0) throw new Error(\`ui-model-selection: session "..." resolved no scope\`)`）；无 `service.js` 含该串 | ✅ **成立**（措辞过宽见 P3-4） |
| 2 | `client-render:515` `lib/client.js:170 super(ctx,"modelDirectories")` | 漂移；`:170` 实为 `store.update`，注册实 `:272` | `:170 = this.store.update((s) => {`；`:272 = super(ctx, "modelDirectories");`；类定义 `:257 var ModelDirectoryResolver = class extends …Service` | ✅ **成立** |
| 3 | `client-render:518` `lib/client.js:193「resolved no scope」` | 漂移；实在 `:302` | `:193 = }`；`:302` = 上述 throw；`directoryFor` 定义 `:296`，JSDoc `:292` | ✅ **成立** |
| 4 | `fix-012:6` `dsh-host-apiproxy lib/index.js:2749-2760` | 该包**本机装态不存在**；实为 `dsh-api-session-controller` prompt 侧准入 `MODEL_DOES_NOT_SUPPORT_IMAGES` | 宿主包清单**无** `dsh-host-apiproxy`；`dsh-api-session-controller/lib/index.js:764` = `if (model.inputModalities !== void 0 && !model.inputModalities.includes("image")) throw new RemoteError("session/attachment-invalid", … { reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" })`，位于 `:753 const admit = async () => {` 的 prompt/附件准入路径（`:752 hasImage = request.content.some(…image)`） | ✅ **成立**（批 B `host-abi-health.mjs:796-799` 同判） |
| 5 | `fix-010:12` `dsh-agent-loop lib/index.js:554` | 行号错；持久化点实 `:1028` | `:554` = JSDoc（`* returns an aborted outcome. Scheduler failure drains dispatches without`）；`:1028` = `if (firstAttempt) for (const message of decision.messages) this.session.append("user/message", message, { surfaceOp: "append" });` | ✅ **成立** |

**B. 其余锚改写对象逐字在位（抽查 19 处，全部命中）**

| 锚（新文本对象） | 实读位置 | 裁决 |
|----------------|---------|------|
| `dsh-cordis-client-runner` `waitingFor`（client-render 跨行块） | `lib/client.js:581` `waitingFor: Object.keys(fiber.inject).filter(...)`；`dynamicCordisContext` `:319` | ✅ |
| model-selection `static inject` / 模块级 `inject` / `exports.inject` | `:258` / `:894` / `:964` | ✅ |
| `dsh-host-webserver` `register(route)` / `match(pathname)` | `:176` / `:322`；旧 `:128-135` = gzip 中间件 + JSDoc、`:269-279` = route 查找（含 `:279 if (route === void 0)`） | ✅ 旧锚确错、新锚确准 |
| `dsh-llm` `adapterStream` / `projectImagesForTextModel` / `textOnlyImageText` | `:2223 async *adapterStream(options, prepared)` / `:721` / `:541`；投影条件 `:2251` | ✅ |
| `dsh-llm` `LlmAdapter` / `prepareCall` / `:1645` 默认语义 | `:1618 var LlmAdapter = class`；`adapterStream` `:2231 if (prepared === void 0) {` → `:2232 adapter.prepareCall(...)`（「prepared 缺省分支」**逐字准确**）；`:1645 imageRequestPricing(_provider,_model) {}`，注释 `:1638 "The default declares none, so consumers fall back…"` | ✅ |
| `LlmRuntime.imageRequestPricing` 消费面 `:1996-1998` | `:1996 imageRequestPricing(provider, model) { return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model); }` | ✅ 现值准确 |
| `LlmRuntime` `registerAdapter` / `registration` / `listModels` | `:1780` / `:2177` / `:2018`（类 `:1698`） | ✅ |
| `LlmImageRequestPricing` / `LlmImageRequestPrice` | `lib/types/types.d.ts:171` 接口（`:177 priceImages(images: readonly ImageAttachmentRef[]): readonly LlmImageRequestPrice[]`）、`:159` 接口（`:161 visualTokens: number` / `:163 text: string`） | ✅ 与「方法式 `{priceImages(images)}` / `{visualTokens, text}`」逐字相符 |
| `dsh-system-prompt` `assemble()` 工具 schema 面 | `:308 async assemble(context = {})`；`:322 result.schemas.map(({ name, description, parameters }) => ({ … parameters: structuredClone(parameters) }))`（旧锚 `:254-258` 实为 JSDoc 尾 + `:255 getContextOrder(name)` + `:258` 注释头 ⇒ 漂移属实） | ✅ |
| `dsh-llm-pi-ai` `toolsOf(options)` / `UNSUPPORTED_CONTENT` | `:1191 function toolsOf(options)`（调用 `:1223`）；`:1845 if (containsImage && !model.input.includes("image")) throw new LlmError(…, "UNSUPPORTED_CONTENT")`（旧锚 `:1721` = `}` 收尾、`:1123-1128` = 注释头 + `flattenText` 文档 ⇒ 漂移属实） | ✅ |
| `dsh-api-session-controller` `selectModel(request)` / `Remote("selectModel")` | `:605 async selectModel(request) {` / `:2502 _selectModel_decorators = [Remote("selectModel")];` | ✅ |
| `dsh-api-remotes` `API_REMOTE_FORWARDED_EVENTS` 首项 | `lib/types/remote-events.js:12 export const API_REMOTE_FORWARDED_EVENTS = [`、`:13 { event: 'agent-preset/selected', mode: 'emit' }`；旧锚 `remote-events.js:21` = `{ event: 'credentials/reference-updated', mode: 'emit' }`（**现值准确**，改常量名式语义等价） | ✅ |
| `dsh-vision-router` `adapterHandlesImages` | `.tmp-research/dsh-vision-router/package.json` name = **dsh-vision-router** v1.6.0；`index.js:4832-4835` = 取舍注释（有适配器原样留块 / 否则 pre-step 改标记）、`:4836 const adapterHandlesImages = stealthActive || wrapperRegistered`（`:4838` 分支消费） | ✅ 新文本**逐字准确**（旧 `:4832-4835` 现值亦准确 ⇒ 「现值准确→去行号保留语义」处置正确） |
| `host-contract.mjs` 的 `stripComments`（run-all 新文本） | `tests/host-contract.mjs:96-99` = JSDoc + `const stripComments = (source) => …`（旧锚 `:96-99` 现值准确） | ✅ |
| `directory.d.ts` `load`（client-render 口径外） | `lib/types/client/directory.d.ts:60 load(): Promise<ModelDirectoryState>;`（旧锚 `:52` = JSDoc） | ✅ 漂移属实、改 `ModelDirectory.load` 正确 |

**零幻觉符号**：本批新增文本引用的宿主/在仓符号**无一处**无法定位；无「不可稳定符号化」式保留（唯一保留项为判据绑定）。

### 2.4 未闭合项登记核验（声称 9）

| 项 | 声称 | 本审查实读 | 裁决 |
|----|------|-----------|------|
| ①a `fix-029:15` `dsh-cordis-client-runner slots :2920-2932` | 现值成立 | 该区间为 slots 目录：`:2926 "useInput: SnapshotSelectorHook<InputState>"` / `:2927 "inputActions: InputActions"` / `:2929 "sessionId: SessionId"` | ✅ 成立 |
| ①b `fix-029:18` `dsh-client-ui-conversation :16041-16056` = PropsHooks 面 | **不成立**；实为 InputBar 渲染段、`PropsHooks` 零命中 ⇒ 须先定位真实归属 | `PropsHooks` 在该包 `lib/client.js` 内命中 = **0**；`:16041 const claimActive = (input?.phase === "claimed" …)` … `:16056 IconWarningOutline16`（JSX 渲染段） | ✅ 判据成立；**处置（拒按心智模型替换）正确**（P10-④），登记载体问题 → P3-2 |
| ② `client-render:423/:453-462` `L####` wire-schema 块部分漂移 | 已实测部分漂移，需逐 schema 符号名重建 | `dsh-api-remotes/lib/client.js:4709` = `…credentials_unset_parameter_0$schema = string()`、`:4711` = `…settings_canOpenAgentPresetDirectory_result$schema`、`settings_describe_result` 实 **`:4712`**（原文 claim 的 `L4709-4757` 起界错位）；`:5678-5681` = `}` / `wire: "agentId"`（parameters 段），`llm_listProviders_result` 实 `:5735`/`:5808` | ✅ **漂移主张成立**、延期处置合理 |
| ③ 三处锁外同族（`lib/index.js:84/:86`、`lib/prestep.js:69`、`lib/prestep.js:152`） | 归组 A/批 F | 本批零 `lib/**` 改动 ⇒ 确未顺带修；`lib/prestep.js:152` 现值成立（§2.1） | ✅ 属实 |

### 2.5 【验收标准 6】跨批一致性（仅佐证，不作裁决依据）

| 共享对象 | 批 C（`2ea0bc9`，独立交付）结论 | 批 D 结论 | 一致性 |
|---------|------------------------------|----------|--------|
| webserver 路由面 | `register(route)` 内支持前缀路由 / `match(pathname)` 最长前缀优先（**同款符号**） | 同 | ✅ |
| `toolsOf(options)` | 「provider schemas 解构面 + dsh-llm-pi-ai 的 `toolsOf(options)`」 | 同 | ✅ |
| `imageRequestPricing` | 「宿主 **dsh-llm 的 LlmAdapter 原型**新增」、空体默认语义 + `LlmRuntime.imageRequestPricing` 消费面 | 同（`LlmAdapter.imageRequestPricing` 默认语义 / `LlmRuntime.imageRequestPricing` 消费面） | ✅ |
| `dsh-vision-router` 取舍 | 「参考实现 **dsh-vision-router 的 `adapterHandlesImages`** 同款取舍」 | 同 | ✅ |
| `types/agent.js:297-318` | `lib/prestep.js:152` 保留原文不单侧去行号 + `:154-156` 判定「承载判据 / 断言对象文件 = tests 文件」 | 同（保留 + 判据绑定实证） | ✅ **一致** |
| 不一致项 | — | — | **0 项** |

⇒ **口径同源**（两批独立得出同一结论）为强旁证；唯一差异是**表述精度**（→ P3-1，批 C 在仓注释更精确）。

### 2.6 【验收标准 8】`ANCHOR_CASES` 清单质量（批 F 的输入）

**可核部分（本审查独立实测）**：

| 判断项 | 结果 |
|--------|------|
| 清单纯度 | **本审查可见输入不含清单本体（35 对 needle）** ⇒ **逐对复核未完成**（登记未验证项 1）；下表为**自推导样本**，非对 Developer 清单的确认 |
| 「stale 缺席 + fresh 在位」自推导样本 16 对（9 文件） | **16/16 通过**（`service.js:193`/`remote-events.js:21`/`lib/client.js:170`/`index.js:605,2502`/`lib/index.js:1698…`/`lib/index.js:254-258`/`lib/index.js:1123-1128`/`dsh-host-apiproxy lib/index.js:2749-2760`/`lib/index.js:1721`/`lib/index.js:1681-1686`/`:1996-1998`/`index.js:128-135`/`269-279`/`lib/index.js:554`/`index.js:4832-4835`/`host-contract.mjs:96-99` 全部**缺席**；对应新符号式锚全部**在位**） |
| 自碰撞提示 3 条 | **3/3 成立**：`lib/index.js:19` 已是既有 stale 元素（`host-abi-health.mjs:806`）；`index.js:605,2502` ⊂ 既有元素 `lib/index.js:605,2502-2503`（`:960`，另 `:743` 为带空格变体）⇒ 若作 needle 必触发 9h-4「登记 1 / 守卫内 ≥2」判红；`lib/client.js:` 在守卫内 **20 次** |
| 归属标注（9 文件 needs-entry） | **与实测相符**：`client-render.mjs`(`:738`)、`fix-012-image-takeover.mjs`(`:924`)、`smoke.mjs`(`:752`)、`metrics.mjs`(`:748`)**已有条目**（前 3 者 + metrics 属「扩既有条目」）；`fix-029-host-contract.mjs`/`oauth-main-model.mjs`/`adapter-parity.mjs`/`fix-010-gui-fidelity.mjs`/`run-all.mjs` **无条目**（需**新增**） |
| `metrics.mjs` 对象不可机器核验的限制是否如实标注 | **如实且实质正确**：`.tmp-research/` 为 `.gitignore:16` 忽略、未入版本控制 ⇒ CI/净克隆不可达；`dsh-vision-router` 在宿主装态**不存在**（`Test-Path` = False）⇒ 该对象**唯一**参考面就是该本地副本。**措辞不精确**：「仓库外参考副本」实为**仓库路径内、版本控制外**（→ P3-5 附注） |
| 登记形态可行性（对照既有条目约定） | **成立**：既有条目即 `{ file: [...], stale: [旧行号式/旧式锚], fresh: [符号名式/内容式锚] }`（如 `:748` metrics、`:752` smoke 的 `'host-contract.mjs:82-88'` → `'host-contract.mjs 的 \`check(label, condition, detail)\`'`）——批 D 的改写式（`host-contract.mjs:96-99` → `host-contract.mjs 的 stripComments`）与**既有约定同构** ⇒ 机械可登记 |
| **保护窗口（本审查发现的实质时序风险）** | 现存 4 个既有条目（client-render `:738` / fix-012 `:924` / smoke `:752` / metrics `:748`）的 `stale` 列表**不含**本批清除的任何锚（逐条实测 `service.js:193`/`remote-events.js:21`/`lib/client.js:170`/`L342`/`L581` 等**均不在其中**）；5 文件**无条目**；三形态行号正则仅存于注释（`host-abi-health.mjs:781`，代码内 0 使用）⇒ **在批 F 落地前，本批收敛的锚可被无声重引入（重引入不判红）** → **P3-5** |

---

## 3. 五维度逐项结论

### 维度 1：正确性 — **通过（P2×1 / P3×5 备注）**
- **口径数字正确**：19 / 19 / 1 三时点 + 逐文件分布 + 余项身份**逐数复现**（§1.2）。
- **处置正确性**：19 处中 5 处「行号/归属错」的勘正结论**逐条成立**（§2.3-A）；13 处「现值准确」的按符号名式保留**语义等价**（§2.3-B）；1 处保留**判据绑定成立**（§2.1）。
- **语义等价正确**：零谓词变更（§2.2，机器判据）。
- **未闭合项判定正确**：①b 的「非 PropsHooks 面」判据成立且**拒绝伪造**（§2.4）。
- **边界/并发/资源**：本批为零运行时代码的文本改动；无异步/共享状态/资源面（9 文件均测试代码，断言面未变）。

### 维度 2：安全性 — **通过（无发现）**
- 不进入产品运行路径（零 `lib/**`）；diff 内 `eval(`/`new Function`/`execSync`/`spawn`/`child_process` = **0**；无凭据/token/密钥；无新增网络/认证/注入面（OWASP Top 10 无新增）。
- 唯一「外部接触」为宿主源码**只读**读取（测试内既有形态），本批未新增读取路径（改动全在注释/标签）。

### 维度 3：可维护性 — **通过（P3×3 备注）**
- 正向：行号式锚 → **符号名/常量名/代码串式**，显著降低宿主/仓库演进导致的锚漂移率；跨行 `.js:` 形态一并消除（P5 正向，非单点）。
- 归属标注统一为「包名 + 文件 + 符号」式，与既有 `ANCHOR_CASES` 条目约定**同构**（§2.6）。
- 负向：**注释标签内的锚对象**依赖人工实读（无机器看护窗口，→ P3-5）；两条未闭合项仅登记于提交信息（→ P3-2）；计数单位未标注（→ P3-3）。
- 命名/函数长度/重复代码：无代码结构变更，均不适用（未变）。

### 维度 4：性能 — **通过（无发现）**
- 门控耗时 23.1s / 26.7s，与批 E（22.8~23.4s）、批 B（22.7~23.5s）**同量级 ⇒ 无回退**；改动为注释/字符串常量，零运行时路径。

### 维度 5：测试覆盖 — **通过（P3×1 备注）**
- 本批**不新增/删除断言位点**（census 恒等）；语义等价 ⇒ 既有 20 套件 + 4 runner 的判别力**零回退**（门控 exit 0 ×2）。
- 负向：新锚**尚无 stale/fresh 看护**（批 F 前存在再漂移静默窗口，→ P3-5）；本批亦未新增针对「锚形态」的判据（属批 F 面，非本批义务）。

---

## 4. AI 代码专项 5 项检查

| # | 检查项 | 结论 | 事实依据 |
|---|--------|------|---------|
| 1 | **mock 残留** | **无发现** | diff 内 `mock`/`stub`/`dummy` 命中均为**既有**语义（modelDirectories stub 等，本文本未改其逻辑）；变更仅注释/标签 |
| 2 | **硬编码返回值** | **无发现** | 无 `return true` / `\|\| true` / `=== true` 新增；谓词逐字节未变（§2.2 机器判据） |
| 3 | **幻觉 API / 幻觉符号** | **零幻觉（24 处实读复核，含 5 处勘正）** | §2.3：宿主 20+ 处、在仓 4 处逐字在位；**无一处**引用不可定位符号；`dsh-host-apiproxy` 确不存在（勘正依据） |
| 4 | **未实现 TODO** | **无发现** | diff 内新增 `TODO`/`FIXME` = 0；未闭合项以**提交信息 + 结构化返回**登记（在仓零登记 → P3-2） |
| 5 | **过度实现** | **无发现（1 处措辞过宽 → P3-4；1 处绑定面过宽 → P3-1）** | 9 文件改动全在锚引用/标签同域，零「顺带重构」；`+53/−49` 与逐处枚举自洽；跨行 `.js:` 与口径外同对象收敛属**同对象**（非越界扩面） |

---

## 5. 发现清单（逐条带级别 + 可复查事实）

### P2-1 — 声称 7 的证据形态**不足以**支撑其结论：「census 恒等 ⇒ 纯注释/标签文本改动，零判据谓词变更」
- **位置**: commit message「证据（实跑）」节（断言计数句）；对照本批交付物 `ce8d908` 全 9 文件
- **事实依据**：
  - census 数字**本身正确**（本审查逐文件复现 234/23/84/29/20/547/14/37/0）；
  - 但「HEAD == 工作树逐文件恒等」**平凡真**——`git diff --name-only HEAD -- <9 文件>` = 0（工作树与 HEAD 逐字节相同），该比较**不含**任何关于"改了什么"的信息；
  - census 是**计数**：谓词替换（`a===b` → `c===d`）、断言语义弱化、同位数点替换**均不改变计数** ⇒ 计数恒等**不能**推出「零判据谓词变更」。
- **影响**：结论**为真**（本审查以「代码字符序列逐字节相同 + 7 处变更字符串全在标签位」独立证明，§2.2）；但该推理形态若被后续批沿用为「纯文本改动」的标准证据，会**继承同一盲区**（与 R2 P2-3「判定面与声明面不等宽」同族；FIX-041/042 系列亦有「口径必须与判定面等宽」的既有纪律）。
- **修复建议**：证据行改为「(i) 9 文件 comment/string 骨架**逐字节相同**（脚本与口径随附）；(ii) census 仅作『断言位点数未变』的**辅助**指标」。
- **级别理由**：**非阻塞**——结论经独立更强判据证明为真、门控双绿、零判据/产品影响；属**证据强度/方法论**缺陷。

### P3-1 — 提交信息把 `lib/prestep.js` 纳入 `extra` 的机器绑定面（实际只绑定 tests 文件）
- **位置**: commit message 索引 6（「host-contract.mjs 的 `extra` 签名逐字断言该串在**本文件**与 lib/prestep.js 在位」）
- **事实依据**: `tests/host-contract.mjs:335` 的 `extra` 仅声明 `file: 'tests/fix-029-host-contract.mjs'`，`:638-641` 只对该文件做原样 `.includes()`；`lib/prestep.js` 在该 anchor 面仅作 `consumer`（`:333`），其签名不含 `297-318`；`ANCHOR_CASES` 无 `lib/prestep.js` 条目（0 命中）。批 C 在 `lib/prestep.js:154-156` 的在仓注释表述**正确**（「断言的对象文件 = tests/fix-029-host-contract.mjs」）。
- **影响**: 保留处置**不受影响**（仍须三处同步）；但按现措辞可能被误读为「改 `lib/prestep.js:152` 会判红」（实际**不会**）；反向风险 = `lib/prestep.js` 的该锚**无机器看护**。
- **修复建议**: 采用批 C 措辞；或在索引 6 括注「机器锁 = tests 文件 + 守卫 needle；prestep.js 为 P5 收敛面（无守卫绑定）」。
- **级别理由**: **非阻塞**——措辞/归属精度，零判据影响；结论与批 C 一致。

### P3-2 — 未闭合项 ① 的在仓文本仍为**已知错**锚，且两条未闭合项**仓内零登记**
- **位置**: `tests/fix-029-host-contract.mjs:18`（`（PropsHooks：input → useInput，dsh-client-ui-conversation :16041-16056）`）；登记载体 = commit message / 结构化返回
- **事实依据**: `PropsHooks` 在 `dsh-client-ui-conversation/lib/client.js` 命中 = **0**；`:16041-16056` 为 InputBar 渲染段（`:16041 const claimActive…` → `:16056` JSX `IconWarningOutline16`）⇒ 该锚对象不成立；且该锚**不在** 19 口径内、**不在**「14 处口径外收敛」枚举内 ⇒ 不落入任何已公布计数。
- **影响**: 处置（拒绝按心智模型替换、延期定位）**正确**（P10-④）；但仅存在于提交信息 ⇒ 后续批若只读仓内文本会漏；对比批 E 在 `host-abi-health.mjs:998` 有在仓 notes。
- **修复建议**: 批 F 的清单同步写入在仓 notes；或在 `:18` 行内加「（未闭合：锚对象不成立，待定位）」标注。
- **级别理由**: **非阻塞**——登记载体/可追溯性，不改判据。

### P3-3 — 「口径外同对象收敛 14 处」计数单位未标注（站点 14 / 引用 22 / token 25）
- **位置**: commit message「口径外同对象收敛（14 处…）」节
- **事实依据**: 按**改写位置（站点）** = 14（A1+B1+C1+D10+E1）✅；按**引用** = 22（A2+B6+C2+D10+E2）；按本审查实测（仅删除行的口径外 token，含 `157-161`、`types.d.ts:171-178`）= **25**（21 行）。
- **影响**: 数字不自相矛盾但不自明；R2 P3-1（口径粒度未标注）同族。建议括注「14 处 = 改写位置数；引用 22 处」。
- **级别理由**: **非阻塞**——讨论级计数口径标注。

### P3-4 — 「宿主树无该 `service.js`」措辞过宽（宿主树存在 3 个 `service.js`）
- **位置**: commit message 索引 1
- **事实依据**: 宿主全树 `service.js` = 3 个（`dsh-api-session-controller/lib/types/client/sessions/service.js`、`dsh-api-workspace-controller/lib/types/client/service.js`、`dsh-typert-registry/lib/types/service.js`）；但 `dsh-client-ui-model-selection/lib` **确无** service.js，且全树**无任何** `service.js` 含 `resolved no scope` ⇒ 归属错的**实质判据成立**。
- **影响**: 结论正确，仅措辞过宽。建议：「该包内无 `service.js`；宿主全树无 `service.js` 含该串」。
- **级别理由**: **非阻塞**——事实性措辞精度。

### P3-5 — `ANCHOR_CASES` 清单不可全量核实（未验证）+ **批 F 前的保护窗口**（收敛后无 stale 看护）
- **位置**: 批 F 输入清单（Developer 结构化返回）；对照 `tests/host-abi-health.mjs` ANCHOR_CASES 数据区
- **事实依据**:
  - **清单本体（35 对）未随派发信息传入本审查** ⇒ 逐对复核**未完成**（未验证项 1）；本审查以自推导 16 对样本（9 文件）+ 3 条自碰撞提示 + 归属实测替代核验，结果 16/16 与 3/3 全部通过（§2.6）。
  - **保护窗口**：既有条目（`:738`/`:924`/`:752`/`:748`）的 `stale` **不含**本批清除锚（逐条实测）；5 文件**无条目**；三形态行号正则**仅存于注释**（`:781`），代码内 0 使用 ⇒ **当前重引入本批已清除的任何行号锚均不判红**。
- **影响**: 该窗口是既定分批计划（批 F）的已知时序，**非本批缺陷**；但 MUST 登记，否则后续可能误以为「19+14 处已受看护」。同时：`.tmp-research/` 的**「仓库外」措辞不精确**（在仓库路径内、`.gitignore:16` 忽略、版本控制外）。
- **修复建议**: 批 F 对 **9 文件全部**建/扩 `stale`（含 5 个新增条目），沿用既有「stale = 已清除锚 / fresh = 新符号式锚」约定（`:748`/`:752` 已是该形态）；清单条目注明「对象参考面 = 未入版本控制的本地副本」而非「仓库外」。
- **级别理由**: **非阻塞**——属时序/登记纪律与措辞精度。

---

## 6. 设计一致性 / 原则符合性

| 依据 | 检查结论 |
|------|---------|
| `arch-004-compatibility-design.md` §5.1（第 2 项「宿主源码形状锚点测试」：测试桩逐字锚定宿主源码行号/导出名） | **一致**——本批把**行号式**锚升级为**符号名式**锚，仍满足「锚定宿主源码」的实质（且更稳健）；`tests/fix-029-host-contract.mjs` 的宿主面锚**未削弱**（判据绑定，§2.1） |
| **P1**（基于事实，禁假设/编造） | **满足**——5 处勘正均以宿主实读为依据；未闭合项**拒绝**按心智模型替换（§2.4-①b） |
| **P4**（产品代码变更跑全量测试网，零回退） | **满足**——门控独立 exit 0 ×2；零 `lib/**` 改动；断言位点与谓词零变更 |
| **P5**（同一动作汇入同一实现路径；禁单点修改） | **正向**——同对象的口径外形态（跨行 `.js:`、裸 `:NNN`、`L###`）**一并收敛**；未闭合项登记后由后续批统一处理，未留半改状态 |
| **P8**（失败与降级可观测） | **满足**——本批不触碰判据与诊断面；未闭合项如实登记（载体问题 → P3-2） |
| **P9**（宿主演进防御） | **正向但存留缺口**——消除行号漂移面降低宿主演进风险；`lib/prestep.js` 的同类锚**无守卫**（→ P3-1）与批 F 前的保护窗口（→ P3-5）为剩余面 |
| **P10-④**（测试桩宿主面 MUST 锚定宿主源码；禁按心智模型伪造） | **满足**——24 处实读复核全部在位；`fix-029:18` 的错锚**未被**替换为捏造符号（如实登记） |
| **AI 专项 no-overclaim** | **一处过宽措辞 → P3-1 / P3-4**（均非判据面） |

---

## 7. 独立复算命令与关键输出（可复查）

| # | 命令（摘要） | 输出摘要 |
|---|-------------|---------|
| 1 | `git show --name-only ce8d908` / `--numstat` | 9 文件（全 `tests/`）；`+53/−49` |
| 2 | `git grep -nE '([A-Za-z0-9_./-]+\.(js\|mjs)):[0-9]+(-[0-9]+)?' {813c4a9\|cfe7756\|HEAD} -- <9 文件>` | **19 / 19 / 1**（逐文件分布一致；余项 = `fix-029-host-contract.mjs:7`） |
| 3 | `git diff -U0 ce8d908^ ce8d908 -- <9 文件>`（口径外形态统计） | 删除行含口径外形态 **21 行 / 25 token**；**新增行 = 0** |
| 4 | 骨架等价脚本（`%TEMP%\fix043r4\equiv.cjs`，注释/字符串内容置空 + 正则逐字保留） | 9/9 文件 `identicalCode = true`；变更字符串 7 处全部 `labelPos = true` |
| 5 | `node tests/run-all.mjs` ×2（仓库内，HEAD=`ce8d908`） | **exit 0 ×2**（23.1s / 26.7s）；`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED`；`#SKIP 2 (smoke.mjs×2)` |
| 6 | `node tests/host-contract.mjs` / `host-abi-health.mjs` | `ALL HOST CONTRACT GUARD TESTS PASSED (118 assertions)` / `ALL HOST ABI HEALTH TESTS PASSED (178 assertions)`，exit 0 |
| 7 | `node --check <9 文件>` | exit 0 ×9 |
| 8 | census（`check(` + `checks.push(` 逐文件） | 234/23/84/29/20/547/14/37/0（与声称逐数一致） |
| 9 | `extra` 谓词内存复算 | 现文 `[true,true]` → 去行号 `[false,true]` |
| 10 | 宿主实读（`Test-Path`/`Get-Content`/`Select-String`：dsh-llm、dsh-llm-pi-ai、dsh-system-prompt、dsh-agent-loop、dsh-api-session-controller、dsh-api-remotes、dsh-host-webserver、dsh-client-ui-model-selection、dsh-cordis-client-runner、dsh-client-ui-conversation、types.d.ts） | 24 处锚对象逐字在位；`resolved no scope` 全树 5 处、`PropsHooks` = 0、`service.js` = 3（均不含该串） |
| 11 | `git status --short` / `git diff --name-only HEAD -- <9 文件>` / 未跟踪非治理项计数 | 锁面 diff = 0；未跟踪非 `.governance` = 0；HEAD 不变 |

---

## 8. 仓库外只读接触面逐条上报（M7.7 R4 — 本审查自身）

全部**只读**（`Test-Path` / `Get-Content` / `Select-String` / `Get-ChildItem -Recurse -Filter`），**零写入、零创建、零删除、零 `$DSH_HOME` 接触、零安装/验收动作**：

| # | 时间（+08:00） | 命令（摘要） | 退出码 | 影响路径 |
|---|---------------|-------------|--------|---------|
| 1 | 11:28–11:40 | `Get-ChildItem -Recurse -Filter *.js` + `Select-String -SimpleMatch 'resolved no scope'`（宿主全树递归只读扫描） | 0 | `<host>\**`（只读） |
| 2 | 11:30–11:42 | 逐文件 `Get-Content` 行读取 + `Select-String` 符号核验（dsh-llm `/index.js`、`/types/types.d.ts`；dsh-llm-pi-ai；dsh-system-prompt；dsh-agent-loop；dsh-api-session-controller；dsh-api-remotes；dsh-host-webserver；dsh-client-ui-model-selection `lib/client.js` + `types/client/directory.d.ts`；dsh-cordis-client-runner；dsh-client-ui-conversation） | 0 | 上述 10 个宿主包（只读） |
| 3 | 11:33 | `Get-ChildItem -Recurse -Filter service.js`（宿主全树只读列举） | 0 | `<host>\**`（只读） |
| 4 | 11:35 | `Test-Path <host>\dsh-vision-router` + 只读 `Get-Content` `.tmp-research\dsh-vision-router\{index.js,package.json}` | 0 | 宿主包存在性探询；**仓库内**未跟踪副本（`.gitignore:16`）只读 |
| 5 | 11:24 / 11:44 | `node tests/run-all.mjs` ×2（读仓库 + 读宿主；`node_modules` 为仓库内既有依赖） | 0 / 0 | 仓库工作目录（只读） |

- **仓库外写入面**：仅 `%TEMP%\fix043r4\`（本审查自建的两个只读分析脚本 `skeleton.cjs`/`equiv.cjs`/`equiv2.cjs`）——**已删除**（`Test-Path` = False）；**零仓库内写入**（本报告除外）。
- **受审前后一致性**：`HEAD = ce8d9080d2afa8bdd3d2b0d52c10640d2a716555` 全程不变；`git status --short` 与受审前一致（`.governance/{evidence-log,plan-tracker}.md` + `tpa-last-run.json` 为 `M`，6 份既有 R0–R2 报告为 `??`）；锁面 9 文件 vs HEAD diff = 0；未跟踪非 `.governance` 文件 = 0 —— **本审查零仓库文件修改**。
- **破坏性红线**：未触及用户 HOME 配置目录、`$DSH_HOME`、仓库外任意路径的**写**操作；本题面（测试文本改写）**不涉及**真实环境安装/验收 ⇒ 三选一规则**不适用**（无 `$HOME` 写操作、无安装/验收动作）。

---

## 9. 未验证项（如实登记，**不作为通过依据**）

1. **`ANCHOR_CASES` 需求清单本体（9 文件 × 35 对 needle）**：本审查可见输入仅含其**摘要**（needle/fresh/归属/自碰撞提示要点），**清单全文未随派发信息传入** ⇒ 逐对复核**未完成**；本报告以自推导 16 对样本 + 3 条提示 + 归属实测作**部分**替代核验（结果全通过），但**不声称**该清单全部 35 对均已被独立验证。
2. **Developer 会话内真实环境只读接触面的逐条上报（10 组）**：本审查无其会话记录 ⇒ **未复核**（R4 义务主体 = 执行者；本报告仅登记本人接触面，§8）。
3. **前 2 次门控跑于「批 C 未提交工作树」的时点**：无法回溯复现（本审查只见双批已提交树）⇒ 该披露**未独立核验**（不影响第 3 次干净树结论，本审查独立复跑 2 次均绿）。
4. **`.tmp-research/dsh-vision-router/index.js` 与真实上游 `dsh-vision-router@1.6.0` 的一致性**：该副本**未入版本控制**、无来源校验面（哈希/来源记录）⇒ 仅核到「副本内 `:4832-4835` 注释 + `:4836 adapterHandlesImages` + `package.json name` 与 metrics.mjs 新文本一致」；副本与上游是否同源**未验证**。
5. **CI 侧 `#SKIP` 实时值**：无 CI 访问权限；本报告 skip 结论限于本地 Windows 口径 `#SKIP 2`（本审查 ×2 复现）。

---

## 10. 交付结论摘要（供 Coordinator）

- **结论**: **`APPROVED_WITH_NOTES`**
- **`unresolved_blockers=0`**
- **P0 = 0；P1 = 0；P2 = 1（P2-1）；P3 = 5（P3-1…P3-5）**
- **保留项裁定**：**成立** —— `extra.signatures` 逐字在位断言真实存在且绑定 `tests/fix-029-host-contract.mjs`；谓词 `[true,true]` → 去行号 `[false,true]` ⇒ 「先改判据再改锚」必要；「判据绑定、非不可符号化」的定性**正确**（R2 P2-2 同类面正向贡献）。**精确化补充**：三处同步 = 2 处机器锁（tests 文件 + 守卫 needle）+ 1 处 P5 纪律锁（`lib/prestep.js`，无机器绑定）。
- **语义等价裁定**：**成立（强于声称）** —— 9/9 文件「注释/字符串内容之外」代码字符序列**逐字节相同**；7 处字符串变更**全部**位于 `check(`/`console.log(` 首参标签位；`run-all.mjs` = 纯注释、`metrics.mjs` = 观测输出文本。census 不足以支撑该结论（P2-1），结论另经更强判据证明为真。
- **`ANCHOR_CASES` 清单质量裁定**：**可机械登记性成立**（与既有条目约定同构）、**归属标注与实测相符**、**自碰撞提示 3/3 成立**、**`metrics.mjs` 不可核验限制如实标注**（措辞「仓库外」宜改为「版本控制外」）；**清单本体 35 对未获独立复核 → 未验证项 1**；**新增发现：批 F 前的保护窗口**（现无任何守卫扫描这 9 文件的行号形态 ⇒ 本批收敛锚可被无声重引入 → P3-5，非本批缺陷但 MUST 登记）。
- **独立复算吻合项**：越界 9 文件 +53/−49 ✅ / 口径 19·19·1 + 逐文件分布 + 余项身份 ✅ / 门控 exit 0 ×2 + `#SKIP 2` ✅ / 断言 118·178 ✅ / census 234…0 ✅ / `node --check` ×9 ✅ / 保留谓词 `[true,true]→[false,true]` ✅ / 24 处锚对象实读 ✅ / 5 处勘正 ✅ / 跨批一致 5/5 ✅ / 仓库零变化 ✅。
- **建议遗留计划**：P2-1（证据形态：把「骨架逐字节相同」补入证据行，**建议本批尾修 commit message 或在批 F 报告中固化该方法**）；P3-1/P3-4（措辞精度，**建议并入批 F 的清单说明**）；P3-2（两条未闭合项的**在仓登记**，建议随批 F 落地）；P3-3（计数单位括注）；P3-5（批 F 对 9 文件建/扩 `stale` 条目，**且为消除窗口的最小必要动作**）。
- **无阻塞项** ⇒ 可按治理流程机录 REVIEW 并进入后续批次（批 C 审查 R3 → 批 F）。

---

**审查者**：Code Reviewer Agent（只读审查；唯一产出物 = 本文件）
**报告路径**：`.governance/review-FIX-043-R4-input.md`
**下一步**：Coordinator 用 `review-record` 机写 canonical 报告与 REVIEW 证据行（本报告不作为机录替代）。
