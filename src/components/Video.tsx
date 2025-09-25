"use client";

import React, { Suspense, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "./ErrorFallback";
import { fetchVideoDetails } from "@/hooks/apiHooks";
import LoadingSpinner from "./LoadingSpinner";
import { VideoProps, VideoDetails } from "@/types";
import Hls from 'hls.js';

// HLS Video Player Component
interface HLSVideoPlayerProps {
  videoUrl: string;
  className?: string;
}

const HLSVideoPlayer: React.FC<HLSVideoPlayerProps> = ({ videoUrl, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    console.log('🎬 HLS: Initializing HLS player with URL:', videoUrl);

    // Add multiple event listeners for debugging
    const handleVideoClick = (e: Event) => {
      console.log('🎬 HLS: Video clicked via event listener', e.target);
      console.log('🎬 HLS: Video element:', video);
      console.log('🎬 HLS: Video paused:', video.paused);
      console.log('🎬 HLS: Video readyState:', video.readyState);

      if (video.paused) {
        console.log('🎬 HLS: Attempting to play video');
        video.play().then(() => {
          console.log('🎬 HLS: Video play successful');
        }).catch(err => {
          console.error('🎬 HLS: Play error:', err);
        });
      } else {
        console.log('🎬 HLS: Attempting to pause video');
        video.pause();
        console.log('🎬 HLS: Video paused');
      }
    };

    const handleMouseDown = (e: Event) => {
      console.log('🎬 HLS: Mouse down on video', e.target);
    };

    const handleMouseUp = (e: Event) => {
      console.log('🎬 HLS: Mouse up on video', e.target);
    };

    const handlePointerEvents = (e: Event) => {
      console.log('🎬 HLS: Pointer event:', e.type, e.target);
    };

    video.addEventListener('click', handleVideoClick);
    video.addEventListener('mousedown', handleMouseDown);
    video.addEventListener('mouseup', handleMouseUp);
    video.addEventListener('pointerdown', handlePointerEvents);
    video.addEventListener('pointerup', handlePointerEvents);

    // Check video element properties
    console.log('🎬 HLS: Video element properties:', {
      controls: video.controls,
      style: video.style.cssText,
      className: video.className,
      disabled: video.disabled,
      readyState: video.readyState
    });

    // Check if HLS is supported natively
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('🎬 HLS: Using native HLS support');
      video.src = videoUrl;
    } else if (Hls.isSupported()) {
      console.log('🎬 HLS: Using HLS.js library');
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });

      hlsRef.current = hls;

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('🎬 HLS: Manifest parsed, video ready to play');
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('🎬 HLS Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('🎬 HLS: Fatal network error, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('🎬 HLS: Fatal media error, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              console.error('🎬 HLS: Fatal error, cannot recover');
              hls.destroy();
              break;
          }
        }
      });
    } else {
      console.error('🎬 HLS: HLS is not supported in this browser');
    }

    return () => {
      video.removeEventListener('click', handleVideoClick);
      video.removeEventListener('mousedown', handleMouseDown);
      video.removeEventListener('mouseup', handleMouseUp);
      video.removeEventListener('pointerdown', handlePointerEvents);
      video.removeEventListener('pointerup', handlePointerEvents);
      if (hlsRef.current) {
        console.log('🎬 HLS: Cleaning up HLS instance');
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl]);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        zIndex: 1
      }}
      onClick={(e) => {
        console.log('🎬 HLS: Container clicked', e.target);
        e.stopPropagation();
      }}
    >
      <video
        ref={videoRef}
        controls
        preload="metadata"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          cursor: 'pointer',
          position: 'relative',
          zIndex: 2,
          pointerEvents: 'auto'
        }}
        onLoadStart={() => console.log('🎬 HLS: Video load started')}
        onLoadedMetadata={() => console.log('🎬 HLS: Video metadata loaded')}
        onCanPlay={() => console.log('🎬 HLS: Video can play')}
        onError={(e) => {
          console.error('🎬 HLS: Video error:', e);
          console.error('🎬 HLS: Video element:', e.target);
        }}
        onLoad={() => console.log('🎬 HLS: Video loaded successfully')}
        onClick={(e) => {
          console.log('🎬 HLS: React onClick triggered', e.target);
          e.stopPropagation();
        }}
      />
    </div>
  );
};

interface EnhancedVideoProps extends VideoProps {
  confidenceLabel?: string;
  confidenceColor?: 'green' | 'yellow' | 'red';
  timeRange?: { start: string; end: string };
  disablePlayback?: boolean;
  size?: 'small' | 'medium' | 'large';
  showPlayer?: boolean;
}

