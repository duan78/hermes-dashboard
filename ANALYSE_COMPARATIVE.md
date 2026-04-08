# Analyse Comparative : hermes-webui vs hermes-dashboard

## 1. Philosophie d'Architecture

### hermes-webui (sanchomuzax) — "Observatoire Externe"
- **Posture Read-Only** : principalement lecture seule, via SQLite read-only (`mode=ro`) et parsing de fichiers YAML/JSON
- **Decouple de l'agent** : bridge hermes_bridge.py qui importe le module hermes_state si disponible, sinon fallback sur SQLite directe via `FallbackSessionDB`
- **Polling Bridge WebSocket** : un `StatePollBridge` poll toutes les 3s state.db (via mtime + WAL), gateway_state.json, et cron/output/ pour diff et emettre des evenements
- **Zero modification du code Hermes** : ne touche pas au code de l'agent
- **Quelques ecritures** : PATCH config.yaml (targeted line replacement), CRUD cron jobs, PATCH .env, POST session title

### Notre dashboard (duan78) — "Centre de Commandement Integre"
- **Full CRUD** : modification complete de l'agent (config, env vars, sessions, skills, models, platforms, etc.)
- **28 routers** couvrant toutes les facettes de l'administration
- **Pas de DB** : operations directes sur fichiers (JSONL, JSON, YAML)
- **SSE pour streaming** : Server-Sent Events pour le chat et les streams
- **WebSocket pour terminal** : PTY interactive via WebSocket
- **Securite avancée** : rate limiting, audit trail, security headers, body size limit, CSP

---

## 2. Stack Technique Comparee

| Aspect | hermes-webui | Notre dashboard |
|---|---|---|
| **Backend Framework** | FastAPI | FastAPI |
| **ORM / DB** | SQLite read-only (state.db) via sqlite3 raw | Aucun ORM, fichiers JSONL/JSON/YAML |
| **Auth Backend** | X-Hermes-Token header, token dans auth.json | Bearer token, ASGI middleware, hmac.compare_digest |
| **WebSocket** | Hub + Polling Bridge (diff snapshots) | Terminal PTY WebSocket uniquement |
| **Temps reel** | WebSocket broadcast (platform:status, session:new, session:message, cost:update, cron:output) | SSE pour chat streaming, polling via setInterval pour le reste |
| **Securite** | Auth token basique | Rate limiting, audit trail JSONL, CSP, body size limit, security headers, request_id |
| **Frontend Framework** | React 18 + TypeScript | React 18 + JavaScript (JSX) |
| **CSS** | TailwindCSS 4 (import "tailwindcss") + CSS custom properties | CSS custom + fichiers .css par page (~15 CSS files) |
| **State Management** | TanStack Query (react-query) | useState/useEffect manuels, useEffect pour le polling |
| **Data Fetching** | TanStack Query avec queryKey, refetchInterval, cache, staleTime | fetch() manuel dans useEffect, pas de cache ni deduplication |
| **Routing** | react-router-dom (Routes/Route) | react-router-dom (Routes/Route) |
| **Code Splitting** | Aucun (tout import eager) | lazy() + Suspense pour 23 pages sur 28 |
| **Icones** | Aucune lib d'icones visible (texte/emoji) | lucide-react (28 icones importees) |
| **Typed API** | TypeScript interfaces (types.ts) + client.ts generic | api.js non-type, un seul objet avec 279 lignes |
| **Schémas Backend** | Pydantic BaseModel pour chaque endpoint (session, config, cron, gateway) | Validation manuelle dans les routers |

---

## 3. Couverture Fonctionnelle

### Tableau Comparatif des Pages/Features

