# RES-002 通用附件路由框架调研 —— 参考实现机制解剖与宿主能力盘点（DEC-005）

| 项 | 值 |
| --- | --- |
| Task ID | RES-002 |
| 优先级 | P0 |
| 文档类型 | 调研 + 需求分析（Analyst Agent 产出） |
| 日期 | 2026-08-18 |
| 绑定 Skill | requirement-clarification（问题/范围/约束/非功能四步）+ 参考实现机制解剖研究法（结论带 文件:行号） |
| 调研对象（只读） | `.tmp-research/dsh-vision-router/**`（v1.6.0 参考实现）、本项目 `lib/**`、`tests/**`、`docs/**`、RES-001 报告、`.governance/review-RES-001.md` |
| 状态 | 三研究问题完成（宿主包代码级盘点受限——node_modules 未安装，显式标注 + 验证计划） |
| 关联治理记录 | DEC-005（用户决策：原生优先 / 参考 dsh-vision-router / 框架通用化 / 成功标准延后）；plan-tracker RES-002 待开始 |

> 本文档为唯一写目标。未修改任何产品代码（lib/、tests/）、未修改 .governance/ 治理记录、未执行任何命令（pwsh 全禁，含只读列举）。
> 事实 / 假设 / 建议三分离：正文中【事实】为代码级证据（文件:行号），【假设】为未验证前提（附验证计划），【建议】为分析性意见（不定案）。
> 证据分级：**代码级** = 本次会话 read/grep 直接核对（文件:行号 可复查）；**二级** = RES-001 报告记录 / architecture.md F1–F14（rc.7 实测记录，本任务未重验宿主侧）；**宣称** = README 文字，未经代码印证（显式标注）。

---

## 1. 执行摘要

### 1.1 RQ1 — dsh-vision-router（v1.6.0）机制解剖（代码级）

**RQ1a 原生展示：三层机制，插件自己不渲染图片、把图片塞进宿主附件体系让宿主原生渲染。**

| 层 | 机制 | 关键代码 |
| --- | --- | --- |
| 日志层 | 会话日志保留原始 image 块（宿主 F3 不变量），Web UI 原生显示 | `createWrapperStreamBody` 只改模型输入不改日志（index.js:2473-2520）；`agent/pre-step` 改写仅作用于 outgoing messages（index.js:4838-4856） |
| 模型输入层 | 图片块改写为文本 marker / 缓存描述，文本模型永远见不到裸图片块 | index.js:2505-2517（wrapper marker）、index.js:734-736（`imageMarker`）、index.js:959-982（`rewriteHistoryImages`） |
| 浏览器层 | 工具卡片经 `tool.call.toolview` 槽注入；`vision_present` 产物用宿主 `ImageGallery` 组件原生渲染 | lib/client.js:3701-3714（槽注入）、lib/client.js:3614-3657（`VisionPresentCard`）、lib/client.js:13（`require('@deepseek-ai/dsh-client-ui-attachment').ImageGallery`）、lib/client.js:3579-3608（`loadPresentedImage` → `binding.session.readAttachment` → object URL / data URL） |

客户端注入清单（宿主 dsh.client 声明）：`@deepseek-ai/dsh-client-ui-settings` / `dsh-client-runtime` / `dsh-client-connection` / `dsh-api-remotes`（package.json:86-94）。`cordis.patch.yml` 补丁做两件事：挂载插件行（cordis.patch.yml:15-19）+ 放宽附件限制 `maxImageBytes: 20MB / maxImagePixels: 1亿`（cordis.patch.yml:23-26）。

**RQ1b "图片轮 = 普通工具调用轮"：核心在 `agent/pre-step` 钩子（默认 routing: false 下）。**

- 图片轮**不切模型**（默认）：`routing: false`（index.js:249、index.js:2794 `routingEnabled = () => current().routing !== false`）→ `agent/request` 钩子直接返回原 config（index.js:4887）。
- `agent/pre-step`（index.js:4644-4880）是转换点：检测 `blocksHaveImage` → 自动挂载 14 个深看工具（index.js:4799-4800 `activateDeepTools`）→ 注入带 id 的 user reminder 消息（"本轮消息包含图片，像素级视觉工具已自动挂载…"，index.js:4807-4831）→ 模型输入层图片块改写为附件 id marker（index.js:4851 `rewriteHistoryImages`）。
- **主模型感知图片的三通道**：① pre-step 注入的 user reminder 明文（index.js:4814-4831）；② 模型输入层 marker 文本 `[attached image: <id>] ... call vision_describe with attachmentIds`（index.js:734-736）；③ 工具描述文本（vision_describe description，index.js:4938-4954）。
- 视觉调用通路：工具 execute（index.js:4986+）→ `callVisionPairWithOptionalBridge`（index.js:3925-3947）→ `callVisionPair`（index.js:3887-3897）→ `visionAnswer` = `llm.stream({provider, model, messages})` **独立调用**（index.js:2158-2164）。文本结果作为普通工具结果返回主 agent 轮次。
- 跨轮图片记忆：`imageMemory`（attachmentId → 描述文本），后续文本轮用缓存描述替换历史图片块（index.js:925-947 `replaceImageBlocksWithMemory`、index.js:959-982）。

**RQ1c 整轮路由/模型接管对照（关键：与我们问题①的差异）。**

| 机制 | dsh-vision-router | 本项目（RES-001 定位） |
| --- | --- | --- |
| 整轮路由（agent/request 替换 provider/model） | **存在但默认关闭**（`routing: false`，index.js:249）；开启时切到 chain route / 第一个视觉后端（index.js:4923-4931） | 默认开启（tool.js:199-232 无条件注册，判据命中即替换） |
| 模型接管 | 两种形态均为**用户显式选择**后生效：stealth 接管官方路由（默认关，index.js:255/3013-3088）、`autoWrapProviders` 自动注册「+ 自动识图」twin 组（默认开，index.js:323/3569-3615）——但 README 明确"发图前请选择带「+ 自动识图」的模型组"（README.zh.md:147-150），**不静默改用户当前模型** | 默认接管用户默认模型 + 当前会话（wrapper.js:241-258、client.js:3188-3218）——**静默改写** |
| 视觉调用通路 | 工具内 `llm.stream` 独立调用（index.js:2158-2164）——不参与主 agent 轮次、不创建 subagent | runChat 同款 `llm.stream`（service.js:952-961，但图片被包装路由剥除）；整轮路由让专业模型以主 agent 身份回答整轮（RES-001 §4.1 机制 A） |
| 合规结论 | 默认形态下**不违反**"专业 agent 只能作为工具"：图片轮仍是主 agent 轮次，视觉模型只出现在 vision_describe 工具调用内 | 违反（RES-001 问题①，三机制复合体） |

