import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { getWorkers, enableScheduler, disableScheduler } from '../api/api';
import EventTimeline from '../components/EventTimeline';
import './Admin.css';

function Admin() {
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);

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

    const handleEnableScheduler = async () => {
        try {
            await enableScheduler();
            alert('Scheduler enabled');
        } catch (err) {
            alert(`Failed to enable scheduler: ${err.message}`);
        }
    };

    const handleDisableScheduler = async () => {
        try {
            await disableScheduler();
            alert('Scheduler disabled');
        } catch (err) {
            alert(`Failed to disable scheduler: ${err.message}`);
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
        </div>
    );
}

export default Admin;
