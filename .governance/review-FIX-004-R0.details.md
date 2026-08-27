# Code Review — FIX-004（模型能力判定缺陷根治）R1

- **Task ID**: FIX-004
- **审查对象**: commit `6dd6e5b`（`FIX-004: 模型能力判定缺陷根治——能力自证 + 预检可观测`）
- **diff**: `.governance/diff-FIX-004-6dd6e5b.patch`（2 文件 +174/-9；lib/service.js +93/-9、tests/routing-paths.mjs +90/-0）
- **Reviewer**: software-project-governance-code-reviewer
- **Reviewer round**: **R1**（前轮引用：无）
- **审查方式**: 独立逐行核对 diff + 当前工作区源码（只读），不采信 Developer 自报；仅依据文件/代码/测试事实。

---

## 审查结论

**APPROVED_WITH_NOTES** — `unresolved_blockers=0`

零 BLOCKING（P0=0）；硬门槛全部通过。存在 1 条 P1（关键，建议本轮处理，可申请遗留到下一轮）+ 3 条 P2（建议）+ 3 条 P3（记录/观察）。P9 原则存在一处残留单信面（P2-1），非本轮引入且经 DEC-024 申报边界，属可接受遗留。

---

## 一、硬门槛裁决

| 门槛项 | 判定 |
|--------|------|
| P0 阻塞问题数 = 0 | ✅ 通过（0 个 P0） |
| 5 维度逐一有结论 | ✅ 通过（见下） |
| 每条发现标注 P0~P3 | ✅ 通过 |
| 设计一致性（DEC-022 P8/P9 + FIX-004 四目标） | ✅ 通过（见 §四，含 1 条 P9 残留单信面 P2-1） |
| AI 专项 5 项逐一有结论 | ✅ 通过（见 §五） |

---

## 二、事实核验（幻觉 API / 判定逻辑逐项确认）

| 核验点 | 结论 | 依据 |
|--------|------|------|
| `sourceAcceptsModality(originalAdapter, provider, model, modality)` 真实签名 | ✅ 存在，参数顺序匹配 | wrapper.js:238 定义；service.js:1191 调用 `sourceAcceptsModality(original, resolved.provider, resolved.model, 'image')` |
| `llm.registration` 为函数且 `.adapter` 含 `resolveModel` | ✅ 真实契约 | wrapper.js:263 `llm.registration(provider).adapter`；createWrapAdapter 对象字面量 `adapter = { resolveModel(_route, model, signal){...} }`（wrapper.js:305）；X1 桩 `registration = () => ({ adapter: { resolveModel(){...} } })` |
| `ctx.logger?.warn?.(...)` 存在性/安全性 | ✅ 安全 | service.js:2589 双重可选链：logger 缺失→undefined→`?.()` 短路，不抛错；logger 有 warn→尽力写日志；有 `catch` 包裹 | 
| 无 registration 时 `sourceAcceptsModality` 语义 | ✅ 返回 false（非抛错/非真值） | wrapper.js:244-253：`const base = originalAdapter()` → base=undefined → `base && typeof base.resolveModel === 'function'` 短路 → accepts 保持 false；`try/catch` 兜底 |
| hostInfo 异常后 hostAvailable 判定 | ✅ 逻辑正确 | service.js:1193/1195 `typeof hostInfo === 'object' && hostInfo !== null`：undefined/false/''/0/null → false；只对象/数组 → true（resolveModelInfo 不返回数组，实际无误） |
| 三路径判定顺序（host-declared→self-certified→probe-failed） | ✅ 顺序正确 | service.js:1173-1196：先 `hostModalities.includes('image')` → 再 `sourceAcceptsModality` 自证 → 否则 probe-failed |
| X2 期望"回落拒绝" | ✅ 成立 | X2 置 registration=undefined（routing-paths.mjs:646）→ decideImagePrecheck 自证 false → probe-failed → rejected=true（X2 断言匹配 '不支持图片输入'） |

**零幻觉 API、无逻辑翻转。** 关键修正：任务上下文点 6 所述"X3 依赖 X2 的桩遗留"不成立——X3 显式 `oldLlm.registration = undefined`（routing-paths.mjs:663），自含，不依赖 X2 遗留。

