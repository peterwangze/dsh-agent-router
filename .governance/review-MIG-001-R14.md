# MIG-001 R14 — Step 10 独立代码审查报告（Code Reviewer）

- **Round**: R14（Step 10 单元首审 = MIG-001 收官单元；审查链 R1-R13 已覆盖 Step 0-9 并全部通过含两次返工复审）
- **审查对象**: 未提交变更集 — `tests/metrics.mjs`（新增，实读 672 行，唯一变更文件；`git status --short` 仅 `?? tests/metrics.mjs`，lib/ 零修改零埋点）
- **审查者**: software-project-governance-code-reviewer（只读审查；未运行测试、未执行写操作）
- **审查日期**: 本会话
- **终态**: `APPROVED_WITH_NOTES`
- **独立结构字段**: `unresolved_blockers=0`

---

## 0. 审查范围与执行方式

- 依据：实读 `tests/metrics.mjs` 全文（逐行 1-672）+ 设计契约实读（`docs/architecture-v3.md` §8 Step 10 行 L781、§11 D-1 五指标定义 L823-837、§13 V-DSH-5 L861、BC-1/BC-2 L800-801、§5.2.3 失败语义）+ `.governance/review-MIG-001-R8.md` 逃生组三项取舍记录（F-05/F-06/F-08）+ 全部被观测 lib 模块实读（service.js / attachments.js / wrapper.js / memory.js / prestep.js / tool.js / index.js）+ 证据引用面实读（smoke.mjs 对应行段、tests/attachments.mjs）+ cordis `dispatch/waterfall` 源码实读 + 运行时探针（只读，无文件写入）。
- 测试运行事实由 Coordinator 提供（本 Reviewer 无 Bash 权限执行测试，未亲自复跑；见事实依据表 F1）。
- 未修改任何产品代码；唯一写入为本报告。
- **简报事实修正**：简报称"26 项自动化观测"，实读 `checks.push` 共 **31 条**（D-1-1×5、D-1-2×4、D-1-3×7、D-1-4×8、D-1-5×4、DISC×3）。简报为 Coordinator 捕获副本摘要，口径与文件不符，不影响审查（以实读为准，见 F-02）。

## 1. 事实依据表（可复查事实）

