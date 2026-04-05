AI-Powered Talent Match & Job Retrieval System
A high-performance, full-stack recruitment platform featuring Local Neural Embeddings, Semantic Vector Search, and Automated Data Ingestion Pipelines. This system bypasses traditional keyword matching by utilizing a MiniLM-L6-v2 model to understand the contextual relationship between candidate resumes and job requirements.

🚀 Key AI Features (NVIDIA-Targeted)
Local Inference Engine: Utilizes Transformers.js to run 384-dimension embedding models directly on the server, eliminating external API latency and costs.

Vector Search Retrieval: Implemented MongoDB Atlas Vector Search using Hierarchical Navigable Small World (HNSW) indexing for high-speed semantic matching.

Decoupled Async Architecture: Staggered background workers (via node-cron) separate I/O-bound data fetching from CPU-intensive tensor math.

Context-Aware Chunking: Implemented a recursive text-splitting strategy (512-token windows) to process large resumes within the transformer's fixed positional encoding limits.

🛠 Tech Stack
Frontend: React.js, Redux Toolkit, Tailwind CSS, Shadcn/UI

Backend: Node.js, Express.js

Database: MongoDB Atlas (Vector Search Engine)

Machine Learning: Transformers.js (ONNX Runtime), MiniLM-L6-v2

Automation: Node-Cron, Axios, Jooble/Adzuna REST APIs

🏗 System Architecture
Ingestion: Jobs are fetched every 6 hours from external global APIs.

Vectorization: A background worker identifies new records and generates high-dimensional embeddings using a distilled transformer model.

Semantic Match: When a user uploads a resume, the system calculates the Cosine Similarity between the user's vector and the job bank.

Retrieval: Matches are ranked by score and delivered via a RESTful API.

🚦 Getting Started
Prerequisites
Node.js v18+

MongoDB Atlas Account (with Vector Search enabled)

Installation
Clone the repository

Bash
git clone https://github.com/nawalkumar/Job-portal-Application.git
cd Job-portal-Application
Setup Environment Variables
Create a .env file in the root directory:

Code snippet
PORT=5001
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_secret
ADZUNA_APP_ID=your_id
ADZUNA_APP_KEY=your_key
JOOBLE_KEY=your_key
Install Dependencies

Bash
# Install Backend deps
npm install

# Install Frontend deps
cd frontend
npm install
Run the Application

Bash
# From root (Starts Backend & Cron Schedulers)
npm run dev
📈 System Optimizations
Memory Management
To optimize for system resources, the vectorization worker uses batch-limit processing (20 jobs/cycle). This prevents memory overflow during the ONNX model loading phase on shared hosting environments.

Data Integrity
The system implements HTML Sanitization and Regex-based text cleaning before embedding generation to ensure that noise (tags/boilerplate) does not skew the vector's semantic position.

📝 Author
Naval Kumar
Exchange student from NIT Sikkim At IIT Hyderabad.
