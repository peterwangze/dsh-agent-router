# REL-006 R0 发布审查报告——v0.3.3 发布段（E-5 前最后门禁）

| 项 | 值 |
|---|---|
| 任务 | REL-006（v0.3.3 发布链）发布段审查 |
| 轮次 | R0（首发审查——本发布链无前轮） |
| 审查人 | Release Reviewer（独立 subagent） |
| 日期 | 2026-08-30 |
| 审查对象 | 7fdab39（E-1 bump+CHANGELOG+README）/ e16d710（FIX-014 files 7→12 + 勘误）/ 7119401（E-4 治理入仓 21 files）+ E-1~E-4 门禁证据 |
| 审查方式 | 只读：read/grep/glob + `.git/` 文件级读取（logs/HEAD reflog、refs/tags）——**零命令执行、零既有文件修改**（角色硬约束 Bash/Write/Edit 禁限遵守） |
| 采信声明 | E-2 门控 15/15 @ e16d710 与 E-3 终版冷装（tgz 1,544,611B / 完整 ESM import 冒烟 OK keys=5 / 版本 0.3.3）为 Coordinator 派发单所附事实锚点，本审查采信并逐条标注（见清单第 6 项与 N-2） |

---

## 一、发布检查清单逐项裁决

### 1. 版本号 bump + README 同步 —— **PASS**

- `package.json:4` version = **0.3.3** ✓
- README `0.3.3` 出现 **8 处**（7 行）：L7 徽章 / L35 安装命令版本示例 / L39 发行包链接（URL 内 ×2）/ L44/L45（tar 命令对）/ L51/L52（另一 OS 路径命令对）——与派发单「8 处」精确一致 ✓
- README `0.3.2` 残留 **3 处**：L20 / L111 / L129——全部为「v0.3.2 起…」历史行为披露（OAuth 官方入口移除口径），非版本失同步 ✓
- 发行包链接 L39 指向 `releases/download/v0.3.3/...`——E-5 发布后即有效（历版先例同构）✓

### 2. CHANGELOG v0.3.3 段完整性 —— **PASS**（附 F-1 WARNING）

- 四任务 + FIX-014 全覆盖：修复 ×4（FIX-011 L14 / FIX-012 L15 / FIX-013 L16 / FIX-014 L17）+ 变更 ×1（EVO-008 L21）✓
- PATCH 论证 + MINOR 反论否弃（L37，v0.2.1/v0.3.2 PATCH 先例援引）✓——FIX-012「自动接管」属 fix-vs-feature 边界案，论证（恢复被拦能力、默认值调整非新能力面）成立且已披露
- 发布范围三分账见清单第 5 项；破坏性变更四证见 no-overclaim 表（①论据句陈旧 = F-1）；已知问题 5 项延续（CI 缺 / FIX-008 显示层域 / 端点挂起 / picked 盲区 / 接管语义边界 P3）✓

### 3. no-overclaim 核验 —— **PASS**（附 F-1）

对照表见第二节。FIX-012 五项行为披露（贴图即切 / 发送后保持 / 移除不还原 / 无图不切 / 手动尊重）README L131 与 CHANGELOG L15 **逐项一致**，且「移除未发送图片不自动切回」的偏差面两处均如实披露（EV-095 宿主行为实证支撑：selectModel 对会话图片零校验，强还原将置在途图片轮于 UNSUPPORTED_CONTENT 风险）✓

### 4. 回滚方案存在性 —— **PASS**（附 N-3）

- 回滚锚点在位：`.git/refs/tags/v0.3.2` 存在（annotated 对象 a990bbb，包装 commit d63b368——与 CHANGELOG/tracker 口径一致）✓
- 回滚代价：破坏性四证结论成立（依赖/配置/数据面零变更）→ **纯代码回退、零数据迁移**；回退路径 = git revert / 源码或 junction 开发树 checkout v0.3.2（用户实机为 junction 安装——OPS-001，全部文件在位，回退即 git 动作）✓
- 回滚危险点已披露：**v0.3.2 tarball 本身不可用**（FIX-014 缺陷）——CHANGELOG L17 勘误披露「v0.3.0~v0.3.2 tarball 安装用户请升级 0.3.3；junction 开发树不受影响」已隐含「回滚勿走历史 tarball」口径 ✓
- N-3（P3）：建议后续版本补一句显式回滚口径（「回滚 = 源码/junction 回退至 tag v0.3.2；勿安装 v0.3.2 tarball——已知 FIX-014 缺陷」）；非本版阻塞——关键事实（历史 tarball 不可用）已在同一文档更显著位置披露

### 5. 发布范围一致性 —— **PASS**（附 N-1）

reflog（.git/logs/HEAD L244-256）实采 `d63b368..HEAD`（=7119401）物理 **12 commits，全部归属清楚，零范围漂移**：

