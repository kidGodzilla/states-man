const { isBuffer } = require('mr365-utils');
const B2 = require('backblaze-b2');
const monk = require('monk');
const md5 = require('md5');

global._statesman_connections = {};
global._statesman_collections = {};


// Todo: consider moving b2 plugin to a seperate module in future version

/**
 * Exportable Plugin.
 * Write a file to B2
 * Todo: responses on errors are too opinionated and should be more generic
 */
function writeFileToB2 (filename, data, conf, cb) {
    // Checks
    if (!filename) return cb('skipped nofilename', 'skipped nofilename');
    if (!data) return cb('skipped nodata', 'skipped nodata');

    // Check that the path does nothing naughty
    if (filename && filename.indexOf('../') !== -1) {
        console.log('Invalid filename.', filename);
        return cb('Invalid filename.', 'Invalid filename.');
    }

    const b2 = new B2({
        accountId: conf.B2_ACCOUNT_ID,
        applicationKey: conf.B2_APPLICATION_KEY
    });

    // Stringify the object if it's not an instance of Buffer
    if (typeof data === 'object' && !isBuffer(data))
        data = JSON.stringify(data);

    return b2.authorize().then(() => {
        return b2.getUploadUrl(conf.B2_BUCKET_ID).then(response => {
            return b2.uploadFile({
                uploadAuthToken: response.data.authorizationToken,
                uploadUrl: response.data.uploadUrl,
                filename: filename,
                data: data
            }).then(response => {
                cb(null, response);
            }).catch(e => {
                cb(e, 'error');
            });
        });
    }).catch(e => {
        console.log(e);
        return next();
    });
}


/**
 * B2 Plugin: persist changes to b2 & return a URL
 */
function b2Plugin (conf) {
    return function (req, res, next) {
        req.conf = Object.assign(req.conf || {}, conf || {});

        req.beforePersistUpdate = (req, res, next) => {

            if (req.conf.B2_APPLICATION_KEY && req.conf.B2_BUCKET_ID && req.conf.B2_ACCOUNT_ID && req.conf.B2_PATH) {

                var filename = req.conf.B2_PATH.replace('{key}', req.newState[req.conf.uniqueKey]);

                if (req.conf.forbiddenFields) req.conf.forbiddenFields.forEach(key => { delete req.newState[key] });

                writeFileToB2(filename, req.newState, req.conf, (err) => {
                    if (err) console.log(err);

                    if (req.conf.B2_BASE_URL) req.sett_response.url = req.conf.B2_BASE_URL + filename;
                    req.sett_response.filepath = filename;

                    next();
                });
            }
            else next();
        };

        next();
    }
}







/**
 * Make a query base on our configuration and request query parameters
 */
function makeQuery (req, res, next) {
    var keyAdded = false, q = {}, opts = {};
    req.gett_opts = { fields: {} };

    // Filterable keys
    if (req.conf.filters) req.conf.filters.forEach(key => {
        if (!req.query[key]) return;
        q[key] = req.query[key];
        keyAdded = true;
    });

    // Hidden fields
    if (req.conf.hiddenFields) req.conf.hiddenFields.forEach(key => {
        req.gett_opts.fields[key] = 0;
    });

    // Allowed fields
    if (req.conf.allowedFields) {
        req.gett_opts.fields = {};
        req.conf.allowedFields.forEach(key => {
            req.gett_opts.fields[key] = 1;
        });
    }

    // Prevent the selection of an empty query
    req.gett_query = keyAdded ? q : false;
    next();
}

/**
 * Manages and de-duplicates MongoDB connections
 */
function connect (req) {
    let hash = md5(req.conf.connectionString);
    let hash2 = md5(req.conf.collection);
    let collection;

    // Attempt to retrieve a stashed collection or connection
    if (_statesman_connections[hash]) {
        if (_statesman_collections[hash+hash2]) {
            collection = _statesman_collections[hash+hash2];

        } else {
            let db = _statesman_connections[hash];
            collection = db.get(req.conf.collection);
        }

    } else {
        // Create our initial connection, if not stashed
        let db = monk(req.conf.connectionString);
        collection = db.get(req.conf.collection);

        db.on('timeout', () => {
            console.log('Mongo connection lost. Reconnecting..');
            db = monk(req.conf.connectionString);
            collection = db.get(req.conf.collection);
        });

        _statesman_collections[hash+hash2] = collection;
        _statesman_connections[hash] = db;
    }

    return collection;
}

/**
 * Get items from Mongo based on a pre-built query
 */
function getItems (req, res, next) {
    if (!req.gett_query || !req.conf.connectionString || !req.conf.collection) return next();

    try {
        let collection = connect(req);

        collection.find(req.gett_query, req.gett_opts).then(data => {
            req.gett_data = data;
            return next();

        }).catch(e => {
            console.log(e);
            return next();
        });

    } catch (e) { console.log(e); next() }
}


/**
 * Execute any modifyItem middleware on each item before returning a collection response
 */
