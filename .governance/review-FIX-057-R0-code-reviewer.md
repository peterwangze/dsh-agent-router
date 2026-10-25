# REVIEW FIX-057-R0 — Code Reviewer（有界独立审查）

- 仓库/对象：`dsh-agent-router`，工作树 = 已提交状态；HEAD `5d08d10`（docs/REL-015），代码提交 `509ef54`（FIX-057）。
- 审查日期：2026-10-25；时间盒 ≈ 8 min；只读（唯一写入 = 本报告）。
- 已验证代码指纹：13 files, +661/−56；新增 `lib/host-abi/{host-packages,host-imports}.js`。
- 边界执行：未启动桌面端/Electron/profile 服务器，未做 A/B 装机与真机复现，未遍历宿主源码树（仅按审查问题做定点 grep/读行）。
- NOT_RUN：全量 `tests/run-all.mjs`（超范围）；A/B 装机、桌面端真机启动、负控实验（禁止/超时盒）。
- 工作树副作用（非人工写入）：本报告落盘时 governance write-guard hook 自动更新 `.governance/.write-guard-{state,violations,deferred-ledger}`（记账，非产品代码/测试/文档）。

## 逐问结论

### Q1 import 收敛等价性 + 模块图
- **语义等价：成立。** `node -e` 实测 `schemastery.default === host-imports.z` 且 `typeof z === 'function'`；`defineTool` / `BlockAssembler` / 消息构造 / `TypertRemoteService` 均为同一绑定具名 re-export，消费点调用形态不变。
- 无新增仓库内循环：`host-abi` 各域不 import `schemas.js`；`schemas.js → host-abi/index.js` 为单向边。
- **但有新增 Node-only 传递边（P3）：** `lib/schemas.js:36` 经桶拉入 `host-packages.js`（`node:fs/module/path` 仅由该域）与 `version.js`（`node:module`）。当前浏览器包 `lib/client.js` 是独立 IIFE、不 import schemas，故**今天无浏览器包破坏**；但公开子路径 `./schemas` 从纯 schema 模块变为 Node-only，未来任何 browser/打包器消费即炸。建议：桶内仅 re-export `host-imports` 的纯符号面，或把 `z` 从 schema 专用出口暴露，避免 schema 契约模块承担宿主探测图。
- 另：`host-imports` 一次 import 全部 5 包，使任何桶消费者都加载全部宿主包（当前 4 个比较包均 required，无新增可选面风险）。

### Q2 声明面是否真被锁住
- **主线已锁：** `dependencies` 仅 `undici`；13 peer 集合、`engines.dsh`、8 optional 元数据与注册表双向值级锁定均实跑通过；`files` 白名单不含锁文件；`install.ps1/install.sh` 无 `pnpm/npm add` 或依赖改写（仅注释提到解析）；消费者不安装 `devDependencies`（`link:` 开发者自装树属开发形态，非 profile 提升通道）。
- **残留绕过口（P2）：** 断言只覆盖 `dependencies`（`tests/host-version-snapshot.mjs:253`、`tests/host-contract.mjs:953`）。`optionalDependencies` / `bundledDependencies` / `pnpm.overrides` 同样会进入安装树并可能被 profile 提升，当前零判别。建议把「安装期依赖集合（dependencies ∪ optionalDependencies ∪ bundledDependencies）零 `@deepseek-ai/*`」做成单条断言。
- **判别力缺口（P2）：** S10 的 import 扫描正则（`tests/host-contract.mjs:1472`）要求 `import` 与 `from` 同行；Prettier 多行具名 import、或 `require('@deepseek-ai/…')` 动态/CJS 形态可整体绕过，「新增裸 import 即红」的成文承诺不成立。建议先 `stripComments` 后按 `from`/`require(`/`import(` 独立匹配，并覆盖 `lib/**` 递归（现只扫 `lib/*.js` + `lib/host-abi/*.js`，更深子目录是盲区）。
- 残余风险（P3）：peer 为 required 时，若消费者 pnpm 未关 `autoInstallPeers` 仍会装宿主包；桌面 profile 实测配置 `autoInstallPeers: false`，报告渠道无碍，但该前提未由插件侧表达（已由 CHANGELOG 声明端到端测试不在本版范围）。

