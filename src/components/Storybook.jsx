import { useState, useEffect, useRef } from 'react';
import './Storybook.css';

export function Storybook({ storybook }) {
  const [currentPage, setCurrentPage] = useState(0);
  const audioRef = useRef(null);

  if (!storybook || !storybook.storybook || storybook.storybook.length === 0) {
    return null;
  }

  const pages = storybook.storybook;
  const page = pages[currentPage];

  const imageDebug = {
    pageNumber: page.page,
    hasImageBase64: !!page.imageBase64,
    imageBase64Length: page.imageBase64?.length || 0,
    imageBase64Preview: page.imageBase64 ? page.imageBase64.substring(0, 50) + '...' : 'NO DATA',
    hasAudioBase64: !!page.audioBase64,
    audioBase64Length: page.audioBase64?.length || 0,
  };

  console.log('=== STORYBOOK PAGE DEBUG ===');
  console.log('Current page data:', imageDebug);
  console.log('Full page object keys:', Object.keys(page));
  console.log('===========================');

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(err => {
        console.log('Audio autoplay prevented:', err);
      });
    }
  }, [currentPage]);

  const goToNextPage = () => {
    if (currentPage < pages.length - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const audioSrc = page.audioBase64 ? `data:audio/mpeg;base64,${page.audioBase64}` : null;
  const imageSrc = page.imageBase64 ? `data:image/png;base64,${page.imageBase64}` : null;

  console.log('Image src exists:', !!imageSrc);

  return (
    <div className="storybook-container">
      <div className="storybook-book">
        <div className="storybook-page">
          <div className="page-number">Page {page.page} of {pages.length}</div>

          <div className="page-image">
            {imageSrc ? (
              <img src={imageSrc} alt={`Illustration for page ${page.page}`} />
            ) : (
              <div className="placeholder-image">
                <h3>⚠️ Image Missing</h3>
                <p><strong>Issue:</strong> No image data received from API</p>
                <div style={{ fontSize: '12px', marginTop: '10px', textAlign: 'left', maxWidth: '400px' }}>
                  <p><strong>Debug Info:</strong></p>
                  <ul style={{ textAlign: 'left' }}>
                    <li>Page: {page.page}</li>
                    <li>Image data present: {page.imageBase64 ? 'Yes' : 'No'}</li>
                    <li>Image data length: {page.imageBase64?.length || 0} chars</li>
                  </ul>
                  <p style={{ marginTop: '10px' }}><strong>Possible causes:</strong></p>
                  <ul style={{ textAlign: 'left' }}>
                    <li>Runware API key not configured</li>
                    <li>API quota exceeded</li>
                    <li>Image generation failed on server</li>
                  </ul>
                  <p style={{ marginTop: '10px', color: '#ff6b6b' }}>
                    Check the browser console (F12) for detailed logs
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="page-content">
            {page.lines.map((line, idx) => (
              <div key={idx} className="story-line">
                {line.speaker !== 'Narrator' && (
                  <span className="speaker">{line.speaker}: </span>
                )}
                <span className="text">{line.text}</span>
              </div>
            ))}
          </div>

          {audioSrc && (
            <div className="audio-controls">
              <audio ref={audioRef} controls>
                <source src={audioSrc} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
        </div>

        <div className="storybook-controls">
          <button
            onClick={goToPreviousPage}
            disabled={currentPage === 0}
            className="nav-button"
          >
            Previous
          </button>
          <button
            onClick={goToNextPage}
            disabled={currentPage === pages.length - 1}
            className="nav-button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
