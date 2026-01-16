# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Build the project (outputs to dist/)
npm run build

# Run in development mode (execute source directly)
npm run dev

# Run locally with arguments
npx tsx src/index.ts <source> [options]
```

## Architecture

This is a CLI tool that installs agent skills from git repositories to various coding agents. The entry point is `src/index.ts`.

### Core Modules

- **index.ts** - CLI entry point using Commander.js. Orchestrates the flow: parse source → clone repo → discover skills → select skills/agents → install.
- **git.ts** - Handles git operations: parses source URLs (GitHub shorthand, full URLs, GitLab, paths within repos), clones repos to temp directories.
- **skills.ts** - Discovers and parses skills. Skills are directories containing `SKILL.md` files with YAML frontmatter (`name` and `description` required). Searches priority locations first, falls back to recursive search.
- **agents.ts** - Defines supported coding agents and their skill installation paths. Each agent has project-level and global-level paths. Agent detection checks for existence of config directories in home.
- **installer.ts** - Copies skill directories to target agent locations. Excludes `README.md`, `metadata.json`, and files starting with `_`.
- **types.ts** - TypeScript type definitions for `AgentType`, `Skill`, `AgentConfig`, `ParsedSource`.

### Supported Agents

Defined in `src/agents.ts`: `opencode`, `claude-code`, `codex`, `cursor`, `amp`, `kilo`, `roo`, `goose`, `antigravity`.

### Skill Discovery Priority

1. Direct path if it contains `SKILL.md`
2. Standard locations: `skills/`, `skills/.curated/`, `skills/.experimental/`, `skills/.system/`, agent-specific directories
3. Recursive search (max depth 5) as fallback

### Key Dependencies

- `commander` - CLI framework
- `@clack/prompts` - Interactive prompts
- `simple-git` - Git operations
- `gray-matter` - YAML frontmatter parsing
