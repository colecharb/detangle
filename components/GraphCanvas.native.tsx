import GraphCanvasSkia from './GraphCanvasSkia';
import type { GraphLayout } from '@core/graph';

interface Props {
  layout: GraphLayout;
  onCommitTap: (sha: string) => void;
}

export function GraphCanvas(props: Props) {
  return <GraphCanvasSkia {...props} />;
}
