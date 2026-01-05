import React, { useState, useEffect } from 'react';
import { getSystemStatus } from '../api/api';
import './Header.css';

function Header() {
    const [schedulerEnabled, setSchedulerEnabled] = useState(true);
    const [leaderId, setLeaderId] = useState('loading...');

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await getSystemStatus();
                setSchedulerEnabled(res.data.data.scheduler.enabled);
                setLeaderId(res.data.data.scheduler.leaderId);
            } catch (err) {
                console.error('Failed to fetch status', err);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <header className="header">
            <div className="header-left">
                <h1>Task Scheduler</h1>
            </div>
            <div className="header-right">
                <div className="status-indicator">
                    <span className={`status-dot ${schedulerEnabled ? 'enabled' : 'disabled'}`}></span>
                    <span className="status-text">
                        {schedulerEnabled ? '🟢 Enabled' : '🔴 Disabled'}
                    </span>
                </div>
                <div className="leader-info">
                    Leader: <strong>{leaderId}</strong>
                </div>
                <div className="user-menu">
                    <span>Admin</span>
                </div>
            </div>
        </header>
    );
}

export default Header;
