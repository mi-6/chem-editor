export type WorkspaceArtifact = {
  created_at: string;
  data: Record<string, unknown>;
  id: string;
  kind: string;
  provenance?: string[];
  source_tool: string;
  summary: string;
  title: string;
};
