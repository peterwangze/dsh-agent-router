# MIG-001 R11 — Step 8 单元复审报告（Code Reviewer，返工验证轮）

- **Round**: R11（Step 8 单元复审轮——R10 = `APPROVED_WITH_NOTES` 但 F-01/F-02（P1）×2 按规则返工；R11 = 返工验证轮）
- **前轮引用**: `.governance/review-MIG-001-R10.md`（F-01~F-05 共 5 条 findings 为本轮逐条比对对象；P3×8 记录项不在返工范围，仅确认未被动过）
- **审查对象**: 未提交变更集（Step 8 原始实现 + 返工修复，累计 4 文件 +450/-18）— `lib/client.js`（+142/-17）、`lib/service.js`（+108/-1）、`tests/client-render.mjs`（+103）、`tests/smoke.mjs`（+115）
- **审查者**: software-project-governance-code-reviewer（只读审查；唯一写入为本报告）
- **审查日期**: 本会话
- **终态**: `APPROVED_WITH_NOTES`
- **独立结构字段**: `unresolved_blockers=0`

---

## 0. 复审范围与执行方式

- 复审协议（R11）：**逐条比对 R10 findings（F-01~F-05）**，标注"已修复/未修复/新引入"；不得直接 APPROVED。
- 复审范围 = R10 findings 的修复质量 + 修复是否引入新问题（回归视野）；不重开全量首轮审查（R10 首轮已覆盖的设计一致性/AI 专项结论不重复展开，除非修复触及）。
- 实读：R10 报告全文（158 行）；`lib/client.js` L3220-3399（AttachButton/uploadFile/intake 修复区）；`lib/service.js` L1980-2079（uploadFile 修复区）；`tests/client-render.mjs` L150-279（夹具/remoteMock）、L640-736（F-01/F-05 断言区）、L300-359（mount 断言）；`tests/smoke.mjs` L840-936（uploadFile 断言区）；`lib/attachments.js` L1-150（registerEntry/fsService/contentHashId）、L151-269（registerPath 非图片路径）。
- 未运行任何命令（协议硬约束）；测试运行事实由 Coordinator 提供（见 §1 F-T1）。
- 未修改任何产品代码；唯一写入为本报告。

## 1. 事实依据表（可复查事实）