**RQ1d 内置免费视觉链 + pixel 工具集架构。**

- 免费链 = `vision-http` 路由（index.js:3100）+ 内置 OVH 匿名端点 5 模型（index.js:1762-1771 `DEFAULT_HTTP_PROVIDERS`）；`freeFallback: true` 时固定兜底（index.js:1946-1950）。
- 降级链顺序：用户配置视觉模型 → localOllama → localLmStudio → 自定义 httpProviders → OVH 免费兜底（README.zh.md:263-278；代码：index.js:3887-3947 `callVisionPairWithOptionalBridge` + 熔断/期限/轮次失败记忆，index.js:2871-2882）。
- pixel 工具集：14 个工具经 `ctx.tools.register` 注册（index.js:6863），默认常驻（entry.js:22 把 `progressiveTools` 归一为 false——Config 内部默认 true（index.js:268）但入口层改写为 false，README:217 与入口层一致）；本地处理引擎 sharp/potrace/tesseract/Chrome（package.json:50-55 依赖），视觉模型按需兜底。
- 工具执行共用 `answerVisionForTool` / `callVisionPairWithOptionalBridge` 通路（index.js:5955-5960 等），产物写 `<workspace>/.dsh-vision-router/artifacts`（index.js:297）。

**README 宣称与代码不符 / 张力处（显式标注）**：

| # | README 宣称 | 代码实际 | 判定 |
| --- | --- | --- | --- |
| R-1 | "图片轮直接交给视觉模型看原图"（README.zh.md:69 路由桥标签） | 默认 `routing: false`，图片轮 = 主 agent 轮次 + 工具调用；"整轮直交视觉模型"仅 routing: true 时成立 | **宣称与默认路径不符**（叙事偏向旧模式；README.zh.md:338 配置表自述 routing 默认 false） |
| R-2 | "默认免费……每 IP 每模型 2 次/分钟，独立限额理论合计约 10 次/分钟"（README.zh.md:60） | `DEFAULT_HTTP_PROVIDERS` 5 个模型同域名独立匿名配额（index.js:1762-1771） | 代码印证（配额数值属外部事实，未实测） |
| R-3 | "未声明图片能力、甚至被标成仅文本的模型也会列出并给出警告"（README.zh.md:158） | `resolveToolVisionPairs` 对显式配置的 pairs 仅以 `attemptable !== false` 过滤（index.js:3998-4002，capability 为 advisory）；但设置页 `visionCapsEmptyBody` 文案显示"没有任何被标记支持图片的模型时安全隐藏"（client.js:357） | **部分张力**：工具侧放行（代码级），设置页下拉的隐藏逻辑与文案需运行时核对（未验证，标注 H-R3） |
| R-4 | "完整视觉工具表从会话开始就保持稳定"（README.zh.md:156） | entry.js:22 归一 `progressiveTools: false` → apply 时 `activateDeepTools()` 直接挂载（index.js:6935） | 代码印证 |

### 1.2 RQ2 — 宿主附件能力地图（证据受限，见 §4 前提）

宿主包 `node_modules/@deepseek-ai/dsh-{attachment,attachment-local,client-ui-attachment,agent-loop,subagent}` **不在工作区**（glob 验证零结果；RES-001 时代同样不可得，其宿主引用按"rc.7 观察事实"处理，review-RES-001.md:14 认可）。能力地图基于三类可复查证据构建：① 本项目 lib/ 对宿主 API 的调用面（代码级）；② dsh-vision-router 对宿主 API 的调用面（代码级）；③ RES-001 记录的宿主事实 + architecture.md F1–F14（二级）。宿主包内部实现（dsh-attachment types、dsh-agent-loop deriveMessages 等）**无法给出代码级行号**——显式标注 + 验证计划（V-R2，见 §9）。

能力地图结论（详见 §4）：

- **附件类型**：image 走宿主原生图片块（`{ type: 'image', attachment: ref }`，内容寻址 `sha256:...`）；audio/video **无 composer 通路**（F8，composer 仅接受图片块）→ 只能走工作区文件（`files` 通路）；任意文件走 `files` 参数（工作区路径 / URL 下载落盘 `.router-files/`）。
- **生命周期六阶段**：上传（原生草稿轨 `createDraftImages`/`addImages`）→ 落盘（宿主 `attachments.saveImage`，内容寻址去重）→ 会话日志（image 块保留原件，事件 `user/message` 等）→ 模型输入（`deriveMessages` + 插件改写层）→ 工具传递（`selectAttachments` 附件序号 / `includeImages` / `files` 分发）→ 展示（日志原生渲染 / 工具卡片 toolview / `readAttachment` 取字节）。
- **宿主扩展点清单**：`ctx.llm.registerAdapter` / `registration` / `stream` / `listProviders` / `resolveModelInfo`（F1/F10）、`ctx.tools.register`（F5）、`ctx.slots.inject`（F5/F11）、`ctx.get('attachments')`（F6）、`ctx.get('fs')`（F7）、`ctx.on('agent/request'/'agent/pre-step')`（F4）、`settings.register`（F9）、`subagents.start`（F9）、`session.deriveMessages` / `session.readAttachment` / `session.header.cwd`、`sessions.selectModel` / `agentDefaultModel.saveSelection`（F14）、`llm/adapters-updated` 事件（F9）。

### 1.3 RQ3 — 通用化差距分析（框架需求草案，不定案）

差距：本项目现状 = "image 特化 + 静默接管 + 整轮路由 + 无条件删图"（wrapper.js:220 `rewrite: () => null` 连原生多模态路径都删）；vision-router = "image 特化但**能力感知**（`preserveImageInput`，原生多模态→保真直传 / 纯文本→marker 工具，index.js:3555-3566）+ 用户显式选择 + 工具优先"。DEC-005 要求的"通用"（覆盖 image/audio/video/text，模态无关）**两者都未实现**——vision-router 的 `rewriteImagesDeep` 只处理 image 块（index.js:2475-2518），本项目 `MODALITY_ENTRIES` 只有 image 条目（wrapper.js:203-222）。

框架需求草案（§5）：模态能力声明矩阵（agent capabilities × attachment types）、路由判定（主模型 inputModalities 感知 → 原生通路 / 专业 agent 兜底，推广 DEC-005 决策①到任意模态）、三级展示策略（原生 image 块 / 缩略图卡片 / 路径文本）、与 RES-001 候选 C1/C2 的关系（**融合**：C1 为合规基座、C2 的"文本路径常驻模型输入"泛化为无模态能力时的兜底策略；C3 方向冲突不采纳）。显式 OUT：不做最终架构定案（Architect）、不定成功指标（DEC-005 ④）。

