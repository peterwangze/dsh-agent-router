# Review Report — DOC-001 R0（README 文档面刷新快审）

> Reviewer: Code Reviewer Agent · Round: **R0** · 日期: 2026-09-02（会话日）
> 审查对象: commit `2e1cdf8`（README.md 三处定向编辑：简介段 L3-5 / 项目目标 L10-12 / 特性列表 L14-24）
> 审查方式: **Read 现盘审查**（任务约束：只读、不运行命令、不修改代码）——commit 号与「三处编辑」范围采信 Coordinator 任务书；commit 粒度 diff 未独立取证（无 git 命令权限），现盘终态逐行实读。
> 审查基准（用户指令，采信）: 刷新 README，强调当前支持的主要功能——① Agent 预设和 subagent 默认模型配置 ② 专业 Agent 配置 ③ ChatGPT 订阅登录并支持主模型调用。

---

## 一、审查重点逐项结论

### 重点 1 · 忠实度（三大功能 vs 实现）——PASS，零虚构零过度承诺

| README 表述 | 实现证据（文件:行） | 判定 |
| --- | --- | --- |
| ①「按 DSH 预设粒度配置主 Agent 与 subagent 的默认模型」（L16） | `lib/schemas.js:239-259` presetDefaultSchema（main/subagent 双粒度） | ✓ |
| ①「新会话/切换预设即时跟随显示（打开即显示，无需先发消息）」（L16） | `lib/preset-defaults.js:5-6`（agent/created + agent-preset/selected 双事件播种）；`lib/client.js:4490-4538`（FIX-026 客户端直驱显示刷新——唯一路径，服务端 emit 死路径已删） | ✓ |
| ①「会话内手动选择永远优先（用户主权）」（L16） | `lib/preset-defaults.js:78-80` 主权规则（结构化保证：无用户模型变更监听、仅预设事件、已产出会话宿主锁定） | ✓ |
| ①「subagent 未配置继承主预设模型」（L16） | `lib/schemas.js:243-244`「未设置 = 继承 main」 | ✓ |
| ①「未配置的预设完全遵循 DSH 现行规则（零行为变化）」（L16） | `lib/schemas.js:253`「空 = 遵循 DSH 规则」；`lib/service.js:782`「无配置 = 直通」 | ✓ |
| ②「五种执行通路 chat/agent/cli/image/speech + 能力标签自动路由」（L17） | `lib/schemas.js:15-19` 五类型逐一对应；L65 能力标签为调度契约 | ✓ |
| ②「每个 agent 独立服务商与模型，未配置自动复用主 agent 模型」（L17） | `lib/schemas.js:12`「provider/model 都为空：完全复用主 agent 当前模型」 | ✓ |
| ③「ChatGPT 订阅经官方 Codex OAuth 通路一键授权登录」（L18） | `lib/schemas.js:191-196`（preset 'chatgpt-codex'，凭据 `$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`） | ✓ |
| ③「**v0.4.1 起**订阅模型可直接作为主模型——经宿主官方 openai-codex 路由」（L18） | `lib/host-route.js`（EVO-010 全模块：provider 目录路由不写 api 字段 + token 热注入 L2756 + parity 探活 L214-229 + 降级告警 L167-170）；CHANGELOG v0.4.1「新增·主模型宿主官方路由（EVO-010）」 | ✓ 版本归属正确（见下） |
| ③「模型选择器直接可选 gpt-5.6 系列订阅模型组」（L18） | `lib/client.js:1330` `PRESET_MODEL_DEFAULTS = ['gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna']`（EVO-008） | ✓ |
| ③「OAuth token 由插件自动注入刷新」（L18） | `lib/host-route.js` 唯一刷新者 + `lib/service.js:2756` 注入失败 warn 可观测 | ✓ |
| ③「订阅卡可随时切回『插件内置』通路」（L18） | `lib/schemas.js:146-148`（transport 'host'（默认）/'plugin' 双通路）；`lib/client.js:479-492`（通路开关 + 状态行四态） | ✓ |
| ③「订阅生图——draw 类 agent 绑定订阅账号即可出图（gpt-image 系模型透传）」（L18） | `lib/service.js:2869`（codex-responses image 分支 → runCodexResponsesImage）+ L3224-3231（gpt-image 系透传、非 gpt-image 自动换型并提示不静默替换） | ✓ |

**版本归属核验**：README 两处「v0.4.1 起」（L18 主模型 / L20 画布）与 CHANGELOG v0.4.1 版本说明一致——v0.4.0 候选（EVO-009/010）未及发布、并入 v0.4.1 一次发布（CHANGELOG L46「无 0.4.0 中间版说明」），故用户面「v0.4.1 起」是唯一正确口径。**无虚构功能、无过度承诺（P1 文档红线通过）**；L103-104 机制披露（不介入会话过程/串行化队列/全局默认写回恢复重试一次+高声告警/fire-and-forget 毫秒级窗口）与 `lib/preset-defaults.js:8-13,308-309` 逐条吻合。

### 重点 2 · 完整性（「多模态账号」拆分零丢失 / 排序 / 交叉引用）——PASS

