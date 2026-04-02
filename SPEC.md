# Hermes Dashboard — Spécification Technique

## Contexte
- Repo : https://github.com/duan78/hermes-dashboard
- Emplacement : /root/hermes-dashboard
- Stack : Libre (Next.js, Nuxt, Vue, React, SvelteKit — préférer léger et rapide)
- Contrainte : AUCUN fork de Hermes Agent. Uniquement la version officielle NousResearch.

## Objectif
Créer un dashboard web d'administration pour Hermes Agent (https://github.com/NousResearch/hermes-agent). Ce dashboard permet de piloter, configurer et monitorer Hermes via une interface web, en s'appuyant sur les commandes CLI existantes et les fichiers de configuration.

## Architecture

### Backend (API proxy)
- Un serveur Python (FastAPI ou Flask) qui expose les données Hermes
- Lit directement les fichiers de config, sessions, mémoire
- Exécute les commandes `hermes` en CLI et parse le résultat
- Port : 3100
- Authentification basique (bearer token dans .env)

### Frontend
- Interface web moderne, responsive, dark mode par défaut
- Se connecte au backend API sur le même serveur
- Streaming SSE pour les logs en temps réel

## Sections du Dashboard

### 1. Overview (page d'accueil)
- Status Hermes (gateway actif/inactif, uptime, sessions actives)
- Modèle actuel, provider, nombre de tokens utilisés
- Quick stats : sessions totales, skills installés, cron jobs actifs
- Derniers logs (streaming)

### 2. Configuration (hermes config)
- Afficher le config.yaml complet avec éditeur
- Section par section : model, terminal, browser, streaming, tts, display, privacy, memory, cron
- Éditer les valeurs (formulaire ou éditeur brut)
- Sauvegarder avec validation YAML

### 3. Sessions (hermes sessions)
- Liste des sessions avec date, modèle, plateforme, nombre de messages
- Détail d'une session : messages, tokens, outils utilisés
- Export, delete, prune
- Stats globales

### 4. Tools (hermes tools)
- Liste des outils disponibles par plateforme (CLI, Telegram, Discord, etc.)
- Activer/désactiver un outil par plateforme
- Vue d'ensemble par toolset

### 5. Skills (hermes skills)
- Liste des skills installés avec catégorie
- Parcourir, chercher, installer un skill
- Inspecter un skill (voir le contenu SKILL.md)
- Désinstaller un skill

### 6. Cron Jobs (hermes cron)
- Liste des jobs avec statut, schedule, dernière exécution
- Créer, éditer, pause, resume, supprimer un job
- Voir les logs d'exécution

### 7. Memory & SOUL
- Afficher SOUL.md (éditeur markdown)
- Afficher MEMORY.md
- Parcourir les fichiers dans memory/
- Éditer les fichiers mémoire

### 8. Models (hermes model)
- Modèle actuel et provider
- Switcher de modèle
- Voir les modèles disponibles

### 9. Platform Connections
- Statut des connexions (Telegram, Discord, etc.)
- Channel directory
- Pairing management

### 10. Insights (hermes insights)
- Token usage par jour
- Coûts estimés
- Patterns d'utilisation des outils
- Activité par plateforme

## Fichiers Hermes à lire/éditer

### Lecture seule
- `~/.hermes/state.db` (SQLite — sessions, mémoire)
- `~/.hermes/sessions/*.jsonl`
- `~/.hermes/models_dev_cache.json`
- `~/.hermes/gateway_state.json`
- `~/.hermes/channel_directory.json`
- `~/.hermes/logs/gateway.log`

### Lecture/Écriture
- `~/.hermes/config.yaml`
- `~/.hermes/.env` (NE PAS afficher les secrets en clair — masquer les API keys)
- `~/.hermes/SOUL.md`
- `~/.hermes/MEMORY.md`
- `~/.hermes/memory/`
- `~/.hermes/skills/`

## Commandes CLI à wrapper

```
hermes config show / edit / set / check
hermes sessions list / stats / export / delete / prune
hermes tools list / enable / disable
hermes skills list / browse / search / install / inspect / uninstall
hermes cron list / create / edit / pause / resume / run / remove / status
hermes status --all --deep
hermes doctor
hermes model (afficher le modèle actuel)
hermes plugins list / enable / disable
hermes pairing list / approve / revoke
hermes insights --days 7
```

## Sécurité
- Le backend tourne en localhost uniquement (127.0.0.1)
- Authentification par bearer token (HERMES_DASHBOARD_TOKEN dans .env)
- Masquer toutes les API keys dans l'interface (afficher "***" sauf sur click)
- CSP headers
- Pas d'accès direct aux fichiers — tout passe par l'API backend

## Déploiement
- Systemd service : hermes-dashboard.service
- Port : 3100
- Reverse proxy Nginx optionnel pour accès externe (avec Tailscale)

## Critères de Validation
- [ ] Dashboard accessible sur http://127.0.0.1:3100
- [ ] Toutes les 10 sections fonctionnelles
- [ ] Config YAML éditable et sauvegardable
- [ ] Sessions listées avec détail
- [ ] Skills browsables et installables
- [ ] Cron jobs gérables
- [ ] SOUL.md et MEMORY.md éditables
- [ ] Dark mode
- [ ] Responsive (mobile)
- [ ] Service systemd fonctionnel