---

## 2. 调研范围与方法

### 2.1 范围

- 只读对象：`.tmp-research/dsh-vision-router/**`（v1.6.0，任务给定）、本项目 `lib/**`（index/service/tool/wrapper/client/rpc/schemas）、`tests/**`、`docs/**`、RES-001 报告、`.governance/review-RES-001.md`。
- 宿主包（任务给定 `node_modules/@deepseek-ai/dsh-{attachment,attachment-local,client-ui-attachment,agent-loop,subagent}`）：**目录不存在**（glob `node_modules/@deepseek-ai/*` 与 `**/node_modules/*` 均零结果；本项目 package.json 仅声明 peerDependencies，未安装依赖）。→ 宿主包代码级盘点不可行，已降级为"插件调用面 + 二级证据"（§4 前提，V-R2 验证计划）。
- 参考实现选择：任务给定 `.tmp-research/dsh-vision-router`（v1.6.0）。工作区另存在 `.inspect-vision-router`（v1.5.2 副本，architecture.md 曾参考）——本次以 v1.6.0 为准，v1.5.2 仅作版本差异参考（不展开）。

### 2.2 证据分级

| 级别 | 定义 | 本报告示例 |
| --- | --- | --- |
| **代码级** | 本次会话 read/grep 直接核对的 文件:行号 | `.tmp-research/dsh-vision-router/index.js:4644-4880` |
| **二级** | RES-001 报告的宿主事实 / architecture.md F1–F14（rc.7 实测记录，本任务未重验宿主侧） | `dsh-agent-loop/lib/index.js:642-658`（RES-001 §9 事实 8） |
| **宣称** | README 文字未经代码印证 | README.zh.md:60 免费额度数值 |

### 2.3 方法

- requirement-clarification 四步法（问题澄清 / 范围澄清 / 约束假设 / 非功能初筛）逐研究问题应用（§3 各节"澄清四步"）。
- 参考实现机制解剖：README.zh.md 全文通读（576 行）→ grep 定位关键机制（agent/pre-step、agent/request、llm.stream、tools.register、slots.inject、attachments）→ 精读对应代码段（index.js 关键段 725-1100 / 2150-2680 / 2765-3100 / 3341-3680 / 3887-4320 / 4620-5440 / 6800-6944；lib/client.js 3495-3741；lib/wrapper-directory.js 全 212 行；lib/android-attachment-compat.js 全 162 行）。
- 过程透明性：全程未执行任何 pwsh 命令（含只读列举）；目录枚举全部经 glob 完成。唯一写入为本文档。

---

## 3. 问题澄清（逐研究问题）

### 3.1 RQ1 —— 参考实现机制解剖

**问题澄清**：dsh-vision-router 如何在不违反"专业 agent 只作工具"约束的前提下，让纯文本主模型完成图片理解，且界面原生？
**范围澄清**：IN = 原生展示机制（a）/ 图片轮转工具轮机制（b）/ 路由与调用通路（c）/ 免费链与工具集架构（d）；OUT = 不评估其 368 个测试的覆盖质量、不评估其免费端点的法律/额度风险、不对比其 v1.5.2 与 v1.6.0 的全部差异。
**约束假设**：宿主约束 C-1（专业 agent 只能作为被主 agent 调用的工具）与 C-2（不改宿主代码）为参照基准（RES-001 §6）；`routing: false` 默认形态为主解剖对象（默认即推荐形态）。
**非功能初筛**：机制层无性能要求（只读）；结论必须可复查（文件:行号）。

### 3.2 RQ2 —— 宿主附件能力盘点

**问题澄清**：宿主原生支持什么附件能力、插件能挂载什么、扩展点在哪？
**范围澄清**：IN = 附件类型 × 生命周期六阶段能力地图 + 宿主 API 扩展点清单；OUT = 宿主包源码内部实现细节（不可得，V-R2）、dsh-agent-loop 完整瀑布语义重验（RES-001 已覆盖）。
**约束假设**：宿主版本 rc.7（RES-001 依赖行）；node_modules 未安装为前提（V-R2）。
**非功能初筛**：能力地图需标注证据级别，不把二级证据写成代码级。

### 3.3 RQ3 —— 通用化差距分析

**问题澄清**：把"图片特化的附件路由"泛化为"任意模态（image/audio/video/text）的通用附件路由框架"，需要哪些需求要素？
**范围澄清**：IN = 模态矩阵草案 + 路由判定草案 + 三级展示策略 + 与 C1/C2 关系；OUT = 最终架构定案（Architect）、成功指标（DEC-005 ④ 用户延后）、具体后端选型。
**约束假设**：DEC-005 决策①（原生优先 / 无视觉能力时"路径+缩略图"保底）、②（参考 vision-router 原生展示）、③（框架通用化）为硬输入；C-1/C-2 宿主约束延续。
**非功能初筛**：框架需满足可维护性（注册表而非 if-else）、兼容性（不改宿主、不违反 C-1）。

---

## 4. RQ2 —— 宿主附件能力地图

### 4.1 前提与证据来源（重要）

【事实】`node_modules/@deepseek-ai/` 不存在于工作区：glob `node_modules/@deepseek-ai/*`、`node_modules/**/package.json`、`**/node_modules/*` 全部零结果。本项目 package.json 对 `dsh-attachment/dsh-agent/dsh-subagent/dsh-agent-default-model/dsh-session/dsh-settings/dsh-system-prompt/dsh-credentials` 仅声明 peerDependencies（package.json:46-55），`dsh-llm/dsh-tools` 为 dependencies 但未安装。
【事实】RES-001 报告同样以"宿主源码引用超出工作区只读范围，按 rc.7 观察事实处理"（review-RES-001.md:14）。
【事实】宿主 API 使用面可从两个插件侧的代码级调用点反推（本报告 §4.2/§4.3 全部带 文件:行号）。
【假设】H-R2-1：宿主 API 形状（attachments.saveImage/readImage、llm.registerAdapter/stream、tools.register、slots.inject、agent/pre-step 等）与 rc.7 一致。验证计划：V-R2（依赖安装后重验宿主包 d.ts）。

### 4.2 附件类型（宿主原生支持面）

