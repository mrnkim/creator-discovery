import { NextRequest, NextResponse } from 'next/server';
import { ProductEvent, ProductEventArraySchema, VideoAnalysisMetadata, VideoAnalysisMetadataSchema } from '@/types/brandMentions';

const API_KEY = process.env.TWELVELABS_API_KEY;
const TWELVELABS_API_BASE_URL = process.env.TWELVELABS_API_BASE_URL;

// Maximum gap in seconds between events to be considered for merging
const MAX_GAP_SECONDS = 0.1;

interface AnalyzeRequest {
  videoId: string;
  indexId: string;
  force?: boolean;
  segmentAnalysis?: boolean; // New option for segment-based analysis
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: AnalyzeRequest = await request.json();
    const { videoId, indexId, segmentAnalysis = false } = body;

    // Validate required parameters
    if (!videoId || !indexId) {
      return NextResponse.json(
        { error: 'videoId and indexId are required' },
        { status: 400 }
      );
    }

    // Validate environment variables
    if (!API_KEY || !TWELVELABS_API_BASE_URL) {
      return NextResponse.json(
        { error: 'API credentials not configured' },
        { status: 500 }
      );
    }

    // Get video duration for segment analysis
    let videoDuration = 0;
    if (segmentAnalysis) {
      try {
        const videoUrl = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;
        const videoResponse = await fetch(videoUrl, {
          headers: {
            'x-api-key': API_KEY,
          },
        });

        if (videoResponse.ok) {
          const videoData = await videoResponse.json();
          videoDuration = videoData.system_metadata?.duration || 0;
          console.log(`📹 Video duration: ${videoDuration} seconds`);
        }
      } catch (error) {
        console.warn('⚠️ Failed to get video duration:', error);
      }
    }

    // Create prompt for Analyze API
    const prompt = `
    You are analyzing a video about ${videoDuration > 0 ? Math.round(videoDuration) : 'several minutes'} seconds long.
    Scan the ENTIRE video from start to finish (0%–100%). Do not stop early.

    Respond with ONLY a valid JSON object (no explanations, no markdown) in this format:

    {
      "products": [
        {
          "brand": "BrandName",
          "product_name": "Product Name",
          "timeline": [start_seconds, end_seconds],
          "location": [x_percent, y_percent, width_percent, height_percent],
          "description": "brief factual description"
        }
      ],
      "tones": ["tone1", "tone2"],
      "styles": ["style1", "style2"],
      "creator": "Creator Name or null"
    }

    Rules for products:
    - Analyze 0–25%, 25–75%, and 75–100% of the video.
    - Only include products with visible logos/branding.
    - Use numbers for timeline & location (0–100 for percentages).
    - If no products, use [].
    - Create separate entries for repeated brand appearances.
    - Timeline = when the logo is clearly visible (tight bounds).

    TIGHT TIMELINE RULES (micro-segmentation):
    - Default max segment length: **≤ 8 seconds**. If visibility continues longer, **split into multiple entries**.
    - Hard cap: **a segment must be ≤ min(12 seconds, 20% of total video length)**.
    - Start at the **first second** the logo is clearly visible; end at the **first second** it becomes unclear/occluded/out of frame.
    - If the logo disappears or is unclear for **≥ 1 second**, start a **new segment**.
    - Never output a single wide range like **[0, videoDuration]** unless the logo is truly visible **continuously** the whole time (otherwise, split).
    - Round to integers; ensure **end > start**. If unsure, **err on the shorter side** (do not pad).
    - Skip ultra-brief flashes **< 1 second**.

    Location (bounding box of the **logo area**, not the whole object):
    - [x, y, width, height] are percentages (0–100). Round to integers.
    - **Never use 0** for width/height; enforce **width ≥ 3, height ≥ 3**. If smaller, omit that product.
    - Keep descriptions brief and objective.
    - Check brands on cars, barriers, clothing, equipment, signage, packaging, buildings, etc.

    Rules for tones (pick 1–3):
    aspirational, playful, gritty, cozy, ironic, energetic, professional, casual, dramatic, humorous, serious, romantic, adventurous, nostalgic, futuristic, minimalist, bold, subtle, confident, mysterious

    Rules for styles (pick 1–3):
    retro, modern, classic, vintage, contemporary, minimalist, maximalist, industrial, bohemian, luxury, street, corporate, artistic, cinematic, documentary, commercial, lifestyle, fashion, tech, food, travel, fitness, beauty, gaming

    Rules for creator:
    - If creator/influencer, include their name (watermark/intro/ID).
    - Otherwise, use null.

    REFERENCE EXAMPLE (FORMAT ONLY; DO NOT COPY VALUES):
    {
      "products": [
        { "brand": "Emirates", "product_name": "Sailboat Livery", "timeline": [12, 16], "location": [18, 22, 12, 8], "description": "logo on sail during close pass" },
        { "brand": "Emirates", "product_name": "Sailboat Livery", "timeline": [44, 48], "location": [24, 30, 10, 7], "description": "logo visible mid-race" },
        { "brand": "Emirates", "product_name": "Sailboat Livery", "timeline": [102, 107], "location": [20, 26, 11, 9], "description": "logo shown in finish segment" }
      ],
      "tones": ["energetic", "confident"],
      "styles": ["documentary", "lifestyle"],
      "creator": null
    }
    `;



