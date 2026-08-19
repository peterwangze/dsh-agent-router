# MIG-001 R9 — Step 7 独立代码审查报告（Code Reviewer）

- **Round**: R9（Step 7 单元首审；审查链 R1-R8 已覆盖 Step 0-6 并全部通过）
- **审查对象**: 未提交变更集 — 6 文件 +289/-37：`lib/schemas.js`（MODALITY_VALUES/MODALITY_DIRECTIONS/normalizeCapabilities + catalogResult modalities wire 字段）/ `lib/service.js`（MODALITY_DEFAULT_MAP + modalityOfAgent + listAgentsByModality + resolveAttachmentIds + catalog modalities）/ `lib/wrapper.js`（MODALITY_ENTRIES audio/video 占位条目）/ `lib/tool.js`（attachmentIds 参数 + 描述 + execute 合并）/ `lib/prestep.js`（R8-F-01 顺序修正 + F-04 措辞 + modalityState 按名查找）/ `tests/smoke.mjs`（27 新断言 + 3 修改断言）
- **审查者**: software-project-governance-code-reviewer（只读审查 + git read-only diff 取证；未运行测试、未执行写操作）
- **审查日期**: 本会话
- **终态**: `APPROVED_WITH_NOTES`
- **独立结构字段**: `unresolved_blockers=0`

---

## 0. 审查范围与执行方式

- 依据：实读六变更文件全文（schemas.js 565 行 / wrapper.js 469 行 / prestep.js 235 行 / tool.js 219 行 / attachments.js 488 行 / service.js 相关段 L470-520、L640-700、L700-745、L1580-1655、L1720-1840、L1905-2010、L2320-2410）+ 完整 git diff（read-only 实跑）+ 设计契约实读（`docs/architecture-v3.md` §4.3.2 L281-301、§4.3.4 L317-330、§8 L767-792）+ R8 报告 F-01/F-04 + 执行包 `.governance/execution-packets.json` + 消费方扫描（grep listImageVisionAgents/listImageGenerationAgents/listAgentsByModality/modalityOfAgent/enabledModalities/resolveMainModelModalities）。
- 测试运行事实由 Coordinator 提供（本 Reviewer 无 Bash 权限，未亲自复跑，见事实依据表 F2）。
- 未修改任何产品代码；唯一写入为本报告。

## 1. 事实依据表（可复查事实）