| 附件类型 | 宿主进入方式 | 消息载体 | 证据（插件调用面） |
| --- | --- | --- | --- |
| image | composer 图片块：粘贴 / 拖拽 / 原生附件按钮 | `{ type: 'image', attachment: ref }`，ref = `{ attachmentId: 'sha256:...', mediaType, width, height, bytes, name? }` | 本项目 client.js:3240-3241（`createDraftImages` → `addImages`）；service.js:946（`content.push({ type: 'image', attachment: ref })`）；vision-router index.js:5046（`blocks.push({ type: 'image', attachment: ref })`） |
| audio / video | **无 composer 通路**（F8：composer 仅接受图片块，MIME 白名单） | 工作区文件路径（`files` 参数 / `filePath`） | architecture.md:34（F8 记录）；service.js:95-98（`filePath` 语音通路）、service.js:637-653（files 分发） |
| 任意文件 | `files` 参数：工作区路径（fs.resolve/stat 校验）或 http(s) URL（宿主 fetch 下载 ≤25MB 落盘 `.router-files/`） | 路径文本（注入 task / 子代理 prompt） | service.js:676-748（`resolveInputFiles` / `downloadInputFile`） |
| 文本 | 普通文本块 / files 文本内联（UTF-8 严格解码 + 8KB 无 NUL 嗅探） | text 块 | service.js:795-813（`prepareChatFiles` 文本分支） |

【二级】宿主附件存储为内容寻址（`sha256:` 前缀 attachmentId，天然去重）：vision-router `attachments.saveImage` 返回 ref 含 `attachmentId`（index.js:5033-5045）；android-attachment-compat.js:62-72 在权限边界降级时**自行构造同形 ref**（`sha256:<hash>` + mediaType + width/height）——证明宿主 ref 形状稳定可复刻。

### 4.3 生命周期六阶段能力地图

| 阶段 | 宿主能力 | 插件挂载点（本项目） | 插件挂载点（vision-router 参考） | 证据 |
| --- | --- | --- | --- | --- |
| ① 上传 | composer 原生草稿轨（仅图片块） | AttachButton（client.js:3225-3269）→ `createDraftImages`+`addImages`（client.js:3240-3241）；槽 `conversation.input.right`（client.js:3440-3450） | 不干预上传（原生草稿轨） | 本项目 client.js；vision-router 无上传钩子（README.zh.md:154-158 直接贴图） |
| ② 落盘 | `ctx.get('attachments')` → `saveImage({data, mediaType, name})` 返回持久 ref（内容寻址） | `prepareChatFiles` files 图片注入（service.js:781-792） | vision_describe 图片转存（index.js:5033-5046）；vision_present 产物发布（index.js:6074-6083）；Android 权限边界降级（android-attachment-compat.js:100-162） | 均代码级 |
| ③ 会话日志 | 事件 `user/message` / `assistant/message` / `tool/result`；image 块保留原件（F3） | route_agent 工具结果以**纯文本标记** `[router:image:...]` 写入（tool.js:111-119），不写图片块 | `collectEventAttachmentRefs` 从事件日志回扫附件（index.js:779-803）；`scanSessionEventLog`（index.js:4679） | architecture.md:29（F3）；vision-router index.js:760-803 |
| ④ 模型输入 | `session.deriveMessages()` 派生消息（RES-001 引用）；适配器收 `options.messages`（F3） | 整轮路由读尾部 user 消息（tool.js:214-224）；`recentAttachmentBlocks`（service.js:1629-1645）；改写层 `rewriteContentDeep`（wrapper.js:97-125） | `agent/pre-step` 改写 outgoing messages（index.js:4644-4880）；wrapper stream 改写（index.js:2473-2520） | 均代码级 |
| ⑤ 工具传递 | `attachments` 序号 / `includeImages` 快捷派发；`files` 能力化分发 | `selectAttachments`（service.js:1654-1670）；`resolveInputFiles`（service.js:676-701）；`prepareChatFiles`（service.js:758-816）；agent 类型图片直传 prompt（service.js:1027） | vision_describe `paths`+`attachmentIds`（index.js:4999-5088）；`readImageBytes` 兼容路径与附件 id（index.js:5016-5018） | 均代码级 |
| ⑥ 展示 | 日志层原生渲染图片块（F3）；`tool.call.toolview` 槽工具卡片 | RouteAgentToolCard 解析 `[router:image:...]` 标记 → `router/imageData` RPC 取字节 → base64 缩略图（client.js:3318-3360；rpc.js:147-154；service.js:1817-1844）；真实图片块兼容（client.js:3331-3334） | VisionPresentCard → `binding.session.readAttachment` → object URL / data URL → `ImageGallery`（client.js:3579-3664）；ArtifactCard 产物卡（client.js:3508-3569） | 均代码级 |

### 4.4 宿主 API 扩展点清单（通用框架的挂载面）

| 宿主 API | 用途 | 证据（代码级调用点） |
| --- | --- | --- |
| `ctx.llm.registerAdapter([route], adapter)` / `registration(provider).adapter` | 注册自有路由、惰性获取原适配器委托 | wrapper.js:132/275；vision-router index.js:3019/4297 |
| `ctx.llm.stream({provider, model, messages, system})` | 独立模型调用（工具内视觉/文本调用） | service.js:952-961；vision-router index.js:2158-2164 |
| `ctx.llm.listProviders()` / `resolveModelInfo(provider, model)` | 能力感知（inputModalities 查询） | service.js:925-933；vision-router index.js:3954/3400 |
| `ctx.tools.register(def)` | 模态工具包注册 | tool.js:57；vision-router index.js:6863 |
| `ctx.slots.inject('tool.call.toolview' / 'conversation.input.right' / 'settings.section', ...)` | 工具卡片 / 附件按钮 / 设置页注入 | client.js:3440-3470；vision-router client.js:3684/3701 |
| `ctx.get('attachments')` → `saveImage/readImage` | 附件持久化与读取（内容寻址） | service.js:781-792/1822-1826；vision-router index.js:5033/5059 |
| `ctx.get('fs')` → `resolve/stat/readBytes` | 工作区文件校验与读取（files 通路） | service.js:677-699/761-773 |
| `ctx.on('agent/request' / 'agent/pre-step')` | 轮次路由 / 模型输入改写 | tool.js:204；wrapper.js（无）；vision-router index.js:4644/4885 |
| `settings.register(ns, schema)` | 配置 namespace（热生效） | index.js:65；vision-router index.js:6954 |
| `subagents.start('spawn', {...})` | agent 类型委派（独立会话工具形态） | service.js:1036-1044 |
| `session.deriveMessages()` / `session.header.cwd` / `session.readAttachment(id)` | 消息派生 / 工作目录 / 附件读取 | service.js:1634/1016；vision-router client.js:3586 |
| `sessions.selectModel` / `agentDefaultModel.saveSelection` | 会话/默认模型切换（F14） | client.js:3208；wrapper.js:249 |
| `llm/adapters-updated` 事件 | 模型目录热同步 | wrapper.js:286；vision-router index.js:3616 |

