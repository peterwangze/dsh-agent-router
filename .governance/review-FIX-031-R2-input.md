# Review 报告 — FIX-031（审查轮 R2 · 聚焦增量复审）

- **round**: R2（同一 Reviewer 实例复审轮）
- **前轮引用**: REVIEW-FIX-031-R1（APPROVED_WITH_NOTES / unresolved_blockers=0；输入副本 review-FIX-031-R1-input.md 已复核未被改动）
- **审查对象**: commit 339123f（单 commit 7 文件 +251/−49：lib/stats.js / lib/client.js / lib/preset-defaults.js / lib/service.js / tests/fix-031-attribution.mjs / tests/preset-defaults.mjs / tests/served-client.js）；基线 = 8a7c564（R1 已审）+ 770d9e0（R0 已审主体）
- **复审性质**: 聚焦增量——用户真机复验缺陷 D5/D6/D7 修复质量 + Coordinator 追认的 1 项授权偏差（tests/preset-defaults.mjs L5 对齐）+ R1 findings 无回退核验；R0/R1 已裁主体结论不重复
- **方法与限制**: 无 Bash——commit diff 以行数算术 + 逐段读码 + 前轮行号锚点比对佐证。测试执行声明（84/84、stash RED 13 FAIL、21 套件、镜像零差异）为 Coordinator 机验项；本报告核验断言语义与源码事实等价性。

---

## 一、缺陷处置逐条裁定

### D5（openai-codex 双卡重复）——**已修复**

核验（lib/client.js:2616-2672 + statsProviderLabelOf :109-118）：
1. **roster 行排除**：providers 循环 `if (isHostManagedRoute(entry.provider)) continue`（:2628）——通路构件不为账号出卡；取数键改为 `accountTotalsById.get(accountDisplayKeyOf(entry.provider))`（:2629）与统计行同键空间。
2. **跨 kind 身份去重**：`accountDisplayKeyOf(row.provider) === accountDisplayKeyOf(total.provider)`（:2652）——旧判据 provider+accountKind 双等（roster provider 形态 vs 统计 host-route 形态同键不同 kind 双渲染）被替换；D13b 同时以负向断言锁定旧判据不复活。
3. **回落卡不误删**：宿主路由未激活 + 历史行存在（resolver null → 独立实体）时——roster 循环永不贡献该键（:2628 先排除）→ 统计循环必推入 host-route 行（displayName 留空 → 标题经 statsProviderLabelOf 出「宿主路由（账号未知）」:112 + i18n zh:621/en:940）→ 去重判定无对手行，**单卡保留** ✓。D13c/D13d/D13e 以真实浏览器包锁标签语义。
4. **误合并评估**：去重键 = 显示键空间。同显示键异实体（如用户自建 provider 命名 'chatgpt' 与 oauth 账号 'chatgpt'）会并卡——但该歧义在 R0 形态即存在（accountTotalsById Map 构造按显示键后写覆盖 + 旧双卡读同一桶数字），D5 严格改善（双卡同数 → 单卡），非新缺陷。记 O4（P3）：fetch 路径可改用 kind 分区索引（accountTotalsByKindId 已存在，:3428 展开卡在用）。

### D6（同一 ChatGPT 订阅拆两卡）——**已修复（代码）；夹具留有 P2 覆盖缺口（N1）**

