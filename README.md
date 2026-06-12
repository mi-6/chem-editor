# Chem Editor

Chem Editor is a molecule structure editing module for entering, sketching, validating, previewing, and syncing small-molecule structures. It includes a standalone Vite app for local frontend development and reusable React components for integration into the broader MolVis workspace.

The module is designed around this workflow:

1. Start from a SMILES string, molfile, query parameter, or blank sketch.
2. Edit the structure using text input or the rich sketch surface.
3. Preview the current structure as a 2D molecule diagram.
4. Highlight substructures or atom-contribution evidence.
5. Insert common or custom fragments.
6. Sync a normalized `StructurePayload` to the host application.

## Current Capability

| Area | Status | Notes |
| --- | --- | --- |
| Standalone React app | Supported | Runs directly with Vite and opens to the editor. |
| SMILES input | Supported | Can be loaded from query string, props, or text editor. |
| MDL MOL input | Supported | V2000/V3000 blocks are detected by text editor helpers. |
| SDF input | Partial | Single mol blocks can work; multi-record SDF import is not implemented. |
| Rich sketch surface | Supported | Atoms, bonds, delete, clear, zoom, and fragment workflows. |
| Text-first editor | Supported | `StructureEditorPanel` exposes a textarea and imperative ref API. |
| Local 2D preview | Supported | Standalone service renders local OpenSMILES sketches without a backend. |
| Backend 2D preview | Supported when configured | Set `VITE_CHEM_API_BASE_URL` to use backend/RDKit endpoints. |
| Substructure highlight | Supported | Uses backend when configured and local OpenSMILES atom matching otherwise. |
| Fragment insertion | Supported as prototype | Local fallback concatenates simple fragment SMILES. |
| Ketcher panel | Host-oriented | `KetcherEditorPanel` supports conversion and preview flows with host dependencies. |
| 3D navigation | Host-dependent | This module emits structure data; it does not include a 3D viewer. |
| Image export | Partial | Ketcher panel can download SVG previews; rich editor has no full export workflow yet. |

## Repository Layout

```text
chem-editor/
  client/
    EditorPage.tsx                  Host-page editor integration.
    KetcherEditorPanel.tsx          Ketcher-style SMILES/molfile preview panel.
    KetcherEditorPanel.test.tsx     Host-side component tests.
    StructureEditorPanel.tsx        Text-first SMILES/molfile editor with ref API.
    StructureEvidenceEditor.tsx     Rich standalone sketch and evidence editor.
    ketcherService.ts               Ketcher conversion helpers.

  src/
    App.tsx                         Standalone app shell.
    main.tsx                        Vite browser entry and MUI theme setup.
    styles.css                      Shared standalone styling tokens.
    services/moleculeService.ts     Local/backend hybrid molecule service shim.
    features/workspace/types.ts     Local workspace type shims.
    utils/apiError.ts               Error message helper.

  docs/
    molvi-editor.md                 Additional module contract and extension notes.

  scripts/
    run-tests.sh                    Host-monorepo test runner.
```

## Prerequisites

For frontend-only development:

- Node.js 20 or newer is recommended.
- npm, included with Node.js.

For host/backend integration:

- MolVis host frontend with shared aliases, artifacts, command types, and workspace types.
- Optional chemistry backend exposing analyze and substructure-highlight endpoints.
- Optional Ketcher/Indigo tooling if using the host Ketcher panel at full fidelity.

The standalone app uses the local MolVis backend at `http://127.0.0.1:8000/api/v1` by default for RDKit-backed analysis and highlighting. Set `VITE_CHEM_API_BASE_URL=standalone` when you intentionally want frontend-only local parsing.

## Quick Start: Standalone UI

Install dependencies:

```bash
npm install
```

Start the local Vite server:

```bash
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

You can preload a molecule with a query parameter:

```text
http://127.0.0.1:5173/?smiles=CCO
```

Build the standalone app:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## What the Standalone App Does

The standalone app starts at `src/App.tsx`. It renders `StructureEvidenceEditor` directly and manages:

- Current accepted SMILES.
- Sync status text.
- Selected atom-contribution property.
- A disabled file-upload placeholder for standalone mode.

On sync, the app stores the latest SMILES from the emitted `StructurePayload`. If no SMILES is available, it displays a generic molfile status.

The standalone app is intentionally focused on structure entry and editing. It does not include account flows, workspace persistence, 3D visualization, prediction, generation, or retrosynthesis.

## Backend Mode

The default `npm run dev` command calls the local MolVis backend at `http://127.0.0.1:8000/api/v1`. Start the MolVis server first:

```bash
cd /Users/skb/Documents/molvis/server
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

To use a different backend:

```bash
VITE_CHEM_API_BASE_URL=http://127.0.0.1:8000/api/v1 npm run dev
```

When the backend cannot be reached, the editor labels results as coming from the local OpenSMILES parser and does not pretend SHAP values are available. Use backend/RDKit mode for canonical SMILES, chemically precise 2D coordinates, valence validation, and model-derived atom contributions.

To force local-only development:

```bash
npm run dev:standalone
```

## Core Data Contract

All editor sync points use `StructurePayload`.

File:

```text
client/StructureEditorPanel.tsx
```

Type:

```ts
export interface StructurePayload {
  designEdit?: {
    afterSmiles: string;
    beforeMolfile?: string;
    beforeSmiles: string;
    fragmentLabel: string;
  };
  smiles: string;
  molfile: string;
}
```

Field meanings:

| Field | Meaning |
| --- | --- |
| `smiles` | Current structure as SMILES when available. |
| `molfile` | Current structure as MDL molfile when available. |
| `designEdit` | Optional before/after metadata for fragment insertion workflows. |

Keep this shape stable when integrating with other modules. Editor, generator, retrosynthesis, docking, and visualization workflows can all pass this structure without directly depending on one another.

## Frontend Architecture

### `StructureEvidenceEditor`

File:

```text
client/StructureEvidenceEditor.tsx
```

Purpose:

- Provides the primary standalone editing experience.
- Supports a sketch-like atom and bond canvas.
- Supports atom palette, bond order, zoom, delete, clear, and sync controls.
- Provides fragment highlighting and insertion workflows.
- Supports atom-contribution property selection.
- Emits `StructurePayload` through `onSyncStructure`.

Important props:

| Prop | Type | Purpose |
| --- | --- | --- |
| `acceptedSmiles` | `string` | Initial or externally accepted structure. |
| `onOpenStructureFile` | `() => void` | Called when upload/open action is selected. |
| `onSyncStructure` | `(payload) => void \| Promise<void>` | Sends current structure to parent. |
| `onChangeShapProperty` | `(property) => void` | Notifies parent of selected evidence property. |
| `structureSvg` | `string \| null` | Optional pre-rendered structure SVG. |
| `heatmapSvg` | `string \| null` | Optional atom-contribution overlay SVG. |
| `invalidMessage` | `string \| null` | External validation warning. |
| `shapProperty` | atom contribution property | Selected evidence property. |
| `shapStatus` | status string | Evidence overlay status. |
| `shapError` | `string \| null` | Evidence overlay error. |

Example:

```tsx
import { useState } from 'react';
import { StructureEvidenceEditor } from './client/StructureEvidenceEditor';
import type { StructurePayload } from './client/StructureEditorPanel';

function EditorHost() {
  const [smiles, setSmiles] = useState('CCO');

  async function syncStructure(payload: StructurePayload) {
    setSmiles(payload.smiles || smiles);
  }

  return (
    <StructureEvidenceEditor
      acceptedSmiles={smiles}
      onOpenStructureFile={() => console.log('open file picker')}
      onSyncStructure={syncStructure}
      shapProperty="logp"
    />
  );
}
```

### `StructureEditorPanel`

File:

```text
client/StructureEditorPanel.tsx
```

Purpose:

- Provides a text-first editor for SMILES or molfile input.
- Detects molfile blocks by `V2000`, `V3000`, or `M  END`.
- Normalizes SMILES by trimming and taking the first token.
- Supports Ctrl+Enter or Cmd+Enter to apply.
- Exposes an imperative ref API.

Ref API:

```ts
export interface WorkspaceEditorHandle {
  clear: () => Promise<void>;
  exportStructure: () => Promise<StructurePayload>;
  loadStructure: (structure: string) => Promise<void>;
}
```

Example:

```tsx
import { useRef } from 'react';
import {
  StructureEditorPanel,
  type WorkspaceEditorHandle,
} from './client/StructureEditorPanel';