| # | 事实 | 来源 | 验证方式 |
| --- | --- | --- | --- |
| F1 | 恰 6 文件变更：schemas/service/wrapper/tool/prestep/smoke，+289/-37；无 client.js/rpc.js/index.js（Step 8/9 范围外） | `git status --short` + `git diff --stat`（read-only 实跑） | 逐 hunk 核对；与任务简报附录一致 |
| F2 | `node tests/smoke.mjs` → exit 0，`ALL SMOKE TESTS PASSED`，469 ok / 0 FAIL（442 既有零回退 + 27 新增），client-render/install-entry/attachments 子套件全绿 | Coordinator 独立复跑 | **未亲自复跑**（无 Bash 权限，依协议以 Coordinator 事实为准） |
| F3 | MODALITY_VALUES = ['image','audio','video','text','file'] 与 §4.3.2 Modality 联合类型一致（schemas.js L34） | 实读 | 枚举逐项比对 ✅ |
| F4 | normalizeCapabilities 拆分 known ⊆ MODALITY_VALUES / unknown 兼容放行（R-5 语义）；非数组/非字符串容错（schemas.js L44-53） | 实读 | 未知值（translate/web）不进矩阵，仍留提示面 ✅ |
| F5 | catalogResult 每 agent `modalities` 为可选对象（`v.object(..., true)`）+ wire codec 未知字段透传（check() 只校验已知属性）→ 新旧双向兼容（schemas.js L317-320 / L222-228） | 实读 | 旧 codec 收新 payload：未知字段透传 ✅；新 codec 收旧 payload：modalities 缺省放行 ✅ |
| F6 | MODALITY_DEFAULT_MAP 五类型默认映射（service.js L52-64）：chat {text,text} / agent {file,text} / cli {file,text+file} / image {∅,image} / speech {audio,text} | 实读 | 与 §4.3.2 表逐行比对：仅 image-consume 行漂移 → F-11（P3） |
| F7 | modalityOfAgent：默认映射 + capabilities 覆盖（chat/agent→consume、cli→produce、image/speech 固定）；返回按 MODALITY_VALUES 规范序去重（service.js L1922-1936） | 实读 | Set 运算 + filter 规范序 ✅；未知类型回落 chat（normalizeType L649-651）✅ |
| F8 | 目录等价性：旧 listImageVisionAgents（chat/agent + image cap）≡ 新 consume-image；旧 listImageGenerationAgents（image 类型 ∥ cli+image cap）≡ 新 produce-image | 实读旧实现（git diff 上下文）+ 新实现（L1960-1973）+ smoke L763-766 | 结构推演等价 + smoke 断言双印证 ✅ |
| F9 | runImage 无图片输入处理（L1583-1644 纯文生图，body 不含 images）→ image 类型 consume:[] 如实反映运行时 | 实读 | 支持裁量 1（F-11 P3） |
| F10 | resolveAttachmentIds：isAttachmentId 守卫（/^sha256:[0-9a-f]{64}$/i，attachments.js L33/L70-72）、列表内去重、registry.resolve → byId 懒注册降级（attachments.js L323-333/L414-421）、失败 ATTACHMENT_UNKNOWN、exec 可缺省（service.js L1788-1814） | 实读两文件 | 错误路径（非法格式/未知 id）消息语义与 smoke 断言匹配 ✅ |
| F11 | tool.js 合并：`[...images, ...byId].filter(去重键 attachmentId ?? id)`；selectAttachments ref 恒带 attachmentId/id（L1722-1776）；与 attachments/includeImages 正交 | 实读 | 跨通道同 id 只派发一次（smoke 断言验证）✅；无键 ref 被丢弃为防御性边缘 → F-13（P3） |
| F12 | prestep F-01 修正：图片存在性判定先于 modalityState（L186-194）；单次 requestHasModality(claimed) 与逐消息 some() 等价（wrapper.js L214-227 遍历全部消息含 tool-result 嵌套） | 实读 | 四情形（纯文本/含图+state/含图+无state/空claimed）门控语义与 R8 版一致 ✅ |
| F13 | F-04 措辞：collectReminder 在 ids 非空时追加 "或 attachmentIds 传 [...]"（prestep L54-56）；工具描述双行 + 参数描述全覆盖（tool.js L64-65/L91-95） | 实读 | attachmentIds 已落地为真实参数 → 提及非幻觉（R8-F-04 闭环）✅ |
| F14 | modalityState 按名查找 MODALITY_ENTRIES.find(modality==='image')（prestep L111-112），不依赖 [0] 下标 | 实读 | Step 7 泛化后健壮 ✅ |
| F15 | MODALITY_ENTRIES 占位安全：sync 先 map stateOf 再 filter(state!==null)（wrapper L429-431）；marker/rewrite 仅对 active 条目访问（L189-193/L69-75）；包装路由 inputModalities 仍 ['text','image']（L297/L309） | 实读 | audio/video 恒 null → 永不进入 active → 零副作用 ✅ |
| F16 | enabledModalities / resolveMainModelModalities 无实现且无任何消费方（grep 全仓库：仅 docs/architecture-v3.md 提及） | grep 实跑 | 实现即死代码 → 裁量 2 成立 ✅ |
| F17 | 新断言计数：schemas 4 + catalog 1 + matrix 12 + attachmentIds 5 + tool 合并 2 + MODALITY_ENTRIES 3 = **27**；修改断言 3（tool 参数 schema L878 / reminder L1396 / collectReminder L1424）；promptText 断言 L420 `!text.includes('attachmentIds')` 保持 | 实读 + 逐条计数 | 与简报"27 新断言"、F2"469 = 442 + 27"一致 ✅ |
| F18 | 执行包内部矛盾：goal/done_definition 点名 "顺带 R8-F-01（modalityState 门控前性能）"（位于 prestep.js），而 scope_guard/allowed_change_scope 未列 prestep.js（execution-packets.json L9/L67/L93） | 实读执行包 | 按 goal 裁量（非 Developer 违规）→ F-18（P3 注记） |

