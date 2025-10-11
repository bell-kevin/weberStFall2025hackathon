import { useState } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { ResultDisplay } from './components/ResultDisplay';
import { describeImage, getStoryFromDescription } from './services/api';
import './styles/App.css';

function App() {
  const [description, setDescription] = useState('');
  const [story, setStory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageSelect = async (imageData) => {
    if (!imageData) {
      setDescription('');
      setStory('');
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setDescription('');
    setStory('');

    try {
      const result = await describeImage(imageData);
      setDescription(result.description);

      const generatedStory = await getStoryFromDescription(result.description);
      setStory(generatedStory);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Image to Story Generator</h1>
        <p>Upload an image and get an AI-powered story</p>
      </header>
      <div className="content">
        <ImageUpload onImageSelect={handleImageSelect} />
        <ResultDisplay
          description={description}
          story={story}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}

export default App;