---

## 5. RQ3 —— 通用化差距分析与框架需求草案

### 5.1 差距定位（本项目现状 vs vision-router vs DEC-005 通用化要求）

| 维度 | 本项目现状 | dsh-vision-router | DEC-005 要求（通用） |
| --- | --- | --- | --- |
| 模态范围 | image 特化（wrapper.js:203-222 仅 image 条目；schemas.js:39 capabilities 为自由字符串无枚举） | image 特化（rewriteImagesDeep 仅处理 image 块，index.js:2475-2518） | **任意模态**（image/audio/video/text，专业 agent 可自定义） |
| 主模型能力感知 | 无：无论主模型是否支持图片都走包装路由删图（wrapper.js:220 `rewrite: () => null`）+ marker | **有**：`preserveImageInput` 按源模型 inputModalities 判定（index.js:3555-3566 `sourceAcceptsImages`），原生多模态→保真直传 | **原生优先**：主模型有模态能力 → 原生交互（DEC-005 ①） |
| 无模态能力时保底 | system marker（依赖模型自觉，LP-4）；`[用户附带图片]` 死规则（LP-3） | 附件 id marker + vision_describe 工具（index.js:734-736/2505-2517） | **路径+缩略图** 保底（DEC-005 ① 明确） |
| 合规（C-1） | 违反（整轮路由 + 静默接管，RES-001 问题①） | 默认形态合规（工具优先 + 用户显式选择） | 必须合规（延续 RES-001 审查结论） |
| 展示 | 日志原生 + 工具卡片缩略图（client.js:3318-3360） | 日志原生 + ImageGallery 原生渲染（client.js:3614-3657） | 原生 image 块 / 缩略图卡片 / 路径文本三级 |

【建议】通用框架的差距本质：**把"模态处理"从"插件内部 if-else 特化逻辑"提升为"能力感知的注册表"**——主模型能力感知决定通路（原生 vs 专业 agent 兜底），模态类型决定载体（image 块 / 音频文件路径 / 视频路径 / 文本），agent capabilities 决定派发（谁有能力处理该模态）。

### 5.2 需求草案 D1 —— 模态能力声明矩阵（agent capabilities × attachment types）

【建议】以 文件:行号 事实为基座：

- 现有能力判据：【事实】`listImageVisionAgents` = type∈{chat,agent} ∧ capabilities.includes('image')（service.js:1779-1790）；`listImageGenerationAgents` = type∈{image} ∨ (type=cli ∧ capabilities.includes('image'))（service.js:1799-1810）——已区分"消费"与"产出"语义（service.js:1774-1777 注释）。
- 现有能力 schema：【事实】capabilities 为自由字符串数组 `z.array(z.string()).default([])`（schemas.js:39），无枚举、无类型绑定。

草案矩阵：

```
                    可接收附件类型（消费）          可产出（生成）
agent.type  image   audio   video   text    任意文件
chat        ✅cap   ⚠️cap   ⚠️cap   ✅       文本内联(service.js:795-813)
agent(子代理) ✅cap   ✅cap   ✅cap   ✅       路径注入(service.js:644-646/1025)
cli         ✅cap   ✅cap   ✅cap   ✅       路径注入(service.js:644-646)
image       ✅cap(编辑输入)  —      —      —       ✅ 图片产物(service.js:662 runImage)
speech      —       ✅cap   —      —       ✅ 转写文本(service.js:665/1620)
```

要素（建议，不定案）：
1. capabilities 枚举化（`image/audio/video/text/file` 等）并区分消费/产出（vision-router 已有"能力是 advisory、调用时验证"的成熟实践：index.js:3988-4019 `resolveToolVisionPairs` + index.js:2653-2667 `decideVisionBackendCapability`——声明不足时用模型名启发式（index.js:2604-2638）与实际调用兜底，可吸收为通用"能力解析器"）。
2. agent.type × capabilities 的默认能力映射表（chat 默认消费 text；agent/cli 默认消费全部文件；speech 绑定 audio；image 绑定产出 image）。
3. 模态→专业 agent 的解析复用现有 `resolveAgent` 骨架（service.js:550-608），新增"按模态查可用 agent"目录（listImageVisionAgents 的泛化）。

### 5.3 需求草案 D2 —— 路由判定（主模型能力感知 → 原生通路 / 专业 agent 兜底）

【事实】vision-router 的原生通路参考：twin adapter `preserveImageInput`（index.js:3555-3566）→ 源模型 `sourceAcceptsImages`（index.js:3498-3507 查 `inputModalities.includes('image')`）→ 原生多模态时 `keepOriginalImages=true` 图片块原样委托（index.js:2442-2452、2473）；纯文本时改写为 marker（index.js:2475-2518）。【事实】本项目现状：包装路由无条件声明 `['text', ...模态]`（wrapper.js:166/178）且 stream 无条件删图（wrapper.js:220）——主模型是否真有能力从未被查询。【事实】service.js:932-933 有 `llm.resolveModelInfo` 能力查询先例（runChat 预检）。

草案路由判定（推广 DEC-005 ① 到任意模态，建议）：

```
用户消息含模态块 M（image 块 / 工作区音频路径 / 视频路径 / 文本引用）
   │
   ├─ 主模型 inputModalities 含 M？─────────────── 是 → 原生通路
   │       （llm.resolveModelInfo 查询，service.js:932 先例）      图片块原样进模型输入（wrapper
   │                                                               保留块、只声明、不删图——对应
   │                                                               DEC-005 ①"原生 image 交互"）
   │
   └─ 否（主模型无该模态能力）→ 专业 agent 兜底
           ├─ 文本可见载体（常驻模型输入，不依赖模型自觉）：
           │     路径文本（files / 工作区落盘 .router-files/）+
           │     附件 id 标记 + 模态描述（"此音频已转写为文本：…"）
           ├─ 主 agent 感知（reminder user 消息 / system 段，对应
           │     vision-router index.js:4807-4831 与 wrapper.js:190-192）
           └─ route_agent 工具调用 → 有该模态能力的专业 agent
                  处理 → 文本结果返回主 agent（现有通路，service.js:632-667）
```

要点（建议）：① 原生直传分支是**新增**（现状无）；② 兜底载体从"仅 system marker"升级为"路径文本 + 附件标记"（对齐 DEC-005 ①"路径+缩略图保底"）；③ 模态块的类型判定从"只看 image 块"扩展为"image 块 / 消息内路径引用 / files 参数"三类（音频视频走工作区文件，F8 硬约束）。

