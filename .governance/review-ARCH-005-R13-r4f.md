# 审查报告 — ARCH-005-R4F-R0（CI 矩阵 env 泄漏修复批）

> 机录副本：Reviewer 以消息体返回报告（按禁止事项不写文件），Coordinator 落盘后经 review-record CLI 写 canonical 记录。
> Round: R0（本批首轮，链内序 R13）| 审查对象: 工作树未 staged 增量（`tests/host-radar.mjs` 修复本体 + `CHANGELOG.md` 勘正补丁）
> 结论: **APPROVED_WITH_NOTES** | **unresolved_blockers = 0**
> 分级计数: P0=0 / P1=0 / P2=0 / P3=3（均为观察与建议，不要求本轮修改）
> Reviewer agent: agent_f4ad2c1c（独立复跑取证，非复述 Developer 自报）

## 硬门槛裁决

| 门槛项 | 结果 | 证据 |
|---|---|---|
| P0 阻塞数 = 0 | ✅ | 全部发现为 P3 |
| 5 维度 100% 覆盖 | ✅ | 见下节逐项 |
| 每条发现标注级别 | ✅ | F-1/F-2/F-3（P3） |
| 设计一致性检查 | ✅ | P5 单路径：净化单点在 `runRadar`，不逐用例散落（P5-violation = 0）；与 R3 机制共存不冲突——净化在套件层内剥，CI job env 照常喂 R3 的正当消费套件（host-contract / host-version-snapshot，ci.yml:104） |
| AI 专项 5 项 | ✅ | mock 残留=无；硬编码返回值=无；幻觉 API=无（spawnSync/delete/spread 标准面且经实跑验证）；未实现 TODO=无；过度实现=无（12 行单点，恰为原则 5 要求的形态） |

## 五维度结论

1. **正确性 ✅** — 净化集与 probe env 消费面穷尽一致（独立 grep：`scripts/host-radar-probe.mjs` 全文 `process.env` 恰 3 处 = `:94` DSH_HOST_SOURCE 模式判定 + `:219` DSH_HOST_SOURCE 靶子回落 + `:180` DSH_BASELINE 基线选择；import 仅 fs/path/url，无 `node:process` 等间接形态——键集恰为 `PROBE_ENV_KEYS` 两项，无第三个）。CI 矩阵注入面（ci.yml:209 `DSH_BASELINE` + :273 `DSH_HOST_SOURCE`，均 job 级）恰被该清单闭合。合并次序正确：`sanitized` 先剥两键 → `{...sanitized, ...env}` 用例显式传入最后展开胜出。前身 `:264`（envRun）/`:268`（frozenEnvRun）映射到修复后 `:276/:280`，用例体零改动，probe 侧 `opts ?? env` 回落语义（:180/:219）与之相容，双形态复跑均绿。
2. **安全性 ✅** — spawnSync 参数数组无 shell 注入面；env 剥离恰两键、保留 PATH/SYSTEMROOT 等系统键（Windows spawn 不破）；无敏感数据。
3. **可维护性 ✅** — 注释为符号名形态锚（"DSH_HOST_SOURCE 两处——模式判定与靶子回落；DSH_BASELINE 一处——基线选择；无第三个"），无行号锚，与仓内纪律一致，且把 grep 实证依据写进注释作维护契约。
4. **性能 ✅** — 每 `runRadar` 调用一次 env 浅拷贝（~百键 × ~46 次 spawn），可忽略。
5. **测试覆盖 ✅** — 两条 P8 负控语义未被削弱（详见判别力验证）；污染/干净双形态全套件独立复跑全绿。

## 验收标准逐项证据（全部独立执行）

