# Review — EVO-009 R0（ChatGPT OAuth 账号注册为主模型 provider）

- **Round**: R0
- **Task**: EVO-009 — ChatGPT 订阅 OAuth 账号注册为宿主 llm provider（主 agent 模型选择器直选）
- **Commits**: `01729a2`（lib/oauth-llm.js 新增 455 行 + lib/index.js 装配 + lib/service.js export 缝 + tests/oauth-main-model.mjs 250 行）/ `bc500f7`（package.json files +1）
- **审查者**: Code Reviewer（R0）
- **日期**: 2026-08-30
- **范围说明**: 无命令面；diff 以任务书指定变更点 + 当前文件状态重建；宿主契约全部直接读取 npx 缓存宿主源码逐行核验（非采信转述）；全量门控采信 Coordinator 证据（16/16 套件 exit 0，oauth-main-model 29 断言；npm pack 13/13 采信 Developer 输出）。

## 宿主 llm 契约核验专节（关注点 1，全部逐行实测）

| 契约面 | 宿主证据（`@deepseek-ai/dsh-llm/lib/index.js` 等，直接读取） | oauth-llm.js 对照 | 结论 |
|---|---|---|---|
| LlmAdapter 六方法 | :1073-1132（providerInfo/providerRetryPolicy/listModels/resolveModel/prepareCall/stream 默认实现与 JSDoc） | :277-296 六方法全实现；prepareCall 与宿主默认同构（`{ model: await resolveModel(...), stream: (options) => this.stream(options) }`） | ✓ |
| registerAdapter 契约 | :1174-1192（all-or-nothing、disposer、handle.replace）；:1205-1206 providerInfo 校验（id 恒等 + name 非空） | :435 `registerAdapter([OAUTH_PROVIDER], createOauthAdapter(...))`；providerInfo 返回 `{ id: route, name: 'ChatGPT 订阅' }` | ✓ |
| 注销语义 | :1180-1185（dispose → adapters.delete + emitAdaptersUpdated） | :426-430 注销容错 + handles.delete | ✓ |
| prepareCall 消费链 | :1496-1526（LlmRuntime.prepareCall → adapter.prepareCall → normalizeModelInfo → 一次性 dispatch 校验 :1515-1516） | prepareCall 显式实现（FIX-001 教训，测试 CAT-5） | ✓ |
| adapterStream 边界 | :1559-1624（未 prepared 时调 adapter.prepareCall :1568；抛错 → adapterFailureChunk → finish(error) :1593-1595/:1607-1611；image projection 仅在 inputModalities 不含 image 时触发 :1585-1591；消费者提前中断 → iterator.return :1618-1623） | stream 内 throw → 宿主转 finish(error)（ERR-1 断言）；resolveModel 声明 image → 不触发投影 ✓ | ✓ |
| BlockAssembler 词汇表 | :842-884（block-start{index,blockType}/text-delta{index,text}/tool-call-delta{index,id,name,argumentsDelta}/block-end{index,block}/usage{usage}/finish{reason}） | :369-381 发射逐字段匹配（含 argumentsDelta 字段名） | ✓ |
| normalizeModelInfo 校验 | :1405-1443（resolved.provider 必须 = 注册路由、id 必须 = 请求模型、name 非空、inputModalities detach、reasoning 校验） | resolveModel 返回 `{ provider: OAUTH_PROVIDER, id: model, name: model, inputModalities }` 全满足 | ✓ |
| resolveModelInfo 消费链 | :1397-1403（→ adapter.resolveModel）；apiproxy :2755 prompt 准入（inputModalities 不含 image → MODEL_DOES_NOT_SUPPORT_IMAGES） | resolveModel 声明 ['text','image'] → 带图准入放行（CAT-4） | ✓ |
| listModels 消费链 | dsh-llm :1372-1373；apiproxy buildModelCatalog :1010-1054（每条目调 resolveModelInfo；provider 失败 → failures 条目不击穿） | listModels 纯内存（保序去重并集）；resolveModel 同步纯函数零 I/O | ✓ |
| agent-loop 调用面 | dsh-agent-loop :708-762（prepareCall(proposedConfig) → :617 stream(request)；request = {config, messages, system?, tools?, sessionId, signal}） | stream options 读 model/system/messages/tools/signal（:307/:313-315/:341）全部对齐 | ✓ |
| tools 形状 | dsh-tools :2924-2930（{name, description, parameters} 投影） | mapTools :201-216 同形状消费 | ✓ |
| tool-result 块形状 | dsh-llm createToolResultMessage :202-215（`{type:'tool-result', toolCallId, content, isError}`，role user，source.kind='tool'） | :160-165 读 toolCallId + content（isError 不读——Responses API 无此字段，错误经 output 文本表达，可接受） | ✓ |
| 重试语义 | :356-366（DEFAULT_RETRYABLE_CODES = EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT）；harnessErrorCode :537-539（普通 Error → 'UNKNOWN'） | oauth-llm 全部错误为普通 Error（code UNKNOWN）→ 不触发默认重试 → 无重复计费（注释「错误语义由 stream 内聚合负责」成立） | ✓ |
| **attributionHeaders 契约** | :1069-1070 契约注释「Every provider HTTP request must include attributionHeaders()」；:788-790 实现（user-agent: deepseek-harness/version (+url)）；官方 adapter dsh-llm-deepseek 每请求合并（:399/:1440） | **oauth-llm.js:319-327 自定义 `User-Agent: dsh-agent-router (platform arch)`，未携带宿主 attribution**；与插件既有先例一致（service.js:2863 专业 agent 通路同款） | **P2-1** |
| 装配时序 | wrapper.js:440-442 同款 guard 先例（llm 不可用 → warn + 禁用，已上线验证）；prestep.js:255 亦直接 ctx.get('llm') | oauth-llm.js:411-414 同构 guard；真实宿主 apply 时 llm 可用性有 wrapper/prestep 上线先例佐证 | ✓（P3-2） |

