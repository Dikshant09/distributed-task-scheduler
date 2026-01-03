import React, { useState, useEffect } from 'react';
import { getWorkers, enableScheduler, disableScheduler } from '../api/api';
import EventTimeline from '../components/EventTimeline';
import './Admin.css';

function Admin() {
    const [workers, setWorkers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWorkers();
        const interval = setInterval(fetchWorkers, 2000);
        return () => clearInterval(interval);
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

    return (
        <div className="admin-page">
            <h2>Administration</h2>

            <div className="admin-section">
                <h3>Scheduler Control</h3>
                <div className="control-buttons">
                    <button className="btn-success" onClick={handleEnableScheduler}>
                        ✅ Enable Scheduler
                    </button>
                    <button className="btn-danger" onClick={handleDisableScheduler}>
                        🛑 Disable Scheduler
                    </button>
                </div>
            </div>

            <div className="admin-section">
                <h3>Workers ({workers.filter(w => w.status === 'ALIVE').length} Active, {workers.filter(w => w.status === 'DEAD').length} Dead)</h3>
                <table className="workers-table">
                    <thead>
                        <tr>
                            <th>Worker ID</th>
                            <th>Status</th>
                            <th>Last Heartbeat</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workers.map(worker => (
                            <tr key={worker.worker_id} className={worker.status === 'DEAD' ? 'worker-dead' : ''}>
                                <td>{worker.worker_id}</td>
                                <td>
                                    <span className={`status-badge ${worker.status === 'ALIVE' ? 'status-alive' : 'status-dead'}`}>
                                        {worker.status === 'ALIVE' ? '✅ Active' : '💀 Dead'}
                                    </span>
                                </td>
                                <td>{new Date(worker.last_heartbeat).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {workers.length === 0 && (
                    <p className="no-data">No active workers</p>
                )}
                {workers.length > 10 && (
                    <p style={{ fontStyle: 'italic', color: '#666', marginTop: '10px' }}>
                        Showing 10 of {workers.length} workers
                    </p>
                )}
            </div>

            {/* Event Timeline (All Events) */}
            <div style={{ marginTop: '30px' }}>
                <h3>Complete System Timeline</h3>
                <EventTimeline scope="admin" />
            </div>
        </div>
    );
}

export default Admin;
