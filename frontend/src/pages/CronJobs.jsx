import { useState, useEffect } from 'react'
import { Clock, Plus, Pause, Play, Trash2, PlayCircle, RefreshCw } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

export default function CronJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newJob, setNewJob] = useState({ schedule: '', prompt: '', name: '' })

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listCronJobs()
      setJobs(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    try {
      await api.createCronJob(newJob.schedule, newJob.prompt, newJob.name)
      setShowCreate(false)
      setNewJob({ schedule: '', prompt: '', name: '' })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const toggle = async (job) => {
    try {
      if (job.enabled) await api.pauseCronJob(job.id)
      else await api.resumeCronJob(job.id)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const runNow = async (id) => {
    try { await api.runCronJob(id) } catch (e) { setError(e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this cron job?')) return
    try { await api.deleteCronJob(id); load() }
    catch (e) { setError(e.message) }
  }

  return (
    <div>
      <div className="page-title">
        <Clock size={28} />
        Cron Jobs
        <Tooltip text="Scheduled tasks that run automatically at defined times. Each cron job sends a prompt to the AI agent, which executes it like a normal conversation. Useful for recurring reports, health checks, data processing, and automated workflows." />
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)} style={{ marginLeft: 8 }}>
          <Plus size={14} /> New Job
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

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
            <button className="btn btn-primary" onClick={create} disabled={!newJob.schedule || !newJob.prompt}>
              <Plus size={14} /> Create
            </button>
          </div>
        </div>
      )}

      {loading ? <div className="spinner" /> : jobs.length === 0 ? (
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
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{job.schedule}</td>
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
                      <button className="btn btn-sm" onClick={() => toggle(job)}>
                        {job.enabled ? <Pause size={12} /> : <Play size={12} />}
                        {job.enabled ? 'Pause' : 'Resume'}
                      </button>
                      <button className="btn btn-sm" onClick={() => runNow(job.id)}>
                        <PlayCircle size={12} /> Run
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(job.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
