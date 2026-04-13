# Audit Complet Hermes Dashboard — 2026-04-09

## Résumé Exécutif

**Score global : 5.8/10**

Le Hermes Dashboard est un projet fonctionnel avec une architecture globalement cohérente, mais qui présente **3 vulnérabilités critiques de sécurité**, des risques de corruption de données sur le backlog, et plusieurs problèmes de qualité à adresser en priorité.

### Top 3 Problèmes Critiques
1. **Injection de commande via backlog `run` endpoint** — `subprocess.run` avec interpolation de chaîne non échappée dans `tmux send-keys`
2. **API accessible sans authentification** — `HERMES_DASHBOARD_TOKEN` vide dans `.env`, l'API écoute en clair sur `localhost:3100` sans HTTPS
3. **Fuite de secrets via l'API `/api/env-vars/list`** — le champ `raw_value` expose les API keys et tokens non masqués

## Scores

| Catégorie | Score /10 | Critique |
|-----------|-----------|----------|
| 1. Sécurité | 4.0 | 3 critiques, 4 majeurs, 4 mineurs |
| 2. Backend | 6.0 | Architecture solide, race conditions backlog |
| 3. Frontend | 5.5 | Bonne structure, pas de TS, couverture tests faible |
| 4. Infrastructure | 6.5 | systemd correct, pas de HTTPS, pas de monitoring |
| 5. Code Quality | 5.5 | Pas de linter Python, pas de TS, Vite vulnérable |
| 6. Fonctionnel | 7.5 | Terminal fonctionnel, backlog opérationnel |

---

## 1. Sécurité

### Critique

**[SEC-01] Injection de commande dans le endpoint `/api/backlog/{item_id}/run`**
- **Fichier** : `backend/app/routers/backlog.py:840`
- **Code** :
  ```python
  subprocess.run(["tmux", "send-keys", "-t", session_name,
      "/root/.local/bin/claude -p \"" + task_prompt.replace('"', '\\"') + "\"", "Enter"])
  ```
- **Risque** : Le `task_prompt` est construit à partir du `title` et `description` d'un item backlog (contrôlés par l'utilisateur). L'échappement ne gère que les guillemets doubles, mais les sauts de ligne, backticks, `$()`, et autres caractères spéciaux du shell ne sont pas filtrés. Un utilisateur peut injecter des commandes arbitraires via un titre malveillant.
- **Recommandation** : Utiliser `subprocess.run` avec une liste d'arguments séparés au lieu d'une chaîne interpolée, ou passer le prompt via un fichier temporaire/stdin.

**[SEC-02] API accessible sans authentification (token vide)**
- **Fichier** : `.env` ligne 1 → `DASHBOARD_TOKEN=` (vide)
- **Code** : `backend/app/auth.py:15-16` — `if not DASHBOARD_TOKEN: return True`
- **Risque** : L'ensemble des 120+ endpoints API sont accessibles sans token. Le backend écoute sur `127.0.0.1:3100` en HTTP sans chiffrement. Toute application locale peut lire/écrire la configuration, exécuter des commandes, accéder aux sessions et secrets.
- **Recommandation** : Définir `HERMES_DASHBOARD_TOKEN` avec un token fort dans `.env` immédiatement.

**[SEC-03] Fuite de secrets via `/api/env-vars/list`**
- **Fichier** : `backend/app/routers/env_vars.py:107`
- **Code** : `"raw_value": value,` — retourne la valeur complète non masquée
- **Risque** : L'endpoint retourne les valeurs brutes de toutes les variables d'environnement (API keys, tokens Telegram, etc.) dans le champ `raw_value`, même si le champ `value` est masqué. Tout client pouvant atteindre l'API peut extraire tous les secrets.
- **Recommandation** : Supprimer le champ `raw_value` de la réponse API, ou le conditionner à un rôle admin spécifique.

### Majeur

**[SEC-04] CORS permissif (`allow_origins=["*"]`)**
- **Fichier** : `backend/app/main.py:92-97`
- **Code** : `allow_origins=["*"]`, `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`
- **Risque** : N'importe quel site web peut faire des requêtes cross-origin vers l'API. Combiné avec `allow_credentials=True`, cela permet le vol de tokens via XSS.
- **Recommandation** : Restreindre `allow_origins` aux domaines du dashboard uniquement.