## 2. 审查重点逐项结论

| 重点 | 结论 | 依据 |
| --- | --- | --- |
| 矩阵正确性（modalityOfAgent 默认映射 + 覆盖逻辑 + 规范序去重） | ✅ 正确 | F6/F7：五类型默认映射与 §4.3.2 表一致（除 image-consume 漂移，F-11）；覆盖方向规则清晰；Set + MODALITY_VALUES.filter 规范序去重；未知类型回落 chat、未知能力不进矩阵（F4） |
| listImageVisionAgents/listImageGenerationAgents 薄包装行为等价 | ✅ 等价 | F8：旧实现语义与新矩阵逐项等价（chat/agent+image cap ↔ consume-image；image 类型 ∥ cli+image cap ↔ produce-image）；smoke 断言（consume=vision 列表、produce=generation 列表）锁定等价性；唯一消费方为 wrapper 门控（L361-362）+ prestep（经 stateOf） |
| attachmentIds 解析错误路径（非法格式/未知 id/exec 缺省） | ✅ 正确 | F10：非法格式（含 trim 后）→ 明确报错；未知 id（宿主 readImage 失败）→ "附件不可解析"；exec 缺省 → cwd/sessionId 空串仍可解析（id 分支不依赖路径）；列表内去重保序 |
| tool 去重并集逻辑（跨通道同 id 一次） | ✅ 正确 | F11：并集 + 去重键 attachmentId ?? id；跨通道同 id 只派发一次（smoke 'route_agent attachmentIds dedupe across channels' 断言 1 条）；与 attachments/includeImages 正交（selectAttachments 与 byId 独立解析） |
| 占位条目安全性（audio/video stateOf 恒 null 不激活） | ✅ 安全 | F15：sync filter 先于 marker/rewrite 访问；active 仅含 image → 声明聚合、改写分发、门控全部不受占位影响；prestep 按名查找不受条目序影响（F14） |
| catalog wire 兼容（modalities 可选字段） | ✅ 兼容 | F5：服务端恒带 modalities（service.js L2390）、codec 可选 + 透传 → 新旧双向兼容 |
| R8-F-01 修复正确性（顺序调整后门控语义不变） | ✅ 正确 | F12：纯文本轮提前返回（零 registry 遍历）；含图轮仍取 state；四情形与 R8 版门控语义逐一对齐；既有 prestep 断言 ①-⑦ 全绿（F2） |
| 测试判别力（27 新断言） | ✅ 合格 | F17：矩阵形状/方向（consume vs produce 判别）、目录等价性（薄包装回归锁定）、解析错误路径（非法格式 + ATTACHMENT_UNKNOWN + 缺 exec）、列表内去重、跨通道去重、占位不激活（stateOf null）均有真实判别；两处轻微缺口 → F-17（P3） |
| 性能（modalityOfAgent 每 agent 新建 Set） | ⚠️ 可接受 | R8-F-01 已消除纯文本步 registry 遍历（F12）；矩阵查询频率低（图片轮门控/settings 变更/catalog 调用），agent 数量级小 → F-16（P3）非热点 |
| 范围（6 文件 vs 执行包） | ✅ 最小必要 | F18：prestep 3 处改动（F-01 顺序修正/F-04 措辞/按名查找）均为 Step 7 或 R8 排期义务，无顺带修改；无 Step 8/9 文件（client.js/rpc.js 未动） |

## 3. 设计一致性表（§8 Step 7 + §4.3.2 + §4.3.4 + R8 闭环）

