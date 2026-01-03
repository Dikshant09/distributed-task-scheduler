import React, { useState, useEffect } from 'react';
import { getEvents } from '../api/api';
import './EventTimeline.css';

function EventTimeline() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 3000); // Refresh every 3 seconds
        return () => clearInterval(interval);
    }, []);

    const fetchEvents = async () => {
        try {
            const res = await getEvents(20); // Get last 20 events
            // Filter to show only system-level events on Dashboard
            const systemEvents = res.data.data.events.filter(e =>
                ['SCHEDULER_ENABLED', 'SCHEDULER_DISABLED', 'LEADER_ELECTED',
                    'WORKER_FAILED', 'WORKER_RECOVERED'].includes(e.type)
            );
            setEvents(systemEvents);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch events', err);
            setLoading(false);
        }
    };

    const getEventIcon = (type) => {
        switch (type) {
            case 'SCHEDULER_ENABLED':
                return '✅';
            case 'SCHEDULER_DISABLED':
                return '🛑';
            case 'LEADER_ELECTED':
                return '👑';
            case 'WORKER_FAILED':
                return '💀';
            case 'TASK_COMPLETED':
                return '✔️';
            case 'TASK_FAILED':
                return '❌';
            default:
                return '📌';
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
                return 'event-info';
            default:
                return 'event-default';
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);

        if (diffSecs < 60) return `${diffSecs}s ago`;
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleTimeString();
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
