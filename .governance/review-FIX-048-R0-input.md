# FIX-048 R0 代码审查报告（图片条件化自动接管失效修复）

- **Task**: FIX-048（round 0）· P0
- **审查对象**: staged diff（HEAD `2d1e716`，未提交）——7 文件 +388/−29
- **Reviewer**: Code Reviewer Agent（software-project-governance）
- **日期**: 2026-09-18
- **绑定规范**: agents/code-reviewer.md + skills/code-review/SKILL.md（0.65.0 循环语义）
- **审查方式**: 只读（Read/Grep/Glob；Bash/shell 按角色权限禁用——未运行测试、未复算哈希、未执行 git diff，见「独立核验声明」）

---

## 0. 结论

**APPROVED_WITH_NOTES — unresolved_blockers=0**

P0 = 0；P1 = 0；P2 = 1（范围外既有代码观察，不阻塞本 diff）；P3 = 4。硬门槛五项全部通过。

---

## 1. 独立核验声明（Developer 声称 × 实读验证）

| # | Developer 声称 | 核验结果 | 证据 |
|---|----------------|----------|------|
| 1 | 根因：宿主 InputState 已演进为 `attachmentIds`，无 `imageIds` 字段 | **实** | 宿主 `dsh-client-ui-conversation/lib/types/client/contract/input.d.ts` L303-321 `export interface InputState` 字段 = draft/attachmentIds/draftRev/phase/claim?/occurrences/queue；该包全树 grep `imageIds` **零命中**（含 lib/client.js 15806-15869 InputBar 消费点，读 `input.attachmentIds`） |
| 2 | `inputImageCountOf` 三分支（A kind 解析 / B 保守回落 / 旧 imageIds） | **实** | lib/client.js L4461-4476 逐行读，优先序与设计一致（attachmentIds 优先于 imageIds；resolve 非数组/抛错均落 B） |
| 3 | 装配点 `conversation` 透传 | **实** | lib/client.js L5895-5906：`inject: () => ({ api, conversation: conversationFace })` + `conversation: props.conversation`；`conversationFace = () => ctx.get('conversation')`（L5772），与 AttachButton 槽位（L5867）同款先例 |
| 4 | 四测试文件夹具改锚定宿主 InputState 契约 + 旧形态回落保留 | **实** | fix-012 L217-242（inputStateOf 全字段清单 + takeoverNew）、fix-029 L355-382（B5/B6）、routing-paths L954-988（F9 + F10 回落）、client-render L1100-1118（+ L1180-1186 legacy 回落断言）；旧形态通道四文件均保留 |
| 5 | host-contract.mjs 增 S7 形状锚（正向 + 负向 + 面/kind 锚） | **实** | host-contract.mjs L908-928：attachmentIds 正向锚、`readonly imageIds` 负向锚、resolveDraftAttachments 签名锚、kind 'image'/'file' 锚；四项断言字符串与我实读的宿主三个 .d.ts 逐字吻合 |
| 6 | RED→GREEN：fix-012 N1/N3/N4/N5a、fix-029 B5/C5、routing-paths F9 先红后绿 | **静态推演成立；未实跑**（Bash 禁用） | 逐条推演：旧代码只读 `imageIds` → 新形态夹具下 imageCount 恒 0 → N1/N3/N4/N5a、B5、F9 必败；C5（装配 regex `conversation:\s*props\.conversation`）对未透传装配必败。GREEN 侧以夹具/断言与现行实现吻合确认在逻辑上必然通过。**测试网实际运行的绿态证据须由 Developer/Coordinator 按 P-v2 附机器输出** |
| 7 | 镜像 lib/client.js ≡ tests/served-client.js（SHA256 恒等） | **实质成立；SHA256 未复算** | 两文件均 5959 行；42 个 FIX-048 族标记行（L4435→L5923）**行号逐一相同、内容逐一相同**；头部（L1-40）、中部（L2995-3002）、尾部（L5900-5959）抽查逐字节一致。行号全对齐 + 总行数相等 ⇒ 逐行内容一致；哈希等价性是合理推论而非复算事实 |
| 8 | FIX-002/FIX-012 接管语义零改动 | **实** | 见 §4 设计一致性 |

## 2. P10-④ 宿主锚逐项验证（全部实读，禁采信陈述）

| 锚点 | 宿主实证 |
|------|----------|
| `InputState.attachmentIds: readonly DraftAttachmentId[]` | input.d.ts L307 逐字在位 |
| InputState 无 imageIds 字段 | input.d.ts 全文无；该包全树 grep `imageIds` 零命中 |
| `resolveDraftAttachments(ids: readonly DraftAttachmentId[]): readonly ComposerAttachment[]` | service.d.ts L143 逐字在位；实现体 host lib/client.js L3096 实存；消费点 InputBar L15820 `resolveDraftAttachments(input.attachmentIds)` |
| ConversationController 以 `conversation` 名注册 | service.d.ts L64-65 + host lib/client.js L2857 `super(ctx, "conversation")` |
| `ComposerAttachment.kind: 'image' \| 'file'` | slots.d.ts L19-36（ComposerImageAttachment L22 / ComposerFileAttachment L33） |
| `SessionStandardProps: useInput/inputActions` | slots.d.ts L241-248 |

