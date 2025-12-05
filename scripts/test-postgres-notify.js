#!/usr/bin/env node

/**
 * Simple test script for PostgreSQL LISTEN/NOTIFY
 * 
 * This script:
 * 1. Connects to PostgreSQL
 * 2. Listens for notifications
 * 3. Publishes a test notification
 * 4. Verifies it was received
 * 
 * Usage:
 *   node scripts/test-postgres-notify.js
 */

import pg from 'pg';
const { Client } = pg;

const config = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'kanban',
  user: process.env.POSTGRES_USER || 'kanban_user',
  password: process.env.POSTGRES_PASSWORD || 'kanban_password',
};

const TEST_CHANNEL = 'test_notification_channel';
let notificationReceived = false;

async function testListenNotify() {
  console.log('🧪 Testing PostgreSQL LISTEN/NOTIFY...\n');

  // Create listener client
  const listener = new Client(config);
  const publisher = new Client(config);

  try {
    // Connect both clients
    console.log('1️⃣ Connecting to PostgreSQL...');
    await listener.connect();
    await publisher.connect();
    console.log('   ✅ Connected\n');

    // Set up notification handler
    listener.on('notification', (msg) => {
      console.log('📨 Notification received!');
      console.log('   Channel:', msg.channel);
      console.log('   Payload:', msg.payload);
      notificationReceived = true;
    });

    // Start listening
    console.log(`2️⃣ Starting to LISTEN on channel: ${TEST_CHANNEL}...`);
    await listener.query(`LISTEN ${TEST_CHANNEL}`);
    console.log('   ✅ Listening...\n');

    // Wait a moment for LISTEN to be ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // Publish a notification
    console.log('3️⃣ Publishing test notification...');
    const testPayload = JSON.stringify({
      message: 'Hello from PostgreSQL LISTEN/NOTIFY!',
      timestamp: new Date().toISOString(),
      test: true
    });
    
    await publisher.query('SELECT pg_notify($1, $2)', [TEST_CHANNEL, testPayload]);
    console.log('   ✅ Notification published\n');

    // Wait for notification to be received
    console.log('4️⃣ Waiting for notification...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if notification was received
    if (notificationReceived) {
      console.log('✅ SUCCESS: Notification was received!');
      console.log('   LISTEN/NOTIFY is working correctly.\n');
    } else {
      console.log('❌ FAILED: Notification was not received.');
      console.log('   This might indicate a problem with LISTEN/NOTIFY.\n');
    }

    // Clean up
    console.log('5️⃣ Cleaning up...');
    await listener.query(`UNLISTEN ${TEST_CHANNEL}`);
    await listener.end();
    await publisher.end();
    console.log('   ✅ Disconnected\n');

    process.exit(notificationReceived ? 0 : 1);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    
    try {
      await listener.end();
      await publisher.end();
    } catch (e) {
      // Ignore cleanup errors
    }
    
    process.exit(1);
  }
}

// Run the test
testListenNotify();