| # | 事实 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| F-T1 | `node tests/smoke.mjs` → exit 0，`ALL SMOKE TESTS PASSED`，495 ok / 0 FAIL；client-render 随 smoke 内联 exit 0 | Coordinator 独立复跑 | **未亲自复跑**（依协议以 Coordinator 事实为准）；495 = 491 基线 + 4（F-02×2 + F-04×1 + F-01 多文件×1；F-05 失败态断言 1:1 更名）——与新断言逐条计数一致（见 §4） |
| F-T2 | F-01 修复实读：`draftRef = useRef(currentDraft)` + `draftRef.current = currentDraft` 每渲染刷新（client.js L3274-3275）；uploadFile 返回 Promise（成功 resolve 路径文本/失败 resolve null，L3301/L3307）；intake 内 `Promise.all(others.map(uploadFile)).then((texts) => {...})` 全部落定后**一次** setDraft（L3340-3347），`lines = texts.filter(t => t !== null)`（L3341，失败文件不产生行） | 实读 client.js | 逐行比对 R10 F-01 建议①② |
| F-T3 | F-02 修复实读：`writeFileSync(target, bytes, { flag: 'wx' })` O_EXCL 写（service.js L2054）；EEXIST 捕获 → `writtenName = fileName-<attempt>`（L2058-2059）去重后缀重试循环（L2052-2064）；返回 `name: writtenName`（L2077） | 实读 service.js | 逐行比对 R10 F-02 建议；EEXIST 判定含 `error.code === 'EEXIST'` + 消息兜底正则（L2057） |
| F-T4 | F-04 修复实读：解码前粗筛 `dataBase64.length > Math.ceil(URL_FILE_MAX_BYTES * 4 / 3) + 16` → FILE_TOO_LARGE（service.js L2020-2022） | 实读 service.js | 阈值数学核验（§3.3）：25MB=26,214,400 字节 → 合法 base64 长度上界 = ceil(26214400/3)*4 = 34,952,536；阈值 = ceil(26214400*4/3)+16 = 34,952,550 → **余量 14 字符，合法 25MB 文件无误伤** |
| F-T5 | F-03 修复实读：service.js L1984-1989 注释不再含"该会话必然已至少运行过一次"断言（仅描述 rememberWorkspace 机制）；uploadFile 文档串（L2008-2010）明确"无记录时返回 WORKSPACE_UNAVAILABLE"；smoke L871-874 注释如实陈述"全新会话首条消息即上传 → 无记录 → WORKSPACE_UNAVAILABLE" | 实读两文件 | 与 R10 F-03 所指断言逐字比对，断言已移除 |
| F-T6 | F-05 修复实读：client-render L696-706 失败用例复用**同一组件实例**（`currentTree` 承接成功用例，非 `imageToolReg.render` 新实例）；断言 `failCards.length === 1 && textOf(currentTree).includes('FILE_TOO_LARGE')` | 实读 client-render | 与 R10 F-05 所指"全新实例恒真"对比，实例复用成立 |
| F-T7 | 新断言实读：F-01 多文件（client-render L721-733，`multiDrafts.length === 1` + 双路径行 + `multiCards.length === 2`）；F-02 碰撞×2（smoke L902-903：`secondDoc.name === 'notes.docx-1'` + 双文件 existsSync + `firstDoc.attachmentId !== secondDoc.attachmentId` + byId/byPath 双条目 + 真实磁盘字节 Buffer.compare 双校验）；F-04（smoke L913-914：`'!'.repeat(Math.ceil(26*1024*1024*4/3)+16)` → `huge.code === 'FILE_TOO_LARGE'`） | 实读两测试文件 | 逐条推演判别力（§4） |
| F-T8 | F-02 测试有效性交叉点：registerPath 经 `this.ctx?.get?.('fs')` 取 fsService（attachments.js L118-121）；smoke 打补丁对象 `service.ctx.get('fs')` 与 registry 为**同一 ctx 根**（attachments.js L100 "与 RouterService 同根"）→ readBytes 真实读盘补丁（smoke L890-899，try/finally 恢复）对 contentHashId 有效 | 实读 attachments.js + smoke | 对象引用链核验；补丁 finally 恢复无泄漏 |
| F-T9 | 常量一致性：`URL_FILE_MAX_BYTES = 25*1024*1024`（service.js L65）与 `ATTACHMENT_FILE_MAX_BYTES = 25*1024*1024`（attachments.js L42）对齐 | 实读两文件 | 数值比对 |
| F-T10 | R10 P3×8（F-06~F-13）未被顺手改动：sessionId/at 仍记录（service.js L1993-1994）；`name` 仍为消毒后/去重后文件名（L2077）；纯点名/设备名处理逻辑未变（L2046）；媒体白名单未启用（L2029-2031 仅图片魔数）；type 缺失图片仍走 uploadFile 被魔数拒绝（client L3233-3235 + service L2029）；卡片 key 仍为 path（client L3352）；uploadFile 无超时（client L3294）；0 字节 INVALID_REQUEST（service L2016） | 实读两文件 | 逐项与 R10 F-06~F-13 位置比对 |

## 2. R10 findings 逐条闭环表（复审核心）

