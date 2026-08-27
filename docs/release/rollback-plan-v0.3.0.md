# v0.3.0 回滚方案（Rollback Plan）

| 项 | 值 |
|---|---|
| 发布版本 | v0.3.0（candidate） |
| 回滚目标 | v0.2.1（2026-08-22 tag `a1ab717`，REL-001） |
| 可逆性分类 | **可逆-中风险**（Amazon 分类）——无 Schema 迁移、无不可逆数据变更；但存在缺省开启的数据落盘行为（C-3）与 revert 顺序约束（FIX-006），回滚需按本方案顺序执行 |
| 预计回滚时间 | 用户层 kill-switch **秒级**；数据层 **< 1 分钟**；代码层 revert + 复验 **分钟级**（< 15 分钟，含测试网复跑） |
| 关联文档 | `docs/release/release-checklist-v0.3.0.md`（第三步 + §冷装 runbook）/ `docs/release/feature-flags-v0.3.0.md`（关闭验证语义） |

---

## 回滚触发条件（发布后 48h 观察期）

1. 出现 P0/P1 级新 bug（回归、崩溃、核心通路失效）；
2. C-1 首联/带图调用在授权成功后失败（GATE-1 已验证路径复现断裂）；
3. 宿主 dsh-* 再漂移（rc.8→rc.9+）致适配断裂（RISK-003——parity 复跑变红即触发）；
4. 统计落盘损坏且自愈失效（数据安全四件套兜底失败）；
5. OpenAI 侧收紧（R-E1：client/端点/风控变化致通路不可用或风险升级）；
6. 用户主动要求回退。

> **发布后 CHANGELOG 勘误惯例（BC-A1 缓解）**：发布后如需修正/追补已发布节（已知问题追补、措辞勘误等），按 Keep a Changelog 惯例允许 post-release 修正——以新增提交单独留痕，不重写已发布版本节的历史事实；重大改口（如功能预告顺延）同时走变更控制入账。

## 回滚总览（三层，由快到慢——先止血再动代码）

| 层 | 动作 | 生效 | 耗时 |
|---|---|---|---|
| ① 用户层（止血） | `router.oauthExperimental=false`（或总开关 `router.enabled=false`） | 立即 | 秒级 |
| ② 数据层（撤销数据面） | 登出删除 ChatGPT 凭据（W-5）；`router.stats.persist=false` 回纯内存；清空统计（软删除 backup） | 重启/即时 | < 1 分钟 |
| ③ 代码层（版本回退） | git revert 至 v0.2.1 语义（**含顺序约束，见下**）/ 安装态重装 v0.2.1 | 版本面 | 分钟级 |

---

## 场景 A：用户层 kill-switch（秒级止血，无需回滚）

### A-1 实验通路开关（C-1 面）

- **操作**：设置 → Agent 路由 → `router.oauthExperimental=false`（缺省即 false——升级用户若从未开启则无需任何操作）。
- **效果**：preset 入口隐藏 + preset 调用明确报「实验通路已关闭」；1455 零监听（惰性启动语义，DEC-021——未发起登录不占端口）；既有 OAuth 通用账号（tokenRef 粘贴）、API Key 账号、其它通路零影响。
- **验证语义（「验证过可以」，非「应该可以」）**：
  - 门控前置链经 EVO-005 R0 门控一致性裁决：`oauthExperimental → ToS 复核 → starter → loopback` 严格前置，kill-switch 纯粹性保持；
  - 关闭态断言（oauth 域）入 smoke.mjs，M-3 复跑 exit 0 = 复核证据（GATE-3）；
  - 服务端复核：手改配置绕过 ToS 弹窗也不能发起登录（schemas.js:224-228 注释语义，oauthBegin preset 分支复核）。

### A-2 总开关（全域）

- **操作**：`router.enabled=false`。
- **效果**：`route_agent` 拒绝调用、路由提示不注入、统计暂停；配置与数据零删除。
- **验证**：smoke 既有断言覆盖（v0.2.0 EV-013/EV-019 先例，持续复跑）。

### A-3 统计落盘开关（C-3 面）

- **操作**：`router.stats.persist=false`。
- **效果**：回纯内存态（= v0.2.1 行为）；false 期间不读不写磁盘；**往返不损已落盘数据**（W-4 语义：开→关先 flush；关→开空内存全量恢复磁盘聚合 + 重建索引——单测覆盖，M-3 随 GATE-4 复跑）。

