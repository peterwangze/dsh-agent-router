# Code Review 报告 — MIG-001 Step 5b 内部寻址迁移（三调用点经 M2）+ R5 遗留 F-1/F-2 修复

- **轮次**: R6（Step 5b 单元**首审**；MIG-001 审查链第 6 轮——R1-R5 覆盖 Step 0-5a 全部通过，本轮审查对象为 Step 5b 变更集，与 R1-R5 无复审关系；R5 报告 F-1/F-2（P2 建议）为本轮修复对象，闭环验证见下）
- **审查对象**: 工作区未提交变更集（3 文件：lib/service.js M + lib/attachments.js M + tests/attachments.mjs M；git status 事实 +247/-42）
- **审查人**: Code Reviewer Agent（独立实例）
- **日期**: 2026-08-18
- **结论**: **APPROVED_WITH_NOTES**

## 独立结构字段

```
unresolved_blockers=0
```

（本审查零未解决 BLOCKING finding；P0=0 / P1=1 / P2=3 / P3=5。P1 为设计一致性契约缺口，附明确遗留计划（R6-L1/L2/L3），按关闭规则"P0=0 且 P1>0（有遗留计划）→ 有条件通过"裁决。）

## 审查独立性披露

本实例为独立 Code Reviewer：未参与 Step 5b 编写、无共享对话上下文，依据仅为变更集文件全文、架构契约、宿主依赖包实证、既有代码对照与 Coordinator 提供的测试证据。同 R5 口径：**未独立复跑测试**（角色定义 Bash ❌），运行通过事实以 Coordinator 报告为准；全部新增断言已逐条静态核验非空洞（含两处判别力缺口，见 R6-F-2/F-3）。

## 事实依据（审查输入）

| 事实 | 来源 |
|---|---|
| 变更集范围 | 任务上下文 git status 事实：M lib/service.js、M lib/attachments.js、M tests/attachments.mjs——恰 3 文件，tests/smoke.mjs 零改动；Reviewer 无 Bash 未独立运行 git status（工作区快照一致） |
| 待审代码全文 | `read lib/attachments.js`（488 行）、`read lib/service.js` 相关段（import/构造/prepareChatFiles/materializeCliImages/runCli/selectAttachments）、`read tests/attachments.mjs`（364 行，49 项 check） |
| 设计契约 | docs/architecture-v3.md 实读：§4.3.1（L225-262 接口+id 规则+错误码表 L270-279）、§5.1（L420-468 三向映射/懒注册/会话作用域缓存）、§8 迁移表 Step 5b 行（L775）与回滚列、§13 待验证项清单（L853-862，V-DSH-1~6） |
| R5 遗留 findings | `.governance/review-MIG-001-R5.md` 实读：F-1（materialize 未注册 id 双读宿主）、F-2（read() 传 displayPath 字符串 vs FsTarget）——均 P2，本轮修复对象 |
| 宿主 id 格式实证 | `node_modules/@deepseek-ai/dsh-attachment/lib/types/types.d.ts` L8（"Opaque storage identifier; never a filesystem path or bearer URL"）、`lib/types/brand.d.ts` L3（"Opaque content-addressed identifier"）、`lib/index.js` 内嵌 brand.js L50（"backend-produced opaque identifier"）、README（"immutable content-addressed object"、readImage "verifies the content-addressed object"）——**宿主契约：id 格式 opaque，语义上内容寻址，未承诺 sha256:hex** |
| 宿主接口实证 | dsh-attachment types.d.ts：saveImage/readImage/saveImages 签名、ImageAttachmentRef 字段（attachmentId/mediaType/bytes/width/height/name?）、StoredImageAttachment（ref+data）——与 mock 同构 |
| 调用点核验 | lib/tool.js L139 `service.selectAttachments(exec.agent, {...})` 同步调用（execute 内）；runCli L1416 唯一 materializeCliImages 生产调用点 |
| 测试运行结果 | **Coordinator 报告**（两次独立复跑）node tests/smoke.mjs → exit 0，`ALL SMOKE TESTS PASSED`，attachments 断言组 49 项全 ok（36 既有 + 13 新增），既有断言组零回退。⚠️ Reviewer 未独立复跑，测试输出请 Coordinator 附入 evidence-log |

