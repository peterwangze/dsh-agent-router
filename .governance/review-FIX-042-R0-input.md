# 代码审查报告（review-FIX-042-R0-input）

- **round = R0**（FIX-042 首轮；前序 = FIX-041 链 R0→R1 终态 APPROVED_WITH_NOTES/0，**非本任务轮次**）
- **前轮引用（MUST 读，已读）**：`.governance/review-FIX-041-R0-input.md`（F-2② 与 §五残留）+ `.governance/review-FIX-041-R1-input.md`（§二.3 五处属实 + 补 2 处 + §三 P3-1/P3-2 + §五 建议）
- **审查对象**：`6bc3841..61af16a`（4 笔）；受审 HEAD = **`61af16a`**；文件集 = **15 文件 `+96/−41`**
- **审查者**：Code Reviewer Agent（只读；**未修改任何被跟踪文件**；唯一写入 = 本报告 + 4 个 gitignored 只读核验脚本 `.test-home/fix042-r0-*.mjs`）
- **执行依据**：4 笔 `git show` 全量 diff 逐行 + HEAD 终态逐行 + **独立复算**（自建 W1 锚位计数脚本 / W3 清点表复现脚本 / ANCHOR_CASES 自满足变异脚本）＋ `git worktree` 只读复现批前树 ＋ **守卫与门控本机独立复跑** ＋ 宿主树只读抽样（`$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-llm`）
- **结论（四态）**：**NEEDS_CHANGE**
- **独立结构字段**：**`unresolved_blockers=1`**
- **计数（本轮新发现）**：P0 = 0 / P1 = 0 / **P2 = 1（阻塞）** / P3 = 4（不阻塞）

**一句话理由**：本批**机制面全部成立且经我独立复现**——W1 的 **12 处替换位点**（我自建 diff 解析器机算 = 12，逐位点 1 token、0 新增锚）**逐一核验指向对象真实存在**（20/20 stale 零残留、14/14 fresh 在位、目标对象实存），**零新幻觉引用**；W2 的 `ANCHOR_CASES` 16→25（终态）条目**内容全部可机验**（stale 零残留 × fresh 在位），**拼接常量手法经内存变异实证有效**（变回字面量即判红、删 `:104` needle 即翻转）；W2.1 的**事实性更正全部成立**（见 §三.3：所引文本确在 `.governance/review-FIX-040-R2-input.md`、b4f2235 处数字确为 718/752），**且我用更严口径机算出该文件中仍有 9 处行号式自指**（Developer 只报了 1 处）⇒ 新判定「行号式自指 **≠0**」；W3 的 **97 处/22 文件**在**批前树（`6bc3841`）复跑逐 (file:line) 零差异**（真可复现）、H2 相邻行归属抽查 7/7 成立、**「不声称机器覆盖」+ 人工复检义务句到位**；W4 五处裁定**全部正当**。**不通过的唯一原因 = 计数口径不可迁移**：W3 的 `97/22` 是**批前点**数字（HEAD 复跑 = **92/19**，差 13 条已清点 + 8 条本批新增守卫条目），而注释与提交信息**未标注生成修订**，未来批次按脚本在 HEAD 复跑必得 92 ⇒ 违反 FIX-041 R1 §三.5 自己确立的「**数字必须连口径引用**」纪律，构成**不可复现计数**（FIX-041 R0 F-3 同族，修复成本 1 行口径标注）。另 P3×4（W1 提交信息 9 vs 实测 12 的**同批计数不实**、W3 提交 6 vs 7 文件、`lib/wrapper.js:266` 同类未清锚（我机算确为真漂移，宿主 `resolveModelInfoFor` 实 `:2046`）、`9 处宿主自锚`非全为宿主）。**其余面（越权零 / 断言零删除 / 守卫 174 断言 / 门控 exit 0 / 镜像 SHA256 恒等 / 零宿主树操作）全通过。修复后 MUST 复审（round = R1）。**

---

## 一、独立取证清单（全部实测；不采信 Developer 取证件内容）

