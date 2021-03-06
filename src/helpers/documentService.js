const configServer = require('config').get('server');
const jwt = require('jsonwebtoken');
const urlModule = require('url');
const urllib = require('urllib');

const fileUtility = require('./fileUtility');
const guidManager = require('./guidManager');

const siteUrl = process.env.SITE_URL || configServer.get('siteUrl');
const cfgSignatureEnable = configServer.get('token.enable');
const cfgSignatureUseForRequest = configServer.get('token.useforrequest');
const cfgSignatureAuthorizationHeader = configServer.get('token.authorizationHeader');
const cfgSignatureAuthorizationHeaderPrefix = configServer.get('token.authorizationHeaderPrefix');
const cfgSignatureSecretExpiresIn = configServer.get('token.expiresIn');
const cfgSignatureSecret = configServer.get('token.secret');
const cfgSignatureSecretAlgorithmRequest = configServer.get('token.algorithmRequest');

const documentService = {};

documentService.userIp = null;

documentService.getConvertedUriSync = function (documentUri, fromExtension, toExtension, documentRevisionId, callback) {
	documentService.getConvertedUri(documentUri, fromExtension, toExtension, documentRevisionId, false, (err, data) => {
		if (err) {
			callback();

			return;
		}

		const res = documentService.getResponseUri(data);
		callback(res.value);
	});
};

documentService.getConvertedUri = function (documentUri, fromExtension, toExtension, documentRevisionId, async, callback) {
	fromExtension = fromExtension || fileUtility.getFileExtension(documentUri);

	const title = fileUtility.getFileName(documentUri) || guidManager.newGuid();

	documentRevisionId = documentService.generateRevisionId(documentRevisionId || documentUri);

	const params = {
		async,
		url: documentUri,
		outputtype: toExtension.replace('.', ''),
		filetype: fromExtension.replace('.', ''),
		title,
		key: documentRevisionId,
	};

	const uri = siteUrl + configServer.get('converterUrl');

	const headers = {
		'Content-Type': 'application/json',
		'Accept': 'application/json',
	};

	if (cfgSignatureEnable && cfgSignatureUseForRequest) {
		headers[cfgSignatureAuthorizationHeader] = cfgSignatureAuthorizationHeaderPrefix + this.fillJwtByUrl(uri, params);
		params.token = documentService.getToken(params);
	}

	urllib.request(
		uri,
		{
			method: 'POST',
			headers,
			data: params,
		},
		callback,
	);
};

documentService.generateRevisionId = function (expectedKey) {
	const maxKeyLength = 128;

	if (expectedKey.length > maxKeyLength) {
		expectedKey = expectedKey.hashCode().toString();
	}

	const key = expectedKey.replace(new RegExp('[^0-9-.a-zA-Z_=]', 'g'), '_');

	return key.substring(0, Math.min(key.length, maxKeyLength));
};

documentService.processConvertServiceResponceError = function (errorCode) {
	let errorMessage = '';
	const errorMessageTemplate = 'Error occurred in the ConvertService: ';

	switch (errorCode) {
		case -20:
			errorMessage = `${errorMessageTemplate}Error encrypt signature`;

			break;
		case -8:
			errorMessage = `${errorMessageTemplate}Error document signature`;

			break;
		case -7:
			errorMessage = `${errorMessageTemplate}Error document request`;

			break;
		case -6:
			errorMessage = `${errorMessageTemplate}Error database`;

			break;
		case -5:
			errorMessage = `${errorMessageTemplate}Error unexpected guid`;

			break;
		case -4:
			errorMessage = `${errorMessageTemplate}Error download error`;

			break;
		case -3:
			errorMessage = `${errorMessageTemplate}Error convertation error`;

			break;
		case -2:
			errorMessage = `${errorMessageTemplate}Error convertation timeout`;

			break;
		case -1:
			errorMessage = `${errorMessageTemplate}Error convertation unknown`;

			break;
		case 0:
			break;
		default:
			errorMessage = `ErrorCode = ${errorCode}`;

			break;
	}

	throw { message: errorMessage };
};

documentService.getResponseUri = function (json) {
	const fileResult = JSON.parse(json);

	if (fileResult.error) {
		documentService.processConvertServiceResponceError(+fileResult.error);
	}

	const isEndConvert = fileResult.endConvert;

	let percent = +fileResult.percent;
	let uri = null;

	if (isEndConvert) {
		if (!fileResult.fileUrl) {
			throw { message: 'FileUrl is null' };
		}

		uri = fileResult.fileUrl;
		percent = 100;
	} else {
		percent = percent >= 100 ? 99 : percent;
	}

	return {
		key: percent,
		value: uri,
	};
};

documentService.commandRequest = function (method, documentRevisionId, callback) {
	documentRevisionId = documentService.generateRevisionId(documentRevisionId);

	const params = {
		c: method,
		key: documentRevisionId,
	};

	const uri = siteUrl + configServer.get('commandUrl');

	const headers = {
		'Content-Type': 'application/json',
	};

	if (cfgSignatureEnable && cfgSignatureUseForRequest) {
		headers[cfgSignatureAuthorizationHeader] = cfgSignatureAuthorizationHeaderPrefix + this.fillJwtByUrl(uri, params);
		params.token = documentService.getToken(params);
	}

	urllib.request(
		uri,
		{
			method: 'POST',
			headers,
			data: params,
		},
		callback,
	);
};

documentService.checkJwtHeader = function (req) {
	let decoded = null;
	const authorization = req.get(cfgSignatureAuthorizationHeader);

	if (authorization && authorization.startsWith(cfgSignatureAuthorizationHeaderPrefix)) {
		const token = authorization.substring(cfgSignatureAuthorizationHeaderPrefix.length);

		try {
			decoded = jwt.verify(token, cfgSignatureSecret);
		} catch (err) {
			console.log(`checkJwtHeader error: name = ${err.name} message = ${err.message} token = ${token}`);
		}
	}

	return decoded;
};

documentService.fillJwtByUrl = function (uri, optDataObject, optIss, optPayloadhash) {
	const parseObject = urlModule.parse(uri, true);
	const payload = { query: parseObject.query, payload: optDataObject, payloadhash: optPayloadhash };

	const options = { algorithm: cfgSignatureSecretAlgorithmRequest, expiresIn: cfgSignatureSecretExpiresIn, issuer: optIss };

	return jwt.sign(payload, cfgSignatureSecret, options);
};

documentService.getToken = function (data) {
	const options = { algorithm: cfgSignatureSecretAlgorithmRequest, expiresIn: cfgSignatureSecretExpiresIn };

	return jwt.sign(data, cfgSignatureSecret, options);
};

documentService.readToken = function (token) {
	try {
		return jwt.verify(token, cfgSignatureSecret);
	} catch (err) {
		console.log(`checkJwtHeader error: name = ${err.name} message = ${err.message} token = ${token}`);
	}

	return null;
};

module.exports = documentService;
