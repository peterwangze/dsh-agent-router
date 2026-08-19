# ARCH-001-REVIEW R2 复审报告

| 项 | 值 |
|---|---|
| Task ID | ARCH-001-REVIEW-R2 |
| Round | R2（前轮引用：.governance/review-ARCH-001.md R1，NEEDS_CHANGE） |
| 审查对象 | docs/architecture-v3.md（返工后 885 行） |
| 审查人 | Design Reviewer Agent（subagent 9cf1485e，同一实例复审，只读） |
| 结论 | **APPROVED_WITH_NOTES**，`unresolved_blockers=0` |

## 逐条比对（R1 全部 12 findings，独立验证不采信自报）

| R1 项 | 裁定 | 验证 |
|---|---|---|
| B-1 依赖图矛盾 | ✅ 已修复 | 自行画图验证：出边矩阵+可达性终止检查，M2/M5 无出边、无回边、环分析四链与图一致 |
| W-1 §5.6 悬空引用 | ✅ 已修复 | grep 零残留 |
| W-2 未注册 id 行为 | ✅ 已修复 | 懒注册降级闭环（byId/materialize/resolve + 错误码 + §5.1 + §4.4.3 跨轮指代） |
| W-3 缓存会话作用域 | ✅ 已修复 | sessionId\0id 键 + 三处同步 |
| W-4 Step 5 爆炸半径 | ✅ 已修复 | 5a/5b/5c 拆分（零影响/功能等价/零影响回滚）+ Step 6 依赖显式 + 9 处交叉引用同步 |
| W-5、S-1~S-6 | 未修复（用户决策面，不阻断） | 未升级 BLOCKING |

## 新引入

- **N-1（WARNING）**：BC-7（行 800）挑战前提"跨会话共享 imageMemory/物化缓存"未随 W-3 同步（物化缓存已会话隔离）——缓解实质仍成立，建议措辞限定为 imageMemory 描述共享。

## 硬门槛复核

候选≥2 ✅ / ADR 字段 ✅ / 蓝军≥3 ✅ / 无循环依赖 ✅（R1 唯一 BLOCKING 消除）/ 接口契约 ✅。行号偏移检查：约 40 处 lib/tests 引用保持 R1 验证值。

## 备注跟踪（不阻塞）

N-1（BC-7 措辞）、S-1~S-6、W-5、V-R2（宿主 readImage 入参形状——懒注册实现依赖，实现前验证）、V-DSH-1~6。D-1~D-5 交用户（Coordinator ask_user_question）。
