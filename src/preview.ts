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

  const fileName = editor.document.fileName.split('/').pop() ?? 'Untitled';
  await renderToonPreview(editor.document.getText(), `TOON Preview — ${fileName}`);
}

/**
 * Preview a single ```toon fenced block from a Markdown document.
 *
 * `startLine` is the 0-based line of the opening fence (the line the CodeLens
 * sits on). Extracts the fenced body and renders it via the shared path.
 */
export async function previewMarkdownBlock(
  document: vscode.TextDocument,
  startLine: number,
): Promise<void> {
  const content = extractToonBlockContent(document, startLine);
  const fileName = document.fileName.split('/').pop() ?? 'Untitled';
  await renderToonPreview(content, `TOON Preview — ${fileName}`);
}

/**
 * Shared render entry point: trims, opens/reuses the panel, and renders the
 * given TOON text as nested HTML tables.
 */
async function renderToonPreview(toonText: string, title: string): Promise<void> {
  const text = toonText.trim();
  if (!text) {
    vscode.window.showWarningMessage('TOON document is empty');
    return;
  }

  const panel = getOrCreatePanel(title);

  try {
    // Dynamic ESM import
    const { toonToTableHTML } = await import('@toon-format/toon-table');
    const html = toonToTableHTML(text, { strict: false });
    panel.webview.html = wrapInPage(html);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    panel.webview.html = wrapErrorPage(msg);
  }
}

/**
 * Build (or reveal) the shared preview panel and set its title.
 */
function getOrCreatePanel(title: string): vscode.WebviewPanel {
  if (!currentPanel) {
    currentPanel = vscode.window.createWebviewPanel(
      'toonPreview',
      title,
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

  currentPanel.title = title;
  return currentPanel;
}

/**
 * Extract the inner content of a ```toon fenced block in a Markdown document.
 *
 * `startLine` is the 0-based opening-fence line. Throws if the line is not a
 * fence or the matching closing fence is missing.
 */
function extractToonBlockContent(
  document: vscode.TextDocument,
  startLine: number,
): string {
  const total = document.lineCount;
  if (startLine < 0 || startLine >= total) {
    throw new Error('Invalid TOON block start line');
  }

  // Capture the fence run (``` or ~~~, possibly more than three) so we match
  // the *same* marker on the closing line.
  const fenceMatch = document.lineAt(startLine).text.match(/^\s*(`{3,}|~{3,})/);
  if (!fenceMatch) {
    throw new Error('Specified line is not a TOON code fence');
  }
  const fence = fenceMatch[1];

  let endLine = startLine + 1;
  while (endLine < total && document.lineAt(endLine).text.trim() !== fence) {
    endLine++;
  }

  if (endLine >= total) {
    throw new Error('Missing closing fence for TOON block');
  }

  return document.getText(
    new vscode.Range(startLine + 1, 0, endLine, 0),
  );
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
