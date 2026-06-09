# Chem Editor Module

## 1. Module Overview

The Chem Editor module provides a standalone molecule editing workspace for small molecules. It accepts SMILES strings, MDL MOL blocks, or structures created in the built-in 2D sketch surface, and produces a normalized `StructurePayload` containing the current SMILES and/or molfile representation. The module is responsible only for structure entry, editing, fragment insertion, local preview, and sync callbacks; prediction, 3D visualization, generation, and retrosynthesis belong to separate modules.

## 2. Interface Definition

### Feature Requirements Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Accept SMILES string as input | Supported | Paste or type SMILES in the editor input or load through `acceptedSmiles`. |
| Import MOL format | Supported | Paste a V2000/V3000 molfile block into the editor. |
| Import SDF format | Partial | Single-molecule mol blocks work; multi-record SDF import is not implemented. |
| Draw molecule structures manually | Supported | `StructureEvidenceEditor` provides atom, bond, fragment, zoom, delete, and clear controls. |
| Render molecule as 2D diagram | Supported | The standalone app uses local SVG previews; host integrations can replace them with backend-rendered SVG. |
| Display atom labels | Supported | Sketch atoms render element labels; generated SVG depends on the renderer used by the host or shim. |
| Highlight atoms or bonds | Supported | Fragment highlighting is exposed through `moleculeService.highlightSubstructure`. |
| Export 2D structure as image | Not implemented | No direct image export button is included in this module. |
| Navigate to 3D view | Not implemented | This module emits structure data; a host app must wire navigation to a 3D module. |
| Real-time 2D to 3D sync | Not implemented | Sync callbacks are available, but no 3D viewer is included here. |

### Standalone App

The standalone app is the entry point for this repository.

| Item | Value |
|------|-------|
| Root component | `src/App.tsx` |
| Browser entry | `src/main.tsx` |
| Local service shim | `src/services/moleculeService.ts` |
| Dev command | `npm run dev` |
| Default local URL | `http://127.0.0.1:5174` |
| Build command | `npm run build` |

The standalone app opens directly to the editor. It has no account gate or external workspace dependency.

### React Components

| Export | File | Purpose |
|--------|------|---------|
| `StructureEvidenceEditor` | `client/StructureEvidenceEditor.tsx` | Primary rich editor used by the standalone app. |
| `StructureEditorPanel` | `client/StructureEditorPanel.tsx` | Text-first SMILES/molfile editor with an imperative ref API. |
| `EditorPage` | `client/EditorPage.tsx` | Host-page editor that expects shared workspace and command APIs. |
| `KetcherEditorPanel` | `client/KetcherEditorPanel.tsx` | Ketcher-based drawing panel for host integrations. |
| `WorkspaceEditorHandle` | `client/StructureEditorPanel.tsx` | Ref API for loading, exporting, and clearing structure state. |

### Input Formats

| Format | Accepted By | Example | Notes |
|--------|-------------|---------|-------|
| SMILES string | `acceptedSmiles`, editor input, `loadStructure()` | `CCO` | Whitespace is trimmed and the first token is used. |
| MDL MOL block | Editor input, `loadStructure()` | V2000 or V3000 block | Detected by `V2000`, `V3000`, or `M  END`. |
| Sketch state | `StructureEvidenceEditor` canvas | User-drawn atoms and bonds | Converted to an internal V2000 molfile before syncing. |
| Fragment SMILES | Fragment input | `O`, `CCO`, `[*:1]O[*:2]` | Used for highlight and insertion workflows. |

### Output: `StructurePayload`

All sync points use the same output shape.

```ts
export interface StructurePayload {
  smiles: string;
  molfile: string;
  designEdit?: {
    afterSmiles: string;
    beforeSmiles: string;
    beforeMolfile?: string;
    fragmentLabel: string;
  };
}
```

| Field | Meaning |
|-------|---------|
| `smiles` | Current molecule as a SMILES string when available. |
| `molfile` | Current molecule as an MDL molfile when available. |
| `designEdit` | Optional metadata when a fragment insertion creates a before/after edit. |