**[SEC-05] API key LLM hardcodée dans config.yaml**
- **Fichier** : `/root/.hermes/config.yaml` — `model.api_key: 46d7a8dc4db54343bd4bb4acd1551be7.obTx4AzW8b8codpm`
- **Risque** : La clé API du modèle LLM est stockée en clair dans le fichier YAML. Le fichier n'est pas dans `.gitignore` du repo hermes-agent et est lisible via l'endpoint `/api/config`.
- **Recommandation** : Référencer une variable d'environnement au lieu de hardcoder la clé.

**[SEC-06] Absence de HTTPS / certificat SSL**
- **Fichier** : Nginx config — `listen 80;` uniquement
- **Risque** : Le dashboard est servi en HTTP uniquement. Les tokens transmis sont en clair sur le réseau. Pas de certificat Let's Encrypt configuré.
- **Recommandation** : Configurer certbot/Let's Encrypt et activer HTTPS.

**[SEC-07] CSP permissif avec `unsafe-inline`**
- **Fichier** : `backend/app/main.py:232-238` et nginx config
- **Code** : `script-src 'self' 'unsafe-inline'` et `style-src 'self' 'unsafe-inline'`
- **Risque** : Autorise l'exécution de scripts inline, ce qui réduit significativement la protection XSS offerte par CSP.
- **Recommandation** : Utiliser des nonces ou hashes CSP au lieu de `unsafe-inline`.

### Mineur

**[SEC-08] Token stocké dans `localStorage` côté client**
- **Fichier** : `frontend/src/api.js:3` — `localStorage.getItem('hermes_token')`
- **Risque** : Le token est accessible via XSS. Un cookie httpOnly+secure serait plus sûr.
- **Recommandation** : Migrer vers un cookie httpOnly pour le stockage du token.

**[SEC-09] Logs d'audit dans `/tmp` (non persistant)**
- **Fichier** : `backend/app/main.py:59` — `AUDIT_LOG_PATH = Path("/tmp/dashboard-audit.log")`
- **Risque** : Les logs d'audit sont perdus au reboot. Ils devraient être dans `/var/log/`.
- **Recommandation** : Déplacer dans `/var/log/hermes/` avec rotation logrotate.

**[SEC-10] `server_tokens on` dans nginx**
- **Fichier** : `/etc/nginx/nginx.conf` — `# server_tokens off;` (commenté)
- **Recommandation** : Décommenter `server_tokens off;` pour masquer la version nginx.

**[SEC-11] Path traversal possible via symlinks dans `/api/files`**
- **Fichier** : `backend/app/routers/files.py:39-42`
- **Code** : `resolved = (HERMES_HOME_RESOLVED / rel_path).resolve()` puis `startswith` check
- **Risque** : Si un symlink dans HERMES_HOME pointe vers l'extérieur, `resolve()` suit le lien et le check `startswith` passe car le chemin résolu est en dehors.
- **Recommandation** : Utiliser `os.path.commonpath` ou vérifier que chaque composant du chemin n'est pas un symlink pointant vers l'extérieur.

**[SEC-12] Service exécuté en tant que root**
- **Fichier** : `/etc/systemd/system/hermes-dashboard.service` — `User=root`
- **Risque** : Le processus FastAPI (incluant le terminal WebSocket root shell) tourne en root. Toute vulnérabilité = accès root complet.
- **Recommandation** : Créer un utilisateur dédié `hermes` avec permissions limitées.

**[SEC-13] Permissions `.env` trop ouvertes**
- **Fichier** : `/root/hermes-dashboard/.env` — permissions `644` (rw-r--r--)
- **Risque** : Le fichier contient le token d'authentification et est lisible par tout utilisateur système.
- **Recommandation** : `chmod 600 /root/hermes-dashboard/.env`

---

## 2. Backend (FastAPI)

### Critique

