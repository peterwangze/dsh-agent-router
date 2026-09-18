# Review 输入 — FIX-052 R0（Code Reviewer）

- **Task**: FIX-052 预设作用域统计归属错乱修复（归属键重构为会话预设身份不变量）
- **Commit**: `4ac01fa`（HEAD，未 push）
- **变更面**: `lib/preset-defaults.js`（+217/−38 区段）、`tests/fix-052-preset-attribution.mjs`（新增 430 行）、`tests/preset-defaults.mjs`（L9 语义重定 + 节头注释）
- **审查员**: Code Reviewer（round 0）
- **派发时间**: 2026-09-18

## 背景（RCA 摘要，EV-217）

用户报障：①小说工作流（novel-writing 预设）调用量被记入 governance 桶（novel-writing 桶历史 0 条；novel 子代理模型 glm-5.3-flash 09-16/17/18 = 1449/466/1160 次/日全入 governance|subagent）；②治理工作流用量漏统计（governance|main 09-14 起恒 0，治理会话 09-18 的 402 次 main 全记 standard 桶）；③时间线与用户 09-13 15:42 重装 governance 预设吻合；④settings.yaml `agent-presets.default: standard` 存在。

根因：`installRequestTelemetry` 归属链 = `composedPreset(agent.ctx)`（宿主 live 挂载运行时匹配——`standingMountFor` = scope parent 对 `livePresetMounts()` 扫描）优先 → `header.agentPreset` 冻结快照兜底。两源均为可变量（随重装/默认/全局选择漂移）。

**用户裁决设计原则（方向红线）**：归属键 MUST 绑定工作流身份不变量（会话自身 agent-preset/selected 事件链维护的会话级身份），禁止 live 挂载/部署默认/全局选择等可变量作为权威源。

## Developer 声称的实现（待独立核验——禁止采信单方陈述）

1. 归属键单点 = `sessionPresetIdentity` 模块级有界 LRU（`SESSION_PRESET_LIMIT=1024`，读命中刷新序，淘汰后回落创建头）+ `noteSessionPresetIdentity`/`sessionPresetIdentityOf`；触发来源恰两个既有订阅（`agent/created` 播种、`agent-preset/selected(sessionId, agentPreset)` 更新），零新增宿主订阅面
2. 遥测解析链重定 = 会话身份映射 → `header.agentPreset` 创建期快照 → live 罗盘**仅最后兜底 + 诊断披露**（旧「罗盘优先」链删除）
3. 子代理继承父会话身份：宿主 `childSessionMeta` 以父 live 罗盘现写子头（同源漂移）→ 子创建时**父身份优先、子自身头兜底**
4. 可观测（P8）：新诊断 kind `preset-attribution-divergence`（归属≠罗盘）与 `preset-attribution-live-fallback`（无身份→罗盘兜底），按 (kind,会话,归属,罗盘) 去重有界（上限 256）
5. 罗盘读取单点（P5）：`liveCompassPresetOf`，`composedPreset(agent?.ctx)` 全模块恰 1 处
6. 空预设值不覆盖已建立身份（形态防御）
7. `lib/stats.js` 不改（理由：recordScope 无 sessionId 需求，归属在遥测站点单点决定；scope 落盘行字段白名单是 fix-031 E0 机器守卫，加字段破坏盘面契约）
8. `agent/created` 身份播种先于 `isEnabled`/`presetDefaults()` 早退（纯内存记账，归属与总开关解耦）

## Developer 声称的证据（待独立复算）

