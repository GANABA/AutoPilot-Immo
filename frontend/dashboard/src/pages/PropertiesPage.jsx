import { useEffect, useRef, useState } from 'react'
import {
  Search, Sparkles, Paperclip, Check, FileText, Ruler,
  DoorOpen, ParkingSquare, Leaf, Building2, MapPin,
  Loader2, Euro, BedDouble, Zap, ArrowUpDown, Plus,
  Upload, Image, X, ChevronLeft, ChevronRight, Pencil,
  CheckCircle2, CircleDot, Archive, Play, Clock, AlertTriangle,
} from 'lucide-react'
import {
  generateListings, getDocuments, getListings, getProperties,
  updateListing, uploadDocument, createProperty, updateProperty,
  uploadPhotos, deletePhoto, uploadOrphanDocument,
  triggerWorkflow, getWorkflowRuns,
} from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  active:     'bg-emerald-100 text-emerald-700',
  inactive:   'bg-slate-100 text-slate-500',
  sold:       'bg-gray-100 text-gray-500',
  rented:     'bg-purple-100 text-purple-700',
  draft:      'bg-amber-100 text-amber-700',
  review:     'bg-blue-100 text-blue-700',
  approved:   'bg-emerald-100 text-emerald-700',
  published:  'bg-blue-100 text-blue-700',
  pending:    'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  done:       'bg-emerald-100 text-emerald-700',
  error:      'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  active: 'Actif', inactive: 'Inactif', sold: 'Vendu', rented: 'Loué',
  draft: 'Brouillon', review: 'En révision',
  approved: 'Approuvé', published: 'Publié',
  pending: 'En attente', processing: 'En cours', done: 'Analysé', error: 'Erreur',
}

const WORKFLOW_NEXT = { draft: 'review', review: 'active', active: 'sold' }
const WORKFLOW_NEXT_LABEL = { draft: 'Soumettre pour révision', review: 'Activer', active: 'Marquer vendu' }

const PROPERTY_TYPES = ['appartement', 'maison', 'terrain', 'parking', 'local commercial', 'autre']
const ORIENTATIONS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest']
const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000' : window.location.origin

// ── Small reusables ───────────────────────────────────────────────────────────

