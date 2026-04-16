import { useEffect, useRef, useState } from 'react'
import {
  Search, Sparkles, Paperclip, Check, FileText, Ruler,
  DoorOpen, Building2, MapPin,
  Loader2, Euro, BedDouble, Zap, Plus,
  Upload, Image, X, ChevronLeft, ChevronRight, Pencil,
  CheckCircle2, Play, Clock, AlertTriangle,
} from 'lucide-react'
import {
  generateListings, getDocuments, getListings, getProperties,
  updateListing, uploadDocument, createProperty, updateProperty,
  uploadPhotos, deletePhoto, uploadOrphanDocument,
  triggerWorkflow, getWorkflowRuns,
} from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  active:     'rgba(16,185,129,0.1)',
  inactive:   'rgba(155,148,136,0.1)',
  sold:       'rgba(107,100,89,0.1)',
  rented:     'rgba(139,92,246,0.1)',
  draft:      'rgba(245,158,11,0.1)',
  review:     'rgba(59,130,246,0.1)',
  approved:   'rgba(16,185,129,0.1)',
  published:  'rgba(59,130,246,0.1)',
  pending:    'rgba(245,158,11,0.1)',
  processing: 'rgba(59,130,246,0.1)',
  done:       'rgba(16,185,129,0.1)',
  error:      'rgba(239,68,68,0.1)',
}
const STATUS_TEXT = {
  active: '#059669', inactive: '#9B9488', sold: '#6B6459',
  rented: '#7C3AED', draft: '#D97706', review: '#2563EB',
  approved: '#059669', published: '#2563EB',
  pending: '#D97706', processing: '#2563EB', done: '#059669', error: '#EF4444',
}
const STATUS_BORDER = {
  active: 'rgba(16,185,129,0.25)', inactive: 'rgba(155,148,136,0.25)',
  sold: 'rgba(107,100,89,0.25)', rented: 'rgba(139,92,246,0.25)',
  draft: 'rgba(245,158,11,0.25)', review: 'rgba(59,130,246,0.25)',
  approved: 'rgba(16,185,129,0.25)', published: 'rgba(59,130,246,0.25)',
  pending: 'rgba(245,158,11,0.25)', processing: 'rgba(59,130,246,0.25)',
  done: 'rgba(16,185,129,0.25)', error: 'rgba(239,68,68,0.25)',
}

const STATUS_LABELS = {
  active: 'Actif', inactive: 'Inactif', sold: 'Vendu', rented: 'Lou\u00e9',
  draft: 'Brouillon', review: 'En r\u00e9vision',
  approved: 'Approuv\u00e9', published: 'Publi\u00e9',
  pending: 'En attente', processing: 'En cours', done: 'Analys\u00e9', error: 'Erreur',
}

const WORKFLOW_NEXT = { draft: 'review', review: 'active', active: 'sold' }
const WORKFLOW_NEXT_LABEL = { draft: 'Soumettre pour r\u00e9vision', review: 'Activer', active: 'Marquer vendu' }

const PROPERTY_TYPES = ['appartement', 'maison', 'terrain', 'parking', 'local commercial', 'autre']
const ORIENTATIONS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest']
const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000' : window.location.origin

// ── Small reusables ───────────────────────────────────────────────────────────

function Badge({ status }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{
            background: STATUS_COLORS[status] || 'rgba(155,148,136,0.1)',
            color: STATUS_TEXT[status] || '#9B9488',
            border: `1px solid ${STATUS_BORDER[status] || 'rgba(155,148,136,0.25)'}`,
          }}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-card-lg text-sm font-medium flex items-center gap-2 text-white"
         style={{ background: type === 'error' ? '#EF4444' : '#059669' }}>
      <Check size={14} /> {msg}
    </div>
  )
}

const PLATFORM_META = {
  leboncoin: { label: 'Leboncoin', bg: 'rgba(234,88,12,0.08)',  text: '#C2410C', border: 'rgba(234,88,12,0.2)' },
  seloger:   { label: 'SeLoger',   bg: 'rgba(37,99,235,0.08)',  text: '#1D4ED8', border: 'rgba(37,99,235,0.2)' },
  website:   { label: 'Site web',  bg: 'rgba(155,148,136,0.08)',text: '#6B6459', border: 'rgba(155,148,136,0.2)' },
}