| Feature/Page | hermes-webui | Notre dashboard | Detail |
|---|:---:|:---:|---|
| **Dashboard / Overview** | Oui | Oui | webui: stats + platform status + activity feed + model distribution; nous: gateway + system metrics + logs + version + update |
| **Sessions (liste)** | Oui | Oui | webui: pagination + source filter tabs + search inline; nous: search + delete + prune + export |
| **Session Detail** | Oui | Oui | webui: messages + token bar (input/output/cache/reasoning); nous: messages + export JSON + metadata |
| **Config (lecture)** | Oui | Oui | webui: read-only display par section; nous: editeur structure complet avec descriptions/tooltip par champ |
| **Config (ecriture)** | PATCH unique (dot-path) | PUT global + PATCH field + structured | Nous avons un editeur beaucoup plus complet avec sauvegarde YAML + field-by-field |
| **Env Variables** | Lecture + PATCH | Lecture + set + delete + required list | Nous avons plus d'operations CRUD |
| **Cron Jobs** | CRUD complet | CRUD complet + pause/resume/run | webui: create form + toggle + expand + output history; nous: pause/resume/run manuel |
| **Skills (liste)** | Oui (builtin + custom) | Oui | webui: scan recursif avec frontmatter YAML parsing; nous: list + browse + registry |
| **Skills (inspect)** | Oui (docs + code viewer) | Oui | Les deux ont un viewer de fichiers de skill |
| **Skills (install/uninstall)** | Non | Oui | Nous avons l'install/uninstall depuis le registry |
| **Skills Hub/Registry** | Non | Oui | Notre page SkillsHub avec browse registry |
| **Gateway Status** | Oui | Oui | webui: PID + uptime + platform detection + services (honcho, TTS, STT, MCP, cron); nous: restart/stop/start + logs + status |
| **Gateway Control** | Non (lecture seule) | Oui (restart/stop/start) | Nous pouvons controler le gateway |
| **Full-Text Search** | Oui (FTS5) | Oui (search dans sessions) | webui: FTS5 natif SQLite avec filtres source/role + context; nous: search basique |
| **Memory / SOUL** | Non | Oui | Notre page complete avec SOUL, memory files, vector memory (LanceDB), Honcho |
| **Wiki** | Non | Oui | Page wiki pour la documentation interne |
| **Chat** | Non | Oui | Chat interactif avec l'agent via SSE |
| **Terminal** | Non | Oui | Terminal PTY interactif via WebSocket |
| **Files Browser** | Non | Oui | Navigateur de fichiers avec read/write |
| **Tools** | Non | Oui | Liste et activation/desactivation des tools |
| **Models** | Non | Oui | Liste + switch de modeles |
| **Platforms** | Non | Oui | Status + channels + pairing + configuration |
| **API Keys** | Non | Oui | Gestion des cles API avec test |
| **Insights** | Non | Oui | Analytics et statistiques |
| **Diagnostics** | Non | Oui | Diagnostic complet de l'installation |
| **Webhooks** | Non | Oui | CRUD webhooks avec events |
| **Env Vars (page dediee)** | Non | Oui | Page dediee avec required vars detection |
| **Plugins** | Non | Oui | Install/remove/enable/disable/update plugins |
| **MCP Servers** | Non | Oui | Add/remove/test/toggle MCP servers |
| **Auth & Pairing** | Non | Oui | Gestion de l'authentification et du pairing |
| **Profiles** | Non | Oui | CRUD profils de configuration |
| **Backup & Restore** | Non | Oui | Create/list/restore/delete backups |
| **Claude Code Monitor** | Non | Oui | Monitoring des sessions Claude Code |
| **Fine-Tune** | Non | Oui | Paires d'entrainement + cross-validation |
| **MOA (Mixture of Agents)** | Non | Oui | Configuration MOA |
| **Theme** | Dark + Light (toggle) | Dark + Light (toggle) | Les deux |
| **Login Page** | Oui (formulaire inline) | Oui | webui: token check sur /api/health; nous: auth middleware |

### Ce que hermes-webui a qu'on n'a pas

