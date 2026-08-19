# Code Review 报告 — MIG-001 Step 5a 附件编址层核心（N-1 部分）

- **轮次**: R5（Step 5a 单元**首审**；MIG-001 审查链第 5 轮——R1-R4 覆盖 Step 0-4 全部通过，本轮审查对象为 Step 5a 变更集，与 R1-R4 无复审关系）
- **审查对象**: 工作区未提交变更集（3 文件：lib/attachments.js 新增 + tests/attachments.mjs 新增 + tests/smoke.mjs 修改）
- **审查人**: Code Reviewer Agent（独立实例）
- **日期**: 2026-08-18
- **结论**: **APPROVED_WITH_NOTES**

## 独立结构字段

```
unresolved_blockers=0
```

（本审查零未解决 BLOCKING finding；P0=0 / P1=0 / P2=2 / P3=6，全部为非阻塞建议/讨论项，可遗留。）

## 审查独立性披露

本实例为独立 Code Reviewer：未参与 Step 5a 编写、无共享对话上下文，依据仅为变更集文件全文、架构契约、既有代码对照与 Coordinator 提供的测试证据。与 R4 同口径：**未独立复跑测试**（角色定义 Bash ❌），运行通过事实以 Coordinator 报告为准，全部新增断言已逐条静态核验非空洞。

## 事实依据（审查输入）

| 事实 | 来源 |
|---|---|
| 变更集范围 | 任务上下文（git status 事实）：?? lib/attachments.js、?? tests/attachments.mjs、M tests/smoke.mjs——恰 3 文件；**Reviewer 无 Bash 权限未独立运行 git status**，以任务方报告为准 |
| 待审代码全文 | `read lib/attachments.js`（实际 457 行，任务简报称 432）；`read tests/attachments.mjs`（实际 243 行，任务简报称 228）；smoke.mjs 三处接入（import L8、语法清单 L32、调用 L862）与任务方 diff 一致 |
| 设计契约 | docs/architecture-v3.md 实读：§4.3.1（L225-279 接口+错误码表）、§5.1（L420-468 三向映射/懒注册/会话作用域缓存）、§8 迁移表 Step 5a 行（L774）与回滚列、依赖注记（L788） |
| 实现对照 | lib/service.js 实读：detectImageMediaType（L417-423）、errorMessage（L335-339）、resolveInputFiles（L709-734）、downloadInputFile（L737-781）、prepareChatFiles saveImage 调用（L814-825）、URL_FILE_MAX_BYTES（L43）、URL_FETCH_TIMEOUT_MS（L46） |
| 测试基建对照 | tests/smoke.mjs 既有 root.provide('attachments'/'fs') mock 模式（L184-190）与 check() 计数语义（L20-24） |
| 测试运行结果 | **任务方报告** node tests/smoke.mjs → exit 0，输出 `ALL SMOKE TESTS PASSED`，`attachment registry (M2):` 断言组 **36 项**全部 ok（实测文件内 check() 计数 = 36，与任务方一致；任务简报"34 项"为计数误差），既有断言组零回退。⚠️ Reviewer 未独立复跑，建议 Coordinator 将测试输出附入 evidence-log |

## 设计一致性检查（逐条比对）