const DOC_LABELS = { dpe: 'DPE', copro: 'Copropri\u00e9t\u00e9', mandat: 'Mandat', diagnostic: 'Diagnostic', other: 'Autre' }

const STEP_LABELS = {
  load_property: 'Chargement du bien',
  run_analyst: 'Analyse des documents',
  run_writer: 'G\u00e9n\u00e9ration des annonces',
  find_matching_prospects: 'Scoring des prospects',
  notify_prospects: 'Notification des prospects',
  finalize: 'Finalisation',
}

// ── WorkflowTab ───────────────────────────────────────────────────────────────

function WorkflowTab({ property }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [toast, setToast] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const load = () => {
    setLoading(true)
    getWorkflowRuns(property.id).then(setRuns).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [property.id])

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await triggerWorkflow(property.id)
      setToast({ type: 'success', msg: 'Workflow lanc\u00e9 en arri\u00e8re-plan. Actualisez dans quelques secondes.' })
      setTimeout(() => { load(); setToast(null) }, 4000)
    } catch (e) {
      setToast({ type: 'error', msg: e.message })
      setTimeout(() => setToast(null), 4000)
    } finally { setTriggering(false) }
  }

  const fmtDuration = (run) => {
    if (!run.started_at || !run.completed_at) return null
    const ms = new Date(run.completed_at) - new Date(run.started_at)
    const s = Math.round(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`
  }

  const stepStatusStyle = (status) => {
    const map = {
      done:             { bg: 'rgba(16,185,129,0.08)',  text: '#059669', border: 'rgba(16,185,129,0.2)'  },
      done_with_errors: { bg: 'rgba(245,158,11,0.08)',  text: '#D97706', border: 'rgba(245,158,11,0.2)'  },
      error:            { bg: 'rgba(239,68,68,0.08)',   text: '#EF4444', border: 'rgba(239,68,68,0.2)'   },
      skipped:          { bg: 'rgba(155,148,136,0.08)', text: '#9B9488', border: 'rgba(155,148,136,0.2)' },
      running:          { bg: 'rgba(59,130,246,0.08)',  text: '#2563EB', border: 'rgba(59,130,246,0.2)'  },
    }
    return map[status] || map.running
  }

  return (
    <div className="space-y-4">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all text-white disabled:opacity-50"
          style={{ background: '#0A0A0F' }}
        >
          {triggering ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {triggering ? 'Lancement\u2026' : 'D\u00e9clencher le workflow'}
        </button>
        <button onClick={load} className="px-3 py-2 border border-lin rounded-lg text-sm transition-colors hover:bg-creme"
                style={{ color: '#6B6459' }}>
          Actualiser
        </button>
        <span className="text-xs" style={{ color: '#9B9488' }}>Analyse \u2192 Annonces \u2192 Matching \u2192 Emails</span>
      </div>

      {loading && runs.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: '#9B9488' }}>Chargement\u2026</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-8 text-sm" style={{ color: '#E8E2D5' }}>Aucun workflow ex\u00e9cut\u00e9 pour ce bien</div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => {
            const rs = stepStatusStyle(run.status)
            return (
              <div key={run.id} className="border border-lin rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-white text-left transition-colors hover:bg-creme"
                  onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: rs.bg, color: rs.text, border: `1px solid ${rs.border}` }}>
                      {run.status === 'done' ? 'Termin\u00e9' : run.status === 'done_with_errors' ? 'Partiel' :
                       run.status === 'error' ? 'Erreur' : run.status === 'running' ? 'En cours' : run.status}
                    </span>
                    <span className="text-xs" style={{ color: '#9B9488' }}>
                      {run.started_at ? new Date(run.started_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    {fmtDuration(run) && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: '#9B9488' }}>
                        <Clock size={11} /> {fmtDuration(run)}
                      </span>
                    )}
                  </div>
                  {run.summary && (
                    <span className="text-xs" style={{ color: '#9B9488' }}>
                      {run.summary.listings_generated?.length || 0} annonces &bull; {run.summary.prospects_notified || 0} prospects
                    </span>
                  )}
                </button>
                {expanded === run.id && (
                  <div className="px-4 py-3 space-y-2" style={{ borderTop: '1px solid #F0ECE4', background: '#F8F6F1' }}>
                    {(run.steps || []).map((step, i) => {
                      const ss = stepStatusStyle(step.status)
                      return (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <span className="mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
                                style={{ background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}>
                            {step.status === 'done' ? '\u2713' : step.status === 'error' ? '\u2717' :
                             step.status === 'skipped' ? '\u2014' : '\u2026'}
                          </span>
                          <div className="min-w-0">
                            <span className="font-medium" style={{ color: '#1A1A24' }}>
                              {STEP_LABELS[step.name] || step.name}
                            </span>
                            {step.detail && <span className="ml-2" style={{ color: '#9B9488' }}>{step.detail}</span>}
                          </div>
                        </div>
                      )
                    })}
                    {run.summary?.top_prospects?.length > 0 && (
                      <div className="mt-3 pt-3" style={{ borderTop: '1px solid #E8E2D5' }}>
                        <div className="text-xs font-medium mb-2" style={{ color: '#9B9488' }}>Top prospects match\u00e9s</div>
                        <div className="space-y-1">
                          {run.summary.top_prospects.map((p, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span style={{ color: '#1A1A24' }}>{p.name}</span>
                              <span className="font-semibold" style={{ color: '#C9A96E' }}>{p.score}/100</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {run.summary?.errors?.length > 0 && (
                      <div className="mt-2 pt-2" style={{ borderTop: '1px solid #E8E2D5' }}>
                        <div className="text-xs font-medium mb-1" style={{ color: '#EF4444' }}>Erreurs</div>
                        {run.summary.errors.map((e, i) => (
                          <div key={i} className="text-xs truncate" style={{ color: '#EF4444' }}>{e}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ListingsTab ───────────────────────────────────────────────────────────────

function ListingsTab({ property }) {
  const [listings, setListings] = useState([])
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { getListings(property.id).then(setListings).catch(() => {}) }, [property.id])

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await generateListings(property.id)
      setListings(res.listings)
      setToast({ msg: `${res.platforms.length} annonces g\u00e9n\u00e9r\u00e9es`, type: 'success' })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    } finally { setGenerating(false) }
  }

  const approve = async (listing) => {
    try {
      const updated = await updateListing(listing.id, { status: 'approved' })
      setListings(ls => ls.map(l => l.id === updated.id ? updated : l))
    } catch (e) { setToast({ msg: e.message, type: 'error' }) }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm" style={{ color: '#9B9488' }}>{listings.length} annonce(s)</span>
        <button
          onClick={generate}
          disabled={generating}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all text-white disabled:opacity-50"
          style={{ background: '#0A0A0F' }}
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {generating ? 'G\u00e9n\u00e9ration\u2026' : 'G\u00e9n\u00e9rer les annonces'}
        </button>
      </div>
      {listings.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#9B9488' }}>
          <FileText size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Cliquez sur &ldquo;G\u00e9n\u00e9rer les annonces&rdquo; pour cr\u00e9er les textes Leboncoin, SeLoger et site web.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map(l => {
            const meta = PLATFORM_META[l.platform] || PLATFORM_META.website
            return (
              <div key={l.id} className="border border-lin rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3" style={{ background: '#F8F6F1', borderBottom: '1px solid #E8E2D5' }}>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: meta.bg, color: meta.text, border: `1px solid ${meta.border}` }}>
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-3">
                    <Badge status={l.status} />
                    {l.status === 'draft' && (
                      <button onClick={() => approve(l)} className="text-xs font-medium flex items-center gap-1 transition-colors"
                              style={{ color: '#C9A96E' }}>
                        <Check size={12} /> Approuver
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-sm font-semibold text-noir mb-2">{l.title}</div>
                  <div className="text-sm whitespace-pre-wrap line-clamp-4 leading-relaxed" style={{ color: '#6B6459' }}>{l.content}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── DocumentsTab ──────────────────────────────────────────────────────────────

function DocumentsTab({ property }) {
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const fileRef = useRef()

  useEffect(() => { getDocuments(property.id).then(setDocs).catch(() => {}) }, [property.id])

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const doc = await uploadDocument(property.id, file)
      setDocs(d => [doc, ...d])
      setToast({ msg: `Document analys\u00e9\u00a0: ${DOC_LABELS[doc.doc_type] || doc.doc_type}`, type: 'success' })
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm" style={{ color: '#9B9488' }}>{docs.length} document(s)</span>
        <label className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all text-white cursor-pointer"
               style={{ background: '#0A0A0F' }}>
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
          {uploading ? 'Analyse en cours\u2026' : 'Uploader un PDF'}
          <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      {docs.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#9B9488' }}>
          <Paperclip size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Uploadez un PDF (DPE, copropri\u00e9t\u00e9, mandat, diagnostic) pour l&apos;analyser avec l&apos;IA.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="border border-lin rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3" style={{ background: '#F8F6F1', borderBottom: '1px solid #E8E2D5' }}>
                <div className="flex items-center gap-2">
                  <FileText size={13} style={{ color: '#9B9488' }} />
                  <span className="font-medium text-sm text-noir truncate max-w-xs">{doc.filename}</span>
                </div>
                <div className="flex items-center gap-2">
                  {doc.doc_type && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-lin"
                          style={{ background: '#F8F6F1', color: '#6B6459' }}>
                      {DOC_LABELS[doc.doc_type] || doc.doc_type}
                    </span>
                  )}
                  <Badge status={doc.status} />
                </div>
              </div>
              {doc.extracted_data && doc.status === 'done' && (
                <div className="px-5 py-3 text-xs font-mono overflow-auto max-h-40"
                     style={{ background: '#F5F3EE', color: '#6B6459' }}>
                  {JSON.stringify(doc.extracted_data, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── PhotosTab ─────────────────────────────────────────────────────────────────

function PhotosTab({ property, onUpdate }) {
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [current, setCurrent] = useState(0)
  const fileRef = useRef()
  const photos = property.photos || []

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    try {
      const updated = await uploadPhotos(property.id, files)
      onUpdate(updated)
      setToast({ msg: `${files.length} photo(s) ajout\u00e9e(s)`, type: 'success' })
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handleDelete = async (url) => {
    try {
      const updated = await deletePhoto(property.id, url)
      onUpdate(updated)
      setCurrent(c => Math.max(0, c - 1))
    } catch (err) { setToast({ msg: err.message, type: 'error' }) }
  }

  const photoUrl = (url) => url.startsWith('http') ? url : `${BASE}${url}`

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm" style={{ color: '#9B9488' }}>{photos.length} photo(s)</span>
        <label className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-all text-white cursor-pointer"
               style={{ background: '#0A0A0F' }}>
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Image size={13} />}
          {uploading ? 'Upload en cours\u2026' : 'Ajouter des photos'}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#9B9488' }}>
          <Image size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucune photo. Ajoutez des visuels pour ce bien.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden aspect-video" style={{ background: '#F5F3EE' }}>
            <img src={photoUrl(photos[current])} alt={`Photo ${current + 1}`} className="w-full h-full object-cover" />
            {photos.length > 1 && (
              <>
                <button onClick={() => setCurrent(c => (c - 1 + photos.length) % photos.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors"
                        style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setCurrent(c => (c + 1) % photos.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors"
                        style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            <div className="absolute bottom-3 right-3 text-white text-xs px-2 py-1 rounded-full"
                 style={{ background: 'rgba(0,0,0,0.5)' }}>
              {current + 1} / {photos.length}
            </div>
            <button onClick={() => handleDelete(photos[current])}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-white transition-colors"
                    style={{ background: 'rgba(239,68,68,0.8)' }}>
              <X size={13} />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {photos.map((url, i) => (
              <button key={url} onClick={() => setCurrent(i)}
                      className="w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors flex-shrink-0"
                      style={{ borderColor: i === current ? '#C9A96E' : 'transparent' }}>
                <img src={photoUrl(url)} alt={`Miniature ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── PropertyFormModal ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  type: 'appartement', title: '', description: '', price: '', surface: '',
  nb_rooms: '', nb_bedrooms: '', city: '', zipcode: '', address: '',
  floor: '', has_balcony: false, has_parking: false, has_elevator: false,
  has_cellar: false, has_garden: false, energy_class: '', ges_class: '',
  annual_energy_cost: '', charges_monthly: '', orientation: '',
  mandate_ref: '', mandate_type: 'vente', agency_fees_percent: '',
  agent_name: '', agent_email: '',
}

function PropertyFormModal({ initial = {}, title, onSave, onClose, saving }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const num = (v) => v === '' ? undefined : Number(v)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      type: form.type, title: form.title,
      description: form.description || undefined,
      price: num(form.price), surface: num(form.surface),
      nb_rooms: num(form.nb_rooms),
      nb_bedrooms: num(form.nb_bedrooms) || undefined,
      city: form.city, zipcode: form.zipcode,
      address: form.address || undefined,
      floor: num(form.floor) ?? undefined,
      has_balcony: form.has_balcony, has_parking: form.has_parking,
      has_elevator: form.has_elevator, has_cellar: form.has_cellar,
      has_garden: form.has_garden,
      energy_class: form.energy_class || undefined,
      ges_class: form.ges_class || undefined,
      annual_energy_cost: num(form.annual_energy_cost) || undefined,
      charges_monthly: num(form.charges_monthly) || undefined,
      orientation: form.orientation || undefined,
      mandate_ref: form.mandate_ref || undefined,
      mandate_type: form.mandate_type || undefined,
      agency_fees_percent: num(form.agency_fees_percent) || undefined,
      agent_name: form.agent_name || undefined,
      agent_email: form.agent_email || undefined,
    })
  }

  const inp = 'input-field'
  const lbl = 'block text-xs font-medium mb-1'
  const lblStyle = { color: '#6B6459', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const toggle = (k) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => set(k, !form[k])}
           className="relative w-9 h-5 rounded-full transition-colors"
           style={{ background: form[k] ? '#C9A96E' : '#E8E2D5' }}>
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
             style={{ transform: form[k] ? 'translateX(16px)' : 'translateX(2px)' }} />
      </div>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
         style={{ background: 'rgba(10,10,15,0.6)' }}>
      <div className="bg-white rounded-xl shadow-card-lg w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E8E2D5' }}>
          <h2 className="font-serif text-noir font-semibold" style={{ fontSize: '1.1rem' }}>{title}</h2>
          <button onClick={onClose} style={{ color: '#9B9488' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 overflow-y-auto max-h-[75vh]">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Type *</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={inp} required>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={lbl} style={lblStyle}>Titre *</label>
              <input className={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Bel appartement T3 Lyon 6" required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Prix (\u20ac) *</label>
              <input type="number" className={inp} value={form.price} onChange={e => set('price', e.target.value)} min={0} required />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Surface (m\u00b2) *</label>
              <input type="number" className={inp} value={form.surface} onChange={e => set('surface', e.target.value)} min={0} required />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Pi\u00e8ces *</label>
              <input type="number" className={inp} value={form.nb_rooms} onChange={e => set('nb_rooms', e.target.value)} min={1} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Ville *</label>
              <input className={inp} value={form.city} onChange={e => set('city', e.target.value)} required />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Code postal *</label>
              <input className={inp} value={form.zipcode} onChange={e => set('zipcode', e.target.value)} required />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Chambres</label>
              <input type="number" className={inp} value={form.nb_bedrooms} onChange={e => set('nb_bedrooms', e.target.value)} min={0} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <label className={lbl} style={lblStyle}>Adresse</label>
              <input className={inp} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>\u00c9tage</label>
              <input type="number" className={inp} value={form.floor} onChange={e => set('floor', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={lbl} style={lblStyle}>Description</label>
            <textarea rows={3} className={`${inp} resize-none`} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className={lbl} style={lblStyle}>\u00c9quipements</label>
            <div className="flex flex-wrap gap-4 mt-2">
              {[['has_balcony','Balcon'],['has_parking','Parking'],['has_elevator','Ascenseur'],['has_cellar','Cave'],['has_garden','Jardin']].map(([k,l]) => (
                <label key={k} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#1A1A24' }}>
                  {toggle(k)} {l}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Classe DPE</label>
              <input className={inp} value={form.energy_class} onChange={e => set('energy_class', e.target.value.toUpperCase())} maxLength={1} placeholder="A-G" />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Classe GES</label>
              <input className={inp} value={form.ges_class} onChange={e => set('ges_class', e.target.value.toUpperCase())} maxLength={1} placeholder="A-G" />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Charges/mois (\u20ac)</label>
              <input type="number" className={inp} value={form.charges_monthly} onChange={e => set('charges_monthly', e.target.value)} min={0} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Orientation</label>
              <select value={form.orientation} onChange={e => set('orientation', e.target.value)} className={inp}>
                <option value="">\u2014</option>
                {ORIENTATIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Type mandat</label>
              <select value={form.mandate_type} onChange={e => set('mandate_type', e.target.value)} className={inp}>
                <option value="vente">Vente</option>
                <option value="location">Location</option>
              </select>
            </div>
            <div>
              <label className={lbl} style={lblStyle}>R\u00e9f. mandat</label>
              <input className={inp} value={form.mandate_ref} onChange={e => set('mandate_ref', e.target.value)} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Honoraires (%)</label>
              <input type="number" className={inp} value={form.agency_fees_percent} onChange={e => set('agency_fees_percent', e.target.value)} min={0} max={100} step={0.1} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} style={lblStyle}>Nom agent</label>
              <input className={inp} value={form.agent_name} onChange={e => set('agent_name', e.target.value)} />
            </div>
            <div>
              <label className={lbl} style={lblStyle}>Email agent</label>
              <input type="email" className={inp} value={form.agent_email} onChange={e => set('agent_email', e.target.value)} />
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: '1px solid #E8E2D5' }}>
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg transition-colors hover:bg-creme"
                  style={{ color: '#6B6459' }}>
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 flex items-center gap-2 transition-all"
            style={{ background: '#0A0A0F' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {saving ? 'Enregistrement\u2026' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ImportDocModal ────────────────────────────────────────────────────────────

function ImportDocModal({ onCreated, onClose }) {
  const [step, setStep] = useState('upload')
  const [analyzing, setAnalyzing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setAnalyzing(true)
    try {
      const d = await uploadOrphanDocument(file)
      setDraft(d)
      setStep('review')
    } catch (err) { alert(err.message) }
    finally { setAnalyzing(false) }
  }

  const handleCreate = async (formData) => {
    setSaving(true)
    try {
      const prop = await createProperty({ ...formData, status_workflow: 'draft' })
      onCreated(prop)
    } catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  if (step === 'review' && draft) {
    const initial = {
      type: 'appartement', price: draft.price || '', surface: draft.surface || '',
      city: '', zipcode: '', address: draft.address || '',
      energy_class: draft.energy_class || '', ges_class: draft.ges_class || '',
      annual_energy_cost: draft.annual_energy_cost || '',
      charges_monthly: draft.charges_monthly || '',
      mandate_ref: draft.mandate_ref || '', mandate_type: draft.mandate_type || 'vente',
      agency_fees_percent: draft.agency_fees_percent || '',
    }
    return (
      <PropertyFormModal
        title={`Cr\u00e9er depuis ${DOC_LABELS[draft.doc_type] || 'document'} \u2014 V\u00e9rifiez les donn\u00e9es extraites`}
        initial={initial}
        onSave={handleCreate}
        onClose={onClose}
        saving={saving}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'rgba(10,10,15,0.6)' }}>
      <div className="bg-white rounded-xl shadow-card-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E8E2D5' }}>
          <h2 className="font-serif text-noir font-semibold" style={{ fontSize: '1.1rem' }}>Importer depuis un document</h2>
          <button onClick={onClose}><X size={18} style={{ color: '#9B9488' }} /></button>
        </div>
        <div className="px-6 py-8 text-center">
          {analyzing ? (
            <div>
              <div className="w-12 h-12 rounded-full border-2 border-lin animate-spin mx-auto mb-4"
                   style={{ borderTopColor: '#C9A96E' }} />
              <p className="font-medium text-noir">Analyse du document en cours\u2026</p>
              <p className="text-sm mt-1" style={{ color: '#9B9488' }}>L&apos;IA extrait les donn\u00e9es structur\u00e9es</p>
            </div>
          ) : (
            <div>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                   style={{ background: 'rgba(201,169,110,0.1)' }}>
                <FileText size={26} style={{ color: '#C9A96E' }} />
              </div>
              <p className="font-semibold text-noir mb-2">Uploadez un PDF</p>
              <p className="text-sm mb-6" style={{ color: '#9B9488' }}>
                Mandat, DPE, r\u00e8glement de copropri\u00e9t\u00e9 ou diagnostic.<br />
                L&apos;IA extraira automatiquement les donn\u00e9es.
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm cursor-pointer text-white"
                     style={{ background: '#0A0A0F' }}>
                <Upload size={15} />
                Choisir un fichier PDF
                <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} className="hidden" />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('listings')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [savingCreate, setSavingCreate] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const reload = () => {
    setLoading(true)
    getProperties({ limit: 100 }).then(setData).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const filtered = (data.items || []).filter(p =>
    !search ||
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.city.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async (formData) => {
    setSavingCreate(true)
    try {
      const prop = await createProperty({ ...formData, status_workflow: 'draft' })
      setData(d => ({ items: [prop, ...d.items], total: d.total + 1 }))
      setSelected(prop); setShowCreate(false)
      setToast({ msg: 'Bien cr\u00e9\u00e9 en brouillon', type: 'success' })
    } catch (e) { setToast({ msg: e.message, type: 'error' }) }
    finally { setSavingCreate(false) }
  }

  const handleImported = (prop) => {
    setData(d => ({ items: [prop, ...d.items], total: d.total + 1 }))
    setSelected(prop); setShowImport(false)
    setToast({ msg: 'Bien cr\u00e9\u00e9 en brouillon', type: 'success' })
  }

  const handleEdit = async (formData) => {
    if (!selected) return
    setSavingEdit(true)
    try {
      const updated = await updateProperty(selected.id, formData)
      setData(d => ({ ...d, items: d.items.map(p => p.id === updated.id ? updated : p) }))
      setSelected(updated); setShowEdit(false)
      setToast({ msg: 'Bien mis \u00e0 jour', type: 'success' })
    } catch (e) { setToast({ msg: e.message, type: 'error' }) }
    finally { setSavingEdit(false) }
  }

  const handleWorkflowAdvance = async () => {
    if (!selected) return
    const next = WORKFLOW_NEXT[selected.status_workflow]
    if (!next) return
    try {
      const updated = await updateProperty(selected.id, {
        status_workflow: next,
        status: next === 'active' ? 'active' : selected.status,
      })
      setData(d => ({ ...d, items: d.items.map(p => p.id === updated.id ? updated : p) }))
      setSelected(updated)
      setToast({ msg: `Statut mis \u00e0 jour\u00a0: ${STATUS_LABELS[next]}`, type: 'success' })
    } catch (e) { setToast({ msg: e.message, type: 'error' }) }
  }

  const handlePhotoUpdate = (updated) => {
    setData(d => ({ ...d, items: d.items.map(p => p.id === updated.id ? updated : p) }))
    setSelected(updated)
  }

  return (
    <div className="flex gap-5 h-full min-h-0">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── Left — list ── */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1"
             style={{ color: '#C9A96E', letterSpacing: '0.12em' }}>Catalogue</p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '1.9rem', fontWeight: 500 }}>Biens</h1>
          <p className="text-sm mt-0.5" style={{ color: '#9B9488' }}>{data.total} biens au catalogue</p>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white transition-all"
                  style={{ background: '#0A0A0F' }}>
            <Plus size={14} /> Ajouter
          </button>
          <button onClick={() => setShowImport(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all border border-lin"
                  style={{ color: '#6B6459' }}>
            <Upload size={14} /> Importer
          </button>
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9B9488' }} />
          <input
            type="search"
            placeholder="Rechercher un bien\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-8"
          />
        </div>

        <div className="overflow-y-auto flex flex-col gap-2 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-lin animate-spin"
                   style={{ borderTopColor: '#C9A96E' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: '#9B9488' }}>Aucun bien trouv\u00e9</div>
          ) : filtered.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelected(p); setTab('listings') }}
              className="text-left p-3.5 rounded-xl border transition-all"
              style={selected?.id === p.id ? {
                borderColor: 'rgba(201,169,110,0.4)',
                background: 'rgba(201,169,110,0.05)',
              } : {
                borderColor: '#E8E2D5',
                background: '#FFFFFF',
              }}
              onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.boxShadow = '0 2px 8px rgba(10,10,15,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
            >
              {(p.photos || []).length > 0 && (
                <div className="w-full h-20 rounded-lg overflow-hidden mb-2.5" style={{ background: '#F5F3EE' }}>
                  <img
                    src={(p.photos[0].startsWith('http') ? p.photos[0] : `${BASE}${p.photos[0]}`)}
                    alt={p.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-noir line-clamp-2 leading-snug">{p.title}</span>
                <Badge status={p.status_workflow || p.status} />
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: '#9B9488' }}>
                <span className="flex items-center gap-1"><MapPin size={10} />{p.city}</span>
                <span className="flex items-center gap-1"><Ruler size={10} />{p.surface}\u00a0m\u00b2</span>
                <span className="flex items-center gap-1 font-semibold" style={{ color: '#C9A96E' }}>
                  <Euro size={10} />{p.price?.toLocaleString('fr-FR')}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right — detail ── */}
      {selected ? (
        <div className="flex-1 bg-white border border-lin rounded-xl shadow-card flex flex-col overflow-hidden">
          {/* Property header */}
          <div className="px-6 py-4" style={{ borderBottom: '1px solid #E8E2D5', background: '#F8F6F1' }}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="font-serif text-noir font-semibold" style={{ fontSize: '1.15rem' }}>{selected.title}</h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-lin transition-colors hover:bg-creme"
                  style={{ color: '#6B6459' }}
                >
                  <Pencil size={11} /> Modifier
                </button>
                {WORKFLOW_NEXT[selected.status_workflow] && (
                  <button
                    onClick={handleWorkflowAdvance}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-all text-white"
                    style={{ background: '#C9A96E' }}
                  >
                    <CheckCircle2 size={11} />
                    {WORKFLOW_NEXT_LABEL[selected.status_workflow]}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge status={selected.status_workflow || 'draft'} />
              {[
                { icon: MapPin,    val: `${selected.city} ${selected.zipcode || ''}` },
                { icon: Ruler,     val: `${selected.surface}\u00a0m\u00b2` },
                { icon: DoorOpen,  val: `${selected.nb_rooms} pi\u00e8ces` },
                selected.nb_bedrooms && { icon: BedDouble, val: `${selected.nb_bedrooms}\u00a0ch.` },
                selected.energy_class && { icon: Zap, val: `DPE\u00a0${selected.energy_class}` },
              ].filter(Boolean).map(({ icon: Icon, val }) => (
                <div key={val} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-lin"
                     style={{ background: '#F5F3EE', color: '#6B6459' }}>
                  <Icon size={10} style={{ color: '#9B9488' }} /> {val}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full"
                   style={{ background: 'rgba(201,169,110,0.1)', color: '#A8823A' }}>
                <Euro size={12} /> {selected.price?.toLocaleString('fr-FR')}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 py-3 flex-wrap" style={{ borderBottom: '1px solid #E8E2D5' }}>
            {[
              { key: 'listings',  icon: FileText,  label: 'Annonces' },
              { key: 'documents', icon: Paperclip, label: 'Documents' },
              { key: 'photos',    icon: Image,     label: `Photos${(selected.photos || []).length > 0 ? ` (${selected.photos.length})` : ''}` },
              { key: 'workflow',  icon: Play,      label: 'Workflow' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
                style={tab === key
                  ? { background: '#0A0A0F', color: '#F8F6F1' }
                  : { color: '#9B9488' }
                }
                onMouseEnter={e => { if (tab !== key) e.currentTarget.style.background = '#F5F3EE' }}
                onMouseLeave={e => { if (tab !== key) e.currentTarget.style.background = 'transparent' }}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'listings'  && <ListingsTab  property={selected} />}
            {tab === 'documents' && <DocumentsTab property={selected} />}
            {tab === 'photos'    && <PhotosTab    property={selected} onUpdate={handlePhotoUpdate} />}
            {tab === 'workflow'  && <WorkflowTab  property={selected} />}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                 style={{ background: '#F5F3EE', border: '1px solid #E8E2D5' }}>
              <Building2 size={22} style={{ color: '#E8E2D5' }} />
            </div>
            <p className="text-sm mb-5" style={{ color: '#9B9488' }}>S\u00e9lectionnez un bien ou cr\u00e9ez-en un nouveau</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowCreate(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white"
                      style={{ background: '#0A0A0F' }}>
                <Plus size={13} /> Ajouter un bien
              </button>
              <button onClick={() => setShowImport(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-lin"
                      style={{ color: '#6B6459' }}>
                <Upload size={13} /> Importer depuis PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <PropertyFormModal title="Nouveau bien" onSave={handleCreate} onClose={() => setShowCreate(false)} saving={savingCreate} />
      )}
      {showImport && (
        <ImportDocModal onCreated={handleImported} onClose={() => setShowImport(false)} />
      )}
      {showEdit && selected && (
        <PropertyFormModal
          title="Modifier le bien"
          initial={selected}
          onSave={handleEdit}
          onClose={() => setShowEdit(false)}
          saving={savingEdit}
        />
      )}
    </div>
  )
}
