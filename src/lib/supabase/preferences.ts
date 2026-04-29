import { getSupabaseClient } from "./client";

export interface UserPreferences {
  defaultTeamKey?: string;
  defaultPriority?: number;
  mostCommonProjectId?: string;
  mostCommonProjectIdPerChannel?: Record<string, string>;
  totalIssues30d?: number;
  source: "auto" | "manual";
}

interface PreferencesRow {
  default_team_key: string | null;
  default_priority: number | null;
  most_common_project_id: string | null;
  most_common_project_id_per_channel: Record<string, string> | null;
  total_issues_30d: number | null;
  source: string;
}

export async function getUserPreferences(slackUserId: string): Promise<UserPreferences | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("slack_user_id", slackUserId)
      .maybeSingle();
    if (error) {
      console.error("getUserPreferences failed:", error);
      return null;
    }
    if (!data) return null;
    const row = data as PreferencesRow;
    return {
      defaultTeamKey: row.default_team_key ?? undefined,
      defaultPriority: row.default_priority ?? undefined,
      mostCommonProjectId: row.most_common_project_id ?? undefined,
      mostCommonProjectIdPerChannel: row.most_common_project_id_per_channel ?? undefined,
      totalIssues30d: row.total_issues_30d ?? undefined,
      source: (row.source as "auto" | "manual") ?? "auto",
    };
  } catch (err) {
    console.error("getUserPreferences threw:", err);
    return null;
  }
}

interface DecisionRow {
  slack_user_id: string;
  slack_channel_id: string | null;
  final_decision: {
    teamKey?: string;
    priority?: number;
    projectId?: string;
  } | null;
}

// bot_decisions 히스토리에서 사용자별 선호 자동 도출. 매일 cron으로 호출.
export async function refreshUserPreferencesFromHistory(): Promise<{
  usersUpdated: number;
}> {
  const supabase = getSupabaseClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("bot_decisions")
    .select("slack_user_id, slack_channel_id, final_decision")
    .not("slack_user_id", "is", null)
    .gte("created_at", thirtyDaysAgo);

  if (error) {
    console.error("refreshUserPreferences fetch failed:", error);
    return { usersUpdated: 0 };
  }

  const rows = (data ?? []) as DecisionRow[];
  const perUser = new Map<
    string,
    {
      teamCounts: Map<string, number>;
      priorityCounts: Map<number, number>;
      projectCounts: Map<string, number>;
      perChannelProjectCounts: Map<string, Map<string, number>>;
      total: number;
    }
  >();

  for (const row of rows) {
    if (!row.slack_user_id) continue;
    const fd = row.final_decision ?? {};
    const bucket = perUser.get(row.slack_user_id) ?? {
      teamCounts: new Map(),
      priorityCounts: new Map(),
      projectCounts: new Map(),
      perChannelProjectCounts: new Map(),
      total: 0,
    };
    bucket.total++;
    if (fd.teamKey) bucket.teamCounts.set(fd.teamKey, (bucket.teamCounts.get(fd.teamKey) ?? 0) + 1);
    if (typeof fd.priority === "number")
      bucket.priorityCounts.set(fd.priority, (bucket.priorityCounts.get(fd.priority) ?? 0) + 1);
    if (fd.projectId) {
      bucket.projectCounts.set(fd.projectId, (bucket.projectCounts.get(fd.projectId) ?? 0) + 1);
      if (row.slack_channel_id) {
        const channelMap =
          bucket.perChannelProjectCounts.get(row.slack_channel_id) ?? new Map<string, number>();
        channelMap.set(fd.projectId, (channelMap.get(fd.projectId) ?? 0) + 1);
        bucket.perChannelProjectCounts.set(row.slack_channel_id, channelMap);
      }
    }
    perUser.set(row.slack_user_id, bucket);
  }

  const upserts: Array<{
    slack_user_id: string;
    default_team_key: string | null;
    default_priority: number | null;
    most_common_project_id: string | null;
    most_common_project_id_per_channel: Record<string, string>;
    total_issues_30d: number;
    source: string;
    updated_at: string;
  }> = [];

  const now = new Date().toISOString();

  for (const [userId, bucket] of perUser) {
    const topEntry = <K>(m: Map<K, number>): K | null => {
      let best: K | null = null;
      let bestCount = 0;
      for (const [k, v] of m) {
        if (v > bestCount) {
          best = k;
          bestCount = v;
        }
      }
      return best;
    };

    const perChannel: Record<string, string> = {};
    for (const [channel, projects] of bucket.perChannelProjectCounts) {
      const top = topEntry(projects);
      if (top) perChannel[channel] = top;
    }

    upserts.push({
      slack_user_id: userId,
      default_team_key: topEntry(bucket.teamCounts),
      default_priority: topEntry(bucket.priorityCounts),
      most_common_project_id: topEntry(bucket.projectCounts),
      most_common_project_id_per_channel: perChannel,
      total_issues_30d: bucket.total,
      source: "auto",
      updated_at: now,
    });
  }

  if (upserts.length === 0) return { usersUpdated: 0 };

  // 기존 manual 레코드는 source='manual'로 표시되어 있으므로 덮지 않도록 신중히 처리.
  // 일단 upsert 시 onConflict='slack_user_id'로 모두 덮어씀 — manual 보존이 필요하면 추후 분기 추가.
  const { error: upsertErr } = await supabase
    .from("user_preferences")
    .upsert(upserts, { onConflict: "slack_user_id" });

  if (upsertErr) {
    console.error("refreshUserPreferences upsert failed:", upsertErr);
    return { usersUpdated: 0 };
  }

  return { usersUpdated: upserts.length };
}
