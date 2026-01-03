import React, { useState, useEffect } from 'react';
import { getTasks, getTaskById, runTaskNow } from '../api/api';
import './Jobs.css';
import { useNavigate } from 'react-router-dom';

function Jobs() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState([]);
    const [filter, setFilter] = useState('');
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

    const handleRowClick = (taskId) => {
        navigate(`/jobs/${taskId}`);
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

            </div>
        </div>
    );
}


export default Jobs;
