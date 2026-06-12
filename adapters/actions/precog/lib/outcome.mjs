import { outcomes } from "./client.mjs";

export function parseOutcomeList(outcomesRaw) {
  const rawOuts = outcomes(outcomesRaw);
  if (rawOuts.length === 1 && rawOuts[0].includes(",")) {
    return rawOuts[0].split(",").map((value) => value.trim()).filter(Boolean);
  }
  return rawOuts;
}

export function formatOutcomeChoices(outcomeList) {
  return outcomeList.map((label, index) => `[${index + 1}] ${label}`).join(", ");
}

export function resolveOutcomeIndex({ outcome, outcomeLabel, outcomeList }) {
  const hasIndex = outcome !== undefined && outcome !== null && outcome !== "";
  const hasLabel = outcomeLabel !== undefined && outcomeLabel !== null && outcomeLabel !== "";

  if (!hasIndex && !hasLabel) {
    throw new Error("Provide --outcome <n> (1-based) or --outcome-label <name>.");
  }

  let resolvedIndex = null;
  if (hasIndex) {
    const parsed = Number.parseInt(String(outcome), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > outcomeList.length) {
      throw new Error(
        `Outcome index ${outcome} is out of range. Valid outcomes: ${formatOutcomeChoices(outcomeList)}.`,
      );
    }
    resolvedIndex = parsed;
  }

  if (hasLabel) {
    const needle = String(outcomeLabel).trim().toLowerCase();
    const matches = outcomeList
      .map((label, index) => ({ label, index: index + 1 }))
      .filter((entry) => entry.label.toLowerCase() === needle);
    if (matches.length === 0) {
      const partial = outcomeList
        .map((label, index) => ({ label, index: index + 1 }))
        .filter((entry) => entry.label.toLowerCase().includes(needle));
      if (partial.length === 1) {
        if (resolvedIndex !== null && resolvedIndex !== partial[0].index) {
          throw new Error(
            `--outcome ${resolvedIndex} and --outcome-label "${outcomeLabel}" disagree (${partial[0].label} is index ${partial[0].index}).`,
          );
        }
        return partial[0].index;
      }
      throw new Error(
        `Outcome label "${outcomeLabel}" not found. Valid outcomes: ${formatOutcomeChoices(outcomeList)}.`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Outcome label "${outcomeLabel}" is ambiguous. Valid outcomes: ${formatOutcomeChoices(outcomeList)}.`,
      );
    }
    if (resolvedIndex !== null && resolvedIndex !== matches[0].index) {
      throw new Error(
        `--outcome ${resolvedIndex} and --outcome-label "${outcomeLabel}" disagree (${matches[0].label} is index ${matches[0].index}).`,
      );
    }
    return matches[0].index;
  }

  return resolvedIndex;
}

export async function resolveOutcomeFromMarket({
  market,
  outcome,
  outcomeLabel,
  multiread,
  outcomeList: providedOutcomeList,
  marketContext,
}) {
  let outcomeList = Array.isArray(providedOutcomeList) && providedOutcomeList.length
    ? providedOutcomeList
    : marketContext?.outcome_list;
  if (!outcomeList?.length) {
    const marketId = BigInt(market);
    const [marketRes] = await multiread([["markets", [marketId]]], { allowFailure: true });
    if (marketRes.status === "failure") {
      const apiId = marketContext?.precog_api_market_id;
      const onChainId = marketContext?.on_chain_market_id ?? market;
      if (apiId && String(apiId) !== String(onChainId)) {
        throw new Error(
          `Failed to load market outcomes for on-chain id ${onChainId}. API id ${apiId} maps to master_market_id ${onChainId}; use --network ${marketContext?.network ?? "mainnet"}.`,
        );
      }
      throw new Error("Failed to load market outcomes.");
    }
    const [, , , , outcomesRaw] = marketRes.result;
    outcomeList = parseOutcomeList(outcomesRaw);
  }
  const outcomeIndex = resolveOutcomeIndex({ outcome, outcomeLabel, outcomeList });
  return { outcomeIndex, outcomeList };
}
