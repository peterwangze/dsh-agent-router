/**
 * ARCH-004 host-abi 桶聚合（设计 §4.1/§4.2，EVO-019 B1 批）：仅 re-export
 * 域导出面，零逻辑——消费者统一 import 入口（`import { … } from
 * '../host-abi/index.js'`）。依赖方向严格单向（§4.2 图）：消费者 → 桶 →
 * 域 → health.js（域间互不 import；本桶不加任何逻辑/常量，防上帝模块）。
 * 域内暂无消费者 = B2-B5 迁移批次的设计状态（各域文件头已声明归属批次）。
 *
 * 域 8（宿主包域，2026-10-25 桌面端启动故障承载）：`host-packages.js` 是宿主
 * 供给包的单一声明源 + 代际自检；`host-imports.js` 是本插件对宿主包的唯一
 * 静态 import 出口（此前 dsh-tools / dsh-llm / dsh-typert-protocol / schemastery
 * 散落在 tool / prestep / service / schemas 四处裸 import，且被误列入
 * dependencies——见该域文件头的故障机制）。桶的零逻辑纪律不变：两域均为
 * 纯 re-export / 纯读探测，无 const 派发、无实例状态。
 * @module dsh-agent-router/host-abi
 */
export * from './health.js'
export * from './version.js'
export * from './client-remotes.js'
export * from './llm-selection.js'
export * from './ctx-services.js'
export * from './events.js'
export * from './inject-manifest.js'
export * from './host-packages.js'
export * from './host-imports.js'
