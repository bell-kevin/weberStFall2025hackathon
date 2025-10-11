import { Runware } from "npm:@runware/sdk-js@1.1.46";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { imageData } = await req.json();

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const apiKey = Deno.env.get("RUNWARE_API_KEY");
    console.log("API Key available:", !!apiKey);

    if (!apiKey) {
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

    console.log("Initializing Runware...");
    const runware = new Runware({
      apiKey: apiKey,
    });

    console.log("Connecting to Runware...");
    await runware.connect();

    console.log("Requesting image caption...");
    const result = await runware.imageCaption({
      inputImage: imageData,
    });

    console.log("Caption received:", result);
    await runware.disconnect();

    return new Response(
      JSON.stringify({ description: result[0]?.text || "No description available" }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error describing image:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to describe image",
        details: error.toString()
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
