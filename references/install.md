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

For this package, copy or symlink the whole folder as `forecast-os` into the desired skills directory. The skill name is hyphen-case for Codex compatibility. Keep the folder contents together so local references and `mcp.json` continue to resolve.

For reusable distribution beyond local authoring, package the skill with the host runtime's preferred plugin or extension format rather than relying on direct folder copying.

## Platform Metadata

`agents/openai.yaml` provides optional platform metadata:

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

## Precog Defaults

The package ships `.forecastos/config.json` with public Precog defaults. Users do not need to create an env file to try the skill.

For local overrides, create:

```txt
.forecastos/config.local.json
```

`config.local.json` is ignored and overrides matching fields from the shipped config.

## Validate

Run:

```txt
node scripts/validate_skill.mjs
```

This checks:

- `SKILL.md` frontmatter uses `name: forecast-os` and a useful trigger description.
- `agents/openai.yaml` exists.
- `.forecastos/config.json` includes public Precog defaults.
- `mcp.json` points to `./mcp/server.js`.
- MCP tool names remain read-only.
- forbidden clutter files such as README, changelog, evals, grader, analyzer, and comparator are absent.

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