| 归属 | commits |
|---|---|
| 产品（CHANGELOG 计入 8） | 5e15c43 FIX-013 / 52331a8 FIX-011 / c3831b4 FIX-012 / 922c74f EVO-008 / 4f26846 FIX-012 镜像 / 5f68c17 FIX-012 P2-1 / 785dc1e EVO-008 P2-1 / e16d710 FIX-014 |
| 治理（CHANGELOG 计入 2） | b796741 / 3e878b9（REL-005 E-8 尾账，归属 v0.3.2 链） |
| 发布链自身（口径排除 2） | 7fdab39（本版 bump 提交）/ 7119401（E-4 治理入仓——CHANGELOG 尾句「本版治理提交（发布链）随发布入仓」覆盖） |

- N-1（P3）：CHANGELOG L38「`git rev-list --count d63b368..HEAD` 实采 = 10」仅在其书写时点（HEAD=7fdab39）成立；终态物理计数 12。排除口径与 v0.3.1 先例一致（f7dbf5c bump 提交同样不计入本版三分账），但 v0.3.2 对同类差额有显式「口径注记」（计数 15 差 1——4ee80e9 归属 v0.3.1），本版缺对应注记（差 2：7fdab39/7119401）。用户面语义无损（8 个产品 commit 在本节语义全覆盖），不阻塞；建议 v0.3.4 或勘误时补注

### 6. 门禁证据链完整 —— **PASS**（附 N-2）

- 代码审查链：四任务 R0 全 APPROVED_WITH_NOTES/0 + FIX-012/EVO-008 R1 复审 APPROVED_WITH_NOTES/0——六信封在案（review-{FIX-011,FIX-013,EVO-008}-R0 / review-{FIX-012,EVO-008}-R0+R1）+ 六份完整报告（review-report-*），EV-097/098 机录佐证 revisit_required=false ✓
- 门禁：EV-098 15/15 套件 exit 0（785dc1e 时点）+ Coordinator 锚点「15/15 @ e16d710 复跑」采信——e16d710 相对 785dc1e 仅增 package.json files 数组与 CHANGELOG（非运行面），复跑结论可信 ✓
- E-3 终版：Coordinator 锚点采信（npm pack 1,544,611B——较 EV-100 修复前 1,504,468B 增 ~40KB，与 +5 lib 模块体量自洽；隔离安装 exit 0；完整 ESM import 冒烟 keys=5；版本 0.3.3）✓
- 发布授权链：EV-099（用户真机四项全过「都OK了」+「先验证后发布」裁决→条件满足）✓；TRIAGE-REL-006 / TRIAGE-FIX-014 机录在案 ✓
- N-2（P3）：evidence-log 现止于 EV-100（「发布阻塞处置中」，E-3 复跑为前瞻表述）——**E-2@e16d710 复跑与 E-3 终版通过的 EV 行尚未落账**。与 REL-005 先例一致（发布链全记录随收尾 EV-092 入账），非阻塞；**E-6 收尾 MUST 补记**（E-2 终版复跑 / E-3 终版冷装 / E-5 tag+push+Release / 本审查 R0 机录）

---

## 二、no-overclaim 对照表（CHANGELOG 声称 ↔ 实际事实）

| # | CHANGELOG 声称 | 实际锚点 | 判定 |
|---|---|---|---|
| 1 | FIX-011：stats 描述符 implementation→statsSnapshot + 17 描述符全量守卫（rpc-shadow-guard 21 断言） | commit 52331a8（2 files +67/-0，reflog L248）；EV-094：RED 2 失败→GREEN 21 断言 + Coordinator worktree 隔离复验 + R0 机录 | **相符** |
| 2 | FIX-012：图片条件化武装——贴图即切/发送后保持/移除不还原/无图不切/手动尊重（fix-012 22 断言） | commits c3831b4+4f26846+5f68c17（reflog L249/251/252）；EV-095 四象限判别 GREEN + 宿主行为实证（还原假设证伪如实记录）；EV-098 P2-1 修复后 22/22；R0/R1 双审；README L131 与 L15 逐项一致 | **相符** |
| 3 | FIX-013：codex-responses 不再发送 max_output_tokens | commit 5e15c43（2 files +4/-3，reflog L247）；EV-093：TDD 基线→RED（旧代码实证发送 1024）→GREEN（断言改判字段不存在）；R0 机录 | **相符** |
| 4 | EVO-008：默认模型 gpt-5.6-sol/terra/luna，已配置账号不迁移 | commits 922c74f+785dc1e（reflog L250/253）；EV-096：五点全覆盖 + gpt-5.4 零残留 grep + fixtures/knownModels 未动；EV-098 client-render 正向断言锁定；R0/R1 双审 | **相符** |
| 5 | FIX-014：files 补 5 模块；v0.3.0~v0.3.2 tarball 不可用勘误 | commit e16d710（reflog L255）；EV-100 发现实证（Cannot find module lib/memory.js）；**本审查独立静态核验：lib/ 实有 12 模块与 files 列表 12 项精确一致（按字母序），非 lib 4 项（install.ps1/install.sh/docs/images/×4/README.md）全部存在**；E-3 终版锚点采信（import keys=5） | **相符** |
| 6 | 验证基线：门控 15/15 套件 exit 0（含 rpc-shadow-guard 21 / fix-012 22 / client-render gpt-5.6 正向断言） | EV-098 15/15（785dc1e）+ Coordinator @e16d710 复跑锚点采信；CHANGELOG 自注「最终以复跑实测值为准」措辞合规 | **相符**（N-2 落账待 E-6） |
| 7 | 破坏性变更四证（①依赖②配置③数据④行为） | ②③④ 成立（schemas.js 零触碰/数据结构不变/行为变化均为修复且已披露）；**①结论成立（dependencies+peerDependencies 与 v0.3.2 逐项一致——本审查读 package.json 核对）但论据句「除版本号外 package.json 与 v0.3.2 完全一致」陈旧失实**——FIX-014 已改 files 数组（11→16 项），与同文档 L17 自相矛盾 | **结论成立 / 论据失实 = F-1** |

