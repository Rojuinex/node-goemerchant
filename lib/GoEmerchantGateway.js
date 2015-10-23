"use strict";

var assert = require('assert');
var util   = require('util');

var BaseGateway  = require('42-cent-base').BaseGateway;
var GatewayError = require('42-cent-base').GatewayError;

var P       = require('bluebird');
var request = require('request');
var toJson  = P.promisify(require('xml2js').parseString);
var xml2js  = require('xml2js');
var post    = P.promisify(request.post);

var _      = require('lodash');
var moment = require('moment');

/** 
 *
 * @param options
 * @constructor
 * @arguments BaseGateway
 */
function GoEmerchantGateway(options) {
	assert(options.API_LOGIN_ID, 'API_LOGIN_ID must be provided');
	assert(options.TRANSACTION_KEY, 'TRANSACTION_KEY must be provided');

	if(options.mid) {
		assert(options.tid, 'TID must be provided if using MID');
		assert(options.processor, 'Processor must be provided if using MID');
	}

	assert(!(options.mid && options.processor_id), 'MID and Processor ID can not be used at the same time');

	this.endpoint = 'https://secure.goemerchant.com/secure/gateway/xmlgateway.aspx';

	//this.endpoint = 'http://localhost:2000';

	BaseGateway.call(this, options);
}

util.inherits(GoEmerchantGateway, BaseGateway);

function makeKey(key, value) {
	return {
		'$' : {'key': key},
		'_' : value
	}
}

function setRequest (service, rootNodeName, requestNode) {
	var requestObject = {};

	requestObject[rootNodeName] = {
		'FIELDS': {'FIELD' : [
			makeKey('transaction_center_id', service.API_LOGIN_ID),
			makeKey('gateway_id', service.TRANSACTION_KEY)
			]
		}
	};

	for(let key in requestNode) {
		requestObject[rootNodeName]['FIELDS']['FIELD'].push(makeKey(key, requestNode[key]));
	}

	return requestObject;
}

function sendXmlifiedRequest (service) {
	return function(request) {
		return P.resolve()
			.then(function() {
				var builder = new xml2js.Builder({
					xmldec: {'version': '1.0', 'encoding': 'UTF-8'}
				});

				var xmlContent = builder.buildObject(request);

				return post(service.endpoint, {
					headers: {
						'Content-Type': 'application/xml',
						'Content-Length': xmlContent.length
					},
					body: xmlContent
				});
			});
	}
}

function createJsonCallback(cb) {
	return function (res, body) {
		return toJson(body)
		.then(function (result) {
			var json = result;

			if(json.ErrorResponse) {
				throw new GatewayError(json.ErrorResponse[0].messages[0].message[0].text[0], json.ErrorResponse[0]);
			}

			let parsedJson = {};

			for(let i = 0; i < json.RESPONSE.FIELDS.length; ++i) {
				for(let j = 0; j < json.RESPONSE.FIELDS[i].FIELD.length; ++j) {
					parsedJson[json.RESPONSE.FIELDS[i].FIELD[j]['$'].KEY] = json.RESPONSE.FIELDS[i].FIELD[j]['_'];
				}
			}

			return cb(parsedJson);
		})
	}
}

function CreateTransactionHeader(that, other) {
	let body = {};
	other = other? other : {};

	if(other.mid) {
		assert(other.tid, 'TID must be provided if using MID');
		assert(other.processor, 'Processor must be provided if using MID');
	}

	assert(!(other.mid && other.processor_id), 'MID and Processor ID can not be used at the same time');

	if(that.processor_id)
		body.processor_id = processor_id;

	if(other.processor_id) {
		body.processor_id = other.processor_id;
	} else {
		if(that.mid)  {
			body.mid = that.mid;
			body.tid = that.tid;
			body.processor = that.processor;
		}

		if(other.mid) {
			body.mid = other.mid;
			body.tid = other.tid;
			body.processor = other.processor;
		}
	}

	return body;
}

