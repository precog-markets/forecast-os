# Install And Local Use

`skill/forecast-os` is the portable ForecastOS skill artifact. The ForecastOS repo may also bundle optional MCP infrastructure beside it, but copying only this folder as `forecast-os` should still work for agents without MCP.

## Skill Files

The required skill entrypoint is:

```txt
SKILL.md
```

The canonical skill folders are:

```txt
agents/
references/
scripts/
assets/
.forecastos/
```

## Skill Discovery

Agent runtimes usually discover skills from repo, user, admin, or system locations.

- Repo-scoped skills: `.agents/skills` in the current folder, parent folders, or repo root.
- User skills: `$HOME/.agents/skills`.
- Admin skills: a shared machine-level skills directory.
- System skills: skills bundled by the host runtime.

For this package, copy or symlink `skill/forecast-os` as `forecast-os` into the desired skills directory. Keep the skill folder contents together so local references, scripts, assets, and `.forecastos/config.json` continue to resolve.

Do not include generated test-output or api-test-output folders when copying or packaging a portable skill artifact. They are local test products, not skill instructions or runtime assets.

The repo root `VERSION` is the canonical project version. Symlink installs can read it from the repo. For fixed-copy installs, generate the detachable skill artifact version before copying:

```txt
node skill/forecast-os/scripts/sync_version.mjs
```

That writes `skill/forecast-os/VERSION` from the root `VERSION`; the generated file is ignored in repo source but travels with copied skill artifacts.

For reusable distribution beyond local authoring, package this repo with the host runtime's preferred plugin or extension format.

## Optional Local MCP

MCP is optional read-only context. It exposes ForecastOS docs, templates, schemas, examples, and public Precog capability metadata. It does not create markets, fund markets, sign messages, approve tokens, send transactions, or mutate `.forecastos` workflow state.

When using the full ForecastOS repo bundle, build MCP from the repo root:

```txt
cd mcp/forecast-os-mcp-server
npm install
npm run build
```

Codex can use `adapters/hosts/codex/mcp.json`. Claude, OpenClaw, or another MCP-capable agent should use the same command and args pattern from its adapter folder:

```json
{
  "command": "node",
  "args": ["../../../mcp/forecast-os-mcp-server/dist/stdio.js"],
  "env": {
    "FORECASTOS_STATE_DIR": "../../../skill/forecast-os/.forecastos"
  }
}
```

If an agent does not support MCP, the ForecastOS skill still works through `SKILL.md`, `references/`, and the action bridge.

## Platform Metadata

`agents/openai.yaml` provides optional platform metadata:

- display name
- short description
- default prompt
- implicit invocation policy

It is not loaded as model instructions. Keep behavior instructions in `SKILL.md` and `references/`.

## State Directory

Helper scripts read and write ForecastOS workflow memory in:

```txt
.forecastos
```

Override it with:

```txt
FORECASTOS_STATE_DIR=/path/to/.forecastos
```

The expected local state layout is described in `references/workflow.md`.

## Precog Defaults

The package ships `.forecastos/config.json` with public Precog defaults. Users do not need to create an env file to try the skill.

For local overrides, create:

```txt
.forecastos/config.local.json
```

`config.local.json` is ignored and overrides matching fields from the shipped config.

## Validate

From `skill/forecast-os`, run:

```txt
node scripts/validate_skill.mjs
```

This checks:

- `SKILL.md` frontmatter uses `name: forecast-os` and a useful trigger description.
- `agents/openai.yaml` exists.
- `.forecastos/config.json` includes public Precog defaults.
- no `mcp.json` or bundled MCP package is required inside the portable skill folder.
- MCP tool names documented by the skill remain read-only.
- any generated skill-local `VERSION` matches the root `VERSION` when both exist.
- forbidden clutter files such as README, changelog, evals, grader, analyzer, and comparator are absent from the skill artifact.

## Inspect State

From `skill/forecast-os`, run:

```txt
node scripts/inspect_state.mjs
```

Optional:

```txt
FORECASTOS_STATE_DIR=.forecastos node scripts/inspect_state.mjs
```

## Execute Actions

Execution is outside MCP. From `skill/forecast-os`, use:

```txt
node scripts/forecastos_action.mjs <action> --input <json-file>
```

The action bridge uses the bundled local runtime:

```txt
scripts/forecastos_runtime.mjs
```