### `StructureEvidenceEditor` Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `acceptedSmiles` | `string` | Yes | Initial or externally accepted SMILES. |
| `onOpenStructureFile` | `() => void` | Yes | Called when the user selects the upload action. |
| `onSyncStructure` | `(payload: StructurePayload) => void \| Promise<void>` | No | Called when the current structure should be synced outward. |
| `structureSvg` | `string \| null` | No | Optional pre-rendered structure SVG. |
| `heatmapSvg` | `string \| null` | No | Optional atom-contribution SVG overlay. |
| `invalidMessage` | `string \| null` | No | External validation message. |
| `shapProperty` | `'tpsa' \| 'logp' \| 'molecular_weight' \| 'hbd' \| 'hba'` | No | Selected atom-contribution property label. |
| `shapRawContributions` | `number[]` | No | Optional atom-level contribution values. |
| `shapStatus` | `'idle' \| 'running' \| 'ready' \| 'error'` | No | Status of the contribution overlay. |
| `shapError` | `string \| null` | No | Contribution overlay error text. |

### `StructureEditorPanel` Ref API

```ts
export interface WorkspaceEditorHandle {
  clear: () => Promise<void>;
  exportStructure: () => Promise<StructurePayload>;
  loadStructure: (structure: string) => Promise<void>;
}
```

Use this API when a parent component needs to load a structure programmatically, pull the current editor state, or clear the editor.

### Local Service Contract

The standalone app provides `src/services/moleculeService.ts` so the editor can run without a host backend.

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `analyzeWorkspace(payload)` | `{ smiles?, molfile? }` | `{ smiles, molfile, structure_2d }` | Normalizes the structure and returns a preview SVG. |
| `highlightSubstructure(smiles, query, options?)` | Target structure and fragment query | Match counts, matched atoms, SVG previews | Drives fragment highlight feedback. |
| `insertFragment(payload)` | Fragment insertion request | `{ smiles, molfile, fragment_label, selected_bond_index }` | Updates the current structure with a fragment. |

Host applications can replace this shim with a chemistry backend as long as the same function names and response shapes are preserved.

## 3. Usage Example

### Run the standalone editor

```bash
npm install
npm run dev -- --port 5174
```

Open:

```text
http://127.0.0.1:5174
```

Expected result: the page displays `Chem Editor`, a molecule sketch surface, atom and bond controls, a fragment input, and sync controls. It opens directly to the editor.

### Embed the rich editor in another React app

```tsx
import { useState } from 'react';
import { StructureEvidenceEditor } from './client/StructureEvidenceEditor';
import type { StructurePayload } from './client/StructureEditorPanel';

export function EditorHost() {
  const [smiles, setSmiles] = useState('CCO');

  async function syncStructure(payload: StructurePayload) {
    setSmiles(payload.smiles || smiles);
    console.log(payload);
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

Expected result: the editor loads ethanol (`CCO`). When the user draws or syncs a structure, `syncStructure` receives the current `StructurePayload`.

## 4. How to Extend

### Add a new supported input format

Touch `client/StructureEditorPanel.tsx` if the format can be represented as text. Update `isMolfile`, `detectMode`, and `toPayload` so the new format is converted into `StructurePayload`. Leave `StructurePayload` stable unless every downstream module is updated at the same time.

### Add new sketch controls

Touch `client/StructureEvidenceEditor.tsx`. Add controls near the existing atom palette, bond order buttons, or fragment library depending on the workflow. Preserve the existing `onSyncStructure` behavior so parent apps still receive a `StructurePayload`.

### Replace the standalone chemistry shim with a backend

Touch `src/services/moleculeService.ts`. Keep the function names and response fields the same. Replace the mock SVG and fragment behavior with HTTP calls or a chemistry library. Do not change `StructureEvidenceEditor` just to swap service implementations.

### Add image export

Add a command in `StructureEvidenceEditor` that serializes the active SVG or sketch canvas into a downloadable PNG or SVG file. Keep export logic isolated in a utility so it can be reused by future visualization modules.

### Add 2D to 3D navigation

Do not add a 3D viewer inside this module. Instead, emit the latest `StructurePayload` through `onSyncStructure`, then let the host router or shell navigate to the 3D module with that payload.

## 5. Known Limitations

- Multi-record SDF import is not implemented.
- Image export is not implemented.
- No 3D renderer is included in this repository.
- Real-time 2D to 3D synchronization requires a separate host or visualization module.
- The standalone service shim is designed for local interaction and preview, not chemically rigorous validation.
- Ketcher integration exists in `client/KetcherEditorPanel.tsx`, but the standalone app currently uses `StructureEvidenceEditor`.
- Server-side routes are not included in this repository.