| # | 事实 | 命令 / 结果 |
|---|------|------------|
| 1 | 范围与越权面 | `git rev-parse HEAD` = `61af16a…`；`git log --oneline 6bc3841..61af16a` = **4 笔**（`fa99686` → `0a176b5` → `d58c5ca` → `61af16a`，顺序与声明逐笔一致）；`git diff --stat` = **15 文件 `+96/−41`**（`lib/client.js 2`、`lib/host-abi/health.js 6`、`lib/host-abi/inject-manifest.js 14`、`lib/host-abi/llm-selection.js 9`、`lib/host-route.js 2`、`lib/oauth-llm.js 2`、`lib/service.js 3`、`lib/wrapper.js 4`、`tests/client-render.mjs 10`、`tests/fix-012-image-takeover.mjs 2`、`tests/host-abi-health.mjs 66`、`tests/rpc-shadow-guard.mjs 10`、`tests/served-client.js 2`、`tests/smoke.mjs 2`、`tests/stats.mjs 3`）✅；`git diff --name-only … -- AGENTS.md CHANGELOG.md package.json .governance` = **空**（零征用面）✅；`git status --porcelain` = **空**（零残余）✅ |
| 2 | **守卫套件（独立复跑）** | `node tests/host-abi-health.mjs` @`61af16a` = **`ALL HOST ABI HEALTH TESTS PASSED (174 assertions)`，exit 0** ✅（基线 165 → +9） |
| 3 | **门控（独立复跑）** | `node tests/run-all.mjs` = **`ALL 20 SUITES + 4 RUNNER MODULES (via smoke.mjs) PASSED (21.8s)  #SKIP 2 (smoke.mjs×2)` exit 0** ✅（与 FIX-041 链同口径；两 skip = `0o600` win32 例外 + `POSIX online checks` 无 sh/curl） |
| 4 | **镜像对字节恒等（独立复算）** | `Get-FileHash` 两文件 = **`A98743543D9AFDA062ADB6B2F89CDA5B22B490C19A2597FE48DBDD3AB811D6A0`（相同）**，`Length` 均 = **396,338B** ✅（与提交信息所报哈希逐字一致） |
| 5 | **断言集合机比对（base→head）** | 以 `check('<label>'` 机抽取：base `6bc3841` = **168** → head = **168**；`Compare-Object`（排序去重）**逐元素相等**；**REMOVED = 0 / ADDED = 0**（本批未增删 check 调用，增幅全部来自 `ANCHOR_CASES` 条目驱动的循环内 check）✅ |
| 6 | **`ANCHOR_CASES` 条目数（真值）** | base = **16** → head = **25**（机计 `{ file: [` 行）；其中 W2 笔（`0a176b5`）= 16→22（+6），W3 笔（`61af16a`）再 +3（`lib/host-abi/health.js` / `lib/host-abi/inject-manifest.js` / … 与 `lib/host-route.js` 计 3），终态 **25** ⇒ 断言数 165 + 9 = **174** 与 #2 逐位吻合 ✅ |
| 7 | **W1 替换位点独立机算（核心）** | 自建 diff 解析器（`git show fa99686 -U0` 删除行 × 三正则）＝ **12 个锚 token / 11 删除行 / 8 文件**（`health.js 2`（`:116-124`、`:127-141`）/ `inject-manifest.js 2`（`:5060`、`lib/client.js:5060`）/ `oauth-llm.js 1` / `service.js 1` / `wrapper.js 1` / `client-render.mjs 2`（同一锚两处）/ `host-abi-health.mjs 1` / `rpc-shadow-guard.mjs 2`）；**新增行中含锚 token = 0** ⇒ 「只改指代方式、不引入新锚形态」成立 ✅（**但与 W1 提交信息自述「只收 9 处」不符**，见 §四 F-2） |
| 8 | **stale 串零残留（逐一实算，20 条）** | `git grep -F -c` 逐条：`lib/preset-defaults.js:116-124`(health.js) = **0**、`presetDiag :127-141`(health.js) = **0**、`dsh-client-modules lib/client.js:265-268`(inject-manifest) = **0**、`lib/client.js:5060` = **0**、`runCodexResponsesChat :2906-2929`(oauth-llm) = **0**、`dsh-llm lib/index.js:1527`(wrapper) = **0**、`stream 直传分支（下方 :353）` = **0**、`lib/preset-defaults.js:100-108`(client-render ×2) = **0**、`lib/client.js:4754-4825`(client-render) = **0**、`lib/client.js:2842-2848`(client-render) = **0**、`dsh-api-gateway/lib/index.js:101-103`(rpc-shadow) = **0**、`host-contract.mjs:82-88`(smoke) = **0**、`:4074 的设备码会话取消`(service) = **0**、`service.js:2414-2561`(stats) = **0**、`lib/client.js:3226`(fix-012) = **0**、`dsh-credentials-local resolve(:473)/set(:513)/unset(:517)`(host-route) = **0**、`@deepseek-ai/dsh-llm lib/index.js:1698`(llm-selection) = **0**、`dsh-host-apiproxy L1187-1189` = **0**、`index.js:605, 2502-2503` = **0**、`lib/client.js:4754-4825`(client.js) = **0** ⇒ **20/20 全零** ✅ |
| 9 | **fresh 串在位（逐一实算，14 条）** | `git grep -F -c` 逐条（目标文件内计数）：`presetDiag/notePresetDiag`(health.js) = **2**、`const inject =`(inject-manifest) = **1**、`宿主 dsh-client-modules 的包表行` = **1**、`` `runCodexResponsesChat` ``(oauth-llm) = **1**、`` `stream()` 的图片块保真直传分支 `` = **1**、`` 宿主 dsh-llm 的 `registration()` 实现 `` = **1**、`host-contract.mjs 的 check(label, condition, detail)`(smoke) = **1**、`` `exchangeDeviceCode` 的落盘前 cancelled 复查 ``(service) = **1**、`EVO-003 迁移前 RouterService 内联聚合`(stats) = **1**、`lib/client.js 的旧假设`(fix-012) = **1**、`` 宿主 dsh-api-gateway 的 `Reflect.get(receiver, implementation)` 解析面 `` = **1**、`` `this.stats = new StatsStore(...)`（lib/service.js） `` = **1**、`` 宿主 dsh-credentials-local 的 `resolve`/`set`/`unset` ``(host-route) = **1**、`会话已含图`(fix-012) = **1** ⇒ **14/14 在位** ✅ |
| 10 | **新建锚的目标对象实存（抽样 ≥8，读目标文件实位）** | ① `lib/oauth-llm.js:47` = `export const OAUTH_PROVIDER = 'chatgpt-oauth'`（`lib/stats.js:104` 新锚对象，唯一注入点）✅ ② `lib/host-abi/ctx-services.js:146` = `export function agentPresetsServiceOf(ctx) {`（`client-render.mjs` 两处「定义在 lib/host-abi/ctx-services.js」**真**）✅ ③ `lib/stats.js:359` = `export class StatsStore {`（`tests/stats.mjs` 新锚「现单点实现 = …StatsStore」**真**）✅ ④ `tests/smoke.mjs:34` 新签名式锚在原位 ✅ ⑤ `lib/service.js:4215` 附近 = `exchangeDeviceCode` / `cancelled` 复查语义**真**（`lib/service.js:3944` 定义）✅ ⑥ `tests/rpc-shadow-guard.mjs:11/41` 新锚在位 ✅ ⑦ `tests/fix-012-image-takeover.mjs:15` 新锚 + `会话已含图` 在本文件实存 ✅ ⑧ `lib/host-abi/inject-manifest.js` 新锚 `const inject =`/包表行在位 ✅ ⑨ `tests/client-render.mjs:533/1872` 新锚在位 ✅ ⑩ `lib/wrapper.js:264` 新锚在位 ✅ ⇒ **≥8/12 抽样（实为 10 组）全部指向真实对象，零幻觉引用** |
| 11 | **语义是否被改动（只改指代方式）** | 对 8 文件 `git diff -U0` 逐 `+` 行过滤（去 `//`/`*`/`/*`）：**非注释改动行 = 0** ✅；W1 提交级 `--numstat` = `+20/−19`，**新增行含锚 token = 0**（取证 #7）⇒ 无「借改写引入新事实/新数字」 |
| 12 | **HIT 侧抽查（≥4，验「确不应改」）** | ① `lib/oauth-llm.js:232` 邻行宿主 `dsh-llm-pi-ai lib/index.js:1123-1128`（原文未动，属宿主锚）✅ ② `lib/host-route.js:22` 邻行 `(:439-470)` + 邻行 `dsh-settings`（原文未动）✅ ③ `lib/service.js:1326` 邻行 `(:2582-2594)` + `:1325` 宿主 `dsh-host-apiproxy lib/index.js:1010-1054`（原文未动）✅ ④ `tests/fix-029-host-contract.mjs:389` 宿主 `dsh-llm lib/index.js:1698/1780/2177/2018`（在断言标签内，原文未动）✅ ⇒ **4/4 抽查属宿主锚或他批范围，不改正当**（但见 §四 F-3 的 W1 规则边界） |
| 13 | **W2.1 更正的事实性（独立核验）** | ① 所引文本**确不在守卫文件内**：`现行 :718-720 = …` **逐字**出自 `.governance/review-FIX-040-R2-input.md:49`（我按行号直读，185 行文件）；`9h-2 注释 :747-752 明示…` 出自 **`:90`**（逐字）✅；守卫文件内**不存在**该文本（我全文扫描，见 #14）② `git show b4f2235:tests/host-abi-health.mjs`：注释块的「现行 `:718-720`」确在 **718-720**、9h-2 注释的 `21 对`/`不声称` 确在 **752**（我逐行实读）⇒ **FIX-040 收口时点数字准确** ✅ ③ 见 #14 ⇒ **Developer 声明成立，R1 P3-2 的位置不属实**（§三.3） |
| 14 | **守卫内行号式自指机算（我自主加严）** | 我以 `^\s*(//|\*|/\*)` 过滤后扫描 `(:|L)\d{2,4}`：**9 处命中**（`:203` 宿主 `index.js:605` / `:720` 在仓锚自身 / `:721` `:47` / `:726` `lib/preset-defaults.js:100-108` / `:729` `:99/:179` / `:740` `host-contract.mjs:82-88` / `:749` `L16/L158/L165` / `:752` `README L125` / `:753` `README.md:266` / `:756` `:30/:82` / `:757` `CHANGELOG.md:25` / `:759` `:4074` / `:760` `:4074` / `:775` `L5682-5760` / `:806` `service.js:2414-2561` / `:808` `lib/client.js:3226`）——按「**指向本文件自身位置**」的严格口径，命中 = **`:862` 的 `:118-119`**（`R0 P1-1：:118-119 的旧锚名…`，指 `metrics.mjs` 的**行号**，且该行号已随本批 +9 行**同时失效**）；其余命中为「宿主锚 / 他文件已清锚 / 守卫自身 stale 字段内的**字面量清单**」。⇒ **Developer 「零处行号式自指」在「自指 = 指本文件位置」口径下为 1 处（`:862`），非 0**（§三.3③）；在「清单内字面量」口径下亦非 0 |
| 15 | **W3 97 处可复现性（核心）** | 我**以 `git worktree` 只读检出 `6bc3841`（批前树）复跑** `.test-home/fix042-host-family.mjs` = **`97 处 H1=57 H2=40 / 22 文件`**；再以自建脚本（`git show <rev>:<file>` 逐文件复算，不落盘、不建树）在 `6bc3841` 逐 `(file:line)` 与 `.test-home/fix042-host-family.md` 表比对 ⇒ **表有扫描无 = 0 / 扫描有表无 = 0（零差异）** ✅ 真可复现；**同一脚本在 HEAD 复跑 = 92 处 / H1=54 / H2=38 / 19 文件**（表有扫描无 13 = 本批已清点；扫描有表无 8 = 本批新增的守卫条目行 `:728/:729/:733/:796/:797/:798/:799/:814`）⇒ **`97/22` 是批前点数字，未标注取数修订**（§四 **F-1**） |
| 16 | **H2 相邻行归属抽查（≥5）** | ① `#1 lib/client.js:4281`（包名在上一行 4280 `dsh-host-apiproxy`）**成立** ② `#7 lib/client.js:5008`（邻行 `dsh-client-ui-settings-models`，跨行包名 `dsh-client-ui-`+`settings-models`）**成立** ③ `#21 lib/host-route.js:22`（上一行 21 含 `dsh-settings`）**成立** ④ `#41 tests/client-render.mjs:515`（上一行 514 `dsh-client-ui-model-selection`）**成立** ⑤ `#45/#46 tests/client-render.mjs:1982/1987`（邻行 `dsh-client-connection` / 同行 `dsh-client-ui-settings-models`）**成立** ⑥ `#13 lib/host-abi/client-remotes.js:295`（跨行包名 `dsh-client-ui-` + `settings-models`）**成立** ⑦ `#14 lib/host-abi/events.js:45`（跨行 `dsh-api-remotes/lib/types/`）**成立** ⇒ **7/7 归属成立，未见误判**（边界披露亦属实：`#33` 记的 `dsh-api-session-controller` 同出处包名实为 `dsh-api-session`〔FIX-041 报告亦写 `dsh-api-session-controller`〕——同一易错面，不单列 finding） |
| 17 | **基线登记 / 义务句是否含过度断言** | `tests/host-abi-health.mjs:778-789` 原文含「**仓库级守卫不可解析宿主树 ⇒ 本清单不覆盖宿主锚、不声称机器覆盖**（…机器判据仅覆盖「本仓文本内的锚串形态」）」**+** 人工复检义务句（宿主升级后按 `tests/host-contract.mjs` 头部刷新程序 + `tests/host-version-snapshot.mjs` 同步、逐处重核对象符号）⇒ **零过度断言** ✅；`.test-home/fix042-host-family.md:6` 亦载「现状列统一『不可本仓核验（需宿主树）』；**不得读作机器覆盖**」✅ |
| 18 | **试点符号来源（反幻觉）** | 11 锚位新锚的宿主符号逐一回读锚串同句：`dsh-credentials-local` 的 `resolve/set/unset`（原句已具名）／`sessionController.selectModel`（原句已具名）／`dsh-host-apiproxy` 的「空白判据」（原句含 `sessionBlank`）／`Reflect.get(receiver, implementation)`（原句已具名）／`registration()` 实现（原句已具名）／`dsh-client-modules` 的「包表行」（原句为包名 + 行号）⇒ **未引入任何未在原文出现的宿主符号** ✅ |
| 19 | **`ANCHOR_CASES` 自满足规避（拼接常量）— 内存变异实证** | 我按守卫同形构造该条目（`stale:[OLD_PRESETDIAG_LINE_ANCHOR]` / `fresh:['presetDiag/notePresetDiag ' + '纪律同构']`）并在源码文本上跑判据：**基线 predicate = true**；`occurrences('presetDiag :127-141') = 0`；`occurrences('presetDiag/notePresetDiag 纪律同构') = 1`（唯一命中行 = **:104**）；**变异 A（删 `:104` 的 needle）⇒ predicate = false**（翻转）；**变异 C（把拼接常量改回字面量 `'presetDiag :127-141'`）⇒ staleHits = 1 ⇒ predicate = false（判红）**；**变异 B（常量改值）⇒ 仍 true**（stale 侧与常量无关，符合设计）⇒ **X&&X 自满足已被消除，双向可达，Developer 手法有效** ✅ |
| 20 | **零宿主树操作（Developer E 声明核验）** | 本批 `+` 行全文扫描（`DSH_HOME|node_modules|profiles[/\\]|C:\Users|/Users/|AppData|\.dsh`）= **零命中**；取证脚本 `.test-home/fix042-host-family.mjs` 头部 imports = `node:fs` / `node:child_process` / `node:path`，body **仅** `git ls-files` + `readFileSync(join(ROOT, file))`（ROOT = `process.cwd()`，文件集来自 `git ls-files` 且排除 `.governance/`、`docs/`、`CHANGELOG.md`）⇒ **确未读宿主路径** ✅（我另在同文件复算得 97/22，与批前树一致，反证其扫描面为仓库面） |
| 21 | **`tests/host-abi-health.mjs:742` stale needle 反引号形态（复审要求 7）** | 该 needle = `'typert contribution registered\` 断言行\n  // （符号名式锚；原写死行号'`（**含未成对反引号**）；在 `tests/smoke.mjs` 内实况 = **false（不在位）**、在守卫自身内实况 = **0 次** ⇒ 对 `source.includes(needle)` 判据**恒绿（无效 stale 项，无判别力）**；**本批（`d58c5ca`）只往同一 stale 数组追加了 `'host-contract.mjs:82-88'` 1 串，未改该 needle 本身**（`git log -L` 实读）⇒ **FIX-040 遗留、本批未使状况变差，不构成问题（登记 P3 台账）** |
| 22 | **同族残留锚抽样（我自主扩展）** | `:1397-1403` 全仓唯一命中 = `lib/wrapper.js:266`；宿主树实读 `dsh-llm/lib/index.js`：`:2044 = return this.resolveModelInfoFor(...)`、**`:2046 = async resolveModelInfoFor(...)`**、`:2047 = ...registration.adapter.resolveModel(...)`，而 `:1397-1403` = `assembleAssistantStream` 函数体 ⇒ **该锚为真漂移（MISS）且未入 W1 清单**（§四 F-3） |
| 23 | **同批其他未清锚（我自主扫描）** | `git grep -nE '([A-Za-z0-9_./-]+\.(js|mjs)):[0-9]+(-[0-9]+)?' -- lib/** tests/**`（排除守卫）命中集中于：`tests/host-contract.mjs 19`、`lib/client.js 12`、`tests/served-client.js 12`、`lib/oauth-llm.js 5`、`tests/client-render.mjs 5`、`lib/index.js 3`、`lib/prestep.js 3`… 其中**多数邻行为宿主包名**（属 W3 已披露的清单边界），个别为在仓目标（如 `lib/wrapper.js:266`）⇒ **W1 的「在仓锚」判定面确实未收敛**（与 Developer C 项「不得以 97 为终局范围」的自我界定一致） |
| 24 | **推送状态与真实环境防护** | `origin/main` = **`6bc3841`**；`git rev-list --count origin/main..HEAD` = **4** ⇒ 本批 4 笔**全部未 push** ✅；本审查**未执行任何 `$DSH_HOME` / 宿主树写操作**（宿主面仅 `Test-Path` + `Get-Content` 只读）；临时 `git worktree` 建在 `$env:TEMP`（仓库外、非用户配置目录）且**已 `remove --force` + `prune`**，残留计数 = 0、`git worktree list` 仅主树；工作树零写、`git status --porcelain` 空 ✅ |

