"use client";

import React, { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "./ErrorFallback";
import { fetchVideoDetails } from "@/hooks/apiHooks";
import LoadingSpinner from "./LoadingSpinner";
import { VideoProps, VideoDetails } from "@/types";

interface EnhancedVideoProps extends VideoProps {
  confidenceLabel?: string;
  confidenceColor?: 'green' | 'yellow' | 'red';
  timeRange?: { start: string; end: string };
  disablePlayback?: boolean;
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
  disablePlayback = false
}) => {
  const { data: videoDetails } = useQuery<VideoDetails, Error>({
    queryKey: ["videoDetails", videoId],
    queryFn: () => {
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

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<LoadingSpinner />}>
        <div
          className="w-64 h-36 relative rounded-[45.60px] inline-flex flex-col justify-between items-start overflow-hidden"
          onClick={!disablePlayback ? onPlay : undefined}
          style={{ cursor: !disablePlayback ? 'pointer' : 'default' }}
        >
          <div className="absolute inset-0">
              <img
                src={finalVideoDetails?.hls?.thumbnail_urls?.[0] || '/videoFallback.jpg'}
                className="object-cover w-full h-full"
                alt="thumbnail"
              />
          </div>

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
          {timeRange ? (
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
          )}
        </div>
            {showTitle && (
              <div className="self-stretch px-2 pb-2 inline-flex justify-center items-start gap-1 w-full">
                <div className="flex-1 justify-start text-stone-900 text-sm font-normal leading-tight truncate max-w-full whitespace-nowrap overflow-hidden text-ellipsis">
                  {finalVideoDetails?.system_metadata?.filename || finalVideoDetails?.system_metadata?.video_title}
                </div>
              </div>
            )}
      </Suspense>
    </ErrorBoundary>
  );
};

export default Video;
