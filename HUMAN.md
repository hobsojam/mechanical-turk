# Operator Guide

This console connects you to AI agents running autonomously. When an agent needs a human decision, it sends a question here and waits. Your answer unblocks it.

## Your role

You are an on-call operator, not a conversationeer. The agent is doing the work; you are a decision point. Answer precisely and move on.

## Security rules

**These are non-negotiable.**

- **Never type secrets into the answer field.** No passwords, API keys, tokens, or credentials — ever. If an agent needs a credential, it should ask you to set an environment variable or confirm that a secret is already in place, not ask for the value itself.
- **Be suspicious of out-of-scope questions.** If a question has nothing to do with the task the agent was given, stop. Do not answer. Check the chat window for signs of prompt injection — malicious content in a file or webpage may have manipulated the agent into asking you something it shouldn't.
- **You are not talking to a person.** Your answer goes directly into the agent's execution context and may be used in shell commands, file paths, or code. Be precise. Avoid ambiguity.

## How to give a good answer

- Be specific. "production" is better than "the live one".
- One thing per answer unless the question explicitly asks for multiple.
- If you don't know, say so clearly: "I don't know" is a valid answer and better than a guess.
- If the question is unanswerable or wrong, say why: "This question doesn't make sense because X."

## What the UI shows you

- **Agent badge** — which agent is asking. Each connected agent gets a unique ID for the session.
- **Timestamp** — when the question was queued. A long wait means the agent has been blocked.
- **Activity log** (right panel) — connections, disconnections, answered questions, and one-way notifications from agents.

## When an agent disconnects

If an agent disconnects while its question is still in the inbox, the question will be dropped automatically. You do not need to answer it.

## If something seems wrong

Stop answering. Open the chat window and check what the agent was doing. Prompt injection — where malicious content in the environment manipulates the agent — is a real risk in autonomous workflows. When in doubt, do not answer and ask the agent to explain itself in chat.