## 设计一致性检查（逐条比对）

| 契约条目 | 实现 | 判定 |
|---|---|---|
| §8 Step 5b 行：prepareChatFiles / materializeCliImages / selectAttachments 三个寻址调用点改经 M2 | service.js:833（prepareChatFiles registerEntry）、:1169（materializeCliImages → registry.materialize）、:1753（selectAttachments → registry.byId 懒注册）——三调用点均接入 | ✅ 一致 |
| §8 Step 5b 行：测试=attachments.mjs 补迁移后断言（files 注入 / CLI 物化 / 附件派发经 M2）+ smoke 回归 | tests/attachments.mjs L300-361 三组断言（files×2 / CLI×4 / select×3 = 9）+ R5-F-1×3 + R5-F-2×1 = 13 新增；smoke.mjs 零改动（git status 事实） | ✅ 一致 |
| §8 Step 5b 行：回滚=恢复内部寻址调用 | 三处迁移均为独立调用点改动，恢复即还原旧调用形态（功能等价，仅失去统一索引）——与回滚列声明相符 | ✅ 一致 |
| §5.1 #1：物化缓存按会话作用域键 `sessionId\0id` | materialize L352 键不变；service.js:1414-1416 新增 sessionId 透传（session.sid/id 提取，无则匿名键）——会话内缓存成立；**匿名键跨会话共享 W-3 隔离弱化**（R6-F-4，P2） | ⚠ 一致（附 P2 注记） |
| §5.1 #2：懒注册降级（byId/resolve/materialize 对未注册合法宿主 id → readImage 降级注册） | lazyRegisterById（attachments.js:293-314）抽取 + materialize L361-368 peek→懒注册组合；byId L331 复用——单读语义（R5-F-1 闭环） | ✅ 一致 |
| §5.1 #3：注册图片走 attachments.saveImage（内容寻址去重） | prepareChatFiles 既有 saveImage（service.js:823）+ registerEntry 接线（:833-841）——**Developer 设计记录 1 裁量见下** | ✅ 一致（偏离已裁量） |
| §5.1 #4：解析失败明确报错不静默 | materialize 抛 INVALID_ATTACHMENT_ID/ATTACHMENT_UNKNOWN/STORE_UNAVAILABLE/UPLOAD_FAILED（attachments.js:350/365/375/397）；materializeCliImages 单图失败跳过为 BC-5 既定容错（service.js:1179-1181） | ✅ 一致 |
| §4.3.1 id 规则：`/^sha256:[0-9a-f]{64}$/i`（与宿主一致） | isAttachmentId 守卫贯穿三调用点（service.js:1167/1753 + registerEntry :125）——**宿主 dsh-attachment 契约实证标注 id 为 opaque（非 sha256）**，与"与宿主一致"假设矛盾（R6-F-1，P1）；§13 V-DSH 清单无 id 格式验证项 | ❌ 契约缺口（P1） |
| §4.3.1 错误码：ATTACHMENT_UNKNOWN（懒注册降级失败/未命中） | materialize L365、read L460/466、resolve L420 映射一致 | ✅ 一致 |
| R5-F-1 闭环（materialize 未注册 id 单读） | lazyRegisterById 捕获 data 供物化复用（attachments.js:313/367）+ materialize `if (!bytes)` 分支仅对已注册无 workspacePath 条目兜底（:373-384）——**未注册 1 读 / 已注册 1 读 / 有 workspacePath 0 读**，双读消除；测试 L186-189 断言 readImage 计数与字节落盘 | ✅ 闭环（修复验证通过） |
| R5-F-2 闭环（read() 经 FsTarget） | read() L456-464：fs.resolve(entry.workspacePath,{}) → readBytes(target, signal, MAX)——与 registerPath L194 / service.js:806 用法一致；测试 L195-205 strict fs 拒绝字符串形态 | ✅ 闭环（修复验证通过） |
| 范围守卫：不得出现 5c（RPC wire）/ 6（pre-step）/ 7（attachmentIds 参数） | 无 schemas.js/rpc.js/tool.js 变更（git status）；grep `attachmentIds` 无新参数面（wrapper.js/schemas.js 中为既有注释/既有 imageData codec）；无 pre-step 注册 | ✅ 合规 |

