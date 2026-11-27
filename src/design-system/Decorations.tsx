import Svg, { Circle, Line, Path } from 'react-native-svg';
import { StyleSheet } from 'react-native';

/** Circuit-line motif echoing the logo mark, for dark gradient backgrounds. */
export function CircuitPattern() {
  return (
    <Svg width={220} height={220} viewBox="0 0 220 220" style={styles.topLeft}>
      <Line x1="0" y1="40" x2="70" y2="40" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={2} />
      <Line
        x1="70"
        y1="40"
        x2="100"
        y2="70"
        stroke="#FFFFFF"
        strokeOpacity={0.25}
        strokeWidth={2}
      />
      <Line
        x1="100"
        y1="70"
        x2="160"
        y2="70"
        stroke="#FFFFFF"
        strokeOpacity={0.25}
        strokeWidth={2}
      />
      <Line x1="0" y1="90" x2="45" y2="90" stroke="#FFFFFF" strokeOpacity={0.2} strokeWidth={2} />
      <Line x1="45" y1="90" x2="75" y2="120" stroke="#FFFFFF" strokeOpacity={0.2} strokeWidth={2} />
      <Line
        x1="0"
        y1="150"
        x2="30"
        y2="150"
        stroke="#FFFFFF"
        strokeOpacity={0.15}
        strokeWidth={2}
      />
      <Circle cx="70" cy="40" r="4" fill="#FFFFFF" fillOpacity={0.35} />
      <Circle cx="100" cy="70" r="4" fill="#FFFFFF" fillOpacity={0.35} />
      <Circle cx="160" cy="70" r="4" fill="#FFFFFF" fillOpacity={0.35} />
      <Circle cx="45" cy="90" r="4" fill="#FFFFFF" fillOpacity={0.3} />
      <Circle cx="75" cy="120" r="4" fill="#FFFFFF" fillOpacity={0.3} />
      <Circle cx="30" cy="150" r="4" fill="#FFFFFF" fillOpacity={0.25} />
    </Svg>
  );
}

/** Connected-network motif for the bottom of dark gradient screens. */
export function NetworkPattern() {
  const dots = Array.from({ length: 36 }, (_, index) => {
    const col = index % 9;
    const row = Math.floor(index / 9);
    return { cx: 12 + col * 22, cy: 12 + row * 22 };
  });

  return (
    <Svg
      width="100%"
      height={220}
      viewBox="0 0 400 220"
      style={styles.bottom}
      preserveAspectRatio="xMidYMax slice"
    >
      {dots.map((dot) => (
        <Circle
          key={`${dot.cx}-${dot.cy}`}
          cx={dot.cx}
          cy={dot.cy}
          r="1.4"
          fill="#FFFFFF"
          fillOpacity={0.18}
        />
      ))}

      <Path
        d="M 40 160 Q 130 60 220 150 T 380 110"
        stroke="#7CC342"
        strokeOpacity={0.5}
        strokeWidth={1.5}
        fill="none"
      />
      <Path
        d="M 10 120 Q 90 190 190 170 T 360 190"
        stroke="#FFFFFF"
        strokeOpacity={0.25}
        strokeWidth={1.5}
        fill="none"
      />

      <Circle cx="40" cy="160" r="4" fill="#7CC342" fillOpacity={0.9} />
      <Circle cx="220" cy="150" r="4" fill="#7CC342" fillOpacity={0.9} />
      <Circle cx="380" cy="110" r="4" fill="#7CC342" fillOpacity={0.9} />
      <Circle cx="190" cy="170" r="3" fill="#FFFFFF" fillOpacity={0.6} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  topLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});
