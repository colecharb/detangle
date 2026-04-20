import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const labelFontSource = require('../assets/fonts/SpaceMono-Regular.ttf');
import {
  Canvas,
  Circle,
  Group,
  Line,
  Paint,
  RoundedRect,
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

const MIN_SCALE = 0.15;
const MAX_SCALE = 1;
const LABEL_MIN_SCALE = 0.8;
const LABEL_FADE_HALF_WIDTH = 0.05;
const TIER1_LABEL_MIN_SCALE = 0.5;
const TAP_SLOP = 6;
const LEFT_MARGIN = 120;
const DAY_LINE_SWIMLANE_GAP = 10;
const DAY_LINE_LEFT_X = 16;
const DAY_LABEL_ABOVE_LINE_GAP = 4;

interface Props {
  layouts: { 0: GraphLayout; 1: GraphLayout; 2: GraphLayout };
  onCommitTap: (sha: string) => void;
}

export default function GraphCanvasSkia({ layouts, onCommitTap }: Props) {
  const font = useFont(labelFontSource, 12);
  const clusterFont = useFont(labelFontSource, 24);
  const bucketFont = useFont(labelFontSource, 72);
  const wrapperRef = useRef<View | null>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const savedTy = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const contentTopY = useSharedValue(0);
  const contentBottomY = useSharedValue(0);

  const activeTierSV = useSharedValue<Tier>(2);
  const [jsActiveTier, setJsActiveTier] = useState<Tier>(2);

  useEffect(() => {
    translateX.value = LEFT_MARGIN;
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
    const s = scale.value;
    const a = LABEL_MIN_SCALE - LABEL_FADE_HALF_WIDTH;
    const b = LABEL_MIN_SCALE + LABEL_FADE_HALF_WIDTH;
    const t = Math.max(0, Math.min(1, (s - a) / (b - a)));
    const base = t * t * (3 - 2 * t);
    return base * opacity2.value;
  });

  const tier1LabelOpacity = useDerivedValue(() => {
    const s = scale.value;
    const a = TIER1_LABEL_MIN_SCALE - LABEL_FADE_HALF_WIDTH;
    const b = TIER1_LABEL_MIN_SCALE + LABEL_FADE_HALF_WIDTH;
    const t = Math.max(0, Math.min(1, (s - a) / (b - a)));
    const base = t * t * (3 - 2 * t);
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

  const commitYExtent = useMemo(() => {
    let top = Infinity;
    let bottom = -Infinity;
    for (const n of commitNodes) {
      top = Math.min(top, n.y - n.radius);
      bottom = Math.max(bottom, n.y + n.radius);
    }
    if (!isFinite(top)) return { top: 0, bottom: 0 };
    const spacing =
      commitNodes.length > 1
        ? (bottom - top) / (commitNodes.length - 1)
        : 0;
    const pad = spacing * 1.5;
    return { top: top - pad, bottom: bottom + pad };
  }, [commitNodes]);

  useEffect(() => {
    contentTopY.value = commitYExtent.top;
    contentBottomY.value = commitYExtent.bottom;
  }, [commitYExtent, contentTopY, contentBottomY]);

  const dayMarkers = useMemo(() => {
    if (commitNodes.length === 0) return [];
    const sorted = [...commitNodes].sort((a, b) => a.y - b.y);
    const dayKey = (n: CommitNode) => {
      const d = new Date(n.meta.committedAt * 1000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const labelFor = (key: string) => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    };
    const isWeekStartKey = (key: string) => {
      const [y, m, d] = key.split('-').map(Number);
      return new Date(y, m - 1, d).getDay() === 1; // Monday
    };
    const markers: {
      key: string;
      y: number;
      label: string;
      isWeekStart: boolean;
    }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prevKey = dayKey(sorted[i - 1]);
      const currKey = dayKey(sorted[i]);
      if (prevKey !== currKey) {
        markers.push({
          key: prevKey,
          y: (sorted[i - 1].y + sorted[i].y) / 2,
          label: labelFor(prevKey),
          isWeekStart: isWeekStartKey(prevKey),
        });
      }
    }
    const last = sorted[sorted.length - 1];
    const lastKey = dayKey(last);
    markers.push({
      key: lastKey,
      y: last.y + last.radius + 12,
      label: labelFor(lastKey),
      isWeekStart: isWeekStartKey(lastKey),
    });
    return markers;
  }, [commitNodes]);

  const bucketXMax = useMemo(() => {
    let max = -Infinity;
    for (const b of bucketNodes) max = Math.max(max, b.x + b.width);
    return isFinite(max) ? max : 0;
  }, [bucketNodes]);

  const dayLineEndX = useMemo(() => {
    if (font === null) return tier2LabelX + 600;
    let maxWidth = 0;
    for (const n of commitNodes) {
      if (n.label) maxWidth = Math.max(maxWidth, font.getTextWidth(n.label));
    }
    return tier2LabelX + maxWidth + 16;
  }, [font, commitNodes, tier2LabelX]);

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
          const ty = translateY.value + e.changeY;
          const s = scale.value;
          const min = viewportH.value - s * contentBottomY.value;
          const max = -s * contentTopY.value;
          translateY.value =
            min > max ? max : Math.min(max, Math.max(min, ty));
        })
        .onEnd((e) => {
          const s = scale.value;
          const min = viewportH.value - s * contentBottomY.value;
          const max = -s * contentTopY.value;
          const clamp: [number, number] = min > max ? [max, max] : [min, max];
          translateY.value = withDecay({ velocity: e.velocityY, clamp });
        }),
    [translateY, scale, viewportH, contentBottomY, contentTopY],
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
          const ty = e.focalY - (e.focalY - savedTy.value) * factor;
          const min = viewportH.value - newScale * contentBottomY.value;
          const max = -newScale * contentTopY.value;
          translateY.value =
            min > max ? max : Math.min(max, Math.max(min, ty));
        }),
    [scale, translateY, savedScale, savedTy, viewportH, contentBottomY, contentTopY],
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
      let newTy: number;
      let newS: number;
      if (ev.ctrlKey) {
        const rect = el.getBoundingClientRect();
        const fy = ev.clientY - rect.top;
        const zoom = Math.exp(-ev.deltaY * 0.01);
        newS = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * zoom));
        const factor = newS / scale.value;
        newTy = fy - (fy - translateY.value) * factor;
      } else {
        newS = scale.value;
        newTy = translateY.value - ev.deltaY;
      }
      const min = viewportH.value - newS * contentBottomY.value;
      const max = -newS * contentTopY.value;
      scale.value = newS;
      translateY.value = min > max ? max : Math.min(max, Math.max(min, newTy));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, translateY, viewportH, contentBottomY, contentTopY]);

  const showLabels = font !== null;
  const mountTier0 = jsActiveTier <= 1;
  const mountTier1 = jsActiveTier <= 2 && jsActiveTier >= 0;
  const mountTier2 = jsActiveTier >= 1;


  return (
    <View
      ref={wrapperRef}
      className="flex-1 bg-neutral-50"
      style={Platform.OS === 'web' ? ({ touchAction: 'none' } as object) : undefined}
      onLayout={(e) => {
        viewportH.value = e.nativeEvent.layout.height;
      }}
    >
      <GestureDetector gesture={composed}>
        <View style={{ flex: 1 }}>
          <Canvas style={{ flex: 1 }}>
            <Group transform={transform}>
              {mountTier0 && (
                <Group opacity={opacity0}>
                  {bucketNodes.map((b) => (
                    <RoundedRect
                      key={b.id}
                      x={b.x}
                      y={b.y}
                      width={b.width}
                      height={b.height}
                      r={b.width / 2}
                      color={b.color}
                    />
                  ))}
                  {bucketFont !== null &&
                    bucketNodes
                      .filter((b) => b.height >= 84)
                      .map((b) => (
                        <Group key={`t-${b.id}`}>
                          <SkiaText
                            x={tier0LabelX}
                            y={b.y + b.height / 2 + 26}
                            text={b.label}
                            font={bucketFont}
                            color="#737373"
                          />
                          <SkiaText
                            x={tier0LabelX}
                            y={b.y + b.height / 2 + 26}
                            text={b.label}
                            font={bucketFont}
                          >
                            <Paint
                              color="#737373"
                              style="stroke"
                              strokeWidth={2}
                            />
                          </SkiaText>
                        </Group>
                      ))}
                </Group>
              )}
              {mountTier1 && (
                <Group opacity={opacity1}>
                  {clusterNodes.map((c) => (
                    <RoundedRect
                      key={c.id}
                      x={c.x}
                      y={c.y}
                      width={c.width}
                      height={c.height}
                      r={c.width / 2}
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
            {font !== null &&
              dayMarkers.map((m) => (
                <DayMarkerOverlay
                  key={m.key}
                  worldY={m.y}
                  worldLineEndX={m.isWeekStart ? dayLineEndX : bucketXMax}
                  strokeWidth={m.isWeekStart ? 1 : 0.5}
                  label={m.label}
                  font={font}
                  translateX={translateX}
                  translateY={translateY}
                  scale={scale}
                />
              ))}
          </Canvas>
        </View>
      </GestureDetector>
    </View>
  );
}

interface DayMarkerOverlayProps {
  worldY: number;
  worldLineEndX: number;
  strokeWidth: number;
  label: string;
  font: NonNullable<ReturnType<typeof useFont>>;
  translateX: ReturnType<typeof useSharedValue<number>>;
  translateY: ReturnType<typeof useSharedValue<number>>;
  scale: ReturnType<typeof useSharedValue<number>>;
}

function DayMarkerOverlay({
  worldY,
  worldLineEndX,
  strokeWidth,
  label,
  font,
  translateX,
  translateY,
  scale,
}: DayMarkerOverlayProps) {
  const p1 = useDerivedValue(() => ({
    x: DAY_LINE_LEFT_X,
    y: translateY.value + scale.value * worldY,
  }));
  const p2 = useDerivedValue(() => {
    const endX =
      translateX.value +
      scale.value * worldLineEndX +
      DAY_LINE_SWIMLANE_GAP;
    return {
      x: Math.max(DAY_LINE_LEFT_X, endX),
      y: translateY.value + scale.value * worldY,
    };
  });
  const textY = useDerivedValue(
    () =>
      translateY.value + scale.value * worldY - DAY_LABEL_ABOVE_LINE_GAP,
  );
  return (
    <>
      <Line p1={p1} p2={p2} color="#a3a3a3" strokeWidth={strokeWidth} />
      <SkiaText
        x={DAY_LINE_LEFT_X}
        y={textY}
        text={label}
        font={font}
        color="#525252"
      />
    </>
  );
}