| R10 finding | 级别 | 修复方式（Developer 声明） | 实读验证结论 | 闭环判定 |
| --- | --- | --- | --- | --- |
| **F-01** draft 渲染期快照 RMW 竞态：多文件非图片丢失除最后项外全部路径文本；上传窗口内输入被旧快照覆盖 | P1 | uploadFile Promise 化 + Promise.all 并发 + 落定后一次 setDraft（draftRef 每渲染刷新为基） | 声明全部落地（F-T2）。**一次 setDraft 消除 N-1 项丢失**：全部上传落定后 `lines.join('\n')` 单次写入；失败文件 resolve(null) 被 filter 剔除不产生行（正确）。**draftRef 每渲染刷新**（L3274-3275）把输入竞态窗口从"整个 FileReader+RPC 往返（秒级）"压缩到"一次读-改-写微任务内"（L3340-3347 读 draftRef→setDraft 间无 await） | **已修复**（残余窗口量级评估见 §3.1，P3） |
| **F-02** 消毒文件名碰撞 → writeFileSync 静默覆盖 → M2 id↔bytes 完整性破坏 | P1 | O_EXCL 写（flag 'wx'）+ EEXIST 追加 `-<n>` 去重后缀重试（TOCTOU 免疫）；返回 writtenName | 声明落地（F-T3）。`wx` 原子打开保证并发同名双写时一胜一 EEXIST → 失败者走 `-1` 后缀（L2058-2059），两文件并存无覆盖；registerPath 读唯一 target 实际字节 → contentHashId 反映真实内容（F-T8）；writtenName 返回使卡片/draft 显示与实际落盘名一致（F-T10 关联 F-07） | **已修复**（去重循环上界为 P3 备注，见 §3.4） |
| **F-03** 全新会话首条消息即附件 → WORKSPACE_UNAVAILABLE；Developer 注释断言过强 | P2 | smoke 注释更正（L871-874）如实陈述"最近一次 run() 会话 cwd；全新会话首条消息前上传 → WORKSPACE_UNAVAILABLE" | service.js L1984-1989 旧断言"必然已至少运行过一次"已移除（F-T5）；smoke 注释如实（F-T5）；行为不变（fail-closed 明确报错成立） | **已修复** |
| **F-04** 解码前无大小预检：超大 base64 payload 先全额解码再拒 | P2 | decode 前粗筛 `dataBase64.length > ceil(25MB*4/3)+16` → FILE_TOO_LARGE | 声明落地（F-T4）。阈值数学核验（§3.3）：合法 ≤25MB 文件 base64 上界 34,952,536 < 阈值 34,952,550（余量 14 字符≈10 字节），无误伤；粗筛在解码/魔数之前（L2020 早于 L2025/L2029），超大载荷不再全额解码 | **已修复**（空白容忍边界为 P3 备注，见 §3.3） |
| **F-05** 测试判别力缺口：失败态"without card"断言非判别（全新实例恒真）；无 F-01/F-02 覆盖 | P2 | client-render 失败态改同一组件实例判别（先成功 1 卡再失败 → 卡片数保持 1 + 错误码可见） | 声明落地（F-T6）：`currentTree` 承接成功用例同实例，`failCards.length === 1` 判别"失败不追加卡片"（若失败路径误加卡 → 2 → fail）；`textOf.includes('FILE_TOO_LARGE')` 判别错误码可见；且本条为**1:1 更名**（L705 断言数不变） | **已修复** |
| F-06~F-13（P3 记录项） | P3 | 不在返工范围 | 全部确认未被顺手改动（F-T10） | 记录项保持 |

## 3. 复审重点专项分析

### 3.1 F-01 残余竞态量级评估（修复实质核验）

- **一次 setDraft 是否真正消除竞态**：是。`Promise.all` 落定 → `lines.join('\n')` → 单次 `setDraft`；读 `draftRef.current`（L3344）与 `setDraft`（L3345）之间无 `await`，读-改-写在同一微任务内原子完成，不存在"落定后读旧值"的异步窗口。
- **用户在 await 期间输入 → 残余窗口**：`draftRef.current` 每渲染刷新（L3275），用户输入触发宿主 draft 状态更新 → 组件重渲染 → draftRef 更新。残余窗口仅剩：① 用户击键已入 React 状态但**该次重渲染尚未 flush** 时微任务恰好读到旧 draftRef——亚毫秒级，需精确时序重合；② 两次连续 intake 并发（第一批上传未落定时再次选文件）→ 两个 Promise.all 各自落定，第二次 setDraft 的 draftRef 可能尚未含第一次已写行——同样微任务级窗口。两者均为 **V-DSH-2 无 draft 读取事件通道**约束下可达的最优（R10 建议①②均落实）。旧实现窗口为秒级且多文件必现，现为微任务级概率事件。
- **分级**：P3（记录项；理论残余，非阻塞）。修复后残余风险较 R10 降低 ≥3 个数量级，且无 V-DSH-2 之外的可行解法（宿主不提供 draft 变更订阅）。
- **失败文件（resolve null）不产生行**：正确（F-T2，L3301/L3341）；全部失败时 `lines.length === 0` → 直接 return 不触碰 draft（L3342）——行为正确。

### 3.2 F-02 并发安全与 registerPath 交互

