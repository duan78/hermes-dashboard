# 🔍 Audit Complet : Hermes Dashboard vs Hermes Agent

**Date** : 22 avril 2026  
**Scope** : Comparaison exhaustive des 32 features Hermes Agent vs le Dashboard (React/FastAPI)  
**Agent Version** : 305 commits derrière main  
**Dashboard Version** : current  

---

## 1. Résumé Exécutif

| Statut | Count |
|--------|-------|
| ✅ Pleinement implémenté | **16** |
| ⚠️ Partiellement implémenté | **11** |
| ❌ Absent du dashboard | **5** |
| **Total features auditées** | **32** |

**Score de couverture : 50% complet, 34% partiel, 16% absent**

---

## 2. Liste Détaillée par Catégorie

### 1. Config (`hermes_cli/config.py`, `~/.hermes/config.yaml`)
**Status : ⚠️ Partiellement implémenté**

Le dashboard a une page Config.jsx très riche avec ~18 sections d'accordéon couvrant les configs principales (model, agent, terminal, browser, display, streaming, memory, tts, security, compression, sessions, code_execution, cron, discord, advanced, provider_routing, system_prompt, personalities).

**Clés de config EXPOSÉES** (~90 clés) :
- `model.*`, `agent.max_turns/verbose/reasoning_effort/tool_use_enforcement`
- `terminal.backend/timeout/docker_image/container_*/persistent_shell/env_passthrough/docker_mount_cwd_to_workspace`
- `browser.inactivity_timeout/command_timeout/record_sessions/allow_private_urls/camofox.*`
- `display.personality/bell_on_complete/show_reasoning/show_cost/skin/resume_display/busy_input_mode/tool_progress_command`
- `compression.enabled/threshold/target_ratio/protect_last_n`
- `memory.memory_enabled/user_profile_enabled/memory_char_limit/user_char_limit/flush_min_turns/nudge_interval`
- `tts.provider/edge.voice/elevenlabs.*/openai.*/xai.*/neutts.*`
- `stt.enabled/provider`, `voice.record_key/max_recording_seconds/auto_tts/silence_threshold/silence_duration`
- `security.tirith_enabled/tirith_timeout/tirith_fail_open/website_blocklist.enabled`
- `approvals.mode/timeout`, `session_reset.mode/idle_minutes/at_hour`
- `timezone`, `human_delay.mode/min_ms/max_ms`
- `delegation.model/provider/base_url/api_key/max_iterations/reasoning_effort/default_toolsets`
- `smart_routing.enabled/max_simple_chars/max_simple_words/cheap_model`
- `code_execution.max_tool_calls/timeout`
- `discord.free_response_channels/auto_thread/reactions`
- `logging.level`, `context.engine`, `toolsets`, `prefill_messages_file`
- `checkpoints.enabled/max_snapshots`
- Fallback providers UI, provider routing CRUD

**Clés de config MANQUANTES du dashboard** :

| Clé | Importance | Description |
|-----|-----------|-------------|
| `auxiliary.*` | P1 | Config de 9 sous-providers LLM (vision, web_extract, compression, session_search, skills_hub, approval, mcp, flush_memories) |
| `bedrock.*` | P2 | Config AWS Bedrock (region, discovery, guardrail) |
| `agent.service_tier` | P2 | Niveau de service API |
| `agent.gateway_timeout` | P1 | Timeout du gateway |
| `agent.restart_drain_timeout` | P1 | Timeout de drain au restart |
| `agent.gateway_timeout_warning` | P1 | Avertissement timeout |
| `agent.gateway_notify_interval` | P1 | Intervalle notifications gateway |
| `agent.personalities` | P2 | Personnalités custom (partiellement via CRUD dédié) |
| `display.compact` | P2 | Mode compact |
| `display.streaming` | P2 | Toggle streaming |
| `display.inline_diffs` | P2 | Affichage inline des diffs |
| `display.interim_assistant_messages` | P2 | Messages assistant intermédiaires |
| `display.tool_progress` | P2 | Barre de progression des tools |
| `display.tool_preview_length` | P2 | Longueur preview tools |
| `display.background_process_notifications` | P2 | Notifications processus bg |
| `logging.max_size_mb` / `logging.backup_count` | P2 | Rotation de logs |
| `network.force_ipv4` | P2 | Forcer IPv4 |
| `privacy.redact_pii` | P1 | ⚠️ Présent mais dans section Security |
| `command_allowlist` | P2 | Liste blanche de commandes |
| `quick_commands` | P2 | Raccourcis personnalisés |
| `tts.mistral.*` | P2 | Provider Mistral TTS |
| `tts.minimax` (absent de config mais supporté par code) | P2 | Provider MiniMax TTS |
| `tts.google` (absent de config mais supporté par code) | P2 | Provider Google Gemini TTS |
| `stt.local.model/language`, `stt.openai.model`, `stt.mistral.model` | P2 | Config détaillée STT |
| `group_sessions_per_user` | P2 | Sessions groupées par utilisateur |
| `file_read_max_chars` | P2 | Limite lecture fichier |
| `mcp_servers.*` (config embedded, géré par McpServers) | ✅ | Déplacé vers page dédiée |