GoEmerchantGateway.prototype.sendTransactionRequest = function sendTransactionRequest(body, transactionCb) {
	var service = this;

	for(let key in body) {
		if(_.isNull(body[key]) || _.isUndefined(body[key]))
			delete body[key];
	}

	return P.resolve()
		.then(function() {
			return setRequest(service, 'TRANSACTION', body);
		})
		.then(sendXmlifiedRequest(service))
		.spread(createJsonCallback(function (json) {

			if(json.status) {
				if(json.status === '0') {
					throw new GatewayError(json.error, json);
				}

				return transactionCb(json)
			} else {
				throw new Error('Can not parse answer from gateway');
			}
		}))
}

GoEmerchantGateway.prototype.submitTransaction = function submitTransaction(order, creditCard, prospect, other) {

	other    = other    ? other    : {};
	prospect = prospect ? prospect : {};

	let header = CreateTransactionHeader(this, other);

	assert(order.id, 'order.id must be provided');
	assert(creditCard.card_type, 'creditCard.card_type must be provided');

	var expirationYear  = creditCard.expirationYear.toString().length === 4 ? creditCard.expirationYear.toString().substr(-2) : creditCard.expirationYear.toString();
	var expirationMonth = creditCard.expirationMonth.toString().length === 2 ? creditCard.expirationMonth.toString() : '0' + creditCard.expirationMonth.toString();

	let card_exp = expirationMonth + ''  + expirationYear;

	let combinedName = '';

	if(prospect.billingFirstName)
		combinedName += prospect.billingFirstName;

	if(combinedName.billingLastName)
		combinedName += combinedName == '' ? prospect.billingLastName : ' ' + prospect.billingLastName;

	if(creditCard.cardHolder)
		combinedName = creditCard.cardHolder;

	var body = {
		operation_type: 'sale',
		total: order.amount.toFixed(2),
		order_id: order.id,
		conv_fee: order.conv_fee || undefined,
		card_name: creditCard.card_type,
		card_number: creditCard.creditCardNumber,
		card_exp: card_exp,
		ccv2: creditCard.ccv2 || undefined,
		owner_name: combinedName,
		owner_street: prospect.billingAddress1 || '',
		owner_street2: prospect.billingAddress2  || undefined,
		owner_city: prospect.billingCity || '',
		owner_state: prospect.billingState || '',
		owner_zip: prospect.billingPostalCode || '',
		owner_country: prospect.billingCountry || '',
		owner_email: prospect.billingEmailAddress || undefined,
		owner_phone: prospect.billingPhone || undefined,
		remote_ip_address: other.remote_ip_address || undefined
	};

	body = _.merge({}, body, header);

	return this.sendTransactionRequest(body, function(transaction) {
		return {
			authCode: transaction.auth_code,
			_original: transaction,
			transactionId: transaction.reference_number
		}
	});
}

GoEmerchantGateway.prototype.authorizeTransaction = function authorizeTransaction(order, creditCard, prospect, other) {

	other    = other    ? other    : {};
	prospect = prospect ? prospect : {};

	let header = CreateTransactionHeader(this, other);

	assert(order.id, 'order.id must be provided');
	assert(creditCard.card_type, 'creditCard.card_type must be provided');

	var expirationYear  = creditCard.expirationYear.toString().length === 4 ? creditCard.expirationYear.toString().substr(-2) : creditCard.expirationYear.toString();
	var expirationMonth = creditCard.expirationMonth.toString().length === 2 ? creditCard.expirationMonth.toString() : '0' + creditCard.expirationMonth.toString();

	let card_exp = expirationMonth + ''  + expirationYear;

	let combinedName = '';

	if(prospect.billingFirstName)
		combinedName += prospect.billingFirstName;

	if(combinedName.billingLastName)
		combinedName += combinedName == '' ? prospect.billingLastName : ' ' + prospect.billingLastName;

	if(creditCard.cardHolder)
		combinedName = creditCard.cardHolder;

	var body = _.defaults({
		operation_type: 'auth',
		total: order.amount.toFixed(2),
		order_id: order.id,
		conv_fee: order.conv_fee || undefined,
		card_name: creditCard.card_type,
		card_number: creditCard.creditCardNumber,
		card_exp: card_exp,
		ccv2: creditCard.ccv2 || undefined,
		owner_name: combinedName,
		owner_street: prospect.billingAddress1 || '',
		owner_street2: prospect.billingAddress2  || undefined,
		owner_city: prospect.billingCity || '',
		owner_state: prospect.billingState || '',
		owner_zip: prospect.billingPostalCode || '',
		owner_country: prospect.billingCountry || '',
		owner_email: prospect.billingEmailAddress || undefined,
		owner_phone: prospect.billingPhone || undefined,
		remote_ip_address: other.remote_ip_address || undefined
	}, header);

	return this.sendTransactionRequest(body, function(transaction) {
		return {
			authCode: transaction.auth_code,
			_original: transaction,
			transactionId: transaction.reference_number
		}
	});
}

