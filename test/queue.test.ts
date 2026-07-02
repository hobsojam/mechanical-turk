import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { QuestionQueue } from "../src/queue.js";

test("answer resolves a pending question and removes it", async () => {
  const queue = new QuestionQueue();
  const questionEvent = once(queue, "question");
  const answerPromise = queue.add("Continue?", "agent-1");
  const [question] = await questionEvent;

  assert.equal(question.question, "Continue?");
  assert.equal(question.agentId, "agent-1");
  assert.equal(queue.answer(question.id, "yes"), true);
  await assert.doesNotReject(answerPromise);
  assert.equal(await answerPromise, "yes");
  assert.deepEqual(queue.getAll(), []);
});

test("rejectByAgent rejects only that agent's pending questions", async () => {
  const queue = new QuestionQueue();
  const rejected = queue.add("First", "agent-1");
  const retained = queue.add("Second", "agent-2");
  const rejection = assert.rejects(rejected, /Agent disconnected/);

  queue.rejectByAgent("agent-1");

  await rejection;
  assert.equal(queue.getAll().length, 1);
  assert.equal(queue.getAll()[0].agentId, "agent-2");
  assert.equal(queue.answer(queue.getAll()[0].id, "done"), true);
  assert.equal(await retained, "done");
});
