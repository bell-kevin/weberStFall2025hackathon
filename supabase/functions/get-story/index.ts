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
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({
          error: "N8N_WEBHOOK_URL not configured",
          details: "The n8n webhook URL must be configured in environment variables. Please set N8N_WEBHOOK_URL to your n8n webhook endpoint."
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

    console.log(`Calling n8n webhook: ${webhookUrl}`);
    console.log(`Prompt: ${prompt.substring(0, 100)}...`);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    console.log(`n8n response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`n8n webhook error (${response.status}):`, errorText);
      throw new Error(`n8n webhook failed with status ${response.status}. Response: ${errorText.substring(0, 200)}`);
    }

    const text = await response.text();

    if (!text || text.trim() === '') {
      throw new Error('n8n webhook returned empty response');
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`n8n webhook returned invalid JSON: ${text.substring(0, 100)}`);
    }

    return new Response(
      JSON.stringify(data),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error getting story:", error);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Error name:", error.name);

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to get story",
        errorType: error.name,
        details: error.stack || error.toString(),
        hint: "Check that your n8n webhook is active and accessible. The webhook should accept POST requests with a 'prompt' field."
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