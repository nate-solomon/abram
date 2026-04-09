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

    case "find_contact":
      return await findContact(toolInput.name, toolInput.company, toolInput.context);

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

// Cache the CoinGecko coins list (refreshed every 6 hours)
let coinListCache = null;
let coinListFetchedAt = 0;

async function getCoinList() {
  if (coinListCache && Date.now() - coinListFetchedAt < 6 * 60 * 60 * 1000) {
    return coinListCache;
  }
  const res = await fetch("https://api.coingecko.com/api/v3/coins/list");
  const data = await res.json();
  if (!Array.isArray(data)) return coinListCache || []; // rate limited, use stale cache
  coinListCache = data;
  coinListFetchedAt = Date.now();
  return coinListCache;
}

// Well-known mappings for common tickers that don't match their CoinGecko IDs
const KNOWN_COINS = {
  btc: "bitcoin", eth: "ethereum", sol: "solana", doge: "dogecoin",
  ada: "cardano", xrp: "ripple", dot: "polkadot", avax: "avalanche-2",
  matic: "matic-network", link: "chainlink", uni: "uniswap", atom: "cosmos",
  near: "near", apt: "aptos", sui: "sui", arb: "arbitrum",
  op: "optimism", ftm: "fantom", algo: "algorand", hbar: "hedera-hashgraph",
  icp: "internet-computer", fil: "filecoin", vet: "vechain", sand: "the-sandbox",
  mana: "decentraland", aave: "aave", mkr: "maker", crv: "curve-dao-token",
  ldo: "lido-dao", rpl: "rocket-pool", snx: "havven", comp: "compound-governance-token",
  ens: "ethereum-name-service", grt: "the-graph", rndr: "render-token",
  hype: "hyperliquid", jup: "jupiter-exchange-solana", jto: "jito-governance-token",
  wif: "dogwifcoin", bonk: "bonk", pepe: "pepe", shib: "shiba-inu",
  floki: "floki", pendle: "pendle", ena: "ethena", w: "wormhole",
  strk: "starknet", pyth: "pyth-network", tia: "celestia", sei: "sei-network",
  ton: "the-open-network", ondo: "ondo-finance",
  jitosol: "jito-staked-sol", msol: "msol", bsol: "blazestake-staked-sol",
  ore: "ore", ray: "raydium", mnde: "marinade", kmno: "kamino",
};

async function resolveCoinId(input) {
  const lower = input.toLowerCase().trim();

  // Check known mappings first
  if (KNOWN_COINS[lower]) return KNOWN_COINS[lower];

  // Try as a direct CoinGecko ID (e.g. "jito-staked-sol", "bitcoin")
  const coins = await getCoinList();
  const directMatch = coins.find((c) => c.id === lower);
  if (directMatch) return directMatch.id;

  // Search by symbol
  const matches = coins.filter((c) => c.symbol === lower);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;

  // Multiple matches — prefer one whose name matches symbol, else shortest ID
  const exact = matches.find((c) => c.name.toLowerCase() === lower);
  if (exact) return exact.id;

  matches.sort((a, b) => a.id.length - b.id.length);
  return matches[0].id;
}

async function getCryptoPrice(coinId) {
  try {
    const resolvedId = await resolveCoinId(coinId);
    if (!resolvedId) {
      return { error: `No cryptocurrency found for "${coinId}". Try a ticker symbol (BTC, ETH, SOL) or CoinGecko ID.` };
    }

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(resolvedId)}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

    // Retry on 429 rate limit
    let data;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, (i + 1) * 2000));
        continue;
      }
      data = await res.json();
      break;
    }

    const coin = data?.[resolvedId];
    if (!coin) {
      return { error: `No price data for "${coinId}" (resolved to "${resolvedId}"). CoinGecko may be rate-limiting.` };
    }

    return {
      coin: resolvedId,
      symbol: coinId.toUpperCase(),
      price: `$${coin.usd.toLocaleString()}`,
      change24h: `${coin.usd_24h_change?.toFixed(2)}%`,
      marketCap: `$${Math.round(coin.usd_market_cap).toLocaleString()}`
    };
  } catch (err) {
    return { error: `Crypto fetch failed: ${err.message}` };
  }
}

