const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VoiceMap {
  [speaker: string]: string;
}

interface SceneLine {
  speaker: string;
  text: string;
}

interface ProcessedScene {
  sceneIndex: number;
  audioUrl: string;
  videoUrl: string;
  duration: number;
}

const DEFAULT_VOICE_MAP: VoiceMap = {
  "Narrator": "21m00Tcm4TlvDq8ikWAM",
};

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

async function generateAudioWithElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<Blob> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API failed: ${response.status} - ${errorText}`);
  }

  return await response.blob();
}

async function generateVideoWithRunware(
  prompt: string,
  durationSeconds: number,
  modelName: string,
  apiKey: string
): Promise<Blob> {
  const url = "https://api.runware.ai/v1/generate/video";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/octet-stream,video/mp4,application/json",
    },
    body: JSON.stringify({
      prompt: prompt.substring(0, 800),
      duration: durationSeconds,
      model: modelName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Runware API failed: ${response.status} - ${errorText}`);
  }

  const contentType = response.headers.get("Content-Type") || "";
  
  if (contentType.includes("application/json")) {
    const data = await response.json();
    const downloadUrl = data.download_url || data.url;
    
    if (downloadUrl) {
      const videoResponse = await fetch(downloadUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video from URL: ${videoResponse.status}`);
      }
      return await videoResponse.blob();
    }
    
    throw new Error(`Unexpected Runware JSON response: ${JSON.stringify(data)}`);
  }
  
  return await response.blob();
}

async function processScene(
  sceneIndex: number,
  sceneText: string,
  voiceMap: VoiceMap,
  defaultDuration: number,
  modelName: string,
  elevenlabsApiKey: string,
  runwareApiKey: string
): Promise<{ audioBlobs: Blob[], videoBlob: Blob }> {
  console.log(`Processing scene ${sceneIndex}...`);
  
  const lines = parseSceneLines(sceneText);
  if (lines.length === 0) {
    lines.push({ speaker: "Narrator", text: sceneText });
  }

  const audioBlobs: Blob[] = [];
  
  for (const line of lines) {
    const voiceId = voiceMap[line.speaker] || voiceMap["Narrator"];
    if (!voiceId) {
      throw new Error(`No voice ID configured for speaker '${line.speaker}'`);
    }
    
    console.log(`Generating audio for ${line.speaker}: ${line.text.substring(0, 50)}...`);
    const audioBlob = await generateAudioWithElevenLabs(
      line.text,
      voiceId,
      elevenlabsApiKey
    );
    audioBlobs.push(audioBlob);
  }

  console.log(`Generating video for scene ${sceneIndex}...`);
  const videoBlob = await generateVideoWithRunware(
    sceneText,
    Math.max(defaultDuration, 2),
    modelName,
    runwareApiKey
  );

  return { audioBlobs, videoBlob };
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

    const storybook = [];

    for (let index = 0; index < scenes.length; index++) {
      const sceneText = scenes[index];
      const lines = parseSceneLines(sceneText);

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

      console.log(`Generating child-friendly image for page ${index + 1}...`);
      const imagePrompt = `Children's storybook illustration, colorful and whimsical, suitable for kids: ${sceneText.substring(0, 200)}`;

      const imageResponse = await fetch("https://api.runware.ai/v1", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${runwareApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([{
          taskType: "imageInference",
          taskUUID: crypto.randomUUID(),
          positivePrompt: imagePrompt,
          negativePrompt: "scary, dark, horror, violent, inappropriate",
          model: "runware:100@1",
          numberResults: 1,
          height: 512,
          width: 512,
          outputType: "base64",
          outputFormat: "PNG",
        }]),
      });

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        console.error(`Image API error for page ${index + 1}:`, errorText);
        throw new Error(`Failed to generate image for page ${index + 1}: ${errorText}`);
      }

      const imageData = await imageResponse.json();
      const imageBase64 = imageData[0]?.imageBase64 || "";

      storybook.push({
        page: index + 1,
        text: sceneText,
        lines: lines,
        audioBase64: audioBase64,
        imageBase64: imageBase64,
      });
    }

    console.log(`Successfully created storybook with ${storybook.length} pages`);

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
    console.error("Error in story-to-video function:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Error name:", error.name);

    let detailedError = error.message || "Failed to process story to storybook";

    if (error.name === "RangeError" && error.message.includes("call stack")) {
      detailedError = "Data size too large for processing. Try generating a shorter story with fewer pages.";
    }

    return new Response(
      JSON.stringify({
        error: detailedError,
        errorType: error.name,
        details: error.stack,
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