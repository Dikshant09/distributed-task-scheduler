const now = () => {
    return new Date();
};

const addSeconds = (date, seconds) => {
    return new Date(date.getTime() + seconds * 1000);
};

const isExpired = (date) => {
    if (!date) return true;
    return date < new Date();
};

module.exports = {
    now,
    addSeconds,
    isExpired
};
