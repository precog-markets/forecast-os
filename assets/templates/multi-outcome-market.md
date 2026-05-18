# Multi-Outcome Market Template

```json
{
  "market_type": "multi_outcome",
  "title": "",
  "question": "",
  "outcomes": [],
  "description": "",
  "resolution_criteria": "",
  "close_time": "",
  "resolution_time": "",
  "source_of_truth": "",
  "category": "",
  "tags": [],
  "warnings": []
}
```

Use this for every ForecastOS market. Even yes/no-looking prompts should be represented as `multi_outcome` with explicit outcome labels.

Include a clear fallback outcome such as `Other` or `Invalid / ambiguous` only when it is necessary for objective resolution.
