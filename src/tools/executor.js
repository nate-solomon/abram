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

    case "get_crypto_price":
      return await getCryptoPrice(toolInput.coin_id);

    case "get_x_posts":
      return await getXPosts(toolInput.handles, toolInput.date, toolInput.max_per_handle || 10);

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
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;

    if (!meta || !meta.regularMarketPrice) {
      return { error: `No data found for symbol ${symbol}` };
    }

    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    const change = (price - prevClose).toFixed(2);
    const changePercent = ((change / prevClose) * 100).toFixed(2);

    return {
      symbol: meta.symbol,
      price: price.toFixed(2),
      previousClose: prevClose.toFixed(2),
      change,
      changePercent: `${changePercent}%`,
      currency: meta.currency,
      marketState: meta.marketState
    };
  } catch (err) {
    return { error: `Stock fetch failed: ${err.message}` };
  }
}

async function getCryptoPrice(coinId) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
    const res = await fetch(url);
    const data = await res.json();
    const coin = data[coinId];

    if (!coin) {
      return { error: `No data found for "${coinId}". Use CoinGecko IDs like bitcoin, ethereum, solana, dogecoin.` };
    }

    return {
      coin: coinId,
      price: `$${coin.usd.toLocaleString()}`,
      change24h: `${coin.usd_24h_change?.toFixed(2)}%`,
      marketCap: `$${Math.round(coin.usd_market_cap).toLocaleString()}`
    };
  } catch (err) {
    return { error: `Crypto fetch failed: ${err.message}` };
  }
}

async function getXPosts(handles, date, maxPerHandle) {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) return { error: "X_BEARER_TOKEN not configured." };

  const results = {};
  for (const handle of handles) {
    try {
      // Look up user ID
      const userRes = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`, {
        headers: { Authorization: `Bearer ${bearer}` }
      });
      const userData = await userRes.json();
      if (!userData.data) {
        results[handle] = { error: `User @${handle} not found` };
        continue;
      }

      const userId = userData.data.id;
      const params = new URLSearchParams({
        max_results: String(Math.min(maxPerHandle, 100)),
        "tweet.fields": "created_at,public_metrics,text"
      });

      if (date) {
        params.set("start_time", `${date}T00:00:00Z`);
        // end_time = next day
        const next = new Date(date);
        next.setDate(next.getDate() + 1);
        params.set("end_time", next.toISOString().split("T")[0] + "T00:00:00Z");
      }

      const tweetsRes = await fetch(`https://api.x.com/2/users/${userId}/tweets?${params}`, {
        headers: { Authorization: `Bearer ${bearer}` }
      });
      const tweetsData = await tweetsRes.json();

      results[handle] = {
        name: userData.data.name,
        handle: `@${handle}`,
        posts: (tweetsData.data || []).map((t) => ({
          text: t.text,
          date: t.created_at,
          likes: t.public_metrics.like_count,
          retweets: t.public_metrics.retweet_count,
          replies: t.public_metrics.reply_count,
          impressions: t.public_metrics.impression_count
        }))
      };
    } catch (err) {
      results[handle] = { error: `Failed to fetch @${handle}: ${err.message}` };
    }
  }
  return results;
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
