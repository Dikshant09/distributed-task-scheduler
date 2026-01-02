import React, { useState, useEffect } from 'react';
import { getTasks, createTask, runTaskNow } from '../api/api';
import './Schedule.css';

function Schedule() {
    const [tasks, setTasks] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        type: 'DELAY',
        payload: '{}',
        scheduledAt: '',
        maxRetries: 3
    });

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 3000);
        return () => clearInterval(interval);
    }, []);

    const fetchTasks = async () => {
        try {
            const res = await getTasks({ limit: 20 });
            setTasks(res.data.data.tasks);
        } catch (err) {
            console.error('Failed to fetch tasks', err);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const payload = JSON.parse(formData.payload);

            await createTask({
                type: formData.type,
                payload,
                scheduledAt: formData.scheduledAt || new Date().toISOString(),
                idempotencyKey: `client-${Date.now()}`
            });

            alert('Task created successfully');
            setFormData({ ...formData, payload: '{}' });
            fetchTasks();
        } catch (err) {
            alert(`Failed to create task: ${err.message}`);
        }
    };

    const getPayloadTemplate = (type) => {
        switch (type) {
            case 'HTTP':
                return JSON.stringify({
                    method: 'POST',
                    url: 'https://httpbin.org/post',
                    headers: {},
                    body: { test: 'data' },
                    timeout_ms: 5000
                }, null, 2);
            case 'SHELL':
                return JSON.stringify({
                    command: 'echo "Hello World"',
                    timeout_ms: 10000
                }, null, 2);
            case 'DELAY':
                return JSON.stringify({
                    duration_ms: 2000,
                    fail_probability: 0
                }, null, 2);
            default:
                return '{}';
        }
    };

    const handleTypeChange = (type) => {
        setFormData({
            ...formData,
            type,
            payload: getPayloadTemplate(type)
        });
    };

    return (
        <div className="schedule-page">
            <h2>Schedule Jobs</h2>

            <div className="schedule-content">
                <div className="create-form">
                    <h3>Create New Job</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Job Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => handleTypeChange(e.target.value)}
                            >
                                <option value="DELAY">Delay/No-op (Testing)</option>
                                <option value="HTTP">HTTP Request</option>
                                <option value="SHELL">Shell Command</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Payload (JSON)</label>
                            <textarea
                                value={formData.payload}
                                onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                                rows={8}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Schedule Time (leave empty for immediate)</label>
                            <input
                                type="datetime-local"
                                value={formData.scheduledAt}
                                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                            />
                        </div>

                        <button type="submit" className="btn-primary">Create Job</button>
                    </form>
                </div>

                <div className="scheduled-jobs">
                    <h3>Recent Jobs</h3>
                    <table className="jobs-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Scheduled</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.slice(0, 10).map(task => (
                                <tr key={task.id}>
                                    <td>{task.type}</td>
                                    <td>
                                        <span className={`status-badge status-${task.status.toLowerCase()}`}>
                                            {task.status}
                                        </span>
                                    </td>
                                    <td>{new Date(task.scheduled_at).toLocaleString()}</td>
                                    <td>
                                        <button
                                            className="btn-small"
                                            onClick={() => runTaskNow(task.id).then(() => alert('Running now'))}
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

export default Schedule;
