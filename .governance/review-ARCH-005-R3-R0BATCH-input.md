# ARCH-005 / R0 批 代码审查报告（Code Reviewer，round 3 / unit R0-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 3 --unit R0 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged diff（先审后提交）。

**结论：`APPROVED_WITH_NOTES`（unresolved_blockers = 0）** — P0=0，P1=0，P2=1（带 R1 遗留承接），P3=2。零采信自报：diff 逐行实读、宿主树独立实读、两验收门独立复跑、红向判别力独立执行（非重放 Developer 演示）。

**审查对象**：`git diff --cached`（7 文件 219+/93−），工作树与 staged 态一致（7 代码文件零未暂存改动）。

---

## 一、独立复跑结果（验收门 ②④）

| 门 | 命令 | 独立结果 | 与自报对照 |
|---|---|---|---|
| ② | `node tests/host-contract.mjs`（UTF-8 代码页会话） | **122 断言全绿**；启动行靶子 = `npm-global(C:\Users\peter\AppData\Roaming\npm\...\@deepseek-ai)`，优先于 7 个 `_npx` 候选（含过期 rc.3 树——F-A 失明场景实测已闭合）；版本一致性 8 包全 `0.2.0-rc.2` = 基线，绿 | 一致 |
| ④ | `node tests/run-all.mjs`（chcp 65001 会话） | **20/21**；唯一失败 smoke = **恰 2 条 sh 臂**（`bare-source install (sh --local) idempotent on sh` / `git clone failure reports clear error on sh`）；**#SKIP 0** | 一致 |
| ③（红演示） | `DSH_HOST_SOURCE=<rc.3 过期树>` 指打（纯只读零改动） | **7a 真红**：8 项精确缺失清单 + FIX-037 ③ 一致性告警 note 触发；**7b 亦红**（旧树 `presets,authorable` ≠ 新基线 `presets`）——判别力独立证实，且反向证实 agentPresets 基线收缩方向正确 | 超出自报（独立红向执行） |

**环境备注（审查过程发现，非交付缺陷）**：未设 UTF-8 代码页时 smoke 会多出 4 条伪失败（powershell/pwsh 臂中文报错文案 includes 断言，控制台代码页错配所致）——任务规定验收命令自带 `chcp 65001` 前缀正是为此。

## 二、逐项审查裁定

**1. 正确性（P）**
- 靶子候选链：优先级 `DSH_HOST_SOURCE > DSH_HOST_PACKAGES > npm-global(APPDATA) > npm root -g 兜底 > _npx 降序` 实现正确；spawn 仅在 APPDATA 路径未命中时发生（常径零子进程）、10s 超时、`shell:true + windowsHide`、**固定 argv 零注入面**；`dshRoot` 上两层寻主包实测命中；失败路径全部可观测（npm 不可用→跳兜底→无靶子→启动行「不可达」+ S3/S7 skip note；版本失配→告警+note——均实测触发）。P8 合规。
- 双基线注册表：section 0 完整性断言（唯一 primary/唯一 id/status 枚举/字段正则）+ 分裂检测（11 处范围任一不一致 → `declaredEntry=null` → 红，fail-closed）+ host-contract 侧主基线项机器锁（提取失败同判红）。**`declaredEntry` R1 后可达性**：`^0.2.0-rc.2` 精确命中 primary 项——构造可达，真实切换路径成立。
- 7a 单向断言：⊆ 语义（`mirrorMissing`）+ 超集增量打印；**旧全等 deepEqual 路径已删除、零残留**（P5 合规——S1e 的 deepEqual 对象是「镜像 vs 插件侧冻结基线」，与 7a「镜像 vs 宿主实读」判据对象不同，非并存双路径）。真判别。

