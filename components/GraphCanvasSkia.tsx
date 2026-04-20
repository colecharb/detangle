import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const labelFontSource = require('../assets/fonts/SpaceMono-Regular.ttf');
import {
  Canvas,
  Circle,
  Group,
  Line,
  Rect,
  Text as SkiaText,
  useFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDecay,
} from 'react-native-reanimated';
import type {
  BucketNode,
  ClusterNode,
  CommitNode,
  GraphLayout,
  Tier,
} from '@core/graph';
import { TIER_THRESHOLDS } from '@core/graph';

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const LABEL_MIN_SCALE = 0.8;
const TAP_SLOP = 6;

interface Props {
  layouts: { 0: GraphLayout; 1: GraphLayout; 2: GraphLayout };
  onCommitTap: (sha: string) => void;
}

export default function GraphCanvasSkia({ layouts, onCommitTap }: Props) {
  const font = useFont(labelFontSource, 12);
  const clusterFont = useFont(labelFontSource, 24);
  const bucketFont = useFont(labelFontSource, 72);
  const [_size, setSize] = useState({ width: 0, height: 0 });
  const wrapperRef = useRef<View | null>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const savedTy = useSharedValue(0);

  const activeTierSV = useSharedValue<Tier>(2);
  const [jsActiveTier, setJsActiveTier] = useState<Tier>(2);

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    activeTierSV.value = 2;
    setJsActiveTier(2);
  }, [layouts, translateX, translateY, scale, activeTierSV]);

  const transform = useDerivedValue(() => [
    { translateX: translateX.value },
    { translateY: translateY.value },
    { scale: scale.value },
  ]);

  const opacity2 = useDerivedValue(() => {
    const s = scale.value;
    const a = TIER_THRESHOLDS.tier1to2 - TIER_THRESHOLDS.hysteresis;
    const b = TIER_THRESHOLDS.tier1to2 + TIER_THRESHOLDS.hysteresis;
    const t = Math.max(0, Math.min(1, (s - a) / (b - a)));
    return t * t * (3 - 2 * t);
  });

  const opacity1 = useDerivedValue(() => {
    const s = scale.value;
    const a0 = TIER_THRESHOLDS.tier0to1 - TIER_THRESHOLDS.hysteresis;
    const b0 = TIER_THRESHOLDS.tier0to1 + TIER_THRESHOLDS.hysteresis;
    const a1 = TIER_THRESHOLDS.tier1to2 - TIER_THRESHOLDS.hysteresis;
    const b1 = TIER_THRESHOLDS.tier1to2 + TIER_THRESHOLDS.hysteresis;
    const tUp = Math.max(0, Math.min(1, (s - a0) / (b0 - a0)));
    const fUp = tUp * tUp * (3 - 2 * tUp);
    const tDown = Math.max(0, Math.min(1, (s - a1) / (b1 - a1)));
    const fDown = 1 - tDown * tDown * (3 - 2 * tDown);
    return Math.min(fUp, fDown);
  });

  const opacity0 = useDerivedValue(() => {
    const s = scale.value;
    const a = TIER_THRESHOLDS.tier0to1 - TIER_THRESHOLDS.hysteresis;
    const b = TIER_THRESHOLDS.tier0to1 + TIER_THRESHOLDS.hysteresis;
    const t = Math.max(0, Math.min(1, (s - a) / (b - a)));
    return 1 - t * t * (3 - 2 * t);
  });

  const tier2LabelOpacity = useDerivedValue(() => {
    const base = scale.value >= LABEL_MIN_SCALE ? 1 : 0;
    return base * opacity2.value;
  });

  const tier1LabelOpacity = useDerivedValue(() => {
    const base = scale.value >= 0.5 ? 1 : 0;
    return base * opacity1.value;
  });

  useAnimatedReaction(
    () => scale.value,
    (s) => {
      const curr = activeTierSV.value;
      const H = TIER_THRESHOLDS.hysteresis;
      let next: Tier = curr;
      const target: Tier =
        s >= TIER_THRESHOLDS.tier1to2
          ? 2
          : s >= TIER_THRESHOLDS.tier0to1
            ? 1
            : 0;
      if (target !== curr) {
        if (target > curr) {
          if (curr === 0 && s > TIER_THRESHOLDS.tier0to1 + H) next = 1;
          else if (curr === 1 && s > TIER_THRESHOLDS.tier1to2 + H) next = 2;
        } else {
          if (curr === 2 && s < TIER_THRESHOLDS.tier1to2 - H) next = 1;
          else if (curr === 1 && s < TIER_THRESHOLDS.tier0to1 - H) next = 0;
        }
      }
      if (next !== curr) {
        activeTierSV.value = next;
        runOnJS(setJsActiveTier)(next);
      }
    },
  );

  const commitNodes = useMemo(
    () => layouts[2].nodes as CommitNode[],
    [layouts],
  );
  const clusterNodes = useMemo(
    () => layouts[1].nodes as ClusterNode[],
    [layouts],
  );
  const bucketNodes = useMemo(
    () => layouts[0].nodes as BucketNode[],
    [layouts],
  );

  const tier2LabelX = useMemo(() => {
    let max = 0;
    for (const n of commitNodes) max = Math.max(max, n.x + n.radius);
    return max + 16;
  }, [commitNodes]);
  const tier1LabelX = useMemo(() => {
    let max = 0;
    for (const c of clusterNodes) max = Math.max(max, c.x + c.width);
    return max + 16;
  }, [clusterNodes]);
  const tier0LabelX = useMemo(() => {
    let max = 0;
    for (const b of bucketNodes) max = Math.max(max, b.x + b.width);
    return max + 16;
  }, [bucketNodes]);

  const handleTapAt = useCallback(
    (sx: number, sy: number) => {
      if (jsActiveTier !== 2) return;
      const lx = (sx - translateX.value) / scale.value;
      const ly = (sy - translateY.value) / scale.value;
      let best: CommitNode | null = null;
      let bestDist = Infinity;
      for (const n of commitNodes) {
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
    [commitNodes, jsActiveTier, onCommitTap, translateX, translateY, scale],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          cancelAnimation(translateY);
        })
        .onChange((e) => {
          translateY.value += e.changeY;
        })
        .onEnd((e) => {
          translateY.value = withDecay({ velocity: e.velocityY });
        }),
    [translateY],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          cancelAnimation(translateY);
          savedScale.value = scale.value;
          savedTy.value = translateY.value;
        })
        .onUpdate((e) => {
          const newScale = Math.min(
            MAX_SCALE,
            Math.max(MIN_SCALE, savedScale.value * e.scale),
          );
          const factor = newScale / savedScale.value;
          scale.value = newScale;
          translateY.value = e.focalY - (e.focalY - savedTy.value) * factor;
        }),
    [scale, translateY, savedScale, savedTy],
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
      cancelAnimation(translateY);
      if (ev.ctrlKey) {
        const rect = el.getBoundingClientRect();
        const fy = ev.clientY - rect.top;
        const zoom = Math.exp(-ev.deltaY * 0.01);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * zoom));
        const factor = newScale / scale.value;
        translateY.value = fy - (fy - translateY.value) * factor;
        scale.value = newScale;
      } else {
        translateY.value -= ev.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, translateY]);

  const showLabels = font !== null;
  const mountTier0 = jsActiveTier <= 1;
  const mountTier1 = jsActiveTier <= 2 && jsActiveTier >= 0;
  const mountTier2 = jsActiveTier >= 1;


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
              {mountTier0 && (
                <Group opacity={opacity0}>
                  {bucketNodes.map((b) => (
                    <Rect
                      key={b.id}
                      x={b.x}
                      y={b.y}
                      width={b.width}
                      height={b.height}
                      color={b.color}
                    />
                  ))}
                  {bucketFont !== null &&
                    bucketNodes
                      .filter((b) => b.height >= 84)
                      .map((b) => (
                        <SkiaText
                          key={`t-${b.id}`}
                          x={tier0LabelX}
                          y={b.y + b.height / 2 + 26}
                          text={b.label}
                          font={bucketFont}
                          color="#171717"
                        />
                      ))}
                </Group>
              )}
              {mountTier1 && (
                <Group opacity={opacity1}>
                  {clusterNodes.map((c) => (
                    <Rect
                      key={c.id}
                      x={c.x}
                      y={c.y}
                      width={c.width}
                      height={c.height}
                      color={c.color}
                    />
                  ))}
                  {clusterFont !== null &&
                    clusterNodes.map((c) => (
                      <SkiaText
                        key={`t-${c.id}`}
                        x={tier1LabelX}
                        y={c.y + 20}
                        text={c.label}
                        font={clusterFont}
                        color="#171717"
                        opacity={tier1LabelOpacity}
                      />
                    ))}
                </Group>
              )}
              {mountTier2 && (
                <Group opacity={opacity2}>
                  {layouts[2].edges.map((edge, i) => (
                    <Line
                      key={i}
                      p1={edge.from}
                      p2={edge.to}
                      color={edge.kind === 'merge' ? '#525252' : '#a3a3a3'}
                      strokeWidth={edge.kind === 'merge' ? 1.5 : 1}
                    />
                  ))}
                  {commitNodes.map((n) => (
                    <Circle key={n.sha} cx={n.x} cy={n.y} r={n.radius} color={n.color} />
                  ))}
                  {showLabels &&
                    commitNodes.map((n) => (
                      <SkiaText
                        key={`t-${n.sha}`}
                        x={tier2LabelX}
                        y={n.y + 4}
                        text={n.label ?? ''}
                        font={font}
                        color="#171717"
                        opacity={tier2LabelOpacity}
                      />
                    ))}
                </Group>
              )}
            </Group>
          </Canvas>
        </View>
      </GestureDetector>
    </View>
  );
}
