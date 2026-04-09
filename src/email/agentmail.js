import { AgentMailClient } from "agentmail";
import { Webhook } from "svix";

const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });

export async function sendEmail({ to, subject, body, threadId, inReplyTo }) {
  const inbox = process.env.AGENT_EMAIL;
  const html = markdownToHtml(body);

  if (inReplyTo) {
    return await client.inboxes.messages.reply(inbox, inReplyTo, {
      text: body,
      html
    });
  }

  return await client.inboxes.messages.send(inbox, {
    to,
    subject,
    text: body,
    html
  });
}

export async function fetchMessage(inboxId, messageId) {
  return await client.inboxes.messages.get(inboxId, messageId);
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

function markdownToHtml(md) {
  let html = md;

  // Tables: detect and convert markdown tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm, (_, header, separator, body) => {
    const parseRow = (row) =>
      row.split("|").slice(1, -1).map((c) => c.trim());
    const headers = parseRow(header);
    const rows = body.trim().split("\n").filter(Boolean).map(parseRow);
    return `<table style="border-collapse:collapse;margin:12px 0;width:100%">
<thead><tr>${headers.map((h) => `<th style="text-align:left;padding:8px 12px;border-bottom:2px solid #ddd;font-weight:600">${h}</th>`).join("")}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td style="padding:8px 12px;border-bottom:1px solid #eee">${c}</td>`).join("")}</tr>`).join("\n")}</tbody>
</table>`;
  });

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:16px;color:#333">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:20px 0 8px;font-size:18px;color:#222">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:20px 0 8px;font-size:22px;color:#111">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:13px">$1</code>');

  // Unordered lists
  html = html.replace(/^((?:- .+\n?)+)/gm, (block) => {
    const items = block.trim().split("\n").map((line) =>
      `<li style="margin:4px 0">${line.replace(/^- /, "")}</li>`
    ).join("\n");
    return `<ul style="margin:8px 0;padding-left:20px">\n${items}\n</ul>`;
  });

  // Ordered lists
  html = html.replace(/^((?:\d+\. .+\n?)+)/gm, (block) => {
    const items = block.trim().split("\n").map((line) =>
      `<li style="margin:4px 0">${line.replace(/^\d+\. /, "")}</li>`
    ).join("\n");
    return `<ol style="margin:8px 0;padding-left:20px">\n${items}\n</ol>`;
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #eee;margin:16px 0">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:none">$1</a>');

  // Paragraphs — wrap remaining lines
  html = html.replace(/^(?!<[houlatd])((?!<).+)$/gm, '<p style="margin:8px 0;line-height:1.5">$1</p>');

  // Wrap in styled container
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#333;max-width:600px">${html}</div>`;
}
