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
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to describe image');
  }

  return await response.json();
}
