import { Runware } from "npm:@runware/sdk-js@1.1.46";

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

function extractErrorMessage(error: any): string {
  if (!error) return 'Unknown error (null/undefined)';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;

  const errorString = String(error);
  if (errorString !== '[object Object]') return errorString;

  try {
    const jsonError = JSON.stringify(error, Object.getOwnPropertyNames(error));
    if (jsonError && jsonError !== '{}') return jsonError;
  } catch {}

  return 'Error could not be serialized';
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  let runware: any = null;

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
    const runwareApiKey = Deno.env.get("RUNWARE_API_KEY");

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

    if (!runwareApiKey) {
      return new Response(
        JSON.stringify({ error: "RUNWARE_API_KEY not configured" }),
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

    console.log(`Processing ${scenes.length} scenes into storybook format with audio and images...`);

    console.log("Initializing Runware SDK once for all images...");
    runware = new Runware({ apiKey: runwareApiKey });
    await runware.connect();
    console.log("Runware SDK connected successfully");

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
        console.log(`Generating new image for page ${index + 1}...`);
        const imagePrompt = `Children's storybook illustration, colorful and whimsical, digital art, suitable for kids: ${sceneText.substring(0, 200)}`;
        console.log(`Image prompt: "${imagePrompt}"`);

        try {
          console.log(`Requesting image generation via Runware SDK...`);
          const imageResults = await runware.requestImages({
            positivePrompt: imagePrompt,
            negativePrompt: "scary, dark, horror, violent, inappropriate, text, words, letters, watermark",
            model: "runware:100@1",
            numberResults: 1,
            height: 512,
            width: 512,
            outputType: "base64",
            outputFormat: "PNG",
          });

          console.log(`Runware response received. Number of results: ${imageResults?.length || 0}`);

          if (!imageResults || imageResults.length === 0) {
            console.error(`No images returned from Runware for page ${index + 1}`);
            throw new Error(`Runware SDK returned no images. This may indicate API quota exhausted or model unavailable.`);
          }

          const imageResult = imageResults[0];
          console.log(`Image result type: ${typeof imageResult}`);
          console.log(`Image result keys: ${Object.keys(imageResult || {}).join(', ')}`);

          if (imageResult.imageBase64) {
            imageBase64 = imageResult.imageBase64;
            console.log(`✓ Got base64 image directly. Length: ${imageBase64.length} chars`);
          } else if (imageResult.imageURL) {
            console.log(`Got image URL instead of base64: ${imageResult.imageURL}`);
            console.log(`Downloading image from URL...`);

            const urlResponse = await fetch(imageResult.imageURL);
            if (!urlResponse.ok) {
              throw new Error(`Failed to download image from URL. Status: ${urlResponse.status}`);
            }

            const imageBuffer = await urlResponse.arrayBuffer();
            const imageBytes = new Uint8Array(imageBuffer);
            let imageBinary = '';
            for (let i = 0; i < imageBytes.length; i += chunkSize) {
              const chunk = imageBytes.subarray(i, Math.min(i + chunkSize, imageBytes.length));
              imageBinary += String.fromCharCode(...chunk);
            }
            imageBase64 = btoa(imageBinary);
            console.log(`✓ Converted URL image to base64. Length: ${imageBase64.length} chars`);
          } else {
            console.error(`Runware result missing both imageBase64 and imageURL!`);
            console.error(`Full result object: ${JSON.stringify(imageResult)}`);
            throw new Error(`Runware returned invalid response: no imageBase64 or imageURL field found`);
          }
        } catch (imageError) {
          console.error(`\n!!! IMAGE GENERATION ERROR for page ${index + 1} !!!`);
          console.error(`Error type: ${imageError?.constructor?.name || typeof imageError}`);
          console.error(`Error message: ${imageError?.message || 'No message property'}`);
          console.error(`Error string: ${String(imageError)}`);

          try {
            console.error(`Error JSON: ${JSON.stringify(imageError, Object.getOwnPropertyNames(imageError), 2)}`);
          } catch (e) {
            console.error(`Could not JSON stringify error`);
          }

          if (imageError?.stack) {
            console.error(`Stack trace: ${imageError.stack}`);
          }

          const formattedMessage = extractErrorMessage(imageError);
          throw new Error(`Image generation failed for page ${index + 1}: ${formattedMessage}`);
        }
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

    if (runware) {
      console.log("Disconnecting from Runware...");
      await runware.disconnect();
      console.log("Runware disconnected successfully");
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
    if (runware) {
      try {
        await runware.disconnect();
      } catch (disconnectError) {
        console.error("Error disconnecting Runware:", disconnectError);
      }
    }

    console.error("\n!!! FATAL ERROR in story-to-video function !!!");
    console.error(`Error type: ${error?.constructor?.name || typeof error}`);
    console.error(`Error message: ${error?.message || 'No message property'}`);
    console.error(`Error string: ${String(error)}`);

    try {
      console.error(`Error JSON: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    } catch (e) {
      console.error(`Could not JSON stringify error`);
    }

    if (error?.stack) {
      console.error(`Stack trace:\n${error.stack}`);
    }

    let detailedError = extractErrorMessage(error);

    if (error?.name === "RangeError" && error?.message?.includes("call stack")) {
      detailedError = "Data size too large for processing. Try generating a shorter story with fewer pages.";
    }

    return new Response(
      JSON.stringify({
        error: detailedError,
        errorType: error?.constructor?.name || error?.name || typeof error,
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