### Developer 两处设计记录裁量

**记录 1：prepareChatFiles 用 registerEntry 而非 registerPath 全管线** —— 判定：**契约一致（合理偏离，行为保持）**。事实：① registerPath（attachments.js:213-214）对宿主返回非 sha256 id 会抛 INVALID_ATTACHMENT_ID 使整条 files 注入通路失效；prepareChatFiles 现状（service.js:823-844）对 opaque id 不校验、注入成功。若改用 registerPath，opaque 宿主下 files 注入将整体击穿——registerEntry 守卫（:125 `if (!isAttachmentId) return entry`）恰好保持注入行为不变。② registerPath 会重复 resolve/stat/readBytes/saveImage（prepareChatFiles 已完成），registerEntry 仅索引寻址结果，无重复 IO。偏离有实证依据，不构成契约违反。

**记录 2：宿主 id 为 opaque 实证** —— 判定：**实证成立**。`dsh-attachment/types.d.ts` L8 明示 attachmentId 为 "Opaque storage identifier"；brand.js L50 "backend-produced opaque identifier"。架构 §4.3.1 L229 "内容寻址：/^sha256:…$/i（与宿主一致）" 的"与宿主一致"为**格式过度断言**——宿主语义上内容寻址（README：immutable content-addressed object / readImage verifies against logged metadata），但 id **格式 opaque 未承诺 sha256**。后果与建议见 R6-F-1（P1）。

## 五维度审查结论

### 维度 1：正确性 — PASS（附 P2×1 + P3×2）

- **三调用点行为等价性**（逐行比对旧实现）：
  - prepareChatFiles：新增 registerEntry（service.js:833-841）置于 saveImage 之后、`seen` 去重之前；registerEntry 幂等（重插尾）；opaque id 守卫跳过——注入结果（images/sections 返回值）与旧实现逐字节一致。
  - materializeCliImages：旧实现对所有 ref 一律 `readImage(ref)` + `cli-run-<stamp>-img-<n>` 落盘；新实现 sha256 ref → registry.materialize（路径 `.router-files/attachments/<hex>.<ext>`，命名方案变化为设计内行为——W-3 缓存跨 CLI 调用复用）；非 sha256 ref（含 opaque attachmentId 遗留 ref）→ 旧分支原样保留（service.js:1172-1177 与旧代码逐行相同）——**opaque 宿主下生产行为与迁移前完全一致（零回归）**。
  - selectAttachments：返回路径重构（selected/picked 变量），`[...new Set(selected)]` 与 `blocks.map` 去重语义与旧实现相同（indices 分支 Set 去重、includeImages-only 分支不去重——均保持）；校验抛错逻辑逐字保留（L1734-1735）。