## 场景 B：数据层回滚（撤销 v0.3.0 数据面）

### B-1 ChatGPT 凭据删除（W-5 三层联动）

- **操作**：账号卡「登出并删除凭据」。
- **效果**：删凭据文件（`$DSH_HOME/dsh-agent-router/chatgpt-codex-auth.json`）+ 清 oauthAccounts 条目 + 清池引用——三者联动，不留孤儿。
- **验证语义**：
  - 登出后凭据文件不存在断言（EVO-002 R7/R8 审查链）；
  - 登出×兑换竞态（TOCTOU）已修复并验证：REL-003 dcd44fa——persist 前 cancelled 复查 + smoke 5b 竞态判别测试（真实构造交错，三重判别：登出后零 login_ok / status=cancelled / 旅程序断言），R0 复核「F-1 修复忠实度 ✅」。
- **注意**：若走代码层回滚（场景 C）前未登出，回滚后凭据文件将残留磁盘（v0.2.1 代码不读不写该文件，无功能影响）——**回滚 runbook 步骤 0 即先行登出删除**。

### B-2 统计数据撤销

- **操作（二选一）**：
  - 保留数据仅停落盘：`stats.persist=false`（见 A-3）；
  - 清空统计：统计面板「一键清空」——软删除 backup 机制（EVO-003 数据安全四件套：原子写/损坏自愈/版本迁移/清空保护），误清可从 backup 恢复。
- **验证**：stats 域单测（110/0 基线，M-3 复跑）；清空保护断言（P7 数据删除不可逆保护——旁路路径判别测试）。

## 场景 C：代码层回滚（仓库侧，分钟级）

### C-0 前置步骤（顺序强制）

1. **先执行场景 A-1/A-2**（关 flag 止血——避免 revert 过程中实验通路仍可触发）；
2. **再执行场景 B-1**（登出删除凭据——避免回滚后残留）。

### C-1 revert 范围与**顺序约束（核心）**

> **FIX-006（undici 依赖声明）revert 不可单独于 OAuth 面执行。**
>
> **事实依据**：FIX-006 修复的是「OAuth 代理路径在发布环境必失败」（package.json 无 undici 声明 → `import('undici')` fail-loud 报 Cannot find package——service.js loadOauthProxyDispatcher 语义）。若单独 revert FIX-006（bef08eb/6a7ba76）而保留 C-1 OAuth 面，则任何开启 `oauthExperimental` 并配置代理的用户立即回到「调用必失败」状态——**回滚本身制造必败态**。
>
> **正确顺序**：undici 声明 revert 仅当 OAuth 面整体回退（C-1 全量 revert 或 preset 分支下架单 commit——R-E1 最坏回退路径）时一并执行——此时 undici 声明失去唯一消费者，revert 无副作用。**proxy 分支下架单 commit 优先于大范围 revert**（ADR-005 可逆性：最小回退面）。

### C-2 回滚操作（按故障范围选择）

| 故障范围 | 回滚动作 | 验证 |
|---|---|---|
| 仅 C-1 实验 | `oauthExperimental=false`（场景 A-1）即视为 C-1 面下线；如需代码面下架：revert EVO-002 Step 5-7 + EVO-005 + REL-003 代码段（**含** FIX-006 undici——见顺序约束） | oauth 域断言（关闭态）+ smoke 全量 |
| 仅 C-3 统计 | `stats.persist=false`（场景 A-3）即回 v0.2.1 行为；代码面回退：revert EVO-003/EVO-004（1199c0b/c2d01ea + 7 commits）——**与 OAuth 域无功能耦合（统计行为与 OAuth 通路互不依赖），但非零代码交织**：EVO-004 两提交涉 service.js 代理缓存区/预设卡判据（dd5d310/d8ee97c），独立 revert 需按文件级冲突评估（R1 ReleaseF-5 精度修正） | stats 域 110 断言 + client-render |
| 全量回退至 v0.2.1 | **直接切 tag（首选）**：`git checkout v0.2.1`；或反转提交：`git revert a1ab717..HEAD`（范围按正向书写 旧→新——反向写法为空集，v0.2.0 R-W3 修正先例；执行前 `git log --oneline v0.2.1..HEAD` 复核实际拓扑——**commit 清单以 git 实采为准**） | 全量测试网五套件（v0.2.1 基线形态）+ tarball 重打包冷装（runbook 同 release-checklist §冷装） |
| undici 代理面异常（非 OAuth 域） | **禁止单独 revert FIX-006**——先 A-1 关实验通路（undici 消费者归零），再评估 undici 域修复（前滚修复优先于回滚） | 代理路径判别断言（FIX-006 四件） |

