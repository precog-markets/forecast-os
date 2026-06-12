import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOutcomeChoices,
  parseOutcomeList,
  resolveOutcomeIndex,
} from "../lib/outcome.mjs";

test("resolveOutcomeIndex maps outcome label to 1-based index", () => {
  const outcomeList = ["Claude", "Gemini", "Grok"];
  assert.equal(
    resolveOutcomeIndex({ outcomeLabel: "Claude", outcomeList }),
    1,
  );
  assert.equal(
    resolveOutcomeIndex({ outcome: "2", outcomeLabel: "Gemini", outcomeList }),
    2,
  );
});

test("resolveOutcomeIndex rejects mismatched outcome and label", () => {
  const outcomeList = ["Claude", "Gemini", "Grok"];
  assert.throws(
    () => resolveOutcomeIndex({ outcome: "2", outcomeLabel: "Claude", outcomeList }),
    /--outcome 2 and --outcome-label "Claude" disagree/,
  );
});

test("resolveOutcomeIndex lists valid outcomes on unknown label", () => {
  const outcomeList = ["Claude", "Gemini"];
  assert.throws(
    () => resolveOutcomeIndex({ outcomeLabel: "ChatGPT", outcomeList }),
    (error) => error.message.includes(formatOutcomeChoices(outcomeList)),
  );
});

test("parseOutcomeList splits pipe and comma forms", () => {
  assert.deepEqual(parseOutcomeList("Yes|No"), ["Yes", "No"]);
  assert.deepEqual(parseOutcomeList("Claude,Gemini,Grok"), ["Claude", "Gemini", "Grok"]);
});
