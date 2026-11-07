# ARCH-007 兼容性设计系统分析与四轴优化（DSH 0.2.2-rc.1 适配）

> 状态：设计中 → 落地中（P1 批次）
> 日期：2026-11-07
> 关联：ARCH-004（兼容性设计）/ ARCH-005（解耦设计）/ ARCH-006（0.2.1 代际登记）/ FIX-057（宿主兼容门控 RCA）
> 触发：用户报障「dsh 升级适配之后出现兼容性问题，需要先修复兼容性问题，并针对插件兼容性设计做系统性分析并优化」
> 用户裁决（三问三答）：① 批次 = D1+D2+D3+D5 + 四轴 B1/B3/B4；② 基线条目 = 新增 0.2.2 代并升 primary，0.2.1 降存档；③ 声明范围 = 改生态同构的显式并集并同步双表锁定。

---

## 1. 范围与方法

**范围**：本插件对 DSH 宿主的**全部依赖面**——静态导入、ctx 服务、客户端注入面、转发事件、wire schema、宿主版本与包版本声明。**不含**业务功能演进。

**方法（P10-②：机器可完成的验证禁止转嫁给用户）**：不向用户索取现象/日志/截图，而是从**运行中的宿主安装体**直接把宿主树取出来，再用本仓既有守卫对准该树运行，得到"我们的声明 vs 宿主实况"的机器 diff。

取证链：
1. 宿主进程与安装体定位（`D:\app\dsh\DeepSeek Harness.exe`，ProductVersion `0.2.2.0`，FileVersion `0.2.2-rc.1`）。
2. `app.asar`（213,202,918 B）按 asar pickle 头解析（`.tmp-asar-probe.mjs`），确认内含 `dsh/node_modules/@deepseek-ai` = **331 包，全部 0.2.2-rc.1**。
3. 按包名从 asar 解出宿主树到 `.inspect-host/host-0.2.2-rc.1/@deepseek-ai`（846 文件 / 10.4 MB）。
4. 用 `.tmp-abi-diff.mjs` 做逐包导出面/子路径 diff（0.2.2 asar vs 0.2.1 磁盘树）。
5. 用 `scripts/host-radar-probe.mjs --host-source <0.2.2 树> --out radar-022.json` 产出四维漂移报告。
6. 用 `node tests/host-contract.mjs`（`DSH_HOST_SOURCE` 指向 0.2.2 树）做守卫对准。

---

## 2. 宿主代际实测矩阵

| 来源 | `@deepseek-ai/*` | cordis | schemastery | 形态 | 有无 `.d.ts` |
|---|---|---|---|---|---|
| 运行中宿主（asar 0.2.2-rc.1） | **0.2.2-rc.1**（331 包） | **4.1.0** | **3.19.0** | 桌面打包 | 客户端包**无** |
| npm 上一代（`~/.dsh/profiles/node_modules`） | 0.2.1-rc.2 | 4.0.5 | 3.18.5 | npm 解包 | 有 |
| 本仓开发树（`node_modules`） | 0.2.0-rc.2 | 4.0.1 | 3.18.5 | npm 解包 | 有 |
| 本插件声明基线（改动前） | `^0.2.0-rc.2` | `^4.0.1` | `^3.18.5` | — | — |
| 本插件基线条目（改动前） | primary = `0.2.1` | 4.0.5 | 3.18.5 | — | — |

**结论 1（关键事实）**：插件声明的主基线是 0.2.1，而真实宿主是 0.2.2-rc.1 —— 声明与实况差一个代际，且平台依赖同时跨了 cordis 4.0.5→4.1.0、schemastery 3.18.5→3.19.0（两个 minor）。

**结论 2（门控为何没拦住）**：宿主加载门控 `satisfies()` 以 `{includePrerelease: true}` 调 semver（`dsh-app-boot` 0.2.2-rc.1 line 1094-1096）。实测 stock semver：`satisfies('0.2.2-rc.1','^0.2.0-rc.2') === false`，加 `includePrerelease` 才为 true；`0.2.1-rc.2` 同理。所以**宿主放行 ≠ 安装期放行**：npm/pnpm 的 peer 解析与市场兼容过滤按 stock semver 判定，会把本插件判为不兼容。这正是 FIX-057 之后遗留的声明面缺陷。

**结论 3（收口期补充实测）**：
- **RISK-003 闭合证据**：asar 真机树（`D:\app\dsh\resources\app.asar` 抽取，331 包）与 npm 登记树（`.inspect-host/npm-0.2.2-rc.1`，329 包）交集 329 包**版本逐字全等**；asar 独有 2 包 = `dsh-desktop-host`（桌面壳）+ `libreoffice-kit-win32-x64`（平台二进制），均不在插件消费面。npm 形态树的核验结论可无损代表真机宿主。
- **`dsh-settings` 内部形态演进（0.2.2）**：`describe()` 的 presentations 键改读 `entry.fiber.ctx.fiber`（`lib/index.js:426`）、value 面改读 `entry.fiber.effectiveConfig`（`:436`，cordis `get effectiveConfig()`；0.2.0/0.2.1 读 `fiber.config`）——只影响真树执行型测试的夹具形状（`tests/settings-config-migration.mjs` 已按代际适配），插件产品代码不经 fiber 直读该面。`dsh-settings/lib/index.js` 三树（部分抽取/完整抽取/npm）SHA256 逐字一致（`041A2682…`）。
- **可执行靶子的形态要求**：scope-only 抽取树（`--prefix dsh/node_modules/@deepseek-ai`）只能供**静态**取证；真树执行型套件（如 settings）需要裸依赖（`yaml` 等）在 `@deepseek-ai` scope 外可达——可执行桌面靶子须按 `--prefix dsh/node_modules` 抽取并保持 `node_modules/` 目录层级（裸依赖经祖先 `node_modules` 解析）。

---

## 3. 依赖面全量盘点（改动前）

| 依赖类别 | 数量 | 单一事实源 | 消费方式 |
|---|---|---|---|
| 静态导入（ESM `from '@deepseek-ai/…'`） | 5 条语句 / 6 符号 | `lib/host-abi/host-imports.js`（`lib/**` 内唯一豁免点） | `import { … }` |
| peer 依赖 | 13（11 `dsh-*` + cordis + schemastery），其中 8 个 `optional` | `package.json` ⟷ `lib/host-abi/host-packages.js` 注册表 | 安装期解析 + 运行期探测 |
| ctx 服务 | 11（7 个带方法形状契约共 **9 个方法**，4 个仅存在性） | `lib/host-abi/ctx-services.js` `CTX_SERVICES` | 具名访问器 |
| 客户端注入面 | 9 face | `lib/host-abi/inject-manifest.js` `FIBER_INJECT` | `ctx.inject([...])` |
| 客户端注入包 | 3 | `CLIENT_PACKAGE_INJECT` + `package.json` `dsh.client.inject` | 宿主加载器 |
| 转发事件镜像 | 28（宿主实况 30） | `lib/host-abi/events.js` `FORWARDED_EVENT_ALLOWLIST` | 客户端 `$on` 白名单 |
| wire schema 面 | 4（`llm.listConfigurableProviders` / `llm.listProviders` / `session.modelCatalog` / `settings.describe`） | `tests/host-contract.mjs` `WIRE_SCHEMA_WHITELIST` | RPC 字段白名单 |
| LlmAdapter 契约方法 | 7 | `LLM_ADAPTER_PROTO_BASELINE` / `ADAPTER_CONTRACT_BASELINE` | 适配器实现 |

---

## 4. 逐项对准 0.2.2-rc.1 的判定