- **fire-and-forget 懒注册**（service.js:1751-1754）：同步契约保持（selectAttachments 仍同步返回，tool.js:139 同步调用 ✓）；`void ...catch(() => undefined)` 防未处理 rejection（byId 内部 lazyRegisterById 对 readImage 抛错返回 undefined、registerEntry 对合法 id 不抛——catch 为纯防御，无吞错损失）；**竞态核验**：未 await 的 byId 与后续 materialize 并发——materialize peek 未命中 → 自身懒注册（至多 1 次额外宿主读取，两处 registerEntry 内容相同、last-writer-wins 幂等）→ "幂等，最多一次额外宿主读取"声明成立；同 (sessionId,id) 并发 materialize 重复写盘同字节（writeFileSync 同路径同内容，幂等无害）。**无未处理 rejection、无竞态破坏**。
- **peek vs byId LRU 语义**（任务专项问询）：materialize 命中分支用 peek（attachments.js:361）——peek 命中 delete+set 刷新 recency（:146-147），与 byId 命中路径（:326-329）**语义完全相同**；差异仅在入口守卫与懒注册回退，materialize 已自带 isAttachmentId 守卫（:350）→ 组合等价且单读。✓ 契约一致。
- **R5-F-1 修复正确性**：见设计一致性表"闭环"行——未注册 1 读（lazyRegisterById 复用 data）、已注册无 workspacePath 1 读（`if (!bytes)` 兜底）、有 workspacePath 0 读；旧代码未注册 2 读 → **修复消除了双读**。
- **R5-F-2 修复正确性**：read() 对 workspacePath 条目经 fs.resolve 取 FsTarget 再 readBytes，与 registerPath/service.js 一致；resolve 失败 → ATTACHMENT_UNKNOWN（原 readBytes 失败同为 ATTACHMENT_UNKNOWN，无错误语义回退）。
- **边界条件**：空 refs（materializeCliImages `refs ?? []`）、缺 attachmentId 且缺 id（`id=''` → 非 sha256 → 遗留分支 → readImage(ref) 由宿主裁决）、ref.attachmentId 为 sha256 但 legacy `{id,kind}` 恰为 sha256 形态（R6-F-6，P3）、session 无 sid/id（匿名键，R6-F-4，P2）、cwd 推导 dirname(dir)（R6-F-7，P3）——均显式或降级处理。
- **并发安全**：JS 单线程事件循环；新增共享态仅 registry（entries/pathIndex/materialized Map），全部操作同步幂等；无新竞态窗口引入。
- **资源管理**：无新增句柄/定时器（materialize 写盘同步、缓存 Map 有界 LRU 200）；registry.close() 生命周期未接 RouterService dispose（无定时器，GC 随服务回收，非泄漏——R5 同口径）。

### 维度 2：安全性 — PASS

- **注入防护**：物化文件名 = id hex 切片（isAttachmentId 强校验 `^sha256:[0-9a-f]{64}$`）+ 白名单扩展名映射（attachments.js:385-393）→ 无注入面；遗留分支文件名沿用既有 `cli-run-` 前缀 + 序号 + 白名单 ext（service.js:1174-1175）。
- **输入校验**：id 强格式校验先于任何宿主调用（service.js:1167 / attachments.js:350）；ref 形状防御性读取（`typeof ref?.attachmentId === 'string'` 等）。
- **敏感数据**：零密钥/token；sessionId 仅作缓存键（会话作用域隔离用途），不落盘不输出。
- **权限/沙箱**：materialize cwd 来自会话（dirname(dir) ← runCli 的 session.header.cwd），经 fs 服务沙箱透传（与既有 resolveInputFiles 同信任边界）。
- **跨会话隔离（W-3）**：匿名键 `\0id` 在 sid/id 缺失时会话间共享物化路径——**作用域弱化**（R6-F-4，P2），非注入/泄露（路径本身仅 id 派生 + cwd），但违反 W-3 设计意图的前提条件需验证。
- **OWASP 映射**：A03 注入（无新增）、A05 失效访问控制（沙箱由宿主 fs 承接，与迁移前同边界）、A01 敏感数据（无）。无新增网络面。

### 维度 3：可维护性 — PASS（附 P3×1）