- RED：新套件修复前 14 断言 FAIL/exit 1；L9 修订版对修复前实现恰 1 FAIL（临时回退实跑后 `git hash-object` 精确还原核验）
- GREEN：fix-052 套件 20/20；`node tests/run-all.mjs` = ALL 21 SUITES + 4 RUNNER MODULES PASSED exit 0（**Coordinator 已独立复跑确认 25.7s exit 0**）
- 宿主面锚点（实读宿主 checkout `C:\Users\peter\AppData\Local\npm-cache\_npx\1e7f6d9597241db0\node_modules\@deepseek-ai\`）：
  - dsh-agent-presets/lib/index.js：`standingMountFor` L787-793、`composedPreset` L1550-1552、`agent-preset/selected` 双参转发 L1325-1328、`get defaultId()` L1337-1339、`agent.session.append("agent-preset/selected", { agentPreset })` L1749
  - dsh-subagent/lib/index.js：`childSessionMeta` L502-513（`agentPreset` L504 = `composedPreset(parent.ctx)`、`parentSession: parentHeader.id` L508）
  - 测试文件内锚点用导出名/符号名（避开 9h-5 行号锚守卫——含行号式锚的文件 MUST 入 ANCHOR_CASES，本任务不改范围外 host-abi-health.mjs）

## 审查要求（MUST）

1. 逐行审查 `git show 4ac01fa` 三文件 diff（仓库根 `D:\AI\agent\deepseek\plugins\router`）
2. 5 维度全覆盖（正确性/安全性/可维护性/性能/测试覆盖）+ AI 专项 5 项（mock 残留/硬编码返回值/幻觉 API/未实现 TODO/过度实现）逐项有结论
3. 重点核验（对照 Developer 声称逐条独立验证，不信单方陈述）：
   - a. 子代理父身份继承的实现载体：agent/created 播种如何拿到 parentSession？（childSessionMeta 头形状锚）父身份缺失/父未入映射时的回落序是否与声称一致
   - b. LRU 有界性与淘汰语义：读刷新序实现、淘汰后回落创建头是否真的不漂向罗盘
   - c. 诊断去重有界（256）的键设计与防冲刷效果；诊断通道 notePresetDiag 兼容性
   - d. `composedPreset(` 全模块出现次数（声称恰 1 处）——grep 级独立复算
   - e. 空预设值不覆盖已建立身份的防御是否完备（event data 空串/undefined/非字符串形态）
   - f. 遥测 fail-safe 保持：重构后任何异常是否仍回退 config 原样返回（观测失败不影响请求链——原 P7 不变量）
   - g. 现有 preset 默认模型行为零变化（D8/D9/D10/D11/A*/M* 断言面）
   - h. 测试宿主面保真（P10-④）：桩形态与宿主面同构（ctx.get 面、双参事件、agent/created payload、childSessionMeta 头）——抽查锚点真实性（实读宿主源码核验导出名/签名存在且语义相符，防幻觉锚）
   - i. L9 语义重定的正当性：旧断言与新设计契约的一致性（旧「罗盘优先」终态被用户裁决取代——测试语义更新须与实现同步且无断言力损失）
   - j. RED 证据方法论：临时回退实跑 + hash 还原的可接受性；新套件判别力（是否真正构造了扰动 A/B/C 而非恒真断言——抽查 2~3 条断言的判别性）
   - k. stats.js 不改的理由是否成立（读 lib/stats.js recordScope/#foldScope 佐证）
4. 范围核验：diff 仅 3 文件；无越范围修改
5. Developer 移交的 6 条范围外观察（首条 = tests/fix-031-attribution.mjs H7 标签语义过期）——逐条裁定：本任务内必须修 / 后续卫生批 / 无需动作

## 宿主源码只读边界

宿主 checkout（上述路径）仅限只读取证；禁止写入宿主树任何文件。

## 输出要求

- 结论四选一：APPROVED / APPROVED_WITH_NOTES（MUST 含独立结构字段 `unresolved_blockers=0`）/ NEEDS_CHANGE / BLOCKED
- 每条 finding 标注 P0~P3 + 文件:行号 + 事实依据 + 修复建议
- 5 维度 + AI 专项逐项结论
- 结构化返回报告全文（Coordinator 将持久化为 .governance/review-FIX-052-R0.md）