### C-3 治理记录保护

v0.2.1 以来 main 含治理记录提交（.governance/）。全量 revert 会一并回退——如需保留治理记录仅回滚产品代码：revert 后单独恢复（`git checkout <回滚前最新治理提交> -- .governance/`）或仅对产品代码路径执行 revert（v0.2.0 先例）。

## 场景 D：安装态回滚（用户侧，无需 git）

1. 重新安装 v0.2.1：离线——下载 `dsh-agent-router-v0.2.1.tar.gz` → 解压 → `install.ps1 -LocalPath .` / `install.sh --local .`；在线——安装命令版本固定位改为 `v0.2.1`（README「固定版本」写法）。
2. **先在 v0.3.0 环境登出删除 ChatGPT 凭据**（B-1——避免文件残留）。
3. 重启 DSH。
4. 验证：统计回到内存态（重启清零 = v0.2.1 已知行为）；agent/账号配置仍在（存于 DSH settings，不随插件回滚丢失）；已落盘统计 JSONL 文件保留在 `$DSH_HOME/dsh-agent-router/`（v0.2.1 不读不写，无冲突；用户可手动删除）。

## 影响评估

| 维度 | 评估 |
|---|---|
| 数据迁移 | 无 Schema 迁移；C-3 落盘为追加式 JSONL（v0.2.1 代码不读不写该目录——回滚无兼容冲突） |
| 凭据文件 | 回滚前登出删除 = 零残留（B-1 强制前置）；未登出则残留磁盘（无功能影响，可手动删） |
| 统计数据 | 已落盘按天 JSONL 保留（回滚不删数据——安全侧默认）；`persist=false`/回滚后回内存态；**90 天保留期清理机制随 v0.3.0 代码退场而停止生效——已落盘文件保留直至手动删除**（R1 F-7 显式化） |
| 用户配置 | agent/账号/池配置存于 DSH settings——不随插件回滚丢失；`oauthExperimental` 为 **v0.2.1 既有键**（回滚后语义 = v0.2.1 的不可见预置门控，非未知字段——R1 ReleaseF-5 精度修正）；v0.3.0 新增键（`stats.persist`、`oauthTosAccepted`、`oauthProxyUrl`）在 v0.2.1 schema 下为未知字段——容忍（schemastery 未知字段兼容，不阻塞启动） |
| 回滚代价 | 丢失 v0.3.0 全部新能力（C-1 一键登录/设备码/账号卡；C-3 持久化/按天视图/CSV 导出；FIX-004/005/003C 修复），回到 v0.2.1 行为基线（含其已知问题：统计重启清零） |
| 额外损失 | 无——git revert / tag checkout 为机械操作（执行前确认工作区干净）；治理记录保护见 C-3 |

## 验证方式汇总

| 维度 | 验证方式 | 状态 |
|---|---|---|
| kill-switch 门控面（A-1/A-2） | smoke oauth 域断言（oauthExperimental=false：入口不可见/调用报错/零监听）——M-3 复跑 exit 0 | ✅ **已验证**（EVO-002 R1-R8 + EVO-005 R0 门控一致性 + REL-003 R0；持续复跑机制在案） |
| 登出删除（B-1） | 登出后凭据文件不存在断言 + 竞态判别测试（登出后零 login_ok） | ✅ **已验证**（EVO-002 R7/R8 + REL-003 dcd44fa/R0 复核） |
| stats 往返（A-3/B-2） | W-4 往返语义单测（开→关 flush / 关→开全量恢复）+ 数据安全四件套单测 | ✅ **已验证**（EVO-003 R1/R2——stats 110/0，M-3 复跑） |
| git 层回滚（C） | 回滚后全量测试网（对应基线形态）+ tarball 重打包冷装 | 程序已定义；机械操作，观察期触发时执行并记录 |
| 安装态回滚（D） | v0.2.1 tarball 重装 + 重启 + 行为核对 | 程序已定义；与 v0.2.1 发布时已验证的离线安装流程一致 |

> 注：三层中用户层/数据层验证语义均为「验证过可以」（断言在案 + M-3 复跑机制）；git/安装态为机械操作，验证程序已定义，触发时按本方案执行并记录（v0.2.0 先例口径）。