| 面 | 判定 | 证据 |
|---|---|---|
| 5 条静态导入的 6 符号 | **在位** | `defineTool` 仍导出（0.2.2 `dsh-tools` 内有 `function defineTool`）；`dsh-llm` 66 导出、子路径一致；`dsh-typert-protocol` 16 导出一致；`schemastery` 3.19.0 仍有默认导出 |
| 11 个 ctx 服务 | **在位** | 服务名仍以字符串字面量注册；7 个服务的方法名（`registerAdapter`/`listModels`/`mutate`/`currentSelection`/`saveSelection`/`selectModel`/`stateOf`/`get`/`composedPreset`）在对应包入口均可命中 |
| 7 个 LlmAdapter 方法 | **在位** | `dsh-llm/lib/index.js`：`providerInfo`/`providerRetryPolicy`/`imageRequestPricing`/`listModels`/`resolveModel`/`prepareCall`/`stream` 全部命中 |
| 3 个客户端注入包 | **在位** | asar 内三个包均存在（各 15 文件） |
| 9 个 fiber 面 | **在位** | `lib/client.js` 运行时仍存在 `directoryFor(sessionId)`、`super(ctx,"modelDirectories")` |
| 4 个 wire schema 面 | **零 diff** | radar：`wireSchemas` 全部 `hostOnly=[] baselineOnly=[]` |
| 转发事件镜像 | **落后 2 项** | 宿主 28→30，新增 `llm/models-updated`、`plugin-manager/update-state`；镜像仍 28 |
| `dsh-tools` 子路径/导出 | **漂移** | 移除子路径 `./types`，新增 `./pipeline`；导出 −7 / +8（`defineTool` 不受影响） |
| 契约锚点（`.d.ts` + 逐文件符号） | **不可验 / 锚错对象** | 桌面分发的 5 个客户端包 `.d.ts` 计数 = 0；`dsh-api-session-controller/lib/types/agent.js` 的 `selectionFor(`/`projectionState` 在 0.2.2 **整体消失**（8553 个 `.d.ts` 全树 0 命中），`stateOf(` 落 `lib/types/list.js`，投影契约以导出接口 `ModelSelectionProjectionState {lastUsed, pending}` 迁至 `@deepseek-ai/dsh-agent/lib/types/model-selection.d.ts`；公开方法 `selectModel` 与投影字段语义不变 |

---

## 5. 缺陷清单

### D1 宿主新增转发事件未纳入镜像（行为缺陷）
- **证据**：宿主事件 0.2.1-rc.2 = 28 → 0.2.2-rc.1 = **30**；新增 `llm/models-updated`、`plugin-manager/update-state`。`lib/**` 内 `models-updated` 命中 **0**。`llm/models-updated` 在宿主侧由 `dsh-llm/lib/typert.host.js`、`dsh-llm-deepseek/lib/index.js` 发出，由 `dsh-client-ui-model-selection/lib/client.js` 消费——正是本插件接管/消费的模型目录面。
- **后果**：模型目录变更（增删 provider 模型、签发/切换 key 后的模型集变化）只走 `llm/models-updated`，本插件面内收不到 → 路由侧模型列表陈旧。
- **原则**：P2（全面分析避免遗漏）/ P9（宿主演进防御）。

### D2 基线档案缺 0.2.2 代 → 对真实宿主误报（可观测性缺陷）
- **证据**：`HOST_BASELINE_REGISTRY` 仅 0.1.5 / 0.2.0 / 0.2.1；`hostCapabilityProfile()` 三元组不匹配 → `compatible-unknown` + 一次性 `noteHostDiag({kind:'host-version-unknown'})`。
- **后果**：健康面把**当前真实宿主**报成"未知代际"，用户侧看到的是不确定态；降级本应指向真实异常见 §5、§6 的项，却被这条噪声掩盖。
- **原则**：P8（降级可观测且可判读）。

### D3 契约锚点钉在分发形态不稳定的产物上 + 守卫崩溃（校验层缺陷）
- **证据**：桌面 asar 内 `dsh-client-ui-model-selection` / `-conversation` / `-settings` / `dsh-client-locale` / `dsh-api-remotes` 的 `.d.ts` 计数均为 **0**，`lib/types` 整目录不存在；`tests/host-contract.mjs` 对准 0.2.2 树时在 `dsh-client-ui-model-selection\lib\types\client\service.d.ts` 处**未捕获 ENOENT 崩溃**（exit 1），而非给出结构化失败。
- **后果**：真实用户在桌面分发上"校验面结构性不可验"，且守卫以抛栈形式失败——违反 P8（失败必须可观测、可判读），也让"守卫红了到底是宿主漂移还是自己锚错"无法区分。
- **原则**：P4（防护网）/ P8 / P10-④（桩形态必须锚定宿主源码）。