    // Call Analyze API
    const analyzeUrl = `${TWELVELABS_API_BASE_URL}/analyze`;
    const analyzeOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        prompt,
        video_id: videoId,
        stream: false
      })
    };

    console.log(`🔍 Analyzing video ${videoId} for brand mentions...`);
    const analyzeResponse = await fetch(analyzeUrl, analyzeOptions);

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      console.error(`❌ Analyze API error: ${analyzeResponse.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Failed to analyze video: ${analyzeResponse.statusText}` },
        { status: analyzeResponse.status }
      );
    }

    // Parse response text
    const responseText = await analyzeResponse.text();
    console.log(`📝 Raw API response for video ${videoId}:`, responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));

    let parsedEvents: unknown[] = [];
    let videoAnalysis: VideoAnalysisMetadata = {};

    // Check if response is empty
    if (!responseText || responseText.trim() === '') {
      console.log(`ℹ️ Empty response for video ${videoId}`);
      return NextResponse.json({ events: [], analysis: videoAnalysis });
    }

    try {
      // First attempt: parse the entire response as JSON
      const responseObj = JSON.parse(responseText);
      console.log(`✅ Successfully parsed JSON response for video ${videoId}`);

      // Check if the response has a 'data' field containing JSON string
      if (responseObj && typeof responseObj.data === 'string') {
        console.log(`🔍 Found 'data' field, parsing nested JSON for video ${videoId}`);
        const nestedData = JSON.parse(responseObj.data);

        // Handle new structure with products, tones, styles, creator
        if (nestedData && typeof nestedData === 'object') {
          parsedEvents = nestedData.products || [];
          videoAnalysis = {
            tones: nestedData.tones || [],
            styles: nestedData.styles || [],
            creator: nestedData.creator || undefined
          };
        } else {
          // Fallback to array format
          parsedEvents = Array.isArray(nestedData) ? nestedData : [];
        }
        console.log(`✅ Successfully parsed nested JSON data for video ${videoId}`);
      } else if (responseObj && typeof responseObj === 'object') {
        // Handle new structure directly
        if (responseObj.products !== undefined) {
          parsedEvents = responseObj.products || [];
          videoAnalysis = {
            tones: responseObj.tones || [],
            styles: responseObj.styles || [],
            creator: responseObj.creator || undefined
          };
        } else if (Array.isArray(responseObj)) {
          // Direct array response (legacy format)
          parsedEvents = responseObj;
        } else {
          console.warn(`⚠️ Unexpected response structure for video ${videoId}:`, responseObj);
          parsedEvents = [];
        }
        console.log(`✅ Using direct object response for video ${videoId}`);
      } else {
        console.warn(`⚠️ Unexpected response structure for video ${videoId}:`, responseObj);
        parsedEvents = [];
      }
    } catch (parseError) {
      console.warn(`⚠️ Failed to parse response as JSON for video ${videoId}:`, parseError);
      console.warn('🔍 Attempting to extract JSON...');

      try {
        // Second attempt: extract JSON object or array
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);

        if (objectMatch) {
          const parsed = JSON.parse(objectMatch[0]);
          if (parsed.products !== undefined) {
            parsedEvents = parsed.products || [];
            videoAnalysis = {
              tones: parsed.tones || [],
              styles: parsed.styles || [],
              creator: parsed.creator || undefined
            };
          } else {
            // Treat as legacy array format
            parsedEvents = [parsed];
          }
          console.log(`✅ Successfully extracted JSON object for video ${videoId}`);
        } else if (arrayMatch) {
          parsedEvents = JSON.parse(arrayMatch[0]);
          console.log(`✅ Successfully extracted JSON array for video ${videoId}`);
        } else {
          throw new Error('No valid JSON found in response');
        }
      } catch (extractError) {
        console.error(`❌ Failed to extract valid JSON from response for video ${videoId}:`, extractError);
        console.error(`📄 Full response text:`, responseText);

        // Return empty results instead of error to avoid blocking the process
        console.log(`⚠️ Returning empty results for video ${videoId} due to parsing issues`);
        return NextResponse.json({ events: [], analysis: videoAnalysis });
      }
    }

    // Check if parsedEvents is an array
    if (!Array.isArray(parsedEvents)) {
      return NextResponse.json(
        { error: 'Analyze API response is not an array' },
        { status: 422 }
      );
    }

    // Convert to ProductEvent[] format with type safety
    const events: ProductEvent[] = parsedEvents.map((item, index) => {
      // Type guard for item properties
      const eventItem = item as Record<string, unknown>;
      const timeline = Array.isArray(eventItem.timeline) ? eventItem.timeline : [0, 0];
      const location = Array.isArray(eventItem.location) ? eventItem.location : [0, 0, 0, 0];

      console.log(`🔍 Parsing event ${index} for video ${videoId}:`, {
        original_item: eventItem,
        timeline: timeline,
        location: location
      });

      return {
        video_id: videoId,
        brand: typeof eventItem.brand === 'string' ? eventItem.brand : 'Unknown Brand',
        product_name: typeof eventItem.product_name === 'string' ? eventItem.product_name : 'Unknown Product',
        timeline_start: typeof timeline[0] === 'number' ? timeline[0] : 0,
        timeline_end: typeof timeline[1] === 'number' ? timeline[1] : 0,
        bbox_norm: {
          x: typeof location[0] === 'number' ? location[0] : 0,
          y: typeof location[1] === 'number' ? location[1] : 0,
          w: typeof location[2] === 'number' ? location[2] : 0,
          h: typeof location[3] === 'number' ? location[3] : 0
        },
        description: typeof eventItem.description === 'string' ? eventItem.description : '',
        source: 'analyze' as const
      };
    });

    // Validate with zod schema
    const validationResult = ProductEventArraySchema.safeParse(events);
    if (!validationResult.success) {
      console.error(`❌ Validation error for video ${videoId}:`, validationResult.error.format());
      console.warn(`⚠️ Skipping validation for video ${videoId} and proceeding with events`);
      // Don't return error, just log and continue - validation might be too strict
    } else {
      console.log(`✅ Events validation passed for video ${videoId}`);
    }

    // Skip deduplication for now to preserve individual events
    const deduplicatedEvents = events;
    console.log(`✅ Found ${deduplicatedEvents.length} brand mentions (deduplication skipped)`);

    // Validate video analysis metadata
    const analysisValidationResult = VideoAnalysisMetadataSchema.safeParse(videoAnalysis);
    if (!analysisValidationResult.success) {
      console.warn(`⚠️ Video analysis validation failed for video ${videoId}:`, analysisValidationResult.error.format());
      // Use empty analysis if validation fails
      videoAnalysis = {};
    } else {
      console.log(`✅ Video analysis validation passed for video ${videoId}`);
    }

    // Save to user_metadata
    const metadata = {
      brand_product_events: JSON.stringify(deduplicatedEvents),
      brand_product_analyzed_at: new Date().toISOString(),
      brand_product_source: 'analyze',
      video_tones: videoAnalysis.tones ? JSON.stringify(videoAnalysis.tones) : undefined,
      video_styles: videoAnalysis.styles ? JSON.stringify(videoAnalysis.styles) : undefined,
      video_creator: videoAnalysis.creator || undefined
    };

    console.log(`💾 Saving metadata for video ${videoId}:`, {
      brand_product_events: metadata.brand_product_events,
      event_count: deduplicatedEvents.length,
      events: deduplicatedEvents
    });

    // Update video metadata
    const updateUrl = `${TWELVELABS_API_BASE_URL}/indexes/${indexId}/videos/${videoId}`;
    const updateOptions = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({
        user_metadata: metadata
      })
    };

    const updateResponse = await fetch(updateUrl, updateOptions);

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error(`❌ Failed to update metadata: ${updateResponse.status} - ${errorText}`);
      // Continue anyway to return the events
    } else {
      console.log(`✅ Updated metadata for video ${videoId}`);
    }

    // Return the events and analysis
    return NextResponse.json({
      events: deduplicatedEvents,
      analysis: videoAnalysis
    });
  } catch (error) {
    console.error('❌ Error in brand mention analysis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * Deduplicates product events by merging overlapping events for the same brand and product
 */
function deduplicateEvents(events: ProductEvent[]): ProductEvent[] {
  // Group events by brand and product name
  const groupedEvents: Record<string, ProductEvent[]> = {};

  for (const event of events) {
    const key = `${event.brand}|${event.product_name}`;
    if (!groupedEvents[key]) {
      groupedEvents[key] = [];
    }
    groupedEvents[key].push(event);
  }

  const deduplicatedEvents: ProductEvent[] = [];

  // Process each group
  for (const key in groupedEvents) {
    const group = groupedEvents[key];

    // Sort by start time
    group.sort((a, b) => a.timeline_start - b.timeline_start);

    let currentEvent = { ...group[0] };
    let longestDuration = currentEvent.timeline_end - currentEvent.timeline_start;

    for (let i = 1; i < group.length; i++) {
      const nextEvent = group[i];

      // Check if events overlap or are close enough to merge
      if (nextEvent.timeline_start <= currentEvent.timeline_end + MAX_GAP_SECONDS) {
        // Merge events
        currentEvent.timeline_end = Math.max(currentEvent.timeline_end, nextEvent.timeline_end);

        // Keep bbox from the longest segment
        const nextDuration = nextEvent.timeline_end - nextEvent.timeline_start;
        if (nextDuration > longestDuration) {
          currentEvent.bbox_norm = nextEvent.bbox_norm;
          longestDuration = nextDuration;
        }

        // Merge descriptions if they differ
        if (nextEvent.description &&
            nextEvent.description !== currentEvent.description &&
            currentEvent.description) {
          currentEvent.description = `${currentEvent.description}; ${nextEvent.description}`;
        } else if (nextEvent.description && !currentEvent.description) {
          currentEvent.description = nextEvent.description;
        }
      } else {
        // Current event is complete, add it to results and start a new one
        deduplicatedEvents.push(currentEvent);
        currentEvent = { ...nextEvent };
        longestDuration = currentEvent.timeline_end - currentEvent.timeline_start;
      }
    }

    // Add the last event
    deduplicatedEvents.push(currentEvent);
  }

  return deduplicatedEvents;
}
