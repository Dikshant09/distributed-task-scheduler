import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { getWorkers, enableScheduler, disableScheduler, resetSystem } from '../api/api';
import EventTimeline from '../components/EventTimeline';
import Toast from '../components/Toast';
import './Admin.css';

function Admin() {
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [resetting, setResetting] = useState(false);

    useEffect(() => {
        // Connect to WebSocket server
        const socket = io('http://localhost:3000', {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Admin WebSocket connected');
        });

        // Listen for instance updates (includes workers)
        socket.on('instances:update', () => {
            console.log('Received instances:update, refreshing workers');
            fetchWorkers();
        });

        // Listen for system updates (includes workers)
        socket.on('system:update', () => {
            fetchWorkers();
        });

        // Initial fetch
        fetchWorkers();

        // Cleanup on unmount
        return () => {
            socket.disconnect();
        };
    }, []);

    const fetchWorkers = async () => {
        try {
            const res = await getWorkers();
            setWorkers(res.data.data.workers);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch workers', err);
            setLoading(false);
        }
    };

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
    };

    const handleEnableScheduler = async () => {
        try {
            await enableScheduler();
            showToast('Scheduler enabled successfully', 'success');
        } catch (err) {
            showToast(`Failed to enable scheduler: ${err.message}`, 'error');
        }
    };

    const handleDisableScheduler = async () => {
        try {
            await disableScheduler();
            showToast('Scheduler disabled successfully', 'warning');
        } catch (err) {
            showToast(`Failed to disable scheduler: ${err.message}`, 'error');
        }
    };

    const handleResetSystem = async () => {
        const confirmed = window.confirm(
            '⚠️ Reset System?\n\n' +
            'This will delete ALL tasks and events.\n' +
            'This action cannot be undone.\n\n' +
            'Are you sure?'
        );

        if (!confirmed) return;

        setResetting(true);
        try {
            const res = await resetSystem();
            const data = res.data.data;
            showToast(
                `System reset! Deleted ${data.deletedTasks} tasks.`,
                'success'
            );
        } catch (err) {
            // Check for rate limit error
            if (err.response?.status === 429) {
                const retryAfter = err.response.data.retryAfter || 60;
                showToast(
                    `Rate limited. Please wait ${retryAfter} seconds.`,
                    'error'
                );
            } else {
                showToast(
                    `Reset failed: ${err.response?.data?.message || err.message}`,
                    'error'
                );
            }
        } finally {
            setResetting(false);
        }
    };

    if (loading) return <div className="loading">Loading...</div>;

    const activeWorkers = workers.filter(w => {
        const heartbeatAge = Date.now() - new Date(w.last_heartbeat).getTime();
        return heartbeatAge <= 30000;
    });

    const deadWorkers = workers.filter(w => {
        const heartbeatAge = Date.now() - new Date(w.last_heartbeat).getTime();
        return heartbeatAge > 30000;
    });

    return (
        <div className="admin">
            <h2>Admin Panel</h2>

            <div className="admin-section">
                <h3>Scheduler Control</h3>
                <div className="admin-actions">
                    <button onClick={handleEnableScheduler} className="btn btn-success">
                        Enable Scheduler
                    </button>
                    <button onClick={handleDisableScheduler} className="btn btn-warning">
                        Disable Scheduler
                    </button>
                </div>
            </div>

            <div className="admin-section">
                <h3>🔄 System Reset</h3>
                <p className="section-description">
                    Reset the system for a fresh demo. This clears all tasks and events.
                </p>
                <div className="admin-actions">
                    <button
                        onClick={handleResetSystem}
                        className="btn btn-danger"
                        disabled={resetting}
                    >
                        {resetting ? '⏳ Resetting...' : '🗑️ Reset System'}
                    </button>
                </div>
            </div>

            <div className="admin-section">
                <h3>Workers ({activeWorkers.length} Active, {deadWorkers.length} Dead)</h3>
                <table className="workers-table">
                    <thead>
                        <tr>
                            <th>Worker ID</th>
                            <th>Status</th>
                            <th>Last Heartbeat</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workers.map(worker => {
                            const heartbeatAge = Date.now() - new Date(worker.last_heartbeat).getTime();
                            const isAlive = heartbeatAge <= 30000;

                            return (
                                <tr key={worker.worker_id} className={!isAlive ? 'worker-dead' : ''}>
                                    <td>{worker.worker_id}</td>
                                    <td>
                                        <span className={`status-badge ${isAlive ? 'status-active' : 'status-dead'}`}>
                                            {isAlive ? '✅ Active' : '💀 Dead'}
                                        </span>
                                    </td>
                                    <td>{new Date(worker.last_heartbeat).toLocaleString()}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="admin-section">
                <h3>Complete System Timeline</h3>
                <EventTimeline scope="admin" />
            </div>

            {/* Toast Notifications */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}

export default Admin;
