# Governance Bootstrap（DSH — 强制）

> @bootstrap-version: 0.83.0
>
> 本文件是 software-project-governance 工作流在 DeepSeek Harness 上的项目级原生入口（thin pointer）。dsh 会把本文件自动注入到以本项目为工作区的每个会话。完整规则在 `software-project-governance` skill 内；本文件不重复 workflow 规则。

治理插件仓库根目录：`D:/AI/agent/claude/coding/project_management_workflow`（下称 `<plugin_root>`）。

## 第一动作（每会话）

1. 若会话 skill 目录中有 `software-project-governance` → 调用 `skill` 工具加载它。`skill` 返回的 resourceBase 即该 skill 所在目录（`<plugin_root>/skills/software-project-governance`）。
2. 用 `pwsh` 执行：

   ```powershell
   python "<plugin_root>/skills/software-project-governance/infra/resolve_entry.py" --json
   ```

3. `resolved_root_ok == false` → MUST STOP，展示 `diagnostic`，不呈现治理状态（DEC-080 / RISK-038 fail-closed）。
4. 无该 skill → 提醒用户安装治理预设（`python "<plugin_root>/adapters/dsh/launch.py" --install`），本会话降级为普通任务执行，不宣称治理生效。

## SELF-CHECK（任何输出之前自问）

1. 读了 `.governance/plan-tracker.md`？否 → 立即停止，先读。
2. 知道当前阶段/Gate/模式？否 → 读 plan-tracker `## 项目配置`。
3. 即将输出问句（吗？/？/要不要/是否）？→ 删除问句，改用 `ask_user_question` 工具。
4. 到达交互边界（呈现选项/完成工作单元/用户需选择）？→ MUST `ask_user_question`。
5. 任务标记已完成，或收到含 NEEDS_CHANGE 的审查结论 → 复审与推荐是 MUST 义务（关键行为契约：复审必达 / 完成必推荐 / 选项必带依据——加载 skill 后见 SKILL.md「关键行为契约」段）。

## 模式确认（每次会话一句，模式自适应）

- **always-on** → `Governance: {trigger_mode} x {permission_mode} | stage: {stage}, Gate {gate}: {status}, {risk_count} risk(s)`
- **on-demand** → `Governance: on-demand x {permission_mode}`（仅用户显式调用时展开完整状态）
- **silent-track** → 不输出治理面板/风险统计/任务进度表

## Agent Team（DSH 映射）

- 用 `subagent` 工具 spawn 角色 agent。角色定义在 `<plugin_root>/agents/<role>.md`；调度模板在 `<plugin_root>/skills/software-project-governance/references/agent-dispatch-template.md`。
- 所有用户交互通过 `ask_user_question`；sub-agent 不与用户直接交互。

## Git hooks

`.git/hooks/{pre-commit,commit-msg,post-commit}` 缺失 → 提醒一次性安装：

```powershell
Copy-Item "<plugin_root>/skills/software-project-governance/infra/hooks/*" .git/hooks/
```

## 版本升级（DSH 无 /plugin update 概念）

```powershell
git -C "<plugin_root>" pull; python "<plugin_root>/adapters/dsh/launch.py" --sync
```

下次会话自动完成其余升级动作。

## 项目质量原则（project-principles 投影）

> 权威源：`.governance/project-principles.md`（**P-v3**，DEC-016 立版 / DEC-022 升级 / DEC-028 升级）——本段为其会话级投影；修改以权威源为准并同步本段。与治理工作流叠加生效，冲突时以更严格者为准。

**原则**：
1. 分析和推演需要基于事实，不允许假设和编造
2. 实现需要进行全面的分析，避免修改遗漏
3. 实现需要考虑对原有功能的影响，避免引入新问题
4. 实现需要进行测试看护，构建防护网，避免后续问题反复（**P-v2 强化**：产品代码变更 MUST 跑全量测试网并汇入门控命令，零回退）
5. 实现需要考虑泛化性，严禁单点修改（**P-v3 强化**：同一动作的多触发来源 MUST 汇入同一实现路径；被取代的旧路径 MUST 删除，禁止并存）
6. 以高质量交付为准则，严禁为了完成任务而忽略质量
7. 修复要保证安全性，避免引入导致损坏用户数据的情况（**P-v2 强化**：数据删除/覆盖路径 MUST 不可逆保护 + 旁路路径判别测试）
8. （**P-v2 新增**）失败与降级 MUST 可观测——任何失败/能力判定缺失/降级路径 MUST 产生明确诊断事件或错误信息，禁止无观测吞错
9. （**P-v2 新增**）宿主演进防御——对宿主（dsh-llm/pi-ai/dsh-attachment）接口与能力判定的依赖 MUST 具备能力自证或 parity 守卫，禁止单向信任宿主行为
10. （**P-v3 新增，指令式**）用户报障受理与验证纪律：①用户报障即受理，先排查自身缺陷，禁止要求用户自证操作；②机器可完成的验证禁止转嫁给用户——复现/取证必须用探针、日志、API 自行完成；③显示层验收必须包含真机显示证据，API 状态层验证不得替代 GUI 验收；④测试桩的宿主面形态必须锚定宿主源码（行号或导出名），禁止按心智模型伪造宿主面；⑤场景覆盖必须包含用户使用视角的基础场景（老会话、重启恢复、快速连续操作、目标值等于默认值），不得只覆盖实现主线

**编程要求**：
1. 设计需要考虑可扩展性和可维护性，需要基于未来进行设计
2. 实现需要避免架构腐化，避免引入架构问题和可维护性问题
3. 实现需要保证模块/类/接口的职责单一，避免引入上帝类/上帝模块和多功能接口
4. 实现不要搞任何冗余的修改，保持修改的纯粹性，一个 commit 承载一个问题修改/功能实现

审查结论 MUST 标注违反条目（如 `P4-violation`）；原则演进走 decision-log + 权威源版本化（P-vN），质量基线只升不降。
