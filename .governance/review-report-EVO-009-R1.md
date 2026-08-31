# Review — EVO-009 R1（同域收尾复审终态）

- **Round**: R1
- **Task**: EVO-009 — ChatGPT 订阅 OAuth 账号注册为宿主 llm provider（主 agent 模型选择器直选）
- **Commit（本复审范围）**: `a410a52`（FIX-016 mapTools 顶层形状修复 + F16-1~5 判别 + F15-1~6 warn 判别补充），base 13cd084
- **前轮引用**: `.governance/review-report-EVO-009-R0.md`（R0 详细报告：P2-1 attributionHeaders / P3-1~6）
- **审查者**: Code Reviewer（R1）
- **日期**: 2026-08-30
- **范围说明**: 纯只读 + 本报告文件；无命令面。

## R0 findings 逐条比对

| R0 项 | 状态 | 证据 |
|---|---|---|
| **P2-1**（请求头未携带宿主 attributionHeaders()，建议合并或明示接受） | **未修复（遗留建议，维持台账）** | 本 commit 不涉请求头（oauth-llm.js:319-327 未变）；R0 已列遗留台账，建议级不阻塞 ✓ |
| **P3-1**（MVP 聚合非真流式） | 未修复（讨论项维持） | 语义不变 |
| **P3-2**（guard 失败无恢复监听） | 未修复（讨论项维持） | 与 wrapper 先例一致 |
| **P3-3**（reasoningEffort 拒绝语义） | 未修复（讨论项维持） | 契约行为 |
| **P3-4**（oauth-llm 侧 warn 无独立断言） | **已修复** | F15-1~6（tests/oauth-main-model.mjs:252-287）：注册不注册 + warn 发出 + 去重（F15-3）+ 保存后注册与签名复位（F15-4）+ 空态复发重告警（F15-5）+ 未登录不告警（F15-6，loginFailMode 模拟 resolvePresetCredential 抛错）——与我 R0 审查的 warn 逻辑（签名去重 + 三条复位）逐条对应 ✓ |
| **P3-5**（image 能力声明过宽） | 未修复（讨论项维持） | 注释辩护成立 |
| **P3-6**（测试覆盖缺口：多工具并发等） | 部分未修复（讨论项维持） | F16-1~4 补了「多工具项透传」形状面（2 项 tools），SSE 双 function_call 并发仍无直接断言（讨论项维持） |

## 本 commit 引入面（FIX-016）核验

- 详见 `.governance/review-report-FIX-016-R0.md`（同轮主报告）：取证链三方实读印证（dsh-tools :848-851 / dsh-system-prompt :254-258 / dsh-llm-pi-ai :1123-1128）；mapTools 顶层形状修复与端点契约对齐；F16-1~5 判别 + images/system/call_id 三处同源自查；终态完整性抽查通过。
- 无新引入：修复局部（mapTools 单函数 + 测试），无新状态/新依赖/新注释偏差。

## 结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- P0=0 / P1=0 / P2=1（遗留建议：attributionHeaders，有台账）/ P3=5（讨论项维持，其中 P3-4 已闭合）
- EVO-009 域终态：R0 阻塞为零；唯一 P2 建议项（attributionHeaders）遗留台账持续跟踪，不阻塞；FIX-015 修 1 判别补充（F15-1~6）与 FIX-016 修复均核验通过；复审链可关闭。
- 遗留台账：P2-1（attributionHeaders）延续至发布收尾评估。