---

## 二、4 笔逐笔核验

| # | hash | 声明 | 我的独立裁定 | 依据 |
|---|------|------|------------|------|
| 1 | `fa99686` | **W1**：12 处 MISS 去行号改符号名/代码串式（8 文件，纯注释） | **机制面成立**（12 位点实算、20/20 stale 零残留、14/14 fresh 在位、对象实存、零新幻觉、纯注释）；**提交信息计数不实**（自述「9 处」，附着清单记 12 处） | #1 / #7 / #8 / #9 / #10 / #11 / **F-2** |
| 2 | `0a176b5` | **W2**：`ANCHOR_CASES` 16→22 + 守卫自身自指锚入表 + 双向可达性实证 | **成立**：条目 16→22 实算吻合；新增 6 条目 stale/fresh **全部机验通过**；拼接常量**经变异实证**消除 X&&X；其自指锚**零行号机核**的结论**部分不成立**（实存 1 处 `:862`） | #6 / #19 / **#14** |
| 3 | `d58c5ca` | **W4**：5 处逐处裁定（2 改 / 1 去行号 / 1 宿主锚登记 / 1 冻结登记） | **成立且正当**：`tests/stats.mjs:8` MISS→语义描述（对象实存）、`fix-012:15` MISS→归属文件式、`smoke.mjs:34` HIT→去行号、`fix-010:12` 宿主锚不改+登记、`CHANGELOG.md:472` 冻结未触；`git diff` 范围不含 `CHANGELOG.md` | #1 / #10 / §三.6 |
| 4 | `61af16a` | **W3**：97 处/22 文件清点 + 基线/复检义务登记 + 11 锚位试点（含镜像对同步） | **机制面成立**：97/22 **批前树可复现**（零差异）、H2 归属 7/7 成立、基线零过度断言、11 锚位符号取自同句、镜像对 SHA256 恒等；**但 `97/22` 在 HEAD 复跑 = 92/19 且未标注取数修订**（计数口径不可迁移）；提交信息「7 文件」与实测 6 文件不符 | #4 / #13 / #15 / #16 / #17 / #18 / **F-1 / F-2** |

**逐笔结论：4/4 笔的机制面声明成立**；本轮阻塞项在 **W3 的数字口径可迁移性**（F-1），非机制面。

---

## 三、复审要求 9 项逐项结论

### 1. 5 维度 + AI 专项 5 项 —— 见 §五（全部完成、逐项有结论）

