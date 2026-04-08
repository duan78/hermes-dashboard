import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Save, RotateCcw, ChevronDown, ChevronRight,
  Cpu, Sparkles, Terminal as TerminalIcon, Globe, Monitor,
  Zap, Database, Volume2, Shield, Archive, Layers, Code, Plug,
  Eye, EyeOff, Check, X, Brain, GitBranch, Wrench, Clock,
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
    desc: 'Control agent behavior: how many turns, reasoning depth, and tool call enforcement.',
    fields: [
      { key: 'agent.max_turns', label: 'Max Turns', type: 'number', min: 1, max: 200, desc: 'Maximum tool-calling iterations per conversation. Higher values allow complex multi-step tasks but cost more tokens. Recommended: 60 for simple tasks, 120+ for agentic workflows. Default: 60.' },
      { key: 'agent.tool_use_enforcement', label: 'Tool Enforcement', type: 'select', options: ['auto', 'strict', 'permissive'], desc: 'Forces the model to make actual tool calls instead of describing actions. "auto" enables for GPT models, "strict" forces all models, "permissive" allows descriptive responses.' },
      { key: 'agent.verbose', label: 'Verbose', type: 'toggle', desc: 'Enable verbose logging for debugging. Shows internal decision-making, tool call details, and reasoning traces in the console. Disable in production.' },
      { key: 'agent.reasoning_effort', label: 'Reasoning Effort', type: 'select', options: ['low', 'medium', 'high'], desc: 'Controls how much "thinking" the model does before responding. "low" is faster/cheaper, "high" gives better results on complex tasks at the cost of more tokens and latency.' },
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
                  const value = getDeepValue(workingConfig, field.key)
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
                        field={field}
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

    </div>
  )
}