**代码核验（全部通过）**：
1. **resolver 注入链单点**：`normalizeAttribution(event, hostRouteAccountKeyOf)` 第二参（stats.js:158，host-route 分支 :177-189：resolver try/catch 调用 → 返回值校验〔字符串 + `oauth:` 前缀 + 非空 id〕→ 通过则归并 accountKey/kind='oauth'，否则回落 kind='host-route'）；StatsStore 构造注入（:398，getAgentName 先例位 :720 旁）；service.js:729-732 注入 `() => hostRouteStatusOf(this).maintained && status.accountId ? 'oauth:'+accountId : null`（hostRouteStatusOf 形状核验：maintained===true && present / accountId string，host-route.js:419-432；host-route.js 零改动，service.js 既有导入 :46 复用，无新 ESM 环）。
2. **实例单点 #normalize**（:756-762）：#fold（:772）/ #foldScope（:571）/ snapshot 两个派生回退（:1400/:1433）**全部**经 `this.#normalize`——归并决策无第二实现（P5 ✓；G4 契约同步更新为锚 `this.#normalize(raw)`，语义等价升级）。回退仅做标签/种类投影（键已折叠），resolver 参与无害。
3. **归并方向与白盒无影响**：host-route → oauth 单向；oauth 键分支（:173-174）不咨询 resolver——service.js accountHealth（:1205 域 `oauth:${accountId}` 寻址，F4 契言锚定未动）不受影响；D12b 证归并直达白盒键空间（`accountTotals.keys() === ['oauth:chatgpt']`，无 openai-codex 残留）。行为侧效应（非缺陷，语义正确化）：accountHealth/池策略 usage-lowest 现在吃到 host-route 用量——同凭据真实用量计入，归因更真。
4. **8 种非法形态回落**（D14 夹具逐项对应代码校验）：null resolver（参数缺省）/ ()=>null / ()=>undefined / ()=>'' / ()=>'oauth:'（空 id 被 length 门拒）/ ()=>'chatgpt'（无前缀）/ ()=>42（非字符串）/ 抛错（:180-183 try/catch）——全部回落独立实体、永不抛、不伪装 ✓。D14b 锁佳形态 + 幂等（归并键 'oauth:chatgpt' 再过单点走 oauth 分支，不回 host-route 分支）。
5. **动态性（D12c）**：resolver 动态失效后新行回落独立实体、已折叠行不回滚（内存行一次性折叠不可变）✓。**跨重启语义（O3，P3 记录）**：盘面行记 raw provider='openai-codex'，重启 load 以**当时** resolver 重放——若中途换过路由账号，历史 host-route 用量整体迁往新账号卡。这是读侧归一化架构（R0 裁定「盘面不改」）对时变映射的内在属性；代码注释已如实记载「动态映射，随配置可变」。罕见配置变更 + 总量守恒（仅归属迁移），不构成缺陷；若未来需逐行真实归属，须写侧落账号（超出本架构，不建议本轮动）。

**夹具缺口（N1，P2）**：D6 生产主路径是 **scope 行**——宿主官方路由请求经宿主 pi-ai 适配器，插件无 call 记录位点（oauth-llm 只记插件组选中时；twin 包装是另一形态），用户实证的「openai-codex 卡 2 调用」即 scope 行（请求口径）。D12/D12c 夹具**全部用 record() call 行**驱动归并——`recordScope({ provider: 'openai-codex', ... })` 形态在本文件零出现（全量 grep 证实）。代码层面该路径正确性可由结构推演（#foldScope:571 同经 #normalize，无分支可跳过归并），但「旧代码必红」的判别覆盖缺了生产主路径。**附带自报不准确**：Developer 声明「D6×D7 组合探针（host-route scope 行归并 + 去重作用于归并后格）」——该 scope 行探针在夹具中不存在（D12=call 行 + D13b=客户端去重契约，均非所述组合形态）。修复建议：补 D12d——`store.recordScope({ preset:'standard', provider:'openai-codex', model:'gpt-5.6-sol', at })` ×2 + 断言 accountScope 键落 `oauth:chatgpt`、快照单卡 calls 含该 2 次。

### D7（计数权威被 preset 门控）——**已修复**

