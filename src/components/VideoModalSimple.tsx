import React, { useEffect, useRef, useState } from 'react';
import { VideoData } from '@/types';
import Hls from 'hls.js';

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
  description?: string;
  location?: string;
}

// Helper function to format seconds to MM:SS
const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const VideoModalSimple: React.FC<VideoModalProps> = ({
  videoUrl,
  isOpen,
  onClose,
  title,
  startTime,
  endTime,
  description,
  location,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true); // Start muted by default
  const [volume, setVolume] = useState<number>(1); // Volume state
  const videoRef = useRef<HTMLVideoElement>(null);




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

  // Handle HLS video loading
  useEffect(() => {
    if (!isOpen || !videoRef.current) return;

    const video = videoRef.current;
    const isHLS = videoUrl.includes('.m3u8');

    if (isHLS && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
      };
    } else if (isHLS && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = videoUrl;
    } else if (!isHLS) {
      video.src = videoUrl;
    }
  }, [isOpen, videoUrl]);

  // Seek to startTime when metadata is available or when startTime changes
  useEffect(() => {
    if (!isOpen) return;
    if (startTime === undefined || startTime === null) return;
    const video = videoRef.current;
    if (!video) return;

    const seekToStart = () => {
      try {
        video.currentTime = startTime;
      } catch (err) {
        console.error('Failed to seek to startTime', err);
      }
    };

    // Use a small delay to ensure the video is ready
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
              {title?.includes(':') ? `${title.split(':')[0]} | ${title.split(':')[1]?.trim()}` : title}
            </h3>
            {description && (
              <div className="text-sm mb-2">
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
        <div className="relative w-full aspect-[16/9] overflow-hidden rounded-[45.60px]">
        {/* Video Player */}
        <video
    ref={videoRef}
    controls
    autoPlay={isPlaying}
    muted={isMuted}
    playsInline
    className="absolute top-0 left-0 w-full h-full object-contain"
    onPlay={() => setIsPlaying(true)}
    onPause={() => setIsPlaying(false)}
    onVolumeChange={(e) => {
      const video = e.currentTarget;
      setVolume(video.volume);
      setIsMuted(video.muted);
    }}
    onTimeUpdate={(e) => {
      const video = e.currentTarget;
      if (endTime !== undefined && video.currentTime >= endTime) {
        video.currentTime = startTime || 0;
      }
      if (startTime !== undefined && video.currentTime < startTime) {
        video.currentTime = startTime;
      }
    }}
    onError={(error) => {
      console.error('Video error:', error);
      const video = error.currentTarget;
      console.error('Video error details:', {
        error: video.error,
        networkState: video.networkState,
        readyState: video.readyState,
        src: video.src
      });
    }}
    controlsList="nodownload"
  />

          {/* Segment overlay on video */}
          {(startTime !== undefined || endTime !== undefined) && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/40 rounded-lg px-3 py-1 shadow-lg border border-white">
              <div className="text-sm font-medium text-white">
                {formatTime(startTime ?? 0)} - {formatTime(endTime ?? 0)}
              </div>
            </div>
          )}


</div>
{location && (
              <div className="text-md mt-2 p-1">
                📍 {location}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default VideoModalSimple;