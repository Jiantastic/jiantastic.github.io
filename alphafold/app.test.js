const assert = require("assert");
const {
  buildConfidenceBars,
  colorForPlddt,
  getModelSource,
  normalizeSequence,
} = require("./app.js");

const run = () => {
  assert.strictEqual(colorForPlddt(95), "#1f77b4");
  assert.strictEqual(colorForPlddt(75), "#76b7b2");
  assert.strictEqual(colorForPlddt(55), "#f1ce63");
  assert.strictEqual(colorForPlddt(10), "#e07b39");

  assert.strictEqual(normalizeSequence("Abc def"), "ABCDEF");

  const modelSource = getModelSource({
    pdbUrl: "pdb",
    cifUrl: "cif",
  });
  assert.deepStrictEqual(modelSource, { url: "pdb", format: "pdb" });

  const bars = buildConfidenceBars({
    fractionPlddtVeryHigh: 0.4,
    fractionPlddtConfident: 0.3,
    fractionPlddtLow: 0.2,
    fractionPlddtVeryLow: 0.1,
  });
  assert.strictEqual(bars.length, 4);
  assert.strictEqual(bars[0].fraction, 0.4);
  assert.strictEqual(bars[3].label, "Very low");

  console.log("All tests passed.");
};

run();
