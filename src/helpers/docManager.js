'use strict';

const configServer = require('config').get('server');
const fileSystem = require('fs');
const path = require('path');

const documentService = require('./documentService');
const fileUtility = require('./fileUtility');

const storageFolder = configServer.get('storageFolder');

const docManager = {};

docManager.dir = null;
docManager.req = null;
docManager.res = null;

docManager.existsSync = function (path) {
	let res = true;

	try {
		fileSystem.accessSync(path, fileSystem.F_OK);
	} catch (e) {
		res = false;
	}

	return res;
};

docManager.createDirectory = function (path) {
	if (!this.existsSync(path)) {
		fileSystem.mkdirSync(path);
	}
};

docManager.init = function (dir, req, res) {
	docManager.dir = dir;
	docManager.req = req;
	docManager.res = res;

	this.createDirectory(path.join(docManager.dir, 'public', storageFolder));
};

docManager.getLang = function () {
	if (docManager.req.query.lang) {
		return docManager.req.query.lang;
	} else {
		return 'ru';
	}
};

docManager.getCustomParams = function () {
	let params = '';

	const userid = docManager.req.query.userid;
	params += (userid ? `&userid=${userid}` : '');

	const name = docManager.req.query.name;
	params += (name ? `&name=${name}` : '');

	const lang = docManager.req.query.lang;
	params += (lang ? `&lang=${docManager.getLang()}` : '');

	const fileName = docManager.req.query.fileName;
	params += (fileName ? `&fileName=${fileName}` : '');

	const mode = docManager.req.query.mode;
	params += (mode ? `&mode=${mode}` : '');

	const type = docManager.req.query.type;
	params += (type ? `&type=${type}` : '');

	return params;
};

docManager.getCorrectName = function (fileName, userAddress) {
	const baseName = fileUtility.getFileName(fileName, true);
	const ext = fileUtility.getFileExtension(fileName);
	let name = baseName + ext;
	let index = 1;

	while (this.existsSync(docManager.storagePath(name, userAddress))) {
		name = `${baseName} (${index})${ext}`;
		index++;
	}

	return name;
};

docManager.createDemo = function (demoName, userid, username) {
	const fileName = docManager.getCorrectName(demoName);

	docManager.copyFile(path.join(docManager.dir, 'public', 'samples', demoName), docManager.storagePath(fileName));

	docManager.saveFileData(fileName, userid, username);

	return fileName;
};

docManager.saveFileData = function (fileName, userid, username) {
	const userAddress = docManager.curUserHostAddress();
	const dateCreate = fileSystem.statSync(docManager.storagePath(fileName)).mtime;
	const minutes = (dateCreate.getMinutes() < 10 ? '0' : '') + dateCreate.getMinutes().toString();
	const month = (dateCreate.getMonth() < 10 ? '0' : '') + (+dateCreate.getMonth().toString() + 1);
	const sec = (dateCreate.getSeconds() < 10 ? '0' : '') + dateCreate.getSeconds().toString();
	const dateFormat = `${dateCreate.getFullYear()}-${month}-${dateCreate.getDate()} ${dateCreate.getHours()}:${minutes}:${sec}`;

	const fileInfo = docManager.historyPath(fileName, userAddress, true);
	this.createDirectory(fileInfo);

	fileSystem.writeFileSync(path.join(fileInfo, `${fileName}.txt`), `${dateFormat},${userid},${username}`);
};

docManager.getFileData = function (fileName, userAddress) {
	const history = path.join(docManager.historyPath(fileName, userAddress, true), `${fileName}.txt`);

	if (!this.existsSync(history)) {
		return ['2017-01-01', 'uid-1', 'Кравченко Иван'];
	}

	return ((fileSystem.readFileSync(history)).toString())
		.split(',');
};

docManager.getFileUri = function (fileName) {
	return docManager.getlocalFileUri(fileName, 0, true);
};