| # | 事实 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| F1 | `node tests/smoke.mjs` → exit 0 ALL PASSED（534 断言零回退）；`node tests/metrics.mjs` → exit 0，`ALL METRICS OBSERVATIONS PASSED`，D-1 门判定 = 满足×2（D-1-1/4）/ 部分满足×2（D-1-2/5）/ 待实测×1（D-1-3） | Coordinator 独立复跑 | **未亲自复跑**（无 Bash 权限，依协议以 Coordinator 事实为准） |
| F2 | 变更范围：git status 仅 `?? tests/metrics.mjs`，零 lib/ 修改 | `git status --short`（只读实跑） | 范围守卫声明成立 |
| F3 | cordis `dispatch(type, args)`：`name = args.shift()`，返回 `this._hooks[name]` 监听器数组（空数组 = 未注册）；`waterfall(...)` 无监听器时 `next()` 落到 fallback（inner） | 实读 cordis lib/index.js L258-264/L317-325 + 运行时探针 | `dispatch('waterfall', ['agent/request'])` 无监听器返回 `[]`、注册后返回 1 项；waterfall 无监听器返回 fallback 结果 ✅ |
| F4 | `Context.plugin({name, apply})` 内 `ctx.provide(name, value)` 可注册服务；`root.plugin({name, inject, apply})` 的 inject 等待服务就绪 | 实读 cordis + 运行时探针 | stub 注入链路（router/tools/systemPrompt → tool 模块）与 smoke.mjs L1147-1152 同构 ✅ |
| F5 | `RouterService.run` 对 chat 类型走 `runChat`（L1025-1123）：images → `content.push({type:'image', attachment: ref})`（L1069），返回 `{kind:'chat', text, images, usage}`；能力预检经 `llm.resolveModelInfo`（L1055） | 实读 service.js | 观测② 断言 `run.kind === 'chat'` + `request.messages[0].content` 含 image 块且 `attachment.attachmentId === contentId` 与实现一致 ✅ |
| F6 | wrapper `createWrapAdapter` 的 `resolveModel` 镜像：`return {...resolved, provider: wrapRoute, inputModalities}`（L303-311）——模型身份 id 不变、仅 provider 加 `-router` 后缀 | 实读 wrapper.js | 观测① 场景 5 断言 `twinResolved.id === MAIN_MODEL && provider 带后缀` 与实现一致 ✅ |
| F7 | wrapper `stream` 直传分支：模态块在场 → `sourceAcceptsModality` 全接受 → `yield* llm.stream({...options, provider})`（L319-325）——原图块保真、无 system 标记 | 实读 wrapper.js | 观测② 直传断言与实现一致 ✅ |
| F8 | prestep `installPreStep` handler：reminder 注入 + 逃生组分级改写（L181-235）；逃生组判定 `provider.endsWith(WRAP_SUFFIX)`；`ctx.get('llm')` 未注册时 original 回落 undefined → `sourceAcceptsModality` 判 false → 改写 | 实读 prestep.js + cordis get 语义 | 观测③ 三通道① 断言（decision.messages.length===2、reminder role user/source plugin、文本含 route_agent/includeImages/contentId）与实现一致 ✅ |
| F9 | `collectReminder` 输出含 `route_agent`/`includeImages`/`attachmentIds`/引号包裹 agent id（prestep.js L49-57）；`minimalImageRewrite` 标记含 `route_agent`/`includeImages`/`"vision"`/附件 id（wrapper.js L48-60） | 实读两文件 | 观测③ 三通道①② 断言逐字面核对一致 ✅ |
| F10 | `collectMarkers` 按附件 id 去重、只标记最后一条 user 消息（wrapper.js L63-93）；`collectMemorySegments` 当前轮 id 不重复注入、命中 imageMemory 生成"此前识别"段（L117-172） | 实读 wrapper.js | 观测③⑤ 断言（去重 1 条、记忆段含"此前识别"+id）与实现一致 ✅ |
| F11 | `AttachmentRegistry`：registerPath（图片→saveImage 内容寻址 / 非图片→workspacePath）、byId（懒注册降级）、byPath（pathIndex 反向索引）、materialize（写 `.router-files/attachments/`）、resolve（三向）、错误码（INVALID_ATTACHMENT_ID/ATTACHMENT_UNKNOWN） | 实读 attachments.js L159-488 | 观测④ 8 条断言与实现逐一核对一致 ✅ |
| F12 | 观测④ materialize 产生**真实磁盘写入**：`mkdirSync(dir, {recursive:true})` + `writeFileSync(path, bytes)`（attachments.js L389-395 为 node:fs 原生调用，不经 mock fs）→ 已确认 `D:\work\metrics\.router-files\attachments\289c77a….png` 残留存在 | 实读 attachments.js + `Test-Path` 只读检查 | → 发现 F-01（P2） |
| F13 | tests/attachments.mjs 的清理约定：`WORKSPACE = join(ROOT_DIR, '.test-attachments-work')` + 起止 `rmSync(WORKSPACE, {recursive:true, force:true})`（L79/L363） | 实读 attachments.mjs | 观测④ 的 `WORKSPACE = 'D:/work/metrics'` 硬编码 + 无清理，与既有约定不一致（F-01） |
| F14 | 证据引用行段全部属实：smoke.mjs:1162-1177（image turn config passes through unchanged）、1316-1326（twin 目录镜像）、816-820（vision call returns injected images）、1473-1480（native multimodal delegate sees raw image）、1669-1682（reminder 注入 + 逃生组改写）、1500-1507（marker 分流 + 去重）、1153-1157（route_agent 参数 schema）、846-868（attachmentIds resolution via M2）、1557-1569（follow-up text turn injects memory segment）、1266（resolveModel 返回 id 字段）、1680-1681（逃生轮无裸图块 + 标记文本） | 实读 smoke.mjs 对应行段 | 全部核实存在且语义相符 ✅ |
| F15 | lib/ 无任何 `agent/request` 注册点（index.js 仅 pre-step/typert/webServer/settings；tool.js 仅 tools.register）——D-1-1"整轮路由已移除"可核实 | grep lib/ + 实读 index.js 全文 | 判别性检查（hookListeners.length===0）有事实底座 ✅ |
| F16 | `rememberImage` 返回 boolean、`recallImage` 返回 `{text, at}`、`clearImageMemory` 清空（memory.js L47-83）；观测⑤ 机制面 A/B 断言与实现一致 | 实读 memory.js + service.resolveAttachmentIds（L1837-1863） | 观测⑤ 4 条断言逐一核对 ✅ |
| F17 | D-1 门判定逻辑（metrics.mjs L660-667）：满足×2（D-1-1/4，自动化 100%）、部分满足×2（D-1-2/5，机制面过/端到端待实测）、待实测×1（D-1-3，需 U-3）——与 §11 阈值（100%/100%/≥90%/100%/≥80%）和可测性判定一致；not-measurable 输出含数据来源+采集步骤（L242/L324/L498） | 实读 metrics.mjs + architecture-v3.md §11 | 门判定逻辑无编造、无暗示通过 ✅ |

