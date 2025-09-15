import React, { useState, useEffect } from 'react';
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
}

const VideoModalSimple: React.FC<VideoModalProps> = ({
  videoUrl,
  isOpen,
  onClose,
  title,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Initialize isPlaying when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(true);
    }
  }, [isOpen]);


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
          <div className="relative w-full overflow-hidden rounded-[45.60px]" style={{ paddingTop: '56.25%' }}> {/* 16:9 Aspect Ratio */}

              <ReactPlayer
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
                onError={(error) => {
                  // Surface player errors to the console for easier debugging
                  // Common causes: CORS on media, invalid URL, missing .m3u8 without forceHLS
                  // or browser autoplay policies when not muted
                  console.error('ReactPlayer error', error);
                }}
              />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoModalSimple;