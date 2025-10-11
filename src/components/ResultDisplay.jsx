import './ResultDisplay.css';

export function ResultDisplay({ description, story, loading, error }) {
  if (!loading && !description && !story && !error) {
    return null;
  }

  return (
    <div className="result-display">
      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Creating your story...</p>
        </div>
      )}

      {error && (
        <div className="error-container">
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {description && !loading && !error && (
        <>
          <div className="description-container">
            <div className="description-header">
              <svg className="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <h3>Image Description</h3>
            </div>
            <p className="description-text">{description}</p>
          </div>

          {story && (
            <div className="story-container">
              <div className="story-header">
                <svg className="story-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                  <path d="M2 2l7.586 7.586" />
                  <circle cx="11" cy="11" r="2" />
                </svg>
                <h3>Your Story</h3>
              </div>
              <p className="story-text">{story}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
