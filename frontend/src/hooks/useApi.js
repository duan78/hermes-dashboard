import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

// ── Helpers ──────────────────────────────────────────────────
const STALE_SHORT = 10_000   // 10s — rapidly-changing data
const STALE_MEDIUM = 30_000  // 30s — default
const REFETCH_STATUS = 30_000 // 30s auto-refetch for status endpoints

// ── Overview ─────────────────────────────────────────────────
export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: () => api.getOverview(),
    staleTime: STALE_SHORT,
    refetchInterval: REFETCH_STATUS,
  })
}

export function useLogs(lines = 100) {
  return useQuery({
    queryKey: ['logs', lines],
    queryFn: () => api.getLogs(lines),
    staleTime: STALE_SHORT,
  })
}

export function useSystemMetrics() {
  return useQuery({
    queryKey: ['system-metrics'],
    queryFn: () => api.getSystemMetrics(),
    staleTime: STALE_SHORT,
    refetchInterval: REFETCH_STATUS,
  })
}

export function useHermesVersion() {
  return useQuery({
    queryKey: ['version'],
    queryFn: () => api.hermesVersion(),
    staleTime: STALE_MEDIUM,
  })
}

export function useHermesChangelog() {
  return useQuery({
    queryKey: ['changelog'],
    queryFn: () => api.hermesChangelog(),
    staleTime: STALE_MEDIUM,
  })
}

export function useHermesUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.hermesUpdate(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['version'] }),
  })
}

// ── Config ───────────────────────────────────────────────────
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    staleTime: STALE_MEDIUM,
  })
}

export function useConfigSections() {
  return useQuery({
    queryKey: ['config-sections'],
    queryFn: () => api.getConfigSections(),
    staleTime: STALE_MEDIUM,
  })
}

export function useSaveConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (yaml) => api.saveConfig(yaml),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

export function useSaveStructuredConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (config) => api.saveStructuredConfig(config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

export function useSetConfigValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) => api.setConfigValue(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

export function useUpdateConfigValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) => api.updateConfigValue(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

// ── Sessions ─────────────────────────────────────────────────
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
    staleTime: STALE_MEDIUM,
  })
}

export function useSearchSessions(q) {
  return useQuery({
    queryKey: ['sessions', 'search', q],
    queryFn: () => api.searchSessions(q),
    enabled: !!q && q.length > 0,
    staleTime: STALE_SHORT,
  })
}

export function useSession(id) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: () => api.getSession(id),
    enabled: !!id,
    staleTime: STALE_MEDIUM,
  })
}

export function useSessionStats() {
  return useQuery({
    queryKey: ['sessions', 'stats'],
    queryFn: () => api.getSessionStats(),
    staleTime: STALE_MEDIUM,
  })
}

export function useExportSession(id) {
  return useQuery({
    queryKey: ['sessions', id, 'export'],
    queryFn: () => api.exportSession(id),
    enabled: !!id,
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.deleteSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function usePruneSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (days) => api.pruneSessions(days),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

// ── Memory & SOUL ────────────────────────────────────────────
export function useSoul() {
  return useQuery({
    queryKey: ['soul'],
    queryFn: () => api.getSoul(),
    staleTime: STALE_MEDIUM,
  })
}

export function useSaveSoul() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content) => api.saveSoul(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['soul'] }),
  })
}

export function useMemory() {
  return useQuery({
    queryKey: ['memory'],
    queryFn: () => api.getMemory(),
    staleTime: STALE_MEDIUM,
  })
}

export function useSaveMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content) => api.saveMemory(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory'] }),
  })
}

export function useMemoryFiles() {
  return useQuery({
    queryKey: ['memory-files'],
    queryFn: () => api.listMemoryFiles(),
    staleTime: STALE_MEDIUM,
  })
}

export function useMemoryFile(name) {
  return useQuery({
    queryKey: ['memory-files', name],
    queryFn: () => api.getMemoryFile(name),
    enabled: !!name,
  })
}

export function useSaveMemoryFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, content }) => api.saveMemoryFile(name, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memory-files'] }),
  })
}

export function useAllFiles() {
  return useQuery({
    queryKey: ['all-files'],
    queryFn: () => api.listAllFiles(),
    staleTime: STALE_MEDIUM,
  })
}

export function useReadFile(path) {
  return useQuery({
    queryKey: ['file-read', path],
    queryFn: () => api.readFile(path),
    enabled: !!path,
  })
}

