# DocFlow
**Async Document Processing System**

A production-style full-stack application for uploading documents, processing them asynchronously in the background, tracking live progress, reviewing extracted output, finalizing records, and exporting the results.

## Built With
* **Frontend**: Next.js 14, React 18, TypeScript, Axios, Tailwind-inspired Vanilla CSS design system.
* **Backend**: FastAPI, Python 3.11, Pydantic.
* **Database**: PostgreSQL with SQLAlchemy ORM and Alembic for migrations.
* **Message Broker / KV**: Redis.
* **Background Tasks**: Celery worker.
* **Live Updates**: Server-Sent Events (SSE) via Redis Pub/Sub.
* **Infrastructure**: Docker & Docker Compose.

---

## 🚀 Quick Start (Docker Compose)

The easiest way to run the entire system is via Docker Compose.

1. **Clone the repository** (if applicable) and switch to the `docflow` directory.
   ```bash
   cd docflow
   ```

2. **Start all services** (PostgreSQL, Redis, FastAPI Backend, Celery Worker, Next.js Frontend):
   ```bash
   docker-compose up --build
   ```

3. **Access the Application**:
   * **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   * **Backend API Docs**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)

*Note: The backend container runs Alembic migrations automatically on startup.*

---

## 🏗 Architecture Overview

The system strictly decouples the client-facing REST API from background computation.

1. **API Layer (`backend/app/api`)**: Fast, non-blocking HTTP endpoints. Uploads quickly save the file to disk, write a record to Postgres, enqueue a job ID to Celery, and immediately return 201 Created.
2. **Persistence (`backend/app/models`, `backend/app/services`)**: PostgreSQL stores Document metadata, extracted payloads, and Job lifecycle states (Queued, Processing, Completed, Failed, Finalized).
3. **Queue & Worker (`backend/app/worker`)**: Celery running outside the web request cycle handles parsing, data extraction, and NLP summarization.
4. **Real-time Progress (`backend/app/core/redis_client.py`)**: As the Celery worker progresses through 6 distinct stages, it publishes JSON payloads to Redis Pub/Sub. The FastAPI `/progress` endpoint subscribes to this channel and streams events to the frontend via Server-Sent Events (SSE).
5. **Frontend Application (`frontend`)**: Next.js app that consumes the REST API and the SSE stream to drive a dynamic, polished UI.

## 📝 Setup Instructions (Manual / Local Development)

If you prefer to run it without Docker Compose:

### Prerequisites:
* Python 3.11+
* Node.js 18+
* PostgreSQL running on localhost:5432
* Redis running on localhost:6379

### Backend Setup:
```bash
# 1. Setup virtual environment
cd backend
python -m venv venv
source venv/bin/activate  # (or venv\Scripts\activate on Windows)

# 2. Install dependencies
pip install -r requirements.txt

# 3. Setup Environment Variables
cp .env.example .env
# (Ensure DATABASE_URL and REDIS_URL in .env point to your local DB/Redis)

# 4. Run Migrations
alembic upgrade head

# 5. Start FastAPI Server
uvicorn app.main:app --reload

# 6. Start Celery Worker (In a separate terminal)
celery -A app.core.celery_app worker --loglevel=info
```

### Frontend Setup:
```bash
cd frontend
npm install

# Start Next.js development server
npm run dev
```

---

## 🤖 Note on AI Tools Usage

**AI Tools were used during the development of this project.**
* **Boilerplate & Tedious setup**: AI was leveraged to rapidly generate boilerplate code, Pydantic schemas, TypeScript interfaces, and standard SQL Alchemy setup.
* **CSS & Styling**: AI assisted in producing a polished, modern, vanilla CSS design system (Tailwind aesthetic without the framework overhead) based on predefined constraints.
* **Component Outlines**: React hook structures (`useProgressStream`) and standard layouts were drafted by AI tools.
* **Architectural Decisions**: The core async design, database schema relationships, Redis Pub/Sub integration strategy, and task queuing implementations were human-driven design decisions.

---

## ⚖️ Tradeoffs & Assumptions

### Assumptions
* Documents uploaded are relatively lightweight (capped at 50MB) and fit into memory during the parsing stage.
* The system expects a single-node deployment for file storage (saving to local `./uploads` directory) rather than S3 abstraction, for simplicity of setup.
* Celery workers have access to the same shared mount volume (`/app/uploads`) as the web API.

### Tradeoffs
* **File Storage**: In a true scalable production system, `botocore/boto3` would be implemented to stream uploads directly to AWS S3, and standard pre-signed URLs would be used for downloads. Here, local disk is used.
* **NLP & Extraction Quality**: The assignment stated *"Simpler processing logic is acceptable if the system design is strong"*. Therefore, keyword extraction, summarisation, and categorization use heuristic algorithms (word counts, regex, stopwords filtering) instead of heavy LLMs (like spaCy, OpenAI, or HuggingFace) to avoid heavy dependencies and API keys. The architectural skeleton allows for easy swap-in of advanced AI processors.
* **Server-Sent Events (SSE) vs WebSockets**: SSE was chosen over WebSockets because the real-time requirement is exclusively one-way (Server -> Client progress updates). SSE is mathematically lighter on resources and natively supported by browsers via `EventSource`.

## ⚠️ Limitations
* No built-in authentication or multi-tenant user isolation.
* No automatic cleanup of older files in the `uploads` directory.
* The progress tracking granularity is tied to large steps (e.g., Parsing, Extraction). For massive files, intra-step chunked progress updates aren't implemented.

## 📄 Sample Files Used for Testing
You can test the system using generic files:
* Text files (`.txt`, `.md`, `.json`, `.csv`)
* PDFs (`.pdf`) - extracts text and evaluates word frequencies.
* Simple Word Documents (`.docx`).

Sample extracted outputs (JSON and CSV) can be downloaded directly from the UI once a document hits the `Finalized` state.