| 契约项 | 契约要求 | 实现 | 一致性 |
| --- | --- | --- | --- |
| §8 Step 7 行（L778）capabilities 枚举化 | capabilities 枚举 + 方向语义 | MODALITY_VALUES / MODALITY_DIRECTIONS / normalizeCapabilities（schemas.js L34-53）；modalityOfAgent 方向覆盖（F7） | ✅ |
| §8 Step 7 行 listAgentsByModality 泛化 | 模态×方向目录泛化 | listAgentsByModality(modality, direction='consume')（L1943-1951）；vision/generation 薄包装（L1960-1973） | ✅ |
| §8 Step 7 行 MODALITY_ENTRIES 泛化（audio/video 占位） | 条目占位，新增模态不改骨架 | audio/video 占位条目（wrapper L373-389）；sync 结构不变（F15） | ✅ |
| §8 Step 7 行 route_agent attachmentIds 参数 | 参数 + 调用用例 | 工具 schema + 描述 + execute 合并（tool.js L91-95/L64-65/L153-163） | ✅ |
| §8 Step 7 行 测试（smoke.mjs:785 断言更新） | attachmentIds 允许 | 'tool parameters schema' 断言改 require attachmentIds（L878） | ✅ |
| §8 Step 7 行 回滚（参数/枚举回滚，自由字符串仍兼容） | 可回滚 | capabilities 未知值兼容放行（F4）；工具 schema 新增字段可回退；attachmentIds 仅工具面 | ✅ |
| §4.3.2 M5 接口 | listAgentsByModality / modalityOfAgent 签名 | 两方法签名与接口一致（F6/F7） | ✅ |
| §4.3.2 enabledModalities / resolveMainModelModalities | 设计声明 | 未实现——无消费方（F16），§8 行未要求 | ⚠️ 裁量 2（见下表） |
| §4.3.2 默认映射表（5 行） | chat/agent/cli/image/speech 默认能力 | 五类型映射一致；仅 image-consume 行未实现 | ⚠️ 裁量 1（见下表，F-11） |
| §4.3.4 attachmentIds（N-8） | string[] 每项 /^sha256:/；未知 id 报错；跨轮指代 | isAttachmentId 守卫 + ATTACHMENT_UNKNOWN 语义 + 记忆段 id 精确再查（F10） | ✅ |
| R8-F-01（性能） | modalityState 后移 + 单次 requestHasModality | prestep L186-194 顺序修正 + 单次调用（F12） | ✅ 闭环 |
| R8-F-04（reminder 措辞） | Step 7 落地时同步 attachmentIds 措辞 | collectReminder 双通路措辞（F13） | ✅ 闭环 |
| R8-F-02（测试缺口） | context 追加映射 / reject / fail-safe 未测 | 本批未覆盖（dispatch fallback 仍为 `[...messages]`） | 顺延（P2 遗留，与 R8 声明一致） |

**五处设计记录裁量**：

| # | Developer 记录 | 裁量结论 |
| --- | --- | --- |
| 1 | 方向语义推导（chat/agent→consume；cli→produce；image/speech 固定） | ✅ 采纳。§4.3.2 表支持 chat（"如 image 需显式 cap"）、cli（produce text/文件 + 旧语义 cli+image=生图）、speech（固定）三行；image 行"consume image（编辑/参考输入，cap）"未实现，但运行时不支持 image 类型图片输入（F9：runImage 纯文生图、忽略 images），consume:[] 如实反映运行时且与旧行为（R8 F14 排除 image 类型出视觉目录）一致 → 属合理最小充分实现；设计表该行为前瞻性声明，记录 P3（F-11）待 Step 8/9 image-to-image 落地时复核 |
| 2 | enabledModalities / resolveMainModelModalities 未实现（无消费方，实现即死代码） | ✅ 成立。F16：全仓库 grep 无实现无消费方（仅设计文档提及）；§8 Step 7 行未要求；当前门控经 MODALITY_ENTRIES stateOf 单点覆盖（等价 enabledModalities 语义）。不违反无过度实现 |
| 3 | "新 wire codec"落地为 catalogResult 每 agent 可选 modalities 字段 | ✅ 一致。ModalityCapability {consume, produce} 形状与 §4.3.2 接口一致；可选字段 + 透传 codec 双向兼容（F5）；§8 行措辞"新 wire codec"未定义具体形状，落地为目录 wire 面属合理解读（uploadFile/readWorkspaceFile 的 RPC codec 为 Step 5c/8/9 范畴，本步不含） |
| 4 | prestep 范围外 3 处（F-01 顺序修正/F-04 措辞/modalityState 按名查找，+22/-11） | ✅ 最小必要。F-01 为执行包 goal/done_definition 点名义务（F18）；F-04 为 R8 注 3 排期 Step 7；按名查找为 Step 7 MODALITY_ENTRIES 泛化的健壮性配套（2 行级）；diff 无任何顺带修改。scope 清单与 goal 的矛盾属执行包内部问题（F-18），非 Developer 违规 |
| 5 | promptText 使用规则未加 attachmentIds（保持零回退；attachmentIds 只进工具描述） | ✅ 权衡成立。smoke L420 断言强制 `!text.includes('attachmentIds')`（F17）——加入即破坏既有断言，违反"既有断言零回退"；工具描述（L64-65）+ 参数描述（L91-95）已完整承载 attachmentIds 语义（主 agent 调用时可见）；§8 行未要求 promptText 变更。遗留轻微措辞陈旧 → F-15（P3） |