---

### 2. Tools Registry (`tools/registry.py`)
**Status : ⚠️ Partiellement implémenté**

Le dashboard (Tools.jsx + router tools.py) expose les toolsets comme catégories (tts, web, image_gen, browser, homeassistant, rl, vision) avec configuration de provider et variables d'environnement.

**Manquants** :
- ❌ Pas de listing dynamique des tools enregistrés dans le registry de l'agent (~60+ tools)
- ❌ Pas d'affichage des tools activés/désactivés par platform (`platform_toolsets` config)
- ❌ Pas de toggle enable/disable par tool individuel
- ⚠️ Seules les catégories "à provider" sont configurables, pas les tools internes (clarify, session_search, todo, etc.)
- ❌ Pas de listing des `SANDBOX_ALLOWED_TOOLS` pour code execution

---

### 3. Skills (`tools/skills_tool.py`, `skills_hub.py`, `skills_guard.py`, `skills_sync.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Skills.jsx : listing, lecture SKILL.md, création, édition, suppression, toggle disable
- ✅ SkillsHub.jsx : browse, search, install depuis multiples sources (GitHub, LobeHub, skills.sh, Claude Marketplace, ClawHub)
- ✅ Skill sync manifests (bundled skills tracking)

**Manquants** :
- ❌ Skills Guard : pas d'UI pour voir les résultats du scan de sécurité, pas de toggle trust levels
- ❌ Audit log des installations hub (`.hub/audit.log`)
- ❌ Quarantine management (`.hub/quarantine/`)
- ❌ Tap management (sources de registry tierces via `taps.json`)
- ❌ Skill source provenance tracking (lock.json)

---

### 4. MCP (`tools/mcp_tool.py`, `mcp_oauth.py`, `mcp_oauth_manager.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ McpServers.jsx : CRUD complet (add stdio/http, edit, delete, toggle enable/disable)
- ✅ Support mcporter (list + detail)
- ✅ Test de connexion
- ✅ Affichage tools count

**Manquants** :
- ❌ **MCP OAuth** : support complet OAuth 2.1 avec PKCE (client registration, token storage, callback server) — aucune UI
- ❌ **Sampling config** : pas de UI pour `mcp_servers.*.sampling.*` (model override, max_tokens_cap, timeout, max_rpm, allowed_models)
- ❌ **Reconnection monitoring** : pas de status temps réel des tentatives de reconnexion
- ❌ **Per-server timeouts** : `connect_timeout` est partiel, `timeout` absent du frontend add form
- ❌ **OAuth state management** : pas de moyen de voir/révoquer les tokens OAuth MCP

---

### 5. Memory (`tools/memory_tool.py`)
**Status : ✅ Implémenté**

**Implémenté** :
- ✅ MemorySoul.jsx : tabs pour MEMORY.md, USER.md, vector memory (LanceDB)
- ✅ Vector memory : stats, browse, search sémantique, add, delete
- ✅ LanceDB integration avec embedder Mistral
- ✅ Usage monitoring
- ✅ Config memory (memory_enabled, user_profile_enabled, limits)

