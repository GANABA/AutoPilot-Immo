import { useState, useEffect, useCallback } from 'react'
import {
  Building2, MessageSquare, Clock, Calendar,
  Mail, Mic, Bot, Globe, Save, RefreshCw, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { getSettings, updateSettings, crawlWebsite } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, description, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-lin rounded-xl overflow-hidden shadow-card">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left transition-colors hover:bg-creme"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'rgba(201,169,110,0.1)' }}>
            <Icon size={17} style={{ color: '#C9A96E' }} />
          </div>
          <div>
            <div className="font-semibold text-noir text-sm">{title}</div>
            <div className="text-xs" style={{ color: '#9B9488' }}>{description}</div>
          </div>
        </div>
        {open
          ? <ChevronUp size={15} style={{ color: '#9B9488' }} />
          : <ChevronDown size={15} style={{ color: '#9B9488' }} />
        }
      </button>
      {open && (
        <div className="px-6 pb-6" style={{ borderTop: '1px solid #F0ECE4' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="mt-4">
      <label className="block text-xs font-medium mb-1" style={{ color: '#6B6459', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      {hint && <p className="text-xs mb-1.5" style={{ color: '#9B9488' }}>{hint}</p>}
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder, disabled }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="input-field"
    />
  )
}

function Textarea({ value, onChange, rows = 3, placeholder }) {
  return (
    <textarea
      rows={rows}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="input-field resize-none"
    />
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!value)}
        className="relative w-10 h-5 rounded-full transition-colors"
        style={{ background: value ? '#C9A96E' : '#E8E2D5' }}
      >
        <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
             style={{ transform: value ? 'translateX(20px)' : 'translateX(2px)' }} />
      </div>
      <span className="text-sm" style={{ color: '#1A1A24' }}>{label}</span>
    </label>
  )
}

function NumberInput({ value, onChange, min, max, placeholder }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange(Number(e.target.value))}
      min={min}
      max={max}
      placeholder={placeholder}
      className="input-field"
    />
  )
}

// ── Day-hours editor ──────────────────────────────────────────────────────────

const DAY_LABELS = {
  monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi',
  thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche',
}

const timeInputCls = 'px-2 py-1.5 border border-lin rounded-lg text-sm bg-white text-noir transition-colors focus:outline-none focus:border-or'

function WorkingHoursEditor({ value, onChange }) {
  const update = (day, field, v) => onChange({ ...value, [day]: { ...value[day], [field]: v } })
  return (
    <div className="mt-4 space-y-2.5">
      {Object.entries(DAY_LABELS).map(([day, label]) => {
        const dh = value[day] || {}
        return (
          <div key={day} className="flex items-center gap-3">
            <div className="w-24 text-sm font-medium" style={{ color: '#1A1A24' }}>{label}</div>
            <Toggle value={!!dh.enabled} onChange={v => update(day, 'enabled', v)} label="" />
            {dh.enabled ? (
              <>
                <input type="time" value={dh.open || '09:00'} onChange={e => update(day, 'open', e.target.value)} className={timeInputCls} />
                <span className="text-xs" style={{ color: '#9B9488' }}>&rarr;</span>
                <input type="time" value={dh.close || '19:00'} onChange={e => update(day, 'close', e.target.value)} className={timeInputCls} />
              </>
            ) : (
              <span className="text-xs italic" style={{ color: '#9B9488' }}>Ferm\u00e9</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(e => showToast('error', e.message))
      .finally(() => setLoading(false))
  }, [showToast])

  const update = useCallback((section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const saved = await updateSettings(settings)
      setSettings(saved)
      showToast('success', 'Param\u00e8tres enregistr\u00e9s.')
    } catch (e) {
      showToast('error', e.message)
    } finally { setSaving(false) }
  }

  const handleCrawl = async () => {
    if (!settings?.agency?.website_url) {
      showToast('error', "Configurez d'abord l'URL du site web.")
      return
    }
    setCrawling(true)
    try {
      const result = await crawlWebsite(false)
      showToast('success', result.message || 'Indexation lanc\u00e9e en arri\u00e8re-plan.')
    } catch (e) {
      showToast('error', e.message)
    } finally { setCrawling(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-lin animate-spin"
           style={{ borderTopColor: '#C9A96E' }} />
    </div>
  )

  if (!settings) return (
    <div className="rounded-lg p-4 text-sm"
         style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
      Impossible de charger les param\u00e8tres.
    </div>
  )

  const a = settings.agency || {}
  const w = settings.chat_widget || {}
  const wh = settings.working_hours || {}
  const cal = settings.calendar || {}
  const em = settings.email || {}
  const vo = settings.voice || {}
  const ai = settings.ai || {}

  const selectCls = 'input-field w-full'

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1"
             style={{ color: '#C9A96E', letterSpacing: '0.12em' }}>
            Configuration
          </p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '2rem', fontWeight: 500 }}>
            Param\u00e8tres
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all text-white disabled:opacity-50"
          style={{ background: '#0A0A0F' }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#1F1F2E' }}
          onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#0A0A0F' }}
        >
          <Save size={15} />
          {saving ? 'Enregistrement\u2026' : 'Enregistrer'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium"
             style={toast.type === 'success'
               ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#065F46' }
               : { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }
             }>
          {toast.type === 'success'
            ? <CheckCircle size={15} style={{ color: '#10B981' }} className="flex-shrink-0" />
            : <AlertCircle size={15} style={{ color: '#EF4444' }} className="flex-shrink-0" />
          }
          {toast.msg}
        </div>
      )}

      {/* ── Agency ── */}
      <Section icon={Building2} title="Agence" description="Identit\u00e9 et coordonn\u00e9es de l'agence" defaultOpen>
        <Field label="Nom de l'agence">
          <Input value={a.name} onChange={v => update('agency', 'name', v)} placeholder="ImmoPlus" />
        </Field>
        <Field label="Adresse">
          <Input value={a.address} onChange={v => update('agency', 'address', v)} placeholder="12 rue de la Paix, 69001 Lyon" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="T\u00e9l\u00e9phone">
            <Input value={a.phone} onChange={v => update('agency', 'phone', v)} placeholder="+33 4 72 00 00 00" />
          </Field>
          <Field label="Email">
            <Input value={a.email} onChange={v => update('agency', 'email', v)} type="email" placeholder="contact@agence.fr" />
          </Field>
        </div>
        <Field label="Logo (URL)">
          <Input value={a.logo_url} onChange={v => update('agency', 'logo_url', v)} placeholder="https://..." />
        </Field>
      </Section>

      {/* ── Website ── */}
      <Section icon={Globe} title="Site web" description="Indexation du site pour l'agent support">
        <Field label="URL du site web" hint="L'agent support utilise ce contenu pour r\u00e9pondre aux questions sur l'agence.">
          <Input value={a.website_url} onChange={v => update('agency', 'website_url', v)} placeholder="https://www.immoplus.fr" />
        </Field>
        {a.website_crawled_at && (
          <p className="mt-2 text-xs" style={{ color: '#9B9488' }}>
            Derni\u00e8re indexation\u00a0: {new Date(a.website_crawled_at).toLocaleString('fr-FR')}
          </p>
        )}
        <button
          onClick={handleCrawl}
          disabled={crawling}
          className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-lin bg-creme hover:bg-lin disabled:opacity-50"
          style={{ color: '#6B6459' }}
        >
          <RefreshCw size={14} className={crawling ? 'animate-spin' : ''} />
          {crawling ? 'Indexation en cours\u2026' : "Lancer l'indexation"}
        </button>
      </Section>

      {/* ── Chat Widget ── */}
      <Section icon={MessageSquare} title="Widget chatbot" description="Apparence et comportement du chat">
        <Field label="Message d'accueil">
          <Input value={w.welcome_message} onChange={v => update('chat_widget', 'welcome_message', v)} placeholder="Bonjour, bienvenue\u00a0!" />
        </Field>
        <Field label="Texte du placeholder">
          <Input value={w.placeholder_text} onChange={v => update('chat_widget', 'placeholder_text', v)} placeholder="D\u00e9crivez votre recherche\u2026" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Couleur principale">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={w.primary_color || '#C9A96E'}
                onChange={e => update('chat_widget', 'primary_color', e.target.value)}
                className="w-10 h-9 rounded-lg border border-lin cursor-pointer p-1 bg-white"
              />
              <Input value={w.primary_color} onChange={v => update('chat_widget', 'primary_color', v)} placeholder="#C9A96E" />
            </div>
          </Field>
          <Field label="D\u00e9lai ouverture auto (s)">
            <NumberInput value={w.auto_open_delay_seconds} onChange={v => update('chat_widget', 'auto_open_delay_seconds', v)} min={0} max={60} />
          </Field>
        </div>
        <Field label="Position">
          <select
            value={w.position || 'bottom-right'}
            onChange={e => update('chat_widget', 'position', e.target.value)}
            className={selectCls}
          >
            <option value="bottom-right">En bas \u00e0 droite</option>
            <option value="bottom-left">En bas \u00e0 gauche</option>
          </select>
        </Field>
      </Section>

      {/* ── Working Hours ── */}
      <Section icon={Clock} title="Horaires d'ouverture" description="Heures de disponibilit\u00e9 de l'agence">
        <WorkingHoursEditor
          value={wh}
          onChange={v => setSettings(prev => ({ ...prev, working_hours: v }))}
        />
      </Section>

      {/* ── Calendar ── */}
      <Section icon={Calendar} title="Calendrier" description="Configuration Google Calendar pour les visites">
        <Field label="ID du calendrier" hint="L'adresse email du calendrier Google (ex: contact@immoplus.fr ou ID@group.calendar.google.com)">
          <Input value={cal.calendar_id} onChange={v => update('calendar', 'calendar_id', v)} placeholder="contact@agence.fr" />
        </Field>
        <Field label="Email de l'agent" hint="Ajout\u00e9 comme participant aux \u00e9v\u00e9nements de visite">
          <Input value={cal.agent_email} onChange={v => update('calendar', 'agent_email', v)} type="email" placeholder="agent@agence.fr" />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Dur\u00e9e visite (min)">
            <NumberInput value={cal.visit_duration_minutes} onChange={v => update('calendar', 'visit_duration_minutes', v)} min={15} max={240} />
          </Field>
          <Field label="D\u00e9lai min (h)">
            <NumberInput value={cal.min_booking_advance_hours} onChange={v => update('calendar', 'min_booking_advance_hours', v)} min={1} max={72} />
          </Field>
          <Field label="D\u00e9lai max (j)">
            <NumberInput value={cal.max_booking_advance_days} onChange={v => update('calendar', 'max_booking_advance_days', v)} min={1} max={90} />
          </Field>
        </div>
      </Section>

      {/* ── Email ── */}
      <Section icon={Mail} title="Emails" description="Configuration des emails automatiques">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom exp\u00e9diteur">
            <Input value={em.sender_name} onChange={v => update('email', 'sender_name', v)} placeholder="ImmoPlus" />
          </Field>
          <Field label="Email exp\u00e9diteur">
            <Input value={em.sender_email} onChange={v => update('email', 'sender_email', v)} type="email" placeholder="no-reply@immoplus.fr" />
          </Field>
        </div>
        <Field label="D\u00e9lai relance J+ (jours)">
          <NumberInput value={em.followup_delay_days} onChange={v => update('email', 'followup_delay_days', v)} min={1} max={30} />
        </Field>
        <div className="mt-4 space-y-3">
          <Toggle value={em.send_prospect_confirmation} onChange={v => update('email', 'send_prospect_confirmation', v)} label="Email de confirmation au prospect apr\u00e8s qualification" />
          <Toggle value={em.send_agent_notification} onChange={v => update('email', 'send_agent_notification', v)} label="Notification \u00e0 l'agent pour chaque nouveau prospect" />
          <Toggle value={em.send_visit_confirmation} onChange={v => update('email', 'send_visit_confirmation', v)} label="Email de confirmation de visite" />
        </div>
      </Section>

      {/* ── Voice ── */}
      <Section icon={Mic} title="Agent vocal" description="Configuration de l'assistant t\u00e9l\u00e9phonique">
        <Field label="ID assistant Vapi" hint="L'identifiant de votre assistant sur vapi.ai">
          <Input value={vo.vapi_assistant_id} onChange={v => update('voice', 'vapi_assistant_id', v)} placeholder="va_xxxxxxxxxxxx" />
        </Field>
        <Field label="Message d'accueil t\u00e9l\u00e9phonique">
          <Textarea value={vo.greeting} onChange={v => update('voice', 'greeting', v)} placeholder="Bonjour, vous \u00eates bien chez ImmoPlus\u2026" />
        </Field>
        <Field label="Message hors horaires">
          <Textarea value={vo.out_of_hours_message} onChange={v => update('voice', 'out_of_hours_message', v)} placeholder="Notre agence est ferm\u00e9e. Laissez votre num\u00e9ro\u2026" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Num\u00e9ro de transfert">
            <Input value={vo.transfer_number} onChange={v => update('voice', 'transfer_number', v)} placeholder="+33612345678" />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle value={vo.transfer_on_request} onChange={v => update('voice', 'transfer_on_request', v)} label="Transf\u00e9rer si le prospect demande \u00e0 parler \u00e0 un humain" />
        </div>
      </Section>

      {/* ── AI ── */}
      <Section icon={Bot} title="Intelligence artificielle" description="Comportement et ton des agents IA">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ton des r\u00e9ponses">
            <select value={ai.tone || 'professionnel'} onChange={e => update('ai', 'tone', e.target.value)} className={selectCls}>
              <option value="professionnel">Professionnel</option>
              <option value="professionnel et chaleureux">Professionnel et chaleureux</option>
              <option value="d\u00e9contract\u00e9">D\u00e9contract\u00e9</option>
              <option value="formel">Formel</option>
            </select>
          </Field>
          <Field label="Langue de r\u00e9ponse">
            <select value={ai.language || 'fr'} onChange={e => update('ai', 'language', e.target.value)} className={selectCls}>
              <option value="fr">Fran\u00e7ais</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Biens max par r\u00e9ponse">
            <NumberInput value={ai.max_properties_shown} onChange={v => update('ai', 'max_properties_shown', v)} min={1} max={10} />
          </Field>
          <Field label="Escalade apr\u00e8s N tours">
            <NumberInput value={ai.escalate_after_turns} onChange={v => update('ai', 'escalate_after_turns', v)} min={3} max={30} />
          </Field>
        </div>
        <Field label="R\u00e9ponse pour questions hors sujet">
          <Textarea value={ai.out_of_scope_response} onChange={v => update('ai', 'out_of_scope_response', v)} rows={2} placeholder="Je suis sp\u00e9cialis\u00e9 dans la recherche immobili\u00e8re\u2026" />
        </Field>
      </Section>

      {/* Save footer */}
      <div className="flex justify-end pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all text-white disabled:opacity-50"
          style={{ background: '#0A0A0F' }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#1F1F2E' }}
          onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#0A0A0F' }}
        >
          <Save size={15} />
          {saving ? 'Enregistrement\u2026' : 'Enregistrer tous les param\u00e8tres'}
        </button>
      </div>
    </div>
  )
}