export function useSaveFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ path, content }) => api.saveFile(path, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-files'] }),
  })
}

export function useCreateFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.createFile(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-files'] }),
  })
}

export function useDeleteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path) => api.deleteFile(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-files'] }),
  })
}

// ── Vector Memory ────────────────────────────────────────────
export function useVectorMemoryAvailable() {
  return useQuery({
    queryKey: ['vector-memory', 'available'],
    queryFn: () => api.vectorMemoryAvailable(),
  })
}

export function useVectorMemoryStats() {
  return useQuery({
    queryKey: ['vector-memory', 'stats'],
    queryFn: () => api.vectorMemoryStats(),
  })
}

export function useVectorMemoryList(limit = 50, source = 'all') {
  return useQuery({
    queryKey: ['vector-memory', 'list', limit, source],
    queryFn: () => api.vectorMemoryList(limit, source),
  })
}

export function useVectorMemorySearch(query, topK = 10) {
  return useQuery({
    queryKey: ['vector-memory', 'search', query, topK],
    queryFn: () => api.vectorMemorySearch(query, topK),
    enabled: !!query,
  })
}

export function useVectorMemoryStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ text, source, metadata }) => api.vectorMemoryStore(text, source, metadata),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vector-memory'] }),
  })
}

export function useVectorMemoryDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (memoryId) => api.vectorMemoryDelete(memoryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vector-memory'] }),
  })
}

export function useVectorMemoryUsage() {
  return useQuery({
    queryKey: ['vector-memory', 'usage'],
    queryFn: () => api.vectorMemoryUsage(),
  })
}

// ── Honcho Memory ────────────────────────────────────────────
export function useHonchoStatus() {
  return useQuery({
    queryKey: ['honcho', 'status'],
    queryFn: () => api.honchoStatus(),
  })
}

export function useHonchoStats() {
  return useQuery({
    queryKey: ['honcho', 'stats'],
    queryFn: () => api.honchoStats(),
  })
}

export function useHonchoProfile() {
  return useQuery({
    queryKey: ['honcho', 'profile'],
    queryFn: () => api.honchoProfile(),
  })
}

export function useHonchoMemories(limit = 50) {
  return useQuery({
    queryKey: ['honcho', 'memories', limit],
    queryFn: () => api.honchoMemories(limit),
  })
}

export function useHonchoSearch(query, topK = 10) {
  return useQuery({
    queryKey: ['honcho', 'search', query, topK],
    queryFn: () => api.honchoSearch(query, topK),
    enabled: !!query,
  })
}

// ── Tools ────────────────────────────────────────────────────
export function useTools() {
  return useQuery({
    queryKey: ['tools'],
    queryFn: () => api.listTools(),
    staleTime: STALE_MEDIUM,
  })
}

export function useToolsPlatform(platform) {
  return useQuery({
    queryKey: ['tools', platform],
    queryFn: () => api.listToolsPlatform(platform),
    enabled: !!platform,
  })
}

export function useToolConfig() {
  return useQuery({
    queryKey: ['tools', 'config'],
    queryFn: () => api.getToolConfig(),
  })
}

export function useEnableTool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tool, platform }) => api.enableTool(tool, platform),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tools'] }),
  })
}

export function useDisableTool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tool, platform }) => api.disableTool(tool, platform),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tools'] }),
  })
}

export function useSetToolEnv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value, configKey, configValue }) => api.setToolEnv(key, value, configKey, configValue),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tools'] }),
  })
}

// ── Skills ───────────────────────────────────────────────────
export function useSkills() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: () => api.listSkills(),
    staleTime: STALE_MEDIUM,
  })
}

export function useSkillsDetailed() {
  return useQuery({
    queryKey: ['skills', 'detailed'],
    queryFn: () => api.listSkillsDetailed(),
  })
}

export function useBrowseSkills(query = '') {
  return useQuery({
    queryKey: ['skills', 'browse', query],
    queryFn: () => api.browseSkills(query),
  })
}

export function useInspectSkill(name) {
  return useQuery({
    queryKey: ['skills', 'inspect', name],
    queryFn: () => api.inspectSkill(name),
    enabled: !!name,
  })
}

export function useSkillDetail(name) {
  return useQuery({
    queryKey: ['skills', 'detail', name],
    queryFn: () => api.skillDetail(name),
    enabled: !!name,
  })
}

export function useInstallSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.installSkill(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
  })
}

export function useUninstallSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.uninstallSkill(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skills'] }),
  })
}

