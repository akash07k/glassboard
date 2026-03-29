# Glassboard

An accessible web viewer for Claude Code sessions. Built for screen reader users.

Glassboard reads Claude Code's session files from `~/.claude/` and presents them in a fully accessible web interface with real-time updates, sound notifications, bookmarks, and keyboard-first navigation. It runs as a local web server — no data leaves your machine.

## Features

- Browse all Claude Code projects and sessions
- Turn-aware pagination with configurable page size
- Real-time file watching via SSE (new messages appear instantly)
- 33 configurable sound effects for Claude Code events
- OS notifications for important events
- Markdown rendering toggle
- Search within conversations
- Bookmark messages with Go-to navigation
- Export as Markdown, Plain Text, or HTML
- Copy individual messages as Markdown
- Per-event sound, announcement, and notification toggles
- Sound profiles with custom sound file support
- Mute/unmute toggle for quick sound control
- Claude Code plugin for auto-launching

## Accessibility

Glassboard is designed accessibility-first:

- Semantic HTML with ARIA landmarks throughout
- Keyboard shortcuts (Alt+modifier) that don't conflict with screen readers
- Heading hierarchy: h3 for User, h4 for Assistant, h2 for tools/system — press the heading level key in your screen reader to jump between message types
- Turn grouping with section landmarks
- `aria-live` regions for all state changes
- Native HTML controls (no custom widgets)
- `<details>/<summary>` for collapsible tool output
- Accessible data table for keyboard shortcuts reference

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Alt+j / Alt+k | Next / previous message |
| Alt+t / Alt+Shift+t | Next / previous turn |
| Alt+g | Jump to latest message |
| Alt+u | Latest user message |
| Alt+Shift+u | Cycle through user messages |
| Alt+a | Latest assistant response |
| Alt+Shift+a | Cycle through assistant responses |
| Alt+b | Toggle bookmark on focused message |
| Alt+Shift+b | Jump to next bookmark |
| Alt+e | Export conversation |
| Alt+s | Focus search |
| Alt+n / Alt+Shift+n | Next / previous search result |
| Alt+/ | Announce all shortcuts |
| Escape | Clear search |

## Installation

### Prerequisites

