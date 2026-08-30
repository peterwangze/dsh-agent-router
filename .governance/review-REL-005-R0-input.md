# Code Review — REL-005 R0（收尾段：P1-1 回落层对齐 + P2-2 测试 hygiene + README 收口）

## 报告头

| 项 | 值 |
| --- | --- |
| 任务 | REL-005 收尾段——P1-1 prestep 回落层 live default 对齐 + P2-2 测试目录 hygiene + README OAuth 口径收口 |
| 审查对象 | commit `1d2bf36`（5 files +111/-20：lib/prestep.js、tests/fix-010-gui-fidelity.mjs、tests/fix-009-image-solo.mjs、.gitignore、README.md；未 push——HEAD，ahead 12 of origin/main） |
| 审查轮次 | R0（input 阶段） |
| 来源 findings 对照 | P1-1 ← review-FIX-010-R0 F-1；P2-2 ← review-FIX-009-R0 P2-2；README ← review-EVO-007-R0 F-5（P3） |
| 审查者 | Code Reviewer Agent（只读；git 只读 + Grep/Read/Glob；未执行任何测试/命令） |
| 结论 | **APPROVED_WITH_NOTES（unresolved_blockers=0）** |
| P0 / P1 / P2 / P3 | 0 / 0 / 1 / 3 |

---

## 一、5 维度评审

### 维度 1：正确性 — 通过（宿主源码逐项核验）

1. **回落链与宿主 selectionFor 同源同时效（P1-1 核心）**——宿主源码核验（npx 缓存 `@deepseek-ai/dsh-host-apiproxy/lib/index.js`）：
   - `selectionFor`（host:1692-1715）：`current` getter = `picked`（进程内）→ `agent.session.requestHeader()?.config` → `defaults.defaultModelSelection()`——**每次读取**（getter 无缓存）；
   - `defaultModelSelection: () => ctx.agentDefaultModel.currentSelection()`（host:5532）——与插件 `liveDefaultSelection` 读**同一服务同一方法**；
   - `@deepseek-ai/dsh-agent-default-model/lib/index.js:56-58`：`currentSelection()` 每次调用 `selection(this.source())`——settings 挂载时 source 为 live 用户层（L45-50 setSource），**创建后 default 漂移可被感知**（GUI selectModel → host saveDefaultModelSelection → saveSelection → settings.replace → source 更新）；无 settings 时回 composition entry——两种部署下插件与宿主读取同源同时效成立 ✓；
   - 服务名 `"agentDefaultModel"`（agent-default-model:39，ApiProxyService static inject host:5499）；插件 `ctx.get('agentDefaultModel')` 解析同一实例（wrapper.js:450、service.js:710 同型先例核验）✓；
   - **options 非路由层实证**：dsh-agent-loop buildRequest（L693-714）seedConfig = `requestHeaderLogged ? requestProposal(persistedHeader) : {...this.options.provider/model}`——options 仅首轮 seed；`agent/request` 瀑布（L708-712）→ dsh-agent installModelSelection（L287-298）**覆盖 provider/model 为 selection.assembled**（= selectionFor.current）；宿主注释（host:1685-1690）明示 "There is no create-time per-session override tier on this wire"——申报"options 仅作终回退"成立 ✓。
2. **handler ctx 传递完备性**：grep 全仓——`sessionProvider(`/`sessionModel(` 仅 prestep.js:242-243 两处调用点，均在 installPreStep handler 内且均已传 ctx ✓。
3. **旧宿主回落安全（申报"行为与修复前一致"）**：服务缺失 → `ctx.get` 返回 undefined（cordis 语义，另有 typeof 守卫）→ liveDefaultSelection null → options 终回退——与修复前 header→options 链等价；currentSelection 抛错 → catch → null → options ✓。行为变更仅发生在漂移窗口（无 header + live default 可读）——即修复目标本身。
4. **漂移窗口双向正确**：无 header + live default 漂移为 wrapper → onWrapperRoute=true（对齐宿主路由，image 保留）；漂移为非 wrapper → 逃生组改写（对齐宿主直连非 wrapper，C-3 防击穿）——两个方向均与宿主实际路由一致 ✓。
5. **picked 盲区 P3 申报如实性确认**：host `selections` WeakMap + `selection.current` setter（host:1693/1707-1709）为 api-proxy 进程内状态，插件无访问 API；prestep 注释（L150-151）如实披露——确认 truthful ✓。

### 维度 2：安全性 — 通过

