# Review 报告 — FIX-031（审查轮 R3 · 聚焦增量复审）

- **round**: R3（同一 Reviewer 实例第四轮）
- **前轮引用**: REVIEW-FIX-031-R2（APPROVED_WITH_NOTES / unresolved_blockers=0；输入副本 review-FIX-031-R2-input.md 已复核未被改动）
- **审查对象**: commit 3ddd321（恰 3 文件 +158/−0：lib/stats.js +64〔#reload〕/ lib/service.js +29〔维护完成触发〕/ tests/fix-031-attribution.mjs +65〔D17 七断言〕）；基线 = 2bb793c（微批 4 = R2 保留项 N1 修复 D12d×2 断言，本报告一并核验处置）
- **复审性质**: 聚焦增量——D8 启动时序竞态修复正确性（重点 = reload 并发窗口不变量独立重推）+ 前轮 findings 无回退 + 无新引入
- **方法与限制**: 无 Bash——commit diff 以行数算术 + 逐段读码 + 前轮锚点比对佐证。测试执行声明（93/93、stash RED 六条、21 套件）为 Coordinator 机验项；本报告核验断言语义与源码事实等价性。

---

## 一、D8 处置裁定：**已修复**（含 1 项 P2 边界发现、2 项 P3 观察）

### 1. #reload 实现（stats.js:1059-1121）核验

- **清空清单**：13 项聚合态逐一核对（totals/accountTotals/series/accountSeries/recent/days/presetStats/accountScope/agentDays/accountDays/recentByAgent/recentByAccount/detail，:1091-1103）——与 reset() 清空域一致减去 queue/selfReport（二者正确保留：queue 是写积压非聚合态；selfReport 计数保留观测连续性）。JSDoc 列举与代码一致（自报「12 项」实数 13——计数口径小误，纯记录）。
- **并发防护三段**：①#persistTransition 串行链（:1081-1085，与 setPersist 同链互斥）②在途 #flushing 先收尾 + 显式 flush（:1086-1089，失败不阻断——残留批次留在 queue 由快照兜住）③清空前 `queue.slice()` 快照（:1090）→ load 后按 #shapeOf → #fold/#foldScope 回补（:1107-1112，同一归一化链 = resolver 生效）+ `pending.length > 0` 才 #rebuildRecent（:1113；pending 空时 load 内部已重建——两分支恰一次）。
- **三类行不变量独立重推**：
  - **盘面行**（flush 成功落盘）：load 重放恰一次，不在快照（queue 已空）✓；
  - **快照行**（flush 失败残留 / flush await 期间新达——#drain 二轮 splice 也覆盖写中到达者）：不在盘、内存折叠被清 → 快照回补恰一次 ✓（代码检视成立；夹具覆盖见观察 O6）；
  - **重放窗口新达行**（load await 期间 record）：清空后折叠进内存恰一次，不在快照 ✓。
  - **不变量的例外路径（O5，P3）**：重放窗口内若触发自 flush（queue ≥50 阈值或 G2 残留定时器），队列行（含仍在 queue 的快照行）被追加落盘；若 load 尚未读该文件 → 盘面重放 + 内存折叠/快照回补**双计**。触发需「重载窗口内 ≥50 行突发或定时器恰响 × 文件读取序」复合窄条件；属 load() 既有暴露形态（setPersist(true) 同窗同类），reload 使其在运行期更可达。加固建议：reload/load 期间抑制 flush（#replaying 旗标）。自愈性：盘面行仅一份，重启/下次 reload 后正确。
- **P7 永不抛**：全方法 try/catch/finally（:1084-1120），失败保持已重放态返回 selfReport ✓。persist=false 入口直接返回（:1080）。
- **【N2 · P2】persist 竞态缺口**：reload 仅在**入口**检查 persist（:1080），`await prevTransition` 之后**无复检**——若 reload 进入时 persist=true 而链上前驱是在途 setPersist(false)（R2-F1 修复引入的串行链使此交错可达）：setPersist(false) 完成（flush 落盘 + persist=false）→ reload 继续 → flush 无操作（#drain persist 门 ✓ F1 不破）→ 快照空 → **清空 13 项聚合态** → `load()` 因 persist=false 早退不重放 → **内存聚合全清、persist-off 会话期统计归零**。自愈：下次 setPersist(true) 时 memoryEmpty 分支全量恢复（盘面无损——setPersist(false) 已先行 flush）。可达性极窄（一次性触发 × 转换 ms 窗口 × 用户恰在切统计开关），后果为会话期显示清零非数据损坏。**修复一行**：`await prevTransition` 后补 `if (!this.persist) return this.statsSelfReport()`——镜像 setPersist 自有的「等待在途转换结束后再比较」纪律（:1144-1145 注释自证该模式，reload 未沿用 = 纪律不一致）。

### 2. service.js 触发点（:2792-2828）核验

