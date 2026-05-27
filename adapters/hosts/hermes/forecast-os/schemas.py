"""Hermes tool schemas for the ForecastOS path-wrapper adapter."""

ACTIONS = (
    "draft_market",
    "run_skill_step",
    "prepare_create_intent",
    "create_market",
    "await_precog_approval",
    "prepare_funding_intent",
    "fund_market",
    "consume_prediction",
)

FORECASTOS_ACTION = {
    "name": "forecastos_action",
    "description": (
        "Run an existing ForecastOS action through the bundled Node action bridge. "
        "Use this for ForecastOS multi-outcome market drafting and approved workflow "
        "steps. Live create and fund actions still require ForecastOS approval rules "
        "and trusted wallet/action tooling; this adapter does not sign, custody "
        "wallets, fetch nonces, approve tokens, or bypass policy."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": list(ACTIONS),
                "description": "ForecastOS action to run.",
            },
            "input": {
                "type": "object",
                "description": (
                    "JSON payload passed through to scripts/forecastos_action.mjs. "
                    "Defaults to an empty object."
                ),
                "additionalProperties": True,
            },
        },
        "required": ["action"],
    },
}