async function findContact(name, company, context) {
  const results = { name, company: company || null };
  const nameParts = name.toLowerCase().split(/\s+/);
  const first = nameParts[0];
  const last = nameParts[nameParts.length - 1] || "";

  // Run searches in parallel
  const searchQueries = [
    `"${name}"${company ? " " + company : ""} email`,
    `"${name}"${company ? " " + company : ""} contact`,
    `"${name}" site:linkedin.com`,
  ];
  if (company) {
    searchQueries.push(`${company} email format`);
    searchQueries.push(`"@${company.toLowerCase().replace(/[^a-z0-9]/g, "")}" email`);
    searchQueries.push(`${company} official website`);
  }

  const searchResults = await Promise.all(searchQueries.map((q) => webSearch(q, 5)));

  // Collect all snippets and URLs
  const allSnippets = [];
  const allUrls = [];
  for (const sr of searchResults) {
    for (const r of sr.results || []) {
      if (r.snippet) allSnippets.push(r.snippet);
      if (r.url) allUrls.push(r.url);
    }
  }

  // Extract any emails found in search snippets
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const foundEmails = new Set();
  for (const snippet of allSnippets) {
    const matches = snippet.match(emailRegex);
    if (matches) matches.forEach((e) => foundEmails.add(e.toLowerCase()));
  }
  results.emailsFound = [...foundEmails];

  // Detect company domain
  let domain = null;
  if (company) {
    domain = detectDomain(allUrls, company);
    results.domain = domain;

    // Detect email format from found emails at this domain
    const domainEmails = results.emailsFound.filter((e) => e.endsWith("@" + domain));
    if (domainEmails.length > 0) {
      results.detectedFormat = detectEmailFormat(domainEmails);
    }
  }

  // Generate email guesses
  if (domain && first && last) {
    const patterns = [
      { format: "first.last", email: `${first}.${last}@${domain}` },
      { format: "firstlast", email: `${first}${last}@${domain}` },
      { format: "first", email: `${first}@${domain}` },
      { format: "flast", email: `${first[0]}${last}@${domain}` },
      { format: "first_last", email: `${first}_${last}@${domain}` },
      { format: "f.last", email: `${first[0]}.${last}@${domain}` },
      { format: "firstl", email: `${first}${last[0]}@${domain}` },
      { format: "last.first", email: `${last}.${first}@${domain}` },
    ];

    // If we detected a format, rank it first
    if (results.detectedFormat) {
      patterns.sort((a, b) => {
        if (a.format === results.detectedFormat) return -1;
        if (b.format === results.detectedFormat) return 1;
        return 0;
      });
    }

    results.likelyEmails = patterns.map((p) => ({
      email: p.email,
      format: p.format,
      confidence: p.format === results.detectedFormat ? "high" : "medium"
    }));
  }

  // Extract LinkedIn URL if found
  const linkedinUrl = allUrls.find((u) => u.includes("linkedin.com/in/"));
  if (linkedinUrl) results.linkedin = linkedinUrl;

  // Include raw search context for Claude to reason over
  results.searchSnippets = allSnippets.slice(0, 10);

  return results;
}

function detectDomain(urls, company) {
  const companyLower = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const url of urls) {
    try {
      const hostname = new URL(url).hostname.replace("www.", "");
      if (/wikipedia|linkedin|twitter|x\.com|facebook|crunchbase|bloomberg|reuters|glassdoor|indeed/i.test(hostname)) continue;
      if (hostname.toLowerCase().includes(companyLower.slice(0, 4))) {
        return hostname;
      }
    } catch { /* skip */ }
  }
  return `${companyLower}.com`;
}

function detectEmailFormat(emails) {
  // Analyze found emails to detect the company's format
  for (const email of emails) {
    const local = email.split("@")[0];
    if (local.includes(".")) {
      const parts = local.split(".");
      if (parts[0].length === 1) return "f.last";
      if (parts.length === 2) return "first.last";
    }
    if (local.includes("_")) return "first_last";
  }
  return null;
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
