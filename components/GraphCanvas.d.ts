import type { ComponentType } from 'react';
import type { GraphLayout } from '@core/graph';

export interface GraphCanvasProps {
  layouts: { 0: GraphLayout; 1: GraphLayout; 2: GraphLayout };
  onCommitTap: (sha: string) => void;
}

export const GraphCanvas: ComponentType<GraphCanvasProps>;