**重点三项专答**：
- **幻觉引用**：**未重现**。#10 的 10 组新锚对象逐一实存、#9 的 14 条 fresh 全在位；本批 `+` 行内**无**指向不存在对象的引用。唯一「对象不存在」出现在**守卫的 stale 清单内**——那是**判据输入**（要求零残留），非引用。
- **过度断言**：**未重现**。#17 的「不声称机器覆盖」+ 人工复检义务句 + `fix042-host-family.md:6` 的三重界定到位；W4 与 W3 的「不改宿主锚以免制造新幻觉引用」是**收紧**而非放宽。
- **死代码**：**无**。本批 `+` 行 `TODO/FIXME/XXX/HACK` **零命中**；新增常量 `OLD_PRESETDIAG_LINE_ANCHOR` 被两处条目消费；新增条目全部进入循环判据（`check` 在 `for…of` 内，一条目恒 1 条 check）。

### 2. W1 反幻觉核验（核心）—— **12 处新锚全部指向真实对象；语义未被改动；HIT 抽查 4/4 正当；清单外 5 处属实**

- **12 处逐一核验（超出 ≥8 要求）**：见取证 #10（10 组实读目标文件实位 + 其余 2 处同族）。**零幻觉引用**；且我**机算证明「新增行含锚 token = 0」**（#7）⇒ 不存在「以新锚掩盖旧锚」的形态。
- **是否改变注释语义**：**未改变**（#11：非注释改动行 = 0；W1 每条改写均为「行号式 → 符号名/包名/代码串式」的**同指代**替换；唯一的语义细化在 `lib/service.js:4215`「`exchangeDeviceCode` 的落盘前 cancelled 复查」，我实读 `lib/service.js:3944` 定义 + `:4207-4211` 的 `cancelled` 语义**支持**该表述）。
- **HIT 12 处是否确不应改**：**抽查 4 处全部成立**（#12）。但**规则边界需更正**：W1 的「HIT」判定似基于「该行号是否命中某对象」——`lib/wrapper.js:266` 的 `:1397-1403` 在**宿主树**实为 `assembleAssistantStream`（不命中），而 `lib/client.js:4281` 的宿主锚 `lib/index.js:2596-2630`、`lib/service.js:1326` 的 `:2582-2594` 均为**隔行写法**（对象在本行之外）⇒ **按文件计数时同类站点仍有余留**（§四 F-3）。
- **清单外新发现 5 处是否属实**：**属实**——`lib/host-abi/health.js:30`（stale 串由本批清除，我机验 0 次）✅、`tests/host-abi-health.mjs:104`（同上）✅、`lib/oauth-llm.js:89`（`:2906-2929` 已清）✅、`lib/service.js:4215`（`:4074` 已清、语义支持）✅、`lib/wrapper.js:264`（`:353` 已清）✅；**我另发现 1 处其清单未列**（`lib/wrapper.js:266`，§四 F-3）。

### 3. W2.1 更正的事实性（重点且敏感）—— **Developer 更正成立；R1 P3-2 的「位置」不属实；我进一步更正「零处自指」为「≥1 处」**

① **所引文本是否确在 `.governance/review-FIX-040-R2-input.md:49/:90` 而非守卫文件**：**确在报告**。我按行号直读：`:49` = 「| **P3-2(new)** `:718-719` / `:749-751` 覆盖表述过度 | … 现行 `:718-720` = 「本项判『清单内连续锚串』这一形态…**不声称闭环**」；9h-2 注释 `:747-752` 明示…」；`:90` = 「- **不实表述**：逐条核对本轮新增/修改的 4 处注释（`:43-44` 头部面说明、`:718-720` 覆盖界定、`:747-752` 9h-2 覆盖界定、`:795-800` 9h-3 阈值披露）…」。**逐字吻合**（含 `现行 :718-720` 与 `9h-2 注释 :747-752` 两处关键串）。守卫文件内**不存在**这些串（#14）。⇒ **R1 P3-2 把「报告内的行号」误记为「守卫文件内的行号」，其「守卫文件自指行号失效 3 处」的定位不属实**。

② **`b4f2235` 处数字是否确为 718/752（FIX-040 收口时点准确）**：**准确**。`git show b4f2235:tests/host-abi-health.mjs` 实读：`718: //   fresh 只列**连续**锚串…`、`719: 如实界定（R1 P3-2(new)）…`、`720: 被核验取决于该名是否在 9h-2 表内…——不声称闭环。`、`752: 9h-2 的 21 对各自按**声明的单源**核验其对象；9h-3 只保证…` ⇒ **该时点准确，随 FIX-041 增行而失效**（R1 报告 §四 P3-2 的**归因描述**正确，仅**位置归属**错误）。

③ **守卫内行号式自指是否真为 0（不采信声明，自行扫描判别）**：**不为 0**。严格口径（指向**本文件自身**位置）⇒ **1 处**：`:862` 的 `R0 P1-1：:118-119 的旧锚名（不存在的断言名）已改写…`（该 `:118-119` 指 `tests/metrics.mjs` 的行号；随本批 +9 行而**同时失效**）。宽口径（含守卫自身 stale 字段里的字面量清单与「他文件已清锚」的历史引用）⇒ 另 8 处（`:720/:721/:726/:729/:740/:749/:752-753/:756-757/:759-760/:775/:806/:808`）。Developer 的「零点位」结论**只在「零处**行号式**自指且**排除 stale 字段字面量」的最窄口径下**才勉强成立，注释 §`800-803` 的表述「本文件零处行号式自指」**与实现不符**（非虚构改动——确无可改对象被跳过，但**声明强度超过事实**）。

④ **是否在报告中如实标注「R1 P3-2 位置不属实」并对 FIX-041 R1 该判断作出更正**：**已标注**（本 §3① 与 §四 F-4）。更正内容 = 「**FIX-041 R1 §四 P3-2 的三处『位置』（`:734` 声明 `:718-720`、`:763-768` 声明 `:747-752`、`:811-816` 声明 `:795-800`）属对 `review-FIX-040-R2-input.md:49/:90` 的**跨文件误归属**——报告内的行号引用在**报告自身**内成立（`:49`/`:90` 实读）；守卫文件在任何 revision 均无该 3 处声明文本**。R1 的『失效机理』结论（行号式引用在被守卫文件内同样不可靠）**方向正确**，但**举证位置错误** ⇒ 本报告予以更正。

### 4. W2.2 守卫接线 —— **接线正确、内容可机验、拼接常量手法有效；但「守卫自身条目」的 fresh 侧对其文本是自指**

- **条目内容正确性**：`ANCHOR_CASES` 终态 **25** 条（16 + 6 + 3）；本批新增条目的 **stale 串全部 = 0 次**（#8）、**fresh 串全部在位**（#9）⇒ stale 确为「被清除的旧锚」、fresh 确为「新锚且在其声明文件内实存」。
- **拼接常量规避自满足是否有效（读代码判定 X&&X 是否真被消除）**：**有效**（#19 内存变异：删 `:104` → 判红；改回字面量 → 判红）。Developer 的机理陈述（「文件内不存在该连续串，而 needle 的值与判据完全不变」）**与代码一致**。
- **双向可达性（只读判别）**：**成立**——stale 侧：文件内写入该字面量即判红（#19 变异 C）；fresh 侧：删 `:104` 的 needle 即判红（#19 变异 A）。两条均**非恒真谓词**。
- **须登记的负面（P3，非阻塞）**：该条目的 **fresh 侧 needle 自身就写在被检查的文件里**（`:804`），且 `occurrences('presetDiag/notePresetDiag 纪律同构') = 1`（其唯一命中即该行自身）⇒ 一旦 `:104` 与 `:804` **同时**被删/改写，判据失去「锚恢复」证据（**当前删除 `:104` 仍判红**，故判别力现存）。这与守卫家族既有的「自满足/子面重叠**如实披露**」惯例一致（9h-2b/9h-2d 的 `×0` 披露），本批未披露该点。

### 5. W3 方法学与边界 —— **97 处可复现（批前树零差异）；H2 归属 7/7 成立；基线零过度断言；试点符号全部取自同句；镜像对同改且字节恒等；唯「取数修订未标注」**

