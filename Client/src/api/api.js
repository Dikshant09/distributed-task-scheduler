import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3000',
    headers: {
        'Content-Type': 'application/json',
    },
});

// System
export const getSystemStatus = () => api.get('/system/status');

// Jobs
export const getTasks = (params) => api.get('/tasks', { params });
export const getTaskById = (id) => api.get(`/tasks/${id}`);
export const createTask = (task) => api.post('/tasks', task);
export const runTaskNow = (id) => api.post(`/tasks/${id}/run-now`);

// Workers
export const getWorkers = () => api.get('/workers');

// Admin
export const enableScheduler = () => api.post('/admin/scheduler/enable');
export const disableScheduler = () => api.post('/admin/scheduler/disable');
export const killLeader = () => api.post('/admin/faults/kill-leader');
export const killWorker = () => api.post('/admin/faults/kill-worker');
export const pauseQueue = (duration) => api.post('/admin/faults/pause-queue', { duration });

export default api;