export function useBrowseRegistry(page = 1, size = 20, source = 'all', query = '') {
  return useQuery({
    queryKey: ['skills', 'registry', page, size, source, query],
    queryFn: () => api.browseRegistry(page, size, source, query),
  })
}

export function useInspectRegistrySkill(name) {
  return useQuery({
    queryKey: ['skills', 'registry', name],
    queryFn: () => api.inspectRegistrySkill(name),
    enabled: !!name,
  })
}

// ── Cron ─────────────────────────────────────────────────────
export function useCronJobs() {
  return useQuery({
    queryKey: ['cron'],
    queryFn: () => api.listCronJobs(),
    staleTime: STALE_MEDIUM,
    refetchInterval: REFETCH_STATUS,
  })
}

export function useCronJob(id) {
  return useQuery({
    queryKey: ['cron', id],
    queryFn: () => api.getCronJob(id),
    enabled: !!id,
  })
}

export function useCreateCronJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ schedule, prompt, name }) => api.createCronJob(schedule, prompt, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  })
}

export function usePauseCronJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.pauseCronJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  })
}

export function useResumeCronJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.resumeCronJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  })
}

export function useRunCronJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.runCronJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  })
}

export function useDeleteCronJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.deleteCronJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cron'] }),
  })
}

// ── Models ───────────────────────────────────────────────────
export function useCurrentModel() {
  return useQuery({
    queryKey: ['models'],
    queryFn: () => api.getCurrentModel(),
  })
}

export function useAvailableModels() {
  return useQuery({
    queryKey: ['models', 'available'],
    queryFn: () => api.getAvailableModels(),
  })
}

export function useSwitchModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ model, provider }) => api.switchModel(model, provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] })
      qc.invalidateQueries({ queryKey: ['config'] })
    },
  })
}

// ── Platforms ────────────────────────────────────────────────
export function usePlatformsStatus() {
  return useQuery({
    queryKey: ['platforms', 'status'],
    queryFn: () => api.getPlatformsStatus(),
    staleTime: STALE_SHORT,
    refetchInterval: REFETCH_STATUS,
  })
}

export function useChannels() {
  return useQuery({
    queryKey: ['platforms', 'channels'],
    queryFn: () => api.getChannels(),
  })
}

export function usePairing() {
  return useQuery({
    queryKey: ['platforms', 'pairing'],
    queryFn: () => api.listPairing(),
  })
}

export function useApprovePairing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code) => api.approvePairing(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platforms', 'pairing'] }),
  })
}

export function useRevokePairing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId) => api.revokePairing(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platforms', 'pairing'] }),
  })
}

export function usePlatformEnvVars() {
  return useQuery({
    queryKey: ['platforms', 'env-vars'],
    queryFn: () => api.getPlatformEnvVars(),
  })
}

export function useConfigurePlatform() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ platform, vars }) => api.configurePlatform(platform, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platforms'] })
      qc.invalidateQueries({ queryKey: ['platforms', 'env-vars'] })
    },
  })
}

// ── Insights ─────────────────────────────────────────────────
export function useInsights(days = 7) {
  return useQuery({
    queryKey: ['insights', days],
    queryFn: () => api.getInsights(days),
  })
}

// ── Files ────────────────────────────────────────────────────
export function useFiles(path = '') {
  return useQuery({
    queryKey: ['files', path],
    queryFn: () => api.listFiles(path),
  })
}

export function useFileTree() {
  return useQuery({
    queryKey: ['files', 'tree'],
    queryFn: () => api.getFileTree(),
  })
}

export function useFileContent(path) {
  return useQuery({
    queryKey: ['files', 'content', path],
    queryFn: () => api.readFile(path),
    enabled: !!path,
  })
}

export function useWriteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ path, content }) => api.writeFile(path, content),
    onSuccess: (_data, { path }) => {
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['files', 'content', path] })
    },
  })
}

export function useDeleteFsFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path) => api.deleteFile(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  })
}

// ── API Keys ─────────────────────────────────────────────────
export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api.getApiKeys(),
    staleTime: STALE_MEDIUM,
  })
}

