import type { ComponentType } from 'react';
import type { GraphLayout } from '@core/graph';

export interface GraphCanvasProps {
  layout: GraphLayout;
  onCommitTap: (sha: string) => void;
}

export const GraphCanvas: ComponentType<GraphCanvasProps>;