## 2. 审查重点逐项结论

| 重点 | 结论 | 依据 |
| --- | --- | --- |
| 观测有效性（核心）：观测的是 D-1 指标本体还是漂移代理 | ✅ 全部为真实重演或如实标注的机制面 | ① 用真实 cordis waterfall + 真实 wrapper resolveModel（F3/F6）；② 用真实 RouterService.run + 真实 wrapper stream 直传分支（F5/F7）；④ 用真实 AttachmentRegistry 全方法（F11）；③⑤ 用真实 prestep/wrapper/memory/service 导出（F8-F10/F16）。无一处"只断言导出存在"的形式化空转 |
| 判别性自检：破坏夹具是否真破坏 | ✅ 三项均为真破坏 | 判别1：badAdapter.resolveModel 返回 gpt-4o → `badResolved.id !== 'brain-1'` 成立（替换模型身份形态）；判别2：`discRegistry.pathIndex.clear()` → byPath 返回 undefined → 断言失败（反向索引失效）；判别3：空 images 请求 → messages 无 image 块 → 断言失败。均不改产品代码（F-03 记录） |
| 不伪造红线（核心）：not-measurable 是否编造/暗示通过 | ✅ 无编造 | e2e/usage/success 三部分全部 `status:'not-measurable'` + methodName + 可执行测量方法（数据来源+采集步骤：L242/L324/L498）；record() 对非 pass 输出明确 `not-measurable（原因）`；D-1-3 门判定为"待实测"而非"通过"（F17） |
| D-1 门判定逻辑 | ✅ 与 §11 阈值和可测性一致 | 满足/部分满足/待实测三分与 §11 定义逐条对应；exit 语义 = 自动化观测全过 exit 0，not-measurable 不计失败（L669-672） |
| 测试基建卫生 | ⚠️ 1 项 P2 | 观测④ materialize 真实写盘且不清理，与 attachments.mjs 起止 rmSync 约定不一致（F-01）；其余（imageMemory 用后 clear、registry.close、独立 ctx/registry 实例）隔离性合格 |
| AI 专项 | ✅ 5/5 全过 | 幻觉 API 零命中（import 面逐一核对 F5-F11/F16）；观测值全部为运行产物（checks.length/failed.length 计算，无字面量断言值）；无 mock 残留（stub 均为测试夹具）；无 TODO/FIXME 占位；无过度实现（范围守卫 F2） |
| 范围：零 lib/ 修改声明 | ✅ 成立 | git status 唯一文件（F2） |

## 3. 设计一致性表

