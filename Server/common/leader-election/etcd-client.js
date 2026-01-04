const { Etcd3 } = require('etcd3');
const logger = require('../logger');

const client = new Etcd3({
    hosts: process.env.ETCD_HOSTS || 'http://localhost:2379'
});

module.exports = client;
