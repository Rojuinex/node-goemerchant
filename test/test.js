"use strict";

var assert             = require('assert');
var GatewayError       = require('42-cent-base').GatewayError;
var GoEmerchantGateway = require('../index.js');

var CreditCard = require('42-cent-model').CreditCard;
var Prospect   = require('42-cent-model').Prospect;
var Order      = require('42-cent-model').Order;

var uuid = require('node-uuid');

var conf = require('../config.json');

describe('GoEmerchant service', function() {

	var service;

	function randomAmount() {
		return Math.ceil(Math.random() * 300);
	}

	beforeEach(function() {
		service = GoEmerchantGateway(conf);
	});

	describe('authorizationCapture', function() {
		let cc, order, prospect;

		beforeEach(()=> {
			cc = new CreditCard({card_type: 'Visa'})
				.withCreditCardNumber('4111111111111111')
				.withExpirationYear(2020)
				.withExpirationMonth('10')
				.withCvv2('123');

			order = new Order({id: uuid.v4()})
				.withAmount(randomAmount());

			prospect = new Prospect()
				.withBillingLastName('Mom')
				.withBillingFirstName('Your')
				.withBillingAddress1('123 Test St')
				.withBillingCity('Springville')
				.withBillingPostalCode('12345-6789')
				.withBillingState('TN')
				.withBillingCountry('US');
		});

		it('should submit transaction request', function(done) {
			service.submitTransaction(order, cc, prospect).then(function (result) {
				assert.equal(result.authCode, result._original.auth_code);
				assert.equal(result.transactionId, result._original.reference_number);
				done();
			}).catch(function (err) {
				done(err);
			});
		});

		it('should reject the promise when web service sends an error code', function(done) {
			cc = new CreditCard({card_type: 'Visa'})
				.withCreditCardNumber('41111111')
				.withExpirationYear(2020)
				.withExpirationMonth('10')
				.withCvv2('123');

			service.submitTransaction(order, cc, prospect).then(function(){
				done(new Error('should not get here'));
			}, function (rejection) {
				assert(rejection instanceof GatewayError, 'should be an instance of GatewayError');
				assert.equal(rejection.message, 'Card number is invalid');
				assert(rejection._original, 'original should be defined');
				done();
			}).catch(function (err) {
				done(err);
			});
		});
	});

	describe('authorize only', function() {
		let cc, order, prospect;

		beforeEach(()=> {
			cc = new CreditCard({card_type: 'Visa'})
				.withCreditCardNumber('4111111111111111')
				.withExpirationYear(2020)
				.withExpirationMonth('10')
				.withCvv2('123');

			order = new Order({id: uuid.v4()})
				.withAmount(randomAmount());

			prospect = new Prospect()
				.withBillingLastName('Mom')
				.withBillingFirstName('Your')
				.withBillingAddress1('123 Test St')
				.withBillingCity('Springville')
				.withBillingPostalCode('12345-6789')
				.withBillingState('TN')
				.withBillingCountry('US');
		});

		it('should submit transaction request', function(done) {
			service.authorizeTransaction(order, cc, prospect).then(function(result){
				assert.equal(result.authCode, result._original.auth_code);
				assert.equal(result.transactionId, result._original.reference_number);
				done()
			}).catch(function(err){
				done(err);
			});
		});

		it('should reject the promise when web service send an error code', function(done) {
			cc = new CreditCard({card_type: 'Visa'})
				.withCreditCardNumber('41111111')
				.withExpirationYear(2020)
				.withExpirationMonth('10')
				.withCvv2('123');

			service.authorizeTransaction(order, cc, prospect).then(function(){
				done(new Error('should not get here'));
			}, function (rejection) {
				assert(rejection instanceof GatewayError, 'should be an instance of GatewayError');
				assert.equal(rejection.message, 'Card number is invalid');
				assert(rejection._original, 'original should be defined');
				done();
			}).catch(function (err) {
				done(err);
			});
		});
	});

	describe('get transactions', function() {
		it('should be able to get setteled batch transactions', function(done) {
			this.timeout(10000);

			service.getSettledBatchList(new Date(Date.now() - 30 * 24 * 3600 * 1000))
				.then(function(response){
					console.log(require('util').inspect(response.records, {colors: true, depth: null}));
					done();
				})
				.catch(function(err){
					done(err);
				});
		});
	});

	xdescribe('refund transaction', function() {
		xit('should refund an already settled transaction');
		xit('should support partial refund');
		xit('should reject the promise if the gateway return error');
	});

	xdescribe('void transaction', function () {
		it('should submit transaction request');
		it('should reject a promise if gateway return errored message');
	});

	xdescribe('create subscription', function () {
		it('should create a subscription');
		it('should create a subscription without trial period');
		it('should reject the promise');
	});

	describe('create customer profile', function () {
		it('should create a customer profile');
		it('should reject the promise when the gateway return an error');
	});

	describe('get customer info', function () {
		it('should get the info related to a customer');
	});

	describe('charge customer profile', function () {
		it('should charge a existing customer');
		it('should reject the promise when the gateway return an error');
	});
});