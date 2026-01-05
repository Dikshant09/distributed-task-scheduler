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
export const getSchedulerStatus = () => api.get('/admin/scheduler/status');
export const killLeader = () => api.post('/admin/faults/kill-leader');
export const killWorker = (workerId) => api.post('/admin/faults/kill-worker', { workerId });
export const killWorkerMidTask = (killAfterMs) => api.post('/admin/faults/kill-worker-mid-task', { killAfterMs });
export const pauseQueue = (duration) => api.post('/admin/faults/pause-queue', { duration });
export const networkDelay = (duration) => api.post('/admin/faults/network-delay', { duration });
export const resetSystem = () => api.post('/admin/system/reset');
export const resetInstances = () => api.post('/admin/instances/reset');

// Events
export const getEvents = (params) => {
    // Support both legacy number format and new params object
    if (typeof params === 'number') {
        return api.get(`/events?limit=${params}`);
    }
    return api.get('/events', { params });
};

export default api;
