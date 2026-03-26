import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";

export interface ResearchEdgeData extends Record<string, unknown> {
  path: string;
}

export type ResearchFlowEdge = Edge<ResearchEdgeData, "research">;

function ResearchEdgeComponent({ data, markerEnd, style }: EdgeProps<ResearchFlowEdge>) {
  if (!data?.path) {
    return null;
  }

  return (
    <BaseEdge
      path={data.path}
      markerEnd={markerEnd}
      style={style}
    />
  );
}

export const ResearchEdge = memo(ResearchEdgeComponent);
