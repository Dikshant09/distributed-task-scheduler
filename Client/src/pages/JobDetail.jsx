import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTaskById } from '../api/api';
import EventTimeline from '../components/EventTimeline';
import './JobDetail.css';

function JobDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTask();
        const interval = setInterval(fetchTask, 3000);
        return () => clearInterval(interval);
    }, [id]);

    const fetchTask = async () => {
        try {
            const res = await getTaskById(id);
            setTask(res.data.data.task);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch task', err);
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Loading task details...</div>;
    if (!task) return <div className="error">Task not found</div>;

    const getStatusColor = (status) => {
        switch (status) {
            case 'SUCCESS': return 'status-success';
            case 'FAILED': return 'status-failed';
            case 'RUNNING': return 'status-running';
            case 'PENDING': return 'status-pending';
            default: return 'status-default';
        }
    };

    return (
        <div className="task-detail-page">
            <button className="back-btn" onClick={() => navigate('/')}>
                ← Back to Dashboard
            </button>

            <div className="task-header">
                <h2>Task Details</h2>
                <span className={`status-badge ${getStatusColor(task.status)}`}>
                    {task.status}
                </span>
            </div>

            <div className="task-info-grid">
                <div className="info-card">
                    <label>Task ID</label>
                    <div className="value monospace">{task.id}</div>
                </div>
                <div className="info-card">
                    <label>Type</label>
                    <div className="value">{task.type}</div>
                </div>
                <div className="info-card">
                    <label>Created At</label>
                    <div className="value">{new Date(task.created_at).toLocaleString()}</div>
                </div>
                <div className="info-card">
                    <label>Scheduled At</label>
                    <div className="value">{new Date(task.scheduled_at).toLocaleString()}</div>
                </div>
                <div className="info-card">
                    <label>Attempts</label>
                    <div className="value">{task.attempt} / {task.max_attempts}</div>
                </div>
                <div className="info-card">
                    <label>Worker ID</label>
                    <div className="value monospace">{task.assigned_worker_id || '-'}</div>
                </div>
            </div>

            <div className="payload-section">
                <h3>Payload</h3>
                <pre>{JSON.stringify(task.payload, null, 2)}</pre>
            </div>

            {/* Event Timeline (Task Specific) */}
            <div className="task-timeline-section">
                <h3>Task Timeline</h3>
                <EventTimeline scope="task" taskId={id} />
            </div>
        </div>
    );
}

export default JobDetail;
