# molvi-editor

**Changed the project settings!**

MolVis structure editor module — SMILES/molfile input, Ketcher drawing, and structure validation.

## Documentation

Full module documentation (interface, usage, extension guide, limitations):

**[docs/molvi-editor.md](docs/molvi-editor.md)**

## Layout

```
client/   React components (EditorPage, KetcherEditorPanel, StructureEditorPanel, …)
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
