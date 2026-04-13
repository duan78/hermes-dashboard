import { useState, useCallback } from 'react'
import { Users, Plus, Pencil, Trash2, X, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useLeads, useLeadsStats, useCreateLead, useUpdateLead, useDeleteLead } from '../hooks/useApi'
import { useToast } from '../contexts/ToastContext'
import ConfirmModal from '../components/ConfirmModal'
import './leads.css'

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']

const STATUS_COLORS = {
  new: '#6b7280',
  contacted: '#3b82f6',
  qualified: '#8b5cf6',
  proposal: '#f59e0b',
  negotiation: '#f97316',
  won: '#22c55e',
  lost: '#ef4444',
}

const STATUS_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}

const SORT_OPTIONS = [
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'value_desc', label: 'Value high-low' },
  { value: 'value_asc', label: 'Value low-high' },
]

const PAGE_SIZE = 25

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  company: '',
  status: 'new',
  source: '',
  notes: '',
  value: '',
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#6b7280'
  return (
    <span className="leads-badge" style={{ background: `${color}22`, borderColor: color, color }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function formatCurrency(val) {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

export default function Leads() {
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('created_desc')
  const [showForm, setShowForm] = useState(false)
  const [editLead, setEditLead] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const { data, isLoading } = useLeads(offset, PAGE_SIZE, search, statusFilter, sort)
  const { data: stats } = useLeadsStats()
  const createLead = useCreateLead()
  const updateLead = useUpdateLead()
  const deleteLead = useDeleteLead()

  const leads = data?.leads || []
  const total = data?.total || 0
  const hasMore = data?.has_more || false
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleSearch = useCallback((e) => {
    e.preventDefault()
    setSearch(searchInput)
    setOffset(0)
  }, [searchInput])

  const openCreate = () => {
    setFormData(EMPTY_FORM)
    setEditLead(null)
    setShowForm(true)
  }

  const openEdit = (lead) => {
    setFormData({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      status: lead.status || 'new',
      source: lead.source || '',
      notes: lead.notes || '',
      value: lead.value ?? '',
    })
    setEditLead(lead)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast('Lead name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...formData,
        value: formData.value === '' ? null : Number(formData.value),
      }
      if (editLead) {
        await updateLead.mutateAsync({ id: editLead.id, lead: payload })
        toast('Lead updated', 'success')
      } else {
        await createLead.mutateAsync(payload)
        toast('Lead created', 'success')
      }
      setShowForm(false)
      setEditLead(null)
    } catch (err) {
      toast(err.message || 'Failed to save lead', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteLead.mutateAsync(deleteTarget.id)
      toast('Lead deleted', 'success')
      setDeleteTarget(null)
      // If we deleted the last item on this page, go back one page
      if (leads.length === 1 && offset > 0) {
        setOffset(Math.max(0, offset - PAGE_SIZE))
      }
    } catch (err) {
      toast(err.message || 'Failed to delete lead', 'error')
    }
  }

  const goToPage = (page) => {
    setOffset((page - 1) * PAGE_SIZE)
  }

  const handleSortChange = (newSort) => {
    setSort(newSort)
    setOffset(0)
  }

  const handleStatusFilter = (newStatus) => {
    setStatusFilter(newStatus)
    setOffset(0)
  }

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    let end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  return (
    <div className="leads-page">
      {/* Header */}
      <div className="leads-header">
        <div className="page-title" style={{ marginBottom: 0 }}>
          <Users size={20} />
          EasyCRM — Leads
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={15} /> New Lead
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="leads-stats">
          <div className="leads-stat-card">
            <div className="leads-stat-value">{stats.total}</div>
            <div className="leads-stat-label">Total</div>
          </div>
          {Object.entries(stats.by_status || {}).map(([s, count]) => (
            <div className="leads-stat-card" key={s}>
              <div className="leads-stat-value" style={{ color: STATUS_COLORS[s] }}>{count}</div>
              <div className="leads-stat-label">{STATUS_LABELS[s] || s}</div>
            </div>
          ))}
          {stats.total_value > 0 && (
            <div className="leads-stat-card">
              <div className="leads-stat-value">{formatCurrency(stats.total_value)}</div>
              <div className="leads-stat-label">Pipeline Value</div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="leads-filters">
        <form onSubmit={handleSearch} style={{ flex: 1, display: 'flex', gap: 8, minWidth: 180 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="leads-search"
              style={{ paddingLeft: 30 }}
              placeholder="Search leads..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <button type="submit" className="leads-btn" style={{ padding: '6px 12px' }}>Search</button>
          {search && (
            <button className="leads-btn" onClick={() => { setSearch(''); setSearchInput(''); setOffset(0) }}>
              <X size={13} /> Clear
            </button>
          )}
        </form>
        <select className="leads-filter-select" value={statusFilter} onChange={(e) => handleStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select className="leads-filter-select" value={sort} onChange={(e) => handleSortChange(e.target.value)}>
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="leads-loading"><Loader2 size={24} className="spin" /> Loading leads...</div>
      ) : leads.length === 0 ? (
        <div className="leads-empty">
          <Users size={40} />
          <p>{search || statusFilter ? 'No leads match your filters.' : 'No leads yet. Create your first lead!'}</p>
          {!search && !statusFilter && (
            <button className="leads-btn leads-btn-primary" onClick={openCreate}>
              <Plus size={14} /> Create Lead
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="leads-table-wrap">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Source</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={lead.id}>
                    <td className="leads-table-name">{lead.name}</td>
                    <td className="leads-table-company">{lead.company || '-'}</td>
                    <td className="leads-table-email">{lead.email || '-'}</td>
                    <td><StatusBadge status={lead.status} /></td>
                    <td className="leads-table-value">{formatCurrency(lead.value)}</td>
                    <td>{lead.source || '-'}</td>
                    <td>{formatDate(lead.created_at)}</td>
                    <td>
                      <div className="leads-row-actions">
                        <button className="leads-btn" onClick={() => openEdit(lead)} title="Edit"><Pencil size={13} /></button>
                        <button className="leads-btn leads-btn-delete" onClick={() => setDeleteTarget(lead)} title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="leads-pagination">
              <div className="leads-pagination-info">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </div>
              <div className="leads-pagination-buttons">
                <button
                  className="leads-pagination-btn"
                  disabled={offset === 0}
                  onClick={() => goToPage(1)}
                  title="First page"
                >
                  <ChevronLeft size={14} /><ChevronLeft size={14} />
                </button>
                <button
                  className="leads-pagination-btn"
                  disabled={offset === 0}
                  onClick={() => goToPage(currentPage - 1)}
                >
                  <ChevronLeft size={14} />
                </button>
                {getPageNumbers().map(page => (
                  <button
                    key={page}
                    className={`leads-pagination-btn ${page === currentPage ? 'active' : ''}`}
                    onClick={() => goToPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="leads-pagination-btn"
                  disabled={!hasMore}
                  onClick={() => goToPage(currentPage + 1)}
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  className="leads-pagination-btn"
                  disabled={!hasMore}
                  onClick={() => goToPage(totalPages)}
                  title="Last page"
                >
                  <ChevronRight size={14} /><ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="leads-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="leads-modal" onClick={(e) => e.stopPropagation()}>
            <div className="leads-modal-header">
              <h3>{editLead ? 'Edit Lead' : 'New Lead'}</h3>
              <button className="leads-btn" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>

            <div className="leads-form-group">
              <label>Name *</label>
              <input className="leads-search" value={formData.name} onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="Lead name" autoFocus />
            </div>

            <div className="leads-form-row">
              <div className="leads-form-group">
                <label>Email</label>
                <input className="leads-search" value={formData.email} onChange={(e) => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div className="leads-form-group">
                <label>Phone</label>
                <input className="leads-search" value={formData.phone} onChange={(e) => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 1234" />
              </div>
            </div>

            <div className="leads-form-row">
              <div className="leads-form-group">
                <label>Company</label>
                <input className="leads-search" value={formData.company} onChange={(e) => setFormData(f => ({ ...f, company: e.target.value }))} placeholder="Company name" />
              </div>
              <div className="leads-form-group">
                <label>Source</label>
                <input className="leads-search" value={formData.source} onChange={(e) => setFormData(f => ({ ...f, source: e.target.value }))} placeholder="Website, referral..." />
              </div>
            </div>

            <div className="leads-form-row-3">
              <div className="leads-form-group">
                <label>Status</label>
                <select className="leads-filter-select" style={{ width: '100%' }} value={formData.status} onChange={(e) => setFormData(f => ({ ...f, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div className="leads-form-group">
                <label>Value ($)</label>
                <input className="leads-search" type="number" min="0" step="100" value={formData.value} onChange={(e) => setFormData(f => ({ ...f, value: e.target.value }))} placeholder="0" />
              </div>
            </div>

            <div className="leads-form-group">
              <label>Notes</label>
              <textarea
                className="leads-search"
                style={{ minHeight: 80, resize: 'vertical' }}
                value={formData.notes}
                onChange={(e) => setFormData(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notes about this lead..."
              />
            </div>

            <div className="leads-form-actions">
              <button className="leads-btn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="leads-btn leads-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                {editLead ? ' Save Changes' : ' Create Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Lead"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <style>{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
