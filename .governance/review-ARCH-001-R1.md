# ARCH-001-REVIEW 审查报告（round R1）

| 项 | 值 |
|---|---|
| Task ID | ARCH-001-REVIEW |
| 审查对象 | docs/architecture-v3.md（851 行全文） |
| 审查人 | Design Reviewer Agent（subagent 9cf1485e，只读零修改；与 Architect 不同实例，即 Bar Raiser 独立评审映射，报告内显式声明） |
| Round | R1 |
| 结论 | **NEEDS_CHANGE**（1 BLOCKING / 5 WARNING / 6 SUGGESTION） |

## 硬门槛裁决

候选方案≥2 ✅ / ADR 字段完整 ✅ / 蓝军挑战≥3 ✅（BC-1~7）/ **无循环依赖 ❌（B-1）** / 接口契约 ✅（附 S-1/S-2）

## BLOCKING

- **B-1**（行 203-213）§4.2 依赖图与环分析自相矛盾：图含字面环 M5→M6→M8→M5、M2→M6→M8→M2、M5→M3→M2→M6→M8→M5，而环分析宣称"M2/M5 为叶、无环 ✓"与图矛盾（M2/M5/M8 均有图内出边）。按职责表意图结构无环（M2→M6 应为 M6→M2、M5→M6 应为 M6→M5、M5→M3 应为 M3→M5）——**文档级修正，非架构级缺陷**（故 NEEDS_CHANGE 而非 BLOCKED）。

## WARNING

- **W-1** 行 118/849 引用不存在的 §5.6（实质内容散落可复核）
- **W-2** M2 对未注册合法宿主 id 的 resolve/byId 行为未定义（跨轮指代闭环边界）
- **W-3** 物化缓存键未含会话作用域（跨会话路径泄漏风险，违自身安全线）
- **W-4** Step 5 单 commit 爆炸半径最大 + Step 6→Step 3 依赖未显式
- **W-5** 模态矩阵 image 行需 cap 与现状 type=image 无条件纳入（service.js:1804）存在配置兼容差异（用户决策面）

## SUGGESTION（6 条）

S-1 imageMemory 接口签名；S-2 错误码补 read 失败/文本内联码；S-3 uploadFile 表述/命名规则；S-4 D-1-3 直答与 D-1-5 统计范围；S-5 R-2/R-4 历史图分支限定；S-6（见原文）。

## 重点审查结论

a) 迁移路径无隐藏大爆炸（Step 5 例外，W-4）；b) 编址层物化失败/工作区外/超限三边界闭环（BC-5 + PATH_OUTSIDE_WORKSPACE + FILE_TOO_LARGE），未注册宿主 id 为缺口（W-2）；c) DEC-007 一致性 ✅（否决机制未重新引入）；d) D-1 五条指标均可测试可观测（D-1-2 绑定 keepOriginalImages 短路 index.js:2442-2452 实核）；e) V-DSH-1~6 验证方法可执行 + 证伪降级路径完备。抽查取证 43 处全部支撑（唯一未亲核：dsh-agent-loop README.zh.md:52，延续二级事实）。

## 复审安排

返工范围：B-1 + W-1/W-2/W-3 + W-4（文档级）；W-5/S 级与 D-1 定稿属用户决策面（Coordinator ask_user_question）。返工后同一 Reviewer R2 复审（逐条比对已修复/未修复/新引入）。
