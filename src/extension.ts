import * as vscode from 'vscode';
import { ToonValidator } from './validator';
import { ToonFormatter } from './formatter';
import { ToonCompletionProvider } from './completion';
import { ToonHoverProvider } from './hover';
import { showToonPreview, registerPreviewOnChange, previewMarkdownBlock } from './preview';
import { ToonBlockCodeLensProvider, isMarkdown } from './codeLens';
import { encode, decode } from '@toon-format/toon';

export function activate(context: vscode.ExtensionContext) {
  console.log('TOON extension is now active');

  const validator = new ToonValidator();
  const formatter = new ToonFormatter();
  const completionProvider = new ToonCompletionProvider();
  const hoverProvider = new ToonHoverProvider();

  // Register document formatting provider
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider('toon', formatter)
  );

  // Register completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('toon', completionProvider, '[', '{', ',', '\t', '|', '-')
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider('toon', hoverProvider)
  );

  // Register validation on document change
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'toon') {
        validator.validate(event.document);
      }
    })
  );

  // Register validation on document open
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === 'toon') {
        validator.validate(document);
      }
    })
  );

  // Validate all open TOON documents
  vscode.workspace.textDocuments.forEach((document) => {
    if (document.languageId === 'toon') {
      validator.validate(document);
    }
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('toon.validate', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'toon') {
        validator.validate(editor.document);
        vscode.window.showInformationMessage('TOON validation complete');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('toon.convertToJson', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
      }

      if (editor.document.languageId !== 'toon') {
        vscode.window.showWarningMessage('Current file is not a TOON file');
        return;
      }

      try {
        const toonContent = editor.document.getText().trim();

        if (!toonContent) {
          vscode.window.showWarningMessage('Document is empty');
          return;
        }

        const jsonData = decode(toonContent);
        const jsonString = JSON.stringify(jsonData, null, 2);

        const doc = await vscode.workspace.openTextDocument({
          content: jsonString,
          language: 'json',
        });
        await vscode.window.showTextDocument(doc, { preview: false });
        vscode.window.showInformationMessage('Successfully converted TOON to JSON');
      }
      catch (error) {
        vscode.window.showErrorMessage(
          `Failed to convert TOON to JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  // Register preview command
  context.subscriptions.push(
    vscode.commands.registerCommand('toon.preview', () => {
      showToonPreview();
    })
  );

  // Register preview auto-refresh on save/editor change
  registerPreviewOnChange(context);

  // --- Markdown ```toon block CodeLens (preview only) ---
  const toonCodeLensProvider = new ToonBlockCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', language: 'markdown' },
        { scheme: 'untitled', language: 'markdown' },
      ],
      toonCodeLensProvider,
    ),
  );

  // CodeLens action: preview a single ```toon fenced block.
  context.subscriptions.push(
    vscode.commands.registerCommand('toon.previewBlock', async (
      documentUri?: unknown,
      blockInfo?: unknown,
    ) => {
      const uri = documentUri instanceof vscode.Uri
        ? documentUri
        : vscode.window.activeTextEditor?.document.uri;
      if (!uri) {
        vscode.window.showWarningMessage('No document for TOON block preview');
        return;
      }

      const startLine = (blockInfo as { startLine?: unknown } | undefined)?.startLine;
      if (typeof startLine !== 'number') {
        vscode.window.showWarningMessage('Invalid TOON block location');
        return;
      }

      try {
        const document = await vscode.workspace.openTextDocument(uri);
        await previewMarkdownBlock(document, startLine);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to preview TOON block: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  // Debounced CodeLens refresh: only when a ```toon fence appears/changes in
  // the active Markdown editor (avoids rescanning unrelated edits).
  const hasToonBlockSignal = (value: string): boolean =>
    /(^|\n)\s*(`{3,}|~{3,})toon\b/i.test(value);

  let refreshTimeout: NodeJS.Timeout | undefined;
  const debouncedRefresh = (delay = 300): void => {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => toonCodeLensProvider.refresh(), delay);
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const active = vscode.window.activeTextEditor;
      if (!active || event.document !== active.document || !isMarkdown(event.document)) {
        return;
      }
      const touchesSignal = event.contentChanges.some(
        (change) =>
          hasToonBlockSignal(change.text) ||
          (change.rangeLength > 0 && hasToonBlockSignal(event.document.getText(change.range))),
      );
      if (touchesSignal) {
        debouncedRefresh();
      }
    }),
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isMarkdown(editor.document) && hasToonBlockSignal(editor.document.getText())) {
        debouncedRefresh(500);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('toon.convertFromJson', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
      }

      if (editor.document.languageId !== 'json') {
        vscode.window.showWarningMessage('Current file is not a JSON file');
        return;
      }

      try {
        const jsonContent = editor.document.getText().trim();

        if (!jsonContent) {
          vscode.window.showWarningMessage('Document is empty');
          return;
        }

        const jsonData = JSON.parse(jsonContent);

        const config = vscode.workspace.getConfiguration('toon.format');
        const toonString = encode(jsonData, {
          indent: config.get('indent', 2),
          delimiter: config.get('delimiter', ','),
        });

        const doc = await vscode.workspace.openTextDocument({
          content: toonString,
          language: 'toon',
        });
        await vscode.window.showTextDocument(doc, { preview: false });
        vscode.window.showInformationMessage('Successfully converted JSON to TOON');
      }
      catch (error) {
        vscode.window.showErrorMessage(
          `Failed to convert JSON to TOON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );


}

export function deactivate() {
  console.log('TOON extension is now deactivated');
}