## 4. 五维度结论

| 维度 | 结论 | 说明 |
| --- | --- | --- |
| ① 正确性 | ✅ 通过 | 矩阵默认映射/覆盖/规范序去重正确（F6/F7）；目录薄包装行为等价（F8）；attachmentIds 解析与错误路径正确（F10）；tool 并集去重正确（F11）；F-01 顺序修正门控语义不变（F12）；占位条目零副作用（F15）；catalog wire 双向兼容（F5） |
| ② 安全性 | ✅ 通过 | attachmentIds 输入严格内容寻址校验（无注入/路径穿越面）；未知 id 明确报错不静默（§4.3.4 语义）；解析路径只读（懒注册经宿主 readImage，不落盘不写工作区）；无新增密钥/权限面；注册表 LRU 有界（200 条） |
| ③ 可维护性 | ✅ 通过 | MODALITY_DEFAULT_MAP 每类型注释含依据；矩阵单点化后 vision/generation 变薄包装；normalizeCapabilities 单一实现复用；注释引用设计节号；无死代码（F16）；轻微项：resolveAttachmentIds 错误不带 error.code（F-12）、promptText 措辞陈旧（F-15） |
| ④ 性能 | ✅ 通过 | R8-F-01 达成：纯文本步只付 content 扫描、零 registry 遍历（F12）；modalityOfAgent 每查询每 agent 新建 Set——agent 数量级小、频率低（图片轮门控/settings 变更/catalog），非热点（F-16 P3）；resolveAttachmentIds 列表内 Set 去重、注册后命中免宿主读 |
| ⑤ 测试覆盖 | ✅ 通过（2 项 P3 轻微缺口） | 27 新断言覆盖矩阵形状/方向/目录等价/解析错误路径/去重/占位（F17），判别力合格；既有 442 断言零回退（F2）；轻微缺口：tool 层非法 attachmentIds 未直接断言（service 层已覆盖异常语义）、session.sid/id 真实形状未验证（F-14）、audio/video produce 方向无断言（无对应夹具）→ F-17（P3）；R8-F-02 顺延（P2 遗留） |

## 5. 发现列表

### P0（阻塞）— 0 项
无。

### P1（关键）— 0 项
无。

### P2（建议，可遗留）— 0 项新增
- 遗留：R8-F-02（宿主 context 追加 decision 映射 / reject 透传 / fail-safe 未测）按 R8 计划顺延，不在本批范围（本批 dispatch fallback 未变更）。

### P3（讨论/记录）— 8 项
- **F-11** 设计表漂移：§4.3.2 默认映射表 image 行"consume image（编辑/参考输入，cap）"未实现（实现 consume: []，image/speech 能力集固定）。
  - 位置：`lib/service.js` L52-64（MODALITY_DEFAULT_MAP）+ L1928-1931（覆盖方向规则）。
  - 事实：runImage 无图片输入处理（F9），consume:[] 如实反映运行时；旧行为（R8 F14）同样排除 image 类型出视觉目录。
  - 影响：catalog modalities wire 面报告 image 类型 consume:[]——对"识别流程误交生图端点"是安全语义；对"图生图编辑输入"是能力缺口（设计前瞻）。
  - 建议：记录不改；Step 8/9 若落地 image-to-image 输入，需同步复核矩阵（image 类型 consume 是否随 cap 开放）与 runImage 图片输入处理。
