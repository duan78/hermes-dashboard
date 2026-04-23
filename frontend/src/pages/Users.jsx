import { useState, useEffect } from 'react'
import { api } from '../api'
import './users.css'

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState(null)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')
    try {
      const res = await api.userList()
      if (res.success) {
        setUsers(res.users)
      } else {
        setError(res.error || 'Failed to load users')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(userId) {
    try {
      const res = await api.userApprove(userId)
      if (res.success) {
        setStatus({ type: 'success', msg: `Approved ${res.user.username}` })
        loadUsers()
      } else {
        setStatus({ type: 'error', msg: res.error })
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    }
  }

  async function handleReject(userId) {
    if (!confirm('Reject this user? They will need to register again.')) return
    try {
      const res = await api.userReject(userId)
      if (res.success) {
        setStatus({ type: 'success', msg: `Rejected ${res.user.username}` })
        loadUsers()
      } else {
        setStatus({ type: 'error', msg: res.error })
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    }
  }

  async function handleRoleChange(userId, newRole) {
    try {
      const res = await api.userChangeRole(userId, newRole)
      if (res.success) {
        setStatus({ type: 'success', msg: `Changed ${res.user.username} to ${newRole}` })
        loadUsers()
      } else {
        setStatus({ type: 'error', msg: res.error })
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    }
  }

  async function handleDelete(userId, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    try {
      const res = await api.userDelete(userId)
      if (res.success) {
        setStatus({ type: 'success', msg: `Deleted ${username}` })
        loadUsers()
      } else {
        setStatus({ type: 'error', msg: res.error })
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message })
    }
  }

  const pending = users.filter(u => u.status === 'pending')
  const active = users.filter(u => u.status === 'active')
  const rejected = users.filter(u => u.status === 'rejected')

  if (loading) {
    return <div className="page-loading">Loading users...</div>
  }

  if (error && users.length === 0) {
    return (
      <div className="page-container">
        <h1 className="page-title">User Management</h1>
        <div className="error-box">{error}</div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <h1 className="page-title">User Management</h1>

      {status && (
        <div className={`status-msg ${status.type}`}>
          {status.msg}
          <button onClick={() => setStatus(null)} className="status-close">&times;</button>
        </div>
      )}

      {/* Pending Approvals */}
      {pending.length > 0 && (
        <section className="section">
          <h2 className="section-title">Pending Approval ({pending.length})</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(u => (
                  <tr key={u.id}>
                    <td><code>{u.username}</code></td>
                    <td>{u.display_name || '—'}</td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-sm btn-success" onClick={() => handleApprove(u.id)}>
                          Approve
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleReject(u.id)}>
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Active Users */}
      <section className="section">
        <h2 className="section-title">Active Users ({active.length})</h2>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Created</th>
                <th>Approved By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map(u => (
                <tr key={u.id}>
                  <td><code>{u.username}</code></td>
                  <td>{u.display_name || '—'}</td>
                  <td>
                    <select
                      className="role-select"
                      value={u.role}
                      onChange={e => handleRoleChange(u.id, e.target.value)}
                    >
                      <option value="admin">admin</option>
                      <option value="viewer">viewer</option>
                    </select>
                  </td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td>{u.approved_by || '—'}</td>
                  <td>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id, u.username)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Rejected Users */}
      {rejected.length > 0 && (
        <section className="section">
          <h2 className="section-title">Rejected ({rejected.length})</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map(u => (
                  <tr key={u.id} className="row-dimmed">
                    <td><code>{u.username}</code></td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-sm btn-success" onClick={() => handleApprove(u.id)}>
                          Re-approve
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.id, u.username)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
