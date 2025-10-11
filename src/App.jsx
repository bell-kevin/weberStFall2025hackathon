import { useState } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { ResultDisplay } from './components/ResultDisplay';
import { Storybook } from './components/Storybook';
import { describeImage, getStoryFromDescription, convertTextToSpeech, createStorybook } from './services/api';
import './styles/App.css';

function App() {
  const [description, setDescription] = useState('');
  const [story, setStory] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [storybook, setStorybook] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageSelect = async (imageData) => {
    if (!imageData) {
      setDescription('');
      setStory('');
      setAudioUrl('');
      setStorybook(null);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setDescription('');
    setStory('');
    setAudioUrl('');
    setStorybook(null);

    try {
      const result = await describeImage(imageData);
      setDescription(result.description);

      const generatedStory = await getStoryFromDescription(result.description);
      setStory(generatedStory);

      const audioBlob = await convertTextToSpeech(generatedStory);
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      const storybookData = await createStorybook(generatedStory, imageData);
      setStorybook(storybookData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {!storybook && (
        <>
          <header className="header">
            <h1>Image to Story Generator</h1>
            <p>Upload an image and get an AI-powered story</p>
          </header>
          <div className="content">
            <ImageUpload onImageSelect={handleImageSelect} />
            <ResultDisplay
              description={description}
              story={story}
              audioUrl={audioUrl}
              loading={loading}
              error={error}
            />
          </div>
        </>
      )}
      {storybook && <Storybook storybook={storybook} onReset={() => setStorybook(null)} />}
    </div>
  );
}

export default App;
