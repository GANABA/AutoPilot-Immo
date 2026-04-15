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
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <Icon size={18} className="text-blue-600" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">{title}</div>
            <div className="text-xs text-slate-500">{description}</div>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-6 border-t border-slate-100">{children}</div>}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="mt-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-500 mb-1.5">{hint}</p>}
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
      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
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
      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
    />
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-slate-700">{label}</span>
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
      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}

// ── Day-hours editor ──────────────────────────────────────────────────────────

const DAY_LABELS = {
  monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi',
  thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche',
}

function WorkingHoursEditor({ value, onChange }) {
  const update = (day, field, v) => onChange({ ...value, [day]: { ...value[day], [field]: v } })
  return (
    <div className="mt-4 space-y-2">
      {Object.entries(DAY_LABELS).map(([day, label]) => {
        const dh = value[day] || {}
        return (
          <div key={day} className="flex items-center gap-3">
            <div className="w-24 text-sm text-slate-600 font-medium">{label}</div>
            <Toggle value={!!dh.enabled} onChange={v => update(day, 'enabled', v)} label="" />
            {dh.enabled ? (
              <>
                <input
                  type="time"
                  value={dh.open || '09:00'}
                  onChange={e => update(day, 'open', e.target.value)}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-400 text-sm">→</span>
                <input
                  type="time"
                  value={dh.close || '19:00'}
                  onChange={e => update(day, 'close', e.target.value)}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </>
            ) : (
              <span className="text-xs text-slate-400 italic">Fermé</span>
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
  const [toast, setToast] = useState(null) // { type: 'success'|'error', msg }

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
      showToast('success', 'Paramètres enregistrés.')
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCrawl = async () => {
    if (!settings?.agency?.website_url) {
      showToast('error', 'Configurez d\'abord l\'URL du site web.')
      return
    }
    setCrawling(true)
    try {
      const result = await crawlWebsite(false) // background
      showToast('success', result.message || 'Indexation lancée en arrière-plan.')
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setCrawling(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  if (!settings) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
      Impossible de charger les paramètres.
    </div>
  )

  const a = settings.agency || {}
  const w = settings.chat_widget || {}
  const wh = settings.working_hours || {}
  const cal = settings.calendar || {}
  const em = settings.email || {}
  const vo = settings.voice || {}
  const ai = settings.ai || {}

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
          <p className="text-slate-500 mt-1 text-sm">Configuration de l'agence et des agents IA</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Save size={16} />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
            : <AlertCircle size={16} className="text-red-600 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* ── Agency ── */}
      <Section icon={Building2} title="Agence" description="Identité et coordonnées de l'agence" defaultOpen>
        <Field label="Nom de l'agence">
          <Input value={a.name} onChange={v => update('agency', 'name', v)} placeholder="ImmoPlus" />
        </Field>
        <Field label="Adresse">
          <Input value={a.address} onChange={v => update('agency', 'address', v)} placeholder="12 rue de la Paix, 69001 Lyon" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Téléphone">
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
        <Field label="URL du site web" hint="L'agent support utilise ce contenu pour répondre aux questions sur l'agence.">
          <Input value={a.website_url} onChange={v => update('agency', 'website_url', v)} placeholder="https://www.immoplus.fr" />
        </Field>
        {a.website_crawled_at && (
          <p className="mt-2 text-xs text-slate-500">
            Dernière indexation : {new Date(a.website_crawled_at).toLocaleString('fr-FR')}
          </p>
        )}
        <button
          onClick={handleCrawl}
          disabled={crawling}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={15} className={crawling ? 'animate-spin' : ''} />
          {crawling ? 'Indexation en cours…' : 'Lancer l\'indexation'}
        </button>
      </Section>

      {/* ── Chat Widget ── */}
      <Section icon={MessageSquare} title="Widget chatbot" description="Apparence et comportement du chat">
        <Field label="Message d'accueil">
          <Input value={w.welcome_message} onChange={v => update('chat_widget', 'welcome_message', v)} placeholder="Bonjour, bienvenue !" />
        </Field>
        <Field label="Texte du placeholder">
          <Input value={w.placeholder_text} onChange={v => update('chat_widget', 'placeholder_text', v)} placeholder="Décrivez votre recherche…" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Couleur principale">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={w.primary_color || '#1d4ed8'}
                onChange={e => update('chat_widget', 'primary_color', e.target.value)}
                className="w-10 h-9 rounded-lg border border-slate-300 cursor-pointer p-1"
              />
              <Input value={w.primary_color} onChange={v => update('chat_widget', 'primary_color', v)} placeholder="#1d4ed8" />
            </div>
          </Field>
          <Field label="Délai ouverture auto (s)">
            <NumberInput value={w.auto_open_delay_seconds} onChange={v => update('chat_widget', 'auto_open_delay_seconds', v)} min={0} max={60} />
          </Field>
        </div>
        <Field label="Position">
          <select
            value={w.position || 'bottom-right'}
            onChange={e => update('chat_widget', 'position', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="bottom-right">En bas à droite</option>
            <option value="bottom-left">En bas à gauche</option>
          </select>
        </Field>
      </Section>

      {/* ── Working Hours ── */}
      <Section icon={Clock} title="Horaires d'ouverture" description="Heures de disponibilité de l'agence">
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
        <Field label="Email de l'agent" hint="Ajouté comme participant aux événements de visite">
          <Input value={cal.agent_email} onChange={v => update('calendar', 'agent_email', v)} type="email" placeholder="agent@agence.fr" />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Durée visite (min)">
            <NumberInput value={cal.visit_duration_minutes} onChange={v => update('calendar', 'visit_duration_minutes', v)} min={15} max={240} />
          </Field>
          <Field label="Délai min (h)">
            <NumberInput value={cal.min_booking_advance_hours} onChange={v => update('calendar', 'min_booking_advance_hours', v)} min={1} max={72} />
          </Field>
          <Field label="Délai max (j)">
            <NumberInput value={cal.max_booking_advance_days} onChange={v => update('calendar', 'max_booking_advance_days', v)} min={1} max={90} />
          </Field>
        </div>
      </Section>

      {/* ── Email ── */}
      <Section icon={Mail} title="Emails" description="Configuration des emails automatiques">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom expéditeur">
            <Input value={em.sender_name} onChange={v => update('email', 'sender_name', v)} placeholder="ImmoPlus" />
          </Field>
          <Field label="Email expéditeur">
            <Input value={em.sender_email} onChange={v => update('email', 'sender_email', v)} type="email" placeholder="no-reply@immoplus.fr" />
          </Field>
        </div>
        <Field label="Délai relance J+ (jours)">
          <NumberInput value={em.followup_delay_days} onChange={v => update('email', 'followup_delay_days', v)} min={1} max={30} />
        </Field>
        <div className="mt-4 space-y-3">
          <Toggle value={em.send_prospect_confirmation} onChange={v => update('email', 'send_prospect_confirmation', v)} label="Email de confirmation au prospect après qualification" />
          <Toggle value={em.send_agent_notification} onChange={v => update('email', 'send_agent_notification', v)} label="Notification à l'agent pour chaque nouveau prospect" />
          <Toggle value={em.send_visit_confirmation} onChange={v => update('email', 'send_visit_confirmation', v)} label="Email de confirmation de visite" />
        </div>
      </Section>

      {/* ── Voice ── */}
      <Section icon={Mic} title="Agent vocal" description="Configuration de l'assistant téléphonique">
        <Field label="ID assistant Vapi" hint="L'identifiant de votre assistant sur vapi.ai">
          <Input value={vo.vapi_assistant_id} onChange={v => update('voice', 'vapi_assistant_id', v)} placeholder="va_xxxxxxxxxxxx" />
        </Field>
        <Field label="Message d'accueil téléphonique">
          <Textarea value={vo.greeting} onChange={v => update('voice', 'greeting', v)} placeholder="Bonjour, vous êtes bien chez ImmoPlus…" />
        </Field>
        <Field label="Message hors horaires">
          <Textarea value={vo.out_of_hours_message} onChange={v => update('voice', 'out_of_hours_message', v)} placeholder="Notre agence est fermée. Laissez votre numéro…" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Numéro de transfert">
            <Input value={vo.transfer_number} onChange={v => update('voice', 'transfer_number', v)} placeholder="+33612345678" />
          </Field>
        </div>
        <div className="mt-4">
          <Toggle value={vo.transfer_on_request} onChange={v => update('voice', 'transfer_on_request', v)} label="Transférer si le prospect demande à parler à un humain" />
        </div>
      </Section>

      {/* ── AI ── */}
      <Section icon={Bot} title="Intelligence artificielle" description="Comportement et ton des agents IA">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ton des réponses">
            <select
              value={ai.tone || 'professionnel'}
              onChange={e => update('ai', 'tone', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="professionnel">Professionnel</option>
              <option value="professionnel et chaleureux">Professionnel et chaleureux</option>
              <option value="décontracté">Décontracté</option>
              <option value="formel">Formel</option>
            </select>
          </Field>
          <Field label="Langue de réponse">
            <select
              value={ai.language || 'fr'}
              onChange={e => update('ai', 'language', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Biens max par réponse">
            <NumberInput value={ai.max_properties_shown} onChange={v => update('ai', 'max_properties_shown', v)} min={1} max={10} />
          </Field>
          <Field label="Escalade après N tours">
            <NumberInput value={ai.escalate_after_turns} onChange={v => update('ai', 'escalate_after_turns', v)} min={3} max={30} />
          </Field>
        </div>
        <Field label="Réponse pour questions hors sujet">
          <Textarea value={ai.out_of_scope_response} onChange={v => update('ai', 'out_of_scope_response', v)} rows={2} placeholder="Je suis spécialisé dans la recherche immobilière…" />
        </Field>
      </Section>

      {/* Save footer */}
      <div className="flex justify-end pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Save size={16} />
          {saving ? 'Enregistrement…' : 'Enregistrer tous les paramètres'}
        </button>
      </div>
    </div>
  )
}
