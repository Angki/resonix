# Contributing to Resonix

Thank you for your interest in contributing to **Resonix**! We welcome code contributions, documentation improvements, bug reports, and architectural proposals.

---

## Code of Conduct
We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful and constructive in all interactions.

---

## Architectural Principles
Before submitting contributions, please review our core architectural invariants:
1. **Safety First**: Audio collection paths must remain strictly **read-only**. Never implement write, delete, or retag operations against local audio files.
2. **Audio Precision**: DSP algorithms and equalizer nodes must maintain bit-perfect transparency when set to flat/bypass response.
3. **Subsonic Protocol Compliance**: Changes to `/rest/*` routes must strictly adhere to the OpenSubsonic API specification (supporting both JSON and XML responses, and handling both token and legacy auth).
4. **Offline Resilience**: Web client changes should respect PWA Service Worker caching and IndexedDB offline persistence standards.

---

## Development Setup

### Prerequisites
- **Node.js**: v20.x or newer LTS
- **FFmpeg**: v5.0 or newer on PATH (required for audio transcoding & thumbnail extraction)
- **Git**

### Step-by-Step Setup
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/Angki/resonix.git
   cd resonix
   ```
2. Install workspace dependencies:
   ```bash
   npm install
   ```
3. Initialize the SQLite database and Prisma client:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```
4. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your local music directories and secrets
   ```
5. Start the development server (runs backend on `:3000` and frontend on `:5173` with Vite HMR):
   ```bash
   npm run dev
   ```

---

## Testing & Quality Gates
Every pull request must pass the automated CI quality gate:
```bash
# Run unit & integration test suites
npm test

# Run production build validation
npm run build
```

---

## Commit Guidelines
We follow standard Conventional Commits:
- `feat: add parametric peak filter to equalizer`
- `fix: resolve gapless playback buffer overlap on Safari`
- `perf: optimize artist grid virtual scrolling`
- `docs: update subsonic client setup instructions`
- `refactor: extract audio worklet context into dedicated hook`

---

## Submitting a Pull Request
1. Branch from `main`: `git checkout -b feat/your-feature-name`
2. Ensure all tests pass (`npm test`) and builds succeed (`npm run build`).
3. Commit with concise, descriptive commit messages.
4. Push to your fork and submit a Pull Request to `Angki/resonix:main`.
5. Provide a summary of changes, motivation, and any testing performed in your PR description.