- **F-12** resolveAttachmentIds 错误未带 error.code：§4.3.1 错误码风格（INVALID_ATTACHMENT_ID / ATTACHMENT_UNKNOWN）未附加。
  - 位置：`lib/service.js` L1796/L1801。
  - 事实：抛普通 Error，消息语义完整（smoke 断言消息文本）；工具错误以文本呈现，无结构消费方。
  - 建议：可选——`attachmentError(code, msg)` 附加 code 便于统一诊断；非阻塞。
- **F-13** tool 合并去重丢弃无 attachmentId/id 的遗留 ref（仅当 attachmentIds 提供时触发）。
  - 位置：`lib/tool.js` L157-162（`if (!key || seen.has(key)) return false`）。
  - 事实：selectAttachments ref 取自 block.attachment（恒带 id/attachmentId，F11），byId ref 恒带 attachmentId——实践中无键 ref 不会出现；防御性丢弃合理。
  - 建议：记录不改；若未来出现无键 ref 通道需显式处理。
- **F-14** session.sid / session.id 宿主字段形状未验证：resolveAttachmentIds 的 sessionId 提取分支（`sid ?? id`）未被真实宿主形状证实。
  - 位置：`lib/service.js` L1791。
  - 事实：测试 fixture 仅提供 header.cwd（L824），sid/id 均未赋值；且 sessionId 在 resolve→byId 路径无实际作用（byId 不使用 sessionId，仅 materialize 缓存键使用）。
  - 影响：无功能影响（sessionId 为空串时行为不变）；**未验证标注**，若后续 materialize 链路依赖需复核。
- **F-15** promptText 使用规则"两者都不给"措辞陈旧：attachmentIds 为第三通道但未列入 promptText。
  - 位置：`lib/service.js` L2366。
  - 事实：L420 断言强制 `!text.includes('attachmentIds')`（F17）；工具描述（L64-65）与参数描述（L91-95）已完整覆盖 attachmentIds；§8 行未要求 promptText 变更。
  - 建议：记录不改（零回退权衡，裁量 5）；如未来重构 promptText 断言可顺带补齐。
- **F-16** modalityOfAgent 每次调用新建 Set（listAgentsByModality 每 agent 调用）。
  - 位置：`lib/service.js` L1926-1931。
  - 事实：R8-F-01 后矩阵查询仅发生在图片轮门控/settings 变更/catalog 调用；agent 数量级（<50）下开销可忽略。
  - 建议：记录不改；若未来矩阵高频查询（如目录轮询）可加 memo 或预计算。
- **F-17** 测试轻微缺口：tool 层非法 attachmentIds 未直接断言；listAgentsByModality('audio'/'video','produce') 未断言；attachmentIds 与 attachments 序号合并（非 includeImages）未断言。
  - 位置：`tests/smoke.mjs` L822-842 / L755-769 / L900-940。
  - 事实：service 层已覆盖非法格式/未知 id 异常语义（tool 层仅透传，等价）；audio/video 无 produce 夹具（矩阵无此类 agent）；attachments 序号+attachmentIds 组合与 includeImages+attachmentIds 组合共用同一合并路径（selectAttachments 输出同形状 ref）。
  - 影响：无（判别力已在合格线以上）；可顺延补强。
- **F-18** 执行包范围注记：scope_guard/allowed_change_scope 未列 prestep.js，但 goal 与 done_definition 点名 R8-F-01（位于 prestep.js）。
  - 位置：`.governance/execution-packets.json` L9（goal）/L67（scope_guard）/L93（allowed_change_scope）。
  - 事实：包内自相矛盾；按 goal + done_definition 裁量，prestep 3 处改动（F-01/F-04/按名查找）均为义务性最小改动（裁量 4）。
  - 建议：Coordinator 在收尾时同步执行包（scope 清单补 prestep.js 或注明 F-01 例外），避免后续步骤复用错误范围。

