import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Save, RotateCcw, ChevronDown, ChevronRight,
  Cpu, Sparkles, Terminal as TerminalIcon, Globe, Monitor,
  Zap, Database, Volume2, Shield, Archive, Layers, Code, Plug,
  Eye, EyeOff, Check, X,
} from 'lucide-react'
import { api } from '../api'
import './config.css'

// ── Helpers ──

function getDeepValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

function setDeepValue(obj, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  let target = obj
  for (const k of keys) {
    if (target[k] == null) target[k] = {}
    target = target[k]
  }
  target[last] = value
}

// ── Section Schema ──

const SECTIONS = [
  {
    id: 'model', title: 'Model', icon: Cpu,
    fields: [
      { key: 'model.default', label: 'Default Model', type: 'text' },
      { key: 'model.provider', label: 'Provider', type: 'select', options: ['auto', 'openai', 'anthropic', 'google', 'custom', 'ollama', 'mistral', 'deepseek'] },
      { key: 'model.base_url', label: 'Base URL', type: 'text' },
      { key: 'model.api_key', label: 'API Key', type: 'secret' },
    ],
  },
  {
    id: 'agent', title: 'Agent', icon: Sparkles,
    fields: [
      { key: 'agent.max_turns', label: 'Max Turns', type: 'number', min: 1, max: 200 },
      { key: 'agent.tool_use_enforcement', label: 'Tool Enforcement', type: 'select', options: ['auto', 'strict', 'permissive'] },
      { key: 'agent.verbose', label: 'Verbose', type: 'toggle' },
      { key: 'agent.reasoning_effort', label: 'Reasoning Effort', type: 'select', options: ['low', 'medium', 'high'] },
    ],
  },
  {
    id: 'terminal', title: 'Terminal', icon: TerminalIcon,
    fields: [
      { key: 'terminal.backend', label: 'Backend', type: 'select', options: ['local', 'docker', 'modal', 'singularity', 'daytona'] },
      { key: 'terminal.timeout', label: 'Timeout (s)', type: 'number', min: 10, max: 600 },
      { key: 'terminal.cwd', label: 'Working Directory', type: 'text' },
      { key: 'terminal.persistent_shell', label: 'Persistent Shell', type: 'toggle' },
      { key: 'terminal.lifetime_seconds', label: 'Lifetime (s)', type: 'number', min: 30, max: 3600 },
      { key: 'terminal.docker_image', label: 'Docker Image', type: 'text' },
      { key: 'terminal.container_cpu', label: 'Container CPU', type: 'number', min: 1, max: 16 },
      { key: 'terminal.container_memory', label: 'Container Memory (MB)', type: 'number', min: 256, max: 32768 },
    ],
  },
  {
    id: 'browser', title: 'Browser', icon: Globe,
    fields: [
      { key: 'browser.inactivity_timeout', label: 'Inactivity Timeout (s)', type: 'number', min: 10, max: 600 },
      { key: 'browser.command_timeout', label: 'Command Timeout (s)', type: 'number', min: 5, max: 120 },
      { key: 'browser.record_sessions', label: 'Record Sessions', type: 'toggle' },
      { key: 'browser.allow_private_urls', label: 'Allow Private URLs', type: 'toggle' },
      { key: 'browser.cloud_provider', label: 'Cloud Provider', type: 'select', options: ['local', 'browserbase'] },
    ],
  },
  {
    id: 'display', title: 'Display', icon: Monitor,
    fields: [
      { key: 'display.compact', label: 'Compact Mode', type: 'toggle' },
      { key: 'display.personality', label: 'Personality', type: 'select', options: ['default', 'helpful', 'concise', 'technical', 'creative', 'teacher', 'kawaii', 'catgirl', 'pirate', 'shakespeare', 'surfer', 'noir', 'uwu', 'philosopher', 'hype'] },
      { key: 'display.streaming', label: 'Streaming', type: 'toggle' },
      { key: 'display.show_reasoning', label: 'Show Reasoning', type: 'toggle' },
      { key: 'display.inline_diffs', label: 'Inline Diffs', type: 'toggle' },
      { key: 'display.show_cost', label: 'Show Cost', type: 'toggle' },
      { key: 'display.bell_on_complete', label: 'Bell on Complete', type: 'toggle' },
      { key: 'display.tool_progress', label: 'Tool Progress', type: 'select', options: ['off', 'on', 'minimal'] },
      { key: 'display.tool_preview_length', label: 'Tool Preview Length', type: 'number', min: 0, max: 1000 },
    ],
  },
  {
    id: 'streaming', title: 'Streaming', icon: Zap,
    fields: [
      { key: 'streaming.enabled', label: 'Enabled', type: 'toggle' },
      { key: 'streaming.edit_interval', label: 'Edit Interval', type: 'number', min: 0.05, max: 2, step: 0.05 },
      { key: 'streaming.buffer_threshold', label: 'Buffer Threshold', type: 'number', min: 1, max: 200 },
    ],
  },
  {
    id: 'memory', title: 'Memory', icon: Database,
    fields: [
      { key: 'memory.memory_enabled', label: 'Memory Enabled', type: 'toggle' },
      { key: 'memory.user_profile_enabled', label: 'User Profile', type: 'toggle' },
      { key: 'memory.memory_char_limit', label: 'Memory Char Limit', type: 'number', min: 100, max: 10000 },
      { key: 'memory.user_char_limit', label: 'User Char Limit', type: 'number', min: 100, max: 10000 },
      { key: 'memory.nudge_interval', label: 'Nudge Interval', type: 'number', min: 1, max: 50 },
      { key: 'memory.flush_min_turns', label: 'Flush Min Turns', type: 'number', min: 1, max: 50 },
    ],
  },
  {
    id: 'tts', title: 'TTS & Voice', icon: Volume2,
    fields: [
      { key: 'tts.provider', label: 'TTS Provider', type: 'select', options: ['edge', 'elevenlabs', 'openai', 'neutts'] },
      { key: 'tts.edge.voice', label: 'Edge Voice', type: 'text' },
      { key: 'stt.enabled', label: 'STT Enabled', type: 'toggle' },
      { key: 'stt.provider', label: 'STT Provider', type: 'select', options: ['openai', 'local'] },
      { key: 'voice.record_key', label: 'Record Key', type: 'text' },
      { key: 'voice.max_recording_seconds', label: 'Max Recording (s)', type: 'number', min: 5, max: 600 },
      { key: 'voice.auto_tts', label: 'Auto TTS', type: 'toggle' },
    ],
  },
  {
    id: 'security', title: 'Security & Privacy', icon: Shield,
    fields: [
      { key: 'security.redact_secrets', label: 'Redact Secrets', type: 'toggle' },
      { key: 'security.tirith_enabled', label: 'Tirith Guard', type: 'toggle' },
      { key: 'security.tirith_timeout', label: 'Tirith Timeout (s)', type: 'number', min: 1, max: 30 },
      { key: 'security.tirith_fail_open', label: 'Fail Open', type: 'toggle' },
      { key: 'privacy.redact_pii', label: 'Redact PII', type: 'toggle' },
    ],
  },
  {
    id: 'compression', title: 'Compression', icon: Archive,
    fields: [
      { key: 'compression.enabled', label: 'Enabled', type: 'toggle' },
      { key: 'compression.threshold', label: 'Threshold', type: 'number', min: 0, max: 1, step: 0.1 },
      { key: 'compression.target_ratio', label: 'Target Ratio', type: 'number', min: 0, max: 1, step: 0.1 },
      { key: 'compression.protect_last_n', label: 'Protect Last N', type: 'number', min: 0, max: 100 },
      { key: 'compression.summary_model', label: 'Summary Model', type: 'text' },
    ],
  },
  {
    id: 'sessions', title: 'Sessions & Approvals', icon: Layers,
    fields: [
      { key: 'checkpoints.enabled', label: 'Checkpoints', type: 'toggle' },
      { key: 'checkpoints.max_snapshots', label: 'Max Snapshots', type: 'number', min: 1, max: 200 },
      { key: 'approvals.mode', label: 'Approval Mode', type: 'select', options: ['manual', 'auto'] },
      { key: 'approvals.timeout', label: 'Approval Timeout (s)', type: 'number', min: 10, max: 300 },
      { key: 'session_reset.mode', label: 'Reset Mode', type: 'select', options: ['both', 'idle', 'scheduled', 'off'] },
      { key: 'session_reset.idle_minutes', label: 'Idle Reset (min)', type: 'number', min: 10, max: 10080 },
      { key: 'session_reset.at_hour', label: 'Reset Hour', type: 'number', min: 0, max: 23 },
    ],
  },
  {
    id: 'code_execution', title: 'Code Execution', icon: Code,
    fields: [
      { key: 'code_execution.timeout', label: 'Timeout (s)', type: 'number', min: 10, max: 600 },
      { key: 'code_execution.max_tool_calls', label: 'Max Tool Calls', type: 'number', min: 1, max: 200 },
    ],
  },
  {
    id: 'integrations', title: 'Integrations', icon: Plug,
    fields: [
      { key: 'timezone', label: 'Timezone', type: 'text' },
      { key: 'human_delay.mode', label: 'Human Delay Mode', type: 'select', options: ['off', 'typing', 'reading'] },
      { key: 'human_delay.min_ms', label: 'Delay Min (ms)', type: 'number', min: 0, max: 5000 },
      { key: 'human_delay.max_ms', label: 'Delay Max (ms)', type: 'number', min: 0, max: 10000 },
      { key: 'discord.require_mention', label: 'Discord: Require Mention', type: 'toggle' },
      { key: 'discord.auto_thread', label: 'Discord: Auto Thread', type: 'toggle' },
      { key: 'discord.reactions', label: 'Discord: Reactions', type: 'toggle' },
      { key: 'group_sessions_per_user', label: 'Group Sessions/User', type: 'toggle' },
    ],
  },
]