- [Bun](https://bun.sh) 1.3 or later

### From source

```bash
git clone <repo-url> glassboard
cd glassboard
bun install
```

### Run in development mode (auto-reload on changes)

```bash
bun run dev
```

### Run in production mode

```bash
bun run start
```

Open `http://localhost:4001` (or the port configured in `config.json`).

### Build standalone executable (no Bun needed to run)

```bash
bun run build
```

This creates a `dist/` folder you can copy anywhere:

```
dist/
  glassboard.exe    (Windows) or glassboard (Linux/macOS)
  config.json       (edit to customize)
  public/
    style.css
    client.js + chunks
    sounds/default/  (33 OGG files)
```

Run the standalone:

```bash
# Windows
dist\glassboard.exe

# Linux / macOS
./dist/glassboard
```

The executable bundles the Bun runtime (~111MB). No installation required on the target machine.

## Claude Code Plugin

Glassboard includes a plugin that auto-launches the viewer when you start a Claude Code session.

### Install the plugin

```bash
claude plugin install ./plugin
```

### What it does

| Event | Action |
|-------|--------|
| Claude session starts | Starts Glassboard server, opens browser directly to the current session |
| Claude session ends | Optionally stops the server (off by default) |
| `/glassboard` command | Opens Glassboard in the browser on demand |

The plugin reads `session_id` and `cwd` from the SessionStart hook input and opens the browser at `http://localhost:4001/?project=<project>&session=<session>` — you see the current conversation immediately.

### Plugin settings

Create a `.local.md` file in the plugin directory to override defaults:

```yaml
---
autoOpen: true
stopOnSessionEnd: false
port: 4001
glassboardPath: /path/to/glassboard
---
```

| Setting | Default | Description |
|---------|---------|-------------|
| `autoOpen` | `true` | Open browser automatically when a session starts |
| `stopOnSessionEnd` | `false` | Kill the Glassboard server when the Claude session ends |
| `port` | `4001` | Port for the Glassboard server |
| `glassboardPath` | plugin parent dir | Path to the Glassboard project directory |

### Multiple Claude Code sessions

The plugin handles multiple sessions correctly. The first session starts the server. Subsequent sessions detect the server is already running and just open the browser to the new session. All sessions share one Glassboard instance.

## Configuration

Edit `config.json` to customize defaults. All settings can also be changed from the web UI and persist in the browser's localStorage. Click "Reset all settings to defaults" to clear saved preferences.

### Server settings

| Setting | Default | Description |
|---------|---------|-------------|
| `port` | `4001` | Server port |

### Display toggles

Control which message types are visible. Each can be toggled from the UI.

| Setting | Default | Description |
|---------|---------|-------------|
| `toggles.user` | `true` | Show user messages |
| `toggles.assistant_text` | `true` | Show assistant responses |
| `toggles.assistant_thinking` | `false` | Show thinking blocks |
| `toggles.tool_call` | `true` | Show tool calls (Bash, Read, Edit, etc.) |
| `toggles.tool_result` | `true` | Show tool output |
| `toggles.system` | `false` | Show system messages (hook summaries, turn durations) |
| `toggles.local_command` | `true` | Show local commands (/rename, etc.) |
| `toggles.queued` | `true` | Show queued messages (task notifications) |

### Rendering

| Setting | Default | Description |
|---------|---------|-------------|
| `renderMarkdown` | `true` | Render message content as HTML via marked. When off, content shows as plain preformatted text. |
| `exportFormat` | `"md"` | Default export format: `"md"`, `"txt"`, or `"html"` |

### Pagination

Glassboard loads the most recent messages first and lets you load older messages on demand.

| Setting | Default | Description |
|---------|---------|-------------|
| `pagination.messagesPerPage` | `30` | Target number of messages per page. Actual count may vary slightly due to turn boundary snapping. |
| `pagination.snapToTurnBoundary` | `true` | When enabled, page boundaries are adjusted so a turn (user message + all its responses) is never split across pages. This means page sizes may be slightly more or less than `messagesPerPage`. |

### Sound settings

| Setting | Default | Description |
|---------|---------|-------------|
| `sounds.enabled` | `true` | Master sound toggle |
| `sounds.profile` | `"default"` | Sound profile folder name under `public/sounds/` |
| `sounds.volume` | `0.7` | Master volume (0.0 to 1.0) |
| `sounds.soundWhenBackground` | `false` | Play sounds even when the browser tab is not focused |
| `sounds.notifyWhenFocused` | `false` | Show OS notifications even when the tab is active |
| `sounds.notifyMaxLength` | `500` | Maximum characters in notification body text |

### Sound profiles

Sound files live in `public/sounds/<profile>/`. To create a custom profile:

1. Create a new folder: `public/sounds/myprofile/`
2. Add OGG/MP3/WAV files with the same filenames as the default profile
3. Set `"profile": "myprofile"` in config.json

### Sound events (35 in config, 33 sound files)

Each event can independently control sound playback, screen reader announcements, and OS notifications.

**Claude Code hook events (25):**
SessionStart, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure, Notification, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, Stop, StopFailure, TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, FileChanged, WorktreeCreate, WorktreeRemove, PreCompact, PostCompact, SessionEnd, Elicitation, ElicitationResult

**Viewer events (3):**
AssistantResponse, Thinking, TurnComplete

**UI events (5):**
copy, export, search_match, search_no_match, navigation_boundary

**Bookmark events (2):**
bookmark_add, bookmark_remove

Some events share sound files (e.g. Stop and TurnComplete both use `complete.ogg`), which is why there are 35 event configs but only 33 unique sound files.

### Per-event config

Each event has these fields:

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Play the sound when this event fires |
| `announce` | boolean | Announce via aria-live (screen reader) |
| `notify` | boolean | Show an OS notification (only when tab is not focused, unless `notifyWhenFocused` is on) |
| `file` | string | Sound file name in the profile folder (e.g. `"click.ogg"`) |
| `volume` | number | Per-event volume, 0.0 to 1.0 (multiplied by master volume) |
| `repeatInterval` | number | Minimum seconds between plays of this sound (throttle). `0` means no throttle. |
| `repeatCount` | number | How many times to play per trigger (with 300ms gaps). Default `1`. Set to `3` for attention-grabbing events like PermissionRequest. |

## How It Works

Glassboard reads Claude Code's session files from `~/.claude/`:

| Path | Contents |
|------|----------|
| `~/.claude/projects/<project>/<session>.jsonl` | Conversation data (one JSON object per line) |
| `~/.claude/sessions/<pid>.json` | Active session metadata (PID, name, cwd) |
| `~/.claude/history.jsonl` | Prompt history with project path mappings |

The server parses JSONL files into typed messages, renders them via React SSR, and serves the page. When viewing a session, it watches the JSONL file with `fs.watch()` and pushes new messages to the browser via Server-Sent Events (SSE) in real time.

### Message types parsed

| Type | Source in JSONL | Display |
|------|----------------|---------|
| User messages | `type: "user"` | h3 heading, blue background |
| Assistant text | `type: "assistant"`, text blocks | h4 heading, green background |
| Thinking | `type: "assistant"`, thinking blocks | h2 heading, purple background |
| Tool calls | `type: "assistant"`, tool_use blocks | Collapsible details with tool name |
| Tool results | `type: "user"`, tool_result blocks | Collapsible details with source tool name |
| System | `type: "system"` (hooks, turn duration) | h2 heading, red background |
| Local commands | `subtype: "local_command"` (/rename, etc.) | h2 heading |
| Queued messages | `type: "queue-operation"` (task notifications) | Dashed border |

## Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **SSR:** React (`renderToStaticMarkup`, server-only — no React in the browser)
- **Client:** TypeScript, compiled by `Bun.build` with ESM code splitting
- **Markdown:** [marked](https://marked.js.org) (lazy-loaded as a separate chunk, ~70KB)
- **Sounds:** CC0 OGG files from [Kenney.nl](https://kenney.nl) and [Orange Free Sounds](https://orangefreesounds.com)
- **No frameworks, no external runtime dependencies**

## Data Storage

Glassboard stores its own data alongside Claude's config:

| File | Purpose |
|------|---------|
| `~/.claude/glassboard-session-names.json` | Cached session display names (survives Claude process restarts) |
| `~/.claude/glassboard-bookmarks.json` | Per-session message bookmarks |

Both are plain JSON files. Safe to delete — they'll be recreated as needed.

## License

MIT License. See [LICENSE](LICENSE).

Sound effects are CC0 (public domain) from [Kenney.nl](https://kenney.nl) and [Orange Free Sounds](https://orangefreesounds.com).