- lazyRegisterById 抽取（attachments.js:293-314）职责单一，头注释承载 R5-F-1 修复意图；materializeCliImages 头注释完整声明 M2/遗留双分支与 R6/K-8 兼容理由（service.js:1150-1156）。
- 命名清晰（lazyRegisterById/byId/peek/materialize 与契约一一对应）；isAttachmentId 复用统一 id 判定。
- 函数长度：materializeCliImages 约 27 行双分支可接受；selectAttachments 增加 6 行注册循环。
- 重复代码：遗留分支与迁移前 materializeCliImages 主体重复——**既定兼容保留**（R6/K-8），注释明示，非隐藏坏味道。
- 注释质量：关键不变量（会话作用域键、匿名回退、幂等声明、peek 刷新语义）均有行内注释；R6-F-4 注：service.js:1412-1413 注释"跨会话不共享物化路径"对匿名键场景表述不成立（见发现列表）。

### 维度 4：性能 — PASS

- **R5-F-1 修复**消除了"未注册 id 物化双读"（唯一冗余 I/O，R5 已标 P2）——物化路径全分支 ≤1 次宿主读取。
- fire-and-forget 预热：selectAttachments 派发后若紧跟 materialize（同 tick 窗口内完成注册）→ 节省 1 读；未完成 → materialize 自懒注册（至多 1 额外读，有界）。**但**对 chat 类型目标（消费 attachment 块，不经 registry）为纯投机读（R6-F-8，P3）；opaque 宿主下循环为空操作（isAttachmentId false），零开销。
- 无新增 O(n²)/N+1；Map 读写 O(1)；物化缓存 LRU 200 有界。
- 懒加载保持：物化（写盘）延迟到首次 CLI 需要时触发。

### 维度 5：测试覆盖 — PASS（附 P2×2 + P3×1）

13 新增断言逐条静态核验（36 既有 + 13 = 49，与 Coordinator 报告一致）：
- **R5-F-1×3（强）**：L186 readImage 计数 +1 且路径形状（判别 M2 物化路径）；L187 落盘字节长度（核验字节复用非空写）；L188-189 同会话二次物化缓存命中零读。可检测双读回归。
- **R5-F-2×1（强）**：L195-205 strict fs 的 readBytes 拒绝字符串/裸对象——若 read() 回退传 displayPath 字符串立即失败。可检测 FsTarget 契约回归。
- **CLI 物化×4（强）**：L325 路径形状（旧实现 cli-run-* 命名必不匹配 → 判别迁移）；L326 单读计数（判别 F-1 经 service 通路）；L329 会话缓存命中（判别 W-3 键）；L334 遗留 ref 跳过 + 宿主读取计数（钉死 K-8 兼容契约，不抛错不产生路径）。
- **files 注入×2（判别力缺口 → R6-F-2，P2）**：L311 经 awaited `byId` 校验——byId 自身懒注册回退使断言在 registerEntry 缺失时**同样通过**；无同步 entries 检查区分"急注册"与"懒注册"。
- **附件派发×3（判别力缺口 → R6-F-3，P2）**：L359 awaited `byId` 先于 `entries.size` 读取（byId 自注册使 size===1 恒成立）；L360 readImage 计数 +1 在"预热注册"与"byId 懒注册"两种路径下**数值相同**——fire-and-forget 注册块被移除时三断言全绿。
- **边界/错误路径**：CLI 无 attachments 服务早退（service.js:1159 未测——R5 F-4 同口径遗留）；opaque 可解析遗留 ref 的 cli-run 落盘路径未测（R6-F-9，P3）。
- **mock 与真实宿主偏差**：makeAttachments.saveImage 返回 contentHashId（sha256）——契约形状与宿主一致（saveImage/readImage/StoredImageAttachment 签名实证同构），但 **id 格式假设 sha256 与宿主 opaque 契约不符**（R6-F-1/F-9）：测试绿证明 sha256 通路正确，**不能证明真实宿主 opaque 通路的降级行为**（虽经静态核验无回归）。
- 覆盖率：本仓库无覆盖率工具，以 smoke 全绿为门（既有口径）。

## AI 代码专项 5 项检查

