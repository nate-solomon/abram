// src/agent/claude.js
import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions } from "../tools/definitions.js";
import { executeTool } from "../tools/executor.js";
import { db } from "../db/index.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a powerful personal AI agent that operates entirely over email. 
Users email you tasks and you execute them — research, news summaries, portfolio updates, scheduling recurring tasks, etc.

Your capabilities:
- Search the web for current information
- Fetch news on any topic  
- Get stock prices and portfolio info
- Schedule recurring tasks (user says "every Monday at 8am, send me a news digest")
- List and cancel scheduled tasks
- Engage naturally in email threads

Guidelines:
- Be concise and well-formatted in email replies. Use clear sections with headers when appropriate.
- When a user asks for something recurring, use schedule_recurring_task and confirm the schedule.
- When running a scheduled task, produce a clean, useful email-formatted response.
- If you can't do something, say so clearly and suggest alternatives.
- Address the user by first name when you know it.
- Sign off as "Your AI Agent"

Today's date: ${new Date().toDateString()}`;

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
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages
    });

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
