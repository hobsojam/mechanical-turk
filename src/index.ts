import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import path from "path";
import { createMcpServer } from "./mcp.js";
import { queue } from "./queue.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
// Serve HUMAN.md for the in-console help modal
app.get("/human.md", async (_req, res) => {
  try {
    const content = await readFile(path.join(__dirname, "../HUMAN.md"), "utf-8");
    res.type("text/plain; charset=utf-8").send(content);
  } catch {
    res.status(404).send("Not found");
  }
});

app.use(express.static(path.join(__dirname, "../public")));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

function broadcast(data: object): void {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Forward queue events to browser
queue.on("question", (q) => broadcast({ type: "question", ...q }));
queue.on("answered", (e) => broadcast({ type: "answered", ...e }));
queue.on("dropped", (e) => broadcast({ type: "dropped", ...e }));
queue.on("notification", (n) => broadcast({ type: "notification", ...n }));

// MCP session registry: sessionId → { transport, agentId }
interface Session {
  transport: StreamableHTTPServerTransport;
  agentId: string;
}
const sessions = new Map<string, Session>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New session
  const agentId = `agent-${randomUUID().slice(0, 8)}`;
  const mcpServer = createMcpServer(agentId);
  let resolvedSessionId: string | undefined;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      resolvedSessionId = id;
      sessions.set(id, { transport, agentId });
      broadcast({ type: "agent_connected", agentId });
      console.log(`[mcp] ${agentId} connected (session ${id})`);
    },
  });

  transport.onclose = () => {
    if (resolvedSessionId) {
      sessions.delete(resolvedSessionId);
      queue.rejectByAgent(agentId);
      broadcast({ type: "agent_disconnected", agentId });
      console.log(`[mcp] ${agentId} disconnected`);
    }
  };

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(400).json({ error: "Unknown or missing session ID" });
    return;
  }
  await session.transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    res.status(404).end();
    return;
  }
  await session.transport.handleRequest(req, res);
  sessions.delete(sessionId!);
});

// WebSocket: send current state on connect, handle answers
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "init", questions: queue.getAll() }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "answer" && msg.id && typeof msg.answer === "string") {
        const ok = queue.answer(msg.id, msg.answer);
        if (!ok) ws.send(JSON.stringify({ type: "error", message: "Question not found" }));
      }
    } catch {
      // ignore malformed messages
    }
  });
});

const PORT = Number(process.env.PORT ?? 3000);
httpServer.listen(PORT, () => {
  console.log(`Mechanical Turk   http://localhost:${PORT}`);
  console.log(`MCP endpoint      http://localhost:${PORT}/mcp`);
});
