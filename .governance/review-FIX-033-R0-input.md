# REVIEW — FIX-033-R0：LlmAdapter 契约对齐代码审查（Round 0）

- **Task ID**: FIX-033-R0（P0）
- **Reviewer**: Code Reviewer Agent（只读审查；本文件为唯一输出）
- **审查对象**: commit `c89d635ee806c7e56c28bee0180d28729c452287`（3 files，+101/−23：lib/wrapper.js / tests/adapter-parity.mjs / tests/smoke.mjs）
- **宿主参照**: `@deepseek-ai/dsh-llm` 0.1.5-rc.2（package.json version 实读确认）
- **工作区核验**: 3 文件相对 c89d635 零 diff（`git diff c89d635 --stat -- <3 files>` 空）——工作区态 = 提交态；EVO-019 在途修改（lib/client.js/rpc.js/schemas.js/package.json/tests/served-client.js/lib/host-abi//tests/host-abi-health.mjs）与审查对象无交集
- **审查边界**: 未复跑任何测试（工具边界：只读审查，Coordinator 复跑裁终）；所有结论基于实读源码/diff 的静态证据

---

## 结论

**APPROVED_WITH_NOTES**

```json
{
  "conclusion": "APPROVED_WITH_NOTES",
  "unresolved_blockers": 0,
  "counts": { "P0": 0, "P1": 0, "P2": 2, "P3": 3 },
  "round": 0
}
```

**一句话理由**：三组宿主契约锚点（:1645/:1996-1998、:2251/:721-729/:541-543、原型六方法枚举）逐一实读全部核实无幻觉锚，twin 镜像实现语义正确（同步零 I/O/未声明回落 undefined/原 provider id 透传/抛错 fail-safe），负向见证经静态推演具真实判别力；遗留 2×P2（夹具形状未锚定宿主 schema、抛错路径无测试）+3×P3，均不阻塞。

---

## 一、宿主锚点核验表（P10-④ 纪律——逐行实读 dsh-llm lib/index.js @0.1.5-rc.2）

| # | Developer 锚点声称 | 实读结果 | 判定 |
|---|---|---|---|
| A1 | `:1645` 基类原型新增 imageRequestPricing | `var LlmAdapter = class {`（:1618）类体内 `imageRequestPricing(_provider, _model) {}`（:1645），空方法体 = 默认返回 undefined | ✅ 核实 |
| A2 | 签名 `(provider, model)` | `(_provider, _model)`，文档注释 :1641-1642「a route passed to registerAdapter() / exact model id passed to GenerateOptions.model」 | ✅ 核实 |
| A3 | 同步零 I/O（:1639） | :1639 原文 "Implementations must answer synchronously without I/O; the token meter resolves this per measurement" | ✅ 核实 |
| A4 | 运行时消费 :1996-1998（token meter 取价） | `LlmRuntime.imageRequestPricing(provider, model)`（:1996-1998）= `return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model)`——逐路由经 adapters.get(provider).adapter 解析；「token meter」表述与 :1640/:1988 注释一致 | ✅ 核实 |
| A5 | `:2251` adapterStream 边界投影 | :2251 原文 `if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image") && projectedMessages.some(...contentHasImage...)) projectedMessages = projectImagesForTextModel(projectedMessages);` | ✅ 核实 |
| A6 | `projectImagesForTextModel` :721-729 | :721-729 函数体：图片消息浅拷贝并经 replaceImagesForTextModel 替换 | ✅ 核实 |
| A7 | 替换为 `textOnlyImageText` :541-543 占位文本 | 调用链闭合：:724 → replaceImagesForTextModel（:690）→ :697 `text: textOnlyImageText(block.attachment)` → :541-543 函数体返回确定性占位 `[image omitted because this model accepts text only; attachment sha256:...]` | ✅ 核实 |
| A8 | rc.2 原型六方法（providerInfo/providerRetryPolicy/imageRequestPricing/listModels/resolveModel/prepareCall） | 类体 :1618-1687 全读：providerInfo(:1624)/providerRetryPolicy(:1635)/imageRequestPricing(:1645)/listModels(:1653)/resolveModel(:1665)/prepareCall(:1681-1686)——恰六方法，无其他 | ✅ 核实 |
| A9 | prepareCall 回归原型 :1681；adapterStream :2232 无 prepared 分支仍先调 | :1681-1686 原型实现（绑 resolveModel + stream 入口）；:2231-2232 `if (prepared === void 0) { const adapterCall = await adapter.prepareCall(...)` | ✅ 核实 |
| A10 | `textOnlyImageText` 为宿主导出（smoke import 合法） | :2326 导出清单含 textOnlyImageText（另 BlockAssembler/LlmRuntime/contentHasImage 均在）——import 非幻觉 API | ✅ 核实 |
| A11 | 投影后终态 stop 非 error | 静态推演：投影发生在 dispatch（:2259）前，适配器不再见裸图块 → 无 UNSUPPORTED_CONTENT 抛错 → 正常 finish（smoke 断言经真实 LlmRuntime 实证该链）；运行时未复跑（Coordinator 裁终） | ✅ 核实（静态） |

