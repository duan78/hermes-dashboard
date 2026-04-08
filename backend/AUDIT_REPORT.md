# AUDIT COMPLET — Hermes Dashboard Backend (FastAPI)

**Date**: 2026-04-07  
**Scope**: `/root/hermes-dashboard/backend/app/` — 28 routers, main.py, auth.py, schemas.py, utils.py, config.py  
**Total LOC audited**: ~6,500+ lignes Python

---

## SCORES

| Critère | Score | Notes |
|---------|-------|-------|
| **1. Performance** | **6.5/10** | Bloquants : sessions.py N+1, overview.py lit tous les fichiers, no caching sauf chat.py |
| **2. Sécurité** | **7/10** | Bon path traversal, auth middleware propre, mais WebSocket sans auth, exceptions de timing |
| **3. Code Quality** | **6/10** | Inconsistance error handling, beaucoup de `body: dict` sans Pydantic, dupli de code |
| **4. API Design** | **7.5/10** | Globalement propre, pagination présente, quelques status codes manquants |
| **SCORE GLOBAL** | **6.8/10** | Code fonctionnel et structuré, améliorations significatives possibles |

---

## 1. PERFORMANCE (6.5/10)

### P1 — sessions.py : N+1 file reads dans list_sessions et search_sessions
**Fichier**: `routers/sessions.py:108-158`  
**Problème**: Pour chaque `session_*.json`, on lit le JSON, puis on lit le `.jsonl` pour compter les messages, puis on le relit encore pour le preview. C'est 3 reads par session.  
**Impact**: Avec 200 sessions = 600+ file reads synchrones dans le event loop.  
**Fix**: 
```python
# Charger le JSONL une seule fois, réutiliser le contenu
jsonl_content = jsonl_path.read_text(errors="replace") if jsonl_path.exists() else ""
lines = [l for l in jsonl_content.strip().split("\n") if l.strip()]
msg_count = len(lines)
# Trouver le preview dans les mêmes lines
for line in lines:
    msg = json.loads(line)
    if msg.get("role") == "user" and msg.get("content"):
        preview = msg["content"][:80]
        break
```

### P1 — sessions.py : search_sessions lit chaque JSONL en entier pour chaque session
**Fichier**: `routers/sessions.py:49-70`  
**Problème**: Même motif N+1 — chaque session JSONL est lu intégralement 2 fois (une fois pour la recherche, une fois pour le count).  
**Fix**: Utiliser `asyncio.to_thread` pour les I/O et merger les deux passes.

### P1 — insights.py : lit TOUS les fichiers JSONL en entier pour calculer les stats
**Fichier**: `routers/insights.py:155-212`  
**Problème**: Pour chaque session, on lit le JSON complet + le JSONL complet. O(n * taille_fichier).  
**Fix**: Parser uniquement les metadata JSON (pas les messages JSONL), ou faire un seul scan séquentiel avec `asyncio.to_thread`.

### P1 — overview.py : parcours TOUTES les sessions + skills + cron pour l'overview
**Fichier**: `routers/overview.py:59-93`  
**Problème**: Chaque appel à `/api/overview` lit tous les fichiers JSON de sessions, skills, cron. Aucun cache.  
**Fix**: Ajouter un cache in-memory avec TTL de 10s comme dans `chat.py:_cached()`.

### P2 — Aucun caching global (sauf chat.py)
**Fichier**: Global  
**Problème**: `chat.py` a un système de cache `_cached()` avec TTL 30s, mais aucun autre router ne l'utilise. `config.yaml`, `.env`, `gateway_state.json` sont relus à chaque requête.  
**Fix**: Extraire `_cached` dans `utils.py` et l'utiliser dans `overview.py`, `platforms.py`, `models.py`, etc.

