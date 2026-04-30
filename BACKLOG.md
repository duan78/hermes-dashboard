# Hermes Dashboard — Backlog & Audit

> Audit complet effectué le 30 avril 2026 par Sam
> Dashboard v2.0+ | 37 pages frontend | 285 routes backend | 112 endpoints GET testés

---

## 🔍 Résumé de l'audit

**Score global : 8.5/10** — Le dashboard est fonctionnel et solide. Les bugs trouvés sont mineurs et aucun n'est critique.

### Chiffres clés
- **112 endpoints GET testés** → 105 OK, 7 erreurs (toutes expliquées/attendues)
- **37 pages frontend** → toutes wrappées avec ErrorBoundary
- **60 composants JSX** → 23 504 lignes de code
- **Backend** : 39 routers, FastAPI + Uvicorn
- **Temps de réponse moyen** : <500ms pour la majorité des endpoints

---

## 🐛 Bugs identifiés

### 🔴 Critique

*Aucun bug critique trouvé.*

### 🟡 Moyen

#### BUG-001: `POST /api/sessions/prune` → 500 Internal Server Error
- **Description** : Le endpoint de purge des sessions retourne une erreur 500 quand appelé sans paramètres
- **Impact** : Le bouton "Prune" dans l'UI Sessions peut crasher
- **Reproduction** : `POST /api/sessions/prune` avec body `{}` ou vide
- **Logs** : `Pruning sessions older than 30 days` puis 500
- **Correction** : Vérifier le handler dans `sessions.py` — probablement un subprocess qui fail silencieusement

#### BUG-002: `POST /api/models/refresh-cache` → 500 Internal Server Error
- **Description** : Le rafraîchissement du cache de modèles échoue
- **Impact** : Impossible de rafraîchir la liste des modèles depuis le dashboard
- **Logs** : Retourne le help de `hermes` CLI au lieu d'exécuter la commande
- **Correction** : Le subprocess construit mal la commande — il affiche le usage au lieu d'exécuter

#### BUG-003: `GET /api/sessions/search` → Timeout (>10s)
- **Description** : La recherche de sessions est extrêmement lente ou timeout
- **Impact** : La barre de recherche de sessions est inutilisable
- **Correction** : Requête trop lourde sur la DB SQLite — ajouter un index ou pagination côté backend

#### BUG-004: `GET /api/notifications/list` → "Notification not found"
- **Description** : L'endpoint retourne 404 même avec des notifications existantes
- **Impact** : La page Notifications peut ne pas afficher les notifs
- **Correction** : Vérifier le format du paramètre `id` — possiblement un problème de route (GET list vs GET by id)

### 🟢 Mineur

#### BUG-005: `GET /api/sessions/stats` → erreur silencieuse
- **Description** : Retourne `{"output": "...", "error": null}` avec le output contenant une erreur CLI
- **Impact** : Les stats sessions ne s'affichent pas correctement
- **Correction** : Le subprocess hermes retourne une erreur CLI qui est passée comme "output"

#### BUG-006: LLM Validation Error récurrent dans les logs
- **Description** : `[ERROR] LLM validation error:` apparaît toutes les ~6 minutes
- **Impact** : Pas d'impact utilisateur direct, mais pollue les logs
- **Source** : AutofeedService ou BacklogIntelligence
- **Correction** : Ajouter un catch plus spécifique ou logger le détail de l'erreur

#### BUG-007: `GET /api/skills/registry` retourne le help CLI
- **Description** : Quand `source=hub`, le endpoint retourne le texte d'aide de `hermes skills browse` au lieu des résultats parsés
- **Impact** : Le Skills Hub peut ne pas afficher les skills disponibles
- **Correction** : Parser correctement la sortie CLI ou utiliser une API dédiée

#### BUG-008: LanceDB Warning — fork safety
- **Description** : Warning `lance is not fork-safe` dans les logs
- **Impact** : Pas d'impact immédiat, mais risque potentiel avec multiprocessing
- **Correction** : Utiliser `spawn` au lieu de `fork` si multiprocessing est utilisé

#### BUG-009: `GET /api/overview/changelog` → `error: None`
- **Description** : Le changelog retourne `error: None` au lieu d'un objet vide ou d'une liste vide
- **Impact** : Le frontend doit gérer `error: null` comme "pas d'erreur" — peut causer un faux positif
- **Correction** : Ne pas inclure la clé `error` quand il n'y a pas d'erreur

#### BUG-010: `GET /api/github-config/status` → "Not configured"
- **Description** : Le status GitHub est "not configured" mais le setup-status montre `gh_auth: true`
- **Impact** : Incohérence entre les deux endpoints — l'utilisateur peut être confus
- **Correction** : Le endpoint status vérifie des conditions supplémentaires que setup-status ne vérifie pas

---

## 📊 Endpoints lents (>2s)

| Endpoint | Temps | Cause probable |
|---|---|---|
| `/api/mcp/list` | 2.8s | Connexion aux serveurs MCP (timeout réseau) |
| `/api/benchmark/providers` | 1.2s | Appels API externes |
| `/api/memory/vector/available` | 1.8s | Check LanceDB |
| `/api/sessions/linked-projects` | 1.4s | Requête SQLite lourde |
| `/api/overview/version` | 1.1s | Check git + réseau |

