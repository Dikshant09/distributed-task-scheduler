import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTaskById } from '../api/api';
import EventTimeline from '../components/EventTimeline';
import './JobDetail.css';

function JobDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [task, setTask] = useState(null);
    const [executions, setExecutions] = useState([]);
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
            setExecutions(res.data.data.executions || []);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch task', err);
            setLoading(false);
        }
    };

    if (loading) return <div className="loading">Loading job details...</div>;
    if (!task) return <div className="error">Job not found</div>;

    const getStatusColor = (status) => {
        switch (status) {
            case 'SUCCESS': return 'status-success';
            case 'FAILED': return 'status-failed';
            case 'RUNNING': return 'status-running';
            case 'PENDING': return 'status-pending';
            default: return 'status-pending';
        }
    };

    return (
        <div className="job-detail">
            <div className="job-header">
                <h2>
                    Job Details
                    <span className="job-id">{task.id.substring(0, 12)}...</span>
                </h2>
                <span className={`status-badge ${getStatusColor(task.status)}`}>
                    {task.status}
                </span>
            </div>

            <div className="job-info">
                <h3>Job Information</h3>
                <div className="info-grid">
                    <div className="info-item">
                        <div className="info-label">Job ID</div>
                        <div className="info-value"><code>{task.id}</code></div>
                    </div>
                    <div className="info-item">
                        <div className="info-label">Type</div>
                        <div className="info-value">{task.type}</div>
                    </div>
                    <div className="info-item">
                        <div className="info-label">Created At</div>
                        <div className="info-value">{new Date(task.created_at).toLocaleString()}</div>
                    </div>
                    <div className="info-item">
                        <div className="info-label">Scheduled At</div>
                        <div className="info-value">{new Date(task.scheduled_at).toLocaleString()}</div>
                    </div>
                    <div className="info-item">
                        <div className="info-label">Attempts</div>
                        <div className="info-value">{task.attempt} / {task.max_attempts}</div>
                    </div>
                    <div className="info-item">
                        <div className="info-label">Worker ID</div>
                        <div className="info-value">
                            {task.assigned_worker_id ? <code>{task.assigned_worker_id.substring(0, 12)}...</code> : '-'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="payload-section">
                <h3>Payload</h3>
                <pre>{JSON.stringify(task.payload, null, 2)}</pre>
            </div>

            {/* Execution Output Section */}
            <div className="executions-section">
                <h3>Execution History</h3>
                {executions.length === 0 ? (
                    <div className="no-executions">No executions yet</div>
                ) : (
                    <div className="executions-list">
                        {executions.map((exec, index) => (
                            <div key={index} className="execution-item">
                                <div className="execution-header">
                                    <span className="attempt-badge">Attempt #{exec.attempt}</span>
                                    <span className={`status-badge ${getStatusColor(exec.status)}`}>{exec.status}</span>
                                    <span className="execution-time">
                                        {new Date(exec.started_at).toLocaleString()}
                                        {exec.duration_ms ? ` (${exec.duration_ms}ms)` : ''}
                                    </span>
                                </div>

                                {exec.output && (
                                    <div className="execution-output">
                                        <div className="output-label">Output:</div>
                                        <pre>{typeof exec.output === 'object' ? JSON.stringify(exec.output, null, 2) : exec.output}</pre>
                                    </div>
                                )}

                                {exec.error && (
                                    <div className="execution-error">
                                        <div className="output-label">Error:</div>
                                        <pre>{typeof exec.error === 'object' ? JSON.stringify(exec.error, null, 2) : exec.error}</pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Event Timeline (Job Specific) */}
            <div className="execution-history">
                <EventTimeline scope="task" taskId={id} />
            </div>
        </div>
    );
}

export default JobDetail;
