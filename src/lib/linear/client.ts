import { LinearClient } from "@linear/sdk";

let client: LinearClient | null = null;

export function getLinearClient(): LinearClient {
  if (!client) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error("LINEAR_API_KEY environment variable is not set");
    }
    client = new LinearClient({ apiKey });
  }
  return client;
}