| 契约条目 | 实现 | 判定 |
|---|---|---|
| §4.3.1 接口：registerPath / materialize / resolve / read / byId / byPath / close | attachments.js:159/336/391/424/294/324/452 全部实现，签名与契约一致（含 opts 形状） | ✅ 一致 |
| §4.3.1 AttachmentEntry 字段：id/mediaType/bytes/width?/height?/name?/workspacePath?/source | 各 registerEntry 调用点（L215-224 图片、L229-236 非图片、L312-320 懒注册）字段形状与契约一致；source 取值 'files'/'url'/'image-block'（'input'/'generated' 待 Step 8/5b 引入） | ✅ 一致 |
| §4.3.1 错误码表 8 码 | ATTACHMENT_ERROR_CODES（L51-60）逐码定义；UNSUPPORTED_MEDIA 定义但 5a 不启用（L227 注释明示"待 V-DSH-4 验证"），符合契约"待验证"标注 | ✅ 一致 |
| §4.3.1 id 校验规则：INVALID_ATTACHMENT_ID / PATH_OUTSIDE_WORKSPACE / FILE_NOT_FOUND / FILE_TOO_LARGE / STORE_UNAVAILABLE / UPLOAD_FAILED 触发条件 | materialize L338 / resolve L407 / registerPath L162-196 / L189-199 / L164-204 / L248-275 逐条对应 | ✅ 一致 |
| §5.1 关键点 1：物化缓存按会话作用域键 `sessionId\0id`；跨会话不共享缓存条目 | materialize L340（`${sessionId ?? ''}\0${id}`）、L378-382（写缓存+LRU 200）；测试 matA/matB/matAnon 三键隔离断言 | ✅ 一致（含匿名键空串语义） |
| §5.1 关键点 2：懒注册降级（byId/resolve 对未注册合法宿主 id → readImage 降级注册；失败才 ATTACHMENT_UNKNOWN） | byId L294-321（readImage → registerEntry source:'image-block'）；resolve L395-398 复用 byId；materialize L347-348 复用 byId | ✅ 一致 |
| §5.1 关键点 3：注册图片走 attachments.saveImage（内容寻址去重）；audio/video/doc 走"字节哈希 id + workspacePath 物理载体" | registerPath L201-224（图片 saveImage）/ L226-236（非图片 contentHashId + workspacePath） | ✅ 一致 |
| §5.1 关键点 4：解析失败明确报错不静默 | resolve L393-417 全分支显式 throw；byId 对懒注册失败返回 undefined 由调用方（resolve/materialize）映射 ATTACHMENT_UNKNOWN（契约明示此语义） | ✅ 一致 |
| §5.1 关键点 5：条目 LRU 上限 200 + 物化缓存独立 LRU | registerEntry L132-138（200，Map 插入序）、materialize L380-382（200） | ✅ 一致 |
| 与 service.js 同构：detectImageMediaType / URL 上限 / 超时 / 下载落盘流程 | 逐行比对 L85-91 vs service.js L417-423 完全一致；L42-45 常量对齐 L43/L46；downloadToWorkspace L241-285 与 downloadInputFile L737-781 流程同构（含 abort 清理、文件名消毒 `[^A-Za-z0-9._-]`、落盘后 fs.resolve） | ✅ 一致（重复实现由注释声明 Step 5b 收敛，M2 为依赖源不可反向 import） |
| §8 Step 5a 行：纯新增、无调用点迁移；测试=三向映射往返/错误码/物化缓存会话隔离；smoke 回归；回滚=删除新模块零影响 | 变更集恰 3 文件，attachments.js 零 import service.js（L28-30 仅 node 内置）；测试覆盖契约列项；smoke 仅 import/语法清单/调用三处 | ✅ 一致 |
| **范围守卫**：不得出现 5b（service.js/wrapper.js 调用点迁移）、5c（RPC wire）、6（pre-step）、7（attachmentIds） | attachments.js 无任何宿主服务调用点迁移；无 schemas.js/rpc.js/tool.js 变更（任务方 git status）；测试无 RPC/attachmentIds 内容 | ✅ 合规（git status 为任务方报告，未独立核验） |

## 五维度审查结论

### 维度 1：正确性 — PASS（附 P2×2 建议）

- **三向映射**：registerPath（路径/URL → 条目）→ registerEntry 维护 entries（id→条目）+ pathIndex（workspacePath→id）；byId/byPath/resolve 三入口互查一致。逐行核验：registerEntry L124-140 对重复 id 先删后插（刷新 LRU 序）、pathIndex 仅在条目有 workspacePath 时维护、LRU 逐出时 `pathIndex.get(oldest.workspacePath) === oldestId` 守卫防止误删新条目占用同一路径（L134）——逻辑正确。
- **懒注册降级**：byId L294-321 对未注册合法 id 经宿主 readImage 尝试读取，成功则 registerEntry（source:'image-block'）并返回；失败返回 undefined；resolve L395-398/materialize L347-348 对 undefined 抛 ATTACHMENT_UNKNOWN——与契约①②③分支完全一致。
- **物化会话隔离**：缓存键 `sessionId\0id` 三键分离（A/匿名/B），测试断言同会话命中不重读、跨会话重物化、匿名键独立——逻辑与断言吻合。
- **LRU**：注册表 200 上限逐出最旧 + peek/byId 命中刷新 recency；物化缓存独立 LRU 200。测试"刷新保护最近访问条目"（lru-5 刷新后注册新条目逐出 lru-6 而非 lru-5）静态验证正确。
- **边界条件**：空 ref（L394）、非法 id（L338/426）、无 cwd（L339）、目录注册/引用（L188/412）、大小超限双检查（stat 后 L189 + readBytes 后 L198 双保险）、URL 无 cwd（L243）——均显式处理。
- **资源管理**：downloadToWorkspace 的 AbortController/timer 在 finally clearTimeout（L257-259）；无定时器泄漏。
- **F-1（P2）**：materialize 对"未注册 id 首次物化"路径双读——L347 byId 懒注册 readImage 一次（条目无 workspacePath），L357 物化分支再次 readImage 取字节。功能正确（同一宿主附件、字节一致），但同一 id 两次宿主读取，且该路径无测试断言（测试先 byId 注册后再 materialize，绕过了双读路径）。
- **F-2（P2）**：read() 对 workspacePath 条目以 **displayPath 字符串**调用 fs.readBytes（L433），而 registerPath 内以 **FsTarget 对象**调用（L194）——内部用法不一致；service.js 亦用 FsTarget（L806）。宿主 fs.readBytes 是否接受裸字符串未在本仓库验证（宿主实现在外部包）。测试 makeFs.readBytes 兼容两种形态（`target?.displayPath ?? target`），故测试全绿不能证明宿主兼容。

