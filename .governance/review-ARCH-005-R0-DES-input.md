# ARCH-005 R0 设计审查报告（Design Reviewer）

> 持久化说明（Coordinator）：本文件为 Design Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 0 --result NEEDS_CHANGE。审查时间 2026-10-16；审查对象两产出 commit `fba63ea`。

- **审查轮次**: R0（首次审查，无前轮引用）
- **审查对象**: `.governance/arch-005-decoupling-design.md`（Architect）+ `.governance/arch-005-host-diff-inventory.md`（Analyst），基线 ARCH-004 两份
- **方法声明**: 零采信独立核实——全部锚点实读双树源码（新树 `C:\Users\peter\AppData\Roaming\npm\...\@deepseek-ai\` / 旧树本仓 `node_modules\@deepseek-ai\` / rc.3 旁证树）+ 本仓 `lib/**`/`tests/**`；semver 判定独立复算。仅使用只读取证（grep/sed/node -e 读版本与 satisfies），**双树零写入、本仓零修改**。核实锚点约 70 处。

---

## 一、最终结论

## **NEEDS_CHANGE**（P1 findings = 4；无 P0）

方案 B 的骨架（基线档案 + 协商三态 + 漂移雷达 + R0~R5 批次）、评估标准预定义、蓝军三轮框架、ADR 结构、ARCH-004 资产零推翻声明均成立，**不触发 BLOCKED**；但存在 4 项必须修的 P1 缺陷（1 项归因级事实盲区 + 1 项编造级锚点错误 + 1 项批次依赖序缺陷 + 1 项 Analyst 事实错值），修正后需重 spawn 复审（R1）。

---

## 二、Findings 清单

### P1（必须修）

**P1-1【Architect｜归因级事实盲区】宿主 0.2.0 装载门控（Analyst HD-001）完全缺席于设计的事实基础**
- 位置：设计 §0.1 F-H/F-I、§0.2 D1 行、§2-B 四维-a、§8 ADR 背景、§0.3 FIX-003 行
- 问题：设计断言「零 enforcement 持续成立」「ADR-ARCH-004-A 的裁决（peerDeps 防线已证伪）在 0.2.0 仍然成立」「声明面按设计『记录性』不炸安装」——**全部被实读证伪**：新树 `dsh-app-boot/lib/index.js:286` `evaluatePluginCompatibility` 对 manifest 中全部 `@deepseek-ai/dsh*` peerDeps 逐项 `semver.satisfies(runtimeVersion, range, {includePrerelease:true})`（:300），不满足且无豁免 → `:930-931` throw → catch 进 `skippedBundles`，**插件整层被宿主拒载**。我独立复算 `semver.satisfies('0.2.0-rc.2','^0.1.5-rc.2',{includePrerelease:true})` = false（8 项 peerDeps 全不过）。Architect 的 F-H 取证面（typert-registry/cordis-plugin-loader/cordis-host-runner 的 require 侧）本身为真，但**不含 app-boot 装载门**，导致：① §0.2 把 0.2.0 下插件死因第一顺位（拒载）误判为「混装隐性风险 + 记录失真」；② 协商三态的价值边界未界定——**minor 跳位时插件被 skip、根本不加载，三态徽章/unknown 诊断事件无运行机会**（三态只覆盖门控恰好满足的漂移，如 rc 内跳位），蓝军第 1 轮 B 案「不穿透」判定在该场景部分失真；③ DEC-2 缺关键交互说明：app-boot 门控（:292-300）遍历 peerDependencies **不读 peerDependenciesMeta**，optional 标记不能解除门控，实施者若误信即踩坑；④ ADR-ARCH-005-A 背景段「零 enforcement 与零 instanceof 持续成立」必须重写。
- 影响：不推翻方案 B 推荐（R1 声明面跳跃恰好解除门控；雷达价值反增），但归因链、「peerDeps 记录性语义延续」的整个叙事、三态适用边界、DEC-2/DEC-5 依据均需修正补强。违反条目：**P1-violation（事实）+ P9-violation（宿主装载行为能力判定盲区）**。

**P1-2【Architect｜编造级锚点错误】F-G「dsh-llm 内部布局漂移族」整条与源码不符**
- 位置：设计 §0.1 F-G、§0.2 D3 行「锚文件漂移（F-G）」、§2-B 四维-c/R0 批「锚刷新（dsh-llm lib/types 布局等 F-G 族）」
- 问题：F-G 四项断言逐一实读证伪——①「lib/index.js 已改为 re-export」：错，新树 `dsh-llm/lib/index.js` 为 **2390 行实体编译产物**（内联全部源码，`prepareCall` :1734、`registerAdapter` :1833、导出表 :2390 含 LlmAdapter/BlockAssembler）；②「类本体移至 lib/types/index.js」：lib/types/index.js :141 确有 LlmAdapter，但这是**新旧树同构的并行编译面**而非「移走」；③「exports 子路径面扩充（新增 ./invariant、./types、./brand、./assistant-stream、./typert、./remote）」：错，**旧树（0.1.5-rc.2）exports 与新树逐字相同**，无扩充；④「S7 7c 锚 hostRead('dsh-llm','lib','index.js') 含方法声明在 0.2.0 会 miss」：错，六方法（providerInfo/providerRetryPolicy/imageRequestPricing/listModels/resolveModel/prepareCall）在 lib/index.js 全部在位，**7c 不会 miss**。对照：Analyst 同面锚点（A-4 行 :1734/:1833/:2048-2051/:2293/:1806）**全部精确命中**——Architect 在此面单方失控。后果：R0 批「F-G 族锚刷新」工作量虚增，§0.2 D3 证据链一处失真。违反条目：**P1-violation（漂移锚点——按审查重点 1 的预设级别）**。

**P1-3【Architect｜实施批依赖序缺陷】R2 批被 HD-002/HD-003 适配硬阻塞但依赖序未声明，breaking 4 无显式承载批**
- 位置：设计 §6 批次表（依赖序「R0 → R1 →（R2、R3 可并行）→ R4 → R5」）+ DEC-5
- 问题：R2（运行面协商态批）验收门含「真机面板截图证据（P10-③）」——其硬前提 = 插件能在 0.2.0 宿主上加载运行 = HD-001 解除 + HD-002（settings Config 导出迁移，`lib/index.js:237` apply 期断点）+ HD-003（codec create() 迁移，`lib/index.js:305` 断点）适配完成。R0~R5 六批中**无任何一批显式承载 HD-002/003/004**（仅 DEC-5 隐式外包给「0.2.0 适配任务」）；按现依赖序执行，R2 将在适配完成前不可验收。审查重点 5 的裁定：**R0~R5 不覆盖全部 breaking 4**（仅覆盖 HD-001 的声明面半边 + 过期锚清单；HD-005 镜像在 R0；additive 项与 T-1~T-5 处置路径未落位）。必须修正批次表：显式插入/声明「适配批（HD-003 → HD-002 → HD-004，按 Analyst 顺序）位于 R1 与 R2 之间」，并在 DEC-5 中把该依赖写死。违反条目：**P2-级完备性缺陷上探 P1（批次表按现状执行会产生不可验收的中间态）**。

**P1-4【Analyst｜事实错值】schemastery 新树实测版本记录错误（3.18.4 ≠ 实测 3.18.5）**
- 位置：diff 清单 §0 头（两处）、HD-010「机核证据」、§7 锚点刷新建议
- 问题：新树 `@deepseek-ai/schemastery/package.json` version = **3.18.5**（实测；dsh 主包声明 `~3.18.4`，3.18.5 在范围内——`satisfies('3.18.5','~3.18.4')`=true 复算吻合，与 Architect F-B 的纠偏一致）。Analyst 全篇记录 3.18.4，且 §7 建议 HOST_BASELINE 刷新值含 `schemastery:'3.18.4'`——**照抄即写入错基线值**，使版本快照判据长期误红。Architect 已在 F-B 显式标注冲突并以一手为准，实施 MUST 以 3.18.5 为准。违反条目：**P1-violation（自称机核实跑却产出错值——取证失真）**。

### P2（应修）

**P2-1【Analyst】A-11 锚点漂移**：`super(ctx,"sessionController",{namespace:"session"})` 锚记 `:382`——实测在 **:2847**（selectModel :720 精确命中）。存续结论不受影响（super 实际在位），锚点引用需勘正。
**P2-2【Architect】F-A「S3/S7 全体 skip」机制描述与机器现实不符**：本机 `_npx` 缓存（0.1.5-rc.3 旁证树，实测在场且含 `dsh-api-remotes/lib/client.js`）会被靶子解析命中——实际行为是「S3/S7 跑在过期 rc.3 副本上 + FIX-037 ③ 版本一致性告警」而非 skip。核心定性（对 0.2.0 看护失明）成立，R0 靶子扩充后此况自然消解，但 §0.1 F-A 的机制句需修正。
**P2-3【Architect】T-1~T-5 未逐项挂接批次**：T-3（pi-ai entry id 可达性，写路径 `configEditor.entries().find(row=>row.options.id===ns)` 前提）与 T-5（document-updated 触发时序，4 个热同步消费者的及时性）是 HD-002 适配的**前置验证**，T-1 影响 HD-004 定性（回归 vs 既有降级）——SOP 第 2 步仅泛指「Analyst 契约比对模板」，未给逐项处置落位。
**P2-4【Architect】R1 批验收门缺「装载成功」真机判据**：HD-001 解除的最终证据 = 宿主 0.2.0 真机装载成功（stderr 无 `skipping profile bundle`）——现仅散见 R5 发布批，应在 R1（或 DEC-5 合流适配批）验收门显式收录。

### P3（建议）

**P3-1** 包数口径：Architect F-B「嵌套 287 包全系 0.2.0-rc.2」——287 = `@deepseek-ai/` 目录条目实测数，但其中 cordis 4.0.5/schemastery 3.18.5 非 0.2.0-rc.2（同句自相矛盾，宜改为「dsh-* 包全系」）；Analyst「约 220」口径模糊。
**P3-2**【Analyst】HD-005 表区间锚 `lib/index.js:17-118`——实际表体 `:17-126`（末 2 项在 118 行后）。
**P3-3**【实施提示】S7 7a 提取正则（`tests/host-contract.mjs:865`）为单引号模式 `event:\s*'([^']+)'`，新宿主编译产物为**双引号**（`event: "..."` 实读）——靶子恢复后提取为空（断言仍红但成因不同）；R0 批重写 7a 为单向消费断言时必须同步适配引号形态。
**P3-4** 口径统一：7c「6 方法声明」与 F-C「7 方法」（stream 是否入基线集）两处宜统一说明（实测 `LLM_ADAPTER_PROTO_BASELINE` 为 6 方法集，不含 stream）。

---

## 三、独立核实锚点清单

### 核实通过（抽样列举，全部一手实读）

**HD-001（逐条）**：`dsh-app-boot/lib/index.js` :286（evaluatePluginCompatibility 签名逐字）/ :300（semver.satisfies + includePrerelease）/ :320-322（pluginCompatibilityWarning 文案含 `dsh plugin allow-version`）/ :325-430（compatibility.json 体系：PROFILE_COMPATIBILITY_FILENAME :328、readProfileCompatibility :359、setProfileVersionExemption :421 含 --accept-risk）/ :930-931（issue!==void 0 && !issue.exempted → throw → skippedBundles :941-945）；插件 `package.json:56-73`（8 peerDeps + 3 dsh deps 全 `^0.1.5-rc.2`）；semver 复算：peers=false、cordis ^4.0.1 vs 4.0.5=true、schemastery ^3.18.1 vs 3.18.5=true。
**HD-002（逐条）**：旧树 `dsh-settings/lib/index.js` :281（register(ns,schema,options)）/ :288（`applies: options?.applies ?? "live"`）/ :566（"settings/updated" emit）/ :593（listener 失败 warn）；新树 SettingsForms :322（`var SettingsForms = class extends Service`）、九方法面 :370/:382/:406/:413/:470/:479/:488/:501/:538 **全无 register/get(ns)**、document-updated :435/:461、write 尾 :536 自调 describe、volatile 门 :502-507（`Config field ... is not volatile`）、ns 解析 :502-504（`No configurable plugin entry`）、isVolatilePath :153、writable :396、Config 来源 :538-541；新树 grep `settings/updated` **0 命中**；app-boot :2160（plugin Config export）；pi-ai :1051（`z.dict(profile).default({}).volatile()` 先例）；插件断点 `lib/index.js:237`（register，apply 期直调无守卫）+ 四订阅点 :270/`service.js:2880`/`wrapper.js:657`/`oauth-llm.js:552` + `host-route.js:209/:430`（get 读路径）+ `events.js:36`（MANAGED_EVENTS）。
**HD-003（逐条）**：新树 `dsh-typert-registry/lib/index.js` :565（`strict codec has no create() factory` throw）/:398（register）/:522-561（validateInvocation 四处 validateCodec 调用）/:141-160（RemoteStore.register）/:69-81（descriptors.validate）；rc.3 旁证 :547-551（`strict codec has no parse() method`——旧形态）；新树 `dsh-api-remotes/lib/client.js:11669-11678`（宿主自身 codec `{mode,typeSymbol,create:<lazy>}` 实证，session/selectModel 描述子 :11660-11685）；`dsh-api-gateway/lib/client.js` :1637（$mount）/:1662-1663（mountContribution→remotes.register）/:2074-2075（requireStrictCodec 仅查 mode）；插件 `lib/rpc.js:20-40`（parameter/result 产出 `{schema}` 无 create）+ `lib/index.js:305`（typert.register apply 期直调）+ `lib/client.js:5783`（inject 九面）/:5808（$mount 带 catch）。
**HD-004（逐条）**：新树 `dsh-client-ui-conversation/lib/client.js` :13471-13484（actions 面 = setDraft/addAttachments/removeAttachment/pruneAttachments/submit，**无 addImages**；grep 0 命中）、attachmentIds 状态 :13498、setDraft :13552、**createDraftImages 在 conversation+file-upload 双包 grep 0 命中**；rc.3 旁证 :12631（addAttachments）/:16776（drafts→addAttachments→releaseDraftAttachments 先例）；新树 `dsh-client-file-upload/lib/client.js:179`（upload 五参签名）；插件 `lib/client.js:4857-4863`（守卫完整：缺面 → `setError(t('attachUnavailable'))` 不崩）。
**存续面抽样（5+ 项）**：LlmAdapter 7 方法（`dsh-llm/lib/types/index.js:141-205` providerInfo/providerRetryPolicy/imageRequestPricing/listModels/resolveModel/prepareCall 全在 + createDeveloperMessage 新增于 message.js:45）；sessionController selectModel（`:720` + 描述子 schema :11660+）；agent-preset-registry `:481`（super(ctx,"agentPresets")）/:489（双参 emit 逐字）/:723（composedPreset）；dsh-llm :1806（adapters-updated）/:2048-2051（imageRequestPricing 直调）/:2293（prepareCall 分发）/:2203-2205（llm 级）；白名单 27 项全表实读（旧 19 项全存续 + 新增 8 项 = deepseek-account/session-expired、deepseek-account/model-sign-in-required、credentials/record-updated、permission-presets/catalog-changed、plugin-manager/{changed,install-log,install-state}、schedule/changed——**与两文档所列逐项一致**；形状 {event,mode} 吻合）。
**本仓锚点**：`tests/host-contract.mjs` :194（HOST_VERSION_BASELINE 两键 0.1.5-rc.1/rc.2）/:439-449（靶子候选链 DSH_HOST_SOURCE > DSH_HOST_PACKAGES > `_npx` 降序——**无 npm 全局树候选，F-A 核心成立**）/:473-478（FIX-037 ③ 告警机制在位）/:627-629（S2 捏造包/文件即红）/ S1 :520 / S2 :598 / S3 :693 / S4 :710 / S5 :772 / S6 :832 / S7 :856-930（区段起点逐字吻合）/:866（S7 7a deepEqual 全等断言）；`lib/host-abi/version.js` :19（pi-ai:2344 过期注释锚在位——新树实测 :2490）/:36-55（packageVersionOf/hostVersionsOf）；`health.js:69+`（registerFaceProbes）；`client-remotes.js:50-54`（三错误码）/:111-131（降级信封群）；`events.js:35-70`（MANAGED_EVENTS + 19 项镜像逐项）/:161+（subscribeEvents）；`README.md:138-142`（实测基线矩阵 + 刷新义务）；旧树 13 包（dsh-llm/tools/typert-protocol=0.1.5-rc.2、cordis 4.0.1、schemastery 3.18.1——F-I 混装两半成立）；HOST_BASELINE 常量 `:46-51`（4.0.2/3.18.2——宿主 checkout 口径）。
**其他**：F-E 拆分（@deepseek-ai/ 下有 dsh-agent-preset + dsh-agent-preset-registry，无复数包）；F-F（dsh-plugin-manager `:619` join(dir,"node_modules",name)）；F-H 取证面本身为真（typert-registry/cordis-plugin-loader grep peerDependencies=0、dsh-llm instanceof=0）——但见 P1-1 盲区；新树 dsh=0.2.0-rc.2、cordis=4.0.5、schemastery=3.18.5。

### 发现漂移/错误（并入上文 findings）

Architect F-G 四项（P1-2）；Architect F-A 的「skip」机制句（P2-2）；Architect F-B「全系」口径（P3-1）；Analyst schemastery 3.18.4（P1-4）；Analyst A-11 :382（P2-1）；Analyst HD-005 表尾区间（P3-2）。

---

## 四、其余审查维度结论（要点）

- **蓝军推演有效性**：三轮攻击场景具体、防御依据绝大多数可查。方案 A 穿透判定公允、方案 C 反向放大判定公允。**唯一缺口** = 第 1 轮 B 案漏 HD-001 门控形态（见 P1-1）。
- **跨文档一致性**：修复顺序（Analyst HD-001→003→002→004）与 R0/R1 咬合（经 DEC-5）；「契约面主体存续」vs「存续 ≈45」无实质矛盾；包拆分、白名单 19→27 两文档一致；**schemastery 实测值冲突已裁定（Architect 对）**；**HD-001 是两文档最大事实冲突（Analyst 对、Architect 漏检）**。
- **P-violation 标注**：P1-violation（P1-1/P1-2/P1-4）、P9-violation（P1-1）、P2-级完备性（P1-3 上探）。P5/P8/P4 检查通过。
- **决策点良构性**：DEC-1~DEC-7 良构；唯 DEC-2 需补「optional 不解除 app-boot 门控」、DEC-5 需写死适配批依赖位。
- **硬门槛**：候选方案 3（≥2 ✓）；ADR 字段完整 ✓（背景段需按 P1-1 修正）；蓝军 3 轮 ✓；无循环依赖 ✓；独立评审 = 本报告。

## 五、复审建议（R1 退回要点）

1. 修正 F-H/F-I/§0.2/ADR 背景：纳入 app-boot 装载门控为事实，重写「peerDeps 记录性」叙事，界定协商三态在门控 skip 场景下的适用边界，DEC-2 补 optional-meta 与门控不交互的说明。
2. 删除/重写 F-G 整条（含 §0.2 D3 引用与 R0 批的「F-G 族锚刷新」项）。
3. 批次表显式插入适配批（HD-003→HD-002→HD-004）并声明 R2 对其的硬依赖；R1/适配批验收门补「真机装载成功」判据。
4. Analyst 侧勘正：schemastery 3.18.5（§7 建议值同步）、A-11 :2847、HD-005 表区间（次要）。

unresolved_blockers：不适用（NEEDS_CHANGE 非终态；待修 P1 计数 = 4）。审查完毕，报告返回 Coordinator，未修改任何文件。
