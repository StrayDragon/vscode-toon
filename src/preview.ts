import * as vscode from 'vscode';

/**
 * VS Code WebView-based TOON table preview.
 *
 * Uses @toon-format/toon-table (ESM) via dynamic import to render a .toon document
 * as nested HTML tables in a side panel.
 */

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Open (or reveal) the TOON table preview panel for the active editor.
 */
export async function showToonPreview(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  if (editor.document.languageId !== 'toon') {
    vscode.window.showWarningMessage('Active file is not a TOON file');
    return;
  }

  const text = editor.document.getText().trim();
  if (!text) {
    vscode.window.showWarningMessage('TOON document is empty');
    return;
  }

  // Build or reuse panel
  if (!currentPanel) {
    currentPanel = vscode.window.createWebviewPanel(
      'toonPreview',
      'TOON Preview',
      vscode.ViewColumn.Beside,
      {
        enableScripts: false, // static HTML only — no JS in preview for security
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    currentPanel.onDidDispose(
      () => {
        currentPanel = undefined;
      },
      null,
      [],
    );
  } else {
    currentPanel.reveal(vscode.ViewColumn.Beside);
  }

  // Update panel title with filename
  currentPanel.title = `TOON Preview — ${editor.document.fileName.split('/').pop() ?? 'Untitled'}`;

  // Render
  try {
    // Dynamic ESM import
    const { toonToTableHTML } = await import('@toon-format/toon-table');
    const html = toonToTableHTML(text, { strict: false });
    currentPanel.webview.html = wrapInPage(html);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    currentPanel.webview.html = wrapErrorPage(msg);
  }
}

/**
 * Refresh preview when the active document changes.
 */
export function registerPreviewOnChange(context: vscode.ExtensionContext): void {
  // We don't auto-refresh on keystroke (too expensive), but we can trigger on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'toon' && currentPanel?.visible) {
        showToonPreview();
      }
    }),
  );

  // Also update when the active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === 'toon' && currentPanel?.visible) {
        showToonPreview();
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// HTML wrappers
// ---------------------------------------------------------------------------

function wrapInPage(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: var(--vscode-editor-background, #fff);
      color: var(--vscode-editor-foreground, #1f2937);
    }
    .toon-table-root table {
      border-color: var(--vscode-editor-foreground, #000) !important;
    }
    .toon-table-root th,
    .toon-table-root td {
      border-color: var(--vscode-editor-foreground, #000) !important;
    }
    .error-page {
      padding: 2rem;
      font-family: var(--vscode-font-family, monospace);
      color: var(--vscode-errorForeground, #f87171);
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function wrapErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0;
      padding: 2rem;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-errorForeground, #f87171);
      font-family: var(--vscode-font-family, monospace);
    }
    h2 { margin-top: 0; }
    pre { white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <h2>⚠️ Preview Error</h2>
  <p>Failed to render TOON as table:</p>
  <pre>${escapeHtml(message)}</pre>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
