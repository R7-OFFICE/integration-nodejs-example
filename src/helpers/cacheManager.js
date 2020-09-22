let cache = {};

exports.put = function (key, value) {
	cache[key] = { value, time: new Date().getTime() };
};

exports.containsKey = function (key) {
	if (typeof cache[key] == 'undefined') {
		return false;
	}

	const secondsCache = 30;

	const t1 = new Date(cache[key].time + (1000 * secondsCache));

	const t2 = new Date();

	if (t1 < t2) {
		delete cache[key];

		return false;
	}

	return true;
};

exports.get = function (key) {
	return cache[key];
};

exports.delete = function (key) {
	delete cache[key];
};

exports.clear = function () {
	cache = {};
};