**2. 镜像纪律**
- `lib/client.js ↔ tests/served-client.js` 字节恒等：**git staged blob ID 相同**（`db58784…`）独立复算 + 机器锁 `tests/host-abi-health.mjs:161-162` 在跑并通过。
- events.js 27 项 vs 宿主实读表：**独立实读逐项逐序全等**（27 条、单引号形态——现行正则命中无虞；8 新增项与设计 F-D 清单精确一致）；client.js 镜像 27 项同序证实。
- **锁外 3 文件裁定：全部机械必需，无夹带**——lib/client.js（S1e 镜像 parity + S6 ⊆ 判据所迫，diff 内容恰为 8 项+注释计数）；tests/served-client.js（字节恒等锁所迫，同 hunk）；tests/host-abi-health.mjs（§9e `length===27` 判据 + stale/fresh 文本锚「19 项」字串必须同步，4 hunk 均属此类）。

**3. P10-④ 锚点抽核（7 处，全部一手实读证实）**
① pi-ai `:2490` 逐字命中；② 27 项表（序+引号形态）；③ LlmAdapter 六方法 `:1676/:1687/:1697/:1706/:1718/:1734`（+registerAdapter :1833）；④ InputState `attachmentIds` `input.d.ts:240` 在位、imageIds 零命中；⑤ `agentPresets_list_result$schema` 顶层唯一字段 `presets`（authorable 实缺，基线收缩有据）；⑥ schema 惰性工厂编译形态（A2 参考注记属实）；⑦ 主基线 cordis 4.0.5 / schemastery 3.18.5 / dsh 0.2.0-rc.2 实树读数与注册表逐值相等。

**4. 设计一致性（§6 R0 行逐项）**：五项交付全落位。7b/S5 保持全等语义系设计原样（仅 7a 改单向），非偏差。

**5. AI 专项五查**：mock 残留=0；硬编码=0（冻结基线常量即设计机制，APPDATA 路径带兜底）；幻觉 API=0；未实现 TODO=0；过度实现=0（section 0 注册表自看护有设计 §7.2 依据，since 注记为 §2-B c 明确要求）。

**6. 五维度结论**：正确性✓；安全性✓（固定 argv 零注入、零凭据面、宿主访问纯只读）；可维护性✓（靶子解析单一实现路径保持、注释含事实源与刷新程序）；性能✓（spawn 有界且仅兜底路径）；测试覆盖✓（绿/红/降级三态均独立执行到）。

## 三、Findings（级别/锚点/建议）

| # | 级别 | 锚点 | 问题 | 建议 |
|---|---|---|---|---|
| F-1 | **P2** | `tests/host-version-snapshot.mjs:153,159,173-176` | 过渡窗放宽（sections 2/3 接受 `registeredRanges` 任一项 + section 5 随 `declaredEntry` 判 README）在 **R1 后若不收紧**：package.json 整体回退 frozen 范围将不判红。R0 本批该放宽是机械必需（不动 package.json 前提下保持全绿），非缺陷 | **登记 R1 批验收项**：声明项 MUST=primary 的收紧断言（或等效判据），防基线跳跃可被无声回退 |
| F-2 | P3 | `tests/host-contract.mjs:282,729-730` | S3 `HOST_DECLARED_RANGE='^0.1.5-rc.2'` 是声明范围第五份硬拷贝、未注册表化——R1 漏改此处 S3 判红（fail-closed 可接受），但锁形态弱于 HOST_VERSION_BASELINE 的机器锁 | R1 与版本基线同法注册表派生/机器锁定 |
| F-3 | P3 | `tests/host-version-snapshot.mjs:61,165` | 注册表零 primary 项时 `HOST_BASELINE.cordis` 将 TypeError 崩栈（section 0 已判红但后续断言被截断；结局红、形态不优雅） | section 4 前置空判或 HOST_BASELINE 归一兜底 |

## 四、裁定与义务移交

- **锁外 3 文件**：镜像 parity 机械必需成立（三重锁），准予入本 commit。
- **零产品行为变更承诺**：唯一运行面数据 delta = 白名单 +8 项（设计明令的镜像刷新；插件自身消费事件仅 4 项均未变，S6 ⊆ 判据无新增消费点）——属「数据基线登记」而非行为改动，与承诺相符。
- F-1 需 Coordinator 登记入 R1 批验收清单。