## 6. AI 生成代码专项 5 项检查

| # | 检查项 | 结果 | 依据 |
| --- | --- | --- | --- |
| 1 | mock 残留 | ✅ 无 | 生产代码无 mock/stub；smoke 中 fakeRouter2/attachmentsSvc.readImage 猴补丁为测试夹具（readImage 补丁后立即恢复 L838，恢复先于断言，无泄漏路径） |
| 2 | 硬编码返回值 | ✅ 无 | resolveAttachmentIds ref 由注册表条目参数化；mediaType 'image/png' / bytes 0 为防御性缺省值（有守卫），非写死结果 |
| 3 | 幻觉 API 调用 | ✅ 无 | isAttachmentId / registry.resolve / MODALITY_VALUES / normalizeCapabilities / normalizeType / listEnabledAgents 全部实存；session.header.cwd 与既有 resolveInputFiles（service.js L738）同源先例；session.sid/id 为防御性提取（F-14 已标注未验证）；无虚构 API |
| 4 | 未实现 TODO | ✅ 无 | 无 TODO/FIXME；注释中的 Step 8/9/10 与 V-DSH-3/4 为设计次序陈述非占位 |
| 5 | 过度实现 | ✅ 无 | audio/video 占位条目为 §8 Step 7 行明示要求（非过度）；enabledModalities/resolveMainModelModalities 正确未实现（F16，裁量 2）；无提前实现 Step 8/9 行为（client.js/rpc.js 未动） |

## 7. 硬门槛裁决

| 门槛项 | 阈值 | 结果 |
| --- | --- | --- |
| P0 阻塞问题数 = 0 | = 0 | ✅ 0 |
| 5 维度全覆盖 = 100% | 逐一有结论 | ✅ 5/5（§4） |
| 每条发现标注级别 = 100% | P0~P3 | ✅ 8 条 P3 全部标注（F-11~F-18）；P0/P1 = 0；P2 新增 = 0（R8-F-02 顺延遗留） |
| 设计一致性检查完成 | §8 Step 7 行 + §4.3.2 实读 + §4.3.4 + R8-F-01/F-04 闭环 + 五处裁量 | ✅（§3） |
| AI 专项 5 项完成 | 5/5 | ✅（§6） |
| 事实红线 | 未验证项显式标注 | ✅ 测试运行事实（F2）标注 Coordinator 提供未亲自复跑；session.sid/id（F-14）显式标注未验证；执行包矛盾（F18）显式注记 |

## 8. 终态

**APPROVED_WITH_NOTES** — `unresolved_blockers=0`

- P0 = 0，P1 = 0，P2 新增 = 0（R8-F-02 按计划顺延），P3 = 8（记录项）。
- 依据：Step 7 五要素（capabilities 枚举化 + 方向语义 / listAgentsByModality 泛化 / MODALITY_ENTRIES audio/video 占位 / attachmentIds 参数 + M2 解析 / catalog modalities wire 字段）全部实现且与 §8 Step 7 行、§4.3.2、§4.3.4 逐条一致；目录薄包装行为等价经结构推演 + smoke 断言双印证（F8）；R8-F-01/F-04 双闭环（F12/F13）；占位条目经 sync filter 证明零副作用（F15）；catalog wire 双向兼容（F5）；五处设计裁量全部采纳（§3）；AI 专项 5 项全过；27 新断言判别力合格、既有 442 断言零回退（F2）。
- 备注（Notes）：
  1. F-11（image-consume 设计表漂移）：运行时无 image-to-image 输入，矩阵如实反映；Step 8/9 落地图生图输入时复核。
  2. F-18：执行包 scope 清单与 goal 矛盾（prestep.js 未列但 F-01 在彼）——建议 Coordinator 收尾时同步执行包。
  3. R8-F-02（context 追加映射/reject/fail-safe 测试缺口）继续顺延，属既有 P2 遗留。
  4. F-12/F-13/F-15/F-16/F-17 均为 P3 记录项，不要求修改。
- 测试运行事实（F2）未由本 Reviewer 亲自复跑——依协议以 Coordinator 提供的事实为准；如需要，Coordinator 可复核。
