import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming } from 'react-native-reanimated';
import * as d3 from 'd3-shape';
import * as d3Scale from 'd3-scale';
import * as d3Array from 'd3-array';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_HEIGHT = 220;

const COLORS = {
  sales: { primary: '#2196F3', label: 'Sales' },
  expenses: { primary: '#F44336', label: 'Expenses' },
  transactions: { primary: '#4CAF50', label: 'Transactions' },
  activeUsers: { primary: '#FF9800', label: 'Active Users' },
} as const;

type Key = keyof typeof COLORS;

export type OverviewPoint = {
  x: number;
  sales?: number;
  expenses?: number;
  transactions?: number;
  activeUsers?: number;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

const DATA_POINTS_COUNT = 15;

function normalize(raw: OverviewPoint[], key: Key) {
  if (!raw || raw.length === 0) {
    return Array.from({ length: DATA_POINTS_COUNT }, (_, i) => ({ x: i, y: 50 }));
  }

  const last = raw.slice(-DATA_POINTS_COUNT);
  const padded =
    last.length < DATA_POINTS_COUNT
      ? [
          ...Array.from({ length: DATA_POINTS_COUNT - last.length }, (_, i) => ({ x: i, y: 50 })),
          ...last.map((v) => v),
        ]
      : last;

  return padded.map((item, index) => {
    const value = (item as any)?.[key];
    const y = Number.isFinite(value) ? Number(value) : 50;
    return { x: index, y };
  });
}

function safeGeneratePath(data: { x: number; y: number }[], width: number, height: number) {
  if (!data || data.length < 2) return '';

  const xDomain = d3Array.extent(data, (d) => d.x) as [number, number];
  let yMin = d3Array.min(data, (d) => d.y);
  let yMax = d3Array.max(data, (d) => d.y);

  if (yMin == null || yMax == null) return '';

  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const xScale = d3Scale.scaleLinear().domain(xDomain).range([0, width]);
  const yScale = d3Scale
    .scaleLinear()
    .domain([yMin * 0.9, yMax * 1.1])
    .range([height, 0]);

  const line = d3
    .line<{ x: number; y: number }>()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(d3.curveBasis);

  const linePath = line(data);
  if (!linePath) return '';

  const closed = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  if (closed.includes('NaN') || closed.includes('null') || closed.includes('undefined')) return '';

  return closed;
}

function SingleChartLine({
  raw,
  dataKey,
  visible,
  width,
  height,
}: {
  raw: OverviewPoint[];
  dataKey: Key;
  visible: boolean;
  width: number;
  height: number;
}) {
  const opacity = useSharedValue(visible ? 0.6 : 0);

  const pathD = useMemo(() => {
    const pts = normalize(raw, dataKey);
    return safeGeneratePath(pts, width, height);
  }, [raw, dataKey, width, height]);

  useEffect(() => {
    opacity.value = withTiming(visible ? 0.6 : 0, { duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const animatedProps = useAnimatedProps(() => ({
    fillOpacity: opacity.value,
    strokeOpacity: opacity.value === 0 ? 0 : 1,
  }));

  if (!pathD) return null;

  const gradientId = `grad-${dataKey}`;

  return (
    <>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={COLORS[dataKey].primary} stopOpacity="0.8" />
          <Stop offset="100%" stopColor={COLORS[dataKey].primary} stopOpacity="0.1" />
        </LinearGradient>
      </Defs>

      <AnimatedPath
        animatedProps={animatedProps}
        d={pathD}
        fill={`url(#${gradientId})`}
        stroke={COLORS[dataKey].primary}
        strokeWidth={2}
      />
    </>
  );
}

export default function AnimatedDashboardChart({
  points,
  title,
}: {
  points: OverviewPoint[];
  title?: string;
}) {
  const [dims, setDims] = useState({ width: SCREEN_WIDTH - 20, height: CHART_HEIGHT });

  const [toggles, setToggles] = useState<Record<Key, boolean>>({
    sales: true,
    expenses: true,
    transactions: false,
    activeUsers: false,
  });

  const onLayout = (e: any) => {
    const { width, height } = e.nativeEvent.layout;
    setDims({ width, height });
  };

  return (
    <View style={styles.container}>
      {!!title && <Text style={styles.title}>{title}</Text>}

      <View style={styles.chartContainer} onLayout={onLayout}>
        <Svg width={dims.width} height={dims.height} style={StyleSheet.absoluteFill}>
          {(Object.keys(COLORS) as Key[]).map((k) => (
            <SingleChartLine
              key={k}
              raw={points}
              dataKey={k}
              visible={toggles[k]}
              width={dims.width}
              height={dims.height}
            />
          ))}
        </Svg>
      </View>

      <View style={styles.controlsContainer}>
        {(Object.keys(COLORS) as Key[]).map((k) => (
          <TouchableOpacity
            key={k}
            style={[
              styles.toggleButton,
              { backgroundColor: toggles[k] ? COLORS[k].primary : '#2A2A2A' },
            ]}
            onPress={() => setToggles((p) => ({ ...p, [k]: !p[k] }))}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, { backgroundColor: COLORS[k].primary }]} />
            <Text style={[styles.toggleText, { color: toggles[k] ? 'white' : '#888' }]}>
              {COLORS[k].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#121212', padding: 15, borderRadius: 20, margin: 10 },
  title: { color: 'white', fontWeight: '700', fontSize: 16, marginBottom: 10 },
  chartContainer: {
    height: CHART_HEIGHT,
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 16,
  },
  controlsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  toggleText: { fontWeight: '600', fontSize: 12 },
});
