import React, { useState, useEffect } from 'react';
import Video from './Video';
import VideoModalSimple from './VideoModalSimple';
import { fetchVideoDetails } from '@/hooks/apiHooks';
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
      if (results.length === 0) return;

      const loadedVideoIds = new Set(Object.keys(videoDetails));
      const videosToFetch = currentResults
        .filter(result => result.metadata?.tl_video_id && !loadedVideoIds.has(result.metadata.tl_video_id));

      if (videosToFetch.length === 0) return;

      setLoadingMore(true);
      const detailsMap: Record<string, VideoData> = { ...videoDetails };
      const invalidVideoIds = new Set<string>();

      try {
        await Promise.all(
          videosToFetch.map(async (result) => {
            const videoId = result.metadata?.tl_video_id;
            if (!videoId) return;

            try {
              const details = await fetchVideoDetails(videoId, indexId);
              if (details) {
                detailsMap[videoId] = details;
              } else {
                console.warn(`No details returned for video ${videoId}`);
                invalidVideoIds.add(videoId);
              }
            } catch (error) {
              console.error(`Error fetching details for video ${videoId}:`, error);

              const errorMessage = error instanceof Error ? error.message : String(error);
              if (
                errorMessage.includes('resource_not_exists') ||
                errorMessage.includes('does not exist') ||
                errorMessage.includes('Not Found')
              ) {
                console.warn(`Video ${videoId} does not exist in collection, excluding from results`);
                invalidVideoIds.add(videoId);
              }
            }
          })
        );

        setVideoDetails(detailsMap);

        if (invalidVideoIds.size > 0) {
          console.info(`Excluded ${invalidVideoIds.size} invalid videos from results:`,
            Array.from(invalidVideoIds));
        }
      } catch (error) {
        console.error('Error fetching video details:', error);
      } finally {
        setLoadingMore(false);
        setLoadingDetails(false);
      }
    };

    fetchAllVideoDetails();
  }, [results, indexId, currentPage, videoDetails, currentResults]);

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

    const allTags = Object.entries(videoData.user_metadata)
      .filter(([key, value]) => key !== 'source' && value != null && value.toString().length > 0)
      .flatMap(([, value]) => {
        // Split comma-separated values
        const tagValues = (value as unknown as string).toString().split(',');

        return tagValues
          .map((tag: string) => {
            // First trim the tag to remove any leading/trailing spaces
            const trimmedTag = tag.trim();
            if (trimmedTag.length === 0) return '';

            // Properly capitalize - first lowercase everything then capitalize first letter of each word
            const properlyCapitalized = trimmedTag
              .toLowerCase()
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            return properlyCapitalized;
          })
          .filter((tag: string) => tag !== '');
      });

    return (
      <div className="mt-1 overflow-x-auto pb-1" style={{
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch'
      }}>
        <div className="flex gap-2 min-w-min">
          {allTags.map((tag, idx) => (
            <div
              key={idx}
              className="inline-block flex-shrink-0 bg-gray-100 border rounded-full px-3 py-1 text-xs whitespace-nowrap"
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
    <div className="mt-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <div
                className="cursor-pointer"
                onClick={() => handleVideoClick(videoId)}
              >
                <Video
                  videoId={videoId}
                  indexId={indexId}
                  showTitle={true}
                  confidenceLabel={label}
                  confidenceColor={color as 'green' | 'yellow' | 'red'}
                  disablePlayback={true}
                  onPlay={() => handleVideoClick(videoId)}
                />
              </div>

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
