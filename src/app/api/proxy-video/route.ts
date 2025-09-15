// import { NextRequest, NextResponse } from 'next/server';

// export async function GET(request: NextRequest) {
//   const { searchParams } = new URL(request.url);
//   const videoUrl = searchParams.get('url');

//   if (!videoUrl) {
//     return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
//   }

//   try {
//     console.log('🎬 ProxyVideo: Fetching video from:', videoUrl);

//     // Get range header from original request
//     const range = request.headers.get('range');

//     const headers: Record<string, string> = {
//       'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//       'Accept': '*/*',
//     };

//     // Add range header if present
//     if (range) {
//       headers['Range'] = range;
//     }

//     const response = await fetch(videoUrl, {
//       headers,
//     });

//     if (!response.ok) {
//       console.error('🎬 ProxyVideo: Failed to fetch video:', response.status, response.statusText);
//       return NextResponse.json(
//         { error: `Failed to fetch video: ${response.statusText}` },
//         { status: response.status }
//       );
//     }

//     // Get response headers
//     const contentType = response.headers.get('content-type') || 'application/octet-stream';
//     const contentLength = response.headers.get('content-length');
//     const acceptRanges = response.headers.get('accept-ranges');
//     const contentRange = response.headers.get('content-range');

//     console.log('🎬 ProxyVideo: Video response headers:', {
//       contentType,
//       contentLength,
//       acceptRanges,
//       contentRange,
//       status: response.status
//     });

//     // Create response headers with CORS
//     const responseHeaders: Record<string, string> = {
//       'Content-Type': contentType,
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
//       'Access-Control-Allow-Headers': 'Range, Accept, Accept-Encoding, User-Agent',
//       'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
//       'Cache-Control': 'public, max-age=3600',
//     };

//     // Copy relevant headers
//     if (contentLength) {
//       responseHeaders['Content-Length'] = contentLength;
//     }

//     if (acceptRanges) {
//       responseHeaders['Accept-Ranges'] = acceptRanges;
//     }

//     if (contentRange) {
//       responseHeaders['Content-Range'] = contentRange;
//     }

//     // Handle HLS playlist files - rewrite relative URLs to use our proxy
//     if (contentType.includes('application/vnd.apple.mpegurl') || contentType.includes('application/x-mpegURL')) {
//       const text = await response.text();
//       const baseUrl = new URL(videoUrl);
//       const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);

//       // Rewrite relative URLs to use our proxy
//       const modifiedText = text.replace(/([^\r\n]*\.m3u8[^\r\n]*)/g, (match) => {
//         if (match.startsWith('http')) {
//           // Absolute URL - proxy it
//           return `/api/proxy-video?url=${encodeURIComponent(match)}`;
//         } else {
//           // Relative URL - resolve against original domain and proxy it
//           const resolvedUrl = new URL(match, baseUrl.origin + basePath).toString();
//           return `/api/proxy-video?url=${encodeURIComponent(resolvedUrl)}`;
//         }
//       });

//       console.log('🎬 ProxyVideo: Modified HLS playlist:', modifiedText.substring(0, 500) + '...');

//       return new NextResponse(modifiedText, {
//         status: response.status,
//         headers: responseHeaders,
//       });
//     }

//     return new NextResponse(response.body, {
//       status: response.status,
//       headers: responseHeaders,
//     });

//   } catch (error) {
//     console.error('🎬 ProxyVideo: Error proxying video:', error);
//     console.error('🎬 ProxyVideo: Error details:', error instanceof Error ? error.message : String(error));
//     console.error('🎬 ProxyVideo: Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
//     return NextResponse.json(
//       { error: 'Failed to proxy video stream', details: error instanceof Error ? error.message : String(error) },
//       { status: 500 }
//     );
//   }
// }

// export async function HEAD(request: NextRequest) {
//   const { searchParams } = new URL(request.url);
//   const videoUrl = searchParams.get('url');

//   if (!videoUrl) {
//     return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
//   }

//   try {
//     const response = await fetch(videoUrl, {
//       method: 'HEAD',
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//       },
//     });

//     const responseHeaders: Record<string, string> = {
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
//       'Access-Control-Allow-Headers': 'Range, Accept, Accept-Encoding, User-Agent',
//       'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
//     };

//     const contentType = response.headers.get('content-type');
//     const contentLength = response.headers.get('content-length');
//     const acceptRanges = response.headers.get('accept-ranges');

//     if (contentType) responseHeaders['Content-Type'] = contentType;
//     if (contentLength) responseHeaders['Content-Length'] = contentLength;
//     if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;

//     return new NextResponse(null, {
//       status: response.status,
//       headers: responseHeaders,
//     });

//   } catch (error) {
//     console.error('🎬 ProxyVideo: Error in HEAD request:', error);
//     return NextResponse.json(
//       { error: 'Failed to check video stream' },
//       { status: 500 }
//     );
//   }
// }

// export async function OPTIONS() {
//   return new NextResponse(null, {
//     status: 200,
//     headers: {
//       'Access-Control-Allow-Origin': '*',
//       'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
//       'Access-Control-Allow-Headers': 'Range, Accept, Accept-Encoding, User-Agent',
//       'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
//     },
//   });
// }
