import { z } from 'zod';

/**
 * Represents a product event detected in a video
 * Contains information about brand, product, timeline, and location
 */
export interface ProductEvent {
  video_id: string;
  creator_id?: string;
  brand: string;
  product_name: string;
  price?: string;
  timeline_start: number;
  timeline_end: number;
  bbox_norm: {
    x: number; // x position as percentage (0-100)
    y: number; // y position as percentage (0-100)
    w: number; // width as percentage (0-100)
    h: number; // height as percentage (0-100)
  };
  description?: string;
  source: 'analyze';
}

/**
 * Zod schema for validating ProductEvent objects
 */
export const ProductEventSchema = z.object({
  video_id: z.string(),
  creator_id: z.string().optional(),
  brand: z.string(),
  product_name: z.string(),
  price: z.string().optional(),
  timeline_start: z.number().nonnegative(),
  timeline_end: z.number().nonnegative(),
  bbox_norm: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().min(0).max(100),
    h: z.number().min(0).max(100)
  }),
  description: z.string().optional(),
  source: z.literal('analyze')
});

/**
 * Schema for validating arrays of ProductEvent objects
 */
export const ProductEventArraySchema = z.array(ProductEventSchema);

/**
 * Filter for brands and product names
 */
export type BrandAssetFilter = {
  brands?: string[];
  products?: string[];
};

/**
 * Filter for time windows within videos
 */
export type TimeWindowFilter = {
  start?: number;
  end?: number;
};

/**
 * Combined filters for querying product events
 */
export interface EventFilters {
  brandAsset?: BrandAssetFilter;
  durationMinSec?: number;
  timeWindow?: TimeWindowFilter;
  format?: 'vertical' | 'horizontal' | 'any';
  region?: string[];
  creators?: string[];
}

/**
 * Represents a time bucket in the heatmap with a value
 */
export type HeatmapBucket = {
  start: number;
  end: number;
  value: number;
};

/**
 * Represents a row in the per-video heatmap view
 */
export type PerVideoHeatmapRow = {
  key: string;
  label: string;
  buckets: HeatmapBucket[];
};

/**
 * Represents a row in the library/multi-video heatmap view
 */
export type LibraryHeatmapRow = {
  video_id: string;
  buckets: HeatmapBucket[];
};

/**
 * Video analysis metadata for tones, styles, and creator information
 */
export interface VideoAnalysisMetadata {
  tones?: string[];
  styles?: string[];
  creator?: string;
}

/**
 * Zod schema for validating VideoAnalysisMetadata
 */
export const VideoAnalysisMetadataSchema = z.object({
  tones: z.array(z.string()).optional(),
  styles: z.array(z.string()).optional(),
  creator: z.string().optional()
});
