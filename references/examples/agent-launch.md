# Agent Launch Example

Prompt:

```txt
Create a market asking whether the Liquid agent AURA survives its first seven days.
```

Expected behavior:

- Draft a market about AURA remaining active for seven full days after official launch.
- Use `market_type: "multi_outcome"` with explicit outcomes, such as `Survives seven full days` and `Does not survive seven full days`.
- Ask for exact agent identifier, launch timestamp, lifecycle source, close time, and resolution time.
- Block creation until missing facts are provided.
- Require exact human approval text before creation.
- Treat Precog creation as TODO unless a trusted adapter is configured.