1. **修复正确性** — 见五维度 1。独立 grep 输出：`:94 / :180 / :219` 三处、两键。
2. **判别力** — A/B 因果链直接取证（污染 env = `$TEMP` 自建含 `dsh/package.json` + `dsh-api-remotes/lib/client.js` 的合法宿主树，口径与 CI 一致——不含 `@deepseek-ai` 层）：
   - **A（pre-fix `{...process.env}` 继承形态）**：`status=0, hijackedMode=probe`——P8 负控 `runRadar([])` 断言 `status===1`（host-radar.mjs:340-341）必红。机制推演 0.1.5 job 红 11 条 = 绿树×3 + t6×1 + t6b×1 + schema×1 + absent×1 + out×1 + envRun×1 + frozenPrimary×1 + P8-no-mode×1，与 CI run 38987785095 报告数**精确吻合**（交叉印证诊断成立）。
   - **B（post-fix 净化形态）**：`status=1` + stderr `no mode selected: --host-source ...`——负控绿。
   - 第二负控（:285-286 frozen 树默认 primary 判 10 mismatch，"不因环境变量缺省而失判"）：pre-fix 污染下 0.1.5 泄入致 0≠10 红，post-fix 污染复跑绿（46/46 覆盖）。
   - 因果链成立域说明：回归判别在**污染 env** 下无条件成立，而 CI 矩阵 job 恒注入两键（ci.yml:209/273；run-all.mjs:159 以 `env: process.env` 下传）——恰为原发环境，链条闭合。
3. **无副作用** — diff 仅触及头注释 + `PROBE_ENV_KEYS` 常量 + `runRadar` 函数体，零断言行改动、零其它文件改动；host-radar.mjs 经 run-all `readdirSync` 自动发现，门控接线在位。
4. **CHANGELOG 勘正** — 独立实测：`git rev-parse --short v0.5.0` = `336665c`（与文内一致）；`git rev-list --count v0.5.0..HEAD` = **116**；机器分类（仅 `.governance/` 改动计治理）= **48 治理 + 68 产品 = 116**——勘正后 69+48=**117**（E-1 时点，R4F 1 个产品面提交落地后）与 117+1=**118**（E-1 落地后）算术精确自洽。staged→worktree 对照恰四处计数变动（116→117 / 落地后 117→118 / 68→69 / 结论行 68+48=116→69+48=117）+①补一行，**无编造 SHA**（明文"本批 SHA 落地后回填见 git log"）。「验证基线」段在 unstaged diff 中仅以未改动上下文行出现——未触碰。历史版本结论行（14+5=19 等）零波及。
5. **独立复跑** — ①污染：`DSH_HOST_SOURCE=$TEMP/arch005-r4f-review-host DSH_BASELINE=0.1.5 cmd //c "chcp 65001 >nul && node tests/host-radar.mjs"` → `ALL HOST RADAR GUARD TESTS PASSED (46 assertions)` exit 0；②干净：同命令无 env → 46 断言全绿 exit 0；抽查 `node tests/host-abi-health.mjs` → `ALL HOST ABI HEALTH TESTS PASSED (215 assertions)` exit 0（锚守卫面无回退）。

## 发现列表（全部 P3，不阻塞）

- **F-1（P3 观察）** 负控判别力为环境条件性：干净 env 下本地 revert 净化不会红（无可继承项）。CI 矩阵（原发环境）恒污染故回归必红，验收口径满足。可选增强：套件内自注污染负控 canary（父进程临时污染 `process.env` 再断言 `runRadar([])` 仍 exit 1）使判别环境无关。
- **F-2（P3 提交序列依赖）** 117/69+48 算术成立前提 = R4F 恰为 **1 个**提交先于 E-1 落地（①补行已明示"1 个"；拆分提交将使治理计数变 49、总数变 118，勘正失效）。另：勘正补丁（unstaged）叠在 staged E 批条目之上，提交编排需防 R4F 提交误吞 staged 三件套。属 Developer/Coordinator 执行注意项，内容本身自洽。
- **F-3（P3 讨论）** `PROBE_ENV_KEYS` 为键名硬编码快照：probe 将来若新增第三个 env 键不会自动跟踪。当前 grep 实证无第三键且注释已立契约；可选：以既有机器锁形态把该清单与 probe 源码键集互锁。

## 最终结论

**APPROVED_WITH_NOTES**（unresolved_blockers=0，P0/P1/P2 均为 0）——修复封闭 CI 矩阵 env 泄漏且经污染/干净双形态独立复跑 46/46 全绿，负控判别因果链 A/B 直接证明，CHANGELOG 勘正四处数字与独立实测精确自洽、无编造 SHA。三条 P3 备注移交后续（F-2 提交序列约束建议 E-4 Release Reviewer 承接核对；E 批 staged 三件套按任务边界不在本轮范围）。

**审查产物位置**：无文件产出（按任务禁止事项"不修改任何文件"，本报告以消息体返回 Coordinator）；取证临时目录 `$TEMP/arch005-r4f-review-host` 自建自弃，未触碰 HOME/仓库任何文件。
