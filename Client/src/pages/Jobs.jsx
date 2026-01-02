import React, { useState, useEffect } from 'react';
import { getTasks, getTaskById, runTaskNow } from '../api/api';
import './Jobs.css';

function Jobs() {
    const [tasks, setTasks] = useState([]);
    const [filter, setFilter] = useState('');
    const [selectedTask, setSelectedTask] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                const params = filter ? { status: filter } : {};
                const res = await getTasks(params);
                setTasks(res.data.data.tasks);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch tasks', err);
                setLoading(false);
            }
        };

        fetchTasks();
        const interval = setInterval(fetchTasks, 2000);
        return () => clearInterval(interval);
    }, [filter]);

    const handleRowClick = async (taskId) => {
        try {
            const res = await getTaskById(taskId);
            setSelectedTask(res.data.data);
        } catch (err) {
            console.error('Failed to fetch task details', err);
        }
    };

    const handleRunNow = async (taskId) => {
        try {
            await runTaskNow(taskId);
            alert('Task scheduled to run immediately');
        } catch (err) {
            alert(`Failed to run task: ${err.message}`);
        }
    };

    const getStatusClass = (status) => {
        switch (status) {
            case 'PENDING': return 'status-pending';
            case 'RUNNING': return 'status-running';
            case 'SUCCESS': return 'status-success';
            case 'FAILED': return 'status-failed';
            case 'DLQ': return 'status-failed';
            default: return '';
        }
    };

    if (loading) return <div className="loading">Loading...</div>;

    return (
        <div className="jobs-page">
            <div className="jobs-header">
                <h2>Jobs ({tasks.length})</h2>
                <div className="filters">
                    <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="RUNNING">Running</option>
                        <option value="SUCCESS">Success</option>
                        <option value="FAILED">Failed</option>
                    </select>
                </div>
            </div>

            <div className="jobs-content">
                <div className="jobs-table-container">
                    <table className="jobs-table">
                        <thead>
                            <tr>
                                <th>Job ID</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Worker</th>
                                <th>Attempts</th>
                                <th>Scheduled</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => (
                                <tr key={task.id} onClick={() => handleRowClick(task.id)} className="clickable-row">
                                    <td>{task.id.substring(0, 8)}...</td>
                                    <td>{task.type}</td>
                                    <td>
                                        <span className={`status-badge ${getStatusClass(task.status)}`}>
                                            {task.status}
                                        </span>
                                    </td>
                                    <td>{task.worker_id ? task.worker_id.substring(0, 8) + '...' : '-'}</td>
                                    <td>{(task.attempt || 0) + 1}</td>
                                    <td>{new Date(task.scheduled_at).toLocaleString()}</td>
                                    <td>
                                        <button
                                            className="btn-small"
                                            onClick={(e) => { e.stopPropagation(); handleRunNow(task.id); }}
                                        >
                                            Run Now
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {selectedTask && (
                    <div className="job-detail-drawer">
                        <div className="drawer-header">
                            <h3>Job Details</h3>
                            <button className="close-btn" onClick={() => setSelectedTask(null)}>×</button>
                        </div>
                        <div className="drawer-content">
                            <div className="detail-section">
                                <h4>Task Information</h4>
                                <p><strong>ID:</strong> {selectedTask.task.id}</p>
                                <p><strong>Type:</strong> {selectedTask.task.type}</p>
                                <p><strong>Status:</strong> <span className={`status-badge ${getStatusClass(selectedTask.task.status)}`}>{selectedTask.task.status}</span></p>
                                <p><strong>Worker:</strong> {selectedTask.task.worker_id || 'Not assigned'}</p>
                                <p><strong>Created:</strong> {new Date(selectedTask.task.created_at).toLocaleString()}</p>
                                <p><strong>Scheduled:</strong> {new Date(selectedTask.task.scheduled_at).toLocaleString()}</p>
                            </div>

                            <div className="detail-section">
                                <h4>Execution History ({selectedTask.executions?.length || 0} attempts)</h4>
                                {selectedTask.executions && selectedTask.executions.length > 0 ? (
                                    selectedTask.executions.map((exec) => (
                                        <div key={exec.id} style={{
                                            marginBottom: '15px',
                                            padding: '10px',
                                            border: '1px solid #ddd',
                                            borderRadius: '4px',
                                            backgroundColor: exec.status === 'SUCCESS' ? '#f0f9ff' : '#fff5f5'
                                        }}>
                                            <p><strong>Attempt {exec.attempt + 1}:</strong> <span className={`status-badge ${getStatusClass(exec.status)}`}>{exec.status}</span></p>
                                            <p><strong>Duration:</strong> {exec.duration_ms}ms</p>
                                            <p><strong>Started:</strong> {new Date(exec.started_at).toLocaleString()}</p>
                                            <p><strong>Finished:</strong> {new Date(exec.finished_at).toLocaleString()}</p>

                                            {exec.output && (
                                                <div>
                                                    <p><strong>Output:</strong></p>
                                                    <pre style={{ maxHeight: '200px', overflow: 'auto', fontSize: '12px' }}>{JSON.stringify(exec.output, null, 2)}</pre>
                                                    {exec.truncated && <span className="error-text">[OUTPUT TRUNCATED]</span>}
                                                </div>
                                            )}

                                            {exec.error && (
                                                <p><strong>Error:</strong> <span className="error-text">{exec.error}</span></p>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p>No execution records yet</p>
                                )}
                            </div>

                            <div className="detail-section">
                                <h4>Payload</h4>
                                <pre>{JSON.stringify(selectedTask.task.payload, null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Jobs;