- 纯只读判定（header 读 + 同步 getter），无注入面、无敏感数据、无权限面变化；fallback 链安全方向（空 → options → 逃生组改写=宁可改写不漏图）与 FIX-010 R0 结论一致；无新增写路径。

### 维度 3：可维护性 — 通过

- `liveDefaultSelection` 单点封装（失败/缺失/空值统一 null），调用方回落链清晰；注释含 RCA 溯源 + 宿主行号引用（host:5532、host:1697-1705 均核验准确）；函数 8 行内，命名表达意图 ✓。
- P3-1：P8 注释措辞（见发现清单）。

### 维度 4：性能 — 通过

- 每图片轮新增一次 `currentSelection()` 同步调用（O(1) 内存读，无 IO）；header 读取已存在；零新增遍历/缓存失效面。

### 维度 5：测试覆盖 — 通过（判别性逐条推演）

- **E1 真判别成立**：旧实现（header→options）下无 header + options='deepseek-official'（非 wrapper）→ onWrapperRoute=false → accepts=false（harness ctx.get('llm')=undefined → 探测失败回落 false，FIX-005 语义）→ 逃生组改写 → image 块替换 → `hasImageBlock` 必败（红）✓；新实现 live default='text-provider-router' → onWrapperRoute=true → 不改写 → E1 绿 ✓。
- **E2 保持性**：同场景 accepts=false → reminder 追加——旧实现同样注入（非判别，标签如实"不回退"）✓。
- **E3/E4 反向控制**：服务缺失（harness 不传 mock → ctx.get 返回 undefined → null）与空值（`{provider:'',model:''}` → 调用方 truthy 检查拦下）→ options 终回退 → 逃生组改写保持——旧实现同路径，标签明确"非判别，控制组" ✓ 诚实。
- **A-D 组零影响核验**：A/B/C/D harness 调用均未传 agentDefaultModel（L110/173/201）→ liveDefaultSelection null → 与修复前完全同路径；A/C 有 header（header 优先不受影响）、B 无 header（options 同值）——结果逐组不变 ✓。
- **断言数**：fix-010 A(3)+B(2)+C(2)+E(4)+D(2)=**13**（申报 9→13 准确）；fix-009 A(4)+B(2)+C(3)=**9**（申报 9/9 准确）。
- **E 组注释宿主行号**（host:1697-1705 / host:5532）与实测源码逐行相符 ✓。
- 覆盖缺口 carry-forward：requestHeader 抛错 / header 部分字段缺失仍未覆盖（review-FIX-010-R0 P3-3 遗留，非本 commit 引入）。

---

## 二、P2-2 测试 hygiene 核验（逐项）

| 检查项 | 结论 |
|---|---|
| try/finally 覆盖异常退出 | ✓ fix-009-image-solo.mjs:63/143-146——try 包裹全部测试体，finally 内 `rmSync(DSH_HOME, {recursive,force})`（内层 catch 防清理失败）；`process.exit` 在 finally 之后（L147），退出码保留 ✓ |
| mkdtemp 平台兼容 | ✓ `mkdtempSync(join(tmpdir(), 'dsh-router-fix009-'))`（L37）——node:os tmpdir 跨平台（含 Windows）；与 smoke.mjs:37 同风格（`mkdtempSync(join(tmpdir(), 'router-smoke-home-'))` 核验）✓ |
| gitignore glob 语义 | ✓ `.tmp-fix0*-home/`（.gitignore L22-23）——gitignore `*` 不跨 `/`，`*` 可匹配任意字符序列（含数字）：`.tmp-fix009-home`、`.tmp-fix010-home` 均命中，任意深度生效，尾 `/` 限目录；fix-010 仍用固定 `.tmp-fix010-home`（无落盘操作，FIX-010 R0 已核）亦被覆盖为残留防御 ✓ |
| 实测零残留 | Developer 申报（审查约束未执行测试）——**未验证** |

---

## 三、README 准确性核验（对照 lib/client.js + lib/service.js 现态，commit 3665d6a 后）

