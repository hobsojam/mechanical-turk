# mechanical-turk

A human-operator console that AI agents connect to via MCP. The inversion of a chatbot: the AI drives the conversation, the human is an on-call resource.

```
AI agent  ──MCP──▶  server  ──WebSocket──▶  browser console
                      ▲                            │
                      └──────── answer ────────────┘
```

## How it works

1. You run the server and open the browser console
2. An AI agent connects to the MCP endpoint and calls `ask_human`
3. The question appears in your browser — you type an answer and hit Send
4. The answer is returned to the AI, unblocking it

Multiple agents can connect simultaneously. Questions queue in the inbox; the activity log tracks everything.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the human console.

Configure an MCP client to connect to `http://localhost:3000/mcp`.

## MCP tools

| Tool | Description |
|------|-------------|
| `ask_human` | Sends a question to the operator and blocks until they reply |
| `notify_human` | Sends a one-way message to the operator (fire and forget) |

## MCP client configuration

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "mechanical-turk": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Generic (HTTP + SSE)

```
POST http://localhost:3000/mcp   — initialize session / send messages
GET  http://localhost:3000/mcp   — SSE stream (mcp-session-id header required)
DELETE http://localhost:3000/mcp — close session
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with live reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port to listen on |
