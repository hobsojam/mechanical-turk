import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp.js";
import { queue } from "../src/queue.js";

async function createConnectedPair(agentId: string) {
  const server = createMcpServer(agentId);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

test("tool schemas expose the required string inputs", async (t) => {
  const { client, server } = await createConnectedPair("schema-agent");
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const { tools } = await client.listTools();
  const schemas = Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));

  assert.deepEqual(Object.keys(schemas).sort(), ["ask_human", "notify_human"]);
  assert.equal((schemas.ask_human.properties?.question as { type?: string }).type, "string");
  assert.deepEqual(schemas.ask_human.required, ["question"]);
  assert.equal((schemas.notify_human.properties?.message as { type?: string }).type, "string");
  assert.deepEqual(schemas.notify_human.required, ["message"]);
});

test("notify_human validates input and emits a notification", async (t) => {
  const { client, server } = await createConnectedPair("notify-agent");
  t.after(async () => {
    await client.close();
    await server.close();
  });

  const notificationEvent = once(queue, "notification");
  const result = await client.callTool({
    name: "notify_human",
    arguments: { message: "Deployment finished" },
  });
  const [notification] = await notificationEvent;

  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: "text", text: "Notification delivered." }]);
  assert.equal(notification.message, "Deployment finished");
  assert.equal(notification.agentId, "notify-agent");

  const invalid = await client.callTool({
    name: "notify_human",
    arguments: { message: 42 },
  });
  assert.equal(invalid.isError, true);
});

test("ask_human blocks until the queued question is answered", async (t) => {
  const { client, server } = await createConnectedPair("asking-agent");
  t.after(async () => {
    queue.rejectByAgent("asking-agent");
    await client.close();
    await server.close();
  });

  const questionEvent = once(queue, "question");
  const resultPromise = client.callTool({
    name: "ask_human",
    arguments: { question: "Proceed with release?" },
  });
  const [question] = await questionEvent;

  assert.equal(question.question, "Proceed with release?");
  assert.equal(question.agentId, "asking-agent");
  assert.equal(queue.answer(question.id, "Proceed"), true);

  const result = await resultPromise;
  assert.deepEqual(result.content, [{ type: "text", text: "Proceed" }]);
});
