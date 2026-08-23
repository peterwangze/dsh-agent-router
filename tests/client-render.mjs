/**
 * 客户端 UI 真实渲染测试：在 Node 里用迷你 React 驱动 lib/client.js
 * （浏览器包，window.__ModuleLoader__ 格式）完整渲染「Agent 路由」设置页，
 * 对渲染出的元素树做结构断言——覆盖宿主侧单测够不到的两类回归：
 * - 界面结构错误（如圆点组件里塞文字、按钮行错乱）；
 * - cli 卡片的「测试 → 登录」替换与登录状态指示。
 *
 * 迷你 React 只实现 useState/useEffect/useCallback/useRef + 路径化的
 * 组件实例帧 + 脏标记重渲染循环，足以走完 load()→ready→自动状态探测
 * 的完整状态流（effects 按 deps 语义去重，避免无限循环）。
 * @module dsh-agent-router/tests/client-render
 */

export async function runClientRender(check) {
  const { readFileSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js'), 'utf8')

  // ── 迷你 React 运行时 ──────────────────────────────────────────────────
  const instances = new Map()
  const frameStack = []
  let dirty = false
  let renderErrors = []
  const currentFrame = () => frameStack[frameStack.length - 1]

  function createElement(type, props, ...children) {
    const flat = []
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false || child === true) continue
      flat.push(child)
    }
    const element = { type, props: { ...(props ?? {}) } }
    if (flat.length > 0) element.props.children = flat
    return element
  }

  function arraysEqual(a, b) {
    if (a === b) return true
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let index = 0; index < a.length; index++) {
      if (!Object.is(a[index], b[index])) return false
    }
    return true
  }

  /** 取当前帧的 hook 槽位（首次访问时初始化为空对象）。 */
  const hookSlot = (index) => {
    const inst = currentFrame()
    let value = inst.hooks[index]
    if (!value) value = inst.hooks[index] = {}
    return value
  }

  function useState(initial) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    if (!slot.has) {
      slot.has = true
      slot.value = typeof initial === 'function' ? initial() : initial
    }
    const setter = (value) => {
      const next = typeof value === 'function' ? value(slot.value) : value
      if (Object.is(next, slot.value)) return
      slot.value = next
      dirty = true
    }
    return [slot.value, setter]
  }

  function useEffect(fn, deps) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    slot.fn = fn
    inst.effects.push(slot)
    if (slot.deps === undefined || !arraysEqual(slot.deps, deps)) {
      slot.deps = deps
      slot.pending = true
    } else {
      slot.pending = false
    }
  }

  function useCallback(fn, deps) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    if (slot.has && arraysEqual(slot.deps, deps)) return slot.value
    slot.has = true
    slot.deps = deps
    slot.value = fn
    return fn
  }

  function useRef(value) {
    const inst = currentFrame()
    const slot = hookSlot(inst.hookIndex++)
    if (!slot.has) {
      slot.has = true
      slot.value = { current: value }
    }
    return slot.value
  }

  const react = { createElement, useState, useEffect, useCallback, useRef }

  function callComponent(type, props, pathKey) {
    let inst = instances.get(pathKey)
    if (!inst) {
      inst = { hooks: [], hookIndex: 0, effects: [] }
      instances.set(pathKey, inst)
    }
    inst.hookIndex = 0
    inst.effects = []
    frameStack.push(inst)
    let result
    try {
      result = type(props)
    } catch (error) {
      renderErrors.push(error)
      result = null
    }
    frameStack.pop()
    for (const slot of inst.effects) {
      if (!slot.pending) continue
      try {
        slot.fn()
      } catch (error) {
        renderErrors.push(error)
      }
    }
    return result
  }

  function walk(node, pathKey) {
    if (node === null || node === undefined) return null
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map((child, index) => walk(child, `${pathKey}.${index}`)).filter((value) => value !== null)
    if (typeof node.type === 'function') return walk(callComponent(node.type, node.props, pathKey), pathKey)
    const children = node.props.children === undefined ? [] : Array.isArray(node.props.children) ? node.props.children : [node.props.children]
    return {
      type: node.type,
      props: node.props,
      children: children.map((child, index) => walk(child, `${pathKey}.${index}`)).filter((value) => value !== null),
    }
  }

  let rootElement = null
  let currentTree = null
  let walkPrefix = 'root'
  async function settle(maxTurns = 40) {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (dirty) {
        dirty = false
        renderErrors = []
        currentTree = walk(rootElement, walkPrefix)
      }
      await new Promise((resolve) => setImmediate(resolve))
      if (!dirty) {
        await new Promise((resolve) => setImmediate(resolve))
        if (!dirty) return currentTree
      }
    }
    return currentTree
  }
  /** 换一棵组件树渲染（独立实例路径，避免与设置页共享 hook 槽位）。 */
  async function renderInto(element, prefix, maxTurns = 40) {
    rootElement = element
    walkPrefix = prefix
    dirty = true
    return settle(maxTurns)
  }

  // ── 装配：评估浏览器包 → mock ctx → apply → 渲染 ─────────────────────
  const captured = { registrations: [], listeners: [], uploadFileCalls: [], readWorkspaceFileCalls: [], saveOps: [], oauthLogoutCalls: [], beginCalls: [], openCalls: [], statsExportCalls: [] }
  const fakeWindow = {
    __ModuleLoader__: { load: (payload) => { captured.bundle = payload } },
    location: { search: '', pathname: '/' },
    history: { replaceState: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
    // 登录轮询依赖 setTimeout 真正回调（忽略延迟立即排队），否则轮询挂死。
    setTimeout: (fn) => { setImmediate(fn); return 0 },
    clearTimeout: () => {},
    confirm: () => confirmMode,
    open: (url) => { captured.openCalls.push(String(url)); return { closed: true } },
    // F11 附件上传（Step 8）：AttachButton 经 FileReader 读字节 → base64 →
    // router/uploadFile RPC。测试用假 FileReader（与真实浏览器同构：readAsDataURL
    // 产出 data: URL，onload 异步回调）；文件字节由夹具的 _base64 字段提供。
    FileReader: class {
      readAsDataURL(file) {
        const base64 = typeof file._base64 === 'string' && file._base64 ? file._base64 : 'aGk='
        this.result = `data:${file.type || 'application/octet-stream'};base64,${base64}`
        queueMicrotask(() => { if (typeof this.onload === 'function') this.onload() })
      }
    },
    // L3 打开文件预览（Step 9）：blob URL 由宿主浏览器 API 提供——测试打桩。
    URL: { createObjectURL: () => 'blob:mock-preview', revokeObjectURL: () => {} },
  }
  new Function('window', source)(fakeWindow)
  check('client bundle evaluates', !!captured.bundle && captured.bundle.id === 'dsh-agent-router' && typeof captured.bundle.factory === 'function')
  const bundleExports = captured.bundle.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  check('client exports apply/inject', typeof bundleExports.apply === 'function' && Array.isArray(bundleExports.inject))

  // cli 登录状态可切换：'ok' = 已登录；'logged-out' = 未登录（Not logged in）。
  // 登录轮询、刷新状态与未登录红色提示的回归断言共用。
  let cliStatusMode = 'ok'
  // 目录形态可切换：'withVision' = 识别+生图；'drawOnly' = 仅生图 agent；
  // 'none' = 无任何多模态 agent（附件按钮隐藏、接管解除）。
  let catalogMode = 'withVision'
  // FIX-002-R7 F3：接管开关可切换（catalog.takeoverDefaultModel 镜像值）——
  // 默认 true 维持既有接管断言语义；false 供"开关关闭"判别双断言组。
  let takeoverSwitch = true
  // EVO-002 Step 6：ChatGPT 实验区——experimentalOn 控制开关态（config value
  // 镜像），presetMode 控制目录 preset 账号形态（'none'|'logged-out'|
  // 'logged-in'），confirmMode 控制 ToS/登出/删除确认对话（decline 判别）。
  let experimentalOn = false
  let presetMode = 'none'
  let confirmMode = true
  // EVO-004 R8-F1（P2）：非成员 preset 值账号判据统一——未知 preset（'zzz'）
  // 必须回落到通用 OAuth 卡（旧：宽判据排除 + 预设卡严格成员 → UI 黑箱 +
  // 删除死锁）。true 时 catalog 注入一个 preset:'zzz' 的散账号。
  let unknownPresetMode = false
  // EVO-002 Step 7（R7-F4 判别）：true 时 remoteMock.oauthLogout 返回
  // ok:false（store.delete 失败形态——凭据文件残留 + 无重试入口的旧行为判别）。
  let logoutFailMode = false
  // F11 上传失败模式：true 时 remoteMock.uploadFile 返回 ok:false（错误码形状）。
  let uploadFailMode = false
  // L3 打开文件失败模式（Step 9）：true 时 remoteMock.readWorkspaceFile 返回
  // ok:false（错误码形状）；mediaType 按路径扩展名派生（audio/video/doc）。
  let readFileFailMode = false
  const remoteMock = {
    catalog: async () => ({
      ok: true,
      value: {
        ok: true, enabled: true, takeoverDefaultModel: takeoverSwitch, defaults: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
        agents: catalogMode === 'drawOnly'
          ? [
            { id: 'draw', name: '画图', type: 'image', enabled: true, description: 'd', capabilities: ['image'], provider: 'openai', model: 'dall-e-3', account: '', effectiveProvider: 'openai', effectiveModel: 'dall-e-3', source: 'agent' },
          ]
          : catalogMode === 'none'
            ? [
              { id: 'plain', name: '纯文本', type: 'chat', enabled: true, description: 'd', capabilities: [], provider: 'openai', model: 'gpt-4o', account: '', effectiveProvider: 'openai', effectiveModel: 'gpt-4o', source: 'agent' },
            ]
            : [
              { id: 'codex', name: 'Codex 助手', type: 'cli', enabled: true, description: 'd', capabilities: ['image'], provider: '', model: '', account: '', cliAgent: 'codexentry', effectiveProvider: 'cli:codexentry', effectiveModel: '', source: 'agent' },
              { id: 'vision', name: '视觉', type: 'chat', enabled: true, description: 'd', capabilities: ['image'], provider: '', model: '', account: '', effectiveProvider: 'deepseek-official', effectiveModel: 'deepseek-v4-pro', source: 'main' },
            ],
        oauthAccounts: presetMode === 'none' && !unknownPresetMode ? [] : [
          { id: 'chatgpt', name: 'ChatGPT（实验）', enabled: true, protocol: 'codex-responses', baseURL: 'https://chatgpt.com/backend-api', tokenRef: '', clientId: '', authUrl: '', tokenUrl: '', scope: '', models: ['gpt-5.4-mini'], publicClient: false, preset: 'chatgpt-codex', presetLoggedIn: presetMode === 'logged-in' },
          ...(unknownPresetMode ? [{ id: 'weird', name: '怪异账号', enabled: true, protocol: 'openai-completions', baseURL: '', tokenRef: 'ROUTER_OAUTH_WEIRD_TOKEN', clientId: '', authUrl: '', tokenUrl: '', scope: '', models: [], publicClient: false, preset: 'zzz' }] : []),
        ],
        pools: presetMode === 'none' ? [] : [
          { id: 'main', name: '主池', enabled: true, strategy: 'healthy', accounts: ['chatgpt'], accountHealth: [] },
        ], cliAgents: [
          { id: 'codexentry', name: 'Codex 子代理', enabled: true, command: 'codex', args: '', timeoutMs: 0, maxConcurrent: 1 },
        ],
      },
    }),
    config: async () => ({ ok: true, value: { ok: true, enabled: true, revision: 1, writable: true, value: {
      enabled: true,
      oauthExperimental: experimentalOn,
      oauthTosAccepted: experimentalOn,
      agents: {
        codex: { name: 'Codex 助手', type: 'cli', enabled: true, description: 'd', capabilities: ['image'], command: '', args: '', timeoutMs: 0, maxConcurrent: 1, cliAgent: 'codexentry' },
        vision: { name: '视觉', type: 'chat', enabled: true, description: 'd', capabilities: ['image'], provider: '', model: '', maxRounds: 1 },
      },
      oauthAccounts: {},
      pools: {},
      cliAgents: {
        codexentry: { name: 'Codex 子代理', enabled: true, command: 'codex', args: '', timeoutMs: 0, maxConcurrent: 1, loginArgs: '', statusArgs: '', modelsArgs: '' },
      },
    }, user: null } }),
    stats: async () => ({ ok: true, value: { ok: true, enabled: true, totals: [], recent: [], series: [], accountTotals: [], accountSeries: [], days: {
      '2026-01-15': { calls: 3, errors: 1, inputTokens: 110, outputTokens: 50, tokens: 160, ms: 180, cost: 0.5 },
      '2026-01-16': { calls: 2, errors: 0, inputTokens: 20, outputTokens: 0, tokens: 20, ms: 60, cost: 0 },
    } } }),
    statsExport: async (request) => { captured.statsExportCalls.push(request); return { ok: true, value: { ok: true, message: '已导出 2 行', csv: 'date,agent,account,model,calls,errors,inputTokens,outputTokens,p50ms,p95ms,costEstimate\n2026-01-15,vision,openai,gpt-4o,3,1,110,50,60,180,0.5' } } },
    save: async (request) => { captured.saveOps.push(...((request && request.ops) ?? [])); return { ok: true, value: { ok: true, revision: 1 } } },
    oauthBegin: async (request) => { captured.beginCalls.push(request); return { ok: true, value: { ok: true, message: '授权 URL 已生成', authUrl: 'https://auth.openai.com/oauth/authorize?x=1', state: 'st-6' } } },
    oauthLogout: async (request) => {
      captured.oauthLogoutCalls.push(request)
      return logoutFailMode
        ? { ok: true, value: { ok: false, message: '登出失败（删除凭据文件）：模拟磁盘错误' } }
        : { ok: true, value: { ok: true, message: '已登出并删除 ChatGPT 凭据文件' } }
    },
    reset: async () => ({ ok: true, value: { ok: true } }),
    test: async () => ({ ok: true, value: { ok: true, message: 'ok' } }),
    cliStatus: async () => cliStatusMode === 'logged-out'
      ? { ok: true, value: { ok: true, loggedIn: false, message: 'Not logged in' } }
      : { ok: true, value: { ok: true, loggedIn: true, message: '已登录' } },
    cliLogin: async () => ({ ok: true, value: { ok: true, message: '已在终端窗口启动' } }),
    cliModels: async () => ({ ok: true, value: { ok: true, message: '2 个模型', models: ['m1', 'm2'], source: 'cli' } }),
    imageData: async (request) => {
      captured.imageDataCalls.push(request)
      return { ok: true, value: { ok: true, message: 'ok', mediaType: 'image/png', data: 'aGk=', width: 2, height: 2 } }
    },
    uploadFile: async (request) => {
      captured.uploadFileCalls.push(request)
      if (uploadFailMode) return { ok: true, value: { ok: false, message: '文件超过大小上限', code: 'FILE_TOO_LARGE' } }
      return { ok: true, value: { ok: true, path: `.router-files/${request.name}`, attachmentId: `sha256:${'f'.repeat(64)}`, name: request.name } }
    },
    readWorkspaceFile: async (request) => {
      captured.readWorkspaceFileCalls.push(request)
      if (readFileFailMode) return { ok: true, value: { ok: false, message: '文件路径超出会话工作区', code: 'PATH_OUTSIDE_WORKSPACE' } }
      const path = String(request.path ?? '')
      const lower = path.toLowerCase()
      const mediaType = lower.endsWith('.mp4') ? 'video/mp4' : lower.endsWith('.doc') ? 'application/msword' : 'audio/wav'
      return { ok: true, value: { ok: true, dataBase64: 'aGVsbG8=', mediaType, name: path.split('/').pop() } }
    },
  }
  // 账号添加/编辑回归用记录：端点探测请求、llm-pi-ai 写入、凭据写入。
  // discoverMode 切 'fail' 模拟端点不可达（负向见证）。
  const discoverCalls = []
  const mutateCalls = []
  const credSetCalls = []
  let discoverMode = 'ok'
  // 模型接管面：会话当前选中 + 切换调用记录（视觉开→切包装组，关→切回）。
  let sessionCurrent = { provider: 'openai', model: 'gpt-4o' }
  const sessionSelectCalls = []
  const apiMock = {
    sessions: {
      models: async () => ({ result: { ok: true, value: { current: { ...sessionCurrent }, routable: true, groups: [], failures: [] } } }),
      selectModel: async (payload) => {
        sessionSelectCalls.push({ ...payload })
        sessionCurrent = { provider: payload.provider, model: payload.model }
        return { result: { ok: true, value: { selected: { provider: payload.provider, model: payload.model } } } }
      },
    },
    llm: {
      providers: async () => ({ result: { ok: true, value: { providers: [
        { provider: 'openai', displayName: 'OpenAI', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'openai'], active: false, declared: false },
        { provider: 'gateway', displayName: 'Gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'gateway'], active: true, declared: true },
      ] } } }),
      models: async () => ({ result: { ok: true, value: { groups: [{ id: 'gateway', models: [{ id: 'old-m', name: 'Old M' }] }], failures: [] } } }),
      discoverModels: async (request) => {
        discoverCalls.push(request)
        if (discoverMode === 'fail') return { result: { ok: false, error: { message: 'could not reach https://gateway.example/v1/models' } } }
        return { result: { ok: true, value: { models: [{ id: 'm-a' }, { id: 'm-b', name: 'Model B', contextWindow: 65536, maxTokens: 4096 }] } } }
      },
    },
    settings: {
      describe: async () => ({ result: { ok: true, value: { namespaces: [{ ns: 'llm-pi-ai', value: { providers: { gateway: { api: 'openai-completions', baseURL: 'https://gateway.example/v1', models: [{ id: 'old-m', name: 'Old M' }] } } } }] } } }),
      mutate: async (payload) => {
        mutateCalls.push(payload)
        return { result: { ok: true } }
      },
    },
    credentials: {
      describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
      set: async (payload) => { credSetCalls.push(payload); return { result: { ok: true } } },
      unset: async () => ({ result: { ok: true } }),
    },
  }
  const zh = {}
  const ctx = {
    effect: (fn) => { fn(); return () => {} },
    locale: {
      register: (_ns, tables) => { Object.assign(zh, tables.zh) },
      bind: () => (key) => zh[key] ?? key,
    },
    get: (key) => (key === 'connection' ? { api: apiMock } : key === 'remote.router' ? remoteMock : undefined),
    remote: { $mount: (contribution) => { captured.mount = contribution; return Promise.resolve() }, $on: (event, listener) => { captured.listeners.push({ event, listener }); return () => {} } },
    slots: {
      inject: (_slot, register) => { captured.registrations.push(register()); return () => {} },
      register: (descriptor, renderFn) => ({ ...descriptor, render: renderFn }),
    },
  }
  bundleExports.apply(ctx)
  const registrationOf = (name) => captured.registrations.find((reg) => reg && reg.name === name)
  const settingsReg = registrationOf('settings.section')
  check('settings section registered', !!settingsReg && typeof settingsReg.render === 'function')
  check('composer image slots registered', !!registrationOf('conversation.input.right') && !!registrationOf('tool.call.toolview'))
  check('toolview keyed to route_agent', registrationOf('tool.call.toolview') && registrationOf('tool.call.toolview').key === 'route_agent')
  // 浏览器侧 Remote 契约必须与宿主 rpc.js 同步包含 cli 三方法与 imageData（曾漏加导致按钮全失效）。
  check('client remotes include cli methods', !!captured.mount && ['cliStatus', 'cliLogin', 'cliModels'].every((method) => (captured.mount.descriptors ?? []).some((descriptor) => descriptor.method === method)))
  check('client remotes include image methods', !!captured.mount && (captured.mount.descriptors ?? []).some((descriptor) => descriptor.method === 'imageData'))
  check('client remotes include uploadFile', !!captured.mount && (captured.mount.descriptors ?? []).some((descriptor) => descriptor.method === 'uploadFile' && descriptor.id === 'dsh-agent-router#router/uploadFile'))
  rootElement = settingsReg.render({ api: apiMock, remote: () => remoteMock, remoteReady: Promise.resolve(), t: (key) => zh[key] ?? key, $on: () => () => {} })
  dirty = true
  currentTree = await settle()

  // ── 工具函数 ──────────────────────────────────────────────────────────
  const textOf = (node) => {
    if (node === null || node === undefined) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join(' ')
    return (node.children ?? []).map(textOf).join(' ')
  }
  const findAll = (node, predicate, out = []) => {
    if (node === null || node === undefined) return out
    if (Array.isArray(node)) { for (const child of node) findAll(child, predicate, out); return out }
    if (predicate(node)) out.push(node)
    for (const child of node.children ?? []) findAll(child, predicate, out)
    return out
  }
  const hasClass = (node, token) => node && node.type && typeof node.props?.className === 'string' && node.props.className.includes(token)
  const buttonsOf = (tree) => findAll(tree, (node) => node && node.type === 'button')

  // ── 断言：渲染无异常 + 折叠摘要 ──────────────────────────────────────
  if (renderErrors.length > 0) {
    try {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'render-errors.txt'), renderErrors.map((error) => (error && error.stack ? error.stack : String(error))).join('\n---\n'))
    } catch { /* 调试输出失败忽略 */ }
  }
  check('client renders without errors', renderErrors.length === 0)
  check('client shows ready page', textOf(currentTree).includes(zh.agentsTitle))
  const heads = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-card-head'))
  check('agent cards rendered', heads.length >= 2)

  // ── 断言：cli 卡片展开 → 登录按钮替换测试按钮 + 状态指示 ─────────────
  const codexHead = heads.find((node) => textOf(node).includes('codex'))
  check('cli card head found', !!codexHead)
  if (codexHead) {
    codexHead.props.onClick()
    currentTree = await settle()
    const allButtons = buttonsOf(currentTree)
    const labels = allButtons.map(textOf)
    // 已登录状态显示「重新登录」，未登录显示「登录（打开终端窗口）」——
    // 两者都是登录语义；关键断言：cli 卡内不存在「测试」按钮。
    check('cli card login button replaces test', (labels.includes(zh.cliLogin) || labels.includes(zh.cliRelogin)) && !labels.includes(zh.test))
    check('cli card shows logged-in chip', textOf(currentTree).includes(zh.cliStatusLoggedIn))
    // 子代理是账号区条目：agent 卡片用「子代理」下拉选择，选项来自 cliAgents 目录。
    const selects = findAll(currentTree, (node) => node && node.type === 'select')
    check('cli card subagent select lists entries', selects.some((selectNode) => textOf(selectNode).includes('Codex 子代理') && textOf(selectNode).includes('codexentry')) && textOf(currentTree).includes(zh.fieldCliAgent))
    // 圆点组件绝不承载文字（此前 UI 错乱的根因）。
    const dots = findAll(currentTree, (node) => hasClass(node, 'dshrouter-dot'))
    check('status dots carry no text', dots.length > 0 && dots.every((dot) => (dot.children ?? []).every((child) => typeof child !== 'string')))
  }

  // ── 断言：chat 卡片展开 → 仍是「测试」按钮（其余类型不受影响）────────
  const visionHead = heads.find((node) => textOf(node).includes('vision'))
  check('chat card head found', !!visionHead)
  if (visionHead) {
    visionHead.props.onClick()
    currentTree = await settle()
    const labels = buttonsOf(currentTree).map(textOf)
    check('chat card keeps test button', labels.includes(zh.test))
  }

  // ── 断言：添加卡片模板是能力起点，不含 CLI 类别 ──────────────────────
  const addCards = findAll(currentTree, (node) => hasClass(node, 'dshrouter-add'))
  if (addCards.length > 0) {
    addCards[0].props.onClick()
    currentTree = await settle()
    const chipLabels = buttonsOf(currentTree).map(textOf)
    check('templates are capabilities, not cli categories', chipLabels.some((label) => label.includes(zh.presetVision)) && !chipLabels.some((label) => label.includes('Codex CLI 子代理') || label.includes('Claude Code 子代理') || label.includes('Gemini CLI 子代理')))
  }

  // ── 断言：子代理条目归入多模态账号区（可展开，含登录维护入口）────────
  const accountsHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.accountTitle))
  check('accounts category head found', !!accountsHead)
  if (accountsHead) {
    accountsHead.props.onClick()
    currentTree = await settle()
    check('subagents live under accounts', textOf(currentTree).includes(zh.cliTitle) && textOf(currentTree).includes('codexentry'))
    // OAuth/账号池收进「高级扩展」折叠卡片：默认不可见。
    check('oauth tucked into advanced section', !textOf(currentTree).includes(zh.oauthTitle))
    const cliCardHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-card-head')).find((node) => textOf(node).includes('codexentry'))
    check('subagent card rendered under accounts', !!cliCardHead)
    if (cliCardHead) {
      cliCardHead.props.onClick()
      currentTree = await settle()
      const labels = buttonsOf(currentTree).map(textOf)
      check('subagent card keeps login & fetch-models buttons', (labels.includes(zh.cliLogin) || labels.includes(zh.cliRelogin)) && labels.includes(zh.cliFetchModels))
    }
    const advancedHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.advancedSection))
    check('advanced section card present', !!advancedHead)
    if (advancedHead) {
      advancedHead.props.onClick()
      currentTree = await settle()
      check('advanced section reveals oauth & pools', textOf(currentTree).includes(zh.oauthTitle) && textOf(currentTree).includes(zh.poolIntro))
    }
  }

  // ── 断言：添加账号（＋ 自定义）模型留空时自动从端点拉取并随配置写入 ──
  // 负向见证：旧行为直接写无 models 的 profile → 宿主 llm-pi-ai 校验器
  // 报 "resolves no models" 拒绝写入；新行为必须先探测端点（与 cc-switch
  // 同款 GET /models），拉到才写入，拉不到中止并给出指引。
  const accountAddCard = findAll(currentTree, (node) => hasClass(node, 'dshrouter-add')).find((node) => textOf(node).includes(zh.addAccount))
  check('account add card found', !!accountAddCard)
  if (accountAddCard) {
    accountAddCard.props.onClick()
    currentTree = await settle()
    const customChip = buttonsOf(currentTree).find((node) => textOf(node).includes(zh.accountCustom))
    check('account add custom chip found', !!customChip)
    if (customChip) {
      customChip.props.onClick()
      currentTree = await settle()
      const inputByLabel = (label) => findAll(currentTree, (node) => node && node.type === 'input' && node.props && node.props['aria-label'] === label)[0]
      const fillAdd = (provider, baseUrl, key, models) => {
        const providerInput = inputByLabel(zh.fieldProviderId)
        if (providerInput) providerInput.props.onChange({ target: { value: provider } })
        const keyInput = inputByLabel(zh.accountKey)
        if (keyInput) keyInput.props.onChange({ target: { value: key } })
        const urlInput = inputByLabel(zh.accountBaseUrl)
        if (urlInput) urlInput.props.onChange({ target: { value: baseUrl } })
        const modelsInput = inputByLabel(zh.accountModelsField)
        if (modelsInput) modelsInput.props.onChange({ target: { value: models } })
      }
      const submitAdd = async () => {
        currentTree = await settle()
        const addButton = buttonsOf(currentTree).find((node) => textOf(node) === zh.accountAddProvider)
        if (addButton) addButton.props.onClick()
        currentTree = await settle()
        return addButton
      }
      // 场景 1：模型留空 + 端点可达 → 保存时自动拉取并写入发现的模型。
      fillAdd('crazy-code', 'https://gateway.example/v1', 'sk-test', '')
      const ready1 = await submitAdd()
      check('account add submit ready', !!ready1)
      check('custom add probes endpoint once', discoverCalls.length === 1 && discoverCalls[0].settingsNs === 'llm-pi-ai' && discoverCalls[0].provider === 'crazy-code' && discoverCalls[0].baseURL === 'https://gateway.example/v1' && discoverCalls[0].api === 'openai-completions' && discoverCalls[0].apiKey === 'sk-test')
      const crazyWrite = mutateCalls.find((call) => call.ns === 'llm-pi-ai' && Array.isArray(call.ops) && call.ops[0] && call.ops[0].path[1] === 'crazy-code')
      check('custom add writes discovered models', !!crazyWrite && Array.isArray(crazyWrite.ops[0].value.models) && crazyWrite.ops[0].value.models.length === 2 && crazyWrite.ops[0].value.models[0].id === 'm-a' && crazyWrite.ops[0].value.models[1].id === 'm-b' && crazyWrite.ops[0].value.models[1].name === 'Model B' && crazyWrite.ops[0].value.models[1].contextWindow === 65536 && crazyWrite.ops[0].value.models[1].maxTokens === 4096 && crazyWrite.ops[0].value.apiKeyEnv === 'CRAZY_CODE_API_KEY' && crazyWrite.ops[0].value.defaultInput.join(',') === 'text,image' && crazyWrite.ops[0].value.api === 'openai-completions' && crazyWrite.ops[0].value.baseURL === 'https://gateway.example/v1')
      check('custom add stores credential', credSetCalls.some((call) => call.ref === 'CRAZY_CODE_API_KEY' && call.value === 'sk-test'))

      // 场景 2：手工填写模型 → 原样写入，不探测端点（保持旧行为）。
      fillAdd('manual-gw', 'https://manual.example/v1', '', 'gpt-x, gpt-y')
      const ready2 = await submitAdd()
      check('manual add submit ready', !!ready2)
      const manualWrite = mutateCalls.find((call) => call.ns === 'llm-pi-ai' && Array.isArray(call.ops) && call.ops[0] && call.ops[0].path[1] === 'manual-gw')
      check('manual models skip probe', discoverCalls.length === 1)
      check('manual models written verbatim', !!manualWrite && Array.isArray(manualWrite.ops[0].value.models) && manualWrite.ops[0].value.models.length === 2 && manualWrite.ops[0].value.models[0].id === 'gpt-x' && manualWrite.ops[0].value.models[1].id === 'gpt-y' && !('apiKeyEnv' in manualWrite.ops[0].value))

      // 场景 3：同名内置服务商（目录路由）模型留空 → 不探测、不写 models
      // （按目录默认模型服务），保持旧行为。
      fillAdd('openai', 'https://api.openai.com/v1', 'sk-o', '')
      const ready3 = await submitAdd()
      check('catalog overwrite submit ready', !!ready3)
      const openaiWrite = mutateCalls.find((call) => call.ns === 'llm-pi-ai' && Array.isArray(call.ops) && call.ops[0] && call.ops[0].path[1] === 'openai')
      check('catalog route overwrite skips probe', discoverCalls.length === 1)
      check('catalog route overwrite omits models', !!openaiWrite && !('models' in openaiWrite.ops[0].value) && openaiWrite.ops[0].value.apiKeyEnv === 'OPENAI_API_KEY')

      // 场景 4：端点不可达 → 中止写入并给出明确指引（绝不写半成品配置）。
      const beforeFailWrites = mutateCalls.length
      discoverMode = 'fail'
      fillAdd('broken-gw', 'https://broken.example/v1', '', '')
      const ready4 = await submitAdd()
      check('failed add submit ready', !!ready4)
      check('failed discovery aborts write', mutateCalls.length === beforeFailWrites && discoverCalls.length === 2)
      check('failed discovery shows guidance', textOf(currentTree).includes(zh.accountDiscoverFailed) && textOf(currentTree).includes(zh.accountModelsRequiredHint))
      discoverMode = 'ok'
    }
  }

  // ── 断言：账号卡片编辑——自定义路由清空模型时自动拉取并原子写入；
  //  拉取失败时保留现有模型（绝不写坏已生效的配置）────────────────────
  const gatewayHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-card-head')).find((node) => textOf(node).includes('gateway'))
  check('declared account card head found', !!gatewayHead)
  if (gatewayHead) {
    gatewayHead.props.onClick()
    currentTree = await settle()
    // 按头部按钮定位账号卡片：其他卡片展开后的内容（如 agent 卡片的服务商
    // datalist 选项 "Gateway (gateway)"）同样含该字样，必须锚定在头部。
    const gatewayCard = () => findAll(currentTree, (node) => node && node.type === 'div' && hasClass(node, 'dshrouter-card')).find((node) => {
      const head = (node.children ?? []).find((child) => child && child.type === 'button' && hasClass(child, 'dshrouter-card-head'))
      return !!head && textOf(head).includes('gateway')
    })
    // 账号卡片的模型输入框没有 aria-label（仅添加表单有）：在卡片子树内按
    // 值定位（profile 里既有模型渲染为 'old-m'）。
    const gatewayModelsInput = () => {
      const card = gatewayCard()
      return card ? findAll(card, (node) => node && node.type === 'input').find((node) => node.props && node.props.value === 'old-m') : null
    }
    const gatewaySave = () => {
      const card = gatewayCard()
      return card ? findAll(card, (node) => node && node.type === 'button').find((node) => textOf(node) === zh.save) : null
    }
    const gatewayInput = gatewayModelsInput()
    check('declared account models field shown', !!gatewayInput)
    if (gatewayInput) {
      // 清空模型字段后保存：自动拉取 → 模型与 Base URL 合并进同一次原子写入。
      gatewayInput.props.onChange({ target: { value: '' } })
      currentTree = await settle()
      const beforeEditWrites = mutateCalls.length
      const saveButton = gatewaySave()
      check('declared account save button found', !!saveButton)
      if (saveButton) {
        saveButton.props.onClick()
        currentTree = await settle()
        const lastDiscover = discoverCalls[discoverCalls.length - 1]
        check('edit probes endpoint for declared route', lastDiscover && lastDiscover.provider === 'gateway' && lastDiscover.baseURL === 'https://gateway.example/v1' && lastDiscover.api === 'openai-completions' && !('apiKey' in lastDiscover))
        const gatewayEditWrite = mutateCalls.slice(beforeEditWrites).find((call) => call.ns === 'llm-pi-ai')
        const modelsOp = gatewayEditWrite ? gatewayEditWrite.ops.find((op) => op.path[2] === 'models') : null
        check('edit writes discovered models atomically', !!gatewayEditWrite && gatewayEditWrite.ops.length >= 4 && !!modelsOp && modelsOp.op === 'set' && Array.isArray(modelsOp.value) && modelsOp.value.length === 2 && modelsOp.value[0].id === 'm-a' && modelsOp.value[1].id === 'm-b' && gatewayEditWrite.ops.some((op) => op.path[2] === 'baseURL' && op.value === 'https://gateway.example/v1'))
        check('edit notice reports discovery', textOf(currentTree).includes(zh.accountDiscovered(2)))

        // 负向见证：拉取失败时保留现有模型列表——本次写入不含 models 操作。
        discoverMode = 'fail'
        const beforeFailEdit = mutateCalls.length
        const inputAgain = gatewayModelsInput()
        if (inputAgain) inputAgain.props.onChange({ target: { value: '' } })
        currentTree = await settle()
        const saveAgain = gatewaySave()
        if (saveAgain) saveAgain.props.onClick()
        currentTree = await settle()
        const failEditWrite = mutateCalls.slice(beforeFailEdit).find((call) => call.ns === 'llm-pi-ai')
        check('failed edit keeps models', !!failEditWrite && !failEditWrite.ops.some((op) => op.path[2] === 'models') && failEditWrite.ops.some((op) => op.path[2] === 'baseURL'))
        check('failed edit notice kept models', textOf(currentTree).includes(zh.accountModelsKept) && textOf(currentTree).includes(zh.accountDiscoverFailed))
        discoverMode = 'ok'
      }
    }
  }

  // ── 断言：cli 子代理登录体验——未登录红色醒目提示 + 登录轮询状态机 ──
  // 负向见证：宿主 cliLogin 曾引用未定义的 agent（ReferenceError），登录
  // 按钮永远报失败、只有「刷新状态」能显示已登录；轮询成功后 loginBusy
  // 不复位、按钮永久卡「等待登录…」。以下断言覆盖：未登录红字、登录后
  // 轮询自动刷新为已登录且按钮复位、轮询耗尽给出红色超时提示且按钮复位。
  const subCard = () => findAll(currentTree, (node) => node && node.type === 'div' && hasClass(node, 'dshrouter-card')).find((node) => {
    const head = (node.children ?? []).find((child) => child && child.type === 'button' && hasClass(child, 'dshrouter-card-head'))
    return !!head && textOf(head).includes('codexentry')
  })
  const subButtons = () => {
    const card = subCard()
    return card ? findAll(card, (node) => node && node.type === 'button') : []
  }
  const subCardFound = !!subCard()
  check('subagent card found for login flow', subCardFound)
  if (subCardFound) {
    // 场景 1：未登录 → 刷新状态后 chip 与状态消息均为红色醒目样式。
    cliStatusMode = 'logged-out'
    const refreshButton = subButtons().find((node) => textOf(node) === zh.cliStatusRefresh)
    check('subagent refresh status button found', !!refreshButton)
    if (refreshButton) {
      refreshButton.props.onClick()
      currentTree = await settle()
      const card = subCard()
      const redChips = card ? findAll(card, (node) => node && node.type === 'span' && hasClass(node, 'dshrouter-error') && textOf(node).includes(zh.cliStatusLoggedOut)) : []
      check('logged-out chip rendered red', redChips.length > 0)
      const redMessages = card ? findAll(card, (node) => node && node.type === 'p' && hasClass(node, 'dshrouter-error') && textOf(node).includes('Not logged in')) : []
      check('logged-out status message rendered red', redMessages.length > 0)

      // 场景 2：点击登录 → 轮询立即成功 → chip 已登录 + 按钮复位为「重新登录」。
      cliStatusMode = 'ok'
      const loginButton = subButtons().find((node) => textOf(node) === zh.cliLogin)
      check('subagent login button found', !!loginButton)
      if (loginButton) {
        loginButton.props.onClick()
        currentTree = await settle(120)
        const after = subCard()
        const afterButtons = after ? findAll(after, (node) => node && node.type === 'button') : []
        check('login poll flips chip to logged in', !!after && textOf(after).includes(zh.cliStatusLoggedIn) && textOf(after).includes('已登录：已登录'))
        check('login button resets after success', afterButtons.some((node) => textOf(node) === zh.cliRelogin) && !afterButtons.some((node) => textOf(node) === zh.cliLoginWaiting))

        // 场景 3：轮询耗尽（20 次都未登录）→ 红色超时提示 + 按钮复位为「登录」。
        cliStatusMode = 'logged-out'
        const reloginButton = afterButtons.find((node) => textOf(node) === zh.cliRelogin)
        check('subagent relogin button found', !!reloginButton)
        if (reloginButton) {
          reloginButton.props.onClick()
          currentTree = await settle(200)
          const timedOut = subCard()
          const timedOutButtons = timedOut ? findAll(timedOut, (node) => node && node.type === 'button') : []
          const timeoutNotice = timedOut ? findAll(timedOut, (node) => node && node.type === 'p' && hasClass(node, 'dshrouter-error') && textOf(node).includes(zh.cliLoginTimeoutHint)) : []
          check('login poll timeout shows red hint', timeoutNotice.length > 0)
          check('timeout flips chip back to logged out', !!timedOut && textOf(timedOut).includes(zh.cliStatusLoggedOut))
          check('login button resets after timeout', timedOutButtons.some((node) => textOf(node) === zh.cliLogin) && !timedOutButtons.some((node) => textOf(node) === zh.cliLoginWaiting))
        }
      }
    }
    cliStatusMode = 'ok'
  }

  // ── 断言：对话框图片通路（composer 附件按钮 / route_agent 工具卡片）──
  // 负向见证：旧版本无附件按钮（宿主准入直接拒绝图片），route_agent 生成
  // 图片以真实图片块写入工具结果（文本模型历史被击穿）。
  const tOf = (key) => zh[key] ?? key
  const imageToolReg = registrationOf('conversation.input.right')
  const toolCardReg = registrationOf('tool.call.toolview')
  const conversationMock = {
    createDraftImages: (files) => files.map((file, index) => ({ id: `draft-${index}-${file.name}`, previewUrl: 'blob:preview', file })),
  }
  const inputActionsMock = { addImages: () => true }
  captured.imageDataCalls = []

  // 附件按钮：多模态开启（有视觉 agent）时渲染；仅有生图 agent 时隐藏——与接管同信号。
  {
    const tree = await renderInto(imageToolReg.render({ t: tOf, router: () => remoteMock, conversation: () => conversationMock, inputActions: inputActionsMock }), 'imagetool')
    const attachButton = findAll(tree, (node) => node && node.type === 'button' && node.props && node.props['aria-label'] === tOf('attach'))
    check('composer attach button renders with vision agent', attachButton.length === 1)
    // 生图 agent（draw，image 类型）也触发按钮显示——图生图需要发图。
    catalogMode = 'drawOnly'
    const listener = captured.listeners.find((entry) => entry.event === 'settings/document-updated')
    if (listener) listener.listener()
    const genTree = await renderInto(imageToolReg.render({ t: tOf, router: () => remoteMock, conversation: () => conversationMock, inputActions: inputActionsMock }), 'imagetool')
    const genButton = findAll(genTree, (node) => node && node.type === 'button' && node.props && node.props['aria-label'] === tOf('attach'))
    check('composer attach button renders with generation-only agent', genButton.length === 1)
    // 无任何多模态 agent → 按钮隐藏。
    catalogMode = 'none'
    if (listener) listener.listener()
    const hidden = await renderInto(imageToolReg.render({ t: tOf, router: () => remoteMock, conversation: () => conversationMock, inputActions: inputActionsMock }), 'imagetool')
    const attachHidden = findAll(hidden, (node) => node && node.type === 'button' && node.props && node.props['aria-label'] === tOf('attach'))
    check('composer attach button hidden without multimodal agent', attachHidden.length === 0)
    catalogMode = 'withVision'
    listener && listener.listener()
  }

  // F11 附件上传（v3 Step 8 / N-6）：attach 输入 accept 扩展非图片类型；非图片
  // 经 remote.uploadFile 上传（字节 base64）→ 成功渲染附件卡片 + 结构化路径文本
  // 经 inputActions.setDraft 追加进 draft；失败显示错误提示；图片文件仍走原生
  // addImages 原通道（uploadFile 不接管图片——避免双通道）。
  {
    const fileInputOf = (tree) => findAll(tree, (node) => node && node.type === 'input' && node.props && node.props.type === 'file')[0]
    const draftState = { value: '已有草稿文本' }
    const addImagesCalls = []
    const setDraftCalls = []
    const conversationUpload = {
      createDraftImages: (files) => files.map((file, index) => ({ id: `draft-${index}-${file.name}`, previewUrl: 'blob:preview', file })),
      releaseDraftImages: () => {},
    }
    const inputActionsUpload = {
      addImages: (ids) => { addImagesCalls.push(ids); return true },
      setDraft: (text) => { setDraftCalls.push(text) },
    }
    const f11Props = () => ({
      t: tOf,
      router: () => remoteMock,
      conversation: () => conversationUpload,
      inputActions: inputActionsUpload,
      useInput: (selector) => selector({ draft: draftState.value }),
    })
    catalogMode = 'withVision'
    const listener = captured.listeners.find((entry) => entry.event === 'settings/document-updated')
    if (listener) listener.listener()
    await new Promise((resolve) => setImmediate(resolve))
    captured.uploadFileCalls = []
    uploadFailMode = false
    const f11Tree = await renderInto(imageToolReg.render(f11Props()), 'imagetool-f11')
    const fileInput = fileInputOf(f11Tree)
    check('attach input accept extended to non-image', !!fileInput && typeof fileInput.props.accept === 'string' && fileInput.props.accept.includes('audio/') && fileInput.props.accept.includes('video/') && fileInput.props.accept.includes('.pdf'))
    // 上传成功：卡片渲染 + uploadFile RPC 载荷 + setDraft 追加路径文本。
    if (fileInput) {
      fileInput.props.onChange({ target: { files: [{ name: 'voice.wav', type: 'audio/wav', _base64: 'aGVsbG8=' }], value: '' } })
      currentTree = await settle()
      const cards = findAll(currentTree, (node) => hasClass(node, 'dshrouter-attachcard'))
      check('upload success renders attachment card', cards.length === 1 && textOf(cards[0]).includes('voice.wav') && textOf(cards[0]).includes('.router-files/voice.wav'))
      check('uploadFile RPC called with name/mediaType/base64', captured.uploadFileCalls.length === 1 && captured.uploadFileCalls[0].name === 'voice.wav' && captured.uploadFileCalls[0].mediaType === 'audio/wav' && captured.uploadFileCalls[0].dataBase64 === 'aGVsbG8=')
      check('upload success appends path text via setDraft', setDraftCalls.length === 1 && setDraftCalls[0].startsWith('已有草稿文本') && setDraftCalls[0].includes('[附件: 音频 voice.wav 路径 .router-files/voice.wav]'))
      // 上传失败：同一组件实例上失败（先成功已渲染 1 张卡）→ 错误提示渲染
      // （错误码可见）且不追加卡片（判别：卡片数保持 1——旧断言在全新实例上
      // 断言空 cards 恒真，无判别力，F-05）。
      uploadFailMode = true
      const failInput = fileInputOf(currentTree)
      if (failInput) {
        failInput.props.onChange({ target: { files: [{ name: 'big.bin', type: 'application/octet-stream', _base64: 'Ymln' }], value: '' } })
        currentTree = await settle()
        const failCards = findAll(currentTree, (node) => hasClass(node, 'dshrouter-attachcard'))
        check('upload failure shows error without extra card', failCards.length === 1 && textOf(currentTree).includes('FILE_TOO_LARGE'))
      }
      uploadFailMode = false
      // 图片 + 视频混选：图片仍走原生 addImages（不进 uploadFile），视频走 uploadFile。
      const mixedTree = await renderInto(imageToolReg.render(f11Props()), 'imagetool-f11-mixed')
      const mixedInput = fileInputOf(mixedTree)
      if (mixedInput) {
        mixedInput.props.onChange({ target: { files: [
          { name: 'shot.png', type: 'image/png', _base64: 'aGk=' },
          { name: 'clip.mp4', type: 'video/mp4', _base64: 'bXA0' },
        ], value: '' } })
        currentTree = await settle()
        check('image routes to native addImages, video to uploadFile', addImagesCalls.length === 1 && addImagesCalls[0][0] === 'draft-0-shot.png' && captured.uploadFileCalls.some((call) => call.name === 'clip.mp4') && captured.uploadFileCalls.some((call) => call.name === 'clip.mp4' && call.mediaType === 'video/mp4'))
      }
      // F-01（P1 回归）：多非图片文件一次选选 → 全部路径文本累积后一次 setDraft
      // （旧实现逐文件整体覆盖渲染期快照，除最后一项外全部路径文本丢失）。
      const multiBefore = setDraftCalls.length
      const multiTree = await renderInto(imageToolReg.render(f11Props()), 'imagetool-f11-multi')
      const multiInput = fileInputOf(multiTree)
      if (multiInput) {
        multiInput.props.onChange({ target: { files: [
          { name: 'notes.doc', type: 'application/msword', _base64: 'YQ==' },
          { name: 'data.csv', type: 'text/csv', _base64: 'Yg==' },
        ], value: '' } })
        currentTree = await settle()
        const multiDrafts = setDraftCalls.slice(multiBefore)
        const multiCards = findAll(currentTree, (node) => hasClass(node, 'dshrouter-attachcard'))
        check('multi non-image upload accumulates all paths in one setDraft', multiDrafts.length === 1 && multiCards.length === 2 && multiDrafts[0].startsWith('已有草稿文本') && multiDrafts[0].includes('[附件: 文档 notes.doc 路径 .router-files/notes.doc]') && multiDrafts[0].includes('[附件: 文档 data.csv 路径 .router-files/data.csv]'))
      }
    }
    catalogMode = 'withVision'
  }

  // 模型接管（无 UI 条目）：视觉开启 → 自动切包装组；已接管幂等；关闭 → 切回原 provider。
  {
    const takeoverReg = captured.registrations.find((reg) => reg && reg.id === 'router-model-takeover')
    check('model takeover entry registered', !!takeoverReg)
    if (takeoverReg) {
      const listener = captured.listeners.find((entry) => entry.event === 'settings/document-updated')
      // 开启接管：纯文本当前选中 → 自动切到包装组。
      sessionCurrent = { provider: 'openai', model: 'gpt-4o' }
      sessionSelectCalls.length = 0
      await renderInto(takeoverReg.render({ sessionId: 'sess-1', input: { imageIds: [] }, api: apiMock }), 'takeover')
      check('takeover switches to wrap route', sessionSelectCalls.some((call) => call.provider === 'openai-router' && call.model === 'gpt-4o'))
      // 已接管：草稿变化（如贴图）重渲染不重复切（幂等，零竞态）。
      const before = sessionSelectCalls.length
      await renderInto(takeoverReg.render({ sessionId: 'sess-1', input: { imageIds: ['draft-1'] }, api: apiMock }), 'takeover')
      check('takeover idempotent when already wrapped', sessionSelectCalls.length === before)
      // 关闭全部多模态 agent：包装组当前选中 → 切回原 provider。
      sessionCurrent = { provider: 'openai-router', model: 'gpt-4o' }
      sessionSelectCalls.length = 0
      catalogMode = 'none'
      listener && listener.listener()
      await new Promise((resolve) => setImmediate(resolve))
      await renderInto(takeoverReg.render({ sessionId: 'sess-1', input: { imageIds: [] }, api: apiMock }), 'takeover')
      check('takeover restores original provider on disable', sessionSelectCalls.some((call) => call.provider === 'openai' && call.model === 'gpt-4o'))
      catalogMode = 'withVision'
      listener && listener.listener()
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  // FIX-002-R7 F3：开关关闭（takeoverDefaultModel=false）判别双断言组——既有
  // fixture 恒 true，接管断言在"armed 只看多模态 agent"的旧客户端代码下全过
  // （零判别覆盖）。每条断言的"旧代码下必败"推演见各处注释。
  {
    const takeoverReg = captured.registrations.find((reg) => reg && reg.id === 'router-model-takeover')
    if (takeoverReg) {
      const listener = captured.listeners.find((entry) => entry.event === 'settings/document-updated')
      takeoverSwitch = false
      if (listener) listener.listener()
      await new Promise((resolve) => setImmediate(resolve))
      // ① 开关 false → 会话级不接管：会话停在原生 provider，effect 触发后零
      //    selectModel。旧代码推演（无 catalog.takeoverDefaultModel 门控 →
      //    armed=true）：armed && !wrapped → selectModel('openai-router') →
      //    length===0 必败 → 判别成立。
      sessionCurrent = { provider: 'openai', model: 'gpt-4o' }
      sessionSelectCalls.length = 0
      await renderInto(takeoverReg.render({ sessionId: 'sess-off', input: { imageIds: [] }, api: apiMock }), 'takeover-off')
      check('takeover off: no session takeover without switch (F3-1)', sessionSelectCalls.length === 0)
      // ② 开关 false → 不撤销用户手动选的 twin：挂载 / 贴图（imageCount 0→1）/
      //    会话切换（新 sessionId，子代理场景）三类 effect 触发均零 selectModel。
      //    F1 修复前代码推演（!armed && wrapped 无来源记忆 → 每次触发直接还原）：
      //    每次触发 selectModel('openai') 剥回原生 → length===0 必败 → 判别成立
      //    （拦住 F1 的断言）。每次触发前重置 sessionCurrent 为 twin + 清空调用
      //    记录，保证三类触发各自独立判别（旧代码下三条全部失败）。
      //    挂载断言用全新实例（prefix 'takeover-off-2'）——与 F3-1 同实例同 deps
      //    的渲染不会重跑 effect（deps 去重语义），那会退化成 vacuous pass。
      const manualTwin = () => { sessionCurrent = { provider: 'openai-router', model: 'gpt-4o' }; sessionSelectCalls.length = 0 }
      manualTwin()
      await renderInto(takeoverReg.render({ sessionId: 'sess-off', input: { imageIds: [] }, api: apiMock }), 'takeover-off-2')
      check('takeover off: manual twin untouched on mount (F3-2)', sessionSelectCalls.length === 0)
      manualTwin()
      await renderInto(takeoverReg.render({ sessionId: 'sess-off', input: { imageIds: ['draft-9'] }, api: apiMock }), 'takeover-off-2')
      check('takeover off: paste does not revoke manual twin (F3-2)', sessionSelectCalls.length === 0)
      manualTwin()
      await renderInto(takeoverReg.render({ sessionId: 'sess-off-2', input: { imageIds: [] }, api: apiMock }), 'takeover-off-2')
      check('takeover off: session switch does not revoke manual twin (F3-2)', sessionSelectCalls.length === 0)
      takeoverSwitch = true
      if (listener) listener.listener()
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  // EVO-002 Step 6：ChatGPT 实验区（§3.6 默认关闭 + ToS 显式确认 + preset
  // 账号卡 + W-5 删除联动）。判别性推演：断言 ②③④⑤⑥ 在"无实验区/无 ToS
  // 门/无登出联动"的旧客户端代码下必败——旧代码不渲染 experimentalSwitch/
  // presetAdd/presetLogin/presetLogout/presetDelete 元素（findAll 查空 →
  // undefined 分支跳过点击 → 捕获数组为空 → 断言失败），saveOps 亦无
  // oauthExperimental/oauthTosAccepted/pools 清理 op。
  {
    const settingsReg6 = captured.registrations.find((reg) => reg && reg.name === 'settings.section')
    const listener6 = captured.listeners.find((entry) => entry.event === 'settings/document-updated')
    const renderSettings6 = async (prefix) => {
      const tree6 = await renderInto(settingsReg6.render({ api: apiMock, remote: () => remoteMock, remoteReady: Promise.resolve(), t: tOf, $on: () => () => {} }), prefix)
      // 两级折叠（分类卡头为 dshrouter-category-head）：多模态账号区 → 高级扩展。
      const heads6 = findAll(tree6, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head'))
      const accountsHead6 = heads6.find((node) => textOf(node).includes(tOf('accountTitle')))
      if (accountsHead6) accountsHead6.props.onClick()
      const tree6b = await settle()
      const heads6b = findAll(tree6b, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head'))
      const advHead6 = heads6b.find((node) => textOf(node).includes(tOf('advancedSection')))
      if (advHead6) advHead6.props.onClick()
      return settle()
    }
    const experimentalSwitchOf = (tree) => {
      // checkbox 自身无子文本（label 文本在其兄弟位置）——先按 label 文本定位
      // dshrouter-switch，再取其 input 子节点。
      const label6 = findAll(tree, (node) => hasClass(node, 'dshrouter-switch') && textOf(node).includes(tOf('experimentalSwitch')))[0]
      return label6 ? (label6.children ?? []).find((child) => child && child.type === 'input') : undefined
    }
    // ① 默认关闭：开关未勾选 + preset 入口隐藏（§3.6 默认关闭）。
    {
      const tree6 = await renderSettings6('step6-off')
      const switch6 = experimentalSwitchOf(tree6)
      check('step6: experimental switch off by default (§3.6)', !!switch6 && switch6.props.checked === false)
      check('step6: preset entry hidden while off (§3.6)', !textOf(tree6).includes(tOf('presetAdd')) && !textOf(tree6).includes(tOf('presetLogin')))
    }
    // ② ToS 拒绝 → 不写开关；③ 接受 → oauthExperimental + oauthTosAccepted
    //    两 op 同时落（服务端 begin 复核的数据面）。
    {
      const tree6 = await renderSettings6('step6-tos')
      confirmMode = false
      captured.saveOps.length = 0
      const switch6 = experimentalSwitchOf(tree6)
      if (switch6) switch6.props.onChange({ target: { checked: true } })
      await settle()
      check('step6: ToS declined leaves switch untouched', captured.saveOps.filter((op) => (op.path ?? []).includes('oauthExperimental')).length === 0)
      confirmMode = true
      const switch6b = experimentalSwitchOf(currentTree)
      captured.saveOps.length = 0
      if (switch6b) switch6b.props.onChange({ target: { checked: true } })
      await settle()
      const ops6 = captured.saveOps.filter((op) => op.path[0] === 'oauthExperimental' || op.path[0] === 'oauthTosAccepted')
      check('step6: ToS accepted persists switch + acceptance together', ops6.length === 2 && ops6.every((op) => op.value === true))
      experimentalOn = true
      presetMode = 'logged-out'
      if (listener6) listener6.listener()
      await new Promise((resolve) => setImmediate(resolve))
    }
    // ④ 开启后：preset 账号卡（登录按钮）+ 添加入口可见。
    {
      const tree6 = await renderSettings6('step6-on')
      check('step6: preset card renders with login button', textOf(tree6).includes(tOf('presetLogin')) && textOf(tree6).includes('chatgpt'))
      check('step6: preset add entry visible when on', textOf(tree6).includes(tOf('presetAdd')))
      // ⑤ 登录点击 → oauthBegin（preset 分支）→ 授权页弹窗（open 捕获）。
      captured.beginCalls.length = 0
      captured.openCalls.length = 0
      const loginBtn6 = buttonsOf(tree6).find((node) => textOf(node) === tOf('presetLogin'))
      if (loginBtn6) loginBtn6.props.onClick()
      await settle()
      check('step6: login click fires oauthBegin for preset account', captured.beginCalls.length === 1 && captured.beginCalls[0]?.accountId === 'chatgpt')
      check('step6: login opens authorization popup url', captured.openCalls.length === 1 && captured.openCalls[0].includes('auth.openai.com'))
    }
    // ⑥ 登出（§3.6 凭据删除路径）+ 删除账号（W-5：凭据删除 + 池引用清理
    //    + 账号 unset 三步一次完成）。
    {
      presetMode = 'logged-in'
      if (listener6) listener6.listener()
      await new Promise((resolve) => setImmediate(resolve))
      const tree6 = await renderSettings6('step6-logout')
      captured.oauthLogoutCalls.length = 0
      const logoutBtn6 = buttonsOf(tree6).find((node) => textOf(node) === tOf('presetLogout'))
      if (logoutBtn6) logoutBtn6.props.onClick()
      await settle()
      check('step6: logout click fires oauthLogout (credential deletion)', captured.oauthLogoutCalls.length === 1 && captured.oauthLogoutCalls[0]?.accountId === 'chatgpt')
      captured.saveOps.length = 0
      captured.oauthLogoutCalls.length = 0
      const delBtn6 = buttonsOf(tree6).find((node) => textOf(node) === tOf('presetDelete'))
      if (delBtn6) delBtn6.props.onClick()
      await settle()
      const poolOps6 = captured.saveOps.filter((op) => op.path.join('/') === 'pools/main/accounts')
      const unsetOps6 = captured.saveOps.filter((op) => op.op === 'unset' && op.path.join('/') === 'oauthAccounts/chatgpt')
      check('step6: delete cleans credential + pool refs + entry (W-5)', captured.oauthLogoutCalls.length === 1 && poolOps6.length === 1 && Array.isArray(poolOps6[0].value) && poolOps6[0].value.length === 0 && unsetOps6.length === 1)
    }
    // ── EVO-002 Step 7：R7 收尾（F1 渲染过滤 / F4 吞错 / F2 成功文案）──
    // 判别性：F1 旧代码通用区 summary 含 preset 账号（计数 1）→ 断言 (0) 必败；
    // F4 旧代码忽略 ok:false 继续 unset + 弹成功提示 → 断言 unset 缺席 + 失败
    // 文案必败；F2 旧代码复用 oauthTokenBack → 断言 presetDeleted 必败。
    {
      const tree7 = await renderSettings6('step7-f1')
      check('step7: generic oauth area excludes preset accounts (R7-F1)', textOf(tree7).includes(tOf('oauthSummary')(0)))
      // F4：oauthLogout 返回 ok:false → 账号条目保留（可重试）+ 展示失败消息。
      logoutFailMode = true
      captured.oauthLogoutCalls.length = 0
      captured.saveOps.length = 0
      const delFail7 = buttonsOf(tree7).find((node) => textOf(node) === tOf('presetDelete'))
      if (delFail7) delFail7.props.onClick()
      await settle()
      const unsetFail7 = captured.saveOps.filter((op) => op.op === 'unset' && op.path.join('/') === 'oauthAccounts/chatgpt')
      check('step7: logout failure keeps account entry (retry path, R7-F4)', captured.oauthLogoutCalls.length === 1 && unsetFail7.length === 0)
      check('step7: logout failure surfaces error message (R7-F4)', textOf(currentTree).includes('登出失败'))
      // F2：成功删除后提示用 presetDeleted 文案（非 oauthTokenBack）。
      logoutFailMode = false
      captured.saveOps.length = 0
      const delOk7 = buttonsOf(currentTree).find((node) => textOf(node) === tOf('presetDelete'))
      if (delOk7) delOk7.props.onClick()
      await settle()
      check('step7: delete success notice uses presetDeleted copy (R7-F2)', textOf(currentTree).includes(tOf('presetDeleted')) && !textOf(currentTree).includes(tOf('oauthTokenBack')))
      logoutFailMode = false
    }
    // 复位（不污染后续块）。
    experimentalOn = false
    presetMode = 'none'
    confirmMode = true
    if (listener6) listener6.listener()
    await new Promise((resolve) => setImmediate(resolve))
  }

  // route_agent 工具卡片：解析标记渲染缩略图；兼容旧会话真实图片块；运行态显示处理中。
  {
    const settledBlock = {
      kind: 'tool-result',
      seq: 1,
      time: 1,
      callId: 'c1',
      call: { name: 'route_agent', argsRaw: '{"agent":"draw"}' },
      callTime: 1,
      content: [
        { type: 'text', text: '已生成图片（1024x1024）\n[router:image:{"attachmentId":"sha256:tv","mediaType":"image/png","bytes":4,"width":2,"height":2,"name":"router-draw.png"}]' },
        { type: 'text', text: '[openai/dall-e-3 · 输入 0 / 输出 0 tokens]' },
        { type: 'image', attachment: { attachmentId: 'sha256:old', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } },
      ],
      isError: false,
      subCalls: [],
    }
    const tree = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: settledBlock }), 'toolcard')
    const imgs = findAll(tree, (node) => node && node.type === 'img')
    check('tool card renders marker images', imgs.length === 2 && imgs.some((img) => img.props && img.props.src === 'data:image/png;base64,aGk='))
    check('tool card hides marker text', !textOf(tree).includes('[router:image:') && textOf(tree).includes('已生成图片'))
    check('tool card loads legacy image blocks', captured.imageDataCalls.some((call) => call.ref && call.ref.attachmentId === 'sha256:old') && captured.imageDataCalls.some((call) => call.ref && call.ref.attachmentId === 'sha256:tv'))
    const runningBlock = { callId: 'c2', name: 'route_agent', argsRaw: '{}', turn: 1, step: 1, time: 1, callView: null, subCalls: [] }
    const running = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: runningBlock }), 'toolcard-running')
    check('tool card running state', textOf(running).includes(tOf('toolRunning')))
    // 错误结果：展示错误文案，不渲染图片。
    const failedBlock = { ...settledBlock, isError: true, error: { name: 'Error', code: 'X' } }
    const failed = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: failedBlock }), 'toolcard-failed')
    check('tool card error state', textOf(failed).includes(tOf('statsFail')))
  }

  // v3 Step 9（三级展示 L3 / N-7）：route_agent 工具卡片 L3——调用参数 filePath /
  // files（非 URL 条目）→ 路径文本 + 「打开文件」→ remote.readWorkspaceFile →
  // blob 预览（audio/video 原生标签兜底，V-DSH-3 降级路径 / 其他类型下载）；
  // 打开失败显示错误码可重试。L1/L2 gallery 形态：多图并排容器（对齐宿主
  // ImageGallery 语义，同构实现——不强求 import 宿主组件）。
  {
    const l3Block = {
      kind: 'tool-result',
      seq: 3,
      time: 3,
      callId: 'c3',
      call: { name: 'route_agent', argsRaw: '{"agent":"speech","task":"转写这段音频","filePath":".router-files/voice.wav"}' },
      callTime: 3,
      content: [{ type: 'text', text: '转写完成：你好' }],
      isError: false,
      subCalls: [],
    }
    const openButtonsOf = (tree) => findAll(tree, (node) => node && node.type === 'button' && textOf(node).includes(tOf('openFile')))
    captured.readWorkspaceFileCalls = []
    readFileFailMode = false
    const l3Tree = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: l3Block }), 'toolcard-l3')
    const pathRows = findAll(l3Tree, (node) => hasClass(node, 'dshrouter-toolpath'))
    check('tool card renders L3 path text', pathRows.length === 1 && textOf(pathRows[0]).includes('.router-files/voice.wav'))
    const openButtons = openButtonsOf(l3Tree)
    check('tool card renders open-file button', openButtons.length === 1)
    if (openButtons.length === 1) {
      openButtons[0].props.onClick()
      currentTree = await settle()
      check('open-file calls readWorkspaceFile with path', captured.readWorkspaceFileCalls.length === 1 && captured.readWorkspaceFileCalls[0].path === '.router-files/voice.wav')
      const audios = findAll(currentTree, (node) => node && node.type === 'audio')
      check('audio player renders with blob source (native fallback)', audios.length === 1 && audios[0].props && audios[0].props.controls === true && typeof audios[0].props.src === 'string' && audios[0].props.src.startsWith('blob:'))
    }
    // 打开失败：错误码提示渲染（可重试），不渲染播放器。
    readFileFailMode = true
    captured.readWorkspaceFileCalls = []
    const failTree = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: l3Block }), 'toolcard-l3-fail')
    const failButtons = openButtonsOf(failTree)
    if (failButtons.length === 1) {
      failButtons[0].props.onClick()
      currentTree = await settle()
      check('open-file failure shows code without player', textOf(currentTree).includes('PATH_OUTSIDE_WORKSPACE') && findAll(currentTree, (node) => node.type === 'audio').length === 0)
    }
    readFileFailMode = false
    // 视频 → <video controls>；二进制/文档 → 下载链接；URL 条目不产生 L3 行。
    const mixedBlock = { ...l3Block, call: { name: 'route_agent', argsRaw: '{"agent":"vision","task":"处理文件","files":[".router-files/clip.mp4",".router-files/notes.doc","https://example.com/x.png"]}' } }
    captured.readWorkspaceFileCalls = []
    const mixedTree = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: mixedBlock }), 'toolcard-l3-mixed')
    const mixedPaths = findAll(mixedTree, (node) => hasClass(node, 'dshrouter-toolpath'))
    check('L3 files list skips URL entries', mixedPaths.length === 2)
    const mixedButtons = openButtonsOf(mixedTree)
    check('L3 renders open-file per file', mixedButtons.length === 2)
    if (mixedButtons.length === 2) {
      mixedButtons[0].props.onClick()
      currentTree = await settle()
      const videos = findAll(currentTree, (node) => node && node.type === 'video')
      check('video renders with native controls', videos.length === 1 && videos[0].props && videos[0].props.controls === true && typeof videos[0].props.src === 'string' && videos[0].props.src.startsWith('blob:'))
      const second = openButtonsOf(currentTree)
      if (second.length > 0) {
        second[0].props.onClick()
        currentTree = await settle()
        const links = findAll(currentTree, (node) => node && node.type === 'a' && typeof node.props?.download === 'string')
        check('binary/doc renders download link', links.length === 1 && links[0].props.href && links[0].props.href.startsWith('blob:') && links[0].props.download === 'notes.doc')
      }
    }
    // L1/L2 gallery 形态：多图并排容器（两张图：标记 + 旧会话真实图片块）。
    const galleryBlock = {
      kind: 'tool-result',
      seq: 4,
      time: 4,
      callId: 'c4',
      call: { name: 'route_agent', argsRaw: '{"agent":"draw"}' },
      callTime: 4,
      content: [
        { type: 'text', text: '已生成图片（1024x1024）\n[router:image:{"attachmentId":"sha256:tv","mediaType":"image/png","bytes":4,"width":2,"height":2,"name":"router-draw.png"}]' },
        { type: 'image', attachment: { attachmentId: 'sha256:old', mediaType: 'image/png', bytes: 4, width: 2, height: 2 } },
      ],
      isError: false,
      subCalls: [],
    }
    const galleryTree = await renderInto(toolCardReg.render({ t: tOf, router: () => remoteMock, block: galleryBlock }), 'toolcard-gallery')
    const gallery = findAll(galleryTree, (node) => hasClass(node, 'dshrouter-toolgallery'))
    check('tool card renders image gallery container', gallery.length === 1)
  }

  // ── 断言：R8-F1（EVO-004）未知 preset 值账号判据统一 ────────────────────
  // 旧代码：通用区宽判据（非空 preset 即排除）+ 预设卡严格成员
  // （preset === 'chatgpt-codex'）→ 非成员 preset（'zzz'）账号无任何渲染
  // 入口（UI 黑箱 + 删除死锁——服务端成员校验拒删）。修复后：非成员 preset
  // 回落到通用 OAuth 卡（可删——非成员账号无独立凭据文件，通用删除安全）。
  // 独立渲染设置页（不扰动前面断言的展开态）。
  {
    unknownPresetMode = true
    presetMode = 'none'
    experimentalOn = false
    await renderInto(settingsReg.render({ api: apiMock, remote: () => remoteMock, remoteReady: Promise.resolve(), t: (key) => zh[key] ?? key, $on: () => () => {} }), 'settings-r8f1', 60)
    const acctHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.accountTitle))
    check('R8-F1 accounts category head present', !!acctHead)
    if (acctHead) {
      acctHead.props.onClick()
      currentTree = await settle()
      const advHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.advancedSection))
      if (advHead) {
        advHead.props.onClick()
        currentTree = await settle()
        check('unknown-preset account falls back to generic oauth card (R8-F1)', textOf(currentTree).includes('怪异账号') && textOf(currentTree).includes('weird'))
      }
    }
    unknownPresetMode = false
    presetMode = 'none'
    experimentalOn = false
  }

  // ── 断言：①（EVO-004 出口②）按天视图 UI 面——stats.days 按天聚合表 ────
  // 旧代码 statsBody 只渲染 totals/series/recent，无 stats.days 消费面（UI 面
  // 零改动）→ 本组断言必败。构造：remoteMock.stats 返回 days（两日期聚合）。
  {
    experimentalOn = false
    presetMode = 'none'
    unknownPresetMode = false
    await renderInto(settingsReg.render({ api: apiMock, remote: () => remoteMock, remoteReady: Promise.resolve(), t: (key) => zh[key] ?? key, $on: () => () => {} }), 'settings-daily', 60)
    const statsHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.statsTitle))
    check('daily-view stats category head present', !!statsHead)
    if (statsHead) {
      statsHead.props.onClick()
      currentTree = await settle()
      check('daily view renders by-day aggregate table (①)', textOf(currentTree).includes(zh.statsDayLevel) && textOf(currentTree).includes('2026-01-15') && textOf(currentTree).includes('2026-01-16'))
      check('daily view rows carry day call counts', textOf(currentTree).includes('3') && textOf(currentTree).includes('2'))
    }
  }

  // ── 断言：②（EVO-004 出口⑤）导出按钮 UI 面——statsExport RPC + CSV 下载
  // 旧代码 statsBody 无导出按钮（UI 面零改动）→ 本组断言必败。
  {
    experimentalOn = false
    presetMode = 'none'
    unknownPresetMode = false
    captured.statsExportCalls = []
    captured.openCalls = []
    await renderInto(settingsReg.render({ api: apiMock, remote: () => remoteMock, remoteReady: Promise.resolve(), t: (key) => zh[key] ?? key, $on: () => () => {} }), 'settings-export', 60)
    const statsHead = findAll(currentTree, (node) => node && node.type === 'button' && hasClass(node, 'dshrouter-category-head')).find((node) => textOf(node).includes(zh.statsTitle))
    if (statsHead) {
      statsHead.props.onClick()
      currentTree = await settle()
      const exportButton = buttonsOf(currentTree).find((node) => textOf(node) === zh.statsExport)
      check('export button renders in stats panel (②)', !!exportButton)
      if (exportButton) {
        exportButton.props.onClick()
        currentTree = await settle()
        check('export triggers statsExport RPC with range/level', captured.statsExportCalls.length === 1 && captured.statsExportCalls[0].range === '7d' && captured.statsExportCalls[0].level === 'agent')
        check('export downloads CSV via data: URL (②)', captured.openCalls.some((url) => url.startsWith('data:text/csv;charset=utf-8,') && decodeURIComponent(url.split(',')[1]).includes('date,agent,account,model')))
      }
    }
  }
}
