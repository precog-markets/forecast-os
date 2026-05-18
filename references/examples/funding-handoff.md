# Funding Handoff Example

Prompt:

```txt
The market draft is approved. Fund it through Bankr or LiFi.
```

Expected behavior:

- Inspect workflow state first.
- Confirm market creation/Precog approval has happened or explain what is missing.
- Require explicit operator approval for funding.
- Return TODO/mock output unless a trusted Bankr/LiFi/manual funding adapter is configured.
- Do not request private keys, seed phrases, or raw custody credentials.
