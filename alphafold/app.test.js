import { describe, expect, it } from "vitest";
import {
  buildConfidenceBars,
  colorForPlddt,
  getModelSource,
  getSequenceMatchId,
  getUniProtId,
  normalizeSequence,
} from "./app.js";

describe("AlphaFold helpers", () => {
  it("maps pLDDT values to confidence colors", () => {
    expect(colorForPlddt(95)).toBe("#1f77b4");
    expect(colorForPlddt(75)).toBe("#76b7b2");
    expect(colorForPlddt(55)).toBe("#f1ce63");
    expect(colorForPlddt(10)).toBe("#e07b39");
  });

  it("normalizes sequences", () => {
    expect(normalizeSequence("Abc def\nG")).toBe("ABCDEFG");
  });

  it("prefers PDB and falls back to mmCIF", () => {
    expect(getModelSource({ pdbUrl: "pdb", cifUrl: "cif" })).toEqual({ url: "pdb", format: "pdb" });
    expect(getModelSource({ cifUrl: "cif" })).toEqual({ url: "cif", format: "cif" });
  });

  it("builds the four confidence bands", () => {
    const bars = buildConfidenceBars({
      fractionPlddtVeryHigh: 0.4,
      fractionPlddtConfident: 0.3,
      fractionPlddtLow: 0.2,
      fractionPlddtVeryLow: 0.1,
    });
    expect(bars).toHaveLength(4);
    expect(bars[0].fraction).toBe(0.4);
    expect(bars[3].label).toBe("Very low");
  });

  it("reads the current AlphaFold sequence-search response shape", () => {
    const data = {
      structures: [
        { summary: { oligomeric_state: "HETERODIMER", entities: [{ identifier_category: "UNIPROT", identifier: "WRONG" }] } },
        { summary: { oligomeric_state: "MONOMER", entities: [{ identifier_category: "UNIPROT", identifier: "P69905" }] } },
      ],
    };
    expect(getSequenceMatchId(data)).toBe("P69905");
  });

  it("displays the accession instead of the entry mnemonic", () => {
    expect(getUniProtId({ uniprotAccession: "P69905", uniprotId: "HBA_HUMAN" }, "fallback")).toBe("P69905");
  });
});
