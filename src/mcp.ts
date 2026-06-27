import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { queue } from "./queue.js";

export function createMcpServer(agentId: string): McpServer {
  const server = new McpServer({
    name: "mechanical-turk",
    version: "0.1.0",
  });

  server.tool(
    "ask_human",
    "Ask the human operator a question and wait for their response. The call blocks until the human replies.",
    { question: z.string().describe("The question to ask the human operator") },
    async ({ question }) => {
      const answer = await queue.add(question, agentId);
      return { content: [{ type: "text", text: answer }] };
    }
  );

  server.tool(
    "notify_human",
    "Send a one-way notification to the human operator. Does not wait for a response.",
    { message: z.string().describe("The message to display to the human operator") },
    async ({ message }) => {
      queue.emit("notification", { message, agentId, timestamp: new Date().toISOString() });
      return { content: [{ type: "text", text: "Notification delivered." }] };
    }
  );

  return server;
}