---

## 三、发现列表（按 P0~P3）

### P1-1（正确性 / 行为漂移）——宿主 resolveModelInfo 异常时"能力未定"被误诊为"纯文本"
- **文件:行号**: `lib/service.js:1195`（probe-failed 分支）+ `1250-1252`（错误消息）
- **事实依据**: 旧代码（diff 移除段）`catch (error){ if(error instanceof Error && error.message.startsWith('模型 ')) throw error; /* resolveModelInfo 不可用：按未知能力放行 */ }`——宿主 resolveModelInfo 抛错时旧行为=**放行**。新代码 `decideImagePrecheck` 对 resolveModelInfo 抛错 → `hostInfo=undefined` → 走自证；若自证也失败（registration 缺失/适配器无 resolveModel）→ `probe-failed` → 拒绝并抛 `模型 X 不支持图片输入`（service.js:1252）。
- **影响**: 行为变化（放行→拒绝）本身符合 FIX-004 目标①（自证而非放行）与 F-2 先例（fail-closed），合规。但存在窄边界漂移风险：当宿主 resolveModelInfo 抛错 **且** 自证面不可用时，模型真实能力为"未定"而非"确认纯文本"，错误消息 `不支持图片输入` 属**误诊**——真实支持图片的模型会因此被错误拒绝（用户误以为模型不支持视觉）。README L125 所述的 qwen3.7-plus 反例在该边界下仍会被拒。
- **严重级别**: **P1 关键**（非 P0——F-2 fail-closed 先例，拒绝比误放行安全；且真实宿主通常 resolveModelInfo 不抛错而是返回 text 默认，此边界同时命中两类失败的概率低；DEC-024 已申报宿主不可根治面）。
- **修复建议**: 区分 "capability-undetermined"（`hostAvailable=false` 且 `source='probe-failed'`）与 "confirmed-text-only"（宿主明确返回 text）+ 自证失败。前者可在抛错前额外 `recordCapabilityEvent('image_precheck_undetermined', {...})` 或 `ctx.logger.warn` 标注"宿主能力不可得、探测亦不可用→按纯文本拒绝"，使观测语义准确。**注意**: 不得改动现有错误字符串（回归点①——D10 [routing-paths.mjs:530] 与 X2 [routing-paths.mjs:651] 断言依赖 `不支持图片输入` 子串），建议以补充诊断事件/日志实现区分而非改消息。

### P2-1（安全性 / P9 残留单信面）——host-declared 路径仍单信宿主正向声明
- **文件:行号**: `lib/service.js:1181-1183`（`hostModalities.includes('image')` → 直接 `host-declared` 放行）
- **事实依据**: 该路径仅在宿主声明含 image 时信任放行，不经过 `sourceAcceptsModality` 自证（design 注释注明"信任宿主声明、不重复适配器探测；声明可信路径"）。P9 明文"对宿主能力判定的依赖 MUST 具备能力自证或 parity 守卫，**禁止单向信任宿主行为**"（project-principles.md P9）。
- **影响**: 若宿主错误地正向声明 image（false-positive），图片块会被无守卫地发送到非视觉端点（击穿面）。属 P9 原则的残留单信面。
- **严重级别**: **P2 建议**——非本轮引入（旧 precheck 同样对 host 声明 image 放行），且设计文档标注为有意 tradeoff（宿主正向声明比默认 text 更可靠）；不阻塞合并。
- **修复建议（非阻塞）**: 可选复用 `sourceAcceptsModality` 作为该路径的 parity 守卫（`modalityCache` 60s TTL 已缓解重复探测成本），使 host-declared 与 self-certified 判据一致、消除 P9 单信面。留待后续增强（C3 类），本轮不强制。

