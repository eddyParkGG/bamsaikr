# H5 — The API and MCP create off-site usage

**Claim.** Opening read APIs and an MCP server lets people use the data from their own agents and scripts.
This creates demand outside the web page.

| Metric | Pass (after 4 weeks) | Source |
|---|---|---|
| Weekly external API calls | 1,000 | Server access log: requests without `sec-fetch-site: same-origin` |
| MCP config copies | read only | GA4 `mcp_copy` (API page) |
| API page visits | read only | GA4 `api_docs_view` |

If it fails: keep the endpoints (cheap) but stop promoting developer channels and focus on the app.