### 5.4 需求草案 D3 —— 三级展示策略

【事实】现状两级：① 日志层原生图片块渲染（F3，宿主能力，本项目不干预）；② 工具结果缩略图卡片（client.js:3318-3360 RouteAgentToolCard + service.js:1817-1844 imageData RPC）。【事实】vision-router 有第三形态：`vision_present` 产物经宿主 `ImageGallery` 原生渲染（client.js:3614-3657）——**把图片发布为宿主附件后用宿主原生组件展示**，这是"最原生"的工具产物展示。

草案三级（建议）：

| 级 | 形态 | 适用 | 参考证据 |
| --- | --- | --- | --- |
| L1 | 原生 image 块（宿主气泡 / ImageGallery 原生渲染） | 主模型有 image 能力（原生直传）或专业 agent 返回图片附件引用 | vision-router client.js:3650-3655（ImageGallery）；本项目 F3 |
| L2 | 缩略图卡片（toolview 工具卡） | route_agent 工具结果含图片引用 / 附件 id | 本项目 client.js:3348-3352（RouteImage）；vision-router client.js:3508-3569（ArtifactCard） |
| L3 | 路径文本（可点击/可复制） | 无任何图片渲染条件时的保底（音频/视频/二进制） | 本项目 files 通路（service.js:1025 注入路径文本）；vision-router ArtifactCard 打开文件按钮（client.js:3547-3566） |

【建议】L3 的"打开文件"交互参考 vision-router ArtifactCard（client.js:3547-3566）——路径文本附"打开文件"按钮，比纯文本更可用；音频/视频的 L3 可扩展为"播放器引用"（宿主无此原生组件时先以路径文本 + 缩略图/时长元数据兜底，标注为假设 H-D3，见 §9）。

### 5.5 需求草案 D4 —— 与 RES-001 候选 C1/C2/C3 的关系（取代还是融合）

| 候选 | 定位 | 与通用框架的关系 | 结论 |
| --- | --- | --- | --- |
| C1 撤销整轮路由 + 撤销接管，纯工具通路 | 问题①架构冲突的修正（RES-001 §8） | 框架的**合规基座**：框架默认形态必须与 C1 一致（专业 agent 只作工具、用户模型选择不被静默改写） | **融合**（框架吸收 C1 全部三个改动点作为前提） |
| C2 撤销整轮/接管 + 复活"落盘 + 路径注入"文本信号 | 图片信息"文本路径常驻模型输入"（RES-001 §8） | 框架 D2 的"无模态能力保底层"**泛化形态**：C2 是图片特化，框架推广到 audio/video/text；"缩略图"由 D3 的 L2/L1 承担（C2 担心的"路径文本呈现体验回退"由三级展示化解） | **融合**（C2 的文本载体思想泛化进 D2，不照搬其图片专用实现） |
| C3 保留整轮路由仅修复解析 | 治标（RES-001 §8 自评不建议为最终形态） | 与框架"专业 agent 只作工具"前提**方向冲突** | **不采纳**（框架默认形态与 C3 互斥；若用户要求保留整轮路由能力，应作为框架内"显式 opt-in 的整轮模式"而非默认，且需用户单独决策——见 §10 D-3） |

【建议】落地顺序参考（不定案）：先按 C1 收敛合规（机制面最小），再按 D1→D2→D3 泛化（注册表化），C2 的路径注入作为 D2 兜底层的实现细节按需吸收；每步独立可回滚。DEC-005 ④（成功标准）延后至框架设计定稿。

### 5.6 明确非目标（OUT）

| # | 事项 | 为什么不做 |
| --- | --- | --- |
| OUT-1 | 最终架构定案（模块划分/接口签名/实现顺序） | Analyst 职责边界：需求分析可给草案，定案归 Architect（RES-001 同款 OUT-2） |
| OUT-2 | 成功指标（量化验收） | DEC-005 ④ 用户明确延后至框架设计定稿 |
| OUT-3 | 具体后端选型（视觉/音频/视频模型与端点） | 选型归 Architect；vision-router 的 OVH 免费链仅作参考不评估 |
| OUT-4 | 修改任何产品代码 / tests / .governance | 任务硬门槛：本调研零修改 |
| OUT-5 | 与用户交互（提问/确认） | Analyst 禁止；决策点返回 Coordinator 经 ask_user_question |
| OUT-6 | 复活"发送条 + imagePrompt RPC"旧路径机制（bf884d2 已移除） | 已被原生草稿轨取代（architecture.md:155-157）；框架只吸收"路径注入"的文本载体思想（D2），不复活旧客户端路径 |
| OUT-7 | 评估 vision-router 免费端点的额度/合规/稳定性 | 超出附件路由框架范围（后端链设计归 Architect + 运维） |

---

## 6. 干系人与约束澄清

### 干系人

| 角色 | 职责 |
| --- | --- |
| 用户（插件使用者） | 提供 DEC-005 决策；验收修正后行为（原生优先 / 通用化） |
| Coordinator | 派发本调研；接收结构化结论；经 ask_user_question 收集用户决策（§10） |
| Architect（后续） | 对 §5 草案做架构定案（D1-D4 的模块化落地）；评估 C1/C2 融合顺序 |
| Developer（后续） | 按定案实现；补测试（原生直传分支、模态矩阵、路径兜底端到端） |
| Reviewer（后续） | 审查需求文档（Requirement Reviewer）与实现 |

### 硬约束（延续 RES-001，DEC-005 新增）

| # | 约束 | 来源 |
| --- | --- | --- |
| C-1 | 专业 Agent 不能参与主 agent 轮次，只能作为被主 agent 调用的工具 | 用户报告 + DEC-003（RES-001 §6） |
| C-2 | 不改 DSH 宿主代码 | architecture.md:197-203 |
| C-3 | 纯文本主模型不能接收裸图片块（UNSUPPORTED_CONTENT） | README:130、smoke.mjs:938-941 |
| C-4 | 会话日志保留原件、模型输入层改写（F3 不变量） | architecture.md:106-113 |
| C-5 | 主模型有视觉能力时尽量原生 image 交互；无视觉能力时默认"路径+缩略图"保底 | **DEC-005 ①（新增）** |
| C-6 | 必须参考 dsh-vision-router 的原生展示实现方式 | **DEC-005 ②（新增）** |
| C-7 | 框架必须通用——覆盖图片/音频/视频/文本附件等任意格式，架构按模态能力通用化设计而非图片特化 | **DEC-005 ③（新增）** |
| C-8 | 成功标准延后至框架设计定稿 | **DEC-005 ④（新增）** |
| C-9 | 本调研零产品代码修改、零治理记录修改、零命令执行 | 任务硬门槛 |

