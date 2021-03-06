"use strict";

var assert = require('assert');
var util   = require('util');
let _      = require('lodash');
let async  = require('async');

var GatewayError       = require('42-cent-base').GatewayError;
var GoEmerchantGateway = require('../index.js');

var CreditCard = require('42-cent-model').CreditCard;
var Prospect   = require('42-cent-model').Prospect;
var Order      = require('42-cent-model').Order;

var uuid = require('node-uuid');

var conf = require('../config.json');

//conf.batchEndpoint = 'http://localhost:2000';
//conf.endpoint = 'http://localhost:2000';

describe('GoEmerchant service', function() {

	var service;

	function randomAmount() {
		return Math.ceil(Math.random() * 300);
	}

	let cimid;

	before(function(){
		cimid = uuid.v4() + '-TEST';

		service = GoEmerchantGateway(conf);
	});

	describe('authorizationCapture', function() {
		let cc, order, prospect;

		beforeEach(()=> {
			cc = new CreditCard({cardType: 'Visa'})
				.withCreditCardNumber('4716389275666851')
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
			cc = new CreditCard({cardType: 'Visa'})
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
			cc = new CreditCard({cardType: 'Visa'})
				.withCreditCardNumber('4716389275666851')
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
			cc = new CreditCard({cardType: 'Visa'})
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
		it('should be able to get settled batch transactions', function(done) {
			this.timeout(10000);

			service.getSettledBatchList(new Date(Date.now() - 30 * 24 * 3600 * 1000))
				.then(function(response){
					assert(response.status !== '0', 'Transaction status was 0');
					assert(response._original, 'original should be defined');
					done();
				})
				.catch(function(err){
					done(err);
				});
		});
	});

	describe('refund transaction', function() {
		it('should refund an already settled transaction', function(done) {
			this.timeout(20000);

			service.getSettledBatchList(new Date(Date.now() - 30 * 24 * 3600 * 1000))
				.then(function(response){
					assert(response.status !== '0', 'Transaction status was 0');
					assert(response._original, 'original should be defined');
					assert(response.records.length > 0, 'Cannot test refund without at least 1 settled transaction.');

					let xaction, i = 0;

					do {
						xaction = response.records[i];
					} while(xaction.amount_credited >= xaction.amount_settled && i++ < response.records.length)

					assert(i < response.records.length, 'Cound not find 1 setteled transaction that could be credited.');

					service.refundTransaction(xaction.reference_number, {amount: xaction.amount_settled - xaction.amount_credited})
						.then(function(response){
							assert(_.isNull(response.error) || _.isUndefined(response.error), response.error);
							assert(response.status === '1', 'status should be 1');
							assert(response.total_transactions_credited === '1', 'total_transactions_credited should be 1');
							assert(response.reference_number === xaction.reference_number, 'Reference numbers did not match');
							assert(response._original, 'original should be defined');
							done();
						})
						.catch(function(err) {
							done(err);
						});
				})
				.catch(function(err){
					done(err);
				});
		});

		it('should support partial refund', function(done) {
			this.timeout(20000);

			service.getSettledBatchList(new Date(Date.now() - 30 * 24 * 3600 * 1000))
				.then(function(response){
					assert(response.status !== '0', 'Transaction status was 0');
					assert(response._original, 'original should be defined');
					assert(response.records.length > 0, 'Cannot test refund without at least 1 settled transaction.');

					let xaction, i = 0;

					do {
						xaction = response.records[i];
					} while(xaction.amount_credited >= xaction.amount_settled && i++ < response.records.length)

					assert(i < response.records.length, 'Cound not find 1 setteled transaction that could be credited.');

					service.refundTransaction(xaction.reference_number, {amount: (xaction.amount_settled - xaction.amount_credited) * .5})
						.then(function(response){
							assert(_.isNull(response.error) || _.isUndefined(response.error), response.error);
							assert(response.status === '1', 'status should be 1');
							assert(response.total_transactions_credited === '1', 'total_transactions_credited should be 1');
							assert(response.reference_number === xaction.reference_number, 'Reference numbers did not match');
							assert(response._original, 'original should be defined');
							done();
						})
						.catch(function(err) {
							done(err);
						});
				})
				.catch(function(err){
					done(err);
				});
		});

		it('should reject the promise if the gateway return error', function(done) {
			this.timeout(20000);

			service.getSettledBatchList(new Date(Date.now() - 30 * 24 * 3600 * 1000))
				.then(function(response){
					assert(response.status !== '0', 'Transaction status was 0');
					assert(response._original, 'original should be defined');
					assert(response.records.length > 0, 'Cannot test refund without at least 1 settled transaction.');

					let xaction, i = 0;

					do {
						xaction = response.records[i];
					} while(xaction.amount_credited >= xaction.amount_settled && i++ < response.records.length)

					assert(i < response.records.length, 'Cound not find 1 setteled transaction that could be credited.');

					service.refundTransaction('bad', {amount: (xaction.amount_settled - xaction.amount_credited) * 2})
						.then(function(response){
							throw new Error('should not get here');
						})
						.catch(function(rejection) {
							assert(rejection instanceof GatewayError, 'should be an instance of GatewayError');
							assert.equal(rejection.message, 'Required Fields Missing:  reference_number1 is an invalid reference number. It must be all digits and correspond to a previous transaction you have submitted. . ');
							assert(rejection._original, 'original should be defined');
							done();
						})
						.catch(function(err){
							done(err);
						});
				})
				.catch(function(err){
					done(err);
				});
		});
	});

	describe('void transaction', function () {
		it('should submit transaction request');
		it('should reject a promise if gateway return errored message');
	});

	describe('create subscription', function () {
		it('should create a subscription');
		it('should create a subscription without trial period');
		it('should reject the promise');
	});

	describe('create customer profile', function () {
		let cc, order, prospect;

		before(()=> {
			cc = new CreditCard({cardType: 'Visa'})
				.withCreditCardNumber('4716389275666851')
				.withExpirationYear(2020)
				.withExpirationMonth('10')
				.withCvv2('123');

			order = new Order({id: uuid.v4()})
				.withAmount(randomAmount());

			prospect = new Prospect()
				.withProfileId(cimid)
				.withBillingLastName('Mom')
				.withBillingFirstName('Your')
				.withBillingAddress1('123 Test St')
				.withBillingCity('Springville')
				.withBillingPostalCode('12345-6789')
				.withBillingState('TN')
				.withBillingCountry('US')
				.withBillingPhone('8019991001')
				.withBillingEmailAddress('yourmom@echobroadband.net');
		});

		it('should create a customer profile', function(done) {
			//(payment, billing, shipping, options)

			service.createCustomerProfile(cc, prospect)
				.then(function(result){
					assert.equal(result.status, '1', 'Expected a result status of 1');
					assert(result.profileId === prospect.profileId);
					assert(result.maskedCC === result._original.masked_pan);
					done();
				})
				.catch(function(err) {
					done(err);
				});
		});

		it('should reject the promise when the gateway return an error', function(done) {
			var cc = new CreditCard({cardType: 'Visa'})
				.withCreditCardNumber('123456')
				.withExpirationMonth('12')
				.withExpirationYear('2017')
				.withCvv2('123');

			var prospect = new Prospect()
				.withProfileId(uuid.v4() + '- TEST')
				.withBillingLastName('Mom')
				.withBillingFirstName('Your')
				.withBillingAddress1('123 Test St')
				.withBillingCity('Springville')
				.withBillingPostalCode('12345-6789')
				.withBillingState('TN')
				.withBillingCountry('US')
				.withBillingPhone('8019991001')
				.withBillingEmailAddress('yourmom@echobroadband.net');

			service.createCustomerProfile(cc, prospect)
				.then(function(result){
					throw new Error('should not get here');
				})
				.catch(function(err) {
					try {
						assert(err instanceof GatewayError);
						assert(err._original, '_original should be defined');
						done();
					} catch(e) {
						done(e);
					}
				});
		});
	});

	describe('edit customer info', function() {
		let cc, prospect;

		before(()=> {
			cc = new CreditCard({cardType: 'Discover', cardNumber: 2})
				.withCreditCardNumber('6011111111111117')
				.withExpirationYear(2018)
				.withExpirationMonth('1')
				.withCvv2('123');

			prospect = new Prospect()
				.withBillingLastName('Mom')
				.withBillingFirstName('Your')
				.withBillingAddress1('123 Test St')
				.withBillingCity('Springville')
				.withBillingPostalCode('12345-6789')
				.withBillingState('TN')
				.withBillingCountry('US')
				.withBillingPhone('8015555555')
				.withBillingEmailAddress('yourmom@echobroadband.net');
		});

		xit('should be able to add a credit card to the account', function(done){
			service.editCustomerProfile(cimid, cc)
				.then((result)=> {
					assert.equal(result.status, '1', 'Expected a status result of 1');
					done();
				})
				.catch((err)=>{
					done(err);
				});
		});
	});

	describe('get customer info', function () {
		it('should get the info related to a customer', function(done){
			service.getCustomerProfile(cimid)
				.then((result)=> {
					assert.equal(result.status, '1', 'Expected result status to be 1');
					assert.equal(result.cim_record.cim_ref_num, cimid.toString(), 'Result cim number does not match input');
					done();
				})
				.catch((err)=>{
					done(err);
				});
		});
	});

	describe('charge customer profile', function () {
		it('should charge a existing customer', function(done){
			service.chargeCustomer({id: uuid.v4(), amount: 100}, {profileId: cimid})
				.then(function(result){
					assert.equal(result.authCode, result._original.auth_code);
					assert.equal(result.transactionId, result._original.reference_number);
					done();
				})
				.catch(function(err){
					done(err);
				});
		});

		it('should reject the promise when the gateway return an error', function(done){
			service.chargeCustomer({id: uuid.v4(), amount: 100}, {profileId: 'bad:id'})
				.then(function(result){
					throw new Error('should not get here');
				})
				.catch(function(err){
					assert(err._original, '_original should be defined');
					assert.equal(err.message, ' The cim_ref_num: bad:id is an invalid reference number. It must correspond to a previous customer you have submitted. ');
					done();
				});
		});
	});

	describe('delete customer profile', function () {
		it('should delte the customer account', function(done){
			this.timeout(10000);
			service.deleteCustomerProfile(cimid)
				.then((result)=> {
					assert.equal(result.status, '1', 'Expected result status to be 1');
					done();
				})
				.catch((err)=>{
					done(err);
				});
		});
	});

	describe('charge customers', function(){
		let cimids = [];

		// Change this to bulk CIM_INSERT when implemented
		before(function(done){
			async.parallel([
				function(cb) {
					let cc = new CreditCard({cardType: 'Visa'})
						.withCreditCardNumber('4716389275666851')
						.withExpirationYear(2020)
						.withExpirationMonth('10')
						.withCvv2('123');

					let cimid = uuid.v4() + '-TEST';

					let prospect = new Prospect()
						.withProfileId(cimid)
						.withBillingLastName('Mom')
						.withBillingFirstName('Your')
						.withBillingAddress1('123 Test St')
						.withBillingCity('Springville')
						.withBillingPostalCode('12345-6789')
						.withBillingState('TN')
						.withBillingCountry('US')
						.withBillingPhone('8019991001')
						.withBillingEmailAddress('yourmom@echobroadband.net');

					service.createCustomerProfile(cc, prospect)
						.then(function(result){
							cimids.push(cimid);
							cb();
						})
						.catch(function(error){
							cb(error);
						});
				},
				function(cb){
					let cc = new CreditCard({cardType: 'Discover'})
						.withCreditCardNumber('6011000995500000')
						.withExpirationYear(2020)
						.withExpirationMonth('10')
						.withCvv2('123');

					let cimid = uuid.v4() + '-TEST';

					let prospect = new Prospect()
						.withProfileId(cimid)
						.withBillingLastName('Dad')
						.withBillingFirstName('My')
						.withBillingAddress1('123 Test St')
						.withBillingCity('Bountiful')
						.withBillingPostalCode('12345-6789')
						.withBillingState('UT')
						.withBillingCountry('US')
						.withBillingPhone('8015555555')
						.withBillingEmailAddress('mydad@echobroadband.net');

					service.createCustomerProfile(cc, prospect)
						.then(function(result){
							cimids.push(cimid);
							cb();
						})
						.catch(function(error){
							cb(error);
						});
				}
			], done);
			
		});

		// In order to test bath cim sale, cim needs to exist at 
		// time of sale (30min from upload).  You will need to
		// manually delete created cims.
		after(function(done){
			/*let asyncFuncts = [];

			function deleteCim (cimid, cb) {
				service.deleteCustomerProfile(cimid)
					.then(function(){})
					.catch(function(e){
						console.log('error deleting cim ' + cimid);
					})
					.finally(function(){
						cb();
					})
			}

			for(let i = 0; i < cimids.length; ++i) {
				asyncFuncts.push(async.apply(deleteCim, cimids[i]));
			}

			async.parallel(asyncFuncts, function(error){
				done(error);
			});*/

			done();
		});

		it('should be able to bulk charge customers', function(done){
			let batch = [];

			for(let i = 0; i < cimids.length; ++i) {
				batch.push({
					profile: {
						profileId: cimids[i]
					}, 
					order: {
						id: uuid.v4(), 
						amount: 1
					}
				});
			}

			service.chargeCustomers(batch)
				.then(function(result){
					assert(result.status === '1', 'Expected result status to be 1');
					assert(result.fileId, 'fileId should be defined');
					assert(result.message, 'message should be defined');
					assert(result._original, 'original should be defined');
					done();
				})
				.catch(function(error){
					done(error);
				})
		});
	});
});