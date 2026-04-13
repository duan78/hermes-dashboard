import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasUsers, setHasUsers] = useState(null)

  useEffect(() => {
    api.userRegistrationStatus().then(data => {
      setHasUsers(data.total_users > 0)
    }).catch(() => setHasUsers(true))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.userLogin(username, password)
      if (res.success) {
        localStorage.setItem('hermes_user_token', res.token)
        localStorage.setItem('hermes_user', JSON.stringify(res.user))
        window.dispatchEvent(new CustomEvent('auth-changed'))
        navigate('/')
      } else {
        setError(res.error || 'Login failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Hermes Dashboard</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {hasUsers === false && (
          <div className="auth-footer">
            <Link to="/register" className="auth-link">Create admin account</Link>
          </div>
        )}
        {hasUsers === true && (
          <div className="auth-footer">
            <span>Don't have an account? </span>
            <Link to="/register" className="auth-link">Request access</Link>
          </div>
        )}
      </div>
    </div>
  )
}
