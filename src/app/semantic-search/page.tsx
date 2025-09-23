"use client";

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import axios from 'axios';
import clsx from 'clsx';
import ReactCrop, { Crop } from 'react-image-crop';
import { useDropzone } from 'react-dropzone';
import { useInView } from 'react-intersection-observer';
import 'react-image-crop/dist/ReactCrop.css';
import { fetchVideoDetails } from '@/hooks/apiHooks';
import LoadingSpinner from '@/components/LoadingSpinner';
import VideoModalSimple from '@/components/VideoModalSimple';
import ErrorFallback from '@/components/ErrorFallback';
import { ErrorBoundary } from 'react-error-boundary';

// Types
interface SearchResult {
  video_id: string;
  thumbnail_url: string;
  start: number;
  end: number;
  confidence: string;
  score: number;
  index_id: string;
  videoDetails?: VideoDetails;
  format?: 'vertical' | 'horizontal';
}

// 🔧 PERFORMANCE FIX: Memoized VideoCard component to prevent unnecessary re-renders
const VideoCard = React.memo<{
  result: SearchResult;
  index: number;
  brandIndexId: string | undefined;
  onVideoClick: (result: SearchResult) => void;
  formatTime: (seconds: number) => string;
  getConfidenceClass: (confidence: string) => string;
}>(({ result, index, brandIndexId, onVideoClick, formatTime, getConfidenceClass }) => {
  // Debug logging for re-renders
  if (index === 0) {
    console.log('🔍 VideoCard re-rendered - first card of batch');
  }

  return (
    <div
      className="relative rounded-lg overflow-hidden shadow-md cursor-pointer transform transition hover:scale-[1.02]"
      onClick={() => onVideoClick(result)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video">
        <img
          src={result.thumbnail_url}
          alt="Video thumbnail"
          className="w-full h-full object-cover"
        />

        {/* Confidence Badge */}
        <div className="absolute top-2 left-2">
          <span className={clsx(
            'px-2 py-1 text-xs font-bold text-white rounded-md',
            getConfidenceClass(result.confidence)
          )}>
            {result.confidence}
          </span>
        </div>

        {/* Index Badge */}
        <div className="absolute top-2 right-2">
          <span className={clsx(
            'px-2 py-1 text-xs font-bold text-white rounded-md',
            result.index_id === brandIndexId ? 'bg-purple-600' : 'bg-green-600'
          )}>
            {result.index_id === brandIndexId ? 'Brand' : 'Creator'}
          </span>
        </div>

        {/* Time Range */}
        <div className="absolute bottom-2 right-2">
          <span className="px-2 py-1 text-xs font-bold text-white bg-black bg-opacity-60 rounded-md">
            {formatTime(result.start)} - {formatTime(result.end)}
          </span>
        </div>

        {/* Format Badge (if available) */}
        {result.format && (
          <div className="absolute bottom-2 left-2">
            <span className={clsx(
              'px-2 py-1 text-xs font-bold text-white rounded-md bg-gray-700',
            )}>
              {result.format === 'vertical' ? 'Vertical' : 'Horizontal'}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="p-2">
        <h3 className="text-sm font-medium truncate">
          {result.videoDetails?.system_metadata?.filename ||
           result.videoDetails?.system_metadata?.video_title ||
           `Video ${result.video_id}`}
        </h3>
      </div>
    </div>
  );
});

VideoCard.displayName = 'VideoCard';

interface VideoDetails {
  _id: string;
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
  };
  system_metadata?: {
    filename?: string;
    duration?: number;
    video_title?: string;
    fps?: number;
    height?: number;
    width?: number;
  };
  user_metadata?: {
    creator?: string;
    video_creator?: string;
    creator_id?: string;
    [key: string]: unknown;
  };
}

// Facet filter unions
type FormatFilter = 'vertical' | 'horizontal';
type FacetFilter = FormatFilter;

export default function SemanticSearchPage() {
  const description: string | undefined = undefined;
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [enhancedResults, setEnhancedResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<FacetFilter[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{
    videoId: string;
    videoUrl: string;
    title: string;
    start?: number;
    end?: number;
  } | null>(null);

  // 🔧 NEW: Total results count from API
  const [totalResults, setTotalResults] = useState<{
    all: number;
    brands: number;
    creators: number;
  }>({ all: 0, brands: 0, creators: 0 });

  // Simple filter states - just toggle between all/brands/creators results
  const [activeFilter, setActiveFilter] = useState<'all' | 'brands' | 'creators'>('all');

  // 🔧 PERFORMANCE FIX: Simplified pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(24);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [nextPageTokens, setNextPageTokens] = useState<Record<string, string | null>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Using intersection observer for infinite scroll
  const { ref: observerRef, inView } = useInView({
    threshold: 0.1,
    triggerOnce: false,
  });

  // 🔧 PERFORMANCE FIX: Simplified toggle filter function
  const toggleFilter = useCallback((filter: 'all' | 'brands' | 'creators') => {
    console.log('🔍 toggleFilter called:', filter);
    setActiveFilter(filter);
  }, []);

  // 🔧 PERFORMANCE FIX: Simplified load more results function based on reference code
  const loadMoreResults = useCallback(async () => {
    console.log('🔍 loadMoreResults called:');
    console.log('  - hasMoreResults:', hasMoreResults);
    console.log('  - isLoadingMore:', isLoadingMore);
    console.log('  - currentPage:', currentPage);
    console.log('  - nextPageTokens:', nextPageTokens);

    if (!hasMoreResults || isLoadingMore) {
      console.log('❌ Load more blocked - hasMoreResults:', hasMoreResults, 'isLoadingMore:', isLoadingMore);
      return;
    }

    setIsLoadingMore(true);

    try {
      const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID;
      const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID;

      const brandToken = nextPageTokens[brandIndexId!];
      const creatorToken = nextPageTokens[creatorIndexId!];

      console.log('🔍 Available tokens:', { brandToken, creatorToken });

      // Make parallel requests for both indices if tokens exist
      const requests = [];

      if (brandToken) {
        requests.push(
          axios.get(`/api/search/byToken?pageToken=${brandToken}&indexId=${brandIndexId}`)
            .then(response => ({ indexId: brandIndexId, data: response.data }))
        );
      }

      if (creatorToken) {
        requests.push(
          axios.get(`/api/search/byToken?pageToken=${creatorToken}&indexId=${creatorIndexId}`)
            .then(response => ({ indexId: creatorIndexId, data: response.data }))
        );
      }

      if (requests.length === 0) {
        console.log('❌ No tokens available for load more');
        setHasMoreResults(false);
        return;
      }

      const responses = await Promise.all(requests);
      const newResults: SearchResult[] = [];
      const newTokens: Record<string, string | null> = { ...nextPageTokens };

      responses.forEach(({ indexId, data }) => {
        if (data && data.data && indexId) {
          console.log(`🔍 Results from ${indexId}:`, data.data.length);
          newResults.push(...data.data);
          newTokens[indexId] = data.pageInfo?.next_page_token || null;
        }
      });

      // Fetch video details for new results
      const newResultsWithDetails = await fetchVideoDetailsForResults(newResults, true);

      if (newResultsWithDetails && newResultsWithDetails.length > 0) {
        console.log('🔍 Adding new results:', newResultsWithDetails.length);

        // 🔧 PERFORMANCE FIX: Single state update with duplicate check
        setEnhancedResults(prev => {
          // Check for duplicates based on unique identifiers
          const existingIds = new Set(prev.map(item => `${item.video_id}_${item.start}_${item.end}`));

          // Filter out duplicates
          const uniqueNewResults = newResultsWithDetails.filter(item => {
            const itemKey = `${item.video_id}_${item.start}_${item.end}`;
            return !existingIds.has(itemKey);
          });

          const updated = [...prev, ...uniqueNewResults];
          console.log('🔍 Updated enhancedResults:', prev.length, '->', updated.length);
          return updated;
        });

        // Update pagination state
        setNextPageTokens(newTokens);
        setCurrentPage(prev => prev + 1);
        setHasMoreResults(Object.values(newTokens).some(token => token !== null));
      } else {
        setHasMoreResults(false);
      }
    } catch (error) {
      console.error('Error loading more results:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMoreResults, isLoadingMore, currentPage, nextPageTokens]);


  // Ref to track if search was cleared
  const searchClearedRef = useRef(false);

  // Default gallery state (videos shown when no search results)
  type DefaultVideoItem = VideoDetails & { index_id: string };
  const [defaultVideos, setDefaultVideos] = useState<DefaultVideoItem[]>([]);
  const [isLoadingDefault, setIsLoadingDefault] = useState<boolean>(false);
  const [defaultError, setDefaultError] = useState<string | null>(null);

  const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID as string | undefined;
  const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID as string | undefined;

  // Image search state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 50,
    height: 50,
    x: 25,
    y: 25
  });
  const [completedCrop, setCompletedCrop] = useState<Crop | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Search input ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        setImageFile(file);
        setImageUrl('');
        setImageSrc(URL.createObjectURL(file));
        setIsCropModalOpen(true);
        setIsImageModalOpen(false);
        setImageError(null);
      }
    },
    onDropRejected: (fileRejections) => {
      const error = fileRejections[0]?.errors[0]?.message || 'Invalid file';
      setImageError(error);
    }
  });


  // Clear search state
  const clearSearch = useCallback(() => {
    console.log('🔍 clearSearch called');
    searchClearedRef.current = true; // Mark that search was cleared
    setSearchQuery('');
    setImageFile(null);
    setImageUrl('');
    setImageSrc('');
    setEnhancedResults([]);
    setTotalResults({ all: 0, brands: 0, creators: 0 });
    setHasSearched(false);
    setActiveFilters([]);
    setActiveFilter('all');
    setCurrentPage(1);
    setHasMoreResults(false);
    setNextPageTokens({});
    setIsLoadingMore(false);
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    console.log('🔍 clearSearch completed - enhancedResults and filters should be empty');
  }, []);

  // Fetch default videos (shown when no search results)
  const fetchDefaultVideos = async () => {
    try {
      setIsLoadingDefault(true);
      setDefaultError(null);
      setDefaultVideos([]);

      if (!brandIndexId || !creatorIndexId) {
        setDefaultError('Missing index configuration');
        return;
      }

      // Fetch both in parallel and merge
      const [brandRes, creatorRes] = await Promise.all([
        axios.get('/api/videos', { params: { index_id: brandIndexId, limit: 12, page: 1 } }),
        axios.get('/api/videos', { params: { index_id: creatorIndexId, limit: 12, page: 1 } })
      ]);

      const brandItems: DefaultVideoItem[] = (brandRes.data?.data || []).map((v: VideoDetails) => ({ ...v, index_id: brandIndexId }));
      const creatorItems: DefaultVideoItem[] = (creatorRes.data?.data || []).map((v: VideoDetails) => ({ ...v, index_id: creatorIndexId }));

      // Merge without additional sorting to preserve API order
      setDefaultVideos([...brandItems, ...creatorItems]);
    } catch (error) {
      console.error('Error fetching default videos:', error);
      setDefaultError('Failed to load videos');
    } finally {
      setIsLoadingDefault(false);
    }
  };

  // Handle text search
  const handleTextSearch = async () => {
    if (!searchQuery.trim()) return;

    console.log('🔍 handleTextSearch called with query:', searchQuery);
    searchClearedRef.current = false; // Reset the cleared flag
    setIsSearching(true);
    setError(null); // Clear any previous errors
    setEnhancedResults([]);
    setHasSearched(true); // Mark that a search has been performed

    try {
      const response = await axios.post('/api/search/text', {
        query: searchQuery,
        scope: 'all',
        page_limit: 24
      });

      if (response.data && response.data.data) {
        console.log('🔍 Search response received:');
        console.log('  - Total items:', response.data.data.length);
        console.log('  - Response structure:', {
          hasData: !!response.data.data,
          dataLength: response.data.data.length,
          firstItem: response.data.data[0] ? {
            video_id: response.data.data[0].video_id,
            index_id: response.data.data[0].index_id,
            confidence: response.data.data[0].confidence
          } : null
        });

        // Separate results by index
        const allResults: SearchResult[] = [];
        const brandResults: SearchResult[] = [];
        const creatorResults: SearchResult[] = [];

        response.data.data.forEach((result: SearchResult) => {
          allResults.push(result);

          // Check if result is from brand index or creator index
          if (result.index_id === process.env.NEXT_PUBLIC_BRAND_INDEX_ID) {
            brandResults.push(result);
          } else if (result.index_id === process.env.NEXT_PUBLIC_CREATOR_INDEX_ID) {
            creatorResults.push(result);
          }
        });

        console.log('🔍 Results separated:');
        console.log('  - All results:', allResults.length);
        console.log('  - Brand results:', brandResults.length);
        console.log('  - Creator results:', creatorResults.length);
        console.log('  - Brand index ID:', process.env.NEXT_PUBLIC_BRAND_INDEX_ID);
        console.log('  - Creator index ID:', process.env.NEXT_PUBLIC_CREATOR_INDEX_ID);

        // 🔧 NEW: Extract and store total results from API response
        const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID;
        const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID;

        let totalBrands = 0;
        let totalCreators = 0;

        // Extract total results from pageInfoByIndex
        if (response.data.pageInfoByIndex) {
          const pageInfo = response.data.pageInfoByIndex;
          totalBrands = pageInfo[brandIndexId!]?.total_results || 0;
          totalCreators = pageInfo[creatorIndexId!]?.total_results || 0;
        }

        const totalAll = totalBrands + totalCreators;

        console.log('🔍 Total results from API:');
        console.log('  - Total all:', totalAll);
        console.log('  - Total brands:', totalBrands);
        console.log('  - Total creators:', totalCreators);
        console.log('  - Page info:', response.data.pageInfoByIndex);

        setTotalResults({
          all: totalAll,
          brands: totalBrands,
          creators: totalCreators
        });

        // 🔧 PERFORMANCE FIX: Single state update
        setEnhancedResults(allResults);
        setCurrentPage(1);
        setNextPageTokens(response.data.nextPageTokens || {});

        // Use server's hasMore information if available, otherwise fallback to client logic
        const serverHasMore = response.data.hasMore;
        const clientHasMore = allResults.length >= itemsPerPage &&
                             (brandResults.length === itemsPerPage || creatorResults.length === itemsPerPage);
        const hasMore = serverHasMore !== undefined ? serverHasMore : clientHasMore;

        setHasMoreResults(hasMore);

        console.log('🔍 Pagination state set:');
        console.log('  - Current page:', 1);
        console.log('  - Items per page:', itemsPerPage);
        console.log('  - Server hasMore:', serverHasMore);
        console.log('  - Client hasMore:', clientHasMore);
        console.log('  - Final hasMore:', hasMore);
        console.log('  - Brand results count:', brandResults.length);
        console.log('  - Creator results count:', creatorResults.length);

        // Fetch video details for all results
        await fetchVideoDetailsForResults(allResults);
      }
    } catch (error) {
      console.error('Error performing text search:', error);

      // Show user-friendly error message
      if (error instanceof Error) {
        if (error.message.includes('500')) {
          setError('Search service is temporarily unavailable. Please try again in a few moments.');
        } else if (error.message.includes('429')) {
          setError('Too many requests. Please wait a moment before searching again.');
        } else if (error.message.includes('401')) {
          setError('Authentication error. Please contact support.');
        } else {
          setError('Search failed. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  };


  // Fetch video details for search results
  const fetchVideoDetailsForResults = async (results: SearchResult[], isLoadMore = false) => {
    console.log('🔍 fetchVideoDetailsForResults called with', results.length, 'results, isLoadMore:', isLoadMore);
    try {
      const updatedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const indexId = result.index_id;
            const videoDetails = await fetchVideoDetails(result.video_id, indexId);

            // Determine format based on width and height
            let format: 'vertical' | 'horizontal' | undefined;
            if (videoDetails.system_metadata?.width && videoDetails.system_metadata?.height) {
              format = videoDetails.system_metadata.width >= videoDetails.system_metadata.height
                ? 'horizontal'
                : 'vertical';
            }

            return { ...result, videoDetails, format };
          } catch (error) {
            console.error(`Error fetching details for video ${result.video_id}:`, error);
            return result;
          }
        })
      );

      // Check if search was cleared while we were fetching details
      if (searchClearedRef.current) {
        console.log('🔍 Search was cleared while fetching details, skipping update');
        return;
      }

      if (!isLoadMore) {
        // Only update enhancedResults for initial search, not for load more
        console.log('🔍 fetchVideoDetailsForResults completed, updating enhancedResults with', updatedResults.length, 'items');
        setEnhancedResults(updatedResults);
      } else {
        console.log('🔍 fetchVideoDetailsForResults completed for load more, not updating enhancedResults directly');
      }

      return updatedResults;
    } catch (error) {
      console.error('Error fetching video details:', error);
      return null;
    }
  };
  // 🔧 PERFORMANCE FIX: Memoize format filter toggle
  const toggleFormatFilter = useCallback((filter: FacetFilter) => {
    console.log('🔍 toggleFormatFilter called:', filter);
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  }, []);


  // 🔧 PERFORMANCE FIX: Memoize filtered and sorted results
  const filteredResults = useMemo(() => {
    console.log('🔍 Filtering results - enhancedResults.length:', enhancedResults.length, 'activeFilter:', activeFilter, 'activeFilters:', activeFilters);

    let results = enhancedResults;

    // Apply index-based filters (all/brands/creators)
    if (activeFilter !== 'all') {
      const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID;
      const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID;

      results = results.filter(result => {
        if (activeFilter === 'brands') return result.index_id === brandIndexId;
        if (activeFilter === 'creators') return result.index_id === creatorIndexId;
        return true;
      });
    }

    // Apply format filters (vertical/horizontal)
    if (activeFilters.length > 0) {
      const formatFilters = activeFilters.filter(
        (f): f is FormatFilter => f === 'vertical' || f === 'horizontal'
      );

      if (formatFilters.length > 0) {
        results = results.filter(result => {
          if (!result.format) return false;
          return formatFilters.includes(result.format);
        });
      }
    }

    // 🔧 NEW: Sort by confidence (high -> medium -> low) and then by score
    return results.sort((a, b) => {
      // Define confidence priority (higher number = higher priority)
      const getConfidencePriority = (confidence: string) => {
        switch (confidence.toLowerCase()) {
          case 'high': return 3;
          case 'medium': return 2;
          case 'low': return 1;
          default: return 0;
        }
      };

      const confidenceDiff = getConfidencePriority(b.confidence) - getConfidencePriority(a.confidence);

      // If confidence is the same, sort by score (higher score first)
      if (confidenceDiff === 0) {
        return (b.score || 0) - (a.score || 0);
      }

      return confidenceDiff;
    });
  }, [enhancedResults, activeFilter, activeFilters]);


  // Handle crop completion
  const handleCropComplete = (crop: Crop) => {
    setCompletedCrop(crop);
  };

  // Get cropped image
  const getCroppedImg = async (): Promise<File | null> => {
    if (!completedCrop || !imgRef.current) return null;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    // Ensure minimum dimensions for the cropped area
    const cropWidth = Math.max(completedCrop.width || 0, 100);
    const cropHeight = Math.max(completedCrop.height || 0, 100);

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    ctx.drawImage(
      image,
      (completedCrop.x || 0) * scaleX,
      (completedCrop.y || 0) * scaleY,
      (completedCrop.width || 0) * scaleX,
      (completedCrop.height || 0) * scaleY,
      0,
      0,
      cropWidth,
      cropHeight
    );

    return new Promise((resolve) => {
      canvas.toBlob(blob => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], imageFile?.name || 'cropped-image.jpg', {
          type: 'image/jpeg'
        });
        resolve(file);
      }, 'image/jpeg');
    });
  };

  // Apply crop and search
  const applyCropAndSearch = async () => {
    const croppedFile = await getCroppedImg();
    if (croppedFile) {
      setImageFile(croppedFile);
      setIsCropModalOpen(false);
      setImageSrc(URL.createObjectURL(croppedFile));

      // Automatically search with the cropped image
      setIsSearching(true);
      setEnhancedResults([]);
      setHasSearched(true); // Mark that a search has been performed

      try {
        const formData = new FormData();
        formData.append('scope', 'all');
        formData.append('file', croppedFile);

        const response = await axios.post('/api/search/image', formData);

        if (response.data && response.data.data) {
          // Separate results by index for image search too
          const allResults: SearchResult[] = [];
          const brandResults: SearchResult[] = [];
          const creatorResults: SearchResult[] = [];

          response.data.data.forEach((result: SearchResult) => {
            allResults.push(result);

            // Check if result is from brand index or creator index
            if (result.index_id === process.env.NEXT_PUBLIC_BRAND_INDEX_ID) {
              brandResults.push(result);
            } else if (result.index_id === process.env.NEXT_PUBLIC_CREATOR_INDEX_ID) {
              creatorResults.push(result);
            }
          });

          // 🔧 NEW: Extract total results for image search too
          const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID;
          const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID;

          let totalBrands = 0;
          let totalCreators = 0;

          if (response.data.pageInfoByIndex) {
            const pageInfo = response.data.pageInfoByIndex;
            totalBrands = pageInfo[brandIndexId!]?.total_results || 0;
            totalCreators = pageInfo[creatorIndexId!]?.total_results || 0;
          }

          const totalAll = totalBrands + totalCreators;

          setTotalResults({
            all: totalAll,
            brands: totalBrands,
            creators: totalCreators
          });

          // 🔧 PERFORMANCE FIX: Single state update
          setEnhancedResults(allResults);

          // Fetch video details
          fetchVideoDetailsForResults(allResults);
        }
      } catch (error) {
        console.error('Error performing image search:', error);
      } finally {
        setIsSearching(false);
      }
    }
  };

  // Handle URL input for image search
  const handleImageUrlInput = () => {
    if (!imageUrl) return;

    setImageFile(null);
    setImageSrc(`/api/proxy-image?url=${encodeURIComponent(imageUrl)}`);
    setIsCropModalOpen(true);
    setIsImageModalOpen(false);
  };

  // Open video modal
  const openVideoModal = (result: SearchResult) => {
    if (!result.videoDetails?.hls?.video_url) return;

    setSelectedVideo({
      videoId: result.video_id,
      videoUrl: result.videoDetails.hls.video_url,
      title: result.videoDetails.system_metadata?.filename ||
             result.videoDetails.system_metadata?.video_title ||
             `Video ${result.video_id}`,
      start: result.start,
      end: result.end
    });
  };

  // Open video modal for default gallery videos
  const openDefaultVideoModal = (video: DefaultVideoItem) => {
    if (!video?.hls?.video_url) return;
    setSelectedVideo({
      videoId: video._id,
      videoUrl: video.hls.video_url,
      title: video.system_metadata?.filename || video.system_metadata?.video_title || `Video ${video._id}`,
    });
  };

  // 🔧 PERFORMANCE FIX: Memoize confidence class function
  const getConfidenceClass = useCallback((confidence: string) => {
    switch (confidence.toLowerCase()) {
      case 'high':
        return 'bg-green-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  }, []);

  // 🔧 PERFORMANCE FIX: Memoize format time function
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 🔧 PERFORMANCE FIX: Use useInView hook for infinite scroll trigger
  useEffect(() => {
    if (inView && !isLoadingMore && hasMoreResults) {
      console.log('🔍 Intersection observer triggered - loading more results');
      loadMoreResults();
    }
  }, [inView, isLoadingMore, hasMoreResults, loadMoreResults]);

  // Load default videos on initial load
  React.useEffect(() => {
    fetchDefaultVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white">
      <main className="container mx-auto px-4 py-8">
        {/* Description */}
        {description && (
          <div className="mb-8 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
            <p className="text-gray-700">{description}</p>
          </div>
        )}

        {/* Search Controls */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">

            {/* Search Input */}
            <div className="flex-1 w-full md:w-auto">
              <div className="relative flex items-center">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search videos..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTextSearch();
                  }}
                />
                {/* Clear search button */}
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-20 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleTextSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className={clsx(
                    'px-4 py-2 rounded-r-lg',
                    isSearching || !searchQuery.trim()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  {isSearching ? (
                    <span className="flex items-center">
                      <LoadingSpinner size="sm" className="mr-2" />
                      Searching...
                    </span>
                  ) : (
                    'Search'
                  )}
                </button>
              </div>
            </div>

            {/* Search by Image Button */}
            <button
              onClick={() => setIsImageModalOpen(true)}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
              Search by Image
            </button>
          </div>

          {/* Active Search Indicator */}
          {imageSrc && (
            <div className="mt-4 flex items-center bg-blue-50 p-2 rounded-lg">
              <div className="w-12 h-12 overflow-hidden rounded-md mr-3">
                <img src={imageSrc} alt="Search" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-700">
                  Searching with {imageFile ? imageFile.name : 'image'}
                </p>
              </div>
              <button
                onClick={() => {
                  setImageFile(null);
                  setImageUrl('');
                  setImageSrc('');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Simple Filters */}
        {enhancedResults.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Filters</h2>
            <div className="flex flex-wrap gap-2">
              {/* All Results */}
              <button
                onClick={() => toggleFilter('all')}
                className={clsx(
                  'px-3 py-1 text-sm rounded-full transition-colors',
                  activeFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                All ({totalResults.all > 0 ? totalResults.all : enhancedResults.length})
              </button>

              {/* Brand Results */}
              {(totalResults.brands > 0 || enhancedResults.some(r => r.index_id === brandIndexId)) && (
                <button
                  onClick={() => toggleFilter('brands')}
                  className={clsx(
                    'px-3 py-1 text-sm rounded-full transition-colors',
                    activeFilter === 'brands'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Brands ({totalResults.brands > 0 ? totalResults.brands : enhancedResults.filter(r => r.index_id === brandIndexId).length})
                </button>
              )}

              {/* Creator Results */}
              {(totalResults.creators > 0 || enhancedResults.some(r => r.index_id === creatorIndexId)) && (
                <button
                  onClick={() => toggleFilter('creators')}
                  className={clsx(
                    'px-3 py-1 text-sm rounded-full transition-colors',
                    activeFilter === 'creators'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  )}
                >
                  Creators ({totalResults.creators > 0 ? totalResults.creators : enhancedResults.filter(r => r.index_id === creatorIndexId).length})
                </button>
              )}

              {/* Format Filters */}
              <button
                onClick={() => toggleFormatFilter('vertical')}
                className={clsx(
                  'px-3 py-1 text-sm rounded-full',
                  activeFilters.includes('vertical')
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                )}
              >
                Vertical
              </button>
              <button
                onClick={() => toggleFormatFilter('horizontal')}
                className={clsx(
                  'px-3 py-1 text-sm rounded-full',
                  activeFilters.includes('horizontal')
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                )}
              >
                Horizontal
              </button>

              {/* Clear All Button */}
              {activeFilters.length > 0 && (
                <button
                  onClick={() => {
                    setActiveFilters([]);
                  }}
                  className="px-3 py-1 text-sm rounded-full bg-red-100 text-red-800 hover:bg-red-200"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Search Results or Default Gallery */}
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {isSearching ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="lg" />
            </div>
          ) : filteredResults.length > 0 ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">
                    Search Results
                  </h2>

                </div>
                <button
                  onClick={clearSearch}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Clear Search
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredResults.map((result, index) => (
                  <VideoCard
                    key={`${result.video_id}-${result.start}-${index}`}
                    result={result}
                    index={index}
                    brandIndexId={brandIndexId}
                    onVideoClick={openVideoModal}
                    formatTime={formatTime}
                    getConfidenceClass={getConfidenceClass}
                  />
                ))}
              </div>

              {/* Infinite Scroll Trigger */}
              {hasMoreResults && (
                <div ref={observerRef} className="mt-8 flex justify-center">
                  {isLoadingMore ? (
                    <div className="flex items-center gap-2 px-6 py-3 text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      Loading more results...
                    </div>
                  ) : (
                    <div className="text-gray-400 text-sm">
                      Scroll down to load more results
                    </div>
                  )}
                </div>
              )}

              {/* No more results indicator */}
              {!hasMoreResults && filteredResults.length > 0 && (
                <div className="mt-8 text-center py-4 text-gray-500">
                  End of results - {filteredResults.length} videos shown
                </div>
              )}
            </div>
          ) : hasSearched ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-lg font-medium mb-2">{enhancedResults.length > 0 ? 'No results match the selected filters' : 'No search results found'}</p>
              <p className="text-sm text-gray-400">{enhancedResults.length > 0 ? 'Try clearing or changing filters' : 'Try adjusting your search query or scope'}</p>
              {enhancedResults.length > 0 && (
                <button
                  onClick={() => setActiveFilters([])}
                  className="mt-3 px-3 py-1 text-sm rounded-full bg-gray-200 text-gray-800 hover:bg-gray-300"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  All Videos ({defaultVideos.length})
                </h2>
                <button
                  onClick={() => fetchDefaultVideos()}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Refresh
                </button>
              </div>

              {isLoadingDefault ? (
                <div className="flex justify-center items-center h-64">
                  <LoadingSpinner size="lg" />
                </div>
              ) : defaultError ? (
                <div className="flex justify-center items-center h-32 text-red-600 text-sm">{defaultError}</div>
              ) : defaultVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p>No videos to display</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {defaultVideos.map((video) => (
                    <div
                      key={`${video._id}-${video.index_id}`}
                      className="relative rounded-lg overflow-hidden shadow-md cursor-pointer transform transition hover:scale-[1.02]"
                      onClick={() => openDefaultVideoModal(video)}
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-video">
                        <img
                          src={video.hls?.thumbnail_urls?.[0] || '/videoFallback.jpg'}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover"
                        />

                        {/* Index Badge */}
                        <div className="absolute top-2 right-2">
                          <span className={clsx(
                            'px-2 py-1 text-xs font-bold text-white rounded-md',
                            video.index_id === brandIndexId ? 'bg-purple-600' : 'bg-green-600'
                          )}>
                            {video.index_id === brandIndexId ? 'Brand' : 'Creator'}
                          </span>
                        </div>

                        {/* Duration */}
                        <div className="absolute bottom-2 right-2">
                          <span className="px-2 py-1 text-xs font-bold text-white bg-black bg-opacity-60 rounded-md">
                            {formatTime(Math.floor(video.system_metadata?.duration || 0))}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <div className="p-2">
                        <h3 className="text-sm font-medium truncate">
                          {video.system_metadata?.filename || video.system_metadata?.video_title || `Video ${video._id}`}
                        </h3>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ErrorBoundary>
      </main>

      {/* Image Upload Modal */}
      {isImageModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Search by Image</h2>
              <button
                onClick={() => setIsImageModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {imageError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
                {imageError}
              </div>
            )}

            <div
              {...getRootProps()}
              className={clsx(
                'border-2 border-dashed rounded-lg p-6 mb-4 flex flex-col items-center justify-center cursor-pointer',
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
              )}
            >
              <input {...getInputProps()} />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-600 text-center">
                Drag & drop an image here, or click to select
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supported formats: JPG, PNG (max 5MB)
              </p>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Or enter an image URL:</p>
              <div className="flex">
                <input
                  type="text"
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <button
                  onClick={handleImageUrlInput}
                  disabled={!imageUrl}
                  className={clsx(
                    'px-4 py-2 rounded-r-lg',
                    !imageUrl
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  Load
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Crop Modal */}
      {isCropModalOpen && imageSrc && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Crop Image</h2>
              <button
                onClick={() => setIsCropModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 bg-gray-100 p-2 rounded-lg">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={handleCropComplete}
                aspect={undefined}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Upload"
                  className="max-w-full max-h-[60vh] mx-auto"
                  crossOrigin="anonymous"
                />
              </ReactCrop>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCropModalOpen(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={applyCropAndSearch}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Crop & Search
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Video Modal */}
      {selectedVideo && (
        <VideoModalSimple
          videoUrl={selectedVideo.videoUrl}
          videoId={selectedVideo.videoId}
          isOpen={!!selectedVideo}
          onClose={() => setSelectedVideo(null)}
          title={selectedVideo.title}
          startTime={selectedVideo.start}
          endTime={selectedVideo.end}
        />
      )}
    </div>
  );
}
