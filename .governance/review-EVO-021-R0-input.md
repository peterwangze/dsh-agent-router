# REVIEW-EVO-021-R0-input — B3 llm-selection 域批代码审查（Round 0）

- **Task**: EVO-021-R0（P1）ARCH-004 实施链 B3 llm-selection 域批（P5 违规消除）
- **Reviewer**: Code Reviewer Agent（只读；工具边界 = read/grep/glob + 只读 git）
- **审查对象**: commit `e541028a60f2a386b3ed273955016b1df6c1de29`（2026-09-12，7 files +371/−284）
- **设计依据**: arch-004-compatibility-design.md §4.3 域 2（L216-221）/域 3（L223-228）/D1-2（L122）/§10 B3（L398-401）；DEC-031；Coordinator 三项中期裁决（P2-1 拆半 / agentsRegistryOf 归 ctx-services / A4 错位引用勘正）
- **工作树有效性**: HEAD=9da069b；`git diff e541028 HEAD --name-only` 仅 .governance 4 文件，lib/tests 零差异——本审查全部 grep/实读对 e541028 有效。

## 硬门槛裁决

| 门槛项 | 结果 | 依据 |
|---|---|---|
| P0 阻塞数 | **0** | 发现列表最高 P2 |
| 5 维度全覆盖 | **100%** | 逐维结论见下 |
| 每条发现标注级别 | **100%** | F-1~F-5（P2×2 + P3×3） |
| 设计一致性检查 | **已完成** | 声称核验 1-7 + F-1（agentPresetsServiceOf 归属口径） |
| AI 专项 5 项 | **全部完成** | 逐项见下 |
| 结论 | **APPROVED_WITH_NOTES / unresolved_blockers=0** | P0=0 且 P1=0，无未解决 BLOCKING finding |

## 5 维度逐项结论

### 维度 1 正确性 — 通过
- **迁移逐字保真**：inheritedRouteOf / liveDefaultSelection / sessionNeverProduced / agentPresetsServiceOf 四函数与删除前实现（diff 删除侧）逐字对照一致（含 try/catch 降级方向与返回形态）；liveDefaultSelection 与 prestep.js 删除侧副本亦一致——双份去重为纯收敛。
- **sessionSelectFaceOf 单形态**：sessionController 分支体（`{...selection}` 展开、`error?.code ?? 'select-failed'`、message slice 300）与旧新面分支逐字一致；删除的仅是 apiProxy 回落（旧 L226-238，git 历史锚实读核实）。归一信封 `{ok:true}|{ok:false,code,message}` 形态不变。新增 noteHostDiag（face-degraded / consumer 'preset-seed'）= 设计 §4.3 域 2 降级行为的**新增**要求，非行为回退（消费者零动作 + P8 warn 语义不变，preset-defaults.js:236-241）。
- **llmFaceOf 三方法门控语义等价**（宿主 0.1.5-rc.2）：原 wrapper.js:547-548 / oauth-llm.js:478-479 两处 `!llm || registerAdapter/registration 非函数` → 新 `!llmFaceOf(ctx)`。宿主 LlmRuntime 三方法齐备（锚点实读见下）→ 门控通过性不变；llmFaceOf 额外的 `typeof ctx.get === 'function'` 守卫 + try/catch 仅更防御，观测结果（warn + disabled）同形。既有测试套件注册路径 llm 桩全部为真实 `new LlmRuntime(root)`（smoke:2346/2467/2833、routing-paths:693、oauth-main-model:119/547、metrics:104/203/544、fix-009:67、fix-010:193）——不存在被三方法门静默禁用的两方法旧桩，静态零回退成立。
- **边界条件**：sessionSelectFaceOf 查找抛错 → noteHostDiag + null（G1 注入测试同构）；llmFaceOf 查找抛错/非对象 → null；均收敛到调用方既有 warn 降级。A10/A11/D5/D6/N1 负向路径断言齐备。
- **并发安全**：无新增共享状态；noteHostDiag 入 B1 既有有界环形；播种串行化队列未动（E 组断言保持）。
- **资源管理**：无资源句柄。
- 保留边缘分歧一处见 F-2（agentsRegistryOf 形状降级分支，fail-safe 方向）。

### 维度 2 安全性 — 通过
无新增外部输入面；错误信息有界（message slice 300 / noteHostDiag detail slice 80）防诊断面膨胀；无硬编码密钥/token；无注入面（String 强制转换，无模板求值）；无权限语义变化。OWASP 关键项无新增暴露。

