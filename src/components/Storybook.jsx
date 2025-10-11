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

  console.log('Current page data:', {
    pageNumber: page.page,
    hasImageBase64: !!page.imageBase64,
    imageBase64Length: page.imageBase64?.length || 0,
    hasAudioBase64: !!page.audioBase64,
    audioBase64Length: page.audioBase64?.length || 0,
  });

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
                <p>Image loading...</p>
                <p style={{ fontSize: '12px', color: '#666' }}>Check console for details</p>
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
