'use strict';

const dataAccess = require('data-access');
const initTable = require('init-table');
const response = require('response-lib');
const AWS = require('aws-sdk');

const { Pool } = require('pg');

let pool;
let endpoint = process.env.ENDPOINT;
let org = process.env.STAGE

module.exports.postwscat = async (event, context) => {
    console.log(event, context);
    initConnectionPool();

    if (!event.body) {
        return response.generate(event, 400, 'body undefined')
    }

    const body = JSON.parse(event.body);

    const message = body?.message || ''
    const chatroom_id = body?.chatroom_id || ''

    try {
        let connections = await getAllConnections(chatroom_id);

        if (connections.length > 0) {
            await Promise.all(
                connections.map(item => sendMessage(endpoint, item.connection_id, { message: message }))
            );
        }
        return response.generate(event, 200, connections)
    } catch (error) {
        return response.generate(event, 400, error)
    }
};

async function sendMessage(url, connection_id, data) {
    try {
        const apig = new AWS.ApiGatewayManagementApi({
            apiVersion: '2018-11-29',
            endpoint: url,
        });

        await apig.postToConnection({
            ConnectionId: connection_id,
            Data: Buffer.from(JSON.stringify(data))
        }).promise();
    }
    catch (err) {
        // Ignore if connection no longer exists
        if (err.statusCode !== 400 && err.statusCode !== 410) {
            throw err;
        }
    }
}

async function getAllConnections(chatroom_id) {
    const result = await dataAccess.select(pool, org, 'websocket', `WHERE chatroom_id = $1`, 'connection_id', [chatroom_id]);

    return result.rows;
}

exports.handler = async function (event, context) {
    console.log(event, context);
    initConnectionPool();

    await initTable.websocket(pool, org, 'websocket');

    const routeKey = event.requestContext.routeKey;
    const connection_id = event.requestContext.connectionId;

    const params = event?.queryStringParameters;
    const chatroom_id = params?.chatroom_id;

    switch (routeKey) {
        case '$connect':
            if (!chatroom_id) {
                return response.generate(event, 400, 'chatroom_id undefined')
            }
            await dataAccess.insert(pool, 'connection_id, ttl, chatroom_id', '$1, $2, $3', [connection_id, new Date().toISOString(), chatroom_id], org, 'websocket');
            break;

        case '$disconnect':
            await dataAccess.delete(pool, org, 'websocket', `WHERE connection_id = '${connection_id}'`);
            break;

        case 'routeA':
            await sendMessage(endpoint, connection_id, { data: 'not found' });
            break;

        case '$default':
        default:
            await sendMessage(endpoint, connection_id, { data: 'not found' });
    }
    return { statusCode: 200 };
}

const initConnectionPool = async () => {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        pool = new Pool({
            connectionString,
            max: 1,
        });
    }
}

