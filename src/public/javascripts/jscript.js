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

let language;
let userid;
let username;

if (typeof jQuery != 'undefined') {
	jq = jQuery.noConflict();

	username = getUrlVars().name;
	userid = getUrlVars().userid;
	language = getUrlVars().lang;

	mustReload = false;

	if ('' !== language && undefined !== language) {
		jq('#language').val(language);
	} else {
		language = jq('#language').val();
	}

	jq('#language').change(function () {
		const username = jq('#user option:selected').text();
		window.location = `?lang=${jq(this).val()}&userid=${userid}&name=${username}`;
	});

	if ('' !== userid && undefined !== userid) {
		jq('#user').val(userid);
	} else {
		userid = jq('#user').val();
	}

	if ('' !== username && undefined !== username) {
		username = getUrlVars().name;
	} else {
		username = jq('#user option:selected').text();
	}

	jq('#user').change(function () {
		const username = jq('#user option:selected').text();
		window.location = `?lang=${language}&userid=${jq(this).val()}&name=${username}`;
	});

	jq(() => {
		jq('#fileupload').fileupload({
			dataType: 'json',
			add(e, data) {
				if (jq('#mainProgress').is(':visible')) {
					return;
				}

				jq('.error').removeClass('error');
				jq('.done').removeClass('done');
				jq('.current').removeClass('current');
				jq('#step1').addClass('current');
				jq('#mainProgress .error-message').hide()
					.find('span')
					.text('');
				jq('#mainProgress').removeClass('embedded');

				jq.blockUI({
					theme: true,
					title: 'Getting ready to load the file' + '<div class="dialog-close"></div>',
					message: jq('#mainProgress'),
					overlayCSS: { 'background-color': '#aaa' },
					themedCSS: { width: '656px', top: '20%', left: '50%', marginLeft: '-328px' },
				});
				jq('#beginEdit, #beginView, #beginEmbedded').addClass('disable');

				data.submit();
			},
			always(e, data) {
				if (!jq('#mainProgress').is(':visible')) {
					return;
				}

				const response = data.result;

				if (!response || response.error) {
					jq('.current').removeClass('current');
					jq('.step:not(.done)').addClass('error');
					jq('#mainProgress .error-message').show()
						.find('span')
						.text(response ? response.error : 'Upload error');
					jq('#hiddenFileName').val('');

					return;
				}

				jq('#hiddenFileName').val(response.filename);
				mustReload = true;

				jq('#step1').addClass('done')
					.removeClass('current');
				jq('#step2').addClass('current');

				checkConvert();
			},
		});
	});

	let timer = null;

	function checkConvert() {
		if (timer !== null) {
			clearTimeout(timer);
		}

		if (!jq('#mainProgress').is(':visible')) {
			return;
		}

		const fileName = jq('#hiddenFileName').val();

		let posExt = fileName.lastIndexOf('.');
		posExt = 0 <= posExt ? fileName.substring(posExt).trim()
			.toLowerCase() : '';

		if (ConverExtList.indexOf(posExt) === -1) {
			loadScripts();

			return;
		}

		timer = setTimeout(() => {
			const requestAddress = `${UrlConverter}?filename=${encodeURIComponent(jq('#hiddenFileName').val())}`;
			jq.ajaxSetup({ cache: false });
			jq.ajax({
				async: true,
				type: 'get',
				url: requestAddress,
				complete(data) {
					const responseText = data.responseText;
					let response;

					try {
						response = jq.parseJSON(responseText);
					} catch (e)	{
						response = { error: e };
					}

					if (response.error) {
						jq('.current').removeClass('current');
						jq('.step:not(.done)').addClass('error');
						jq('#mainProgress .error-message').show()
							.find('span')
							.text(response.error);
						jq('#hiddenFileName').val('');

						return;
					}

					jq('#hiddenFileName').val(response.filename);

					if (typeof response.step !== 'undefined' && response.step < 100) {
						checkConvert();
					} else {
						loadScripts();
					}
				},
			});
		}, 1000);
	}

	function loadScripts() {
		if (!jq('#mainProgress').is(':visible')) {
			return;
		}

		jq('#step2').addClass('done')
			.removeClass('current');
		jq('#step3').addClass('current');

		if (jq('#loadScripts').is(':empty')) {
			const urlScripts = jq('#loadScripts').attr('data-docs');
			const frame = '<iframe id="iframeScripts" width=1 height=1 style="position: absolute; visibility: hidden;" ></iframe>';
			jq('#loadScripts').html(frame);
			document.getElementById('iframeScripts').onload = onloadScripts;
			jq('#loadScripts iframe').attr('src', urlScripts);
		} else {
			onloadScripts();
		}
	}

	function onloadScripts() {
		if (!jq('#mainProgress').is(':visible')) {
			return;
		}

		jq('#step3').addClass('done')
			.removeClass('current');
		jq('#beginView, #beginEmbedded').removeClass('disable');

		const fileName = jq('#hiddenFileName').val();

		let posExt = fileName.lastIndexOf('.');
		posExt = 0 <= posExt ? fileName.substring(posExt).trim()
			.toLowerCase() : '';

		if (EditedExtList.indexOf(posExt) !== -1) {
			jq('#beginEdit').removeClass('disable');
		}
	}

	jq(document).on('click', '#beginEdit:not(.disable)', () => {
		const fileId = encodeURIComponent(jq('#hiddenFileName').val());
		const url = `${UrlEditor}?fileName=${fileId}&lang=${language}&userid=${userid}&name=${username}`;
		window.open(url, '_blank');
		jq('#hiddenFileName').val('');
		jq.unblockUI();
		document.location.reload();
	});

	jq(document).on('click', '#beginView:not(.disable)', () => {
		const fileId = encodeURIComponent(jq('#hiddenFileName').val());
		const url = `${UrlEditor}?mode=view&fileName=${fileId}&lang=${language}&userid=${userid}&name=${username}`;
		window.open(url, '_blank');
		jq('#hiddenFileName').val('');
		jq.unblockUI();
		document.location.reload();
	});

	jq(document).on('click', '#beginEmbedded:not(.disable)', () => {
		const fileId = encodeURIComponent(jq('#hiddenFileName').val());
		const url = `${UrlEditor}?type=embedded&fileName=${fileId}&lang=${language}&userid=${userid}&name=${username}`;

		jq('#mainProgress').addClass('embedded');
		jq('#beginEmbedded').addClass('disable');

		jq('#uploadSteps').after(`<iframe id="embeddedView" src="${url}" height="345px" width="600px" frameborder="0" scrolling="no" allowtransparency></iframe>`);
	});

	jq(document).on('click', '.reload-page', () => {
		setTimeout(() => {
			document.location.reload();
		}, 1000);

		return true;
	});

	jq(document).on('mouseup', '.reload-page', (event) => {
		if (event.which === 2) {
			setTimeout(() => {
				document.location.reload();
			}, 1000);
		}

		return true;
	});

	jq(document).on('click', '#cancelEdit, .dialog-close', () => {
		jq('#hiddenFileName').val('');
		jq('#embeddedView').remove();
		jq.unblockUI();

		if (mustReload) {
			document.location.reload();
		}
	});

	jq(document).on('click', '.delete-file', function () {
		const fileName = jq(this).attr('data');

		const requestAddress = `file?filename=${fileName}`;

		jq.ajax({
			async: true,
			contentType: 'text/xml',
			type: 'delete',
			url: requestAddress,
			complete(data) {
				document.location.reload();
			},
		});
	});

	jq('#createSample').click(() => {
		jq('.try-editor').each(function () {
			let href = jq(this).attr('href');

			if (jq('#createSample').is(':checked')) {
				href += '&sample=true';
			} else {
				href = href.replace('&sample=true', '');
			}

			jq(this).attr('href', href);
		});
	});
}

function getUrlVars() {
	const vars = [];
	let hash;
	const hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');

	for (let i = 0; i < hashes.length; i++) {
		hash = hashes[i].split('=');
		vars.push(hash[0]);
		vars[hash[0]] = hash[1];
	}

	return vars;
}
