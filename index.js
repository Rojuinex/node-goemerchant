var GoEmerchantGateway = require('./lib/GoEmerchantGateway.js');

module.exports = function gatewayFactory(conf) {
	return new GoEmerchantGateway(conf);
};