### P2-2（测试健壮性）——X 节桩复位未受 try/finally 保护
- **文件:行号**: `tests/routing-paths.mjs:678-681`（复位三桩）；`630`、`668`（直接 await `service.run`，未用 rejects 包裹）
- **事实依据**: X1/X3 对 `service.run` 直接 `await`（期望成功）。若其内部意外抛错（非预检拒绝路径），异常将跳过 X 节末尾的复位语句（679-681），`svcRoot` 的 llm 桩（resolveModelInfo/registration/stream）残留。当前 `check`/`rejects`（routing-paths.mjs:75-89）均为失败计数制不抛错，正常路径复位必然执行；E 节另建独立 LlmRuntime，实际污染面低。
- **严重级别**: **P2 建议**（防御性，非阻塞）。
- **修复建议**: 将 X 节整体包 try/finally，把复位移入 finally；或将 X1/X3 的 `service.run` 改用 `rejects(...)` 语义容错。

### P3-1（测试隔离 / 性能）——模块级 modalityCache 跨节共享
- **文件:行号**: `lib/wrapper.js:231-255`（`modalityCache` 模块级单例，60s TTL）
- **事实依据**: D10 对 (text-only,t1,image) 探测缓存 false 后，X2 同 key 命中缓存（结果一致，无冲突）；X1 缓存 (opencode-go-new,qwen3.7-plus)=true，当前无其他节复用。潜在跨节缓存遮蔽，当前无害。
- **严重级别**: **P3 观察**——`sourceAcceptsModality` 为既有多处复用（prestep.js:220 / wrapper.js:343）的既有单点，非本次引入；建议未来若测试需覆盖"同 key 不同结果"时按 TTL/隔离处理。

### P3-2（设计一致性 / 验证深度）——self-cert 真实有效性依赖宿主适配器准确度
- **文件:行号**: `tests/routing-paths.mjs:625`（X1 桩直接返回 image-capable）+ `lib/service.js:1191`
- **事实依据**: self-cert 路径的真实效果取决于 `registration(provider).adapter.resolveModel` 是否准确返回原生能力。X1 以桩直接返回 `inputModalities:['text','image']`，验证的是**逻辑 wiring**，未验证**宿主现实**（pi-ai 自定义 provider 的适配器 resolveModel 是否如实）。
- **严重级别**: **P3 记录确认**——DEC-024 已显式申报边界："若宿主适配器 resolveModel 亦为构建时快照，则自证仍读旧值、重启必要——此边界须宿主修复才能消除"。与本 commit 观察一致，属已知不可根治面，非缺陷。

### P3-3（可观测细粒度）——host-declared 放行不产生诊断事件
- **文件:行号**: `lib/service.js:1245-1253`（仅 self-certified 与 reject 两处触发 `recordCapabilityEvent`）
- **事实依据**: `verdict.source === 'host-declared'` 时既不触发 self-certified 也不触发 reject，全程无留痕。按 P8，"成功/信任"路径可不强制观测（P8 以失败/降级/能力判定缺失为必查面）。
- **严重级别**: **P3 观察**——可选记录 `image_precheck_host_declared`（仅留痕），低价值，不强制。

---

## 四、设计一致性（DEC-022 P8/P9 + FIX-004 四目标）

| 项目 | 结论 | 依据 |
|------|------|------|
| FIX-004 目标① 能力自证 | ✅ 落地 | decideImagePrecheck self-certified 路径（service.js:1184-1194）复用 sourceAcceptsModality |
| FIX-004 目标② 预检失败可观测 | ✅ 落地 | recordCapabilityEvent（service.js:1251, 1252）+ 抛错消息；无静默吞错（R2-F3 同型根治） |
| FIX-004 目标⑤ 源判定单点（P5 泛化 / 禁白名单硬编码） | ✅ 落地 | 图片能力探测仅 `sourceAcceptsModality` 一处定义（wrapper.js:238）；service.js/prestep.js/wrapper.js 三处均复用；lib/ 无第二判定路径；无 provider 白名单硬编码（generic 探测） |
| FIX-004 目标③④（宿主重启替代评估 / 宿主缺陷申报） | ✅ 记录 | 不在本 commit 代码面；DEC-024 已申报入册（C2），含 60s TTL 缓存失效=热载替代评估结论 |
| DEC-022 P8 可观测 | ✅ | self-cert/reject 双事件 + P7 零 token（detail 仅 provider/model/hostModalities/hostAvailable） |
| DEC-022 P9 宿主演进防御 | ✅ 基本达标 + 1 残留单信面 | 自证路径避免"只信宿主"；但 host-declared 路径仍单信宿主（→ P2-1，遗留） |

