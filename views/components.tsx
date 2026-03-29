import type { ParsedMessage, Project, SessionSummary, AppDefaults } from "../lib/types";

export function ProjectSelector({ projects, selected }: { projects: Project[]; selected: string }) {
  return (
    <form method="get" action="/">
      <label htmlFor="project">Project</label>
      <select name="project" id="project" defaultValue={selected}>
        <option value="">Choose a project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.friendlyName}</option>
        ))}
      </select>
      <button type="submit">Load</button>
    </form>
  );
}

export function SessionSelector({
  sessions, selectedProject, selectedSession,
}: { sessions: SessionSummary[]; selectedProject: string; selectedSession: string }) {
  return (
    <form method="get" action="/">
      <input type="hidden" name="project" value={selectedProject} />
      <label htmlFor="session">Session</label>
      <select name="session" id="session" defaultValue={selectedSession}>
        <option value="">Choose a session</option>
        {sessions.map((s) => (
          <option key={s.sessionId} value={s.sessionId}>
            {s.label} — {new Date(s.date).toLocaleDateString()}
          </option>
        ))}
      </select>
      <button type="submit">Load</button>
    </form>
  );
}

export function DisplayToggles({ defaults }: { defaults: AppDefaults }) {
  const t = defaults.toggles;
  return (
    <fieldset>
      <legend>Display options</legend>
      <label><input type="checkbox" id="toggle-user" defaultChecked={t.user} data-toggle="user" /> User messages</label>
      <label><input type="checkbox" id="toggle-assistant" defaultChecked={t.assistant_text} data-toggle="assistant_text" /> Assistant responses</label>
      <label><input type="checkbox" id="toggle-thinking" defaultChecked={t.assistant_thinking} data-toggle="assistant_thinking" /> Thinking blocks</label>
      <label><input type="checkbox" id="toggle-tools" defaultChecked={t.tool_call} data-toggle="tool_call" /> Tool calls</label>
      <label><input type="checkbox" id="toggle-results" defaultChecked={t.tool_result} data-toggle="tool_result" /> Tool results</label>
      <label><input type="checkbox" id="toggle-system" defaultChecked={t.system} data-toggle="system" /> System messages</label>
      <label><input type="checkbox" id="toggle-local" defaultChecked={t.local_command !== false} data-toggle="local_command" /> Local commands</label>
      <label><input type="checkbox" id="toggle-queued" defaultChecked={t.queued !== false} data-toggle="queued" /> Queued messages</label>
      <label><input type="checkbox" id="toggle-markdown" defaultChecked={defaults.renderMarkdown} /> Render markdown as HTML</label>
    </fieldset>
  );
}


export function SearchBar() {
  return (
    <div>
      <label htmlFor="search-input">Search conversation</label>
      <input type="search" id="search-input" placeholder="Search messages..." />
      <div id="search-status" aria-live="polite"></div>
    </div>
  );
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? "st"
    : day === 2 || day === 22 ? "nd"
    : day === 3 || day === 23 ? "rd" : "th";
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  const time = d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: true });
  return `${day}${suffix} ${month}, ${year} at ${time}`;
}

function codeFence(content: string): string {
  let len = 3;
  while (content.includes("`".repeat(len))) len++;
  const fence = "`".repeat(len);
  return fence + "\n" + content + "\n" + fence;
}

function copyText(msg: ParsedMessage): string {
  switch (msg.type) {
    case "user": return `## User\n${msg.text}`;
    case "assistant_text": return `## Assistant\n${msg.text}`;
    case "assistant_thinking": return `## Thinking\n${msg.text}`;
    case "tool_call": return `### Tool: ${msg.toolName} — ${msg.description}\n${codeFence(msg.input)}`;
    case "tool_result": return `### Tool Output\n${codeFence(msg.content)}`;
    case "system": return `*${msg.text}*`;
    case "local_command": return `> ${msg.command}\n${msg.output}`;
    case "queued": return msg.text;
    default: return "";
  }
}

