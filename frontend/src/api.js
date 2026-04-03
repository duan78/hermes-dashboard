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

  // Fine-Tune
  fineTuneAvailable: () => request('/fine-tune/available'),
  fineTunePairs: (date, limit = 50, offset = 0) => {
    const params = new URLSearchParams({ limit, offset })
    if (date) params.set('date', date)
    return request(`/fine-tune/pairs?${params}`)
  },
  fineTuneUpdatePair: (baseName, transcript) => request(`/fine-tune/pairs/${encodeURIComponent(baseName)}`, { method: 'PUT', body: JSON.stringify({ transcript }) }),
  fineTuneDeletePair: (baseName) => request(`/fine-tune/pairs/${encodeURIComponent(baseName)}`, { method: 'DELETE' }),
  fineTuneStats: () => request('/fine-tune/stats'),

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
};