---

## 五、AI 代码专项 5 项

| 检查项 | 结论 | 依据 |
|--------|------|------|
| mock 残留 | ✅ 无 | lib/service.js、wrapper.js 生产代码无 mock/桩（grep 无 console.log/mockResolved）；桩仅在 tests/ |
| 硬编码返回值 | ✅ 无 | 判定结果均为运行时计算（hostModalities/自证/来源）；硬编码仅为事件 kind 常量、错误字符串（合法） |
| 幻觉 API | ✅ 无 | 见 §二表——sourceAcceptsModality 签名、registration→adapter→resolveModel、ctx.logger 全部实测属实 |
| 未实现 TODO | ✅ 无 | grep lib/service.js 无 TODO/FIXME/XXX |
| 过度实现 | ✅ 无 | decideImagePrecheck + recordCapabilityEvent 与问题面匹配；未引入超范围逻辑 |

---

## 六、5 维度审查结论

| 维度 | 结论 | 要点 |
|------|------|------|
| 正确性 | 通过（1 条 P1） | 三路径判定顺序正确；无 registration 真实返回 false；回归点①③④通过；P1-1（能力未定误诊）为关键建议 |
| 安全性 | 通过（1 条 P2） | 事件 detail 无敏感数据（P7）；无新增 IO/网络/注入面；错误消息为配置值插值非注入；host-declared 单信宿主（P2-1，P9 原则残留） |
| 可维护性 | 通过 | 单点复用解耦（decideImagePrecheck 收敛原 precheck 判定）；函数分割合理；注释详实且与代码一致；`hostAvailable` 三处判定一致 |
| 性能 | 通过（1 条 P3） | sourceAcceptsModality 已有 60s 缓存；无新 N+1/O(n²)；P3-1 跨节缓存遮蔽当前无害 |
| 测试覆盖 | 通过（1 条 P2） | X1/X2/X3 覆盖三路径 + X1b/X2b/X3b 覆盖可观测（事件/无事件）；D10/D11 回归断言保持；P2-2 复位健壮性建议；P3-2 验证深度边界（与 DEC-024 一致） |

---

## 七、回归面核对（任务关键点 5）

| 回归点 | 结论 |
|--------|------|
| ① 错误消息字符串与旧一致 | ✅ 保留（`模型 X 不支持图片输入；请为该 agent 配置支持视觉的模型（如 openai/gpt-4o）`）——D10/X2 断言依赖维持 |
| ② skipPrecheck（declared 路由跳过预检）未破坏 | ✅ 保留（service.js:1223-1239 逻辑未改；relay declared 路径正常绕过） |
| ③ resolveModelInfo 不可用行为变化 | ✅ 变化 = FIX-004 目标①意图（自证而非放行），合规；窄边界误诊见 P1-1；DEC-024 已申报边界 |
| ④ D10（text-only 前置拒图）仍拒 | ✅ 验证保留：text-only 未 declared → decideImagePrecheck → resolveModelInfo=['text'] → 自证（无 register）false → probe-failed 拒绝 |
| ✅ D 节 vision（openai/gpt-4o）仍放行 | 验证保留：host-declared（resolveModelInfo openai→['text','image']）→ 放行，无 self-cert 事件 |

---

## 八、处置建议给 Coordinator

- **结论**: **APPROVED_WITH_NOTES**（`unresolved_blockers=0`，P0=0）。可合并。
- **建议**:
  - P1-1 建议本轮处理（区分 undetermined 的诊断语义，不改错误字符串）；若本轮不处理，登记为遗留项并给关闭计划（跟踪表）。
  - P2-1 登记为 P9 残留单信面遗留项（可选后代增强，C3 类）。
  - P2-2/P3-1/P3-2/P3-3 归类为后续增强/记录，不阻塞。
- 本审查不修改任何代码；审查报告写入 `.governance/review-FIX-004-R1.md`。