docManager.getlocalFileUri = function (fileName, version, forDocumentServer) {
	const serverPath = docManager.getServerUrl(forDocumentServer);
	const storagePath = storageFolder.length ? `${storageFolder}/` : '';
	const hostAddress = docManager.curUserHostAddress();
	const url = `${serverPath}/${storagePath}${hostAddress}/${encodeURIComponent(fileName)}`;

	if (!version) {
		return url;
	}

	return `${url}-history/${version}`;
};

docManager.getServerUrl = function (forDocumentServer) {
	return (forDocumentServer && !!configServer.get('exampleUrl')) ? configServer.get('exampleUrl') : (`${docManager.getProtocol()}://${docManager.req.get('host')}`);
};

docManager.getCallback = function (fileName) {
	const server = docManager.getServerUrl(true);
	const hostAddress = docManager.curUserHostAddress();
	const handler = `/track?filename=${encodeURIComponent(fileName)}&useraddress=${encodeURIComponent(hostAddress)}`;

	return server + handler;
};

docManager.storagePath = function (fileName, userAddress) {
	fileName = fileUtility.getFileName(fileName);

	const directory = path.join(docManager.dir, 'public', storageFolder, docManager.curUserHostAddress(userAddress));
	this.createDirectory(directory);

	return path.join(directory, fileName);
};

docManager.forcesavePath = function (fileName, userAddress, create) {
	let directory = path.join(docManager.dir, 'public', storageFolder, docManager.curUserHostAddress(userAddress));

	if (!this.existsSync(directory)) {
		return '';
	}

	directory = path.join(directory, `${fileName}-history`);

	if (!create && !this.existsSync(directory)) {
		return '';
	}

	this.createDirectory(directory);
	directory = path.join(directory, fileName);

	if (!create && !this.existsSync(directory)) {
		return '';
	}

	return directory;
};

docManager.historyPath = function (fileName, userAddress, create) {
	let directory = path.join(docManager.dir, 'public', storageFolder, docManager.curUserHostAddress(userAddress));

	if (!this.existsSync(directory)) {
		return '';
	}

	directory = path.join(directory, `${fileName}-history`);

	if (!create && !this.existsSync(path.join(directory, '1'))) {
		return '';
	}

	return directory;
};

docManager.versionPath = function (fileName, userAddress, version) {
	const historyPath = docManager.historyPath(fileName, userAddress, true);

	return path.join(historyPath, `${version}`);
};

docManager.prevFilePath = function (fileName, userAddress, version) {
	return path.join(docManager.versionPath(fileName, userAddress, version), `prev${fileUtility.getFileExtension(fileName)}`);
};

docManager.diffPath = function (fileName, userAddress, version) {
	return path.join(docManager.versionPath(fileName, userAddress, version), 'diff.zip');
};

docManager.changesPath = function (fileName, userAddress, version) {
	return path.join(docManager.versionPath(fileName, userAddress, version), 'changes.txt');
};

docManager.keyPath = function (fileName, userAddress, version) {
	return path.join(docManager.versionPath(fileName, userAddress, version), 'key.txt');
};

docManager.changesUser = function (fileName, userAddress, version) {
	return path.join(docManager.versionPath(fileName, userAddress, version), 'user.txt');
};

docManager.getStoredFiles = function () {
	const userAddress = docManager.curUserHostAddress();
	const directory = path.join(docManager.dir, 'public', storageFolder, userAddress);
	this.createDirectory(directory);

	const result = [];
	const storedFiles = fileSystem.readdirSync(directory);

	for (let i = 0; i < storedFiles.length; i++) {
		const stats = fileSystem.lstatSync(path.join(directory, storedFiles[i]));

		if (!stats.isDirectory()) {
			const historyPath = docManager.historyPath(storedFiles[i], userAddress);
			let version = 1;

			if (historyPath !== '') {
				version = docManager.countVersion(historyPath);
			}

			const time = stats.mtime.getTime();
			const item = {
				time,
				name: storedFiles[i],
				documentType: fileUtility.getFileType(storedFiles[i]),
				canEdit: configServer.get('editedDocs').indexOf(fileUtility.getFileExtension(storedFiles[i])) !== -1,
				version,
			};

			if (result.length) {
				let j;

				for (j = 0; j < result.length; j++) {
					if (time > result[j].time) {
						break;
					}
				}

				result.splice(j, 0, item);
			} else {
				result.push(item);
			}
		}
	}

	return result;
};