### 维度 2：安全性 — PASS

- **路径穿越防护**：URL 下载文件名消毒 `[^A-Za-z0-9._-]` → '_'（L270，与 service.js L764 一致）；物化文件名取自 id 的 hex 切片 + 白名单扩展名映射（L362-370），id 经 ATTACHMENT_ID_RE 强校验 → 无注入面。
- **输入校验**：id 格式严格（`/^sha256:[0-9a-f]{64}$/i`）；路径经 fs.resolve/stat（沙箱由宿主 fs 服务承担，M2 透传 cwd/signal）；URL 仅接受 http(s)（L168）。
- **大小上限**：URL 下载后（L262）+ stat 后（L189）+ readBytes 后（L198）三层检查 ≤25MB。
- **敏感数据**：零密钥/token/凭据；contentHashId 为公开内容哈希，非安全哈希用途（去重/寻址，符合设计）。
- **OWASP 映射**：A03 注入（上述消毒+白名单）、A05 失效访问控制（沙箱由宿主 fs.resolve 承接，与 service.js 同信任边界）、A01 敏感数据（无）。无新增网络面（fetch 为既有 downloadInputFile 同构能力）。

### 维度 3：可维护性 — PASS

- 457 行单模块、头注释完整承载契约引用（§4.3.1/§5.1/Step 5a/W-2/W-3）与设计取舍（同构声明、5b 收敛计划、UNSUPPORTED_MEDIA 未启用原因）。
- 命名清晰（registerPath/byId/byPath/materialize/resolve/read/close 与契约一一对应）；常量导出（L33-48）便于测试与后续 5b 复用。
- 函数长度：registerPath（L159-237）约 80 行含 URL/图片/非图片三分支，注释分段清晰，可接受。
- 重复代码：detectImageMediaType/errorMessage/downloadToWorkspace 与 service.js 重复——**已知设计权衡**（M2 为依赖源不可反向 import，Step 5b 收敛），头注释明示，非隐藏坏味道。
- 注释质量：关键不变量（LRU 序、会话作用域键、懒注册边界）均有行内注释，与实现一致。

### 维度 4：性能 — PASS

- Map 读写 O(1)；LRU 逐出均摊 O(1)；byPath 经 pathIndex O(1) 反向索引。
- 物化缓存避免同会话重复落盘（测试断言 readImage 计数不增）。
- 无 N+1 / O(n²)（detectImageMediaType 线性扫描 ≤12 字节）。
- 懒加载：物化（大对象写盘）延迟到首次 materialize 触发；注册阶段仅读字节哈希。
- F-1 双读为唯一冗余 I/O（见正确性维度，P2）。

### 维度 5：测试覆盖 — PASS（附 P3 缺口）

实测 check() 计数 = **36 项**（与任务方"36 项全部 ok"一致；任务简报"34 项"为计数误差，见 F-6）：
- **核心路径**：三向映射往返（非图片 L101-107 + 图片 L112-114）、read 双通道（image→readImage L118、workspace file→fs.readBytes L120）、懒注册成功/缓存（L133-137）、URL 下载注册（L193）、LRU 逐出/刷新（L229-236）、物化写盘路径形状（L166）。
- **边界**：id 格式正/反（L94-95）、contentHashId 确定性（L96）、LRU 上限+recency（L229-236）、物化三会话键隔离（L169-173）、匿名键（L173）、非图片直返 workspacePath（L175）、URL 超限/无 cwd（L196-199）。
- **错误路径**：ATTACHMENT_UNKNOWN（L141/144/158）、FILE_NOT_FOUND（L149/199）、PATH_OUTSIDE_WORKSPACE（L152/161）、INVALID_ATTACHMENT_ID（L155）、FILE_TOO_LARGE（L196）——5 错误码有断言（验收标准 5 全满足）。
- **负向**：read 未知附件（L122-123）、resolve 未知 id（L143）、close 清空（L240）。
- **缺口（F-4，P3）**：STORE_UNAVAILABLE（fs/attachments 缺失）、UPLOAD_FAILED（落盘/mkdir 失败）、懒注册 readImage 抛错（L307 catch）、物化 readImage 失败（L358-361）无直接断言。
- 覆盖率：本仓库无覆盖率工具，以 smoke 全绿为门（项目既有口径）。

