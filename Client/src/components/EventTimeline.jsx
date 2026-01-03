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
                // Filter to show only system-level events on Dashboard
                filteredEvents = allEvents.filter(e =>
                    ['SCHEDULER_ENABLED', 'SCHEDULER_DISABLED', 'LEADER_ELECTED',
                        'WORKER_FAILED', 'WORKER_RECOVERED'].includes(e.type)
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

    const getEventIcon = (type) => {
        switch (type) {
            case 'SCHEDULER_ENABLED': return '✅';
            case 'SCHEDULER_DISABLED': return '🛑';
            case 'LEADER_ELECTED': return '👑';
            case 'WORKER_FAILED': return '💀';

            case 'TASK_CREATED': return '📝';
            case 'TASK_DISPATCHED': return '📤';
            case 'TASK_PICKED': return '👷';
            case 'TASK_EXECUTING': return '⚙️';
            case 'TASK_COMPLETED': return '✅';
            case 'TASK_FAILED': return '❌';

            default: return '📌';
        }
    };

    const getEventColor = (type) => {
        switch (type) {
            case 'SCHEDULER_ENABLED':
            case 'TASK_COMPLETED':
                return 'event-success';

            case 'SCHEDULER_DISABLED':
            case 'WORKER_FAILED':
            case 'TASK_FAILED':
                return 'event-error';

            case 'LEADER_ELECTED':
            case 'TASK_DISPATCHED':
            case 'TASK_EXECUTING':
                return 'event-info';

            case 'TASK_CREATED':
            case 'TASK_PICKED':
            default:
                return 'event-default';
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    if (loading) return <div className="event-timeline-loading">Loading events...</div>;

    return (
        <div className="event-timeline">
            <h3>📋 Event Timeline</h3>
            {events.length === 0 ? (
                <p className="no-events">No events yet</p>
            ) : (
                <div className="events-list">
                    {events.map(event => (
                        <div key={event.id} className={`event-item ${getEventColor(event.type)}`}>
                            <span className="event-icon">{getEventIcon(event.type)}</span>
                            <div className="event-content">
                                <div className="event-message">{event.message}</div>
                                <div className="event-time">{formatTime(event.timestamp)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default EventTimeline;
