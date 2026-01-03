import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3000',
    headers: {
        'Content-Type': 'application/json',
    },
});

// System
export const getSystemStatus = () => api.get('/system/status');
export const getInstances = () => api.get('/instances');

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
export const killWorker = (workerId) => api.post('/admin/faults/kill-worker', { workerId });
export const pauseQueue = (duration) => api.post('/admin/faults/pause-queue', { duration });

// Events
export const getEvents = (params) => {
    // Support both legacy number format and new params object
    if (typeof params === 'number') {
        return api.get(`/events?limit=${params}`);
    }
    return api.get('/events', { params });
};

export default api;