**错锚/幻觉锚检查：零。** 全部 11 组锚点行号与语义精确命中。

---

## 二、Developer 声称逐条核验表

| # | 声称 | 判定 | 依据 |
|---|---|---|---|
| C1 | imageRequestPricing 契约取证（:1645/:1639/:1996-1998 + twin 镜像语义：原 provider id 透传/未声明→undefined/抛错 fail-safe） | **核实** | 锚点表 A1-A4；twin 实现 lib/wrapper.js:352-361 与全部镜像方法（providerInfo:318/providerRetryPolicy:329/listModels:366/resolveModel:380）传参约定一致（均以原 provider id 委托 base） |
| C2 | adapterStream 语义翻转史（rc.7 投影→rc.8 error→rc.2 投影回归；smoke 负向见证重锚定 = stop 终态 + delegate 零裸图块 + 占位逐字锚定宿主导出） | **核实**（当前态全实读；rc.7/rc.8 历史断言依仓内记载一致） | rc.2 当前态 = 锚点表 A5-A7/A11；rc.8 旧期待可见于本 diff 删除行（旧断言 `finish.kind === 'error'` + delegate 含裸图块）；rc.7/rc.8 源码不在本机（历史部分依 FIX-001/FIX-006 记载与 diff 前后态交叉一致，非幻觉——锚点均可复查） |
| C3 | 枚举 diff 全量：rc.2 六方法，twin 唯一缺口 = imageRequestPricing，其余零差异 | **核实** | 锚点表 A8；wrapper.js 提交态方法集 = providerInfo/providerRetryPolicy/**imageRequestPricing（本 commit 新增）**/listModels/resolveModel/prepareCall/stream——diff 前唯一缺口即定价方法；stream 维持静态补集（抽象声明不在原型） |
| C4 | 测试 23 断言（7a/7b）+ 判别力 DEMO-A/DEMO-B 提交前还原 | **核实** | 逐 check 计数：test0(1)+test1(7)+test2(4)+test3(2)+test4(1)+test5(3)+test6(3)+test7(2)=**23**；7a（adapter-parity.mjs:248-257）未声明→undefined；7b（:259-278）`returned === PRICING` 引用相等 + `seenArgs[0].provider === 'fake-priced'`（原 id，非 `fake-priced-router`）+ 未 await 调用（异步化返回 Promise → 引用比较必败）；DEMO-A 静态推演成立（幻觉硬编码→7a 红；错路由 id/克隆返回→7b 红）；DEMO-B 静态推演成立（投影消失→fixture 适配器 :2364 UNSUPPORTED_CONTENT 自拒守卫→error 终态红 + 零裸图块断言红，双通道）；两测试文件 grep DEMO/TODO 零残留 |
| C5 | RED（两红）→GREEN（负责面全绿）；全量网 23 套件 22 绿 1 红（host-abi-health = EVO-019 在途，零耦合非回退） | **部分核实** | 静态推演一致：rc.2 下提交前红 = test1 契约方法枚举检查（twin 缺 imageRequestPricing→typeof 红）+ smoke 旧负向见证（期待 error 终态，rc.2 实际 stop）——"两红"定位精确；tests/ 目录恰 23 个 .mjs（含在途 host-abi-health.mjs）；host-abi-health.mjs 导入面 = lib/rpc.js/schemas.js/host-abi/（全 EVO-019 在途面），零引用本 commit 3 文件——零耦合成立。**测试运行结果未复跑（工具边界），由 Coordinator 复跑裁终** |

