require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// SSLCommerz Configuration
const sslcommerz = {
  store_id: process.env.SSLCOMMERZ_STORE_ID,
  store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD,
  is_live: process.env.NODE_ENV === 'production', // true for live, false for sandbox
};

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Validate payment request
const validatePaymentRequest = (req) => {
  const { total_amount, currency, tran_id, success_url, fail_url, cancel_url, cus_name, cus_email, cus_phone, cus_add1 } = req.body;
  
  if (!total_amount || !currency || !tran_id || !success_url || !fail_url || !cancel_url || 
      !cus_name || !cus_email || !cus_phone || !cus_add1) {
    return false;
  }
  return true;
};

// Payment initiation endpoint
app.post('/api/initiate-payment', async (req, res) => {
  try {
    if (!validatePaymentRequest(req)) {
      return res.status(400).json({ status: 'FAILED', message: 'Missing required fields' });
    }

    const sslczURL = sslcommerz.is_live
      ? 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'
      : 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';

    // Combine request data with SSLCommerz credentials
    const paymentData = {
      ...req.body,
      store_id: sslcommerz.store_id,
      store_passwd: sslcommerz.store_passwd,
      shipping_method: 'NO',
      multi_card_name: 'internetbank',
      version: '4.00'
    };
    
    const response = await fetch(sslczURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(paymentData).toString()
    });

    const data = await response.json();
    
    if (data?.status === 'SUCCESS') {
      // Store transaction information in database
      // This is where you would typically save pending order details
      console.log('Payment initiated successfully:');
      res.json(data);
    } else {
      res.status(400).json({
        status: 'FAILED',
        message: data?.message || 'Payment initialization failed',
        data: data
      });
    }
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({ 
      status: 'FAILED',
      message: 'Internal server error',
      error: error.message 
    });
  }
});

// Payment success endpoint
app.post('/payment-success', async (req, res) => {
  try {
    const { status, tran_id, val_id, amount, card_type, bank_tran_id, store_amount } = req.body;
    
    // Validate the payment with SSLCommerz
    const validationURL = sslcommerz.is_live
      ? 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
      : 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';

    const validationResponse = await fetch(`${validationURL}?val_id=${val_id}&store_id=${sslcommerz.store_id}&store_passwd=${sslcommerz.store_passwd}`);
    const validationData = await validationResponse.json();

    if (validationData.status === 'VALID' || validationData.status === 'VALIDATED') {
      // Update order status in your database as confirmed
      console.log('Payment validated successfully:', validationData);
      
      // Redirect to the success page with transaction details
      res.redirect(`${process.env.FRONTEND_URL}/payment-success?tran_id=${tran_id}`);
    } else {
      // Log the validation failure
      console.error('Payment validation failed:', validationData);
      
      // Redirect to the failure page with error information
      res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error_message=Payment validation failed&tran_id=${tran_id}`);
    }
  } catch (error) {
    console.error('Payment success handler error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error_message=Internal server error`);
  }
});

// Payment failure endpoint
app.post('/payment-failed', (req, res) => {
  const { tran_id, error } = req.body;
  console.log('Payment failed:', req.body);
  
  // Update order status in your database as failed
  // Add your database update logic here
  
  // Redirect to the failure page
  res.redirect(`${process.env.FRONTEND_URL}/payment-failed?error_message=${encodeURIComponent(error || 'Payment processing failed')}&tran_id=${tran_id}`);
});

// Payment cancellation endpoint
app.post('/payment-cancel', (req, res) => {
  const { tran_id } = req.body;
  console.log('Payment cancelled:', req.body);
  
  // Update order status in your database as cancelled
  // Add your database update logic here
  
  // Redirect to the cart page
  res.redirect(`${process.env.FRONTEND_URL}/cart`);
});

// Payment notification endpoint (IPN)
app.post('/api/payment-notification', async (req, res) => {
  try {
    const { status, tran_id, val_id, amount, card_type, bank_tran_id, store_amount } = req.body;
    
    // Validate the payment with SSLCommerz
    const validationURL = sslcommerz.is_live
      ? 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
      : 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';

    const validationResponse = await fetch(`${validationURL}?val_id=${val_id}&store_id=${sslcommerz.store_id}&store_passwd=${sslcommerz.store_passwd}`);
    const validationData = await validationResponse.json();

    if (validationData.status === 'VALID' || validationData.status === 'VALIDATED') {
      // Update order status in your database
      console.log('IPN: Payment validated successfully:', validationData);
      
      // Send confirmation to SSLCommerz
      res.json({ status: 'SUCCESS' });
    } else {
      console.error('IPN: Payment validation failed:', validationData);
      res.status(400).json({ status: 'FAILED', message: 'Payment validation failed' });
    }
  } catch (error) {
    console.error('Payment notification error:', error);
    res.status(500).json({ status: 'FAILED', message: 'Internal server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});