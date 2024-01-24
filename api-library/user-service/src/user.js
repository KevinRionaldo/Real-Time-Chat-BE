const { Pool } = require('pg');
const dataAccess = require('data-access');
const initTable = require('init-table')
const response = require('response-lib');
const tableFields = require('table-fields');
const dataMgmt = require('data-mgmt');

let pool;
const userFields = tableFields.message();
const stage = process.env.STAGE;

module.exports.get = async (event, context) => {
    console.log(event, context);
    initConnectionPool();
    await initTable.user(pool, stage);

    let selectFilter = `WHERE id IS NOT NULL`;
    let selectValue = [];

    const params = event?.queryStringParameters;

    if (params?.filter) {
        selectFilter = `WHERE (name ILIKE $1 OR email ILIKE $1 OR user_name ILIKE $1 OR phone ILIKE $1)`; selectValue.push(`%${params.filter}%`)
    }

    if (params?.chatroom_id) {
        selectValue.push(`%${params.filter}%`); selectFilter = ` AND chatroom_id = $${selectValue.length}`; 
    }

    selectFilter += ` ORDER BY name asc`;

    if (params?.page && params?.limit) {
        selectValue.push(`${Number(params.limit)}`, `${(Number(params.page) - 1) * Number(params.limit)}`);
        selectFilter += ` LIMIT $${selectValue.length - 1} OFFSET $${selectValue.length}`
    }
    
    try {
        let selectQry = await dataAccess.select(pool, stage, 'user', selectFilter, `*`, selectValue)
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
    await initTable.user(pool, stage);

    let selectFilter = `WHERE id IS NOT NULL`;
    let selectValue = [];

    const params = event?.queryStringParameters;

    if (params?.filter) {
        selectFilter = `WHERE (name ILIKE $1 OR email ILIKE $1 OR user_name ILIKE $1 OR phone ILIKE $1)`; selectValue.push(`%${params.filter}%`)
    }

    if (params?.chatroom_id) {
        selectValue.push(`%${params.filter}%`); selectFilter = ` AND chatroom_id = $${selectValue.length}`; 
    }

    try {
        let selectQry = await dataAccess.select(pool, stage, 'user', selectFilter, `*`, selectValue)
        selectQry = selectQry.rows;

        return response.generate(event, 200, selectQry);
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
    if (!body?.chatroom_id) {
        return response.generate(event, 400, 'chatroom id undefined')
    }

    try {
        //manage insert data customer
        const insertData = { id: '', ...body, created_at: currentTime, updated_at: currentTime };

        const user = event?.requestContext?.authorizer?.jwt?.claims?.sub;
        user !== undefined ? insertData.created_by = user : '';

        let insertParams = dataAccess.composeInsertParams(userFields, insertData);
        let insertQry = await dataAccess.insert(pool, insertParams.fields, insertParams.valuesTemplate, insertParams.values, stage, 'user', 'id', 'id');

        //return error if result of query insert error
        if (insertQry?.error) {
            throw (insertQry.error?.detail ? insertQry.error?.detail : insertQry.error);
        }

        insertData.id = insertQry.rows[0].id;

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
        let deleteQry = await dataAccess.delete(pool, stage, 'user', `where id = $1`, [event.pathParameters.id], '*')

        if (deleteQry?.error) {
            throw (deleteQry.error?.detail ? deleteQry.error?.detail : deleteQry.error);
        }

        if (deleteQry?.rowCount == 0) {
            throw ('id is not found')
        }

        const resultData = deleteQry.rows[0]

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

        let updateParams = dataAccess.composeUpdateParams(userFields, updateData, ['id']);
        let updateQry = await dataAccess.update(pool, updateParams.fields, updateParams.keyParameter, updateParams.values, stage, 'user');

        if (updateQry.error) {
            return response.generate(event, 400, 'update error');
        }

        return response.generate(event, 200, updateData);
    }
    catch (err) {
        console.log(err)
        return response.generate(event, 500, { error: `${err.message} ${err.stack}` });
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