- **挂载位**：`.then((result) => { this.maybeReloadStatsAfterHostRouteSync(); return result })`（:2798）位于 syncHostRoute 之后、终结 `.catch`（:2799-2804）之前——**boot/settings('user'/'llm')/tick 三触发源同经 queueHostRouteSync 串行队列全覆盖 + 与维护天然串行** ✓（D17g 源码契约锁定）。
- **reject 路径**：syncHostRoute 拒绝 → .then 跳过（不触发——维护失败态下 accountId 未就绪，不触发语义正确）→ 终结 catch 兜住（failures++ + warn）→ **无 unhandledRejection** ✓。maybeReload 自体 try/catch 全包 + reload 永不 reject → `void this.stats.reload()` 无悬拒。
- **旗标语义**（:2819-2828）：判定序 = 旗标已置 → `stats.persist !== true` **先返还不消费**（boot 早于 persist 启用的场景等下一 tick ≤30s 再试——不丢触发 ✓，D17f 锁定）→ `maintained && accountId`（hostRouteStatusOf 既有状态面直读）→ 消费旗标后 fire-and-forget。一次性幂等（D17d 双调恰一次）；路由未就绪不消费（D17e——回落诚实语义保持）。**A→B 账号切换后不再重载** = 一次性旗标的设计边界，与 R2 O3 台账（跨重启归属迁移）同族——未越界、未恶化 ✓。
- 构造器旗标初始化 :685 ✓。

### 3. D17 七断言语义核验

| # | 断言 | 核验 |
|---|------|------|
| D17① | 竞态复现（resolver 未就绪 load → openai-codex 回落卡 calls=2 + chatgpt 卡 calls=5 双实体） | 真实 StatsStore 落盘 → 新 store（resolver 闭包 routeAccount=''）load → 缺陷形态复现——**旧代码按设计通过**（缺陷存在性证明，与 stash RED「①通过②-⑦必败」声明一致）。注意：夹具的 host-route 历史行是 **recordScope(preset='', provider='openai-codex')**——D6 生产主路径形态 |
| D17b | reload 后归并（单实体 calls=7 = 5 call + 2 scope，requestCalls=2/callRows=5） | routeAccount='chatgpt' 后 reload → 全量重放经就绪 resolver → #accountView 合并值逐项复算吻合（scopeDay 覆盖 → 2 + otherCalls 5 = 7）；reloadQuiet 容错包装使旧代码 TypeError 记败不崩组 ✓ |
| D17c | 重载窗口 record 恰一次（合计 8） | 断言值正确锁「恰一次」 outcome；**机制归因见 O6**——该夹具的并发行实际经 flush→盘→load 重放路径恰一次，快照回补循环未被驱动（快照时空） |
| D17d/e/f | service 触发三态（就绪幂等恰一次/未就绪不消费/persist 门控不消费） | **真实 RouterService.prototype.maybeReloadStatsAfterHostRouteSync** + 最小 fake this——state 形状锚定 hostRouteStatusOf 真实消费面（maintained/accountId 出 hostRouteState、present 出 ctx.get('settings') providers——与 host-route.js:419-432 消费一致，P10④ ✓）；三态语义与代码逐行吻合 |
| D17g | 挂载位源码契约 | 正则精确锚 :2798 ✓ |

### 4. R2 保留项 N1 处置（微批 4，基线 2bb793c）

**已修复**——D12d ×2 断言（:378-391）：`recordScope(provider='openai-codex')` 生产主路径全链归并（accountScope 权威键落 `oauth:chatgpt`、无 openai-codex 残留键、快照单卡含计数）+ 对照组（resolver 未激活 → 新行落独立 host-route 实体、已归并不回滚）——**正是 R2 建议的 D12d 形态**，标签明引「R2 保留项 N1」。夹具语义复核吻合。

---

## 二、R0-R2 findings 无回退核验

| 项 | 核验 | 结果 |
|---|------|------|
| F-1（at 锚点/合并语义） | 三站点 at 注入原样（wrapper:391 / oauth-llm:399+428 / tool:192+212）；#reload 复用 #fold/#foldScope 未另建折叠路径；#accountView 合并算式未触碰；D9-D11 断言全保留（:324-351） | ✅ |
| F-2（G13/G14） | 两断言原样（:582/:585）；被锚常量未动 | ✅ |
| D5/D6/D7 修复面 | client.js 零改动（本批恰 3 文件）；stats.js 改动仅 #reload 新增方法（插入不改动既有行）；D12/D12b/D12c/D13-D16 断言全保留 | ✅ |
| C8（setPersist 判据） | memoryEmpty 六项判据未动；#reload 与 setPersist 串行链共存（互不破坏——C8 断言保留 :262） | ✅ |

---

## 三、无新引入 + 越权检查

