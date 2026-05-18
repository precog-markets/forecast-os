# Install And Local Use

This folder is a self-contained ForecastOS skill for agent runtimes. It keeps the canonical skill folders (`agents`, `references`, `scripts`, `assets`) and also bundles a local read-only MCP extension in `mcp/`.

## Skill Files

The required entrypoint is:

```txt
SKILL.md
```

The bundled MCP config is:

```txt
mcp.json
```

It points to:

```txt
node ./mcp/server.js
```

## Skill Discovery

Agent runtimes usually discover skills from repo, user, admin, or system locations.

- Repo-scoped skills: `.agents/skills` in the current folder, parent folders, or repo root.
- User skills: `$HOME/.agents/skills`.
- Admin skills: a shared machine-level skills directory.
- System skills: skills bundled by the host runtime.

For this package, copy or symlink the whole folder as `forecast_os` into the desired skills directory. Keep the folder name stable so local references and `mcp.json` continue to resolve.

For reusable distribution beyond local authoring, package the skill with the host runtime's preferred plugin or extension format rather than relying on direct folder copying.

## Platform Metadata

`agents/metadata.yaml` provides optional platform metadata:

- display name
- short description
- default prompt
- implicit invocation policy

It is not loaded as model instructions. Keep behavior instructions in `SKILL.md` and `references/`.

## State Directory

By default, the MCP server and helper scripts inspect:

```txt
.forecastos
```

Override it with:

```txt
FORECASTOS_STATE_DIR=/path/to/.forecastos
```

The expected local state layout is described in `references/workflow.md`.

## Validate

Run:

```txt
node scripts/validate_skill.mjs
```

This checks:

- `SKILL.md` frontmatter exists.
- `mcp.json` points to `./mcp/server.js`.
- MCP tool names remain read-only.

## Inspect State

Run:

```txt
node scripts/inspect_state.mjs
```

Optional:

```txt
FORECASTOS_STATE_DIR=.forecastos node scripts/inspect_state.mjs
```

## Execute Actions

Execution is outside MCP. Use:

```txt
node scripts/forecastos_action.mjs <action> --input <json-file>
```

The action bridge uses the bundled local runtime by default:

```txt
scripts/forecastos_runtime.mjs
```

Set `FORECASTOS_SDK_MODULE` only when replacing the bundled runtime with a trusted production module that includes real Precog, funding, or prediction adapters.
