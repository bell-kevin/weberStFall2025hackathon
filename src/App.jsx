import { useState } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { ResultDisplay } from './components/ResultDisplay';
import { describeImage } from './services/api';
import './styles/App.css';

function App() {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageSelect = async (imageData) => {
    if (!imageData) {
      setDescription('');
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    setDescription('');

    try {
      const result = await describeImage(imageData);
      setDescription(result.description);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Image Description App</h1>
        <p>Upload an image and get an AI-powered description</p>
      </header>
      <div className="content">
        <ImageUpload onImageSelect={handleImageSelect} />
        <ResultDisplay
          description={description}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}

export default App;
