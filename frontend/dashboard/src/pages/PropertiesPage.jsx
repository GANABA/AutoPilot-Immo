import { useEffect, useRef, useState } from 'react'
import {
  Search, Sparkles, Paperclip, Check, FileText, Ruler,
  DoorOpen, ParkingSquare, Leaf, Building2, MapPin,
  Loader2, Euro, BedDouble, Zap, ArrowUpDown
} from 'lucide-react'
import {
  generateListings, getDocuments, getListings, getProperties,
  updateListing, uploadDocument,
} from '../api/client'

const STATUS_COLORS = {
  active:     'bg-emerald-100 text-emerald-700',
  inactive:   'bg-slate-100 text-slate-500',
  sold:       'bg-gray-100 text-gray-500',
  draft:      'bg-amber-100 text-amber-700',
  approved:   'bg-emerald-100 text-emerald-700',
  published:  'bg-blue-100 text-blue-700',
  pending:    'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  done:       'bg-emerald-100 text-emerald-700',
  error:      'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  active: 'Actif', inactive: 'Inactif', sold: 'Vendu',
  draft: 'Brouillon', approved: 'Approuvé', published: 'Publié',
  pending: 'En attente', processing: 'En cours', done: 'Analysé', error: 'Erreur',
}

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
      setToast({ msg: `Document analysé : ${doc.doc_type || 'autre'}`, type: 'success' })
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    } finally { setUploading(false); fileRef.current.value = '' }
  }

  const DOC_LABELS = { dpe: 'DPE', copro: 'Copropriété', mandat: 'Mandat', other: 'Autre' }

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
          <p className="text-sm">Uploadez un PDF (DPE, copropriété, mandat) pour l'analyser avec l'IA.</p>
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

export default function PropertiesPage() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('listings')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getProperties({ limit: 100 })
      .then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = (data.items || []).filter(p =>
    !search ||
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.city.toLowerCase().includes(search.toLowerCase())
  )

  const fmt = (n) => n?.toLocaleString('fr-FR') + ' €'

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* Left — list */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Biens</h1>
          <p className="text-slate-400 text-sm mt-0.5">{data.total} biens au catalogue</p>
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
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">{p.title}</span>
                <Badge status={p.status} />
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

      {/* Right — detail */}
      {selected ? (
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          {/* Property header */}
          <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <h2 className="text-lg font-bold text-slate-800 mb-3">{selected.title}</h2>
            <div className="flex flex-wrap gap-3">
              {[
                { icon: MapPin,       val: `${selected.city} ${selected.zipcode || ''}` },
                { icon: Ruler,        val: `${selected.surface} m²` },
                { icon: DoorOpen,     val: `${selected.nb_rooms} pièces` },
                { icon: BedDouble,    val: `${selected.nb_bedrooms ?? '–'} chambres` },
                { icon: ArrowUpDown,  val: `Étage ${selected.floor ?? '–'}` },
              ].map(({ icon: Icon, val }) => (
                <div key={val} className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                  <Icon size={12} className="text-slate-400" />
                  {val}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                <Euro size={13} />
                {selected.price?.toLocaleString('fr-FR')}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 py-3 border-b border-slate-100">
            {[
              { key: 'listings',  icon: FileText,    label: 'Annonces' },
              { key: 'documents', icon: Paperclip,   label: 'Documents' },
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

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'listings'  && <ListingsTab  property={selected} />}
            {tab === 'documents' && <DocumentsTab property={selected} />}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Building2 size={48} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-400 text-sm">Sélectionnez un bien pour voir le détail</p>
          </div>
        </div>
      )}
    </div>
  )
}
