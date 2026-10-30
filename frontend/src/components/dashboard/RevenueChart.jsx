import React, { useState } from 'react';
import formatCurrency from '../../utils/formatCurrency';
import { FiTrendingUp, FiCalendar } from 'react-icons/fi';

export const RevenueChart = ({ 
  data = [], 
  period = 'Weekly',
  onPeriodChange,
  totalRevenue,
  percentageChange,
  comparison
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const formatShortCurrency = (val) => {
    if (val === 0) return '₹0';
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)}k`;
    return `₹${val}`;
  };

  const chartData = (data || []).map(d => ({
    sales: d.sales !== undefined ? d.sales : (d.value !== undefined ? d.value : 0),
    label: d.label !== undefined ? d.label : (d.day !== undefined ? d.day : ''),
    count: d.count || 0
  }));

  const maxSales = Math.max(...chartData.map(d => d.sales), 1);
  const totalSales = totalRevenue !== undefined 
    ? totalRevenue 
    : chartData.reduce((sum, item) => sum + item.sales, 0);

  // Find highest sales slot
  const peakItem = chartData.reduce((max, item) => (item.sales > (max?.sales || 0) ? item : max), chartData[0]);

  // SVG dimensions for responsive coordinate space
  const svgWidth = 600;
  const svgHeight = 200;
  const paddingX = 40;
  const paddingY = 25;

  const innerWidth = svgWidth - paddingX * 2;
  const innerHeight = svgHeight - paddingY * 2;

  const points = chartData.map((d, index) => {
    const x = paddingX + (chartData.length > 1 ? (index / (chartData.length - 1)) * innerWidth : innerWidth / 2);
    const y = maxSales > 0 ? (svgHeight - paddingY) - (d.sales / maxSales) * innerHeight : svgHeight - paddingY;
    return { x, y, ...d, index };
  });

  const generateCurvedPath = (pts) => {
    if (!pts || pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const curveLine = generateCurvedPath(points);
  const baselineY = svgHeight - paddingY;
  const areaPath = points.length > 1 
    ? `${curveLine} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
    : '';

  return (
    <div 
      className="card border rounded-4 shadow-sm p-4 h-100 position-relative"
      style={{ 
        backgroundColor: 'var(--surface-color)', 
        borderColor: 'var(--border-color)' 
      }}
    >
      {/* Header with Title and Period Dropdown */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h5 className="fw-bold text-dark mb-0" style={{ fontSize: '16px' }}>Sales Overview</h5>
            {percentageChange && (
              <span className={`badge rounded-pill px-2.5 py-1 fw-bold ${
                percentageChange.startsWith('+') ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
              }`} style={{ fontSize: '11px' }}>
                <FiTrendingUp className="me-1" />
                {percentageChange}
              </span>
            )}
          </div>
          <p className="text-secondary small mb-0 mt-1" style={{ fontSize: '12px' }}>
            {period === 'Today' ? "Today's Revenue" : period === 'Weekly' ? "Weekly Revenue" : period === 'Monthly' ? "Monthly Revenue" : period === 'Quarterly' ? "Quarterly Revenue" : period === 'Yearly' ? "Yearly Revenue" : "Period Revenue"}: <span className="fw-bold text-dark">{formatCurrency(totalSales)}</span>
            {comparison ? ` (${comparison})` : ''}
          </p>
        </div>

        {/* Dropdown Selector */}
        <div className="d-flex align-items-center gap-2">
          <div className="position-relative">
            <select
              value={period}
              onChange={(e) => onPeriodChange && onPeriodChange(e.target.value)}
              className="form-select form-select-sm rounded-pill fw-semibold text-secondary"
              style={{
                minWidth: '150px',
                height: '38px',
                fontSize: '12px',
                cursor: 'pointer',
                paddingLeft: '16px',
                paddingRight: '36px',
                backgroundColor: 'var(--surface-muted)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)'
              }}
              aria-label="Sales Overview Period Selector"
            >
              <option value="Weekly">Weekly (7 Days)</option>
              <option value="Today">Today (Hourly)</option>
              <option value="Monthly">Monthly (Weeks)</option>
              <option value="Quarterly">Quarterly (Months)</option>
              <option value="Yearly">Yearly (Quarters)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Top Highlights Banner */}
      {peakItem && peakItem.sales > 0 && (
        <div 
          className="d-flex align-items-center justify-content-between px-3 py-2 rounded-3 mb-3" 
          style={{ backgroundColor: 'var(--primary-subtle)', border: '1px solid rgba(200, 16, 46, 0.2)' }}
        >
          <span className="small text-danger fw-semibold" style={{ fontSize: '11.5px' }}>
            🔥 Peak: <strong>{peakItem.label}</strong> with <strong>{formatCurrency(peakItem.sales)}</strong>
          </span>
          <span className="badge rounded-pill px-2 py-0.5" style={{ fontSize: '10px', backgroundColor: 'var(--primary-color)', color: '#fff' }}>
            Highest Sales
          </span>
        </div>
      )}

      {/* SVG Smooth Curve Area Chart */}
      <div className="position-relative w-100" style={{ height: '240px' }}>
        <svg 
          viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
          className="w-100 h-100 overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="foodieCurveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C8102E" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#C8102E" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background Grid Lines */}
          <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="var(--border-subtle)" strokeDasharray="3 3" strokeWidth="1" />
          <line x1={paddingX} y1={paddingY + innerHeight / 2} x2={svgWidth - paddingX} y2={paddingY + innerHeight / 2} stroke="var(--border-subtle)" strokeDasharray="3 3" strokeWidth="1" />
          <line x1={paddingX} y1={baselineY} x2={svgWidth - paddingX} y2={baselineY} stroke="var(--border-color)" strokeWidth="1.5" />

          {/* Area Fill */}
          {areaPath && (
            <path d={areaPath} fill="url(#foodieCurveGradient)" />
          )}

          {/* Smooth Red Curve Stroke */}
          {curveLine && (
            <path 
              d={curveLine} 
              fill="none" 
              stroke="#C8102E" 
              strokeWidth="3.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
          )}

          {/* Interactive Data Points */}
          {points.map((pt, idx) => {
            const isHovered = hoveredIndex === idx;
            const isPeak = pt.sales > 0 && pt.sales === peakItem?.sales;

            return (
              <g key={idx} className="cursor-pointer">
                {/* Invisible larger hit area for hover */}
                <circle 
                  cx={pt.x} 
                  cy={pt.y} 
                  r="16" 
                  fill="transparent" 
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ cursor: 'pointer' }}
                />
                
                {/* Visible Data Point Dot */}
                <circle 
                  cx={pt.x} 
                  cy={pt.y} 
                  r={isHovered ? 7 : (isPeak ? 5 : 4)} 
                  fill={isHovered || isPeak ? '#C8102E' : 'var(--surface-color)'}
                  stroke="#C8102E"
                  strokeWidth={isHovered ? 3 : 2}
                  style={{ transition: 'all 0.2s ease', pointerEvents: 'none' }}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <div 
            className="position-absolute shadow-lg rounded-3 py-1.5 px-3 text-white"
            style={{ 
              left: `${(points[hoveredIndex].x / svgWidth) * 100}%`,
              top: `${(points[hoveredIndex].y / svgHeight) * 100 - 15}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: 10,
              whiteSpace: 'nowrap',
              fontSize: '11px',
              backgroundColor: '#1E293B',
              pointerEvents: 'none',
              animation: 'fadeIn 0.15s ease'
            }}
          >
            <div className="fw-semibold text-white-50" style={{ fontSize: '10px' }}>{points[hoveredIndex].label}</div>
            <div className="fw-bold text-white" style={{ fontSize: '13px' }}>{formatCurrency(points[hoveredIndex].sales)}</div>
            {points[hoveredIndex].count > 0 && (
              <div className="text-warning small" style={{ fontSize: '10px' }}>{points[hoveredIndex].count} orders</div>
            )}
          </div>
        )}

        {/* X-Axis Labels */}
        <div className="d-flex justify-content-between px-2 pt-2">
          {chartData.map((d, i) => (
            <span 
              key={i} 
              className={`small text-center ${hoveredIndex === i ? 'fw-bold text-danger' : 'text-secondary'}`}
              style={{ fontSize: '11px', flex: 1 }}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RevenueChart;