- **97 处清点可复现性**：**批前树可完整复现**（#15：`6bc3841` 复跑 = 97/H1 57/H2 40/22 文件；逐 `(file:line)` 与表 **零差异**）；脚本可复跑（`node .test-home/fix042-host-family.mjs`），口径清晰（H1 同行宿主线索 / H2 仅取**上一行**线索，正则与排除面写在文件头）。**缺口 = 数字未绑定修订**：HEAD 复跑 = **92/19**（表有扫描无 13 / 扫描有表无 8）⇒ 见 F-1。
- **H2 相邻行归属是否可能误判**：**抽查 7/7 归属成立**（#16），未见误收；Developer 已如实披露该组口径边界（仅取上一行；多行注释块跨 ≥2 行未入 97、`lib/service.js:1327` 的包名在其上 2 行、F-3 口径 41 与捕获 12 之差即此边界）⇒ 与我的抽样结论**同向**。
- **基线/义务登记是否含「机器覆盖」式过度断言**：**无**（#17：明文「**不声称机器覆盖**」+ 义务句 + 表头「不得读作机器覆盖」）。
- **试点 11 处符号是否取自同句已具名对象**：**是**（#18，逐处回读原句；未引入未实证宿主符号）。
- **镜像对试点是否同改且字节恒等**：**是**（`lib/client.js:4971` 与 `tests/served-client.js:4971` 同改 1 行；SHA256 `A9874354…` 恒等、396,338B 相同，#4）。

### 6. W4 五处裁定 —— **逐处核验：HIT/MISS 判定与处置全部正当；`CHANGELOG.md:472` 未被触碰**

| 项 | 位置 | 我的核验 | 裁定 |
|---|------|---------|------|
| ① | `tests/stats.mjs:8` | `service.js:2414-2561` stale = 0 次；新锚「EVO-003 迁移前 RouterService 内联聚合」+「现单点实现 = `StatsStore`」**语义可验**——`lib/stats.js:1408` 自述「service.js statsSnapshot 迁移形状」、`lib/stats.js:359` `export class StatsStore`、`lib/service.js:3437 statsSnapshot()` 实存；**但该行区间现内容（我实读 2414-2416 / 2560-2561）= 能力集合与 workspace 校验注释，**不含**聚合/`byDay`/`bucket` 关键词 ⇒ 「现址为模态判定面」的**描述不精确**」 | **MISS 判定成立、改法正当**（去行号 + 语义化，对象可指证）；描述精度见 §三.9 备注 |
| ② | `tests/fix-010-gui-fidelity.mjs:12` | `dsh-agent-loop lib/index.js:554` = **宿主锚**，对象在宿主包内（仓库级不可核验）；原文未给可稳定指代的宿主符号名 ⇒ **不改 + 登记 W3 清单**（表 `#47` 在档，Markdown 第 57 行） | **正当**（避免制造新幻觉引用） |
| ③ | `tests/fix-012-image-takeover.mjs:15` | `lib/client.js:3226` stale = 0 次；新锚 `lib/client.js 的旧假设` 在位；`会话已含图` 在同文件实存 = 1 次；我实读 `lib/client.js:4282` 现文为「旧注释『会话已含图…』」+ **本组件头注释已标注「不成立」**（`fix-012` 新锚句「该假设现已在组件头注释中标注『不成立』」） | **MISS + 改法正当** |
| ④ | `tests/smoke.mjs:34` | `host-contract.mjs:82-88` **HIT（真）但属行号式** ⇒ 去行号改签名式（`host-contract.mjs 的 \`check(label, condition, detail)\``），stale 0 次 / fresh 在位 | **HIT 判定 + 去行号处置正当** |
| ⑤ | `CHANGELOG.md:472` | 我实读 `:472` = 「内部注解：\`lib/tool.js:199-232\` …」；本批 `git diff` 范围**不含 `CHANGELOG.md`**（#1）⇒ **冻结未触** | **正当（只登记）** |

### 7. 新引入（是否重现前三批缺陷类）—— **幻觉引用 / 判据强度退步 / 溯源不实 / 过度断言 四类均未在本批机制面重现；「不可复现计数」类重现 = F-1；另 4 条 P3**

- **幻觉引用**：未重现（#9/#10）。
- **判据强度退步**：**未重现**——`ANCHOR_CASES` 16→25（方向扩面）、`ANCHOR_OBJECTS_3` 21 对与 9h-2/2b/2c/2d/9h-3 谓词**逐字未改**（`git diff` 仅注释与清单增补；我实读 `:868-926` 与 base 逐字一致），断言集合 **REMOVED = 0 / ADDED = 0**（#5），守卫 174 断言（165+9）。
- **溯源不实**：**未重现**（新增引用 `FIX-042 W1/W2/W4`、`FIX-041 R1 §三.3`、`FIX-040 R2 P3-1(new)/P3-2(new)`、`FIX-041 W2/W3`、`FIX-037 R0 P2-3` 等**全部指向实存轮次与报告**；`REVIEW-FIX-040-R2` / `REVIEW-FIX-041-R1` 机录在档）——**但本批新增「计数不实」两处**（F-2）。
- **过度断言**：**未重现**（#17；唯守卫自身「零处行号式自指」一句强度超过事实，见 F-4）。
- **不可复现计数**：**重现（F-1，唯一阻塞项）**——W3 的 97/22 在 HEAD 复跑 = 92/19 且未绑定取数修订。
- **`tests/host-abi-health.mjs:742` 的反引号不成对 stale needle 是否构成问题**：**不构成**（#21）——该 needle 在目标文件内 **false**、在守卫自身内 **0 次** ⇒ 恒绿无效项；`git log -L 741,742` 实读证明**本批（`d58c5ca`）只做了同数组追加，未改该 needle**；与 FIX-041 报告口径一致（「stale 清单自身，预期」）。登记为 P3 台账（属 FIX-040 遗留、已披露面）。

### 8. 越权面 + 断言集合 + 门控 + 真实环境操作披露 —— **四项全通过**

- **越权面**：**零**（15 文件，全部在 `lib/**`+`tests/**`；`.governance/**`、`AGENTS.md`、`CHANGELOG.md`、`package.json` 零触碰；`git status --porcelain` 空）。
- **断言集合（REMOVED/ADDED）**：**REMOVED = 0 / ADDED = 0**（`check(` 标签集 168→168 逐元素相等，#5）；净覆盖增量来自 `ANCHOR_CASES` 条目（16→25，循环内 check 恒 1:1）；守卫 **174 断言**（= 165 + 9）。
- **门控**：`run-all` **exit 0**（21.8s，`#SKIP 2`，两 skip 来源与基线一致）。
- **真实环境操作披露**：**属实且充分**——本批**零宿主树操作**（#20：新增行零宿主路径命中 + 取证脚本 import 面与读面全部为 `git ls-files`/`readFileSync(ROOT/…)`）；Developer E 项「宿主侧对象未核验/浏览器 GUI 未涉」**与事实一致**；本审查亦未对宿主树/用户配置目录写入（#24）。**注**：`.governance/agent-locks.json` 的 FIX-042 锁已过期（TTL 14400s / elapsed 27988s，`check-governance` 报 `BLOCKING:expired_lock`×2），且锁的 `target_files`（11 项）**未含本批实际改动的 `lib/service.js`/`lib/oauth-llm.js`/`lib/wrapper.js`/`lib/host-route.js`/`lib/host-abi/llm-selection.js`/`tests/fix-012-image-takeover.mjs`/`tests/smoke.mjs`/`lib/host-abi/health.js` 等**（属流程面，供 Coordinator 处置，非代码 finding）。

### 9. 裁定点 —— **分批方案合理可行；push 条件：机制面具备、当前 HEAD 不满足（先修 F-1）**

- **批 A/B/C/D 拆分（`host-contract.mjs 19` / 镜像对 / lib 其余 / tests 其余 ~30）**：**合理且与我的实测同向**——我以自建严格口径扫描（#23）得 `tests/host-contract.mjs 19`、`lib/client.js 12`、`tests/served-client.js 12`、`lib/oauth-llm.js 5`、`tests/client-render.mjs 5`…（**「19」与我复算逐字吻合**，是该方案最硬的一根支柱）；批 A 前置「先判 `anchor:` 字段是否参与输出/断言」**必要**（`tests/host-contract.mjs:259/286-311` 的 `anchor:` 字段确为字符串清单，若被断言消费则改写会改判据面）；**每批 MUST 沿用「逐处语义判定 + 同批补 `ANCHOR_CASES` 对 + 双绿 + 双向可达性变异」**（与 FIX-041 R1 §三.5 附加约束一致）；**建议追加两条**：①**范围以「逐处判定后清单」为准**（我实测 `lib/wrapper.js:266` 为清单外真漂移，且 `lib/client.js:4281`/`lib/service.js:1326` 等隔行站点仍在）②**每批产出以「修订绑定 + 可复现口径」记录**（F-1 的直接教训）。
- **是否具备 push 条件**：**当前 HEAD 不具备**。具备的部分：4 笔全为注释 + 测试基础设施面（零产品行为变化；`package.json`/版本位/`CHANGELOG.md` 未触）；守卫 **174 断言 PASSED**、门控 **exit 0**、镜像 SHA256 恒等、越权零、断言零删除、零宿主树操作。**不具备的判据**：**F-1**（计数口径不可迁移，违反 FIX-041 R1 §三.5 自设纪律与项目原则 1「基于事实」）；修复成本 = **1~2 行注释 + 提交信息补注**。修 F-2 可选（同属计数事实性）。
- **push 后的口径约束（不得越界声称）**：**不得声称「CI 已验证」**——ubuntu 侧**未实测**（本机 win32）；预期 `#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)` 仍为**推算值**，本批新增判据为纯文本 `includes` 谓词（平台中立度高）但**以首跑日志为准**。

---

## 四、新发现（本轮）

### P0 / P1 —— 0 条

无。

### P2（阻塞本轮通过；修复 ~1 行注释 + 提交信息补注）—— 1 条

**F-1｜W3 的「97 处/22 文件」是**批前点**数字，未绑定取数修订 ⇒ 在 HEAD 无法复现（实得 92/19），违反本批自己援引的「数字必须连口径引用」纪律**

- **位置**：`61af16a` 提交信息（「宿主锚候选 = **97 处 / 22 文件**，分两组：H1 … = 57 处；H2 … = 40 处」）与 `.test-home/fix042-host-family.md:4`（「条目 = **97**；H1 = **57**；H2 = **40**」）；同页 `:3` 只声明扫描面（`lib/**`、`tests/**`、`.github/**`；排除 `.governance/**`、`docs/**`、`CHANGELOG.md`），**未声明生成修订**。
- **事实依据**（我独立复现，取证 #15）：① `git worktree` 只读检出 **`6bc3841`（批前）** 复跑 `.test-home/fix042-host-family.mjs` = **97 / H1 57 / H2 40 / 22 文件**，与表逐 `(file:line)` 比对**零差异**；② **同一脚本在 `61af16a`（HEAD）复跑 = 92 / H1 54 / H2 38 / 19 文件**；③ 差集逐条可解释：**表有扫描无 13 条**（= 本批已清点的 9 个位点 + 与本批守卫条目同形的 4 条）+ **扫描有表无 8 条**（= 本批**新增**的守卫条目行 `tests/host-abi-health.mjs:728/:729/:733/:796/:797/:798/:799/:814`）；④ 结构性根因：本批**自增守卫文本 58 行**（`tests/host-abi-health.mjs` `+50/−8`），旧锚转写与新增条目使「行号形态」同时**减少**（清点）与**增加**（条目备忘文本）——单向可复算脚本无法区分两者。
- **影响**：① 该数字是本批**最核心的清点产出**，且被 W3.4 后续批次方案与「F-3 口径 41 与捕获 12 之差」的论证引用 ⇒ 下游在新 HEAD 复跑脚本会得到 92，**无法复算 97，也无法判断差额来源**；② 直接违反本批**自己**在 `tests/host-abi-health.mjs:773-776` 确立并援引的纪律「**数字必须连口径引用**，且随文本增删自动变化，**不得作长期基线**」——该告诫被用于旧数字（47/41），却未适用于本批新数字（97）；③ 与 FIX-041 R0 F-3（「47 不可复现」）**同类失效模式**在**新一批重演**，说明该纪律尚未固化为批次约束。
- **建议（1~2 行，非代码行为改动）**：在 `61af16a` 提交信息与本表头把数字绑定修订与口径，例如：「**取数修订 = `6bc3841`（FIX-042 批前）；口径 = 本目录 `fix042-host-family.mjs`（H2 仅取上一行）；HEAD 复跑因本批清理与新增守卫条目而变为 92/19（差 = 已清点 13 − 新增 8）**」；并在后续批次的产出模板中把「数字 + 取数修订 + 复跑命令」作为三件套（可复用 FIX-041 R1 §三.5 的附加约束④）。

### P3（不阻塞；登记/可选修复）—— 4 条

**F-2｜同批两处提交信息计数与实测不符：W1 自述「9 处」而实际 **12 处**；W3 自述「7 文件」而实测 **6 文件**（锚位 11 正确）**

- **位置**：`fa99686` 提交信息（「本笔只收「在仓」且实测漂移（MISS）的 **9 处**」；同信息附着清单本身记 **12 处**：`health.js :4/:30`、`host-abi-health.mjs :104`、`inject-manifest.js :11/:23`、`oauth-llm.js :89`、`service.js :4215`、`wrapper.js :264`、`rpc-shadow-guard.mjs :6/:7`、`client-render.mjs :533/:1872`；且 `--numstat` 实为 `+20/−19` 而信息写「8 文件 +18/-17」）；`61af16a` 提交信息（「**7 文件**/11 锚位」）。
- **事实依据**：① 我自建 diff 解析器机算 W1 = **12 个锚 token / 11 删除行 / 8 文件**（#7 逐条明细在册）——**与 Developer 在任务书中 B 项的自述「12 处 MISS 已改」一致**，而**提交信息写 9** ⇒ 与该笔正文清单亦不一致（正文列 12）；② W3 的 `--numstat` 行：`lib/client.js` / `lib/host-abi/inject-manifest.js` / `lib/host-abi/llm-selection.js` / `lib/host-route.js` / `lib/wrapper.js`(6 lib) + `tests/served-client.js`（镜像对）= **6 文件**（`tests/client-render.mjs` 的宿主锚改写由 `d58c5ca` 完成，非本笔）；**锚位 11 = 9（lib）+ 2（tests）无误**。
- **影响**：治理台账与后续批次会直接引用这些数字；「9 vs 12」为**同批可指证的计数不实**（`FIX-040 R2` P2-2 同族：计数/归属不实）；「7 vs 6」为口径不实（若把镜像对两文件与测试文件混算则应为 7，但信息未给口径）。
- **建议（选一）**：① 在报告/证据补一行**口径说明**（W1：9 = 未含清单外 3 处新发现，12 = 含；W3：文件数按 `lib/**` 计 5 或含镜像对 6）；② 或后续批次统一改为「**改写位点数 + 文件数 + 口径**」三件套。
- **注**：`0a176b5` 的提交信息「`ANCHOR_CASES` 16→22」与实测吻合（W2 笔 +6 条目）；`61af16a` 的「165→174」在**终态**成立（同一信息内另写「165→171」为**中间态**数字，属同信息内不自洽，一并登记）。