export function useSetApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) => api.setApiKey(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key) => api.deleteApiKey(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

export function useTestApiKey() {
  return useMutation({
    mutationFn: (key) => api.testApiKey(key),
  })
}

// ── Fine-Tune ────────────────────────────────────────────────
export function useFineTuneAvailable() {
  return useQuery({
    queryKey: ['fine-tune', 'available'],
    queryFn: () => api.fineTuneAvailable(),
  })
}

export function useFineTuneProviders() {
  return useQuery({
    queryKey: ['fine-tune', 'providers'],
    queryFn: () => api.fineTuneProviders(),
  })
}

export function useFineTunePairs(date, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['fine-tune', 'pairs', date, limit, offset],
    queryFn: () => api.fineTunePairs(date, limit, offset),
  })
}

export function useFineTuneUpdatePair() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ baseName, transcript }) => api.fineTuneUpdatePair(baseName, transcript),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fine-tune', 'pairs'] }),
  })
}

export function useFineTuneDeletePair() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (baseName) => api.fineTuneDeletePair(baseName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fine-tune', 'pairs'] }),
  })
}

export function useFineTuneStats() {
  return useQuery({
    queryKey: ['fine-tune', 'stats'],
    queryFn: () => api.fineTuneStats(),
  })
}

// ── Cross-Validation ─────────────────────────────────────────
export function useCrossvalStats() {
  return useQuery({
    queryKey: ['crossval', 'stats'],
    queryFn: () => api.crossvalStats(),
  })
}

export function useCrossvalPairs(params = {}) {
  return useQuery({
    queryKey: ['crossval', 'pairs', params],
    queryFn: () => api.crossvalPairs(params),
  })
}

export function useCrossvalUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ index, status }) => api.crossvalUpdateStatus(index, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crossval', 'pairs'] }),
  })
}

export function useCrossvalReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (index) => api.crossvalReview(index),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crossval'] }),
  })
}

// ── Gateway ──────────────────────────────────────────────────
export function useGatewayStatus() {
  return useQuery({
    queryKey: ['gateway', 'status'],
    queryFn: () => api.gatewayStatus(),
    staleTime: STALE_SHORT,
    refetchInterval: REFETCH_STATUS,
  })
}

export function useGatewayLogs(lines = 100, level = 'all', search = '') {
  return useQuery({
    queryKey: ['gateway', 'logs', lines, level, search],
    queryFn: () => api.gatewayLogs(lines, level, search),
    staleTime: STALE_SHORT,
  })
}

export function useGatewayRestart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.gatewayRestart(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gateway'] }),
  })
}

export function useGatewayStop() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.gatewayStop(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gateway'] }),
  })
}

export function useGatewayStart() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.gatewayStart(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gateway'] }),
  })
}

// ── Diagnostics ──────────────────────────────────────────────
export function useQuickDiagnostics() {
  return useQuery({
    queryKey: ['diagnostics', 'quick'],
    queryFn: () => api.quickDiagnostics(),
  })
}

export function useRunDiagnostics() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.runDiagnostics(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['diagnostics'] }),
  })
}

// ── Webhooks ─────────────────────────────────────────────────
export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.listWebhooks(),
  })
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ url, events }) => api.createWebhook(url, events),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url) => api.deleteWebhook(url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })
}

// ── Env Variables ────────────────────────────────────────────
export function useEnvVars() {
  return useQuery({
    queryKey: ['env-vars'],
    queryFn: () => api.listEnvVars(),
  })
}

export function useRequiredEnvVars() {
  return useQuery({
    queryKey: ['env-vars', 'required'],
    queryFn: () => api.requiredEnvVars(),
  })
}

export function useSetEnvVar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) => api.setEnvVar(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['env-vars'] }),
  })
}

export function useDeleteEnvVar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key) => api.deleteEnvVar(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['env-vars'] }),
  })
}

// ── Plugins ──────────────────────────────────────────────────
export function usePlugins() {
  return useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.listPlugins(),
  })
}

export function useInstallPlugin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (url) => api.installPlugin(url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  })
}

export function useRemovePlugin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.removePlugin(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  })
}

export function useEnablePlugin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.enablePlugin(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  })
}

export function useDisablePlugin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.disablePlugin(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  })
}

export function useUpdatePlugin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.updatePlugin(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  })
}

// ── MCP Servers ──────────────────────────────────────────────
export function useMcpServers() {
  return useQuery({
    queryKey: ['mcp'],
    queryFn: () => api.listMcpServers(),
  })
}

export function useMcpDetail(name) {
  return useQuery({
    queryKey: ['mcp', name],
    queryFn: () => api.mcpDetail(name),
    enabled: !!name,
  })
}

export function useMcpConfig(name) {
  return useQuery({
    queryKey: ['mcp', 'config', name],
    queryFn: () => api.mcpConfig(name),
    enabled: !!name,
  })
}