---

## 三、5 维度逐项结论

### 3.1 正确性 ✅（无发现）
- `imageRequestPricing(_route, model)`（wrapper.js:352-361）：以原 provider id 委托 base（:356），与 providerInfo/providerRetryPolicy/listModels/resolveModel 镜像传参约定完全同构。
- 边界全覆盖：base 未注册（original() 内 catch→undefined）→ undefined；base 无该方法（`typeof !== 'function'`）→ undefined（等价宿主基类空方法体默认）；base 抛错 → catch → undefined（fail-safe，计量元数据缺陷不击穿 token meter——与宿主 :1989-1991「Unknown providers degrade to undefined rather than throwing」的静默降级语义方向一致）；base 继承宿主空基类方法 → 调用返回 undefined（同一结果，两路径归一）。
- 同步契约：零 await/零缓存路径，纯元数据直查——符合宿主 :1639 "synchronously without I/O"。
- model 透传不改写：twin 路由与原路由共享同一 model id（resolveModel 仅改写 provider 字段），定价按 exact model id 归属正确。

### 3.2 安全性 ✅（无发现）
- 纯元数据查询透传，无新输入面/无注入面/无敏感数据；catch 收敛不外泄内部状态。

### 3.3 可维护性 ✅（含 F3/F4 注记）
- 注释锚定宿主行号且经本次核验全部命中；命名与镜像方法族一致；函数长度合规。
- F4：prepareCall 注释（wrapper.js:388）残留旧 rc 锚点 ":1568"（rc.2 实际 :2232）——预存注释非本 commit 触碰，顺带清理项。

### 3.4 性能 ✅（无发现）
- 同步零 I/O 契约达标；original() 单次 registration 查询（宿主侧 Map get），无循环无批量问题。

### 3.5 测试覆盖 ✅（含 F2 注记）
- 核心路径：7a（未声明→undefined）/7b（声明→同步透传+原 provider id+引用相等）双态覆盖；契约清单健康自检（:83）升级为 ≥6 + 必含 imageRequestPricing——宿主回退/枚举失效均红。
- 判别力：7b 未 await + 引用相等 = 异步化/克隆实现必红；`seenArgs` 实参捕获 = 错路由 id 必红。负向见证（smoke:2450）四联断言（stop 终态/delegate 存在/零裸图块/占位逐字等于宿主导出函数对该附件的输出）。
- 错误路径缺口：base 抛错→undefined 分支（wrapper.js:358-360）无测试（F2）。

---

## 四、AI 专项 5 项

| # | 检查项 | 结论 | 依据 |
|---|---|---|---|
| 1 | mock 残留 | ✅ 无 | 两测试文件 grep DEMO/TODO/FIXME 零匹配；DEMO 变异提交前已还原；夹具为永久性测试替身（依赖桩）非临时 mock |
| 2 | 硬编码 | ✅ 无（产品面） | 产品代码零硬编码契约数据（返回 base 结果或 undefined）；测试夹具数据值属正常桩数据，但**形状**见 F1 |
| 3 | 幻觉 API | ✅ 无 | `textOnlyImageText` 实在宿主导出清单（:2326）；`imageRequestPricing` 实在宿主原型（:1645）；无凭空 API。F1 为夹具返回形状保真度问题，非幻觉 API |
| 4 | 未实现 TODO | ✅ 无 | 零 TODO/FIXME 残留 |
| 5 | 过度实现 | ✅ 无 | imageRequestPricing 为最小镜像（与 providerRetryPolicy 同构 10 行），零额外面；测试/注释修改均直接服务契约对齐 |

---

## 五、发现列表

