"use client";

import React, { useState, useRef } from 'react';
import axios from 'axios';
import clsx from 'clsx';
import ReactCrop, { Crop } from 'react-image-crop';
import { useDropzone } from 'react-dropzone';
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
    [key: string]: any;
  };
}

type SearchScope = 'all' | 'brand' | 'creator';

// Facet filter unions
type CategoryFilter = 'brand' | 'creator';
type FormatFilter = 'vertical' | 'horizontal';
type FacetFilter = CategoryFilter | FormatFilter;

interface SemanticSearchPageProps {
  description?: string;
}

export default function SemanticSearchPage({ description }: SemanticSearchPageProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false); // Track if a search has been performed
  const [activeFilters, setActiveFilters] = useState<FacetFilter[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<{
    videoId: string;
    videoUrl: string;
    title: string;
    start?: number;
    end?: number;
  } | null>(null);

  // Dynamic filter states
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);
  const [availableCreators, setAvailableCreators] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState(false);
  const [isCreatorFilterOpen, setIsCreatorFilterOpen] = useState(false);


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

  // Extract brands and creators from search results
  const extractFiltersFromResults = (results: SearchResult[]) => {
    const brands = new Set<string>();
    const creators = new Set<string>();

    console.log('🔍 Extracting filters from results:', results.length, 'results');

    results.forEach((result, index) => {
      if (result.videoDetails) {
        console.log(`🔍 Result ${index}:`, {
          filename: result.videoDetails.system_metadata?.filename,
          videoTitle: result.videoDetails.system_metadata?.video_title,
          userMetadata: result.videoDetails.user_metadata
        });

        // Extract brands from brand_product_events in user metadata
        const brandProductEvents = result.videoDetails.user_metadata?.brand_product_events;
        if (brandProductEvents) {
          try {
            const events = JSON.parse(brandProductEvents);
            if (Array.isArray(events)) {
              events.forEach((event: any) => {
                if (event.brand) {
                  brands.add(event.brand);
                  console.log(`✅ Extracted brand from events: ${event.brand}`);
                }
              });
            }
          } catch (error) {
            console.log(`❌ Error parsing brand_product_events:`, error);
          }
        }

        // Fallback: Extract from filename if no brand events found for this video
        const filename = result.videoDetails.system_metadata?.filename || '';
        const videoTitle = result.videoDetails.system_metadata?.video_title || '';

        // Only add filename-based brand if no brand events were found
        if (!brandProductEvents) {
          const filenameMatch = filename.match(/^([^_.]+)/);
          if (filenameMatch) {
            const brand = filenameMatch[1].trim();
            brands.add(brand);
            console.log(`✅ Extracted brand from filename: ${brand}`);
          }
        }

        // Extract creator from user metadata
        const creator = result.videoDetails.user_metadata?.creator ||
                       result.videoDetails.user_metadata?.video_creator ||
                       result.videoDetails.user_metadata?.creator_id;
        if (creator) {
          creators.add(creator.toString());
          console.log(`✅ Extracted creator: ${creator}`);
        } else {
          console.log(`❌ No creator found in user metadata`);
        }
      } else {
        console.log(`❌ Result ${index} has no videoDetails`);
      }
    });

    console.log('🔍 Final extracted brands:', Array.from(brands));
    console.log('🔍 Final extracted creators:', Array.from(creators));

    setAvailableBrands(Array.from(brands).sort());
    setAvailableCreators(Array.from(creators).sort());

    // Set all brands and creators as selected by default
    setSelectedBrands(Array.from(brands));
    setSelectedCreators(Array.from(creators));
  };

  // Clear search state
  const clearSearch = () => {
    console.log('🔍 clearSearch called');
    searchClearedRef.current = true; // Mark that search was cleared
    setSearchQuery('');
    setImageFile(null);
    setImageUrl('');
    setImageSrc('');
    setSearchResults([]);
    setHasSearched(false); // Reset search state
    setActiveFilters([]); // Clear all active filters
    setAvailableBrands([]);
    setAvailableCreators([]);
    setSelectedBrands([]);
    setSelectedCreators([]);
    setIsBrandFilterOpen(false);
    setIsCreatorFilterOpen(false);
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    console.log('🔍 clearSearch completed - searchResults and filters should be empty');
  };

  // Fetch default videos for the selected scope (shown when no search results)
  const fetchDefaultVideos = async (scope: SearchScope) => {
    try {
      setIsLoadingDefault(true);
      setDefaultError(null);
      setDefaultVideos([]);

      if (!brandIndexId || !creatorIndexId) {
        setDefaultError('Missing index configuration');
        return;
      }

      if (scope === 'brand') {
        const { data } = await axios.get('/api/videos', {
          params: { index_id: brandIndexId, limit: 24, page: 1 }
        });
        const items: DefaultVideoItem[] = (data?.data || []).map((v: VideoDetails) => ({ ...v, index_id: brandIndexId }));
        setDefaultVideos(items);
        return;
      }

      if (scope === 'creator') {
        const { data } = await axios.get('/api/videos', {
          params: { index_id: creatorIndexId, limit: 24, page: 1 }
        });
        const items: DefaultVideoItem[] = (data?.data || []).map((v: VideoDetails) => ({ ...v, index_id: creatorIndexId }));
        setDefaultVideos(items);
        return;
      }

      // scope === 'all' → fetch both in parallel and merge
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
    setSearchResults([]);
    setHasSearched(true); // Mark that a search has been performed

    try {
      const response = await axios.post('/api/search/text', {
        query: searchQuery,
        scope: searchScope,
        page_limit: 24
      });

      if (response.data && response.data.data) {
        console.log('🔍 Search response received, setting searchResults:', response.data.data.length, 'items');
        setSearchResults(response.data.data);
        // Fetch video details first, then extract filters
        const resultsWithDetails = await fetchVideoDetailsForResults(response.data.data);
        if (resultsWithDetails) {
          extractFiltersFromResults(resultsWithDetails);
        }
      }
    } catch (error) {
      console.error('Error performing text search:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle image search
  const handleImageSearch = async () => {
    if (!imageFile && !imageUrl) return;

    setIsSearching(true);
    setSearchResults([]);
    setHasSearched(true); // Mark that a search has been performed

    try {
      const formData = new FormData();
      formData.append('scope', searchScope);

      if (imageFile) {
        formData.append('file', imageFile);
      } else if (imageUrl) {
        formData.append('query', imageUrl);
      }

      const response = await axios.post('/api/search/image', formData);

      if (response.data && response.data.data) {
        setSearchResults(response.data.data);
        // Fetch video details first, then extract filters
        const resultsWithDetails = await fetchVideoDetailsForResults(response.data.data);
        if (resultsWithDetails) {
          extractFiltersFromResults(resultsWithDetails);
        }
      }
    } catch (error) {
      console.error('Error performing image search:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch video details for search results
  const fetchVideoDetailsForResults = async (results: SearchResult[]) => {
    console.log('🔍 fetchVideoDetailsForResults called with', results.length, 'results');
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

      console.log('🔍 fetchVideoDetailsForResults completed, updating searchResults with', updatedResults.length, 'items');
      setSearchResults(updatedResults);
      return updatedResults;
    } catch (error) {
      console.error('Error fetching video details:', error);
      return null;
    }
  };
  // Toggle a filter
  const toggleFilter = (filter: FacetFilter) => {
    setActiveFilters(prev => {
      if (prev.includes(filter)) {
        return prev.filter(f => f !== filter);
      } else {
        return [...prev, filter];
      }
    });
  };

  // Toggle brand selection
  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => {
      if (prev.includes(brand)) {
        return prev.filter(b => b !== brand);
      } else {
        return [...prev, brand];
      }
    });
  };

  // Toggle creator selection
  const toggleCreator = (creator: string) => {
    setSelectedCreators(prev => {
      if (prev.includes(creator)) {
        return prev.filter(c => c !== creator);
      } else {
        return [...prev, creator];
      }
    });
  };

  // Select all brands
  const selectAllBrands = () => {
    setSelectedBrands([...availableBrands]);
  };

  // Select all creators
  const selectAllCreators = () => {
    setSelectedCreators([...availableCreators]);
  };

  // Clear all brand selections
  const clearAllBrands = () => {
    setSelectedBrands([]);
  };

  // Clear all creator selections
  const clearAllCreators = () => {
    setSelectedCreators([]);
  };

  // Filter results based on active filters and dynamic brand/creator filters
  const filteredResults = searchResults.filter(result => {
    // Apply format filters (vertical/horizontal)
    if (activeFilters.length > 0) {
      const formatFilters = activeFilters.filter(
        (f): f is FormatFilter => f === 'vertical' || f === 'horizontal'
      );

      if (formatFilters.length > 0 && result.format) {
        if (!formatFilters.includes(result.format)) {
          return false;
        }
      }
    }

    // Apply dynamic brand filters
    if (selectedBrands.length > 0 && result.videoDetails) {
      const brandProductEvents = result.videoDetails.user_metadata?.brand_product_events;
      let hasMatchingBrand = false;
      let hasAnyBrand = false;

      if (brandProductEvents) {
        try {
          const events = JSON.parse(brandProductEvents);
          if (Array.isArray(events)) {
            hasAnyBrand = events.length > 0;
            hasMatchingBrand = events.some((event: any) =>
              event.brand && selectedBrands.includes(event.brand)
            );
          }
        } catch (error) {
          console.log(`❌ Error parsing brand_product_events in filter:`, error);
        }
      }

      // Fallback: check filename if no brand events
      if (!hasAnyBrand) {
        const filename = result.videoDetails.system_metadata?.filename || '';
        const filenameMatch = filename.match(/^([^_.]+)/);
        if (filenameMatch) {
          const brand = filenameMatch[1].trim();
          hasAnyBrand = true;
          hasMatchingBrand = selectedBrands.includes(brand);
        }
      }

      // Only exclude if video has brand info but doesn't match selected brands
      if (hasAnyBrand && !hasMatchingBrand) {
        return false;
      }
      // If no brand info exists, keep the result (don't exclude creator videos)
    }

    // Apply dynamic creator filters
    if (selectedCreators.length > 0 && result.videoDetails) {
      const creator = result.videoDetails.user_metadata?.creator ||
                     result.videoDetails.user_metadata?.video_creator ||
                     result.videoDetails.user_metadata?.creator_id;

      if (creator && !selectedCreators.includes(creator.toString())) {
        // If creator exists but is not in selected list, exclude this result
        return false;
      }
      // If no creator exists, keep the result (don't exclude brand videos)
    }

    return true;
  });

  // Filtered results states for display - using useMemo instead of useState to avoid infinite loops
  const filteredBrands = React.useMemo(() => {
    const brandsInResults = new Set<string>();

    filteredResults.forEach(result => {
      if (result.videoDetails) {
        const brandProductEvents = result.videoDetails.user_metadata?.brand_product_events;
        if (brandProductEvents) {
          try {
            const events = JSON.parse(brandProductEvents);
            if (Array.isArray(events)) {
              events.forEach((event: any) => {
                if (event.brand) {
                  brandsInResults.add(event.brand);
                }
              });
            }
          } catch (error) {
            console.log(`❌ Error parsing brand_product_events in filteredBrands:`, error);
          }
        }
      }
    });

    return Array.from(brandsInResults).sort();
  }, [filteredResults]);

  const filteredCreators = React.useMemo(() => {
    const creatorsInResults = new Set<string>();

    filteredResults.forEach(result => {
      if (result.videoDetails) {
        const creator = result.videoDetails.user_metadata?.creator ||
                       result.videoDetails.user_metadata?.video_creator ||
                       result.videoDetails.user_metadata?.creator_id;
        if (creator) {
          creatorsInResults.add(creator.toString());
        }
      }
    });

    return Array.from(creatorsInResults).sort();
  }, [filteredResults]);

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
      setSearchResults([]);
      setHasSearched(true); // Mark that a search has been performed

      try {
        const formData = new FormData();
        formData.append('scope', searchScope);
        formData.append('file', croppedFile);

        const response = await axios.post('/api/search/image', formData);

        if (response.data && response.data.data) {
          setSearchResults(response.data.data);
          fetchVideoDetailsForResults(response.data.data);
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

  // Get confidence class based on confidence level
  const getConfidenceClass = (confidence: string) => {
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
  };

  // Format time (seconds to MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Load default videos on scope change (and initial load)
  React.useEffect(() => {
    fetchDefaultVideos(searchScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchScope]);

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
            {/* Scope Toggle */}
            <div className="flex items-center bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setSearchScope('all')}
                disabled={hasSearched}
                className={clsx(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  searchScope === 'all' ? 'bg-blue-600 text-white' : 'text-gray-700',
                  hasSearched && 'opacity-50 cursor-not-allowed'
                )}
              >
                All
              </button>
              <button
                onClick={() => setSearchScope('brand')}
                disabled={hasSearched}
                className={clsx(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  searchScope === 'brand' ? 'bg-blue-600 text-white' : 'text-gray-700',
                  hasSearched && 'opacity-50 cursor-not-allowed'
                )}
              >
                Brand
              </button>
              <button
                onClick={() => setSearchScope('creator')}
                disabled={hasSearched}
                className={clsx(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  searchScope === 'creator' ? 'bg-blue-600 text-white' : 'text-gray-700',
                  hasSearched && 'opacity-50 cursor-not-allowed'
                )}
              >
                Creator
              </button>
            </div>

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

        {/* Dynamic Filters */}
        {searchResults.length > 0 && (availableBrands.length > 0 || availableCreators.length > 0) && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Filters</h2>
            <div className="flex flex-wrap gap-2">
              {/* Brand Filter */}
              {availableBrands.length > 0 && (
                <button
                  onClick={() => setIsBrandFilterOpen(true)}
                  className={clsx(
                    'px-3 py-1 text-sm rounded-full flex items-center gap-1 transition-colors',
                    filteredBrands.length === 0
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : filteredBrands.length === availableBrands.length
                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  Brands {filteredBrands.length === 0 ? '(0)' : filteredBrands.length === availableBrands.length ? '(All)' : `(${filteredBrands.length}/${availableBrands.length})`}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Creator Filter */}
              {availableCreators.length > 0 && (
                <button
                  onClick={() => setIsCreatorFilterOpen(true)}
                  className={clsx(
                    'px-3 py-1 text-sm rounded-full flex items-center gap-1 transition-colors',
                    filteredCreators.length === 0
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : filteredCreators.length === availableCreators.length
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  )}
                >
                  Creators {filteredCreators.length === 0 ? '(0)' : filteredCreators.length === availableCreators.length ? '(All)' : `(${filteredCreators.length}/${availableCreators.length})`}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}

              {/* Format Filters */}
              <button
                onClick={() => toggleFilter('vertical')}
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
                onClick={() => toggleFilter('horizontal')}
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
              {(selectedBrands.length < availableBrands.length ||
                selectedCreators.length < availableCreators.length ||
                activeFilters.length > 0) && (
                <button
                  onClick={() => {
                    setSelectedBrands([...availableBrands]);
                    setSelectedCreators([...availableCreators]);
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

        {/* Search Results or Default Gallery */}
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {isSearching ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="lg" />
            </div>
          ) : searchResults.length > 0 ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">
                    Search Results ({filteredResults.length})
                  </h2>
                  <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full">
                    {searchScope === 'all' ? 'All Videos' : searchScope === 'brand' ? 'Brand Videos' : 'Creator Videos'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSearchResults([]);
                    setHasSearched(false);
                    setActiveFilters([]);
                  }}
                  className="text-sm text-gray-600 hover:text-gray-800 underline"
                >
                  Clear Search
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredResults.map((result, index) => (
                  <div
                    key={`${result.video_id}-${result.start}-${index}`}
                    className="relative rounded-lg overflow-hidden shadow-md cursor-pointer transform transition hover:scale-[1.02]"
                    onClick={() => openVideoModal(result)}
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
                ))}
              </div>
            </div>
          ) : hasSearched ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-lg font-medium mb-2">No search results found</p>
              <p className="text-sm text-gray-400">Try adjusting your search criteria or scope</p>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  {searchScope === 'all' ? 'All Videos' : searchScope === 'brand' ? 'Brand Videos' : 'Creator Videos'} ({defaultVideos.length})
                </h2>
                <button
                  onClick={() => fetchDefaultVideos(searchScope)}
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

      {/* Brand Filter Popup */}
      {isBrandFilterOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-96 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Brands</h3>
              <button
                onClick={() => setIsBrandFilterOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Select brands to filter videos. Creator videos will still be shown.
            </p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={selectAllBrands}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
              >
                Select All
              </button>
              <button
                onClick={clearAllBrands}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
              >
                Clear All
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {availableBrands.map(brand => (
                <label key={brand} className="flex items-center py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBrands.includes(brand)}
                    onChange={() => toggleBrand(brand)}
                    className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">{brand}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => setIsBrandFilterOpen(false)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creator Filter Popup */}
      {isCreatorFilterOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-96 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Creators</h3>
              <button
                onClick={() => setIsCreatorFilterOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Select creators to filter videos. Brand videos will still be shown.
            </p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={selectAllCreators}
                className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200"
              >
                Select All
              </button>
              <button
                onClick={clearAllCreators}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
              >
                Clear All
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {availableCreators.map(creator => (
                <label key={creator} className="flex items-center py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCreators.includes(creator)}
                    onChange={() => toggleCreator(creator)}
                    className="mr-3 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">{creator}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => setIsCreatorFilterOpen(false)}
                className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Apply Filters
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
