import { ActivityIndicator, View } from 'react-native';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import type { GraphLayout } from '@core/graph';

interface Props {
  layouts: { 0: GraphLayout; 1: GraphLayout; 2: GraphLayout };
  onCommitTap: (sha: string) => void;
}

export function GraphCanvas(props: Props) {
  return (
    <WithSkiaWeb
      opts={{ locateFile: (file: string) => `/${file}` }}
      fallback={
        <View className="flex-1 items-center justify-center bg-neutral-50">
          <ActivityIndicator />
        </View>
      }
      getComponent={() => import('./GraphCanvasSkia')}
      componentProps={props}
    />
  );
}
