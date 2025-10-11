Weber State University fall 2025 a.i. hackathon 
Mitch is cool
# Image to Story Generator

Weber State University Fall 2025 A.I. Hackathon Project

An AI-powered application that transforms images into interactive storybooks with narration.

## Features

- **Image Upload**: Upload any image to begin the story generation process
- **AI Image Description**: Automatically analyzes and describes uploaded images
- **Story Generation**: Creates engaging stories based on image descriptions
- **Text-to-Speech**: Converts stories into natural-sounding audio narration
- **Interactive Storybook**: Presents stories in an immersive storybook format with automatic page turns and audio playback

## Technologies Used

- **React**: Frontend framework
- **Vite**: Build tool and development server
- **Supabase**: Backend services and edge functions
- **Runware SDK**: AI image description capabilities

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your environment variables:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_RUNWARE_API_KEY=your_runware_api_key
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

## Build

To create a production build:

```bash
npm run build
```

## How It Works

1. Upload an image through the interface
2. The app analyzes the image using AI
3. A story is generated based on the image description
4. The story is converted to audio narration
5. An interactive storybook is created with pages and audio playback
6. The storybook automatically plays through with page turns synchronized to the audio

## License

This project is licensed under the MIT License - see the LICENSE file for details.
