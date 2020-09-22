'use strict';

const bodyParser = require('body-parser');
const config = require('config');
const express = require('express');
const formidable = require('formidable');
const fileSystem = require('fs');
const jwt = require('jsonwebtoken');
const mime = require('mime');
const path = require('path');
const favicon = require('serve-favicon');
const syncRequest = require('sync-request');
const configServer = config.get('server');

const docManager = require('./helpers/docManager');
const documentService = require('./helpers/documentService');
const fileUtility = require('./helpers/fileUtility');
const siteUrl = process.env.SITE_URL || configServer.get('siteUrl');
const fileChoiceUrl = configServer.has('fileChoiceUrl') ? configServer.get('fileChoiceUrl') : '';
const plugins = config.get('plugins');
const cfgSignatureEnable = configServer.get('token.enable');
const cfgSignatureUseForRequest = configServer.get('token.useforrequest');
const cfgSignatureSecretExpiresIn = configServer.get('token.expiresIn');
const cfgSignatureSecret = configServer.get('token.secret');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// eslint-disable-next-line no-extend-native
String.prototype.hashCode = function () {
	const len = this.length;
	let ret = 0;

	for (let i = 0; i < len; i++) {
		ret = ((31 * ret) + this.charCodeAt(i)) << 0;
	}

	return ret;
};

// eslint-disable-next-line no-extend-native
String.prototype.format = function (...args) {
	let text = this.toString();

	if (!args.length) return text;

	for (let i = 0; i < args.length; i++) {
		text = text.replace(new RegExp(`\\{${i}\\}`, 'gi'), args[i]);
	}

	return text;
};

const app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	next();
});

app.use(express.static(path.join(__dirname, 'public')));

if (config.has('server.static')) {
	const staticContent = config.get('server.static');

	for (let i = 0; i < staticContent.length; ++i) {
		const staticContentElem = staticContent[i];
		app.use(staticContentElem.name, express.static(staticContentElem.path, staticContentElem.options));
	}
}

app.use(favicon(`${__dirname}/public/images/favicon.ico`));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
	try {
		docManager.init(__dirname, req, res);

		res.render('index', {
			preloaderUrl: siteUrl + configServer.get('preloaderUrl'),
			convertExts: configServer.get('convertedDocs').join(','),
			editedExts: configServer.get('editedDocs').join(','),
			storedFiles: docManager.getStoredFiles(),
			params: docManager.getCustomParams(),
		});
	} catch (ex) {
		console.log(ex);
		res.status(500);
		res.render('error', { message: 'Server error' });

		return;
	}
});

app.get('/download', (req, res) => {
	docManager.init(__dirname, req, res);

	const fileName = fileUtility.getFileName(req.query.fileName);

	const userAddress = docManager.curUserHostAddress();

	let path = docManager.forcesavePath(fileName, userAddress, false);

	if (path === '') {
		path = docManager.storagePath(fileName, userAddress);
	}

	res.setHeader('Content-Length', fileSystem.statSync(path).size);
	res.setHeader('Content-Type', mime.lookup(path));

	res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

	const filestream = fileSystem.createReadStream(path);
	filestream.pipe(res);
});

