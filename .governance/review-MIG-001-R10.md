# MIG-001 R10 — Step 8 独立代码审查报告（Code Reviewer）

- **Round**: R10（Step 8 单元首审；审查链 R1-R9 已覆盖 Step 0-7 并全部通过）
- **审查对象**: 未提交变更集 — `lib/service.js`（+89：uploadFile 实现——§4.3.5 校验序列 + rememberWorkspace 工作区记录）/ `lib/client.js`（+118/-17：accept 扩展、类型分流、附件卡片、setDraft 注入、wire codec 接线）/ `tests/client-render.mjs`（+87：FileReader 夹具 + remoteMock + 7 断言）/ `tests/smoke.mjs`（+91：R7-F-01 ×4 + uploadFile service ×8 + R8-F-02 ×3）
- **审查者**: software-project-governance-code-reviewer（只读审查；未运行命令、未执行写操作——唯一写入为本报告）
- **审查日期**: 本会话
- **终态**: `APPROVED_WITH_NOTES`
- **独立结构字段**: `unresolved_blockers=0`

---

## 0. 审查范围与执行方式

- 依据：`git status --short` + `git diff`（read-only 实跑，HEAD 基线）+ 实读四个变更文件全文（service.js uploadFile/rememberWorkspace、client.js AttachButton/attachPathText/intake、两测试文件新增断言块）+ 设计契约实读（`docs/architecture-v3.md` §8 L779、§4.3.5 L332-348、§4.4.2 L387-402）+ 前轮报告实读（R7 / R8）+ M2 实现实读（`lib/attachments.js` registerPath/byId/byPath/ATTACHMENT_ERROR_CODES）。
- 测试运行事实由 Coordinator 提供（本 Reviewer 无 Bash 权限，未亲自复跑，见事实依据表 F2）。
- 未修改任何产品代码；唯一写入为本报告。

## 1. 事实依据表（可复查事实）