**结论：新增宿主面引用零幻觉。**

## 3. 五维度结论

**① 正确性 — 通过（无阻塞）**
- 三分支逻辑逐行验证（lib/client.js L4461-4476）：非对象快照→{0,none}；attachmentIds 数组 + 解析面函数→try resolve、Array.isArray 校验后按 kind==='image' 计数（null 条目被 `!!attachment` 过滤）；解析面缺失/抛错/返回非数组→{attachmentIds.length,'attachment-ids'}；仅 imageIds→长度；两者皆无→{0,none}。优先序正确（attachmentIds 胜出，混合形态不双计）。
- 方法调用保 this：`resolveDraftFace = (ids) => conversationSvc.resolveDraftAttachments(ids)`（L4540）——与宿主 service 注释的 tracker `this.ctx` 重绑定语义相容。
- 无图/纯文本轮永不武装：`takeoverArmed = 多模态agent>0 && (开关 || imageCount>0)`（L4551）；imageCount=0 且开关 false → 仅走还原链；Q3/B2/M2/F1/F3-1 四组测试固化。
- `useInput((state)=>state)` typeof 分支生命周期内形态稳定，hook 调用序无漂移（useRef 在 L4546 无条件调用，顺序稳定）。
- deps 数组（L4683）含 imageCount/imageConditional/capabilitySig——计数形态切换（0↔n）会正确重触发 effect。

**② 安全性 — 通过**
- 无新增注入面：console.warn 为静态字符串；无 eval/DOM 拼接新增（`new Function` 仅存在于测试驱动侧，对象是仓内受控源码）。
- 无敏感数据入 diff；无权限面变化；类型防御（Array.isArray/typeof）齐备；effect 清理函数保持。OWASP 关键项逐项过，零发现。

**③ 可维护性 — 通过**
- inputImageCountOf 单一职责、JSDoc 完整且锚定宿主契约（含 2026-09-18 只读实读出处）；与既有双形态兼容先例（FIX-029-B useInput/props.input）模式一致；装配点注释说明漏透传后果。未导出该函数做直接单测——与本仓「判别测试钩子选择性导出 + 行为级驱动」惯例一致，不构成发现。

**④ 性能 — 通过**
- 每渲染 O(n)（n=附件数，量级个位）；filter 一次性分配；resolveDraftAttachments 为宿主同步注册表读取。无 N+1/无 I/O 循环。

**⑤ 测试覆盖 — 通过（附 P3 增强）**
- 判别力：RED 集（N1/N3/N4/N5a、B5、C5、F9）在 imageIds-only 旧代码下逐条推演必败——判别面覆盖「行为」而非仅「钩子存在」（fix-012 L159-164 还保留 FIX012_CLIENT_SOURCE 逻辑级 RED 通道）。回归护栏：N2（file-only 不武装）、N6（capability 门控）、N5b/S2/S3（发送后保持）、M1/F4（手动 twin 尊重）、SW1-6/P2-1（开关交错升级链）、F18 组全部保留。
- 旧形态回落测试四文件全部显式保留（Q 组/B1/B3/F10/client-render L1185-1186）——无「只测新形态假绿」。
- 缺口（P3-1/P3-2，见 §6）：branch B 的「解析面抛错」与「返回非数组」两个触发面未直接断言；方案 B 一次性 warn 无机器断言。

## 4. 设计一致性（FIX-012 用户裁决「贴图即切、发送后保持」）

- **贴图即切**：imageCount>0（kind 形态仅计 image）+ 开关 false → 接管 twin——Q1/N1/B5/F9 四通道覆盖。✓
- **发送后保持（image 来源永不自动还原）**：还原链仅 `armedBy==='switch'` 走 selectModel 还原；`armedBy==='image'` 只清「用户已手动改走」的记忆（L4644-4653）——S2/S3/N5b/B4 固化零还原调用。✓
- **用户手动选择尊重**：takeoverMemory 仅还原本组件放上的 twin——M1/F4/F3-2 + routing-paths F4/F5 双会话记忆隔离。✓
- **capabilitySuppressed 门控保持**：L4611 判定式形态未变，消费同一 imageCount，kind 形态语义等价——N6/F18-1/5a 覆盖。✓
- **FIX-002 开关语义不回退**：开关驱动接管/还原路径零改动——Q4/SW1/SW2/P2-1 组。✓
- **P5/P-v3 检查**：双形态并存是宿主版本兼容的有意设计（0.1.2-rc.x 旧宿主仍可能在野），非「被取代路径未删」违规；新旧触发来源汇入同一计数单点 inputImageCountOf，无第二实现。✓
- **P8**：方案 B 降级 warn 在位（L4547-4550）——可观测性成立；测试看护缺口记 P3-2。

## 5. AI 专项五查

