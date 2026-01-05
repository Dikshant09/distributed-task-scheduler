Do we use web sockets for event transmission or we use polling ?
We currently use polling, not WebSockets. Let me show you the implementation:

Analyzed
EventTimeline.jsx#L5-15
Analyzed
Dashboard.jsx#L10-30
Current Implementation: Polling
We use HTTP polling with setInterval to fetch updates periodically:

EventTimeline Component
javascript
useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
}, [scope, taskId]);
Dashboard Component
javascript
useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
}, []);
Polling Intervals
Dashboard: 2 seconds (system status, instances)
EventTimeline: 3 seconds (events)
Jobs Page: 2 seconds (task list)
Job Detail: 3 seconds (task details + events)
Why Polling (Not WebSockets)?
Advantages of current approach:

Simplicity: No WebSocket server setup needed
Stateless: No connection management
Demo-Friendly: Easy to understand and debug
Good Enough: 2-3 second latency is acceptable for demo purposes
Trade-offs:

Higher server load (repeated HTTP requests)
Not real-time (2-3 second delay)
More network traffic
If You Want WebSockets
WebSockets would provide real-time updates but add complexity. The implementation would require:

Backend: Socket.io server
Frontend: Socket.io client
Event Broadcasting: Emit events when they're logged
Connection Management: Handle reconnects, disconnects
For a demo/development system, polling is simpler and sufficient. For production with many users, WebSockets would be better.