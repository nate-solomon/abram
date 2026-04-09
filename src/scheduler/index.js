// src/scheduler/index.js
import { Cron } from "croner";
import { db } from "../db/index.js";
import { runAgent } from "../agent/claude.js";
import { sendEmail } from "../email/agentmail.js";

const activeCrons = new Map(); // task_id -> Cron instance

/**
 * Load all active tasks from DB and schedule them.
 * Call on server startup, and after any new task is created.
 */
export async function initScheduler() {
  const tasks = await db.getActiveScheduledTasks();
  console.log(`⏰ Loading ${tasks.length} scheduled task(s)...`);
  for (const task of tasks) {
    scheduleTask(task);
  }
}

export function scheduleTask(task) {
  if (activeCrons.has(task.id)) {
    activeCrons.get(task.id).stop();
  }

  console.log(`📅 Scheduling task #${task.id}: "${task.description}" [${task.cron_expression}]`);

  const cron = new Cron(task.cron_expression, async () => {
    // Parse clean email from "Name <email>" format
    const emailMatch = task.user_email.match(/<([^>]+)>/);
    const cleanEmail = emailMatch ? emailMatch[1] : task.user_email.trim();
    console.log(`🚀 Running scheduled task #${task.id} for ${cleanEmail}`);
    try {
      const threadId = `scheduled-${task.id}-${Date.now()}`;

      // Ensure user and thread exist before running agent
      await db.upsertUser(cleanEmail, cleanEmail);
      await db.upsertThread(threadId, cleanEmail, task.description);

      const response = await runAgent({
        userEmail: cleanEmail,
        userName: cleanEmail,
        threadId,
        userMessage: task.task_prompt
      });

      await sendEmail({
        to: cleanEmail,
        subject: `📬 ${task.description}`,
        body: response
      });

      await db.updateTaskLastRun(task.id);
      console.log(`✅ Task #${task.id} completed`);
    } catch (err) {
      console.error(`❌ Task #${task.id} failed:`, err.message);
    }
  });

  activeCrons.set(task.id, cron);
}

export function cancelTaskCron(taskId) {
  if (activeCrons.has(taskId)) {
    activeCrons.get(taskId).stop();
    activeCrons.delete(taskId);
    console.log(`🗑️  Cancelled cron for task #${taskId}`);
  }
}