| 契约项 | 契约要求 | 实现 | 一致性 |
| --- | --- | --- | --- |
| §8 Step 10 行（L781） | 成功标准观测（N-9）：D-1 指标观测点落地（恒主模型、图片到达、触发率、编址往返、跨轮指代）；新增 tests/ 观测脚本或扩展 smoke；回滚=—（观测为增量） | `tests/metrics.mjs` 新增观测脚本；五指标逐一观测函数 + DISC 自检 + 逃生组观测面说明 + 门判定汇总；零 lib/ 修改（增量观测） | ✅ |
| §11 D-1-1（L830） | 带图轮 request/context 恒为主模型 **100%**（0% 出现专业 agent 的 provider/model）；观测=会话 JSONL request/context 比对 | 自动化：agent/request waterfall 三场景 config 原样返回 + 钩子未注册判别 + twin resolveModel 镜像模型身份（5/5 场景）——直接度量"恒为主模型"本体 | ✅ |
| §11 D-1-2（L831） | 图片载体到达视觉输入 **100%**：直传分支图片块原样到达主模型；改写分支附件 ref/路径到达视觉输入；直传绑定 keepOriginalImages 短路观测 | 自动化两分支：改写分支=RouterService.run 视觉调用 messages 含 image 块 + 附件 id 可解析（M2 格式）；直传分支=wrapper stream 委托见原图块 + 无 system 标记；e2e not-measurable + 测量方法 | ✅（机制面=本体直测；e2e 如实待实测） |
| §11 D-1-3（L832） | route_agent 带图触发率 **≥90%**（纯文本主动调 / 多模态直答或调工具均算有效）；U-3 实测 | 机制面三通道（①pre-step reminder ②system marker/记忆段 ③工具描述参数）全部就位断言；真实比率 not-measurable + U-3 测量方法（RES-001 §4.3 关联，V-DSH-5） | ✅（机制面为三通道就位代理，如实标注；比率本体待实测） |
| §11 D-1-4（L833） | 附件统一编址往返一致 **100%**（id→path→id 与 path→id→path；解析失败率 0 静默） | 自动化：registerPath→byId、byPath 反向索引、materialize→byId、resolve 三向、三错误码明确报错（8/8 场景）——直接重演 M2 本体 | ✅ |
| §11 D-1-5（L834） | 跨轮指代成功率 **≥80%**（图片轮后文本轮追问引用图片内容，imageMemory 生效）；N 轮人工/LLM 评估 | 机制面 A：imageMemory 回写 + 追问轮记忆段注入（含"此前识别"+id+attachmentIds 指引）；机制面 B：attachmentIds 经 M2 懒注册解析可达；成功率 not-measurable + N 轮评估方法 | ✅（机制面为闭环可达代理，如实标注） |
| 执行包 Step 10 假设记录 | 可测性判定：①④全自动化；②③⑤机制面+not-measurable | 与实现完全对应（D-1-1/D-1-4 全自动；D-1-2/D-1-3/D-1-5 机制面+not-measurable+测量方法） | ✅ |
| R8 F-05/F-06/F-08（逃生组三项取舍观测面） | Step 10 观测：user 层标记复述风险、逃生路径日志层原件缺失、跨轮边界历史图块 | observeEscapeTradeoffs()（L506-523）逐一给出观测点+数据来源：F-05（改写后 decision.messages 无裸图块已由 smoke 断言；复述行为需真实模型观测）；F-06（改写时机宿主 append 前已由 R8 F6 印证；日志层形态需真实会话核对）；F-08（U-3 会话样本检查"逃生组+历史带图"场景模型输入形态；击穿走 R8 F-08 记录路径） | ✅ |

## 4. 五维度结论

| 维度 | 结论 | 说明 |
| --- | --- | --- |
| ① 正确性（观测逻辑正确） | ✅ 通过 | 每个观测断言的实现路径均实读印证（F5-F11/F16）：cordis waterfall/dispatch 语义（F3）、runChat 消息构造（F5）、wrapper 镜像/直传（F6/F7）、prestep 判定链（F8）、注册表往返与错误码（F11）。判别性自检三项为真破坏（§2）。边界（空 images、未知 id、非法格式）覆盖 |
| ② 安全性 | ✅ 通过 | 纯观测脚本：无密钥/token、无注入面、无网络调用；附件 id 经 isAttachmentId 严格校验（F11）；唯一的"写"是观测④ materialize 向 `D:/work/metrics/.router-files/` 的测试落盘（P2 卫生项，非安全缺陷）；零 lib/ 修改 = 零生产面影响 |
| ③ 可维护性 | ✅ 通过 | 模块头文档完整（设计契约+可测性判定+范围守卫声明）；每观测函数职责单一、命名自解释；证据引用全部带 file:line 且核实属实（F14）；记录/汇总/门判定结构清晰 |
| ④ 性能 | ✅ 通过 | 单次重演式观测（非循环热路径）；observations 间 imageMemory clear 防污染（③⑤ 用后清理）；无 I/O 热点（唯一磁盘写为 materialize 测试落盘，P2 项） |
| ⑤ 测试覆盖（指标覆盖完备） | ✅ 通过 | 五指标 + DISC 判别自检 + 逃生组三项取舍观测面 + 门判定汇总全覆盖；31 条断言 + 3 项 not-measurable 测量方法记录；断言判别力合格（破坏场景必失败） |

