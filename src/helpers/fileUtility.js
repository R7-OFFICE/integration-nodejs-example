/*
 *
 * (c) Copyright Ascensio System SIA 2020
 *
 * The MIT License (MIT)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
*/

const configServer = require('config').get('server');
const siteUrl = process.env.SITE_URL || configServer.get('siteUrl');
const tempStorageUrl = siteUrl + configServer.get('tempStorageUrl');

const fileUtility = {};

fileUtility.getFileName = function (url, withoutExtension) {
	if (!url) return '';

	let filename;

	if (tempStorageUrl && url.indexOf(tempStorageUrl) === 0) {
		const params = getUrlParams(url);
		filename = params == null ? null : params.filename;
	} else {
		const parts = url.toLowerCase().split('/');
		fileName = parts.pop();
	}

	if (withoutExtension) {
		const ext = fileUtility.getFileExtension(fileName);

		return fileName.replace(ext, '');
	}

	return fileName;
};

fileUtility.getFileExtension = function (url, withoutDot) {
	if (!url) return null;

	const fileName = fileUtility.getFileName(url);

	const parts = fileName.toLowerCase().split('.');

	return withoutDot ? parts.pop() : `.${parts.pop()}`;
};

fileUtility.getFileType = function (url) {
	const ext = fileUtility.getFileExtension(url);

	if (fileUtility.documentExts.indexOf(ext) !== -1) return fileUtility.fileType.text;

	if (fileUtility.spreadsheetExts.indexOf(ext) !== -1) return fileUtility.fileType.spreadsheet;

	if (fileUtility.presentationExts.indexOf(ext) !== -1) return fileUtility.fileType.presentation;

	return fileUtility.fileType.text;
};

fileUtility.fileType = {
	text: 'text',
	spreadsheet: 'spreadsheet',
	presentation: 'presentation',
};

fileUtility.documentExts = ['.doc', '.docx', '.docm', '.dot', '.dotx', '.dotm', '.odt', '.fodt', '.ott', '.rtf', '.txt', '.html', '.htm', '.mht', '.pdf', '.djvu', '.fb2', '.epub', '.xps'];

fileUtility.spreadsheetExts = ['.xls', '.xlsx', '.xlsm', '.xlt', '.xltx', '.xltm', '.ods', '.fods', '.ots', '.csv'];

fileUtility.presentationExts = ['.pps', '.ppsx', '.ppsm', '.ppt', '.pptx', '.pptm', '.pot', '.potx', '.potm', '.odp', '.fodp', '.otp'];

function getUrlParams(url) {
	try {
		const query = url.split('?').pop();
		const params = query.split('&');
		const map = {};

		for (let i = 0; i < params.length; i++) {
			const parts = param.split('=');
			map[parts[0]] = parts[1];
		}

		return map;
	} catch (ex) {
		return null;
	}
}

module.exports = fileUtility;
