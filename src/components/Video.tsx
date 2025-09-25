"use client";

import React, { Suspense, useRef, useEffect, useState } from "react";
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
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    setIsVideoReady(false);

    // Add video click handler
    const handleVideoClick = (e: Event) => {
      if (video.paused) {
        video.play().catch(err => {
          console.error('Video play error:', err);
        });
      } else {
        video.pause();
      }
    };

    // Add video ready event listeners
    const handleCanPlay = () => {
      setIsVideoReady(true);
    };

    video.addEventListener('click', handleVideoClick);

    video.addEventListener('canplay', handleCanPlay);

    // Check if HLS is supported natively
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });

      hlsRef.current = hls;

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsVideoReady(true);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    }

    return () => {
      video.removeEventListener('click', handleVideoClick);
      video.removeEventListener('canplay', handleCanPlay);
      if (hlsRef.current) {
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
        e.stopPropagation();
      }}
    >
      {/* Loading Spinner - shown until video is ready */}
      {!isVideoReady && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-[45.60px]"
          style={{ zIndex: 3 }}
        >
          <LoadingSpinner />
        </div>
      )}

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
          pointerEvents: 'auto',
          opacity: isVideoReady ? 1 : 0
        }}
        onError={(e) => {
          console.error('Video error:', e);
        }}
        onClick={(e) => {
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


  const finalVideoDetails = providedVideoDetails || videoDetails;

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