### 假设（未验证前提，逐条标注）

| ID | 假设 | 验证计划 |
| --- | --- | --- |
| H-R2-1 | 宿主 API 形状与 rc.7 一致（attachments/llm/tools/slots/agent 事件） | V-R2：依赖安装后重验宿主包 d.ts 与 index.js |
| H-R3 | vision-router 设置页视觉后端下拉的隐藏逻辑与"仅作提示"文案一致 | V-R3：运行态检查设置页下拉（或读 client.js:520-580 过滤逻辑全段） |
| H-D3 | 音频/视频的 L3 展示可先以"路径文本 + 元数据"兜底（宿主无原生播放器组件） | V-D3：宿主 dsh-client-ui-attachment 是否含音视频组件（依赖安装后核查） |
| H-1 | 主模型对 system marker 的响应率不足（沿用 RES-001 H2，C1 成立与否的关键） | U-3（RES-001 §4.3）：关整轮路由实测触发率 |
| H-2 | 用户后续会显式选择包装/自动识图形态而非静默接管（vision-router 模式可迁移） | 框架设计定案时经 Coordinator 与用户确认（§10 D-2） |

### 依赖

| 依赖 | 说明 |
| --- | --- |
| DSH 宿主版本 | 能力地图基于 rc.7 事实（architecture.md F1-F14）+ 插件调用面；宿主升级需回归 |
| 宿主包源码 | node_modules 未安装 → RQ2 代码级盘点受限（V-R2）；需 Coordinator 在安装依赖后补充 d.ts 级核对 |
| RES-001 结论 | 本报告 RQ3 直接消费 RES-001 的 C1/C2/C3 与 LP-1~LP-4 定位（必读上下文） |
| git 历史 | bf884d2 等 commit 详情沿用 RES-001 结论（未重验，本任务禁 git） |

---

## 7. 非功能需求初筛

| 维度 | 初筛结论 |
| --- | --- |
| 性能 | 原生直传分支应零改写开销（图片块原样委托，对应 vision-router index.js:2473 的 `keepOriginalImages` 短路）；兜底分支的路径文本注入不应增加额外往返（files 通路现有 fs 校验已有成本，service.js:676-701） |
| 安全 | 路径注入不得打开任意文件读取面（现有 fs.resolve/stat 校验与 URL 限额保持，service.js:682-698/725）；附件读取保持内容寻址 + readImage 元数据校验（service.js:1819-1821 注释） |
| 可用性 | 任一环失败须有明确错误（现状 LP-2 静默丢失违反可诊断性，RES-001 §7）；框架的兜底载体为文本路径（可读、可诊断） |
| 可维护性 | 框架以注册表组织（模态→改写器/工具/后端链），避免现有三机制并存的复杂度（RES-001 §7）；vision-router 的"能力是 advisory + 调用时验证"模式（index.js:3988-4019）可吸收为通用能力解析 |
| 兼容性 | ① 不违反 C-1（默认形态与 C1 一致）；② 不改宿主（C-2）；③ 会话日志保留原件（C-4）；④ 原生直传分支需与 C-3 共存（仅主模型有 image 能力时直传，否则兜底） |

---

## 8. 事实 / 假设 / 建议汇总

### 事实（代码级，可复查）

**RQ1（dsh-vision-router v1.6.0）**
1. 原生展示三层：日志保留原件（改写在 stream 与 pre-step 层，index.js:2473-2520/4838-4856）；工具产物经 `attachments.saveImage` 发布 + `tool.call.toolview` 槽 + 宿主 `ImageGallery` 渲染（index.js:6074-6083/6091；client.js:3614-3657/3701-3714/13）。
2. 客户端注入清单：package.json:86-94（dsh.client.inject 四项）；cordis.patch.yml:23-26 放宽附件限制。
3. 默认 `routing: false`（index.js:249/2794）→ 图片轮不切模型；`agent/pre-step`（index.js:4644-4880）自动挂载工具 + 注入 reminder + 改写图片块为 marker。
4. 主模型感知三通道：reminder user 消息（index.js:4807-4831）、marker 文本（index.js:734-736/2505-2517）、工具描述（index.js:4938-4954）。
5. 视觉调用通路 = 工具内 `llm.stream` 独立调用（index.js:2158-2164/3887-3897/3925-3947），不参与主轮、不建 subagent。
6. 跨轮图片记忆 imageMemory（index.js:925-947/959-982）。
7. 整轮路由存在但默认关（index.js:4885-4932 + 249）；stealth 接管默认关（index.js:255/3013-3088）；autoWrapProviders 默认开但需用户显式选择「+ 自动识图」组（index.js:323/3569-3615 + README.zh.md:147-150）。
8. 免费链：vision-http 路由（index.js:3100）+ DEFAULT_HTTP_PROVIDERS 5 模型（index.js:1762-1771）；降级链顺序（README.zh.md:263-278 与代码 3887-3947 一致）。
9. 工具集 14 个经 ctx.tools.register（index.js:6863），默认常驻（entry.js:22 归一 progressiveTools: false，Config 内部默认 true 于 index.js:268）。
10. twin adapter 能力感知：preserveImageInput 按源模型 inputModalities 判定（index.js:3498-3507/3555-3566/2442-2452）。

**RQ2（宿主能力地图，插件调用面代码级）**
11. 附件 ref 形状稳定：`{ attachmentId: 'sha256:...', mediaType, width, height, bytes, name? }`（本项目 service.js:785；vision-router index.js:5033-5046；android-attachment-compat.js:62-72 复刻同形 ref 证明形状契约）。
12. 生命周期六阶段挂载点（§4.3 表，全部 文件:行号）。
13. 宿主 API 扩展点清单（§4.4 表，全部 文件:行号）。
14. **node_modules/@deepseek-ai/ 不存在**（glob 零结果）→ 宿主包源码级盘点不可行（前提事实）。

**RQ3（差距）**
15. 本项目现状：image 特化（wrapper.js:203-222 单条目）、无条件删图（wrapper.js:220）、无主模型能力感知、整轮路由+静默接管（tool.js:199-232；wrapper.js:241-258；client.js:3188-3218）。
16. vision-router 的"能力感知直传/改写二分支"是 DEC-005 ①"原生优先"的参考实现（index.js:3555-3566）。
17. capabilities 为自由字符串数组（schemas.js:39），消费/产出语义已在 service.js:1774-1810 注释与判据中隐含区分但未枚举化。

