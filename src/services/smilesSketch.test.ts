import { describe, expect, it } from 'vitest';

import { sketchFromSmiles } from './smilesSketch';

type SmilesFixture = {
  atoms?: number;
  components?: number;
  name: string;
  ring?: boolean;
  smiles: string;
  triple?: boolean;
};

const fixtures: SmilesFixture[] = [
  { name: 'Dinitrogen', smiles: 'N#N', atoms: 2, triple: true },
  { name: 'Methyl isocyanate', smiles: 'CN=C=O', atoms: 4 },
  { name: 'Copper(II) sulfate', smiles: '[Cu+2].[O-]S(=O)(=O)[O-]', atoms: 6, components: 2 },
  { name: 'Vanillin original', smiles: 'O=Cc1ccc(O)c(OC)c1', ring: true },
  { name: 'Vanillin alternate', smiles: 'COc1cc(C=O)ccc1O', ring: true },
  { name: 'Melatonin original', smiles: 'CC(=O)NCCC1=CNc2c1cc(OC)cc2', ring: true },
  { name: 'Melatonin alternate', smiles: 'CC(=O)NCCc1c[nH]c2ccc(OC)cc12', ring: true },
  { name: 'Flavopereirin original', smiles: 'CCc(c1)ccc2[n+]1ccc3c2[nH]c4c3cccc4', ring: true },
  { name: 'Flavopereirin alternate', smiles: 'CCc1c[n+]2ccc3c4ccccc4[nH]c3c2cc1', ring: true },
  { name: 'Nicotine', smiles: 'CN1CCC[C@H]1c2cccnc2', ring: true },
  { name: 'Oenanthotoxin original', smiles: 'CCC[C@@H](O)CC\\C=C\\C=C\\C#CC#C\\C=C\\CO', triple: true },
  { name: 'Oenanthotoxin alternate', smiles: 'CCC[C@@H](O)CC/C=C/C=C/C#CC#C/C=C/CO', triple: true },
  { name: 'Pyrethrin II', smiles: 'CC1=C(C(=O)C[C@@H]1OC(=O)[C@@H]2[C@H](C2(C)C)/C=C(\\C)/C(=O)OC)C/C=C\\C=C', ring: true },
  { name: 'Aflatoxin B1', smiles: 'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5', ring: true },
  { name: 'Glucose beta-D-glucopyranose', smiles: 'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H](O)[C@H](O)1', ring: true },
  { name: 'Bergenin', smiles: 'OC[C@@H](O1)[C@@H](O)[C@H](O)[C@@H]2[C@@H]1c3c(O)c(OC)c(O)cc3C(=O)O2', ring: true },
  { name: 'Californian scale insect pheromone', smiles: 'CC(=O)OCCC(/C)=C\\C[C@H](C(C)=C)CCC=C' },
  { name: '(2S,5R)-Chalcogran', smiles: 'CC[C@H](O1)CC[C@@]12CCCO2', ring: true },
  { name: 'alpha-Thujone', smiles: 'CC(C)[C@@]12C[C@@H]1[C@@H](C)C(=O)C2', ring: true },
  { name: 'Thiamine', smiles: 'OCCc1c(C)[n+](cs1)Cc2cnc(C)nc2N', ring: true },
];

function componentCount(bonds: Array<{ from: number; to: number }>, atomCount: number) {
  const seen = new Set<number>();
  const adjacency = new Map<number, number[]>();
  bonds.forEach((bond) => {
    adjacency.set(bond.from, [...(adjacency.get(bond.from) || []), bond.to]);
    adjacency.set(bond.to, [...(adjacency.get(bond.to) || []), bond.from]);
  });

  let count = 0;
  for (let atomId = 1; atomId <= atomCount; atomId += 1) {
    if (seen.has(atomId)) continue;
    count += 1;
    const queue = [atomId];
    seen.add(atomId);
    while (queue.length) {
      const current = queue.shift() || 0;
      (adjacency.get(current) || []).forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
  }
  return count;
}

describe('sketchFromSmiles fixture coverage', () => {
  it.each(fixtures)('parses and lays out $name', (fixture) => {
    const sketch = sketchFromSmiles(fixture.smiles);

    expect(sketch, fixture.name).not.toBeNull();
    expect(sketch?.atoms.length).toBeGreaterThanOrEqual(fixture.atoms || 2);
    expect(sketch?.atoms.every((atom) => Number.isFinite(atom.x) && Number.isFinite(atom.y))).toBe(true);
    expect(sketch?.bonds.every((bond) => bond.from !== bond.to)).toBe(true);

    if (fixture.triple) {
      expect(sketch?.bonds.some((bond) => bond.order === 3)).toBe(true);
    }

    if (fixture.ring) {
      expect((sketch?.bonds.length || 0)).toBeGreaterThanOrEqual(sketch?.atoms.length || 0);
    }

    if (fixture.components) {
      expect(componentCount(sketch?.bonds || [], sketch?.atoms.length || 0)).toBe(fixture.components);
    }
  });
});

describe('OpenSMILES details', () => {
  it('preserves bracket atom metadata', () => {
    const sketch = sketchFromSmiles('[13C@@H+:7]([O-])N');
    const atom = sketch?.atoms[0];

    expect(atom).toMatchObject({
      atomClass: 7,
      charge: 1,
      chirality: '@@',
      element: 'C',
      hydrogens: 1,
      isotope: 13,
    });
    expect(sketch?.atoms.some((candidate) => candidate.element === 'O' && candidate.charge === -1)).toBe(true);
  });

  it('supports repeated charge shorthand in bracket atoms', () => {
    const sketch = sketchFromSmiles('[N++]([O--])C');

    expect(sketch?.atoms[0]).toMatchObject({ charge: 2, element: 'N' });
    expect(sketch?.atoms.some((candidate) => candidate.element === 'O' && candidate.charge === -2)).toBe(true);
  });

  it('marks aromatic bonds on aromatic ring closures', () => {
    const sketch = sketchFromSmiles('c1ccccc1');

    expect(sketch?.atoms.every((atom) => atom.aromatic)).toBe(true);
    expect(sketch?.bonds.some((bond) => bond.aromatic)).toBe(true);
    expect(sketch?.bonds.length).toBe(6);
  });

  it('preserves directional slash bond markers', () => {
    const sketch = sketchFromSmiles('C/C=C\\C');

    expect(sketch?.bonds.some((bond) => bond.stereo === '/')).toBe(true);
    expect(sketch?.bonds.some((bond) => bond.stereo === '\\')).toBe(true);
  });

  it('supports two-digit ring closures', () => {
    const sketch = sketchFromSmiles('C%12CCCCC%12');

    expect(sketch?.atoms.length).toBe(6);
    expect(sketch?.bonds.length).toBe(6);
  });
});
