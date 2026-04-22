import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Save, RotateCcw, ChevronDown, ChevronRight,
  Cpu, Sparkles, Terminal as TerminalIcon, Globe, Monitor,
  Zap, Database, Volume2, Shield, Archive, Layers, Code, Plug,
  Eye, EyeOff, Check, X, Brain, GitBranch, Wrench, Clock,
  Route, FileText, Plus, Trash2, RefreshCw, Zap as TestIcon,
  AlertTriangle, Skull, Smile, XCircle, Boxes,
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
      { key: 'display.show_cost', label: 'Show Cost', type: 'toggle', desc: 'Display token usage and estimated cost after each response. Useful for monitoring API spending.' },
      { key: 'display.bell_on_complete', label: 'Bell on Complete', type: 'toggle', desc: 'Play a terminal bell sound when a response completes. Useful when multitasking — you\'ll hear when the AI is done.' },
      { key: 'display.tool_progress_command', label: 'Tool Progress Command', type: 'toggle', desc: 'Enable the /verbose command in messaging gateways to toggle tool progress display on the fly.' },
      { key: 'display.tool_preview_length', label: 'Tool Preview Length', type: 'number', min: 0, max: 1000, desc: 'Number of characters to preview from tool outputs inline. 0 disables preview entirely. Set to 200-500 for useful summaries without clutter.' },
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
      { key: 'tts.provider', label: 'TTS Provider', type: 'select', options: ['edge', 'elevenlabs', 'openai', 'neutts'], desc: 'Text-to-speech engine. "edge" uses free Microsoft Edge TTS (recommended). "elevenlabs" uses ElevenLabs API (high quality, paid). "openai" uses OpenAI TTS. "neutts" runs a local model.' },
      { key: 'tts.edge.voice', label: 'Edge Voice', type: 'text', desc: 'Voice identifier for Edge TTS. Format: "lang-Region-VoiceName". Examples: "fr-FR-DeniseNeural", "en-US-AriaNeural", "en-US-GuyNeural". List voices with: hermes config check.' },
      { key: 'stt.enabled', label: 'STT Enabled', type: 'toggle', desc: 'Enable speech-to-text for voice input. Allows recording audio messages that are transcribed and sent as text to the AI.' },
      { key: 'stt.provider', label: 'STT Provider', type: 'select', options: ['openai', 'local', 'groq'], desc: 'Speech recognition engine. "openai" uses the Whisper API (accurate, requires API key). "local" runs Whisper locally (free, requires model download). "groq" uses Groq\'s fast Whisper.' },
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
      { key: 'discord.auto_thread', label: 'Auto Thread', type: 'toggle', desc: 'Automatically create a Discord thread for each new conversation. Keeps channels organized by grouping related messages together.' },
      { key: 'discord.reactions', label: 'Reactions', type: 'toggle', desc: 'Add emoji reactions to messages for visual feedback (e.g., thinking indicator, completion checkmark). Makes the bot feel more interactive.' },
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
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [p, a, f] = await Promise.all([
        api.listProviders(),
        api.getActiveProvider(),
        api.getFallbackProviders(),
      ])
      setProviders(p.providers || {})
      setActive(a)
      setFallbacks(f.fallback_providers || [])
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
                {fallbacks.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Fallback Chain
                      <Tooltip text="Providers tried in order if the active provider fails. Each entry specifies a provider and model to fall back to." />
                    </div>
                    {fallbacks.map((fb, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 0', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-muted)', width: 24 }}>#{i + 1}</span>
                        <span>{fb.provider}</span>
                        <code style={{ fontSize: 11 }}>{fb.model}</code>
                      </div>
                    ))}
                  </div>
                )}
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
              </div>
            )}
          </div>
        )
      })}

      {/* Special sections */}
      <AuxiliaryModelsSection config={workingConfig} onChange={handleChange} />
      <ProviderRoutingSection config={workingConfig} />
      <PersonalityCreatorSection config={workingConfig} onChange={handleChange} />
      <SystemPromptSection />

    </div>
  )
}