- **O_EXCL + 去重循环并发安全**：`flag: 'wx'`（O_CREAT|O_EXCL）打开是原子操作——两个并发同名上传，一个成功创建，另一个必得 EEXIST → 走 `-1` 后缀重试。不存在"先检查后写"的 TOCTOU 空窗（检查与创建合一）。
- **去重后缀命名与 M2 registerPath 交互**：registerPath 接收的是**最终唯一 target**（join(dir, writtenName)），`fs.resolve` → `fs.readBytes` 重读该唯一文件实际字节 → `contentHashId(bytes)`（attachments.js L228）→ 每条目 id 与其物理文件字节严格对应（F-T8 证实 readBytes 补丁直达 registry）。两条目 workspacePath 各异、id 各异、bytes 各自正确——内容寻址承诺（D-1-4）恢复。
- **writtenName 返回与显示一致性**：响应 `name` = writtenName（如 `notes.docx-1`）→ 卡片 `[文档] notes.docx-1 → …/notes.docx-1` 与 draft 路径文本与实际磁盘文件一致（L2077 + client L3305-3307）。R10 F-07（name 为消毒名）在碰撞场景语义顺延为"去重后名"，仍仅展示影响，非新问题。
- **去重循环上界**：`for (let attempt = 1; ; attempt++)` 无显式上限——但每次迭代目标名唯一，最坏遍历 `name-1..name-k` 至首个空位，受磁盘文件数自然约束，不会死循环；异常（非 EEXIST）即返回 UPLOAD_FAILED fail-closed。**P3 备注**：极端同名文件堆积时循环次数线性增长，可加显式上限（如 100）防病态输入，非阻塞。

### 3.3 F-04 阈值数学核验

- URL_FILE_MAX_BYTES = 25 × 1024 × 1024 = **26,214,400 字节**（F-T9）。
- 合法 25MB 文件的 base64 长度上界 = `ceil(N/3) × 4` = `ceil(26214400/3) × 4` = 8,738,134 × 4 = **34,952,536 字符**。
- 实现阈值 = `Math.ceil(26214400 × 4/3) + 16` = `ceil(34,952,533.33) + 16` = 34,952,534 + 16 = **34,952,550 字符**。
- 34,952,536 < 34,952,550 → **余量 14 字符（≈10.5 字节）**：正好 25MB 的文件解码后经 L2032 字节级复查放行，粗筛无误伤。+16 覆盖了 base64 padding（最多 2 字符）与取整误差，数学成立。
- **P3 备注（空白容忍边界）**：粗筛按字符串长度计数，`atob`（decodeBase64 实现，service.js L448-453 区域）按 WHATWG 规范容忍 ASCII 空白——若外部调用方以换行/空白包裹 base64（如 76 字符折行编码），近上限文件可能被粗筛误伤（长度含空白 > 阈值而解码后 ≤25MB）。**当前唯一树内调用方 client.js L3293 传 `readAsDataURL` 产出（无换行的标准 base64），不触发**；属契约边界记录，非现路径缺陷。

### 3.4 测试判别力逐条推演（5 条新断言 + 1 条更名）

| 断言 | 位置 | 旧代码下必然失败的推演 | 判别力 |
| --- | --- | --- | --- |
| F-01 多文件一次 setDraft | client-render L732 | 旧实现逐文件 setDraft → 2 次调用 → `multiDrafts.length === 1` 必败；且末项覆盖前项 → `includes(notes.doc 行)` 必败 | ✅ 真判别 |
| F-02 碰撞去重 | smoke L902 | 旧实现覆盖写 → `secondDoc.name === 'notes.docx-1'` 与 `secondDoc.path === secondDocPath` 必败（旧返回 name='notes.docx'/path=原路径），`existsSync(secondDocPath)` 必败（文件不存在） | ✅ 真判别 |
| F-02 双条目字节正确 | smoke L903 | 旧实现覆盖写 → `firstDocPath` 内容被 [9,9,9] 覆盖 → `Buffer.compare(读 firstDocPath, [1,2,3])` 必败；byPath(secondDocPath) 必败 | ✅ 真判别（含真实读盘补丁，F-T8） |
| F-04 解码前预检 | smoke L914 | 旧实现先解码 `'!'×36MB` → atob 抛错 → INVALID_BASE64，`huge.code === 'FILE_TOO_LARGE'` 必败 | ✅ 真判别（长度 36,350,651 > 阈值 34,952,550 且 '!' 非法） |
| F-05 失败不追加卡片 | client-render L705 | 旧断言在全新实例上 `cards.length === 0` 恒真（非判别）；新断言同实例先 1 卡 → 若失败路径误加卡则 2 → 必败 | ✅ 真判别（1:1 更名，断言数不变） |

计数核对：新增断言 = F-02×2（smoke L902/L903）+ F-04×1（smoke L914）+ F-01×1（client-render L732）= **4 条**；F-05 为更名非新增 → 净 +4 与 F-T1 的 495=491+4 一致。

### 3.5 回归视野（修复是否引入新问题）

