import React, { useEffect, useRef, useState } from 'react';
import { VideoData } from '@/types';
import Hls from 'hls.js';

interface VideoModalProps {
  videoUrl: string;
  videoId: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  searchScore?: number;
  textScore?: number;
  videoScore?: number;
  originalSource?: 'TEXT' | 'VIDEO' | 'BOTH';
  contentMetadata?: VideoData;
  startTime?: number;
  endTime?: number;
  description?: string;
  location?: string;
  videoDetails?: VideoData;
  indexId?: string;
  confidence?: string;
  score?: number;
}

// Helper function to format seconds to MM:SS
const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Helper function to get creator name
const getCreatorName = (videoData: VideoData | undefined): string | null => {
  if (!videoData || !videoData.user_metadata) return null;

  const creator = videoData.user_metadata.creator ||
                 videoData.user_metadata.video_creator ||
                 videoData.user_metadata.creator_id;

  if (creator && typeof creator === 'string' && creator.trim().length > 0) {
    return creator.trim();
  }

  return null;
};

// Helper function to get brand name
const getBrandName = (videoData: VideoData | undefined): string | null => {
  if (!videoData || !videoData.user_metadata) return null;

  try {
    // Extract first brand from brand_product_events
    if (videoData.user_metadata.brand_product_events) {
      const events = JSON.parse(videoData.user_metadata.brand_product_events as string) as unknown[];
      if (Array.isArray(events) && events.length > 0) {
        const firstEvent = events[0];
        if (firstEvent && typeof firstEvent === 'object' && 'brand' in firstEvent && typeof (firstEvent as { brand: unknown; }).brand === 'string') {
          const brand = String((firstEvent as { brand: string; }).brand).trim();
          if (brand.length > 0) {
            return brand;
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to parse brand_product_events:', error);
  }

  return null;
};

// Helper function to get styles
const getStyles = (videoData: VideoData | undefined): string[] => {
  if (!videoData || !videoData.user_metadata) return [];

  try {
    if (videoData.user_metadata.styles) {
      const styles = videoData.user_metadata.styles;
      if (Array.isArray(styles)) {
        return styles.filter(style => typeof style === 'string' && style.trim().length > 0);
      } else if (typeof styles === 'string') {
        // Handle comma-separated string
        return styles.split(',').map(s => s.trim()).filter(s => s.length > 0);
      }
    }
  } catch (error) {
    console.warn('Failed to parse styles:', error);
  }

  return [];
};

// Helper function to get tones
const getTones = (videoData: VideoData | undefined): string[] => {
  if (!videoData || !videoData.user_metadata) return [];

  try {
    if (videoData.user_metadata.tones) {
      const tones = videoData.user_metadata.tones;
      if (Array.isArray(tones)) {
        return tones.filter(tone => typeof tone === 'string' && tone.trim().length > 0);
      } else if (typeof tones === 'string') {
        // Handle comma-separated string
        return tones.split(',').map(t => t.trim()).filter(t => t.length > 0);
      }
    }
  } catch (error) {
    console.warn('Failed to parse tones:', error);
  }

  return [];
};

// Helper function to get all other tags from user_metadata (excluding styles, tones, brands)
const getOtherTags = (videoData: VideoData | undefined): string[] => {
  if (!videoData || !videoData.user_metadata) return [];

  try {
    // Extract brands from brand_product_events
    const brands = new Set<string>();
    if (videoData.user_metadata.brand_product_events) {
      try {
        const events = JSON.parse(videoData.user_metadata.brand_product_events as string) as unknown[];
        if (Array.isArray(events)) {
          events.forEach((event: unknown) => {
            if (event && typeof event === 'object' && 'brand' in event && typeof (event as { brand: unknown; }).brand === 'string') {
              brands.add(String((event as { brand: string; }).brand).trim());
            }
          });
        }
      } catch (error) {
        console.warn('Failed to parse brand_product_events:', error);
      }
    }

    const allTags = Object.entries(videoData.user_metadata)
      .filter(([key, value]) => {
        // Filter out certain keys and null/undefined values
        const excludeKeys = ['source', 'brand_product_events', 'analysis', 'brand_product_analyzed_at', 'brand_product_source', 'styles', 'tones', 'creator', 'video_creator', 'creator_id'];
        return !excludeKeys.includes(key) && value != null;
      })
      .flatMap(([, value]) => {
        // Handle different data types properly
        let processedValue: string[] = [];

        if (typeof value === 'string') {
          // Check if it's a JSON string
          if (value.startsWith('[') && value.endsWith(']')) {
            try {
              const parsedArray = JSON.parse(value);
              if (Array.isArray(parsedArray)) {
                processedValue = parsedArray
                  .filter(item => typeof item === 'string' && item.trim().length > 0)
                  .map(item => item.trim());
              }
            } catch {
              console.warn('Failed to parse JSON array:', value);
              // Fall back to treating as comma-separated string
              processedValue = value.split(',').map(item => item.trim()).filter(item => item.length > 0);
            }
          } else if (value.startsWith('{') && value.endsWith('}')) {
            // Skip JSON objects - they're too complex for pills
            return [];
          } else {
            // Regular string - split by commas
            processedValue = value.split(',').map(item => item.trim()).filter(item => item.length > 0);
          }
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          processedValue = [value.toString()];
        } else if (Array.isArray(value)) {
          // Handle arrays directly
          processedValue = value
            .filter(item => item != null)
            .map(item => typeof item === 'string' ? item.trim() : String(item))
            .filter(item => item.length > 0);
        } else if (typeof value === 'object') {
          // Skip complex objects that shouldn't be displayed as tags
          return [];
        } else {
          processedValue = [String(value)];
        }

        // Skip if no valid values
        if (processedValue.length === 0) {
          return [];
        }

        return processedValue
          .map((tag: string) => {
            // Trim and validate each tag
            const trimmedTag = tag.trim();
            if (trimmedTag.length === 0 || trimmedTag.length > 50) {
              return ''; // Skip empty or overly long tags
            }

            // Filter out unwanted tags (case insensitive)
            const lowerTag = trimmedTag.toLowerCase();
            const unwantedPatterns = [
              'not explicitly visible',
              'not explicitly',
              'explicitly visible',
              'none',
              'not visible'
            ];

            if (unwantedPatterns.some(pattern => lowerTag.includes(pattern))) {
              return ''; // Skip unwanted tags
            }

            // Properly capitalize - first lowercase everything then capitalize first letter of each word
            const properlyCapitalized = trimmedTag
              .toLowerCase()
              .split(' ')
              .map((word: string) => {
                if (word.length === 0) return word;
                return word.charAt(0).toUpperCase() + word.slice(1);
              })
              .join(' ');

            return properlyCapitalized;
          })
          .filter((tag: string) => tag !== '');
      })
      .filter(tag => tag.length > 0) // Remove any empty tags
      .slice(0, 10); // Limit to 10 tags maximum to prevent UI overflow

    // Add brands to tags (brands first)
    const brandTags = Array.from(brands).map(brand => brand.trim()).filter(brand => brand.length > 0);

    // Filter out unwanted tags from all tags (including brands)
    const unwantedPatterns = [
      'not explicitly visible',
      'not explicitly',
      'explicitly visible',
      'none',
      'not visible'
    ];

    const filteredBrandTags = brandTags.filter(tag =>
      !unwantedPatterns.some(pattern => tag.toLowerCase().includes(pattern))
    );

    const filteredAllTags = allTags.filter(tag =>
      !unwantedPatterns.some(pattern => tag.toLowerCase().includes(pattern))
    );

    const combinedTags = [...filteredBrandTags, ...filteredAllTags].slice(0, 10); // Limit to 10 tags total

    return combinedTags;
  } catch (error) {
    console.error('❌ Error getting tags for video:', videoData?._id, error);
    return [];
  }
};

// Helper function to get confidence color
const getConfidenceColor = (confidence: string): string => {
  switch (confidence.toLowerCase()) {
    case 'high':
      return '#30710d';
    case 'medium':
      return '#826213';
    case 'low':
      return '#484746';
    default:
      return '#30710d';
  }
};

const VideoModalSimple: React.FC<VideoModalProps> = ({
  videoUrl,
  isOpen,
  onClose,
  title,
  startTime,
  endTime,
  description,
  location,
  videoDetails,
  indexId,
  confidence,
  score,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true); // Start muted by default
  const [volume, setVolume] = useState<number>(1); // Volume state
  const videoRef = useRef<HTMLVideoElement>(null);




  // Initialize isPlaying when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      // Reset audio state when modal closes
      setIsMuted(true);
      setVolume(1);
    }
  }, [isOpen]);

  // Handle HLS video loading
  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    const video = videoRef.current;
    const isHLS = videoUrl.includes('.m3u8');

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
      };
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = videoUrl;
    } else if (!isHLS) {
      video.src = videoUrl;
    }
  }, [isOpen, videoUrl]);

  // Seek to startTime when metadata is available or when startTime changes
  useEffect(() => {
    if (!isOpen) return;
    if (startTime === undefined || startTime === null) return;
    const video = videoRef.current;
    if (!video) return;

    const seekToStart = () => {
      try {
        video.currentTime = startTime;
      } catch (err) {
        console.error('Failed to seek to startTime', err);
      }
    };

    // Use a small delay to ensure the video is ready
    const timer = setTimeout(seekToStart, 100);
    return () => clearTimeout(timer);
  }, [isOpen, startTime, videoUrl]);



  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative rounded-[45.60px] shadow-xl max-w-3xl w-full flex flex-col overflow-hidden bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="m-2 ml-4 p-4 flex justify-between items-start">
          <div className="flex-1">
            {/* Title with Brand/Creator info before title */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {/* Brand/Creator info as plain text before title */}
              {(() => {
                const typeText = indexId === process.env.NEXT_PUBLIC_BRAND_INDEX_ID ? 'Brand' : 'Creator';
                const creatorName = getCreatorName(videoDetails);
                const brandName = getBrandName(videoDetails);

                // Always show if we have indexId, even without names
                if (indexId) {
                  const nameText = creatorName || brandName || 'Unknown';
                  return (
                    <span className="text-sm">
                      {typeText} | {nameText}
                    </span>
                  );
                }
                return null;
              })()}

              <h3 className="text-2xl font-medium">
                {title?.includes(':') ? `${title.split(':')[0]} | ${title.split(':')[1]?.trim()}` : title}
              </h3>
            </div>

            {description && (
              <div className="text-sm mb-2">
                {description}
              </div>
            )}

            {/* Tags Section - Reorganized */}
            <div className="mt-1 pb-1">

              {/* Second line: Confidence and Score */}
              <div className="flex flex-wrap gap-2 mb-2">
                {/* Confidence Tag - only show for search results */}
                {confidence && (
                  <div
                    className="inline-block flex-shrink-0 rounded-full px-3 py-1 text-sm text-white"
                    style={{ backgroundColor: getConfidenceColor(confidence) }}
                  >
                    {confidence.toUpperCase()}
                  </div>
                )}

                {/* Score as plain text - only show for search results */}
                {score !== undefined && (
                  <span className="text-sm">
                    Score: {score.toFixed(2)}
                  </span>
                )}
              </div>

              {/* Third line: All other tags */}
              <div className="flex flex-wrap gap-2">
                {/* Styles Tags */}
                {getStyles(videoDetails).map((style, idx) => (
                  <div
                    key={`style-${idx}`}
                    className="inline-block flex-shrink-0 bg-gray-100 border border-black rounded-full px-3 py-1 text-sm text-black hover:bg-gray-200 transition-colors"
                  >
                    {style}
                  </div>
                ))}

                {/* Tones Tags */}
                {getTones(videoDetails).map((tone, idx) => (
                  <div
                    key={`tone-${idx}`}
                    className="inline-block flex-shrink-0 bg-gray-100 border border-black rounded-full px-3 py-1 text-sm text-black hover:bg-gray-200 transition-colors"
                  >
                    {tone}
                  </div>
                ))}

                {/* Other tags from user_metadata */}
                {getOtherTags(videoDetails).map((tag, idx) => (
                  <div
                    key={`tag-${idx}`}
                    className="inline-block flex-shrink-0 bg-gray-100 border border-black rounded-full px-3 py-1 text-sm text-black hover:bg-gray-200 transition-colors"
                  >
                    {tag}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer ml-4"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative w-full px-6 pb-10 overflow-auto flex-grow">
        <div className="relative w-full aspect-[16/9] overflow-hidden rounded-[45.60px]">
        {/* Video Player */}
        <video
    ref={videoRef}
    controls
    autoPlay={isPlaying}
    muted={isMuted}
    playsInline
    className="absolute top-0 left-0 w-full h-full object-contain"
    onPlay={() => setIsPlaying(true)}
    onPause={() => setIsPlaying(false)}
    onVolumeChange={(e) => {
      const video = e.currentTarget;
      setVolume(video.volume);
      setIsMuted(video.muted);
    }}
    onTimeUpdate={(e) => {
      const video = e.currentTarget;
      if (endTime !== undefined && video.currentTime >= endTime) {
        video.currentTime = startTime || 0;
      }
      if (startTime !== undefined && video.currentTime < startTime) {
        video.currentTime = startTime;
      }
    }}
    onError={(error) => {
      console.error('Video error:', error);
      const video = error.currentTarget;
      console.error('Video error details:', {
        error: video.error,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.src
      });
    }}
    controlsList="nodownload"
  />

          {/* Segment overlay on video */}
          {(startTime !== undefined || endTime !== undefined) && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/40 rounded-lg px-3 py-1 shadow-lg border border-white">
              <div className="text-sm font-medium text-white">
                {formatTime(startTime ?? 0)} - {formatTime(endTime ?? 0)}
              </div>
            </div>
          )}


</div>
{location && (
              <div className="text-md mt-2 p-1">
                📍 {location}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default VideoModalSimple;