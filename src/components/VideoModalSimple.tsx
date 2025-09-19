import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { VideoData } from '@/types';

interface VideoModalProps {
  videoUrl: string;
  videoId: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  searchScore?: number;
  textScore?: number;
  videoScore?: number;
  originalSource?: 'TEXT' | 'VIDEO' | 'BOTH';
  contentMetadata?: VideoData;
  startTime?: number;
  endTime?: number;
  bboxNorm?: { x: number; y: number; w: number; h: number };
  showOverlay?: boolean;
  description?: string;
}

const VideoModalSimple: React.FC<VideoModalProps> = ({
  videoUrl,
  isOpen,
  onClose,
  title,
  startTime,
  endTime,
  bboxNorm,
  showOverlay,
  description,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true); // Start muted by default
  const [volume, setVolume] = useState<number>(1); // Volume state
  const playerRef = useRef<ReactPlayer>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);



  // Initialize isPlaying when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      // Reset audio state when modal closes
      setIsMuted(true);
      setVolume(1);
    }
  }, [isOpen]);

  // Handle muted state changes more carefully
  useEffect(() => {
    if (!isOpen || !playerRef.current) return;

    // Add event listener to the actual video element for better mute detection
    const addMuteListeners = () => {
      const player = playerRef.current;
      if (!player) return;

      // Try to get the actual video element
      const wrapper = player.wrapper;
      if (wrapper) {
        const videoElement = wrapper.querySelector('video') || wrapper.querySelector('hls-video');
        if (videoElement) {
          const handleVolumeChange = () => {
            const currentMuted = videoElement.muted;

            if (currentMuted !== isMuted) {
              setIsMuted(currentMuted);
            }
          };

          videoElement.addEventListener('volumechange', handleVolumeChange);

          return () => {
            videoElement.removeEventListener('volumechange', handleVolumeChange);
          };
        }
      }
    };

    // Add listeners after a short delay to ensure the video element is ready
    const timer = setTimeout(addMuteListeners, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [isMuted, isOpen]);

  // Seek to startTime when metadata is available or when startTime changes
  useEffect(() => {
    if (!isOpen) return;
    if (startTime === undefined || startTime === null) return;
    const player = playerRef.current;
    if (!player) return;

    const seekToStart = () => {
      try {
        player.seekTo(startTime, 'seconds');
      } catch (err) {
        console.error('Failed to seek to startTime', err);
      }
    };

    // Use a small delay to ensure the player is ready
    const timer = setTimeout(seekToStart, 100);
    return () => clearTimeout(timer);
  }, [isOpen, startTime, videoUrl]);



  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="relative rounded-[45.60px] shadow-xl max-w-3xl w-full flex flex-col overflow-hidden bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="m-2 ml-4 p-4 flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-2xl font-medium mb-2">
              {title?.split(':')[0] || title}
            </h3>
            {title?.includes(':') && (
              <div className="text-lg text-gray-600 mb-2">
                {title.split(':')[1]?.trim()}
              </div>
            )}
            {description && (
              <div className="text-sm text-gray-500 mb-2">
                {description}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer ml-4"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="relative w-full px-6 pb-10 overflow-auto flex-grow">
          <div className="relative w-full overflow-hidden rounded-[45.60px]" style={{ paddingTop: '56.25%' }}>
            {/* Player */}
            <ReactPlayer
              ref={playerRef}
              src={videoUrl}
              controls
              playing={isPlaying}
              muted={isMuted}
              volume={volume}
              playsInline
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0 }}
              onReady={() => {
                // Player is ready
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onVolumeChange={(e) => {
                // Extract volume from event - it might be an event object or a number
                let volumeValue;
                let mutedValue;

                if (typeof e === 'number') {
                  volumeValue = e;
                } else if (e && e.target) {
                  volumeValue = typeof e.target.volume === 'number' ? e.target.volume : volume;
                  mutedValue = typeof e.target.muted === 'boolean' ? e.target.muted : undefined;
                } else if (e && typeof e.volume === 'number') {
                  volumeValue = e.volume;
                } else {
                  return;
                }

                setVolume(volumeValue);

                // Update muted state based on actual muted property if available
                if (typeof mutedValue === 'boolean') {
                  if (mutedValue !== isMuted) {
                    setIsMuted(mutedValue);
                  }
                } else {
                  // Fallback: detect mute/unmute based on volume changes
                  if (volumeValue === 0 && !isMuted) {
                    setIsMuted(true);
                  } else if (volumeValue > 0 && isMuted) {
                    setIsMuted(false);
                  }
                }
              }}
              onMute={() => setIsMuted(true)}
              onUnmute={() => setIsMuted(false)}
              onTimeUpdate={(e) => {
                const el = e.currentTarget as HTMLVideoElement;
                setCurrentTime(el.currentTime);

                // Loop back to start if we've reached the end time
                if (endTime !== undefined && endTime !== null && el.currentTime >= endTime) {
                  el.currentTime = startTime || 0;
                }

                // Seek back to start if we've gone before the start time
                if (startTime !== undefined && startTime !== null && el.currentTime < startTime) {
                  el.currentTime = startTime;
                }
              }}
              onError={(error) => {
                console.error('ReactPlayer error', error);
              }}
              config={{
                file: {
                  attributes: {
                    crossOrigin: "anonymous",
                    controlsList: "nodownload",
                    playsInline: true,
                  },
                },
              }}
            />

            {/* Bounding box overlay - only show during the segment */}
            {showOverlay && bboxNorm && startTime !== undefined && endTime !== undefined &&
             currentTime >= startTime && currentTime <= endTime && (
              <div
                className="absolute border-2 border-red-500 rounded bg-red-500/20"
                style={{
                  left: `${bboxNorm.x}%`,
                  top: `${bboxNorm.y}%`,
                  width: `${bboxNorm.w}%`,
                  height: `${bboxNorm.h}%`,
                }}
              />
            )}
          </div>

          {/* Segment info below video player */}
          {(startTime !== undefined || endTime !== undefined) && (
            <div className="mt-3 text-xs text-gray-400 text-center">
              Segment: {Math.max(0, startTime ?? 0).toFixed(2)}s – {endTime?.toFixed(2) ?? 'End'}s
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoModalSimple;