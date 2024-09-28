const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { HttpsProxyAgent } = require('https-proxy-agent');
const express = require('express');
const moment = require('moment');
const path = require("path");
const app = express();
const port = 3004;

// Supabase configuration
const supabaseUrl = 'https://dzrfpmregudejhuyjjhg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6cmZwbXJlZ3VkZWpodXlqamhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU1ODY1NjMsImV4cCI6MjA0MTE2MjU2M30.eMz8U-NyQM9-EtUjZ4kIjWecxo04RSG_z5y-A9PKuFA';
const supabase = createClient(supabaseUrl, supabaseKey);

// Instagram API configuration
const sessionid = '68967207206%3ARguaMzFAbMWoKT%3A15%3AAYe9dWiFyMGxxxlGLcYbyi_iCuD_9z5EcJDz3Wk-ow';
const csrftoken = 'FCjfK0orOaAeoMcUms1I2xSLS6OjmVEQ';
const userAgent = 'Instagram 150.0.0.33.120 iPhone';

// Proxy configuration
const proxyList = [
    { host: '154.36.110.199', port: 6853, auth: { username: 'ttxesvsv', password: 'fphva8n06fp6' } },
    { host: '204.44.69.89', port: 6342, auth: { username: 'ttxesvsv', password: 'fphva8n06fp6' } },
    { host: '206.41.172.74', port: 6634, auth: { username: 'ttxesvsv', password: 'fphva8n06fp6' } },
    { host: '38.154.227.167', port: 5868, auth: { username: 'yjltcpok', password: '6bgjuhflvnnb' } },
    { host: '45.127.248.127', port: 5128, auth: { username: 'yjltcpok', password: '6bgjuhflvnnb' } },
    { host: '198.23.239.134', port: 6540, auth: { username: 'yjltcpok', password: '6bgjuhflvnnb' } },   
    { host: '207.244.217.165', port: 6712, auth: { username: 'yjltcpok', password: '6bgjuhflvnnb' } },
    { host: '167.160.180.203', port: 6754, auth: { username: 'yjltcpok', password: '6bgjuhflvnnb' } }
    
];

const headers = {
    'Cookie': `sessionid=${sessionid}; csrftoken=${csrftoken}`,
    'X-CSRFToken': csrftoken,
    'User-Agent': userAgent,
    'X-IG-App-ID': '936619743392459',
    'X-IG-WWW-Claim': '0',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
};

const endpoints = [
    { name: 'getSimilarAccounts', url: 'https://i.instagram.com/api/v1/discover/chaining/', method: 'GET' },
    { name: 'getUsertagsFeed', url: 'https://i.instagram.com/api/v1/usertags/{id}/feed/', method: 'GET' },
    { name: 'getHighlights', url: 'https://i.instagram.com/api/v1/highlights/{userid}/highlights_tray/', method: 'GET' },
    { name: 'getStories', url: 'https://i.instagram.com/api/v1/feed/user/{userid}/story/', method: 'GET' },
    { name: 'getFollowing', url: 'https://i.instagram.com/api/v1/friendships/{userid}/following/', method: 'GET' },
    { name: 'getFollowers', url: 'https://i.instagram.com/api/v1/friendships/{userid}/followers/', method: 'GET' },
    { name: 'getMedia', url: 'https://i.instagram.com/api/v1/feed/user/{userid}/', method: 'GET' },
    { name: 'getInfoById', url: 'https://i.instagram.com/api/v1/users/{userid}/info/', method: 'GET' }
];

let requestCount = 0;
let lastRequestTime = Date.now();

function getRandomProxy() {
    return proxyList[Math.floor(Math.random() * proxyList.length)];
}

function createProxyAgent(proxy) {
    const proxyUrl = `http://${proxy.auth.username}:${proxy.auth.password}@${proxy.host}:${proxy.port}`;
    return new HttpsProxyAgent(proxyUrl);
}