**[BE-01] Race condition sur le fichier `backlog.json`**
- **Fichier** : `backend/app/routers/backlog.py` — `_read_backlog()` / `_write_backlog()`
- **Risque** : Bien que `fcntl.flock` soit utilisé pour les lectures/écritures individuelles, le pattern read-modify-write n'est pas atomique. Entre `_read_backlog()` et `_write_backlog()`, un autre handler peut modifier le fichier. Le cron `auto-check` et les requêtes API peuvent entrer en conflit.
- **Recommandation** : Implémenter un verrou global au niveau de l'opération (pas juste du fichier), ou migrer vers SQLite.

**[BE-02] Injection de commande confirmée** (voir SEC-01)

**[BE-03] Écriture backlog non atomique (write-then-rename manquant)**
- **Fichier** : `backend/app/routers/backlog.py:42-47`
- **Code** : `json.dump(data, f, indent=2, ensure_ascii=False)` directement dans le fichier cible
- **Risque** : Si le processus crash pendant `json.dump`, le fichier `backlog.json` est corrompu (partiellement écrit). Le lock fichier ne protège pas contre ça.
- **Recommandation** : Écrire dans un fichier temporaire `.tmp`, puis `os.rename()` atomique vers le fichier final.

### Majeur

**[BE-03] Endpoint `/api/config` expose le YAML brut avec secrets**
- **Fichier** : `backend/app/routers/config.py:27-35`
- **Risque** : `GET /api/config` retourne le contenu brut de `config.yaml` incluant les clés API.
- **Recommandation** : Masquer les champs sensibles dans la réponse.

**[BE-04] Pas de pagination sur les endpoints de liste**
- **Fichiers** : `/api/sessions`, `/api/backlog`, `/api/chat/sessions`, etc.
- **Risque** : `GET /api/sessions` retourne les 1445 sessions sans pagination. Problème de performance qui va s'aggraver.
- **Recommandation** : Ajouter `limit`/`offset` à tous les endpoints de liste.

**[BE-05] Erreurs retournent des messages potentiellement sensibles**
- **Fichier** : `backend/app/routers/chat.py:167` — `f"Gateway error {resp.status_code}: {resp.text[:300]}"`
- **Risque** : Les messages d'erreur internes (stack traces, URLs internes, etc.) peuvent fuir vers le client.
- **Recommandation** : Logger les détails côté serveur, retourner des messages génériques au client.

**[BE-06] `__import__` inline au lieu d'imports normaux**
- **Fichiers** : `chat.py:108,126`, `backup.py:20-21`
- **Risque** : Mauvaise pratique, difficile à maintenir et à auditer statiquement.
- **Recommandation** : Utiliser des imports normaux en tête de fichier.

**[BE-07] Plusieurs routers dépassent 700-1000 lignes**
- **Fichiers** : `api_keys.py` (943), `memory.py` (1022), `backlog.py` (990), `config.py` (804)
- **Recommandation** : Extraire la logique métier dans des services dédiés.

### Mineur

**[BE-08] Pas de validation Pydantic sur certains endpoints**
- **Fichiers** : `chat.py` utilise `request.json()` au lieu de modèles Pydantic
- **Recommandation** : Utiliser des modèles Pydantic pour tous les payloads entrants.

**[BE-09] `requirements.txt` minimal (7 dépendances)**
- **Fichier** : `backend/requirements.txt`
- **Risque** : Pas de versions pinées pour `pyyaml`, `httpx`. Pas de `pip-audit` en CI.
- **Recommandation** : Épingler toutes les versions et ajouter un audit de sécurité des dépendances.

**[BE-10] Pas de health check complet**
- **Fichier** : `backend/app/main.py:243-245` — `{"status": "ok"}` basique
- **Recommandation** : Vérifier la connexion gateway, l'état des fichiers, etc.

---

## 3. Frontend (React)

### Majeur

**[FE-01] Bundle total de 1.5 MB (non compressé)**
- **Fichier** : `backend/static/` — 1.5 MB de JS/CSS
- **Risque** : Temps de chargement initial élevé sur connexions lentes.
- **Note** : Le lazy loading est bien implémenté (23/27 pages en lazy). Le bundle principal reste gros.
- **Recommandation** : Analyser avec `rollup-plugin-visualizer`, identifier les gros chunks.