| # | 事实 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| F1 | 恰 4 文件变更，+368/-17：client.js / service.js / client-render.mjs / smoke.mjs | `git status --short` + `git diff --stat`（read-only 实跑） | 与任务简报 +368/-17 一致；无第五文件 |
| F2 | `node tests/smoke.mjs` → exit 0，`ALL SMOKE TESTS PASSED`，491 ok / 0 FAIL（469 既有零回退 + 22 新增：15 smoke + 7 client-render）；client-render 随 smoke 内联 exit 0 | Coordinator 独立复跑 | **未亲自复跑**（依协议以 Coordinator 事实为准） |
| F3 | service.js uploadFile（L2011-2060）校验序列顺序与 §4.3.5（L338-339）完全一致：base64 解码（L2016-2021，INVALID_BASE64）→ 图片魔数拒绝（L2022-2024，UNSUPPORTED_MEDIA）→ ≤25MB（L2025-2027，FILE_TOO_LARGE）→ 写 .router-files/<sanitized-name>（L2031-2045，UPLOAD_FAILED）→ M2 registerPath（L2048-2053）→ 返回 { ok, path, attachmentId?, name }（L2054-2059） | 实读 service.js | 逐行比对 §4.3.5 |
| F4 | 错误码引用真实存在：INVALID_REQUEST/INVALID_BASE64/WORKSPACE_UNAVAILABLE 为 uploadFile 本地常量；UNSUPPORTED_MEDIA/FILE_TOO_LARGE/UPLOAD_FAILED 来自 `ATTACHMENT_ERROR_CODES`（attachments.js L51-60 实读） | 实读两文件 | 交叉引用核对 |
| F5 | `input.exec.agent.session` 形状与既有 6 处使用同构（service.js L747/L773/L1422/L1444/L1665/L1798）；sessionId 提取 `session.sid ?? session.id`（L1800）与 rememberWorkspace（L1993）一致 | 实读 service.js | grep `.exec` 6 处 + L1797-1800 比对 |
| F6 | helper 全部存在：decodeBase64 = atob（L448-453）、detectImageMediaType 魔数表（L439-445）、errorMessage（L357）、mkdirSync/writeFileSync 自 node:fs import（L30）、URL_FILE_MAX_BYTES = 25*1024*1024（L65） | 实读 service.js | 逐个 grep/实读 |
| F7 | M2 registerPath（attachments.js L159-237）非图片路径：contentHashId(bytes) + workspacePath 物理载体条目（L228-236）；图片路径 saveImage（L201-225）——uploadFile 已先拒图片，不会走到 saveImage；registerPath 自身重读字节并复检 ≤25MB（L194-200）——与 uploadFile 形成纵深 | 实读 attachments.js | 逐段比对 |
| F8 | client attachPathText（client.js L3246-3248）模板 `[附件: ${kind} ${name} 路径 ${path}]` 与 §4.4.2 L393 示例 `[附件: 音频 xxx.wav 路径 .router-files/xxx.wav]` 逐字一致；attachKind 音频/视频/文档三态（L3238-3241） | 实读 client.js + 架构 | 模板比对 |
| F9 | client accept 扩展（L3337）`image/png,image/jpeg,image/webp,image/gif,audio/*,video/*,.pdf,.doc,.docx,.txt,.md,.csv,.json,.zip`；`multiple: true`（L3338）；intake 循环 `for (const file of others) uploadFile(file)`（L3325）；draft 注入 setDraft（L3299-3301）基于渲染期快照 currentDraft（L3268-3270） | 实读 client.js | → 发现 F-01（P1） |
| F10 | rpc.js uploadFile descriptor（L156-162）id `dsh-agent-router#router/uploadFile` 与 client descriptor（client.js L210 同 id）精确匹配；client wire 校验器（L181-186）与 schemas.js codec（R7 字段级）形状一致 | 实读 rpc.js + client.js | 交叉引用比对 |
| F11 | smoke 新增断言恰好 15 条：R7-F-01 ×4（L117-126）+ uploadFile ×8（L875/L880/L881/L884/L887/L890/L893/L899）+ R8-F-02 ×3（L1513/L1516/L1522）；client-render 新增 7 条（L687/L693/L694/L695/L704/L716 + L332 处 remotes 断言） | 实读两测试文件 | 逐条计数；15+7=22 与 F2 一致 |
| F12 | M2 byId（attachments.js L323）/byPath（L336）存在且被测试调用（smoke L881）——往返断言有效 | 实读 attachments.js | 方法存在性核对 |
| F13 | client-render 夹具与宿主行为同构：FakeFileReader.readAsDataURL 产出 data:URL 且 queueMicrotask 异步 onload（client-render L187-197）；remoteMock.uploadFile 成功/失败双模（L261-266）；smoke 测试用 tmpdir 真实落盘 + finally 清理（L865-911）——与既有下载测试同款模式 | 实读 client-render + smoke | 与真实浏览器 FileReader 语义比对 |
| F14 | 多文件 draft 覆盖缺陷（闭包分析）：`currentDraft` 为发起渲染的 const（L3268-3270）；N 个并发上传完成回调各自闭包同一快照；setDraft 逐次整体覆盖（L3300）→ 最后完成者胜，前 N-1 个路径文本丢失。`multiple:true`（L3338）与循环（L3325）明示多选为支持路径 | 实读 client.js + 手工推演 | → F-01（P1） |
| F15 | 消毒名碰撞覆盖缺陷：fileName 消毒（L2039）后 writeFileSync 无条件覆盖（L2042）；M2 registerPath 重读磁盘当前字节（F7）→ 先注册条目的 id（旧字节哈希）其 workspacePath 内容已被新字节替换 → id↔bytes 完整性破坏 | 实读 + 手工推演 | → F-02（P1） |
| F16 | WORKSPACE_UNAVAILABLE 时序：lastWorkspace 仅由 run()（L667-669 rememberWorkspace）设置；首条消息发送前无 run() → 全新会话首附件必然失败（L2028-2030）；Developer 注释"该会话必然已至少运行过一次"（L1986-1989）对首条消息前附件不成立 | 实读 + 流程推演 | → F-03（P2） |
| F17 | 失败态断言非判别：client-render L697-704 失败用例渲染全新组件实例（imageToolReg.render 二次调用）——新实例 cards 初始为空，"without card"恒真；判别力仅在错误文本 FILE_TOO_LARGE | 实读 client-render | → F-05（P2） |
| F18 | 待验证项：① 宿主 fs.resolve 返回的 displayPath 形态（绝对路径 vs §4.4.2 示例相对 `.router-files/xxx.wav`）——上传返回 path 取 entry.workspacePath（L2056），draft 文本可能为绝对路径；② 宿主会话 slot 是否恒提供 useInput（client 已守卫，缺失仅跳过注入——fail-safe 成立） | 实读 + 宿主依赖 | 标"未验证"（见 §8） |

