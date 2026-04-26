export default function CircularProgress({ percentage, color, size = 56 }) {
  const stroke = 5
  const radius = (size - stroke * 2) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#e5e7eb" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
      />
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="central"
        style={{
          transform: 'rotate(90deg)',
          transformOrigin: '50% 50%',
          fontSize: size * 0.22,
          fontWeight: 700,
          fill: color,
        }}
      >
        {percentage}%
      </text>
    </svg>
  )
}