### P2 — Synchronous file I/O dans async handlers
**Fichier**: Tous les routers  
**Problème**: Presque toutes les lectures de fichiers utilisent `Path.read_text()` synchrone dans des handlers `async def`. Cela bloque l'event loop.  
**Fix**: Utiliser `asyncio.to_thread(Path.read_text, ...)` pour les opérations sur fichiers lourds (>10KB).

### P2 — Rate limiting memory leak
**Fichier**: `main.py:103`  
**Problème**: `_rate_windows` est un `defaultdict(deque)` qui ne nettoie jamais les clés des IPs qui ne reviennent pas. En cas de scan d'IPs, mémoire croissante.  
**Fix**: Ajouter un nettoyage périodique (ex: toutes les 5 min, supprimer les clés avec bucket vide).

### P2 — httpx.AsyncClient créé à chaque requête dans api_keys.py et chat.py
**Fichier**: `routers/api_keys.py:774`, `routers/chat.py:163,187,309,392`  
**Problème**: `async with httpx.AsyncClient(timeout=15.0) as client:` crée un nouveau client HTTP à chaque appel. Pas de connection pooling.  
**Fix**: Créer un client httpx singleton au niveau module avec `httpx.AsyncClient()` persistant.

---

## 2. SÉCURITÉ (7/10)

### P0 — WebSocket /ws/terminal bypass l'authentification
**Fichier**: `main.py:264-365`, `auth.py:17-18`  
**Problème**: Le middleware `AuthMiddleware` vérifie `scope["type"] in ("http", "websocket")` mais le check de token ne s'applique QUE pour les paths `/api/`. Le WebSocket `/ws/terminal` est sous `/ws/` pas `/api/`, donc il passe le check `not path.startswith("/api/")` et skip complètement l'auth.  
**Impact**: N'importe qui peut ouvrir un shell root sans authentification sur le réseau local.  
**Fix**: Modifier `auth.py` pour vérifier le token sur les WebSockets sensibles :
```python
# Auth WebSocket endpoints
if scope["type"] == "websocket":
    path = scope.get("path", "")
    if path == "/ws/terminal":
        # Check token from query param or header
        query = dict(qs.parse(scope.get("query_string", b"")))
        token = query.get("token", "")
        if not token:
            return  # reject
        ...
```

### P0 — Audit log écrit sur /tmp sans permissions restrictives
**Fichier**: `main.py:59,79`  
**Problème**: `/tmp/dashboard-audit.log` est world-readable par défaut. Contient IPs, user-agents, paths, timestamps.  
**Fix**: Créer le fichier avec `mode=0o600` ou utiliser un directory plus sécurisé.

### P1 — SPA serve_spa potentiel path traversal
**Fichier**: `main.py:376-381`  
**Problème**: `full_path` est interpolé directement dans le chemin sans validation de traversal. Un requête `GET /../../etc/passwd` pourrait fonctionner.  
**Fix**: Résoudre le path et vérifier qu'il reste sous `static_dir` :
```python
file_path = (static_dir / full_path).resolve()
if not str(file_path).startswith(str(static_dir.resolve())):
    return JSONResponse(status_code=403, content={"detail": "Forbidden"})
```

### P1 — wiki.py get_wiki_page path traversal
**Fichier**: `routers/wiki.py:164-173`  
**Problème**: `page_path` passé directement dans `WIKI_PATH / page_path` sans validation. Un `../etc/passwd` pourrait lire hors du wiki.  
**Fix**: Résoudre et valider comme dans `files.py:_resolve_path`.

### P1 — Timing attack sur le token dans auth.py
**Fichier**: `auth.py:44`  
**Problème**: `token == DASHBOARD_TOKEN` est une comparaison de chaîne qui peut leak via timing.  
**Fix**: Utiliser `hmac.compare_digest(token, DASHBOARD_TOKEN)`.

