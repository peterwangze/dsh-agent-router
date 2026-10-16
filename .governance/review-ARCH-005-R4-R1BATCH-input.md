# ARCH-005 / R1 批 代码审查报告（Code Reviewer，round 4 / unit R1-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 4 --unit R1 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged diff（先审后提交）。

**结论：`APPROVED_WITH_NOTES`（unresolved_blockers = 0）** — P0=0，P1=1（注释层事实性失实，带修复建议），P2=2，P3=1。零采信自报：staged diff 逐行实读、宿主源码锚点独立实读、四组验收门独立复跑、三组红向判别独立执行（隔离临时沙箱，零仓库改动）、沙箱证据文件逐字核对。

**审查对象**：`git diff --cached`（5 文件 +750/−309）；工作树与 staged 态一致（5 文件零未暂存改动——link: 协议红演示的 hash 恢复在 git 层独立证实）。

---

## 一、独立复跑结果（验收门 ①②③④）

| 门 | 独立结果 | 与自报对照 |
|---|---|---|
| snapshot（chcp 65001） | **29/29 绿，exit 0**；section 0 显式打印 `declared dsh range ^0.2.0-rc.2 maps to the PRIMARY registry entry` | 一致 |
| host-contract（chcp 65001） | **122/122 绿，exit 0**（与 R0 基线零漂移）；靶子 = npm-global；8 关键包全 `0.2.0-rc.2` = 基线 | 一致 |
| `pnpm install --frozen-lockfile` | **exit 0**（Already up to date，pnpm v11.22.0）——lockfile 与 manifest 一致性独立证实 | 一致 |
| 全量网 | **20/21**；smoke 恰 2 条 sh 臂环境失败（与 R0 基线同名）；**#SKIP 0** | 一致 |
| 红向判别（隔离沙箱副本，非重放） | ①整体回退 frozen ×11 → **12 FAIL，exit 1**；②单项假版本 → 分裂判红 **16 FAIL，exit 1**；③注册表零 primary → **4 FAIL + 优雅退出 exit 1，零 TypeError** | 超出自报 |

## 二、逐项审查裁定

**1. 正确性**
- **package.json 11 项**：8 peers + 3 dsh deps 全部恰为 `^0.2.0-rc.2`，无漏项/错拼；peerDependenciesMeta 8 键一一对应全 `{optional:true}`；cordis `^4.0.1`/schemastery `^3.18.1`/undici 不动（section 4 判「范围覆盖主基线 4.0.5/3.18.5」caretRangeContains 实算通过）。自报口径与快照断言语义严格一致，无越称。
- **pnpm-lock.yaml**：importers 11 项 specifier 全 `^0.2.0-rc.2` 解析 0.2.0-rc.2；staged 态零 `0.1.5-rc.2` 残留；新增 30 个 0.2.0-rc.2 包条目（含 app-boot 装载门实现包入锁）；frozen 复跑 exit 0。
- **F-1 收紧**：`registeredRanges` 放宽变量真删除（0 命中），sections 2/3 改 `=== primaryDeclaredRange`，section 0 加 `status==='primary'` 判据；回退 frozen 三层判红（12 FAIL）。R0 承接 F-1 **闭合**。
- **F-2 注册表派生**：`HOST_DECLARED_RANGE` 改 `` `^${HOST_VERSION_BASELINE.dshPackages}` ``（host-contract.mjs:288），副本由 :570-579「基线副本」机器断言锁到 snapshot 注册表 primary 项（fail-closed）——**真锁**，「第五份硬拷贝」漏改面消灭。R0 承接 F-2 **闭合**。
- **F-3 优雅红**：零 primary 前置判红 + 收口退出（:153-158），零崩栈。R0 承接 F-3 **闭合**。

**2. README 合规（两 regime 口径逐句对照设计 §2-B 四维-a/b）**
- gate-block 措辞与设计逐义一致；gate-pass-unknown 与三态语义一致且未越称（未声称 unknown 徽章已存在——R2 面）。
- 基线集表 primary/frozen 两行四值与注册表逐值相等（section 5 机器锁）；连带 3 处版本声明（:30/:130/:259）全部主基线口径。
- 旧「零 enforcement」README 侧清干净（:147 改门控钥匙语义三要素齐）；残留仅在测试头注释（findings F-2）。

