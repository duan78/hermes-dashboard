import React, { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus, Pause, Play, Trash2, PlayCircle, RefreshCw, Server, Activity, Terminal } from 'lucide-react'
import { useCronJobs, useCreateCronJob, usePauseCronJob, useResumeCronJob, useRunCronJob, useDeleteCronJob } from '../hooks/useApi'
import { useToast } from '../contexts/ToastContext'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'

// ── cronToHuman: converts 5-field cron to readable text ──────
function cronToHuman(expr) {
  if (!expr) return ''
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr

  const [minute, hour, dom, month, dow] = parts
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  function expandField(field, values) {
    if (field === '*') return null
    const result = []
    for (const part of field.split(',')) {
      if (part.includes('/')) {
        const [range, step] = part.split('/')
        if (range === '*') return `every ${step} ${values === dayNames ? 'days' : ''}`
        return `from ${values[range]} every ${step}`
      }
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number)
        for (let i = start; i <= end; i++) result.push(values[i])
      } else {
        result.push(values[Number(part)])
      }
    }
    return result.join(', ')
  }

  const dowStr = expandField(dow, dayNames)
  const monthStr = expandField(month, monthNames)

  let timeStr = ''
  if (minute === '*' && hour === '*') timeStr = 'every minute'
  else if (hour === '*') timeStr = `every hour at :${minute.padStart(2, '0')}`
  else {
    const h = parseInt(hour)
    const m = minute.padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 || 12
    timeStr = `${h12}:${m} ${ampm}`
  }

  let frequency = ''
  if (dom === '*' && dow === '*' && month === '*') frequency = 'Every day'
  else if (dowStr && dom === '*') frequency = `Every ${dowStr}`
  else if (dom !== '*' && dow === '*') frequency = `On day ${dom}`
  else frequency = ''

  if (monthStr) frequency += ` in ${monthStr}`

  return frequency ? `${frequency} at ${timeStr}` : timeStr
}

async function fetchSystemCrons() {
  const token = localStorage.getItem('hermes_token') || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api/cron/system', { headers });
  if (!res.ok) throw new Error('Failed to load system data');
  return res.json();
}

const STATUS_COLORS = {
  active: '#22c55e',
  inactive: '#ef4444',
  failed: '#ef4444',
  activating: '#f59e0b',
  'not-found': '#6b7280',
}

function StatusDot({ status }) {
  const color = STATUS_COLORS[status] || '#6b7280';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', backgroundColor: color,
        display: 'inline-block', flexShrink: 0,
        boxShadow: color !== '#6b7280' ? `0 0 6px ${color}80` : 'none',
      }} />
      <span style={{ textTransform: 'capitalize', fontSize: 13 }}>{status}</span>
    </span>
  );
}

