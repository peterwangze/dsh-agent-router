/**
 * dsh-router 浏览器侧包（`./client`，dual-face 下发）。
 *
 * 单页签「Agent 路由」（settings.section list slot）。三大分区采用一致的
 * 「标题 + 说明 + 卡片列表」风格（每个卡片默认折叠、点击展开）：
 * - 总开关（唯一不折叠的配置）；
 * - 多模态账号管理：标题 + 说明（API Key 登录 / OAuth 边界）+ 已添加
 *   账号卡片列表（展开显示模型列表与 Base URL）+ 末尾「+」登录卡片
 *   （ChatGPT/Claude/Grok/Gemini 预设 + 任意服务商 + Base URL）；
 * - 统计信息：标题 + 说明 + Agent 级与账号级（服务商）两级明细卡片
 *   （展开显示平均耗时、模型细分、分钟级 tokens 分布）+ 最近调用记录；
 * - 专业 Agent 卡片列表：标题 + 说明 + 每卡默认折叠摘要（名称/类型/
 *   生效模型/简要用量），点击展开配置与明细统计；末尾「+」添加新 agent
 *   （图片识别/图片生成/翻译/语音识别/视频生成/通用子 Agent 预设）。
 *
 * wire 面：固定 apiproxy（llm/credentials/白名单 settings）+ 本包 $mount
 * 的 `remote.router` namespace（catalog/stats/test/reset/config/save）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-router',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    let react = require('react')

    const el = react.createElement
    const { useState, useEffect, useCallback, useRef } = react

    // ── wire codecs（与宿主 lib/schemas.js 同形状的轻量校验器）──────────────
    function wireCheck(spec, value, path) {
      if (value === undefined || value === null) {
        if (spec.optional === true) return value
        throw new Error(`dsh-router wire: ${path} is required`)
      }
      if (spec.kind === 'string') {
        if (typeof value !== 'string') throw new Error(`dsh-router wire: ${path} must be a string`)
        return value
      }
      if (spec.kind === 'boolean') {
        if (typeof value !== 'boolean') throw new Error(`dsh-router wire: ${path} must be a boolean`)
        return value
      }
      if (spec.kind === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`dsh-router wire: ${path} must be a finite number`)
        return value
      }
      if (spec.kind === 'array') {
        if (!Array.isArray(value)) throw new Error(`dsh-router wire: ${path} must be an array`)
        if (spec.items) for (let index = 0; index < value.length; index++) {
          const next = wireCheck(spec.items, value[index], `${path}[${index}]`)
          if (next !== undefined) value[index] = next
        }
        return value
      }
      if (spec.kind === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`dsh-router wire: ${path} must be an object`)
        if (spec.properties) for (const [key, child] of Object.entries(spec.properties)) {
          const childSpec = child && child.spec ? child.spec : child
          const next = wireCheck(childSpec, value[key], path === '' ? key : `${path}.${key}`)
          if (next !== undefined) value[key] = next
        }
        return value
      }
      return value
    }
    function wireNode(spec) {
      return { parse: (value) => wireCheck(spec, value, ''), spec }
    }
    const wv = {
      object: (properties, optional) => wireNode({ kind: 'object', properties, optional: optional === true }),
      array: (items, optional) => wireNode({ kind: 'array', items: items && items.spec ? items.spec : items, optional: optional === true }),
      string: (optional) => wireNode({ kind: 'string', optional: optional === true }),
      boolean: (optional) => wireNode({ kind: 'boolean', optional: optional === true }),
      number: (optional) => wireNode({ kind: 'number', optional: optional === true }),
    }
    const wEmpty = wv.object({})
    const wAgentId = wv.object({ agentId: wv.string() })
    const wCatalog = wv.object({
      ok: wv.boolean(), enabled: wv.boolean(),
      defaults: wv.object({ provider: wv.string(), model: wv.string(), reasoningEffort: wv.string(true) }),
      agents: wv.array(wv.object({
        id: wv.string(), name: wv.string(), type: wv.string(), enabled: wv.boolean(),
        description: wv.string(), capabilities: wv.array(wv.string()),
        provider: wv.string(), model: wv.string(),
        effectiveProvider: wv.string(), effectiveModel: wv.string(), source: wv.string(),
        error: wv.string(true),
      })),
    })
    const wBucket = wv.object({
      minute: wv.string(), calls: wv.number(), errors: wv.number(),
      inputTokens: wv.number(), outputTokens: wv.number(),
    })
    const wStats = wv.object({
      ok: wv.boolean(), enabled: wv.boolean(),
      totals: wv.array(wv.object({
        agentId: wv.string(), name: wv.string(), provider: wv.string(), model: wv.string(),
        calls: wv.number(), errors: wv.number(), inputTokens: wv.number(), outputTokens: wv.number(),
        totalMs: wv.number(), lastAt: wv.number(true),
      })),
      recent: wv.array(wv.object({
        at: wv.number(), agentId: wv.string(), provider: wv.string(), model: wv.string(),
        ok: wv.boolean(), ms: wv.number(), inputTokens: wv.number(true), outputTokens: wv.number(true),
        error: wv.string(true),
      })),
      series: wv.array(wv.object({ agentId: wv.string(), buckets: wv.array(wBucket) })),
      accountTotals: wv.array(wv.object({
        provider: wv.string(),
        calls: wv.number(), errors: wv.number(), inputTokens: wv.number(), outputTokens: wv.number(),
        totalMs: wv.number(), lastAt: wv.number(true),
        models: wv.array(wv.object({
          model: wv.string(),
          calls: wv.number(), errors: wv.number(), inputTokens: wv.number(), outputTokens: wv.number(),
          totalMs: wv.number(), lastAt: wv.number(true),
        })),
      })),
      accountSeries: wv.array(wv.object({ provider: wv.string(), buckets: wv.array(wBucket) })),
    })
    const wTest = wv.object({
      ok: wv.boolean(), message: wv.string(), latencyMs: wv.number(true),
      usage: wv.object({
        inputTokens: wv.number(true), outputTokens: wv.number(true),
        cacheReadTokens: wv.number(true), cacheWriteTokens: wv.number(true), reasoningTokens: wv.number(true),
      }, true),
    })
    const wReset = wv.object({ ok: wv.boolean() })
    const wConfig = wv.object({
      ok: wv.boolean(), enabled: wv.boolean(), revision: wv.number(), writable: wv.boolean(),
      value: wv.object({}), user: wireNode({ kind: 'json', optional: true }),
    })
    const wSaveRequest = wv.object({
      ops: wv.array(wv.object({
        op: wv.string(), path: wv.array(wv.string()),
        value: wireNode({ kind: 'json', optional: true }),
      })),
      expectedRevision: wv.number(true),
    })
    const wSaveResult = wv.object({
      ok: wv.boolean(), revision: wv.number(),
      user: wireNode({ kind: 'json', optional: true }),
    })

    // ── Remote 契约（与宿主 lib/rpc.js 一致）────────────────────────────────
    function parameter(name, schema) {
      return { name, wire: name, source: 'json', codec: { mode: 'strict', typeSymbol: `dsh-router/types#${name}`, schema } }
    }
    function resultOf(name, schema) {
      return { mode: 'strict', typeSymbol: `dsh-router/types#${name}`, schema }
    }
    const ROUTER_REMOTE = {
      package: 'dsh-router',
      descriptors: [
        { id: 'dsh-router#router/catalog', service: 'router', namespace: 'router', method: 'catalog', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('CatalogResult', wCatalog) },
        { id: 'dsh-router#router/stats', service: 'router', namespace: 'router', method: 'stats', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('StatsResult', wStats) },
        { id: 'dsh-router#router/test', service: 'router', namespace: 'router', method: 'test', invocation: { kind: 'direct' }, parameters: [parameter('request', wAgentId)], result: resultOf('TestResult', wTest) },
        { id: 'dsh-router#router/reset', service: 'router', namespace: 'router', method: 'reset', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('ResetResult', wReset) },
        { id: 'dsh-router#router/config', service: 'router', namespace: 'router', method: 'config', invocation: { kind: 'direct' }, parameters: [parameter('request', wEmpty)], result: resultOf('ConfigResult', wConfig) },
        { id: 'dsh-router#router/save', service: 'router', namespace: 'router', method: 'save', invocation: { kind: 'direct' }, parameters: [parameter('request', wSaveRequest)], result: resultOf('SaveResult', wSaveResult) },
      ],
    }

    // ── 样式 ────────────────────────────────────────────────────────────────
    const CSS = `
.dshrouter-section{max-width:760px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}
.dshrouter-title{margin:0;font-size:16px;font-weight:500;line-height:24px}
.dshrouter-subtitle{margin:0;font-size:13px;font-weight:500;line-height:20px}
.dshrouter-intro{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-tertiary)}
.dshrouter-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}
.dshrouter-ok{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px;margin:0}
.dshrouter-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}
.dshrouter-card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.dshrouter-card.disabled{opacity:.55}
.dshrouter-card-head{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left}
.dshrouter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshrouter-head{display:flex;align-items:center;gap:8px}
.dshrouter-name{font-size:14px;font-weight:500;line-height:22px}
.dshrouter-id{color:var(--dsw-alias-label-secondary);font-size:12px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:0 6px}
.dshrouter-tag{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:0 6px}
.dshrouter-spacer{flex:1}
.dshrouter-chevron{color:var(--dsw-alias-label-tertiary);font-size:12px;flex:none}
.dshrouter-field{display:flex;flex-direction:column;gap:4px;min-width:200px;flex:1}
.dshrouter-field-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshrouter-input,.dshrouter-select,.dshrouter-textarea{box-sizing:border-box;width:100%;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-input,transparent);border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px 10px;outline:none}
.dshrouter-textarea{resize:vertical;min-height:56px}
.dshrouter-input:focus,.dshrouter-select:focus,.dshrouter-textarea:focus{border-color:var(--dsw-alias-button-primary-fill)}
.dshrouter-button{box-sizing:border-box;height:32px;font:inherit;font-size:13px;line-height:20px;cursor:pointer;border:none;border-radius:16px;padding:0 14px;display:inline-flex;align-items:center;gap:4px;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dshrouter-button:hover:not(:disabled){filter:brightness(1.08)}
.dshrouter-button:disabled{opacity:.5;cursor:not-allowed}
.dshrouter-button.ghost{background:transparent;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3)}
.dshrouter-button.danger{background:transparent;color:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary)}
.dshrouter-chip{box-sizing:border-box;height:28px;font:inherit;font-size:12px;line-height:18px;cursor:pointer;border:1px solid var(--dsw-alias-border-l3);border-radius:14px;padding:0 12px;display:inline-flex;align-items:center;gap:4px;background:transparent;color:var(--dsw-alias-label-primary)}
.dshrouter-chip:hover{border-color:var(--dsw-alias-button-primary-fill)}
.dshrouter-chip.active{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dshrouter-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.dshrouter-dot.ok{background:var(--dsw-alias-state-success-primary)}
.dshrouter-dot.bad{background:var(--dsw-alias-state-error-primary)}
.dshrouter-meta{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:18px}
.dshrouter-stats{border-top:1px solid var(--dsw-alias-border-l3);padding-top:8px;display:flex;flex-direction:column;gap:6px}
.dshrouter-table{width:100%;border-collapse:collapse;font-size:12px;line-height:18px}
.dshrouter-table th,.dshrouter-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l3)}
.dshrouter-table th{color:var(--dsw-alias-label-secondary);font-weight:500}
.dshrouter-table-row{cursor:pointer}
.dshrouter-table-row:hover td{background:var(--dsw-alias-bg-hover,rgba(255,255,255,.04))}
.dshrouter-bars{display:flex;align-items:flex-end;gap:2px;height:44px;padding:2px 0}
.dshrouter-bar{flex:1;min-width:2px;background:var(--dsw-alias-button-primary-fill);border-radius:1px 1px 0 0;opacity:.85}
.dshrouter-bar.err{background:var(--dsw-alias-state-error-primary)}
.dshrouter-modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4);z-index:1000}
.dshrouter-modal-body{background:var(--dsw-alias-bg-overlay,#1b1d24);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;min-width:360px;max-width:560px;max-height:70vh;overflow:auto;display:flex;flex-direction:column;gap:10px}
.dshrouter-modal-title{margin:0;font-size:14px;font-weight:500}
.dshrouter-candidate{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:13px}
.dshrouter-candidate:hover{background:var(--dsw-alias-bg-hover, rgba(255,255,255,.06))}
.dshrouter-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px}
.dshrouter-switch input{width:14px;height:14px}
.dshrouter-add{display:flex;align-items:center;justify-content:center;gap:6px;border:1px dashed var(--dsw-alias-border-l3);border-radius:12px;padding:14px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:13px}
.dshrouter-add:hover{border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary)}
.dshrouter-divider{border:none;border-top:1px solid var(--dsw-alias-border-l3);margin:4px 0}
`
    const CSS_ID = 'dsh-router'
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_ID) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-router'
      tag.dataset.pluginCss = CSS_ID
      tag.textContent = CSS
      document.head.appendChild(tag)
    }

    // ── 文案 ────────────────────────────────────────────────────────────────
    const zh = {
      nav: 'Agent 路由',
      title: '多模型路由',
      intro: '为不同能力配置专业 agent（图片识别、图片生成、翻译、语音识别等），每个 agent 可选独立服务商与模型；未配置时自动复用主 agent 模型。除总开关外，各分类卡片可展开进行具体配置。',
      masterSwitch: '启用多模型路由',
      masterHint: '关闭后 route_agent 工具将拒绝调用，提示段与统计暂停；组合层可通过禁用 dsh-router 行整体关闭插件。',
      accountTitle: '多模态账号管理',
      accountSummary: (n) => `已配置 ${n} 个账号`,
      accountIntro: '为常用多模态服务商登录 API Key（ChatGPT/Claude/Grok/Gemini 等订阅 plan 均可使用其官方 API Key）。',
      accountOAuth: '说明：harness 模型适配层目前仅支持 API Key 认证，官方 OAuth 登录流暂不在支持范围；登录后该服务商模型会立即出现在上方模型列表中，账号与模型的具体配置与「设置 → 模型」页同源。',
      accountPresets: '账号预设：',
      accountProvider: '服务商',
      accountKey: 'API Key',
      accountBaseUrl: 'Base URL（可选，覆盖默认端点，如代理网关）',
      accountLogin: '登录',
      accountDone: '已配置',
      accountMissing: '未配置',
      accountActive: '已激活',
      accountDormant: '未激活',
      accountList: '已配置账号',
      addAccount: '添加账号',
      accountModels: '个模型',
      statsTitle: '统计信息',
      statsIntro: '实时用量（每 2 秒刷新）：Agent 级与账号级（服务商）两级明细卡片，默认折叠，点击展开查看平均耗时、模型细分与分钟级 tokens 分布；统计保存在内存中，重启后清零。',
      statsSummary: (calls, errors) => `累计 ${calls} 次调用 / ${errors} 次失败`,
      statsCalls: '调用',
      statsErrors: '失败',
      statsTokens: 'tokens（入/出）',
      statsAvg: '平均耗时',
      statsLast: '最近调用',
      statsReset: '清空统计',
      statsDisabled: '多模型路由未启用',
      statsAgent: 'Agent',
      statsProvider: '服务商/模型',
      statsTime: '时间',
      statsStatus: '状态',
      statsOk: '成功',
      statsFail: '失败',
      statsRecent: '最近调用记录',
      statsSeries: 'tokens 分布（每分钟，近 90 分钟）',
      statsAgentLevel: 'Agent 级明细',
      statsAccountLevel: '账号级明细（服务商）',
      statsModelDetail: '模型细分',
      statsNoCalls: '暂无调用记录',
      agentsTitle: '专业 Agent',
      agentsIntro: '每个专业 Agent 用独立的服务商与模型处理特定能力（图片识别、生成、翻译、语音识别等）。卡片默认折叠，点击展开配置；服务商与模型留空时自动复用主 Agent 模型，点击末尾「+」添加。',
      addTitle: '添加专业 Agent',
      addPlaceholder: '新 agent id（如 vision / draw）',
      add: '添加',
      presets: '预设模板：',
      presetVision: '图片识别',
      presetImage: '图片生成',
      presetTranslate: '翻译',
      presetSpeech: '语音识别',
      presetVideo: '视频生成',
      presetGeneral: '通用子 Agent',
      fieldName: '名称',
      fieldType: '类型',
      typeChat: 'chat · 对话型专业调用',
      typeAgent: 'agent · 完整子 Agent 委派',
      typeImage: 'image · 图片生成',
      typeSpeech: 'speech · 语音识别（转写）',
      fieldDescription: '能力说明（主模型据此判断何时调用）',
      fieldCapabilities: '能力标签（逗号分隔，如 image, audio）',
      fieldProvider: '服务商（空 = 跟随主模型）',
      fieldModel: '模型（空 = 继承）',
      fieldDiscover: '发现模型',
      fieldReasoning: '推理强度（可选，如 high/max）',
      fieldTemperature: '温度',
      fieldMaxTokens: '最大输出 tokens（0 = 不限制）',
      fieldMaxRounds: '对话轮数上限',
      fieldSystemPrompt: 'System prompt（空 = 默认专业助手）',
      fieldEndpoint: '端点（image / speech 类型，空 = 官方端点）',
      fieldImageSize: '图片尺寸',
      fieldApiKeyEnv: '凭据引用（image / speech 类型，空 = OPENAI_API_KEY）',
      fieldTools: '工具白名单（agent 类型，逗号分隔；空 = 全部工具但禁用 route_agent）',
      enable: '启用',
      save: '保存',
      saved: '已保存',
      saving: '保存中…',
      delete: '删除',
      confirmDelete: '确认删除该 agent？',
      test: '测试',
      testing: '测试中…',
      effective: '生效模型：',
      sourceAgent: '本 agent 配置',
      sourceMain: '复用主模型',
      sourceProvider: '服务商默认',
      sourceUnknown: '未知',
      loadFailed: '加载失败',
      retry: '重试',
      conflict: '配置已被他人修改，请重新加载后编辑。',
      readOnly: '设置文档只读。',
      fetching: '查询中…',
      fetchTitle: '发现模型',
      fetchEmpty: '端点没有公布模型',
      adopt: '选用',
      close: '关闭',
      cancel: '取消',
      routeDisabled: '多模型路由总开关已关闭',
      noAgents: '尚未配置任何专业 agent。点击下方「+」添加。',
      testNone: '尚未测试',
      invalidId: 'id 仅允许小写字母、数字与连字符',
      duplicateId: '该 id 已存在',
      advanced: '高级设置',
      inherit: '继承',
      expand: '展开',
      collapse: '收起',
    }
    const en = {
      nav: 'Agent Routing',
      title: 'Multi-model Routing',
      intro: 'Configure specialist agents (vision, image generation, translation, speech recognition, …) with their own provider and model; unset values inherit the main agent model. Everything except the master switch lives in expandable category cards.',
      masterSwitch: 'Enable multi-model routing',
      masterHint: 'While disabled, route_agent refuses calls, the prompt section renders empty and stats pause. The whole native plugin can also be disabled by disabling the dsh-router composition row.',
      accountTitle: 'Multimodal Accounts',
      accountSummary: (n) => `${n} account(s) configured`,
      accountIntro: 'Sign in with an API key for common multimodal providers — ChatGPT/Claude/Grok/Gemini subscription plans all work through their official API keys.',
      accountOAuth: 'Note: the harness model layer currently supports API-key authentication only; official OAuth sign-in flows are not provided. Once signed in, the provider models appear in the lists above; accounts share the same storage as Settings → Models.',
      accountPresets: 'Presets:',
      accountProvider: 'Provider',
      accountKey: 'API Key',
      accountBaseUrl: 'Base URL (optional, overrides the default endpoint, e.g. a proxy gateway)',
      accountLogin: 'Sign in',
      accountDone: 'Configured',
      accountMissing: 'Missing',
      accountActive: 'Active',
      accountDormant: 'Dormant',
      accountList: 'Configured accounts',
      addAccount: 'Add Account',
      accountModels: 'models',
      statsTitle: 'Usage Statistics',
      statsIntro: 'Realtime usage (refreshed every 2s) at agent level and account (provider) level. Cards are collapsed by default — expand for average latency, model breakdown and per-minute token distribution; stats live in memory and reset on restart.',
      statsSummary: (calls, errors) => `${calls} calls / ${errors} errors`,
      statsCalls: 'Calls',
      statsErrors: 'Errors',
      statsTokens: 'tokens (in/out)',
      statsAvg: 'Avg latency',
      statsLast: 'Last call',
      statsReset: 'Clear stats',
      statsDisabled: 'Multi-model routing is disabled',
      statsAgent: 'Agent',
      statsProvider: 'Provider / model',
      statsTime: 'Time',
      statsStatus: 'Status',
      statsOk: 'OK',
      statsFail: 'Failed',
      statsRecent: 'Recent calls',
      statsSeries: 'Tokens per minute (last 90 min)',
      statsAgentLevel: 'Agent level',
      statsAccountLevel: 'Account level (provider)',
      statsModelDetail: 'Model breakdown',
      statsNoCalls: 'No calls recorded yet',
      agentsTitle: 'Specialist Agents',
      agentsIntro: 'Each specialist agent handles one capability (vision, image generation, translation, speech recognition, …) with its own provider and model. Cards are collapsed by default — click to expand and configure; unset provider/model inherits the main agent model; use "+" at the end to add one.',
      addTitle: 'Add Specialist Agent',
      addPlaceholder: 'New agent id (e.g. vision / draw)',
      add: 'Add',
      presets: 'Templates:',
      presetVision: 'Vision',
      presetImage: 'Image Generation',
      presetTranslate: 'Translation',
      presetSpeech: 'Speech Recognition',
      presetVideo: 'Video Generation',
      presetGeneral: 'General Subagent',
      fieldName: 'Name',
      fieldType: 'Type',
      typeChat: 'chat · specialist call',
      typeAgent: 'agent · full subagent delegation',
      typeImage: 'image · image generation',
      typeSpeech: 'speech · audio transcription',
      fieldDescription: 'Capability description (guides the main model)',
      fieldCapabilities: 'Capability tags (comma separated, e.g. image, audio)',
      fieldProvider: 'Provider (empty = inherit main model)',
      fieldModel: 'Model (empty = inherit)',
      fieldDiscover: 'Discover models',
      fieldReasoning: 'Reasoning effort (optional, e.g. high/max)',
      fieldTemperature: 'Temperature',
      fieldMaxTokens: 'Max output tokens (0 = unset)',
      fieldMaxRounds: 'Max rounds',
      fieldSystemPrompt: 'System prompt (empty = default specialist)',
      fieldEndpoint: 'Endpoint (image / speech types; empty = official endpoint)',
      fieldImageSize: 'Image size',
      fieldApiKeyEnv: 'Credential ref (image / speech types; empty = OPENAI_API_KEY)',
      fieldTools: 'Tool allow-list (agent type, comma separated; empty = all tools except route_agent)',
      enable: 'Enabled',
      save: 'Save',
      saved: 'Saved',
      saving: 'Saving…',
      delete: 'Delete',
      confirmDelete: 'Delete this agent?',
      test: 'Test',
      testing: 'Testing…',
      effective: 'Effective model: ',
      sourceAgent: 'agent config',
      sourceMain: 'inherits main model',
      sourceProvider: 'provider default',
      sourceUnknown: 'unknown',
      loadFailed: 'Load failed',
      retry: 'Retry',
      conflict: 'Settings changed elsewhere; reload and retry.',
      readOnly: 'The settings document is read-only.',
      fetching: 'Querying…',
      fetchTitle: 'Discover models',
      fetchEmpty: 'The endpoint reported no models',
      adopt: 'Adopt',
      close: 'Close',
      cancel: 'Cancel',
      routeDisabled: 'Multi-model routing master switch is off',
      noAgents: 'No specialist agents yet. Click "+" below to add one.',
      testNone: 'Not tested',
      invalidId: 'id allows lowercase letters, digits and hyphens only',
      duplicateId: 'That id already exists',
      advanced: 'Advanced',
      inherit: 'Inherit',
      expand: 'Expand',
      collapse: 'Collapse',
    }

    // ── 工具函数 ────────────────────────────────────────────────────────────
    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }
    function deriveKeyRef(provider) {
      return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
    }
    const ID_PATTERN = /^[a-z][a-z0-9-]*$/
    function timeOf(at) {
      return at ? new Date(at).toLocaleTimeString() : '—'
    }
    function fmtMs(ms) {
      return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
    }
    function fmtTokens(n) {
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
      return String(n)
    }

    /** 从 describe 结果中取一个 namespace view。 */
    function viewOf(namespaces, ns) {
      return namespaces.find((view) => view.ns === ns)
    }

    /** 账号（服务商）预设。 */
    const ACCOUNT_PRESETS = [
      { provider: 'openai', label: 'ChatGPT · OpenAI' },
      { provider: 'anthropic', label: 'Claude · Anthropic' },
      { provider: 'xai', label: 'Grok · xAI' },
      { provider: 'google', label: 'Gemini · Google' },
    ]

    /** 专业 agent 预设模板。 */
    const AGENT_PRESETS = [
      { id: 'vision', key: 'presetVision', draft: { name: '视觉识别', type: 'chat', description: '识别与描述图片内容（OCR、界面截图、图表解读等）', capabilities: ['image'] } },
      { id: 'draw', key: 'presetImage', draft: { name: '图片生成', type: 'image', provider: 'openai', model: 'dall-e-3', description: '根据文字描述生成图片', capabilities: ['image'] } },
      { id: 'translate', key: 'presetTranslate', draft: { name: '翻译', type: 'chat', description: '多语言互译与润色', capabilities: ['translate'] } },
      { id: 'voice', key: 'presetSpeech', draft: { name: '语音识别', type: 'speech', provider: 'openai', model: 'whisper-1', description: '把音频文件转写为文字（route_agent 经 filePath 指定工作区文件）', capabilities: ['audio'] } },
      { id: 'video', key: 'presetVideo', draft: { name: '视频生成', type: 'chat', description: '视频脚本、字幕与内容生成（无通用视频生成 API：请在高级设置中配置兼容网关与模型）', capabilities: ['video'] } },
      { id: 'assistant', key: 'presetGeneral', draft: { name: '通用子 Agent', type: 'agent', description: '把复杂子任务交给独立模型的完整 agent', capabilities: [] } },
    ]

    /** 分钟级 tokens 柱状图。 */
    function BarChart(props) {
      const { buckets, height = 30, title } = props
      const shown = (buckets ?? []).slice(-48)
      const max = Math.max(1, ...shown.map((bucket) => bucket.inputTokens + bucket.outputTokens))
      return el('div', { className: 'dshrouter-bars', title: title || undefined },
        ...shown.map((bucket) => el('div', {
          key: bucket.minute,
          className: 'dshrouter-bar' + (bucket.errors > 0 && bucket.calls === bucket.errors ? ' err' : ''),
          style: { height: `${Math.max(2, Math.round(((bucket.inputTokens + bucket.outputTokens) / max) * height))}px` },
          title: `${bucket.minute} · in ${bucket.inputTokens} / out ${bucket.outputTokens} · ${bucket.errors} err`,
        })))
    }

    /** 折叠式统计卡片（Agent 级与账号级共用的摘要+详情形态）。 */
    function StatsRowCard(props) {
      const { title, badge, meta, calls, errors, inputTokens, outputTokens, totalMs, lastAt, buckets, expanded, t, onToggle } = props
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-name' }, title),
          badge ? el('span', { className: 'dshrouter-id' }, badge) : null,
          meta ? el('span', { className: 'dshrouter-tag' }, meta) : null,
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')} ${calls} · ${t('statsErrors')} ${errors} · ${fmtTokens(inputTokens)}/${fmtTokens(outputTokens)}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${calls}`),
            el('span', { className: 'dshrouter-meta', style: errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${errors}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${fmtTokens(inputTokens)} / ${fmtTokens(outputTokens)}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsAvg')}: ${calls > 0 ? fmtMs(totalMs / calls) : '—'}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsLast')}: ${timeOf(lastAt)}`)),
          (buckets ?? []).length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : el('p', { className: 'dshrouter-hint' }, t('statsNoCalls'))) : null)
    }

    /** 账号级统计卡片：摘要 + 模型细分表 + 账号级柱状图。 */
    function AccountStatsCard(props) {
      const { provider, displayName, active, calls, errors, inputTokens, outputTokens, totalMs, lastAt, models, buckets, expanded, t, onToggle } = props
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          active ? el('span', { className: 'dshrouter-dot ok', title: t('accountActive') }) : el('span', { className: 'dshrouter-dot bad', title: t('accountDormant') }),
          el('span', { className: 'dshrouter-name' }, displayName),
          el('span', { className: 'dshrouter-id' }, provider),
          active ? el('span', { className: 'dshrouter-tag' }, t('accountActive')) : el('span', { className: 'dshrouter-tag' }, t('accountDormant')),
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')} ${calls} · ${t('statsErrors')} ${errors} · ${fmtTokens(inputTokens)}/${fmtTokens(outputTokens)}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${calls}`),
            el('span', { className: 'dshrouter-meta', style: errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${errors}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${fmtTokens(inputTokens)} / ${fmtTokens(outputTokens)}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsAvg')}: ${calls > 0 ? fmtMs(totalMs / calls) : '—'}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsLast')}: ${timeOf(lastAt)}`)),
          el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-meta' }, t('statsModelDetail'))),
          models.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('statsNoCalls')) : el('table', { className: 'dshrouter-table' },
            el('thead', null, el('tr', null,
              el('th', null, t('fieldModel')), el('th', null, t('statsCalls')), el('th', null, t('statsErrors')), el('th', null, t('statsTokens')), el('th', null, t('statsAvg')), el('th', null, t('statsLast')))),
            el('tbody', null, ...models.map((modelTotal) => el('tr', { key: modelTotal.model },
              el('td', null, modelTotal.model),
              el('td', null, modelTotal.calls),
              el('td', null, modelTotal.errors > 0 ? el('span', { className: 'dshrouter-error' }, modelTotal.errors) : modelTotal.errors),
              el('td', null, `${fmtTokens(modelTotal.inputTokens)} / ${fmtTokens(modelTotal.outputTokens)}`),
              el('td', null, modelTotal.calls > 0 ? fmtMs(modelTotal.totalMs / modelTotal.calls) : '—'),
              el('td', null, timeOf(modelTotal.lastAt)))))),
          buckets.length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : null) : null)
    }

    /** 已配置账号卡片：折叠摘要 + 模型列表（与专业 Agent 卡片同形态）。 */
    function AccountCard(props) {
      const { provider, displayName, active, models, profile, total, buckets, expanded, t, onToggle } = props
      return el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          active ? el('span', { className: 'dshrouter-dot ok', title: t('accountDone') }) : el('span', { className: 'dshrouter-dot bad', title: t('accountDormant') }),
          el('span', { className: 'dshrouter-name' }, displayName),
          el('span', { className: 'dshrouter-id' }, provider),
          active ? el('span', { className: 'dshrouter-tag' }, t('accountActive')) : el('span', { className: 'dshrouter-tag' }, t('accountDormant')),
          el('span', { className: 'dshrouter-meta' }, `${models.length} ${t('accountModels')} · ${t('statsCalls')} ${total ? total.calls : 0} · ${total ? fmtTokens(total.inputTokens) : 0}/${total ? fmtTokens(total.outputTokens) : 0}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')),
        expanded ? el('div', { className: 'dshrouter-stats' },
          profile && profile.baseURL ? el('p', { className: 'dshrouter-meta' }, `${t('accountBaseUrl')}: ${profile.baseURL}`) : null,
          el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-meta' }, t('accountModels'))),
          models.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : el('table', { className: 'dshrouter-table' },
            el('thead', null, el('tr', null, el('th', null, t('fieldModel')), el('th', null, t('fieldName')), el('th', null, 'input'))),
            el('tbody', null, ...models.map((model) => el('tr', { key: model.id },
              el('td', null, model.id),
              el('td', null, model.name || '—'),
              el('td', null, (model.inputModalities ?? []).join(', ') || '—'))))),
          (buckets ?? []).length > 0 ? el(BarChart, { buckets, title: t('statsSeries') }) : null) : null)
    }

    /** 账号列表末尾的「+」登录卡片。 */
    function AddAccountCard(props) {
      const { t, adding, setAdding, account, setAccount, providers, writable, busy, failure, onLogin, accountProvider } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('addAccount')))
      }
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('addAccount')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => { setAdding(false); setAccount((current) => ({ ...current, key: '', failure: null })) } }, t('cancel'))),
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, t('accountPresets')),
          ...ACCOUNT_PRESETS.map((preset) => el('button', {
            type: 'button', key: preset.provider,
            className: 'dshrouter-chip' + (account.provider === preset.provider ? ' active' : ''),
            onClick: () => setAccount((current) => ({ ...current, provider: preset.provider, baseUrl: '' })),
          }, preset.label))),
        el('div', { className: 'dshrouter-row' },
          el('select', {
            className: 'dshrouter-select', style: { flex: '0 0 240px' },
            value: account.provider,
            onChange: (event) => setAccount((current) => ({ ...current, provider: event.target.value, baseUrl: '' })),
          }, providers.filter((entry) => entry.settingsNs === 'llm-pi-ai').map((entry) =>
            el('option', { value: entry.provider, key: entry.provider }, `${entry.displayName} (${entry.provider})`))),
          el('input', {
            className: 'dshrouter-input', type: 'password', autoComplete: 'off',
            placeholder: t('accountKey'), 'aria-label': t('accountKey'),
            value: account.key, onChange: (event) => setAccount((current) => ({ ...current, key: event.target.value })),
          }),
          el('input', {
            className: 'dshrouter-input', type: 'text',
            placeholder: t('accountBaseUrl'), 'aria-label': t('accountBaseUrl'),
            value: account.baseUrl, onChange: (event) => setAccount((current) => ({ ...current, baseUrl: event.target.value })),
          }),
          el('button', {
            type: 'button', className: 'dshrouter-button',
            disabled: busy || !account.key.trim() || !writable,
            onClick: onLogin,
          }, busy ? t('saving') : t('accountLogin'))),
        accountProvider ? el('p', { className: 'dshrouter-meta' }, `${accountProvider.provider} · ${accountProvider.active ? t('accountActive') : t('accountDormant')}`) : null,
        failure ? el('p', { className: 'dshrouter-error' }, failure) : null)
    }

    // ── 页面 ────────────────────────────────────────────────────────────────
    function AgentsPage(props) {
      const { api, remote, remoteReady, t, $on } = props
      const [ready, setReady] = useState(false)
      const [state, setState] = useState({ status: 'idle' })
      const [drafts, setDrafts] = useState({})
      const [newId, setNewId] = useState('')
      const [adding, setAdding] = useState(false)
      const [busy, setBusy] = useState({})
      const [notice, setNotice] = useState({})
      const [testResults, setTestResults] = useState({})
      const [discover, setDiscover] = useState(null)
      const [account, setAccount] = useState({ provider: 'openai', baseUrl: '', key: '', busy: false, failure: null, state: null })
      const [stats, setStats] = useState(null)
      const [expandedAgents, setExpandedAgents] = useState({})
      const [expandedAccounts, setExpandedAccounts] = useState({})
      const [addingAccount, setAddingAccount] = useState(false)
      const [expandedStats, setExpandedStats] = useState({})
      const loadRef = useRef(() => {})

      const load = useCallback(async () => {
        const routerRemote = remote()
        if (!routerRemote) {
          setState((current) => ({ ...current, status: 'error', error: t('loadFailed') + ': remote.router 未就绪（宿主行 dsh-router 未挂载或 Remote 挂载失败）' }))
          return
        }
        let configResponse, providersResponse, catalogResponse, settingsResponse
        try {
          ;[configResponse, providersResponse, catalogResponse, settingsResponse] = await Promise.all([
            routerRemote.config({}),
            api.llm.providers({}),
            routerRemote.catalog({}),
            api.settings.describe({}),
          ])
        } catch (error) {
          setState((current) => ({ ...current, status: 'error', error: messageOf(error) }))
          return
        }
        if (!configResponse.ok) { setState((current) => ({ ...current, status: 'error', error: configResponse.error.message })); return }
        const config = configResponse.value
        const providers = providersResponse.result.ok ? providersResponse.result.value.providers : []
        const catalog = catalogResponse.ok ? catalogResponse.value : null
        const llmPiAi = settingsResponse.result.ok ? viewOf(settingsResponse.result.value.namespaces, 'llm-pi-ai') : null
        setState({
          status: 'ready',
          error: null,
          writable: config.writable !== false,
          revision: config.revision,
          value: config.value ?? null,
          user: config.user ?? null,
          providers,
          catalog,
          models: [],
          modelsFailure: null,
          llmPiAi,
        })
        const groupResponse = await api.llm.models({})
        if (groupResponse.result.ok) {
          setState((current) => ({ ...current, models: groupResponse.result.value.groups ?? [], modelsFailure: groupResponse.result.value.failures ?? [] }))
        }
      }, [api, remote, t])

      useEffect(() => {
        loadRef.current = load
      }, [load])

      useEffect(() => {
        let alive = true
        remoteReady.then(() => { if (alive) setReady(true) }, () => { if (alive) setReady(true) })
        return () => { alive = false }
      }, [remoteReady])

      useEffect(() => {
        if (!ready) return
        load()
        const offSettings = $on('settings/document-updated', (ns) => {
          if (ns === 'router' || ns === 'llm-pi-ai' || ns === 'llm-deepseek' || ns === 'agent-default-model') loadRef.current()
        })
        const offCred = $on('credentials/updated', () => loadRef.current())
        const offLlm = $on('llm/adapters-updated', () => loadRef.current())
        return () => { offSettings(); offCred(); offLlm() }
      }, [ready, $on, load])

      // 实时用量轮询（页签打开期间每 2 秒刷新一次）
      useEffect(() => {
        if (!ready) return
        let alive = true
        const poll = () => {
          const routerRemote = remote()
          if (!routerRemote) return
          routerRemote.stats({}).then((response) => {
            if (alive && response.ok) setStats(response.value)
          }, () => undefined)
        }
        poll()
        const timer = window.setInterval(poll, 2000)
        return () => { alive = false; window.clearInterval(timer) }
      }, [ready, remote])

      const clearStats = async () => {
        const routerRemote = remote()
        if (!routerRemote) return
        await routerRemote.reset({})
        const response = await routerRemote.stats({})
        if (response.ok) setStats(response.value)
      }

      const mutate = useCallback(async (ops) => {
        const routerRemote = remote()
        if (!routerRemote) return { ok: false, message: t('loadFailed') }
        const response = await routerRemote.save({
          ops,
          ...(state.revision !== undefined ? { expectedRevision: state.revision } : {}),
        })
        if (!response.ok) {
          const detail = response.error && response.error.message ? response.error.message : 'save failed'
          return { ok: false, message: /conflict|moved|revision/i.test(detail) ? t('conflict') : detail }
        }
        setState((current) => ({ ...current, revision: response.value.revision }))
        await load()
        return { ok: true }
      }, [remote, state.revision, load, t])

      const agentValue = (id) => {
        const v = state.value
        return v && v.agents ? v.agents[id] : null
      }
      const defaultDraft = () => ({
        name: '', type: 'chat', enabled: true, description: '', capabilities: [],
        provider: '', model: '', reasoningEffort: '', temperature: 0, maxTokens: 0,
        maxRounds: 1, systemPrompt: '', endpoint: '', imageSize: '1024x1024', apiKeyEnv: '', tools: [],
      })
      const draftOf = (id) => drafts[id] ?? agentValue(id) ?? defaultDraft()
      const setDraft = (id, patch) => setDrafts((current) => ({ ...current, [id]: { ...draftOf(id), ...patch } }))
      const setDraftField = (id, key, value) => setDraft(id, { [key]: value })

      const saveAgent = async (id, isNew) => {
        if (isNew && (!ID_PATTERN.test(id) || id === '')) return
        if (isNew && state.value?.agents?.[id]) return
        setBusy((current) => ({ ...current, [id]: true }))
        const draft = draftOf(id)
        const outcome = await mutate([{ op: 'set', path: ['agents', id], value: draft }])
        setBusy((current) => ({ ...current, [id]: false }))
        if (outcome.ok) setNotice((current) => ({ ...current, [id]: t('saved') }))
        else setNotice((current) => ({ ...current, [id]: outcome.message }))
        if (isNew) { setNewId(''); setAdding(false) }
      }

      const deleteAgent = async (id) => {
        if (!window.confirm(t('confirmDelete'))) return
        setBusy((current) => ({ ...current, [id]: true }))
        await mutate([{ op: 'unset', path: ['agents', id] }])
        setBusy((current) => ({ ...current, [id]: false }))
        setDrafts((current) => { const next = { ...current }; delete next[id]; return next })
      }

      const toggleMaster = async () => {
        await mutate([{ op: 'set', path: ['enabled'], value: !(state.value && state.value.enabled !== false) }])
      }

      const runTest = async (id) => {
        const routerRemote = remote()
        if (!routerRemote) return
        setTestResults((current) => ({ ...current, [id]: { busy: true } }))
        const response = await routerRemote.test({ agentId: id })
        setTestResults((current) => ({ ...current, [id]: { busy: false, ok: response.ok, message: response.ok ? response.value.message : response.error.message } }))
      }

      const doLogin = async () => {
        const provider = account.provider
        const key = account.key.trim()
        if (!key) return
        setAccount((current) => ({ ...current, busy: true, failure: null }))
        try {
          const ref = deriveKeyRef(provider)
          const settingsResponse = await api.settings.describe({})
          if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
          const namespaces = settingsResponse.result.value.namespaces
          const llmView = viewOf(namespaces, 'llm-pi-ai')
          if (!llmView) throw new Error('llm-pi-ai namespace 不可用：请确认该适配器已挂载')
          const existing = llmView.value && llmView.value.providers ? llmView.value.providers[provider] : undefined
          if (existing === undefined) {
            const profile = { apiKeyEnv: ref, ...(account.baseUrl.trim() ? { baseURL: account.baseUrl.trim() } : {}) }
            const response = await api.settings.mutate({
              ns: 'llm-pi-ai',
              ops: [{ op: 'set', path: ['providers', provider], value: profile }],
            })
            if (!response.result.ok) throw new Error(response.result.error.message)
          }
          const stored = await api.credentials.set({ ref, value: key })
          if (!stored.result.ok) throw new Error(stored.result.error.message)
          setAccount((current) => ({ ...current, busy: false, key: '', state: { configured: true } }))
          await load()
        } catch (error) {
          setAccount((current) => ({ ...current, busy: false, failure: messageOf(error) }))
        }
      }

      useEffect(() => {
        if (state.status !== 'ready') return
        let alive = true
        const ref = deriveKeyRef(account.provider)
        api.credentials.describe({ refs: [ref] }).then((response) => {
          if (alive && response.result.ok) setAccount((current) => ({ ...current, state: response.result.value.credentials[ref] ?? null }))
        }, () => undefined)
        return () => { alive = false }
      }, [state.status, account.provider, api])

      if (state.status === 'idle') return el('div', { className: 'dshrouter-section' }, el('p', { className: 'dshrouter-intro' }, '…'))
      if (state.status === 'error') {
        return el('div', { className: 'dshrouter-section' },
          el('p', { className: 'dshrouter-error' }, `${t('loadFailed')}: ${state.error}`),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => load() }, t('retry')))
      }
      const value = state.value ?? { enabled: true, agents: {} }
      const enabled = value.enabled !== false
      const agentIds = Object.keys(value.agents ?? {}).sort()
      const catalogById = new Map((state.catalog?.agents ?? []).map((entry) => [entry.id, entry]))
      const providers = state.providers ?? []
      const providerEntry = (provider) => providers.find((entry) => entry.provider === provider)
      const accountProvider = providerEntry(account.provider)
      const idTaken = agentIds.includes(newId.trim())
      const idInvalid = newId.trim() !== '' && !ID_PATTERN.test(newId.trim())

      // 统计归一视图
      const statsTotals = stats ? new Map((stats.totals ?? []).map((entry) => [entry.agentId, entry])) : new Map()
      const statsSeries = stats ? new Map((stats.series ?? []).map((entry) => [entry.agentId, entry.buckets ?? []])) : new Map()
      const accountTotalsById = stats ? new Map((stats.accountTotals ?? []).map((entry) => [entry.provider, entry])) : new Map()
      const accountSeriesById = stats ? new Map((stats.accountSeries ?? []).map((entry) => [entry.provider, entry.buckets ?? []])) : new Map()
      const recentCalls = stats ? stats.recent ?? [] : []
      const sumAll = (stats ? stats.totals ?? [] : []).reduce(
        (acc, entry) => ({ calls: acc.calls + entry.calls, errors: acc.errors + entry.errors, inTokens: acc.inTokens + entry.inputTokens, outTokens: acc.outTokens + entry.outputTokens }),
        { calls: 0, errors: 0, inTokens: 0, outTokens: 0 })

      const addFromTemplate = (template) => {
        let id = template.id
        let n = 2
        while (agentIds.includes(id)) { id = `${template.id}-${n}`; n++ }
        setNewId(id)
        setDraft(id, { ...defaultDraft(), ...template.draft })
      }
      const toggleExpanded = (id) => setExpandedAgents((current) => ({ ...current, [id]: !current[id] }))
      const toggleAccount = (provider) => setExpandedAccounts((current) => ({ ...current, [provider]: !current[provider] }))
      const toggleStatCard = (key) => setExpandedStats((current) => ({ ...current, [key]: !current[key] }))

      // 已添加的账号（llm-pi-ai 目录中已激活的路由 = 已配置 profile）。
      const addedAccounts = providers
        .filter((entry) => entry.settingsNs === 'llm-pi-ai' && entry.active === true)
        .map((entry) => entry.provider)
      for (const total of stats ? stats.accountTotals ?? [] : []) {
        if (!addedAccounts.includes(total.provider)) addedAccounts.push(total.provider)
      }
      addedAccounts.sort()
      const accountModelsOf = (provider) => {
        const group = (state.models ?? []).find((entry) => entry.provider === provider)
        return group ? group.models ?? [] : []
      }
      const accountProfileOf = (provider) => {
        const profiles = state.llmPiAi && state.llmPiAi.value && state.llmPiAi.value.providers ? state.llmPiAi.value.providers : null
        const profile = profiles ? profiles[provider] : undefined
        return profile && typeof profile === 'object' ? profile : null
      }
      // 统计卡片用的账号行（激活账号 + 有调用的账号）。
      const statsAccountRows = []
      for (const entry of providers) {
        if (entry.settingsNs !== 'llm-pi-ai') continue
        const total = accountTotalsById.get(entry.provider)
        if (entry.active !== true && !total) continue
        statsAccountRows.push({
          provider: entry.provider,
          displayName: entry.displayName,
          active: entry.active === true,
          calls: total ? total.calls : 0,
          errors: total ? total.errors : 0,
          inputTokens: total ? total.inputTokens : 0,
          outputTokens: total ? total.outputTokens : 0,
          totalMs: total ? total.totalMs : 0,
          lastAt: total ? total.lastAt : undefined,
        })
      }
      for (const total of stats ? stats.accountTotals ?? [] : []) {
        if (statsAccountRows.some((row) => row.provider === total.provider)) continue
        statsAccountRows.push({
          provider: total.provider,
          displayName: total.provider,
          active: true,
          calls: total.calls,
          errors: total.errors,
          inputTokens: total.inputTokens,
          outputTokens: total.outputTokens,
          totalMs: total.totalMs,
          lastAt: total.lastAt || undefined,
        })
      }
      statsAccountRows.sort((a, b) => (a.provider < b.provider ? -1 : 1))

      return el('section', { className: 'dshrouter-section', 'aria-label': t('title') },
        el('h2', { className: 'dshrouter-title' }, t('title')),
        el('p', { className: 'dshrouter-intro' }, t('intro')),
        // ── 总开关（唯一不折叠）──────────────────────────────────────────
        el('div', { className: 'dshrouter-card' },
          el('label', { className: 'dshrouter-switch' },
            el('input', { type: 'checkbox', checked: enabled, disabled: !state.writable, onChange: toggleMaster }),
            t('masterSwitch')),
          el('p', { className: 'dshrouter-hint' }, t('masterHint')),
          !enabled ? el('p', { className: 'dshrouter-error' }, t('routeDisabled')) : null),
        // ── 多模态账号管理（标题 + 说明 + 卡片列表 + 末尾「+」）──────────
        el('div', { className: 'dshrouter-head' },
          el('h3', { className: 'dshrouter-title' }, t('accountTitle')),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-meta' }, t('accountSummary')(addedAccounts.length))),
        el('p', { className: 'dshrouter-intro' }, t('accountIntro')),
        el('p', { className: 'dshrouter-hint' }, t('accountOAuth')),
        addedAccounts.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('accountMissing')) : null,
        ...addedAccounts.map((provider) => {
          const entry = providerEntry(provider)
          const total = accountTotalsById.get(provider)
          return el(AccountCard, {
            key: provider,
            provider,
            displayName: entry ? entry.displayName : provider,
            active: entry ? entry.active === true : true,
            models: accountModelsOf(provider),
            profile: accountProfileOf(provider),
            total,
            buckets: accountSeriesById.get(provider) ?? [],
            expanded: expandedAccounts[provider] === true,
            t,
            onToggle: () => toggleAccount(provider),
          })
        }),
        el(AddAccountCard, {
          t, adding: addingAccount, setAdding: setAddingAccount,
          account, setAccount, providers, writable: state.writable, busy: account.busy,
          failure: account.failure, accountProvider,
          onLogin: doLogin,
        }),
        // ── 统计信息（标题 + 说明 + Agent 级/账号级卡片列表）────────────
        el('div', { className: 'dshrouter-head' },
          el('h3', { className: 'dshrouter-title' }, t('statsTitle')),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-meta' }, t('statsSummary')(sumAll.calls, sumAll.errors)),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: clearStats }, t('statsReset'))),
        el('p', { className: 'dshrouter-intro' }, t('statsIntro')),
        stats && stats.enabled === false ? el('p', { className: 'dshrouter-error' }, t('statsDisabled')) : null,
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${sumAll.calls}`),
          el('span', { className: 'dshrouter-meta', style: sumAll.errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${sumAll.errors}`),
          el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${fmtTokens(sumAll.inTokens)} / ${fmtTokens(sumAll.outTokens)}`)),
        // Agent 级明细卡片
        el('div', { className: 'dshrouter-head' }, el('span', { className: 'dshrouter-subtitle' }, t('statsAgentLevel'))),
        agentIds.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('statsNoCalls')) : null,
        ...agentIds.map((id) => {
          const total = statsTotals.get(id)
          const statKey = `agent:${id}`
          return el(StatsRowCard, {
            key: statKey,
            title: total ? total.name : id,
            badge: id,
            meta: `${total ? total.provider : '—'}/${total ? total.model : '—'}`,
            calls: total ? total.calls : 0,
            errors: total ? total.errors : 0,
            inputTokens: total ? total.inputTokens : 0,
            outputTokens: total ? total.outputTokens : 0,
            totalMs: total ? total.totalMs : 0,
            lastAt: total ? total.lastAt : undefined,
            buckets: statsSeries.get(id) ?? [],
            expanded: expandedStats[statKey] === true,
            t,
            onToggle: () => toggleStatCard(statKey),
          })
        }),
        // 账号级明细卡片（激活账号）
        el('div', { className: 'dshrouter-head', style: { marginTop: 8 } }, el('span', { className: 'dshrouter-subtitle' }, t('statsAccountLevel'))),
        statsAccountRows.length === 0 ? el('p', { className: 'dshrouter-hint' }, t('statsNoCalls')) : null,
        ...statsAccountRows.map((row) => {
          const statKey = `acct:${row.provider}`
          const accountTotal = accountTotalsById.get(row.provider)
          const models = accountTotal && accountTotal.models ? accountTotal.models : []
          const buckets = accountSeriesById.get(row.provider) ?? []
          return el(AccountStatsCard, {
            key: statKey,
            provider: row.provider,
            displayName: row.displayName,
            active: row.active,
            calls: row.calls,
            errors: row.errors,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            totalMs: row.totalMs,
            lastAt: row.lastAt,
            models,
            buckets,
            expanded: expandedStats[statKey] === true,
            t,
            onToggle: () => toggleStatCard(statKey),
          })
        }),
        recentCalls.length > 0 ? el('details', null,
          el('summary', { className: 'dshrouter-meta' }, `${t('statsRecent')}（${recentCalls.length}）`),
          el('table', { className: 'dshrouter-table' },
            el('thead', null, el('tr', null,
              el('th', null, t('statsTime')), el('th', null, t('statsAgent')), el('th', null, t('statsProvider')), el('th', null, t('statsStatus')), el('th', null, t('statsAvg')))),
            el('tbody', null, ...recentCalls.slice(0, 20).map((row, index) => {
              const status = row.ok ? t('statsOk') : el('span', { className: 'dshrouter-error' }, row.error ? `${t('statsFail')}: ${row.error.slice(0, 60)}` : t('statsFail'))
              return el('tr', { key: index },
                el('td', null, timeOf(row.at)),
                el('td', null, row.agentId),
                el('td', null, `${row.provider || '?'}/${row.model || '?'}`),
                el('td', null, status),
                el('td', null, `${fmtMs(row.ms)}${row.outputTokens ? ` · ${fmtTokens(row.outputTokens)} out` : ''}`))
            })))) : null,
        // ── 专业 Agent 卡片列表（标题 + 说明 + 卡片 + 末尾「+」）──────────
        el('div', { className: 'dshrouter-head' }, el('h3', { className: 'dshrouter-title' }, t('agentsTitle'))),
        el('p', { className: 'dshrouter-intro' }, t('agentsIntro')),
        agentIds.length === 0 ? el('p', { className: 'dshrouter-intro' }, t('noAgents')) : null,
        ...agentIds.map((id) => {
          const draft = draftOf(id)
          const catalog = catalogById.get(id)
          const testResult = testResults[id]
          return el(AgentCard, {
            key: id, id, draft, t, writable: state.writable, busy: !!busy[id], notice: notice[id],
            providers, models: state.models ?? [], catalog, testResult,
            stat: statsTotals.get(id) ?? null,
            buckets: statsSeries.get(id) ?? [],
            expanded: expandedAgents[id] === true,
            onToggle: () => toggleExpanded(id),
            onField: (key, fieldValue) => setDraftField(id, key, fieldValue),
            onSave: () => saveAgent(id, false),
            onDelete: () => deleteAgent(id),
            onTest: () => runTest(id),
            onDiscover: (provider) => setDiscover({ id, provider }),
          })
        }),
        el(AddAgentCard, {
          t, adding, setAdding, newId, setNewId, idTaken, idInvalid,
          writable: state.writable,
          agentIds,
          onSave: () => saveAgent(newId.trim(), true),
          onTemplate: addFromTemplate,
        }),
        // 发现模型弹窗
        discover ? el(DiscoverModal, {
          api, t, provider: discover.provider,
          providers,
          onClose: () => setDiscover(null),
          onAdopt: (model) => { setDraftField(discover.id, 'model', model); setDiscover(null) },
        }) : null,
      )
    }

    function AgentCard(props) {
      const { id, draft, t, writable, busy, notice, providers, models, catalog, testResult, stat, buckets, expanded, onToggle, onField, onSave, onDelete, onTest, onDiscover } = props
      const groups = models ?? []
      const group = groups.find((entry) => entry.provider === (draft.provider || ''))
      const modelOptions = group ? group.models ?? [] : []
      const modelIds = new Set(modelOptions.map((model) => model.id))
      if (draft.model && !modelIds.has(draft.model)) modelOptions.push({ id: draft.model, name: draft.model })
      const providerChoice = providers.find((entry) => entry.provider === draft.provider)
      const effective = catalog ? `${catalog.effectiveProvider}/${catalog.effectiveModel}` : '—'
      const sourceLabel = catalog ? ({ agent: t('sourceAgent'), main: t('sourceMain'), 'provider-default': t('sourceProvider') }[catalog.source] ?? t('sourceUnknown')) : ''
      const barBuckets = (buckets ?? []).slice(-48)
      const barMax = Math.max(1, ...barBuckets.map((bucket) => bucket.inputTokens + bucket.outputTokens))
      const typeLabel = ({ chat: t('typeChat'), agent: t('typeAgent'), image: t('typeImage'), speech: t('typeSpeech') }[draft.type] ?? t('typeChat'))

      // 折叠摘要：类型 tag + 生效模型 + 简要用量
      const summary = el('div', { className: 'dshrouter-card' },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: expanded ? t('collapse') : t('expand') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, draft.type || 'chat'),
          catalog && catalog.error ? el('span', { className: 'dshrouter-error', title: catalog.error }, '⚠') : null,
          el('span', { className: 'dshrouter-meta' }, `${effective}`),
          el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')} ${stat ? stat.calls : 0} · ${t('statsErrors')} ${stat ? stat.errors : 0} · ${stat ? fmtTokens(stat.inputTokens) : 0}/${stat ? fmtTokens(stat.outputTokens) : 0}`),
          el('span', { className: 'dshrouter-spacer' }),
          el('span', { className: 'dshrouter-chevron' }, expanded ? '▾' : '▸')))

      if (!expanded) return summary

      return el('div', { className: 'dshrouter-card' + (draft.enabled === false ? ' disabled' : '') },
        el('button', { type: 'button', className: 'dshrouter-card-head', onClick: onToggle, 'aria-expanded': expanded, title: t('collapse') },
          el('span', { className: 'dshrouter-name' }, draft.name || id),
          el('span', { className: 'dshrouter-id' }, id),
          el('span', { className: 'dshrouter-tag' }, typeLabel),
          catalog && catalog.error ? el('span', { className: 'dshrouter-error', title: catalog.error }, catalog.error.slice(0, 60)) : null,
          el('span', { className: 'dshrouter-spacer' }),
          el('label', { className: 'dshrouter-switch', onClick: (event) => event.stopPropagation() },
            el('input', { type: 'checkbox', checked: draft.enabled !== false, disabled: !writable, onChange: (event) => onField('enabled', event.target.checked) }),
            t('enable')),
          el('span', { className: 'dshrouter-chevron' }, '▾')),
        el('div', { className: 'dshrouter-row' },
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldName')),
            el('input', { className: 'dshrouter-input', value: draft.name ?? '', onChange: (event) => onField('name', event.target.value) })),
          el('div', { className: 'dshrouter-field', style: { flex: '0 0 240px' } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldType')),
            el('select', { className: 'dshrouter-select', value: draft.type ?? 'chat', onChange: (event) => onField('type', event.target.value) },
              el('option', { value: 'chat' }, t('typeChat')),
              el('option', { value: 'agent' }, t('typeAgent')),
              el('option', { value: 'image' }, t('typeImage')),
              el('option', { value: 'speech' }, t('typeSpeech'))))),
        el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('fieldDescription')),
          el('textarea', { className: 'dshrouter-textarea', value: draft.description ?? '', onChange: (event) => onField('description', event.target.value) })),
        el('div', { className: 'dshrouter-row' },
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldProvider')),
            el('select', { className: 'dshrouter-select', value: draft.provider ?? '', onChange: (event) => onField('provider', event.target.value) },
              el('option', { value: '' }, `— ${t('inherit')} —`),
              ...providers.filter((entry) => entry.active || entry.provider === draft.provider).map((entry) => el('option', { value: entry.provider, key: entry.provider }, `${entry.displayName} (${entry.provider})`)))),
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldModel')),
            el('input', {
              className: 'dshrouter-input', list: `dshrouter-models-${id}`,
              value: draft.model ?? '', placeholder: '—',
              onChange: (event) => onField('model', event.target.value),
            }),
            el('datalist', { id: `dshrouter-models-${id}` },
              ...modelOptions.map((model) => el('option', { value: model.id, key: model.id }, model.name || model.id)))),
          el('button', {
            type: 'button', className: 'dshrouter-button ghost',
            style: { flex: 'none' },
            disabled: !draft.provider,
            title: draft.provider ? undefined : t('fieldProvider'),
            onClick: () => onDiscover(draft.provider),
          }, t('fieldDiscover'))),
        draft.type === 'image' || draft.type === 'speech' ? el('div', { className: 'dshrouter-row' },
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldEndpoint')),
            el('input', { className: 'dshrouter-input', value: draft.endpoint ?? '', placeholder: 'https://api.openai.com/v1/images/generations', onChange: (event) => onField('endpoint', event.target.value) })),
          draft.type === 'image' ? el('div', { className: 'dshrouter-field', style: { flex: '0 0 180px' } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldImageSize')),
            el('select', { className: 'dshrouter-select', value: draft.imageSize ?? '1024x1024', onChange: (event) => onField('imageSize', event.target.value) },
              el('option', { value: '1024x1024' }, '1024x1024'),
              el('option', { value: '1792x1024' }, '1792x1024'),
              el('option', { value: '1024x1792' }, '1024x1792'))) : null,
          el('div', { className: 'dshrouter-field' },
            el('span', { className: 'dshrouter-field-label' }, t('fieldApiKeyEnv')),
            el('input', { className: 'dshrouter-input', value: draft.apiKeyEnv ?? '', placeholder: 'OPENAI_API_KEY', onChange: (event) => onField('apiKeyEnv', event.target.value) }))) : null,
        draft.type === 'agent' ? el('div', { className: 'dshrouter-field' },
          el('span', { className: 'dshrouter-field-label' }, t('fieldTools')),
          el('input', { className: 'dshrouter-input', value: (draft.tools ?? []).join(', '), onChange: (event) => onField('tools', event.target.value.split(',').map((item) => item.trim()).filter(Boolean)) })) : null,
        el('details', null,
          el('summary', { className: 'dshrouter-meta' }, t('advanced')),
          el('div', { className: 'dshrouter-row', style: { marginTop: 8 } },
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldReasoning')),
              el('input', { className: 'dshrouter-input', value: draft.reasoningEffort ?? '', placeholder: 'high', onChange: (event) => onField('reasoningEffort', event.target.value) })),
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldTemperature')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 0, max: 2, step: 0.1, value: draft.temperature ?? 0, onChange: (event) => onField('temperature', Number(event.target.value) || 0) })),
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldMaxTokens')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 0, step: 1, value: draft.maxTokens ?? 0, onChange: (event) => onField('maxTokens', Number(event.target.value) || 0) })),
            draft.type !== 'image' ? el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldMaxRounds')),
              el('input', { className: 'dshrouter-input', type: 'number', min: 1, max: 8, step: 1, value: draft.maxRounds ?? 1, onChange: (event) => onField('maxRounds', Math.max(1, Math.min(8, Number(event.target.value) || 1))) })) : null,
            el('div', { className: 'dshrouter-field' },
              el('span', { className: 'dshrouter-field-label' }, t('fieldCapabilities')),
              el('input', { className: 'dshrouter-input', value: (draft.capabilities ?? []).join(', '), onChange: (event) => onField('capabilities', event.target.value.split(',').map((item) => item.trim()).filter(Boolean)) }))),
          el('div', { className: 'dshrouter-field', style: { marginTop: 8 } },
            el('span', { className: 'dshrouter-field-label' }, t('fieldSystemPrompt')),
            el('textarea', { className: 'dshrouter-textarea', value: draft.systemPrompt ?? '', onChange: (event) => onField('systemPrompt', event.target.value) }))),
        el('p', { className: 'dshrouter-meta' },
          t('effective'), el('strong', null, effective),
          catalog && catalog.source ? ` · ${sourceLabel}` : null,
          providerChoice && !providerChoice.active ? ` · (${t('accountDormant')})` : null),
        // 该 agent 的实时用量
        el('div', { className: 'dshrouter-stats' },
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-meta' }, `${t('statsCalls')}: ${stat ? stat.calls : 0}`),
            el('span', { className: 'dshrouter-meta', style: stat && stat.errors > 0 ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined }, `${t('statsErrors')}: ${stat ? stat.errors : 0}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsTokens')}: ${stat ? fmtTokens(stat.inputTokens) : 0} / ${stat ? fmtTokens(stat.outputTokens) : 0}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsAvg')}: ${stat && stat.calls > 0 ? fmtMs(stat.totalMs / stat.calls) : '—'}`),
            el('span', { className: 'dshrouter-meta' }, `${t('statsLast')}: ${timeOf(stat && stat.lastAt)}`)),
          barBuckets.length > 0 ? el('div', { className: 'dshrouter-bars', title: t('statsSeries') },
            ...barBuckets.map((bucket) => el('div', {
              key: bucket.minute,
              className: 'dshrouter-bar' + (bucket.errors > 0 && bucket.calls === bucket.errors ? ' err' : ''),
              style: { height: `${Math.max(2, Math.round(((bucket.inputTokens + bucket.outputTokens) / barMax) * 26))}px` },
              title: `${bucket.minute} · in ${bucket.inputTokens} / out ${bucket.outputTokens} · ${bucket.errors} err`,
            }))) : null),
        testResult ? el('p', { className: testResult.ok ? 'dshrouter-ok' : 'dshrouter-error' },
          testResult.busy ? t('testing') : testResult.message) : null,
        notice ? el('p', { className: 'dshrouter-hint' }, notice) : null,
        el('div', { className: 'dshrouter-row' },
          el('button', { type: 'button', className: 'dshrouter-button', disabled: busy || !writable, onClick: onSave }, busy ? t('saving') : t('save')),
          el('button', { type: 'button', className: 'dshrouter-button ghost', disabled: testResult && testResult.busy, onClick: onTest }, testResult && testResult.busy ? t('testing') : t('test')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button danger', disabled: busy || !writable, onClick: onDelete }, t('delete'))),
      )
    }

    /** 列表末尾的「+」添加卡片。 */
    function AddAgentCard(props) {
      const { t, adding, setAdding, newId, setNewId, idTaken, idInvalid, writable, onSave, onTemplate } = props
      if (!adding) {
        return el('div', { className: 'dshrouter-add', role: 'button', tabIndex: 0, onClick: () => setAdding(true), onKeyDown: (event) => { if (event.key === 'Enter') setAdding(true) } },
          el('span', { style: { fontSize: 18, lineHeight: 1 } }, '+'),
          el('span', null, t('addTitle')))
      }
      return el('div', { className: 'dshrouter-card' },
        el('div', { className: 'dshrouter-head' },
          el('span', { className: 'dshrouter-name' }, t('addTitle')),
          el('span', { className: 'dshrouter-spacer' }),
          el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: () => { setAdding(false); setNewId('') } }, t('cancel'))),
        el('div', { className: 'dshrouter-row' },
          el('input', {
            className: 'dshrouter-input', style: { flex: '0 0 240px' },
            placeholder: t('addPlaceholder'), 'aria-label': t('addPlaceholder'),
            value: newId, onChange: (event) => setNewId(event.target.value),
          }),
          el('button', {
            type: 'button', className: 'dshrouter-button',
            disabled: !newId.trim() || idInvalid || idTaken || !writable,
            onClick: onSave,
          }, t('add'))),
        newId.trim() && idInvalid ? el('p', { className: 'dshrouter-error' }, t('invalidId')) : null,
        newId.trim() && idTaken ? el('p', { className: 'dshrouter-error' }, t('duplicateId')) : null,
        el('div', { className: 'dshrouter-row' },
          el('span', { className: 'dshrouter-meta' }, t('presets')),
          ...AGENT_PRESETS.map((preset) => el('button', {
            type: 'button', key: preset.id, className: 'dshrouter-chip',
            onClick: () => onTemplate(preset),
          }, t(preset.key)))),
      )
    }

    function DiscoverModal(props) {
      const { api, t, provider, providers, onClose, onAdopt } = props
      const [busy, setBusy] = useState(true)
      const [failure, setFailure] = useState(null)
      const [candidates, setCandidates] = useState([])
      const entry = providers.find((item) => item.provider === provider)
      useEffect(() => {
        let alive = true
        setBusy(true)
        setFailure(null)
        api.llm.discoverModels({
          settingsNs: entry ? entry.settingsNs : 'llm-pi-ai',
          provider,
        }).then((response) => {
          if (!alive) return
          if (!response.result.ok) { setFailure(response.result.error.message); return }
          setCandidates(response.result.value.models ?? [])
        }, (error) => { if (alive) setFailure(messageOf(error)) })
          .finally(() => { if (alive) setBusy(false) })
        return () => { alive = false }
      }, [api, provider, entry])
      return el('div', { className: 'dshrouter-modal', onClick: (event) => { if (event.target === event.currentTarget) onClose() } },
        el('div', { className: 'dshrouter-modal-body' },
          el('h4', { className: 'dshrouter-modal-title' }, `${t('fetchTitle')} · ${provider}`),
          busy ? el('p', { className: 'dshrouter-intro' }, t('fetching')) : null,
          failure ? el('p', { className: 'dshrouter-error' }, failure) : null,
          !busy && !failure && candidates.length === 0 ? el('p', { className: 'dshrouter-intro' }, t('fetchEmpty')) : null,
          candidates.map((model) => el('div', {
            className: 'dshrouter-candidate', key: model.id,
            onClick: () => onAdopt(model.id),
          },
            el('span', null, model.id),
            el('span', { className: 'dshrouter-meta' }, model.name || ''),
            el('span', { className: 'dshrouter-spacer' }),
            el('span', { className: 'dshrouter-meta' }, model.contextWindow ? `${fmtTokens(model.contextWindow)} ctx` : ''))),
          el('div', { className: 'dshrouter-row' },
            el('span', { className: 'dshrouter-spacer' }),
            el('button', { type: 'button', className: 'dshrouter-button ghost', onClick: onClose }, t('close')))))
    }

    // ── 插件装配 ────────────────────────────────────────────────────────────
    const NS = 'router'
    const inject = ['slots', 'locale', 'connection', 'remote']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-router: locale')
      const connection = ctx.get('connection')
      const api = connection.api
      const t = ctx.locale.bind(NS)
      const remoteReady = ctx.remote.$mount(ROUTER_REMOTE).catch((error) => {
        console.error('dsh-router: remote mount failed', error)
      })
      const $on = (event, listener) => ctx.remote.$on(event, listener)
      const injected = () => ({ api, remote: () => ctx.get('remote.router') ?? null, remoteReady, t, $on })
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'router-agents',
        order: 20,
        label: () => t('nav'),
        inject: injected,
      }, (props) => el(AgentsPage, {
        api: props.api,
        remote: props.remote,
        remoteReady: props.remoteReady,
        t: props.t,
        $on: props.$on,
      })))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
