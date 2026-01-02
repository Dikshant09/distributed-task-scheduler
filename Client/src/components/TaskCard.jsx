import React from 'react';

const TaskCard = ({ task }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'SUCCESS': return 'green';
            case 'FAILED': return 'red';
            case 'RUNNING': return 'blue';
            case 'DLQ': return 'purple';
            default: return 'gray';
        }
    };

    return (
        <div style={{
            border: '1px solid #ccc',
            borderRadius: '8px',
            padding: '16px',
            margin: '8px 0',
            borderColor: getStatusColor(task.status)
        }}>
            <h3>{task.type} <span style={{ fontSize: '0.8em', color: getStatusColor(task.status) }}>{task.status}</span></h3>
            <p>ID: <small>{task.id}</small></p>
            <p>Attempt: {task.attempt} / {task.max_attempts}</p>
            {task.assigned_worker_id && <p>Worker: {task.assigned_worker_id}</p>}
            <pre style={{ background: '#f5f5f5', padding: '4px' }}>
                {JSON.stringify(task.payload, null, 2)}
            </pre>
        </div>
    );
};

export default TaskCard;
