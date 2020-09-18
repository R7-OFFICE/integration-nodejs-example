'use strict';

const config = require('config');

const app = require('./app');

app.set('port', process.env.PORT || config.get('server.port') || 3000);
app.set('host', process.env.HOST || config.get('server.host') || '0.0.0.0');

const server = app.listen(app.get('port'), app.get('host'), () => {
	const { address, port } = server.address();
	console.info(`Express server listening on port http://${address}:${port}/`);
});
