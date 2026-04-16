const BASE = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000' : '')

let _token = localStorage.getItem('ap_token') || ''
let _refreshToken = localStorage.getItem('ap_refresh_token') || ''

export const setToken = (t, rt) => {
  _token = t
  localStorage.setItem('ap_token', t)
  if (rt !== undefined) {
    _refreshToken = rt
    if (rt) localStorage.setItem('ap_refresh_token', rt)
    else localStorage.removeItem('ap_refresh_token')
  }
}
export const getToken = () => _token
export const clearToken = () => {
  _token = ''
  _refreshToken = ''
  localStorage.removeItem('ap_token')
  localStorage.removeItem('ap_refresh_token')
}

// ── Refresh token logic ───────────────────────────────────────────────────────

let _refreshingPromise = null  // deduplicate concurrent refresh calls

async function _tryRefresh() {
  if (!_refreshToken) {
    clearToken()
    window.location.reload()
    return false
  }
  if (_refreshingPromise) return _refreshingPromise

  _refreshingPromise = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${_refreshToken}` },
  }).then(async res => {
    if (!res.ok) {
      clearToken()
      window.location.reload()
      return false
    }
    const data = await res.json()
    setToken(data.access_token, data.refresh_token)
    return true
  }).catch(() => {
    clearToken()
    window.location.reload()
    return false
  }).finally(() => {
    _refreshingPromise = null
  })

  return _refreshingPromise
}

// ── Core request helper ───────────────────────────────────────────────────────

const authHeaders = () => ({ Authorization: `Bearer ${_token}` })
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' })

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)

  if (res.status === 401) {
    const refreshed = await _tryRefresh()
    if (!refreshed) return null  // page will reload

    // Retry the original request with the new token
    const retryOpts = {
      ...opts,
      headers: { ...opts.headers, Authorization: `Bearer ${_token}` },
    }
    const retry = await fetch(`${BASE}${path}`, retryOpts)
    if (!retry.ok) {
      const err = await retry.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${retry.status}`)
    }
    if (retry.status === 204) return null
    return retry.json()
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const login = async (email, password) => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Email ou mot de passe incorrect')
    if (res.status === 429) throw new Error('Trop de tentatives, réessayez dans une minute')
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Erreur serveur (${res.status})`)
  }
  const data = await res.json()
  setToken(data.access_token, data.refresh_token)
  return data
}

export const logout = async () => {
  if (_refreshToken) {
    await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${_refreshToken}` },
    }).catch(() => {})
  }
  clearToken()
}

// Helper: build WebSocket URL with auth token
export const wsUrl = (path) => {
  const base = BASE.replace(/^http/, 'ws')
  return `${base}${path}${_token ? '?token=' + encodeURIComponent(_token) : ''}`
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = () => req('/stats', { headers: authHeaders() })

// ── Properties ────────────────────────────────────────────────────────────────
export const getProperties = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return req(`/properties${q ? '?' + q : ''}`, { headers: authHeaders() })
}

export const createProperty = (body) =>
  req('/properties', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })

export const updateProperty = (id, body) =>
  req(`/properties/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })

export const deleteProperty = (id) =>
  req(`/properties/${id}`, { method: 'DELETE', headers: authHeaders() })

export const uploadPhotos = async (propertyId, files) => {
  const form = new FormData()
  for (const f of files) form.append('files', f)
  const res = await fetch(`${BASE}/properties/${propertyId}/photos`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const deletePhoto = (propertyId, url) =>
  req(`/properties/${propertyId}/photos?url=${encodeURIComponent(url)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })

// ── Workflows ────────────────────────────────────────────────────────────────
export const triggerWorkflow = (propertyId, sync = false) =>
  req(`/workflows/new_property/${propertyId}${sync ? '?sync=true' : ''}`, {
    method: 'POST',
    headers: jsonHeaders(),
  })

export const getWorkflowRuns = (propertyId) =>
  req(`/workflows/runs${propertyId ? '?property_id=' + propertyId : ''}`, { headers: authHeaders() })

// ── Listings ──────────────────────────────────────────────────────────────────
export const generateListings = (propertyId) =>
  req(`/listings/generate/${propertyId}`, { method: 'POST', headers: jsonHeaders() })

export const getListings = (propertyId) =>
  req(`/listings/${propertyId}`, { headers: authHeaders() })

export const updateListing = (listingId, body) =>
  req(`/listings/listing/${listingId}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })

// ── Documents ─────────────────────────────────────────────────────────────────
export const getDocuments = (propertyId) =>
  req(`/documents/${propertyId}`, { headers: authHeaders() })

export const uploadDocument = async (propertyId, file) => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/documents/upload/${propertyId}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const uploadOrphanDocument = async (file) => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/documents/upload-orphan`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Conversations ─────────────────────────────────────────────────────────────
export const getConversations = () =>
  req('/chat/conversations', { headers: authHeaders() })

export const getMessages = (convId) =>
  req(`/chat/conversations/${convId}/messages`, { headers: authHeaders() })

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings = () =>
  req('/settings', { headers: authHeaders() })

export const updateSettings = (body) =>
  req('/settings', {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })

export const crawlWebsite = (sync = false) =>
  req(`/settings/crawl-website${sync ? '?sync=true' : ''}`, {
    method: 'POST',
    headers: jsonHeaders(),
  })

// ── Prospects (CRM) ───────────────────────────────────────────────────────────
export const getProspects = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return req(`/prospects${q ? '?' + q : ''}`, { headers: authHeaders() })
}

export const getProspect = (id) =>
  req(`/prospects/${id}`, { headers: authHeaders() })

export const updateProspect = (id, body) =>
  req(`/prospects/${id}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })

export const sendProspectEmail = (id, body) =>
  req(`/prospects/${id}/send-email`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  })

export const getProspectsExportUrl = (status) =>
  `${BASE}/prospects/export${status ? '?status=' + status : ''}`

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getAnalyticsOverview = (days = 30) =>
  req(`/analytics/overview?days=${days}`, { headers: authHeaders() })

export const getAnalyticsTimeline = (days = 30) =>
  req(`/analytics/timeline?days=${days}`, { headers: authHeaders() })

export const getAnalyticsTopSearches = (days = 30) =>
  req(`/analytics/top-searches?days=${days}`, { headers: authHeaders() })

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications = (unreadOnly = false) =>
  req(`/notifications${unreadOnly ? '?unread_only=true' : ''}`, { headers: authHeaders() })

export const markNotificationRead = (id) =>
  req(`/notifications/${id}/read`, { method: 'PATCH', headers: authHeaders() })

export const markAllNotificationsRead = () =>
  req('/notifications/read-all', { method: 'PATCH', headers: authHeaders() })
