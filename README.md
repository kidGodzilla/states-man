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

`npm i -s states-man` 
(remember the dash!)

## Usage



