"use client";

import { useState, useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  fetchVideos,
  textToVideoEmbeddingSearch,
  videoToVideoEmbeddingSearch,
  checkAndEnsureEmbeddings,
} from '@/hooks/apiHooks';
import VideosDropDown from '@/components/VideosDropdown';
import Video from '@/components/Video';
import SimilarVideoResults from '@/components/SimilarVideoResults';
import { VideoData, EmbeddingSearchResult, VideoPage } from '@/types';
import LoadingSpinner from '@/components/LoadingSpinner';

interface CreatorBrandMatchProps {
  description?: string;
}

export default function CreatorBrandMatch({ description }: CreatorBrandMatchProps) {
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

  // Handle source type toggle
  const handleSourceTypeToggle = () => {
    setSourceType(prevType => prevType === 'brand' ? 'creator' : 'brand');
    setSelectedVideoId(null);
    setSimilarResults([]);
    setEmbeddingsReady(false);
  };

  // Handle video selection
  const handleVideoChange = (videoId: string) => {
    setSelectedVideoId(videoId);
    setSimilarResults([]);
    setEmbeddingsReady(false);
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

  // Auto-select first video when videos are loaded and sourceType is brand
  useEffect(() => {
    if (videosData?.pages?.[0]?.data?.[0] && sourceType === 'brand' && !selectedVideoId) {
      const firstVideo = videosData.pages[0].data[0];
      setSelectedVideoId(firstVideo._id);
    }
  }, [videosData, sourceType, selectedVideoId]);

  // Dismiss status messages
  const dismissMessage = () => {
    setShowProcessingMessage(false);
  };

  return (
    <div className="bg-white">
      <main className="container mx-auto px-4 py-8">
        {/* Description */}
        {description && (
          <div className="mb-8 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
            <p className="text-gray-700">{description}</p>
          </div>
        )}

        {/* Source Type Toggle */}
        <div className="mb-6">
          <div className="flex items-center justify-between max-w-lg mx-auto bg-gray-100 p-4 rounded-lg">
            <span className={`px-4 py-2 rounded-md ${sourceType === 'brand' ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>
              Brand → Creator
            </span>
            <button
              onClick={handleSourceTypeToggle}
              className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Switch Direction
            </button>
            <span className={`px-4 py-2 rounded-md ${sourceType === 'creator' ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>
              Creator → Brand
            </span>
          </div>
        </div>

        {/* Video Selection Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">
            Select {sourceType === 'brand' ? 'Brand' : 'Creator'} Video
          </h2>

          {/* Video Dropdown */}
          <div className="max-w-lg mx-auto">
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
            <div className="mt-6 flex justify-center">
              <Video
                videoId={selectedVideoId}
                indexId={sourceIndexId}
                showTitle={true}
              />
            </div>
          )}

          {/* Find Matches Button */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleFindMatches}
              disabled={!selectedVideoId || isAnalyzing}
              className={`px-6 py-3 rounded-lg font-semibold ${
                !selectedVideoId || isAnalyzing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
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
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${(targetEmbeddingsProgress.processed / targetEmbeddingsProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {similarResults.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">
              {sourceType === 'brand' ? 'Creator' : 'Brand'} Matches
            </h2>
            <SimilarVideoResults results={similarResults} indexId={targetIndexId} />
          </div>
        )}

        {/* No Results Message */}
        {!isAnalyzing && similarResults.length === 0 && embeddingsReady && (
          <div className="mt-8 text-center text-gray-600">
            No matching {sourceType === 'brand' ? 'creators' : 'brands'} found. Try selecting a different video.
          </div>
        )}
      </main>
    </div>
  );
}