## AI 代码专项 5 项检查

| # | 检查项 | 结论 | 事实 |
|---|---|---|---|
| 1 | mock 残留 | **PASS** | 产品代码（attachments.js）零 mock/测试开关/环境分支；测试的 makeAttachments/makeFs 为测试夹具（与 smoke.mjs L184-190 既有 root.provide 模式同构），非产品代码残留 |
| 2 | 硬编码返回值 | **PASS** | 200/25MB/60s/魔数表均为契约值（§5.1"如 200 条"、§4.3.1"≤25MB"、service.js 对齐）且导出常量；contentHashId 真实 sha256 计算；无伪装计算/假数据 |
| 3 | 幻觉 API 调用 | **PASS** | 全部外部调用（attachments.readImage/saveImage、fs.resolve/stat/readBytes、globalThis.fetch、node:crypto/fs/path）与 service.js 既有调用同构可复查；测试夹具按同签名实现并全部走通 |
| 4 | 未实现 TODO | **PASS** | 零 TODO/FIXME/XXX（grep 无匹配）；"待 V-DSH-4 验证"为契约既定待验证项（UNSUPPORTED_MEDIA/audio-video 魔数），注释明示 5a 不启用，非未实现桩 |
| 5 | 过度实现 | **PASS** | 恰实现 §4.3.1 全接口无多余；无 Step 5b 调用点迁移/5c RPC wire/6 pre-step/7 attachmentIds 任何提前实现；close() 为契约接口必需 |

## 发现列表（每条含级别/位置/事实/建议）

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| F-1 | **P2 建议** | lib/attachments.js:347,357 | materialize 对"未注册 id 首次物化"路径双读宿主：L347 byId 懒注册 readImage 一次，L357 物化分支对无 workspacePath 条目再次 readImage 取字节。功能正确（同附件同字节），但同一 id 两次宿主读取；测试先 byId 再 materialize（L165），未覆盖该双读路径 | materialize 内联懒注册逻辑复用 byId 已读出的 stored.data（一次读取）；或补一条"未注册 id 直接 materialize"断言固化当前行为。可遗留 |
| F-2 | **P2 建议** | lib/attachments.js:433 vs 194 | read() 对 workspacePath 条目传 displayPath **字符串**给 fs.readBytes，而 registerPath（L194）与 service.js:806 传 **FsTarget 对象**——内部用法不一致；宿主 fs.readBytes 签名兼容性未验证（宿主实现不在本仓库，测试夹具兼容两种形态故全绿） | 与 service.js 保持一致：read() 先经 fs.resolve 拿 FsTarget 再 readBytes，或经宿主契约确认 readBytes 接受裸路径。可遗留 |
| F-3 | **P3 讨论** | lib/attachments.js:340 | 物化缓存键 `${sessionId ?? ''}\0${id}` 不含 cwd——同一 sessionId 在不同 cwd 下物化同一 id 会命中旧缓存返回旧 cwd 路径。实现与契约一致（契约即定义此键），会话内 cwd 通常恒定（service.js:712 取 session.header.cwd），风险低 | 记录契约级前提（会话内 cwd 不变）；如需防御可在键中并入 cwd。知识分享项 |
| F-4 | **P3 讨论** | tests/attachments.mjs（全文件） | 错误路径缺口：STORE_UNAVAILABLE（fs/attachments 缺失）、UPLOAD_FAILED（mkdir/writeFileSync 失败）、懒注册 readImage 抛错（attachments.js:307）、物化 readImage 失败（:358-361）无断言——均为防御性代码 | 后续补测或接受静态核验 |
| F-5 | **P3 讨论** | lib/attachments.js:94-96,179 | 两处跨模块契约未在本仓库验证：①非图片 contentHashId（`sha256:`+hex）与宿主 dsh-attachment 的 id 格式一致性（"与宿主附件一致"为注释声明）；②fs.resolve 返回的 displayPath 相对/绝对语义（materialize 对非图片直接返回 workspacePath 供 CLI 读取，若为相对路径依赖 CLI cwd） | 宿主侧验证后补注或适配；当前与 service.js displayPath 既有用法同暴露面，非本变更新引入 |
| F-6 | **P3 讨论** | 任务简报 vs 实测 | 简报称 attachments.js 432 行/attachments.mjs 228 行/34 项断言；实测 457/243 行、36 项断言（36 与任务方验证事实一致）。代码无缺陷，属简报计数精度 | evidence-log 记录时按实际计数（457/243/36） |
| F-7 | **P3 讨论** | lib/attachments.js:56 | UNSUPPORTED_MEDIA 错误码定义但 5a 全路径不抛出（非图片一律 octet-stream 注册，L231）——符合契约"待 V-DSH-4 验证"标注与 Step 5a 范围，但码处于"已定义未使用"状态 | 5b/后续步骤启用时补触发路径与测试；Coordinator 知悉即可 |
| F-8 | **P3 讨论** | lib/attachments.js:85-91,74-79,241-285 | detectImageMediaType/errorMessage/downloadToWorkspace 与 service.js 重复实现（同构声明于头注释，Step 5b 收敛计划）——双份代码存在漂移风险（魔数表/上限/消毒规则） | Step 5b 迁移时收敛为单一依赖源；当前为既定设计权衡 |

