import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { getSystemStatus } from '../api/api';
import './SystemTopology.css';

function SystemTopology() {
    const [instances, setInstances] = useState({ schedulers: [], workers: [] });
    const [queueDepth, setQueueDepth] = useState(0);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        // Connect to WebSocket server
        const socket = io('http://localhost:3000', {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('WebSocket connected');
            setConnected(true);
        });

        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            setConnected(false);
        });

        // Listen for system updates
        socket.on('system:update', (data) => {
            setInstances({
                schedulers: data.schedulers || [],
                workers: data.workers || []
            });
            setLoading(false);
        });

        // Listen for instance updates
        socket.on('instances:update', (data) => {
            setInstances({
                schedulers: data.schedulers || [],
                workers: data.workers || []
            });
        });

        // Fetch queue depth separately (not in WebSocket yet)
        const fetchQueueDepth = async () => {
            try {
                const statusRes = await getSystemStatus();
                setQueueDepth(statusRes.data.data.redis.queueDepth);
            } catch (err) {
                console.error('Failed to fetch queue depth', err);
            }
        };

        fetchQueueDepth();
        const queueInterval = setInterval(fetchQueueDepth, 2000);

        // Cleanup on unmount
        return () => {
            socket.disconnect();
            clearInterval(queueInterval);
        };
    }, []);

    if (loading) return <div className="topology-loading">Loading topology...</div>;

    const schedulers = instances.schedulers || [];
    const workers = instances.workers || [];
    const leader = schedulers.find(s => s.isLeader);
    const standby = schedulers.find(s => !s.isLeader);

    return (
        <div className="system-topology">
            <div className="topology-header">
                <h3>🗺️ System Topology</h3>
                <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                    {connected ? '🟢 Live' : '🔴 Disconnected'}
                </span>
            </div>
            <svg viewBox="0 0 1000 600" className="topology-diagram">
                {/* Connection Lines */}
                <g className="connections">
                    {/* Scheduler to Redis */}
                    {leader && (
                        <path
                            d="M 250 150 L 250 250 L 500 250 L 500 280"
                            className="connection-line"
                            strokeDasharray="5,5"
                        />
                    )}
                    {standby && (
                        <path
                            d="M 750 150 L 750 250 L 500 250 L 500 280"
                            className="connection-line"
                            strokeDasharray="5,5"
                        />
                    )}

                    {/* Redis to Workers - Dynamic based on active workers */}
                    {workers.slice(0, 3).map((worker, index) => {
                        const workerCount = Math.min(workers.length, 3);
                        const spacing = workerCount === 1 ? 0 : 600 / (workerCount - 1);
                        const startX = workerCount === 1 ? 400 : 100;
                        const centerX = startX + (index * spacing) + 100;

                        return (
                            <path
                                key={`connection-${worker.id}`}
                                d={`M 500 380 L ${centerX} 450`}
                                className="connection-line"
                            />
                        );
                    })}
                </g>

                {/* Scheduler Nodes */}
                <g className="schedulers">
                    {leader && (
                        <g className="scheduler-node leader" transform="translate(150, 80)">
                            <rect width="200" height="80" rx="8" className="node-bg leader-bg" />
                            <text x="100" y="25" className="node-title">👑 Leader Scheduler</text>
                            <text x="100" y="45" className="node-id">{leader.id.substring(0, 16)}</text>
                            <text x="100" y="60" className="node-status">PID: {leader.pid}</text>
                        </g>
                    )}

                    {standby && (
                        <g className="scheduler-node standby" transform="translate(650, 80)">
                            <rect width="200" height="80" rx="8" className="node-bg standby-bg" />
                            <text x="100" y="25" className="node-title">⏸️ Standby Scheduler</text>
                            <text x="100" y="45" className="node-id">{standby.id.substring(0, 16)}</text>
                            <text x="100" y="60" className="node-status">PID: {standby.pid}</text>
                        </g>
                    )}
                </g>

                {/* Redis Node */}
                <g className="redis-node" transform="translate(400, 280)">
                    <rect
                        width="200"
                        height="100"
                        rx="8"
                        className={`node-bg redis-bg ${queueDepth > 0 ? 'pulsing' : ''}`}
                    />
                    <text x="100" y="30" className="node-title">📦 Redis Queue</text>
                    <text x="100" y="55" className="node-queue">Queue: {queueDepth} tasks</text>
                    <text x="100" y="75" className="node-status">localhost:6379</text>
                </g>

                {/* Worker Nodes - Dynamic positioning */}
                <g className="workers">
                    {workers.slice(0, 3).map((worker, index) => {
                        // Dynamic positioning based on number of workers
                        const workerCount = Math.min(workers.length, 3);
                        const spacing = workerCount === 1 ? 0 : 600 / (workerCount - 1);
                        const startX = workerCount === 1 ? 400 : 100;
                        const x = startX + (index * spacing);

                        const isExecuting = worker.status === 'executing';

                        return (
                            <g key={worker.id} className={`worker-node ${isExecuting ? 'executing' : 'idle'}`} transform={`translate(${x}, 450)`}>
                                <rect
                                    width="200"
                                    height="100"
                                    rx="8"
                                    className={`node-bg ${isExecuting ? 'executing-bg' : 'idle-bg'}`}
                                />
                                <text x="100" y="25" className="node-title">
                                    {isExecuting ? '⚙️' : '🟢'} Worker {index + 1}
                                </text>
                                <text x="100" y="45" className="node-id">{worker.id.substring(0, 16)}</text>
                                <text x="100" y="65" className="node-status">
                                    {isExecuting ? `Task: ${worker.currentTaskId?.substring(0, 8)}...` : 'Idle'}
                                </text>
                                <text x="100" y="85" className="node-pid">PID: {worker.pid}</text>
                            </g>
                        );
                    })}
                </g>

                {/* Animated Task Flow (when queue > 0) */}
                {queueDepth > 0 && leader && workers.length > 0 && (
                    <>
                        {/* Leader to Redis */}
                        <circle r="6" className="task-flow" fill="#4ecdc4">
                            <animateMotion
                                dur="2s"
                                repeatCount="indefinite"
                                path="M 250 150 L 250 250 L 500 250 L 500 280"
                            />
                        </circle>

                        {/* Redis to First Worker */}
                        {(() => {
                            const workerCount = Math.min(workers.length, 3);
                            const spacing = workerCount === 1 ? 0 : 600 / (workerCount - 1);
                            const startX = workerCount === 1 ? 400 : 100;
                            const centerX = startX + 100;

                            return (
                                <circle r="6" className="task-flow" fill="#ff6b6b">
                                    <animateMotion
                                        dur="2s"
                                        repeatCount="indefinite"
                                        path={`M 500 380 L ${centerX} 450`}
                                        begin="0.5s"
                                    />
                                </circle>
                            );
                        })()}
                    </>
                )}
            </svg>
        </div>
    );
}

export default SystemTopology;
