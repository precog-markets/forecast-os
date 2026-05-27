"""ForecastOS Hermes plugin registration."""

from __future__ import annotations

import logging

from . import schemas, tools

logger = logging.getLogger(__name__)


def register(ctx):
    """Register the ForecastOS skill and action bridge tool."""

    skill_dir = tools.resolve_skill_dir()
    action_script = skill_dir / "scripts" / "forecastos_action.mjs"
    missing = tools._missing_forecastos_paths(skill_dir, action_script)

    if missing:
        logger.warning(
            "ForecastOS Hermes plugin loaded without a usable skill path. "
            "Set FORECASTOS_SKILL_DIR. Missing: %s",
            ", ".join(missing),
        )
    else:
        ctx.register_skill("forecast-os", skill_dir / "SKILL.md")

    ctx.register_tool(
        name="forecastos_action",
        toolset="forecast-os",
        schema=schemas.FORECASTOS_ACTION,
        handler=tools.forecastos_action,
    )
