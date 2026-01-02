const { Etcd3 } = require('etcd3');
const config = require('../../common/config');

const client = new Etcd3({
    hosts: config.etcd.hosts
});

module.exports = client;
