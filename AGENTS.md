<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ABYS execution policy

- Root Codex owns integration, tests, Conventional Commit creation and non-force pushes of verified slices.
- Subagents never run Git write commands. Their uncommitted work must be reviewed and tested by root Codex first.
- Commit only completed files owned by one workstream; never include in-progress agent files, unverified changes or unrelated user work.
- Production deploys, migration 18, destructive database operations and live customer-data changes still require explicit human approval.