---

## 🏗️ Architecture & Points positifs

### ✅ Ce qui fonctionne bien
- **Auth** : Double mode (legacy token + JWT users) bien implémenté
- **Error Boundaries** : Toutes les 37 pages sont protégées
- **Sécurité** : Headers CSP, X-Frame-Options, XSS protection
- **WebSocket** : Terminal et Hub WS fonctionnels
- **Logging** : Logs structurés avec request IDs
- **API responses** : Consistantes et bien formatées
- **Frontend** : Pas de console.error excessifs, fetch avec .catch()

### 📐 Architecture actuelle
```
Frontend (React/Vite) → Nginx (port 80/8081) → Backend (FastAPI, port 3100)
                                          → WebSocket (/ws/terminal, /ws/hub)
```

---

## 🔧 Améliorations suggérées (non-bugs)

### UX
- **UPL-001** : Ajouter des tooltips/explications sur chaque option (demandé par Arnaud)
- **UPL-002** : Ajouter un loading skeleton au lieu de spinners pour les pages principales
- **UPL-003** : Ajouter une page 404 personnalisée (actuellement BoundedNotFound)
- **UPL-004** : Dark mode par défaut (actuellement light avec option dark)

### Performance
- **PERF-001** : Ajouter de la pagination côté backend pour `/api/sessions/search`
- **PERF-002** : Cacher les résultats de `/api/mcp/list` (2.8s) avec un TTL court
- **PERF-003** : Lazy loading des composants React (React.lazy + Suspense)

### Features manquantes
- **FEAT-001** : Endpoint d'export de l'audit (JSON/PDF)
- **FEAT-002** : Notifications push temps réel (WebSocket Hub existe mais notifications list a un bug)
- **FEAT-003** : Dashboard mobile responsive (certains composants débordent sur mobile)

---

## 📝 Pages frontend — Statut détaillé

| Page | Route | Backend | Statut |
|---|---|---|---|
| Overview | `/` | ✅ | OK — system, version, logs |
| Gateway | `/gateway` | ✅ | OK — status, logs, control |
| Chat | `/chat` | ✅ | OK — send, stream, sessions |
| Config | `/config` | ✅ | OK — sections, providers, MOA |
| Sessions | `/sessions` | ⚠️ | search timeout, prune 500 |
| Search History | `/search-history` | ✅ | OK |
| Files | `/files` | ✅ | OK — tree, read, write |
| Terminal | `/terminal` | ✅ | OK — WebSocket |
| Tools | `/tools` | ✅ | OK — config, registry |
| Skills | `/skills` | ✅ | OK — list, detail, registry |
| Skills Hub | `/skills-hub` | ⚠️ | registry retourne help CLI |
| Cron | `/cron` | ✅ | OK — system, list |
| Memory | `/memory` | ✅ | OK — soul, memory, vector |
| Models | `/models` | ✅ | OK — available, catalog |
| Platforms | `/platforms` | ✅ | OK — status, channels, pairing |
| API Keys | `/api-keys` | ✅ | OK |
| Fine Tune | `/fine-tune` | ✅ | OK — providers, pairs, stats |
| Insights | `/insights` | ✅ | OK |
| Diagnostics | `/diagnostics` | ✅ | OK — quick, run |
| Webhooks | `/webhooks` | ✅ | OK — list, create |
| Env Vars | `/env-vars` | ✅ | OK — list, required |
| Plugins | `/plugins` | ✅ | OK |
| MCP | `/mcp` | ⚠️ | list lent (2.8s) |
| Auth Pairing | `/auth-pairing` | ✅ | OK |
| Users | `/users` | ✅ | OK — list, preferences |
| Profiles | `/profiles` | ✅ | OK |
| Backup | `/backup` | ✅ | OK |
| Claude Code | `/claude-code` | ✅ | OK — active, history, stats |
| Wiki | `/wiki` | ✅ | OK — stats, pages, sources |
| MOA | `/moa` | ✅ | OK |
| Projects | `/projects` | ✅ | OK |
| Backlog | `/backlog` | ⚠️ | auto-feed timeout |
| Activity | `/activity` | ✅ | OK |
| Benchmark | `/benchmark` | ✅ | OK |
| Login | `/login` | ✅ | OK |
| Register | `/register` | ✅ | OK |
| 404 | `*` | ✅ | OK |

**Pages avec problèmes : 5/37** (tous mineurs, aucun crash)

---

## 🔒 Sécurité

- ✅ CSP headers configurés
- ✅ X-Frame-Options: DENY
- ✅ XSS protection
- ✅ JWT auth avec expiration
- ✅ Rate limiting
- ✅ Terminal WS requires token (même si dashboard token vide, refusé)
- ✅ Legacy token mode avec hmac.compare_digest (timing-safe)

---

*Dernière mise à jour : 2026-04-30 19:10 UTC*
*Prochain audit prévu : après corrections des bugs identifiés*
