export const config = {
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    scrumChannelId: process.env.SLACK_SCRUM_CHANNEL_ID!,
    changelogChannelId: process.env.SLACK_CHANGELOG_CHANNEL_ID || '',
  },
  linear: {
    apiKey: process.env.LINEAR_API_KEY!,
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
    modelFallback: process.env.AI_MODEL_FALLBACK || 'claude-sonnet-4-6',
  },
  app: {
    teamMembers: (process.env.TEAM_MEMBERS || '').split(',').filter(Boolean),
    dailyCronHour: parseInt(process.env.DAILY_CRON_HOUR || '9', 10),
    summaryDeadlineHour: parseInt(process.env.SUMMARY_DEADLINE_HOUR || '11', 10),
    conversationTimeoutMs: parseInt(process.env.CONVERSATION_TIMEOUT_MS || '7200000', 10),
  },
} as const;
