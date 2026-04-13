import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'

export default function Register() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null) // null | 'pending' | 'success'
  const [isFirstUser, setIsFirstUser] = useState(false)

  useEffect(() => {
    api.userRegistrationStatus().then(data => {
      setIsFirstUser(data.total_users === 0)
    }).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const res = await api.userRegister(username, password, displayName)
      if (res.success) {
        if (res.auto_approved) {
          // First user — auto-login
          localStorage.setItem('hermes_user_token', res.token)
          localStorage.setItem('hermes_user', JSON.stringify(res.user))
          window.dispatchEvent(new CustomEvent('auth-changed'))
          navigate('/')
        } else {
          setStatus('pending')
        }
      } else {
        setError(res.error || 'Registration failed')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'pending') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Registration Submitted</h1>
          </div>
          <div className="auth-success-msg">
            <p>Your account has been created and is <strong>pending admin approval</strong>.</p>
            <p>You will be able to sign in once an administrator approves your request.</p>
          </div>
          <div className="auth-footer">
            <Link to="/login" className="auth-link">Back to Sign In</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1>{isFirstUser ? 'Create Admin Account' : 'Request Access'}</h1>
          <p>
            {isFirstUser
              ? 'Set up the first admin account for the dashboard'
              : 'Submit a registration request for admin approval'}
          </p>
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
              placeholder="3-50 chars: letters, digits, - and _"
              autoFocus
              required
              minLength={3}
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label htmlFor="displayName">Display Name (optional)</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your full name"
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Creating...' : (isFirstUser ? 'Create Admin Account' : 'Submit Request')}
          </button>
        </form>

        <div className="auth-footer">
          <span>Already have an account? </span>
          <Link to="/login" className="auth-link">Sign In</Link>
        </div>
      </div>
    </div>
  )
}
