import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
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
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const DATA_POINTS_COUNT = 15;

export type OverviewPoint = {
  // x is 0..14
  x: number;
  sales?: number;
  expenses?: number;
  transactions?: number;
  activeUsers?: number;
};

function normalizeData(raw: OverviewPoint[], key: keyof OverviewPoint) {
  const safe = Array.isArray(raw) ? raw : [];
  if (safe.length === 0) {
    return Array.from({ length: DATA_POINTS_COUNT }, (_, i) => ({ x: i, y: 50 }));
  }

  const sliced = safe.slice(-DATA_POINTS_COUNT);
  const padded =
    sliced.length < DATA_POINTS_COUNT
      ? [
          ...Array.from({ length: DATA_POINTS_COUNT - sliced.length }, (_, i) => ({ x: i, y: 50 })),
          ...sliced,
        ]
      : sliced;

  return padded.map((item, idx) => ({
    x: idx,
    y: typeof item[key] === 'number' ? (item[key] as number) : 50,
  }));
}

function generateD3Path(data: { x: number; y: number }[], width: number, height: number) {
  if (!data || data.length === 0) return '';

  const xDomain = d3Array.extent(data, (d) => d.x) as [number, number];
  const yMin = d3Array.min(data, (d) => d.y) ?? 0;
  const yMax = d3Array.max(data, (d) => d.y) ?? 100;

  const xScale = d3Scale.scaleLinear().domain(xDomain).range([0, width]);
  const yScale = d3Scale
    .scaleLinear()
    .domain([yMin * 0.8, yMax * 1.2])
    .range([height, 0]);

  const line = d3
    .line<{ x: number; y: number }>()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(d3.curveBasis);

  let path = line(data) || '';
  // Close to fill area
  path += ` L ${width} ${height} L 0 ${height} Z`;
  return path;
}

function SingleChartLine({
  points,
  dataKey,
  color,
  isVisible,
  width,
  height,
}: {
  points: OverviewPoint[];
  dataKey: keyof OverviewPoint;
  color: string;
  isVisible: boolean;
  width: number;
  height: number;
}) {
  const normalized = useMemo(() => normalizeData(points, dataKey), [points, dataKey]);
  const initialPath = useMemo(() => generateD3Path(normalized, width, height), [normalized, width, height]);

  const animatedPath = useSharedValue(initialPath);
  const animatedOpacity = useSharedValue(isVisible ? 0.6 : 0);

  useEffect(() => {
    const newPath = generateD3Path(normalized, width, height);
    animatedPath.value = withTiming(newPath, { duration: 900, easing: Easing.inOut(Easing.cubic) });
    animatedOpacity.value = withTiming(isVisible ? 0.6 : 0, { duration: 250 });
  }, [normalized, width, height, isVisible]);

  // “No data” breathing animation
  useEffect(() => {
    if (!points || points.length === 0) {
      const breathing = normalized.map((d) => ({ x: d.x, y: d.y + (Math.random() * 10 - 5) }));
      const breathingPath = generateD3Path(breathing, width, height);
      animatedPath.value = withRepeat(
        withSequence(
          withTiming(breathingPath, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
          withTiming(initialPath, { duration: 2000, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    }
  }, [points, normalized, width, height, initialPath]);

  const animatedProps = useAnimatedProps(() => ({
    d: animatedPath.value,
    fillOpacity: animatedOpacity.value,
    strokeOpacity: animatedOpacity.value === 0 ? 0 : 1,
  }));

  const gradientId = `grad-${String(dataKey)}`;

  return (
    <>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.85" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.10" />
        </LinearGradient>
      </Defs>
      <AnimatedPath
        animatedProps={animatedProps}
        fill={`url(#${gradientId})`}
        stroke={color}
        strokeWidth={2}
      />
    </>
  );
}

export default function AnimatedDashboardChart({
  points,
}: {
  points: OverviewPoint[];
}) {
  const [dims, setDims] = useState({ width: SCREEN_WIDTH - 24, height: CHART_HEIGHT });
  const [toggles, setToggles] = useState({
    sales: true,
    expenses: true,
    transactions: false,
    activeUsers: false,
  });

  return (
    <View style={styles.container}>
      <View
        style={styles.chartContainer}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          const h = e.nativeEvent.layout.height;
          setDims({ width: w, height: h });
        }}
      >
        <Svg width={dims.width} height={dims.height} style={StyleSheet.absoluteFill}>
          <SingleChartLine points={points} dataKey="sales" color={COLORS.sales.primary} isVisible={toggles.sales} width={dims.width} height={dims.height} />
          <SingleChartLine points={points} dataKey="expenses" color={COLORS.expenses.primary} isVisible={toggles.expenses} width={dims.width} height={dims.height} />
          <SingleChartLine points={points} dataKey="transactions" color={COLORS.transactions.primary} isVisible={toggles.transactions} width={dims.width} height={dims.height} />
          <SingleChartLine points={points} dataKey="activeUsers" color={COLORS.activeUsers.primary} isVisible={toggles.activeUsers} width={dims.width} height={dims.height} />
        </Svg>
      </View>

      <View style={styles.controlsContainer}>
        {Object.entries(COLORS).map(([key, cfg]) => (
          <TouchableOpacity
            key={key}
            activeOpacity={0.75}
            onPress={() => setToggles((p) => ({ ...p, [key]: !p[key as keyof typeof p] }))}
            style={[
              styles.toggleButton,
              { backgroundColor: toggles[key as keyof typeof toggles] ? cfg.primary : '#2A2A2A' },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: cfg.primary }]} />
            <Text style={[styles.toggleText, { color: toggles[key as keyof typeof toggles] ? '#fff' : '#aaa' }]}>
              {cfg.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#121212',
    padding: 12,
    borderRadius: 18,
  },
  chartContainer: {
    height: CHART_HEIGHT,
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
    marginBottom: 12,
  },
  controlsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10 as any,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  toggleText: { fontWeight: '700', fontSize: 12 },
});