app.post('/upload', (req, res) => {
	docManager.init(__dirname, req, res);
	docManager.storagePath(''); // mkdir if not exist

	const userIp = docManager.curUserHostAddress();
	const uploadDir = path.join('./public', configServer.get('storageFolder'), userIp);
	const uploadDirTmp = path.join(uploadDir, 'tmp');
	docManager.createDirectory(uploadDirTmp);

	const form = new formidable.IncomingForm();
	form.uploadDir = uploadDirTmp;
	form.keepExtensions = true;
	form.maxFileSize = configServer.get('maxFileSize');

	form.parse(req, (err, fields, files) => {
		if (err) {
			docManager.cleanFolderRecursive(uploadDirTmp, true);
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.write(`{ "error": "${err.message}"}`);
			res.end();

			return;
		}

		const file = files.uploadedFile;

		if (file === undefined) {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.write('{ "error": "Uploaded file not found"}');
			res.end();

			return;
		}

		file.name = docManager.getCorrectName(file.name);

		if (configServer.get('maxFileSize') < file.size || file.size <= 0) {
			docManager.cleanFolderRecursive(uploadDirTmp, true);
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.write('{ "error": "File size is incorrect"}');
			res.end();

			return;
		}

		const exts = [].concat(configServer.get('viewedDocs'), configServer.get('editedDocs'), configServer.get('convertedDocs'));
		const curExt = fileUtility.getFileExtension(file.name);

		if (exts.indexOf(curExt) === -1) {
			docManager.cleanFolderRecursive(uploadDirTmp, true);
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.write('{ "error": "File type is not supported"}');
			res.end();

			return;
		}

		fileSystem.rename(file.path, `${uploadDir}/${file.name}`, (err) => {
			docManager.cleanFolderRecursive(uploadDirTmp, true);
			res.writeHead(200, { 'Content-Type': 'text/plain' });

			if (err) {
				res.write(`{ "error": "${err}"}`);
			} else {
				res.write(`{ "filename": "${file.name}"}`);

				const userid = req.query.userid ? req.query.userid : 'uid-1';
				const name = req.query.name ? req.query.name : 'Кравченко Иван';

				docManager.saveFileData(file.name, userid, name);
			}

			res.end();
		});
	});
});

app.get('/convert', (req, res) => {
	const fileName = fileUtility.getFileName(req.query.filename);

	const fileUri = docManager.getFileUri(fileName);
	const fileExt = fileUtility.getFileExtension(fileName);
	const fileType = fileUtility.getFileType(fileName);
	const internalFileExt = docManager.getInternalExtension(fileType);
	const response = res;

	const writeResult = function (filename, step, error) {
		const result = {};

		if (filename) {
			result.filename = filename;
		}

		if (step) {
			result.step = step;
		}

		if (error) {
			result.error = error;
		}

		response.setHeader('Content-Type', 'application/json');
		response.write(JSON.stringify(result));
		response.end();
	};

	const callback = function (err, data) {
		if (err) {
			if (err.name === 'ConnectionTimeoutError' || err.name === 'ResponseTimeoutError') {
				writeResult(fileName, 0, null);
			} else {
				writeResult(null, null, JSON.stringify(err));
			}

			return;
		}

		try {
			const responseUri = documentService.getResponseUri(data.toString());
			const result = responseUri.key;
			const newFileUri = responseUri.value;

			if (result !== 100) {
				writeResult(fileName, result, null);

				return;
			}

			const correctName = docManager.getCorrectName(fileUtility.getFileName(fileName, true) + internalFileExt);

			const file = syncRequest('GET', newFileUri);
			fileSystem.writeFileSync(docManager.storagePath(correctName), file.getBody());

			fileSystem.unlinkSync(docManager.storagePath(fileName));

			const userAddress = docManager.curUserHostAddress();

			const historyPath = docManager.historyPath(fileName, userAddress, true);
			const correctHistoryPath = docManager.historyPath(correctName, userAddress, true);

			fileSystem.renameSync(historyPath, correctHistoryPath);

			fileSystem.renameSync(path.join(correctHistoryPath, `${fileName}.txt`), path.join(correctHistoryPath, `${correctName}.txt`));

			writeResult(correctName, result, null);
		} catch (e) {
			console.log(e);
			writeResult(null, null, 'Server error');
		}
	};

	try {
		if (configServer.get('convertedDocs').indexOf(fileExt) > -1) {
			const storagePath = docManager.storagePath(fileName);
			const stat = fileSystem.statSync(storagePath);
			let key = fileUri + stat.mtime.getTime();

			key = documentService.generateRevisionId(key);
			documentService.getConvertedUri(fileUri, fileExt, internalFileExt, key, true, callback);
		} else {
			writeResult(fileName, null, null);
		}
	} catch (ex) {
		console.log(ex);
		writeResult(null, null, 'Server error');
	}
});

