# Taste

- Prefers large-scale parallel execution for big build-outs: spin up many git worktrees and many subagents at once and split the work across them, rather than working sequentially. Confidence: 0.55
- Expects work verified end to end rather than trusted on green tests alone: exercise the real flow, and visually observe the UI (screenshots at desktop and mobile widths) before reporting done. Confidence: 0.7
- Wants the agent to pick and install whatever agents, skills, tools, or MCP servers the job needs on its own initiative, optimizing for speed over asking. Confidence: 0.6
