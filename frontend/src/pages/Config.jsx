import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Settings, Save, RotateCcw, ChevronDown, ChevronRight,
  Cpu, Sparkles, Terminal as TerminalIcon, Globe, Monitor,
  Zap, Database, Volume2, Shield, Archive, Layers, Code, Plug,
  Eye, EyeOff, Check, X, Brain, GitBranch, Wrench, Clock,
  Route, FileText, Plus, Trash2, RefreshCw, Zap as TestIcon,
  AlertTriangle, Skull, Smile, XCircle, Boxes, LayoutGrid, MessageSquare,
  Loader2, Play, ArrowUp, ArrowDown,
} from 'lucide-react'
import { api } from '../api'
import { useToast } from '../contexts/ToastContext'
import Tooltip from '../components/Tooltip'
import './config.css'

// ── Helpers ──

function getDeepValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

function setDeepValue(obj, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  let target = obj
  for (const k of keys) {
    if (target[k] == null) target[k] = {}
    target = target[k]
  }
  target[last] = value
}

// ── Section Schema ──

const SECTIONS = [
  {
    id: 'model', title: 'Model', icon: Cpu,
    desc: 'Configure the AI model, provider, and API connection used for all conversations.',
    fields: [
      { key: 'model.default', label: 'Default Model', type: 'text', desc: 'AI model used for all conversations by default. Can be overridden per-session via CLI flag or platform setting. Examples: "gpt-4o", "claude-sonnet-4", "glm-5-turbo".' },
      { key: 'model.provider', label: 'Provider', type: 'select', options: ['auto', 'openai', 'anthropic', 'google', 'custom', 'ollama', 'mistral', 'deepseek'], desc: 'API provider for the default model. "auto" detects from model name. Use "custom" with base_url for self-hosted or proxy APIs.' },
      { key: 'model.base_url', label: 'Base URL', type: 'text', desc: 'Custom API endpoint URL. Only used when provider is "custom". Must point to an OpenAI-compatible /chat/completions endpoint. Leave empty for standard provider endpoints.' },
      { key: 'model.api_key', label: 'API Key', type: 'secret', desc: 'API key for authentication with the model provider. Stored securely and never displayed in plain text. Leave unchanged to keep the existing key.' },
    ],
  },
  {
    id: 'agent', title: 'Agent', icon: Sparkles,
    desc: 'Control agent behavior: how many turns, reasoning depth, tool call enforcement, and gateway timeout settings.',
    fields: [
      { key: 'agent.max_turns', label: 'Max Turns', type: 'number', min: 1, max: 200, desc: 'Maximum tool-calling iterations per conversation. Higher values allow complex multi-step tasks but cost more tokens. Recommended: 60 for simple tasks, 120+ for agentic workflows. Default: 60.' },
      { key: 'agent.tool_use_enforcement', label: 'Tool Enforcement', type: 'select', options: ['auto', 'strict', 'permissive'], desc: 'Forces the model to make actual tool calls instead of describing actions. "auto" enables for GPT models, "strict" forces all models, "permissive" allows descriptive responses.' },
      { key: 'agent.verbose', label: 'Verbose', type: 'toggle', desc: 'Enable verbose logging for debugging. Shows internal decision-making, tool call details, and reasoning traces in the console. Disable in production.' },
      { key: 'agent.reasoning_effort', label: 'Reasoning Effort', type: 'select', options: ['none', 'low', 'minimal', 'medium', 'high', 'xhigh'], desc: 'Controls how much "thinking" the model does before responding. "none" disables reasoning entirely for fastest responses. "low"/"minimal" for simple tasks. "medium" balances speed and quality. "high" for complex tasks. "xhigh" for maximum reasoning depth at higher cost.' },
      { key: 'agent.service_tier', label: 'Service Tier', type: 'text', desc: 'API service tier for the model provider. Some providers (e.g. OpenAI) offer tiers like "auto", "default", "flex". Leave empty for provider default. Affects latency and cost.' },
      { key: 'agent.gateway_timeout', label: 'Gateway Timeout (s)', type: 'number', min: 10, max: 7200, desc: 'Maximum time in seconds the gateway waits for the agent to finish processing a message before timing out. Long-running agentic tasks may need higher values. Default: 120.' },
      { key: 'agent.restart_drain_timeout', label: 'Restart Drain Timeout (s)', type: 'number', min: 5, max: 300, desc: 'Seconds to wait for in-flight requests to complete before forcing a gateway restart. Allows graceful shutdown without dropping active conversations. Default: 30.' },
      { key: 'agent.gateway_timeout_warning', label: 'Timeout Warning (s)', type: 'number', min: 5, max: 3600, desc: 'Seconds before gateway_timeout expires at which a warning notification is sent. Gives you time to intervene before the conversation is killed. Default: 10.' },
      { key: 'agent.gateway_notify_interval', label: 'Notify Interval (s)', type: 'number', min: 10, max: 3600, desc: 'How often (seconds) the gateway sends progress notifications during long-running agent operations. Prevents timeout on messaging platforms that drop silent connections. Default: 60.' },
    ],
  },
  {
    id: 'delegation', title: 'Delegation', icon: GitBranch,
    desc: 'Configure subagent delegation: use a cheaper/faster model for child agent tasks.',
    fields: [
      { key: 'delegation.model', label: 'Subagent Model', type: 'text', desc: 'Model used by delegate_task for child agents. E.g. "google/gemini-3-flash-preview". Empty = inherit parent model.' },
      { key: 'delegation.provider', label: 'Subagent Provider', type: 'text', desc: 'Provider for subagent delegation. E.g. "openrouter". Empty = inherit parent provider + credentials.' },
      { key: 'delegation.base_url', label: 'Subagent Base URL', type: 'text', desc: 'Direct OpenAI-compatible endpoint for subagents. Leave empty to use provider routing.' },
      { key: 'delegation.api_key', label: 'Subagent API Key', type: 'secret', desc: 'API key for delegation.base_url. Falls back to OPENAI_API_KEY if empty.' },
      { key: 'delegation.max_iterations', label: 'Max Iterations', type: 'number', min: 1, max: 200, desc: 'Per-subagent iteration cap. Each subagent gets its own budget, independent of the parent\'s max_iterations. Default: 50.' },
      { key: 'delegation.max_concurrent_children', label: 'Max Concurrent Children', type: 'number', min: 1, max: 20, desc: 'Maximum number of subagent child processes that can run simultaneously. Higher values enable parallel delegation but use more memory and API tokens. Default: 3.' },
    ],
  },
  {
    id: 'smart_routing', title: 'Smart Routing', icon: Brain,
    desc: 'Smart model routing: automatically use a cheaper model for simple queries.',
    fields: [
      { key: 'smart_model_routing.enabled', label: 'Enabled', type: 'toggle', desc: 'Enable smart routing to automatically detect simple queries (short, low-complexity) and route them to a cheaper model instead of the main model.' },
      { key: 'smart_model_routing.max_simple_chars', label: 'Max Simple Chars', type: 'number', min: 50, max: 1000, desc: 'Maximum character length for a query to be considered "simple". Queries shorter than this threshold may be routed to the cheap model. Default: 160.' },
      { key: 'smart_model_routing.max_simple_words', label: 'Max Simple Words', type: 'number', min: 5, max: 200, desc: 'Maximum word count for a query to be considered "simple". Default: 28.' },
    ],
  },
  {
    id: 'terminal', title: 'Terminal', icon: TerminalIcon,
    desc: 'Configure the shell execution environment: local, Docker, or cloud backends.',
    fields: [
      { key: 'terminal.backend', label: 'Backend', type: 'select', options: ['local', 'docker', 'modal', 'singularity', 'daytona'], desc: 'Execution environment for shell commands. "local" runs on the host machine. "docker" uses containers for isolation. "modal"/"daytona" use cloud compute. Choose based on security and resource needs.' },
      { key: 'terminal.timeout', label: 'Timeout (s)', type: 'number', min: 10, max: 600, desc: 'Maximum execution time per terminal command in seconds. Commands running longer are killed. Increase for long-running builds or tests. Default: 180.' },
      { key: 'terminal.cwd', label: 'Working Directory', type: 'text', desc: 'Default working directory for terminal commands. "." means the directory where Hermes was started. Use an absolute path for consistency.' },
      { key: 'terminal.persistent_shell', label: 'Persistent Shell', type: 'toggle', desc: 'Keep a long-lived bash shell between commands. Preserves working directory (cd), environment variables (export), and shell state across executions. Recommended: enabled for most workflows.' },
      { key: 'terminal.docker_image', label: 'Docker Image', type: 'text', desc: 'Container image used when backend is "docker". Must include required tools (Python, Node.js, etc.). Example: "nikolaik/python-nodejs:python3.11-nodejs20".' },
      { key: 'terminal.container_cpu', label: 'Container CPU', type: 'number', min: 1, max: 16, desc: 'CPU cores allocated to the container. More cores = faster parallel execution. Default: 1.' },
      { key: 'terminal.container_memory', label: 'Container Memory (MB)', type: 'number', min: 256, max: 32768, desc: 'Memory in MB allocated to the container. Increase for memory-intensive tasks (data processing, ML). Default: 5120 (5 GB).' },
      { key: 'terminal.container_disk', label: 'Container Disk (MB)', type: 'number', min: 1024, max: 102400, desc: 'Disk space in MB allocated to the container. Default: 51200 (50 GB).' },
      { key: 'terminal.container_persistent', label: 'Persistent Container FS', type: 'toggle', desc: 'Persist the container filesystem across sessions. When enabled, files created inside the container survive restarts. Default: true.' },
      { key: 'terminal.docker_mount_cwd_to_workspace', label: 'Mount CWD to /workspace', type: 'toggle', desc: 'Mount the host\'s current working directory into /workspace inside the Docker container. Off by default because passing host directories weakens isolation.' },
      { key: 'terminal.env_passthrough', label: 'Env Passthrough', type: 'text', desc: 'Comma-separated list of environment variable names to pass through to sandboxed execution (terminal and execute_code). Skill-declared vars are passed automatically.' },
      { key: 'terminal.modal_image', label: 'Modal Image', type: 'text', desc: 'Container image used when backend is "modal". Must include required tools. Example: "nikolaik/python-nodejs:python3.11-nodejs20".' },
      { key: 'terminal.daytona_image', label: 'Daytona Image', type: 'text', desc: 'Container image used when backend is "daytona". Daytona provides cloud dev environments.' },
      { key: 'terminal.singularity_image', label: 'Singularity Image', type: 'text', desc: 'Container image used when backend is "singularity". Format: "docker://image:tag".' },
      { key: 'terminal.modal_mode', label: 'Modal Mode', type: 'select', options: ['auto', 'manual'], desc: 'Modal app management mode. "auto" creates and manages apps automatically. "manual" expects a pre-configured Modal app.' },
      { key: 'terminal.docker_volumes', label: 'Docker Volumes', type: 'text', desc: 'Comma-separated Docker volume mounts in format "host_path:container_path" or "volume_name:container_path". Example: "/data:/data,myvol:/workspace".' },
      { key: 'terminal.docker_forward_env', label: 'Docker Forward Env', type: 'text', desc: 'Comma-separated env var names to forward from host into the Docker container. Unlike env_passthrough, these are passed at container start.' },
      { key: 'terminal.lifetime_seconds', label: 'Container Lifetime (s)', type: 'number', min: 60, max: 86400, desc: 'Maximum lifetime of a cloud container in seconds before it is automatically destroyed. Only applies to modal/daytona backends. Default: 300 (5 min).' },
    ],
  },
  {
    id: 'browser', title: 'Browser', icon: Globe,
    desc: 'Configure browser automation: timeouts, recording, and cloud provider settings.',
    fields: [
      { key: 'browser.inactivity_timeout', label: 'Inactivity Timeout (s)', type: 'number', min: 10, max: 600, desc: 'Seconds of inactivity before the browser session is closed. A longer timeout keeps sessions alive for multi-step browsing but uses more resources. Default: 120.' },
      { key: 'browser.command_timeout', label: 'Command Timeout (s)', type: 'number', min: 5, max: 120, desc: 'Maximum time for each browser command (click, type, navigate). If a page is slow to load, increase this value. Default: 30.' },
      { key: 'browser.record_sessions', label: 'Record Sessions', type: 'toggle', desc: 'Record browser sessions as screenshots for debugging. Useful for troubleshooting automated browsing tasks. Increases storage usage.' },
      { key: 'browser.allow_private_urls', label: 'Allow Private URLs', type: 'toggle', desc: 'Allow browsing private/local network URLs (localhost, 192.168.x.x, internal domains). Disabled by default for security. Enable only in trusted environments.' },
      { key: 'browser.camofox.managed_persistence', label: 'Camofox Managed Persistence', type: 'toggle', desc: 'Send a stable profile-scoped userId to Camofox server so it can map to a persistent browser profile directory. When false (default), each session gets a random ephemeral userId.' },
    ],
  },
  {
    id: 'display', title: 'Display', icon: Monitor,
    desc: 'Customize the display: personality, streaming, diffs, costs, and tool output behavior.',
    fields: [
      { key: 'display.compact', label: 'Compact Mode', type: 'toggle', desc: 'Use compact display mode with reduced padding and smaller text. Useful for small screens or when viewing lots of output.' },
      { key: 'display.personality', label: 'Personality', type: 'select', options: ['default', 'helpful', 'concise', 'technical', 'creative', 'teacher', 'kawaii', 'catgirl', 'pirate', 'shakespeare', 'surfer', 'noir', 'uwu', 'philosopher', 'hype'], desc: 'AI personality preset that changes response style and tone. Each personality modifies the system prompt with unique characteristics. Custom personalities can be defined in the personalities section.' },
      { key: 'display.streaming', label: 'Streaming', type: 'toggle', desc: 'Stream AI responses in real-time token-by-token instead of waiting for the full response. Provides faster perceived response time. Disable if you prefer complete responses.' },
      { key: 'display.show_reasoning', label: 'Show Reasoning', type: 'toggle', desc: 'Show the model\'s chain-of-thought reasoning when available (requires supported model). Reveals how the AI thinks through problems.' },
      { key: 'display.inline_diffs', label: 'Inline Diffs', type: 'toggle', desc: 'Show code changes as inline diffs (highlighted additions/removals) instead of showing the entire new file. Makes it easier to see what changed.' },
      { key: 'display.interim_assistant_messages', label: 'Interim Assistant Messages', type: 'toggle', desc: 'Show intermediate assistant messages during processing. Displays partial thoughts and tool-call reasoning as they happen, giving visibility into what the agent is doing before the final response.' },
      { key: 'display.show_cost', label: 'Show Cost', type: 'toggle', desc: 'Display token usage and estimated cost after each response. Useful for monitoring API spending.' },
      { key: 'display.bell_on_complete', label: 'Bell on Complete', type: 'toggle', desc: 'Play a terminal bell sound when a response completes. Useful when multitasking — you\'ll hear when the AI is done.' },
      { key: 'display.tool_progress', label: 'Tool Progress Bar', type: 'toggle', desc: 'Show a live progress bar for tool executions. Displays which tool is running, elapsed time, and completion status. Helpful for long-running tool calls.' },
      { key: 'display.tool_progress_command', label: 'Tool Progress Command', type: 'toggle', desc: 'Enable the /verbose command in messaging gateways to toggle tool progress display on the fly.' },
      { key: 'display.tool_preview_length', label: 'Tool Preview Length', type: 'number', min: 0, max: 1000, desc: 'Number of characters to preview from tool outputs inline. 0 disables preview entirely. Set to 200-500 for useful summaries without clutter.' },
      { key: 'display.background_process_notifications', label: 'Background Process Notifications', type: 'toggle', desc: 'Receive notifications when background processes complete or fail. Essential when running long tasks — you\'ll get alerted when they finish instead of having to check manually.' },
      { key: 'display.resume_display', label: 'Resume Display', type: 'select', options: ['full', 'summary', 'off'], desc: 'How to display resumed session context. "full" shows the full conversation history, "summary" shows a condensed summary, "off" shows nothing.' },
      { key: 'display.busy_input_mode', label: 'Busy Input Mode', type: 'select', options: ['interrupt', 'queue', 'reject'], desc: 'Behavior when user sends a message while the agent is busy. "interrupt" sends the message immediately (may disrupt), "queue" buffers it for next turn, "reject" drops it with a notice.' },
      { key: 'display.skin', label: 'Skin', type: 'text', desc: 'Display skin/theme name for the CLI interface. "default" uses the built-in theme. Custom skins can be defined in the skins directory.' },
    ],
  },
  {
    id: 'streaming', title: 'Streaming', icon: Zap,
    desc: 'Fine-tune real-time response streaming: edit speed, buffer size, and update frequency.',
    fields: [
      { key: 'streaming.enabled', label: 'Enabled', type: 'toggle', desc: 'Enable real-time streaming of AI responses as they are generated. Provides a better interactive experience. Disable for debugging or when streaming causes issues.' },
      { key: 'streaming.edit_interval', label: 'Edit Interval', type: 'number', min: 0.05, max: 2, step: 0.05, desc: 'Time interval in seconds between streaming UI updates. Lower values = smoother but more CPU usage. Higher values = less flickering. Default: 0.3.' },
      { key: 'streaming.buffer_threshold', label: 'Buffer Threshold', type: 'number', min: 1, max: 200, desc: 'Number of tokens to buffer before starting to stream. Higher values reduce visual flickering but add a slight delay before text appears. Default: 40.' },
    ],
  },
  {
    id: 'memory', title: 'Memory', icon: Database,
    desc: 'Configure persistent memory: how the agent stores and recalls context across conversations.',
    fields: [
      { key: 'memory.memory_enabled', label: 'Memory Enabled', type: 'toggle', desc: 'Enable persistent memory that carries context across conversations. The agent stores and recalls important information about preferences, past interactions, and learned facts. Disable to start fresh each session.' },
      { key: 'memory.user_profile_enabled', label: 'User Profile', type: 'toggle', desc: 'Maintain a user profile with preferences, communication style, and patterns learned over time. Helps the agent personalize responses to your needs.' },
      { key: 'memory.memory_char_limit', label: 'Memory Char Limit', type: 'number', min: 100, max: 10000, desc: 'Maximum characters for the memory context injected into the system prompt. ~4 chars per token. Higher = more context but more token cost. Default: 2200 (~800 tokens).' },
      { key: 'memory.user_char_limit', label: 'User Char Limit', type: 'number', min: 100, max: 10000, desc: 'Maximum characters for the user profile context. Balances personalization with token cost. Default: 1375 (~500 tokens).' },
      { key: 'memory.nudge_interval', label: 'Nudge Interval', type: 'number', min: 1, max: 50, desc: 'How often (in conversation turns) the agent is reminded to consider saving new memories. Lower = more frequent memory updates. Default: 10.' },
      { key: 'memory.flush_min_turns', label: 'Flush Min Turns', type: 'number', min: 1, max: 50, desc: 'Minimum conversation turns before the agent flushes accumulated memories to storage. Prevents saving from very short interactions. Default: 6.' },
    ],
  },
  {
    id: 'tts', title: 'TTS & Voice', icon: Volume2,
    desc: 'Configure text-to-speech, speech-to-text, and voice input settings.',
    fields: [
      { key: 'tts.provider', label: 'TTS Provider', type: 'select', options: ['edge', 'elevenlabs', 'openai', 'mistral', 'minimax', 'neutts'], desc: 'Text-to-speech engine. "edge" uses free Microsoft Edge TTS (recommended). "elevenlabs" uses ElevenLabs API (high quality, paid). "openai" uses OpenAI TTS. "mistral" uses Mistral voxtral TTS. "minimax" uses MiniMax TTS (Chinese TTS with natural voices). "neutts" runs a local model.' },
      { key: 'tts.edge.voice', label: 'Edge Voice', type: 'text', desc: 'Voice identifier for Edge TTS. Format: "lang-Region-VoiceName". Examples: "fr-FR-DeniseNeural", "en-US-AriaNeural", "en-US-GuyNeural". List voices with: hermes config check.' },
      { key: 'tts.mistral.model', label: 'Mistral TTS Model', type: 'text', desc: 'Mistral TTS model name. Default: "voxtral-mini-tts-2603". Requires MISTRAL_API_KEY env var.' },
      { key: 'tts.mistral.voice_id', label: 'Mistral Voice ID', type: 'text', desc: 'Voice identifier for Mistral TTS. UUID format. Default voice is pre-selected. Find available voices in Mistral API docs.' },
      { key: 'tts.minimax.model', label: 'MiniMax Model', type: 'text', desc: 'MiniMax TTS model name. Default: "speech-01-turbo". Requires MINIMAX_API_KEY env var and MINIMAX_GROUP_ID.' },
      { key: 'tts.minimax.voice_id', label: 'MiniMax Voice ID', type: 'text', desc: 'Voice identifier for MiniMax TTS. Choose from available voices in MiniMax console.' },
      { key: 'tts.minimax.group_id', label: 'MiniMax Group ID', type: 'text', desc: 'MiniMax group ID for API authentication. Find in your MiniMax account settings.' },
      { key: 'stt.enabled', label: 'STT Enabled', type: 'toggle', desc: 'Enable speech-to-text for voice input. Allows recording audio messages that are transcribed and sent as text to the AI.' },
      { key: 'stt.provider', label: 'STT Provider', type: 'select', options: ['openai', 'local', 'mistral', 'groq'], desc: 'Speech recognition engine. "openai" uses Whisper API. "local" runs Whisper locally (free). "mistral" uses Voxtral. "groq" uses Groq\'s fast Whisper.' },
      { key: 'stt.local.model', label: 'Local STT Model', type: 'text', desc: 'Whisper model size for local STT. Options: "tiny", "base", "small", "medium", "large". Larger = more accurate but slower. Default: "base".' },
      { key: 'stt.local.language', label: 'Local STT Language', type: 'text', desc: 'Language code for local Whisper (e.g. "en", "fr", "de"). Empty = auto-detect. Setting a language improves accuracy.' },
      { key: 'stt.openai.model', label: 'OpenAI STT Model', type: 'text', desc: 'Model for OpenAI Whisper STT. Default: "whisper-1". Can also use voxtral models via OpenAI-compatible endpoint.' },
      { key: 'stt.mistral.model', label: 'Mistral STT Model', type: 'text', desc: 'Model for Mistral STT (Voxtral). Default: "voxtral-mini-latest". Requires MISTRAL_API_KEY.' },
      { key: 'voice.record_key', label: 'Record Key', type: 'text', desc: 'Keyboard shortcut to start/stop voice recording. Format: modifier+key (e.g., "ctrl+b", "alt+r"). Must not conflict with system shortcuts.' },
      { key: 'voice.max_recording_seconds', label: 'Max Recording (s)', type: 'number', min: 5, max: 600, desc: 'Maximum voice recording duration in seconds. Recordings are automatically stopped after this time. Default: 120 (2 min).' },
      { key: 'voice.auto_tts', label: 'Auto TTS', type: 'toggle', desc: 'Automatically speak all AI responses using TTS. Every response will be read aloud. Useful for accessibility or hands-free use.' },
      { key: 'voice.silence_threshold', label: 'Silence Threshold', type: 'number', min: 0, max: 32767, desc: 'RMS audio level below which sound is considered silence (0-32767). Lower values require quieter environments. Default: 200.' },
      { key: 'voice.silence_duration', label: 'Silence Duration (s)', type: 'number', min: 0.5, max: 30, step: 0.5, desc: 'Seconds of continuous silence before auto-stopping the recording. Default: 3.0.' },
    ],
  },
  {
    id: 'security', title: 'Security & Privacy', icon: Shield,
    desc: 'Security settings: secret redaction, security guard (Tirith), and privacy controls.',
    fields: [
      { key: 'security.redact_secrets', label: 'Redact Secrets', type: 'toggle', desc: 'Automatically redact API keys, tokens, passwords, and other secrets from logs and tool output. Strongly recommended: always keep enabled. Disabling may expose sensitive data.' },
      { key: 'security.tirith_enabled', label: 'Tirith Guard', type: 'toggle', desc: 'Enable Tirith security guard that validates tool calls against security policies. Prevents potentially dangerous operations like deleting critical files or accessing restricted URLs.' },
      { key: 'security.tirith_timeout', label: 'Tirith Timeout (s)', type: 'number', min: 1, max: 30, desc: 'Maximum time in seconds for Tirith security checks. If checks take longer, the fail_open setting determines the outcome. Default: 5.' },
      { key: 'security.tirith_fail_open', label: 'Fail Open', type: 'toggle', desc: 'If Tirith security check times out, allow the operation (true) or block it (false). "true" is more permissive, "false" is more secure but may block legitimate operations during slowdowns.' },
      { key: 'privacy.redact_pii', label: 'Redact PII', type: 'toggle', desc: 'Automatically detect and redact personally identifiable information (names, emails, phone numbers, SSNs) from logs and stored data. Important for compliance and privacy.' },
      { key: 'security.website_blocklist.enabled', label: 'Website Blocklist', type: 'toggle', desc: 'Enable website blocklist that prevents the agent from accessing certain domains. Useful for compliance and security.' },
    ],
  },
  {
    id: 'compression', title: 'Compression', icon: Archive,
    desc: 'Configure automatic context compression to manage long conversations and save tokens.',
    fields: [
      { key: 'compression.enabled', label: 'Enabled', type: 'toggle', desc: 'Enable automatic context compression when conversations get too long. Older messages are summarized to save tokens while preserving key information. Recommended for long sessions.' },
      { key: 'compression.threshold', label: 'Threshold', type: 'number', min: 0, max: 1, step: 0.1, desc: 'Compression triggers when context reaches this fraction of the model\'s context window. 0.5 = compress at 50% capacity. Lower values compress sooner but may lose detail. Default: 0.5.' },
      { key: 'compression.target_ratio', label: 'Target Ratio', type: 'number', min: 0, max: 1, step: 0.1, desc: 'Target size after compression as a fraction of original. 0.2 means compress to 20% of original size. Lower = more aggressive compression. Default: 0.2.' },
      { key: 'compression.protect_last_n', label: 'Protect Last N', type: 'number', min: 0, max: 100, desc: 'Number of recent messages to protect from compression. These are always preserved in full. Higher values keep more recent context but leave less room for compression. Default: 20.' },
      { key: 'compression.summary_model', label: 'Summary Model', type: 'text', desc: 'Model used for generating compression summaries. Can be a cheaper/faster model to save costs. Default: "" (uses main model). Any OpenAI-compatible model works.' },
      { key: 'compression.summary_provider', label: 'Summary Provider', type: 'text', desc: 'Provider for the compression summary model. "auto" detects from model name. Use "custom" with summary_base_url.' },
      { key: 'compression.summary_base_url', label: 'Summary Base URL', type: 'text', desc: 'Custom API endpoint for the compression summary model. Only used when summary_provider is "custom".' },
    ],
  },
  {
    id: 'sessions', title: 'Sessions & Approvals', icon: Layers,
    desc: 'Manage checkpoints, tool approvals, and automatic session reset behavior.',
    fields: [
      { key: 'checkpoints.enabled', label: 'Checkpoints', type: 'toggle', desc: 'Enable session checkpoints that save conversation state periodically. Allows resuming interrupted conversations exactly where you left off.' },
      { key: 'checkpoints.max_snapshots', label: 'Max Snapshots', type: 'number', min: 1, max: 200, desc: 'Maximum number of checkpoint snapshots to keep per session. Older snapshots are automatically cleaned up. Default: 50.' },
      { key: 'approvals.mode', label: 'Approval Mode', type: 'select', options: ['manual', 'smart', 'auto'], desc: 'How tool approvals work. "manual" requires user confirmation for dangerous tools. "smart" uses an auxiliary LLM to auto-approve low-risk commands. "auto" approves everything — use only in trusted environments.' },
      { key: 'approvals.timeout', label: 'Approval Timeout (s)', type: 'number', min: 10, max: 300, desc: 'Seconds to wait for user approval before auto-rejecting the tool call. Increase for slow interactions or when stepping away. Default: 60.' },
      { key: '_yolo_toggle', label: 'YOLO Mode', type: 'yolo' },
      { key: 'session_reset.mode', label: 'Reset Mode', type: 'select', options: ['both', 'idle', 'scheduled', 'off'], desc: 'When to automatically reset sessions. "both" resets on idle AND on schedule. "idle" only after inactivity. "scheduled" only at a specific hour. "off" never auto-resets.' },
      { key: 'session_reset.idle_minutes', label: 'Idle Reset (min)', type: 'number', min: 10, max: 10080, desc: 'Minutes of inactivity before resetting a session. 1440 = 24 hours. The session context is cleared and a fresh conversation starts. Default: 1440.' },
      { key: 'session_reset.at_hour', label: 'Reset Hour', type: 'number', min: 0, max: 23, desc: 'Hour of the day (0-23, local timezone) to reset scheduled sessions. Default: 4 (4 AM). Choose off-peak hours to avoid disrupting active conversations.' },
      { key: 'command_allowlist', label: 'Command Allowlist', type: 'textarea', desc: 'One command pattern per line. Commands matching these patterns are auto-approved without user confirmation. Supports wildcards (e.g. "ls*", "git status", "cat *"). Leave empty to require approval for all commands.' },
    ],
  },
  {
    id: 'code_execution', title: 'Code Execution', icon: Code,
    desc: 'Configure code execution limits: timeout, max tool calls, and file read limits.',
    fields: [
      { key: 'code_execution.timeout', label: 'Timeout (s)', type: 'number', min: 10, max: 600, desc: 'Maximum execution time for code execution tasks in seconds. Longer tasks are terminated. Increase for complex computations or large builds. Default: 300 (5 min).' },
      { key: 'code_execution.max_tool_calls', label: 'Max Tool Calls', type: 'number', min: 1, max: 200, desc: 'Maximum number of tool calls allowed in a single code execution session. Prevents runaway tool call loops. Default: 50.' },
      { key: 'file_read_max_chars', label: 'File Read Max Chars', type: 'number', min: 10000, max: 500000, desc: 'Maximum characters returned by a single read_file call. Reads exceeding this are rejected with guidance to use offset+limit. 100K chars ≈ 25-35K tokens. Default: 100000.' },
    ],
  },
  {
    id: 'cron', title: 'Cron & Scheduling', icon: Clock,
    desc: 'Cron job settings: response wrapping and scheduled task behavior.',
    fields: [
      { key: 'cron.wrap_response', label: 'Wrap Cron Response', type: 'toggle', desc: 'Wrap delivered cron responses with a header (task name) and footer ("The agent cannot see this message"). Set to false for clean output.' },
    ],
  },
  {
    id: 'integrations', title: 'Integrations', icon: Plug,
    desc: 'Timezone, human delay simulation, Discord bot settings, and other integrations.',
    fields: [
      { key: 'timezone', label: 'Timezone', type: 'text', desc: 'System timezone for scheduling and timestamp display. Affects cron schedules, session timestamps, and time-related responses. Example: "Europe/Paris", "America/New_York", "Asia/Tokyo".' },
      { key: 'human_delay.mode', label: 'Human Delay Mode', type: 'select', options: ['off', 'typing', 'reading'], desc: 'Simulate human-like response delay. "off" sends instantly. "typing" adds delay proportional to response length. "reading" simulates reading time before responding. Makes the AI feel more natural on messaging platforms.' },
      { key: 'human_delay.min_ms', label: 'Delay Min (ms)', type: 'number', min: 0, max: 5000, desc: 'Minimum artificial delay in milliseconds before sending a response. Only applies when human_delay.mode is not "off". Default: 800.' },
      { key: 'human_delay.max_ms', label: 'Delay Max (ms)', type: 'number', min: 0, max: 10000, desc: 'Maximum artificial delay in milliseconds. The actual delay is randomized between min and max. Default: 2500.' },
      { key: 'group_sessions_per_user', label: 'Group Sessions/User', type: 'toggle', desc: 'Create separate conversation sessions for each user in group channels. When enabled, each user gets their own context. When disabled, all users share one conversation in the channel.' },
    ],
  },
  {
    id: 'discord', title: 'Discord', icon: Plug,
    desc: 'Discord bot platform settings for gateway mode.',
    fields: [
      { key: 'discord.require_mention', label: 'Require Mention', type: 'toggle', desc: 'Bot only responds when explicitly @mentioned in Discord channels. Prevents the bot from responding to every message. Recommended: enabled in busy servers.' },
      { key: 'discord.free_response_channels', label: 'Free Response Channels', type: 'text', desc: 'Comma-separated channel IDs where the bot responds without being @mentioned. Leave empty to require mentions everywhere.' },
      { key: 'discord.allowed_channels', label: 'Allowed Channels', type: 'text', desc: 'Comma-separated channel IDs the bot is allowed to respond in. If set, the bot ignores messages from all other channels. Leave empty to allow all channels.' },
      { key: 'discord.auto_thread', label: 'Auto Thread', type: 'toggle', desc: 'Automatically create a Discord thread for each new conversation. Keeps channels organized by grouping related messages together.' },
      { key: 'discord.reactions', label: 'Reactions', type: 'toggle', desc: 'Add emoji reactions to messages for visual feedback (e.g., thinking indicator, completion checkmark). Makes the bot feel more interactive.' },
      { key: 'discord.server_actions', label: 'Server Actions', type: 'text', desc: 'Comma-separated list of Discord server action patterns the bot is allowed to perform (e.g. "create_channel,send_embed"). Leave empty for default safe set.' },
    ],
  },
  {
    id: 'advanced', title: 'Advanced', icon: Wrench,
    desc: 'Advanced settings: skills directories, toolsets, and other expert options.',
    fields: [
      { key: 'toolsets', label: 'Toolsets', type: 'text', desc: 'Comma-separated list of active toolset names. "hermes-cli" is the built-in default. Additional toolsets provide extra capabilities.' },
      { key: 'skills.external_dirs', label: 'External Skill Dirs', type: 'text', desc: 'Comma-separated list of external skill directories for sharing skills across tools/agents. Each path is expanded (~, ${VAR}). E.g. "~/.agents/skills, /shared/team-skills".' },
      { key: 'prefill_messages_file', label: 'Prefill Messages File', type: 'text', desc: 'Path to a JSON file containing prefill messages (list of {role, content} dicts) injected at the start of every API call for few-shot priming. Never saved to sessions or logs.' },
    ],
  },
]