**F-3｜W1 的「在仓锚」判定面未收敛：`lib/wrapper.js:266` 为**清单外真漂移**（宿主 `resolveModelInfoFor` 实 `:2046`），同批另有隔行站点未纳入**

- **位置**：`lib/wrapper.js:266`（`*  resolveModelInfoFor → adapter.resolveModel（:1397-1403），能力判定链`）——本批**未改**（W1 只改同块 `:264` 的 `:353`）。
- **事实依据**：① `git grep -n ':1397-1403' -- lib/ tests/` 全仓**唯一命中**即本行；② **宿主树实读**（`$DSH_HOME/profiles/node_modules/@deepseek-ai/dsh-llm/lib/index.js`，只读）：`:2044 = return this.resolveModelInfoFor(this.registration(provider), model, signal)`、**`:2046 = async resolveModelInfoFor(registration, model, signal)`**、`:2047 = const resolved = await registration.adapter.resolveModel(registration.provider.id, model, signal)`；`:1397-1403` 现为 **`assembleAssistantStream` 函数体** ⇒ **该锚确已漂移（MISS）**（与 W1 的「MISS 即改」规则冲突）；③ 同类隔行站点仍在：`lib/client.js:4281`（宿主锚 `lib/index.js:2596-2630` 的**对象在同块隔行**）、`lib/service.js:1326`（`:2582-2594` 隔行）——即 W1 的「HIT 不动」在**文件级计数**口径下并**不**排除同类站点。
- **影响**：Developer 已**如实自我披露**该边界（C 项：「邻行规则仅取「上一行」⇒ 多行注释块跨 2 行以上未入 97；不得以 97 为终局范围」）⇒ **不构成隐瞒**；影响面 = 后续批次的**范围估计**（若以「W1 已清 8 文件」推断该族在 lib 面已收敛，会漏 `lib/wrapper.js:266` 这类站点）。本项属**边界登记**，非本批缺陷。
- **建议**：将该处及扫描到的隔行同类站点**登记入 W3 清单（含取数修订）**，在批 A/B/C/D 的每批「逐处语义判定」中覆盖；`lib/wrapper.js:266` 可改「宿主 dsh-llm 的 `resolveModelInfoFor → adapter.resolveModel` 链」式符号名锚（对象由我在宿主树实证：`:2046/:2047`）。