### F1｜P2｜tests/adapter-parity.mjs:261 —— 7b PRICING 夹具形状未锚定宿主 schema（P10-④-violation）
- **问题**：夹具 `const PRICING = { perImageTokens: 85, perRequestImages: 1 }` 为扁平字段形态；宿主真实契约类型 `LlmImageRequestPricing`（dsh-llm lib/types/types.d.ts:171-178）= `{ priceImages(images: readonly ImageAttachmentRef[]): readonly LlmImageRequestPrice[] }` **方法形态**。`perImageTokens`/`perRequestImages` 在宿主源码零匹配——夹具返回形状系按心智模型伪造宿主面，违反 P10-④「测试桩的宿主面形态必须锚定宿主源码（行号或导出名）」。
- **影响评估**：被测属性（undefined 默认/同步透传/原 provider id/引用相等）对载荷形状不敏感，判别有效性不受损、不产生假绿；但形状失真误导后续读者对契约形态的认知，且未行使真实 schema（priceImages 方法面）。
- **建议**：改为 `{ priceImages: (images) => [/* per-occurrence LlmImageRequestPrice */] }` 形状并注明锚点 types.d.ts:171-178。
- **分级理由**：P2 而非 P1——断言真值不受影响、宿主运行时对该载荷零 schema 强制（:1996-1997 仅转发）、修复为单行夹具变更；violation 标签已按项目原则强制标注。

### F2｜P2｜lib/wrapper.js:358-360 —— 抛错 fail-safe 分支无测试覆盖
- **问题**：镜像语义三态中的「原适配器抛错 → undefined」分支（catch 路径）无任何断言；7a 覆盖未声明态、7b 覆盖声明态，错误路径缺口（5 维·测试覆盖·错误路径项）。
- **建议**：补 7c：原适配器 imageRequestPricing 抛错 → twin 返回 undefined（与 providerRetryPolicy 既有未测抛错路径同属历史缺口，本次新增分支应随增随测）。

### F3｜P3｜tests/smoke.mjs:2440-2441 —— 注释「占位形态变更即红」措辞不精确
- **问题**：断言以**宿主导出函数**动态计算期望值（`block.text === textOnlyImageText(ref)`），宿主若同步演进导出函数与投影内部，测试保持绿——这是 P10-④ 导出名锚定的**预期**跟踪行为。精确表述应为「投影行为与导出函数脱钩即红；导出移除即 import 失败红」。
- **建议**：注释措辞校准（纯文档，零行为）。

### F4｜P3｜lib/wrapper.js:388 —— prepareCall 注释锚点过期（预存，非本 diff）
- **问题**：注释引用 adapterStream ":1568" 为旧 rc 行号；rc.2 实际 prepareCall 调用点 :2232（adapter-parity.mjs:31 已正确更新）。该注释行本 commit 未触碰。
- **建议**：后续顺手对齐 :2232（非本 commit 义务）。

### F5｜P3｜lib/wrapper.js:358-360 —— catch 静默吞错与 P8（失败可观测）的张力（纯讨论）
- **问题**：base 抛错静默回落 undefined，无诊断事件——与 P8「失败与降级 MUST 可观测」存在张力。
- **评估**：方向与宿主自身消费面一致（:1996-1997 `?.` 对未注册路由静默降级 + :1989-1991 文档明示 "degrade to undefined rather than throwing"），且与 twin 既有 providerRetryPolicy 镜像模式（:331-333）对称——镜像语义优先于本地增益观测。若需诊断应在宿主消费面统一解决，非 twin 单点加戏。
- **结论**：不要求修改，记录设计取舍。

---

## 六、范围与纪律检查

- **diff 范围**：`git show c89d635 --stat` = 恰 3 锁内文件（lib/wrapper.js +27 / tests/adapter-parity.mjs +72−… / tests/smoke.mjs +25−…），合计 +101/−23 与声称一致。**零越界**。
- **单 commit 单问题**（编程要求 5）：全部变更服务同一问题（rc.2 LlmAdapter 契约对齐），无冗余修改。
- **旧路径并存检查**（P5/P6）：smoke 旧负向见证（rc.8 error 期待）已**删除替换**为 rc.2 语义，无双态并存；adapter-parity 健康自检旧断言同步升级，无旧检查残留。
- **测试桩纪律**（任务审查重点）：7b = 夹具（fake 原适配器）+ 实参捕获（seenArgs）+ 引用相等，机制合规；宿主面形状保真度缺口见 F1。
- **真实环境红线**：不适用（只读审查，宿主 checkout 仅读）。

## 七、审查边界声明

本审查未执行任何测试/写操作（工具边界：Coordinator 复跑裁终）。C5 中的运行结果（RED 两红实测、GREEN 全绿、全量网 22/23）为 Developer 声称，本审查完成了静态一致性核验（红点定位精确、绿态推演成立、套件计数吻合、耦合面隔离成立），运行时复现由 Coordinator 门控复跑确认。