**[FE-02] Seulement 8 fichiers de test, couverture très faible**
- **Fichiers** : `frontend/src/__tests__/` — 8 tests
- **Tests existants** : `NotFound`, `ConfirmModal`, `ToastContext`, `api`, `ErrorBoundary`, `App`, `format`, `ThemeContext`
- **Seuils définis** : 30% lignes, 30% fonctions, 20% branches
- **Risque** : Aucun test sur les 27 pages principales, les hooks API, ou le WebSocket.
- **Recommandation** : Ajouter des tests d'intégration pour les pages critiques (Terminal, Backlog, Config).

**[FE-03] Pas de TypeScript**
- **Fichiers** : Tout le frontend est en `.jsx`/`.js` pur
- **Risque** : Pas de vérification statique des types, erreurs à l'exécution possibles.
- **Recommandation** : Migrer progressivement vers TypeScript.

**[FE-04] State global via Context uniquement**
- **Fichiers** : `contexts/ThemeContext.jsx`, `contexts/ToastContext.jsx`
- **Risque** : Pas de state management global pour les données API. Chaque page refetch ses données indépendamment.
- **Note** : `@tanstack/react-query` est listé dans les dépendances mais son utilisation réelle dans les pages est à vérifier.

### Mineur

**[FE-05] `useWebSocket` auto-connect au niveau App**
- **Fichier** : `frontend/src/App.jsx:99` — `useWebSocket()` dans le composant App
- **Risque** : La connexion WS est établie même pour les pages qui n'en ont pas besoin.

**[FE-06] Pas de Error Boundary par page**
- **Fichier** : `ErrorBoundary.jsx` existe mais n'englobe pas les Routes individuellement
- **Risque** : Une erreur dans une page crash tout le dashboard au lieu d'afficher un fallback.
- **Recommandation** : Wrapper chaque Route dans un ErrorBoundary.

**[FE-07] Accessibilité minimale**
- **Points positifs** : `aria-label` sur le bouton menu, `role="navigation"`, `role="main"`
- **Manquants** : Pas de skip-link, pas de focus management sur navigation, pas de contrast checking automatisé.

**[FE-08] Duplication d'API calls dans `api.js`**
- **Fichier** : `frontend/src/api.js`
- **Risque** : De nombreuses méthodes dupliquées (ex: `listPairing` défini 2 fois, `authPairingList` alias, `pluginsList` alias). Le fichier fait 290+ lignes de méthodes.
- **Recommandation** : Nettoyer les aliases et consolider.

---

## 4. Infrastructure

### Majeur

**[INF-01] Pas de HTTPS — port 80 uniquement**
- **Fichier** : `/etc/nginx/sites-enabled/*` — `listen 80;`
- **Risque** : Toutes les communications (incluant tokens, terminal I/O) transitent en clair.
- **Recommandation** : Installer certbot, configurer HTTPS avec redirect HTTP → HTTPS.

**[INF-02] Pas de monitoring ni alerting**
- **Risque** : Aucun système de surveillance (Prometheus, Grafana, etc.). Les pannes passent inaperçues.
- **Recommandation** : Ajouter au minimum un health check externe (UptimeRobot, etc.) et une alerte email/Telegram.

**[INF-03] Logs d'audit dans `/tmp`**
- **Fichiers** : `/tmp/dashboard-audit.log`, `/tmp/dashboard-terminal.log`, `/tmp/backlog-autofeed.log`, etc.
- **Risque** : Perdus au reboot. Pas de rotation via logrotate.
- **Recommandation** : Configurer `/etc/logrotate.d/hermes-dashboard` pour les logs applicatifs.

**[INF-04] Cron scripts sans gestion d'erreurs robuste**
- **Fichier** : `crontab -l` — 6 cron jobs
- **Risque** : Les scripts (ex: `backlog-autofeed.sh`, 687 lignes) sont complexes mais s'exécutent sans lock file. Deux exécutions simultanées du cron autofeed peuvent corrompre le backlog.
- **Recommandation** : Ajouter `flock -n /tmp/backlog-autofeed.lock` dans le cron.

### Mineur

**[INF-05] `hermes-gateway.service` en mode user, consommation mémoire élevée**
- **Fichier** : `~/.config/systemd/user/hermes-gateway.service`
- **État** : 1.3 GB mémoire, 132 tasks, 7 sous-processus MCP
- **Recommandation** : Ajouter `MemoryHigh=2G` et `MemoryMax=3G` dans le service.

**[INF-06] Pas de backup automatisé du backlog.json et config.yaml**
- **Risque** : Corruption de `backlog.json` = perte de toutes les tâches.
- **Recommandation** : Ajouter un cron de backup quotidien.

**[INF-07] `nginx.conf` : `server_tokens` activé**
- **Recommandation** : Ajouter `server_tokens off;` dans le bloc http.

---

## 5. Code Quality

### Majeur

**[CQ-01] Vulnérabilité Vite haute sévérité**
- **npm audit** : `vite 8.0.0 - 8.0.4` — 3 vulnérabilités (Path Traversal, Arbitrary File Read)
- **Recommandation** : Mettre à jour Vite vers `>=8.0.5` avec `npm audit fix`.

**[CQ-02] Frontend en JavaScript pur, pas de TypeScript**
- **Risque** : Pas de vérification de types statique. Erreurs de typo/props silencieuses.
- **Recommandation** : Migrer progressivement vers `.tsx`.

**[CQ-03] Fichiers routers trop volumineux**
- `memory.py` : 1022 lignes, `api_keys.py` : 943 lignes, `backlog.py` : 990 lignes
- **Recommandation** : Extraire les services métier dans des modules séparés.

### Mineur

**[CQ-04] Pas de linter Python configuré**
- **Recommandation** : Ajouter ruff ou flake8 dans le workflow.

**[CQ-05] Imports inline (`__import__`)**
- **Fichiers** : `chat.py:108`, `chat.py:126`, `backup.py:20-21`
- **Recommandation** : Remplacer par des imports normaux en tête de fichier.

**[CQ-06] Pas de documentation API hors Swagger auto-généré**
- **Recommandation** : Documenter les endpoints critiques dans un README ou wiki.

**[CQ-07] `requirements.txt` minimal**
- **Risque** : Pas de versions pinées pour certaines dépendances.
- **Recommandation** : Utiliser `pip-compile` pour verrouiller les versions.

---

## 6. Fonctionnel

### Tests effectués

| Test | Résultat | Détail |
|------|----------|--------|
| `GET /api/health` | OK | `{"status":"ok"}` en 3ms |
| `GET /api/overview` | OK | Gateway running, 1445 sessions, Telegram+Feishu connectés |
| `GET /api/backlog` | OK | Items retournés avec filtres |
| `POST /api/backlog` (création) | OK | Item créé et supprimé avec succès |
| `DELETE /api/backlog/{id}` | OK | Suppression fonctionnelle |
| `GET /api/config` | OK | Retourne config + raw_yaml |
| Services systemd | OK | Dashboard actif (51.5 MB), Gateway actif (1.3 GB) |
| WebSocket /ws/hub | OK | Client authentifié au démarrage |
| Auto-check | OK | Polling toutes les 3s fonctionnel |
| Auto-feed | OK | 2/3 candidats acceptés lors du test |
| Crons | OK | Auto-deploy, stagnation-killer, health-monitor, autofeed, wiki |
| Terminal WS | Non testé | Requiert token configuré |

### Points positifs fonctionnels
- Le backlog CRUD est complet et opérationnel
- L'auto-feed via LLM fonctionne avec fallback robuste (pre-filter → dedup → LLM validation)
- Le watchdog tmux pour les sessions Claude Code est fiable (process tree check)
- Le WebSocket hub gère correctement la reconnexion et l'authentification
- L'audit trail des mutations est en place

### Problèmes fonctionnels

**[FN-01] `backlog-autofeed.sh` ne lock pas contre les exécutions concurrentes**
- Le cron tourne toutes les 2h mais si une exécution dépasse 2h, deux instances peuvent tourner simultanément.
- **Recommandation** : Ajouter `flock -n` dans le crontab.

**[FN-02] Cerebras timeout dans l'autofeed**
- **Logs** : `Apr 09 22:08:44 ... timeout 60 /root/.hermes/scripts/backlog-autofeed.sh 2>&1 echo "EXIT: $?"  15.5s`
- **Recommandation** : Augmenter le timeout ou ajouter un fallback Mistral dans le script.

**[FN-03] Gateway utilise 1.3 GB de RAM**
- 7 sous-processus MCP contribuent significativement à la consommation.
- **Recommandation** : Évaluer si tous les serveurs MCP sont nécessaires en permanence.

---

## Tickets proposés

| # | Titre | Priorité | Catégorie | Effort |
|---|-------|----------|-----------|--------|
| 1 | Fix injection de commande dans backlog `run` endpoint | critique | securite | petit |
| 2 | Configurer HERMES_DASHBOARD_TOKEN dans .env | critique | securite | petit |
| 3 | Supprimer raw_value de /api/env-vars/list | critique | securite | petit |
| 4 | Restreindre CORS aux domaines du dashboard | majeur | securite | petit |
| 5 | Configurer HTTPS avec Let's Encrypt | majeur | infrastructure | moyen |
| 6 | Refactoriser l'appel tmux send-keys (shlex.quote ou stdin) | critique | securite | petit |
| 7 | Extraire l'API key du config.yaml vers une variable d'environnement | majeur | securite | petit |
| 8 | Rendre le read-modify-write du backlog atomique | majeur | backend | moyen |
| 9 | Masquer les champs sensibles dans GET /api/config | majeur | securite | petit |
| 10 | Ajouter flock aux cron jobs (backlog-autofeed, wiki-lint) | majeur | infrastructure | petit |
| 11 | Ajouter pagination aux endpoints de liste (sessions, backlog) | majeur | backend | moyen |
| 12 | Configurer logrotate pour les logs hermes | majeur | infrastructure | petit |
| 13 | Mettre à jour Vite >= 8.0.5 | majeur | codequality | petit |
| 14 | Ajouter Error Boundaries par page | mineur | frontend | petit |
| 15 | Augmenter la couverture de tests frontend | mineur | frontend | grand |
| 16 | Nettoyer les méthodes dupliquées dans api.js | mineur | frontend | petit |
| 17 | Remplacer les __import__ par des imports normaux | mineur | codequality | petit |
| 18 | Ajouter MemoryHigh/MemoryMax au service hermes-gateway | mineur | infrastructure | petit |
| 19 | Décommenter server_tokens off dans nginx.conf | mineur | infrastructure | petit |
| 20 | Ajouter un backup quotidien de backlog.json | mineur | infrastructure | petit |
| 21 | Protéger files.py contre les symlinks hors de HERMES_HOME | majeur | securite | petit |
| 22 | Écriture backlog atomique (write-to-tmp + rename) | majeur | backend | petit |
| 23 | Créer un utilisateur dédié (non-root) pour le service | majeur | infrastructure | moyen |
| 24 | Restreindre les permissions .env à 600 | mineur | securite | petit |
| 25 | Ajouter un linter Python (ruff/flake8) | mineur | codequality | petit |
| 26 | Configurer un monitoring basique (health check externe) | majeur | infrastructure | petit |

---

## Détails techniques des endpoints API (120+ endpoints audités)

### Endpoints les plus sensibles (accès root shell / secrets)
- `POST /api/backlog/{id}/run` — Exécute des commandes via tmux (injection possible)
- `GET /api/env-vars/list` — Expose les secrets en clair via `raw_value`
- `GET /api/config` — Expose le YAML brut avec API key
- `WS /ws/terminal` — Shell root interactif (correctement sécurisé si token configuré)
- `PUT /api/files/write` — Écriture de fichiers dans HERMES_HOME
- `POST /api/plugins/install` — Installation de plugins depuis une URL arbitraire

### Points positifs de sécurité
- Auth middleware ASGI bien implémenté (pas de BaseHTTPMiddleware)
- WebSocket terminal : double auth (middleware + premier message), timeout inactivité 30 min, logging complet
- Rate limiting en place avec sliding window (60 req/min par défaut, 5-20 pour les endpoints sensibles)
- Body size limit à 10 MB
- Headers de sécurité présents (X-Content-Type-Options, X-Frame-Options, HSTS)
- Path traversal protégé dans files.py via `resolve()` + `startswith()`
- Validation des clés env via allowlist + regex
- Audit trail des mutations (POST/PUT/DELETE)
- File locking `fcntl.flock` sur backlog.json
- Nginx avec auth_basic (htpasswd) en frontal
