import React, { useState, useEffect } from 'react';
import { getSystemStatus, getInstances, killLeader, killWorker, pauseQueue, disableScheduler } from '../api/api';
import EventTimeline from '../components/EventTimeline';
import Toast from '../components/Toast';
import './Dashboard.css';
import SystemTopology from '../components/SystemTopology';

function Dashboard() {
    const [status, setStatus] = useState(null);
    const [instances, setInstances] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statusRes, instancesRes] = await Promise.all([
                    getSystemStatus(),
                    getInstances()
                ]);
                setStatus(statusRes.data.data);
                setInstances(instancesRes.data.data);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch data', err);
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, []);


    const showToast = (message, type = 'info', persistent = false) => {
        setToast({ message, type, persistent });
    };

    const handleFault = async (faultType) => {
        try {
            let response;
            switch (faultType) {
                case 'kill-leader':
                    response = await killLeader();
                    showToast(response.data.message, 'warning');
                    break;
                case 'kill-worker':
                    response = await killWorker();
                    showToast(response.data.message, 'warning');
                    break;
                case 'pause-queue':
                    response = await pauseQueue(10000);
                    showToast('Queue paused for 10 seconds', 'info');
                    break;
                case 'disable-scheduler':
                    response = await disableScheduler();
                    showToast(
                        '⚠️ Scheduler Disabled - Go to Admin panel to re-enable scheduling',
                        'warning',
                        true // persistent - requires manual close
                    );
                    break;
                default:
                    break;
            }
        } catch (err) {
            showToast(err.response?.data?.message || err.message, 'error');
        }
    };

    if (loading) return <div className="loading">Loading...</div>;
    if (!status) return <div className="error">Failed to load system status</div>;

    return (
        <div className="dashboard">
            <h2>System Health</h2>

            {/* System Topology Visualization */}
            <SystemTopology />

            {/* Failure Simulation - Positioned next to topology for visual context */}
            <h3>🧪 Failure Simulation</h3>
            <div className="fault-buttons">
                <button className="fault-btn danger" onClick={() => handleFault('kill-leader')}>
                    ❌ Kill Leader
                </button>
                <button className="fault-btn danger" onClick={() => handleFault('kill-worker')}>
                    ❌ Kill Random Worker
                </button>
                <button className="fault-btn warning" onClick={() => handleFault('pause-queue')}>
                    ⏸️ Pause Queue (10s)
                </button>
                <button className="fault-btn warning" onClick={() => handleFault('disable-scheduler')}>
                    🛑 Disable Scheduler
                </button>
            </div>

            {/* Scheduler Instances */}
            {instances && (
                <div className="instances-section">
                    <h3>Scheduler Instances ({instances.schedulers.length})</h3>
                    <div className="instances-grid">
                        {instances.schedulers.map(scheduler => (
                            <div key={scheduler.id} className={`instance-card ${scheduler.isLeader ? 'leader' : 'standby'}`}>
                                <div className="instance-header">
                                    <span className="instance-id">{scheduler.id}</span>
                                    {scheduler.isLeader && <span className="leader-badge">👑 Leader</span>}
                                    {!scheduler.isLeader && <span className="standby-badge">⏸️ Standby</span>}
                                </div>
                                <div className="instance-details">
                                    <div>PID: {scheduler.pid}</div>
                                    <div>Started: {new Date(scheduler.startedAt).toLocaleTimeString()}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Worker Instances */}
            {instances && (
                <div className="instances-section">
                    <h3>Worker Instances ({instances.workers.length})</h3>
                    <div className="instances-grid">
                        {instances.workers.map(worker => (
                            <div key={worker.id} className={`instance-card worker ${worker.status === 'executing' ? 'executing' : ''}`}>
                                <div className="instance-header">
                                    <span className="instance-id">{worker.id}</span>
                                    {worker.status === 'executing' ? (
                                        <span className="worker-badge executing">⚙️ Executing</span>
                                    ) : (
                                        <span className="worker-badge">💤 Idle</span>
                                    )}
                                </div>
                                <div className="instance-details">
                                    <div>PID: {worker.pid}</div>
                                    {worker.currentTaskId && (
                                        <div className="current-task">
                                            Task: <code>{worker.currentTaskId.substring(0, 8)}...</code>
                                        </div>
                                    )}
                                    <div>Started: {new Date(worker.startedAt).toLocaleTimeString()}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* System Metrics */}
            <h3>System Metrics</h3>
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-label">Scheduler State</div>
                    <div className="metric-value">{status.scheduler.enabled ? 'Enabled' : 'Disabled'}</div>
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

            {/* Event Timeline - Comprehensive activity log */}
            <h3>📋 Recent System Events</h3>
            <EventTimeline scope="dashboard" />

            {/* Toast Notifications */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    persistent={toast.persistent}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}

export default Dashboard;