// Heading levels: h3 = user, h4 = assistant, h2 = everything else
// Screen reader users can press 3 to jump between user messages, 4 for assistant
function headingLevel(type: string): "h2" | "h3" | "h4" {
  if (type === "user") return "h3";
  if (type === "assistant_text") return "h4";
  return "h2";
}

export function MessageArticle({ msg, index, toolNameMap, bookmarked }: { msg: ParsedMessage; index: number; toolNameMap?: Record<string, string>; bookmarked?: boolean }) {
  const label = messageLabel(msg, index, toolNameMap);
  const dataType = msg.type;
  const ts = formatTimestamp(msg.timestamp);
  const H = headingLevel(dataType);

  if (msg.type === "tool_call") {
    return (
      <article className={`message message-${dataType}${bookmarked ? " message-bookmarked" : ""}`} data-type={dataType} data-turn={msg.turnIndex} data-copy={copyText(msg)} aria-label={label} tabIndex={-1} data-bookmarked={bookmarked ? "true" : undefined}>
        {ts && <time className="message-time">{ts}</time>}
        <details>
          <summary><H>{msg.toolName}: {msg.description}</H></summary>
          <pre className="tool-input">{msg.input}</pre>
        </details>
        <button className="copy-btn" type="button" aria-label="Copy this message as markdown">Copy</button>
        <button className={`bookmark-btn${bookmarked ? " bookmarked" : ""}`} type="button" data-index={index} aria-label={bookmarked ? "Remove bookmark" : "Bookmark this message"} aria-pressed={bookmarked ? "true" : "false"}>{bookmarked ? "Unbookmark" : "Bookmark"}</button>
      </article>
    );
  }

  if (msg.type === "tool_result") {
    const sourceTool = toolNameMap?.[msg.toolUseId] || "Tool";
    return (
      <article className={`message message-${dataType}${bookmarked ? " message-bookmarked" : ""}`} data-type={dataType} data-turn={msg.turnIndex} data-copy={copyText(msg)} aria-label={label} tabIndex={-1} data-bookmarked={bookmarked ? "true" : undefined}>
        {ts && <time className="message-time">{ts}</time>}
        <details>
          <summary><H>{sourceTool} output</H></summary>
          <pre className="tool-output">{msg.content}</pre>
        </details>
        <button className="copy-btn" type="button" aria-label="Copy this message as markdown">Copy</button>
        <button className={`bookmark-btn${bookmarked ? " bookmarked" : ""}`} type="button" data-index={index} aria-label={bookmarked ? "Remove bookmark" : "Bookmark this message"} aria-pressed={bookmarked ? "true" : "false"}>{bookmarked ? "Unbookmark" : "Bookmark"}</button>
      </article>
    );
  }

  return (
    <article className={`message message-${dataType}${bookmarked ? " message-bookmarked" : ""}`} data-type={dataType} data-turn={msg.turnIndex} data-copy={copyText(msg)} aria-label={label} tabIndex={-1} data-bookmarked={bookmarked ? "true" : undefined}>
      <H>{typeHeading(msg)}</H>
      {ts && <time className="message-time">{ts}</time>}
      <div className="message-content"><pre>{messageText(msg)}</pre></div>
      <button className="copy-btn" type="button" aria-label="Copy this message as markdown">Copy</button>
      <button className={`bookmark-btn${bookmarked ? " bookmarked" : ""}`} type="button" data-index={index} aria-label={bookmarked ? "Remove bookmark" : "Bookmark this message"} aria-pressed={bookmarked ? "true" : "false"}>{bookmarked ? "Unbookmark" : "Bookmark"}</button>
    </article>
  );
}