**3. 沙箱证据核查（`%TEMP%\arch005-r1-sbx-3f40409a\`）**
- boot1/boot3-stderr = 0 字节；boot2-red-stderr 556 字节警告与宿主源码**逐字锚定**（:516 reportSkippedBundles 前缀 + :320-322 模板逐字全等 + :940-945 String(error) 形态）。
- peers JSON 仅含被回退单项——「警告只点名该项」证实；同时**行为级证实 optional 不解除装载门**（被拒载的 dsh-settings 恰带 optional 标记）——DEC-2 语义边界一手实证。
- install-log：`dsh plugin --profile sandbox add` 冷装 + link: 指向 + pnpm Done；`~/.dsh` mtime 2026-10-16 23:12:11 未动（独立 stat 证实）。
- **optional/required 探针 24 vs 54 证实**：packA/packB 单变量对照（manifest 差异仅 peerDependenciesMeta 有无）+ caseB .modules.yaml 见 required peer 被自动装入。

**4. 设计一致性**：三项交付全落位；三个验收门全过。meta 采用 8 键显式枚举而非设计示例 `"*"` 通配——功能等效且 npm 兼容性更优（P3 登记）。

**5. AI 专项五查**：mock 残留=0；硬编码=0；幻觉 API=0；未实现 TODO=0；过度实现=0。

**6. 五维度结论**：正确性✓；安全性✓；可维护性✓（P5：范围口径单一事实源化）；性能✓；测试覆盖✓。

## 三、Findings

| # | 级别 | 锚点 | 问题 | 建议 |
|---|---|---|---|---|
| F-1 | **P1** | `tests/host-version-snapshot.mjs:11` 与 `:49-50` | frozen 项注释「本仓 node_modules/@deepseek-ai/ 树仍为该版本组合（R1 跳跃前的记录态）」被本批自身验收动作（frozen-lockfile 安装同步）失实——实测本地树已 0.2.0-rc.2（cordis 4.0.1/schemastery 3.18.1）。声明面权威守卫文件内事实性表述失效，误导后续混装推理（F-I 面）。违反 P1（表述与事实一致） | 本 commit 内改写两行（如「R1 安装同步后本仓树 = 主基线 0.2.0-rc.2；cordis/schemastery 按插件自持范围解析 4.0.1/3.18.1」） |
| F-2 | P2 | `tests/host-version-snapshot.mjs:15-18` | 头部依据段仍载「安装器零告警——语义化版本范围不构成真实防护」旧叙事，与本批核心语义（范围=装载门门控钥匙）矛盾 | 改写为与 README :147 同口径；本 commit 或 R5 文档收口批 |
| F-3 | P2 | `tests/host-abi-health.mjs:927-929`（diff 外预存注释被本批失效） | 「基线 = 依赖声明 ^0.1.5-rc.2…本机实装抽样 = 0.1.5-rc.2」两处失实——P5 声明范围旧硬拷贝的注释级残留 | A1「三方一致核对」批顺带清扫或登记遗留 |
| F-4 | P3 | `package.json:66-75` | 设计示例 `"*"` 通配 vs 实现 8 键显式枚举——功能等效、npm 兼容性更优 | 无需动作，口径登记 |

## 四、诚实备注三项裁定

1. **link: 协议红演示经 repo 临时改动（hash 恢复）——如实，证据闭环**（install-log link: 指向 + repo-pkg-bak.json 留存 + git diff 空）。无需补登记。
2. **optional 告警差异体现为安装集大小——如实且口径准确**（单变量对照证据链完整）。无需补登记。
3. **CI ubuntu 首跑后置——如实且已登记**（README :259 明文）。无需补登记。

## 五、裁定与义务移交

- R0 承接三项全部闭合（独立红向执行证实）。
- F-1（P1）建议本 commit 内两行注释修掉（最小改）；若遗留须登记关闭计划。F-2/F-3 建议随 A1 三方一致核对或 R5 收口。
- 无 BLOCKING；unresolved_blockers=0。
