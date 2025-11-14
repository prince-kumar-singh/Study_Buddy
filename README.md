
# Study Buddy - AI-Powered Learning Platform

Study Buddy is an AI-powered learning platform that transforms your study materials into interactive study guides. Upload your documents, and Study Buddy will automatically generate summaries, flashcards, and quizzes to help you learn more effectively.

## Features

- **AI-Powered Content Generation**: Automatically generate summaries, flashcards, and quizzes from your uploaded documents (PDF, DOCX, TXT) and YouTube Transcripts.
- **Interactive Learning**: Reinforce your knowledge with interactive flashcards and quizzes.
- **Q&A**: Ask questions about your documents and get instant answers from the AI.
- **Spaced Repetition**: Study flashcards using a spaced repetition algorithm (SM2) to maximize retention.
- **Real-time Updates**: Get real-time updates on the processing status of your documents.
- **User Authentication**: Secure user authentication with JWT.
- **Dashboard**: Track your learning progress and recently studied materials.

## Tech Stack

### Backend

- **Framework**: Node.js, Express, TypeScript
- **Database**: MongoDB with Mongoose
- **AI**:
  - **LLM**: Google Gemini
  - **Framework**: LangChain.js
  - **Vector Store**: Pinecone / ChromaDB for semantic search and Q&A
- **Real-time Communication**: Socket.IO
- **File Storage**: Cloudinary for document storage
- **Authentication**: Passport.js (JWT, Google, GitHub)
- **Job Queue**: Redis for background jobs
- **Scheduled Jobs**: node-cron for maintenance tasks
- **Other**: Zod for validation, Winston for logging

### Frontend

- **Framework**: React, Vite, TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: React Query, Axios
- **Routing**: React Router
- **Real-time Communication**: Socket.IO Client

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Docker and Docker Compose (for running dependencies)
- Access to Google Gemini API, Pinecone/ChromaDB, and Cloudinary

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/study-buddy.git
   cd study-buddy
   ```

2. **Install dependencies:**

   This command will install dependencies for both the frontend and backend.

   ```bash
   npm run install:all
   ```

3. **Set up environment variables:**

   Create a `.env` file in the `backend` directory by copying the `.env.example` file.

   ```bash
   cp backend/.env.example backend/.env
   ```

   Update the `backend/.env` file with your credentials for:
   - MongoDB
   - Google Gemini API
   - Pinecone/ChromaDB
   - Cloudinary
   - JWT secret

4. **Run the development servers:**

   This will start both the backend and frontend development servers concurrently.

   ```bash
   npm run dev
   ```

   - The backend will be running on `http://localhost:3001`
   - The frontend will be running on `http://localhost:3000`

## Project Structure

The project is a monorepo with two main packages: `frontend` and `backend`.

```
study-buddy/
├── backend/         # Express.js backend
│   ├── src/
│   └── ...
├── frontend/        # React frontend
│   ├── src/
│   └── ...
├── package.json     # Root package.json
└── README.md
```

## API Endpoints

The backend exposes a REST API for the frontend to consume. For a detailed list of endpoints, you can refer to the API documentation available at `http://localhost:3001/api-docs` when the backend server is running.

Key endpoints include:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/contents/upload-document`
- `GET /api/contents`
- `GET /api/flashcards/:contentId`
- `GET /api/quizzes/:contentId`
- `POST /api/qa/ask`

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