### P1 — backup.py restore ne valide pas les member paths suffisamment
**Fichier**: `routers/backup.py:122-135`  
**Problème**: La vérification `member.name.startswith("/") or ".." in member.name` ne catche pas les paths comme `foo/../../../etc/passwd`.  
**Fix**: Résoudre le path complet et vérifier qu'il est sous HERMES_HOME :
```python
target = (HERMES_HOME / member.name).resolve()
if not str(target).startswith(str(HERMES_HOME.resolve())):
    continue
```

### P2 — env_vars.py set_env_var ne valide pas les noms de variables
**Fichier**: `routers/env_vars.py:69-98`  
**Problème**: Contrairement à `api_keys.py` et `tools.py` qui valident avec `_ENV_NAME_RE`, `env_vars.py` accepte n'importe quelle clé.  
**Fix**: Ajouter la même validation regex.

### P2 — Claude code new_session workdir validated mais cd pas safe
**Fichier**: `routers/claude_code.py:251-253`  
**Problème**: `workdir` est validé pour être sous /root ou /home, mais il est injecté directement dans `tmux send-keys -l -- "cd {workdir}"`. Si workdir contient des guillemets ou `$(...)`, cela peut exécuter des commandes arbitraires.  
**Fix**: Shell-escape le workdir : `shlex.quote(workdir)`.

### P2 — CSP header allow unsafe-inline
**Fichier**: `main.py:217-222`  
**Problème**: `script-src 'self' 'unsafe-inline'` réduit fortement l'effet du CSP.  
**Fix**: Utiliser des nonces ou hashes pour le frontend React.

---

## 3. CODE QUALITY (6/10)

### P1 — Inconsistance error handling : exceptions avalées
**Fichier**: Multiple  
**Problème**: Beaucoup de `except Exception: pass` ou `except Exception: continue` qui avalent silencieusement les erreurs. Exemples :
- `sessions.py:69,79,92,125,142,156`
- `insights.py:211`
- `overview.py:68`
- `memory.py:435,453`

**Fix**: Logger les erreurs au minimum :
```python
except Exception as e:
    logger.debug("Failed to parse %s: %s", f, e)
    continue
```

### P1 — Duplication de _get_env_value / _save_env_value / _read_env_file
**Fichier**: `routers/api_keys.py:476-527`, `routers/tools.py:97-167`, `routers/config.py:237-248`, `routers/memory.py:409-421`  
**Problème**: La fonction `_get_env_value` est dupliquée 4 fois. `_save_env_value` est dupliquée 2 fois.  
**Fix**: Déplacer dans `utils.py` et importer partout.

### P1 — Body dict au lieu de Pydantic models
**Fichier**: La majorité des routers  
**Problème**: La plupart des endpoints POST/PUT utilisent `body: dict = Body(...)` au lieu de Pydantic models. Exemples :
- `fine_tune.py:92,347`
- `chat.py:137,273`
- `files.py:147`
- `memory.py:86,105,142,218,234,261,345,365`
- `platforms.py:119,131,161`
- `claude_code.py:212,224,239,261`
- Et ~20 autres

**Impact**: Pas de validation automatique, pas de documentation OpenAPI générée pour le body.  
**Fix**: Créer des Pydantic models dans `schemas.py` et les utiliser.

### P1 — Duplication de _load_yaml_config / _save_yaml_config
**Fichier**: `routers/tools.py:111-127`, `routers/config.py` (implicit via hermes_path)  
**Problème**: Même logique dupliquée.  
**Fix**: Centraliser dans `utils.py`.

### P2 — Import json inline dans les fonctions
**Fichier**: `routers/gateway.py:263`, `routers/terminal.py:76,91-93`, `routers/backup.py:20-21`, `routers/chat.py:108,125`  
**Problème**: `import json`, `import fcntl`, `import termios`, `import struct` à l'intérieur de fonctions.  
**Fix**: Déplacer les imports en haut du module.