function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-500'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  return (
    <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
      type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
    }`}>
      <Check size={14} /> {msg}
    </div>
  )
}

const PLATFORM_META = {
  leboncoin: { label: 'Leboncoin', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  seloger:   { label: 'SeLoger',   color: 'bg-blue-50 text-blue-700 border-blue-200' },
  website:   { label: 'Site web',  color: 'bg-slate-50 text-slate-700 border-slate-200' },
}

const DOC_LABELS = { dpe: 'DPE', copro: 'Copropriété', mandat: 'Mandat', diagnostic: 'Diagnostic', other: 'Autre' }

// ── Workflow tab ──────────────────────────────────────────────────────────────

const STEP_LABELS = {
  load_property:           'Chargement du bien',
  run_analyst:             'Analyse des documents',
  run_writer:              'Génération des annonces',
  find_matching_prospects: 'Scoring des prospects',
  notify_prospects:        'Notification des prospects',
  finalize:                'Finalisation',
}

const STEP_STATUS_COLORS = {
  done:             'text-green-600 bg-green-50 border-green-200',
  done_with_errors: 'text-amber-600 bg-amber-50 border-amber-200',
  error:            'text-red-600 bg-red-50 border-red-200',
  skipped:          'text-slate-400 bg-slate-50 border-slate-200',
  running:          'text-blue-600 bg-blue-50 border-blue-200',
}

function WorkflowTab({ property }) {
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [toast, setToast] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const load = () => {
    setLoading(true)
    getWorkflowRuns(property.id)
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [property.id])

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await triggerWorkflow(property.id)
      setToast({ type: 'success', msg: 'Workflow lancé en arrière-plan. Actualisez dans quelques secondes.' })
      setTimeout(() => { load(); setToast(null) }, 4000)
    } catch (e) {
      setToast({ type: 'error', msg: e.message })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setTriggering(false)
    }
  }

  const fmtDuration = (run) => {
    if (!run.started_at || !run.completed_at) return null
    const ms = new Date(run.completed_at) - new Date(run.started_at)
    const s = Math.round(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Trigger button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {triggering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {triggering ? 'Lancement…' : 'Déclencher le workflow'}
        </button>
        <button onClick={load} className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
          Actualiser
        </button>
        <span className="text-xs text-slate-400">Analyse → Annonces → Matching → Emails</span>
      </div>

      {/* Run history */}
      {loading && runs.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">Chargement…</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-8 text-slate-300 text-sm">
          Aucun workflow exécuté pour ce bien
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <div key={run.id} className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Run header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    STEP_STATUS_COLORS[run.status] || STEP_STATUS_COLORS['running']
                  }`}>
                    {run.status === 'done' ? 'Terminé' :
                     run.status === 'done_with_errors' ? 'Partiel' :
                     run.status === 'error' ? 'Erreur' :
                     run.status === 'running' ? 'En cours' : run.status}
                  </span>
                  <span className="text-xs text-slate-500">
                    {run.started_at
                      ? new Date(run.started_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                  {fmtDuration(run) && (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock size={11} /> {fmtDuration(run)}
                    </span>
                  )}
                </div>
                {run.summary && (
                  <span className="text-xs text-slate-500">
                    {run.summary.listings_generated?.length || 0} annonces ·{' '}
                    {run.summary.prospects_notified || 0} prospects
                  </span>
                )}
              </button>

              {/* Expanded steps */}
              {expanded === run.id && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 space-y-2">
                  {(run.steps || []).map((step, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className={`mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium border flex-shrink-0 ${
                        STEP_STATUS_COLORS[step.status] || ''
                      }`}>
                        {step.status === 'done' ? '✓' :
                         step.status === 'error' ? '✗' :
                         step.status === 'skipped' ? '—' : '…'}
                      </span>
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700">
                          {STEP_LABELS[step.name] || step.name}
                        </span>
                        {step.detail && (
                          <span className="text-slate-400 ml-2">{step.detail}</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Top prospects scored */}
                  {run.summary?.top_prospects?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-xs font-semibold text-slate-500 mb-2">Top prospects matchés</div>
                      <div className="space-y-1">
                        {run.summary.top_prospects.map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-slate-700">{p.name}</span>
                            <span className="font-semibold text-blue-600">{p.score}/100</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {run.summary?.errors?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <div className="text-xs font-semibold text-red-500 mb-1">Erreurs</div>
                      {run.summary.errors.map((e, i) => (
                        <div key={i} className="text-xs text-red-500 truncate">{e}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Listings tab ──────────────────────────────────────────────────────────────

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
      setToast({ msg: `${res.platforms.length} annonces générées`, type: 'success' })
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
        <span className="text-sm text-slate-500">{listings.length} annonce(s)</span>
        <button
          onClick={generate}
          disabled={generating}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 font-medium transition-colors"
        >
          {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {generating ? 'Génération…' : 'Générer les annonces'}
        </button>
      </div>
      {listings.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <FileText size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm">Cliquez sur "Générer les annonces" pour créer les textes Leboncoin, SeLoger et site web.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map(l => {
            const meta = PLATFORM_META[l.platform] || { label: l.platform, color: 'bg-slate-50 text-slate-700 border-slate-200' }
            return (
              <div key={l.id} className="border border-slate-100 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta.color}`}>{meta.label}</span>
                  <div className="flex items-center gap-3">
                    <Badge status={l.status} />
                    {l.status === 'draft' && (
                      <button onClick={() => approve(l)} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                        <Check size={12} /> Approuver
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4">
                  <div className="text-sm font-semibold text-slate-800 mb-2">{l.title}</div>
                  <div className="text-sm text-slate-500 whitespace-pre-wrap line-clamp-4 leading-relaxed">{l.content}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Documents tab ─────────────────────────────────────────────────────────────

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
      setToast({ msg: `Document analysé : ${DOC_LABELS[doc.doc_type] || doc.doc_type}`, type: 'success' })
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    } finally { setUploading(false); fileRef.current.value = '' }
  }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm text-slate-500">{docs.length} document(s)</span>
        <label className="bg-slate-800 text-white text-sm px-4 py-2 rounded-xl hover:bg-slate-900 cursor-pointer flex items-center gap-2 font-medium transition-colors">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          {uploading ? 'Analyse en cours…' : 'Uploader un PDF'}
          <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>
      {docs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Paperclip size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm">Uploadez un PDF (DPE, copropriété, mandat, diagnostic) pour l'analyser avec l'IA.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-slate-400" />
                  <span className="font-medium text-sm text-slate-700 truncate max-w-xs">{doc.filename}</span>
                </div>
                <div className="flex items-center gap-2">
                  {doc.doc_type && (
                    <span className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                      {DOC_LABELS[doc.doc_type] || doc.doc_type}
                    </span>
                  )}
                  <Badge status={doc.status} />
                </div>
              </div>
              {doc.extracted_data && doc.status === 'done' && (
                <div className="px-5 py-3 bg-slate-50 text-xs font-mono text-slate-600 overflow-auto max-h-40">
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

// ── Photos tab ────────────────────────────────────────────────────────────────

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
      setToast({ msg: `${files.length} photo(s) ajoutée(s)`, type: 'success' })
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    } finally { setUploading(false); fileRef.current.value = '' }
  }

  const handleDelete = async (url) => {
    try {
      const updated = await deletePhoto(property.id, url)
      onUpdate(updated)
      setCurrent(c => Math.max(0, c - 1))
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    }
  }

  const photoUrl = (url) => url.startsWith('http') ? url : `${BASE}${url}`

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm text-slate-500">{photos.length} photo(s)</span>
        <label className="bg-slate-800 text-white text-sm px-4 py-2 rounded-xl hover:bg-slate-900 cursor-pointer flex items-center gap-2 font-medium transition-colors">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
          {uploading ? 'Upload en cours…' : 'Ajouter des photos'}
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {photos.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Image size={36} className="mx-auto mb-3 text-slate-200" />
          <p className="text-sm">Aucune photo. Ajoutez des visuels pour ce bien.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Carousel */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-100 aspect-video">
            <img
              src={photoUrl(photos[current])}
              alt={`Photo ${current + 1}`}
              className="w-full h-full object-cover"
            />
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setCurrent(c => (c - 1 + photos.length) % photos.length)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrent(c => (c + 1) % photos.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
              {current + 1} / {photos.length}
            </div>
            <button
              onClick={() => handleDelete(photos[current])}
              className="absolute top-3 right-3 w-7 h-7 bg-red-600/80 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors"
              title="Supprimer cette photo"
            >
              <X size={14} />
            </button>
          </div>

          {/* Thumbnails */}
          <div className="flex gap-2 flex-wrap">
            {photos.map((url, i) => (
              <button
                key={url}
                onClick={() => setCurrent(i)}
                className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors flex-shrink-0 ${
                  i === current ? 'border-blue-500' : 'border-transparent hover:border-slate-300'
                }`}
              >
                <img src={photoUrl(url)} alt={`Miniature ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Property form (create / edit) ─────────────────────────────────────────────

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
      type: form.type,
      title: form.title,
      description: form.description || undefined,
      price: num(form.price),
      surface: num(form.surface),
      nb_rooms: num(form.nb_rooms),
      nb_bedrooms: num(form.nb_bedrooms) || undefined,
      city: form.city,
      zipcode: form.zipcode,
      address: form.address || undefined,
      floor: num(form.floor) ?? undefined,
      has_balcony: form.has_balcony,
      has_parking: form.has_parking,
      has_elevator: form.has_elevator,
      has_cellar: form.has_cellar,
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

  const inp = 'w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const lbl = 'block text-xs font-medium text-slate-600 mb-1'
  const toggle = (k) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => set(k, !form[k])}
        className={`relative w-9 h-5 rounded-full transition-colors ${form[k] ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[k] ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </label>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Type + titre */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Type *</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className={inp} required>
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={lbl}>Titre *</label>
              <input className={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Bel appartement T3 Lyon 6" required />
            </div>
          </div>

          {/* Prix + surface + pièces */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Prix (€) *</label>
              <input type="number" className={inp} value={form.price} onChange={e => set('price', e.target.value)} min={0} required />
            </div>
            <div>
              <label className={lbl}>Surface (m²) *</label>
              <input type="number" className={inp} value={form.surface} onChange={e => set('surface', e.target.value)} min={0} required />
            </div>
            <div>
              <label className={lbl}>Pièces *</label>
              <input type="number" className={inp} value={form.nb_rooms} onChange={e => set('nb_rooms', e.target.value)} min={1} required />
            </div>
          </div>

          {/* Ville + code postal + chambres */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Ville *</label>
              <input className={inp} value={form.city} onChange={e => set('city', e.target.value)} required />
            </div>
            <div>
              <label className={lbl}>Code postal *</label>
              <input className={inp} value={form.zipcode} onChange={e => set('zipcode', e.target.value)} required />
            </div>
            <div>
              <label className={lbl}>Chambres</label>
              <input type="number" className={inp} value={form.nb_bedrooms} onChange={e => set('nb_bedrooms', e.target.value)} min={0} />
            </div>
          </div>

          {/* Adresse + étage */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <label className={lbl}>Adresse</label>
              <input className={inp} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Étage</label>
              <input type="number" className={inp} value={form.floor} onChange={e => set('floor', e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={lbl}>Description</label>
            <textarea rows={3} className={inp + ' resize-none'} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {/* Équipements */}
          <div>
            <label className={lbl}>Équipements</label>
            <div className="flex flex-wrap gap-4 mt-2">
              {[['has_balcony','Balcon'],['has_parking','Parking'],['has_elevator','Ascenseur'],['has_cellar','Cave'],['has_garden','Jardin']].map(([k,l]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  {toggle(k)} {l}
                </label>
              ))}
            </div>
          </div>

          {/* Énergie + DPE */}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Classe DPE</label>
              <input className={inp} value={form.energy_class} onChange={e => set('energy_class', e.target.value.toUpperCase())} maxLength={1} placeholder="A-G" />
            </div>
            <div>
              <label className={lbl}>Classe GES</label>
              <input className={inp} value={form.ges_class} onChange={e => set('ges_class', e.target.value.toUpperCase())} maxLength={1} placeholder="A-G" />
            </div>
            <div>
              <label className={lbl}>Charges/mois (€)</label>
              <input type="number" className={inp} value={form.charges_monthly} onChange={e => set('charges_monthly', e.target.value)} min={0} />
            </div>
            <div>
              <label className={lbl}>Orientation</label>
              <select value={form.orientation} onChange={e => set('orientation', e.target.value)} className={inp}>
                <option value="">—</option>
                {ORIENTATIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Mandat */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Type mandat</label>
              <select value={form.mandate_type} onChange={e => set('mandate_type', e.target.value)} className={inp}>
                <option value="vente">Vente</option>
                <option value="location">Location</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Réf. mandat</label>
              <input className={inp} value={form.mandate_ref} onChange={e => set('mandate_ref', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Honoraires (%)</label>
              <input type="number" className={inp} value={form.agency_fees_percent} onChange={e => set('agency_fees_percent', e.target.value)} min={0} max={100} step={0.1} />
            </div>
          </div>

          {/* Agent */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nom agent</label>
              <input className={inp} value={form.agent_name} onChange={e => set('agent_name', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Email agent</label>
              <input type="email" className={inp} value={form.agent_email} onChange={e => set('agent_email', e.target.value)} />
            </div>
          </div>
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Annuler</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Import from document modal ────────────────────────────────────────────────

function ImportDocModal({ onCreated, onClose }) {
  const [step, setStep] = useState('upload') // upload | review
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
    } catch (err) {
      alert(err.message)
    } finally { setAnalyzing(false) }
  }

  const handleCreate = async (formData) => {
    setSaving(true)
    try {
      const prop = await createProperty({ ...formData, status_workflow: 'draft' })
      onCreated(prop)
    } catch (err) {
      alert(err.message)
    } finally { setSaving(false) }
  }

  if (step === 'review' && draft) {
    const initial = {
      type: draft.mandate_type === 'location' ? 'appartement' : 'appartement',
      price: draft.price || '',
      surface: draft.surface || '',
      city: '',
      zipcode: '',
      address: draft.address || '',
      energy_class: draft.energy_class || '',
      ges_class: draft.ges_class || '',
      annual_energy_cost: draft.annual_energy_cost || '',
      charges_monthly: draft.charges_monthly || '',
      lot_count: draft.lot_count || '',
      syndic_name: draft.syndic_name || '',
      mandate_ref: draft.mandate_ref || '',
      mandate_type: draft.mandate_type || 'vente',
      agency_fees_percent: draft.agency_fees_percent || '',
    }
    return (
      <PropertyFormModal
        title={`Créer depuis ${DOC_LABELS[draft.doc_type] || 'document'} — Vérifiez les données extraites`}
        initial={initial}
        onSave={handleCreate}
        onClose={onClose}
        saving={saving}
      />
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Importer depuis un document</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="px-6 py-8 text-center">
          {analyzing ? (
            <div>
              <Loader2 size={40} className="animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Analyse du document en cours…</p>
              <p className="text-sm text-slate-400 mt-1">L'IA extrait les données structurées</p>
            </div>
          ) : (
            <div>
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText size={28} className="text-blue-600" />
              </div>
              <p className="text-slate-700 font-medium mb-2">Uploadez un PDF</p>
              <p className="text-sm text-slate-500 mb-6">
                Mandat, DPE, règlement de copropriété ou diagnostic.<br />
                L'IA extraira automatiquement les données pour pré-remplir le formulaire.
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm cursor-pointer hover:bg-blue-700 transition-colors">
                <Upload size={16} />
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
    getProperties({ limit: 100 })
      .then(setData).catch(() => {}).finally(() => setLoading(false))
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
      setSelected(prop)
      setShowCreate(false)
      setToast({ msg: 'Bien créé en brouillon', type: 'success' })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    } finally { setSavingCreate(false) }
  }

  const handleImported = (prop) => {
    setData(d => ({ items: [prop, ...d.items], total: d.total + 1 }))
    setSelected(prop)
    setShowImport(false)
    setToast({ msg: 'Bien créé en brouillon', type: 'success' })
  }

  const handleEdit = async (formData) => {
    if (!selected) return
    setSavingEdit(true)
    try {
      const updated = await updateProperty(selected.id, formData)
      setData(d => ({ ...d, items: d.items.map(p => p.id === updated.id ? updated : p) }))
      setSelected(updated)
      setShowEdit(false)
      setToast({ msg: 'Bien mis à jour', type: 'success' })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    } finally { setSavingEdit(false) }
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
      setToast({ msg: `Statut mis à jour : ${STATUS_LABELS[next]}`, type: 'success' })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    }
  }

  const handlePhotoUpdate = (updated) => {
    setData(d => ({ ...d, items: d.items.map(p => p.id === updated.id ? updated : p) }))
    setSelected(updated)
  }

  const fmt = (n) => n?.toLocaleString('fr-FR') + ' €'

  return (
    <div className="flex gap-6 h-full min-h-0">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* ── Left — list ── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Biens</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} biens au catalogue</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} /> Ajouter
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-900 transition-colors"
          >
            <Upload size={15} /> Importer
          </button>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Rechercher un bien…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        <div className="overflow-y-auto flex flex-col gap-2 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Aucun bien trouvé</div>
          ) : filtered.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelected(p); setTab('listings') }}
              className={`text-left p-4 rounded-2xl border transition-all ${
                selected?.id === p.id
                  ? 'border-blue-400 bg-blue-50 shadow-sm'
                  : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
              }`}
            >
              {/* Photo thumbnail if available */}
              {(p.photos || []).length > 0 && (
                <div className="w-full h-24 rounded-xl overflow-hidden mb-2 bg-slate-100">
                  <img
                    src={(p.photos[0].startsWith('http') ? p.photos[0] : `${BASE}${p.photos[0]}`)}
                    alt={p.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">{p.title}</span>
                <Badge status={p.status_workflow || p.status} />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><MapPin size={11} />{p.city}</span>
                <span className="flex items-center gap-1"><Ruler size={11} />{p.surface} m²</span>
                <span className="flex items-center gap-1 font-semibold text-blue-600"><Euro size={11} />{p.price?.toLocaleString('fr-FR')}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right — detail ── */}
      {selected ? (
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          {/* Property header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 className="text-lg font-bold text-slate-800">{selected.title}</h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Pencil size={12} /> Modifier
                </button>
                {WORKFLOW_NEXT[selected.status_workflow] && (
                  <button
                    onClick={handleWorkflowAdvance}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                  >
                    <CheckCircle2 size={12} />
                    {WORKFLOW_NEXT_LABEL[selected.status_workflow]}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge status={selected.status_workflow || 'draft'} />
              {[
                { icon: MapPin,      val: `${selected.city} ${selected.zipcode || ''}` },
                { icon: Ruler,       val: `${selected.surface} m²` },
                { icon: DoorOpen,    val: `${selected.nb_rooms} pièces` },
                selected.nb_bedrooms && { icon: BedDouble, val: `${selected.nb_bedrooms} ch.` },
                selected.energy_class && { icon: Zap, val: `DPE ${selected.energy_class}` },
              ].filter(Boolean).map(({ icon: Icon, val }) => (
                <div key={val} className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  <Icon size={11} className="text-slate-400" /> {val}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                <Euro size={12} /> {selected.price?.toLocaleString('fr-FR')}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 py-3 border-b border-slate-100 flex-wrap">
            {[
              { key: 'listings',  icon: FileText,  label: 'Annonces' },
              { key: 'documents', icon: Paperclip, label: 'Documents' },
              { key: 'photos',    icon: Image,     label: `Photos${(selected.photos || []).length > 0 ? ` (${selected.photos.length})` : ''}` },
              { key: 'workflow',  icon: Play,      label: 'Workflow' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                  tab === key ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} /> {label}
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
            <Building2 size={48} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-400 text-sm mb-4">Sélectionnez un bien ou créez-en un nouveau</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">
                <Plus size={14} /> Ajouter un bien
              </button>
              <button onClick={() => setShowImport(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-xl hover:bg-slate-900 transition-colors">
                <Upload size={14} /> Importer depuis PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <PropertyFormModal
          title="Nouveau bien"
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
          saving={savingCreate}
        />
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
      {showImport && (
        <ImportDocModal
          onCreated={handleImported}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
