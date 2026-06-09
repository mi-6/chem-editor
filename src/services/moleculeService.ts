type StructurePayload = {
  molfile?: string;
  smiles?: string;
};

type HighlightOptions = {
  molfile?: string;
  propertyName?: string;
};

function svgFor(label: string) {
  const safe = label.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 110"><rect width="180" height="110" rx="10" fill="#f8fafc"/><circle cx="52" cy="55" r="14" fill="#142033"/><circle cx="92" cy="36" r="14" fill="#2958ff"/><circle cx="132" cy="55" r="14" fill="#16a34a"/><path d="M65 50 L79 42 M105 42 L119 50" stroke="#334155" stroke-width="5" stroke-linecap="round"/><text x="90" y="95" text-anchor="middle" font-family="monospace" font-size="12" fill="#475569">${safe}</text></svg>`;
}

export const moleculeService = {
  async analyzeWorkspace(payload: StructurePayload) {
    const smiles = payload.smiles || 'CCO';
    return {
      smiles,
      molfile: payload.molfile || '',
      structure_2d: svgFor(smiles),
    };
  },

  async highlightSubstructure(smiles: string, query: string, options?: HighlightOptions) {
    const propertyName = options?.propertyName || 'logp';
    const propertyScale: Record<string, number> = {
      hba: -0.35,
      hbd: 0.4,
      logp: 0.75,
      molecular_weight: 0.55,
      tpsa: -0.65,
    };
    const contribution = propertyScale[propertyName] ?? 0.25;

    return {
      atom_contribution_svg: svgFor(query),
      error: '',
      highlighted_svg: svgFor(`${query} in ${smiles || 'molfile'}`),
      matched_atoms: query ? [0] : [],
      matched_contributions: [{ atom_index: 0, normalized: contribution, raw: contribution }],
      num_matches: query ? 1 : 0,
      property_name: propertyName,
    };
  },

  async insertFragment(payload: {
    fragment_id?: string;
    fragment_label: string;
    fragment_smiles: string;
    molfile?: string;
    selected_bond_index?: number;
    smiles?: string;
  }) {
    const smiles = payload.fragment_smiles.trim() || payload.smiles || 'CCO';
    return {
      fragment_label: payload.fragment_label,
      molfile: '',
      selected_bond_index: 0,
      smiles,
      used_fallback_bond: false,
    };
  },
};
