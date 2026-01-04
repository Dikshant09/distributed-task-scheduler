import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { getSystemStatus } from '../api/api';
import './SystemTopology.css';

function SystemTopology() {
    const [instances, setInstances] = useState({ schedulers: [], workers: [] });
    const [queueDepth, setQueueDepth] = useState(0);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [detailedView, setDetailedView] = useState(true);

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
    const maxDisplayWorkers = Math.min(numWorkers, 5);

    // Calculate scheduler positions
    const schedulerNodeWidth = 200;
    const schedulerPadding = 50;
    const schedulerTotalWidth = (numSchedulers * schedulerNodeWidth) + ((numSchedulers - 1) * schedulerPadding);
    const schedulerStartX = (1000 - schedulerTotalWidth) / 2;
    const schedulerSpacing = schedulerNodeWidth + schedulerPadding;

    // Calculate worker positions
    const workerNodeWidth = 200;
    const workerPadding = 20;
    const workerTotalWidth = (maxDisplayWorkers * workerNodeWidth) + ((maxDisplayWorkers - 1) * workerPadding);
    const workerStartX = (1000 - workerTotalWidth) / 2;
    const workerSpacing = workerNodeWidth + workerPadding;

    // Render Simple View (original)
    const renderSimpleView = () => (
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

            {/* Worker Nodes */}
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

                {numWorkers > maxDisplayWorkers && (
                    <g transform={`translate(${workerStartX + maxDisplayWorkers * workerSpacing}, 450)`}>
                        <rect width="200" height="100" rx="8" className="node-bg idle-bg" opacity="0.5" />
                        <text x="100" y="50" className="node-title">
                            +{numWorkers - maxDisplayWorkers} more workers
                        </text>
                    </g>
                )}

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

            {/* Task Flow Animation */}
            {leader && workers.length > 0 && (
                <>
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

                    {workers.slice(0, maxDisplayWorkers).map((worker, index) => {
                        if (worker.status !== 'executing') return null;
                        const centerX = workerStartX + (index * workerSpacing) + 100;
                        return (
                            <circle key={`task-flow-${worker.id}`} r="6" className="task-flow" fill="#ff6b6b">
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
    );

    // Render Detailed SRP View
    const renderDetailedView = () => (
        <svg viewBox="0 0 1200 600" className="topology-diagram detailed-view">
            {/* Title/Legend - Top right corner */}
            <g className="legend" transform="translate(980, 20)">
                <rect width="200" height="140" rx="8" fill="rgba(15,15,26,0.95)" stroke="var(--glass-border)" strokeWidth="2" />
                <text x="100" y="30" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold">Legend</text>
                <text x="20" y="58" fill="#22c55e" textAnchor="start" fontSize="13">⚡ Leader-elected</text>
                <text x="20" y="83" fill="#f97316" textAnchor="start" fontSize="13">📤 Stateless</text>
                <text x="20" y="108" fill="#8b5cf6" textAnchor="start" fontSize="13">🔄 Background</text>
                <text x="20" y="130" fill="#3b82f6" textAnchor="start" fontSize="13">👷 Executor</text>
            </g>

            {/* PostgreSQL Database */}
            <g className="db-node" transform="translate(50, 280)">
                <rect width="120" height="80" rx="8" className="node-bg db-bg" />
                <text x="60" y="30" className="node-title">💾 PostgreSQL</text>
                <text x="60" y="50" className="node-status">Source of Truth</text>
                <text x="60" y="68" className="node-pid">tasks table</text>
            </g>

            {/* Etcd */}
            <g className="etcd-node" transform="translate(50, 100)">
                <rect width="120" height="70" rx="8" className="node-bg etcd-bg" />
                <text x="60" y="28" className="node-title">🔐 Etcd</text>
                <text x="60" y="48" className="node-status">Leader Election</text>
            </g>

            {/* Scheduler Coordinator Nodes */}
            <g className="coordinators">
                {schedulers.map((scheduler, index) => {
                    const x = 220 + (index * 160);
                    const isLeader = scheduler.isLeader;

                    return (
                        <g key={scheduler.id} transform={`translate(${x}, 80)`}>
                            <rect width="140" height="100" rx="8" className={`node-bg ${isLeader ? 'leader-bg' : 'standby-bg'}`} />
                            <text x="70" y="22" className="node-title">
                                {isLeader ? '👑' : '⏸️'} Coordinator
                            </text>
                            <text x="70" y="42" className="node-status">{isLeader ? 'LEADER' : 'Standby'}</text>
                            <text x="70" y="60" className="node-id">{scheduler.id.substring(0, 12)}</text>
                            <text x="70" y="78" className="node-pid">PID: {scheduler.pid}</text>
                            <text x="70" y="92" className="node-status" fontSize="9">PENDING→READY</text>
                        </g>
                    );
                })}

                {/* Connection from Etcd to Coordinators - Route above nodes */}
                {schedulers.map((scheduler, index) => {
                    const x = 220 + (index * 160) + 70;
                    // Route line: from Etcd right side (170, 135) → up to y=50 → horizontal to above coordinator → down to top of coordinator
                    return (
                        <path
                            key={`etcd-conn-${scheduler.id}`}
                            d={`M 170 135 L 190 135 L 190 50 L ${x} 50 L ${x} 80`}
                            className="connection-line"
                            strokeDasharray={scheduler.isLeader ? "none" : "5,5"}
                        />
                    );
                })}
            </g>

            {/* Dispatcher (Stateless) */}
            <g className="dispatcher-node" transform="translate(480, 230)">
                <rect width="160" height="80" rx="8" className="node-bg dispatcher-bg" />
                <text x="80" y="25" className="node-title">📤 Dispatcher</text>
                <text x="80" y="45" className="node-status">Stateless</text>
                <text x="80" y="62" className="node-pid">READY → Redis</text>
            </g>

            {/* Connection: DB ↔ Coordinator */}
            <path d="M 170 320 L 220 320 L 220 180" className="connection-line" />

            {/* Connection: Coordinator → Dispatcher - Route below coordinator nodes */}
            {leader && (() => {
                const leaderX = 220 + schedulers.findIndex(s => s.isLeader) * 160 + 70;
                // Route: from bottom of leader coordinator → down → horizontal to above dispatcher → down to dispatcher
                return (
                    <path
                        d={`M ${leaderX} 180 L ${leaderX} 200 L 560 200 L 560 230`}
                        className="connection-line"
                    />
                );
            })()}

            {/* Redis Queue */}
            <g className="redis-node" transform="translate(700, 230)">
                <rect
                    width="160"
                    height="80"
                    rx="8"
                    className={`node-bg redis-bg ${queueDepth > 0 ? 'pulsing' : ''}`}
                />
                <text x="80" y="25" className="node-title">📦 Redis Streams</text>
                <text x="80" y="50" className="node-queue">Queue: {queueDepth}</text>
                <text x="80" y="68" className="node-status">Consumer Groups</text>
            </g>

            {/* Connection: Dispatcher → Redis */}
            <path d="M 640 270 L 700 270" className="connection-line" />

            {/* Worker Nodes - Dynamically positioned and centered */}
            {(() => {
                const maxDetailedWorkers = 4;
                const displayCount = Math.min(numWorkers, maxDetailedWorkers);
                const detailWorkerWidth = 140;
                const detailWorkerPadding = 15;
                const detailWorkerTotalWidth = (displayCount * detailWorkerWidth) + ((displayCount - 1) * detailWorkerPadding);
                const detailWorkerStartX = 420 + (580 - detailWorkerTotalWidth) / 2; // Center in worker area (420-1000)
                const detailWorkerSpacing = detailWorkerWidth + detailWorkerPadding;

                return (
                    <g className="workers">
                        {workers.slice(0, displayCount).map((worker, index) => {
                            const x = detailWorkerStartX + (index * detailWorkerSpacing);
                            const isExecuting = worker.status === 'executing';

                            return (
                                <g key={worker.id} className={`worker-node ${isExecuting ? 'executing' : 'idle'}`} transform={`translate(${x}, 380)`}>
                                    <rect
                                        width="140"
                                        height="85"
                                        rx="8"
                                        className={`node-bg ${isExecuting ? 'executing-bg' : 'idle-bg'}`}
                                    />
                                    <text x="70" y="20" className="node-title">
                                        {isExecuting ? '⚙️' : '👷'} Worker {index + 1}
                                    </text>
                                    <text x="70" y="38" className="node-id">{worker.id.substring(0, 12)}</text>
                                    <text x="70" y="54" className="node-status">
                                        {isExecuting ? 'Executing' : 'Idle'}
                                    </text>
                                    <text x="70" y="72" className="node-pid">PID: {worker.pid}</text>
                                </g>
                            );
                        })}

                        {numWorkers > maxDetailedWorkers && (
                            <g transform={`translate(${detailWorkerStartX + displayCount * detailWorkerSpacing}, 380)`}>
                                <rect width="100" height="85" rx="8" className="node-bg idle-bg" opacity="0.6" />
                                <text x="50" y="35" className="node-title">+{numWorkers - maxDetailedWorkers}</text>
                                <text x="50" y="55" className="node-status">more</text>
                            </g>
                        )}

                        {/* Connection: Redis → Workers */}
                        {workers.slice(0, displayCount).map((worker, index) => {
                            const x = detailWorkerStartX + (index * detailWorkerSpacing) + 70;
                            return (
                                <path
                                    key={`redis-worker-${worker.id}`}
                                    d={`M 780 310 L ${x} 380`}
                                    className="connection-line"
                                />
                            );
                        })}
                    </g>
                );
            })()}

            {/* Recovery Service (Stateless) */}
            <g className="recovery-node" transform="translate(220, 380)">
                <rect width="140" height="80" rx="8" className="node-bg recovery-bg" />
                <text x="70" y="22" className="node-title">🔄 Recovery</text>
                <text x="70" y="42" className="node-status">Stateless</text>
                <text x="70" y="60" className="node-pid">Retry + DLQ</text>
                <text x="70" y="75" className="node-pid">Lease Reaper</text>
            </g>

            {/* Worker Monitor (Stateless) */}
            <g className="monitor-node" transform="translate(220, 490)">
                <rect width="140" height="70" rx="8" className="node-bg monitor-bg" />
                <text x="70" y="22" className="node-title">👁️ Monitor</text>
                <text x="70" y="42" className="node-status">Stateless</text>
                <text x="70" y="58" className="node-pid">Heartbeat Check</text>
            </g>

            {/* Connection: DB ↔ Recovery/Monitor */}
            <path d="M 170 360 L 190 360 L 190 420 L 220 420" className="connection-line" strokeDasharray="5,5" />
            <path d="M 170 360 L 190 360 L 190 525 L 220 525" className="connection-line" strokeDasharray="5,5" />

            {/* Connection: Workers → DB (status updates) */}
            <path d="M 520 470 L 170 470 L 170 360" className="connection-line" strokeDasharray="5,5" />

            {/* Animated Task Flows */}
            {leader && workers.length > 0 && queueDepth > 0 && (() => {
                const leaderX = 220 + schedulers.findIndex(s => s.isLeader) * 160 + 70;
                return (
                    <>
                        {/* Coordinator → Dispatcher - follows same path as connection line */}
                        <circle r="5" className="task-flow" fill="#4ecdc4">
                            <animateMotion
                                dur="1.5s"
                                repeatCount="indefinite"
                                path={`M ${leaderX} 180 L ${leaderX} 200 L 560 200 L 560 230`}
                            />
                        </circle>

                        {/* Dispatcher → Redis */}
                        <circle r="5" className="task-flow" fill="#f97316">
                            <animateMotion
                                dur="1s"
                                repeatCount="indefinite"
                                path="M 640 270 L 700 270"
                            />
                        </circle>
                    </>
                );
            })()}
        </svg>
    );

    return (
        <div className="system-topology">
            <div className="topology-header">
                <h3>🗺️ System Topology</h3>
                <div className="topology-controls">
                    <button
                        className={`view-toggle ${!detailedView ? 'active' : ''}`}
                        onClick={() => setDetailedView(false)}
                    >
                        Simple
                    </button>
                    <button
                        className={`view-toggle ${detailedView ? 'active' : ''}`}
                        onClick={() => setDetailedView(true)}
                    >
                        Detailed (SRP)
                    </button>
                    <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                        {connected ? '🟢 Live' : '🔴 Disconnected'}
                    </span>
                </div>
            </div>
            {detailedView ? renderDetailedView() : renderSimpleView()}
        </div>
    );
}

export default SystemTopology;