| # | 检查项 | 结论 | 事实 |
|---|---|---|---|
| 1 | mock 残留 | **PASS** | 产品代码（service.js/attachments.js）零 mock/测试开关/环境分支；makeRouterHarness/makeAttachments/makeFs 为测试夹具（与 smoke.mjs root.provide 同构），非产品残留 |
| 2 | 硬编码返回值 | **PASS** | sessionId 提取、registerEntry 字段映射、id 提取（attachmentId→id 优先级）均为真实逻辑；无伪装计算/假数据；`stamp` 在 M2 分支未用（遗留分支使用）非死代码 |
| 3 | 幻觉 API 调用 | **PASS** | registry.registerEntry/materialize/byId（attachments.js 实读逐签名比对）；attachments.saveImage/readImage（宿主 dsh-attachment types.d.ts 实证签名一致）；fs.resolve/readBytes（service.js:781 既有同构）——全部可复查 |
| 4 | 未实现 TODO | **PASS** | 三文件 grep TODO/FIXME/XXX/HACK 零匹配；"格式未验证 F-5/遗留宿主"为契约待验证标注（真实存在——R6-F-1），非未实现桩 |
| 5 | 过度实现 | **PASS** | 恰实现 §8 Step 5b 行三调用点 + R5 F-1/F-2 修复；无 5c RPC wire / 6 pre-step / 7 attachmentIds 参数任何提前实施（git status 恰 3 文件 + grep 无新参数面）；materializeCliImages 遗留分支为 K-8 兼容必需非冗余 |

## 发现列表（每条含级别/位置/事实/建议）