function modifyItems (req, res, next) {
    if (req.gett_data && req.conf.modifyItem) {
        req.gett_data.forEach((item, index) => {
            req.gett_data[index] = req.conf.modifyItem(item, req);
        });
    }
    next();
}

/**
 * Returns a response, which contains a collection
 */
function returnItems (req, res, next) {
    if (!req.gett_data) return res.sendStatus(404);
    else res.json(req.gett_data);
}

/**
 * Require each item to have a unique key with moderately-high entropy, and generate one if not exists
 */
function requireKey (req, res, next) {
    function randomString (len) {
        return Math.random().toString(36).slice(2).substring(0, len || 10)
    }

    if (!req.conf.uniqueKey) return res.sendStatus(500);
    if (!req.body[req.conf.uniqueKey]) req.body[req.conf.uniqueKey] = randomString(8) + randomString(8);
    next();
}

/**
 * Gets the previous state of the object.
 * Before writing an object, states are merged (unless conf.overwrite = true). This gets the previous state.
 */
function getPreviousState (req, res, next) {
    if (!req.conf.uniqueKey || !req.conf.connectionString || !req.conf.collection) return next();

    let collection = connect(req);

    req.sett_query = {};

    req.sett_query[req.conf.uniqueKey] = req.body[req.conf.uniqueKey];

    collection.findOne(req.sett_query).then(data => {
        req.previousState = data || {};
        next();

    }).catch(e => {
        console.log(e);
        return next();
    })
}

/**
 * Execute any modifyStates middleware and
 * Merge the new object state with the previous object.
 */
function mergeStates (req, res, next) {
    if (!req.conf.modifyStates) req.conf.modifyStates = function (req, res, next) { next() };

    req.conf.modifyStates(req, res, () => {
        req.newState = req.body || {};
        // req.newState = JSON.parse(JSON.stringify(req.body));
        if (!req.conf.overwrite) req.newState = Object.assign(req.previousState || {}, req.newState);
        req.newState.updated = + new Date();
        next();
    });
}

/**
 * Execute any existing beforePersistUpdate middleware, and
 * Persist an updated item to Mongo.
 */
function persistUpdate (req, res, next) {
    if (!req.newState || !req.conf.connectionString || !req.conf.collection) return next();

    let collection = connect(req);

    req.sett_response = {}; // Final output object

    if (!req.beforePersistUpdate) req.beforePersistUpdate = function (req, res, next) { next() };

    req.beforePersistUpdate(req, res, () => {

        if (!req.sett_query) {
            if (!res.headersSent) res.sendStatus(500);
            return;
        }

        // Delete _id
        delete req.newState._id;

        // Write to Mongo
        collection.findOneAndUpdate(req.sett_query, { $set: req.newState }, { upsert: true }).then((updatedDoc) => {

            req.updatedDoc = updatedDoc;

            req.sett_response.value = req.body[req.conf.uniqueKey];
            req.sett_response.uniqueKey = req.conf.uniqueKey;
            req.sett_response.updated = true;

            if (!req.conf.after) req.conf.after = function (req, res, next) { next() };

            req.conf.after(req, res, () => {
                if (!res.headersSent) res.json(req.sett_response);
            });

        }).catch(e => {
            console.log(e);
            return next();
        });
    });
}

// Todo: remove notes

// Read method
// * What can be queried / searched? (key, owner, id, organization, etc.)
// * Method which modifies each item before it's returned
// * Return the item / items

/**
 * Exportable Pluggable Getter
 */
function gett (conf) {
    return function (req, res, next) {
        if (!conf.beforeQuery) conf.beforeQuery = function (req, res, next) { next() };
        req.conf = conf || {};

        conf.beforeQuery(req, res, () => {
            makeQuery(req, res, () => { getItems(req, res, () => { modifyItems(req, res, () => { returnItems(req, res, next) }) }) });
        });
    }
}

// Todo: remove notes

// Write method
//
// * Define a uniqueKey field
// * If this field is not included it is created
// * If the object already exists we merge or overwrite
// * requiredFields must be included
// * validate() must return true
// * modifyStates() modifies incoming/existing data & handles merge conflicts
// * overwrite or merge objects (overwrite option)
//
// State has to be fresh. A ts is stored when state is updated/modified.
// Expect that it will expire and be purged.


/**
 * Exportable Pluggable Setter
 */
function sett (conf) {
    return function (req, res, next) {
        if (!conf.beforeQuery) conf.beforeQuery = function (req, res, next) { next() };
        req.conf = Object.assign(req.conf || {}, conf || {});

        conf.beforeQuery(req, res, () => {

            if (conf.requiredFields) conf.requiredFields.forEach(key => { if (!req.body[key]) return res.sendStatus(500) });
            if (conf.forbiddenFields) conf.forbiddenFields.forEach(key => { delete req.body[key] });
            if (conf.validate && !conf.validate(req, res)) return res.sendStatus(500);

            requireKey(req, res, () => { getPreviousState(req, res, () => { mergeStates(req, res, () => { persistUpdate(req, res, next) }) }) });

        });
    }
}



module.exports = {
    b2Plugin: b2Plugin,
    gett: gett,
    sett: sett
};
