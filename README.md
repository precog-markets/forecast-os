# Forecast Agent Skills

Skills for the Forecast CLI (`forecast`), covering Polymarket, Precog, and Kalshi prediction markets.

These skills teach AI agents how to operate the CLI after it is installed separately:

```bash
pip install forecast-cli
```

## Skills

| Skill | Description |
| --- | --- |
| [`forecast-cli`](./skills/forecast-cli/SKILL.md) | Operator skill that routes agents to command references and multi-step workflows for market discovery, quoting/buying, position management, Precog market creation, setup, and status. |

## Installation

Install with [Vercel's Skills CLI](https://skills.sh):

```bash
npx skills add <owner>/forecast-agent-skills
```

Replace `<owner>` with the GitHub owner once this is published.

Requires the Forecast CLI on `PATH`:

```bash
pip install forecast-cli
forecast --help
```
