export async function explainNextStep(input: {
  step?: string;
  workflow_id?: string;
  workflow?: { step?: string; workflow_id?: string };
}) {
  let workflow = input.workflow;
  if (!workflow && input.workflow_id) {
    throw new Error(
      "Hosted ForecastOS MCP does not read local workflow memory. Provide a workflow object or use the ForecastOS action bridge locally.",
    );
  }

  const step = input.step ?? workflow?.step ?? "intake";
  const guidance: Record<string, string> = {
    intake: "Collect the market prompt, at least three outcomes, source, close time, and resolution time, then run the action bridge.",
    draft: "Run the action bridge to produce and store a draft, then show a short human review summary.",
    needs_info: "Ask the user for the missing fields, then rerun the action bridge with the added facts.",
    await_approval: "Show the friendly review summary and ask the user to reply yes or request edits.",
    create_market: "Ask what wallet/action tool the user wants to use. Options include Privy, Base MCP, another configured wallet/action tool, or the Precog creation area. Base MCP smart-account signatures are valid when signed over the canonical Precog typed data and current pending nonce.",
    await_precog_approval: "Check the upcoming market status. Continue only after Precog returns VALIDATED.",
    fund: "Generate a wallet-agnostic funding intent. Options include Privy, Base MCP, another configured wallet/action tool, or the Precog creation area. For Base MCP, send calls first, then sign with the post-transaction pending nonce.",
    consume_prediction: "Wait for deployment, then inspect deployed market data. Do not invent prices.",
    done: "The workflow is complete. Use stored market data as the planning signal.",
  };

  return {
    step,
    next_step_guidance: guidance[step] ?? "Inspect workflow state before acting.",
    read_only: true,
    execution_surface: "scripts/forecastos_action.mjs or future ForecastOS SDK/API, not MCP",
    creation_area_url: "https://core.precog.markets/launchpad/",
  };
}

export function formatNextStepExplanation(guidance: Awaited<ReturnType<typeof explainNextStep>>): string {
  return [
    `Current step: ${guidance.step}.`,
    `Next: ${guidance.next_step_guidance}`,
    `Execution surface: ${guidance.execution_surface}.`,
    `Precog creation area: ${guidance.creation_area_url}.`,
  ].join("\n");
}
