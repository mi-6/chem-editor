# molvi-editor

**Changed the project settings!**

MolVis structure editor module — SMILES/molfile input, Ketcher drawing, and structure validation.

## Standalone app

```bash
npm install
npm run dev
```

Local app: `http://127.0.0.1:5174`

The standalone app opens directly to the editor. No sign-in flow is included.

## Documentation

Full module documentation (interface, usage, extension guide, limitations):

**[docs/molvi-editor.md](docs/molvi-editor.md)**

## Layout

```
client/   React components (EditorPage, KetcherEditorPanel, StructureEditorPanel, …)
src/      Standalone Vite app wrapper and local service shims
docs/     Module documentation
```

## Host integration

This module is designed to plug into the MolVis monorepo. Configure the host Vite alias:

```ts
'@editor': path.resolve(__dirname, '../editor/client')
```

## Route

`/editor`

## Testing

From the MolVis monorepo:

```bash
./editor/scripts/run-tests.sh
```

Runs 2 Vitest tests (`KetcherEditorPanel.test.tsx`). Requires `npm install` in the host `client/`.