function TextEditorHost() {
  const editorRef = useRef<WorkspaceEditorHandle>(null);

  return (
    <>
      <button onClick={() => editorRef.current?.loadStructure('CCO')}>
        Load ethanol
      </button>
      <StructureEditorPanel
        ref={editorRef}
        acceptedSmiles="CCO"
        onStructureChange={(payload) => console.log(payload)}
      />
    </>
  );
}
```

### `KetcherEditorPanel`

File:

```text
client/KetcherEditorPanel.tsx
```

Purpose:

- Provides a host-oriented Ketcher-style editing panel.
- Converts SMILES to molfile and back through `ketcherService`.
- Runs validation checks.
- Produces preview artifacts for the host workspace.
- Can download SVG previews and copy SMILES.

This component imports host-only modules such as artifact and command helpers, so it is intended for the MolVis host rather than the standalone Vite app.

### `EditorPage`

File:

```text
client/EditorPage.tsx
```

Purpose:

- Host page implementation.
- Wires the editor into shared workspace state and command flows.
- Should be used when integrating with the full MolVis shell.

## Input Formats

| Format | Supported | Notes |
| --- | --- | --- |
| SMILES | Yes | Parsed locally with OpenSMILES-oriented support for organic subset atoms, bracket atoms, rings, branches, components, and common bond syntax. |
| MDL MOL V2000 | Yes | Detected by `V2000` or `M  END`. |
| MDL MOL V3000 | Yes | Detected by `V3000` or `M  END`. |
| SDF | Partial | Single mol block can work; multi-record parsing is not implemented. |
| Sketch state | Yes | Converted internally into a V2000-like molfile for sync. |
| Fragment SMILES | Yes | Used for highlight and insertion workflows. |

## Local Molecule Service

File:

```text
src/services/moleculeService.ts
```

The standalone service exposes three functions and only calls a backend when `VITE_CHEM_API_BASE_URL` is configured:

```ts
moleculeService.analyzeWorkspace(payload)
moleculeService.highlightSubstructure(smiles, query, options?)
moleculeService.insertFragment(payload)
```

### `analyzeWorkspace(payload)`

Accepts:

```ts
{
  smiles?: string;
  molfile?: string;
}
```

Behavior:

1. In backend mode, sends a `FormData` request to `${VITE_CHEM_API_BASE_URL}/api/v1/analyze`.
2. Expects `smiles`, `molfile`, and `structure_2d` fields.
3. In standalone mode, returns a local OpenSMILES sketch preview.

### `highlightSubstructure(smiles, query, options?)`

Behavior:

1. In backend mode, sends JSON to `${VITE_CHEM_API_BASE_URL}/api/v1/substructure-highlight`.
2. Expects match counts, matched atoms, contribution values, and SVGs.
3. In standalone mode, uses lightweight local OpenSMILES atom matching and does not fabricate atom-contribution values.

### `insertFragment(payload)`

Current standalone behavior:

- Sanitizes simple attachment markers from the fragment.
- Concatenates parent and fragment SMILES as a prototype fallback.
- Returns the new SMILES and fragment label.

Production recommendation: implement fragment insertion through RDKit or the host chemistry backend so attachment points and selected bonds are handled chemically.

## Standalone Limitations

The local OpenSMILES parser is intended for resilient loading and sketching, not authoritative chemistry. It preserves common syntax such as bracket metadata, charges, chirality markers, disconnected salts, ring closures, and slash/backslash bond markers, but it does not perform RDKit-grade canonicalization, valence validation, aromaticity perception, stereochemical validation, or publication-quality coordinate generation.

## Backend Endpoint Expectations

The standalone shim can use these optional backend endpoints:

```text
POST /api/v1/analyze
POST /api/v1/substructure-highlight
```

`/analyze` request:

```text
multipart/form-data
  smiles?: string
  molfile?: string