### P2 — __import__("time") et __import__("re") inline
**Fichier**: `routers/chat.py:108,125`, `routers/backup.py:20-21`  
**Problème**: Utilisation de `__import__("time")` au lieu d'import normal.  
**Fix**: Import en haut du fichier.

### P2 — logger non utilisé dans certains fichiers
**Fichier**: `routers/terminal.py` (pas de logger), `routers/mcp.py` (pas de logger)  
**Fix**: Ajouter `logger = logging.getLogger(__name__)`.

### P2 — Duplicate terminal WebSocket (main.py + terminal.py router)
**Fichier**: `main.py:264-365` et `routers/terminal.py:11-126`  
**Problème**: Le WebSocket terminal est défini DEUX FOIS — une fois directement sur `app` et une fois dans le router `terminal.py`. Les deux sont fonctionnellement identiques. Le router terminal.py n'est jamais monté (pas dans main.py imports).  
**Fix**: Supprimer le code dupliqué dans `main.py` ou dans `terminal.py`.

### P2 — Bug potentiel dans api_keys.py test_api_key
**Fichier**: `routers/api_keys.py:763`  
**Problème**: `key_name` est référencé mais jamais défini. Devrait être `body.key`.  
**Fix**: Remplacer `key_name` par `body.key`.

---

## 4. API DESIGN (7.5/10)

### P1 — Status codes inconsistants pour les erreurs
**Fichier**: Multiple  
**Problème**: Plusieurs endpoints retournent des erreurs avec `{"error": "..."}` mais status code 200 au lieu de 4xx :
- `chat.py:143` : `return {"error": "Message is required"}` → devrait être 422
- `chat.py:166,174,190,194` : retourne `{"error": ...}` avec status 200
- `env_vars.py:76` : `return {"error": "Key is required"}` → 400
- `sessions.py:93` : `except (json.JSONDecodeError, Exception): continue` silencieux

**Fix**: Utiliser `HTTPException` avec le bon status code.

### P1 — DELETE avec body au lieu de path param
**Fichier**: `routers/memory.py:260` (POST /delete), `routers/auth_pairing.py:74` (POST /revoke)  
**Problème**: Les suppressions utilisent POST avec body au lieu de DELETE avec path/query param.  
**Fix**: Utiliser `DELETE /api/memory/delete?path=...` ou `DELETE /api/auth-pairing/{user}`.

### P1 — Pagination manquante sur list_sessions
**Fichier**: `routers/sessions.py:98-158`  
**Problème**: `list_sessions()` retourne TOUTES les sessions sans pagination.  
**Fix**: Ajouter `limit` et `offset` comme dans `fine_tune.py:list_pairs`.

### P2 — Réponse inconsistante pour les erreurs CLI
**Fichier**: `routers/platforms.py:114-115`, `routers/sessions.py:167-168`  
**Problème**: Certains endpoints CLI retournent `{"output": "", "error": str(e)}` (status 200), d'autres lancent `HTTPException(500, ...)`.  
**Fix**: Standardiser — soit tous en HTTPException, soit tous en dict avec error field.

### P2 — chat.py /sessions duplique sessions.py /
**Fichier**: `routers/chat.py:230-252`, `routers/sessions.py:98-158`  
**Problème**: `GET /api/chat/sessions` et `GET /api/sessions` retournent des données similaires mais avec des schemas différents.  
**Fix**: Unifier les schemas ou documenter la différence.

### P2 — wiki.py stats/count charge tout en mémoire
**Fichier**: `routers/wiki.py:46-54`  
**Problème**: Pour chaque type, `list(dir_path.glob(...))` charge tous les Path objects en mémoire.  
**Fix**: Utiliser `sum(1 for _ in ...)` au lieu de `len(list(...))`.

---

## RÉSUMÉ PAR PRIORITÉ

### P0 — Critique (doit être corrigé immédiatement)
| # | Fichier | Problème |
|---|---------|----------|
| 1 | `auth.py` + `main.py:264` | WebSocket `/ws/terminal` bypass l'authentification complète |
| 2 | `main.py:59` | Audit log world-readable sur /tmp |

