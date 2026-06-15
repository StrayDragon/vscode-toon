# @toon-format/toon-table

Render [TOON](https://toonformat.dev) format as interactive nested HTML tables.

**Zero runtime dependencies** (beyond `@toon-format/toon` for parsing). Works in **browser** and **Node.js**.

Mirrors the rendering style of [jsontotable.org/toon-to-table](https://jsontotable.org/toon-to-table).

## Install

```bash
npm install @toon-format/toon-table
```

## Usage

### Render TOON → HTML fragment

```ts
import { toonToTableHTML } from '@toon-format/toon-table';

const toon = `name: Alice
age: 30
tags[3]: js,ts,react
users[2]{id,name,role}:
  1,Alice,admin
  2,Bob,user`;

const html = toonToTableHTML(toon);
// → '<style>…</style><div class="toon-table-root">…</div>'

document.getElementById('app').innerHTML = html;
```

### Render JSON → HTML fragment

```ts
import { jsonToTableHTML } from '@toon-format/toon-table';

const data = {
  name: 'Alice',
  tags: ['js', 'ts'],
  users: [{ id: 1, name: 'Alice' }]
};

const html = jsonToTableHTML(data);
```

### Full standalone page

```ts
import { toonToFullPageHTML } from '@toon-format/toon-table';
import { writeFileSync } from 'fs';

const html = toonToFullPageHTML(toonStr, { title: 'My Preview' });
writeFileSync('preview.html', html);
```

### Options

```ts
toonToTableHTML(toon, {
  indent: 2,        // TOON indent size (default 2)
  strict: false,     // Strict parsing (default false)
  maxDepth: 0,       // Max nesting depth (0 = unlimited)
  maxRows: 0,        // Max rows per table (0 = unlimited)
});
```

## API

| Export | Description |
|--------|-------------|
| `toonToTableHTML(toonStr, opts?)` | TOON string → HTML `<div>` fragment with inline `<style>` |
| `jsonToTableHTML(data, opts?)` | JSON value → HTML `<div>` fragment with inline `<style>` |
| `toonToFullPageHTML(toonStr, opts?)` | TOON → full `<html>…</html>` document |
| `jsonToFullPageHTML(data, opts?)` | JSON → full `<html>…</html>` document |

## How it works

1. Parse TOON → JSON using `@toon-format/toon`'s `decode()`
2. Walk the JSON tree recursively
3. Render **objects** as `key | value` tables
4. Render **arrays-of-objects** as columnar tables
5. Nest tables inside cells for deep structures
6. Embed all CSS inline — no external stylesheets needed

## License

MIT
