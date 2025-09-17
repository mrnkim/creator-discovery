import React from 'react';
import clsx from 'clsx';

interface Bucket {
  start: number;
  end: number;
  value: number;
}

interface HeatmapRow {
  id: string;
  label?: string;
  buckets: Bucket[];
}

interface HeatmapProps {
  rows: HeatmapRow[];
  columns: number;
  onCellClick?: (rowId: string, colIndex: number) => void;
  className?: string;
  colorHue?: number; // Optional hue value for HSL color (default: 210 - blue)
}

/**
 * Heatmap component for visualizing time-based data intensity
 *
 * Renders a grid with rows representing entities (brands, products, videos)
 * and columns representing time buckets. Cell color intensity indicates value.
 */
const Heatmap: React.FC<HeatmapProps> = ({
  rows,
  columns,
  onCellClick,
  className,
  colorHue = 210, // Default to blue
}) => {
  // Function to find which bucket corresponds to a column index
  const findBucketForColumn = (buckets: Bucket[], colIndex: number): Bucket | null => {
    const normalizedPosition = colIndex / columns;
    const position = normalizedPosition * 100; // As percentage

    return buckets.find(bucket => {
      // Check if position falls within bucket range
      return position >= bucket.start && position <= bucket.end;
    }) || null;
  };

  // Function to normalize values per row and get color
  const getColorForValue = (value: number, maxValue: number): string => {
    if (maxValue === 0) return `hsl(${colorHue}, 100%, 95%)`; // Very light for zero values

    // Normalize value between 0 and 1
    const normalizedValue = Math.min(value / maxValue, 1);

    // Map to lightness: 95% (very light) to 40% (darker)
    const lightness = 95 - (normalizedValue * 55);

    return `hsl(${colorHue}, 100%, ${lightness}%)`;
  };

  return (
    <div className={clsx('w-full overflow-x-auto', className)}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `160px repeat(${columns}, 1fr)`,
        }}
        role="grid"
        aria-label="Heatmap visualization"
      >
        {/* Header row with column numbers */}
        <div className="bg-gray-100 p-2 font-medium text-sm border-b border-r border-gray-200" role="columnheader">
          {/* Empty cell for top-left corner */}
        </div>

        {/* Column headers */}
        {Array.from({ length: columns }).map((_, colIndex) => (
          <div
            key={`col-${colIndex}`}
            className="bg-gray-100 p-1 text-xs text-center border-b border-r border-gray-200"
            role="columnheader"
          >
            {Math.round((colIndex / columns) * 100)}%
          </div>
        ))}

        {/* Data rows */}
        {rows.map((row) => {
          // Find max value in this row for normalization
          const maxValue = Math.max(...row.buckets.map(b => b.value), 0.1); // Avoid division by zero

          return (
            <React.Fragment key={row.id}>
              {/* Row label */}
              <div
                className="p-2 font-medium text-sm border-b border-r border-gray-200 truncate"
                role="rowheader"
                title={row.label || row.id}
              >
                {row.label || row.id}
              </div>

              {/* Row cells */}
              {Array.from({ length: columns }).map((_, colIndex) => {
                // Direct index mapping instead of using findBucketForColumn
                const bucket = row.buckets[colIndex];
                const value = bucket?.value || 0;
                const backgroundColor = getColorForValue(value, maxValue);

                return (
                  <div
                    key={`${row.id}-${colIndex}`}
                    className={clsx(
                      'border-b border-r border-gray-200',
                      onCellClick ? 'cursor-pointer hover:opacity-80' : ''
                    )}
                    style={{ backgroundColor }}
                    role="gridcell"
                    onClick={() => onCellClick?.(row.id, colIndex)}
                    aria-label={`Value ${value} at position ${colIndex}`}
                    title={bucket ? `Value: ${value} (${bucket.start}% - ${bucket.end}%)` : 'No data'}
                    tabIndex={onCellClick ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (onCellClick && (e.key === 'Enter' || e.key === ' ')) {
                        onCellClick(row.id, colIndex);
                        e.preventDefault();
                      }
                    }}
                  >
                    <div className="w-full h-8"></div>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default Heatmap;
