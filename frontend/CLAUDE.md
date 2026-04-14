# Frontend — Contexte spécialisé

> Ce fichier complète le CLAUDE.md racine. Il s'applique à tout travail dans `frontend/`.

---

## Deux frontends distincts

### 1. Dashboard — `frontend/dashboard/`
Application React 18 + Vite + Tailwind CSS pour l'agent immobilier.  
Build : `npm run build` → `dist/` servi par FastAPI sur `/dashboard/`.

### 2. Widget chatbot — `frontend/widget/`
JS Vanilla pur, aucune dépendance build. Intégrable sur n'importe quel site avec une balise `<script>`.  
Servi statiquement par FastAPI sur `/widget/`.

---

## Dashboard — conventions

### Palette de couleurs
```
Fonds sombres sidebar : slate-950, slate-900, slate-800
Fond principal page   : slate-50
Primaire (boutons, actif, badges) : blue-600
Texte principal  : slate-900 (clair), white (sombre)
Texte secondaire : slate-500, slate-400
Succès  : green-*
Erreur  : red-*
Warning : amber-*
```

### Structure d'une page
```jsx
export default function MyPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiFunction()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>

  if (error) return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Titre</h1>
        <p className="text-slate-500 mt-1">Description</p>
      </div>
      {/* contenu */}
    </div>
  )
}
```

### Appels API
Toujours passer par `frontend/dashboard/src/api/client.js`.  
Pour un nouvel endpoint, ajouter une fonction dans `client.js` puis l'importer dans la page.

```js
// client.js — ajouter
export const getSettings = () => req('/settings', { headers: authHeaders() })
export const updateSettings = (body) => req('/settings', {
  method: 'PATCH',
  headers: jsonHeaders(),
  body: JSON.stringify(body),
})
```

### Ajouter une page
1. Créer `frontend/dashboard/src/pages/MyPage.jsx`
2. Ajouter dans `App.jsx` : entrée dans `NAV` + import + entrée dans `PAGES`

### Composants UI récurrents

**Card container**
```jsx
<div className="bg-white rounded-2xl border border-slate-200 p-6">...</div>
```

**Badge statut**
```jsx
const STATUS_COLORS = {
  open: 'bg-blue-100 text-blue-700',
  qualified: 'bg-amber-100 text-amber-700',
  visit_booked: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-600',
}
<span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
  {status}
</span>
```

**Bouton primaire**
```jsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
  Action
</button>
```

**Input**
```jsx
<input
  type="text"
  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  placeholder="..."
/>
```

---

## Widget chatbot — conventions

### Structure IIFE obligatoire
```javascript
(function () {
  "use strict";
  // tout le code ici
})();
```

### Session localStorage
```javascript
const SESSION_KEY = 'ap_immo_session';
// Stocke { conversationId: string, ts: number }
// TTL : 30 jours
```

### Communication WebSocket
```javascript
// Envoi
ws.send(JSON.stringify({ content: "message utilisateur" }))

// Réception — types possibles
// { type: "typing" }         → animation de frappe
// { type: "properties", items: [...] } → fiches biens
// { type: "assistant", content: "..." } → message texte
// { type: "error", content: "..." }     → erreur
```

### Ajouter un nouveau type de message reçu
Dans la fonction `ws.onmessage`, ajouter un `else if (msg.type === "xxx")` dans le switch.

---

## Build et déploiement

### Dashboard
```bash
cd frontend/dashboard
npm install
npm run build   # génère dist/
```
Le dossier `dist/` est servi par FastAPI sur `/dashboard/`. Il doit être commit si on ne build pas en CI.

### Widget
Pas de build. Les fichiers `chatbot.js`, `chatbot.css`, `demo.html` sont servis directement.

---

## Pages existantes

| Fichier | Route nav | Contenu actuel |
|---|---|---|
| `DashboardPage.jsx` | `/dashboard` | Stats globales (biens, conversations, messages) |
| `PropertiesPage.jsx` | `/properties` | Liste biens + génération annonces + upload doc |
| `ConversationsPage.jsx` | `/conversations` | Liste conversations + historique messages |

## Pages à créer (Sprint suivants)

| Page | Sprint | Contenu |
|---|---|---|
| `SettingsPage.jsx` | S1 | Config agence (toutes les sections settings) |
| `ProspectsPage.jsx` | S5 | CRM pipeline Kanban |
| `CalendarPage.jsx` | S5 | Vue agenda visites |
| `AnalyticsPage.jsx` | S5 | Métriques et conversion |
