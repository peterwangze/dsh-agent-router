# Review 报告 — FIX-031（审查轮 R5 · 快速聚焦复审）

- **round**: R5（同一 Reviewer 实例第六轮）
- **前轮引用**: REVIEW-FIX-031-R4（APPROVED；输入副本 review-FIX-031-R4-input.md）
- **审查对象**: commit ce63bf0（恰 2 文件：lib/service.js〔resolver 两级 + maybeReload 新门槛〕/ tests/fix-031-attribution.mjs〔D19 系 5 断言 + D17 fake 适配〕；host-route.js 与 stats.js 零改动——已直接复核）
- **复审性质**: 快速轮——D9 身份/健康度解耦正确性 + 无回退 + D17d/e 适配裁定

---

## 一、D9 处置裁定：**已修复**

### 1. 两级 resolver（service.js:731-743）核验

```js
hostRouteAccountKeyOf: () => {
  const status = hostRouteStatusOf(this)
  if (status.maintained && status.accountId) return `oauth:${status.accountId}`
  const selected = selectHostAccount(this)
  return selected ? `oauth:${selected.id}` : null
}
```

- **两级边界**：①运行态优先——`state.accountId` 本身即上次 sync 时 `selectHostAccount` 的结果（host-route.js:271 `state.accountId = maintain && selected ? selected.id : ''`）——**两级同源**，tier 1 命中时与配置推导恒一致；②降级兜底——maintained=false（token 注入/parity 探活任一失败，host-route.js:250/305/313/323/335 多路径）不抹身份，selectHostAccount 从配置确定性推导（启用 + preset/protocol 匹配 + host transport——正是下次 sync 将选中的同一账号）；③真未知（无任何启用 host-transport 账号）→ null 诚实回落。import 复用既有导出（:46），无新依赖面。
- **①一致性评估（任务焦点）**：「运行态 accountId 与配置推导不一致」窗口 = 配置变更后至下次 sync pass（settings/updated 即时触发 queueHostRouteSync 或 ≤30s tick）——窗口内 tier 1 返回旧账号。**非新分化面**：微批 3-6 的 resolver（maintained-only）在同窗口行为完全相同（同样吃滞后 state.accountId）；tier 2 只在降级期补位且给的是「下次 sync 必将选中」的同一真值。会话内新旧行分属两实体的语义 = O3 台账（时变映射读侧归一化）既定边界，未恶化、未越界。
- **②早期调用安全性（任务焦点）**：resolver 闭包构造期不调用；任意时刻调用：getState() → scope 未 attach 时回退 this.base（D19 实证：`new D19Service(root, {oauthAccounts})` 构造后立即可推导）；enabledPresetAccounts 全程 typeof/null 守卫（`state && typeof state.oauthAccounts === 'object'`）→ 空态返 []、selectHostAccount 返 null——**无抛出路径**；maybeReload 侧再包 try/catch（P7 双保险）。
- **③触发时机与并发（任务焦点）**：新门槛 = `stats.hostRouteAccountKeyOf()` 非 null（+typeof 防御 :2832）——boot pass 后身份即可知（即便路由降级）即触发一次性 reload。reload 并发安全性**未被本批触碰**（stats.js 零改动——#reload 三段防护/N2 复检行直接复核原样）；查看中快照的瞬时闪烁 = D8 批已接受语义，未重开。

### 2. maybeReload 新门槛（:2828-2837）核验

判定序：旗标 → persist 门控（不消费）→ typeof 防御 → **resolver 非 null**（身份就绪）→ 消费旗标 + fire-and-forget reload。幂等/persist 门控/挂载位（:2805 .then 链）语义不变 ✓；JSDoc（:2818-2826）如实声明「身份 ≠ 健康度」裁决依据。

### 3. D19 系夹具真实性（tests:465-509）

- **真实链驱动**：真实 RouterService + cordis Context + 实证配置形态（单启用账号、无 transport 字段 = 缺省 host、credentialFile 有效 token）——驱动**真实 resolver 闭包**非手搓镜像；降级前提自证（fresh hostRouteState → maintained=false/accountId='' 断言在先）。
- **D19**：降级 + 配置有账号 → identity==='oauth:chatgpt'（旧代码 maintained-only → null → 必败 RED ✓）。
- **D19a**：降级态 recordScope('openai-codex')×2 → 真实 stats 全链归并 → 单 oauth 卡 calls=2 无回落实体（旧代码落 host-route 卡 → 必败 ✓）——同时再强化 D6 生产主路径（scope 行）的降期态覆盖。
- **D19b**：fake 携带**真实 resolver** + 真原型 maybeReload 双调 → 恰一次 + 旗标置位（旧门 read hostRouteStatusOf(fake 无 hostRouteState) → fresh 态 unmaintained → 不触发 → 必败 ✓）。
- **D19c/d**：真未知（空 oauthAccounts）→ resolver null → 独立 host-route 卡诚实回落 + 不触发不消费旗标——回落语义保持（两断言在旧代码亦通过，与 RED 清单不含 c/d 一致）。

