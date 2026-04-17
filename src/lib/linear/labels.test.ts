import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIssueLabels = vi.fn();
const mockCreateIssueLabel = vi.fn();

vi.mock("./client", () => ({
  getLinearClient: () => ({
    issueLabels: mockIssueLabels,
    createIssueLabel: mockCreateIssueLabel,
  }),
}));

import { ensureLabels } from "./labels";

function makeLabel(id: string, name: string, teamId: string | null) {
  return {
    id,
    name,
    team: Promise.resolve(teamId ? { id: teamId } : undefined),
  };
}

describe("ensureLabels", () => {
  beforeEach(() => {
    mockIssueLabels.mockReset();
    mockCreateIssueLabel.mockReset();
  });

  it("returns empty array for empty input", async () => {
    const result = await ensureLabels("team-1", []);
    expect(result).toEqual([]);
    expect(mockIssueLabels).not.toHaveBeenCalled();
  });

  it("reuses existing team-level label", async () => {
    mockIssueLabels.mockResolvedValue({
      nodes: [makeLabel("label-1", "Bug", "team-1")],
    });

    const result = await ensureLabels("team-1", ["Bug"]);
    expect(result).toEqual(["label-1"]);
    expect(mockCreateIssueLabel).not.toHaveBeenCalled();
  });

  it("reuses workspace-level label (team=null)", async () => {
    mockIssueLabels.mockResolvedValue({
      nodes: [makeLabel("label-ws", "Feature", null)],
    });

    const result = await ensureLabels("team-1", ["Feature"]);
    expect(result).toEqual(["label-ws"]);
    expect(mockCreateIssueLabel).not.toHaveBeenCalled();
  });

  it("prefers team-level match over workspace-level match", async () => {
    mockIssueLabels.mockResolvedValue({
      nodes: [
        makeLabel("label-ws", "Urgent", null),
        makeLabel("label-team", "Urgent", "team-1"),
      ],
    });

    const result = await ensureLabels("team-1", ["Urgent"]);
    expect(result).toEqual(["label-team"]);
  });

  it("ignores labels from other teams and creates new one", async () => {
    mockIssueLabels.mockResolvedValue({
      nodes: [makeLabel("label-other", "docs", "team-OTHER")],
    });
    mockCreateIssueLabel.mockResolvedValue({
      issueLabel: Promise.resolve({ id: "label-new" }),
    });

    const result = await ensureLabels("team-1", ["docs"]);
    expect(result).toEqual(["label-new"]);
    expect(mockCreateIssueLabel).toHaveBeenCalledWith({ name: "docs", teamId: "team-1" });
  });

  it("creates new label when none exists", async () => {
    mockIssueLabels.mockResolvedValue({ nodes: [] });
    mockCreateIssueLabel.mockResolvedValue({
      issueLabel: Promise.resolve({ id: "label-fresh" }),
    });

    const result = await ensureLabels("team-1", ["backend"]);
    expect(result).toEqual(["label-fresh"]);
  });

  it("continues on label creation failure without throwing", async () => {
    mockIssueLabels.mockResolvedValue({ nodes: [] });
    mockCreateIssueLabel.mockRejectedValue(new Error("permission denied"));

    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await ensureLabels("team-1", ["blocked-label"]);
    expect(result).toEqual([]);
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });

  it("processes multiple labels independently", async () => {
    mockIssueLabels
      .mockResolvedValueOnce({ nodes: [makeLabel("l-1", "bug", "team-1")] })
      .mockResolvedValueOnce({ nodes: [makeLabel("l-ws", "feature", null)] })
      .mockResolvedValueOnce({ nodes: [] });
    mockCreateIssueLabel.mockResolvedValue({
      issueLabel: Promise.resolve({ id: "l-new" }),
    });

    const result = await ensureLabels("team-1", ["bug", "feature", "new-one"]);
    expect(result).toEqual(["l-1", "l-ws", "l-new"]);
  });
});
