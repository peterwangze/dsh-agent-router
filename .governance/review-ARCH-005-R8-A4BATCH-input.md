# ARCH-005 / A4 批代码审查报告（Code Reviewer，round 8 / unit A4-batch）

> 持久化说明（Coordinator）：本文件为 Code Reviewer sub-agent 返回报告的逐字入库副本（sha256 锚定用）；机器登记 = review-record --task ARCH-005 --round 8 --unit A4 --result APPROVED_WITH_NOTES。审查时间 2026-10-17；对象 = staged 4 文件（先审后提交）；P2 F-1 已退回原 Developer commit 内修复。

## 审查结论：**APPROVED_WITH_NOTES**（unresolved_blockers = 0；P0=0，P1=0，P2=1（非阻塞遗留建议），P3=4）

审查范围：staged 4 文件（lib/client.js、tests/client-render.mjs、tests/served-client.js、lib/host-route.js），全部锚点经本机独立实读/实跑取证，零采信自报。

---

## 一、选型论证独立裁定（本批核心风险）——**Developer 推翻任务预设成立，两 OS 论证均正确**

实读 0.2.0 新树 dsh-client-ui-conversation/lib/client.js（18477 行）：

1. **runtime-only draft 论证正确**。`createDrafts(sessionId, files)` :3477 宿主自证文档逐字：图片=零上传（object URL 预览 + 字节随 prompt 编码）。插件三步链与 0.1.5-rc.2 composer 先例 :16776 逐形一致；0.2.0 先例 :18389-18391 同链形（addFiles 变体，见 P3-2）。
2. **「上传源得 file receipt 破坏 imageCount」论断成立且实际更严重**。`beginFileUpload`（:3506 区域）确只用于非图片 file draft；file-upload `upload` :179 返回 staged receipt。宿主 `serializeDraftAttachments`（:3607+）：图片→编码字节，文件→receiptId 引用，且 **id 不在浏览器 draftAttachments 注册表时直接 throw**；`resolveDraftAttachments`（:3596）同注册表解析。即走上传源所得 receipt id 会被 pruneAttachments 剔除/提交期 throw（功能断裂），即便成 file draft 也因 kind!=='image' 使插件 inputImageCountOf（lib/client.js:4527）计 0 → FIX-012 贴图武装失效。**设计文档 A4 行「上传得 attachment id → addAttachments」系对 rc.3 先例的误读（先例的 id 来自 createDrafts 而非上传），Developer 的纠偏是唯一正确通道。**
3. **四 MIME 集合逐字对齐**。宿主 isImageMediaType :3740（0.2.0）与 0.1.5-rc.2 :3231 同为 png/jpeg/webp/gif；插件 ATTACH_IMAGE_MEDIA_TYPES（lib/client.js:4777）逐字一致。addAttachments :13555 提交锁 false 语义与插件回滚分支吻合。ConversationController :3362 注册名确认。

## 二、T-1 定性证据裁定——**成立（0.1.5 已降级，CHANGELOG「恢复」措辞有据）**

`%TEMP%/arch005-t1pack/` 在位完整：tgz 重解包与 package/ 树逐字节一致（diff -r 零差）；version = 0.1.5-rc.2；createDraftImages 0 命中、addImages 0 命中；addAttachments 四锚与自报一致；createDrafts :2972、四 MIME :3231 在位。

## 三、独立复跑结果

| 验收项 | 结果 |
|---|---|
| run-all（chcp 包裹） | **22 套件 21 PASS + smoke 恰 2 sh 臂 + #SKIP 0** |
| 2 条 sh 失败归属 | **既有环境基线**：git archive HEAD 纯净档案复跑失败集恒等；ok 计数 1194→1202（净增 8 = A4 群新增断言） |
| A4 判别群 | smoke 内 **9/9 全绿** |
| 红演示 | 新测试 × HEAD 旧实现（archive 法）= **恰 6 条 A4 断言必红**（守卫 3 条两实现皆绿——负向判别本就测保留语义，正确形态） |
| 镜像纪律 | cmp 字节恒等 |
| client-render 直跑 | 空跑（RUNNER_MODULES 排除成员）——A4 真实绿灯 = smoke.mjs 承载（P3-5） |

## 四、Findings

- **[P2] F-1｜lib/service.js:2518 + :2490——旧 API 名「addImages」残留**于用户可见错误消息与注释（P5-textual-residue 非功能性并存）。自报「P5 残留 1 处」**计数不实**——实为 3 处（client.js:4869 迁移注释属允许 + service.js 两处漏清）。→ 已退回 Developer commit 内修复。
- **[P3] F-2｜lib/client.js:4872 注释措辞精度**——0.2.0 composer 实际用 addFiles；addAttachments 精确同形先例是 0.1.5-rc.2 :16776 与 0.2.0 :13475/:16654。链形同形成立，方法名简写略欠精确。
- **[P3] F-3｜props.sessionId 注入点未在 slots 库直接定位**——可用性经三重旁证确认（SessionGallery 同槽位既有消费者/FIX-029-B standardProps 契约/宿主 InputBar :17226 + :17532 renderSlot 守卫证恒非空）；缺面守卫兜底任何间隙非崩溃态。
- **[P3] F-4｜四 MIME 收紧行为变化如实评估——支持矩阵内零回退**：svg 经 uploadFile 畅通；heic/avif/bmp 在 0.2.0 宿主本就不可能为图片草稿，旧表现 attachUnavailable 报错，新行为（转文件通道）为改善。
- **[P3] F-5｜验收记录口径**：A4 绿灯证据应引 smoke.mjs；client-render 直跑是设计上的空跑。

## 五、其余维度

- **host-route.js A3 P3 吸收**：恰两 hunk 无夹带；F-2 头注事实核验通过（describe :413-462 锚区间微差 4 行）。
- **AI 专项五查**：全零。
- **五维度**：正确性/安全性/可维护性（除 F-1 残留）/性能/测试覆盖 ✓。
- **P-violation**：F-1 = P5 轻度文本残留 + 自报计数不实；其余无。

**结论：A4 批可合（F-1 commit 内修复后）**。