GoEmerchantGateway.prototype.getSettledBatchList = function getSettledTransactionsList(from, to) {
	let header = CreateTransactionHeader(this, {});

	assert(from, 'From date must be specified');

	to = to || new Date();

	let fromFormatted = moment(from).format('MMDDYY');
	let toFormatted   = moment(to).format('MMDDYY');

	var body = _.defaults({
		operation_type: 'query',
		trans_type: 'ALL',
		begin_date: fromFormatted,
		end_date: toFormatted,
		settled: 1
	}, header);


	return this.sendTransactionRequest(body, function(transaction) {
		let records = [];

		for(let i = 0; i < transaction.records_found; ++i) {
			records.push({
				order_id: transaction['order_id' + (i+1)],
				amount: transaction['amount' + (i+1)],
				amount_settled: transaction['amount_settled' + (i+1)],
				amount_credited: transaction['amount_credited' + (i+1)],
				settled: transaction['settled' + (i+1)],
				trans_time: transaction['trans_time' + (i+1)],
				card_type: transaction['card_type' + (i+1)],
				auth_response: transaction['auth_response' + (i+1)],
				credit_void: transaction['credit_void' + (i+1)],
				card_num: transaction['card_num' + (i+1)],
				auth_code: transaction['auth_code' + (i+1)],
				name_on_card: transaction['name_on_card' + (i+1)],
				card_exp: transaction['card_exp' + (i+1)],
				trans_type: transaction['trans_type' + (i+1)],
				trans_status: transaction['trans_status' + (i+1)],
				reference_number: transaction['reference_number' + (i+1)],
				recurring: transaction['recurring' + (i+1)],
				batch_number: transaction['batch_number' + (i+1)],
				recurring_child: transaction['recurring_child' + (i+1)],
				recurring_parent_reference_number: transaction['recurring_parent_reference_number' + (i+1)],
				recurring_parent_order_id: transaction['recurring_parent_order_id' + (i+1)],
				posted_by: transaction['posted_by' + (i+1)]
			})
		}

		return {
			status: '1',
			total_amount: transaction.total_amount,
			total_settled: transaction.total_settled,
			total_credited: transaction.total_credited,
			total_net: transaction.total_net,
			records_found: transaction.records_found,
			records: records,
			_original: transaction,
		}
	});

}

GoEmerchantGateway.prototype.refundTransaction = function refundTransaction(transactionId, options) {
	return Error('Not implemented');
}

GoEmerchantGateway.prototype.getTransactionList = function getTransactionList(batchId) {
	return Error('Not implemented');
}

GoEmerchantGateway.prototype.getTransactionDetails = function getTransactionDetails(transId) {
	return Error('Not implemented');
}

GoEmerchantGateway.prototype.voidTransaction = function voidTransaction(transactionId) {
	return Error('Not implemented');
}

GoEmerchantGateway.prototype.createCustomerProfile = function createCustomerProfile(payment, billing, shipping, options) {
	return Error('Not implemented');
}

GoEmerchantGateway.prototype.chargeCustomer = function chargeCustomer(order, prospect, other) {
	return Error('Not implemented');
}

GoEmerchantGateway.prototype.getCustomerProfile = function getCustomerProfile(profileId) {
	return Error('Not implemented');
}

GoEmerchantGateway.prototype.createSubscription = function createSubscription(cc, prospect, subscriptionPlan, other) {
	return Error('Not implemented');
}

module.exports = GoEmerchantGateway;