## 验收标准核验（执行包 done_definition）

| # | 验收项 | 判定 | 依据 |
|---|---|---|---|
| 1 | 三向映射往返一致（byId/byPath/resolve 覆盖 id/path/url 三种 kind） | ✅ | L101-107（非图片三向）+ L112-114（图片 saveImage 去重）+ L193-201（URL 下载注册 + resolve kind url） |
| 2 | 懒注册降级：未注册但宿主可读 → 降级注册成功；宿主读不到 → ATTACHMENT_UNKNOWN | ✅ | L133-137（byId/resolve 懒注册成功，readImage 计数 +1）+ L141-144（失败 → undefined/ATTACHMENT_UNKNOWN） |
| 3 | 物化缓存会话隔离：同会话命中不重读；跨会话重物化；无 sessionId 用匿名键 | ✅ | L169（同会话 readImage 不增）+ L171（跨会话 +1）+ L173（匿名键 +2 累计） |
| 4 | LRU 200 上限 + recency refresh 保护最近访问 | ✅ | L229-230（逐出最旧 + size 恒 200）+ L236（lru-5 刷新后逐出 lru-6 而非 lru-5） |
| 5 | 错误码行为：ATTACHMENT_UNKNOWN/FILE_NOT_FOUND/PATH_OUTSIDE_WORKSPACE/FILE_TOO_LARGE/INVALID_ATTACHMENT_ID 有断言 | ✅ | L149/152/155/158/161/196/199——5 码全部有断言（UNSUPPORTED_MEDIA 契约标注待验证，5a 不启用） |
| 6 | URL 注册：下载到工作区并注册；超限 FILE_TOO_LARGE；无 cwd FILE_NOT_FOUND | ✅ | L193（下载+注册+字节数）+ L196（26MB 超限）+ L199（无 cwd） |
| 7 | 纯新增基座：现有行为零变化，既有断言零回退 | ✅ | smoke.mjs 仅三处接入（L8/32/862），既有断言文件零改动；任务方报告既有断言组零回退 |

## 硬门槛裁决

| 门槛项 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | = 100% | 5/5 逐项有结论 | ✅ |
| 每条发现标注级别 | = 100% | 8/8（P2×2 + P3×6） | ✅ |
| 设计一致性检查 | 已完成 | §4.3.1/§5.1/§8 Step 5a 行/范围守卫——15 项逐条比对表 | ✅ |
| AI 专项 5 项 | 全部完成 | 5/5 PASS（各有事实列） | ✅ |
| 范围合规 | 恰 3 文件（.governance/** 豁免） | 任务方 git status：?? lib/attachments.js、?? tests/attachments.mjs、M tests/smoke.mjs | ✅（git status 为任务方报告，Reviewer 无 Bash 未独立核验） |

## 终态

**APPROVED_WITH_NOTES** — 零未解决 BLOCKING finding（unresolved_blockers=0）；P2×2（F-1 物化双读、F-2 read 传字符串 vs FsTarget）与 P3×6 均为非阻塞建议/讨论项，可遗留（建议 F-1/F-2 记录遗留计划并在 Step 5b 迁移时一并处理）。关闭条件核验：P0=0 且 P1=0 → 通过。附条件：Coordinator 将测试运行输出（`node tests/smoke.mjs` → exit 0 / ALL SMOKE TESTS PASSED）附入 evidence-log，以满足"测试全绿"验收项的可复查事实红线。