### 假设（未验证，验证计划见 §6）
- H-R2-1 宿主 API 形状与 rc.7 一致；H-R3 设置页隐藏逻辑与文案一致；H-D3 音频/视频 L3 兜底可行性；H-1 marker 响应率不足（沿用 RES-001）；H-2 用户可接受显式选择形态。

### 建议（不定案）
- 通用框架 = 能力感知注册表（D1 模态矩阵 + D2 路由判定 + D3 三级展示），合规基座 = C1，兜底载体 = C2 泛化（D2），参考实现 = vision-router 的 preserveImageInput 二分支与 ImageGallery 原生展示。
- 落地顺序：C1 收敛合规 → D1-D4 注册表化泛化；每步独立可回滚。
- 成功标准待 DEC-005 ④ 由用户在框架定稿时确认（§10 D-1）。

---

## 9. 证据清单

| # | 证据 | 位置 |
| --- | --- | --- |
| E-1 | 原生展示三层机制（日志/模型输入/浏览器卡片） | vision-router index.js:2473-2520, 4838-4856, 6074-6091；client.js:13, 3579-3664, 3701-3714 |
| E-2 | 客户端注入清单 + bundle 补丁 | vision-router package.json:86-94；cordis.patch.yml:15-26 |
| E-3 | 图片轮转工具轮（pre-step 全流程） | vision-router index.js:4644-4880, 4799-4831, 734-736 |
| E-4 | 视觉调用通路（工具内 llm.stream） | vision-router index.js:2158-2164, 3887-3947, 4986-5050 |
| E-5 | 图片记忆（跨轮描述替换） | vision-router index.js:925-947, 959-982, 2775-2777 |
| E-6 | 整轮路由默认关 + 接管形态 | vision-router index.js:249, 2794, 4885-4932, 3013-3088, 3569-3615；README.zh.md:147-150 |
| E-7 | 免费链与工具集架构 | vision-router index.js:1762-1771, 3100, 6863；entry.js:22；package.json:50-55 |
| E-8 | 能力感知二分支（原生直传 vs 改写） | vision-router index.js:3498-3507, 3555-3566, 2442-2452 |
| E-9 | 本项目现状（问题①②三机制 + 单模态） | lib/tool.js:199-232；lib/wrapper.js:43-55, 97-125, 190-222, 241-258；lib/client.js:3188-3269；lib/schemas.js:39 |
| E-10 | 本项目附件通路（selectAttachments/files/runChat/展示） | lib/service.js:637-816, 902-1000, 1629-1670, 1817-1844；lib/tool.js:57-188；lib/client.js:3318-3360；lib/rpc.js:147-154 |
| E-11 | 宿主能力地图（六阶段 + 扩展点） | 本报告 §4.3/§4.4（二级来源：RES-001 §4.1.1/§9 事实 8；architecture.md F1-F14） |
| E-12 | 宿主包不可得 | glob `node_modules/@deepseek-ai/*` 零结果；package.json:46-55 peerDependencies |
| E-13 | RES-001 定位与审查 | docs/requirements/routing-reinvestigation-2026-08-18.md；.governance/review-RES-001.md |
| E-14 | 用户决策 DEC-005 | 任务简报（C-5~C-8）；plan-tracker.md:48（RES-002 入账） |

---

## 10. 需 Coordinator 补充 / 需用户决策的点

| # | 事项 | 类型 | 说明 |
| --- | --- | --- | --- |
| D-1 | 成功标准（DEC-005 ④ 延后项） | 用户决策 | 框架设计定稿时确认；建议候选（沿用 RES-001 思路扩展）：带附件轮主会话 `request/context` 恒为主模型（100%）；原生直传分支下图片块到达主模型输入率 100%；兜底分支下附件文本载体（路径/标记）到达主 agent 输入率 100% |
| D-2 | 接管形态取舍：显式选择（vision-router 模式）vs 静默接管（现状） | 用户决策 | 框架合规前提（C1）要求移除静默接管；vision-router 的"用户显式选择「+ 自动识图」组"是可参考的替代交互，需用户确认是否接受 |
| D-3 | 整轮路由（C3）是否作为"显式 opt-in"保留在框架内 | 用户决策 | 框架默认与 C1 一致（无整轮路由）；若用户希望保留整轮路由能力作为高级选项，需单独决策其合规边界 |
| D-4 | 宿主包依赖安装 + 代码级盘点补验 | Coordinator 补充 | V-R2：`pnpm install`（或等效）后重验 dsh-attachment types / dsh-agent-loop deriveMessages 等，将二级证据升级为代码级 |
| D-5 | vision-router 设置页隐藏逻辑核对（H-R3） | Coordinator/后续 | 运行态或读全 client.js:520-580 过滤逻辑确认"仅作提示"表述 |

---

## 11. 验收标准对照

| # | 验收标准 | 达成情况 |
| --- | --- | --- |
| 1 | RQ1 四子问题（a/b/c/d）各有代码级结论（文件:行号）；README 宣称与代码不符处显式标注 | ✅ §3.1 + §1.1；不符处 4 条（R-1~R-4）显式标注 |
| 2 | RQ2 宿主附件能力地图（附件类型×生命周期六阶段） | ✅ §4.2/§4.3（前提：宿主包不可得，代码级证据来自插件调用面 + 二级证据，V-R2 验证计划显式标注） |
| 3 | RQ3 通用框架需求草案（模态矩阵+路由判定+三级展示+C1/C2 关系），显式 OUT 声明 | ✅ §5.2-§5.6 |
| 4 | 事实/假设/建议三分离；未验证假设逐条标验证计划 | ✅ §8 + §6 假设表（H-R2-1/H-R3/H-D3/H-1/H-2 均带验证计划） |
| 5 | 产品代码零修改；.governance 零修改；不执行任何命令 | ✅ 唯一写入为本文档；全程零 pwsh |

---

## 12. 执行流程对照（任务规范检查）

1. ✅ 通读参考实现 README.zh.md（576 行全文）建立机制全景
2. ✅ grep 定位关键机制（agent/pre-step、agent/request、llm.stream、tools.register、slots.inject、attachments、preserveImageInput）→ 精读对应代码段
3. ⚠️ 宿主附件包逐个盘点 → 宿主包不存在，降级为"插件调用面 + 二级证据"（§4.1 前提 + V-R2 验证计划），未伪造任何宿主源码行号
4. ✅ 差距分析 + 框架需求草案（§5）
5. ✅ 自检硬门槛（§11）→ 返回结构化结论（report 给 Coordinator）
