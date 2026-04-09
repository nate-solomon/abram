// src/tools/executor.js
import { db } from "../db/index.js";

export async function executeTool(toolName, toolInput, userEmail) {
  switch (toolName) {
    case "web_search":
      return await webSearch(toolInput.query, toolInput.num_results || 5);

    case "get_news":
      return await getNews(toolInput.topic, toolInput.country, toolInput.num_articles || 5);

    case "get_stock_price":
      return await getStockPrice(toolInput.symbol);

    case "schedule_recurring_task":
      return await scheduleTask(userEmail, toolInput);

    case "list_scheduled_tasks":
      return await listTasks(userEmail);

    case "cancel_scheduled_task":
      return await cancelTask(userEmail, toolInput.task_id);

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function webSearch(query, numResults) {
  // Using DuckDuckGo Instant Answer API (free, no key needed)
  // For production swap in SerpAPI, Brave Search API, etc.
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url);
    const data = await res.json();

    const results = [];
    if (data.AbstractText) {
      results.push({ title: data.Heading, snippet: data.AbstractText, url: data.AbstractURL });
    }
    for (const topic of (data.RelatedTopics || []).slice(0, numResults - 1)) {
      if (topic.Text) {
        results.push({ title: topic.Text.slice(0, 60), snippet: topic.Text, url: topic.FirstURL });
      }
    }

    return { query, results: results.slice(0, numResults) };
  } catch (err) {
    return { error: `Search failed: ${err.message}` };
  }
}

async function getNews(topic, country = "us", numArticles = 5) {
  if (!process.env.NEWS_API_KEY) {
    return { error: "NEWS_API_KEY not configured. Add it to your .env file." };
  }
  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&pageSize=${numArticles}&sortBy=publishedAt&apiKey=${process.env.NEWS_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "ok") return { error: data.message };

    return {
      topic,
      articles: data.articles.map((a) => ({
        title: a.title,
        source: a.source.name,
        description: a.description,
        url: a.url,
        publishedAt: a.publishedAt
      }))
    };
  } catch (err) {
    return { error: `News fetch failed: ${err.message}` };
  }
}

async function getStockPrice(symbol) {
  if (!process.env.ALPHA_VANTAGE_KEY) {
    return { error: "ALPHA_VANTAGE_KEY not configured. Add it to your .env file." };
  }
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const quote = data["Global Quote"];

    if (!quote || !quote["05. price"]) {
      return { error: `No data found for symbol ${symbol}` };
    }

    return {
      symbol,
      price: quote["05. price"],
      change: quote["09. change"],
      changePercent: quote["10. change percent"],
      volume: quote["06. volume"],
      latestTradingDay: quote["07. latest trading day"]
    };
  } catch (err) {
    return { error: `Stock fetch failed: ${err.message}` };
  }
}

async function scheduleTask(userEmail, input) {
  try {
    const task = await db.createScheduledTask(
      userEmail,
      input.description,
      input.cron_expression,
      input.task_prompt
    );
    // Notify scheduler to pick up the new task
    return {
      success: true,
      task_id: task.id,
      description: task.description,
      cron_expression: task.cron_expression,
      message: `Scheduled successfully! Task ID: ${task.id}`
    };
  } catch (err) {
    return { error: `Failed to schedule task: ${err.message}` };
  }
}

async function listTasks(userEmail) {
  try {
    const tasks = await db.getUserScheduledTasks(userEmail);
    if (tasks.length === 0) return { tasks: [], message: "No active scheduled tasks." };
    return { tasks: tasks.map((t) => ({ id: t.id, description: t.description, cron: t.cron_expression, created: t.created_at })) };
  } catch (err) {
    return { error: `Failed to list tasks: ${err.message}` };
  }
}

async function cancelTask(userEmail, taskId) {
  try {
    await db.deleteScheduledTask(taskId, userEmail);
    return { success: true, message: `Task ${taskId} cancelled.` };
  } catch (err) {
    return { error: `Failed to cancel task: ${err.message}` };
  }
}