| 项 | 结论 |
|----|------|
| mock 残留 | **无**——产品代码零 mock；测试 fake（makeConversation/conversationFaceOf）显式标注夹具身份与锚点出处 |
| 硬编码返回值 | **无**——计数全部来自实参快照与解析面；{0,'none'} 为合法哨兵 |
| 幻觉 API | **无（本 diff 范围内）**——§2 全锚实证。范围外发现见 P2-1 |
| 未实现 TODO | **无**——lib/client.js 与 5 个测试文件 grep TODO/FIXME/XXX/not implemented 零命中（host-abi-health.mjs 3 处为「禁 TODO 存根」纪律表述） |
| 过度实现 | **无**——变更收敛于计数单点 + 透传 + 测试锚；warn 一次性（ref 守卫）未做多余机制 |

## 6. 发现清单

| ID | 级别 | 位置 | 事实 | 影响 | 建议 |
|----|------|------|------|------|------|
| P2-1 | P2（范围外既有代码，非本 diff 引入） | lib/client.js L4778-4779（AttachButton） | 图片分支守卫消费 `conversationSvc.createDraftImages` 与 `inputActions.addImages`——两符号在宿主 0.1.5-rc.1 契约均不存在（service.d.ts 为 `createDrafts(sessionId, files)`；InputActions 为 `addAttachments`，slots.d.ts L210-221；全包 grep 零命中） | 插件附件按钮的图片路径在现行宿主大概率恒走 `attachUnavailable` 错误分支（静态契约判断，未运行时验证）——与 FIX-048 同类宿主面漂移 | 开独立任务（建议 FIX-049）按 P10-④ 重锚 AttachButton 图片分支；**不阻塞 FIX-048 合并** |
| P3-1 | P3 | lib/client.js L4466-4472 / tests/fix-012 N4 | branch B 的「resolveDraftAttachments 抛错」与「返回非数组」两个触发面无直接断言（N4 仅覆盖 face 缺失） | 两防御分支无回归护栏 | 各补 1 条断言（fake 抛错 / fake 返回 undefined） |
| P3-2 | P3 | lib/client.js L4547-4550 / tests/fix-012 N4 | 方案 B 一次性 warn 无机器断言（未捕获 console.warn） | P8 可观测性缺测试看护；「一次性」语义（ref 守卫）无回归锁 | N4 中捕获 console.warn，断言恰触发一次 |
| P3-3 | P3 | lib/client.js L4546-4550 | warn + ref 写发生在渲染期（非 effect） | React 并发模式丢弃渲染时该次 warn 被吞（ref 已置 true）；诊断信息层面影响极小 | 移入 useEffect（带同条件守卫） |
| P3-4 | P3 | 工作区 `.tmp-cli-smoke-*/gen.png`（mtime 尾部） | mtime 排序显示 7 声明文件之后仅有 .governance 元数据与 .tmp-cli-smoke 临时图片产物 | 瞬态产物混入工作区（非 staged 源码面） | 确认 .tmp-* 不入库/定期清理（例行动作，非本任务缺陷） |

## 7. 硬门槛裁决

| 门槛 | 阈值 | 裁决 |
|------|------|------|
| P0 阻塞问题数 | = 0 | **0** ✓ |
| 5 维度全覆盖 | 100% | 正确性/安全性/可维护性/性能/测试覆盖逐一有结论 ✓ |
| 每条发现标注级别 | 100% | P2×1 + P3×4 全标注 ✓ |
| 设计一致性检查 | 已完成 | §4 对照 FIX-012/FIX-002 用户裁决逐条比对 ✓ |
| AI 专项 5 项 | 全部完成 | §5 五项逐一有结论 ✓ |

## 8. 越界检查

- git 不可用（角色 Bash 禁用），采用 mtime 排序启发式：工作区 3125 文件按修改时间排序，**位次 3111-3117 恰为声明的 7 文件且连续**（lib/client.js → client-render → fix-012 → fix-029 → host-contract → routing-paths → served-client，符合「先产品后测试、镜像最后」的开发序），其后仅 .governance 元数据与 .tmp-cli-smoke 产物。**未发现范围外产品/测试文件编辑**。
- 残余限制：单文件内部「顺带改」无法与 HEAD 逐行比对（见 §9）；已读的全部变更区均带 FIX-048 标记且语义收敛。

## 9. 验证边界（Coordinator 复核时须知）

1. 未实跑测试网（Bash 禁用）——GREEN 状态为静态推演；按 P-v2，产品代码变更的测试网全绿机器输出须由 Developer/Coordinator 补证据。
2. SHA256 未复算——镜像一致性以行号对齐 + 抽区逐字节比对判定（§1.7），结论实质成立。
3. 宿主锚验证覆盖 `dsh-client-ui-conversation` 包全树；「全宿主树零 imageIds」的更宽表述仅对该关键包实证（InputState 契约权威面即在该包，宽表述风险可忽略）。
4. P2-1 为静态契约判断，未运行时复现。

## 10. 复审指引（若 Coordinator 需 R1）

按前轮 findings 逐条比对：P3-1/P3-2/P3-3 修复后须验证新增断言的 RED 判别性；P2-1 若开独立任务不并入本 diff。
