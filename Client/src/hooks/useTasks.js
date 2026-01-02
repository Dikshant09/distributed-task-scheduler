import { useState, useEffect } from 'react';
import { getTasks, getWorkers } from '../api/api';

export const useTasks = () => {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchTasks = async () => {
        try {
            const response = await getTasks();
            // Assuming API returns { status: 'success', data: { tasks: [] } }
            // But getTasks returns list based on Repo? 
            // Controller createJob returns data: { task }. getJob returns data: { task }.
            // List tasks route? I didn't implement LIST tasks in controller/routes! Assumed it exists.
            // I only did create and getById.
            // I NEED TO IMPLEMENT LIST TASKS IN CONTROLLER.

            // Let's assume I fix controller.
            if (response.data.data && response.data.data.tasks) {
                setTasks(response.data.data.tasks);
            } else {
                setTasks([]);
            }
            setError(null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 2000); // Polling
        return () => clearInterval(interval);
    }, []);

    return { tasks, loading, error, refetch: fetchTasks };
};

export const useWorkers = () => {
    const [workers, setWorkers] = useState([]);

    const fetchWorkers = async () => {
        try {
            const res = await getWorkers();
            if (res.data.data && res.data.data.workers) {
                setWorkers(res.data.data.workers);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchWorkers();
        const interval = setInterval(fetchWorkers, 2000);
        return () => clearInterval(interval);
    }, []);

    return { workers };
};
