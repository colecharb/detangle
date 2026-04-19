import GraphCanvasSkia from './GraphCanvasSkia';
import type { GraphLayout } from '@core/graph';

interface Props {
  layouts: { 0: GraphLayout; 1: GraphLayout; 2: GraphLayout };
  onCommitTap: (sha: string) => void;
}

export function GraphCanvas(props: Props) {
  return <GraphCanvasSkia {...props} />;
}
