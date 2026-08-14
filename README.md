# ForecastOS

[![skills.sh](https://skills.sh/b/precog-markets/forecast-os)](https://skills.sh/precog-markets/forecast-os)

Ask your agent what is likely to happen. Without ForecastOS it guesses. With it, the agent checks Polymarket, Kalshi, and Precog before answering — and can discover, trade, or create prediction markets.

Install the `forecast` CLI separately:

```bash
curl -sSL https://raw.githubusercontent.com/precog-markets/forecast-os/main/install.sh | sh
```

## Skills

| Skill | Description |
| --- | --- |
| [`forecast-cli`](./skills/forecast-cli/SKILL.md) | Check Polymarket, Kalshi, and Precog before answering what is likely to happen. Discover, trade, or create prediction markets. |

## Installation

Install with [Vercel's Skills CLI](https://skills.sh):

```bash
npx skills add precog-markets/forecast-os
```

Requires the Forecast CLI on `PATH`:

```bash
curl -sSL https://raw.githubusercontent.com/precog-markets/forecast-os/main/install.sh | sh
forecast --help
```
