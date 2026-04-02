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

  // Config
  getConfig: () => request('/config'),
  saveConfig: (yaml) => request('/config', { method: 'PUT', body: JSON.stringify({ yaml }) }),
  saveStructuredConfig: (config) => request('/config/structured', { method: 'PUT', body: JSON.stringify(config) }),
  getConfigSections: () => request('/config/sections'),
  setConfigValue: (key, value) => request('/config/set', { method: 'POST', body: JSON.stringify({ key, value }) }),

  // Sessions
  listSessions: () => request('/sessions'),
  getSession: (id) => request(`/sessions/${id}`),
  deleteSession: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),
  pruneSessions: (days = 30) => request(`/sessions/prune?days=${days}`, { method: 'POST' }),
  getSessionStats: () => request('/sessions/stats'),

  // Memory & SOUL
  getSoul: () => request('/memory/soul'),
  saveSoul: (content) => request('/memory/soul', { method: 'PUT', body: JSON.stringify({ content }) }),
  getMemory: () => request('/memory/memory'),
  saveMemory: (content) => request('/memory/memory', { method: 'PUT', body: JSON.stringify({ content }) }),
  listMemoryFiles: () => request('/memory/files'),
  getMemoryFile: (name) => request(`/memory/files/${name}`),
  saveMemoryFile: (name, content) => request(`/memory/files/${name}`, { method: 'PUT', body: JSON.stringify({ content }) }),

  // Tools
  listTools: () => request('/tools'),
  listToolsPlatform: (platform) => request(`/tools/${platform}`),
  enableTool: (tool, platform = 'cli') => request('/tools/enable', { method: 'POST', body: JSON.stringify({ tool, platform }) }),
  disableTool: (tool, platform = 'cli') => request('/tools/disable', { method: 'POST', body: JSON.stringify({ tool, platform }) }),

  // Skills
  listSkills: () => request('/skills'),
  browseSkills: (query = '') => request(`/skills/browse${query ? `?query=${encodeURIComponent(query)}` : ''}`),
  inspectSkill: (name) => request(`/skills/${name}`),
  installSkill: (name) => request('/skills/install', { method: 'POST', body: JSON.stringify({ name }) }),
  uninstallSkill: (name) => request('/skills/uninstall', { method: 'POST', body: JSON.stringify({ name }) }),

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

  // Insights
  getInsights: (days = 7) => request(`/insights?days=${days}`),
};
