import React, { useState, useEffect, useRef } from 'react';
import { VideoData } from '@/types';
import ReactPlayer from 'react-player';

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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [playerInitialized, setPlayerInitialized] = useState<boolean>(false);
  const playerRef = useRef<any>(null);

  // Reset player state when modal opens
  useEffect(() => {
    console.log('🎬 VideoModalSimple: Modal opened', { isOpen, videoUrl, title });
    if (isOpen) {
      // Reset all player state
      setPlayerInitialized(false);
      setIsLoading(true);
      setError(null);
      setIsPlaying(true);
      console.log('🎬 VideoModalSimple: Starting video load for URL:', videoUrl);

      // Test URL accessibility immediately
      console.log('🎬 VideoModalSimple: Testing URL accessibility...');
      fetch(videoUrl, { method: 'HEAD' })
        .then(response => {
          console.log('🎬 VideoModalSimple: URL test result:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
          });
        })
        .catch(error => {
          console.error('🎬 VideoModalSimple: URL test failed:', error);
        });

      // Set a timeout to detect if video fails to load
      const loadTimeout = setTimeout(() => {
        if (!playerInitialized) {
          console.error('🎬 VideoModalSimple: Video failed to load within 10 seconds');
          setError('Video failed to load. This may be due to access restrictions or network issues.');
          setIsLoading(false);
          setIsPlaying(false);
        }
      }, 10000); // 10 second timeout

      return () => {
        clearTimeout(loadTimeout);
      };
    }

    // Cleanup when modal closes
    return () => {
      if (!isOpen) {
        setIsPlaying(false);
        setPlayerInitialized(false);
        setIsLoading(true);
      }
    };
  }, [isOpen, videoUrl, title, playerInitialized]);


  // Handler for player progress
  const handleProgress = (state: any) => {
    console.log('🎬 VideoModalSimple: Progress update:', state.playedSeconds);
    if (endTime !== undefined && state.playedSeconds >= endTime) {
      console.log('🎬 VideoModalSimple: Reached end time, pausing');
      setIsPlaying(false);
    }
  };

  // Handler for player errors
  const handleError = (error: any) => {
    console.error('🎬 VideoModalSimple: ReactPlayer error:', error);
    console.error('🎬 VideoModalSimple: Error details:', {
      error,
      videoUrl,
      title
    });

    // Check if it's a 403 Forbidden error
    let errorMessage = `Failed to load video: ${error?.message || error?.toString() || 'Unknown error'}`;

    if (error?.message?.includes('403') || error?.message?.includes('Forbidden')) {
      errorMessage = 'Video access denied (403 Forbidden). This video stream may not be ready yet or requires authentication.';
    } else if (error?.message?.includes('404')) {
      errorMessage = 'Video not found (404). The video file may have been moved or deleted.';
    } else if (error?.message?.includes('CORS')) {
      errorMessage = 'Cross-origin access denied. The video server does not allow access from this domain.';
    } else if (error?.message?.includes('Network')) {
      errorMessage = 'Network error. Please check your internet connection and try again.';
    }

    setError(errorMessage);
    setIsLoading(false);
    setIsPlaying(false);
    setPlayerInitialized(false);
  };

  // Handler for player ready
  const handleReady = () => {
    console.log('🎬 VideoModalSimple: Player ready');

    if (!playerInitialized) {
      setIsLoading(false);
      setError(null);
      setPlayerInitialized(true);

      // Try to get duration from the player
      if (playerRef.current) {
        try {
          const player = playerRef.current.getInternalPlayer();
          console.log('🎬 VideoModalSimple: Internal player:', player);
          if (player && player.duration) {
            console.log('🎬 VideoModalSimple: Video duration:', player.duration);
            setDuration(player.duration);
          }
        } catch (error) {
          console.log('🎬 VideoModalSimple: Could not get duration:', error);
        }

        // Set initial position if startTime is provided
        if (startTime !== undefined) {
          console.log('🎬 VideoModalSimple: Seeking to start time:', startTime);
          playerRef.current.seekTo(startTime, 'seconds');
        }

        // Log endTime for debugging
        if (endTime !== undefined) {
          console.log('🎬 VideoModalSimple: End time set to:', endTime);
        }
      }

      // Start playback after a delay
      setTimeout(() => {
        setIsPlaying(true);
      }, 250);
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
                       <ReactPlayer
                         ref={playerRef}
                         url={videoUrl}
                         playing={isPlaying}
                         controls={true}
                         width="100%"
                         height="100%"
                         style={{ position: 'absolute', top: 0, left: 0 }}
                         light={false}
                         playIcon={<></>}
                         onReady={handleReady}
                         onProgress={handleProgress}
                         onError={handleError}
                         progressInterval={50}
                         onLoadStart={() => {
                           console.log('🎬 VideoModalSimple: Load start');
                         }}
                         onCanPlay={() => {
                           console.log('🎬 VideoModalSimple: Can play');
                         }}
                         onLoadedData={() => {
                           console.log('🎬 VideoModalSimple: Loaded data');
                         }}
                         onLoadedMetadata={() => {
                           console.log('🎬 VideoModalSimple: Loaded metadata');
                         }}
                         onBuffer={() => {
                           console.log('🎬 VideoModalSimple: Buffering');
                         }}
                         onBufferEnd={() => {
                           console.log('🎬 VideoModalSimple: Buffer end');
                         }}
                         onSeek={() => {
                           console.log('🎬 VideoModalSimple: Seek');
                         }}
                         onEnded={() => {
                           console.log('🎬 VideoModalSimple: Ended');
                         }}
                         onPlay={() => {
                           console.log('🎬 VideoModalSimple: Play event');
                           setIsPlaying(true);
                         }}
                         onPause={() => {
                           console.log('🎬 VideoModalSimple: Pause event');
                           setIsPlaying(false);
                         }}
                         config={{
                           file: {
                             attributes: {
                               preload: "auto",
                               controlsList: "nodownload",
                               crossOrigin: "anonymous"
                             },
                             forceVideo: true,
                             forceHLS: false,
                             hlsOptions: {
                               enableWorker: true,
                               debug: false,
                               lowLatencyMode: false,
                               backBufferLength: 90
                             }
                           }
                         }}
                       />

            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                  <p>Loading video...</p>
                </div>
              </div>
            )}

                     {/* Error overlay */}
                     {error && (
                       <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-10">
                         <div className="text-white text-center p-4">
                           <div className="text-red-400 mb-2">⚠️</div>
                           <p className="text-sm">{error}</p>
                           {duration > 0 && (
                             <p className="text-xs text-gray-300 mt-1">Duration: {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2, '0')}</p>
                           )}
                           <button
                             onClick={() => {
                               setError(null);
                               setIsLoading(true);
                             }}
                             className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                           >
                             Retry
                           </button>
                         </div>
                       </div>
                     )}

            {/* Bounding box overlay */}
            {showOverlay && bboxNorm && !isLoading && !error && (
              <div
                className="absolute border-2 border-red-500 pointer-events-none z-20"
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
