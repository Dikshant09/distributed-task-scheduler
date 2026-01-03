import React, { useState, useEffect } from 'react';
import { getEvents } from '../api/api';
import './EventTimeline.css';

function EventTimeline({ scope = 'all', taskId = null }) {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 3000); // Refresh every 3 seconds
        return () => clearInterval(interval);
    }, [scope, taskId]);

    const fetchEvents = async () => {
        try {
            let params = { limit: 50 };

            if (scope === 'task' && taskId) {
                params.taskId = taskId;
                params.limit = 100; // Get more for specific task to ensure we find them
            }

            const res = await getEvents(params);
            const allEvents = res.data.data.events;

            let filteredEvents = allEvents;
            if (scope === 'dashboard') {
                // Filter to show system-level and failure simulation events on Dashboard
                filteredEvents = allEvents.filter(e =>
                    ['SCHEDULER_ENABLED', 'SCHEDULER_DISABLED', 'LEADER_ELECTED',
                        'WORKER_FAILED', 'WORKER_RECOVERED', 'WORKER_KILLED', 'LEADER_KILLED'].includes(e.type)
                );
            }
            // scope === 'admin' shows all events
            // scope === 'task' is already filtered by API via taskId

            setEvents(filteredEvents);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch events', err);
            setLoading(false);
        }
    };

    const getEventType = (type) => {
        // Categorize events for styling
        if (['LEADER_ELECTED', 'SCHEDULER_ENABLED'].includes(type)) return 'event-leader';
        if (['WORKER_FAILED', 'WORKER_RECOVERED'].includes(type)) return 'event-worker';
        if (['TASK_CREATED', 'TASK_DISPATCHED', 'TASK_PICKED', 'TASK_EXECUTING', 'TASK_COMPLETED'].includes(type)) return 'event-task';
        if (['TASK_FAILED', 'SCHEDULER_DISABLED'].includes(type)) return 'event-error';
        return '';
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        // If less than 1 minute ago, show "just now"
        if (diff < 60000) return 'Just now';

        // If less than 1 hour ago, show minutes
        if (diff < 3600000) {
            const mins = Math.floor(diff / 60000);
            return `${mins} min${mins > 1 ? 's' : ''} ago`;
        }

        // Otherwise show full time
        return date.toLocaleString();
    };

    if (loading) return <div className="loading">Loading events...</div>;

    return (
        <div className="event-timeline">
            <h3>📋 Event Timeline</h3>
            {events.length === 0 ? (
                <p className="no-events">No events yet</p>
            ) : (
                <div className="timeline-container">
                    {events.map(event => (
                        <div key={event.id} className={`event-item ${getEventType(event.type)}`}>
                            <div className="event-header">
                                <span className="event-type">{event.type.replace(/_/g, ' ')}</span>
                                <span className="event-timestamp">{formatTime(event.timestamp)}</span>
                            </div>
                            <div className="event-message">{event.message}</div>
                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                                <div className="event-details">
                                    {event.metadata.taskId && <div>Task: <code>{event.metadata.taskId.substring(0, 8)}...</code></div>}
                                    {event.metadata.workerId && <div>Worker: <code>{event.metadata.workerId.substring(0, 8)}...</code></div>}
                                    {event.metadata.schedulerId && <div>Scheduler: <code>{event.metadata.schedulerId.substring(0, 8)}...</code></div>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default EventTimeline;
