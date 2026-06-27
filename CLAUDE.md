# mechanical-turk

## Project Overview

Human-operator console that AI agents connect to via MCP (Streamable HTTP transport). The inversion of a chatbot: the AI drives the conversation, the human is an on-call resource. When an agent needs a human decision it calls `ask_human`, which blocks until the operator answers in the browser console.

## Architecture

```plaintext
src/
  index.ts   — Express server, WebSocket hub, MCP route handlers, session registry
  mcp.ts     — McpServer factory (one server per agent session); defines ask_human + notify_human tools
  queue.ts   — EventEmitter-based question queue; bridges MCP tool calls to browser answers
public/
  index.html — Single-file browser console (vanilla JS, WebSocket, no build step)
```

**Data flow:** MCP tool call → `queue.add()` → Promise held open → `queue.on("question")` event → broadcast to browser → human submits answer → `queue.answer()` → Promise resolves → MCP tool returns.

## Development Commands

```bash
npm install    # install dependencies
npm run dev    # tsx watch — restarts on any src/ change
npm run build  # tsc → dist/
npm start      # node dist/index.js
```

## Testing

There is no automated test suite yet. To verify manually:

1. `npm run dev` — server should print the localhost URL
2. Open `http://localhost:3000` — browser console should load
3. Configure an MCP client to point at `http://localhost:3000/mcp` and call `ask_human` — question should appear in the browser inbox

## Key decisions

- **One McpServer per session**: each connecting agent gets its own `McpServer` instance so `agentId` is captured in closure. Sessions are stored in a `Map<sessionId, { transport, agentId }>`.
- **EventEmitter on queue**: avoids coupling between `mcp.ts` and the WebSocket layer. `index.ts` wires the events.
- **Vanilla HTML**: no framework in `public/index.html` — keeps the UI dependency-free and the whole thing a single file.
- **`rejectByAgent` on disconnect**: when an agent disconnects, its pending questions are rejected so the AI gets an error rather than hanging forever.

## Adding tools

Add new `server.tool(...)` calls in `src/mcp.ts`. Use `queue.emit(...)` for events that need to reach the browser, or add new event types to `src/queue.ts` and wire them in `src/index.ts`.

## Transport

Uses MCP Streamable HTTP (`@modelcontextprotocol/sdk` ≥ 1.8). Routes:
- `POST /mcp` — new session init or message send
- `GET /mcp` — SSE stream (requires `mcp-session-id` header)
- `DELETE /mcp` — close session
