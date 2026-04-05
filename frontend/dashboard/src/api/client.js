const BASE = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000' : '')

let _token = localStorage.getItem('ap_token') || ''

export const setToken = (t) => { _token = t; localStorage.setItem('ap_token', t) }
export const getToken = () => _token
export const clearToken = () => { _token = ''; localStorage.removeItem('ap_token') }

const authHeaders = () => ({ Authorization: `Bearer ${_token}` })
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' })

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  if (res.status === 401) { clearToken(); window.location.reload() }
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
  if (!res.ok) throw new Error('Identifiants incorrects')
  return res.json()
}

// ── Stats ─────────────────────────────────────────────────────────────────────
export const getStats = () => req('/stats', { headers: authHeaders() })

// ── Properties ────────────────────────────────────────────────────────────────
export const getProperties = (params = {}) => {
  const q = new URLSearchParams(params).toString()
  return req(`/properties${q ? '?' + q : ''}`, { headers: authHeaders() })
}

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

// ── Conversations ─────────────────────────────────────────────────────────────
export const getConversations = () =>
  req('/chat/conversations', { headers: authHeaders() })

export const getMessages = (convId) =>
  req(`/chat/conversations/${convId}/messages`, { headers: authHeaders() })