### 4. D17d/e 适配裁定：**成立（最小必要 + 语义如实）**

新门槛消费 `stats.hostRouteAccountKeyOf` → fake stats 必须携带身份字段方能继续驱动门槛单测。适配 = fake stats 增一个字段（就绪态给键 / 未知态给 null——镜像真实两级结局），:446-448 注释明示「门槛适配」；D17e 标签同步改写为 resolver-null 语义（如实）。状态机/reloadCalls/callTrigger 机械零改动。真实闭环由 D19b/d 携真实闭包补足——分层合理（D17=门槛逻辑单元级，D19=真实 resolver 集成级）。

---

## 二、无回退 + 范围

- **stats.js 零改动**：#reload 全方法（:1079-1126）与 R4 逐行一致（三段防护 + N2 复检行原样）；host-route.js 零改动（:413-438 与 R3 读一致——健康度语义未动）。
- **D5/D6/D7/D8/F-1/F-2 修复面**：本批不触 client.js/stats.js/wrapper/oauth-llm/tool；D12d/D13-D18/G/H 断言全保留（位置随插入平移，语义未动）。
- **断言总数独立复核**：`check(` 恰 **100**（95 + D19×5）✓ 与 100/100 声明吻合。
- **AI 专项（增量）**：无 mock（真实 service/Context/resolver 闭包；fake 仅门槛单测的声明式适配）；无幻觉 API（selectHostAccount 既有导出 :46 真实消费）；无 TODO；无过度实现。

---

## 三、发现列表（本轮增量——均 P3 记录性）

| # | 级别 | 位置 | 问题 | 处置建议 |
|---|------|------|------|----------|
| O7 | P3 | RED 声明 | 「stash RED：D19/D19a/D19b/**D17d** 必败」与本 Reviewer 代码级推演不符：批 6 基线上 D17d 的适配 fake 保留 hostRouteState + ctx（旧 maintained-only 门可满足 → D17d 应通过）；若 stash 点更早（批 5 前 maybeReload 不存在）则 D17e/f/D19d 亦应败——声称集合与任一单点基线均不吻合（推演 RED 集：批 6 基线 = {D19, D19a, D19b}）。GREEN 侧语义不受影响（D17d 在新代码上的锁定语义已核验成立） | Coordinator 机验时复核 stash 基线与实跑 RED 清单；以实跑为准修正记录 |
| O8 | P3 | 行数算术 | 本 Reviewer 直接观测：service.js 现 4279 行（按本会话前轮链 4270 + 净 17 应为 4287）、tests 现 729（679 + 净 45 应为 724）——前轮链存在未直接观测的累计误差（或本批 ± 统计口径为域级）。**全部直接读到的变更行均落 D9 语义**（import/resolver/maybeReload/D19 块/fake 适配），未发现任何夹带 | Coordinator commit-stat 交叉核对（声明已复核——以机验为准）；后续轮以直接观测行数续链 |

---

## 四、硬门槛裁决（快速轮）

| 门槛 | 实测 | 判定 |
|------|------|------|
| P0 阻塞 | 0（P2+ = 0；P3×2 记录性） | ✅ |
| D9 正确性三焦点 | 两级同源无新分化面 / 早期调用零抛路径 / reload 并发未触碰 | ✅ |
| 适配裁定 | 最小必要 + 语义如实 + 真实闭包补足 | ✅ |
| 范围 | 恰 2 文件（内容级全读核验）；stats.js/host-route.js 零改动直接复核 | ✅ |

---

## 五、审查结论

# APPROVED_WITH_NOTES

**unresolved_blockers=0**

- **D9：已修复**——身份与路由健康度解耦（DEC-029 裁决依据落实）：两级 resolver 同源无新分化面、降级期身份经配置确定性推导、真未知诚实回落；maybeReload 门槛换轨为身份就绪且幂等/persist/挂载位语义不变；D19 系以真实 RouterService + 真实闭包驱动五断言，降级前提自证、旧代码判别成立。
- **D17d/e 适配：追认成立**（最小必要 + 如实披露 + D19b/d 真实闭包补足闭环）。
- **R0-R4 修复面零回退**（stats.js/host-route.js 零改动直接复核；断言全保留；总数恰 100）。
- 保留备注：O7（RED 清单与代码级推演不符——Coordinator 机验复核）/ O8（行数链累计误差——机验交叉核对）；均 P3 记录性，不影响 GREEN 侧正确性。台账 O3/O5/O6/F-3~F-6 与闭环条件 F-7 未恶化。
- 测试执行声明（100/100、RED、21 套件）为 Coordinator 机验项——O7 提示其中 RED 清单需复核。