**F-1（WARNING，非阻塞）**：CHANGELOG L25 四证①论据句为 7fdab39 书写时点事实，e16d710 增补 files 后未回改。危害评估：零——①所支撑的结论（无破坏性变更）经独立核验为真，files 扩张只增不减不可能破坏，且同一 CHANGELOG 的 FIX-014 条目（L17）以更高显著度完整披露了该变更。处置建议（Coordinator 裁量，两途均与本结论兼容）：(a) E-5 tag 前一行修正（文档面 commit，运行面零触及，历版文档收口先例同类，本审查结论对修正后文本仍成立）；(b) 不动，转 v0.3.4 台账/勘误。

---

## 三、FIX-014 审查缺口裁量（e16d710 未经独立 Code Review）

**裁量结论：缺口可接受（以替代验证链覆盖），如实披露为流程台账项。**

依据：

1. **变更面静态可机械核验**：2 文件（package.json files 数组 + CHANGELOG 段），无逻辑分支、无运行时行为——此类清单正确性的判别手段是「打包-安装-导入」实证而非人工代码审查；
2. **RED→GREEN 判别完整**：EV-100 修复前 E-3 完整 import 冒烟必败（Cannot find module lib/memory.js，锚定具体缺失模块与导入链）→ 修复后同口径通过——判别测试语义成立；
3. **独立终版复验**：E-3 终版由 Coordinator 在 Developer 之外执行（pack→隔离安装 exit 0→ESM import keys=5→版本核对），构成独立于生产者的验证；E-2 15/15 @ e16d710 复跑确认零附带损伤；
4. **本审查追加静态交叉核验**：lib/ 12 模块 ≡ files 12 项精确一致 + 非 lib 4 项实体存在（见对照表 #5）——残余风险（条目笔误致 tarball 缺件）恰被 E-3 终版 tarball 清单核验（lib 12 模块）覆盖。

边界如实声明：check-governance 审查覆盖率视角下 FIX-014 无 review-record 机录——本裁量不将其记为「已经代码审查」，而是「替代验证覆盖的发布阻塞修复」；台账建议随 N-2 一并在 E-6 收尾行留痕。

---

## 四、发现清单汇总

| 级别 | 编号 | 内容 | 处置 |
|---|---|---|---|
| WARNING | F-1 | CHANGELOG 四证①论据句「package.json 与 v0.3.2 完全一致」失实（files 11→16；结论无破坏性仍成立，L17 已完整披露） | Coordinator 裁量：tag 前一行修正或转 v0.3.4 台账——均不阻塞 |
| P3 | N-1 | 发布范围计数口径差 2（7fdab39/7119401 排除未加显式注记；v0.3.2 有先例注记） | v0.3.4 / 勘误时补注 |
| P3 | N-2 | E-2@e16d710 复跑 + E-3 终版通过 + E-5 动作的 EV 行未落账（evidence-log 现止于 EV-100） | **E-6 收尾 MUST 补记**（REL-005 EV-092 先例） |
| P3 | N-3 | 回滚口径无显式一句（关键事实已由 FIX-014 勘误隐含覆盖） | 后续版本 CHANGELOG/README 补显式回滚指引 |
| P3 | N-4 | FIX-014 无 review-record（替代验证覆盖裁量见第三节） | E-6 台账留痕；不补审 |

---

## 五、审查结论

**APPROVED_WITH_NOTES**

unresolved_blockers=0

- 发布检查清单 6/6 逐项 PASS（含事实锚点）；无 BLOCKING finding；F-1 为 WARNING 级（结论性陈述经独立核验为真、失实论据的更正信息已在同文档显著位置存在，零用户危害）。
- v0.3.3 达到发布就绪：版本/文档同步、四缺陷修复全证据链、no-overclaim 对照 7 项中 6 项精确相符 + 1 项结论成立论据待修、回滚锚点与危险点披露在位、发布范围零漂移、发布授权条件（先验证后发布）已满足。
- E-5（tag/push/GitHub Release）可执行；E-6 收尾义务：N-2 补账 + 归档触发检测 + 本审查机录信封（review-REL-006-R0.md 由 CLI 落）。

> 只读声明：本次审查仅使用 read/grep/glob 及 `.git/` 文件读取，零命令执行、零既有文件修改；唯一写入为本报告文件。结论供 Coordinator 经 review-record CLI 落盘。
