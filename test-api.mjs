import { createHmac } from 'crypto';

const API_URL = 'https://api.sandbox.holibob.tech/graphql';
const API_KEY = '95462fd3-b043-4725-b70f-8f24bb9a2d79';
const API_SECRET = '99d6104093d8f36c19acd4a965c5c302a8b80715';
const PARTNER_ID = 'holibob';

const query = `
  query ProductDiscovery($input: ProductDiscoveryInput!) {
    productDiscovery(input: $input) {
      selectedDestination {
        id
        name
      }
      recommendedTagList {
        nodes {
          id
          name
        }
      }
      recommendedSearchTermList {
        nodes {
          searchTerm
        }
      }
      recommendedProductList(count: 20) {
        nodes {
          id
          name
        }
      }
    }
  }
`;

const variables = {
  input: {
    where: { freeText: 'London' },
    who: { freeText: '2 Adults' }
  }
};

async function testAPI() {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ query, variables });

  // Generate signature
  const payload = `${timestamp}${API_KEY}POST/graphql${body}`;
  const hmac = createHmac('sha1', API_SECRET);
  hmac.update(payload);
  const signature = hmac.digest('base64');

  console.log('Testing Holibob API...');
  console.log('URL:', API_URL);
  console.log('Query variables:', JSON.stringify(variables, null, 2));
  console.log('\n');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-Partner-Id': PARTNER_ID,
        'X-Holibob-Date': timestamp,
        'X-Holibob-Signature': signature,
      },
      body
    });

    const data = await response.json();

    console.log('Response status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (data.errors) {
      console.log('\n\nERRORS FOUND:');
      data.errors.forEach((err, i) => {
        console.log(`\nError ${i + 1}:`, err.message);
        if (err.extensions) {
          console.log('Extensions:', JSON.stringify(err.extensions, null, 2));
        }
      });
    }

    if (data.data?.productDiscovery?.recommendedProductList?.nodes) {
      console.log('\n\nSUCCESS! Products found:', data.data.productDiscovery.recommendedProductList.nodes.length);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

testAPI();