- **内容零丢失**：原「多模态账号」能力面在编辑后仍全量在位——特性 L22「💳 多模态账号与账号池」（API Key 配置式添加 / 账号池策略 / v0.3.2 OAuth 入口移除披露）；使用指南 §4（L121-131）五小节完整（API Key 账号 / ChatGPT 订阅登录 / 子代理·无头 CLI / 自定义提供方 / 高级扩展·账号池+未入池 OAuth）；无头 CLI 独立特性 L21。三大功能升位为「主轴」属**新增强调**，未以删除旧内容为代价。
- **特性排序**：L16-18 前 three 条严格对应用户优先级 ①②③，余下按「路由 → 对话框图片 → CLI → 账号 → 统计 → 零配置」逻辑展开——排序合理。
- **交叉引用一致**：新特性 ①→§2（预设 Agent 默认模型）、②→§3（专业 Agent 配置）、③→§4 内「ChatGPT 订阅登录（一级，正式通道）」（L126）；§1 总览卡片顺序（L85-88：预设 Agent 第一张 → 专业 Agent → 多模态账号 → 统计）与 §2-§5 编号及新特性主次顺序完全对应。

### 重点 3 · 一致性（徽章 / CHANGELOG 语气）——PASS

- 版本徽章 L7 仍为 `v0.4.1`，`package.json:4` version `0.4.1`——未随 DOC-001 抢跑 bump（bump 归 REL-008）✓。
- 编辑段新增表述（订阅生图 gpt-image、openai-codex 官方路由、token 自动注入、插件内置通路保留、`/router-assets/` 画布、折叠+🖼）与 CHANGELOG v0.4.1 摘要/新增段（L10/L14-16）口径逐条同向，**无矛盾**；L126 风险披露句（「需自行知悉并承担平台服务条款与账号风控风险」）保留完好。

---

## 二、五维度结论（文档面快审适配）

| 维度 | 结论 | 依据 |
| --- | --- | --- |
| 正确性（表述忠实） | PASS | 第一节逐条 file:line 对照，13/13 相符 |
| 安全性 | PASS | 编辑段无密钥/token/端点泄露；风险披露句保留（L126）；「token 自动注入」为机制描述不含凭据语义 |
| 可维护性 | PASS | 三段编辑与全文既有术语/口径一致（「主 Agent/subagent/能力标签/通路」沿用 §2-§4 词汇）；交叉引用闭环 |
| 性能（相关声称） | PASS | L103「会话进行中零插件开销」有实现背书（`lib/preset-defaults.js:9` agent/request 监听已移除，`lib/index.js:261-262` 印证） |
| 测试覆盖 | PASS | README 机器守卫在位且未被编辑破坏：`tests/install-entry.mjs:230-231`（README 安装命令 ≥2 处 + 旧 irm\|iex 形态清除）——编辑三段均不触碰安装命令文本；Coordinator 复跑 smoke ALL PASSED exit 0（含 README 3 断言）采信入档 |

## 三、AI 专项检查（文档面适配）

| # | 检查项 | 结论 |
| --- | --- | --- |
| 1 | 虚构功能/幻觉能力 | 无——全部新表述溯源到实现（见第一节表） |
| 2 | 过度承诺 | 无——限定语完备（「v0.4.1 起」「订阅卡可切回」「未配置的预设零行为变化」）；已知行为披露段（L104）覆盖毫秒级窗口边界 |
| 3 | 未实现承诺 | 无——v0.4.2 在途项（路由体验优化等）未混入本版表述 |
| 4 | mock/占位残留 | 无 |
| 5 | 口径漂移（与 CHANGELOG/包版本） | 无——徽章=package.json=CHANGELOG 三方一致（0.4.1） |

## 四、发现列表

| # | 级别 | 位置 | 描述 | 建议 |
| --- | --- | --- | --- | --- |
| N-1 | P3 | README L5 | 简介段能力枚举由「视觉/图片生成/翻译/语音/cli 子代理」收敛为「视觉、翻译、语音、子代理**等**」——图片生成不再出现在简介句内（项目目标 L12「图片识别与生成」+ 特性 L18 订阅生图/L19 图片生成仍覆盖，**零实质丢失**） | 可选：如追求简介自含，可补「图片生成」一词；不改不阻塞 |
| N-2 | P3 | README L18 / FAQ L147 | 「切回『插件内置』通路」未披露 UI 提示中的细节：切换通路后**既有会话需在模型选择器手动重选模型组**（`lib/client.js:492` presetTransportHint 已披露） | 可选：L18 括注补一句；不改不阻塞 |

计数：**P0=0 · P1=0 · P2=0 · P3=2（讨论级台账）**

## 五、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁决 |
| --- | --- | --- | --- |
| P0 阻塞数 | = 0 | 0 | ✓ |
| 5 维度全覆盖 | 100% | 5/5 有结论 | ✓ |
| 发现逐条标注级别 | 100% | 2/2（P3） | ✓ |
| 设计一致性（审查基准比对） | 已完成 | 三大功能 vs 用户指令 vs 实现 三方对齐 | ✓ |
| AI 专项 5 项 | 全完成 | 5/5 | ✓ |

## 六、结论

## **APPROVED_WITH_NOTES**

**unresolved_blockers=0**

- 通过理由：三处定向编辑忠实承载用户基准（三大功能升为主轴、排序对齐优先级），全部新表述可溯源实现（13/13 file:line 相符），「多模态账号」拆分零内容丢失，交叉引用与版本面（徽章/package.json/CHANGELOG）三方一致，机器守卫断言面完好且 Coordinator 复跑 smoke ALL PASSED exit 0 互洽。
- 非阻塞备注：P3×2（N-1 简介枚举自含性、N-2 通路切换既有会话重选组细节）——均为可选润色，建议随本报告入台账，可在 REL-008 发布前小修批顺带消化，不构成本轮返工条件。
- 证据约束声明：本审查为只读现盘审查，未独立复跑命令；smoke 结果与 commit 归属采信 Coordinator 任务书；P3 两条均指向可复查事实（README 行号 + lib/client.js:492）。
