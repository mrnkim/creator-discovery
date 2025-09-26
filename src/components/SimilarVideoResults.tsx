import React, { useState, useEffect, useRef } from 'react';
import Video from './Video';
import VideoModalSimple from './VideoModalSimple';
import { fetchVideoDetailsWithRetry, getFailedVideoCacheSize } from '@/hooks/apiHooks';
import { VideoData, SimilarVideoResultsProps, SelectedVideoData } from '@/types';
import LoadingSpinner from './LoadingSpinner';
import { useInView } from 'react-intersection-observer';

const ITEMS_PER_PAGE = 9;

const SimilarVideoResults: React.FC<SimilarVideoResultsProps> = ({ results, indexId }) => {
  const [videoDetails, setVideoDetails] = useState<Record<string, VideoData>>({});
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideoData | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false,
    rootMargin: '100px 0px',
  });

  const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);
  const currentResults = results.slice(0, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    if (inView && !loadingMore && currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [inView, loadingMore, currentPage, totalPages]);

  // Fetch video details for each result
  useEffect(() => {
    const fetchAllVideoDetails = async () => {
      if (results.length === 0 || isFetchingRef.current) return;

      const loadedVideoIds = new Set(Object.keys(videoDetails));
      const videosToFetch = currentResults
        .filter(result => result.metadata?.tl_video_id && !loadedVideoIds.has(result.metadata.tl_video_id));

      if (videosToFetch.length === 0) return;

      isFetchingRef.current = true;
      setLoadingMore(true);
      const invalidVideoIds = new Set<string>();

      try {
        const fetchPromises = videosToFetch.map(async (result) => {
          const videoId = result.metadata?.tl_video_id;
          if (!videoId) return null;

          try {
            // Use retry logic for videos that might be processing
            const details = await fetchVideoDetailsWithRetry(videoId, indexId, false, 1, 500);
            return { videoId, details };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check for various "not found" error patterns
            if (
              errorMessage.includes('resource_not_exists') ||
              errorMessage.includes('does not exist') ||
              errorMessage.includes('Not Found') ||
              errorMessage.includes('not found') ||
              errorMessage.includes('cached failure')
            ) {
              console.log(`📝 Video ${videoId} not found, excluding from results`);
              invalidVideoIds.add(videoId);
              return null;
            } else {
              console.error(`Error fetching details for video ${videoId}:`, error);
              return null;
            }
          }
        });

        const fetchResults = await Promise.all(fetchPromises);

        // Update video details in a single batch
        const newDetails: Record<string, VideoData> = {};
        fetchResults.forEach(result => {
          if (result && result.details) {
            newDetails[result.videoId] = result.details;
          }
        });

        // Only update if we have new details
        if (Object.keys(newDetails).length > 0) {
          setVideoDetails(prev => ({ ...prev, ...newDetails }));
        }

        if (invalidVideoIds.size > 0) {
          console.info(`📝 Excluded ${invalidVideoIds.size} invalid videos from results:`,
            Array.from(invalidVideoIds));

          // Log cache status for debugging
          const cacheSize = getFailedVideoCacheSize();
          if (cacheSize > 0) {
            console.log(`💾 Failed video cache contains ${cacheSize} entries`);
          }
        }
      } catch (error) {
        console.error('Error fetching video details:', error);
      } finally {
        isFetchingRef.current = false;
        setLoadingMore(false);
        setLoadingDetails(false);
      }
    };

    fetchAllVideoDetails();
  }, [results, indexId, currentPage, currentResults]);

  useEffect(() => {
    if (results.length > 0) {
      setLoadingDetails(true);
    }
  }, [results]);

  // Skip if no results
  if (!results || results.length === 0) {
    return null;
  }

  // Define similarity label and color
  const getSimilarityLabel = (score: number, source?: string) => {
    // BOTH source results are always High
    if (source === "BOTH") {
      return { label: "High", color: "green" };
    }

    // Single source cases based on score
    if (score >= 1) return { label: "High", color: "green" };
    if (score >= 0.5) return { label: "Medium", color: "yellow" };
    return { label: "Low", color: "red" };
  };

  // Render tags from user_metadata
  const renderTags = (videoData: VideoData | undefined) => {
    if (!videoData || !videoData.user_metadata) return null;

    try {
      const allTags = Object.entries(videoData.user_metadata)
      .filter(([key, value]) => {
        // Filter out certain keys and null/undefined values
        const excludeKeys = ['source', 'brand_product_events', 'analysis', 'brand_product_analyzed_at', 'brand_product_source'];
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

    // Return null if no valid tags found
    if (allTags.length === 0) {
      return null;
    }

    return (
      <div className="mt-1 overflow-x-auto pb-1" style={{
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch'
      }}>
        <div className="flex gap-2 min-w-min">
          {allTags.map((tag, idx) => (
            <div
              key={`${tag}-${idx}`}
              className="mt-3 inline-block flex-shrink-0 bg-gray-100 border border-black rounded-full px-3 py-1 text-sm whitespace-nowrap text-black hover:bg-gray-200 transition-colors"
            >
              {tag}
            </div>
          ))}
        </div>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
    );
    } catch (error) {
      console.error('❌ Error rendering tags for video:', videoData?._id, error);
      return (
        <div className="mt-1 text-xs text-gray-400 italic">
          Unable to load tags
        </div>
      );
    }
  };

  const handleVideoClick = (videoId: string) => {
    const videoData = videoDetails[videoId];
    const resultData = results.find(result => result.metadata?.tl_video_id === videoId);

    if (!videoData || !videoData.hls?.video_url) return;

    const title = videoData.system_metadata?.filename ||
      videoData.system_metadata?.video_title ||
      `Video ${videoId}`;

    setSelectedVideo({
      id: videoId,
      url: videoData.hls.video_url,
      title: title,
      score: resultData?.score,
      textScore: resultData?.textScore,
      videoScore: resultData?.videoScore,
      originalSource: resultData?.originalSource as 'TEXT' | 'VIDEO' | 'BOTH',
      metadata: videoData
    });
  };

  const handleCloseModal = () => {
    setSelectedVideo(null);
  };

  return (
    <div className="mt-4">
      <div className="grid grid-cols-1 gap-6">
        {currentResults.map((result, index) => {
          const { label, color } = getSimilarityLabel(result.score, result.originalSource as string);
          const videoId = result.metadata?.tl_video_id;

          // Only render videos with valid IDs
          if (!videoId) return null;

          if (!videoDetails[videoId]) return null;

          // Get the full video details from our fetched data
          const videoData = videoDetails[videoId];

          return (
            <div key={index} className="flex flex-col">
                <Video
                  videoId={videoId}
                  indexId={indexId}
                  showTitle={false}
                  confidenceLabel={label}
                  confidenceColor={color as 'green' | 'yellow' | 'red'}
                  disablePlayback={false}
                  size="large"
                  showPlayer={true}
                />

              {/* Show loading indicator if details are still loading */}
              {loadingDetails && !videoData ? (
                <div className="flex items-center space-x-2 mt-1">
                  <LoadingSpinner size="sm" color="default" />
                  <span className="text-xs text-gray-400">Loading tags...</span>
                </div>
              ) : (
                /* Render actual tags from the fetched video data */
                renderTags(videoData)
              )}
            </div>
          );
        })}
      </div>

      {/* loading indicator for infinite scroll */}
      {currentPage < totalPages && (
        <div
          ref={loadMoreRef}
          className="w-full py-8 flex justify-center"
        >
          {loadingMore ? (
            <div className="flex items-center space-x-2">
              <LoadingSpinner size="sm" color="default" />
            </div>
          ) : (
            <div className="h-10" />
          )}
        </div>
      )}

      {/* video modal */}
      {selectedVideo && (
        <VideoModalSimple
          videoUrl={selectedVideo.url}
          videoId={selectedVideo.id}
          isOpen={!!selectedVideo}
          onClose={handleCloseModal}
          title={selectedVideo.title}
        />
      )}
    </div>
  );
};

export default SimilarVideoResults;
