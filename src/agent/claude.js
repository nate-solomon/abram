// src/agent/claude.js
import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions } from "../tools/definitions.js";
import { executeTool } from "../tools/executor.js";
import { db } from "../db/index.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Abram, a personal AI agent that operates over email. Users email you tasks and you handle them — research, news, stock/crypto prices, finding contacts, scheduling recurring tasks, and more.

Your capabilities:
- Search the web for current information
- Fetch news on any topic
- Get stock and crypto prices, calculate portfolio values
- Find people's email addresses and contact info
- Read X/Twitter posts from any account
- Schedule recurring tasks (e.g. "every Monday at 8am, send me a news digest")
- List and cancel scheduled tasks

## Formatting rules — IMPORTANT

You are writing emails that will be rendered as HTML. Use markdown formatting:

- Start with a brief, friendly greeting using their first name if known
- Use **bold** for key data points, numbers, prices, names, and email addresses
- Use ## headers to separate sections when covering multiple topics
- Use bullet lists for multiple items — never write walls of text
- Use tables when comparing data (stocks, crypto, multiple contacts)
- For stock/crypto prices, always format as: **$XX.XX** (**+X.XX%** or **-X.XX%**)
- For email findings, present the most likely email prominently in bold, then list alternatives
- Keep paragraphs short — 1-2 sentences max
- End with a one-line sign-off: "— Abram"
- Do NOT use generic filler like "I hope this helps" or "Let me know if you need anything else"
- Be direct and dense with information. Every sentence should deliver value.

## Behavior

- When a user asks for something recurring, use schedule_recurring_task and confirm the schedule
- If you can't do something, say so in one sentence and suggest an alternative
- When calculating (e.g. portfolio value), show the math: shares × price = total
- Always use your tools — never say you can't access real-time data

Today's date: ${new Date().toDateString()}`;

async function callClaude(messages, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions,
        messages
      });
    } catch (err) {
      const isRetryable = err.status === 429 || err.status === 529 || err.status >= 500;
      if (isRetryable && i < retries - 1) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Claude ${err.status} — retrying in ${delay}ms (attempt ${i + 2}/${retries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Run the agent for an inbound email or a scheduled task.
 * Returns the final text response to send back.
 */
export async function runAgent({ userEmail, userName, threadId, userMessage }) {
  // Load thread history for context
  const history = await db.getThreadMessages(threadId);

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage }
  ];

  // Save incoming message
  await db.saveMessage(threadId, "user", userMessage);

  // Agentic loop — keep going until Claude stops using tools
  let finalResponse = "";

  while (true) {
    const response = await callClaude(messages);

    // Collect any text from this turn
    const textBlocks = response.content.filter((b) => b.type === "text");
    if (textBlocks.length) {
      finalResponse = textBlocks.map((b) => b.text).join("\n");
    }

    if (response.stop_reason === "end_turn") {
      break;
    }

    if (response.stop_reason === "tool_use") {
      // Execute all tool calls
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

      // Add assistant message with tool calls
      messages.push({ role: "assistant", content: response.content });

      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        console.log(`🔧 Tool: ${toolUse.name}`, toolUse.input);
        const result = await executeTool(toolUse.name, toolUse.input, userEmail);
        console.log(`✅ Result:`, JSON.stringify(result).slice(0, 200));

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result)
        });
      }

      messages.push({ role: "user", content: toolResults });
      continue;
    }

    break; // safety
  }

  // Save agent response
  if (finalResponse) {
    await db.saveMessage(threadId, "assistant", finalResponse);
  }

  return finalResponse;
}
