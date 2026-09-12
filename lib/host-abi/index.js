/**
 * ARCH-004 host-abi 桶聚合（设计 §4.1/§4.2，EVO-019 B1 批）：仅 re-export
 * 七域导出面，零逻辑——消费者统一 import 入口（`import { … } from
 * '../host-abi/index.js'`）。依赖方向严格单向（§4.2 图）：消费者 → 桶 →
 * 域 → health.js（域间互不 import；本桶不加任何逻辑/常量，防上帝模块）。
 * 域内暂无消费者 = B2-B5 迁移批次的设计状态（各域文件头已声明归属批次）。
 * @module dsh-agent-router/host-abi
 */
export * from './health.js'
export * from './version.js'
export * from './client-remotes.js'
export * from './llm-selection.js'
export * from './ctx-services.js'
export * from './events.js'
export * from './inject-manifest.js'