### 维度 3 可维护性 — 通过（附 F-3/F-5 注释锚漂移）
- P5 消除实锤：liveDefaultSelection 域内唯一实现（llm-selection.js:161）；六函数消费者本地定义 0；apiProxy 解析 0（独立复跑见 P5 表）。
- 函数均单一职责、<50 行；llm-selection.js 199 行域文件，头注含宿主锚点/归属勘正/D1-2 加回成本账，可维护性好。
- preset-defaults.js 净删 189 行，消费面收敛后职责更清晰。
- 注释锚漂移两处（F-3/F-5，P3）。

### 维度 4 性能 — 通过
全部 O(1) 服务查找 + 3 元素 every() typeof 判定；桶 import 为静态绑定零运行时开销；无循环/批量 I/O 变化。

### 维度 5 测试覆盖 — 通过
- 正向播种（A1/A7/C1/C2/D3/D4/D10/D11/E1/E2/F1-F3/H1/I1-I4/J1/J2/J5/K6）、负向（D5/D6/N1/A4-A6/A8/A9/B/M 组）、降级可观测（D5/N1 warn + G1 零 unhandledRejection）、错误分支（A11/I2）全覆盖。
- 新增守卫判别力静态推演独立成立：N1（仅 apiProxy 在场 → 复活实现会播种 → calls=1 ≠ 0 必红）；N2/D1（源码 `get('apiProxy')` 复现即红）；D3/D4（域接口缺导出/门控形状漂移即红）；D5（apiProxy 全功能桩在场无 sessionController → 复活即播种且 warn 消失必红）。红演示「复活 apiProxy 三红（N1/N2/D1）」与此推演一致。
- TDD 先红推演成立：守卫写入时（迁移前）N1/N2/D3/D4/D5 对旧实现逐条必红；旁证 = f8bd6d4 提交信息留痕「主工作区 fix-029/preset-defaults 各 1 红系并行 B3 未提交 TDD RED」。
- 夹具保真（P10-④）：makeSessionController 锚定宿主源码形态——直接参数 / 成功返回 `{selected}` / 失败抛带 `.code` 错误（宿主实读 `session/model-unavailable` 与夹具 `unavailable` 分支 code 一致）/ saveSelection 失败仅 warn（宿主 `lib/index.js:622-624` 逐行同构）。makeApiProxy 退役为 N1/零调用类断言专用（文件头 Rework 注声明），保留有据。
- **未验证（工具边界）**：全量网 23/23（主树）与隔离 worktree 22/23+1 环境伪影——Developer 供证，按任务约定 Coordinator 复跑裁终，本审查不采信为已复核事实。

## AI 专项 5 项

| # | 项 | 结论 | 依据 |
|---|---|---|---|
| 1 | mock 残留 | 无 | lib/ 零测试条件分支；makeApiProxy 为测试文件内合法负向夹具且保留理由在案（Rework 头注） |
| 2 | 硬编码返回值 | 无 | 信封均由入参/错误对象派生；错误码缺省 `'select-failed'` 与旧实现一致 |
| 3 | 幻觉 API | 无 | 全部宿主面锚点一手实读命中（见锚点表）；无未实证的宿主方法调用 |
| 4 | 未实现 TODO | 无 | 「留 B4」「probe 半项」为显式批次边界且已入台账（9da069b：probe 半项三方法同步绑定 B4），非裸 TODO |
| 5 | 过度实现 | 无 | llmFaceOf 三方法并集 = 设计 §4.3 域 2 能力探测原文（「三方法 typeof」）；noteHostDiag = §4.3 域 2 降级行为原文 |

## 声称核验（Developer 7 条）

