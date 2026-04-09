export const toolDefinitions = [
  {
    name: "web_search",
    description: "Search the web for current information on any topic.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        num_results: { type: "number", description: "Number of results to return (default 5)" }
      },
      required: ["query"]
    }
  },
  {
    name: "get_news",
    description: "Get the latest news articles on a topic.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "News topic to search for" },
        country: { type: "string", description: "Country code (default 'us')" },
        num_articles: { type: "number", description: "Number of articles to return (default 5)" }
      },
      required: ["topic"]
    }
  },
  {
    name: "get_stock_price",
    description: "Get the current stock price and daily change for a ticker symbol.",
    input_schema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Stock ticker symbol (e.g. AAPL, TSLA, NVDA)" }
      },
      required: ["symbol"]
    }
  },
  {
    name: "get_crypto_price",
    description: "Get the current price of a cryptocurrency.",
    input_schema: {
      type: "object",
      properties: {
        coin_id: { type: "string", description: "CoinGecko coin ID (e.g. bitcoin, ethereum, solana, dogecoin)" }
      },
      required: ["coin_id"]
    }
  },
  {
    name: "get_x_posts",
    description: "Get recent posts from X/Twitter accounts. Returns tweets with engagement metrics. Use this when users ask about what someone posted on X or Twitter.",
    input_schema: {
      type: "object",
      properties: {
        handles: {
          type: "array",
          items: { type: "string" },
          description: "X/Twitter handles to fetch posts from (without @, e.g. ['elonmusk', 'sama'])"
        },
        date: { type: "string", description: "Date to fetch posts for in YYYY-MM-DD format (defaults to today)" },
        max_per_handle: { type: "number", description: "Max posts per handle (default 10, max 100)" }
      },
      required: ["handles"]
    }
  },
  {
    name: "find_contact",
    description: "Find contact information for a person. Searches the web, checks X/Twitter, and generates likely email patterns from their company domain. Use when the user asks to find someone's email, contact info, or how to reach someone.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the person (e.g. 'Jensen Huang')" },
        company: { type: "string", description: "Company or organization they work at (e.g. 'NVIDIA')" },
        context: { type: "string", description: "Any additional context — role, location, known social handles, etc." }
      },
      required: ["name"]
    }
  },
  {
    name: "schedule_recurring_task",
    description: "Schedule a recurring task that will run on a cron schedule and email the results to the user.",
    input_schema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Short description of the task (e.g. 'Weekly AI news digest')" },
        cron_expression: { type: "string", description: "Cron expression for the schedule (e.g. '0 8 * * 1' for every Monday at 8am UTC)" },
        task_prompt: { type: "string", description: "The prompt to execute on each run (e.g. 'Get the top 5 AI news stories this week and summarize them')" }
      },
      required: ["description", "cron_expression", "task_prompt"]
    }
  },
  {
    name: "list_scheduled_tasks",
    description: "List all active scheduled tasks for the current user.",
    input_schema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "cancel_scheduled_task",
    description: "Cancel a scheduled task by its ID.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The ID of the task to cancel" }
      },
      required: ["task_id"]
    }
  }
];
