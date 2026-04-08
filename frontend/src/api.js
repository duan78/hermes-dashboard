const API_BASE = '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('hermes_token') || '';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth-required'));
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Overview
  getOverview: () => request('/overview'),
  getLogs: (lines = 100) => request(`/overview/logs?lines=${lines}`),
  getSystemMetrics: () => request('/overview/system'),
  hermesVersion: () => request('/overview/version'),
  hermesUpdate: () => request('/overview/update', { method: 'POST' }),
  hermesChangelog: () => request('/overview/changelog'),

  // Config
  getConfig: () => request('/config'),
  saveConfig: (yaml) => request('/config', { method: 'PUT', body: JSON.stringify({ yaml }) }),
  saveStructuredConfig: (config) => request('/config/structured', { method: 'PUT', body: JSON.stringify(config) }),
  getConfigSections: () => request('/config/sections'),
  setConfigValue: (key, value) => request('/config/set', { method: 'POST', body: JSON.stringify({ key, value }) }),
  updateConfigValue: (key, value) => request('/config/update', { method: 'POST', body: JSON.stringify({ key, value }) }),

  // Sessions
  listSessions: () => request('/sessions'),
  searchSessions: (q) => request(`/sessions/search?q=${encodeURIComponent(q)}`),
  getSession: (id) => request(`/sessions/${id}`),
  deleteSession: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),
  pruneSessions: (days = 30) => request(`/sessions/prune?days=${days}`, { method: 'POST' }),
  getSessionStats: () => request('/sessions/stats'),
  exportSession: (id) => request(`/sessions/${id}/export`),

  // Memory & SOUL
  getSoul: () => request('/memory/soul'),
  saveSoul: (content) => request('/memory/soul', { method: 'PUT', body: JSON.stringify({ content }) }),
  getMemory: () => request('/memory/memory'),
  saveMemory: (content) => request('/memory/memory', { method: 'PUT', body: JSON.stringify({ content }) }),
  listMemoryFiles: () => request('/memory/files'),
  getMemoryFile: (name) => request(`/memory/files/${name}`),
  saveMemoryFile: (name, content) => request(`/memory/files/${name}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  // Memory CRUD (new)
  listAllFiles: () => request('/memory/all'),
  readFile: (path) => request(`/memory/read?path=${encodeURIComponent(path)}`),
  saveFile: (path, content) => request('/memory/save', { method: 'POST', body: JSON.stringify({ path, content }) }),
  createFile: (name) => request('/memory/create', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteFile: (path) => request('/memory/delete', { method: 'DELETE', body: JSON.stringify({ path }) }),

  // Vector Memory (LanceDB)
  vectorMemoryAvailable: () => request('/memory/vector/available'),
  vectorMemoryStats: () => request('/memory/vector/stats'),
  vectorMemoryList: (limit = 50, source = 'all') => request(`/memory/vector/list?limit=${limit}&source=${encodeURIComponent(source)}`),
  vectorMemorySearch: (query, topK = 10) => request(`/memory/vector/search?q=${encodeURIComponent(query)}&top_k=${topK}`),
  vectorMemoryStore: (text, source = 'manual', metadata = null) => request('/memory/vector/store', { method: 'POST', body: JSON.stringify({ text, source, metadata }) }),
  vectorMemoryDelete: (memoryId) => request('/memory/vector/delete', { method: 'DELETE', body: JSON.stringify({ memory_id: memoryId }) }),
  vectorMemoryUsage: () => request('/memory/vector/usage'),

  // Honcho Memory
  honchoStatus: () => request('/memory/honcho/status'),
  honchoStats: () => request('/memory/honcho/stats'),
  honchoProfile: () => request('/memory/honcho/profile'),
  honchoMemories: (limit = 50) => request(`/memory/honcho/memories?limit=${limit}`),
  honchoSearch: (query, topK = 10) => request(`/memory/honcho/search?q=${encodeURIComponent(query)}&top_k=${topK}`),

  // Tools
  listTools: () => request('/tools'),
  listToolsPlatform: (platform) => request(`/tools/${platform}`),
  enableTool: (tool, platform = 'cli') => request('/tools/enable', { method: 'POST', body: JSON.stringify({ tool, platform }) }),
  disableTool: (tool, platform = 'cli') => request('/tools/disable', { method: 'POST', body: JSON.stringify({ tool, platform }) }),
  getToolConfig: () => request('/tools/config'),
  setToolEnv: (key, value, configKey, configValue) => request('/tools/config/set-env', { method: 'POST', body: JSON.stringify({ key, value, config_key: configKey, config_value: configValue }) }),

  // Skills
  listSkills: () => request('/skills'),
  listSkillsDetailed: () => request('/skills/list'),
  browseSkills: (query = '') => request(`/skills/browse${query ? `?query=${encodeURIComponent(query)}` : ''}`),
  inspectSkill: (name) => request(`/skills/inspect/${name}`),
  skillDetail: (name) => request(`/skills/detail/${encodeURIComponent(name)}`),
  installSkill: (name) => request('/skills/install', { method: 'POST', body: JSON.stringify({ name }) }),
  uninstallSkill: (name) => request('/skills/uninstall', { method: 'POST', body: JSON.stringify({ name }) }),
  browseRegistry: (page = 1, size = 20, source = 'all', query = '') => {
    const params = new URLSearchParams({ page, size, source })
    if (query) params.set('query', query)
    return request(`/skills/registry?${params}`)
  },
  inspectRegistrySkill: (name) => request(`/skills/registry/inspect/${encodeURIComponent(name)}`),

  // Cron
  listCronJobs: () => request('/cron'),
  createCronJob: (schedule, prompt, name = '') => request('/cron', { method: 'POST', body: JSON.stringify({ schedule, prompt, name }) }),
  getCronJob: (id) => request(`/cron/${id}`),
  pauseCronJob: (id) => request(`/cron/${id}/pause`, { method: 'POST' }),
  resumeCronJob: (id) => request(`/cron/${id}/resume`, { method: 'POST' }),
  runCronJob: (id) => request(`/cron/${id}/run`, { method: 'POST' }),
  deleteCronJob: (id) => request(`/cron/${id}`, { method: 'DELETE' }),

  // Models
  getCurrentModel: () => request('/models'),
  getAvailableModels: () => request('/models/available'),
  switchModel: (model, provider) => request('/models/switch', { method: 'POST', body: JSON.stringify({ model, provider }) }),

  // Platforms
  getPlatformsStatus: () => request('/platforms/status'),
  getChannels: () => request('/platforms/channels'),
  listPairing: () => request('/platforms/pairing'),
  approvePairing: (code) => request('/platforms/pairing/approve', { method: 'POST', body: JSON.stringify({ code }) }),
  revokePairing: (userId) => request('/platforms/pairing/revoke', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  getPlatformEnvVars: () => request('/platforms/env-vars'),
  configurePlatform: (platform, vars) => request('/platforms/configure', { method: 'POST', body: JSON.stringify({ platform, vars }) }),

  // Insights
  getInsights: (days = 7) => request(`/insights?days=${days}`),

  // Files
  listFiles: (path = '') => request(`/files?path=${encodeURIComponent(path)}`),
  getFileTree: () => request('/files/tree'),
  readFile: (path) => request(`/files/read?path=${encodeURIComponent(path)}`),
  writeFile: (path, content) => request('/files/write', { method: 'PUT', body: JSON.stringify({ path, content }) }),
  deleteFile: (path) => request(`/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),

  // API Keys
  getApiKeys: () => request('/api-keys'),
  setApiKey: (key, value) => request('/api-keys/set', { method: 'POST', body: JSON.stringify({ key, value }) }),
  deleteApiKey: (key) => request('/api-keys/delete', { method: 'POST', body: JSON.stringify({ key }) }),
  testApiKey: (key) => request('/api-keys/test', { method: 'POST', body: JSON.stringify({ key }) }),

  // Fine-Tune
  fineTuneAvailable: () => request('/fine-tune/available'),
  fineTuneProviders: () => request('/fine-tune/providers'),
  fineTunePairs: (date, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit, offset })
    if (date) params.set('date', date)
    return request(`/fine-tune/pairs?${params}`)
  },
  fineTuneUpdatePair: (baseName, transcript) => request(`/fine-tune/pairs/${encodeURIComponent(baseName)}`, { method: 'PUT', body: JSON.stringify({ transcript }) }),
  fineTuneDeletePair: (baseName) => request(`/fine-tune/pairs/${encodeURIComponent(baseName)}`, { method: 'DELETE' }),
  fineTuneStats: () => request('/fine-tune/stats'),

  // Fine-Tune Cross-Validation
  crossvalStats: () => request('/fine-tune/crossval/stats'),
  crossvalPairs: (params = {}) => {
    const p = new URLSearchParams()
    if (params.status) p.set('status', params.status)
    if (params.minScore != null) p.set('min_score', params.minScore)
    if (params.sort) p.set('sort', params.sort)
    p.set('limit', params.limit || 50)
    p.set('offset', params.offset || 0)
    return request(`/fine-tune/crossval/pairs?${p}`)
  },
  crossvalUpdateStatus: (index, status) => request(`/fine-tune/crossval/pairs/${index}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  crossvalReview: (index) => request(`/fine-tune/crossval/review/${index}`, { method: 'POST' }),
  crossvalReviewBatchUrl: () => `${API_BASE}/fine-tune/crossval/review-batch`,

  // Gateway
  gatewayStatus: () => request('/gateway/status'),
  gatewayRestart: () => request('/gateway/restart', { method: 'POST' }),
  gatewayStop: () => request('/gateway/stop', { method: 'POST' }),
  gatewayStart: () => request('/gateway/start', { method: 'POST' }),
  gatewayLogs: (lines = 100, level = 'all', search = '') => {
    const params = new URLSearchParams({ lines, level })
    if (search) params.set('search', search)
    return request(`/gateway/logs?${params}`)
  },

  // Diagnostics
  runDiagnostics: () => request('/diagnostics/run', { method: 'POST' }),
  quickDiagnostics: () => request('/diagnostics/quick'),

  // Webhooks
  listWebhooks: () => request('/webhooks/list'),
  createWebhook: (url, events = []) => request('/webhooks/create', { method: 'POST', body: JSON.stringify({ url, events }) }),
  deleteWebhook: (url) => request('/webhooks/delete', { method: 'DELETE', body: JSON.stringify({ url }) }),

  // Env Variables
  listEnvVars: () => request('/env-vars/list'),
  setEnvVar: (key, value) => request('/env-vars/set', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  deleteEnvVar: (key) => request('/env-vars/delete', { method: 'DELETE', body: JSON.stringify({ key }) }),
  requiredEnvVars: () => request('/env-vars/required'),

  // Plugins
  listPlugins: () => request('/plugins/list'),
  installPlugin: (url) => request('/plugins/install', { method: 'POST', body: JSON.stringify({ url }) }),
  removePlugin: (name) => request('/plugins/remove', { method: 'POST', body: JSON.stringify({ name }) }),
  enablePlugin: (name) => request('/plugins/enable', { method: 'POST', body: JSON.stringify({ name }) }),
  disablePlugin: (name) => request('/plugins/disable', { method: 'POST', body: JSON.stringify({ name }) }),
  updatePlugin: (name) => request('/plugins/update', { method: 'POST', body: JSON.stringify({ name }) }),

  // MCP Servers
  listMcpServers: () => request('/mcp/list'),
  addMcpServer: (name, type, command, url, args) => request('/mcp/add', { method: 'POST', body: JSON.stringify({ name, type, command, url, args }) }),
  removeMcpServer: (name) => request('/mcp/remove', { method: 'DELETE', body: JSON.stringify({ name }) }),
  testMcpServer: (name) => request('/mcp/test', { method: 'POST', body: JSON.stringify({ name }) }),

  // Auth & Pairing
  listPairing: () => request('/auth-pairing/list'),
  approvePairing: (code) => request('/auth-pairing/approve', { method: 'POST', body: JSON.stringify({ code }) }),
  revokePairing: (user) => request('/auth-pairing/revoke', { method: 'POST', body: JSON.stringify({ user }) }),
  clearPendingPairing: () => request('/auth-pairing/clear-pending', { method: 'POST' }),

  // Profiles
  listProfiles: () => request('/profiles/list'),
  createProfile: (name) => request('/profiles/create', { method: 'POST', body: JSON.stringify({ name }) }),
  useProfile: (name) => request('/profiles/use', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteProfile: (name) => request('/profiles/delete', { method: 'DELETE', body: JSON.stringify({ name }) }),
  renameProfile: (name, newName) => request('/profiles/rename', { method: 'POST', body: JSON.stringify({ name, new_name: newName }) }),
  exportProfile: (name) => request('/profiles/export', { method: 'POST', body: JSON.stringify({ name }) }),

  // Backup & Restore
  createBackup: (includeEnv, includeSkills) => request('/backup/create', { method: 'POST', body: JSON.stringify({ include_env: includeEnv, include_skills: includeSkills }) }),
  listBackups: () => request('/backup/list'),
  restoreBackup: (filename) => request('/backup/restore', { method: 'POST', body: JSON.stringify({ filename }) }),
  deleteBackup: (filename) => request('/backup/delete', { method: 'DELETE', body: JSON.stringify({ filename }) }),

  // MOA (Mixture of Agents)
  getMoaConfig: () => request('/config/moa'),
  saveMoaConfig: (config) => request('/config/moa', { method: 'PUT', body: JSON.stringify(config) }),
  getMoaProviders: () => request('/config/moa/providers'),
  saveMoaProviders: (data) => request('/config/moa/providers', { method: 'PUT', body: JSON.stringify(data) }),
  testMoaProvider: (providerId) => request('/config/moa/providers/test', { method: 'POST', body: JSON.stringify({ provider_id: providerId }) }),

  // Claude Code Monitor
  activeClaudeSessions: () => request('/claude-code/active'),
  claudeCodeHistory: (limit = 30, project = '') => {
    const params = new URLSearchParams({ limit })
    if (project) params.set('project', project)
    return request(`/claude-code/history?${params}`)
  },
  claudeCodeStats: () => request('/claude-code/stats'),
  claudeCodeProjects: () => request('/claude-code/projects'),
  claudeCodeOutput: (session, lines = 50) => request(`/claude-code/output?session=${encodeURIComponent(session)}&lines=${lines}`),
  stopClaudeSession: (session) => request('/claude-code/stop', { method: 'POST', body: JSON.stringify({ session }) }),
  sendClaudeSession: (session, message) => request('/claude-code/send', { method: 'POST', body: JSON.stringify({ session, message }) }),
  killClaudeSession: (session) => request('/claude-code/session', { method: 'DELETE', body: JSON.stringify({ session }) }),
  createClaudeSession: (name, workdir) => request('/claude-code/new', { method: 'POST', body: JSON.stringify({ name, workdir }) }),
  sessionMessages: (sessionId, limit = 30) => request(`/claude-code/session/${encodeURIComponent(sessionId)}/messages?limit=${limit}`),
  // Aliases — pages use camelCase verbs, keep both for compat
  envVarsList: () => request('/env-vars/list'),
  envVarsRequired: () => request('/env-vars/required'),
  envVarsSet: (key, value) => request('/env-vars/set', { method: 'POST', body: JSON.stringify({ key, value }) }),
  envVarsDelete: (key) => request('/env-vars/delete', { method: 'DELETE', body: JSON.stringify({ key }) }),
  pluginsList: () => request('/plugins/list'),
  pluginsInstall: (url) => request('/plugins/install', { method: 'POST', body: JSON.stringify({ url }) }),
  pluginsRemove: (name) => request('/plugins/remove', { method: 'POST', body: JSON.stringify({ name }) }),
  pluginsEnable: (name) => request('/plugins/enable', { method: 'POST', body: JSON.stringify({ name }) }),
  pluginsDisable: (name) => request('/plugins/disable', { method: 'POST', body: JSON.stringify({ name }) }),
  pluginsUpdate: (name) => request('/plugins/update', { method: 'POST', body: JSON.stringify({ name }) }),
  mcpList: () => request('/mcp/list'),
  mcpDetail: (name) => request(`/mcp/detail/${encodeURIComponent(name)}`),
  mcpConfig: (name) => request(`/mcp/config/${encodeURIComponent(name)}`),
  mcpUpdateConfig: (name, config) => request(`/mcp/config/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify({ config }) }),
  mcpToggle: (name, enabled) => request(`/mcp/toggle/${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify({ enabled }) }),
  mcpAdd: (body) => request('/mcp/add', { method: 'POST', body: JSON.stringify(body) }),
  mcpTest: (name) => request('/mcp/test', { method: 'POST', body: JSON.stringify({ name }) }),
  mcpRemove: (name) => request('/mcp/remove', { method: 'POST', body: JSON.stringify({ name }) }),

  // Backlog
  getBacklogItems: (qs) => request('/backlog' + (qs ? '?' + qs : '')),
  backlogStats: () => request('/backlog/stats'),
  createBacklogItem: (item) => request('/backlog', { method: 'POST', body: JSON.stringify(item) }),
  updateBacklogItem: (id, item) => request('/backlog/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(item) }),
  deleteBacklogItem: (id) => request('/backlog/' + encodeURIComponent(id), { method: 'DELETE' }),
  patchBacklogStatus: (id, status) => request('/backlog/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }),
  authPairingList: () => request('/auth-pairing/list'),
  authPairingApprove: (code) => request('/auth-pairing/approve', { method: 'POST', body: JSON.stringify({ code }) }),
  authPairingRevoke: (user) => request('/auth-pairing/revoke', { method: 'POST', body: JSON.stringify({ user }) }),
  authPairingClearPending: () => request('/auth-pairing/clear-pending', { method: 'POST' }),
  profilesList: () => request('/profiles/list'),
  profilesCreate: (name) => request('/profiles/create', { method: 'POST', body: JSON.stringify({ name }) }),
  profilesUse: (name) => request('/profiles/use', { method: 'POST', body: JSON.stringify({ name }) }),
  profilesRename: (name, newName) => request('/profiles/rename', { method: 'POST', body: JSON.stringify({ name, new_name: newName }) }),
  profilesDelete: (name) => request('/profiles/delete', { method: 'DELETE', body: JSON.stringify({ name }) }),
  backupList: () => request('/backup/list'),
  backupCreate: (includeEnv, includeSkills) => request('/backup/create', { method: 'POST', body: JSON.stringify({ include_env: includeEnv, include_skills: includeSkills }) }),
  backupRestore: (filename) => request('/backup/restore', { method: 'POST', body: JSON.stringify({ filename }) }),
  backupDelete: (filename) => request('/backup/delete', { method: 'DELETE', body: JSON.stringify({ filename }) }),
};