### D4 锚点锚错对象：钉宿主私有 helper，而非公开契约（校验层缺陷）
- **证据（0.2.2 npm 树实测，8553 个 `.d.ts` 全树 ripgrep）**：`selectionFor` 与 `projectionState` **零命中**——不是换文件，是符号被撤。`stateOf(` 只在 `dsh-api-session-controller/lib/types/list.js`。模型选择投影契约改由 `@deepseek-ai/dsh-agent/lib/types/model-selection.d.ts:15-20` 的导出接口承载：`interface ModelSelectionProjectionState { readonly lastUsed: ModelSelection | null; readonly pending: ModelSelection | null }`，语义注释与 0.2.1 一致（`pending` = 尚未被匹配请求消费的后续选择）；私有 helper 的等价公开面是 `AgentModel` 类（`current()`/`select()`，同文件 L32-40）。我们真正调用的 `selectModel(request)` 仍在 `lib/types/commands.d.ts:38` 与 `lib/types/index.d.ts:106`，签名未变。
- **根因**：锚点把"我们推理宿主语义时读过的**内部实现片段**"当成了契约，于是宿主一次内部重构（helper 迁进 `AgentModel`、投影定义下沉到 `dsh-agent`）就让三处锚点全红，而**真正的契约面一点没变**。本插件产品代码零调用 `selectionFor`/`projectionState`（仅注释引用），故这是纯校验层缺陷——却会误导成"兼容性坏了"。
- **后果**：红信号与真实风险错配；每次宿主动内部结构就要改测试，违反轴①（减少对宿主依赖）与轴④（低代价适配）。
- **原则**：P1（事实为准）/ P4（防护网要能守真东西）/ P10-④（锚点必须是宿主**导出面**）。

### D5 声明范围与自身基线自相矛盾（声明面缺陷）
- **证据**：`engines.dsh` 与 11 个 `dsh-*` peer 全为 `^0.2.0-rc.2`，但自家基线 primary 是 0.2.1、真实宿主是 0.2.2-rc.1；stock semver 下两者均**不满足** `^0.2.0-rc.2`。生态同类插件的写法是显式并集（如 `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.1 <0.3.0-0`）。
- **后果**：宿主门控放行、安装期/市场判定不兼容 → 第三方工具与市场侧看到的是"不兼容插件"。
- **原则**：P1（声明必须与事实一致）/ P9。

---

## 6. 四轴差距分析（用户提出的四条优化轴）

| 轴 | 现有设计（ARCH-004/005 成果） | 0.2.2 暴露的差距 | 本批动作 |
|---|---|---|---|
| ① 尽可能减少对宿主的依赖 | 静态导入收敛为 `host-imports.js` 单点；13 peer 中 8 个 `optional` | 没有任何"这条依赖为什么删不掉"的证据行；`optional` 与否是历史沉淀而非判定结果 | **B1 依赖账本**：为四类依赖的并集逐条登记 `level` + `evidence`（消费者文件/行为 + 删掉会红的测试），并与 `package.json` 的 `peerDependenciesMeta` 做一致性机器锁 |
| ② 必须的接口/字段依赖解耦、单独维护 | `lib/host-abi/` 9 域已收口（版本/包/服务/事件/注入面/wire/客户端 remote/健康/静态导入） | **同一契约存在多份手抄副本**：`tests/host-contract.mjs` 的锚点表与 `WIRE_SCHEMA_WHITELIST`、`version.js` 档案、`host-radar-probe.mjs` 内联字面量、`events.js` 镜像。D1/D4 就是副本漂移的必然产物 | 本批先把**声明侧**（版本代际、事件镜像）单点化并机器锁（B3）；探测器侧的重复字面量在 D3/B4 改造中按"从权威源读取"处理（B2 全量单点化列入后续批次，避免同批动 129KB/200KB 两个权威测试） |
| ③ 严格依赖校验与看护 | §R2-a 双表机器锁、S7/S10 守卫、`hostOnly` 事件对比、`compatible-unknown` 降级 | 校验**不含"分发形态"这一维**（D3 盲区）；`hostOnly` 只报告不拦截（D1）；未知代际只记 diag 不 fail-closed（D2） | **B3**：声明范围必须能覆盖全部基线条目（stock semver 语义断言，闭合 D5）；镜像事件集必须 ⊇ 宿主声明（否则红）；依赖账本与 `peerDependenciesMeta` 一致 |
| ④ 依赖边界可调测性 | `scripts/host-radar-probe.mjs` 四维 diff（锚点/事件/schema/包）+ 3 个 gate 脚本 | 探针只认 npm 形态树；无"换宿主后一条命令出适配成本清单"的入口；无桌面分发探针 | **B4**：探测器新增第五维 `distribution`（auto/npm/bundled + 内容判据 + 结果入报告）；新增 `--matrix` 升级成本矩阵；守卫在锚点文件缺失时输出结构化失败而非崩溃 |

