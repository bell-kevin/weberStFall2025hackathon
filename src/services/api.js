export async function describeImage(imageData) {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/describe-image`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageData }),
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const errorData = JSON.parse(text);
      throw new Error(errorData.error || 'Failed to describe image');
    } catch (e) {
      throw new Error(`Failed to describe image: ${response.status}`);
    }
  }

  const text = await response.text();
  if (!text) {
    throw new Error('Empty response from server');
  }

  return JSON.parse(text);
}

export async function getStoryFromDescription(description) {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-story`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: description }),
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const errorData = JSON.parse(text);
      throw new Error(errorData.error || 'Failed to get story from n8n');
    } catch (e) {
      throw new Error(`Failed to get story from n8n: ${response.status}`);
    }
  }

  const text = await response.text();
  if (!text) {
    throw new Error('Empty response from server');
  }

  const data = JSON.parse(text);
  return data.story || data.text || data.response || 'No story returned';
}

export async function convertTextToSpeech(text) {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const errorData = JSON.parse(text);
      throw new Error(errorData.error || 'Failed to convert text to speech');
    } catch (e) {
      throw new Error(`Failed to convert text to speech: ${response.status}`);
    }
  }

  return await response.blob();
}
