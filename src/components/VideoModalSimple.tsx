import React, { useState, useEffect } from 'react';
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
  /** optional clip start time (in seconds) */
  startTime?: number;
  /** optional clip end time (in seconds) */
  endTime?: number;
  /** normalized bounding-box to overlay (0-100 %) */
  bboxNorm?: { x: number; y: number; w: number; h: number };
  /** whether to render the overlay bounding box */
  showOverlay?: boolean;
  /** optional textual description of the highlighted event */
  description?: string;
}

const VideoModalSimple: React.FC<VideoModalProps> = ({
  videoUrl,
  isOpen,
  onClose,
  title,
  description,
  startTime,
  endTime,
  bboxNorm,
  showOverlay = false,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Initialize isPlaying when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(true);
    }
  }, [isOpen]);

  // Handler when metadata is loaded to seek to startTime
  const handleLoadedMetadata = () => {
    if (startTime !== undefined && videoRef.current) {
      videoRef.current.currentTime = startTime;
    }
  };

  // Handler to pause at endTime
  const handleTimeUpdate = () => {
    if (
      endTime !== undefined &&
      videoRef.current &&
      videoRef.current.currentTime >= endTime
    ) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
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
          <div className="relative w-full overflow-hidden rounded-[45.60px]" style={{ paddingTop: '56.25%' }}> {/* 16:9 Aspect Ratio */}
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay={isPlaying}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            />
            {/* Bounding box overlay */}
            {showOverlay && bboxNorm && (
              <div
                className="absolute border-2 border-red-500 pointer-events-none"
                style={{
                  left: `${bboxNorm.x}%`,
                  top: `${bboxNorm.y}%`,
                  width: `${bboxNorm.w}%`,
                  height: `${bboxNorm.h}%`,
                }}
              />
            )}
          </div>
          {/* Optional description */}
          {description && (
            <p className="mt-4 text-sm text-gray-700 whitespace-pre-wrap">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoModalSimple;