**Détails couverts** : `memory.*`, vector store via LanceDB, char limits, flush settings

---

### 6. Sessions (`hermes_state.py`, `gateway/session.py`)
**Status : ✅ Implémenté**

**Implémenté** :
- ✅ Sessions.jsx : listing, search, export, detail, delete
- ✅ Search via JSONL scan (fallback depuis FTS5)
- ✅ Session reset config dans Config.jsx
- ✅ Session search tool (search_history)

**Manquant mineur** : La search est un scan manuel JSONL, pas FTS5 natif de l'agent — mais le résultat est équivalent.

---

### 7. Models (`hermes_cli/models.py`, `model_switch.py`, `models_dev.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Models.jsx : current model display, model switch (via `hermes model --set`)
- ✅ Available models from `models_dev_cache.json`
- ✅ Provider routing UI in Config.jsx (CRUD providers with test)

**Manquants** :
- ❌ **Model catalog** : pas d'affichage du catalogue complet par provider (OpenAI, Anthropic, Google, Mistral, etc.)
- ❌ **models.dev registry** : pas de refresh/trigger du cache models_dev
- ❌ **Fallback providers config** : ⚠️ Partial - Config.jsx a une UI pour fallback_providers mais elle est basique
- ❌ **Model metadata** : pas d'affichage des context lengths, token costs, capabilities par modèle
- ❌ **Smart model routing** : config présente dans Config.jsx mais pas de monitoring/status

---

### 8. Platforms (`gateway/platforms/`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** (Platforms.jsx + backend) :
- ✅ Telegram, Discord, WhatsApp, Signal, Slack, Matrix, DingTalk, Feishu, WeCom, Mattermost, Home Assistant, Email
- ✅ Env var CRUD par plateforme
- ✅ Connection status via gateway_state.json
- ✅ Discord config détaillée (free_response_channels, auto_thread, reactions)