---

## 7. 目标设计（四层）

```
┌ 声明层 ─────────────────────────────────────────────┐
│ version.js（代际档案，primary=运行中宿主）           │
│ events.js（转发事件镜像 + since 注记）               │
│ dependency-ledger.js（依赖账本：level + evidence）    │
│ host-packages.js / ctx-services.js / inject-manifest │
└──────────────┬───────────────────────────────────────┘
               │  机器锁（B3）：声明 ↔ 消费 ↔ 宿主声明
┌ 探测层 ──────┴───────────────────────────────────────┐
│ host-radar-probe：五维（anchors/events/schemas/      │
│ packages/distribution）+ --matrix 成本矩阵           │
└──────────────┬───────────────────────────────────────┘
               │
┌ 门控层 ──────┴───────────────────────────────────────┐
│ tests/host-abi-health（双表机器锁）                  │
│ tests/host-version-snapshot（声明范围覆盖性）         │
│ tests/host-contract（锚点，分发形态感知，不崩溃）      │
│ tests/host-radar（探针判别力 fixture）               │
└──────────────┬───────────────────────────────────────┘
               │
┌ 消费层 ──────┴───────────────────────────────────────┐
│ 具名访问器（ctx-services）/ 共享订阅（events）         │
│ 客户端刷新接线（llm/models-updated）                  │
└──────────────────────────────────────────────────────┘
```

**升级适配的标准动作（目标态）**：换宿主 → `node scripts/host-radar-probe.mjs --host-source <新树> --matrix` → 三类判读（分发形态不可验 / 真 ABI 位移 / 声明面增量）→ 按"必须改/建议改/无需改"清单落改动 → `node tests/run-all.mjs` 零回退。

---

## 8. 本批落地明细（ARCH-007 P1）

| 项 | 文件 | 内容 |
|---|---|---|
| D2 | `lib/host-abi/version.js` + `tests/host-abi-health.mjs` | 新增 `0.2.2` 代（dsh 0.2.2-rc.1 / cordis 4.1.0 / schemastery 3.19.0）并升 primary；`0.2.1` 降存档；双表机器锁同步 |
| D5 | `package.json` + `tests/host-version-snapshot.mjs` | `engines.dsh` 与 11 个 `dsh-*` peer 改**逐代并集**（见 §8.1）；新增 stock-semver 覆盖性断言 |
| D1 | `lib/host-abi/events.js` + `lib/client.js` + `tests/served-client.js` + `tests/client-render.mjs` | 镜像增补两个新事件；客户端把 `llm/models-updated` 接入同一刷新路径 |
| B1 | `lib/host-abi/dependency-ledger.js`（新增）+ `tests/host-abi-health.mjs` | 依赖账本 36 条 = 12 `required` + 24 `optional`，键集/`evidence`/`optional` 一致性机器锁 |
| B3 | `tests/host-abi-health.mjs` / `tests/host-version-snapshot.mjs` | 声明覆盖性 + 账本一致性 + 事件超集看护 |
| D3/D4/B4 | `scripts/host-radar-probe.mjs` + `tests/host-radar.mjs` + `tests/host-contract.mjs` + `docs/host-upgrade-sop.md` | 第五维 distribution、`--matrix`、锚点不可用 vs 位移分类、守卫不崩溃；D4 实现形态调整为**多代候选组**（`expectSymbolHost` = `(文件, 符号组)` 的有序或关系，命中非首组打可见"形态变化"note，全不命中仍红）——因 0.2.2 已撤销 `selectionFor`/`projectionState`，单路径换名不可能成立；改动仅限锚点表与判定逻辑，产品代码零改动 |
| 版本 | `package.json` + `CHANGELOG.md` | `0.7.1` → `0.8.0`（新增宿主代际支持 + 放宽声明范围 = 特性变更） |

---

## 8.1 声明范围必须逐代并集（semver 预发布门控）

