"""Tool handlers for the ForecastOS Hermes path-wrapper adapter."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

try:
    from .schemas import ACTIONS
except ImportError:
    _schemas_path = Path(__file__).with_name("schemas.py")
    _schemas_spec = importlib.util.spec_from_file_location("forecastos_hermes_schemas", _schemas_path)
    if _schemas_spec is None or _schemas_spec.loader is None:
        raise
    _schemas_module = importlib.util.module_from_spec(_schemas_spec)
    _schemas_spec.loader.exec_module(_schemas_module)
    ACTIONS = _schemas_module.ACTIONS


def forecastos_action(args: dict, **kwargs: Any) -> str:
    """Run the existing ForecastOS Node action bridge and return JSON."""

    if args is None:
        args = {}
    if not isinstance(args, dict):
        return _json(
            {
                "status": "error",
                "error": "args must be a JSON object.",
            }
        )

    action = str(args.get("action", "")).strip()
    if action not in ACTIONS:
        return _json(
            {
                "status": "error",
                "error": f"Unsupported action '{action}'.",
                "supported_actions": list(ACTIONS),
            }
        )

    input_payload = args.get("input", {})
    if input_payload is None:
        input_payload = {}
    if not isinstance(input_payload, dict):
        return _json(
            {
                "status": "error",
                "error": "input must be a JSON object.",
            }
        )

    skill_dir = resolve_skill_dir()
    action_script = skill_dir / "scripts" / "forecastos_action.mjs"
    missing = _missing_forecastos_paths(skill_dir, action_script)
    if missing:
        return _json(
            {
                "status": "error",
                "error": "ForecastOS skill path is not usable.",
                "missing": missing,
                "hint": "Set FORECASTOS_SKILL_DIR to the canonical skill/forecast-os directory.",
            }
        )

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".json",
            delete=False,
        ) as temp_file:
            json.dump(input_payload, temp_file)
            temp_file.write("\n")
            temp_path = Path(temp_file.name)

        env = os.environ.copy()
        env["FORECASTOS_SKILL_DIR"] = str(skill_dir)
        env.setdefault("FORECASTOS_STATE_DIR", str(skill_dir / ".forecastos"))

        node_bin = os.environ.get("FORECASTOS_NODE_BIN", "node")
        completed = subprocess.run(
            [node_bin, str(action_script), action, "--input", str(temp_path)],
            cwd=str(skill_dir),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        return _json(
            {
                "status": "error",
                "error": "Unable to run ForecastOS action bridge.",
                "detail": str(exc),
                "hint": (
                    "Ensure Node.js is installed and available on PATH, or set "
                    "FORECASTOS_NODE_BIN to the Node executable."
                ),
            }
        )
    except Exception as exc:
        return _json(
            {
                "status": "error",
                "error": "ForecastOS action adapter failed before execution.",
                "detail": str(exc),
            }
        )
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass

    stdout = completed.stdout.strip()
    stderr = completed.stderr.strip()

    if completed.returncode == 0:
        return _json_or_raw(stdout)

    return _json(
        {
            "status": "error",
            "action": action,
            "exit_code": completed.returncode,
            "stderr": stderr,
            "stdout": _parse_json(stdout),
        }
    )


def resolve_skill_dir() -> Path:
    """Resolve the canonical ForecastOS skill directory."""

    configured = os.environ.get("FORECASTOS_SKILL_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(__file__).resolve().parents[4] / "skill" / "forecast-os").resolve()


def _missing_forecastos_paths(skill_dir: Path, action_script: Path) -> list[str]:
    missing = []
    if not skill_dir.is_dir():
        missing.append(str(skill_dir))
    if not (skill_dir / "SKILL.md").is_file():
        missing.append(str(skill_dir / "SKILL.md"))
    if not action_script.is_file():
        missing.append(str(action_script))
    return missing


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _parse_json(text: str) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _json_or_raw(text: str) -> str:
    parsed = _parse_json(text)
    if parsed is None:
        return _json({"status": "ok", "result": None})
    return _json(parsed)