export function useMcpAdd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.mcpAdd(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  })
}

export function useMcpRemove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.mcpRemove(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  })
}

export function useMcpTest() {
  return useMutation({
    mutationFn: (name) => api.mcpTest(name),
  })
}

export function useMcpUpdateConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, config }) => api.mcpUpdateConfig(name, config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  })
}

export function useMcpToggle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, enabled }) => api.mcpToggle(name, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  })
}

// ── Auth & Pairing ───────────────────────────────────────────
export function useAuthPairing() {
  return useQuery({
    queryKey: ['auth-pairing'],
    queryFn: () => api.authPairingList(),
  })
}

export function useAuthApprovePairing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code) => api.authPairingApprove(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-pairing'] }),
  })
}

export function useAuthRevokePairing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (user) => api.authPairingRevoke(user),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-pairing'] }),
  })
}

export function useAuthClearPending() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.authPairingClearPending(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-pairing'] }),
  })
}

// ── Profiles ─────────────────────────────────────────────────
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.profilesList(),
  })
}

export function useCreateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.profilesCreate(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useUseProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.profilesUse(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useRenameProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, newName }) => api.profilesRename(name, newName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useDeleteProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name) => api.profilesDelete(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useExportProfile() {
  return useMutation({
    mutationFn: (name) => api.exportProfile(name),
  })
}

// ── Backup ───────────────────────────────────────────────────
export function useBackups() {
  return useQuery({
    queryKey: ['backups'],
    queryFn: () => api.backupList(),
  })
}

export function useCreateBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ includeEnv, includeSkills }) => api.backupCreate(includeEnv, includeSkills),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  })
}

export function useRestoreBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (filename) => api.backupRestore(filename),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  })
}

export function useDeleteBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (filename) => api.backupDelete(filename),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backups'] }),
  })
}

// ── MOA ──────────────────────────────────────────────────────
export function useMoaConfig() {
  return useQuery({
    queryKey: ['moa', 'config'],
    queryFn: () => api.getMoaConfig(),
  })
}

export function useSaveMoaConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (config) => api.saveMoaConfig(config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moa'] }),
  })
}

export function useMoaProviders() {
  return useQuery({
    queryKey: ['moa', 'providers'],
    queryFn: () => api.getMoaProviders(),
  })
}

export function useSaveMoaProviders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.saveMoaProviders(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moa'] }),
  })
}

export function useTestMoaProvider() {
  return useMutation({
    mutationFn: (providerId) => api.testMoaProvider(providerId),
  })
}

// ── Claude Code ──────────────────────────────────────────────
export function useActiveClaudeSessions() {
  return useQuery({
    queryKey: ['claude-code', 'active'],
    queryFn: () => api.activeClaudeSessions(),
    staleTime: STALE_SHORT,
    refetchInterval: REFETCH_STATUS,
  })
}

export function useClaudeCodeHistory(limit = 30, project = '') {
  return useQuery({
    queryKey: ['claude-code', 'history', limit, project],
    queryFn: () => api.claudeCodeHistory(limit, project),
  })
}

export function useClaudeCodeStats() {
  return useQuery({
    queryKey: ['claude-code', 'stats'],
    queryFn: () => api.claudeCodeStats(),
  })
}

export function useClaudeCodeProjects() {
  return useQuery({
    queryKey: ['claude-code', 'projects'],
    queryFn: () => api.claudeCodeProjects(),
  })
}

export function useClaudeCodeOutput(session, lines = 50) {
  return useQuery({
    queryKey: ['claude-code', 'output', session, lines],
    queryFn: () => api.claudeCodeOutput(session, lines),
    enabled: !!session,
  })
}

export function useStopClaudeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (session) => api.stopClaudeSession(session),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['claude-code'] }),
  })
}

export function useSendClaudeSession() {
  return useMutation({
    mutationFn: ({ session, message }) => api.sendClaudeSession(session, message),
  })
}

export function useKillClaudeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (session) => api.killClaudeSession(session),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['claude-code'] }),
  })
}

export function useCreateClaudeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, workdir }) => api.createClaudeSession(name, workdir),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['claude-code'] }),
  })
}

export function useSessionMessages(sessionId, limit = 30) {
  return useQuery({
    queryKey: ['claude-code', 'messages', sessionId, limit],
    queryFn: () => api.sessionMessages(sessionId, limit),
    enabled: !!sessionId,
  })
}