function SystemSection({ data, loading, onRefresh }) {
  return (
    <div style={{
      border: '1px solid var(--border, rgba(255,255,255,0.08))',
      borderRadius: 12, overflow: 'hidden', marginBottom: 24,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.06))',
        borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Server size={18} style={{ color: 'var(--accent, #8b5cf6)' }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>System Automation</span>
          <Tooltip text="System-level services, timers, and crontab entries that keep Hermes and related processes running." />
        </div>
        <button className="btn btn-sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          Loading system data...
        </div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Systemd Services */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Activity size={15} style={{ color: '#3b82f6' }} />
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Systemd Services
              </span>
            </div>
            {data.systemd_services.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No services found</p>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 120px', gap: '4px 16px',
                fontSize: 13, fontFamily: 'var(--font-mono, monospace)',
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Service</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Status</div>
                {data.systemd_services.map((svc) => (
                  <React.Fragment key={svc.name}>
                    <div style={{ padding: '4px 0' }}>{svc.name}</div>
                    <div style={{ padding: '4px 0' }}><StatusDot status={svc.status} /></div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Systemd Timers */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Clock size={15} style={{ color: '#f59e0b' }} />
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Systemd Timers
              </span>
            </div>
            {data.systemd_timers.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No Hermes-related timers found</p>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 16px',
                fontSize: 13, fontFamily: 'var(--font-mono, monospace)',
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Timer</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Next Run</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Last Run</div>
                {data.systemd_timers.map((timer) => (
                  <React.Fragment key={timer.name}>
                    <div style={{ padding: '4px 0' }}>{timer.name}</div>
                    <div style={{ padding: '4px 0' }}>{timer.next_run}</div>
                    <div style={{ padding: '4px 0' }}>{timer.last_run}</div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Crontab */}
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Terminal size={15} style={{ color: '#22c55e' }} />
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Crontab Entries
              </span>
            </div>
            {data.crontab.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No crontab entries found</p>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: '100px 120px 1fr', gap: '4px 16px',
                fontSize: 13, fontFamily: 'var(--font-mono, monospace)',
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Schedule</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Script</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', paddingBottom: 4 }}>Command</div>
                {data.crontab.map((entry, i) => (
                  <React.Fragment key={i}>
                    <div style={{ padding: '4px 0' }}>{entry.schedule}</div>
                    <div style={{ padding: '4px 0', fontWeight: 600 }}>{entry.name}</div>
                    <div style={{ padding: '4px 0', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={entry.command}>
                      {entry.command}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

export default function CronJobs() {
  const { data: jobs = [], isLoading, error: jobsError, refetch } = useCronJobs()
  const createMutation = useCreateCronJob()
  const pauseMutation = usePauseCronJob()
  const resumeMutation = useResumeCronJob()
  const runMutation = useRunCronJob()
  const deleteMutation = useDeleteCronJob()

  const [showCreate, setShowCreate] = useState(false)
  const [newJob, setNewJob] = useState({ schedule: '', prompt: '', name: '' })
  const [confirmModal, setConfirmModal] = useState(null)
  const { toast } = useToast()

  // System automation - separate query
  const { data: systemData, isLoading: systemLoading, refetch: refetchSystem } = useQuery({
    queryKey: ['cron', 'system'],
    queryFn: fetchSystemCrons,
    staleTime: 30_000,
  })

  const create = async () => {
    try {
      await createMutation.mutateAsync({ schedule: newJob.schedule, prompt: newJob.prompt, name: newJob.name })
      setShowCreate(false)
      setNewJob({ schedule: '', prompt: '', name: '' })
      toast.success('Cron job created')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const toggle = async (job) => {
    try {
      if (job.enabled) await pauseMutation.mutateAsync(job.id)
      else await resumeMutation.mutateAsync(job.id)
      toast.success(job.enabled ? 'Job paused' : 'Job resumed')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const runNow = async (id) => {
    try {
      await runMutation.mutateAsync(id)
      toast.success('Job triggered')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const remove = (id) => {
    setConfirmModal({
      message: 'Delete this cron job?',
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await deleteMutation.mutateAsync(id)
          toast.success('Job deleted')
        } catch (e) {
          toast.error(e.message)
        }
      }
    })
  }

  return (
    <div>
      <div className="page-title">
        <Clock size={28} />
        Cron Jobs
        <Tooltip text="Scheduled tasks that run automatically at defined times. Each cron job sends a prompt to the AI agent, which executes it like a normal conversation. Useful for recurring reports, health checks, data processing, and automated workflows." />
        <button className="btn btn-sm" onClick={() => { refetch(); refetchSystem() }} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)} style={{ marginLeft: 8 }}>
          <Plus size={14} /> New Job
          <Tooltip text="Create a new scheduled task. Define a cron schedule and a prompt for the AI agent to execute." />
        </button>
      </div>

      {jobsError && <div className="error-box">{jobsError.message}</div>}

      {/* System Automation Section */}
      <SystemSection data={systemData} loading={systemLoading} onRefresh={() => refetchSystem()} />

      {showCreate && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Create Cron Job
              <Tooltip text="Define a new scheduled task. The cron expression determines when it runs, and the prompt tells the AI what to do each time it triggers." />
            </span>
          </div>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">
                Schedule (cron expression)
                <Tooltip text='Standard 5-field cron expression: minute hour day-of-month month day-of-week. Examples: "*/30 * * * *" = every 30 min, "0 9 * * 1-5" = weekdays at 9 AM, "0 0 1 * *" = monthly on the 1st.' />
              </label>
              <input className="form-input" placeholder="*/30 * * * *" value={newJob.schedule}
                onChange={e => setNewJob({ ...newJob, schedule: e.target.value })} />
              {newJob.schedule && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {cronToHuman(newJob.schedule)}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">
                Name (optional)
                <Tooltip text="A human-readable name to identify this job. If omitted, the job ID is used. Useful for managing multiple scheduled tasks." />
              </label>
              <input className="form-input" placeholder="My job" value={newJob.name}
                onChange={e => setNewJob({ ...newJob, name: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">
              Prompt
              <Tooltip text="The message sent to the AI agent each time the cron job triggers. This is treated like a user message in a new conversation. Be specific about what you want the agent to do." />
            </label>
            <textarea className="form-textarea" placeholder="What should Hermes do?" value={newJob.prompt}
              onChange={e => setNewJob({ ...newJob, prompt: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={create} disabled={!newJob.schedule || !newJob.prompt || createMutation.isPending}>
              <Plus size={14} /> Create
            </button>
          </div>
        </div>
      )}

      {isLoading ? <div className="spinner" /> : jobs.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Clock size={40} />
            <p>No cron jobs configured</p>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name <Tooltip text="The job's display name or its unique ID if no name was set." /></th>
                <th>Schedule <Tooltip text='Cron expression defining when the job runs. Format: minute hour day-of-month month day-of-week. "*/30 * * * *" means every 30 minutes.' /></th>
                <th>Status <Tooltip text="Active jobs run on their defined schedule. Paused jobs are temporarily suspended and won't execute until resumed." /></th>
                <th>Last Run <Tooltip text="When this job was last executed. Shows 'Never' if the job hasn't run yet since creation." /></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td style={{ fontWeight: 600 }}>{job.name || job.id}</td>
                  <td>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{job.schedule}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{cronToHuman(job.schedule)}</div>
                  </td>
                  <td>
                    <span className={`badge ${job.enabled ? 'badge-success' : 'badge-warning'}`}>
                      {job.enabled ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {job.last_run || 'Never'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => toggle(job)} disabled={pauseMutation.isPending || resumeMutation.isPending}>
                        {job.enabled ? <Pause size={12} /> : <Play size={12} />}
                        {job.enabled ? 'Pause' : 'Resume'}
                        <Tooltip text={job.enabled ? 'Temporarily stop this job from running on schedule. It can be resumed later.' : 'Resume this paused job so it runs on its defined schedule again.'} />
                      </button>
                      <button className="btn btn-sm" onClick={() => runNow(job.id)} disabled={runMutation.isPending}>
                        <PlayCircle size={12} /> Run
                        <Tooltip text="Manually trigger this job now, regardless of its schedule. The AI agent will execute the prompt immediately." />
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(job.id)} aria-label="Delete cron job">
                        <Trash2 size={12} />
                        <Tooltip text="Permanently delete this scheduled job. This action cannot be undone." />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmModal && <ConfirmModal title="Confirm" message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} confirmLabel="Delete" />}
    </div>
  )
}
