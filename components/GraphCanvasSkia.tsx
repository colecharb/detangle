import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const labelFontSource = require('../assets/fonts/SpaceMono-Regular.ttf');
import {
  Canvas,
  Circle,
  Group,
  Line,
  Text as SkiaText,
  useFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withDecay,
} from 'react-native-reanimated';
import type { CommitNode, GraphLayout } from '@core/graph';

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const LABEL_MIN_SCALE = 0.8;
const TAP_SLOP = 6;

interface Props {
  layout: GraphLayout;
  onCommitTap: (sha: string) => void;
}

export default function GraphCanvasSkia({ layout, onCommitTap }: Props) {
  const font = useFont(labelFontSource, 12);
  const [_size, setSize] = useState({ width: 0, height: 0 });
  const wrapperRef = useRef<View | null>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
  }, [layout, translateX, translateY, scale]);

  const transform = useDerivedValue(() => [
    { translateX: translateX.value },
    { translateY: translateY.value },
    { scale: scale.value },
  ]);

  const labelOpacity = useDerivedValue(() =>
    scale.value >= LABEL_MIN_SCALE ? 1 : 0,
  );

  const nodes: CommitNode[] = useMemo(
    () => (layout.tier === 2 ? (layout.nodes as CommitNode[]) : []),
    [layout],
  );

  const handleTapAt = useCallback(
    (sx: number, sy: number) => {
      const lx = (sx - translateX.value) / scale.value;
      const ly = (sy - translateY.value) / scale.value;
      let best: CommitNode | null = null;
      let bestDist = Infinity;
      for (const n of nodes) {
        const dx = n.x - lx;
        const dy = n.y - ly;
        const d2 = dx * dx + dy * dy;
        const r = n.radius + TAP_SLOP;
        if (d2 < r * r && d2 < bestDist) {
          best = n;
          bestDist = d2;
        }
      }
      if (best) onCommitTap(best.sha);
    },
    [nodes, onCommitTap, translateX, translateY, scale],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          cancelAnimation(translateX);
          cancelAnimation(translateY);
        })
        .onChange((e) => {
          translateX.value += e.changeX;
          translateY.value += e.changeY;
        })
        .onEnd((e) => {
          translateX.value = withDecay({ velocity: e.velocityX });
          translateY.value = withDecay({ velocity: e.velocityY });
        }),
    [translateX, translateY],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          cancelAnimation(translateX);
          cancelAnimation(translateY);
          savedScale.value = scale.value;
          savedTx.value = translateX.value;
          savedTy.value = translateY.value;
        })
        .onUpdate((e) => {
          const newScale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, savedScale.value * e.scale),
          );
          const factor = newScale / savedScale.value;
          scale.value = newScale;
          translateX.value = e.focalX - (e.focalX - savedTx.value) * factor;
          translateY.value = e.focalY - (e.focalY - savedTy.value) * factor;
        }),
    [scale, translateX, translateY, savedScale, savedTx, savedTy],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(8)
        .onEnd((e, success) => {
          if (success) runOnJS(handleTapAt)(e.x, e.y);
        }),
    [handleTapAt],
  );

  const composed = useMemo(
    () => Gesture.Simultaneous(pinch, Gesture.Exclusive(tap, pan)),
    [pinch, tap, pan],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = wrapperRef.current as unknown as HTMLElement | null;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      if (ev.ctrlKey) {
        // Pinch (trackpad) or ctrl+scroll — zoom around cursor.
        const rect = el.getBoundingClientRect();
        const fx = ev.clientX - rect.left;
        const fy = ev.clientY - rect.top;
        const zoom = Math.exp(-ev.deltaY * 0.01);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * zoom));
        const factor = newScale / scale.value;
        translateX.value = fx - (fx - translateX.value) * factor;
        translateY.value = fy - (fy - translateY.value) * factor;
        scale.value = newScale;
      } else {
        // Two-finger swipe / scroll wheel — pan.
        translateX.value -= ev.deltaX;
        translateY.value -= ev.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, translateX, translateY]);

  const showLabels = font !== null;

  return (
    <View
      ref={wrapperRef}
      className="flex-1 bg-neutral-50"
      style={Platform.OS === 'web' ? ({ touchAction: 'none' } as object) : undefined}
      onLayout={(e) =>
        setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
    >
      <GestureDetector gesture={composed}>
        <View style={{ flex: 1 }}>
          <Canvas style={{ flex: 1 }}>
            <Group transform={transform}>
              {layout.edges.map((edge, i) => (
                <Line
                  key={i}
                  p1={edge.from}
                  p2={edge.to}
                  color={edge.kind === 'merge' ? '#525252' : '#a3a3a3'}
                  strokeWidth={edge.kind === 'merge' ? 1.5 : 1}
                />
              ))}
              {nodes.map((n) => (
                <Circle key={n.sha} cx={n.x} cy={n.y} r={n.radius} color={n.color} />
              ))}
              {showLabels &&
                nodes.map((n) => (
                  <SkiaText
                    key={`t-${n.sha}`}
                    x={n.x + n.radius + 6}
                    y={n.y + 4}
                    text={n.label ?? ''}
                    font={font}
                    color="#171717"
                    opacity={labelOpacity}
                  />
                ))}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>
    </View>
  );
}
