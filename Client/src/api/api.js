import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3000', // Server API URL
    headers: {
        'Content-Type': 'application/json',
    },
});

export const getTasks = () => api.get('/tasks');
export const getWorkers = () => api.get('/workers');
export const createTask = (task) => api.post('/tasks', task);

export default api;
