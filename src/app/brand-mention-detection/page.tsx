"use client";

import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import clsx from 'clsx';
import { VideoData } from '@/types';
import { ProductEvent, EventFilters } from '@/types/brandMentions';
import { aggregatePerVideo, aggregateLibrary, bucketizeTimeline } from '@/utils/heatmap';
import Heatmap from '@/components/Heatmap';
import VideoModalSimple from '@/components/VideoModalSimple';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorFallback from '@/components/ErrorFallback';
import { ErrorBoundary } from 'react-error-boundary';

// Number of time buckets for heatmap visualization
const NUM_BUCKETS = 50;

export default function BrandMentionDetectionPage() {
  // Environment variables
  const creatorIndexId = process.env.NEXT_PUBLIC_CREATOR_INDEX_ID || '';

  // Video and event data
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [eventsByVideo, setEventsByVideo] = useState<Record<string, ProductEvent[]>>({});
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});
  
  // Filters
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<('vertical' | 'horizontal')[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [durationThreshold, setDurationThreshold] = useState<number>(0.5); // seconds
  const [timeWindow, setTimeWindow] = useState<{ start: number; end: number | null }>({ start: 0, end: null });
  
  // UI state
  const [viewMode, setViewMode] = useState<'library' | 'per-video'>('library');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEventsLoading, setIsEventsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal state
  const [modalVideo, setModalVideo] = useState<{
    videoId: string;
    videoUrl: string;
    title: string;
    start: number;
    end: number;
    bbox?: { x: number; y: number; w: number; h: number };
    description?: string;
  } | null>(null);

  // Derived data
  const availableCreators = useMemo(() => {
    const creators = new Set<string>();
    videos.forEach(video => {
      const creator = video.user_metadata?.creator || 
                      video.user_metadata?.creator_id || 
                      'Unknown';
      creators.add(creator.toString());
    });
    return Array.from(creators).sort();
  }, [videos]);

  const availableFormats = useMemo(() => {
    const formats = new Set<'vertical' | 'horizontal'>();
    videos.forEach(video => {
      if (video.system_metadata?.width && video.system_metadata?.height) {
        const format = video.system_metadata.width >= video.system_metadata.height 
          ? 'horizontal' 
          : 'vertical';
        formats.add(format);
      }
    });
    return Array.from(formats);
  }, [videos]);

  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    videos.forEach(video => {
      const region =
        video.user_metadata?.region ||
        /* fallback */ 'Unknown';
      regions.add(region.toString());
    });
    return Array.from(regions).sort();
  }, [videos]);

  const availableBrands = useMemo(() => {
    const brands = new Set<string>();
    Object.values(eventsByVideo).flat().forEach(event => {
      brands.add(event.brand);
    });
    return Array.from(brands).sort();
  }, [eventsByVideo]);

  // Filtered videos based on selected filters
  const filteredVideos = useMemo(() => {
    return videos.filter(video => {
      // Filter by creator
      if (selectedCreators.length > 0) {
        const creator = video.user_metadata?.creator || 
                        video.user_metadata?.creator_id || 
                        'Unknown';
        if (!selectedCreators.includes(creator.toString())) {
          return false;
        }
      }

      // Filter by format
      if (selectedFormats.length > 0) {
        if (video.system_metadata?.width && video.system_metadata?.height) {
          const format = video.system_metadata.width >= video.system_metadata.height 
            ? 'horizontal' 
            : 'vertical';
          if (!selectedFormats.includes(format)) {
            return false;
          }
        } else if (selectedFormats.length > 0) {
          // If we can't determine format but formats are selected, exclude
          return false;
        }
      }

      // Filter by region
      if (selectedRegions.length > 0) {
        const region =
          video.user_metadata?.region ||
          /* fallback */ 'Unknown';
        if (!selectedRegions.includes(region.toString())) {
          return false;
        }
      }

      return true;
    });
  }, [videos, selectedCreators, selectedFormats, selectedRegions]);

  // Filtered events based on selected filters and thresholds
  const filteredEvents = useMemo(() => {
    const result: Record<string, ProductEvent[]> = {};
    
    Object.entries(eventsByVideo).forEach(([videoId, events]) => {
      // Skip if video is not in filtered videos
      if (!filteredVideos.some(v => v._id === videoId)) {
        return;
      }
      
      // Apply filters to events
      const filtered = events.filter(event => {
        // Filter by brand
        if (selectedBrands.length > 0 && !selectedBrands.includes(event.brand)) {
          return false;
        }
        
        // Filter by duration threshold
        const duration = event.timeline_end - event.timeline_start;
        if (duration < durationThreshold) {
          return false;
        }
        
        // Filter by time window
        if (timeWindow.start > 0 && event.timeline_end < timeWindow.start) {
          return false;
        }
        if (timeWindow.end !== null && event.timeline_start > timeWindow.end) {
          return false;
        }
        
        return true;
      });
      
      if (filtered.length > 0) {
        result[videoId] = filtered;
      }
    });
    
    return result;
  }, [eventsByVideo, filteredVideos, selectedBrands, durationThreshold, timeWindow]);

  // Fetch videos on mount
  useEffect(() => {
    async function fetchVideos() {
      if (!creatorIndexId) {
        setError('Creator index ID is not configured');
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await axios.get('/api/videos', {
          params: {
            index_id: creatorIndexId,
            limit: 24,
            page: 1
          }
        });
        
        if (response.data && Array.isArray(response.data.data)) {
          setVideos(response.data.data);
          
          // Extract durations
          const durations: Record<string, number> = {};
          response.data.data.forEach((video: VideoData) => {
            if (video.system_metadata?.duration) {
              durations[video._id] = video.system_metadata.duration;
            }
          });
          setVideoDurations(durations);
          
          // Fetch events for all videos
          await fetchEventsForVideos(response.data.data.map((v: VideoData) => v._id));
        }
      } catch (error) {
        console.error('Error fetching videos:', error);
        setError('Failed to fetch videos. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchVideos();
  }, [creatorIndexId]);

  // Fetch events for multiple videos
  async function fetchEventsForVideos(videoIds: string[]) {
    if (!creatorIndexId || videoIds.length === 0) return;
    
    setIsEventsLoading(true);
    
    try {
      const response = await axios.post('/api/brand-mentions/events', {
        videoIds,
        indexId: creatorIndexId
      });
      
      if (response.data && response.data.results) {
        setEventsByVideo(prevEvents => ({
          ...prevEvents,
          ...response.data.results
        }));
      }
    } catch (error) {
      console.error('Error fetching brand mention events:', error);
      // Don't set global error, just log it
    } finally {
      setIsEventsLoading(false);
    }
  }

  // Fetch events for a single video
  async function fetchEventsForVideo(videoId: string) {
    if (!creatorIndexId) return;
    
    setIsEventsLoading(true);
    
    try {
      const response = await axios.get('/api/brand-mentions/events', {
        params: {
          videoId,
          indexId: creatorIndexId
        }
      });
      
      if (response.data && response.data.events) {
        setEventsByVideo(prevEvents => ({
          ...prevEvents,
          [videoId]: response.data.events
        }));
      }
    } catch (error) {
      console.error(`Error fetching events for video ${videoId}:`, error);
      // Don't set global error, just log it
    } finally {
      setIsEventsLoading(false);
    }
  }

  // Handle cell click in heatmap
  function handleHeatmapCellClick(rowId: string, colIndex: number) {
    if (viewMode === 'library') {
      // In library view, rowId is the videoId
      setSelectedVideoId(rowId);
      setViewMode('per-video');
      return;
    }
    
    // In per-video view, rowId is the brand
    const video = videos.find(v => v._id === selectedVideoId);
    if (!video || !video.hls?.video_url) return;
    
    const events = eventsByVideo[selectedVideoId!] || [];
    const brandEvents = events.filter(e => e.brand === rowId);
    if (brandEvents.length === 0) return;
    
    // Find the event that corresponds to this column
    const duration = videoDurations[selectedVideoId!] || 0;
    if (duration <= 0) return;
    
    const buckets = bucketizeTimeline(duration, NUM_BUCKETS);
    const bucket = buckets[colIndex];
    if (!bucket) return;
    
    const bucketStartSec = (bucket.start / 100) * duration;
    const bucketEndSec = (bucket.end / 100) * duration;
    
    // Find events that overlap with this bucket
    const overlappingEvents = brandEvents.filter(event => 
      event.timeline_end >= bucketStartSec && event.timeline_start <= bucketEndSec
    );
    
    if (overlappingEvents.length === 0) return;
    
    // Use the first overlapping event
    const event = overlappingEvents[0];
    
    setModalVideo({
      videoId: selectedVideoId!,
      videoUrl: video.hls.video_url,
      title: `${event.brand}: ${event.product_name}`,
      start: event.timeline_start,
      end: event.timeline_end,
      bbox: event.bbox_norm,
      description: event.description
    });
  }

  // Toggle filter selection
  function toggleCreator(creator: string) {
    setSelectedCreators(prev => 
      prev.includes(creator)
        ? prev.filter(c => c !== creator)
        : [...prev, creator]
    );
  }

  function toggleFormat(format: 'vertical' | 'horizontal') {
    setSelectedFormats(prev => 
      prev.includes(format)
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  }

  function toggleRegion(region: string) {
    setSelectedRegions(prev => 
      prev.includes(region)
        ? prev.filter(r => r !== region)
        : [...prev, region]
    );
  }

  function toggleBrand(brand: string) {
    setSelectedBrands(prev => 
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  }

  // Reset all filters
  function resetFilters() {
    setSelectedCreators([]);
    setSelectedFormats([]);
    setSelectedRegions([]);
    setSelectedBrands([]);
    setDurationThreshold(0.5);
    setTimeWindow({ start: 0, end: null });
  }

  // Prepare heatmap data based on view mode
  const heatmapData = useMemo(() => {
    if (viewMode === 'library') {
      // Library view: videos as rows, normalized time buckets as columns
      const libraryRows = aggregateLibrary(
        videoDurations,
        filteredEvents,
        NUM_BUCKETS,
        selectedBrands.length > 0 ? selectedBrands : undefined
      );
      
      // map TwelveLabs rows to UI-friendly rows
      const uiRows = libraryRows.map(row => {
        const video = videos.find(v => v._id === row.video_id);
        const label = video ? 
          (video.user_metadata?.creator || video.system_metadata?.video_title || row.video_id) : 
          row.video_id;
        return {
          id: row.video_id,
          label: label.toString(),
          buckets: row.buckets
        };
      });

      // compute total exposure buckets across all uiRows
      const totalBuckets = Array.from({ length: NUM_BUCKETS }, (_, idx) => {
        const template = uiRows[0]?.buckets[idx] ?? { start: (idx / NUM_BUCKETS) * 100, end: ((idx + 1) / NUM_BUCKETS) * 100, value: 0 };
        const value = uiRows.reduce((sum, r) => sum + r.buckets[idx].value, 0);
        return { ...template, value };
      });

      const totalRow = {
        id: '__TOTAL__',
        label: 'Total Exposure',
        buckets: totalBuckets
      };

      return [totalRow, ...uiRows];
    } else if (selectedVideoId) {
      // Per-video view: brands as rows, time buckets as columns
      const events = filteredEvents[selectedVideoId] || [];
      const perVideoRows = aggregatePerVideo(events, NUM_BUCKETS, 'brand');
      const rowsWithTotal = perVideoRows.map(row => ({
        id: row.key,
        label: row.label,
        buckets: row.buckets
      }));

      if (rowsWithTotal.length > 0) {
        // compute total exposure row
        const totalBuckets = rowsWithTotal[0].buckets.map((b, idx) => ({
          ...b,
          value: rowsWithTotal.reduce((sum, r) => sum + r.buckets[idx].value, 0)
        }));
        rowsWithTotal.unshift({
          id: '__TOTAL__',
          label: 'Total Exposure',
          buckets: totalBuckets
        });
      }

      return rowsWithTotal;
    }
    
    return [];
  }, [viewMode, selectedVideoId, filteredEvents, videos, videoDurations, selectedBrands]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-gray-800 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">Creator Discovery</h1>
        <p className="text-sm opacity-80">Brand Mention Detection</p>
      </header>

      <main className="container mx-auto px-4 py-8">
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
              {error}
            </div>
          ) : (
            <>
              {/* View mode toggle */}
              <div className="mb-6 flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <h2 className="text-xl font-semibold">
                    {viewMode === 'library' ? 'Library View' : 'Per-Video View'}
                  </h2>
                  <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                    <button
                      onClick={() => setViewMode('library')}
                      className={clsx(
                        'px-4 py-2 rounded-md text-sm font-medium',
                        viewMode === 'library' ? 'bg-blue-600 text-white' : 'text-gray-700'
                      )}
                    >
                      Library
                    </button>
                    <button
                      onClick={() => setViewMode('per-video')}
                      className={clsx(
                        'px-4 py-2 rounded-md text-sm font-medium',
                        viewMode === 'per-video' ? 'bg-blue-600 text-white' : 'text-gray-700',
                        !selectedVideoId && 'opacity-50 cursor-not-allowed'
                      )}
                      disabled={!selectedVideoId}
                    >
                      Per-Video
                    </button>
                  </div>
                </div>

                {viewMode === 'per-video' && selectedVideoId && (
                  <button
                    onClick={() => {
                      setViewMode('library');
                      setSelectedVideoId(null);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    ← Back to Library
                  </button>
                )}
              </div>

              {/* Filters section */}
              <div className="mb-8 bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Filters</h3>
                  <button
                    onClick={resetFilters}
                    className="text-sm text-gray-600 hover:text-gray-800"
                  >
                    Reset All
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Creator filter */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Creators</h4>
                    <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                      {availableCreators.map(creator => (
                        <button
                          key={creator}
                          onClick={() => toggleCreator(creator)}
                          className={clsx(
                            'px-2 py-1 text-xs rounded-full',
                            selectedCreators.includes(creator)
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                          )}
                        >
                          {creator}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Format filter */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Format</h4>
                    <div className="flex flex-wrap gap-2">
                      {availableFormats.map(format => (
                        <button
                          key={format}
                          onClick={() => toggleFormat(format)}
                          className={clsx(
                            'px-2 py-1 text-xs rounded-full',
                            selectedFormats.includes(format)
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                          )}
                        >
                          {format === 'vertical' ? 'Vertical' : 'Horizontal'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Region filter */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Region</h4>
                    <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                      {availableRegions.map(region => (
                        <button
                          key={region}
                          onClick={() => toggleRegion(region)}
                          className={clsx(
                            'px-2 py-1 text-xs rounded-full',
                            selectedRegions.includes(region)
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                          )}
                        >
                          {region}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Brand filter */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Brands</h4>
                    <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                      {availableBrands.map(brand => (
                        <button
                          key={brand}
                          onClick={() => toggleBrand(brand)}
                          className={clsx(
                            'px-2 py-1 text-xs rounded-full',
                            selectedBrands.includes(brand)
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                          )}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Duration and time window filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">
                      Duration Threshold: {durationThreshold}s
                    </h4>
                    <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={durationThreshold}
                      onChange={(e) => setDurationThreshold(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">
                      Time Window: {timeWindow.start}s - {timeWindow.end === null ? 'End' : `${timeWindow.end}s`}
                    </h4>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={timeWindow.start}
                        onChange={(e) => setTimeWindow(prev => ({ ...prev, start: Math.max(0, parseInt(e.target.value) || 0) }))}
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                      />
                      <span>to</span>
                      <input
                        type="number"
                        min={timeWindow.start + 1}
                        value={timeWindow.end === null ? '' : timeWindow.end}
                        placeholder="End"
                        onChange={(e) => {
                          const value = e.target.value === '' ? null : Math.max(timeWindow.start + 1, parseInt(e.target.value) || 0);
                          setTimeWindow(prev => ({ ...prev, end: value }));
                        }}
                        className="w-20 px-2 py-1 border border-gray-300 rounded"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Heatmap visualization */}
              <div className="mb-8">
                {isEventsLoading ? (
                  <div className="flex justify-center items-center h-64">
                    <LoadingSpinner size="md" />
                  </div>
                ) : heatmapData.length === 0 ? (
                  <div className="bg-gray-50 p-8 rounded-lg text-center text-gray-500">
                    {viewMode === 'library' ? (
                      <p>No videos match the selected filters.</p>
                    ) : (
                      <p>No brand mentions found for this video with the current filters.</p>
                    )}
                  </div>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold mb-4">
                      {viewMode === 'library' 
                        ? `Brand Mention Heatmap (${heatmapData.length} videos)`
                        : `Brand Mentions in ${
                            videos.find(v => v._id === selectedVideoId)?.system_metadata?.video_title || 
                            videos.find(v => v._id === selectedVideoId)?._id || 
                            'Selected Video'
                          }`
                      }
                    </h3>
                    <div className="overflow-x-auto">
                      <Heatmap
                        rows={heatmapData}
                        columns={NUM_BUCKETS}
                        onCellClick={handleHeatmapCellClick}
                        className="mb-4"
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-center">
                      {viewMode === 'library' 
                        ? 'Click on a cell to view detailed brand mentions for that video'
                        : 'Click on a cell to view the video segment with the brand mention'
                      }
                    </p>
                  </>
                )}
              </div>

              {/* Video grid (library view only) */}
              {viewMode === 'library' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Videos</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredVideos.map(video => (
                      <div
                        key={video._id}
                        className={clsx(
                          'border rounded-lg overflow-hidden cursor-pointer transition-all',
                          selectedVideoId === video._id ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200 hover:border-blue-300'
                        )}
                        onClick={() => {
                          setSelectedVideoId(video._id);
                          setViewMode('per-video');
                        }}
                      >
                        <div className="aspect-video bg-gray-100 relative">
                          {video.hls?.thumbnail_urls?.[0] && (
                            <img
                              src={video.hls.thumbnail_urls[0]}
                              alt={video.system_metadata?.video_title || 'Video thumbnail'}
                              className="w-full h-full object-cover"
                            />
                          )}
                          {/* Format badge */}
                          {video.system_metadata?.width && video.system_metadata?.height && (
                            <div className="absolute bottom-2 right-2">
                              <span className={clsx(
                                'px-2 py-1 text-xs font-bold text-white rounded-md',
                                video.system_metadata.width >= video.system_metadata.height ? 'bg-blue-600' : 'bg-purple-600'
                              )}>
                                {video.system_metadata.width >= video.system_metadata.height ? 'Horizontal' : 'Vertical'}
                              </span>
                            </div>
                          )}
                          {/* Brand count badge */}
                          {eventsByVideo[video._id] && (
                            <div className="absolute top-2 right-2">
                              <span className="px-2 py-1 text-xs font-bold bg-green-600 text-white rounded-full">
                                {eventsByVideo[video._id].length} brands
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h4 className="font-medium truncate">
                            {video.system_metadata?.video_title || `Video ${video._id}`}
                          </h4>
                          <p className="text-xs text-gray-500 truncate">
                            Creator:{' '}
                            {String(
                              (video.user_metadata?.creator as string) ?? 'Unknown'
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            Duration: {Math.round(video.system_metadata?.duration || 0)}s
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </ErrorBoundary>
      </main>

      {/* Video modal */}
      {modalVideo && (
        <VideoModalSimple
          videoUrl={modalVideo.videoUrl}
          videoId={modalVideo.videoId}
          isOpen={!!modalVideo}
          onClose={() => setModalVideo(null)}
          title={modalVideo.title}
          startTime={modalVideo.start}
          endTime={modalVideo.end}
          bboxNorm={modalVideo.bbox}
          showOverlay={true}
          description={modalVideo.description}
        />
      )}
    </div>
  );
}
