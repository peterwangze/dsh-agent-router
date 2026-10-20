# 审查报告 — ARCH-006-R0（宿主 0.2.1-rc.2 基线档案刷新批）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> Round: R0（首轮）｜Task: ARCH-006｜结论：**APPROVED_WITH_NOTES**｜`unresolved_blockers=0`
> Reviewer agent: agent_c26177be（全一手核验——宿主树实读/事件序比对/字段序比对/负控求值/穷举核验/归因实验，非复述 Developer 自报）

## 一、审查范围与纯粹性

- 工作树 11 文件 = Developer 批次恰 8 文件（lib/client.js、lib/host-abi/events.js、lib/host-abi/version.js、tests/abi-health.mjs〔host-abi-health〕、tests/host-contract.mjs、tests/host-radar.mjs、tests/host-version-snapshot.mjs、tests/served-client.js）+ 3 个 `.governance/*` 为 Coordinator 立案记账——非 Developer 越界。
- package.json / CHANGELOG.md / README.md / `.github/**` 零改动 ✅；无版本 bump（发版 0.6.1 为后续独立决策口径一致）。
- 无新增行号锚（diff 中 `:NNN` 串仅锚守卫既有 stale 数组）；无 scope creep。

## 二、验收标准逐条独立核验

1. **注册表结构 ✅**：全局树实读——主包+dsh-* 全系 0.2.1-rc.2、cordis 4.0.5、schemastery 3.18.5，与 0.2.1 primary 条目逐值一致；恰一 primary 断言在位（filter===1）且真实判别（双 primary→count=2 红；零 primary→F-3 前置判红收口）；status 词表仅 frozen/primary 无臆造。模拟 resolve-baselines 枚举 `["0.1.5","0.2.0","0.2.1"]` 3 基线；ci.yml 非注释行零版本字面量。
2. **五消费面一致性 ✅**：host-contract 提取断言 fail-closed 判据组在位（129 断言绿）；ci.yml marker 3 基线零字面量；probe 实测 totalDiffs=0（包表 10/10 match）；**lib 投影值级锁定**（host-abi-health R2-a——解析 snapshot 权威源 ↔ import version.js 投影逐项 canonical 比较覆盖整个数组含新条目）实跑绿。
3. **事件白名单 ✅**：宿主 remote-events.js 实读 28 项，`plugin-market/changed` 序位与镜像插入位逐字一致、全表逐项逐序比对一致；分代复跑 `DSH_BASELINE=0.2.0` → 126 断言 + 4 可见 skip 零红 / `0.1.5` → 123 + 6 skip 零红（与 Developer 自报逐项一致）；`lib/client.js` ↔ `tests/served-client.js` SHA256 恒等（`4f9e29a3…`，git blob 同 `49b8291`）；bundle 内白名单计数 28 含新事件。
4. **schema 白名单 ✅**：宿主 client.js `llm_listConfigurableProviders_result` 顶层字段序实读 = 九字段与 S7 逐序恒等；wireSchemas 六面 hostOnly/baselineOnly 双空；插件消费面仅用旧 6 字段子集（client-remotes.js/service.js 实读）——**消费代码零改动裁定成立**（grep 新三字段 lib/ 零消费）。
5. **独立复跑 ✅**：①host-contract 129 断言 PASS 0 skip；②run-all 23 套件 22 PASS + smoke 恰 2 sh 臂 + #SKIP 0——**归因实验**：HEAD 批前基线隔离副本同环境复跑 sh 臂失败原样复现（环境性，与本批 diff 无因果）；③probe totalDiffs=0；④三态桩 matched/0.2.1 + 0.2.1-alpha.5→compatible-unknown + degraded→incompatible + 真实锚（本仓 0.2.0 frozen 树）matched/0.2.0；host-abi-health 215 绿 + snapshot 30 绿。

## 三、两项语义演进重点审查

**F-1 声明面覆盖判据——防回退强度不降，判定成立**：旧断言 `^0.2.0-rc.2 ≠ ^0.2.1-rc.2` 必红（求值证实）——演进是唯一非改声明面通路。负控独立求值 6 例全符合预期（现行 true；回退 ^0.1.5-rc.2/^0.1.0-rc.1/假 ^9.9.9/越顶 ^0.3.0-rc.1 全 false 红；分裂/缺失 null 红；未注册锚定值 README 判据组红）。「镜像宿主装载门」一手锚：宿主 dsh-app-boot/lib/index.js:277 实读 `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`。S3 覆盖谓词文本提取自权威套件单源（无第二份拷贝），提取失败→红（fail-closed）。R2-g 测试改动系对齐既有产品语义（version.js matched = ∈ 档案含 frozen，ARCH-005 R2 起），非产品面放松。

**分代谓词 versionTripleOf——不变性成立**：穷举机器核验批前全部 8 个 (since×target) 组合新旧谓词零分歧；修复实证 since=0.2.1 对 target=0.2.0 旧谓词 true（=CI 0.2.0 树假红根因）/ 新谓词 false（正确 skip）；分代复跑闭环。

## 四、五维度 + AI 专项

正确性 ✅（全一手核验）/ 安全性 ✅（无秘钥注入面；new Function 提取消费仓内测试源文本，同既有纪律）/ 可维护性 ✅（P5 单源强化——谓词提取单源化、删 primaryDeclaredRange 派生常量）/ 性能 ✅ / 测试覆盖 ✅。AI 专项 5 项全过（mock 残留 0/硬编码 0/幻觉 API 0/TODO 0/过度实现 0）。

## 五、发现清单

- P0/P1/P2：**0 条**。
- **P3-1**（ledger）：`caretRangeContains` 双侧剥离 rc 后缀——同三元组 rc 错位（声明 ^0.2.1-rc.2 而实装 primary=0.2.1-rc.1）时与真实 satisfies 方向分歧（谓词绿、装载门拒）。现数据不可达（注册表每三元组仅一 rc 家族），未来同三元组 rc 刷新时留意。
- **P3-2**（ledger）：`versionTripleOf` 畸形输入回退 [0,0,0]=恒适用（非 fail-closed）；被守卫路径不可达，建议后续卫生批对齐 F-3 风格。
- **P3-3**（事实登记）：本机 smoke 2 sh 臂环境性失败批前已存在（归因实验证实，CI ubuntu 权威）——非本批引入。

## 六、终态

**APPROVED_WITH_NOTES，unresolved_blockers=0**——基线刷新批可合并；P3×3 入台账随后续卫生批裁量。