| # | 声称 | 裁定 | 关键证据 |
|---|---|---|---|
| 1 | 五函数迁域落成 §4.3 域 2 接口 + agentPresetsServiceOf；agentsRegistryOf 归 ctx-services | **属实（附 F-1 归属口径注）** | llm-selection.js:50/107/137/161/179/191 五接口函数+agentPresetsServiceOf 齐备（fix-029 D3/D4 判别）；agentsRegistryOf=ctx-services.js:87 `accessorOf('agents')`（§4.3 域 3 一致）；桶 index.js 星导出两名无歧义。agentPresetsServiceOf 落域 2 合 §10 B3 措辞但与 §4.3 域 3 L226 冲突（设计内部矛盾，裁决仅覆盖 agentsRegistryOf）→ F-1 |
| 2 | D1-2 单形态 + 域内加回结构注释 | **属实** | 宿主锚 :605 `async selectModel(request)` / :2502 `_selectModel_decorators=[Remote("selectModel")]` 实读命中（0.1.5-rc.2）；apiProxy 分支删除；注释「1 分支 + 1 组判别测试 + git 历史 lib/preset-defaults.js:226-238」经 `git show e541028^` 实读逐行核实（L226-238 恰为旧回落分支） |
| 3 | P2-1 拆半：三方法并集 + wrapper/oauth 收敛 + probe 半项显式留待 | **属实（附 F-3 绑定锚过时注）** | LlmRuntime 四锚实读命中（:1698 类 / :1780 registerAdapter / :2018 listModels / :2177 registration）；wrapper.js:547/oauth-llm.js:478 切换；probeLlmAdapterFace 保持两方法（:73）与 host-abi-health.mjs:171 桩对齐不破测；但「绑定 EVO-020 收口」已过时——EVO-020 终态（9da069b）未同步，实际再绑定 B4（9da069b message 明文） |
| 4 | 四消费者切换 + P5 grep 四项 | **属实（四项独立复跑全一致）** | 见下方 P5 复跑表；消费面桶 import 四处（preset-defaults.js:117 / prestep.js:38 / wrapper.js:30 / oauth-llm.js:45） |
| 5 | 防复活双落点 + 夹具翻转 + G1 前移 | **属实（附 F-4 措辞精度注）** | N1/N2/D1-D6 断言逐条实读；正向播种断言全套翻转为 `calls[0].{sessionId,provider,model,reasoningEffort}` 直接参数形态；G1 注入键改 'sessionController' 且面解析 try/catch 判据不变；「A/C/D/E/F/H/I/J 全套翻转」实为「各节正向断言翻转」，各节零动作用例（25 处 makeApiProxy）保留为惰性金丝雀/负向守卫——保留策略有据但措辞过宽 → F-4 |
| 6 | RED→GREEN→红演示→复原；主树 23/23 + 隔离 22/23+1 伪影 | **静态推演独立成立；运行时结果未验证（工具边界，Coordinator 复跑裁终）** | 守卫对迁移前实现逐条必红（构造性推演）+ 复活三红推演一致 + f8bd6d4 留痕旁证；测试执行本审查禁止 |
| 7 | service.js:927-928 未切换（B4 边界纪律） | **属实** | service.js:927-928 实读仍为旧形态 `listModels` 单方法检查；与 P2-1 拆半裁决及 B4 范围（§10 B4：24 处散点）一致 |

## P5 独立复跑（对 e541028 工作树，grep 工具）

| 项 | 声称 | 复跑结果 |
|---|---|---|
| liveDefaultSelection 实现 | 单实现 :161 | ✅ lib/ 全域唯一 `lib/host-abi/llm-selection.js:161` |
| apiProxy 解析 | 0 | ✅ `get\(['"]apiProxy['"]\)` lib/ 0 命中 |
| 六函数本地定义（preset-defaults/prestep） | 0 | ✅ 两文件 0 命中（定义仅存 llm-selection.js 五处 + ctx-services 常量式） |
| wrapper/oauth inline llm 检查 | 0 | ✅ 两文件 `ctx.get('llm')`/`typeof llm.` 0 命中 |

残留 `ctx.get('llm')`（service.js:927/1337/1351、host-route.js:219、prestep.js:257）均在 B4 批范围或非注册门控用途（adapter 解析/probe），与批次边界一致，非本批违规。

## 宿主锚点实读核验（0.1.5-rc.2，node_modules 一手）

| 锚点 | 位置 | 结果 |
|---|---|---|
| LlmRuntime 类 | dsh-llm lib/index.js:1698 | ✅ `return class LlmRuntime extends _classSuper` |
| registerAdapter | :1780 | ✅ 方法签名实读 |
| listModels | :2018 | ✅ `async listModels(provider)` |
| registration | :2177 | ✅ `registration(provider)` |
| selectModel 命令 | dsh-api-session-controller lib/index.js:605 | ✅ `async selectModel(request)` 直接参数；:615-625 成功返回 `{selected}`、`agentDefaultModel.saveSelection` 失败仅 warn（与夹具同构）；:627-633 失败抛 `RemoteError("session/model-unavailable",…)` |
| selectModel Remote 注册 | :2502 | ✅ `_selectModel_decorators=[Remote("selectModel")]`（:2503 为相邻 modelCatalog——声称锚「:2502-2503」略宽，:2502 精确命中） |

## 发现列表

