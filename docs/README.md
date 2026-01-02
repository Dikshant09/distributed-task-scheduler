# Docs

Project documentation including architecture diagrams and design documents.

## Structure

```
docs/
└── diagrams/
    ├── HLD.md      # High-Level Design
    ├── LLD.md      # Low-Level Design
    └── FLOWS.md    # Flow Diagrams
```

## Documents

### High-Level Design (HLD.md)

**Purpose:** System architecture and design principles

**Contents:**
- System overview
- 3-service architecture (API, Scheduler, Worker)
- Component responsibilities
- Data flow and job lifecycle
- Fault tolerance strategies
- Scalability patterns
- Interview talking points

**Audience:** Interviewers, architects, new team members

### Low-Level Design (LLD.md)

**Purpose:** Implementation details and technical specifications

**Contents:**
- Database schema with indexes
- API endpoint specifications
- Dispatcher/Watcher implementation
- Redis Streams operations
- Worker execution flow
- Lease acquisition mechanism
- Task executors (HTTP, Shell, Delay)
- Leader election implementation
- Configuration and deployment

**Audience:** Developers, implementers

### Flow Diagrams (FLOWS.md)

**Purpose:** Visual representations of system behavior

**Contents:**
- 15+ Mermaid diagrams including:
  - System architecture overview
  - Job lifecycle state machine
  - End-to-end sequence diagrams
  - Dispatch/retry/execution flows
  - Leader election flow
  - Lease-based execution
  - Failure recovery scenarios
  - Scalability patterns

**Audience:** Visual learners, presentations, documentation

## How to Use

### For Interviews

1. **Start with HLD** - Explain architecture at high level
2. **Dive into LLD** - Show implementation details when asked
3. **Use FLOWS** - Visual aids for complex concepts

### For Development

1. **Reference LLD** - Implementation specifications
2. **Check FLOWS** - Understand component interactions
3. **Update docs** - Keep in sync with code changes

### For Onboarding

1. **Read HLD** - Understand system design
2. **Study FLOWS** - Visual understanding
3. **Deep dive LLD** - Implementation details

## Viewing Diagrams

All diagrams use **Mermaid** syntax and render in:
- GitHub (automatic)
- VS Code (with Mermaid extension)
- Most markdown viewers

**VS Code Extension:**
```
Name: Markdown Preview Mermaid Support
ID: bierner.markdown-mermaid
```

## Key Concepts Documented

### Architecture
- 3-service separation (API, Scheduler, Worker)
- Database as source of truth
- Queue as transport layer
- Leader election for coordination

### Execution Model
- Lease-based execution
- At-least-once semantics
- Exponential backoff retry
- Dead Letter Queue

### Fault Tolerance
- Leader failover
- Worker crash recovery
- Redis outage handling
- Database outage handling

### Scalability
- Horizontal worker scaling
- Batch dispatch operations
- Consumer groups for load distribution
- Stateless API servers

## Interview Talking Points

Memorize these from HLD:

> **"The database is the single source of truth; queues are only delivery mechanisms."**

> **"The watcher bridges wall-clock time and asynchronous execution."**

> **"We use Redis Streams as a durable, replayable dispatch layer."**

> **"Workers use lease-based execution to guarantee at-least-once semantics."**

## Maintenance

When making architectural changes:

1. Update code first
2. Update LLD with implementation details
3. Update HLD if design principles change
4. Update FLOWS if data flow changes
5. Keep diagrams in sync with reality

## Related Documentation

- `../Server/README.md` - Server architecture
- `../Server/api/README.md` - API documentation
- `../Server/scheduler/README.md` - Scheduler documentation
- `../Server/worker/README.md` - Worker documentation
- `../.vscode/DEBUG_GUIDE.md` - Debugging guide
