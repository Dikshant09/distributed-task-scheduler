# Client

Modern React-based UI for the Distributed Task Scheduler with real-time visualization.

## Features

- 🎨 **Modern Dark Theme** - Glassmorphism effects with vibrant gradients
- 📊 **Real-time Topology** - Interactive system diagram showing schedulers, workers, and task flow
- 🧪 **Chaos Engineering** - Built-in failure simulation controls
- 📋 **Event Timeline** - Live system event tracking
- 🔔 **Toast Notifications** - Modern, non-intrusive user feedback
- ⚡ **Real-time Updates** - WebSocket-based live data

## Structure

```
Client/
├── src/
│   ├── api/              # API client (Axios)
│   ├── components/       # Reusable components
│   │   ├── Header.jsx    # App header with status
│   │   ├── SystemTopology.jsx  # Interactive topology diagram
│   │   ├── EventTimeline.jsx   # Event log component
│   │   └── Toast.jsx     # Toast notification system
│   ├── pages/            # Page components
│   │   ├── Dashboard.jsx # System overview + chaos testing
│   │   ├── Jobs.jsx      # Job list and management
│   │   ├── JobDetail.jsx # Individual job details
│   │   ├── Schedule.jsx  # Create new jobs
│   │   └── Admin.jsx     # Admin controls
│   ├── App.jsx           # Main app with routing
│   └── main.jsx          # Entry point
├── public/               # Static assets
└── package.json          # Dependencies
```

## Pages

### 1. Dashboard
**Features:**
- Real-time system topology visualization
- Failure simulation controls (Kill Leader, Kill Worker, Pause Queue, Disable Scheduler)
- Scheduler and worker instance cards
- System metrics (queue depth, active workers, scheduler state)
- Job statistics (success/failure rates)
- Recent system events timeline

### 2. Jobs
**Features:**
- Filterable job table (All, Pending, Running, Success, Failed)
- Job detail view with execution history
- Real-time status updates
- Task-specific event timeline

### 3. Schedule
**Features:**
- Create new jobs with templates (HTTP, Shell, Delay)
- JSON payload editor
- Schedule time picker
- Recent jobs list

### 4. Admin
**Features:**
- Scheduler enable/disable controls
- Active workers list with heartbeat status
- Dead workers monitoring
- Complete system event timeline

## Components

### SystemTopology
Interactive SVG diagram showing:
- Scheduler instances (leader + standbys)
- Redis queue with depth indicator
- Worker pool (up to 5 displayed)
- Animated task flow
- Real-time WebSocket updates

### EventTimeline
Real-time event log with:
- Color-coded event types
- Relative timestamps ("Just now", "5 mins ago")
- Metadata display (task/worker/scheduler IDs)
- Scope filtering (dashboard, admin, task-specific)

### Toast
Modern notification system with:
- Auto-dismiss (3 seconds) or persistent mode
- Type-based styling (success, error, warning, info)
- Slide-in animation
- Manual close option

## Styling

**Approach:** Modern CSS with design system

**Design System:**
- Dark theme (`#0f0f1a` background)
- Glassmorphism effects (backdrop blur)
- HSL-based color palette
- Inter font family
- CSS variables for theming

**Key Files:**
- `index.css` - Global design system
- `App.css` - Layout and navigation
- Component-specific CSS files

## Starting the Client

```bash
# Install dependencies
npm install

# Development (with hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

**Dev Server:** `http://localhost:5173`

## Technology Stack

- **React 18** - UI library
- **Vite** - Build tool (fast HMR)
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Socket.IO Client** - WebSocket for real-time updates
- **Vanilla CSS** - Styling with design system

## API Integration

**Base URL:** `http://localhost:3000`

**Key Endpoints:**
- `GET /status` - System status
- `GET /instances` - Scheduler/worker instances
- `GET /tasks` - Job list
- `GET /tasks/:id` - Job details
- `POST /tasks` - Create job
- `GET /events` - System events
- WebSocket - Real-time updates

## Real-Time Features

### WebSocket Events
- `system:update` - System status changes
- `instances:update` - Scheduler/worker updates
- Auto-reconnection on disconnect

### Polling
- System status: Every 2 seconds
- Job list: On filter change
- Event timeline: Every 3 seconds

## Environment

Configure API URL in `src/api/api.js`:
```javascript
const API_BASE_URL = 'http://localhost:3000';
```

## Design Philosophy

**Modern, Premium UI** with focus on:
- ✅ Visual excellence (glassmorphism, gradients, animations)
- ✅ Real-time observability
- ✅ Interactive chaos testing
- ✅ Smooth user experience
- ✅ Production-ready aesthetics
