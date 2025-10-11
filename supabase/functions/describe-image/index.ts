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

    if (!apiKey) {
      console.error("RUNWARE_API_KEY environment variable is not set");
      return new Response(
        JSON.stringify({ 
          error: "RUNWARE_API_KEY not configured. Please set the RUNWARE_API_KEY secret for this edge function."
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

    console.log("Initializing Runware SDK...");
    const runware = new Runware({
      apiKey: apiKey,
    });

    console.log("Connecting to Runware...");
    await runware.connect();

    console.log("Requesting image description...");
    const result = await runware.requestImageToText({
      inputImage: imageData,
    });

    console.log("Description received successfully");
    await runware.disconnect();

    return new Response(
      JSON.stringify({ description: result.text || "No description available" }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in describe-image function:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to describe image",
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