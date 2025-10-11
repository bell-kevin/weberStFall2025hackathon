import { useState } from 'react';
import './Storybook.css';

export function Storybook({ storybook }) {
  const [currentPage, setCurrentPage] = useState(0);

  if (!storybook || !storybook.storybook || storybook.storybook.length === 0) {
    return null;
  }

  const pages = storybook.storybook;
  const page = pages[currentPage];

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

  return (
    <div className="storybook-container">
      <div className="storybook-book">
        <div className="storybook-page">
          <div className="page-number">Page {page.page} of {pages.length}</div>
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
