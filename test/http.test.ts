import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebSocket, type RawData } from "ws";
import { httpServer, wss } from "../src/index.js";
import { queue } from "../src/queue.js";

let baseUrl: string;

async function createHttpClient(name: string) {
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await client.connect(transport);
  return { client, transport };
}

async function closeHttpClient(
  client: Client,
  transport: StreamableHTTPClientTransport
): Promise<void> {
  if (transport.sessionId) await transport.terminateSession();
  await client.close();
}

async function createOperatorSocket(): Promise<WebSocket> {
  const socket = new WebSocket(baseUrl.replace(/^http/, "ws"));
  await once(socket, "open");
  return socket;
}

function waitForSocketMessage(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 2_000);

    const onMessage = (data: RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

before(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const address = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    wss.close((error) => (error ? reject(error) : resolve()));
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.close((error) => (error ? reject(error) : resolve()));
  });
});

test("serves the operator console", async () => {
  const response = await fetch(baseUrl);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(await response.text(), /Mechanical Turk/);
});

test("serves the human operator instructions", async () => {
  const response = await fetch(`${baseUrl}/human.md`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/plain/);
  assert.match(await response.text(), /^# Operator Guide/m);
});

test("rejects MCP requests without a session", async () => {
  const getResponse = await fetch(`${baseUrl}/mcp`);
  assert.equal(getResponse.status, 400);
  assert.deepEqual(await getResponse.json(), { error: "Unknown or missing session ID" });

  const deleteResponse = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 404);
});

test("supports the full MCP HTTP session lifecycle", async () => {
  const { client, transport } = await createHttpClient("http-lifecycle-client");
  const sessionId = transport.sessionId;

  assert.ok(sessionId);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["ask_human", "notify_human"]
  );

  const result = await client.callTool({
    name: "notify_human",
    arguments: { message: "HTTP transport works" },
  });
  assert.deepEqual(result.content, [{ type: "text", text: "Notification delivered." }]);

  await transport.terminateSession();
  await client.close();

  const response = await fetch(`${baseUrl}/mcp`, {
    headers: { "mcp-session-id": sessionId },
  });
  assert.equal(response.status, 400);
});

test("answers an MCP question through the operator WebSocket", async (t) => {
  const socket = await createOperatorSocket();
  const { client, transport } = await createHttpClient("websocket-answer-client");
  t.after(async () => {
    await closeHttpClient(client, transport);
    socket.close();
  });

  const questionMessage = waitForSocketMessage(socket, (message) => message.type === "question");
  const resultPromise = client.callTool({
    name: "ask_human",
    arguments: { question: "Ship it?" },
  });
  const question = await questionMessage;

  assert.equal(question.question, "Ship it?");
  assert.equal(typeof question.id, "string");
  socket.send(JSON.stringify({ type: "answer", id: question.id, answer: "Ship it" }));

  const result = await resultPromise;
  assert.deepEqual(result.content, [{ type: "text", text: "Ship it" }]);
});

test("disconnecting one MCP session leaves other agents' questions pending", async (t) => {
  const first = await createHttpClient("first-agent-client");
  const second = await createHttpClient("second-agent-client");
  t.after(async () => {
    await closeHttpClient(second.client, second.transport);
  });

  const firstQuestionEvent = once(queue, "question");
  const firstCall = first.client.callTool({
    name: "ask_human",
    arguments: { question: "First question" },
  });
  const firstOutcome = firstCall.then(
    (result) => ({ result }),
    (error: unknown) => ({ error })
  );
  const [firstQuestion] = await firstQuestionEvent;

  const secondQuestionEvent = once(queue, "question");
  const secondCall = second.client.callTool({
    name: "ask_human",
    arguments: { question: "Second question" },
  });
  const [secondQuestion] = await secondQuestionEvent;

  await first.transport.terminateSession();

  assert.equal(queue.getAll().some((question) => question.id === firstQuestion.id), false);
  assert.equal(queue.getAll().some((question) => question.id === secondQuestion.id), true);
  await first.client.close();
  assert.equal(queue.answer(secondQuestion.id, "Second answer"), true);
  assert.deepEqual((await secondCall).content, [{ type: "text", text: "Second answer" }]);

  const outcome = await firstOutcome;
  if ("result" in outcome) assert.equal(outcome.result.isError, true);
  else assert.ok(outcome.error instanceof Error);
});