1. **WebSocket temps reel** : Polling bridge qui emet des evenements (platform:status, session:new, session:message, cost:update, cron:output) — pas de polling frontend necessaire pour les updates
2. **FTS5 Search** : Recherche full-text SQLite native avec filtres source/role et contexte de message
3. **Token Usage Bar** : Visualisation graphique des tokens (input, output, cache read/write, reasoning) sur SessionDetail
4. **Skills avec usage tracking** : Compteur d'utilisation 7j/all par skill via les sessions
5. **Service Detection** : Auto-detection de Honcho, TTS, STT, Voice, MCP, Cron comme services dans le gateway status
6. **Session message sort** : Tri ascendant/descendant des messages avec persistance dans localStorage
7. **Source color mapping** : Couleurs standardisees par plateforme (Telegram=#2AABEE, Discord=#5865F2, etc.)
8. **Cron human-readable** : Conversion d'expressions cron en texte humain ("Every day at 09:00")
9. **Pydantic schemas complets** : Schemas stricts pour chaque endpoint avec validation
10. **TypeScript strict** : Typage complet frontend (types.ts, client.ts generic)

### Ce qu'on a qu'il n'a pas

1. **27 pages vs 6 pages** : Couverture fonctionnelle massive
2. **Full CRUD** : Modification complete de l'agent
3. **Chat interactif** : Envoi de messages et streaming des reponses
4. **Terminal PTY** : Shell interactif dans le navigateur
5. **Files Browser** : Navigation et edition de fichiers
6. **Memory/SOUL** : Gestion de la memoire et de la personalite de l'agent
7. **Tools management** : Activation/desactivation des tools
8. **Model switching** : Changement de modele a chaud
9. **Platform control** : Pairing, channels, configuration
10. **Fine-Tune** : Preparation de donnees d'entrainement
11. **Rate limiting + Audit trail** : Securite production-grade
12. **Code splitting** : lazy() pour 23 pages
13. **Backup/Restore** : Sauvegarde et restauration
14. **Claude Code Monitor** : Monitoring avance des sessions Claude
15. **Webhooks** : Systeme de webhooks
16. **Plugins** : Gestion de plugins
17. **MCP Servers** : Configuration MCP
18. **Wiki** : Documentation interne
19. **Insights/Analytics** : Statistiques avancees

---

## 4. Qualite de Code Comparee

### TypeScript vs JavaScript
- **hermes-webui** : TypeScript strict avec interfaces dediees (SessionSummary, Message, SearchResult, CronJob, SkillInfo, etc.). Le fichier types.ts definit 13+ interfaces qui correspondent 1:1 aux schemas Pydantic backend. Le client.ts est generic (`request<T>`) avec retour type.
- **Notre dashboard** : JavaScript pur (JSX). Aucun typage statique. api.js est un objet plat de 279 lignes sans types. Risque d'erreurs a l'execution plus eleve.

### Composants Reutilisables
- **hermes-webui** : Composants shared identifies (CostBadge, SearchBar, FileViewer, RoleBadge, TokenStat, FilterTab, SourceBadge, ScheduleKindBadge, ServiceBadge, SessionStatusBadge, StatCard, ConfigSection). Cependant la plupart sont definis inline dans les fichiers de pages plutot que dans des fichiers separes.
- **Notre dashboard** : Tooltip component importe partout. ToastProvider context. ThemeContext. Pas beaucoup de composants shared au-dela de ca — la plupart de la logique est inline.

### Schémas Pydantic
- **hermes-webui** : 4 fichiers de schemas (session.py, config.py, cron.py, gateway.py) avec des BaseModel stricts. Chaque endpoint a un response_model. Validation et documentation auto-generees.
- **Notre dashboard** : Pas de schemas Pydantic. Validation manuelle dans les routers. Pas de response_model sur les endpoints.

### Gestion d'Etat
- **hermes-webui** : TanStack Query avec queryKey, refetchInterval (5-15s), cache automatique, stale/invalidation, deduplication des requetes. useMutation avec onSuccess -> invalidateQueries.
- **Notre dashboard** : useState + useEffect manuels. fetch() dans useEffect sans cache, sans deduplication, sans stale management. Le polling est fait via setInterval manuel.

### WebSocket Implementation
- **hermes-webui** :
  - Backend: WebSocketHub (connection manager avec broadcast) + StatePollBridge (polling state.db/gateway/cron toutes les 3s avec diff de snapshots)
  - Frontend: Classe HermesWebSocket avec reconnexion exponentielle (1s -> 30s), event dispatching par type, on/ onAny handlers
  - Auth WebSocket: first message {"type": "auth", "token": "..."}, close codes 4001/4003
  - Evenements: platform:status, session:new, session:message, cost:update, cron:output
- **Notre dashboard** :
  - Backend: WebSocket terminal PTY uniquement (pas de hub, pas de broadcast)
  - Frontend: Pas de hook WebSocket. Pas de real-time events pour les sessions/gateway.
  - Le frontend poll manuellement via setInterval/setTimeout ou refetch manuels

---

## 5. Points Forts de Chaque Approche

### hermes-webui
- **Elegance architecturale** : Bridge pattern propre, decouplage maximal de l'agent
- **Type safety** : TypeScript + Pydantic = contrat API strict end-to-end
- **Temps reel** : WebSocket polling bridge avec diff intelligent — pas besoin de refetch
- **TanStack Query** : Cache, deduplication, invalidation automatiques
- **FTS5 Search** : Recherche full-text performante directement dans SQLite
- **Low risk** : Read-only = zero risque de casser l'agent
- **TailwindCSS 4** : Design moderne avec dark/light theme via CSS custom properties
- **Skill metadata parsing** : Frontmatter YAML des skills bien exploite

### Notre dashboard
- **Couverture fonctionnelle massive** : 28 pages vs 6, quasi-totalite de l'administration
- **Full CRUD** : Vrai centre de commandement pour l'agent
- **Chat interactif** : Fonctionnalite clef pour interagir avec l'agent
- **Terminal integre** : Shell dans le navigateur
- **Securite production-grade** : Rate limiting, audit trail, CSP, body size limit
- **Performance frontend** : Code splitting avec lazy() pour 23 pages
- **Features avancees** : Fine-tune, Claude Code monitor, webhooks, plugins, MCP, MOA, wiki, insights
- **Stabilite** : ASGI middleware auth (pas BaseHTTPMiddleware), hmac.compare_digest

---

## 6. Idees a Piquer

### PRIORITE HAUTE (impact eleve, effort moyen)

1. **Migrer vers TanStack Query**
   - Remplacer tous les useState/useEffect + fetch() par useQuery/useMutation
   - Benefices : cache auto, deduplication, refetchInterval, stale management, loading/error states
   - Migration progressive possible (une page a la fois)
   - Estimation : 2-3 jours

2. **Ajouter un WebSocket Hub + Polling Bridge**
   - Copier le pattern StatePollBridge : poll state.db mtime, gateway_state.json mtime, cron output
   - Emettre des evenements : session:new, platform:status, cost:update
   - Benefices : temps reel sans polling frontend, meilleure UX
   - Estimation : 2-3 jours

3. **Ajouter Pydantic schemas pour les endpoints principaux**
   - Creer schemas/sessions.py, schemas/config.py, etc.
   - response_model sur chaque endpoint
   - Benefices : validation, documentation auto, coherence frontend-backend
   - Estimation : 1-2 jours

### PRIORITE MOYENNE (ameliorations UX)

4. **Token Usage Bar sur SessionDetail**
   - Visualisation graphique input/output/cache/reasoning tokens
   - Pattern simple a copier depuis SessionDetail.tsx de hermes-webui
   - Estimation : 2-3 heures

5. **FTS5 Full-Text Search**
   - Utiliser la table messages_fts existante dans state.db
   - Endpoint /api/search/messages avec filtres source/role
   - Ajouter le SearchBar inline dans la page Sessions
   - Estimation : 1 jour

6. **Skill Usage Tracking**
   - Compter les invocations de chaque tool/skill depuis les sessions
   - Afficher "X utilisations cette semaine" sur les skill cards
   - Estimation : 3-4 heures

7. **Cron Human-Readable**
   - Copier cronHuman.ts (cronToHuman + intervalToHuman)
   - Afficher "Every day at 09:00" au lieu de "0 9 * * *"
   - Estimation : 1-2 heures

8. **Source Color Mapping**
   - Couleurs standardisees par plateforme (Telegram, Discord, Slack, etc.)
   - Badge colores dans la liste des sessions
   - Estimation : 2-3 heures

### PRIORITE BASSE (nice to have)

9. **Service Auto-Detection sur Gateway**
   - Detecter Honcho, TTS, STT, MCP servers automatiquement depuis config.yaml
   - Afficher comme "services" dans le statut gateway
   - Estimation : 1 jour

10. **Session Message Sort + Persistence**
    - Tri asc/desc des messages dans SessionDetail
    - Persistance du tri dans localStorage
    - Estimation : 1 heure

11. **TypeScript Migration (long terme)**
    - Migrer JSX -> TSX progressivement
    - Creer types.ts correspondant aux schemas Pydantic
    - Benefice : type safety, autocompletion, moins de bugs
    - Estimation : 1-2 semaines (migration progressive)

---

## Synthese

hermes-webui est un **observateur elegante** avec une stack frontend moderne (TypeScript + TanStack Query + TailwindCSS) et un pattern WebSocket polling bridge intelligent. Sa force est la qualite du code et le type safety. Sa faiblesse est la couverture fonctionnelle (6 pages seulement, principalement read-only).

Notre dashboard est un **centre de commandement complet** avec 28 pages et full CRUD sur l'agent. Sa force est la couverture fonctionnelle massive et la securite production-grade. Sa faiblesse est la qualite du code frontend (pas de TypeScript, pas de TanStack Query, pas de schemas Pydantic, composants peu reutilisables).

**Recommandation strategique** : Conserver notre dashboard comme base (la couverture fonctionnelle est un avantage competitif majeur), mais adopter les patterns de qualite de hermes-webui :
1. TanStack Query (priorite #1 — impact maximal sur la qualite frontend)
2. WebSocket Hub + Polling Bridge (temps reel)
3. Pydantic schemas (contrat API)
4. Token Usage Bar + FTS5 Search (UX)
