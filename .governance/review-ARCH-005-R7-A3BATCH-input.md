# ARCH-005 / A3 批代码审查报告（Code Reviewer，round 7 / unit A3-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 7 --unit A3 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged 17 文件（先审后提交）；零 P1/P2 无返工轮。

- **Round**: R1（A3 批首审）
- **审查对象**: staged 17 文件（+1052/−195 未 commit）
- **结论**: **APPROVED_WITH_NOTES**
- **unresolved_blockers = 0**（P0=0，P1=0；5 条 P3 备注）

## 一、独立验证矩阵（零采信自报）

| # | 验证项 | 方法 | 结果 |
|---|--------|------|------|
| V1 | 46 断言判别套件 | chcp 65001 包裹复跑 | **PASS 46/46**（真树 §3 实跑——APPDATA 候选链命中 0.2.0-rc.2 树） |
| V2 | 全量网 | chcp 65001 包裹复跑 | **22 套件 21 PASS + smoke 恰 2 条 sh 臂 + #SKIP=0** |
| V3 | smoke 基线归因 | HEAD 基线副本（git archive → $TEMP + node_modules junction，已安全拆除并核验 repo 完整） | **同 2 条 sh 臂在 HEAD 原样失败**（逐字同形）→ P4 零回退成立，2 条为既有环境性红 |
| V4 | 编码伪红确认 | 无 chcp 直跑 smoke | **6 FAILURES**（2 sh 真红 + 4 powershell/pwsh/sh 编码伪红）→ Developer 自报 6 臂 = 无包裹跑，诊断正确 |
| V5 | a3-apply-gate 独立绿复跑 | `node scripts/a3-apply-gate.mjs` | **GREEN**：真 boot 3.4s、probe=tcp-8085-reachable、boot-stderr 0 字节、applyThrowHits=[]、schemaDiscoversRouter=true；R4 逐命令披露完整（全部 DSH_HOME=$TEMP 沙箱） |
| V6 | 沙箱历史证据核查 | $TEMP 三份 arch005-a3-* | 绿跑 probe=reachable+stderr 0B；红演示恢复 register 后 `TypeError: ctx.settings.register is not a function`（applyThrowMarkers 命中+probe timeout）——判别红真实在案 |
| V7 | P5 零残留独立复算 | 剥注释 grep（23 个 lib/*.js） | `settings.register(`/`'settings/updated'`/`settings.get(` 代码级 0 命中；MANAGED_EVENTS 无旧事件 |
| V8 | schemastery 实调 | node 直跑三副本 | repo 顶层 3.18.5 `.volatile()`→`meta:{volatile:true}` 在场；`.pnpm` 3.18.1 无该方法（交接备注 1 成立）；lock 一致（+cosmokit 1.8.6 联动） |
| V9 | 宿主语义实读 | dsh-settings/cordis/loader/app-boot/config-editor | 见八项裁定 |

## 二、八项审查重点逐项裁定

### 1. host-route 读缓存（交接备注 2）——**成立（附 2 条 P3）**
configuration() :39-41 每调用 loadProfileDirectory 磁盘读——缓存动机真实（service.js:748-749 热路径）。失效路径完备 ✓（①宿主写→write 尾 describe :536→emit→pass 强刷 :317/:345；②插件 mutate→写后三处刷 :376/:406/:431；③config-reload→invalidate→remount raw 含 fiber.uid :422 必变；④service 重建即缓存重建 service.js:681；30s tick 兜底）。语义等价 ✓（oauth-main-model 夹具 settings 面无 get——旧路径 STA-1 必红，判别真实）。并发窗口有界自愈（P3-1/P3-4）。生命周期 ✓ 无跨代泄漏。

### 2. schemastery ^3.18.5（交接备注 1）——**成立**
.volatile() 3.18.5 有/3.18.1 无（V8 实调）；快照 :192 caretRangeContains 覆盖式判定自洽（F-1 等式收紧仅覆盖 11 项 dsh-* 声明）；注释过期面 → P3-2。

### 3. P5 + apply(ctx, config) 语义——**成立**
注入链全实读：cordis Fiber._reload :1355 → resolveConfig :956（runtime.Config validate → volatile live ref）→ runner :1071 callback(ctx, config)——apply 第二形参即根级 volatile live ref；configScopeOf 三分支（live ref .get() 热读/普通快照/null 回退）与宿主形态对齐。

### 4. 四订阅点——**成立（逐字核对）**
宿主 :435/:461 恒双参 (ns, revision)、ns 恒字符串、无广播形态；四消费者 `(ns)=>` 首参消费 + `|| ns === void 0` 旧广播分支删除正确（smoke「无关 ns 零命中」断言看护）；共享单 listener census 保持。

### 5. volatile 语义——**成立**
三形态门文本与宿主 :504/:506/:507 逐字一致；根级 volatile ⇒ isVolatilePath :153-158 恒真；老配置未知键透传（S1）；routerSchema base 不带 volatile（validator 直调形态 §1 看护）。

### 6. 验收门独立复跑——**全绿**（V1/V2/V3/V5/V6）；真实基线裁定 = 22 套件 21 PASS + smoke 恰 2 sh 臂 + #SKIP 0。

### 7. 五场景判别力——**真判别**
S4 乱序注入实验（审查构造）：注入去串行化并发读-改-写 → burstOK 判红（b1-b5 丢失）——判别力实证；revision [0..14] 钉死。S5 恰一次事件+恰 +1 revision+恰一行 entry——双发/重复/隐式剪枝任一即红（N-1 闭合）。S1 真码 importLegacyDocument 全链；S3 四消费者到达+T-5 live ref 已新值。

### 8. AI 五查 + 镜像——**通过**
mock=0（桩全部锚定宿主源码行号 P10-④）；硬编码=0；幻觉 API=0；TODO=0；过度实现=0。镜像：client.js 1 行注释 → served-client.js 字节恒等（cmp 双向）。

## 三、Findings（全部 P3）

| # | 级别 | 位置 | 描述 | 建议 |
|---|------|------|------|------|
| F-1 | P3 | lib/host-route.js:230-234 | readProvidersEntry catch 静默吞错且注释引用「P8：」——旧代码同为静默非回归，但 describe() 引入新失败面，瞬时失败会被缓存为 loaded=true+undefined 到下一 pass | catch 补 noteHostDiag/warn（随 A4/R2 顺手） |
| F-2 | P3 | lib/host-route.js:207-240 头注 | 缓存设计未披露 describe() 读副作用（首观察/变更时 emit——惰性引导可触发一次 revision-0 事件→额外维护 pass，幂等收敛）与 tick 兜底 | 头注补两句 |
| F-3 | P3 | tests/host-version-snapshot.mjs:14-15/:61/:188-192 注释 | 本批装 3.18.5 后「本仓树解析 3.18.1」表述失真；机器断言不受影响 | 随下一批或 R5 一行刷新 |
| F-4 | P3 | lib/host-route.js:470-486 | 写→事件→pass 窗口内 hostRouteStatusOf 可短暂读到陈旧 present——有界自愈非错误态 | 登记已知最终一致语义（本报告留痕） |
| F-5 | P3 | tests/settings-config-migration.mjs:310/:339 | h4/h5 harness 临时目录未 rmSync——$TEMP 每跑残留 2 目录 | 测试卫生顺手项 |

## 四、5 维度 + AI 五查 + P-violation

正确性✓（断点解除/事件迁移/读写换代/缓存全部宿主源码逐行对照+独立复跑）；安全性✓（P7 红线保持；gate 沙箱完备；无凭据无注入面）；可维护性✓（单源派生；锚定入册；P5 零并存）；性能✓（缓存消除每记录磁盘读；describe 收敛为每 pass 1-2 次+每写 1 次+引导 1 次）；测试覆盖✓（46 新断言+7 套件适配+五场景+红绿双侧）。

AI 五查全部零命中。P-violation：无新增（P4/P5/P8/P9/P10-④/P10-⑤ 全 ✓）。

## 五、两项交接备注终裁

1. **schemastery ^3.18.1→^3.18.5：采纳**（.volatile() 硬前提，实调证实；断言自洽；lock 一致）。
2. **describe 磁盘读⇒读缓存：采纳**（失效路径完备+生命周期正确+判别真），附 F-1/F-2/F-4 三条 P3。

## 六、硬门槛自检

P0=0；findings 5/5 带锚点级别；5 维度 100%；设计一致性完成；AI 五查完成；只读纪律（复跑全沙箱口径；HEAD 基线 git archive 只读副本，junction 安全拆除核验）；**APPROVED_WITH_NOTES——A3 批可合并**（F-1/F-2 随 A4/R2 顺手，F-3 随 R5，均不阻塞）。
