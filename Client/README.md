# Client

React-based UI for the Distributed Task Scheduler.

## Purpose

Provide a minimal, systems-first UI to:
- Create and schedule jobs
- Monitor system status
- View job execution history
- Manage DLQ tasks
- Perform admin operations

## Structure

```
Client/
├── src/
│   ├── api/           # API client
│   ├── components/    # React components
│   ├── pages/         # Page components
│   ├── App.jsx        # Main app with routing
│   └── main.jsx       # Entry point
├── public/            # Static assets
└── package.json       # Dependencies
```

## Pages

### 1. Dashboard (`pages/Dashboard.jsx`)

**Purpose:** System overview and monitoring

**Features:**
- System metrics (scheduler state, leader info, uptime)
- Worker count
- Redis queue depth
- Job statistics (success/failure rates)
- Fault injection controls (for testing)

### 2. Jobs (`pages/Jobs.jsx`)

**Purpose:** View and manage jobs

**Features:**
- Filterable job table (by status)
- Job detail drawer with:
  - Execution history
  - Attempt count
  - Worker assignment
  - Error messages
- "Run Now" button for immediate execution

### 3. Schedule (`pages/Schedule.jsx`)

**Purpose:** Create new jobs

**Features:**
- Job type selector (HTTP, Shell, Delay)
- Payload editor with templates
- Schedule time picker
- Recent jobs list

### 4. Admin (`pages/Admin.jsx`)

**Purpose:** Administrative operations

**Features:**
- Scheduler enable/disable
- Active workers list
- DLQ management
- System controls

## Components

### `Header.jsx`

Persistent header showing:
- Scheduler status (enabled/disabled)
- Current leader ID
- Real-time updates via polling

### Tab Navigation

Tabs for switching between pages:
- Dashboard
- Jobs
- Schedule
- Admin

## API Client

**File:** `src/api/api.js`

Axios-based client for backend API:

```javascript
import api from './api/api';

// Create job
const task = await api.createTask(jobData);

// Get system status
const status = await api.getSystemStatus();

// View DLQ
const dlq = await api.getDLQTasks();
```

**Endpoints:**
- Job management: `createTask`, `getTasks`, `getTask`, `runNow`
- System: `getSystemStatus`
- Admin: `enableScheduler`, `disableScheduler`, `getDLQTasks`, `retryFromDLQ`
- Fault injection: `killLeader`, `killWorker`, `pauseQueue`

## Styling

**Approach:** Vanilla CSS (no Tailwind, no CSS-in-JS)

**Files:**
- `App.css` - Global styles, navigation
- `Header.css` - Header component styles
- `Dashboard.css` - Dashboard page styles
- `Jobs.css` - Jobs page styles
- `Schedule.css` - Schedule page styles
- `Admin.css` - Admin page styles

**Design Principles:**
- Clean, minimal UI
- Focus on functionality over aesthetics
- Systems-first (not user-first)
- Dark mode friendly

## Starting the Client

```bash
# Development (with hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Dev Server:** `http://localhost:5173`

## Technology Stack

- **React** - UI library
- **Vite** - Build tool (fast, modern)
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Vanilla CSS** - Styling

## Design Philosophy

This is a **systems-first UI**, not a consumer product:

✅ **What it is:**
- Observability tool
- Admin interface
- Debugging aid
- Demo for interviews

❌ **What it's not:**
- User-friendly consumer app
- Feature-rich dashboard
- Production-ready UI

**Goal:** Prove the distributed systems concepts work, not win design awards.

## Key Features

### Real-Time Updates

- System status polls every 2 seconds
- Job list refreshes on filter change
- Header updates scheduler state

### Job Templates

Pre-filled templates for common job types:
- HTTP webhook
- Shell command
- Delay/test task

### Execution History

Detailed view of job attempts:
- Timestamp
- Status
- Worker ID
- Error message (if failed)

### Fault Injection

Testing tools for demonstrating fault tolerance:
- Kill leader (test failover)
- Kill worker (test lease recovery)
- Pause queue (test backpressure)

## Environment

**API URL:** Configured in `src/api/api.js`

```javascript
const API_BASE_URL = 'http://localhost:3000';
```

Change this if API runs on different host/port.

## Future Enhancements

- WebSocket for real-time updates
- Job dependency visualization
- Metrics charts (Prometheus integration)
- Dark mode toggle
- Multi-tenancy support