**F-4｜「本守卫自身自指锚零行号」的机核结论不成立（实存 ≥1 处），且该声明与同批「逐处语义判定」纪律相悖**

- **位置**：`tests/host-abi-health.mjs:800-803`（`// FIX-042 W2：**本守卫自身**的锚注释同口径看护（W2 机核实测：本文件零处行号式自指——自指一律用判据名/块名…）`）与 `0a176b5` 提交信息（「守卫自身自指锚零行号机核」）；反例：**`:862`**（`// R0 P1-1：:118-119 的旧锚名（不存在的断言名）已改写为指向本条实存对象——实现面按`）。
- **事实依据**（取证 #14）：我按「指向本文件自身位置」严格口径全文扫描 = **1 处**（`:862` 的 `:118-119`，指 `tests/metrics.mjs` 行号且随本批增行**同时失效**——`metrics.mjs` 的旧锚名行现不在 118-119）；按宽口径（含 stale 字段内的字面量清单 `:721/:726/:729/:740/:749/:752/:756/:759/:775/:806/:808`）≥ **9 处**。两口径下均**非 0**。
- **影响**：① 声明强度**超过事实**（属「零残留」式过度断言的同类，但**无实际风险**：`ANCHOR_CASES` 判据对注释自指**不可见**，无行为后果）；② 更实质的是**方法面**：若后续批次沿用「机核」二字而未给**口径**（何为「自指」、是否含 stale 字段字面量），结论不可复算——**与 F-1 同根**（数字/结论必须连口径）。
- **建议（~1 行）**：把该句限定为「**本文件无『指向本文件自身位置』的行号式自指（口径：注释行内 `:NNN` 且被指对象在本文件）；stale 字段内的字面量清单不计**」；或把 `:862` 的 `:118-119` 一并去行号（改「`metrics.mjs` 该条目旧锚名」式），使其结论**真正**为 0。

**F-5｜`lib/oauth-llm.js:88-92` 改写后留下**未闭合括号**（本批**未恶化**：批前差值 1 → 批后仍 1，但改写把该缺陷留在新句内且失去就近修补机会）**

- **位置**：`lib/oauth-llm.js:89`（`* 错误映射（H3-14 同构，与 service.js \`runCodexResponsesChat\` 语义`）与 `:91`（`* 透传 status + error 字段；判别测试锁定 401/429 分支）。`）——第 89 行开括号 `（` 无对应闭括号，现有 `）`（`:91` 末）闭合的是 `:88` 的注释块外括号。
- **事实依据**（取证）（我以全文件 `（`/`）` 计数机算）：`lib/oauth-llm.js` **base（`6bc3841`）= 106/105（差 1）→ head = 106/105（差 1）**，即：**该缺失括号系批前存量**（FIX-033 改写时形成，`H3-14 同构，与 service.js runCodexResponsesChat :2906-2929 语义 一致——…；…）。`），W1 的改写**未使差值变化**；但 W1 正好**整句重写**了此行内容（`runCodexResponsesChat :2906-2929` → `` `runCodexResponsesChat` ``），是**唯一的就近修补窗口**。
- **影响**：纯注释括号不平衡，**零功能影响、零判据影响**（我同类机算：`lib/client.js`/`tests/served-client.js`/`tests/client-render.mjs`/`tests/smoke.mjs` 的差 1 亦为**批前存量**，本批**未新增**任何不平衡）。
- **建议（可选，1 字符）**：在 `:89` 的 `` `runCodexResponsesChat` `` 后补 `）`，或在 `:91` 的句末 `）` 后调整；`lib/host-abi/health.js` 同批同类改写（`:1-5`）**已正确闭合**，可作对照。

### 未重现历史问题（明确结论）

- **幻觉引用（FIX-040 R0 P1-1 同型）**：未重现（#9/#10；本批 12 处替换 + 3 处补充改写的目标对象全部实存）。
- **判据强度退步（FIX-040 R1 P1-1(new) 同型）**：未重现（断言集合零增删、既有谓词逐字未改、新增条目双向可达性可实证）。
- **溯源不实（FIX-041 R0 F-1 同型）**：未重现（轮次引用全部实存）。
- **过度断言**：机制面未重现（#17）；唯 F-4 的「零处自指」一句属声明强度超事实。
- **过度实现**：无（4 笔 = 注释改写 + 清单条目增补 + 注释性基线登记，无顺带重构、零产品逻辑改动）。

---

## 五、硬门槛裁决

| 门槛项 | 阈值 | 实测 | 裁决 |
|--------|------|------|------|
| P0 阻塞问题数 | = 0 | 0（§四 P0 无） | **PASS** |
| 5 维度全覆盖 | = 100% | 见下逐维度结论（5/5） | **PASS** |
| 每条发现标注级别 | = 100% | P2×1 / P3×4 均带 文件:行号 + 事实依据 + 影响 + 建议 | **PASS** |
| 设计一致性检查 | 已完成 | 与项目原则 1（事实性——**F-1/F-2/F-4 违反**）、原则 4（防护网——符合：`ANCHOR_CASES` 16→25、断言零删除、新增条目双向可达）、原则 5（单一路径——符合：既有条目扩充不拆双条目、无并存双路径）、原则 8（失败可观测——符合：stale/fresh 双绿带 `{staleHits, missingFresh}` detail）、原则 9（宿主演进防御——**本批为正向**：宿主锚基线登记 + 人工复检义务，且**明确不声称机器覆盖**）、`ci.yml` 头部契约（未触）逐项比对 | **PASS（附 F-1 阻塞项）** |
| AI 代码专项 5 项 | 全部完成 | ① **mock 残留**：无（零夹具新增）② **硬编码**：无（无硬编码通过路径；`stale`/`fresh` 为判据输入）③ **幻觉引用**：**无**（#9/#10）④ **未实现 TODO**：无（`+` 行零命中）⑤ **过度实现**：无（最小改动；唯 F-2 计数声明超范围） | **PASS** |

### 五维度逐项结论

- **正确性 —— 通过**：W1 的 12 处改写经**机算位点 + 对象实存 + stale 零残留 + fresh 在位**四重独立核验（#7/#8/#9/#10）；stale 清单 `ANCHOR_CASES` 条目内容**全部可由脚本实算**（#8/#9）；守卫自身条目经**内存变异**证明双向可达（#19）；守卫 **174 断言 PASSED**、门控 **exit 0**（#2/#3）；断言标签集 168→168 逐元素相等（#5）。计数口径问题（F-1/F-2）不影响谓词正确性。
- **安全性 —— 通过**：15 文件中 12 文件为纯注释（非注释改动行 = 0，`tests/host-abi-health.mjs` 为判据面数据/代码但**未改谓词**）；无密钥、无外部输入面、无注入面引入；本审查的全部变异为**内存字符串**，对工作树与宿主树零写（#24）。
- **可维护性 —— 通过（附 F-1/F-2/F-3/F-4）**：W1/W3 的「行号式 → 符号名/包名/代码串式」是**漂移抗性**的正向改进；基线登记 + 人工复检义务句 + 「不得作长期基线」的告诫**明确**。负向 = 数字未绑修订（F-1）、计数声明不实（F-2）、自指口径未给（F-4）、未闭合括号留存量（F-5）。
- **性能 —— 通过**：本批零运行时判据变更（`ANCHOR_CASES` 仅增条目/串，`split`/`includes` 线性）；守卫与门控耗时与 FIX-041 链同量级（21.8s vs 22.0s）。
- **测试覆盖 —— 通过**：`ANCHOR_CASES` **16→25**（覆盖文件 8→20，含 README/ci.yml/install-entry/install.sh/host-route 等）；**断言集合零删除**（REMOVED=0/ADDED=0）而**覆盖面净增**；新增判据**均有可达性实证**（#8/#9/#19）；**残余覆盖缺口已显式登记且未被声称覆盖**（宿主锚族 ⇒ 「不声称机器覆盖」+ 人工复检义务；F-3 的隔行同类站点）。

### 审查结论