核验（三处协同 + 口径裁定）：
1. **站点侧**（preset-defaults.js:637-648）：门控 `!preset ||` 从守卫中移除（D16b 负向断言锁旧形态不复活；provider/model 类型校验保留）；preset 解析链不动（live 罗盘 → header → 空串），注释如实声明「无 header agent 仍零记录（上方早退）」。
2. **存储侧**（stats.js recordScope :534）：preset 伪值规整为 `''`（不再早退）；**视图分流在 #foldScope 内**（:573 `if (rec.preset !== '')` 只包住 presetStats 折叠，:595 #foldAccountScope 无条件执行）——空串行只进账号视图。
3. **读侧**（#shapeOf :1198-1200）：scope 行 preset 校验放宽为仅类型检查（容忍空串，历史行全有值零影响）；D15b 证盘面往返计数保持 + 零坏行。
4. **预设面零泄漏**（D16）：presetStats 仅含具名预设，无空名卡；preset 级 CSV 因从 presetStats 展开（stats.js export），同样无空名行——出口一致。
5. **口径裁定**（「覆盖全部路由形态」client.js:618）：D7 后对全部**真实路由形态**严格为真（无预设/有预设、包装/非包装、插件组/宿主路由、主/子代理全覆盖——D15/D12/A/C 组夹具对应）。残余早退三处：①`!isEnabled`（插件停用统计暂停——设计语义，statsDisabled 状态行自披露）②无 session header 的 agent（宿主契约下不存在的异常形态——L5 夹具证不炸零记）③config.provider/model 非字符串（异常 config 防御）。三者均为**异常形态防御而非路由形态覆盖缺口**——提示语面向用户心智无需列举，口径成立。
6. **授权偏差追认复核**（tests/preset-defaults.mjs L5 块 :1103-1117）：对齐**最小**——仅重写 L5 块 + 4 行注释（声明「旧断言锁定 preset 门控，授权解除」），L1-L4/L6/L7 及其余全部断言未动（grep 形状比对）；语义**如实**——`scopeAgent({preset:''})` → 断言恰 1 条 scope 行且 `preset===''`/origin/provider/model 字段完整；`handler({}, …)`（无 agent）→ 零记录不炸（scopes.length===1 总计）。裁定：**追认成立**。

---

## 二、R1 findings 无回退核验

| 项 | 核验 | 结果 |
|---|------|------|
| F-1 三站点 at 注入 | wrapper.js:391 `at: startedAt` / oauth-llm.js:399+428 / tool.js:192+212 `at: started` 全部原样；record/recordScope at 纯透传链原样（stats.js:462/:538 `Number.isFinite(Number(event.at))`） | ✅ 未回退 |
| F-1 合并语义 | #accountView 去重分支逐行比对 R1 形状（stats.js:664-708）——`scopeDay ? scope+otherCalls : calls` 原样；mainCalls/otherCalls 分解位原样 | ✅ 未回退 |
| F-1 夹具 | D9/D9b/D9c/D10/D11 五断言全部保留（:319-346） | ✅ 未回退 |
| F-2 G13/G14 | 两断言原样（:500/:503）；被锚常量未动（stats.js:109 ACCOUNT_KEY_ALIASES / :100 HOST_ROUTE_ACCOUNT_KEY） | ✅ 未回退 |
| stats.js +112 段影响面 | 大改集中在 normalizeAttribution 签名/#normalize 新增/#foldScope 分流/#shapeOf 放宽/构造注入——均在 D6/D7 语义内；合并算式与 F-1 修复面零触碰 | ✅ 无波及 |
| G4 契约演进 | 正则从锚 `normalizeAttribution(raw)` 改锚 `this.#normalize(raw)`——源码契约随单点包装升级，语义等价（仍验两折叠入口各经一次归一化） | ✅ 合规演进 |

---

## 三、无新引入 + 越权检查

- **新引入**：阻塞/P1 = 0；P2 ×1（N1 夹具缺口 + 自报不准确）；P3 观察两条（O3/O4，见下）。
- **范围算术**：service.js 4229→4241（+12 恰合）；stats.js 1588→1642 / client.js 5218→5243 / preset-defaults.js 648→653 / fix-031-attribution.mjs 496→575 / preset-defaults.mjs ±10（L5 块）/ served-client.js 5218→**5243 与 client.js 完全同长**，且 D5/D6 段行号级一致（:37/:93/:106/:112/:238/:621/:938-940/:2628/:2652/:2660-2661）——镜像同步。恰 7 文件，wrapper/oauth-llm/tool/host-route/smoke/stats 未触碰（F-1 锚点 grep 原样、G14 通过即证 host-route.js:55 未动）。
- **断言总数独立复核**：`check(` 恰 **84** 处（R1 69 + D12/D12b/D12c/D13/D13b/D13c/D13d/D13e/D14/D14b/D15/D15b/D15c/D16/D16b = 15）✓。
- **AI 专项（增量）**：mock 残留无（D12 的 resolver 注入是复刻 service.js:729 形态的合法测试缝，非产品面 mock）；硬编码无；幻觉 API 无（hostRouteAccountKeyOf 选项在 :398/:758 真实消费）；TODO 无；过度实现无（#normalize 双层兜底〔normalizeAttribution 内 try/catch + 外层 catch 回落 null resolver〕略冗但防御深度合理）。