| # | 级别 | 位置 | 事实 | 建议 |
|---|---|---|---|---|
| R6-F-1 | **P1 关键（设计一致性契约缺口）** | docs/architecture-v3.md L229（id 规则"与宿主一致：sha256"）vs node_modules/@deepseek-ai/dsh-attachment/lib/types/types.d.ts L8 / lib/types/brand.d.ts L3 / lib/index.js brand.js L50；service.js:1167,1753（isAttachmentId 守卫）；tests/attachments.mjs L279（mock 注记） | 宿主契约实证：attachmentId 为 "Opaque storage identifier"（types.d.ts L8）、"backend-produced opaque identifier"（brand.js L50）——语义上内容寻址（README "immutable content-addressed object"）但**格式未承诺 sha256:hex**。架构 §4.3.1 "与宿主一致：sha256" 与宿主契约矛盾，且 §13 V-DSH-1~6 无 id 格式验证项。后果：① 真实宿主 opaque id 下三调用点全部降级——registerEntry 守卫跳过（registry 不索引 files 注入）、materializeCliImages 走遗留分支（行为与迁移前逐字节一致，**无回归**）、selectAttachments 循环空操作——M2 统一索引在真实宿主下**空转**；② 测试 mock saveImage 返回 sha256（tests/attachments.mjs:27），49 项断言全绿**不能证明真实宿主行为**；③ Step 5c/7/8 依赖 id 解析（§7 L326 attachmentIds `/^sha256:/`），将继承同一假设 | 非代码返工项（Step 5b 代码为不确定下的正确防御姿态）：L1 新增 V-DSH-7（宿主 saveImage 返回 id 的实际格式：sha256:hex vs opaque；验证方法=宿主后端实现源码/d.ts 或运行态 saveImage 采样）至 §13；L2 决策记录：opaque 形态下注册表空转的接受/适配（如 registerEntry 以插件侧 contentHashId 建立条目、或放宽 isAttachmentId 的"规范身份"定义、或要求宿主对齐）——**Step 5c/7 落地前必须闭环**；L3（可选，Developer）补 opaque-id 回退断言（prepareChatFiles opaque id 注入行为不变且 registry 跳过；materializeCliImages 可解析 opaque ref 走 cli-run 落盘） |
| R6-F-2 | **P2 建议** | tests/attachments.mjs:311 | "chat files injection registers M2 entry" 经 `await service.registry.byId(expectedId)` 校验——byId 对未注册 id 自动懒注册（attachments.js:331-332），registerEntry 接线（service.js:833）即使被移除断言**仍通过**；无 readImage 计数或同步 entries 检查 | run() 返回后、任何 byId 之前加同步判别：`service.registry.entries.get(expectedId)?.id === expectedId`（或 `entries.size === 1` + readImage 计数 0） |
| R6-F-3 | **P2 建议** | tests/attachments.mjs:355-360 | selectAttachments 组三断言均不能判别 fire-and-forget 注册块（service.js:1751-1754）：L359 awaited `byId` 先于 `entries.size` 读取（byId 自注册使 size===1 恒真）；L360 readImage +1 在"预热注册"与"byId 懒注册"两路径数值相同；L356 为同步返回值恒真 | 在 `setTimeout(0)` 之后、**未调用 byId 之前**同步断言 `service.registry.entries.get(pickId) !== undefined && service.registry.entries.size === 1`；readImage 计数断言保留作防双读回归 |
| R6-F-4 | **P2 建议** | lib/service.js:1412-1416；lib/attachments.js:352 | sessionId 提取（sid/id）失败时用匿名键 `\0id`——**所有无 sid/id 会话共享同一物化缓存键**；与 R5-F-3（键不含 cwd）叠加：会话 A 物化的 `.router-files/attachments/<hex>.<ext>`（其 cwd 下）可被无 sid/id 的会话 B 命中复用（B 引用 A 的工作区路径，W-3 明令禁止）。service.js:1413 注释"跨会话不共享物化路径"对匿名键场景**表述不成立**。实际影响取决于宿主会话是否携带 sid/id（本仓库未验证）及多会话是否共享 RouterService | 物化缓存键并入 cwd（`${sessionId ?? ''}\0${cwd}\0${id}`，防御 R5-F-3 + 本项）；或确认宿主 session 恒有稳定 id 后收紧注释；Coordinator 记录契约前提（会话内 cwd 恒定 + 会话必有 id） |
| R6-F-5 | **P3 讨论** | lib/attachments.js:453-461 | F-2 修复后 read() 新增 fs.resolve 失败 → ATTACHMENT_UNKNOWN 映射（旧代码无 resolve 调用，仅 readBytes 失败 → ATTACHMENT_UNKNOWN）。映射合理：与 read() 面既有"附件不可读 → ATTACHMENT_UNKNOWN"语义一致（文件删除/不可访问 = 附件不可解析）；registerPath 的 resolve 失败 → PATH_OUTSIDE_WORKSPACE（L177）为不同上下文（用户输入路径的沙箱校验），非不一致 | §4.3.1 错误码表可补充 read() 的 resolve-failure 归属说明（ATTACHMENT_UNKNOWN）；当前无修改必要 |
| R6-F-6 | **P3 讨论** | lib/service.js:1166-1167 | id 提取优先级 attachmentId → id：遗留 ref `{ id, kind }` 若恰为 sha256 形态会被路由进 M2 分支，宿主调用形态从 `readImage(ref)` 变为 `readImage({ attachmentId })`。遗留 id 文档化为 opaque（K-8），概率极低 | 无修改建议；知悉即可（若需严格防御可在遗留分支先试 readImage(ref) 或对 id 字段额外校验 source） |
| R6-F-7 | **P3 讨论** | lib/service.js:1163 | `const cwd = dirname(dir)` 从物化目录反推会话 cwd——当前唯一生产调用点 runCli 传 `join(cwd, '.router-files')`（L1399）故恒正确；但方法契约未显式声明 dir 形态，未来调用方传非 `cwd/.router-files` 目录会静默得到错误 cwd（缓存键 + 懒注册沙箱 cwd 双错） | JSDoc 声明 dir 契约或改传 cwd 参数（显式优于反推）；当前无缺陷 |
| R6-F-8 | **P3 讨论** | lib/service.js:1751-1754 | fire-and-forget 预热对 chat 类型目标（消费 attachment 块不经 registry）为纯投机宿主读取——每派发一次多 1 次 readImage；对 cli/agent 类型为有界收益（省 1 读，最坏仍 1 读）。opaque 宿主下循环空操作零开销 | 设计取舍可接受（注释已声明意图）；知悉即可 |
| R6-F-9 | **P3 讨论** | tests/attachments.mjs:277-279,318-334 | makeRouterHarness mock 与真实宿主偏差：saveImage 返回 sha256（宿主契约 opaque，R6-F-1 同源）；测试仅覆盖 sha256 通路，**opaque 可解析遗留 ref 的 cli-run 落盘分支（service.js:1172-1177）无直接断言**（L334 只测不可解析跳过） | R6-F-1 的 L3 补测项一并覆盖；当前降级行为经静态核验无回归 |