```

`/analyze` response:

```json
{
  "smiles": "CCO",
  "molfile": "...",
  "structure_2d": "<svg>...</svg>"
}
```

`/substructure-highlight` request:

```json
{
  "smiles": "CCO",
  "molfile": "",
  "smarts": "O",
  "property_name": "logp"
}
```

`/substructure-highlight` response:

```json
{
  "highlighted_svg": "<svg>...</svg>",
  "atom_contribution_svg": "<svg>...</svg>",
  "matched_atoms": [1],
  "matched_contributions": [
    { "atom_index": 1, "normalized": -0.3, "raw": -0.28 }
  ],
  "matches": [[1]],
  "num_matches": 1,
  "property_name": "logp"
}
```

## MolVis Host Integration

### Frontend Alias

Configure the host Vite alias:

```ts
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@editor': path.resolve(__dirname, '../chem-editor/client'),
    },
  },
});
```

Use host imports:

```tsx
import { StructureEvidenceEditor } from '@editor/StructureEvidenceEditor';
import { StructureEditorPanel } from '@editor/StructureEditorPanel';
```

### Host Responsibilities

A full host integration should provide:

- Routing to `/editor`.
- Workspace state for selected molecule.
- File picker implementation for `onOpenStructureFile`.
- Backend chemistry endpoints for robust analysis and highlighting.
- Cross-module routing for 3D visualization, generation, retrosynthesis, and docking.
- Artifact handlers if using `KetcherEditorPanel`.

## Development Workflow

Frontend-only:

```bash
npm install
npm run dev
npm run build
```

Host-side tests:

```bash
./chem-editor/scripts/run-tests.sh
```

The test script expects a sibling MolVis host client at:

```text
../client
```

and runs tests for:

```text
client/KetcherEditorPanel.test.tsx
```

## Common Tasks

### Load a Structure from the URL

The standalone app reads the `smiles` query parameter:

```text
/?smiles=CC(=O)OC1=CC=CC=C1C(=O)O
```

This is handled in `src/App.tsx`.

### Add a New Atom Button

Edit:

```text
client/StructureEvidenceEditor.tsx
```

Update:

```ts
const atomPalette = ['C', 'N', 'O', 'S', 'F', 'Cl', 'Br'];
```

Then make sure the local sketch-to-molfile conversion can serialize the new element.

### Add a New Default Fragment

Edit:

```text
client/StructureEvidenceEditor.tsx
```

Update `defaultFragmentLibrary`:

```ts
{
  description: 'Insert a linker.',
  id: 'custom-linker',
  label: 'Linker',
  smiles: '[*:1]C[*:2]',
}
```

Fragments with `[*:1]` and `[*:2]` are insertion-ready. Simple SMILES can still be used for highlighting or prototype insertion.

### Replace Local Fallbacks with Real Chemistry

Edit:

```text
src/services/moleculeService.ts
```

Keep the function names and response shapes stable. Replace local fallback logic with host API calls or chemistry-library calls as needed.

### Add Image Export to the Rich Editor

Recommended approach:

1. Store the active SVG or sketch canvas data.
2. Add export buttons near sync actions.
3. Export SVG first.
4. Add PNG export through canvas serialization if needed.
5. Keep export utility code separate from editor state logic.

### Add 3D Navigation

Do not embed a 3D viewer directly in this module. Instead:

1. Sync the current `StructurePayload`.
2. Let the host shell store it.
3. Navigate to the 3D module with the selected structure.

## Implementation Guidelines

- Keep `StructurePayload` stable across modules.
- Sanitize SVG before injecting it into the DOM.
- Keep standalone-safe code under `src` free of host-only imports.
- Keep host-only artifact and command integrations in `client` components that are compiled by the host.
- Do not put backend chemistry assumptions inside the editor component tree; keep them in `moleculeService`.
- Prefer callbacks for cross-module workflows instead of importing sibling feature modules directly.
- Preserve local fallback behavior so frontend developers can run the editor without a backend.

## Troubleshooting

### Vite starts on a different port

Use the URL printed by Vite. Another feature app may already be using the default port.

### Unexpected backend requests appear in standalone mode

Unset `VITE_CHEM_API_BASE_URL` and restart Vite. Standalone mode should use local OpenSMILES parsing without calling a backend.

### SMILES preview looks generic

The local OpenSMILES sketcher prioritizes resilient graph loading over publication-quality coordinates. Run a chemistry backend to get higher-quality structure diagrams.

### Molfile input is treated as SMILES

Make sure the block contains one of:

```text
V2000
V3000
M  END
```

### Ketcher panel imports fail

`KetcherEditorPanel` imports host-only modules. Use it from the MolVis host, or provide equivalent local shims before compiling it standalone.

### Fragment insertion is chemically unrealistic

The standalone insertion path is a prototype fallback. Replace `insertFragment` with a backend implementation for production chemistry.

## Known Limitations

- Multi-record SDF import is not implemented.
- The rich editor does not include a complete image export workflow.
- No 3D renderer is included.
- Real-time 2D-to-3D synchronization requires a host module.
- Local chemistry fallbacks are lightweight and not chemically rigorous.
- Ketcher integration is host-oriented.
- Server-side routes are not included in this repository.
- Fragment insertion needs backend chemistry support for production use.

## Additional Documentation

More module-level notes are available in:

```text
docs/molvi-editor.md
```