// ── Widget Components ──

function Toggle({ value, onChange }) {
  return (
    <label className="toggle-wrap">
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  )
}

function TextField({ value, onChange }) {
  return (
    <input
      type="text"
      className="form-input"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      placeholder="not set"
    />
  )
}

function NumberField({ value, onChange, min, max, step }) {
  return (
    <input
      type="number"
      className="form-input"
      value={value ?? ''}
      onChange={e => {
        const v = e.target.value
        onChange(v === '' ? null : Number(v))
      }}
      min={min}
      max={max}
      step={step || 1}
    />
  )
}

function SelectField({ value, onChange, options }) {
  const allOptions = (value != null && value !== '' && !options.includes(value))
    ? [...options, value] : options
  return (
    <select className="form-select" value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">— not set —</option>
      {allOptions.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function SecretField({ value, onChange }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="secret-input-wrap">
      <input
        type={visible ? 'text' : 'password'}
        className="form-input"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder="Leave unchanged to keep current"
      />
      <button type="button" className="secret-toggle-btn" onClick={() => setVisible(v => !v)}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

function FieldWidget({ field, value, onChange }) {
  switch (field.type) {
    case 'toggle':
      return <Toggle value={value} onChange={onChange} />
    case 'number':
      return <NumberField value={value} onChange={onChange} min={field.min} max={field.max} step={field.step} />
    case 'select':
      return <SelectField value={value} onChange={onChange} options={field.options} />
    case 'secret':
      return <SecretField value={value} onChange={onChange} />
    default:
      return <TextField value={value} onChange={onChange} />
  }
}

// ── Main Component ──

export default function Config() {
  const [originalConfig, setOriginalConfig] = useState(null)
  const [workingConfig, setWorkingConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openSections, setOpenSections] = useState(() => new Set(['model']))
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getConfig()
      const config = data.config || {}
      setOriginalConfig(JSON.parse(JSON.stringify(config)))
      setWorkingConfig(JSON.parse(JSON.stringify(config)))
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = useCallback((key, value) => {
    setWorkingConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      setDeepValue(next, key, value)
      return next
    })
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      await api.saveStructuredConfig(workingConfig)
      await load()
      showToast('Configuration saved successfully')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setWorkingConfig(JSON.parse(JSON.stringify(originalConfig)))
    showToast('Changes discarded', 'info')
  }

  const toggleSection = (id) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setOpenSections(new Set(SECTIONS.map(s => s.id)))
  const collapseAll = () => setOpenSections(new Set())

  if (loading) return <div className="spinner" />
  if (error) return <div className="error-box">{error}</div>
  if (!workingConfig) return null

  const hasChanges = JSON.stringify(workingConfig) !== JSON.stringify(originalConfig)

  const isSectionChanged = (section) => {
    if (!originalConfig) return false
    return section.fields.some(f => {
      const orig = getDeepValue(originalConfig, f.key)
      const curr = getDeepValue(workingConfig, f.key)
      return orig !== curr
    })
  }

  return (
    <div>
      <div className="page-title">
        <Settings size={28} />
        Configuration
        <div className="config-actions">
          <button className="btn btn-sm" onClick={expandAll}>Expand all</button>
          <button className="btn btn-sm" onClick={collapseAll}>Collapse all</button>
          {hasChanges && (
            <button className="btn btn-sm" onClick={handleReset}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !hasChanges}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            {hasChanges && <span className="save-badge" />}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {SECTIONS.map(section => {
        const Icon = section.icon
        const isOpen = openSections.has(section.id)
        const changed = isSectionChanged(section)

        return (
          <div key={section.id} className="accordion-card">
            <div className="accordion-header" onClick={() => toggleSection(section.id)}>
              <Icon size={18} className="accordion-icon" />
              <span className="accordion-title">{section.title}</span>
              {changed && <span className="changed-dot" />}
              <span className="accordion-chevron">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </div>
            {isOpen && (
              <div className="accordion-body">
                {section.fields.map(field => {
                  const value = getDeepValue(workingConfig, field.key)
                  return (
                    <div
                      key={field.key}
                      className={`field-group ${field.type === 'secret' ? 'full-width' : ''}`}
                    >
                      <label className="field-label">{field.label}</label>
                      <FieldWidget
                        field={field}
                        value={value}
                        onChange={v => handleChange(field.key, v)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <Check size={16} />}
          {toast.type === 'error' && <X size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