// Wraps consecutive messages with the same turnIndex into a section
export function TurnGroup({ messages, bookmarks, startIndex = 0 }: { messages: ParsedMessage[]; bookmarks?: number[]; startIndex?: number }) {
  // Build toolUseId → toolName map so tool_results can reference their source tool
  const toolNameMap: Record<string, string> = {};
  messages.forEach((msg) => {
    if (msg.type === "tool_call") toolNameMap[msg.toolUseId] = msg.toolName;
  });

  const turns: { turnIndex: number; msgs: { msg: ParsedMessage; globalIndex: number }[] }[] = [];
  let current: typeof turns[0] | null = null;

  messages.forEach((msg, i) => {
    if (!current || msg.turnIndex !== current.turnIndex) {
      current = { turnIndex: msg.turnIndex, msgs: [] };
      turns.push(current);
    }
    current.msgs.push({ msg, globalIndex: startIndex + i });
  });

  return (
    <>
      {turns.map((turn) => (
        <section
          key={turn.turnIndex}
          className="turn-group"
          data-turn={turn.turnIndex}
          aria-label={`Turn ${turn.turnIndex + 1}`}
          tabIndex={-1}
        >
          {turn.msgs.map(({ msg, globalIndex }) => (
            <MessageArticle key={globalIndex} msg={msg} index={globalIndex} toolNameMap={toolNameMap} bookmarked={bookmarks?.includes(globalIndex)} />
          ))}
        </section>
      ))}
    </>
  );
}

function messageLabel(msg: ParsedMessage, index: number, toolNameMap?: Record<string, string>): string {
  switch (msg.type) {
    case "user": return `User message ${index + 1}`;
    case "assistant_text": return `Assistant response ${index + 1}`;
    case "assistant_thinking": return `Assistant thinking ${index + 1}`;
    case "tool_call": return `Tool call ${index + 1}: ${msg.toolName}`;
    case "tool_result": { const name = toolNameMap?.[msg.toolUseId] || "Tool"; return `${name} output ${index + 1}`; }
    case "system": return `System message ${index + 1}`;
    case "local_command": return `Command ${index + 1}: ${msg.command}`;
    case "queued": return `Queued message ${index + 1}`;
    default: return `Message ${index + 1}`;
  }
}

function typeHeading(msg: ParsedMessage): string {
  switch (msg.type) {
    case "user": return "User";
    case "assistant_text": return "Assistant";
    case "assistant_thinking": return "Thinking";
    case "system": return `System: ${msg.subtype}`;
    case "local_command": return `Command: ${msg.command}`;
    case "queued": return "Queued";
    default: return msg.type;
  }
}

function messageText(msg: ParsedMessage): string {
  switch (msg.type) {
    case "user": return msg.text;
    case "assistant_text": return msg.text;
    case "assistant_thinking": return msg.text;
    case "system": return msg.text;
    case "tool_result": return msg.content;
    case "local_command": return msg.output || msg.command;
    case "queued": return msg.text;
    default: return "";
  }
}

export function PaginationNav({
  totalCount, startIndex, endIndex, messagesPerPage,
}: {
  totalCount: number; startIndex: number; endIndex: number; messagesPerPage: number;
}) {
  if (totalCount <= messagesPerPage && startIndex === 0) return null;
  const totalPages = Math.ceil(totalCount / messagesPerPage);
  const currentPage = Math.floor(startIndex / messagesPerPage) + 1;

  return (
    <nav aria-label="Pagination" className="pagination-nav">
      <ul className="page-list">
        {buildPageList(totalPages, currentPage).map((item, i) =>
          item === "gap" ? (
            <li key={"gap-" + i} className="page-gap" aria-hidden="true">...</li>
          ) : (
            <li key={item}>
              {item === currentPage ? (
                <a className="page-current" aria-current="page" href="#" data-page={item}>Page {item}</a>
              ) : (
                <a className="page-link" href="#" data-page={item}>Page {item}</a>
              )}
            </li>
          )
        )}
      </ul>
      <span id="pagination-status" aria-live="polite">
        Page {currentPage} of {totalPages}, messages {startIndex + 1} to {endIndex} of {totalCount}
      </span>
    </nav>
  );
}