**机理（实测，决定形状而非风格）**：semver 对带 prerelease 的版本有额外门控——只有「同一 `major.minor.patch` 元组、且自身带 prerelease 的比较器」存在时，该版本才可能命中。因此单区间 `>=0.2.0-rc.2 <0.2.3-0` 只含 `0.2.0` 与 `0.2.3` 两个元组比较器：

| 版本 | 单区间 stock | 单区间 includePrerelease |
|---|---|---|
| `0.2.0-rc.2` | true | true |
| `0.2.1-rc.2` | **false** | true |
| `0.2.2-rc.1` | **false** | true |

即：宿主加载门（`includePrerelease: true`）放行，npm/pnpm/市场（stock）判不兼容——**单区间等于原样复现 D5**。

**收口形状**（`engines.dsh` + 11 个 `dsh-*` peer 逐字相同）：

```
>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.1 <0.2.2-0 || >=0.2.2-rc.1 <0.2.3-0
```

三个区间分别对应注册表的三个代际（0.2.0 / 0.2.1 / 0.2.2），正反两面均实测：三条基线的 dsh 版本 stock=true；`0.2.3-0`、`0.2.3`、`0.3.0` stock=false。

**维护规则**（写入测试断言，防止靠记性）：新增一个宿主代际登记 → 必须同时追加一个同代区间；并集区间数必须恒等于 `HOST_BASELINE_REGISTRY` 条目数，且每区间下界由该代际条目派生。

> 注：生态同类写法（如 `>=0.2.0-rc.2 <0.2.1-0 || >=0.2.1-rc.1 <0.3.0-0`）在 stock 语义下同样**不**覆盖 `0.2.2-rc.1`（缺 `0.2.2` 元组比较器）。本仓不照抄该形态，而以"一区间一代际"的结构断言自证覆盖。

---

## 9. 零回退基线

变更前门控基线（本次实测）：`node tests/run-all.mjs` → **23 套件 + 4 runner 模块 全 PASS，44.7s，exit 0**，仅 2 条平台性 `#SKIP`（POSIX 权限位 / POSIX 在线检查，均 win32 设计性跳过）。

> 历史注记：此前在受限沙箱下同一命令曾出现 23 套全红（`spawnSync` 返回 `status=null EPERM`）与 3 套环境伪失败（`host-radar` 子进程被禁、`smoke` 的 `.test-home` ACL 只给沙箱 SID `Write` 未给 `FILE_ADD_SUBDIRECTORY`、`metrics` 写工作区外 `D:\work\metrics` 被拒）。切换为完全访问后全部消失，确证与环境策略相关、非产品缺陷。

---

## 10. 残余风险与后续

