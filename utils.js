exports.decode = function decode(message) {
  return JSON.parse(Buffer.from(message));
};

exports.encode = function encode(data) {
  return JSON.stringify(data);
};

exports.encodeError = function encodeError(channel, id, err) {
  return [channel, id, null, [err.message, err.stack]];
};

exports.encodeResponse = function encodeResponse(channel, id, result) {
  return [channel, id, result];
};

exports.encodeEvent = function encodeEvent(channel, data) {
  return [channel, null, data];
};
