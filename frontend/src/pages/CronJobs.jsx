import { useState, useEffect } from 'react'
import { Clock, Plus, Pause, Play, Trash2, PlayCircle, RefreshCw } from 'lucide-react'
import { api } from '../api'

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
          <div className="card-header"><span className="card-title">Create Cron Job</span></div>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Schedule (cron expression)</label>
              <input className="form-input" placeholder="*/30 * * * *" value={newJob.schedule}
                onChange={e => setNewJob({ ...newJob, schedule: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Name (optional)</label>
              <input className="form-input" placeholder="My job" value={newJob.name}
                onChange={e => setNewJob({ ...newJob, name: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Prompt</label>
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
                <th>Name</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Last Run</th>
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