## 维度 1：正确性

- **对话映射**（mapMessagesToItems :146-198）：user text→input_text / image 附件→input_image（经 readImagesAsDataUrls）/ tool-result→独立 function_call_output（先于同消息 user 文本，:167-169 保持 assistant 调用→结果→后续问询相对顺序）；assistant text→output_text / tool-call→function_call（call_id 直传）；system 跳过（经 options.system→instructions）；未知 role/块跳过（损坏负载容错）。STR-4~8 断言锁定 ✓。
- **function_call 往返闭环**（关注点 2）：call_id 三环一致（assistant tool-call id :188 → tool-result toolCallId :162 → SSE function_call item call_id :244，缺失 fallback `call-N`）；多工具按 output_item.done 出现序聚合（:242-247）→ 按序发射独立 index 块（:374-379）→ BlockAssembler 独立装配；工具结果顺序 = 消息块序。STR-6/7/11 锁定 ✓。
- **SSE 聚合**（aggregateCodexSse :224-271）：delta 拼接兜底 + output_item.done 槽位文本为准（与 runCodexResponsesChat 同构）；usage 透传；response.failed/error 事件抛错；无终态 → 截断抛错（ERR-3）；空响应保护（:356）✓。
- **错误映射**（oauthHttpError :96-117）：401/403 重登指引、429/usage_limit_* resets_at 剩余分钟、其余透传截断 400——与 H3-14 同构；401 → finish(error)（ERR-1）✓。
- **kill-switch**：isEnabled false → listModels 空 + stream finish(error)（KILL-1/2）+ settings/updated 注销联动（CAT-6/7）✓。
- 边界：model 不在任何账号 → 明确报错（:310）；凭据缺失 → resolvePresetCredential 报「请重新登录」；空 system 不发送 instructions ✓。

## 维度 2：安全性（关注点 3）

