const { Pool } = require('pg');
const dataAccess = require('data-access');
const initTable = require('init-table')
const response = require('response-lib');
const tableFields = require('table-fields');
const dataMgmt = require('data-mgmt');
const axios = require('axios');
const wscatUrl = process.env.POST_WSCAT;

let pool;
const messageFields = tableFields.message();
const stage = process.env.STAGE;

module.exports.get = async (event, context) => {
    console.log(event, context);
    initConnectionPool();
    await initTable.message(pool, stage);

    let selectFilter = `WHERE id IS NOT NULL`;
    let selectValue = [];

    const params = event?.queryStringParameters;

    if (params?.filter) {
        selectFilter = `WHERE (value ILIKE $1)`; selectValue.push(`%${params.filter}%`)
    }

    if (params?.chatroom_id) {
        selectValue.push(params.chatroom_id); selectFilter += ` AND (chatroom_id = $${selectValue.length})`
    }

    if (params?.user_id) {
        selectValue.push(params.user_id); selectFilter += ` AND (user_id = $${selectValue.length})`
    }

    selectFilter += ` ORDER BY created_at desc`;

    if (params?.page && params?.limit) {
        selectValue.push(`${Number(params.limit)}`, `${(Number(params.page) - 1) * Number(params.limit)}`);
        selectFilter += ` LIMIT $${selectValue.length - 1} OFFSET $${selectValue.length}`
    }

    try {
        let selectQry = await dataAccess.select(pool, stage, 'message', selectFilter, `*`, selectValue)
        selectQry = selectQry.rows;

        return response.generate(event, 200, selectQry);
    }
    catch (err) {
        console.log(err)
        return response.generate(event, 500, { error: `${err.message} ${err.stack}` });
    }
};
module.exports.count = async (event, context) => {
    console.log(event, context);
    initConnectionPool();
    await initTable.message(pool, stage);

    let selectFilter = `WHERE id IS NOT NULL`;
    let selectValue = [];

    const params = event?.queryStringParameters;

    if (params?.filter) {
        selectFilter = `WHERE (value ILIKE $1)`; selectValue.push(`%${params.filter}%`)
    }

    try {
        let selectQry = await dataAccess.select(pool, stage, 'message', selectFilter, `count(*)`, selectValue)

        return response.generate(event, 200, selectQry.rows[0].count);
    }
    catch (err) {
        console.log(err)
        return response.generate(event, 500, { error: `${err.message} ${err.stack}` });
    }
};

module.exports.create = async (event, context) => {
    console.log(event, context);
    initConnectionPool();
    const currentTime = new Date().toISOString();

    //check body data 
    if (!event.body) {
        return response.generate(event, 400, 'body is undefined');
    }

    const body = JSON.parse(event.body);
    if (!body?.chatroom_id || !body?.user_id) {
        return response.generate(event, 400, 'chatroom id or user id undefined, check both of them')
    }
    !body?.value ? body.value = '' : ''

    try {
        //manage insert data customer
        const insertData = { id: '', ...body, created_at: currentTime, updated_at: currentTime };

        const user = event?.requestContext?.authorizer?.jwt?.claims?.sub;
        user !== undefined ? insertData.created_by = user : '';

        let insertParams = dataAccess.composeInsertParams(messageFields, insertData);
        let insertQry = await dataAccess.insert(pool, insertParams.fields, insertParams.valuesTemplate, insertParams.values, stage, 'message', 'id', 'id');

        //return error if result of query insert error
        if (insertQry?.error) {
            throw (insertQry.error?.detail ? insertQry.error?.detail : insertQry.error);
        }

        insertData.id = insertQry.rows[0].id;

        //manage websocket body
        const wscatBody = {
            object: 'message',
            type: 'create',
            data: insertData,
        }
        await axios.post(wscatUrl, wscatBody);

        return response.generate(event, 200, insertData);
    }
    catch (err) {
        console.log(err)
        return response.generate(event, 400, err);
    }
};

module.exports.delete = async (event, context) => {
    console.log(event, context);
    initConnectionPool();

    try {
        //delete query
        let deleteQry = await dataAccess.delete(pool, stage, 'message', `where id = $1`, [event.pathParameters.id], '*')

        if (deleteQry?.error) {
            throw (deleteQry.error?.detail ? deleteQry.error?.detail : deleteQry.error);
        }

        if (deleteQry?.rowCount == 0) {
            throw ('id is not found')
        }

        const resultData = deleteQry.rows[0]

        //manage websocket body
        const wscatBody = {
            object: 'message',
            type: 'create',
            data: resultData,
        }
        await axios.post(wscatUrl, wscatBody);

        return response.generate(event, 200, resultData);
    }
    catch (err) {
        console.log(err)
        return response.generate(event, 400, err);
    }
};

module.exports.update = async (event, context) => {
    console.log(event, context);
    initConnectionPool();

    if (!event.body) {
        return response.generate(event, 400, 'body is undefined')
    }

    const body = JSON.parse(event.body);

    try {
        const updateData = { id: event.pathParameters.id, ...body, updated_at: new Date().toISOString() }

        const user = event?.requestContext?.authorizer?.jwt?.claims?.sub;
        user !== undefined ? updateData.updated_by = user : '';

        let updateParams = dataAccess.composeUpdateParams(messageFields, updateData, ['id']);
        let updateQry = await dataAccess.update(pool, updateParams.fields, updateParams.keyParameter, updateParams.values, stage, 'message');

        if (updateQry.error) {
            throw (updateQry.error?.detail ? updateQry.error?.detail : updateQry.error);
        }

        if (updateQry.rowCount == 0) {
            throw ('id is not found')
        }
        //manage websocket body
        const wscatBody = {
            object: 'message',
            type: 'update',
            data: updateData,
        }
        await axios.post(wscatUrl, wscatBody);

        return response.generate(event, 200, updateData);
    }
    catch (err) {
        console.log(err)
        return response.generate(event, 400, err);
    }
};

const initConnectionPool = async () => {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        pool = new Pool({
            connectionString,
            max: 1,
        });
    }
}