docManager.getProtocol = function () {
	return docManager.req.headers['x-forwarded-proto'] || docManager.req.protocol;
};

docManager.curUserHostAddress = function (userAddress) {
	if (!userAddress) {
		userAddress = docManager.req.headers['x-forwarded-for'] || docManager.req.connection.remoteAddress;
	}

	return userAddress.replace(new RegExp('[^0-9a-zA-Z.=]', 'g'), '_');
};

docManager.copyFile = function (exist, target) {
	fileSystem.writeFileSync(target, fileSystem.readFileSync(exist));
};

docManager.getInternalExtension = function (fileType) {
	if (fileType === fileUtility.fileType.text) {
		return '.docx';
	}

	if (fileType === fileUtility.fileType.spreadsheet) {
		return '.xlsx';
	}

	if (fileType === fileUtility.fileType.presentation) {
		return '.pptx';
	}

	return '.docx';
};

docManager.getKey = function (fileName) {
	const userAddress = docManager.curUserHostAddress();
	let key = userAddress + docManager.getlocalFileUri(fileName);

	const historyPath = docManager.historyPath(fileName, userAddress);

	if (historyPath) {
		key += docManager.countVersion(historyPath);
	}

	const storagePath = docManager.storagePath(fileName, userAddress);
	const stat = fileSystem.statSync(storagePath);
	key += stat.mtime.getTime();

	return documentService.generateRevisionId(key);
};

docManager.getDate = function (date) {
	const minutes = (date.getMinutes() < 10 ? '0' : '') + date.getMinutes().toString();

	return `${date.getMonth()}/${date.getDate()}/${date.getFullYear()} ${date.getHours()}:${minutes}`;
};

docManager.getChanges = function (fileName) {
	if (this.existsSync(fileName)) {
		return JSON.parse(fileSystem.readFileSync(fileName));
	}

	return null;
};

docManager.countVersion = function (directory) {
	let i = 0;

	while (this.existsSync(path.join(directory, `${i + 1}`))) {
		i++;
	}

	return i;
};

docManager.getHistory = function (fileName, content, keyVersion, version) {
	let oldVersion = false;
	let contentJson = null;

	if (content) {
		if (content.changes) {
			contentJson = content.changes[0];
		} else {
			contentJson = content[0];
			oldVersion = true;
		}
	}

	const userAddress = docManager.curUserHostAddress();
	let username, userid, created, res;

	if (content) {
		if (oldVersion) {
			username = contentJson.username;
			userid = contentJson.userid;
			created = contentJson.date;
		} else {
			username = contentJson.user.name;
			userid = contentJson.user.id;
			created = contentJson.created;
			res = content;
		}
	} else {
		username = docManager.getFileData(fileName, userAddress)[2];
		userid = docManager.getFileData(fileName, userAddress)[1];
		created = docManager.getFileData(fileName, userAddress)[0];
		res = { changes: content };
	}

	res.key = keyVersion;
	res.version = version;
	res.created = created;
	res.user = {
		id: userid,
		name: username,
	};

	return res;
};

docManager.cleanFolderRecursive = function (folder, me) {
	if (fileSystem.existsSync(folder)) {
		const files = fileSystem.readdirSync(folder);
		files.forEach((file) => {
			const curPath = path.join(folder, file);

			if (fileSystem.lstatSync(curPath).isDirectory()) {
				this.cleanFolderRecursive(curPath, true);
			} else {
				fileSystem.unlinkSync(curPath);
			}
		});

		if (me) {
			fileSystem.rmdirSync(folder);
		}
	}
};

module.exports = docManager;