app.delete('/file', (req, res) => {
	try {
		docManager.init(__dirname, req, res);

		let fileName = req.query.filename;

		if (fileName) {
			fileName = fileUtility.getFileName(fileName);

			const filePath = docManager.storagePath(fileName);
			fileSystem.unlinkSync(filePath);

			const userAddress = docManager.curUserHostAddress();
			const historyPath = docManager.historyPath(fileName, userAddress, true);
			docManager.cleanFolderRecursive(historyPath, true);
		} else {
			docManager.cleanFolderRecursive(docManager.storagePath(''), false);
		}

		res.write('{"success":true}');
	} catch (ex) {
		console.log(ex);
		res.write('Server error');
	}

	res.end();
});

app.post('/track', (req, res) => {
	docManager.init(__dirname, req, res);

	let userAddress = req.query.useraddress;

	let fileName = fileUtility.getFileName(req.query.filename);
	let version = 0;

	function processTrack(response, body, fileName, userAddress) {
		function processSave(downloadUri, body, fileName, userAddress, resp) {
			const curExt = fileUtility.getFileExtension(fileName);
			const downloadExt = fileUtility.getFileExtension(downloadUri);

			if (downloadExt !== curExt) {
				const key = documentService.generateRevisionId(downloadUri);

				try {
					documentService.getConvertedUriSync(downloadUri, downloadExt, curExt, key, (dUri) => {
						processSave(dUri, body, fileName, userAddress, resp);
					});

					return;
				} catch (ex) {
					console.log(ex);
					fileName = docManager.getCorrectName(fileUtility.getFileName(fileName, true) + downloadExt, userAddress);
				}
			}

			try {
				const path = docManager.storagePath(fileName, userAddress);

				if (docManager.existsSync(path)) {
					let historyPath = docManager.historyPath(fileName, userAddress);

					if (historyPath === '') {
						historyPath = docManager.historyPath(fileName, userAddress, true);
						docManager.createDirectory(historyPath);
					}

					const countVersion = docManager.countVersion(historyPath);
					version = countVersion + 1;

					const versionPath = docManager.versionPath(fileName, userAddress, version);
					docManager.createDirectory(versionPath);

					const downloadZip = body.changesurl;

					if (downloadZip) {
						const pathChanges = docManager.diffPath(fileName, userAddress, version);
						const diffZip = syncRequest('GET', downloadZip);
						fileSystem.writeFileSync(pathChanges, diffZip.getBody());
					}

					const changeshistory = body.changeshistory || JSON.stringify(body.history);

					if (changeshistory) {
						const pathChangesJson = docManager.changesPath(fileName, userAddress, version);
						fileSystem.writeFileSync(pathChangesJson, changeshistory);
					}

					const pathKey = docManager.keyPath(fileName, userAddress, version);
					fileSystem.writeFileSync(pathKey, body.key);

					const pathPrev = docManager.prevFilePath(fileName, userAddress, version);
					fileSystem.writeFileSync(pathPrev, fileSystem.readFileSync(path));

					const file = syncRequest('GET', downloadUri);
					fileSystem.writeFileSync(path, file.getBody());

					const forcesavePath = docManager.forcesavePath(fileName, userAddress, false);

					if (forcesavePath !== '') {
						fileSystem.unlinkSync(forcesavePath);
					}
				}
			} catch (ex) {
				console.log(ex);
			}

			response.write('{"error":0}');
			response.end();
		}

		function processForceSave(downloadUri, body, fileName, userAddress, resp) {
			const curExt = fileUtility.getFileExtension(fileName);
			const downloadExt = fileUtility.getFileExtension(downloadUri);

			if (downloadExt !== curExt) {
				const key = documentService.generateRevisionId(downloadUri);

				try {
					documentService.getConvertedUriSync(downloadUri, downloadExt, curExt, key, (dUri) => {
						processForceSave(dUri, body, fileName, userAddress, resp);
					});

					return;
				} catch (ex) {
					console.log(ex);
					fileName = docManager.getCorrectName(fileUtility.getFileName(fileName, true) + downloadExt, userAddress);
				}
			}

			try {
				// const path = docManager.storagePath(fileName, userAddress);

				let forcesavePath = docManager.forcesavePath(fileName, userAddress, false);

				if (!forcesavePath) {
					forcesavePath = docManager.forcesavePath(fileName, userAddress, true);
				}

				const file = syncRequest('GET', downloadUri);
				fileSystem.writeFileSync(forcesavePath, file.getBody());
			} catch (ex) {
				console.log(ex);
			}

			response.write('{"error":0}');
			response.end();
		}

		if (body.status === 1) { // Editing
			if (body.actions && body.actions[0].type === 0) { // finished edit
				const user = body.actions[0].userid;

				if (body.users.indexOf(user) === -1) {
					const key = body.key;

					try {
						documentService.commandRequest('forcesave', key);
					} catch (ex) {
						console.log(ex);
					}
				}
			}
		} else if (body.status === 2 || body.status === 3) { // MustSave, Corrupted
			processSave(body.url, body, fileName, userAddress, response);

			return;
		} else if (body.status === 6 || body.status === 7) { // MustForceSave, CorruptedForceSave
			processForceSave(body.url, body, fileName, userAddress, response);

			return;
		}

		response.write('{"error":0}');
		response.end();
	}

	const readbody = function (request, response, fileName, userAddress) {
		let content = '';
		request.on('data', (data) => {
			content += data;
		});
		request.on('end', () => {
			const body = JSON.parse(content);
			processTrack(response, body, fileName, userAddress);
		});
	};

	// checkjwt
	if (cfgSignatureEnable && cfgSignatureUseForRequest) {
		let body = null;

		if ('token' in req.body) {
			body = documentService.readToken(req.body.token);
		} else {
			const checkJwtHeaderRes = documentService.checkJwtHeader(req);

			if (checkJwtHeaderRes) {
				if (checkJwtHeaderRes.payload) {
					body = checkJwtHeaderRes.payload;
				}

				if (checkJwtHeaderRes.query) {
					if (checkJwtHeaderRes.query.useraddress) {
						userAddress = checkJwtHeaderRes.query.useraddress;
					}

					if (checkJwtHeaderRes.query.filename) {
						fileName = fileUtility.getFileName(checkJwtHeaderRes.query.filename);
					}
				}
			}
		}

		if (body === null) {
			res.write('{"error":1}');
			res.end();

			return;
		}

		processTrack(res, body, fileName, userAddress);

		return;
	}

	if ('status' in req.body) {
		processTrack(res, req.body, fileName, userAddress);
	} else {
		readbody(req, res, fileName, userAddress);
	}
});

