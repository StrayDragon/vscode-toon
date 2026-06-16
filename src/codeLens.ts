import * as vscode from 'vscode';

/**
 * CodeLens provider that places a "Preview TOON Table" action above every
 * ```toon fenced code block inside Markdown documents.
 *
 * Mirrors vscode-merfolk's Markdown-block CodeLens pattern, but TOON-specific
 * and preview-only (no Edit action). Clicking the lens runs the
 * `toon.previewBlock` command with the fence's start line.
 */

/** Matches a fenced code block opening whose info string is `toon`
 *  (supports ``` ```toon ```, ``` ```ToON title ```, and `~~~toon`; rejects
 *  ``` ```toonx ```). */
const toonFenceRegex = /^\s*(`{3,}|~{3,})toon\b/i;

export class ToonBlockCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** Cap lenses per file to bound work on very large documents. */
  private readonly maxLensesPerFile = 20;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    // Only meaningful inside Markdown.
    if (!isMarkdown(document)) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const lineCount = document.lineCount;

    for (let i = 0; i < lineCount && lenses.length < this.maxLensesPerFile; i++) {
      const line = document.lineAt(i).text;
      if (!isToonFenceStart(line)) {
        continue;
      }

      const range = new vscode.Range(i, 0, i, line.length);
      lenses.push(
        new vscode.CodeLens(range, {
          title: 'Preview TOON Table',
          command: 'toon.previewBlock',
          arguments: [document.uri, { startLine: i }],
        }),
      );
    }

    return lenses;
  }

  /** Fire onDidChangeCodeLenses so VS Code re-queries provideCodeLenses. */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}

/** Whether the document should be treated as Markdown. */
export function isMarkdown(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'markdown' ||
    document.fileName.toLowerCase().endsWith('.md')
  );
}

/** Whether a line opens a ```toon fenced block. */
export function isToonFenceStart(line: string): boolean {
  return toonFenceRegex.test(line);
}
