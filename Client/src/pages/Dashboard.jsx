import React from 'react';
import { useTasks, useWorkers } from '../hooks/useTasks';
import TaskCard from '../components/TaskCard';
import { createTask } from '../api/api';

const Dashboard = () => {
    const { tasks, loading, error, refetch } = useTasks();
    const { workers } = useWorkers();

    const handleCreateTask = async () => {
        try {
            await createTask({
                type: 'WAIT',
                payload: { duration: 2000 },
                scheduledAt: new Date().toISOString(),
                idempotencyKey: `client-${Date.now()}`
            });
            refetch();
        } catch (err) {
            alert('Failed to create task');
        }
    };

    const handleCreateFailTask = async () => {
        try {
            await createTask({
                type: 'FAIL',
                payload: {},
                scheduledAt: new Date().toISOString(),
                idempotencyKey: `client-fail-${Date.now()}`
            });
            refetch();
        } catch (err) {
            alert('Failed to create fail task');
        }
    };

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial' }}>
            <h1>Distributed Task Scheduler</h1>

            <div style={{ marginBottom: '20px' }}>
                <button onClick={handleCreateTask} style={{ marginRight: '10px' }}>
                    Submit "Wait" Task
                </button>
                <button onClick={handleCreateFailTask}>
                    Submit "Fail" Task
                </button>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 2 }}>
                    <h2>Tasks ({tasks.length})</h2>
                    {tasks.map(task => (
                        <TaskCard key={task.id} task={task} />
                    ))}
                </div>

                <div style={{ flex: 1, borderLeft: '1px solid #ccc', paddingLeft: '20px' }}>
                    <h2>Active Workers ({workers.length})</h2>
                    <ul>
                        {workers.map(w => (
                            <li key={w.worker_id}>
                                {w.worker_id} - <small>{new Date(w.last_heartbeat).toLocaleTimeString()}</small>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
