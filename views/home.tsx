import { Layout } from "./layout";
import {
  ProjectSelector, SessionSelector, DisplayToggles,
  SearchBar, TurnGroup, ExportControls, PaginationNav, SoundSettings, BookmarksPanel,
} from "./components";
import type { Project, SessionSummary, ParsedMessage, AppDefaults } from "../lib/types";

export function HomePage({
  projects, sessions, messages, selectedProject, selectedSession, defaults,
  totalCount, startIndex, pageTitle, bookmarks,
}: {
  projects: Project[];
  sessions: SessionSummary[];
  messages: ParsedMessage[];
  selectedProject: string;
  selectedSession: string;
  defaults: AppDefaults;
  totalCount: number;
  startIndex: number;
  pageTitle: string;
  bookmarks: number[];
}) {
  const endIndex = startIndex + messages.length;
  return (
    <Layout title={pageTitle} defaults={defaults}>
      <header role="banner">
        <h1>Glassboard</h1>
        {selectedSession && (
          <button id="activate-sounds" type="button" aria-pressed="false">Press Enter to activate sounds</button>
        )}
      </header>

      <nav role="navigation" aria-label="Session navigation">
        <ProjectSelector projects={projects} selected={selectedProject} />
        {selectedProject && (
          <SessionSelector sessions={sessions} selectedProject={selectedProject} selectedSession={selectedSession} />
        )}
      </nav>

      {selectedSession && (
        <section aria-label="Session settings">
          <ExportControls defaults={defaults} />
          <DisplayToggles defaults={defaults} />
          <SoundSettings defaults={defaults} />
          <SearchBar />
        </section>
      )}

      <main role="main" aria-label="Conversation">
        <div id="live-region" aria-live="polite"></div>
        {selectedSession ? (
          <div
            id="conversation"
            data-project={selectedProject}
            data-session={selectedSession}
            data-total-count={totalCount}
            data-loaded-from={startIndex}
            data-loaded-to={endIndex}
            data-page-size={defaults.pagination.messagesPerPage}
          >
            <BookmarksPanel bookmarkCount={bookmarks.length} />
            <PaginationNav totalCount={totalCount} startIndex={startIndex} endIndex={endIndex} messagesPerPage={defaults.pagination.messagesPerPage} />
            <TurnGroup messages={messages} bookmarks={bookmarks} startIndex={startIndex} />
          </div>
        ) : selectedProject ? (
          <p>Select a session to view the conversation.</p>
        ) : (
          <p>Select a project to get started.</p>
        )}
      </main>

      <footer role="contentinfo">
        <button id="reset-settings" type="button">Reset all settings to defaults</button>
        <details>
          <summary>Keyboard shortcuts</summary>
          <table>
            <caption className="sr-only">Keyboard shortcuts reference</caption>
            <thead>
              <tr><th scope="col">Shortcut</th><th scope="col">Action</th></tr>
            </thead>
            <tbody>
              <tr><td><kbd>Alt+j</kbd></td><td>Next message</td></tr>
              <tr><td><kbd>Alt+k</kbd></td><td>Previous message</td></tr>
              <tr><td><kbd>Alt+t</kbd></td><td>Next turn</td></tr>
              <tr><td><kbd>Alt+Shift+t</kbd></td><td>Previous turn</td></tr>
              <tr><td><kbd>Alt+g</kbd></td><td>Jump to latest message</td></tr>
              <tr><td><kbd>Alt+u</kbd></td><td>Latest user message</td></tr>
              <tr><td><kbd>Alt+Shift+u</kbd></td><td>Cycle through user messages</td></tr>
              <tr><td><kbd>Alt+a</kbd></td><td>Latest assistant response</td></tr>
              <tr><td><kbd>Alt+Shift+a</kbd></td><td>Cycle through assistant responses</td></tr>
              <tr><td><kbd>Alt+b</kbd></td><td>Toggle bookmark</td></tr>
              <tr><td><kbd>Alt+Shift+b</kbd></td><td>Jump to next bookmark</td></tr>
              <tr><td><kbd>Alt+e</kbd></td><td>Export conversation</td></tr>
              <tr><td><kbd>Alt+s</kbd></td><td>Focus search</td></tr>
              <tr><td><kbd>Alt+n</kbd></td><td>Next search result</td></tr>
              <tr><td><kbd>Alt+Shift+n</kbd></td><td>Previous search result</td></tr>
              <tr><td><kbd>Alt+/</kbd></td><td>Announce shortcuts</td></tr>
              <tr><td><kbd>Escape</kbd></td><td>Clear search</td></tr>
            </tbody>
          </table>
        </details>
      </footer>
    </Layout>
  );
}
