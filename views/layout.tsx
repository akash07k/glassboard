import type { ReactNode } from "react";
import type { AppDefaults } from "../lib/types";

export function Layout({ title, children, defaults }: { title: string; children: ReactNode; defaults: AppDefaults }) {
  // Config defaults are embedded as JSON for client.js to read.
  // Content is from our own config.json, not user input.
  const configJson = JSON.stringify(defaults);
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <script id="app-defaults" type="application/json">{configJson}</script>
        {children}
        <script type="module" src="/client.js"></script>
      </body>
    </html>
  );
}