- **新引入**：阻塞/P1 = 0；P2 ×1（N2 persist 复检缺口）；P3 ×2（O5 重放窗口自 flush 双计窄径 / O6 快照回补路径零夹具）+ 2 条纯记录（清空项计数口径、D17c 机制归因）。
- **范围算术**：stats.js 1642→1706（+64 恰合 #reload 一个方法含 JSDoc）；service.js 4241→4270（+29 恰合触发点三段：.then 挂载 + maybeReload 方法 + 构造器旗标）；tests 575→657（+82 = 微批4 +17〔D12d 块+头注〕+ 微批5 +65〔D17 块〕）。**恰 3 文件**（本 commit），微批 4 为 tests 单文件——client.js/wrapper/oauth-llm/tool/preset-defaults/served-client/smoke/stats 均未触碰。
- **断言总数独立复核**：`check(` 恰 **93**（84 + D12d×2 + D17×7）✓ 与 93/93 声明吻合。
- **JSDoc `*/` 插节残留**：#reload JSDoc（:1059-1078）与 service 触发点 JSDoc（:2808-2818）逐行读毕——注释块开闭配对完整，无残留 ✓（自拦成功，未进 commit）。
- **AI 专项（增量）**：mock 残留无（D17d-f 真原型方法 + 锚定真实消费面的最小 state 形状——合法测试缝）；硬编码无；幻觉 API 无（reload/maybeReloadStatsAfterHostRouteSync/hostRouteStatsReloaded 均真实存在且被消费）；TODO 无；过度实现无（三段并发防护与问题规模相称）。

---

## 四、发现列表（本轮增量）

| # | 级别 | 位置 | 问题 | 修复建议 |
|---|------|------|------|----------|
| N2 | **P2** | stats.js reload :1084-1085 | `await prevTransition` 后无 persist 复检——与在途 setPersist(false) 交错时清空内存而 load 早退 → persist-off 会话期统计归零（自愈于下次 persist-on，盘面无损；可达性 = 一次性触发 × 转换 ms 窗口 × 用户恰切开关） | 一行：await 后补 `if (!this.persist) return this.statsSelfReport()`（镜像 setPersist :1144-1145 自有纪律）——建议随下批 |
| O5 | P3 | stats.js load 重放窗口 | 窗口内自 flush（阈值/定时器）可将队列行落盘 → 与内存折叠/快照回补双计（load 既有暴露形态，reload 提高运行期可达性；窄窗，重启/下次 reload 自愈） | 加固：reload/load 期间 #replaying 旗标抑制 flush |
| O6 | P3 | tests D17c | 断言标签将「恰一次」归因「快照回补」，实际驱动路径 = flush→盘→load 重放（快照时空，回补循环零执行）；快照回补路径（flush 失败残留）无夹具——代码检视正确 | 记录；若补：注入 flush 失败（只读目录等）驱动 pending 非空路径 |

---

## 五、硬门槛裁决（增量轮）

| 门槛 | 阈值 | 实测 | 判定 |
|------|------|------|------|
| P0 阻塞 | = 0 | **0**（P2×1 / P3×2） | ✅ |
| 维度覆盖（增量） | 100% | D8 正确性（并发窗口独立重推 + 触发链三态 + reject 路径）/ 可维护性（串行链纪律一致性例外 = N2）/ 测试覆盖（七断言语义 + N1 处置）/ 安全面（reload 永不抛、无悬拒、F1 门不破）/ 性能（reload O(盘面行数) 一次性，触发一次/启动） | ✅ |
| 每条发现标注级别 | 100% | N2/O5/O6 + 2 条纯记录 | ✅ |
| 设计一致性 | 已完成 | 修复沿用读侧归一化架构（盘面零改写）+ 既有串行链/状态面复用；触发点单链全覆盖；与 setPersist 纪律的不一致即 N2 | ✅ |
| AI 专项 5 项 | 全部完成 | 见 §三 | ✅ |

---

## 六、审查结论

# APPROVED_WITH_NOTES

**unresolved_blockers=0**

- **D8：已修复**——启动竞态（resolver 未就绪 load → 回落卡固化）经「维护完成一次性安全重载」治本：#reload 三段并发防护 + 三类行不变量（本 Reviewer 独立重推，主路径严密成立）；触发链 boot/settings/tick 全覆盖、天然串行、reject 路径无悬拒；旗标语义（幂等/未就绪不消费/persist 门控不消费）三态夹具锁定；D17① 缺陷复现使 stash RED 判别可信。
- **R2 N1：已修复**（微批 4 D12d——生产主路径 recordScope 归并夹具，正是 R2 建议形态）。
- **R0-R2 修复面零回退**（F-1/F-2/D5/D6/D7/C8 锚点与断言全保留；client.js 零触碰）。
- 保留备注：N2（P2——reload persist 复检一行缺口，建议随下批；可达性极窄 + 自愈 + 盘面无损）；O5/O6（P3 加固与覆盖建议）；2 条纯记录（清空项计数、D17c 机制归因措辞）。R0 台账 F-3~F-6/O3/O4 与闭环条件 F-7 不在本轮范围、未恶化。
- 测试执行声明（93/93、RED 六条、21 套件）为 Coordinator 机验项；本报告已核验 93 断言语义、恰 3 文件范围算术与 JSDoc 无残留。
