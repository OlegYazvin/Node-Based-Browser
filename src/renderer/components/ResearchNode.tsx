import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";

export interface ResearchNodeData extends Record<string, unknown> {
  nodeId: string;
  title: string;
  url: string | null;
  faviconUrl: string | null;
  runtimeState: string;
  errorMessage: string | null;
  depth: number;
  origin: string;
  onActivateNode?: (nodeId: string) => void;
}

export type ResearchGraphNode = Node<ResearchNodeData, "research">;

function ResearchNodeComponent({ data, selected }: NodeProps<ResearchGraphNode>) {
  const firstCharacter = data.title.trim().charAt(0).toUpperCase() || "?";
  const hostLabel = data.url ? new URL(data.url).hostname : "Empty root";
  const metaLabel = data.depth === 0 ? "Root node" : data.origin.replaceAll("-", " ");

  return (
    <div
      className={[
        "research-node",
        selected ? "research-node--selected" : "",
        data.runtimeState === "loading" ? "research-node--loading" : "",
        data.errorMessage ? "research-node--error" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      title={data.url ?? data.title}
      role="button"
      tabIndex={0}
      onClick={() => {
        data.onActivateNode?.(data.nodeId);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          data.onActivateNode?.(data.nodeId);
        }
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="research-node__handle research-node__handle--hidden"
      />
      <div className="research-node__favicon">
        {data.faviconUrl ? (
          <img
            src={data.faviconUrl}
            alt=""
          />
        ) : (
          <span>{firstCharacter}</span>
        )}
      </div>
      <div className="research-node__body">
        <strong>{data.title}</strong>
        <span>{hostLabel}</span>
      </div>
      <div className="research-node__meta">
        <span>{metaLabel}</span>
        <span>{data.depth === 0 ? "d0" : `d${data.depth}`}</span>
      </div>
      <Handle
        type="source"
        position={Position.Top}
        className="research-node__handle research-node__handle--hidden"
      />
    </div>
  );
}

export const ResearchNode = memo(ResearchNodeComponent);
