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

    const runware = new Runware({
      apiKey: Deno.env.get("RUNWARE_API_KEY") || "",
    });

    await runware.connect();

    const result = await runware.imageCaption({
      inputImage: imageData,
    });

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
      JSON.stringify({ error: error.message || "Failed to describe image" }),
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
