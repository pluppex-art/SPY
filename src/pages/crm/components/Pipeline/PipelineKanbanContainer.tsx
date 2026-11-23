import { ReactNode } from "react";

export function PipelineKanbanContainer(props: {
  activePipelineStages: any[];
  noPipelineConfigured: boolean;
  showAnalytics: boolean;
  children?: ReactNode;
  board?: ReactNode;
  renderWhenEmpty: () => ReactNode;
  renderWhenConfigured: () => ReactNode;
}) {
  // Kept minimal; placeholder to keep further refactors incremental.
  return props.activePipelineStages.length > 0 ? props.renderWhenConfigured() : !props.noPipelineConfigured ? props.renderWhenEmpty() : null;
}

// NOTE: In subsequent steps we can eliminate this wrapper and directly compose in Pipeline.tsx.

