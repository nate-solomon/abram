// src/db/index.js
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const db = {
  query: (text, params) => pool.query(text, params),

  // Users
  async upsertUser(email, name) {
    const res = await pool.query(
      `INSERT INTO users (email, name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [email, name]
    );
    return res.rows[0];
  },

  // Thread history for Claude context (last 6 messages to stay within token limits)
  async getThreadMessages(threadId) {
    const res = await pool.query(
      `SELECT role, content FROM (
        SELECT role, content, created_at FROM messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 6
      ) recent ORDER BY created_at ASC`,
      [threadId]
    );
    return res.rows;
  },

  async saveMessage(threadId, role, content) {
    await pool.query(
      `INSERT INTO messages (thread_id, role, content) VALUES ($1, $2, $3)`,
      [threadId, role, content]
    );
  },

  async upsertThread(threadId, userEmail, subject) {
    await pool.query(
      `INSERT INTO threads (id, user_email, subject) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
      [threadId, userEmail, subject]
    );
  },

  // Scheduled tasks
  async createScheduledTask(userEmail, description, cronExpression, taskPrompt) {
    const res = await pool.query(
      `INSERT INTO scheduled_tasks (user_email, description, cron_expression, task_prompt)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userEmail, description, cronExpression, taskPrompt]
    );
    return res.rows[0];
  },

  async getActiveScheduledTasks() {
    const res = await pool.query(
      `SELECT * FROM scheduled_tasks WHERE active = TRUE`
    );
    return res.rows;
  },

  async updateTaskLastRun(id) {
    await pool.query(
      `UPDATE scheduled_tasks SET last_run = NOW() WHERE id = $1`,
      [id]
    );
  },

  async deleteScheduledTask(id, userEmail) {
    await pool.query(
      `UPDATE scheduled_tasks SET active = FALSE
       WHERE id = $1 AND user_email = $2`,
      [id, userEmail]
    );
  },

  async getUserScheduledTasks(userEmail) {
    const res = await pool.query(
      `SELECT * FROM scheduled_tasks WHERE user_email = $1 AND active = TRUE ORDER BY created_at DESC`,
      [userEmail]
    );
    return res.rows;
  }
};
