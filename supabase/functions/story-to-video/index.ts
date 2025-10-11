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
    const { storyText } = await req.json();

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

    console.log(`Processing ${scenes.length} scenes into storybook format...`);

    const storybook = scenes.map((sceneText, index) => {
      const lines = parseSceneLines(sceneText);

      return {
        page: index + 1,
        text: sceneText,
        lines: lines,
      };
    });

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

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process story to storybook",
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