## 硬门槛裁决

| 门槛项 | 阈值 | 实测 | 判定 |
|---|---|---|---|
| P0 阻塞问题数 | = 0 | 0 | ✅ |
| 5 维度全覆盖 | = 100% | 5/5 逐项有结论（正确性附 P2×1/P3×2、安全性 PASS、可维护性附 P3×1、性能 PASS、测试附 P2×2/P3×1） | ✅ |
| 每条发现标注级别 | = 100% | 9/9（P1×1 + P2×3 + P3×5）含文件:行号/事实/建议 | ✅ |
| 设计一致性检查 | 已完成 | §8 Step 5b 行 + §5.1（含 W-3 注记）+ §4.3.1（含 id 规则缺口 P1）+ R5-F-1/F-2 闭环 + Developer 两处设计记录裁量——12 项逐条比对表 | ✅（1 项契约缺口已裁决并附遗留计划） |
| AI 专项 5 项 | 全部完成 | 5/5 PASS（各有事实列） | ✅ |
| 范围合规 | 无 5c/6/7 提前实施 | git status 恰 3 文件；grep 无新 RPC/pre-step/attachmentIds 参数面 | ✅ |
| 事实依据红线 | 未验证标"未验证" | 宿主 id 运行时实际格式（R6-F-1）、宿主会话 sid/id 可用性（R6-F-4）标未验证；其余结论全部指向可复查文件/行/宿主包实证 | ✅ |

## 终态

**APPROVED_WITH_NOTES** — 零未解决 BLOCKING finding（`unresolved_blockers=0`）；P0=0 / P1=1 / P2=3 / P3=5。关闭条件核验：P0=0 且 P1>0（有遗留计划）→ **有条件通过**。

P1 遗留计划（Coordinator 依此闭环，不阻塞 Step 5b 提交）：
- **R6-L1**：architecture-v3.md §13 新增 V-DSH-7（宿主 attachmentId 实际格式 sha256 vs opaque）并附验证方法；
- **R6-L2**：决策记录——opaque 形态下 M2 注册表空转的接受/适配方向，Step 5c/7 落地前必须闭环（涉及 §7 attachmentIds `/^sha256:/` 假设）；
- **R6-L3**（Developer 可选）：补 opaque-id 回退断言（R6-F-2/F-3 同步判别 + R6-F-9 遗留分支落盘）。

P2×3（R6-F-2/F-3 测试判别力、R6-F-4 匿名会话键）可遗留至下一轮或随 L3 一并处理；P3×5 为讨论/知识项。

附条件（同 R5 口径）：Coordinator 将测试运行输出（`node tests/smoke.mjs` → exit 0 / ALL SMOKE TESTS PASSED，attachments 断言组 49 项全 ok）附入 evidence-log，满足"测试全绿"验收项的可复查事实红线；并在证据中标注"测试 mock 为 sha256 契约形状，真实宿主 opaque 通路的降级行为为静态核验结论（R6-F-1/F-9）"。