- **凭据不落日志/错误信息**：Authorization/chatgpt-account-id 仅在 fetch init（:319-327）；oauthHttpError 只透传 status + error 字段（截断 400 字符），不含头；fetch 错误消息含 url 但不含凭据（:352）；errorMessage 复用 service.js 既有（无凭据面）✓（P7 先例一致）。
- **dataURL 内存边界**：readImagesAsDataUrls（service.js:2625-2640 既有）逐图读 + btoa，无大小上限——与专业 agent 通路（:2721/:2851 同函数）同款，非本任务新引入；大图多图 base64 放大 +33%——P3-4 讨论。
- 权限面：adapter 只注册/列出（FIX-002 主权——不自动切换任何会话模型，文件头 :10-11）；选择后调用时凭据缺失明确报错 ✓。
- 无注入面（请求体全为内部构造；tools.parameters 透传 JSON Schema——tool 参数经宿主 dsh-tools 校验，无新增面）✓。

## 维度 3：可维护性

- 模块职责单一（新文件 oauth-llm.js 独立）；复用 service.js 现成通路（凭据/代理/SSE/统计——只读复用 + 3 处 export 缝，无复制）；文件头设计注释完整（用户需求/主权/能力声明依据/MVP 披露/统计口径）；注释与实现一致 ✓。
- provider 单路由 + 账号级能力声明的设计决策有注释辩护（:26-29）✓。

## 维度 4：性能

- 目录构建每次调 resolveModel（apiproxy buildModelCatalog 每条目）——oauth-llm resolveModel 为同步纯函数零 I/O ✓；listModels 保序去重 O(n) ✓；SSE 聚合单遍 ✓；无循环/懒加载问题 ✓。

## 维度 5：测试覆盖

- 29 断言 = REG 3 + CAT 7 + STR 14 + ERR 3 + KILL 2；判别性：旧代码无 oauth-llm.js 模块 → import 即 RED（REG-0 安装前无注册断言）+ 请求形状 fetch stub 逐字段锁定（STR-1~9）+ 宿主真实路径驱动（LlmRuntime 真身——prepareCall/adapterStream/BlockAssembler 消费链经真实宿主代码执行，非 mock 宿主）✓。
- 未覆盖（P3 讨论）：多工具并发/顺序无直接断言（双 function_call SSE 场景）；image 块缺 attachment 的容错分支（:159 条件跳过）无断言；system 空串分支无断言；isError=true 的 tool-result 透传无断言。
- 热同步仅经 settingsListener 直调验证（CAT-6/7），未验证 llm/adapters-updated 监听路径（:443）——两者同函数 sync，等价性成立。

## 热同步竞态（关注点 4）

- sync 幂等（handles.has 检查）；注销删除注册——在途 stream 持 adapter 闭包继续（adapter 引用同一 service 实例，getState/accountForModel 热读取）✓；注销后新调用 → registration 抛 NO_ADAPTER → finish(error) 可观测（P8）✓；重注册新 adapter 实例（逻辑同构）；双事件联动（settings/updated resolved 后 + llm/adapters-updated 兜底——wrapper 先例）✓。无破坏性竞态。

## 能力声明依据（关注点 5）

- 账号级 `['text','image']`：依据 EVO-001 实证 gpt-5.4 系经该端点支持 image + gpt-5.6 系同端点（chatgpt.com/backend-api/codex/responses）同族继承；比模型名前缀声明更简单且防漏（模型名自由编辑）。过宽代价 = 实际不支持 image 的模型带图 → 端点拒绝 → finish(error) 可观测兜底（无静默失败）——可辩护选择，注释披露 ✓。

## MVP 聚合发射披露（关注点 6）

- 文件头 :30-35 与 stream :366 注释双重披露「聚合发射非真 token 流式（MVP 语义，真实流式留待后续）」；用户感知影响：主 agent 对话首 token 延迟 = 完整生成时长、无逐字显示——与专业 agent 通路（runCodexResponsesChat 同构聚合）一致；披露充分 ✓（P3-1 讨论项：建议演进为真流式）。

## files 补丁（关注点 8）

- package.json:33 含 `lib/oauth-llm.js`；files 13 个 lib 模块与 lib 目录 13 文件逐一对应（attachments/client/index/memory/oauth-credentials/oauth-llm/prestep/rpc/schemas/service/stats/tool/wrapper）✓；npm pack 13/13 + 冷装 import OK 采信 Developer 判别。

