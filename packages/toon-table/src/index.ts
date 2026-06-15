/**
 * toon-table — Render TOON format as nested HTML tables.
 *
 * Mirrors the rendering style of https://jsontotable.org/toon-to-table
 *
 * Usage:
 *   import { toonToTableHTML, jsonToTableHTML } from '@toon-format/toon-table';
 *
 *   const html = toonToTableHTML(toonString);
 *   // → '<div class="toon-table-root">…</div>' (self-contained HTML fragment)
 *
 *   const fullPage = toonToFullPageHTML(toonString, { title: 'My Preview' });
 *   // → complete standalone HTML document
 */

import { decode, type DecodeOptions } from '@toon-format/toon';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Preprocess TOON text before parsing: strip full-line comments.
 */
function preprocessToon(toonStr: string): string {
  return toonStr
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#')) // remove full-line comments
    .join('\n');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToonTableOptions {
  /** Indentation spaces for TOON decode (default 2) */
  indent?: number;
  /** Strict decode mode (default false for preview) */
  strict?: boolean;
  /** Maximum nesting depth for nested tables (0 = unlimited) */
  maxDepth?: number;
  /** Maximum number of rows to render per table (0 = unlimited) */
  maxRows?: number;
}

export interface FullPageOptions extends ToonTableOptions {
  /** HTML page title */
  title?: string;
  /** Custom CSS appended to <head> */
  extraCss?: string;
}

// ---------------------------------------------------------------------------
// CSS (embedded – no runtime dependencies)
// ---------------------------------------------------------------------------

const TABLE_CSS = /* css */ `
/* === toon-table standalone styles (zero dependency) === */
.toon-table-root {
  overflow-x: auto;
  max-width: 100%;
  padding: 0.5rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1f2937;
}
.toon-table-root table {
  border-collapse: collapse;
  min-width: 100%;
}
.toon-table-root th,
.toon-table-root td {
  padding: 6px 12px;
  text-align: left;
  border: 1.5px solid #000;
}
.toon-table-root thead th {
  background: #f9fafb;
  font-weight: 600;
  color: #111827;
  font-size: 12px;
  position: sticky;
  top: 0;
}
.toon-table-root tbody td {
  font-size: 12px;
  vertical-align: middle;
}
.toon-table-root .tt-key {
  font-weight: 500;
}
.toon-table-root .tt-null {
  color: #9ca3af;
  font-style: italic;
}
.toon-table-root .tt-empty {
  color: #9ca3af;
  font-style: italic;
}
.toon-table-root .tt-primitive-list {
  color: #6b7280;
  font-size: 11px;
}
.toon-table-root tr:hover td {
  background: #f9fafb;
}
.toon-table-root .tt-nested-wrap {
  padding: 0 !important;
}
.toon-table-root .tt-nested-inner {
  overflow-x: auto;
  max-width: 100%;
  padding: 4px;
}
.toon-table-root .tt-nested-inner table {
  min-width: 100%;
}
.toon-table-root .tt-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 12px;
  margin-bottom: 8px;
  font-size: 11px;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 4px;
}
`;

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArrayOfObjects(arr: unknown[]): arr is Record<string, unknown>[] {
  return arr.length > 0 && arr.every((item) => isObject(item));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Extract column keys from an array of objects (union of all keys, preserving
 * the order of first appearance).
 */
function extractColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

function renderValue(val: unknown, depth: number, opts: Required<ToonTableOptions>): string {
  // ----- null / undefined -----
  if (val === null || val === undefined) {
    return '<span class="tt-null">null</span>';
  }

  // ----- primitive -----
  if (typeof val === 'string') return esc(val);
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);

  // ----- array -----
  if (Array.isArray(val)) {
    if (val.length === 0) {
      return '<span class="tt-empty">[ ]</span>';
    }

    if (isArrayOfObjects(val)) {
      // depth guard
      if (opts.maxDepth > 0 && depth >= opts.maxDepth) {
        return `<span class="tt-primitive-list">[array of ${val.length} objects]</span>`;
      }
      // nested table
      let rows = val;
      if (opts.maxRows > 0 && rows.length > opts.maxRows) {
        rows = rows.slice(0, opts.maxRows);
      }
      return `<div class="tt-nested-inner">${renderTable(rows, depth + 1, opts)}</div>`;
    }

    // primitive array → comma-separated
    const items = val.map((v) =>
      v === null || v === undefined
        ? '<span class="tt-null">null</span>'
        : typeof v === 'object'
          ? `[object]`
          : esc(String(v)),
    );
    if (opts.maxRows > 0 && items.length > opts.maxRows) {
      items.length = opts.maxRows;
      items.push('…');
    }
    return `<span class="tt-primitive-list">${items.join(', ')}</span>`;
  }

  // ----- object -----
  if (isObject(val)) {
    if (Object.keys(val).length === 0) {
      return '<span class="tt-empty">{ }</span>';
    }
    if (opts.maxDepth > 0 && depth >= opts.maxDepth) {
      return `<span class="tt-primitive-list">{…}</span>`;
    }
    return `<div class="tt-nested-inner">${renderKeyValueTable(val, depth + 1, opts)}</div>`;
  }

  return esc(String(val));
}

/**
 * Render an array of uniform objects as a table (key = column name → value).
 */
function renderTable(rows: Record<string, unknown>[], depth: number, opts: Required<ToonTableOptions>): string {
  const cols = extractColumns(rows);
  let html = '<table>\n<thead>\n<tr>';
  for (const col of cols) {
    html += `<th>${esc(col)}</th>`;
  }
  html += '</tr>\n</thead>\n<tbody>\n';

  for (const row of rows) {
    html += '<tr>';
    for (const col of cols) {
      const v = col in row ? row[col] : null;
      html += `<td>${renderValue(v, depth, opts)}</td>`;
    }
    html += '</tr>\n';
  }

  html += '</tbody>\n</table>';
  return html;
}

/**
 * Render an object as a key | value table.
 */
function renderKeyValueTable(obj: Record<string, unknown>, depth: number, opts: Required<ToonTableOptions>): string {
  const entries = Object.entries(obj);
  let html = '<table>\n<thead>\n<tr><th>key</th><th>value</th></tr>\n</thead>\n<tbody>\n';

  for (const [key, val] of entries) {
    html += '<tr>';
    html += `<td><span class="tt-key">${esc(key)}</span></td>`;
    html += `<td>${renderValue(val, depth, opts)}</td>`;
    html += '</tr>\n';
  }

  html += '</tbody>\n</table>';
  return html;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const defaults: Required<ToonTableOptions> = {
  indent: 2,
  strict: false,
  maxDepth: 0,
  maxRows: 0,
};

/**
 * Render a TOON string as an HTML table fragment.
 *
 * Returns a `<div class="toon-table-root">…</div>` containing the nested
 * table view. The fragment includes embedded `<style>` so it is fully
 * standalone — just drop it into any page.
 */
export function toonToTableHTML(toonStr: string, options: ToonTableOptions = {}): string {
  const opts = { ...defaults, ...options };

  // Strip comments then parse TOON → JSON
  const cleaned = preprocessToon(toonStr);
  const decodeOpts: DecodeOptions = { indent: opts.indent, strict: opts.strict };
  const data = decode(cleaned, decodeOpts);

  return jsonToTableHTML(data, options);
}

/**
 * Render a JSON value as an HTML table fragment.
 */
export function jsonToTableHTML(data: unknown, options: ToonTableOptions = {}): string {
  const opts = { ...defaults, ...options };

  let body: string;

  if (isObject(data)) {
    body = renderKeyValueTable(data, 0, opts);
  } else if (Array.isArray(data) && isArrayOfObjects(data)) {
    body = renderTable(data, 0, opts);
  } else {
    // Wrap primitives / mixed arrays
    body = `<table><tbody><tr><td>${renderValue(data, 0, opts)}</td></tr></tbody></table>`;
  }

  return `<style>${TABLE_CSS}</style>\n<div class="toon-table-root">\n  ${body}\n</div>`;
}

/**
 * Render a TOON string as a complete standalone HTML page.
 *
 * Returns a full `<html>…</html>` document.
 */
export function toonToFullPageHTML(toonStr: string, options: FullPageOptions = {}): string {
  const { title = 'TOON Table Preview', extraCss = '', ...tableOpts } = options;
  const fragment = toonToTableHTML(toonStr, tableOpts);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  ${extraCss ? `<style>${extraCss}</style>` : ''}
</head>
<body style="margin:0;padding:0;background:#fff;">
  ${fragment}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Convenience: also export from JSON
// ---------------------------------------------------------------------------

/**
 * Shortcut: JSON → full HTML page.
 */
export function jsonToFullPageHTML(data: unknown, options: FullPageOptions = {}): string {
  const { title = 'JSON Table Preview', extraCss = '', ...tableOpts } = options;
  const fragment = jsonToTableHTML(data, tableOpts);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  ${extraCss ? `<style>${extraCss}</style>` : ''}
</head>
<body style="margin:0;padding:0;background:#fff;">
  ${fragment}
</body>
</html>`;
}