### Q3 诊断语义
- **非对称有代码依据：成立。** 宿主 `dsh-app-boot` 实读：`packageDirFromAnchor`（`lib/index.js:976`）即 `createRequire(anchor).resolve.paths` 的裸路径序，用于 installation scope / bundle 解析；`manifestOf`（`:2264`）先 `ctx.get('pluginPackages')?.packageOf(...)`，`PluginPackages.packageOf`（`:3544`）在有 interception 时走 `interception.packageDir`，并在 CJS 侧改写 `Module._resolveFilename`（`:1953/:2045`）⇒「插件侧 routed（packageOf/require）vs 宿主安装侧裸路径序」的机制成立，CJS 兜底也确实被改写。
- `profileContext`/`pluginPackages` 服务名、`installAnchor` 字段与 `packageOf` 返回 `{version}` 均与宿主实读一致（`dsh/lib/profile-boot-C14i-8IN.js:290-306`；`dsh-app-boot:3498,3544`）。
- **无 service 时不误报：成立**（`routing='none'` 短路 + R3-b）。**绝不 throw：成立**（`hostGenerationReport` 全路径 try；`noteHostDiag` 内部再 try）。
- **漏报口（P2）：** 有 anchor + interception 但某侧版本为 `'unknown'` 时被 `continue` 跳过（`lib/host-abi/host-packages.js:240-247`），且 `noteHostGeneration` 只对「无 anchor / 无 service」记事件（`:273-288`）。即版本探测能力缺失（asar 读失败、`packageOf` 形状漂移、exports 封锁）会被静默当健康，违反 P8「能力判定缺失 MUST 产生诊断事件」，也与文件头「不可判定 ≠ 一致」的自我声明不一致。需补 `unknowns` 汇总 + 一条 `host-package-generation-unknown`（如 `code=versions-unavailable`）。

### Q4 测试判别力（纸面推演）
- R3-b 能红掉「去掉 routing 守卫」；R3-d 能红掉「插件侧改用裸路径序」（service 桩 9.9.9 vs 裸路径 dev 0.2.0-rc.2 ⇒ mismatch≠0）；R3-e/f 能红掉「mismatches 恒空/诊断不落环」；R4/R5 覆盖 anchor 缺失与 read 抛错。**误报/漏报主防线真实。**
- **缺口 1（P2）：** 全部 R3 用例直调域函数，**没有断言 `apply()` 接线**（`lib/index.js:257`）；删掉该调用三套件仍全绿（R3 组不经过入口）。
- **缺口 2（P2，P10-④）：** R3 的宿主面桩（`tests/host-abi-health.mjs:2084,2090`：`ctx.get('profileContext').installAnchor`、`pluginPackages.packageOf(name,url)→{version}`）是手写心智模型，没有像 S2/S5 那样锚到宿主源文件/符号；宿主服务名或返回形状漂移时，本组仍绿而生产探测退化为 unknown（见 Q3 漏报）。建议在 host-contract 增加该两面的宿主源码锚（`profile-boot` 的 `provide("profileContext"` / `dsh-app-boot` 的 `packageOf(specifier, parentURL)` 与 `{version}` 读点）。

### Q5 P1-P10 扫描
- P1：声明面/机制陈述基本可由宿主源码复称；仅两处措辞需修正（见 F7/F8）。P2 全面性：低分词句见下。
- P4：三套件与纸面防线成立；全量网 NOT_RUN（边界）；测试网缺口见 F2/F3/F4/F5。
- P5：基本成立——4 处裸 import 已删、单出口在位；但 S10 扫描面/形态不足以支撑「单点不可绕过」的强承诺（F2）。
- P8：主路径可观测成立；版本 unknown 静默是明确违反（F1）。
- P9：宿主接口有代际自检 + 形状降级可观测；但探测桩未锚宿主面（F4），长期 parity 依赖人肉。
- P10-④：违反一次（F4，测试桩宿主面未锚源码）。