- **client.js 上传流程**：uploadFile 由"逐文件 setDraft"改为"返回 Promise + intake 统一落定"，唯一调用点即 intake（L3340）——无旁路调用遗留；`setCards` 仍逐文件函数式追加（L3306，卡片实时出现，draft 最后一次性写入——UI 与模型输入最终一致）；错误路径（remote 缺失 L3284-3286、onerror L3313、RPC failure L3308-3311）均 resolve(null) 且不触碰 draft——fail-safe 成立。
- **service.js 写盘路径**：O_EXCL 写使"目标已存在"从覆盖改为去重，行为变更方向正确（防数据破坏）；对"用户重选同一文件"场景（F-11 关联），现去重后路径不同 → 卡片 key（L3352 基于 path）不再重复 → **F-11 的 key 冲突警告被顺带缓解**（正向副作用）；mkdirSync 递归（L2040）与去重写顺序无竞态（目录先建后写）。
- **校验序列顺序变化**：粗筛（L2020）插在解码/魔数之前——超大载荷优先 FILE_TOO_LARGE 而非 UNSUPPORTED_MEDIA/INVALID_BASE64，语义合理（文件确实超限）且 smoke L914 明示该顺序为设计意图；§4.3.5 校验序列（base64→魔数→大小）在"合法载荷"路径上顺序未变。
- **测试侧**：smoke F-02 用例的 readBytes 补丁 try/finally 恢复（L898）无泄漏；tmpdir 清理（L924-935）沿用既有模式。client-render 多文件用例经 `settle()` 多轮微任务排空（L150-164），Promise.all + queueMicrotask FileReader（L190-196）时序兼容。

## 4. 硬门槛裁决

| 门槛项 | 阈值 | 结果 |
| --- | --- | --- |
| R10 F-01~F-05 逐条闭环判定 | 全部判定 | ✅ 5/5 已修复（§2），P3×8 记录项确认未动（F-T10） |
| 每条发现标注级别 P0~P3 | 100% | ✅ 新发现 4 项全部 P3（§5） |
| 事实红线 | 未验证显式标注 | ✅ 测试运行事实（F-T1）标注 Coordinator 提供未复跑；其余全部实读/推演核验 |

## 5. 新发现列表（R11 回归视野）

- **N-01（P3）** F-01 残余微任务窗口：用户击键已入状态但重渲染未 flush 时，或两次 intake 并发时，setDraft 基值可能差一次渲染（V-DSH-2 无 draft 读取事件通道下的理论残余；旧实现秒级必现 → 现为亚毫秒概率）。位置 client.js L3344-3345。记录不改。
- **N-02（P3）** F-04 粗筛按字符串长度计，未剥离 base64 空白——对空白折行编码的近上限载荷理论误伤（树内客户端不折行，不触发）。位置 service.js L2020。记录不改。
- **N-03（P3）** F-02 去重循环无显式上限（`for (let attempt = 1; ; attempt++)`），病态同名堆积时线性增长；受磁盘文件数自然约束不会死循环，可加显式上限如 100 更稳。位置 service.js L2052-2064。记录不改。
- **N-04（P3，正向）** F-02 去重使同名重传路径唯一 → client 卡片 key（L3352，基于 path）不再冲突，R10 F-11（P3）的 React key 警告被顺带缓解。记录。

## 6. 终态

**APPROVED_WITH_NOTES** — `unresolved_blockers=0`

- R10 F-01~F-05 全部闭环（5/5 已修复），修复方式与 Developer 声明逐条实读一致（F-T2~F-T6），新断言判别力逐条推演成立且旧代码下必败（§3.4），净 +4 断言与 Coordinator 的 495 ok 计数吻合（F-T1）。
- 修复实质核验：F-01 一次 setDraft 消除多文件丢失 + draftRef 刷新把输入竞态压至微任务级（§3.1）；F-02 O_EXCL+去重恢复内容寻址完整性且 TOCTOU 免疫（§3.2）；F-04 阈值数学无误伤（§3.3）；F-03 注释如实、F-05 同实例判别（§2）。
- 无新引入 BLOCKING 问题；回归视野仅 4 项 P3（§5），均记录不改。
- 备注（Notes）：
  1. N-01~N-03 为 V-DSH-2 约束/契约边界下的理论残余，可遗留；如未来宿主开放 draft 变更订阅或 base64 规范收紧，可再评估。
  2. N-04 为 F-02 修复的正向副作用，无需动作。
  3. R10 的 F-06~F-13（P3 记录项）维持原状，未因本轮返工改变。
  4. 测试运行事实（F-T1）未由本 Reviewer 亲自复跑——依协议以 Coordinator 提供的事实为准；如需要，Coordinator 可复核。
