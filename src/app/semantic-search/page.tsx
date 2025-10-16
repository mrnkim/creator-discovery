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
  getConfidenceStyle: (confidence: string) => { backgroundColor: string };
}>(({ result, index, brandIndexId, onVideoClick, formatTime, getConfidenceClass, getConfidenceStyle }) => {

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

        {/* Index Badge - top left */}
        <div className="absolute top-3 left-6 z-10">
          <span className={clsx(
            'px-2 py-1 text-xs font-bold text-black rounded-xl',
            result.index_id === brandIndexId ? 'bg-custom-green' : 'bg-custom-orange'
          )}>
            {result.index_id === brandIndexId ? 'Brand' : 'Creator'}
          </span>
        </div>

        {/* Confidence Badge - top right */}
        <div className="absolute top-3 right-6 z-10">
          <span
            className={clsx(
              'px-2 py-1 text-xs font-bold rounded-xl border border-white',
              getConfidenceClass(result.confidence)
            )}
            style={getConfidenceStyle(result.confidence)}
          >
            {result.confidence}
          </span>
        </div>

        {/* Time Range - bottom center */}
        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 z-10">
          <span className="px-2 py-1 text-xs font-bold text-white bg-transparent border border-white rounded-md">
            {formatTime(result.start)} - {formatTime(result.end)}
          </span>
        </div>

        {/* Format Badge - bottom right */}
        {result.format && (
          <div className="absolute bottom-3 right-6 z-10">
            <div className="px-2 py-1 bg-white opacity-70 rounded-xl">
              {result.format === 'vertical' ? (
                // Vertical (portrait) icon - rectangle with vertical orientation
                <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="3" width="12" height="18" rx="2" />
                </svg>
              ) : (
                // Horizontal (landscape) icon - rectangle with horizontal orientation
                <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                </svg>
              )}
            </div>
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
    videoDetails?: VideoDetails;
    indexId?: string;
    confidence?: string;
    score?: number;
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
    setActiveFilter(filter);
  }, []);

  // 🔧 PERFORMANCE FIX: Simplified load more results function based on reference code
  const loadMoreResults = useCallback(async () => {

    if (!hasMoreResults || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const brandIndexId = process.env.NEXT_PUBLIC_BRAND_INDEX_ID;
      const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID;

      const brandToken = nextPageTokens[brandIndexId!];
      const creatorToken = nextPageTokens[creatorIndexId!];
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
        setHasMoreResults(false);
        return;
      }

      const responses = await Promise.all(requests);
      const newResults: SearchResult[] = [];
      const newTokens: Record<string, string | null> = { ...nextPageTokens };

      responses.forEach(({ indexId, data }) => {
        if (data && data.data && indexId) {
          newResults.push(...data.data);
          newTokens[indexId] = data.pageInfo?.next_page_token || null;
        }
      });

      // Fetch video details for new results
      const newResultsWithDetails = await fetchVideoDetailsForResults(newResults, true);

      if (newResultsWithDetails && newResultsWithDetails.length > 0) {

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
      const allDefaultVideos = [...brandItems, ...creatorItems];

      // Fetch detailed information for each video to get user_metadata
      const detailedVideos = await Promise.all(
        allDefaultVideos.map(async (video) => {
          try {
            const videoDetails = await fetchVideoDetails(video._id, video.index_id);
            return { ...video, ...videoDetails };
          } catch (error) {
            console.error(`Error fetching details for default video ${video._id}:`, error);
            return video; // Return original video if details fetch fails
          }
        })
      );

      setDefaultVideos(detailedVideos);
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

        // Fetch video details for all results
        await fetchVideoDetailsForResults(allResults);
      } else {
        setEnhancedResults([]);
        setTotalResults({ all: 0, brands: 0, creators: 0 });
        setHasMoreResults(false);
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
    try {
      const updatedResults = await Promise.all(
        results.map(async (result, index) => {
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

      if (!isLoadMore) {
        // Only update enhancedResults for initial search, not for load more
        setEnhancedResults(updatedResults);
      }

      return updatedResults;
    } catch (error) {
      console.error('Error fetching video details:', error);
      return null;
    }
  };
  // 🔧 PERFORMANCE FIX: Memoize format filter toggle
  const toggleFormatFilter = useCallback((filter: FacetFilter) => {
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


  // Apply crop and search (or search with original if no crop)
  const applyCropAndSearch = async () => {
    let fileToSearch: File;

    // Check if crop is applied and has valid dimensions
    if (completedCrop && completedCrop.width && completedCrop.height && completedCrop.width > 0 && completedCrop.height > 0) {
      // Use cropped image
      const croppedFile = await getCroppedImg();
      if (!croppedFile) return;

      fileToSearch = croppedFile;
      setImageFile(croppedFile);
      setImageSrc(URL.createObjectURL(croppedFile));
    } else {
      // Use original image
      if (imageFile) {
        fileToSearch = imageFile;
      } else if (imageUrl) {
        // Handle URL-based image by converting to File
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const fileName = imageUrl.split('/').pop() || 'image.jpg';
          fileToSearch = new File([blob], fileName, { type: blob.type });
        } catch (error) {
          console.error('Error fetching image from URL:', error);
          return;
        }
      } else {
        return;
      }
    }

    setIsCropModalOpen(false);

    // Search with the selected image (cropped or original)
    setIsSearching(true);
    setEnhancedResults([]);
    setHasSearched(true); // Mark that a search has been performed
    setNextPageTokens({}); // Clear pagination tokens from previous text search

    try {
      const formData = new FormData();
      formData.append('scope', 'all');
      formData.append('file', fileToSearch);

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

        // Extract total results for image search too
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

        // Single state update
        setEnhancedResults(allResults);

        // Fetch video details
        await fetchVideoDetailsForResults(allResults);
      }
    } catch (error) {
      console.error('Error performing image search:', error);
    } finally {
      setIsSearching(false);
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
      end: result.end,
      videoDetails: result.videoDetails,
      indexId: result.index_id,
      confidence: result.confidence,
      score: result.score
    });
  };

  // Open video modal for default gallery videos
  const openDefaultVideoModal = (video: DefaultVideoItem) => {
    if (!video?.hls?.video_url) return;
    setSelectedVideo({
      videoId: video._id,
      videoUrl: video.hls.video_url,
      title: video.system_metadata?.filename || video.system_metadata?.video_title || `Video ${video._id}`,
      videoDetails: video,
      indexId: video.index_id,
    });
  };

  // 🔧 PERFORMANCE FIX: Memoize confidence class function
  const getConfidenceClass = useCallback((confidence: string) => {
    switch (confidence.toLowerCase()) {
      case 'high':
        return 'text-white';
      case 'medium':
        return 'text-white';
      case 'low':
        return 'text-white';
      default:
        return 'text-white';
    }
  }, []);

  const getConfidenceStyle = useCallback((confidence: string) => {
    switch (confidence.toLowerCase()) {
      case 'high':
        return { backgroundColor: '#30710d' };
      case 'medium':
        return { backgroundColor: '#826213' };
      case 'low':
        return { backgroundColor: '#484746' };
      default:
        return { backgroundColor: '#30710d' };
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
      loadMoreResults();
    }
  }, [inView, isLoadingMore, hasMoreResults, loadMoreResults]);

  // Load default videos on initial load
  React.useEffect(() => {
    fetchDefaultVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-zinc-100">
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
              <form onSubmit={(e) => { e.preventDefault(); handleTextSearch(); }} className="w-full">
                <div className="self-stretch h-14 px-3 bg-gray-200 rounded-2xl inline-flex justify-start items-center gap-2.5 overflow-hidden w-full">
                  <div className="flex-1 self-stretch px-3 flex justify-start items-center gap-5">
                    {/* left area - search icon */}
                    <button
                      type="button"
                      onClick={handleTextSearch}
                      className="flex justify-start items-center cursor-pointer hover:opacity-70 transition-opacity"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-stone-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>

                    {/* input field */}
                    <div className="flex-1 flex items-center relative">
                      <input
                        type="text"
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-transparent border-none focus:outline-none text-stone-900 text-xl font-normal leading-7 tracking-tight placeholder-black pr-8"
                        placeholder="What are you looking for?"
                      />

                      {/* Custom X button - show only when there is a search term */}
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={clearSearch}
                          className="absolute right-0 flex items-center justify-center w-8 h-8 cursor-pointer"
                        >
                          <svg
                            className="w-5 h-5 text-stone-900"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Search by Image Button */}
            <button
              onClick={() => setIsImageModalOpen(true)}
              className="h-14 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-2xl flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
              </svg>
              Search by Image
            </button>
          </div>

          {/* Active Search Indicator */}
          {imageSrc && (
            <div className="mt-4 flex items-center bg-gray-300 p-2 rounded-lg">
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
                  setCompletedCrop(null);
                  setCrop({
                    unit: '%',
                    width: 50,
                    height: 50,
                    x: 25,
                    y: 25
                  });
                  // Clear search results and reset to default state
                  setEnhancedResults([]);
                  setHasSearched(false);
                  setActiveFilter('all');
                  setActiveFilters([]);
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
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold">Filters</h2>
              <button
                onClick={() => {
                  setActiveFilters([]);
                  setActiveFilter('all');
                }}
                className="text-sm text-gray-600 hover:text-gray-800"
              >
                Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* All Results */}
              <button
                onClick={() => toggleFilter('all')}
                className={clsx(
                  'px-3 py-1 text-sm rounded-full transition-colors',
                  activeFilter === 'all'
                    ? 'bg-gray-700 text-white'
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
                      ? 'bg-gray-700 text-white'
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
                      ? 'bg-gray-700 text-white'
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
                    ? 'bg-gray-700 text-white'
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
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                )}
              >
                Horizontal
              </button>
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
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  Search Results
                </h2>
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
                    getConfidenceStyle={getConfidenceStyle}
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
              <div className="mb-4">
                <h2 className="text-xl font-semibold">
                  All Videos ({defaultVideos.length})
                </h2>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {defaultVideos.map((video) => (
                    <div
                      key={`${video._id}-${video.index_id}`}
                      className="overflow-hidden cursor-pointer transition-all"
                      onClick={() => openDefaultVideoModal(video)}
                    >
                      <div className="aspect-video bg-gray-100 relative rounded-[45.60px]">
                        {video.hls?.thumbnail_urls?.[0] && (
                          <img
                            src={video.hls.thumbnail_urls[0]}
                            alt={video.system_metadata?.video_title || 'Video thumbnail'}
                            className="w-full h-full object-cover rounded-[45.60px]"
                          />
                        )}

                        {/* Index Badge - top left */}
                        <div className="absolute top-3 left-6 z-10">
                          <span className={clsx(
                            'px-2 py-1 text-xs rounded-xl font-bold',
                            video.index_id === brandIndexId ? 'bg-custom-green' : 'bg-custom-orange'
                          )}>
                            {video.index_id === brandIndexId ? 'Brand' : 'Creator'}
                          </span>
                        </div>

                        {/* Duration - bottom center */}
                        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 z-10">
                          <span className="px-2 py-0.5 text-xs font-bold text-white bg-black/30 border border-white rounded-md">
                            {formatTime(Math.floor(video.system_metadata?.duration || 0))}
                          </span>
                        </div>
                      </div>

                      {/* Video title below video */}
                      <div className="mt-2 px-3">
                        <h3 className="text-sm font-medium text-gray-800 truncate">
                          {video.system_metadata?.filename?.replace(/\.mp4$/i, '') ||
                           video.system_metadata?.video_title ||
                           `Video ${video._id}`}
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
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Upload image</h2>
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

            {/* Drag and Drop Area */}
            <div
              {...getRootProps()}
              className={clsx(
                'border-2 border-dashed rounded-lg p-8 mb-6 flex flex-col items-center justify-center cursor-pointer bg-gray-50',
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
              )}
            >
              <input {...getInputProps()} />
              <div className="flex items-center justify-center w-16 h-16 bg-gray-200 rounded-full mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-800 mb-4">
                Drop an image or browse file
              </p>

              {/* Supported formats badges */}
              <div className="flex flex-wrap gap-2 justify-center">
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                  .png, .jpeg
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                  Dimension &gt; 64x64px
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                  File size ≤ 5 MB
                </span>
              </div>
            </div>

            {/* Divider with "Or" */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            {/* Image URL Input */}
            <div className="mb-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Drop an image link"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleImageUrlInput}
                  disabled={!imageUrl}
                  className={clsx(
                    'px-6 py-3 rounded-lg text-sm font-medium',
                    !imageUrl
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  Search
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
                Search
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
          videoDetails={selectedVideo.videoDetails}
          indexId={selectedVideo.indexId}
          confidence={selectedVideo.confidence}
          score={selectedVideo.score}
        />
      )}
    </div>
  );
}