| README 位置 | 声明 | 实现核验 |
|---|---|---|
| L20 | 官方 API 不提供 OAuth——v0.3.2 起已移除「OAuth 官方登录」入口 | client.js L2536-2538 高级扩展仅余账号池+孤儿列表；L111-113 与实现逐项相符 ✓ |
| L84 | 多模态账号（默认折叠）：API Key 账号、ChatGPT 订阅登录、子代理与账号池 | client.js L2437 注释 + L2438-2504 实装顺序（API Key → presetTitle 一级 → 子代理 → 高级扩展[折叠]）一致 ✓ |
| L108 | ChatGPT 订阅登录（一级，正式通道）一键授权 + 凭据落盘 + agent「OAuth 账号」字段指向 + ToS/风控提示 | client.js L2480-2503（preset 一级卡 + runPresetLogin/oauthBegin 链）✓；风险提示保留（EVO-006 遗留）✓ |
| L112 | 池行「删除账号」= 删条目+本机凭据+全池移除引用；「移除」仅移出本池 | `deleteOauthAccount`（client.js:2030-2052：①credentials.unset(tokenRef) ②所有池 accounts 过滤 ③unset oauthAccounts[id]，preset 分流 deletePresetAccount）；`removeAccountFromPool`（L2389-2393：仅池列表过滤，不动凭据/条目）——区分与声明完全一致 ✓ |
| L113 | 未入池 OAuth 账号极简列表仅删除入口（含旧版自定义/粘贴 token/未知 preset 值） | `orphanOauthIds`（client.js:2345-2348：非 preset 且不在任何池）+ L2587-2612 渲染（每行仅删除按钮 → deleteOauthAccount）✓ |
| L129 | v0.3.2 起移除官方登录/粘贴 token 管理入口；历史账号仅在池/孤儿列表可删；登出并删除凭据 | service.js:3712 oauthLogout 错误文案指向池行/未入池列表删除（F-2 修正生效）；preset 卡 onLogout/onDelete（L2499-2500）✓ |
| 时点声明 | "v0.3.2 起"（L20/111/129） | 本 commit 在 v0.3.2 发布前（v0.3.1 为最新已发布），功能随 v0.3.2 首发——时点准确，无过度承诺 ✓ |
| 残留扫描 | grep README "OAuth|粘贴 token|Google Cloud" | 零陈旧残留（旧 "Google Cloud OAuth Client/内置公开 Client" 引用已清除）✓ |

---

## 四、范围纪律与治理记录

- **5 文件与锁内一致性（部分）**：commit 恰 5 文件（lib/prestep.js、tests/fix-009-image-solo.mjs、tests/fix-010-gui-fidelity.mjs、.gitignore、README.md）；**无 bump**（package.json/CHANGELOG.md 未触碰——发布段预留，锁中注明）✓；`git show --check` 零 whitespace 错误 ✓。
- **P2-1（治理记录一致性）**：triage（REL-005.json files）与 agent-locks（target_files）仅列 prestep.js / fix-009-image-solo.mjs / README.md / package.json / CHANGELOG.md——**未含 tests/fix-010-gui-fidelity.mjs 与 .gitignore**。二者均为收尾段任务的自然组成部分（E 组判别——review-FIX-010-R0 P3-3 明确"随 P1-1 处理"；gitignore 条目——review-FIX-009-R0 P2-2 建议"或补 .gitignore 条目"），**非越域**；但机器记录未同步（FIX-009 P2-1 同型）。建议 Coordinator 补录两文件。
- **单一 commit 三面承载**：任务书明示允许；三面变更互不交织、总量 +111/-20 最小；收尾段批量语义一致（P3-2 观察）。

---

## 五、AI 专项 5 项

| # | 检查项 | 结论 |
|---|---|---|
| 1 | mock/桩真实性 | ✅ agentDefaultModel mock 仅存在于测试夹具（fix-010 harness 显式构造对象），产品代码零 mock；被测对象 installPreStep 为真实实现 |
| 2 | 硬编码返回值 | ✅ liveDefaultSelection 判定纯读入参（ctx.get 结果），无硬编码 |
| 3 | 幻觉 API | ✅ `ctx.get('agentDefaultModel')` / `currentSelection` 契约宿主源码核验（agent-default-model:39/56 + host:5532 + wrapper.js:450/service.js:710 插件内同型先例）；测试 import（mkdtempSync/rmSync/tmpdir/join）node 内置真实存在 |
| 4 | 未实现 TODO | ✅ diff 无 TODO/FIXME 残留 |
| 5 | 过度实现 | ✅ 最小面：prestep +20 行（1 新辅助函数 + 2 签名扩展）、测试 +51（E 组 4 断言）、fix-009 +14（hygiene）、gitignore +3、README +13/-8 |

---

## 六、重点核验逐项（任务书 6 项）