---

## 四、发现列表（本轮增量）

| # | 级别 | 位置 | 问题 | 修复建议 |
|---|------|------|------|----------|
| N1 | **P2** | tests/fix-031-attribution.mjs D12 组 | D6 生产主路径（host-route **scope 行**归并——用户实证的 openai-codex 用量即此形态，插件在宿主路由通路无 call 记录位点）零夹具覆盖；D12/D12c 全用 call 行驱动。附带：Developer 自报「host-route scope 行归并组合探针」与夹具实况不符（自报不准确） | 补 D12d：recordScope(provider='openai-codex') ×2 → 断言 accountScope 键 `oauth:chatgpt`、快照单卡含该计数（代码路径已由结构核验正确，此为判别覆盖补全） |
| O3 | P3 | stats.js:140-147（D6 注释域） | 跨重启重放以当时 resolver 归并——换过路由账号后历史 host-route 用量整体迁往新账号卡（内存内不回滚，重启后归属迁移）；读侧架构对时变映射的内在属性，注释已声明「动态映射」 | 记录性；如需逐行真实归属须写侧落账号（架构级变更，不建议本轮） |
| O4 | P3 | client.js:2385（accountTotalsById） | 显示键空间同键异实体（用户 provider 与 oauth 账号同名）在取数 Map 中后写覆盖——R0 既有形态，D5 后并卡不再双显但取数仍按显示键 | 可改 kind 分区（accountTotalsByKindId 已存在）；遗留台账候选 |

---

## 五、硬门槛裁决（增量轮）

| 门槛 | 阈值 | 实测 | 判定 |
|------|------|------|------|
| P0 阻塞 | = 0 | **0**（P2×1 / P3×2，均非阻塞） | ✅ |
| 维度覆盖（增量） | 100% | D5/D6/D7 逐条代码+夹具核验；正确性/可维护性/测试覆盖重点 + 安全面（resolver 返回值校验/preset 规整无新输入面）/性能（resolver 每行一次同步调用，host-route 分支 O(1)——无影响） | ✅ |
| 每条发现标注级别 | 100% | N1/O3/O4 齐备 | ✅ |
| 设计一致性 | 已完成 | D6 归并方向不改 oauth 键（白盒兼容）；D5/D7 均在 R0 裁定的读侧归一化架构内；授权偏差最小且如实 | ✅ |
| AI 专项 5 项 | 全部完成 | 见 §三 | ✅ |

---

## 六、审查结论

# APPROVED_WITH_NOTES

**unresolved_blockers=0**

- **D5 / D6 / D7：均已修复**（代码级全部核验通过；D6 归并/回落/白盒兼容/8 形态回落/动态性五项重点逐一成立；D5 去重与回落卡路径成立；D7 三处协同 + 口径裁定成立）。
- **授权偏差追认：成立**（tests/preset-defaults.mjs L5 最小对齐 + 语义如实）。
- **R1 findings 零回退**（F-1/F-2 锚点、合并语义、夹具全保留；stats.js +112 段未波及 F-1 修复面）。
- 保留备注：N1（P2——D6 生产主路径夹具缺口 + 自报不准确，建议随下批补 D12d，代码正确性已由结构核验兜底）；O3/O4（P3 记录）；R0 台账 F-3~F-6 与闭环条件 F-7 不在本轮范围、未恶化。
- 测试执行声明（84/84、stash RED 13、21 套件、镜像零差异）为 Coordinator 机验项；本报告已核验 84 断言语义、7 文件范围算术与镜像行号级同步。
