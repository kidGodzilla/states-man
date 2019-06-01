# Statesman

![Statesman](statesman.jpg?raw=true "Statesman")

Statesman lets you create pluggable getters and setters that correspond directly to your Express routes. Although it is opinionated about how state should be managed, this allows it to remove a lot of boilerplate.

Include it in your express project, to simplify document storage and retrieval, with limited security, cache, and persistence built-in.


## Features

1. Statesman primarily exists to get and store application state on a server, via MongoDB, in document format. This works great for configuration files, application state, etc.
2. Optionally, you can persist documents to a static CDN (for scenarios that are read-heavy).
3. Statesman doesn't aim to be an ORM. It trades flexibility for ease-of-use for a specific use-case.

State should be private by default, with limited ability to search or query data. Not appropriate for anything which requires document search. Collection filters should be whitelisted to allow document retrieval in a safe way.

Secret keys can be used to read/write data in the data store. These can be marked as hidden fields, and will never be exposed to your end-user. Then, they can become your collection query (for example, you could create a unique key for a specific user, give that key to the user, and allow them to query for all of their collection items, without a slow authentication step on each request).


## Installation

```
npm i -s states-man
```

(remember the dash!)

## Usage

### Include Statesman in your project

```
const { gett, sett } = require('states-man');
```

### Creating a simple setter

This example takes an object (in `req.body`), and adds or updates the corresponding object in the Mongo collection `states`. The unique key is `id` and will be auto-generated if not included.

```
app.post('/', sett({
    connectionString: 'mongodb://your-connection-string',
    collection: 'states',
    uniqueKey: 'id'
}));
```

A request to this endpoint returns:

```
{
    uniqueKey: "id",
    value: "j4t09j34klj3lkjsdsdf",
    updated: true,
}
```

Value is auto-generated if it doesn't already exist. A document is stored in the `states` collection with `id` = `j4t09j34klj3lkjsdsdf`, which you can later use to find your state document (next example).


### Creating a simple Getter

This example lets you query the states collection by `id`, `key`, `email`, and `domain`. 

Example: `http://localhost:3000/?id=j4t09j34klj3lkjsdsdf` or `http://localhost:3000/?domain=example.com&email=foo@example.com`

```
app.get('/', gett({
    connectionString: 'mongodb://your-connection-string',
    collection: 'states',
    filters: ['id', 'key', 'email', 'domain']
}));
```

## Advanced usage

### A full-featured setter

```
app.post('/', sett({
    connectionString: 'mongodb://your-connection-string',
    collection: 'states',
    uniqueKey: 'id',
    requiredFields: ['userKey'],
    forbiddenFields: ['_id'],
    overwrite: false,
    beforeQuery: function (req, res, next) { next() },
    validate: function (req, res) { return true },
    modifyStates: function (req, res, next) {
        req.body.ts = + new Date(); // Add a timestamp
        next()
    }
}));
```

### A full-featured getter

```
app.get('/', gett({
    connectionString: 'mongodb://your-connection-string',
    collection: 'states',
    filters: ['id', 'key', 'email', 'domain'],
    hiddenFields: ['_id'],
    allowedFields: ['id', 'key', 'email', 'domain', 'name', 'title', 'value'],
    beforeQuery: function (req, res, next) {
        if (!req.query.allData) req.conf.hiddenFields.push('analytics', 'uptime');
        next();
    },
    modifyItem: function (item, req) {
        item.requestTimestamp = + new Date();
        return item;
    }
}));
```


## Todos

 * Protect _id by default (forbiddenFields should include _id by default)
 * Throw an error if you attempt to use _id as your unique key
 * Document advanced usage
 
 
 
