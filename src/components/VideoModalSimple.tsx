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
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Initialize isPlaying when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isOpen]);

  // Seek to startTime when metadata is available or when startTime changes
  useEffect(() => {
    if (!isOpen) return;
    if (startTime === undefined || startTime === null) return;
    const el = videoRef.current;
    if (!el) return;

    const seekToStart = () => {
      try {
        el.currentTime = Math.max(0, startTime);
      } catch (err) {
        console.error('Failed to seek to startTime', err);
      }
    };

    if (el.readyState >= 1) {
      seekToStart();
    } else {
      const onLoaded = () => {
        seekToStart();
        el.removeEventListener('loadedmetadata', onLoaded);
      };
      el.addEventListener('loadedmetadata', onLoaded);
      return () => el.removeEventListener('loadedmetadata', onLoaded);
    }
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
        <div className="m-2 ml-4 p-4 flex justify-between items-center">
          <h3 className="text-2xl font-medium">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer"
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
              ref={videoRef}
              src={videoUrl}
              controls
              playing={isPlaying}
              muted
              playsInline
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0 }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => {
                const el = e.currentTarget as HTMLVideoElement;
                setCurrentTime(el.currentTime);
                if (endTime !== undefined && endTime !== null && el.currentTime >= endTime) {
                  el.pause();
                  el.currentTime = endTime;
                  setIsPlaying(false);
                }
              }}
              onError={(error) => {
                console.error('ReactPlayer error', error);
              }}
            />

            {/* Bounding box overlay */}
            {showOverlay && bboxNorm && (
              <div
                className="absolute border-2 border-red-500 rounded"
                style={{
                  left: `${bboxNorm.x * 100}%`,
                  top: `${bboxNorm.y * 100}%`,
                  width: `${bboxNorm.w * 100}%`,
                  height: `${bboxNorm.h * 100}%`,
                }}
              />
            )}
          </div>

          {/* Current segment info */}
          {(startTime !== undefined || endTime !== undefined) && (
            <div className="mt-3 text-xs text-gray-500">
              Segment: {Math.max(0, startTime ?? 0).toFixed(2)}s – {endTime?.toFixed(2) ?? 'End'}
              {Number.isFinite(currentTime) && ` • Now: ${currentTime.toFixed(2)}s`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoModalSimple;