import { useEffect, useRef, useState } from 'react'
import { Search, Sparkles, Paperclip, Check, ChevronRight } from 'lucide-react'
import {
  generateListings, getDocuments, getListings, getProperties,
  updateListing, uploadDocument,
} from '../api/client'

const STATUS_BADGE = {
  active:    'bg-green-100 text-green-700',
  inactive:  'bg-slate-100 text-slate-500',
  sold:      'bg-gray-100 text-gray-500',
  draft:     'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
  published: 'bg-blue-100 text-blue-700',
  pending:   'bg-yellow-100 text-yellow-700',
  processing:'bg-blue-100 text-blue-700',
  done:      'bg-green-100 text-green-700',
  error:     'bg-red-100 text-red-700',
}

function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  )
}

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  return (
    <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
      type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
    }`}>
      {msg}
    </div>
  )
}

// ── Detail tabs ───────────────────────────────────────────────────────────────

function ListingsTab({ property }) {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    getListings(property.id).then(setListings).catch(() => {})
  }, [property.id])

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await generateListings(property.id)
      setListings(res.listings)
      setToast({ msg: `${res.platforms.length} annonces générées`, type: 'success' })
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const approve = async (listing) => {
    try {
      const updated = await updateListing(listing.id, { status: 'approved' })
      setListings(ls => ls.map(l => l.id === updated.id ? updated : l))
    } catch (e) {
      setToast({ msg: e.message, type: 'error' })
    }
  }

  const PLATFORM_LABELS = { leboncoin: 'Leboncoin', seloger: 'SeLoger', website: 'Site web' }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">{listings.length} annonce(s)</span>
        <button
          onClick={generate}
          disabled={generating}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Sparkles size={14} />
          {generating ? 'Génération…' : 'Générer les annonces'}
        </button>
      </div>

      {listings.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Cliquez sur "Générer les annonces" pour créer les textes Leboncoin, SeLoger et site web.
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map(l => (
            <div key={l.id} className="border border-slate-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-slate-700">{PLATFORM_LABELS[l.platform] || l.platform}</span>
                <div className="flex items-center gap-2">
                  <Badge status={l.status} />
                  {l.status === 'draft' && (
                    <button
                      onClick={() => approve(l)}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Check size={12} /> Approuver
                    </button>
                  )}
                </div>
              </div>
              <div className="text-sm font-medium text-slate-800 mb-1">{l.title}</div>
              <div className="text-sm text-slate-500 whitespace-pre-wrap line-clamp-4">{l.content}</div>
            </div>
          ))}
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

  useEffect(() => {
    getDocuments(property.id).then(setDocs).catch(() => {})
  }, [property.id])

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const doc = await uploadDocument(property.id, file)
      setDocs(d => [doc, ...d])
      setToast({ msg: `Document analysé : ${doc.doc_type || 'other'}`, type: 'success' })
    } catch (err) {
      setToast({ msg: err.message, type: 'error' })
    } finally {
      setUploading(false)
      fileRef.current.value = ''
    }
  }

  const DOC_LABELS = { dpe: 'DPE', copro: 'Copropriété', mandat: 'Mandat', other: 'Autre' }

  return (
    <div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">{docs.length} document(s)</span>
        <label className="bg-slate-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-800 cursor-pointer flex items-center gap-2">
          <Paperclip size={14} />
          {uploading ? 'Analyse…' : 'Uploader un PDF'}
          <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Uploadez un PDF (DPE, copropriété, mandat) pour l'analyser avec l'IA.
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="border border-slate-100 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-slate-700">{doc.filename}</span>
                <div className="flex items-center gap-2">
                  {doc.doc_type && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{DOC_LABELS[doc.doc_type] || doc.doc_type}</span>}
                  <Badge status={doc.status} />
                </div>
              </div>
              {doc.extracted_data && doc.status === 'done' && (
                <div className="mt-2 bg-slate-50 rounded-lg p-3 text-xs font-mono text-slate-600 overflow-auto max-h-40">
                  {JSON.stringify(doc.extracted_data, null, 2)}
                </div>
              )}
              {doc.extracted_data?.error && (
                <div className="mt-2 text-xs text-red-500">{doc.extracted_data.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PropertiesPage() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('listings')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getProperties({ limit: 100 })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = (data.items || []).filter(p =>
    !search ||
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.city.toLowerCase().includes(search.toLowerCase())
  )

  const fmt = (n) => n?.toLocaleString('fr-FR') + ' €'

  return (
    <div className="flex gap-6 h-full">
      {/* ── Left: list ── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Biens</h1>
          <p className="text-slate-500 text-sm">{data.total} au catalogue</p>
        </div>
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="overflow-y-auto flex flex-col gap-2 flex-1">
          {loading ? (
            <div className="text-slate-400 text-sm text-center py-8">Chargement…</div>
          ) : filtered.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelected(p); setTab('listings') }}
              className={`text-left p-3 rounded-xl border transition-all ${
                selected?.id === p.id
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-800 line-clamp-2">{p.title}</span>
                <Badge status={p.status} />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {p.city} · {p.surface} m² · {fmt(p.price)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: detail ── */}
      {selected ? (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 p-6 overflow-y-auto">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-slate-800">{selected.title}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
              <span>{selected.city} {selected.zipcode}</span>
              <span>·</span>
              <span>{selected.surface} m²</span>
              <span>·</span>
              <span>{selected.nb_rooms} pièces</span>
              <span>·</span>
              <span className="font-semibold text-blue-600">{fmt(selected.price)}</span>
            </div>
          </div>

          <div className="flex gap-1 mb-5 border-b border-slate-100 pb-1">
            {[['listings', '📝 Annonces'], ['documents', '📄 Documents']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  tab === key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'listings'   && <ListingsTab  property={selected} />}
          {tab === 'documents'  && <DocumentsTab property={selected} />}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <ChevronRight size={40} className="mx-auto mb-3 text-slate-200" />
            <p className="text-sm">Sélectionnez un bien pour voir le détail</p>
          </div>
        </div>
      )}
    </div>
  )
}