1. **P1-1 层次序正确性**：✅ 宿主源码三级核验（selectionFor getter 每次读取 + defaultModelSelection=currentSelection 同方法 + options 非路由层实证）——申报"header → live default → options"与宿主"picked → header → live default"逐层同源（picked 除外）；ctx 传递完备（2 调用点全传）；旧宿主回落安全（等价修复前）✅
2. **E 组断言判别性**：✅ E1 旧实现必败推演闭合（读 options → 非 wrapper → 逃生组改写 → image 丢失）；E3/E4 反向控制真锁住"live 缺失/空 → options 终回退"语义（truthy 校验拦空串）；harness mock 对 A-D 零影响（不传 mock → null → 原路径）✅
3. **P2-2 hygiene**：✅ try/finally 覆盖异常路径；mkdtemp 平台兼容；gitignore glob 语义核验命中两目录名 ✅
4. **README 准确性**：✅ 5 处修改与 EVO-007 R1 现态 client.js/service.js 逐项相符（删除/移除区分、孤儿列表、入口文案、oauthLogout 错误指向）；无过度承诺（v0.3.2 时点正确）✅
5. **范围纪律**：✅ 5 文件、无 bump；triage/lock 文件清单缺口 = P2-1；单 commit 三面 = 任务书允许（P3-2）
6. **picked 盲区 P3 申报**：✅ 如实（host WeakMap 进程内状态无插件 API，源码核验）

---

## 七、发现清单

### P0（0）
无。

### P1（0）
无。

### P2（1）
- **P2-1（治理记录一致性）**：triage REL-005.json `files` 与 agent-locks `target_files` 未含 tests/fix-010-gui-fidelity.mjs、.gitignore，实际 commit 含二者。实现为 P1-1/P2-2 任务的自然组成部分（来源 review 均明示），非越域；建议 Coordinator 补录，保持机器记录与 commit 一致（FIX-009 P2-1 同型）。

### P3（3）
- **P3-1（prestep.js:193 注释措辞）**：`liveDefaultSelection` 注释声称"P-v2 原则 8：能力判定缺失可观测——此处缺失不静默吞错"，但实现为 catch → null 静默返回，运行时无诊断事件。行为安全（回落 options → 逃生组语义确定且文档化），但"不静默吞错"措辞与实现不符；如需严格 P8 达标，可加一行 `ctx?.logger?.debug`（wrapper.js:442 有同型诊断先例），或措辞改为"缺失时回落链语义确定且文档化"。不要求本轮修改。
- **P3-2（commit 组织）**：单一 commit 承载三面（P1-1 + P2-2 + README）——任务书明示允许、变更互不交织、+111/-20 最小，收尾段批量语义成立；与"一个 commit 一个问题"原则略有偏离，记录观察，接受。
- **P3-3（覆盖缺口 carry-forward）**：requestHeader 抛错路径、header 部分字段缺失（有 model 无 provider）仍未覆盖（review-FIX-010-R0 P3-3 遗留，非本 commit 引入）；E2/E3/E4 非判别断言标签如实（控制组/保持性），判别边界诚实无夸大。

---

## 八、结论

**APPROVED_WITH_NOTES（unresolved_blockers=0）**

- P0 = 0；P1 = 0；P2 = 1（P2-1 治理记录补录，供 Coordinator 处理）；P3 = 3
- 硬门槛：P0=0 ✓；5 维度全覆盖 ✓；AI 专项 5 项 ✓；设计一致性 ✓（DEC-027 三不变量保持——wrapper 会话日志层零污染、模型面适配留 wrapper stream；P-v2 原则 9 宿主演进防御：对 agentDefaultModel 做服务存在性+方法存在性守卫、缺失回落 options 终回退，与 wrapper.js canTakeover 模式一致，无单向信任）
- 事实红线：全部核验点均指向可复查事实（宿主源码行号实测、插件源码逐行、git diff/status、triage/lock 文件）；**门控实测（smoke 963 持平 / fix-009 9/9 / fix-010 13/13 / 其余持平，全 exit 0）为 Developer 申报——审查约束禁止执行测试，未验证**（断言数与申报静态一致：9/13 准确）
- 修复有效性判定：P1-1 回落链与宿主 selectionFor 第三层**同服务同方法每次读取**（源码实证），漂移窗口双向对齐宿主实际路由——**修复正确，可合并**；P2-2 hygiene 三件套（mkdtemp + finally + gitignore glob）语义完备；README 收口与现态 UI 逐项相符零残留。

---

*报告生成：R0 审查（commit 1d2bf36）· 审查者：Code Reviewer Agent · 依据 code-review SKILL（P0-P3 分级 + 事实红线）*
