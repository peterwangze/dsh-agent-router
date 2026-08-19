## Governance Bootstrap（由 software-project-governance 插件注入）

> @bootstrap-version: 0.74.0（模板最低引导版本——低于 SKILL frontmatter active_version 即陈旧，先升级本段再继续）

### 每次会话第一动作
读取 `.governance/plan-tracker.md`，确认当前阶段、Gate 状态、活跃风险。如 `.governance/` 不存在，提醒先初始化。

触发模式行为：
- always-on → 执行完整检查，治理面板可正常输出
- on-demand → 仅读 plan-tracker，治理面板仅在用户显式调用时展开
- silent-track → 后台跟踪，仅在 Gate 失败或风险 escalation 到期时打断

操作权限模式行为：
- maximum-autonomy → 除关键决策外一切操作自动执行（含 git commit+push）
- default-confirm → 危险操作（push --force/reset --hard/rm -rf/API 调用/数据库变更）需确认

治理开关——用户随时动态切换：
- "切换到最高权限模式" / "切换到默认确认模式"
- "切换到始终在线" / "切换到按需调用" / "切换到静默跟踪"
- "当前模式" → 输出当前 trigger_mode × permission_mode

每次会话输出一句确认（模式自适应）：
- always-on: `Governance: {mode} | stage: {stage}, Gate {gate}: {status}, {risk_count} risk(s)`
- on-demand: `Governance: on-demand x {permission_mode}`
- silent-track: 不输出

**治理数据归档**（版本 bump / 发布收尾后自动触发）:
运行 `python <plugin_home>/infra/archive.py migrate --auto --dry-run` 检查持续归档触发器（`<plugin_home>` 来自 resolve_entry.py）:
- 首次迁移: archive/index.md 不存在 AND plan-tracker > 80KB AND ≥2 已发布版本
- 发布强制: 新版本标记已发布后，除最新已发布版本外仍有热文件历史 task
- task 增量: 可归档 completed task 达到阈值
- 90 天兜底: 长期未归档且仍有可归档历史数据
→ dry-run 显示需要归档: 运行 `python <plugin_home>/infra/archive.py migrate --auto`，再运行 `python <plugin_home>/infra/verify_workflow.py check-archive-integrity`
→ 归档完整性失败: 阻断发布完成 / Gate 完成

- IF .governance/archive/index.md 存在 → 已归档条目可通过索引查询
- 交叉验证时: 归档文件中的证据 = 有效证据——不可误判为缺失

### 干活前检查
- 这个任务在计划跟踪表里吗？不在就先入账
- 做完后需要补什么证据？先想清楚
- 这个任务会不会影响别的阶段？影响就先记风险

### 提问规则（强制）
AskUserQuestion 是唯一合法的用户提问方式。禁止内联文字提问。

永远停下来用 AskUserQuestion 的关键决策：
- 范围变更 / 架构决策 / 发布决策 / 风险接受 / 外部依赖变更 / Profile 或模式变更 / 阶段跳跃

自动执行不提问：
- 任务排序 / 证据格式 / git commit / 治理记录更新 / 微小实现选择 / Gate 自评（仅失败时告知）

### 收工前检查
1. 输出本轮完成事项摘要
2. 补证据到 `.governance/evidence-log.md`
3. 用 AskUserQuestion 确认下一步优先级

- 完整治理交互（状态/恢复/升级/异常修复）→ 使用 /governance 命令

### 详细规则
完整行为协议见 `software-project-governance` skill。以上规则不依赖 SKILL.md 加载。