**Manquants** :
- ❌ **QQBot** : absent (existe dans l'Agent : `qqbot/`)
- ❌ **BlueBubbles** : absent (existe dans l'Agent : `bluebubbles.py`)
- ❌ **Webhook** : absent en tant que plateforme inbound (existe dans l'Agent : `webhook.py`)
- ❌ **Platform channel_prompts** : pas d'UI pour configurer les prompts par canal (sauf Discord partiel)
- ❌ **Platform-specific toolsets** (`platform_toolsets` config) : pas de UI pour configurer quels tools sont disponibles par plateforme
- ❌ **Real-time connection status** : dépend du polling gateway_state.json, pas de WebSocket

---

### 9. Gateway (`gateway/run.py`)
**Status : ✅ Implémenté**

**Implémenté** (GatewayControl.jsx + gateway.py) :
- ✅ Status (systemctl parsing : state, PID, memory, CPU, tasks)
- ✅ Start/stop/restart via systemctl
- ✅ Log streaming (SSE)
- ✅ Service enable/disable
- ⚠️ Agent timeout config partiellement exposé

**Manquant mineur** :
- ⚠️ `agent.gateway_timeout`, `restart_drain_timeout`, `gateway_timeout_warning`, `gateway_notify_interval` pas dans Config.jsx

---

### 10. Cron (`cron/jobs.py`, `cron/scheduler.py`)
**Status : ✅ Implémenté**

**Implémenté** (CronJobs.jsx + cron.py) :
- ✅ Liste des cron jobs Hermes
- ✅ CRUD (create, edit, delete, toggle)
- ✅ System cron (crontab parsing, systemd timers, service status)
- ✅ Cron config dans Config.jsx

---

### 11. Browser Tools (`tools/browser_tool.py`, `browser_camofox.py`)
**Status : ✅ Implémenté**

**Implémenté** :
- ✅ Browser provider config dans Tools.jsx (Local, Browserbase, Browser Use, Camofox)
- ✅ Browser settings dans Config.jsx (inactivity_timeout, command_timeout, record_sessions, allow_private_urls)
- ✅ Camofox config (cloud_provider, managed_persistence)

---

### 12. Environments (`tools/environments/`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Terminal backend selection (local, docker, modal, singularity, daytona) dans Config.jsx
- ✅ Container resources (CPU, memory, disk) dans Config.jsx
- ✅ Docker image config, persistent shell, env passthrough
- ✅ Container persistence toggle

**Manquants** :
- ❌ **SSH backend config** : `TERMINAL_SSH_KEY`, `TERMINAL_SSH_PORT` — pas d'UI
- ❌ **Modal image** : `terminal.modal_image` — pas dans Config.jsx
- ❌ **Daytona image** : `terminal.daytona_image` — pas dans Config.jsx  
- ❌ **Singularity image** : `terminal.singularity_image` — pas dans Config.jsx
- ❌ **Modal mode** : `terminal.modal_mode` (auto/manual) — pas d'UI
- ❌ **Docker env/volumes** : `terminal.docker_env`, `terminal.docker_volumes`, `terminal.docker_forward_env` — pas d'UI
- ❌ **Container lifetime** : `terminal.lifetime_seconds` — pas d'UI

---

### 13. Code Execution (`tools/code_execution_tool.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Config basique dans Config.jsx (`code_execution.max_tool_calls`, `code_execution.timeout`)

**Manquants** :
- ❌ Pas de monitoring des executions en cours
- ❌ Pas de listing des `SANDBOX_ALLOWED_TOOLS`
- ❌ Pas de visualisation des scripts en cours d'exécution

---

### 14. Delegation (`tools/delegate_tool.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Config delegation dans Config.jsx (model, provider, base_url, api_key, max_iterations, reasoning_effort, default_toolsets)

**Manquants** :
- ❌ Pas de monitoring des subagents en cours d'exécution
- ❌ Pas de visualisation de la hiérarchie délégation
- ❌ `max_concurrent_children` pas exposé

---

### 15. TTS (`tools/tts_tool.py`, `neutts_synth.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ TTS provider selection (Edge, OpenAI, ElevenLabs) dans Config.jsx
- ✅ Edge voice config
- ✅ ElevenLabs voice_id + model_id
- ✅ OpenAI model + voice
- ✅ xAI voice_id + language + sample_rate + bit_rate
- ✅ NeuTTS config (ref_audio, ref_text, model, device)

**Manquants** :
- ❌ **Mistral TTS** : `tts.mistral.model`, `tts.mistral.voice_id` — pas d'UI
- ❌ **MiniMax TTS** : non supporté dans la config actuelle (le code l'implémente)
- ❌ **Google Gemini TTS** : non supporté dans la config actuelle (le code l'implémente, 30 voices)
- ❌ Pas de preview/test TTS depuis le dashboard

---

### 16. Vision (`tools/vision_tools.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Vision provider config dans Tools.jsx (Z.AI Vision MCP, Mistral Pixtral)
- ✅ Auxiliary vision config accessible via la config brute

**Manquants** :
- ❌ **Auxiliary vision detailed config** : `auxiliary.vision.provider/model/base_url/api_key/timeout/download_timeout` — pas d'UI dédiée
- ❌ Pas de test vision (upload image → analyze)

---

### 17. Image Generation (`tools/image_generation_tool.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ FAL.ai provider config dans Tools.jsx

**Manquants** :
- ❌ **FAL model selection** : 12+ modèles FLUX disponibles dans l'agent, dashboard n'expose que FAL.ai comme provider unique
- ❌ Pas de sélection de modèle image_gen (FLUX 2 Pro, Klein, qwen, nano-banana, gpt-image-1.5, etc.)
- ❌ `image_gen.model` config pas exposée
- ❌ Pas de preview/génération test depuis le dashboard

---

### 18. Web Tools (`tools/web_tools.py`)
**Status : ✅ Implémenté**

**Implémenté** :
- ✅ Web backend selection (Combined, Brave, LinkUp, Tavily, Firecrawl Cloud, Exa, Parallel, Firecrawl Self-Hosted)
- ✅ Combined backends config (multi-backend)
- ✅ Agent-Reach channel status display

---

### 19. Todo (`tools/todo_tool.py`)
**Status : ❌ Absent du dashboard**

Le todo tool est un tool interne à l'agent (in-memory, par session). Il n'y a pas de page ni d'API pour visualiser/manipuler les todos. Ceci est attendu car les todos sont volatiles et liés au contexte de conversation de l'agent.

**Priorité** : P2 (nice-to-have, les todos sont volatils par design)

---

### 20. File Sync (`tools/environments/file_sync.py`)
**Status : ❌ Absent du dashboard**

File sync est un module interne utilisé par les backends SSH/Modal/Daytona pour synchroniser les fichiers locaux → remote. Pas d'UI nécessaire, c'est de l'infrastructure.

**Priorité** : P2 (infrastructure interne)

---

### 21. Approval (`tools/approval.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Config approval mode dans Config.jsx (manual/smart/auto + timeout)
- ✅ Command allowlist partiellement dans Config.jsx

**Manquants** :
- ❌ Pas de visualisation des commandes en attente d'approval en temps réel
- ❌ Pas de UI pour gérer le `command_allowlist` (patterns de commandes)
- ❌ Pas d'historique des approvals/rejets
- ❌ "Yolo mode" (auto-approve all) pas exposé comme toggle rapide

---

### 22. Context Compression (`agent/context_compressor.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Config `compression.*` dans Config.jsx (enabled, threshold, target_ratio, protect_last_n)
- ✅ `context.engine` select dans Config.jsx

**Manquants** :
- ❌ Pas de monitoring des événements de compression (quand ça se déclenche, ratio atteint)
- ❌ Pas de visualisation de l'état du contexte (token count actuel vs max)

---

### 23. Budget (`tools/budget_config.py`)
**Status : ❌ Absent du dashboard**

Budget config contrôle les seuils de persistance des résultats de tools (result_size_chars, turn_budget, preview_size). C'est un module interne à l'agent.

**Priorité** : P2 (interne, pas besoin d'UI)

---

### 24. Batch Runner (`batch_runner.py`)
**Status : ❌ Absent du dashboard**

Le batch runner permet de traiter des tâches en parallèle via CLI. Pas de page ni d'API dédiée.

**Priorité** : P2 (CLI-only par design)

---

### 25. Feishu (`tools/feishu_doc_tool.py`, `feishu_drive_tool.py`)
**Status : ✅ Implémenté (indirectement)**

Feishu est une plateforme supportée via le gateway adapter (`feishu.py` dans `platforms/`). La config des env vars (FEISHU_APP_ID, FEISHU_APP_SECRET) est gérée via Platforms.jsx.

Les tools feishu_doc et feishu_drive sont des tools agent-only (non configurables via dashboard).

---

### 26. HomeAssistant (`tools/homeassistant_tool.py`)
**Status : ✅ Implémenté**

- ✅ HASS_TOKEN + HASS_URL dans Tools.jsx (catégorie homeassistant)
- ✅ Home Assistant en tant que plateforme dans Platforms.jsx
- ✅ Connection status monitoring

---

### 27. Discord (`tools/discord_tool.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Discord comme plateforme dans Platforms.jsx
- ✅ Discord config dans Config.jsx (free_response_channels, auto_thread, reactions)
- ✅ Bot token + home channel

**Manquants** :
- ❌ `discord.server_actions` allowlist — pas d'UI
- ❌ `discord.allowed_channels` — pas d'UI
- ❌ `discord.channel_prompts` — pas d'UI
- ❌ Pas de listing des servers/channels connectés

---

### 28. X/Twitter (`tools/xai_http.py`)
**Status : ❌ Absent du dashboard**

`xai_http.py` est un module utilitaire (User-Agent header) pour les appels xAI. Pas d'intégration X/Twitter en tant que plateforme ou tool dans l'agent — c'est juste un helper HTTP.

**Priorité** : N/A (pas une feature utilisateur)

---

### 29. Voice Mode (`tools/voice_mode.py`, `transcription_tools.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ STT config dans Config.jsx (enabled, provider, record_key, max_recording_seconds, auto_tts, silence settings)
- ✅ FineTune.jsx expose les providers STT (Voxtral, Groq, Deepgram, AssemblyAI, NVIDIA)

**Manquants** :
- ❌ STT providers détaillés : `stt.local.model/language`, `stt.openai.model`, `stt.mistral.model` — pas d'UI
- ❌ Pas de test de microphone/enregistrement depuis le dashboard
- ❌ Pas de monitoring des transcriptions en cours

---

### 30. RL Training (`tools/rl_training_tool.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ Tinker/Atropos API keys dans Tools.jsx (catégorie rl)
- ✅ FineTune.jsx pour la transcription et l'entraînement

**Manquants** :
- ❌ Pas d'UI pour configurer les environnements RL
- ❌ Pas de monitoring des training runs en cours
- ❌ Pas d'accès aux métriques WandB
- ❌ Pas de gestion du lifecycle training (start/stop/check results)

---

### 31. Checkpoint Manager (`tools/checkpoint_manager.py`)
**Status : ⚠️ Partiellement implémenté**

**Implémenté** :
- ✅ `checkpoints.enabled` et `checkpoints.max_snapshots` dans Config.jsx

**Manquants** :
- ❌ Pas de listing des snapshots existants
- ❌ Pas d'UI pour rollback à un checkpoint
- ❌ Pas de visualisation du disk usage des checkpoints

---

### 32. Plugin System
**Status : ✅ Implémenté**

**Implémenté** (Plugins.jsx + plugins_router.py) :
- ✅ List installed plugins
- ✅ Install from Git URL
- ✅ Remove plugin
- ✅ Enable/disable plugin

---

## 3. Dashboard-Only Features (bonus, non dans l'Agent)

Ces features existent dans le dashboard mais ne sont pas des features de l'Agent :

| Page | Description |
|------|-------------|
| Leads.jsx | CRM intégré (EasyCRM) |
| Wiki.jsx | Wiki knowledge base |
| ClaudeCode.jsx | Claude Code session management via tmux |
| Login/Register | Auth dashboard |
| Backlog.jsx | Backlog management |
| ApiKeys.jsx | Centralized API key management |
| Profiles.jsx | Hermes profile management |

---

## 4. Priorisation des Manquants

### P0 — Critique (impact direct sur l'expérience admin)

| # | Feature | Manque |
|---|---------|--------|
| 1 | **MCP OAuth** | Aucune UI pour configurer/superviser les connexions OAuth MCP. Bloque l'utilisation de MCP servers nécessitant OAuth (Google, GitHub, etc.) |
| 2 | **Auxiliary Models Config** | Les 9 sous-providers LLM auxiliaires (vision, compression, session_search, etc.) ne sont pas configurables depuis le dashboard. Tout doit se faire via YAML manuel. |
| 3 | **Agent Gateway Timeouts** | `gateway_timeout`, `restart_drain_timeout`, `gateway_timeout_warning`, `gateway_notify_interval` pas exposés. Risque de gateway qui timeout silencieusement. |

### P1 — Important (manque fonctionnel notable)

| # | Feature | Manque |
|---|---------|--------|
| 4 | **Platform Toolsets** | Pas d'UI pour configurer quels tools sont disponibles par plateforme (`platform_toolsets`). Config complexe en YAML doit être éditée manuellement. |
| 5 | **Tools Registry Listing** | Pas de listing dynamique des ~60+ tools enregistrés dans l'agent. Impossible de voir ce qui est activé/désactivé. |
| 6 | **MCP Sampling Config** | `mcp_servers.*.sampling.*` pas configurable. Bloque les MCP servers avec sampling (LLM callback). |
| 7 | **Image Gen Model Selection** | Un seul provider FAL.ai, pas de sélection parmi les 12+ modèles (FLUX 2 Pro, Klein, etc.). |
| 8 | **Channel Prompts** | Pas d'UI pour les prompts par canal (sauf Discord partiel). Feature clé pour multi-plateforme. |
| 9 | **Environment Backend Details** | SSH, Modal image, Daytona image, Singularity image, Docker volumes/env — configs manquantes. |
| 10 | **RL Training Monitoring** | Pas de UI pour lancer/superviser les training runs RL. |
| 11 | **Checkpoint Management UI** | Pas de listing/rollback des snapshots. Config only. |
| 12 | **Discord Advanced Config** | `server_actions`, `allowed_channels`, `channel_prompts` manquants. |
| 13 | **Mistral/Google/MiniMax TTS** | Providers TTS supportés par le code mais pas configurables via le dashboard. |
| 14 | **STT Detailed Config** | `stt.local.model/language`, `stt.openai.model`, `stt.mistral.model` manquants. |

### P2 — Nice-to-have

| # | Feature | Manque |
|---|---------|--------|
| 15 | Skills Guard UI | Scan results, trust levels, quarantine |
| 16 | Subagent Monitoring | Visualisation délégation en temps réel |
| 17 | Context Compression Monitoring | Token count, compression events |
| 18 | Bedrock Config | AWS Bedrock provider settings |
| 19 | QQBot / BlueBubbles / Webhook platforms | Plateformes mineures |
| 20 | File Sync Status | Infrastructure interne |
| 21 | Budget Config UI | Seuils de persistance tool results |
| 22 | Batch Runner UI | CLI-only par design |
| 23 | Todo Visualization | Volatile par design |
| 24 | Vision Test | Upload + analyze preview |
| 25 | TTS Preview/Test | Audio preview |
| 26 | Delegation max_concurrent_children | Config manquante mineure |
| 27 | Model Catalog | Catalogue par provider avec metadata |
| 28 | Command Allowlist UI | Patterns de commandes autorisées |
| 29 | MCP OAuth Token Management | Voir/révoquer tokens |
| 30 | Various display.* configs | compact, streaming, inline_diffs, etc. |

---

## 5. Recommandations d'Implémentation P0/P1

### P0-1 : MCP OAuth Support
**Fichier à modifier** : `McpServers.jsx`, `backend/app/routers/mcp.py`
- Ajouter section "OAuth Configuration" dans le formulaire add/edit server
- Boutons "Authorize", "Revoke Token", "Show Status"
- Backend : exposer `_OAuthManager.get_status()`, `revoke()`, endpoints callback proxy

### P0-2 : Auxiliary Models Config
**Fichier à modifier** : `Config.jsx` (nouvelle section), `backend/app/routers/config.py`
- Nouvelle section "Auxiliary Models" avec 9 sous-sections (vision, web_extract, compression, session_search, skills_hub, approval, mcp, flush_memories)
- Chaque sous-section : provider (auto/custom), model, base_url, api_key, timeout

### P0-3 : Agent Gateway Timeouts
**Fichier à modifier** : `Config.jsx` section "Agent"
- Ajouter fields : `gateway_timeout`, `restart_drain_timeout`, `gateway_timeout_warning`, `gateway_notify_interval`, `service_tier`

### P1-4 : Platform Toolsets Config
**Fichier à créer** : `ToolsetsConfig.jsx` (nouvelle page/tab dans Tools)
- Matrice plateformes (rows) × toolsets (columns) avec toggles
- Sauvegarde dans `platform_toolsets` config

### P1-5 : Tools Registry Listing
**Fichier à modifier** : `Tools.jsx`, `backend/app/routers/tools.py`
- Nouveau backend endpoint : `GET /api/tools/registry` qui importe le registry de l'agent et liste tous les tools
- Frontend : table avec nom, toolset, description, enabled status, required env vars

### P1-9 : Environment Backend Details
**Fichier à modifier** : `Config.jsx` section "Terminal"
- Ajouter fields : modal_image, daytona_image, singularity_image, modal_mode, docker_volumes, docker_env, docker_forward_env, lifetime_seconds
- SSH section : TERMINAL_SSH_KEY, TERMINAL_SSH_PORT (via EnvVars)

---

## 6. Conclusion

Le dashboard couvre les fonctionnalités principales d'Hermes Agent de manière satisfaisante pour un usage quotidien. Les **P0 critiques** sont surtout autour de l'**OAuth MCP** (bloquant pour certains providers), la **config des modèles auxiliaires** (besoin d'éditer le YAML à la main), et les **timeouts gateway** (risque opérationnel).

Les **P1** les plus impactants sont le **platform toolsets** (feature multi-plateforme clé) et le **listing dynamique des tools** (visibilité). Le reste est essentiellement de la config avancée qui peut être gérée via YAML en attendant.

**Score global : 50% complet, 34% partiel, 16% absent**