app.get('/editor', (req, res) => {
	try {
		docManager.init(__dirname, req, res);

		const fileExt = req.query.fileExt;

		const history = [];
		const historyData = [];
		const lang = docManager.getLang();
		const userid = req.query.userid ? req.query.userid : 'uid-1';
		const name = req.query.name ? req.query.name : 'Кравченко Иван';

		if (fileExt) {
			const fileName = docManager.createDemo((req.query.sample ? 'sample.' : 'new.') + fileExt, userid, name);

			const redirectPath = `${docManager.getServerUrl()}/editor?fileName=${encodeURIComponent(fileName)}${docManager.getCustomParams()}`;
			res.redirect(redirectPath);

			return;
		}

		const userAddress = docManager.curUserHostAddress();
		const fileName = fileUtility.getFileName(req.query.fileName);

		if (!docManager.existsSync(docManager.storagePath(fileName, userAddress))) {
			throw { message: `File not found: ${fileName}` };
		}

		const key = docManager.getKey(fileName);

		const url = docManager.getFileUri(fileName);
		const mode = req.query.mode || 'edit'; // mode: view/edit/review/comment/fillForms/embedded
		let type = req.query.type || ''; // type: embedded/mobile/desktop

		if (type === '') {
			type = new RegExp(configServer.get('mobileRegEx'), 'i').test(req.get('User-Agent')) ? 'mobile' : 'desktop';
		}

		const canEdit = configServer.get('editedDocs').indexOf(fileUtility.getFileExtension(fileName)) !== -1;

		let countVersion = 1;

		const historyPath = docManager.historyPath(fileName, userAddress);

		let changes = null;
		let keyVersion = key;

		if (historyPath) {
			countVersion = docManager.countVersion(historyPath) + 1;

			for (let i = 1; i <= countVersion; i++) {
				if (i < countVersion) {
					const keyPath = docManager.keyPath(fileName, userAddress, i);
					keyVersion = `${fileSystem.readFileSync(keyPath)}`;
				} else {
					keyVersion = key;
				}

				history.push(docManager.getHistory(fileName, changes, keyVersion, i));

				const historyD = {
					version: i,
					key: keyVersion,
					url: i === countVersion ? url : (`${docManager.getlocalFileUri(fileName, i, true)}/prev${fileUtility.getFileExtension(fileName)}`),
				};

				if (i > 1 && docManager.existsSync(docManager.diffPath(fileName, userAddress, i - 1))) {
					historyD.previous = {
						key: historyData[i - 2].key,
						url: historyData[i - 2].url,
					};
					historyD.changesUrl = `${docManager.getlocalFileUri(fileName, i - 1)}/diff.zip`;
				}

				historyData.push(historyD);

				if (i < countVersion) {
					const changesFile = docManager.changesPath(fileName, userAddress, i);
					changes = docManager.getChanges(changesFile);
				}
			}
		} else {
			history.push(docManager.getHistory(fileName, changes, keyVersion, countVersion));
			historyData.push({
				version: countVersion,
				key,
				url,
			});
		}

		if (cfgSignatureEnable) {
			for (let i = 0; i < historyData.length; i++) {
				historyData[i].token = jwt.sign(historyData[i], cfgSignatureSecret, { expiresIn: cfgSignatureSecretExpiresIn });
			}
		}

		const argss = {
			apiUrl: siteUrl + configServer.get('apiUrl'),
			file: {
				name: fileName,
				ext: fileUtility.getFileExtension(fileName, true),
				uri: url,
				version: countVersion,
				created: new Date().toDateString(),
			},
			editor: {
				type,
				documentType: fileUtility.getFileType(fileName),
				key,
				token: '',
				callbackUrl: docManager.getCallback(fileName),
				isEdit: canEdit && (mode === 'edit' || mode === 'filter' || mode === 'blockcontent'),
				review: mode === 'edit' || mode === 'review',
				comment: mode !== 'view' && mode !== 'fillForms' && mode !== 'embedded' && mode !== 'blockcontent',
				fillForms: mode !== 'view' && mode !== 'comment' && mode !== 'embedded' && mode !== 'blockcontent',
				modifyFilter: mode !== 'filter',
				modifyContentControl: mode !== 'blockcontent',
				mode: canEdit && mode !== 'view' ? 'edit' : 'view',
				canBackToFolder: type !== 'embedded',
				backUrl: `${docManager.getServerUrl()}/`,
				curUserHostAddress: docManager.curUserHostAddress(),
				lang,
				userid,
				name,
				fileChoiceUrl,
				plugins: JSON.stringify(plugins),
			},
			history,
			historyData,
		};

		if (cfgSignatureEnable) {
			app.render('config', argss, (err, html) => {
				if (err) {
					console.log(err);
				} else {
					argss.editor.token = jwt.sign(JSON.parse(`{${html}}`), cfgSignatureSecret, { expiresIn: cfgSignatureSecretExpiresIn });
				}

				res.render('editor', argss);
			});
		} else {
			res.render('editor', argss);
		}
	} catch (ex) {
		console.log(ex);
		res.status(500);
		res.render('error', { message: 'Server error' });
	}
});

app.use((req, res, next) => {
	const err = new Error('Not Found');
	err.status = 404;
	next(err);
});

app.use((err, req, res, next) => {
	res.status(err.status || 500);
	res.render('error', {
		message: err.message,
	});
});

module.exports = app;
