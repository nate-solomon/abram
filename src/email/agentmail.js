import { AgentMailClient } from "agentmail";
import { Webhook } from "svix";

const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });

export async function sendEmail({ to, subject, body, threadId, inReplyTo }) {
  const inbox = process.env.AGENT_EMAIL;

  if (inReplyTo) {
    // Reply within existing thread
    return await client.inboxes.messages.reply(inbox, inReplyTo, {
      text: body
    });
  }

  // New message
  return await client.inboxes.messages.send(inbox, {
    to,
    subject,
    text: body
  });
}

export function validateWebhook(req) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;

  try {
    const wh = new Webhook(secret);
    wh.verify(JSON.stringify(req.body), {
      "svix-id": req.headers["svix-id"],
      "svix-timestamp": req.headers["svix-timestamp"],
      "svix-signature": req.headers["svix-signature"]
    });
    return true;
  } catch {
    return false;
  }
}
