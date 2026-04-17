import type { Team } from "@linear/sdk";
import { getLinearClient } from "./client";
import { withRetry } from "./retry";

export async function getTeams(): Promise<Team[]> {
  const client = getLinearClient();
  const teams = await withRetry(() => client.teams(), { label: "getTeams" });
  return teams.nodes;
}

export async function findTeamByKey(key: string): Promise<Team | null> {
  const teams = await getTeams();
  const upperKey = key.toUpperCase();
  return teams.find((t) => t.key.toUpperCase() === upperKey) ?? null;
}

export async function findTeamByName(name: string): Promise<Team | null> {
  const teams = await getTeams();
  const lowerName = name.toLowerCase();
  return teams.find((t) => t.name.toLowerCase() === lowerName) ?? null;
}