## AI 代码专项 5 项（关注点 7）

| 项 | 结论 |
|---|---|
| mock 残留 | 无（fetch stub 全在 tests/ 显式夹具；lib 零 mock）✓ |
| 硬编码返回值 | 无（resolveModel 返回真实模型名与目录来源；aggregate 读真实 SSE 事件）✓ |
| 幻觉 API | 无——registerAdapter/listModels/resolveModelInfo/prepareCall/stream/BlockAssembler 词汇表/agent-loop request 形状/tools 形状/tool-result 块形状全部宿主源码逐行核验（dsh-llm :1073-1132/:1397-1443/:1496-1526/:1559-1624；dsh-agent-loop :708-762；dsh-tools :2924-2930；apiproxy :1010-1054/:2755）✓ |
| 未实现 TODO | 无（lib grep 零命中；MVP 聚合为有意披露设计，非未实现占位）✓ |
| 过度实现 | 无（+715 行四文件，新模块职责单一；复用 service.js 通路零复制；测试 250 行覆盖判别面）✓ |

## 发现清单

| 级别 | 位置 | 发现 | 影响 | 建议 |
|---|---|---|---|---|
| P2-1 | lib/oauth-llm.js:319-327（请求头） | 未携带宿主 attributionHeaders()（dsh-llm 契约注释 :1069-1070 要求；官方 adapter dsh-llm-deepseek :399/:1440 每请求合并）；自定义 UA 替代宿主 `deepseek-harness/version (+url)`。无强制检查（宿主不拦截 adapter 内部 fetch），与插件既有先例一致（service.js:2863） | 宿主生态归因缺失（UA 无法识别 harness 流量）；无功能/安全问题 | 建议：headers 合并 `attributionHeaders()`（与 dsh-llm-deepseek 同款），自定义 identity 作附加头；或明示接受（先例一致）——P2 建议，可遗留台账 |
| P3-1 | lib/oauth-llm.js:30-35/366 | MVP 聚合发射非真流式：首 token 延迟 = 完整生成时长 | 长响应无逐字显示；与专业 agent 通路一致；披露充分 | 讨论项：后续演进真流式 |
| P3-2 | lib/oauth-llm.js:411-414 | guard 失败（llm 服务不可用）返回空卸载器、无恢复监听；与 wrapper.js:440-442 同款先例；真实宿主 apply 时 llm 可用性有 wrapper/prestep 上线先例佐证 | 若 llm 后到 → 功能静默缺失（仅一条 warn）；当前宿主时序下无实害 | 讨论项：可将 'llm' 加入 index.js inject 列表获得就绪保证 |
| P3-3 | lib/oauth-llm.js:292（resolveModel 无 reasoning 元数据） | 主 agent 配置 reasoningEffort 且选 chatgpt-oauth 模型 → 宿主 UNSUPPORTED_REASONING_EFFORT（finish(error)） | 可观测拒绝，契约行为 | 讨论项 |
| P3-4 | lib/service.js:2625-2640（readImagesAsDataUrls 复用） | dataURL 无大小上限（base64 +33%）——与专业 agent 通路同款 | 大图多图内存放大；非本任务新引入 | 讨论项 |
| P3-5 | lib/oauth-llm.js:49/:159 | 账号级 image 能力声明可过宽（模型自由编辑时） | 端点拒绝 → finish(error) 可观测兜底；注释辩护成立 | 讨论项 |
| P3-6 | tests/oauth-main-model.mjs（覆盖缺口） | 多工具并发/顺序、image 缺 attachment 容错、isError tool-result 透传无直接断言 | 断言面覆盖主链完整，这些为边缘分支 | 讨论项，可选补断言 |

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=1（建议，有遗留计划）/ P3=6
- 5 维度全覆盖；宿主契约核验专节 13 项逐行实测（1 项偏差 P2-1，12 项一致）；AI 专项 5 项逐项有结论；function_call 往返/热同步竞态/能力声明/MVP 披露/files 补丁全部核验；无 P4-violation。
- 遗留台账：P2-1（attributionHeaders 契约）列入跟踪，不阻塞合并。