### P1 — Important (devrait être corrigé)
| # | Fichier | Problème |
|---|---------|----------|
| 3 | `sessions.py:108-158` | N+1 file reads (3x par session) |
| 4 | `sessions.py:49-70` | search_sessions N+1 reads |
| 5 | `insights.py:155-212` | Lit tous les JSONL en entier |
| 6 | `overview.py:59-93` | Pas de cache, lit tout à chaque requête |
| 7 | `main.py:376-381` | SPA serve_spa path traversal |
| 8 | `wiki.py:164-173` | Path traversal wiki page |
| 9 | `auth.py:44` | Timing attack sur token comparison |
| 10 | `backup.py:122-135` | Tar extraction path traversal insuffisante |
| 11 | `api_keys.py:763` | Variable `key_name` non définie (bug) |
| 12 | `claude_code.py:251-253` | Command injection via workdir dans tmux |
| 13 | Multiple | Exceptions avalées silencieusement (15+ locations) |
| 14 | Multiple | `_get_env_value` dupliqué 4 fois |
| 15 | Multiple | Body dict au lieu de Pydantic models (~20 endpoints) |
| 16 | `chat.py` + multiple | Erreurs retournées en 200 au lieu de 4xx |
| 17 | `sessions.py:98` | Pas de pagination sur list_sessions |
| 18 | `env_vars.py:69-98` | Pas de validation des noms de variables |
| 19 | `main.py` + `terminal.py` | WebSocket terminal dupliqué |
| 20 | Multiple | Duplication _save_env_value / _load_yaml_config |

### P2 — Nice-to-have
| # | Fichier | Problème |
|---|---------|----------|
| 21 | `main.py:103` | Rate limit memory leak |
| 22 | Multiple | Sync file I/O dans async handlers |
| 23 | `api_keys.py`, `chat.py` | httpx.AsyncClient recréé chaque requête |
| 24 | Multiple | Imports inline (__import__, import dans fonctions) |
| 25 | Multiple | logger non utilisé dans certains modules |
| 26 | `main.py:217-222` | CSP allow unsafe-inline |
| 27 | Multiple | Réponses d'erreur CLI inconsistantes |
| 28 | `chat.py:230` | Duplication endpoint sessions |

---

## POINTS FORTS

1. **Auth middleware propre** — ASGI middleware qui contourne le bug BaseHTTPMiddleware + HTTPException
2. **Path traversal protection** dans `files.py` et `memory.py` avec resolve() + startswith()
3. **Rate limiting sliding window** fonctionnel avec headers Retry-After et X-RateLimit-Remaining
4. **Structured logging** avec request IDs, timing, et audit trail pour mutations
5. **Security headers** — X-Content-Type-Options, X-Frame-Options, CSP, X-XSS-Protection
6. **Atomic writes** — Les fichiers critiques (.env, metadata.jsonl) utilisent tmp + os.replace()
7. **Body size limit** — 10 MB max avec vérification Content-Length
8. **Input validation Claude Code** — SESSION_NAME_RE regex, _validate_workdir, MAX_MSG_LEN
9. **Secret masking** — `mask_secrets()` et `_mask_value()` dans utils.py
10. **SSE streaming** bien implémenté pour fine_tune, claude_code, gateway logs, chat

---

## RECOMMANDATIONS PRIORITAIRES

1. **Corriger l'auth du WebSocket** (P0) — DANGER IMMEDIAT
2. **Centraliser les utilitaires dupliqués** dans utils.py (P1)
3. **Ajouter Pydantic models** pour tous les body (P1) 
4. **Ajouter caching** sur les endpoints qui lisent config/sessions (P1)
5. **Corriger les path traversals restants** (P1)
6. **Remplacer les `except Exception: pass`** par du logging (P1)
