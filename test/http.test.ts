import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test, { after, before } from "node:test";
import { httpServer, wss } from "../src/index.js";

let baseUrl: string;

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