## 发现清单

| # | 文件:行 | 级别 | 结论 |
|---|---|---|---|
| F1 | `lib/host-abi/host-packages.js:240-247,273-288` | P2 | 版本 unknown 被静默跳过、无诊断事件（P8-violation；三态诚实声明不完整） |
| F2 | `tests/host-contract.mjs:1472-1485` | P2 | S10 import 扫描仅同行 import/from，多行 import / `require()` / 深子目录可绕过（P4/P5 守卫判别力） |
| F3 | `tests/host-version-snapshot.mjs:253-256`；`tests/host-contract.mjs:953-955` | P2 | 纯净性只锁 `dependencies`，`optionalDependencies`/`bundledDependencies` 通道未覆盖（P4） |
| F4 | `tests/host-abi-health.mjs:2084,2090` | P2 | 宿主面桩（`profileContext.installAnchor`、`pluginPackages.packageOf` 形状）未锚宿主源码（P10-④；P9 长期守卫缺口） |
| F5 | `lib/index.js:257` + 三套件 | P2 | 无测试断言 `apply()` 调 `noteHostGeneration`；接线删除不红（P4） |
| F6 | `lib/schemas.js:36` → `lib/host-abi/index.js` | P3 | 公开 `./schemas` 子路径获得 Node-only 传递图（`node:fs/module/path`）；今日浏览器包不受影响 |
| F7 | `lib/host-abi/version.js:6-8,142-143` | P3 | 注释仍称 3 包为 `dependencies`，迁移后事实错误（P1 事实一致性，小） |
| F8 | `lib/host-abi/host-packages.js:34-45,127-133` | P3 | 「与宿主装载门同构」措辞不准：宿主 `manifestOf` 先走 routed `packageOf`，裸路径序是 installation/bundle 解析helper；机制本身仍成立，建议改写为「与宿主安装侧 packageDirFromAnchor 同构」 |
| F9 | `package.json:4` | P3 | 版本位与声明面同文件，随 fix 提交 bump 0.6.2→0.7.0（编程要求 4「改动纯粹性」；已在 commit message 声明） |
| F10 | `tests/host-version-snapshot.mjs:256` | P3 | `dependencies` 键序敏感断言（`['undici']` 逐字序），键序变化会假红；建议集合相等 |

## 文档核对（5d08d10，仅事实一致性）
- 通过：dependencies 零宿主包、peer 13 项、同 5 包 devDependencies、`engines.dsh` 与 11 项共同范围逐字一致、host-imports 6 符号、R3/R4/R5 8 断言；宿主 `unmetRequirements` 实读确认「engines.dsh 存在则单独判定、忽略 peer」（`dsh-app-boot/lib/index.js:279-287`）。
- 未核：CHANGELOG 的 A/B、真机桌面、负控 1 FAIL、全量 23 suites（NOT_RUN，边界）。
- 措辞：README/CHANGELOG 的「裸路径序 = 装载门口径」与 F8 同一处不精确，不构成功能错误。

## 实跑
| 套件 | exit | 断言 | 耗时 |
|---|---|---|---|
| `node tests/host-version-snapshot.mjs` | 0 | 73 passed | ~0.13s |
| `node tests/host-contract.mjs` | 0 | 160 passed | ~0.35s |
| `node tests/host-abi-health.mjs` | 0 | 223 passed | ~0.36s |

## 必改点（进入下一轮前）
1. F1：补版本不可判定的诊断事件（否则 Q3「不可判定 ≠ 一致」不成立）。
2. F2/F3/F4/F5：补强守卫判别面（import 多行/require、安装期依赖全集、宿主面源码锚、apply 接线断言）。

VERDICT: APPROVED_WITH_NOTES
UNRESOLVED_BLOCKERS: 0
