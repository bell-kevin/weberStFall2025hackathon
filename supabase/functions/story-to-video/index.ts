const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SceneLine {
  speaker: string;
  text: string;
}

const DIALOGUE_REGEX = /^\s*([A-Za-z][\w\- ]{0,48})\s*:\s*(.+?)\s*$/;

function splitScenes(story: string): string[] {
  return story.split("\n\n")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function parseSceneLines(sceneText: string): SceneLine[] {
  const lines: SceneLine[] = [];

  for (const line of sceneText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(DIALOGUE_REGEX);
    if (match) {
      lines.push({
        speaker: match[1].trim(),
        text: match[2].trim(),
      });
    } else {
      lines.push({
        speaker: "Narrator",
        text: trimmed,
      });
    }
  }

  return lines;
}

function createPlaceholderImage(): string {
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" fill="#e0e7ff"/>
    <text x="256" y="256" font-family="Arial" font-size="24" fill="#6366f1" text-anchor="middle" dominant-baseline="middle">
      Story Image
    </text>
  </svg>`;
  return btoa(svg);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { storyText, originalImageData } = await req.json();

    if (!storyText) {
      return new Response(
        JSON.stringify({ error: "storyText is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const elevenlabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");

    if (!elevenlabsApiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const scenes = splitScenes(storyText);
    if (scenes.length === 0) {
      return new Response(
        JSON.stringify({ error: "No scenes found. Use blank lines (\\n\\n) to separate scenes." }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`Processing ${scenes.length} scenes into storybook format with audio...`);

    const storybook = [];

    for (let index = 0; index < scenes.length; index++) {
      const sceneText = scenes[index];
      const lines = parseSceneLines(sceneText);
      const isLastPage = index === scenes.length - 1;

      console.log(`\n=== Processing Page ${index + 1} of ${scenes.length} ===`);

      console.log(`Generating audio for page ${index + 1}...`);
      const audioResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
        {
          method: "POST",
          headers: {
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": elevenlabsApiKey,
          },
          body: JSON.stringify({
            text: sceneText,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.5,
            },
          }),
        }
      );

      if (!audioResponse.ok) {
        const errorText = await audioResponse.text();
        console.error(`Audio API error for page ${index + 1}:`, errorText);
        throw new Error(`Failed to generate audio for page ${index + 1}: ${errorText}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBytes = new Uint8Array(audioBuffer);
      let audioBinary = '';
      const chunkSize = 8192;
      for (let i = 0; i < audioBytes.length; i += chunkSize) {
        const chunk = audioBytes.subarray(i, Math.min(i + chunkSize, audioBytes.length));
        audioBinary += String.fromCharCode(...chunk);
      }
      const audioBase64 = btoa(audioBinary);
      console.log(`Audio generated successfully. Length: ${audioBase64.length} chars`);

      let imageBase64 = "";

      if (isLastPage && originalImageData) {
        console.log(`Using original uploaded image for final page ${index + 1}`);
        imageBase64 = originalImageData.replace(/^data:image\/[a-z]+;base64,/, '');
        console.log(`Original image loaded. Length: ${imageBase64.length} chars`);
      } else {
        console.log(`Using placeholder image for page ${index + 1}`);
        imageBase64 = createPlaceholderImage();
      }

      const pageData = {
        page: index + 1,
        text: sceneText,
        lines: lines,
        audioBase64: audioBase64,
        imageBase64: imageBase64,
      };

      console.log(`✓ Page ${index + 1} complete. Audio: ${audioBase64.length} chars, Image: ${imageBase64.length} chars`);
      storybook.push(pageData);
    }

    console.log(`\n✓✓✓ Successfully created storybook with ${storybook.length} pages ✓✓✓`);

    return new Response(
      JSON.stringify({
        success: true,
        totalPages: storybook.length,
        storybook: storybook,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("\n!!! FATAL ERROR in story-to-video function !!!");
    console.error(`Error type: ${error?.constructor?.name || 'Unknown'}`);
    console.error(`Error message: ${error?.message || 'No message'}`);
    console.error(`Error string: ${String(error)}`);
    if (error?.stack) {
      console.error(`Stack trace:\n${error.stack}`);
    }

    let detailedError = error?.message || String(error) || "Failed to process story to storybook";

    return new Response(
      JSON.stringify({
        error: detailedError,
        errorType: error?.constructor?.name || error?.name || 'Error',
        details: error?.stack || 'No stack trace available',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});