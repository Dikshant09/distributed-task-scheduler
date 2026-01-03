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
    const standbys = schedulers.filter(s => !s.isLeader);

    // Calculate dynamic layout
    const numSchedulers = schedulers.length;
    const numWorkers = workers.length;
    const maxDisplayWorkers = Math.min(numWorkers, 5); // Display max 5 workers to avoid overcrowding

    // Calculate scheduler positions (200px wide nodes + 50px padding)
    const schedulerNodeWidth = 200;
    const schedulerPadding = 50;
    const schedulerTotalWidth = (numSchedulers * schedulerNodeWidth) + ((numSchedulers - 1) * schedulerPadding);
    const schedulerStartX = (1000 - schedulerTotalWidth) / 2;
    const schedulerSpacing = schedulerNodeWidth + schedulerPadding;

    // Calculate worker positions (200px wide nodes + 20px padding)
    const workerNodeWidth = 200;
    const workerPadding = 20;
    const workerTotalWidth = (maxDisplayWorkers * workerNodeWidth) + ((maxDisplayWorkers - 1) * workerPadding);
    const workerStartX = (1000 - workerTotalWidth) / 2;
    const workerSpacing = workerNodeWidth + workerPadding;


    return (
        <div className="system-topology">
            <div className="topology-header">
                <h3>🗺️ System Topology</h3>
                <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                    {connected ? '🟢 Live' : '🔴 Disconnected'}
                </span>
            </div>
            <svg viewBox="0 0 1000 600" className="topology-diagram">
                {/* Critical Alert - No Schedulers */}
                {schedulers.length === 0 && (
                    <g className="critical-alert">
                        <rect x="300" y="80" width="400" height="80" rx="8" fill="#ef4444" opacity="0.9" />
                        <text x="500" y="110" className="node-title" fill="#ffffff" fontSize="18">
                            ⚠️ CRITICAL: No Schedulers Running
                        </text>
                        <text x="500" y="135" className="node-status" fill="#ffffff" fontSize="14">
                            Task dispatching halted - Start scheduler instances
                        </text>
                    </g>
                )}

                {/* Connection Lines */}
                <g className="connections">
                    {/* Schedulers to Redis */}
                    {schedulers.map((scheduler, index) => {
                        const x = schedulerStartX + (index * schedulerSpacing);
                        return (
                            <path
                                key={`conn-sched-${scheduler.id}`}
                                d={`M ${x + 100} 150 L ${x + 100} 250 L 500 250 L 500 280`}
                                className="connection-line"
                                strokeDasharray={scheduler.isLeader ? "none" : "5,5"}
                            />
                        );
                    })}

                    {/* Redis to Workers */}
                    {workers.slice(0, maxDisplayWorkers).map((worker, index) => {
                        const centerX = workerStartX + (index * workerSpacing) + 100;
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
                    {schedulers.map((scheduler, index) => {
                        const x = schedulerStartX + (index * schedulerSpacing);
                        const isLeader = scheduler.isLeader;

                        return (
                            <g
                                key={scheduler.id}
                                className={`scheduler-node ${isLeader ? 'leader' : 'standby'}`}
                                transform={`translate(${x}, 80)`}
                            >
                                <rect width="200" height="80" rx="8" className={`node-bg ${isLeader ? 'leader-bg' : 'standby-bg'}`} />
                                <text x="100" y="25" className="node-title">
                                    {isLeader ? '👑 Leader' : '⏸️ Standby'} Scheduler
                                </text>
                                <text x="100" y="45" className="node-id">{scheduler.id.substring(0, 16)}</text>
                                <text x="100" y="60" className="node-status">PID: {scheduler.pid}</text>
                            </g>
                        );
                    })}
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
                    {workers.slice(0, maxDisplayWorkers).map((worker, index) => {
                        const x = workerStartX + (index * workerSpacing);
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

                    {/* Show indicator if there are more workers */}
                    {numWorkers > maxDisplayWorkers && (
                        <g transform={`translate(${workerStartX + maxDisplayWorkers * workerSpacing}, 450)`}>
                            <rect width="200" height="100" rx="8" className="node-bg idle-bg" opacity="0.5" />
                            <text x="100" y="50" className="node-title">
                                +{numWorkers - maxDisplayWorkers} more workers
                            </text>
                        </g>
                    )}

                    {/* Critical Alert - No Workers */}
                    {workers.length === 0 && (
                        <g className="critical-alert">
                            <rect x="300" y="450" width="400" height="80" rx="8" fill="#f59e0b" opacity="0.9" />
                            <text x="500" y="480" className="node-title" fill="#ffffff" fontSize="18">
                                ⚠️ WARNING: No Workers Running
                            </text>
                            <text x="500" y="505" className="node-status" fill="#ffffff" fontSize="14">
                                No task execution - Start worker instances
                            </text>
                        </g>
                    )}
                </g>

                {/* Animated Task Flow - Real-time based on executing workers */}
                {leader && workers.length > 0 && (
                    <>
                        {/* Leader to Redis - show when queue has tasks */}
                        {queueDepth > 0 && (() => {
                            const leaderIndex = schedulers.findIndex(s => s.isLeader);
                            const leaderX = schedulerStartX + (leaderIndex * schedulerSpacing) + 100;
                            return (
                                <circle r="6" className="task-flow" fill="#4ecdc4">
                                    <animateMotion
                                        dur="2s"
                                        repeatCount="indefinite"
                                        path={`M ${leaderX} 150 L ${leaderX} 250 L 500 250 L 500 280`}
                                    />
                                </circle>
                            );
                        })()}

                        {/* Redis to Executing Workers - Real-time animation */}
                        {workers.slice(0, maxDisplayWorkers).map((worker, index) => {
                            // Only show animation for workers that are currently executing
                            if (worker.status !== 'executing') return null;

                            const centerX = workerStartX + (index * workerSpacing) + 100;

                            return (
                                <circle
                                    key={`task-flow-${worker.id}`}
                                    r="6"
                                    className="task-flow"
                                    fill="#ff6b6b"
                                >
                                    <animateMotion
                                        dur="1.5s"
                                        repeatCount="indefinite"
                                        path={`M 500 380 L ${centerX} 450`}
                                        begin={`${index * 0.2}s`}
                                    />
                                </circle>
                            );
                        })}
                    </>
                )}
            </svg>
        </div>
    );
}

export default SystemTopology;
