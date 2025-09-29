"use client";

import { useState, useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchVideos,
  fetchVideoDetails,
  textToVideoEmbeddingSearch,
  videoToVideoEmbeddingSearch,
  checkAndEnsureEmbeddings,
} from '@/hooks/apiHooks';
import VideosDropDown from '@/components/VideosDropdown';
import Video from '@/components/Video';
import SimilarVideoResults from '@/components/SimilarVideoResults';
import VideoModalSimple from '@/components/VideoModalSimple';
import { VideoData, EmbeddingSearchResult, VideoPage } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';

// Component to render brand tag overlay
const BrandTagOverlay: React.FC<{ videoId: string; indexId: string; }> = ({ videoId, indexId }) => {
  const { data: videoDetails } = useQuery<VideoData, Error>({
    queryKey: ["videoDetails", videoId],
    queryFn: () => fetchVideoDetails(videoId, indexId),
    enabled: !!videoId && !!indexId,
  });

  const getFirstBrandTag = (videoData: VideoData | undefined) => {
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

  const firstBrand = getFirstBrandTag(videoDetails);

  if (!firstBrand) return null;

  return (
    <div className="absolute top-3 left-6 z-10">
      <span className="px-2 py-1 text-sm bg-custom-green rounded-xl font-bold">
        {firstBrand}
      </span>
    </div>
  );
};

// Component to render video tags
const VideoWithTags: React.FC<{ videoId: string; indexId: string; }> = ({ videoId, indexId }) => {
  const { data: videoDetails } = useQuery<VideoData, Error>({
    queryKey: ["videoDetails", videoId],
    queryFn: () => fetchVideoDetails(videoId, indexId),
    enabled: !!videoId && !!indexId,
  });

  // Render tags from user_metadata (same as SimilarVideoResults)
  const renderTags = (videoData: VideoData | undefined) => {
    console.log('🏷️ renderTags called with:', videoData);
    if (!videoData || !videoData.user_metadata) {
      console.log('🏷️ No video data or user_metadata');
      return null;
    }

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

      // Return null if no valid tags found
      if (combinedTags.length === 0) {
        console.log('🏷️ No valid tags found');
        return null;
      }

      console.log('🏷️ Found tags:', combinedTags);

      return (
        <div className="mt-1 pb-1">
          <div className="flex flex-wrap gap-2">
            {combinedTags.map((tag, idx) => (
              <div
                key={`${tag}-${idx}`}
                className="mt-3 inline-block flex-shrink-0 bg-gray-100 border border-black rounded-full px-3 py-1 text-sm text-black hover:bg-gray-200 transition-colors"
              >
                {tag}
              </div>
            ))}
          </div>
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

  return renderTags(videoDetails);
};

export default function CreatorBrandMatch() {
  const description: string | undefined = undefined;
  const [sourceType, setSourceType] = useState<'brand' | 'creator'>('brand'); // Default: Brand → Creator
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarResults, setSimilarResults] = useState<EmbeddingSearchResult[]>([]);
  const [isLoadingEmbeddings, setIsLoadingEmbeddings] = useState(false);
  const [targetVideos, setTargetVideos] = useState<VideoData[]>([]);
  const [embeddingsReady, setEmbeddingsReady] = useState(false);
  const [isProcessingTargetEmbeddings, setIsProcessingTargetEmbeddings] = useState(false);
  const [targetEmbeddingsProgress, setTargetEmbeddingsProgress] = useState({ processed: 0, total: 0 });
  const [showProcessingMessage, setShowProcessingMessage] = useState(true);

  // Modal state
  const [modalVideo, setModalVideo] = useState<{
    videoId: string;
    videoUrl: string;
    title: string;
    description?: string;
  } | null>(null);

  // Get index IDs from environment variables
  const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID || '';
  const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID || '';

  // Determine source and target index IDs based on sourceType
  const sourceIndexId = sourceType === 'brand' ? brandIndexId : creatorIndexId;
  const targetIndexId = sourceType === 'brand' ? creatorIndexId : brandIndexId;

  // Fetch videos for the source index (for dropdown selection)
  const {
    data: videosData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingVideos,
  } = useInfiniteQuery<VideoPage>({
    queryKey: ['videos', sourceIndexId, sourceType],
    queryFn: ({ pageParam = 1 }) =>
      fetchVideos(Number(pageParam), sourceIndexId),
    getNextPageParam: (lastPage) => {
      if (lastPage.page_info.page < lastPage.page_info.total_page) {
        return lastPage.page_info.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    enabled: !!sourceIndexId,
    staleTime: 2 * 60 * 1000, // 2 minutes - videos don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnMount: false, // Don't refetch on component mount if data exists
  });

  // Fetch target videos for embedding preparation using React Query
  const {
    data: targetVideosData,
  } = useQuery({
    queryKey: ['targetVideos', targetIndexId],
    queryFn: () => fetchVideos(1, targetIndexId, 20),
    enabled: !!targetIndexId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
    select: (data) => data.data, // Extract just the data array
  });

  // Update targetVideos state when data is available
  useEffect(() => {
    if (targetVideosData) {
      setTargetVideos(targetVideosData);
    }
  }, [targetVideosData]);


  // Handle video selection
  const handleVideoChange = (videoId: string) => {
    setSelectedVideoId(videoId);
    setSimilarResults([]);
    setEmbeddingsReady(false);
  };

  // Handle opening video modal
  const handleOpenVideoModal = (videoId: string) => {
    const video = videosData?.pages.flatMap((page: { data: VideoData[]; }) => page.data)
      .find((video: VideoData) => video._id === videoId);

    if (video && video.hls?.video_url) {
      setModalVideo({
        videoId: video._id,
        videoUrl: video.hls.video_url,
        title: video.system_metadata?.filename || video.system_metadata?.video_title || 'Video',
        description: `Duration: ${video.system_metadata?.duration ? Math.round(video.system_metadata.duration) : 0}s`
      });
    }
  };

  // Handle closing video modal
  const handleCloseVideoModal = () => {
    setModalVideo(null);
  };

  // Find matches between source and target videos
  const handleFindMatches = async () => {
    if (!selectedVideoId) return;

    setIsAnalyzing(true);
    setSimilarResults([]);

    try {
      // Use target videos from React Query cache
      const targetVideosToProcess = targetVideos.length > 0 ? targetVideos : [];

      console.log(`🎯 Starting match finding for video: ${selectedVideoId}`);
      console.log(`📊 Processing ${targetVideosToProcess.length} target videos`);

      // Check and ensure embeddings for source and target videos
      setIsLoadingEmbeddings(true);
      setIsProcessingTargetEmbeddings(true);

      const startTime = Date.now();
      const embeddingResult = await checkAndEnsureEmbeddings(
        selectedVideoId,
        sourceIndexId,
        targetIndexId,
        targetVideosToProcess,
        true
      );
      const embeddingTime = Date.now() - startTime;

      console.log(`⏱️ Embedding processing took: ${embeddingTime}ms`);

      setTargetEmbeddingsProgress({
        processed: embeddingResult.processedCount,
        total: embeddingResult.totalCount
      });

      setEmbeddingsReady(embeddingResult.success);
      setIsLoadingEmbeddings(false);
      setIsProcessingTargetEmbeddings(false);

      if (!embeddingResult.success) {
        console.error('❌ Embedding processing failed');
        return;
      }

      // Run searches in parallel for better performance
      console.log('🔍 Starting parallel searches...');
      const searchStartTime = Date.now();

      const [textResults, videoResults] = await Promise.all([
        textToVideoEmbeddingSearch(selectedVideoId, sourceIndexId, targetIndexId),
        videoToVideoEmbeddingSearch(selectedVideoId, sourceIndexId, targetIndexId)
      ]);

      const searchTime = Date.now() - searchStartTime;
      console.log(`⏱️ Search processing took: ${searchTime}ms`);

      // Combine results with a boost for videos that appear in both searches
      const combinedResults = combineSearchResults(textResults, videoResults);

      console.log(`✅ Found ${combinedResults.length} total matches`);
      setSimilarResults(combinedResults);
    } catch (error) {
      console.error('❌ Error finding matches:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper function to determine match level
  const getMatchLevel = (score: number, source?: string): 'High' | 'Medium' | 'Low' => {
    // BOTH source results are always High
    if (source === "BOTH") {
      return "High";
    }

    // Single source cases based on score
    if (score >= 1) return "High";
    if (score >= 0.5) return "Medium";
    return "Low";
  };

  // Helper function to get match level priority for sorting
  const getMatchLevelPriority = (level: 'High' | 'Medium' | 'Low'): number => {
    switch (level) {
      case 'High': return 3;
      case 'Medium': return 2;
      case 'Low': return 1;
      default: return 0;
    }
  };

  // Combine text and video search results with a boost for overlapping results
  const combineSearchResults = (
    textResults: EmbeddingSearchResult[],
    videoResults: EmbeddingSearchResult[]
  ): EmbeddingSearchResult[] => {
    const resultMap = new Map<string, EmbeddingSearchResult>();

    // Process text search results
    textResults.forEach(result => {
      const videoId = result.metadata?.tl_video_id;
      if (videoId) {
        resultMap.set(videoId, {
          ...result,
          textScore: result.score,
          originalSource: 'TEXT'
        });
      }
    });

    // Process video search results and merge with text results if they exist
    videoResults.forEach(result => {
      const videoId = result.metadata?.tl_video_id;
      if (!videoId) return;

      if (resultMap.has(videoId)) {
        // Video exists in both searches - merge and boost
        const existingResult = resultMap.get(videoId)!;
        const textScore = existingResult.textScore || 0;
        const videoScore = result.score;

        // Calculate combined score with a boost
        const maxScore = Math.max(textScore, videoScore);
        const boostedScore = maxScore * 1.15; // 15% boost when in both results

        resultMap.set(videoId, {
          ...existingResult,
          score: boostedScore,
          videoScore,
          textScore,
          originalSource: 'BOTH'
        });
      } else {
        // Video only in video search
        resultMap.set(videoId, {
          ...result,
          videoScore: result.score,
          originalSource: 'VIDEO'
        });
      }
    });

    // Convert map to array and sort by match level (High, Medium, Low), then by score within each level
    return Array.from(resultMap.values()).sort((a, b) => {
      const levelA = getMatchLevel(a.score, a.originalSource);
      const levelB = getMatchLevel(b.score, b.originalSource);

      // First sort by match level priority (High > Medium > Low)
      const levelPriorityA = getMatchLevelPriority(levelA);
      const levelPriorityB = getMatchLevelPriority(levelB);

      if (levelPriorityA !== levelPriorityB) {
        return levelPriorityB - levelPriorityA; // Higher priority first
      }

      // If same level, sort by score (higher score first)
      return b.score - a.score;
    });
  };

  // Auto-select first video when videos are loaded (for both brand and creator)
  useEffect(() => {
    if (videosData?.pages?.[0]?.data?.[0] && !selectedVideoId) {
      const firstVideo = videosData.pages[0].data[0];
      setSelectedVideoId(firstVideo._id);
    }
  }, [videosData, selectedVideoId]);

  // Dismiss status messages
  const dismissMessage = () => {
    setShowProcessingMessage(false);
  };


  return (
    <div className="bg-zinc-100 h-screen flex flex-col">
      {/* Fixed Header */}
      <div className="flex-shrink-0">
        <main className="container mx-auto px-4 py-8">
          {/* Description */}
          {description && (
            <div className="mb-8 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
              <p className="text-gray-700">{description}</p>
            </div>
          )}

          {/* Source Type Toggle */}
          <div className="mb-6">
            <div className="flex items-center justify-center max-w-lg mx-auto bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => {
                  setSourceType('brand');
                  setSelectedVideoId(null);
                  setSimilarResults([]);
                  setEmbeddingsReady(false);
                }}
                className={`px-6 py-3 rounded-md font-medium transition-colors ${sourceType === 'brand'
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                  }`}
              >
                Brand → Creator
              </button>
              <button
                onClick={() => {
                  setSourceType('creator');
                  setSelectedVideoId(null);
                  setSimilarResults([]);
                  setEmbeddingsReady(false);
                }}
                className={`px-6 py-3 rounded-md font-medium transition-colors ${sourceType === 'creator'
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-200'
                  }`}
              >
                Creator → Brand
              </button>
            </div>
          </div>
          {/* Processing Status Messages */}
          {isLoadingEmbeddings && showProcessingMessage && (
            <div className="max-w-3xl mx-auto mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center">
                <LoadingSpinner size="sm" className="mr-3" />
                <span>
                  Processing embeddings for {sourceType === 'brand' ? 'brand' : 'creator'} and {sourceType === 'brand' ? 'creator' : 'brand'} videos...
                </span>
              </div>
              <button onClick={dismissMessage} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>
          )}

          {isProcessingTargetEmbeddings && targetEmbeddingsProgress.total > 0 && showProcessingMessage && (
            <div className="max-w-3xl mx-auto mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span>Processing {targetEmbeddingsProgress.processed}/{targetEmbeddingsProgress.total} videos</span>
                <button onClick={dismissMessage} className="text-gray-500 hover:text-gray-700">
                  ✕
                </button>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-black h-2.5 rounded-full"
                  style={{ width: `${(targetEmbeddingsProgress.processed / targetEmbeddingsProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Main Content Layout - Left: Reference Video, Right: Results */}
      <div className="flex-1 flex gap-8 min-h-0 container mx-auto px-4 -mt-8">
        {/* Left Side - Reference Video Selection */}
        <div className="w-1/2 flex flex-col">
          <h2 className="text-xl font-semibold mb-4">
            Select {sourceType === 'brand' ? 'Brand' : 'Creator'} Video
          </h2>

          {/* Video Dropdown */}
          <div className="mb-6 flex-shrink-0">
            <VideosDropDown
              indexId={sourceIndexId}
              onVideoChange={handleVideoChange}
              videosData={videosData || { pages: [], pageParams: [] }}
              fetchNextPage={fetchNextPage}
              hasNextPage={!!hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isLoading={isLoadingVideos}
              selectedFile={null}
              taskId={null}
              footageVideoId={selectedVideoId}
            />
          </div>

          {/* Selected Video Preview */}
          {selectedVideoId && (
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="relative">
                <Video
                  videoId={selectedVideoId}
                  indexId={sourceIndexId}
                  showTitle={false}
                  onPlay={() => handleOpenVideoModal(selectedVideoId)}
                  size="large"
                  showPlayer={true}
                />
                {/* Brand Tag Overlay - only show for Brand → Creator mode */}
                {sourceType === 'brand' && (
                  <BrandTagOverlay videoId={selectedVideoId} indexId={sourceIndexId} />
                )}
                {/* Creator Tag Overlay - only show for Creator → Brand mode */}
                {sourceType === 'creator' && (
                  <div className="absolute top-3 left-6 z-10">
                    <span className="px-2 py-1 text-sm bg-custom-orange rounded-xl font-bold">
                      {(() => {
                        const video = videosData?.pages.flatMap((page: { data: VideoData[]; }) => page.data)
                          .find((video: VideoData) => video._id === selectedVideoId);
                        if (!video || !video.user_metadata) return 'Creator';

                        const creator = video.user_metadata.creator ||
                                       video.user_metadata.video_creator ||
                                       video.user_metadata.creator_id;

                        return creator && typeof creator === 'string' ? creator.trim() : 'Creator';
                      })()}
                    </span>
                  </div>
                )}
              </div>
              {/* Video Tags - using Video component's data */}
              <VideoWithTags
                videoId={selectedVideoId}
                indexId={sourceIndexId}
              />
            </div>
          )}

          {/* Find Matches Button */}
          <div className="flex justify-center flex-shrink-0 mt-4">
            <button
              onClick={handleFindMatches}
              disabled={!selectedVideoId || isAnalyzing}
              className={`px-6 py-3 rounded-lg font-semibold ${!selectedVideoId || isAnalyzing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-800'
                }`}
            >
              {isAnalyzing ? (
                <span className="flex items-center">
                  <LoadingSpinner size="sm" className="mr-2" />
                  Finding Matches...
                </span>
              ) : (
                'Find Matches'
              )}
            </button>
          </div>
        </div>

        {/* Right Side - Search Results */}
        <div className="w-1/2 flex flex-col">
          {similarResults.length > 0 ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-semibold mb-4 flex-shrink-0">
                {sourceType === 'brand' ? 'Creator' : 'Brand'} Matches
              </h2>
              <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
                <SimilarVideoResults results={similarResults} indexId={targetIndexId} sourceType={sourceType} />
              </div>
            </div>
          ) : !isAnalyzing && embeddingsReady ? (
            <div className="text-center text-gray-600 mt-8">
              No matching {sourceType === 'brand' ? 'creators' : 'brands'} found. Try selecting a different video.
            </div>
          ) : (
            <div className="text-center text-gray-500 mt-8">
              Select a video and click &quot;Find Matches&quot; to see results.
            </div>
          )}
        </div>
      </div>

      {/* Video Modal */}
      {modalVideo && (
        <VideoModalSimple
          videoUrl={modalVideo.videoUrl}
          videoId={modalVideo.videoId}
          isOpen={!!modalVideo}
          onClose={handleCloseVideoModal}
          title={modalVideo.title}
          description={modalVideo.description}
        />
      )}
    </div>
  );
}