> **NEEDS_CHANGE**
>
> **`unresolved_blockers = 1`**（F-1；F-2 为同源计数不实，建议同修）
>
> 理由：4 笔的**机制面全部成立且经我独立复现**——W1 的 **12 处替换位点**由我自建解析器机算确认（12 token / 8 文件 / 0 新锚），**逐一核验目标对象真实存在**（20/20 stale 零残留、14/14 fresh 在位、≥10 组对象实读），**纯注释（非注释改动行 = 0）、零新幻觉引用**；W2 的 `ANCHOR_CASES` 16→22（+3 至终态 **25**）条目内容**全部可机验**，**拼接常量规避自满足经内存变异确认有效**（改回字面量即判红、删 `:104` 即翻转）；**W2.1 的事实性更正成立**——所引文本**确在** `.governance/review-FIX-040-R2-input.md:49/:90`（逐字实读）、`b4f2235` 处数字**确为 718/752**（逐行实读）⇒ **R1 P3-2 的位置归属不属实，已在 §三.3④ 作出更正**（同时我进一步更正 Developer 的「零处行号式自指」为 **≥1 处**）；W3 的 **97 处/22 文件**在**批前树 `6bc3841` 复跑与表逐 (file:line) 零差异**（真可复现）、H2 相邻行归属 **7/7** 成立、基线登记**明载「不声称机器覆盖」+ 人工复检义务**、试点 11 锚位符号**全部取自同句已具名对象**、镜像对同改后 **SHA256 恒等**；W4 五处裁定**逐处正当**（含 `CHANGELOG.md:472` 冻结未触）；越权面零、断言集合**零增删**、守卫 **174 断言 PASSED**、门控 **exit 0**、**零宿主树操作**（取证脚本仅 `git ls-files` + `readFileSync`）。**不通过的唯一原因 = 计数口径不可迁移**：`97/22` 是**批前点**数字且注释/提交信息**未绑修订**，同一脚本在受审 HEAD 复跑 = **92/19**（差 13 已清点 − 8 本批新增守卫条目）⇒ 违反本批**自己**引用的「**数字必须连口径引用**」（`tests/host-abi-health.mjs:773-776`）与项目原则 1，属**不可复现计数**（FIX-041 R0 F-3 同族在新批重演）。另 **P3×4**（W1 提交信息 9 vs 实测 12、W3 提交 7 vs 实测 6 文件；`lib/wrapper.js:266` 同类未清锚（我以宿主树实证 `resolveModelInfoFor` 在 `:2046`）；守卫「零处自指」口径不实；`lib/oauth-llm.js` 存量未闭合括号）**不阻塞**。**本轮 round = 0，未触及 T2 熔断（round ≥ 3 仍 NEEDS_CHANGE 才升级 BLOCKED）；修复后 MUST 发起 R1 复审（同一 Reviewer，注入本报告路径）。**

---

## 六、未验证项声明（事实依据红线）

1. **ubuntu / CI 侧未实测**：本机 win32；`#SKIP 2` 为本机实测，`#SKIP 6 (host-contract.mjs×2, smoke.mjs×4)` 仍为**推算值**，**不得读作已验证**；**任何对外表述不得声称「CI 已验证」**（本批判据为纯文本 `includes`，平台中立度高，但仍以首跑日志为准）。
2. **Developer 的取证脚本未复跑**：`.test-home/fix042-w1-verify.mjs` / `fix042-w2-red.ps1` / `fix042-w2-selfref.mjs` / `fix042-w3-verify.mjs` / `fix042-w4-verify.mjs` / `fix042-anchor-inventory.mjs` / `fix042-md.mjs` 均**未执行**、其输出文件未采信；**唯一例外**：`.test-home/fix042-host-family.mjs`（W3 清点脚本）我**在批前 worktree 与 HEAD 各复跑一次**并逐条比对（#15）——因为其可复现性是本轮 F-1 的核心争议点。替代性验证 = ①自建 W1 位点解析器 ②自建 ANCHOR_CASES 自满足变异 ③自建表-扫描集合比对 ④逐串 `git grep` 实算。
3. **宿主锚族的范围限定**：F-3 的宿主侧结论（`dsh-llm` `resolveModelInfoFor` 在 `:2046`）**仅对本机实装 `0.1.5-rc.2` 的一个包 + 一个锚**成立，**不构成**对全 97 处或对其他 DSH 版本/平台的普适结论；我**未**核验表中其余宿主锚（Developer 声明亦为「本批零宿主树操作、宿主符号仅取自同句已具名对象」）。
4. **W4① 的区间语义描述未完全确证**：`tests/stats.mjs:8` 旧锚 `service.js:2414-2561` 的**历史时点内容**我未回溯（需读历史 revision 的对应区间）；我能确证的是：该 stale 串当前 **0 次**、新锚对象（`StatsStore`/`statsSnapshot`）实存、其行区间**现在**不含聚合语义关键词 ⇒ Developer 的「现址为模态判定面」描述**不精确**，但**不影响 MISS 判定与改法正当性**（已登记于 §三.6 备注，未单列 finding）。
5. **`ANCHOR_CASES` 计数 `174` 与「+9」的构成**为本审查按源码机算（`{ file: [` 行 16→25 + 循环内 1:1 check）；若后续增删条目该数字自动变化（**不得作为长期基线**，须以运行输出为准）——此点亦是 F-1 的直接教训。
6. **本审查的写入面**：仅 `.governance/review-FIX-042-R0-input.md`（本报告）+ `.test-home/fix042-r0-selffull.mjs` / `fix042-r0-recount.mjs` / `fix042-r0-w1count.mjs` / `fix042-r0-table-repro.mjs`（`.gitignore:10` 覆盖；均为只读核验脚本）。**未修改任何被跟踪文件**；临时 `git worktree`（`$env:TEMP`）已 `remove --force` + `prune`，残留 0；`git status --porcelain` 复核为空。

---

## 七、建议 Coordinator 动作（按依赖排序）

1. **判定返工（本轮）**：结论 = **NEEDS_CHANGE**（阻塞项 = F-1；建议同修 F-2）⇒ 以 review-record CLI 机录本报告（canonical 名 `review-FIX-042-R0.md`，自动 `next_round`）→ 派发 Developer 做**文案级一元修复**：① F-1：在 `61af16a` 提交信息补注 / 于 `.test-home/fix042-host-family.md:4` 与守卫 `:778-789` 基线登记处写入「**取数修订 = `6bc3841`（FIX-042 批前）；复跑命令 = `node .test-home/fix042-host-family.mjs`；HEAD 复跑 = 92/19（差 = 已清点 13 − 新增 8）**」② F-2：把 W1/W3 的计数口径写明（W1 = 12 位点含 5 处清单外发现；W3 文件数口径）。⇒ **MUST spawn 同一 Reviewer 复审（round = R1）**。
2. **复审期望（R1 检查点）**：F-1 后「数字 + 取数修订 + 复跑命令」三件套齐备且在 HEAD 复跑**可复算差额**；F-2 口径句在位；守卫仍 **174 断言 PASSED**、门控 **exit 0**、镜像 SHA256 恒等、越权面零、断言集合零增删；**其余判据不得改动**（本轮已判其成立，改则重新举证）。
3. **裁定点落账**：① **分批方案 A/B/C/D 采纳**（我的复算与「批 A = 19 处」逐字吻合；**追加两条约束**：范围以逐处判定后清单为准〔我实测 `lib/wrapper.js:266` 为清单外真漂移〕+ 每批产出数字绑修订）；② F-3 的 `lib/wrapper.js:266` 与隔行同类站点**登记入 W3 清单**（含取数修订）；③ F-4 的守卫自指口径句**随 F-1 同批收口**。
4. **流程面处置（供 Coordinator，非代码 finding）**：`.governance/agent-locks.json` 的 FIX-042 锁**已过期**（`check-governance` 报 `BLOCKING:expired_lock`×2，elapsed 27988s > TTL 14400s）且 `target_files`（11 项）**未覆盖本批实际改动的 8 个文件** ⇒ 建议在判定/复审完成后**释放并按实际范围复核锁记录**；FIX-042 在 plan-tracker 仍为「待派发 Developer」而代码已落地 4 笔 ⇒ 状态回填。
5. **push 门（本批）**：**当前 HEAD 不满足**（F-1 未修）；修复 + R1 通过后方可 push。push 后**立即以首跑日志核验** ubuntu 侧 `#SKIP 6` 逐行 + `B5 9h / 9h-2 / 9h-2b / 9h-2c / 9h-2d / 9h-3` 全绿并入 evidence-log；**首跑前任何表述不得声称 CI 已验证**。
6. **发布面提示**：本批为注释 + 测试基础设施面（`lib/**` 仅注释改写，零产品逻辑改动）⇒ **不产生用户可见行为变化**；`package.json` / 版本位（0.5.0）/ `CHANGELOG.md` 未被触碰 ⇒ 无版本面动作。