## 5. 发现列表

### P0（阻塞）— 0 项
无。

### P1（关键）— 0 项
无。

### P2（建议，可遗留，不阻塞）
- **F-01** 测试基建卫生：观测④ materialize 真实磁盘写入且无清理。
  - 位置：`tests/metrics.mjs` L355（`WORKSPACE = 'D:/work/metrics'` 硬编码）+ L391（`registry.materialize(imageEntry.id, { cwd: WORKSPACE, ... })`）。
  - 事实：materialize 内部 `mkdirSync(dir, { recursive: true })` + `writeFileSync(path, bytes)` 是 node:fs 原生调用（attachments.js L389-395），不经过观测脚本 mock 的 fs 服务——`D:\work\metrics\.router-files\attachments\289c77a….png` 残留已确认存在（F12）。tests/attachments.mjs 的约定是仓库内临时目录 + 起止 rmSync 清理（F13）。
  - 影响：每次运行在仓库外硬编码路径留下物化产物，不清理；与既有测试基建清理约定不一致（隔离性/卫生）。不影响断言正确性（幂等重写），不污染仓库树。
  - 建议：WORKSPACE 改用仓库内 `.test-metrics-work`（对齐 attachments.mjs）并在观测④ 起止 `rmSync(WORKSPACE, { recursive: true, force: true })`；或 materialize 调用后清理物化目录。可遗留至 MIG-001 完结批次，不阻塞收官。

### P3（讨论/记录）
- **F-02** 简报口径修正：简报称"26 项自动化观测"，实读 `checks.push` 共 31 条（D-1-1×5、D-1-2×4、D-1-3×7、D-1-4×8、D-1-5×4、DISC×3）。简报为 Coordinator 捕获副本摘要，不影响审查（以实读为准）；如需精确计数可复核脚本 grep 结果。
- **F-03** DISC 判别 3 语义说明：判别 3（空 images）不是"破坏夹具"而是"缺失场景"——注释已如实声明（"直接验证无图片注入时观测断言为 false"），与判别 1/2（替换模型身份、清空 pathIndex 的真破坏）同属"观测逻辑依赖真实请求形态而非硬编码"的判别证据，记录不改。
- **F-04** 观测② RouterService.run 视觉调用触发 `rememberDispatchedImages` 副作用：runChat 成功后 `rememberImage(contentId, '识别完成')` 写入全局 imageMemory（service.js L751/L762-775）。后续观测③⑤ 均先 `clearImageMemory()` 再使用，无断言污染；但观测② 自身未清理其写入。记录不改（隔离已由后续观测的 clear 保证）。
- **F-05** `observeEscapeTradeoffs()` 为说明性输出（console），不产生断言、不进 results、不影响 exit 码——与任务定位（"观测面说明"而非自动化观测）一致；其观测点全部指向可执行后续（U-3 会话样本 / 真实日志核对 / R8 F-08 记录路径），记录不改。
- **F-06** D-1-1 场景 4 注释称"cordis events 无 listenerCount"——未验证该具体断言；但判别不依赖它：`dispatch` 返回监听器数组的语义已由 cordis 源码实读 + 运行时探针双重印证（F3），检查成立。记录不改。

## 6. AI 生成代码专项 5 项检查