| 风险 | 说明 | 处置 |
|---|---|---|
| R-1 分发形态双形态 | npm 形态有 `.d.ts`、桌面形态没有；两形态的守卫判据不同，若只在一种形态验证会漏 | 本批引入 `distribution` 维 + 两形态 fixture；CI 侧需两形态各跑一次（后续批次） |
| R-2 副本单点化未完成 | `tests/host-contract.mjs`（129KB）与 `tests/host-radar.mjs` 仍持手抄字面量 | 本批改为从权威源读取/语义断言；**B2 全量单点化**列入 ARCH-008 |
| R-3 探针仍非门控 | `probe never gates: exit 0` 是刻意设计（取证不阻断） | 门控职责在 `tests/*`；`--matrix` 只供人判读，不改变退出码 |
| R-4 dsh-tools 导出面漂移 | 移除 `./types` 子路径与 7 个导出、新增 `./pipeline` 与 8 个导出；本插件只消费 `defineTool`，当前零影响 | 账本中登记 `defineTool` 的 evidence；后续若消费新导出需重新走本流程 |
| R-5 订阅放大（有界，未修） | 宿主 `llm/models-updated` 按 provider **逐发**（`dsh-llm-deepseek/lib/index.js:2687`，仅目录真实变化或鉴权失效时触发）；我们每个事件调一次整页 `load()`（6 个 RPC），共享分发器无去抖、无单飞。稳态放大≈0，突发上限 = provider 数（0.2.2 树当前仅 1 个发射点）。宿主自家消费者（`dsh-client-ui-model-selection/lib/client.js:746`）用单飞 promise 合并，我们未做 | 本次不改共享分发器（430KB 手工维护浏览器包，改动半径 >> 收益且无观测症状；与既有 `settings-page-adapters` 同模式，非本批引入）。**ARCH-008 建议项**：`load()` 单飞 + trailing 重跑，对齐宿主 L746 |
| R-6 evidence 强度差距 | 12 条 required 中 `llm`/`settings`/`fs`/`remote` 4 条一度只有运行时后果、无实测红测名；而 CHANGELOG 写了"会红的测试" | P1/P8 不允许超额声明：要么补实测红测名，要么显式 `redTestGap` + 冻结数组 `RED_TEST_GAPS`，B1-k 三选一断言，CHANGELOG 按实测收敛 |
| R-7 类型声明面在桌面分发不可验 | 桌面 asar 树整树无 `.d.ts`（`lib/types` 目录形态不同），S2 系列类型锚只能"不可验"而非"通过" | 分发形态判据已落地（bundled ⇒ 可见 skip + 原因）；**CI 侧必须另有 npm 形态宿主树**跑一次真实类型锚，否则该面长期处于"不可验"状态。可复现靶子已就位：`.inspect-host/npm-0.2.2-rc.1/`（`package.json` = `{"dependencies":{"@deepseek-ai/dsh":"^0.2.2-rc.1"}}` → `npm install` 得到 329 个 `@deepseek-ai/*`、8553 个 `.d.ts`、cordis 4.1.0 / schemastery 3.19.0），一行命令可重建，不依赖真机 asar |
| R-8 `#SKIP` 口径 | `host-version-snapshot` 曾以 `--` 打印"非主基线已选定"，被计入 `#SKIP` 但零断言跳过，使 `#SKIP N` 被误读为"N 条覆盖被跳过" | 改为不参与计数的 note 前缀 + 如实文案；`DSH_BASELINE` 非法值仍 fail-closed |
| R-9 候选组解析双实现（审查 R0 P2-2） | `scripts/host-radar-probe.mjs` 与 `tests/host-contract.mjs` 各持一份同语义候选组解析（probe 不能 import 测试） | 已注释声明 + host-radar guard 行为级锁（同夹具两处同判）；随 R-2/B2 一并在 ARCH-008 单点化 |
| R-10 抽取器 `--out` 边角（审查 R0 P3-1） | `--out` 仅防"等于 archive"，未防落归档同目录/`.unpacked` 内等边角 | 本地取证工具、风险极低；ARCH-008 顺手收紧 |
| R-11 `distribution.js` 未入桶导出（审查 R0 P3-2） | `lib/host-abi/index.js` 桶未导出 `distribution.js`，消费方直连路径 | 桶导出面有机器锁，加导出需同步锁；ARCH-008 与 R-2 一并处理 |

## 11. 独立审查记录（REVIEW-ARCH-007-R0）

- 审查者：独立 Code Reviewer（治理降级模式：`software-project-governance` skill 不在会话目录，未走 review-record CLI；本节为协调者机录，**不构成独立审查通过，不得计入审查通过，不得据此解锁产品代码交付**——需按降级披露口径处理）。
- VERDICT: **NEEDS_CHANGE**（单点 P0）→ P0（`tests/host-distribution.mjs` 夹具字面量 `"abi":141` 命中 9h-5 锚扫描 → host-abi-health 1 FAILURE）与 P2-1（probe 死分支）已交 Developer 修复；P2-2/P3 登记为 R-9/R-10/R-11。
- 审查者一手复核通过的事实（节选）：allowlist 30=镜像 30=宿主实读 30（新增两事件 remote-events.js L37/L42）；账本 36=13+11+9+3、required 12、缺口 5 双向一致；`lib/client.js` 与 `tests/served-client.js` SHA256 一致（430929B）；并集三段四处逐字相同 + 结构锁/正例 3/负例 5/§0a 单区间自检全在；`DSH_BASELINE=0.9.9` fail-closed；SKIP_LINE 与漂移 note 前缀解耦；抽取器 17 组安全断言；四条反向回归（D4/S7 7a/S9b/bundled 位移）在位；0.2.2 锚点实况与本文档一致；越界改动未见。
- 受 P0 牵连的 CHANGELOG 两句（"ALL 24 SUITES … PASSED" 与 "242 assertions"）在 P0 修复、三靶复跑全绿后恢复为真。
