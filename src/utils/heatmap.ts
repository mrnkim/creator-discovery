import { ProductEvent, PerVideoHeatmapRow, LibraryHeatmapRow, HeatmapBucket } from '@/types/brandMentions';

/**
 * Creates an array of time buckets as percentages of total duration
 * @param totalDuration Total duration in seconds
 * @param numBuckets Number of buckets to create
 * @returns Array of buckets with start and end percentages (0-100)
 */
export function bucketizeTimeline(totalDuration: number, numBuckets: number): { start: number; end: number }[] {
  if (numBuckets <= 0) {
    throw new Error('Number of buckets must be greater than zero');
  }

  const buckets: { start: number; end: number }[] = [];
  const bucketSize = 100 / numBuckets;

  for (let i = 0; i < numBuckets; i++) {
    const start = i * bucketSize;
    const end = (i + 1) * bucketSize;
    buckets.push({ start, end });
  }

  return buckets;
}

/**
 * Calculates the overlap duration between an event and a time bucket
 * @param eventStart Event start time in seconds
 * @param eventEnd Event end time in seconds
 * @param bucketStart Bucket start time in seconds
 * @param bucketEnd Bucket end time in seconds
 * @returns Overlap duration in seconds
 */
function calculateOverlap(
  eventStart: number,
  eventEnd: number,
  bucketStart: number,
  bucketEnd: number
): number {
  return Math.max(0, Math.min(eventEnd, bucketEnd) - Math.max(eventStart, bucketStart));
}

/**
 * Aggregates product events by brand or product for a single video
 * @param events Array of product events
 * @param numBuckets Number of buckets to create
 * @param by Group by 'brand' or 'product'
 * @returns Array of heatmap rows with bucket values
 */
export function aggregatePerVideo(
  events: ProductEvent[],
  numBuckets: number,
  by: 'brand' | 'product' = 'brand',
  videoDuration?: number
): PerVideoHeatmapRow[] {
  if (!events || events.length === 0) {
    return [];
  }

  // Use provided duration or find from the latest event end time
  const duration = videoDuration || Math.max(...events.map(event => event.timeline_end));

  if (duration <= 0) {
    return [];
  }

  // Create time buckets in seconds
  const bucketDuration = duration / numBuckets;
  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
    startSec: i * bucketDuration,
    endSec: (i + 1) * bucketDuration,
    startPct: (i * bucketDuration / duration) * 100,
    endPct: ((i + 1) * bucketDuration / duration) * 100
  }));

  // Group events by brand or product
  const groupedEvents: Record<string, ProductEvent[]> = {};

  events.forEach(event => {
    const key = by === 'brand' ? event.brand : event.product_name;
    if (!groupedEvents[key]) {
      groupedEvents[key] = [];
    }
    groupedEvents[key].push(event);
  });

  // Create heatmap rows
  const rows: PerVideoHeatmapRow[] = [];

  Object.entries(groupedEvents).forEach(([key, groupEvents]) => {
    const heatmapBuckets: HeatmapBucket[] = buckets.map(bucket => {
      // Calculate total overlap duration for all events in this group with this bucket
      let value = 0;

      groupEvents.forEach(event => {
        const overlap = calculateOverlap(
          event.timeline_start,
          event.timeline_end,
          bucket.startSec,
          bucket.endSec
        );
        value += overlap;
      });

      return {
        start: bucket.startPct,
        end: bucket.endPct,
        value
      };
    });

    rows.push({
      key,
      label: key,
      buckets: heatmapBuckets
    });
  });

  // Sort rows by total exposure (sum of bucket values) in descending order
  return rows.sort((a, b) => {
    const sumA = a.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    const sumB = b.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    return sumB - sumA;
  });
}

/**
 * Aggregates product events across multiple videos for a library view
 * @param videoDurations Record of video durations by video ID
 * @param eventsByVideo Record of events by video ID
 * @param numBuckets Number of buckets to create
 * @param brandFilter Optional array of brands to filter by
 * @returns Array of library heatmap rows
 */
export function aggregateLibrary(
  videoDurations: Record<string, number>,
  eventsByVideo: Record<string, ProductEvent[]>,
  numBuckets: number,
  brandFilter?: string[]
): LibraryHeatmapRow[] {
  const videoIds = Object.keys(eventsByVideo);

  if (videoIds.length === 0) {
    return [];
  }

  // Create normalized buckets (0-100%)
  const normalizedBuckets = bucketizeTimeline(100, numBuckets);

  // Process each video
  return videoIds.map(videoId => {
    const events = eventsByVideo[videoId] || [];
    const duration = videoDurations[videoId] || 0;

    if (duration <= 0 || events.length === 0) {
      // Return empty buckets if no duration or events
      return {
        video_id: videoId,
        buckets: normalizedBuckets.map(bucket => ({
          start: bucket.start,
          end: bucket.end,
          value: 0
        }))
      };
    }

    // Filter events by brand if brandFilter is provided
    const filteredEvents = brandFilter && brandFilter.length > 0
      ? events.filter(event => brandFilter.includes(event.brand))
      : events;

    // Map normalized buckets to actual video time and calculate values
    const buckets: HeatmapBucket[] = normalizedBuckets.map(bucket => {
      // Convert percentage to seconds for this video
      const startSec = (bucket.start / 100) * duration;
      const endSec = (bucket.end / 100) * duration;

      // Calculate total overlap duration for all events in this bucket
      let totalOverlap = 0;

      filteredEvents.forEach(event => {
        const overlap = calculateOverlap(
          event.timeline_start,
          event.timeline_end,
          startSec,
          endSec
        );
        totalOverlap += overlap;
      });

      return {
        start: bucket.start,
        end: bucket.end,
        value: totalOverlap
      };
    });

    return {
      video_id: videoId,
      buckets
    };
  }).sort((a, b) => {
    // Sort by total exposure in descending order
    const sumA = a.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    const sumB = b.buckets.reduce((sum, bucket) => sum + bucket.value, 0);
    return sumB - sumA;
  });
}

/**
 * Normalizes bucket values to a 0-1 scale for consistent visualization
 * @param rows Array of heatmap rows (either PerVideoHeatmapRow or LibraryHeatmapRow)
 * @returns Same array with normalized values
 */
export function normalizeHeatmapValues<T extends { buckets: HeatmapBucket[] }>(rows: T[]): T[] {
  if (rows.length === 0) return rows;

  // Find the maximum value across all buckets
  let maxValue = 0;
  rows.forEach(row => {
    row.buckets.forEach(bucket => {
      maxValue = Math.max(maxValue, bucket.value);
    });
  });

  if (maxValue === 0) return rows;

  // Create a deep copy and normalize values
  return rows.map(row => ({
    ...row,
    buckets: row.buckets.map(bucket => ({
      ...bucket,
      value: bucket.value / maxValue
    }))
  }));
}