const Video: React.FC<EnhancedVideoProps> = ({
  videoId,
  indexId,
  showTitle = true,
  videoDetails: providedVideoDetails,
  onPlay,
  confidenceLabel,
  confidenceColor,
  timeRange,
  disablePlayback = false,
  size = 'medium',
  showPlayer = false
}) => {
  const { data: videoDetails, isLoading, error } = useQuery<VideoDetails, Error>({
    queryKey: ["videoDetails", videoId],
    queryFn: () => {
      console.log('🎬 Fetching video details for:', { videoId, indexId });
      if (!videoId) {
        throw new Error("Video ID is missing");
      }
      return fetchVideoDetails((videoId)!, indexId);
    },
    enabled: !!indexId && (!!videoId) && !providedVideoDetails,
  });

  // Debug API response
  if (videoDetails) {
    console.log('🎬 Video details received:', videoDetails);
  }
  if (error) {
    console.error('🎬 Video details error:', error);
  }
  if (isLoading) {
    console.log('🎬 Video details loading...');
  }

  const finalVideoDetails = providedVideoDetails || videoDetails;

  // Debug logging for video data
  console.log('🎬 Video component debug:', {
    videoId,
    indexId,
    showPlayer,
    hasVideoDetails: !!finalVideoDetails,
    videoUrl: finalVideoDetails?.hls?.video_url,
    thumbnailUrl: finalVideoDetails?.hls?.thumbnail_urls?.[0],
    duration: finalVideoDetails?.system_metadata?.duration
  });

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return [
      hours.toString().padStart(2, "0"),
      minutes.toString().padStart(2, "0"),
      secs.toString().padStart(2, "0"),
    ].join(":");
  };

  // Get size classes based on size prop
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return 'w-48 h-28';
      case 'large':
        return 'w-full max-w-lg h-64';
      case 'medium':
      default:
        return 'w-64 h-36';
    }
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<LoadingSpinner />}>
        <div className="flex flex-col items-center">
          {/* Video Player or Thumbnail */}
          <div
            className={`${getSizeClasses()} relative rounded-[45.60px] overflow-hidden`}
            onClick={(e) => {
              // Only handle click if not showing player and playback is not disabled
              if (!disablePlayback && !showPlayer && onPlay) {
                e.stopPropagation();
                onPlay();
              }
            }}
            style={{
              cursor: showPlayer ? 'default' : (!disablePlayback ? 'pointer' : 'default'),
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}
          >
            {showPlayer && finalVideoDetails?.hls?.video_url ? (
              <HLSVideoPlayer
                videoUrl={finalVideoDetails.hls.video_url}
                className="absolute inset-0 w-full h-full z-10"
              />
            ) : (
              <div className="absolute inset-0">
                <img
                  src={finalVideoDetails?.hls?.thumbnail_urls?.[0] || '/videoFallback.jpg'}
                  className="object-cover w-full h-full"
                  alt="thumbnail"
                />
              </div>
            )}

            {/* Top section with confidence label */}
            <div className="relative self-stretch flex-1 p-5 flex flex-col justify-start items-start gap-2 z-10 cursor-pointer">
              {confidenceLabel && (
                <div className="absolute top-3 left-7 z-[1]">
                  <div className={`${
                    confidenceColor === 'green' ? 'bg-green-500' :
                    confidenceColor === 'yellow' ? 'bg-yellow-500' :
                    confidenceColor === 'red' ? 'bg-red-500' :
                    'bg-green-500'
                  } px-1 rounded-sm border-1 border-white`}>
                    <p className="text-white text-xs font-medium uppercase">
                      {confidenceLabel}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Time range or duration indicator */}
            {!showPlayer && (
              timeRange ? (
                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[1] bg-black/5 rounded">
                  <div className="p-1 rounded outline outline-1 outline-zinc-100 justify-start items-center gap-2">
                    <div className="justify-start text-zinc-100 text-xs font-semibold uppercase leading-tight tracking-tight">
                      {timeRange.start} - {timeRange.end}
                    </div>
                  </div>
                </div>
              ) : (
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-[1] bg-black/5 rounded">
                    <div className="p-1 rounded outline outline-1 outline-zinc-100 justify-start items-center gap-2">
                      <div className="justify-start text-zinc-100 text-xs font-semibold uppercase leading-tight tracking-tight">
                        {formatDuration(finalVideoDetails?.system_metadata?.duration ?? 0)}
                      </div>
                    </div>
                  </div>
              )
            )}
          </div>

          {/* Video Title */}
          {showTitle && (
            <div className="mt-2 px-2 w-full">
              <div className="text-stone-900 text-sm font-normal leading-tight text-center">
                {finalVideoDetails?.system_metadata?.filename || finalVideoDetails?.system_metadata?.video_title}
              </div>
            </div>
          )}
        </div>
      </Suspense>
    </ErrorBoundary>
  );
};

export default Video;