// ── Special Section IDs (rendered with custom UI) ──
const SPECIAL_SECTIONS = ['provider_routing', 'system_prompt']

// ── Widget Components ──

function Toggle({ value, onChange }) {
  return (
    <label className="toggle-wrap">
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  )
}

function TextField({ value, onChange }) {
  return (
    <input
      type="text"
      className="form-input"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      placeholder="not set"
    />
  )
}

function NumberField({ value, onChange, min, max, step }) {
  return (
    <input
      type="number"
      className="form-input"
      value={value ?? ''}
      onChange={e => {
        const v = e.target.value
        onChange(v === '' ? null : Number(v))
      }}
      min={min}
      max={max}
      step={step || 1}
    />
  )
}

function SelectField({ value, onChange, options }) {
  const allOptions = (value != null && value !== '' && !options.includes(value))
    ? [...options, value] : options
  return (
    <select className="form-select" value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">— not set —</option>
      {allOptions.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function SecretField({ value, onChange }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="secret-input-wrap">
      <input
        type={visible ? 'text' : 'password'}
        className="form-input"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder="Leave unchanged to keep current"
      />
      <button type="button" className="secret-toggle-btn" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide secret' : 'Show secret'}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

function TextareaField({ value, onChange }) {
  return (
    <textarea
      className="form-textarea"
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      placeholder="not set"
      style={{ minHeight: 80, fontFamily: 'var(--font-mono)', fontSize: 12 }}
    />
  )
}

function FieldWidget({ field, value, onChange }) {
  switch (field.type) {
    case 'toggle':
      return <Toggle value={value} onChange={onChange} />
    case 'number':
      return <NumberField value={value} onChange={onChange} min={field.min} max={field.max} step={field.step} />
    case 'select':
      return <SelectField value={value} onChange={onChange} options={field.options} />
    case 'secret':
      return <SecretField value={value} onChange={onChange} />
    case 'textarea':
      return <TextareaField value={value} onChange={onChange} />
    default:
      return <TextField value={value} onChange={onChange} />
  }
}

// ── YOLO Mode Button ──

function YoloButton({ approvalMode, approvalOnChange }) {
  const isYolo = approvalMode === 'auto'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => approvalOnChange(isYolo ? 'manual' : 'auto')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          border: isYolo ? '2px solid #ef4444' : '2px solid #f59e0b',
          background: isYolo ? '#ef4444' : 'transparent',
          color: isYolo ? '#fff' : '#f59e0b',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        {isYolo ? <Skull size={15} /> : <Smile size={15} />}
        {isYolo ? 'YOLO Active' : 'YOLO Mode'}
        <Tooltip text={isYolo
          ? 'YOLO Mode is ON — all tool calls are automatically approved. Click to revert to manual approval.'
          : 'Enable YOLO Mode to automatically approve ALL tool calls without confirmation. Use only in trusted environments.'
        } />
      </button>
      {isYolo && (
        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500 }}>
          All approvals bypassed
          <Tooltip text="Every tool call will execute immediately without asking for confirmation. This is dangerous in untrusted environments." />
        </span>
      )}
    </div>
  )
}

// ── Provider Routing Section ──

function ProviderRoutingSection({ config }) {
  const [providers, setProviders] = useState(null)
  const [active, setActive] = useState(null)
  const [fallbacks, setFallbacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newProv, setNewProv] = useState({ name: '', api: '', default_model: '', transport: 'chat_completions' })
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})
  const [isOpen, setIsOpen] = useState(false)
  const [fallbackVis, setFallbackVis] = useState({})
  const [fallbackTesting, setFallbackTesting] = useState({})
  const [fallbackTestResults, setFallbackTestResults] = useState({})
  const [savingFallbacks, setSavingFallbacks] = useState(false)
  // Auxiliary chain state
  const [auxChain, setAuxChain] = useState([])
  const [auxAvailable, setAuxAvailable] = useState({})
  const [auxCustom, setAuxCustom] = useState(false)
  const [auxSaving, setAuxSaving] = useState(false)
  const [auxShowAdd, setAuxShowAdd] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [p, a, f, aux] = await Promise.all([
        api.listProviders(),
        api.getActiveProvider(),
        api.getFallbackProviders(),
        api.getAuxiliaryChain(),
      ])
      setProviders(p.providers || {})
      setActive(a)
      setFallbacks(f.fallback_providers || [])
      setAuxChain(aux.chain || [])
      setAuxAvailable(aux.available || {})
      setAuxCustom(aux.custom || false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newProv.name) return
    try {
      await api.createProvider(newProv.name, newProv.api, newProv.default_model, newProv.transport)
      toast.success(`Provider "${newProv.name}" added`)
      setShowAdd(false)
      setNewProv({ name: '', api: '', default_model: '', transport: 'chat_completions' })
      await load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleDelete = async (name) => {
    try {
      await api.deleteProvider(name)
      toast.success(`Provider "${name}" deleted`)
      await load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleSetActive = async (name) => {
    const prov = providers?.[name]
    if (!prov) return
    try {
      await api.setActiveProvider({ provider: name, default_model: prov.default_model || '', base_url: prov.api || '' })
      toast.success(`Active provider set to "${name}"`)
      await load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleTest = async (name) => {
    setTesting(prev => ({ ...prev, [name]: true }))
    setTestResults(prev => { const n = { ...prev }; delete n[name]; return n })
    try {
      const prov = providers[name]
      const result = await api.testProvider(name, prov?.api, prov?.api_key_env, prov?.default_model)
      setTestResults(prev => ({ ...prev, [name]: result }))
      setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[name]; return n }), 10000)
    } catch (e) {
      setTestResults(prev => ({ ...prev, [name]: { status: 'error', error: e.message } }))
      setTimeout(() => setTestResults(prev => { const n = { ...prev }; delete n[name]; return n }), 10000)
    } finally {
      setTesting(prev => ({ ...prev, [name]: false }))
    }
  }

  const isActive = (name) => active?.provider === name

  // ── Fallback CRUD handlers ──
  const updateFallback = (index, field, value) => {
    setFallbacks(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const moveFallback = (index, direction) => {
    setFallbacks(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const removeFallback = (index) => {
    setFallbacks(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddFallback = () => {
    setFallbacks(prev => [...prev, { provider: '', model: '', api_key: '', base_url: '', enabled: true }])
  }

  const handleSaveFallbacks = async () => {
    try {
      setSavingFallbacks(true)
      await api.saveFallbackProviders(fallbacks)
      toast.success('Fallback providers saved')
      await load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingFallbacks(false)
    }
  }

  const handleTestFallback = async (index) => {
    const fb = fallbacks[index]
    setFallbackTesting(prev => ({ ...prev, [index]: true }))
    setFallbackTestResults(prev => { const n = { ...prev }; delete n[index]; return n })
    try {
      const result = await api.testProvider(fb.provider || 'custom', fb.base_url, null, fb.model)
      setFallbackTestResults(prev => ({ ...prev, [index]: result }))
      setTimeout(() => setFallbackTestResults(prev => { const n = { ...prev }; delete n[index]; return n }), 10000)
    } catch (e) {
      setFallbackTestResults(prev => ({ ...prev, [index]: { status: 'error', error: e.message } }))
      setTimeout(() => setFallbackTestResults(prev => { const n = { ...prev }; delete n[index]; return n }), 10000)
    } finally {
      setFallbackTesting(prev => ({ ...prev, [index]: false }))
    }
  }

  // ── Auxiliary Chain handlers ──
  const AUX_DESCRIPTIONS = {
    'local/custom': "Your custom endpoint (Z.AI). This is tried first - your primary API endpoint for all auxiliary tasks like compression, session search, and web extraction.",
    'api-key': "Direct API key providers (Ollama Cloud, Mistral, DeepSeek, etc.). These are tried using their configured API keys from .env. Ollama Cloud is the main one here.",
    'nous': "Nous Portal - Nous Research OAuth provider. Only available if authenticated via hermes login.",
    'openrouter': "OpenRouter - aggregator with multiple models. Requires credits. Placed last as fallback.",
    'openai-codex': "OpenAI Codex - OAuth-based OpenAI provider. Only available if authenticated via hermes login.",
  }

  const moveAuxItem = (index, direction) => {
    setAuxChain(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setAuxCustom(true)
  }

  const removeAuxItem = (index) => {
    setAuxChain(prev => prev.filter((_, i) => i !== index))
    setAuxCustom(true)
  }

  const addAuxItem = (id) => {
    setAuxChain(prev => [...prev, { id, label: auxAvailable[id] || id }])
    setAuxCustom(true)
    setAuxShowAdd(false)
  }

  const handleSaveAuxChain = async () => {
    try {
      setAuxSaving(true)
      await api.saveAuxiliaryChain(auxChain)
      toast.success('Auxiliary chain saved')
      await load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setAuxSaving(false)
    }
  }

  const handleResetAuxChain = async () => {
    try {
      await api.resetAuxiliaryChain()
      toast.success('Auxiliary chain reset to defaults')
      await load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const auxChainIds = new Set(auxChain.map(item => item.id))
  const auxAvailableToAdd = Object.keys(auxAvailable).filter(id => !auxChainIds.has(id))

  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <Route size={18} className="accordion-icon" />
        <span className="accordion-title">Provider Routing</span>
        <span className="field-count">{providers ? Object.keys(providers).length : 0} providers</span>
        <Tooltip text="Configure LLM provider endpoints, switch between providers, set fallback chains. The active provider determines where all AI conversations are routed." />
        <span className="accordion-chevron">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </div>
      {isOpen && (
        <div className="accordion-body" style={{ padding: 0 }}>
          {loading ? <div className="spinner" style={{ margin: 20 }} /> : (
            <>
              {/* Active Provider */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Active Provider</span>
                  <Tooltip text="The currently active provider and model. All conversations use this provider unless fallback is triggered." />
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
                  <span><strong>Provider:</strong> {active?.provider || 'auto'}</span>
                  <span><strong>Model:</strong> {active?.model || 'N/A'}</span>
                  {active?.base_url && <span style={{ color: 'var(--text-muted)' }}><strong>URL:</strong> <code style={{ fontSize: 11 }}>{active.base_url}</code></span>}
                </div>
              </div>

              {/* Provider List */}
              <div style={{ padding: '8px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                    Configured Providers
                    <Tooltip text="All provider endpoints registered in config.yaml under the 'providers' section." />
                  </span>
                  <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(!showAdd)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plus size={12} /> Add
                    <Tooltip text="Register a new LLM provider endpoint." />
                  </button>
                </div>

                {showAdd && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr auto', gap: 8, marginBottom: 12, alignItems: 'end' }}>
                    <input className="form-input" placeholder="Name (e.g. openai)" value={newProv.name} onChange={e => setNewProv({ ...newProv, name: e.target.value })} style={{ fontSize: 12 }} />
                    <input className="form-input" placeholder="API URL (e.g. https://api.openai.com/v1)" value={newProv.api} onChange={e => setNewProv({ ...newProv, api: e.target.value })} style={{ fontSize: 12 }} />
                    <input className="form-input" placeholder="Default model" value={newProv.default_model} onChange={e => setNewProv({ ...newProv, default_model: e.target.value })} style={{ fontSize: 12 }} />
                    <select className="form-select" value={newProv.transport} onChange={e => setNewProv({ ...newProv, transport: e.target.value })} style={{ fontSize: 12 }}>
                      <option value="chat_completions">chat_completions</option>
                      <option value="responses">responses</option>
                    </select>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-primary" onClick={handleAdd} disabled={!newProv.name}>Save</button>
                      <button className="btn btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {Object.entries(providers || {}).map(([name, cfg]) => {
                  const tr = testResults[name]
                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, minWidth: 80 }}>
                        {name}
                        {isActive(name) && <span className="badge badge-success" style={{ marginLeft: 6, fontSize: 9 }}>ACTIVE</span>}
                      </span>
                      <code style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cfg.api || cfg.base_url || ''}
                      </code>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cfg.default_model || ''}</span>
                      {tr && (
                        tr.status === 'ok'
                          ? <span className="badge badge-success" style={{ fontSize: 10 }}>{tr.latency_ms}ms</span>
                          : <Tooltip text={tr.error || 'Error'}><span className="badge badge-error" style={{ fontSize: 10, cursor: 'help' }}>Error</span></Tooltip>
                      )}
                      <button className="btn btn-sm" onClick={() => handleTest(name)} disabled={testing[name]} style={{ fontSize: 11, color: '#8b5cf6' }}>
                        {testing[name] ? <RefreshCw size={12} className="spin" /> : <TestIcon size={12} />}
                      </button>
                      {!isActive(name) && (
                        <button className="btn btn-sm" onClick={() => handleSetActive(name)} style={{ fontSize: 11 }}>Set Active
                          <Tooltip text={`Switch the active provider to "${name}". This changes the default model and endpoint for all new conversations.`} />
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => handleDelete(name)} style={{ color: '#ef4444', fontSize: 11 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}

                {/* Fallback Providers */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                      Fallback Chain
                      <Tooltip text="Providers tried in order if the active provider fails. Each entry specifies a provider and model to fall back to. Edit fields directly and click Save All to persist." />
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" onClick={handleAddFallback} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <Plus size={12} /> Add Fallback
                        <Tooltip text="Add a new empty fallback provider entry at the end of the chain." />
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={handleSaveFallbacks} disabled={savingFallbacks} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <Save size={12} /> {savingFallbacks ? 'Saving...' : 'Save All'}
                        <Tooltip text="Save all fallback provider entries to config.yaml. Changes are not persisted until you click this button." />
                      </button>
                    </div>
                  </div>
                  {fallbacks.length === 0 && (
                    <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      No fallback providers configured. Click "Add Fallback" to add one.
                    </div>
                  )}
                  {fallbacks.map((fb, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 1fr 40px auto auto auto', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 12, opacity: fb.enabled === false ? 0.5 : 1 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>
                        #{i + 1}
                        <Tooltip text={`Priority ${i + 1}. Fallback providers are tried in order from top to bottom.`} />
                      </span>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                          Provider
                          <Tooltip text="Provider name (e.g. openai, anthropic, custom). Must match a configured provider or be a recognized provider type." />
                        </label>
                        <input
                          className="form-input"
                          style={{ fontSize: 11, padding: '4px 6px' }}
                          placeholder="e.g. openai"
                          value={fb.provider || ''}
                          onChange={e => updateFallback(i, 'provider', e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                          Model
                          <Tooltip text="The model to use with this fallback provider (e.g. gpt-4o, claude-sonnet-4)." />
                        </label>
                        <input
                          className="form-input"
                          style={{ fontSize: 11, padding: '4px 6px' }}
                          placeholder="e.g. gpt-4o"
                          value={fb.model || ''}
                          onChange={e => updateFallback(i, 'model', e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                          API Key
                          <Tooltip text="API key for this fallback provider. Falls back to the default key if empty." />
                        </label>
                        <div className="secret-input-wrap" style={{ fontSize: 11 }}>
                          <input
                            type={fallbackVis[i] ? 'text' : 'password'}
                            className="form-input"
                            style={{ fontSize: 11, padding: '4px 6px' }}
                            placeholder="Optional"
                            value={fb.api_key || ''}
                            onChange={e => updateFallback(i, 'api_key', e.target.value)}
                          />
                          <button type="button" className="secret-toggle-btn" onClick={() => setFallbackVis(prev => ({ ...prev, [i]: !prev[i] }))} style={{ padding: 2 }}>
                            {fallbackVis[i] ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                          Base URL
                          <Tooltip text="Custom API endpoint URL for this fallback. Only needed if different from the provider's default." />
                        </label>
                        <input
                          className="form-input"
                          style={{ fontSize: 11, padding: '4px 6px' }}
                          placeholder="https://api.example.com/v1"
                          value={fb.base_url || ''}
                          onChange={e => updateFallback(i, 'base_url', e.target.value)}
                        />
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                          Toggle
                          <Tooltip text="Enable or disable this fallback without removing it from the list." />
                        </label>
                        <label className="toggle-wrap" style={{ display: 'inline-flex' }}>
                          <input type="checkbox" checked={fb.enabled !== false} onChange={e => updateFallback(i, 'enabled', e.target.checked)} />
                          <span className="toggle-track" />
                        </label>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button className="btn btn-sm" onClick={() => moveFallback(i, -1)} disabled={i === 0} style={{ padding: '2px 4px', fontSize: 10, lineHeight: 1 }}>
                          <ArrowUp size={11} />
                          <Tooltip text="Move this fallback up (higher priority)." />
                        </button>
                        <button className="btn btn-sm" onClick={() => moveFallback(i, 1)} disabled={i === fallbacks.length - 1} style={{ padding: '2px 4px', fontSize: 10, lineHeight: 1 }}>
                          <ArrowDown size={11} />
                          <Tooltip text="Move this fallback down (lower priority)." />
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <button className="btn btn-sm" onClick={() => handleTestFallback(i)} disabled={fallbackTesting[i]} style={{ fontSize: 10, color: '#8b5cf6', padding: '2px 4px' }}>
                          {fallbackTesting[i] ? <RefreshCw size={11} className="spin" /> : <TestIcon size={11} />}
                          <Tooltip text="Test connectivity to this fallback provider with the current settings." />
                        </button>
                        {fallbackTestResults[i] && (
                          fallbackTestResults[i].status === 'ok'
                            ? <span className="badge badge-success" style={{ fontSize: 9 }}>{fallbackTestResults[i].latency_ms}ms</span>
                            : <Tooltip text={fallbackTestResults[i].error || 'Error'}><span className="badge badge-error" style={{ fontSize: 9, cursor: 'help' }}>Err</span></Tooltip>
                        )}
                        <button className="btn btn-sm" onClick={() => removeFallback(i)} style={{ fontSize: 10, color: '#ef4444', padding: '2px 4px' }}>
                          <Trash2 size={11} />
                          <Tooltip text="Remove this fallback entry from the chain." />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Auxiliary Provider Chain */}
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                      Auxiliary Provider Chain
                      <Tooltip text="Order in which auxiliary task providers (compression, session search, web extraction) are tried. Top-to-bottom priority." />
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => setAuxShowAdd(!auxShowAdd)} disabled={auxAvailableToAdd.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <Plus size={12} /> Add Provider
                        <Tooltip text="Add a provider to the auxiliary chain from the available options." />
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={handleSaveAuxChain} disabled={auxSaving} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <Save size={12} /> {auxSaving ? 'Saving...' : 'Save'}
                        <Tooltip text="Save the auxiliary chain order to ~/.hermes/auxiliary_chain.yaml" />
                      </button>
                      {auxCustom && (
                        <button className="btn btn-sm" onClick={handleResetAuxChain} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#ef4444' }}>
                          <RotateCcw size={12} /> Reset to Defaults
                          <Tooltip text="Delete the custom config file and revert to hardcoded default order." />
                        </button>
                      )}
                    </div>
                  </div>
                  {!auxCustom && (
                    <div style={{ padding: '4px 8px', marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Using default order (edit and save to customize)
                    </div>
                  )}
                  {auxShowAdd && auxAvailableToAdd.length > 0 && (
                    <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {auxAvailableToAdd.map(id => (
                        <button key={id} className="btn btn-sm" onClick={() => addAuxItem(id)} style={{ fontSize: 11 }}>
                          + {auxAvailable[id] || id}
                          <Tooltip text={AUX_DESCRIPTIONS[id] || ''} />
                        </button>
                      ))}
                    </div>
                  )}
                  {auxChain.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-muted)', minWidth: 24, textAlign: 'center' }}>#{i + 1}</span>
                      <span style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{item.label || item.id}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({item.id})</span>
                        <Tooltip text={AUX_DESCRIPTIONS[item.id] || ''} />
                      </span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button className="btn btn-sm" onClick={() => moveAuxItem(i, -1)} disabled={i === 0} style={{ padding: '2px 4px', fontSize: 10, lineHeight: 1 }}>
                          <ArrowUp size={11} />
                          <Tooltip text="Move up (higher priority)" />
                        </button>
                        <button className="btn btn-sm" onClick={() => moveAuxItem(i, 1)} disabled={i === auxChain.length - 1} style={{ padding: '2px 4px', fontSize: 10, lineHeight: 1 }}>
                          <ArrowDown size={11} />
                          <Tooltip text="Move down (lower priority)" />
                        </button>
                      </div>
                      <button className="btn btn-sm" onClick={() => removeAuxItem(i)} style={{ fontSize: 10, color: '#ef4444', padding: '2px 4px' }}>
                        <Trash2 size={11} />
                        <Tooltip text="Remove this provider from the auxiliary chain." />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Personality Creator Section ──

function PersonalityCreatorSection({ config, onChange }) {
  const [personalities, setPersonalities] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newPersonality, setNewPersonality] = useState({ name: '', system_prompt: '', description: '', tone: '', style: '' })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.listPersonalities()
      setPersonalities(data.personalities || [])
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const customPersonalities = personalities.filter(p => !p.builtin)

  const handleSave = async () => {
    if (!newPersonality.name || !newPersonality.system_prompt) return
    try {
      setSaving(true)
      await api.createPersonality(
        newPersonality.name, newPersonality.system_prompt,
        newPersonality.description, newPersonality.tone, newPersonality.style
      )
      toast.success(`Personality "${newPersonality.name}" saved`)
      setShowCreate(false)
      setNewPersonality({ name: '', system_prompt: '', description: '', tone: '', style: '' })
      await load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name) => {
    try {
      await api.deletePersonality(name)
      toast.success(`Personality "${name}" deleted`)
      await load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="accordion-card">
      <div className="accordion-header" style={{ cursor: 'default' }}>
        <Smile size={18} className="accordion-icon" />
        <span className="accordion-title">Custom Personalities</span>
        <span className="field-count">{customPersonalities.length} custom</span>
        <Tooltip text="Create and manage custom AI personalities. Each personality defines a unique system prompt that changes how the AI responds." />
        <button
          className="btn btn-sm btn-primary"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus size={12} /> Create
          <Tooltip text="Create a new custom personality with a name, system prompt, and optional tone/style settings." />
        </button>
      </div>
      {showCreate && (
        <div className="accordion-body" style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="field-group">
              <label className="field-label">
                Name
                <Tooltip text="Unique name for this personality. Use lowercase with dashes (e.g. 'code-reviewer')." />
              </label>
              <input
                className="form-input"
                placeholder="e.g. code-reviewer"
                value={newPersonality.name}
                onChange={e => setNewPersonality({ ...newPersonality, name: e.target.value })}
              />
            </div>
            <div className="field-group" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">
                System Prompt
                <Tooltip text="The core prompt that defines how this personality behaves. Be specific about tone, style, and behavior." />
              </label>
              <textarea
                className="form-textarea"
                placeholder="You are a meticulous code reviewer. Focus on bugs, security issues, and performance..."
                value={newPersonality.system_prompt}
                onChange={e => setNewPersonality({ ...newPersonality, system_prompt: e.target.value })}
                style={{ minHeight: 80, fontSize: 12, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div className="field-group">
                <label className="field-label">
                  Description
                  <Tooltip text="Brief description of what this personality does." />
                </label>
                <input
                  className="form-input"
                  placeholder="Optional description"
                  value={newPersonality.description}
                  onChange={e => setNewPersonality({ ...newPersonality, description: e.target.value })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">
                  Tone
                  <Tooltip text="Communication tone (e.g. 'formal', 'casual', 'enthusiastic')." />
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. formal"
                  value={newPersonality.tone}
                  onChange={e => setNewPersonality({ ...newPersonality, tone: e.target.value })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">
                  Style
                  <Tooltip text="Communication style (e.g. 'bullet points', 'conversational')." />
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. bullet points"
                  value={newPersonality.style}
                  onChange={e => setNewPersonality({ ...newPersonality, style: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !newPersonality.name || !newPersonality.system_prompt}>
                <Save size={12} /> {saving ? 'Saving...' : 'Save Personality'}
              </button>
            </div>
          </div>
        </div>
      )}
      {customPersonalities.length > 0 && (
        <div style={{ padding: '8px 16px' }}>
          {customPersonalities.map(p => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(p.description || p.system_prompt || '').slice(0, 80)}
              </span>
              <button className="btn btn-sm" onClick={() => handleDelete(p.name)} style={{ color: '#ef4444', fontSize: 11 }}>
                <Trash2 size={12} />
                <Tooltip text={`Delete custom personality "${p.name}". This cannot be undone.`} />
              </button>
            </div>
          ))}
        </div>
      )}
      {customPersonalities.length === 0 && !showCreate && (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          No custom personalities yet. Click "Create" to add one.
        </div>
      )}
    </div>
  )
}

// ── System Prompt Viewer Section ──

function SystemPromptSection() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [savingCustom, setSavingCustom] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [promptData, customData] = await Promise.all([
        api.getSystemPrompt(),
        api.getCustomPrompt(),
      ])
      setData(promptData)
      setCustomPrompt(customData.content || '')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { if (isOpen) load() }, [isOpen, load])

  const handleSaveCustom = async () => {
    try {
      setSavingCustom(true)
      await api.saveCustomPrompt(customPrompt)
      toast.success('Custom prompt saved')
      await load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSavingCustom(false)
    }
  }

  const comp = data?.components || {}

  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <FileText size={18} className="accordion-icon" />
        <span className="accordion-title">System Prompt Viewer</span>
        <span className="field-count">{data ? `${data.estimated_tokens || 0} tokens` : 'preview'}</span>
        <Tooltip text="Preview the assembled system prompt from all components: SOUL.md, personality, memory context, and custom prompts. Edit the custom prefill prompt here." />
        <span className="accordion-chevron">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </div>
      {isOpen && (
        <div className="accordion-body" style={{ padding: 0 }}>
          {loading ? <div className="spinner" style={{ margin: 20 }} /> : data && (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{data.total_length?.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Characters</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{data.estimated_tokens?.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Est. Tokens</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{Object.values(comp).filter(c => c.content && c.length > 0).length}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Components</div>
                </div>
              </div>

              {/* Components breakdown */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
                  Components
                  <Tooltip text="Each section that contributes to the final system prompt sent to the AI model." />
                </div>
                {[
                  { key: 'soul_md', label: 'SOUL.md', icon: '🧠' },
                  { key: 'personality', label: 'Personality', icon: '🎭' },
                  { key: 'memory_md', label: 'Memory (MEMORY.md)', icon: '💾' },
                  { key: 'custom_prompt', label: 'Custom Prompt', icon: '✏️' },
                  { key: 'reasoning', label: 'Reasoning Config', icon: '⚡' },
                  { key: 'model', label: 'Model Config', icon: '🤖' },
                ].map(item => {
                  const c = comp[item.key]
                  if (!c) return null
                  const hasContent = c.content && c.length > 0
                  return (
                    <details key={item.key} style={{ marginBottom: 8 }}>
                      <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
                        <span>{item.icon}</span>
                        <span style={{ fontWeight: 600 }}>{item.label}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.length || 0} chars</span>
                        {hasContent
                          ? <span className="badge badge-success" style={{ fontSize: 9 }}>LOADED</span>
                          : <span className="badge badge-error" style={{ fontSize: 9 }}>EMPTY</span>
                        }
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{c.source}</span>
                      </summary>
                      <div style={{ background: 'var(--bg-secondary)', borderRadius: 6, padding: 8, marginTop: 4, maxHeight: 200, overflow: 'auto' }}>
                        <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-secondary)' }}>
                          {hasContent ? c.content : '(empty)'}
                        </pre>
                      </div>
                    </details>
                  )
                })}
              </div>

              {/* Custom Prompt Editor */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Custom Prefill Prompt</span>
                  <Tooltip text="Additional instructions injected at the start of every API call. Use JSON format for multiple messages: [{&quot;role&quot;:&quot;system&quot;,&quot;content&quot;:&quot;...&quot;}]. Or plain text for a single system message." />
                </div>
                <textarea
                  className="form-textarea"
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                  placeholder='Enter custom prompt text, or JSON array: [{"role":"system","content":"Always respond in French"}]'
                  style={{ minHeight: 100, fontSize: 12, fontFamily: 'var(--font-mono)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-sm btn-primary" onClick={handleSaveCustom} disabled={savingCustom}>
                    <Save size={12} /> {savingCustom ? 'Saving...' : 'Save Custom Prompt'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Auxiliary Models Section ──

const AUX_PROVIDERS = [
  { key: 'vision', label: 'Vision', desc: 'Image analysis and OCR. Uses Pixtral or other vision models to analyze screenshots, photos, and documents.' },
  { key: 'web_extract', label: 'Web Extract', desc: 'Web page content extraction. Summarizes and extracts key information from fetched web pages.' },
  { key: 'compression', label: 'Compression', desc: 'Context compression/summarization. Summarizes old conversation history to save tokens in long sessions.' },
  { key: 'session_search', label: 'Session Search', desc: 'Searches past conversation history for relevant context. Helps the agent recall previous interactions.' },
  { key: 'skills_hub', label: 'Skills Hub', desc: 'Skills marketplace analysis. Evaluates and recommends skills from the hub based on user needs.' },
  { key: 'approval', label: 'Approval', desc: 'Smart approval decisions. Uses an LLM to auto-approve or reject tool calls based on risk assessment.' },
  { key: 'mcp', label: 'MCP', desc: 'MCP server sampling. Handles LLM callbacks from MCP servers that request model completions.' },
  { key: 'flush_memories', label: 'Flush Memories', desc: 'Memory flush processing. Summarizes and stores accumulated memories during conversation.' },
]

function AuxiliaryModelsSection({ config, onChange }) {
  const [isOpen, setIsOpen] = useState(false)

  const aux = config?.auxiliary || {}

  const handleChange = (subKey, field, value) => {
    onChange(`auxiliary.${subKey}.${field}`, value)
  }

  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <Boxes size={18} className="accordion-icon" />
        <span className="accordion-title">Auxiliary Models</span>
        <span className="field-count">{AUX_PROVIDERS.length} sub-providers</span>
        <Tooltip text="Configure the 8 auxiliary LLM sub-providers used for specific tasks (vision, compression, web extraction, etc.). Each can use a different model/provider than the main one." />
        <span className="accordion-chevron">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </div>
      {isOpen && (
        <div className="accordion-body" style={{ padding: 0 }}>
          {AUX_PROVIDERS.map((prov, idx) => {
            const sub = aux[prov.key] || {}
            const isAuto = (sub.provider || 'auto') === 'auto'
            return (
              <div key={prov.key} style={{ padding: '12px 16px', borderBottom: idx < AUX_PROVIDERS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{prov.label}</span>
                  <Tooltip text={prov.desc} />
                  {isAuto ? (
                    <span className="badge badge-info" style={{ fontSize: 10 }}>Auto (inherits main)</span>
                  ) : (
                    <span className="badge badge-success" style={{ fontSize: 10 }}>Custom</span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 80px', gap: 8, alignItems: 'center' }}>
                  <div>
                    <label className="field-label" style={{ fontSize: 11 }}>Provider</label>
                    <select className="form-select" style={{ fontSize: 12 }} value={sub.provider || 'auto'} onChange={e => handleChange(prov.key, 'provider', e.target.value)}>
                      <option value="auto">auto</option>
                      <option value="openai">openai</option>
                      <option value="anthropic">anthropic</option>
                      <option value="mistral">mistral</option>
                      <option value="google">google</option>
                      <option value="deepseek">deepseek</option>
                      <option value="custom">custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label" style={{ fontSize: 11 }}>Model
                      <Tooltip text="Model name for this auxiliary task. Empty = inherits from main model." />
                    </label>
                    <input className="form-input" style={{ fontSize: 12 }} placeholder="e.g. pixtral-large-latest" value={sub.model || ''} onChange={e => handleChange(prov.key, 'model', e.target.value || null)} />
                  </div>
                  <div>
                    <label className="field-label" style={{ fontSize: 11 }}>Base URL
                      <Tooltip text="Custom API endpoint. Only needed when provider is 'custom'." />
                    </label>
                    <input className="form-input" style={{ fontSize: 12 }} placeholder="https://api.example.com/v1" value={sub.base_url || ''} onChange={e => handleChange(prov.key, 'base_url', e.target.value || null)} />
                  </div>
                  <div>
                    <label className="field-label" style={{ fontSize: 11 }}>Timeout (s)
                      <Tooltip text="Request timeout for this sub-provider in seconds." />
                    </label>
                    <input className="form-input" type="number" style={{ fontSize: 12 }} min="5" max="600" value={sub.timeout ?? ''} onChange={e => handleChange(prov.key, 'timeout', e.target.value ? Number(e.target.value) : null)} />
                  </div>
                </div>
                {!isAuto && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginTop: 6, alignItems: 'center' }}>
                    <div>
                      <label className="field-label" style={{ fontSize: 11 }}>API Key
                        <Tooltip text="API key for this sub-provider. Falls back to the main model API key if empty." />
                      </label>
                      <input className="form-input" type="password" style={{ fontSize: 12 }} placeholder="Leave empty to inherit main key" value={sub.api_key || ''} onChange={e => handleChange(prov.key, 'api_key', e.target.value || null)} />
                    </div>
                    {prov.key === 'vision' && (
                      <div>
                        <label className="field-label" style={{ fontSize: 11 }}>Download Timeout (s)
                          <Tooltip text="Timeout for downloading images before analysis." />
                        </label>
                        <input className="form-input" type="number" style={{ fontSize: 12 }} min="5" max="120" value={sub.download_timeout ?? ''} onChange={e => handleChange(prov.key, 'download_timeout', e.target.value ? Number(e.target.value) : null)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Platform Toolsets Section ──

const ALL_PLATFORMS = ['cli', 'telegram', 'discord', 'slack', 'whatsapp', 'signal', 'homeassistant', 'mattermost', 'matrix', 'dingtalk', 'feishu', 'wecom', 'email']
const ALL_TOOLSETS = ['browser', 'web', 'vision', 'image_gen', 'terminal', 'file', 'code_execution', 'memory', 'session_search', 'tts', 'skills', 'delegation', 'cronjob', 'clarify', 'todo', 'moa', 'homeassistant']

function PlatformToolsetsSection({ config, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const pt = config?.platform_toolsets || {}

  const toggleToolset = (platform, toolset) => {
    const current = pt[platform] || []
    const next = current.includes(toolset)
      ? current.filter(t => t !== toolset)
      : [...current, toolset]
    onChange(`platform_toolsets.${platform}`, next.length > 0 ? next : null)
  }

  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <LayoutGrid size={18} className="accordion-icon" />
        <span className="accordion-title">Platform Toolsets</span>
        <span className="field-count">{Object.keys(pt).length} platforms</span>
        <Tooltip text="Control which tools are available on each platform. Rows are platforms (Telegram, Discord, etc.), columns are toolsets (web, browser, tts, etc.). Only enabled toolsets are accessible from that platform." />
        <span className="accordion-chevron">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </div>
      {isOpen && (
        <div className="accordion-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 1, minWidth: 100 }}>Platform</th>
                {ALL_TOOLSETS.map(ts => (
                  <th key={ts} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 10, writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxWidth: 30 }}>
                    <Tooltip text={`Toggle ${ts} for this platform`}>{ts}</Tooltip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_PLATFORMS.map(plat => {
                const active = pt[plat] || []
                return (
                  <tr key={plat} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 12px', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 1 }}>
                      {plat}
                      <Tooltip text={`Toolsets available on ${plat}. Click cells to toggle.`} />
                    </td>
                    {ALL_TOOLSETS.map(ts => {
                      const enabled = active.includes(ts)
                      return (
                        <td key={ts} style={{ padding: 0, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => toggleToolset(plat, ts)}
                            style={{
                              width: 26, height: 26, border: 'none', borderRadius: 4,
                              background: enabled ? 'var(--success)' : 'var(--bg-secondary)',
                              color: enabled ? '#fff' : 'var(--text-muted)', cursor: 'pointer',
                              fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                            title={enabled ? `Disable ${ts} on ${plat}` : `Enable ${ts} on ${plat}`}
                          >
                            {enabled ? '✓' : ''}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Channel Prompts Section ──

const CHANNEL_PROMPT_PLATFORMS = ['discord', 'telegram', 'slack', 'mattermost', 'whatsapp']

function ChannelPromptsSection({ config, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [editPlatform, setEditPlatform] = useState(null)
  const [newChannelId, setNewChannelId] = useState('')
  const [newPromptText, setNewPromptText] = useState('')

  const getPrompts = (platform) => {
    const val = config?.[platform]?.channel_prompts
    if (!val || typeof val !== 'object') return {}
    return val
  }

  const addPrompt = (platform) => {
    if (!newChannelId.trim() || !newPromptText.trim()) return
    const current = getPrompts(platform)
    const updated = { ...current, [newChannelId.trim()]: newPromptText.trim() }
    onChange(`${platform}.channel_prompts`, updated)
    setNewChannelId('')
    setNewPromptText('')
  }

  const removePrompt = (platform, channelId) => {
    const current = getPrompts(platform)
    const updated = { ...current }
    delete updated[channelId]
    onChange(`${platform}.channel_prompts`, Object.keys(updated).length > 0 ? updated : null)
  }

  const activePlatforms = CHANNEL_PROMPT_PLATFORMS.filter(p => {
    const prompts = getPrompts(p)
    return Object.keys(prompts).length > 0
  })

  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <MessageSquare size={18} className="accordion-icon" />
        <span className="accordion-title">Channel Prompts</span>
        <span className="field-count">{activePlatforms.length} platforms</span>
        <Tooltip text="Configure custom system prompts per channel. Each channel ID can have its own prompt that overrides the default personality. Used for platform-specific behavior (e.g. a support channel gets a different personality)." />
        <span className="accordion-chevron">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </div>
      {isOpen && (
        <div className="accordion-body" style={{ padding: 0 }}>
          {CHANNEL_PROMPT_PLATFORMS.map((platform, idx) => {
            const prompts = getPrompts(platform)
            const entries = Object.entries(prompts)
            return (
              <div key={platform} style={{ padding: '12px 16px', borderBottom: idx < CHANNEL_PROMPT_PLATFORMS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{platform}</span>
                  <span className="badge badge-info" style={{ fontSize: 10 }}>{entries.length} prompts</span>
                  <Tooltip text={`Channel-specific prompts for ${platform}. Format: channel_id = custom system prompt text.`} />
                  <button className="btn btn-sm" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => setEditPlatform(editPlatform === platform ? null : platform)}>
                    {editPlatform === platform ? 'Close' : 'Edit'}
                  </button>
                </div>
                {entries.length > 0 && editPlatform !== platform && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {entries.map(([chId, prompt]) => (
                      <div key={chId} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <code style={{ fontSize: 11, color: 'var(--accent)', minWidth: 80 }}>{chId}</code>
                        <span style={{ flex: 1, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prompt}</span>
                      </div>
                    ))}
                  </div>
                )}
                {editPlatform === platform && (
                  <div>
                    {entries.map(([chId, prompt]) => (
                      <div key={chId} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <code style={{ fontSize: 11, color: 'var(--accent)', minWidth: 80 }}>{chId}</code>
                        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>{prompt.slice(0, 100)}{prompt.length > 100 ? '...' : ''}</span>
                        <button className="btn btn-sm btn-danger-icon" onClick={() => removePrompt(platform, chId)}><Trash2 size={11} /></button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input className="form-input" style={{ fontSize: 12, width: 140 }} placeholder="Channel ID" value={newChannelId} onChange={e => setNewChannelId(e.target.value)} />
                      <input className="form-input" style={{ fontSize: 12, flex: 1 }} placeholder="Custom prompt text" value={newPromptText} onChange={e => setNewPromptText(e.target.value)} />
                      <button className="btn btn-sm btn-primary" onClick={() => addPrompt(platform)} disabled={!newChannelId.trim() || !newPromptText.trim()}>
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Checkpoint Manager Section ──

function CheckpointManagerSection() {
  const [checkpoints, setCheckpoints] = useState([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [restoring, setRestoring] = useState({})
  const [deleting, setDeleting] = useState({})
  const { toast } = useToast()

  const loadCheckpoints = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.listCheckpoints()
      setCheckpoints(data.checkpoints || [])
      setLoaded(true)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (isOpen && !loaded) loadCheckpoints()
  }, [isOpen, loaded, loadCheckpoints])

  const handleRestore = async (sessionId) => {
    setRestoring(prev => ({ ...prev, [sessionId]: true }))
    try {
      const result = await api.restoreCheckpoint(sessionId)
      toast.success(`Checkpoint "${sessionId}" restored (commit ${result.commit})`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setRestoring(prev => ({ ...prev, [sessionId]: false }))
    }
  }

  const handleDelete = async (sessionId) => {
    if (!confirm(`Delete checkpoint "${sessionId}"? This cannot be undone.`)) return
    setDeleting(prev => ({ ...prev, [sessionId]: true }))
    try {
      await api.deleteCheckpoint(sessionId)
      toast.success(`Checkpoint "${sessionId}" deleted`)
      setCheckpoints(prev => prev.filter(c => c.session_id !== sessionId))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(prev => ({ ...prev, [sessionId]: false }))
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleString()
    } catch {
      return dateStr
    }
  }

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
  }

  return (
    <div className="accordion-card">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        <Archive size={18} className="accordion-icon" />
        <span className="accordion-title">Checkpoint Manager</span>
        <span className="field-count">{checkpoints.length} snapshots</span>
        <Tooltip text="View, restore, and delete session checkpoint snapshots. Checkpoints save conversation state periodically so you can resume interrupted sessions." />
        <span className="accordion-chevron">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </div>
      {isOpen && (
        <div className="accordion-body" style={{ padding: 0 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Session Snapshots</span>
            <button
              className="btn btn-sm btn-primary"
              onClick={loadCheckpoints}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={12} className={loading ? 'spin' : ''} />
              List Snapshots
              <Tooltip text="Scan ~/.hermes/checkpoints/ for available snapshots and refresh the table." />
            </button>
          </div>
          {loading && !checkpoints.length ? (
            <div className="spinner" style={{ margin: 20 }} />
          ) : checkpoints.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No checkpoints found. Enable checkpoints in the Sessions & Approvals section above.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>
                    Snapshot
                    <Tooltip text="Session identifier for this checkpoint." />
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>
                    Date
                    <Tooltip text="Date of the most recent commit in this checkpoint." />
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'left' }}>
                    Commits
                    <Tooltip text="Number of snapshots (commits) stored in this checkpoint." />
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right' }}>
                    Size
                    <Tooltip text="Total disk space used by this checkpoint." />
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {checkpoints.map(cp => {
                  const lastCommit = cp.commits?.[0]
                  return (
                    <tr key={cp.session_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {cp.session_id.slice(0, 16)}{cp.session_id.length > 16 ? '...' : ''}
                        </div>
                        {lastCommit?.message && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {lastCommit.message.slice(0, 50)}{lastCommit.message.length > 50 ? '...' : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {lastCommit ? formatDate(lastCommit.date) : 'N/A'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span className="badge badge-info" style={{ fontSize: 10 }}>
                          {cp.commit_count || 0}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {formatSize(cp.total_size || 0)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleRestore(cp.session_id)}
                            disabled={restoring[cp.session_id]}
                            style={{ fontSize: 11, color: '#22c55e' }}
                          >
                            <RotateCcw size={11} />
                            {restoring[cp.session_id] ? '...' : ' Restore'}
                            <Tooltip text={`Restore checkpoint "${cp.session_id.slice(0, 12)}..." to its latest committed state.`} />
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => handleDelete(cp.session_id)}
                            disabled={deleting[cp.session_id]}
                            style={{ fontSize: 11, color: '#ef4444' }}
                          >
                            <Trash2 size={11} />
                            {deleting[cp.session_id] ? '...' : ' Delete'}
                            <Tooltip text={`Permanently delete this checkpoint. This frees disk space and cannot be undone.`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}


// ── TTS Test Button ──

function TTSTestButton({ config }) {
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(null)
  const { toast } = useToast()
  const audioRef = useRef(null)

  const handleTest = async () => {
    setPlaying(true)
    setError(null)
    try {
      const provider = config?.tts?.provider || 'edge'
      const blob = await api.ttsTest('Hello, this is a test of the text-to-speech system.', provider)
      if (blob.size === 0) {
        setError('No audio received')
        setPlaying(false)
        return
      }
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setPlaying(false)
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setError('Audio playback failed')
        setPlaying(false)
      }
      audio.play().catch(e => {
        setError('Playback error: ' + e.message)
        setPlaying(false)
      })
    } catch (e) {
      setError(e.message || 'TTS test failed')
      setPlaying(false)
    }
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        className="btn btn-sm btn-primary"
        onClick={handleTest}
        disabled={playing}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        {playing ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
        {playing ? 'Playing...' : 'Test Voice'}
        <Tooltip text="Generate a short audio sample using the configured TTS provider and play it back. This tests that your TTS configuration is working correctly." />
      </button>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Provider: {config?.tts?.provider || 'edge'}
        <Tooltip text="The current TTS provider that will be used for the test." />
      </span>
      {error && (
        <span style={{ fontSize: 11, color: 'var(--error)' }}>{error}</span>
      )}
    </div>
  )
}


// ── Active Subagents Indicator ──

function ActiveSubagentsIndicator() {
  const [data, setData] = useState({ active: [], count: 0 })

  useEffect(() => {
    api.delegationActive().then(setData).catch(() => {})
    const interval = setInterval(() => {
      api.delegationActive().then(setData).catch(() => {})
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const count = data.count || 0
  const color = count === 0 ? 'var(--success)' : 'var(--warning)'

  return (
    <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Active Subagents</span>
      <Tooltip text="Number of subagent child processes currently running. These are delegate_task child agents spawned by the parent agent for parallel execution." />
      <span
        className="badge"
        style={{
          fontSize: 12,
          padding: '4px 10px',
          background: count === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
          color: color,
          border: `1px solid ${color}`,
          fontWeight: 600,
        }}
      >
        {count} active
      </span>
    </div>
  )
}

// ── Approval History Section ──

function ApprovalHistorySection() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.approvalHistory().then(data => {
      setHistory(data.entries || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try { return new Date(dateStr.replace(' ', 'T')).toLocaleString() } catch { return dateStr }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Approval History</span>
        <Tooltip text="Recent approval decisions from log files. Shows whether tool calls and commands were approved or denied by the user or auto-approval system." />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {history.length} entries
        </span>
      </div>
      {loading ? (
        <div className="spinner" style={{ margin: '10px auto' }} />
      ) : history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
          No approval history found in logs.
        </div>
      ) : (
        <div style={{ maxHeight: 250, overflow: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>
                  Date
                  <Tooltip text="When the approval decision was made." />
                </th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>
                  Command
                  <Tooltip text="The tool call or command that was evaluated." />
                </th>
                <th style={{ padding: '6px 10px', textAlign: 'center' }}>
                  Status
                  <Tooltip text="Whether the command was approved or denied." />
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {formatDate(entry.date)}
                  </td>
                  <td style={{ padding: '5px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.command}
                  </td>
                  <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                    <span className={`badge ${entry.status === 'approved' ? 'badge-success' : 'badge-error'}`} style={{ fontSize: 10 }}>
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main Component ──

export default function Config() {
  const [originalConfig, setOriginalConfig] = useState(null)
  const [workingConfig, setWorkingConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openSections, setOpenSections] = useState(() => new Set(['model']))
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.getConfig()
      const config = data.config || {}
      setOriginalConfig(JSON.parse(JSON.stringify(config)))
      setWorkingConfig(JSON.parse(JSON.stringify(config)))
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleChange = useCallback((key, value) => {
    setWorkingConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      setDeepValue(next, key, value)
      return next
    })
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      await api.saveStructuredConfig(workingConfig)
      await load()
      toast.success('Configuration saved successfully')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setWorkingConfig(JSON.parse(JSON.stringify(originalConfig)))
    toast.info('Changes discarded')
  }

  const toggleSection = (id) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setOpenSections(new Set(SECTIONS.map(s => s.id)))
  const collapseAll = () => setOpenSections(new Set())

  // Load custom personalities to merge into the select
  const [customPersonalityNames, setCustomPersonalityNames] = useState([])
  useEffect(() => {
    api.listPersonalities().then(data => {
      const names = (data.personalities || []).filter(p => !p.builtin).map(p => p.name)
      setCustomPersonalityNames(names)
    }).catch(() => {})
  }, [])

  const getPersonalityOptions = () => {
    const base = ['default', 'helpful', 'concise', 'technical', 'creative', 'teacher', 'kawaii', 'catgirl', 'pirate', 'shakespeare', 'surfer', 'noir', 'uwu', 'philosopher', 'hype']
    return [...base, ...customPersonalityNames.filter(n => !base.includes(n))]
  }

  if (loading) return <div className="spinner" />
  if (error) return <div className="error-box">{error}</div>
  if (!workingConfig) return null

  const hasChanges = JSON.stringify(workingConfig) !== JSON.stringify(originalConfig)

  const isSectionChanged = (section) => {
    if (!originalConfig) return false
    return section.fields.some(f => {
      const orig = getDeepValue(originalConfig, f.key)
      const curr = getDeepValue(workingConfig, f.key)
      return orig !== curr
    })
  }

  return (
    <div>
      <div className="page-title">
        <Settings size={28} />
        Configuration
        <Tooltip text="Edit your Hermes Agent configuration. Changes are saved to ~/.hermes/config.yaml. Each section groups related settings. Hover the info icons for detailed explanations." />
        <div className="config-actions">
          <button className="btn btn-sm" onClick={expandAll}>Expand all</button>
          <button className="btn btn-sm" onClick={collapseAll}>Collapse all</button>
          {hasChanges && (
            <button className="btn btn-sm" onClick={handleReset}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !hasChanges}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save All'}
            {hasChanges && <span className="save-badge" />}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {SECTIONS.map(section => {
        const Icon = section.icon
        const isOpen = openSections.has(section.id)
        const changed = isSectionChanged(section)

        return (
          <div key={section.id} className="accordion-card">
            <div className="accordion-header" onClick={() => toggleSection(section.id)}>
              <Icon size={18} className="accordion-icon" />
              <span className="accordion-title">{section.title}</span>
              <span className="field-count">{section.fields.length} settings</span>
              <Tooltip text={section.desc} />
              {changed && <span className="changed-dot" />}
              <span className="accordion-chevron">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </div>
            {isOpen && (
              <div className="accordion-body">
                {/* TTS Test Button */}
                {section.id === 'tts' && (
                  <div className="field-group" style={{ gridColumn: '1 / -1' }}>
                    <TTSTestButton config={workingConfig} />
                  </div>
                )}
                {section.fields.map(field => {
                  // YOLO toggle — special widget
                  if (field.type === 'yolo') {
                    const approvalMode = getDeepValue(workingConfig, 'approvals.mode')
                    return (
                      <div key={field.key} className="field-group">
                        <label className="field-label">
                          {field.label}
                          <Tooltip text="Quick toggle to enable/disable YOLO mode (auto-approve all tool calls)." />
                        </label>
                        <YoloButton
                          approvalMode={approvalMode}
                          approvalOnChange={v => handleChange('approvals.mode', v)}
                        />
                      </div>
                    )
                  }
                  const value = getDeepValue(workingConfig, field.key)
                  // Use dynamic personality options for display.personality
                  const fieldDef = field.key === 'display.personality'
                    ? { ...field, options: getPersonalityOptions() }
                    : field
                  return (
                    <div
                      key={field.key}
                      className={`field-group ${field.type === 'secret' ? 'full-width' : ''}`}
                    >
                      <label className="field-label">
                        {field.label}
                        <Tooltip text={field.desc} />
                      </label>
                      <FieldWidget
                        field={fieldDef}
                        value={value}
                        onChange={v => handleChange(field.key, v)}
                      />
                    </div>
                  )
                })}
                {/* Active Subagents Indicator */}
                {section.id === 'delegation' && (
                  <ActiveSubagentsIndicator />
                )}
                {/* Approval History */}
                {section.id === 'sessions' && (
                  <ApprovalHistorySection />
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Special sections */}
      <AuxiliaryModelsSection config={workingConfig} onChange={handleChange} />
      <PlatformToolsetsSection config={workingConfig} onChange={handleChange} />
      <ChannelPromptsSection config={workingConfig} onChange={handleChange} />
      <ProviderRoutingSection config={workingConfig} />
      <PersonalityCreatorSection config={workingConfig} onChange={handleChange} />
      <SystemPromptSection />
      <CheckpointManagerSection />

    </div>
  )
}
