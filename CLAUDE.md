# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — TypeScript compile to `dist/` and chmod entry scripts.
- `npm run watch` — `tsc --watch`.
- `npm run format` / `npm run format:check` — Prettier over `src/**/*.ts`.
- `npm run inspector` / `npm run inspector:http` — launch MCP Inspector against the server.
- `npm run smithery:build` / `npm run smithery:dev` — Smithery build/dev pipeline.
- Run server locally: `node dist/index.js [--transport stdio|http] [--brave-api-key <key>] [--port N] [--host H] [--logging-level …] [--enabled-tools …] [--disabled-tools …] [--stateless <bool>]`.
- No test runner is configured — there is no `npm test`. Verify changes via the MCP Inspector or by exercising the running server.

Requires Node.js 22+. `BRAVE_API_KEY` env var (or `--brave-api-key`) is required at runtime.

## Architecture

Entry flow: `src/index.ts` reads config and dispatches to either `src/protocols/stdio.ts` or `src/protocols/http.ts`. Both protocols call `createMcpServer()` from `src/server.ts`, which constructs an `McpServer` (MCP SDK 1.27) and iterates `src/tools/index.ts`, invoking each tool's `register()` only if `isToolPermittedByUser()` allows it (driven by `BRAVE_MCP_ENABLED_TOOLS` / `BRAVE_MCP_DISABLED_TOOLS`).

**Tool module shape.** Each tool lives in `src/tools/<name>/` and exports `{ name, description, annotations, inputSchema, execute, register }`:
- `params.ts` — Zod 4 schema for the tool's input parameters.
- `types.ts` — response and formatted-result types.
- `index.ts` — wires schema + execute + `mcpServer.registerTool(...)`.

Existing tools: `web`, `local`, `videos`, `images`, `news`, `summarizer`, `llm_context`.

**Brave API client.** `src/BraveAPI/index.ts` is the single HTTP client against `api.search.brave.com`. The `typeToPathMap` translates logical endpoint keys (`web`, `images`, `news`, `videos`, `summarizer`, `llmContext`, `localPois`, `localDescriptions`) to REST paths. Auth is via the `X-Subscription-Token` header. Tools call `API.issueRequest<'<endpoint>'>('<endpoint>', params)`. Endpoint param/response/header types live in `src/BraveAPI/types.ts`.

**Config.** `src/config.ts` merges env vars, CLI flags (via `commander`), and Smithery config into a single options object. It also exposes `configSchema` and the `isToolPermittedByUser` predicate.

## Adding a new tool

1. Create `src/tools/<name>/{index.ts, params.ts, types.ts}` matching the existing tool shape.
2. Add a Brave endpoint entry in `src/BraveAPI/index.ts` (`typeToPathMap`) and `src/BraveAPI/types.ts` (`Endpoints`).
3. Register the tool in `src/tools/index.ts` so `server.ts` picks it up.

## Constraints

- ESM only (`"type": "module"`). Local imports must use the compiled `.js` suffix even when importing from `.ts` source.
- Default transport is STDIO since 2.x (1.x defaulted to HTTP; that is a breaking change to be aware of).
- Image search no longer returns base64 image data (also a 2.x change) — see `src/tools/images/schemas/output.ts` for the current shape if encountered.
