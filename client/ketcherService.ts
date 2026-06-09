import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import { ChemicalMimeType, type StructService } from 'ketcher-core';

let structService: StructService | null = null;

function getStructService() {
  if (!structService) {
    const provider = new StandaloneStructServiceProvider();
    structService = provider.createStructService({});
    structService.addKetcherId('molvis-dashboard-editor');
  }

  return structService;
}

export async function smilesToMolfile(smiles: string) {
  const service = getStructService();
  const result = await service.convert({
    input_format: ChemicalMimeType.DaylightSmiles,
    output_format: ChemicalMimeType.Mol,
    struct: smiles,
  });
  return result.struct;
}

export async function molfileToSmiles(molfile: string) {
  const service = getStructService();
  const result = await service.convert({
    input_format: ChemicalMimeType.Mol,
    output_format: ChemicalMimeType.DaylightSmiles,
    struct: molfile,
  });
  return result.struct.trim();
}

export async function cleanMolfile(molfile: string) {
  const service = getStructService();
  const result = await service.clean({
    output_format: ChemicalMimeType.Mol,
    selected: [],
    struct: molfile,
  });
  return result.struct;
}

export async function checkMolfile(molfile: string) {
  const service = getStructService();
  return service.check({
    struct: molfile,
    types: ['valence', 'overlapping_atoms', 'overlapping_bonds', 'pseudoatoms'],
  });
}
