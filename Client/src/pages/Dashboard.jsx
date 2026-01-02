import React, { useState, useEffect } from 'react';
import { getSystemStatus, killLeader, killWorker, pauseQueue, disableScheduler } from '../api/api';
import './Dashboard.css';

function Dashboard() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await getSystemStatus();
                setStatus(res.data.data);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch status', err);
                setLoading(false);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleFault = async (faultType) => {
        try {
            switch (faultType) {
                case 'kill-leader':
                    await killLeader();
                    alert('Leader process will terminate');
                    break;
                case 'kill-worker':
                    await killWorker();
                    alert('Worker kill simulated');
                    break;
                case 'pause-queue':
                    await pauseQueue(10000);
                    alert('Queue paused for 10 seconds');
                    break;
                case 'disable-scheduler':
                    await disableScheduler();
                    alert('Scheduler disabled');
                    break;
                default:
                    break;
            }
        } catch (err) {
            alert(`Fault injection failed: ${err.message}`);
        }
    };

    if (loading) return <div className="loading">Loading...</div>;
    if (!status) return <div className="error">Failed to load system status</div>;

    return (
        <div className="dashboard">
            <h2>System Health</h2>

            {/* System Metrics */}
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-label">Scheduler State</div>
                    <div className="metric-value">{status.scheduler.enabled ? 'Enabled' : 'Disabled'}</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Leader ID</div>
                    <div className="metric-value">{status.scheduler.leaderId}</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Leader Uptime</div>
                    <div className="metric-value">{status.scheduler.leaderUptime}s</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Dispatch Lag</div>
                    <div className="metric-value">{status.scheduler.dispatchLag}s</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Active Workers</div>
                    <div className="metric-value">{status.workers.active}</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Redis Queue</div>
                    <div className="metric-value">{status.redis.queueDepth} pending</div>
                </div>
            </div>

            {/* Jobs Summary */}
            <h3>Jobs Summary (Today)</h3>
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-label">Total Jobs</div>
                    <div className="metric-value">{status.stats.jobsToday}</div>
                </div>

                <div className="metric-card success">
                    <div className="metric-label">Success</div>
                    <div className="metric-value">{status.stats.successToday}</div>
                </div>

                <div className="metric-card error">
                    <div className="metric-label">Failed</div>
                    <div className="metric-value">{status.stats.failedToday}</div>
                </div>

                <div className="metric-card">
                    <div className="metric-label">Total Retries</div>
                    <div className="metric-value">{status.stats.totalRetries}</div>
                </div>
            </div>

            {/* Fault Simulation */}
            <h3>Failure Simulation</h3>
            <div className="fault-buttons">
                <button className="fault-btn danger" onClick={() => handleFault('kill-leader')}>
                    ❌ Kill Leader
                </button>
                <button className="fault-btn danger" onClick={() => handleFault('kill-worker')}>
                    ❌ Kill Worker
                </button>
                <button className="fault-btn warning" onClick={() => handleFault('pause-queue')}>
                    ⏸️ Pause Queue (10s)
                </button>
                <button className="fault-btn warning" onClick={() => handleFault('disable-scheduler')}>
                    🛑 Disable Scheduler
                </button>
            </div>
        </div>
    );
}

export default Dashboard;