| # | 检查项 | 结果 | 依据 |
| --- | --- | --- | --- |
| 1 | mock 残留 | ✅ 无 | 观测脚本中的 stub（fakeRouter/mmAdapter/preRoot 等）均为测试夹具，测试内定义不泄漏；生产代码零修改 |
| 2 | 硬编码返回值 | ✅ 无 | 全部观测值来自运行产物：`value: 100%（${checks.length}/${checks.length} 场景）` 动态计算；门判定 status 由 `results.find(...)?.status === 'pass'` 派生；not-measurable 无数值编造 |
| 3 | 幻觉 API 调用 | ✅ 无 | import 面 9 个符号全部逐一核对真实导出（F5-F11/F16）：RouterService/AttachmentRegistry/isAttachmentId/contentHashId/ATTACHMENT_ERROR_CODES/rememberImage/recallImage/clearImageMemory/installPreStep/collectReminder/createWrapAdapter/WRAP_SUFFIX/minimalImageRewrite/collectMarkers/collectMemorySegments/memorySegmentText/tool.inject/tool.apply；cordis Context/waterfall/dispatch、dsh-llm LlmRuntime/BlockAssembler/createUserMessage/createAssistantMessage 均为真实接口；无虚构 API |
| 4 | 未实现 TODO | ✅ 无 | 无 TODO/FIXME；"待实测/not-measurable"是如实状态声明 + 测量方法，非占位 |
| 5 | 过度实现 | ✅ 无 | 只做五指标观测 + DISC 自检 + 逃生组观测面说明 + 门判定；无超出 §8 Step 10 行范围的行为；零 lib/ 修改（F2） |

## 7. 硬门槛裁决

| 门槛项 | 阈值 | 结果 |
| --- | --- | --- |
| P0 阻塞问题数 = 0 | = 0 | ✅ 0 |
| 5 维度全覆盖 = 100% | 逐一有结论 | ✅ 5/5（§4） |
| 每条发现标注级别 = 100% | P0~P3 | ✅ 6 条全部标注（F-01 P2，F-02~F-06 P3） |
| 设计一致性检查完成 | §8 Step 10 行 + §11 五指标逐条口径 + 执行包可测性判定 + R8 逃生组三项取舍 | ✅（§3，逐条对照无漂移） |
| AI 专项 5 项完成 | 5/5 | ✅（§6） |
| 事实红线 | 未验证项显式标注 | ✅ 测试运行事实（F1）标注为 Coordinator 提供，未亲自复跑；cordis 语义实读+探针双重印证（F3）；全部证据行引用实读核实（F14）；简报口径差异显式修正（F-02） |

## 8. 终态

**APPROVED_WITH_NOTES** — `unresolved_blockers=0`

- P0 = 0，P1 = 0，P2 = 1（F-01 测试落盘清理，可遗留），P3 = 5（记录项）。
- 依据：五指标观测全部为真实重演（cordis 事件/真实 lib 导出），无一形式化空转；D-1 指标覆盖与 §11 定义逐条一致，机制面=本体直测或如实标注的三通道代理；not-measurable 零编造零暗示（数据来源+采集步骤齐全）；判别性自检三项真破坏真捕获；D-1 门判定（满足×2/部分满足×2/待实测×1）与阈值和可测性一致；AI 专项 5 项全过；范围守卫成立（唯一变更文件 = 新增观测脚本）；证据引用 11 处行段全部实读核实属实。
- 备注（Notes）：
  1. F-01（materialize 落盘清理）建议 MIG-001 完结批次顺手对齐 attachments.mjs 的 rmSync 约定（两行级改动，非阻塞）。
  2. F-02（简报"26 项" vs 实读 31 条断言）为简报口径差异，不影响审查结论。
  3. F-04（观测② 的 imageMemory 写入副作用）由后续观测 clear 隔离，无断言污染；如需彻底隔离可在观测② 内补 clearImageMemory()。
  4. F-05（逃生组观测面为说明性输出）符合任务定位；其指向的 U-3 / 真实日志核对 / R8 F-08 路径已在观测面说明中给出可执行入口，随 MIG-001 完结转入 DEV-002 域或按 R8 记录路径跟踪。
  5. 测试运行事实（F1）未由本 Reviewer 亲自复跑——依协议以 Coordinator 提供的事实为准；如需要，Coordinator 可复核。