async function makeRequest(endpoint, userid) {
    const url = endpoint.url.replace('{userid}', userid).replace('{id}', userid);
    const startTime = Date.now();
    
    const proxy = getRandomProxy();
    const proxyAgent = createProxyAgent(proxy);
    
    try {
        console.log(`Making request to ${endpoint.name} for user ${userid}`);
        console.log(`URL: ${url}`);
        console.log(`Headers:`, headers);
        console.log(`Using proxy: ${proxy.host}:${proxy.port}`);

        const response = await axios({
            method: endpoint.method,
            url,
            headers,
            httpsAgent: proxyAgent,
            proxy: false, // Disable Axios' default proxy handling
            timeout: 30000,
            validateStatus: function (status) {
                return status < 500;
            }
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        if (response.status === 400) {
            console.error(`Error 400 in ${endpoint.name}:`, response.data);
            return { success: false, error: `400 Bad Request: ${JSON.stringify(response.data)}` };
        }
        
        await saveToSupabase(endpoint.name, userid, response.data, startTime, responseTime, `${proxy.host}:${proxy.port}`);
        
        requestCount++;
        lastRequestTime = startTime;
        
        return { success: true, data: response.data, responseTime };
    } catch (error) {
        console.error(`Error in ${endpoint.name}:`, error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error setting up request:', error.message);
        }
        return { success: false, error: error.message };
    }
}

async function saveToSupabase(endpointName, userid, data, timestamp, responseTime, proxyUsed) {
    try {
        const { data: insertedData, error } = await supabase
            .from('instagram_api_responses')
            .insert({
                endpoint: endpointName,
                userid,
                response: data,
                timestamp,
                response_time: responseTime,
                proxy_used: proxyUsed
            });
        
        if (error) throw error;
        console.log(`Saved ${endpointName} response to Supabase`);
    } catch (error) {
        console.error('Error saving to Supabase:', error.message);
    }
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

async function runScript() {
    const userids = ['961449572', '299104516'];
    const requestsPerMinute = 4;
    const delayBetweenRequests = 60000 / requestsPerMinute;
    
    while (true) {
        for (const userid of userids) {
            const shuffledEndpoints = endpoints.sort(() => 0.5 - Math.random());
            for (const endpoint of shuffledEndpoints) {
                await makeRequest(endpoint, userid);
                await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
            }
            
            // Add a random pause between users
            await new Promise(resolve => setTimeout(resolve, getRandomDelay(30000, 120000)));
        }
        
        // Add a longer, variable delay between cycles
        await new Promise(resolve => setTimeout(resolve, getRandomDelay(300000, 900000)));
    }
}
  // Express route to display current status
  app.get('/status', async (req, res) => {
    const currentTime = Date.now();
    const hoursSinceStart = (currentTime - lastRequestTime) / 3600000;
    const requestsPerHour = requestCount / hoursSinceStart;
    
    // Get requests from the last hour
    const oneHourAgo = currentTime - 3600000;
    const { data, error } = await supabase
      .from('instagram_api_responses')
      .select('count')
      .gte('timestamp', oneHourAgo);
    
    if (error) {
      console.error('Error fetching data from Supabase:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    const requestsLastHour = data[0]?.count || 0;
    
    res.json({
      totalRequests: requestCount,
      overallRequestsPerHour: requestsPerHour.toFixed(2),
      requestsLastHour,
      lastRequestTime: new Date(lastRequestTime).toISOString()
    });
  });
  
  // API to display database statistics
  app.get('/stats', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('instagram_api_responses')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      
      const stats = data.map(item => ({
        endpoint: item.endpoint,
        userid: item.userid,
        timestamp: new Date(item.timestamp).toISOString(),
        responseTime: item.response_time
      }));
      
      const hourlyStats = {};
      data.forEach(item => {
        const hour = moment(item.timestamp).startOf('hour').format();
        hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
      });
      
      res.json({
        recentRequests: stats,
        hourlyBreakdown: hourlyStats
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
  
  // API to test proxy and display IP
  app.get('/test-proxy', async (req, res) => {
    const proxy = getRandomProxy();
    const proxyAgent = createProxyAgent(proxy);
    
    try {
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: proxyAgent,
            proxy: false, // Disable Axios' default proxy handling
            timeout: 10000
        });
        
        res.json({
            proxyUsed: `${proxy.host}:${proxy.port}`,
            ipAddress: response.data.ip
        });
    } catch (error) {
        console.error('Error testing proxy:', error);
        res.status(500).json({ error: 'Failed to test proxy', message: error.message });
    }
});

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });
  
  // Start the Express server
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  
  runScript().catch(console.error);