### F-1（P2）agentPresetsServiceOf 域归属与设计 §4.3 域 3 冲突未闭环
- **位置**: lib/host-abi/llm-selection.js:191（实现落域 2）；设计 §4.3 域 3 L226 vs §10 B3 L399
- **事实**: §4.3 域 3 明文「agentsRegistryOf/**agentPresetsServiceOf** 双形态解析逻辑原样迁入（ctx-services）」；§10 B3 却写六函数全迁 llm-selection.js——设计自相矛盾。Coordinator 中期裁决仅覆盖 agentsRegistryOf；agentPresetsServiceOf 按 §10 B3 落域 2，偏离 §4.3 域 3。ctx-services.js:89 已有 `agentPresetsOf = accessorOf('agentPresets')`（存在性 + composedPreset 形状）——B4 若按 §4.3 域 3 消费该访问器，将与域 2 agentPresetsServiceOf 形成语义近重复双轨（P5 精神）。
- **影响**: 无运行时影响；单一实现事实成立。风险 = B4 迁移时归属二次漂移/双轨。
- **建议**: B4 前在设计文档勘误或 decision-log 补一行裁决（二选一：agentPresetsServiceOf 正式归域 2 并修 §4.3 域 3 措辞；或 B4 将其并入 ctx-services 访问器并删域 2 导出）。

### F-2（P2）agentsRegistryOf 消费语义在「形状降级」边缘与旧实现分歧
- **位置**: lib/preset-defaults.js:373-374、:441；lib/host-abi/ctx-services.js:57-62（serviceFaceOf 降级分支返回原对象）
- **事实**: 旧本地实现严格校验 `typeof registry.get === 'function'`（不满足 → undefined）；切换 accessorOf('agents') 后，'agents' 服务存在但 `.get` 非函数时 face 仍返回**原对象**（仅 probe.state='degraded'）→ :374/:441 `.get(...)` 抛 TypeError，被 handler 级 try/catch 收敛为「handler failed」warn + 整体跳过。旧行为：:374 处 parent=undefined → fixup 继续（子代理 options 仍被突变）；:441 处 no-agent warn + skip。即 subagent 路径在该边缘从「继续 fixup」变为「跳过」（更保守、fail-safe 方向；onPresetSelected 两版均 skip 仅 warn 文案/诊断条目不同）。
- **触发面**: 宿主 'agents' 服务存在但无 `.get`——契约破坏形态，真实宿主与全部测试夹具均带 `.get`（FIX-023 取证），现网不可达。
- **建议**: B4 收敛时给消费点补 `typeof .get === 'function'` 守卫或 accessorOf 提供严格变体；或接受 fail-safe 方向并在 ctx-services 头注记录该边缘语义。

### F-3（P3）「probe 半项桩同步绑定 EVO-020 收口」注释已过时
- **位置**: lib/host-abi/llm-selection.js:29-31（文件头）+ :62-63（probe 注释）
- **事实**: EVO-020 已终态（9da069b）而 probe 仍两方法、host-abi-health.mjs:171 桩未同步；实际再绑定 B4（9da069b 提交信息明文「P3×6 台账绑定 B4（…probe 半项三方法同步）」）。注释锚与台账现状不一致。
- **建议**: 注释改指 B4 台账（随 B4 收口一并消解）。

### F-4（P3）「播种夹具 A/C/D/E/F/H/I/J 全套翻转」措辞过宽
- **位置**: commit message；tests/preset-defaults.mjs（25 处 makeApiProxy 保留）
- **事实**: 实际翻转的是各节**正向播种断言**（A1/A7/A10/A11、C1/C2、D3/D4/D10/D11、E1/E2、F1-F3、H1、I1-I4、J1/J2/J5、K6）；零动作用例（A4-A6/A8/A9、B1-B6、D5/D6/D8、M1-M5 等）仍用 makeApiProxy 作惰性金丝雀或负向守卫。保留策略本身在 Rework 头注中已声明且有判别价值（D5/N1 依赖 apiProxy 桩在场）——行为正确，仅声称措辞与事实有偏差。
- **建议**: 无代码动作；台账措辞按本报告勘正口径理解。

### F-5（P3）client.js/served-client.js 注释锚漂移
- **位置**: lib/client.js:5391-5392；tests/served-client.js:5391（镜像同注）
- **事实**: 注释引「agentPresetsServiceOf 先例 lib/preset-defaults.js:100-108」——函数已迁 llm-selection.js:191，行号+文件双漂移。纯注释，零运行时影响。
- **建议**: B4/后续小修批顺手勘正。

## 结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0）

- P0=0，P1=0；P2×2（F-1 归属口径闭环 / F-2 形状降级边缘守卫）+ P3×3 为非阻塞台账项。
- 核心验收（§10 B3）静态全达：P5 四项 grep 独立复跑一致；D1-2 删除 + 加回结构注释锚定 git 历史逐行核实；llmFaceOf 三方法门控宿主四锚实读 + 既有套件真实 LlmRuntime 桩零静态回退；防复活守卫（N1/N2/D1/D5）判别力构造性推演独立成立；行为零回退（迁移体逐字对照 + 宿主 0.1.5-rc.2 无 apiProxy 面 + 归一信封不变）。
- **未验证项（移交 Coordinator 复跑裁终）**: 全量网 23/23（主树）/ 隔离 worktree 22/23+1 环境伪影归因——本审查工具边界禁测试执行，Developer 供证待 Coordinator 机证。
