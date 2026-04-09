// src/index.js
import "dotenv/config";
import express from "express";
import { db } from "./db/index.js";
import { runAgent } from "./agent/claude.js";
import { sendEmail, validateWebhook } from "./email/agentmail.js";
import { initScheduler, scheduleTask } from "./scheduler/index.js";

const app = express();
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", agent: process.env.AGENT_EMAIL }));

// ─── AgentMail Webhook ─────────────────────────────────────────────────────────
// Configure this URL in your AgentMail dashboard:
//   https://your-railway-app.railway.app/webhook/email
app.post("/webhook/email", async (req, res) => {
  // Validate webhook signature
  if (!validateWebhook(req)) {
    console.warn("⚠️  Invalid webhook signature");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const event = req.body;
  console.log("📨 Inbound email event:", JSON.stringify(event).slice(0, 300));

  // AgentMail webhook payload (Svix):
  // { event_type: "message.received", message: { from_, to, subject, text, html, thread_id, message_id } }
  if (event.event_type !== "message.received") {
    return res.status(204).send();
  }

  const msg = event.message;
  const rawFrom = Array.isArray(msg.from_) ? msg.from_[0] : msg.from_;
  // Parse "Name <email>" format or plain email
  const emailMatch = rawFrom.match(/<([^>]+)>/);
  const fromEmail = emailMatch ? emailMatch[1] : rawFrom.replace(/.*<|>.*/g, "").trim();
  const nameMatch = rawFrom.match(/^([^<]+)</);
  const fromName = nameMatch ? nameMatch[1].trim() : fromEmail;
  const threadId = msg.thread_id || msg.message_id;
  const subject = msg.subject || "(no subject)";
  const body = msg.text || stripHtml(msg.html) || "";

  // Ignore emails from the agent itself to avoid loops
  if (fromEmail === process.env.AGENT_EMAIL) {
    return res.status(204).send();
  }

  console.log(`📩 From: ${fromEmail} | Thread: ${threadId} | Subject: ${subject}`);

  // Ack immediately so AgentMail doesn't retry
  res.json({ received: true });

  // Process async
  try {
    await db.upsertUser(fromEmail, fromName);
    await db.upsertThread(threadId, fromEmail, subject);

    const response = await runAgent({
      userEmail: fromEmail,
      userName: fromName,
      threadId,
      userMessage: `Subject: ${subject}\n\n${body}`
    });

    if (response) {
      await sendEmail({
        to: fromEmail,
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        body: response,
        threadId,
        inReplyTo: msg.message_id
      });

      // If agent scheduled a new task, hot-load it into the scheduler
      await refreshNewTasks();
    }
  } catch (err) {
    console.error("❌ Agent error:", err);
  }
});

// ─── Internal: refresh scheduler after new tasks are created ──────────────────
let lastTaskCount = 0;
async function refreshNewTasks() {
  const tasks = await db.getActiveScheduledTasks();
  if (tasks.length > lastTaskCount) {
    const newTasks = tasks.slice(lastTaskCount);
    for (const t of newTasks) scheduleTask(t);
    lastTaskCount = tasks.length;
  }
}

// ─── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🤖 Agent server running on port ${PORT}`);
  console.log(`📬 Agent email: ${process.env.AGENT_EMAIL}`);
  await initScheduler();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