/** Build page list: always first, last, and a window of 10 sequential pages around current */
function buildPageList(totalPages: number, currentPage: number): (number | "gap")[] {
  if (totalPages <= 12) {
    // Few pages — show all, no gaps
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  // Window of 10 centered on current page
  let windowStart = Math.max(1, currentPage - 4);
  let windowEnd = windowStart + 9;
  if (windowEnd > totalPages) {
    windowEnd = totalPages;
    windowStart = Math.max(1, windowEnd - 9);
  }

  const result: (number | "gap")[] = [];

  // First page + gap if window doesn't start at 1
  if (windowStart > 1) {
    result.push(1);
    if (windowStart > 2) result.push("gap");
  }

  // Sequential window
  for (let p = windowStart; p <= windowEnd; p++) {
    result.push(p);
  }

  // Gap + last page if window doesn't reach the end
  if (windowEnd < totalPages) {
    if (windowEnd < totalPages - 1) result.push("gap");
    result.push(totalPages);
  }

  return result;
}

export function SoundSettings({ defaults }: { defaults: AppDefaults }) {
  const sounds = defaults.sounds;
  if (!sounds) return null;
  return (
    <fieldset>
      <legend>Sound settings</legend>
      <label>
        <input type="checkbox" id="sound-master-toggle" defaultChecked={sounds.enabled} />
        Enable sounds
      </label>
      <label htmlFor="sound-master-volume">Master volume</label>
      <input type="range" id="sound-master-volume" min="0" max="100" defaultValue={Math.round(sounds.volume * 100)} />
      <label htmlFor="sound-profile">Sound profile</label>
      <input type="text" id="sound-profile" defaultValue={sounds.profile} />
      <label>
        <input type="checkbox" id="sound-when-background" defaultChecked={sounds.soundWhenBackground} />
        Play sounds in background tabs
      </label>
      <label>
        <input type="checkbox" id="notify-when-focused" defaultChecked={sounds.notifyWhenFocused} />
        Notify even when tab is active
      </label>
      <details>
        <summary>Per-event settings ({Object.keys(sounds.events).length} events)</summary>
        <div id="sound-event-list">
          {Object.entries(sounds.events).map(([name, evt]) => (
            <fieldset key={name} className="sound-event-fieldset">
              <legend>{name}</legend>
              <label>
                <input type="checkbox" data-sound-event={name} defaultChecked={evt.enabled} />
                Enable sound
              </label>
              <label>
                <input type="checkbox" data-sound-announce={name} defaultChecked={evt.announce} />
                Enable announcement
              </label>
              <label>
                <input type="checkbox" data-sound-notify={name} defaultChecked={evt.notify} />
                Enable notification
              </label>
              <label htmlFor={"sound-vol-" + name}>Volume</label>
              <input type="range" id={"sound-vol-" + name} data-sound-vol={name} min="0" max="100" defaultValue={Math.round(evt.volume * 100)} />
              <label htmlFor={"sound-ri-" + name}>Min interval (sec)</label>
              <input type="number" id={"sound-ri-" + name} data-sound-ri={name} min="0" max="60" step="0.5" defaultValue={evt.repeatInterval} />
              <label htmlFor={"sound-rc-" + name}>Repeat count</label>
              <input type="number" id={"sound-rc-" + name} data-sound-rc={name} min="1" max="10" defaultValue={evt.repeatCount || 1} />
              <button type="button" className="preview-sound-btn" data-preview={name} aria-label={"Preview " + name + " sound"}>Preview</button>
            </fieldset>
          ))}
        </div>
      </details>
    </fieldset>
  );
}

export function ExportControls({ defaults }: { defaults: AppDefaults }) {
  return (
    <div>
      <label htmlFor="export-format">Export format</label>
      <select id="export-format" defaultValue={defaults.exportFormat}>
        <option value="md">Markdown</option>
        <option value="txt">Plain Text</option>
        <option value="html">HTML</option>
      </select>
      <button id="export-btn" type="button">Export</button>
      <p className="export-note">Exports all messages in the session regardless of current filters.</p>
    </div>
  );
}

export function BookmarksPanel({ bookmarkCount }: { bookmarkCount: number }) {
  return (
    <fieldset className="bookmarks-panel" hidden={bookmarkCount === 0}>
      <legend>Bookmarks ({bookmarkCount})</legend>
      <label>
        <input type="checkbox" id="bookmarks-only" />
        Show bookmarks only
      </label>
      <ul id="bookmarks-list" aria-label="Bookmarked messages"></ul>
    </fieldset>
  );
}