## 2. 审查重点逐项结论

| 重点 | 结论 | 依据 |
| --- | --- | --- |
| uploadFile 安全性（base64/25MB/消毒/目录限定） | ✅ 合格（2 项 P1/P2 边界见 F-02/F-04） | base64 解码拒绝（L2016-2021，atob 抛错捕获）；25MB（L2025-2027）；消毒字符集 [A-Za-z0-9._-] 阻断 `/`、`\`、`:`、控制字符 → join 后无目录穿越（`..`/`.`/Windows 设备名存活但落盘 fail-closed → F-08 P3）；落盘目录恒为 `join(cwd, '.router-files')`（L2031）且 registerPath 经 fs.resolve 沙箱复检（F7） |
| draft 注入正确性（§4.4.2 格式 + RMW 竞态） | ⚠️ 格式精确（F8），RMW 有并发缺陷 | 追加格式与 §4.4.2 逐字一致；渲染期快照 RMW → 多文件/输入并发丢失 → **F-01（P1）**；量级评估：窗口 = FileReader + RPC 往返（秒级），单文件低概率、多文件必现（F14） |
| 客户端类型分流（type 缺失/未知 + FileReader 错误路径） | ✅ 合格 | type 缺失 → 非图片 → uploadFile → 服务端魔数兜底（图片→UNSUPPORTED_MEDIA 拒绝，F-10 P3）；FileReader onload/onerror 双路径（L3284/L3304）；空文件 dataBase64='' → INVALID_REQUEST（F-13 P3） |
| 卡片渲染（失败错误码可见 / 成功路径可复制） | ✅ 合格 | 失败 `${code}: ${message}` 渲染（L3289-3292，错误码可见）；成功卡片 `[类型] name → path` + title 全路径（L3328-3332，可复制）；错误/卡片同排渲染不互斥 |
| R7-F-01/R8-F-02 断言质量 | ✅ 合格（判别力真实） | 错误形状 ok:false+code 填值 + 可选字段 undefined 双向判别（L117-126）；context 追加 index=-1 透传 + 前 N 项改写 + 尾部 reminder（L1513，三态齐判）；reject 原样透传（L1516）；fail-safe 经真实异常注入（provider getter 抛错，L1520-1522） |
| rememberWorkspace 时序 | ✅ 结构正确（1 项注释瑕疵） | 构造字段 lastWorkspace=null 初始化（L484 区域）；run() 顶部记录（L667-669，resolveAgent 之前——执行失败也记录，语义"每次执行"一致）；多会话 last-write-wins 为披露设计（裁量 1）；sessionId/at 未消费 → F-06 P3；"必然已至少运行过一次"断言过强 → F-03 P2 |
| 测试夹具质量 | ✅ 合格 | FakeFileReader 与浏览器同构（data:URL + 异步 onload，F13）；remoteMock 双模；smoke 用 tmpdir 真实 fs 落盘 + finally 清理（F13）；`service.run` 锚定工作区沿用既有 smoke run 模式（L874 vs 既有 L806-830 同型，hermetic） |

## 3. 设计一致性表（§8 Step 8 行 + §4.3.5 + §4.4.2 + V-DSH-2 + R7/R8 闭环 + 四处裁量）

| 契约项 | 契约要求 | 实现 | 一致性 |
| --- | --- | --- | --- |
| §8 Step 8（L779） | AttachButton accept 扩展 + `router/uploadFile` 实现 + 附件卡片 + 结构化路径文本进 draft；测试=client-render accept 扩展/uploadFile 调用/卡片渲染断言；回滚=按钮 accept 回退 image-only | accept 扩展（L3337）；uploadFile service 实现（L2011-2060）；卡片（L3328-3332）；draft 注入（L3299-3301）；client-render 7 断言（F11）；回滚=accept 单行回退、service 为增量可独立回滚 | ✅ |
| §4.3.5（L336-339） | request {name, mediaType, dataBase64}；response {ok, path?, attachmentId?, name?, message?, code?}；校验序列 base64→魔数(UNSUPPORTED_MEDIA)→≤25MB(FILE_TOO_LARGE)→写 .router-files/<sanitized-name>(UPLOAD_FAILED)→M2.registerPath→返回 | 字段逐项一致（F3）；校验序列顺序与错误码一一对应；sanitized-name 消毒（L2039）；registerPath 调用（L2050） | ✅ |
| §4.4.2 L393 | draft 注入格式 `[附件: 音频 xxx.wav 路径 .router-files/xxx.wav]`；inputActions 文本注入 | attachPathText 逐字匹配（F8）；经 inputActions.setDraft 注入（L3300） | ✅ |
| V-DSH-2 | InputActions = setDraft/addImages/removeImage/pruneImages/submit；无任意文件注入 API；setDraft 为单一公共 draft 写通道——§5.5 fallback 不需要 | 客户端只用 setDraft（L3300）+ addImages（L3320）；未调用任何不存在的 API；未实现 §5.5 fallback（设计判明不需要） | ✅ |
| R7-F-01 闭环 | uploadFileResult/readWorkspaceFileResult 错误形状（ok:false+code）与类型拒绝断言补齐 | smoke L117-126 共 4 条（F11） | ✅ |
| R8-F-02 闭环 | 宿主 context 追加 decision 映射（index=-1 透传）+ reject 透传 + fail-safe 断言补齐 | smoke L1513/L1516/L1522 共 3 条（F11） | ✅ |

**四处设计推导裁量**：

| # | Developer 记录 | 裁量结论 |
| --- | --- | --- |
| 1 | 工作区解析：浏览器 RPC direct invocation 不携带会话上下文（宿主网关 assertExactArguments 实读——extra args 拒绝），uploadFile 落盘目标取最近一次 run() 记录的会话 cwd（rememberWorkspace）；无记录 WORKSPACE_UNAVAILABLE 明确报错 | ✅ **采纳，附 1 项修正**：结构成立（F5 同形 + F3 校验序列 + fail-closed 明确报错）；跨会话 last-write-wins 为披露取舍（上传与使用分属不同工作区时路径文本会在使用端 PATH_OUTSIDE_WORKSPACE——设计内限制，可接受）。修正：Developer 声称"该会话必然已至少运行过一次"对**首条消息发送前附件**不成立（全新会话/新进程首会话 → WORKSPACE_UNAVAILABLE）→ F-03（P2），建议更正注释或预置工作区 |
| 2 | 图片双通道规避：客户端按 file.type 分流（图片恒走原生 addImages）+ service 侧图片魔数拒绝（UNSUPPORTED_MEDIA）纵深守卫 | ✅ **采纳**：双层独立（client L3233-3235 前缀判定 + service L2022-2024 魔数判定），任一层失效另一层兜底；type 缺失图片走 uploadFile 被魔数拒绝 → F-10（P3）UX 边界 |
| 3 | 媒体白名单未启用：audio/video 魔数判定留待 V-DSH-4（UNSUPPORTED_MEDIA 仅用于图片拒绝）——与 5a 契约一致 | ✅ **采纳**：与 attachments.js L226-227 注释及 §13 V-DSH-4（L860）一致；任意非图片二进制可落盘为设计内取舍 → F-09（P3）记录 |
| 4 | accept 清单推导：image+audio/*+video/*+.pdf/.doc/.docx/.txt/.md/.csv/.json/.zip——架构未定义精确清单，最小充分推导 | ✅ **采纳**：accept 为提示性（非强制），type 过滤 + 服务端魔数/大小校验为实际边界；清单覆盖架构 F11 音频/视频/文档三类，最小充分 |

## 4. 五维度结论

| 维度 | 结论 | 说明 |
| --- | --- | --- |
| ① 正确性 | ⚠️ 通过（含 2 项 P1） | 主流程正确：单文件上传、图片/非图片分流、错误码序列、M2 往返（F3/F7/F12）；§4.4.2 格式精确（F8）。支持流程缺陷：多文件非图片选选 draft 丢失（F-01，F14 闭包推演）、消毒名碰撞覆盖附件字节（F-02，F15 推演） |
| ② 安全性 | ✅ 通过 | 目录穿越防护成立（字符集消毒 + join + fs.resolve 沙箱双层，F3/F7）；图片魔数拒绝；非法 base64 拒绝；无注入面/硬编码密钥；全部失败路径 fail-closed 明确错误码；F-04（解码前大小预检）为纵深加固建议（P2）；F-08（设备名/纯点名）落盘 fail-closed（P3） |
| ③ 可维护性 | ✅ 通过 | 注释含设计引用（§4.3.5/§4.4.2/§5.1）且事实出处标注；命名自解释（rememberWorkspace/attachPathText/attachKind）；函数短小；模块头契约完整。注释准确性瑕疵：F-03 断言过强（P2）；sessionId/at 死数据（F-06 P3） |
| ④ 性能 | ✅ 通过 | 单次 ≤25MB 同步写与既有 downloadInputFile 同风格（L802 同款 writeFileSync）；无循环热点；M2 重读为一次磁盘读（可接受）；F-04 建议解码前长度粗筛避免超大 payload 全额解码（P2） |
| ⑤ 测试覆盖 | ✅ 通过（含 1 项 P2 建议） | 22 新断言（F2/F11）判别力合格：错误形状/类型拒绝（R7-F-01）、魔数/大小/base64/工作区/消毒/M2 往返（uploadFile ×8）、accept/卡片/RPC 载荷/setDraft 格式/图片分流（client-render）、context 透传/reject/fail-safe（R8-F-02）；既有断言零回退（F2）。缺口：多文件 draft 覆盖（F-01）、同名碰撞（F-02）、失败态"without card"非判别 + 无多文件用例（F-05，P2） |

## 5. 发现列表

### P0（阻塞）— 0 项
无。

### P1（关键，原则上本轮修改）
- **F-01** draft 渲染期快照 RMW 竞态：多文件非图片选选丢失除最后一项外的全部路径文本；上传窗口内输入被旧快照覆盖。
  - 位置：`lib/client.js` L3268-3270（currentDraft 渲染期快照）/ L3299-3301（setDraft 整体覆盖写）/ L3325（others 循环）/ L3338（`multiple: true`）。
  - 事实：`currentDraft` 为发起渲染时捕获的 const；N 个并发上传（`multiple:true` + 循环逐文件 uploadFile）的完成回调各自闭包**同一**快照，逐次 `setDraft(currentDraft + text_i)` 整体覆盖 → 最后完成者胜，前 N-1 个附件的路径文本不进 draft（卡片经函数式 setCards 追加仍全部显示——模型输入与 UI 不一致）。同一机制下，上传期间用户继续输入的文字会被旧快照覆盖。client-render 混选用例（L707-716）只测 1 图 + 1 视频（N=1 非图片），不触发。
  - 影响：UI 明示支持的多选路径（multiple:true）静默丢失附件路径 → 主 agent 只见最后一个文件，其余音频/文档永远无法 route_agent(filePath)；用户输入丢失。单文件流程（§4.4.2 主流程）不受影响。
  - 建议：① 在 intake 内累积所有非图片文件的文本，全部上传落定后**一次** setDraft（含全部行）；② 至少把快照升级为 ref（`draftRef.current = currentDraft` 每渲染更新），缩小输入竞态窗口；③ 补 client-render 多非图片文件断言（覆盖 N≥2）。

- **F-02** 消毒文件名碰撞 → writeFileSync 静默覆盖已注册附件 → M2 id↔bytes 完整性破坏。
  - 位置：`lib/service.js` L2039-2042（fileName 消毒 + 无条件 writeFileSync）/ L2054-2059（返回）；交互对象 `lib/attachments.js` L228-236（registerPath 非图片条目）。
  - 事实：消毒后同名（如 `a b.wav` 与 `a_b.wav` 同映射 `a_b_wav`；或同一工作区多会话上传同名文件）且内容不同时，第二次 writeFileSync 覆盖磁盘文件；registerPath 重读**当前**磁盘字节（F7）→ 第二条目 id = 新字节哈希，但第一条目（id = 旧字节哈希）的 workspacePath 仍指向同一路径 → readBytes(旧 id) 返回新字节，内容寻址承诺（sha256 ↔ bytes，D-1-4 往返一致 100%）被静默破坏；draft 中两条路径文本相同。
  - 影响：旧附件被静默替换内容，下游 speech/doc 处理读到错误字节；跨会话共享工作区时同名重传是常见场景（如 `notes.docx` 两次会话各传一版）。
  - 建议：写盘前若目标已存在 → 追加去重后缀（`-<timestamp36>`/`-<n>`）或改用内容哈希命名 + 原名校验；或 O_EXCL 写 + 冲突重试。防静默覆盖。

### P2（建议，可遗留，不阻塞）
- **F-03** 全新会话首条消息即附件 → WORKSPACE_UNAVAILABLE；Developer 注释断言过强。
  - 位置：`lib/service.js` L1986-1989（注释"该会话必然已至少运行过一次"）/ L2028-2030（WORKSPACE_UNAVAILABLE 返回）。
  - 事实：lastWorkspace 仅由 run() 设置（L667-669）；首条消息发送前无 run() → 新进程首会话的首次附件上传必然 WORKSPACE_UNAVAILABLE；跨会话切换时文件落在最近执行会话的工作区（披露的 last-write-wins）。fail-closed 明确报错成立（可用性黑洞已消除），但注释所述不变量不成立。
  - 建议：更正注释描述（区分"新会话首附件"场景）；如宿主有可用会话工作区来源（如会话创建事件/其他公开面）可预置 lastWorkspace，否则文档化该限制。

- **F-04** 解码前无大小预检：超大 base64 payload 先全额解码再拒。
  - 位置：`lib/service.js` L2016-2026（解码 → 魔数 → 大小，大小检查在解码后）。
  - 事实：wire codec 无大小上限（R7 F-03 记录），恶意/缺陷 RPC 载荷可携带远超 25MB 的 base64 字符串，atob 全额分配（约 3/4 × 字符串长度）后才 FILE_TOO_LARGE。当前客户端恒传真实文件大小，非现路径问题，属纵深加固。
  - 建议：解码前粗筛 `dataBase64.length > Math.ceil(URL_FILE_MAX_BYTES * 4 / 3) + 16` → 直接 FILE_TOO_LARGE。

- **F-05** 测试判别力缺口：失败态"without card"断言非判别；无 F-01/F-02 覆盖。
  - 位置：`tests/client-render.mjs` L697-704（失败用例渲染全新组件实例，`imageToolReg.render` 二次调用——新实例 cards 初始为空，"failCards.length === 0"恒真，判别力仅在 `textOf(...).includes('FILE_TOO_LARGE')`）；smoke uploadFile 块（L859-912）无同名碰撞用例；client-render F11 块（L655-720）无多非图片文件用例。
  - 事实：F-01/F-02 两个 P1 缺陷在现有 22 条断言下不触发（F14/F15 推演验证）。
  - 建议：① 失败态用例复用同一组件实例（先成功加卡片、再失败）以判别"失败不追加卡片"；② 补 2 条：同名不同内容两次上传 → 断言第二条返回去重名/或第一条 id 读取仍为原字节；多非图片文件 → 断言 draft 含全部路径行。

### P3（讨论/记录）
- **F-06** `lastWorkspace.sessionId` / `at` 字段记录但 uploadFile 未消费（at 可作 TTL/陈旧提示；sessionId 在无会话上下文 RPC 下无选择价值）。`lib/service.js` L1993-1994。
- **F-07** 响应 `name` 为消毒后文件名——中文/空格等原文件名被下划线替换进入卡片与 draft 文本（仅展示影响，路径文本仍正确）。`lib/service.js` L2039/L2058。
- **F-08** 消毒后纯点名（`.`/`..`）与 Windows 保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）存活 → 落盘失败（EISDIR/设备名拒绝）→ UPLOAD_FAILED fail-closed，仅可用性边界，无逃逸面。`lib/service.js` L2039-2042。
- **F-09** 非图片二进制无媒体白名单（V-DSH-4 待验证；§4.3.5 契约允许，与 5a 契约 L226-227 及裁量 3 一致）——任意非图片字节（含可执行文件）可落盘 .router-files/，记录不改；V-DSH-4 落地时补 audio/video 魔数。`lib/service.js` L2022-2024。
- **F-10** `file.type` 缺失的图片文件（浏览器通常填充 type，但存在空 type 场景）→ 客户端前缀判定为假 → 走 uploadFile → 服务端魔数拒绝并提示"图片附件请走原生图片通道"——用户本就经同一按钮选取，提示语境略错位。UX 边界，可接受。`lib/client.js` L3233-3235/L3311 + `lib/service.js` L2022-2023。
- **F-11** 同名路径重复上传（同一文件二次选择）→ 卡片 key 重复（React key 冲突警告）。`lib/client.js` L3330。
- **F-12** `remote.uploadFile` 无超时——RPC 挂起时无错误态（静默等待）；imageData 有重试 UI 而上传无。`lib/client.js` L3286-3302。
- **F-13** 0 字节文件 → dataBase64 '' → INVALID_REQUEST"缺少文件名称或数据"（消息对空文件场景略有误导，fail-closed 可接受）。`lib/service.js` L2015。

## 6. AI 生成代码专项 5 项检查

| # | 检查项 | 结果 | 依据 |
| --- | --- | --- | --- |
| 1 | mock 残留 | ✅ 无 | 生产代码无 mock/stub；FakeFileReader/remoteMock/uploadFailMode 均为测试夹具（client-render L187-197/L261-266），测试内定义不泄漏 |
| 2 | 硬编码返回值 | ✅ 无 | uploadFile 返回由真实解码/写盘/registerPath 推导（F3/F7）；响应 path/attachmentId/name 均来自实际执行 |
| 3 | 幻觉 API 调用 | ✅ 无 | decodeBase64/detectImageMediaType/errorMessage/mkdirSync/writeFileSync/URL_FILE_MAX_BYTES/ATTACHMENT_ERROR_CODES/isAttachmentId/byId/byPath 全部实读存在（F4/F6/F7/F12）；`exec.agent.session` 与 6 处既有使用同形（F5）；inputActions.setDraft/addImages 与 V-DSH-2 一致；useInput 有守卫（F18 待验证项） |
| 4 | 未实现 TODO | ✅ 无 | 无 TODO/FIXME；V-DSH-4/Step 9 引用为设计次序陈述（§13 待验证清单），非占位 |
| 5 | 过度实现 | ✅ 无 | scope 与 §8 Step 8 行一致：未提前实现 readWorkspaceFile（Step 9）；未改 accept 之外的回滚面；rememberWorkspace 最小（sessionId/at 轻微超捕 → F-06 P3，非行为性） |

## 7. 硬门槛裁决

| 门槛项 | 阈值 | 结果 |
| --- | --- | --- |
| P0 阻塞问题数 = 0 | = 0 | ✅ 0 |
| 5 维度全覆盖 = 100% | 逐一有结论 | ✅ 5/5（§4） |
| 每条发现标注级别 = 100% | P0~P3 | ✅ 13 条全部标注（F-01/F-02 P1，F-03~F-05 P2，F-06~F-13 P3） |
| 设计一致性检查完成 | §8 Step 8 + §4.3.5 + §4.4.2 + V-DSH-2 + R7-F-01/R8-F-02 闭环 + 四处裁量 | ✅（§3） |
| AI 专项 5 项完成 | 5/5 | ✅（§6） |
| 事实红线 | 未验证项显式标注 | ✅ 测试运行事实（F2）标注 Coordinator 提供未复跑；宿主依赖两项（fs.resolve displayPath 形态、useInput 槽位恒定性）标"未验证"（F18）；其余全部实读/推演验证 |

## 8. 终态

**APPROVED_WITH_NOTES** — `unresolved_blockers=0`

- P0 = 0，P1 = 2（F-01/F-02），P2 = 3（F-03/F-04/F-05），P3 = 8（记录项）。
- 依据：§4.3.5 校验序列（base64 → 图片魔数 → ≤25MB → 消毒落盘 → M2 注册）逐项落地且顺序、错误码与契约一一对应（F3/F4）；§4.4.2 draft 注入格式逐字一致（F8）；V-DSH-2 约束遵守（仅 setDraft/addImages，F11 §3 表）；R7-F-01（result 错误形状 + 类型拒绝 ×4）与 R8-F-02（context 追加透传 + reject 透传 + fail-safe ×3）断言闭环；`exec.agent.session` 与 6 处既有使用同形（F5）；M2 registerPath 语义与既有实现一致（F7）；22 新断言判别力合格且既有断言零回退（F2/F11）；AI 专项 5 项全过；四处设计推导裁量（工作区解析/图片双通道/媒体白名单/accept 清单）全部采纳，其中裁量 1 附 1 项修正（F-03）。
- 备注（Notes）：
  1. **F-01 / F-02（P1）建议本轮修改**（均为数行级改动：draft 文本积累后一次 setDraft；写盘前同名去重）。若申请遗留，须记录遗留计划与关闭条件（F-01：单文件为 §4.4.2 主流程，多文件为 UI 支持路径；F-02：内容寻址完整性，建议不遗留）。
  2. F-03（工作区注释断言过强 / 新会话首附件场景）建议同批更正注释或文档化；F-04（解码前大小预检）与 F-05（补 2 条判别断言）可遗留至下一轮。
  3. F-07/F-10/F-11/F-12（展示名、type 缺失 UX、卡片 key、上传超时）为 Step 8 后优化候选，不阻塞。
  4. 测试运行事实（F2）未由本 Reviewer 亲自复跑——依协议以 Coordinator 提供的事实为准；如需要，Coordinator 可复核。
