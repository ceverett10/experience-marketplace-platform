#!/usr/bin/env npx tsx
/**
 * Introspect Holibob GraphQL API to find provider/operator fields
 * Run with: npx tsx scripts/introspect-holibob.ts
 */

import 'dotenv/config';
import { GraphQLClient, gql } from 'graphql-request';
import { createHmac } from 'crypto';

function generateSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: string,
  body: string
): string {
  const payload = `${timestamp}${apiKey}POST/graphql${body}`;
  const hmac = createHmac('sha1', apiSecret);
  hmac.update(payload);
  return hmac.digest('base64');
}

async function introspectHolibob() {
  const apiUrl = process.env['HOLIBOB_API_URL']!;
  const partnerId = process.env['HOLIBOB_PARTNER_ID']!;
  const apiKey = process.env['HOLIBOB_API_KEY']!;
  const apiSecret = process.env['HOLIBOB_API_SECRET']!;

  console.log('Introspecting Holibob GraphQL API...');
  console.log(`  API URL: ${apiUrl}`);

  // Build headers with signature
  const client = new GraphQLClient(apiUrl, {
    headers: {
      'X-API-Key': apiKey,
      'X-Partner-Id': partnerId,
      'Content-Type': 'application/json',
    },
    requestMiddleware: async (request) => {
      const timestamp = new Date().toISOString();
      const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      const signature = generateSignature(apiKey, apiSecret, timestamp, body);

      return {
        ...request,
        headers: {
          ...request.headers,
          'X-Holibob-Date': timestamp,
          'X-Holibob-Signature': signature,
        },
      };
    },
  });

  // First, let's try the productDetail query name shown in the user's snippet
  const testProductDetailQuery = gql`
    query TestProductDetail($id: String!) {
      productDetail(id: $id) {
        id
        name
        provider {
          id
          name
        }
      }
    }
  `;

  // Get a sample product ID first
  const discoverQuery = gql`
    query Discover {
      productDiscovery(where: { freeText: "London" }) {
        recommendedProductList(count: 1) {
          nodes {
            id
            name
          }
        }
      }
    }
  `;

  try {
    console.log('\n--- Step 1: Get a sample product ID ---');
    const discoverResult = await client.request<{
      productDiscovery: {
        recommendedProductList: { nodes: { id: string; name: string }[] };
      };
    }>(discoverQuery);

    const sampleProduct = discoverResult.productDiscovery.recommendedProductList.nodes[0];
    console.log(`Sample product: ${sampleProduct.name} (${sampleProduct.id})`);

    // Try productDetail query
    console.log('\n--- Step 2: Try productDetail query with provider ---');
    try {
      const result = await client.request(testProductDetailQuery, { id: sampleProduct.id });
      console.log('productDetail query succeeded!');
      console.log(JSON.stringify(result, null, 2));
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { errors?: { message: string }[] } };
      console.log('productDetail query failed:', err.message);
      if (err.response?.errors) {
        console.log(
          'GraphQL errors:',
          err.response.errors.map((e: { message: string }) => e.message)
        );
      }
    }

    // Introspect Product type
    console.log('\n--- Step 3: Introspect Product type fields ---');
    const introspectQuery = gql`
      query IntrospectProduct {
        __type(name: "Product") {
          name
          fields {
            name
            type {
              name
              kind
              ofType {
                name
                kind
              }
            }
          }
        }
      }
    `;

    const introspectResult = await client.request<{
      __type: {
        name: string;
        fields: {
          name: string;
          type: { name: string; kind: string; ofType?: { name: string; kind: string } };
        }[];
      } | null;
    }>(introspectQuery);

    if (introspectResult.__type) {
      console.log(`\nProduct type has ${introspectResult.__type.fields.length} fields:`);

      // Find provider/operator/supplier related fields
      const relevantFields = introspectResult.__type.fields.filter(
        (f) =>
          f.name.toLowerCase().includes('provider') ||
          f.name.toLowerCase().includes('operator') ||
          f.name.toLowerCase().includes('supplier') ||
          f.name.toLowerCase().includes('vendor') ||
          f.name.toLowerCase().includes('actor')
      );

      if (relevantFields.length > 0) {
        console.log('\nProvider/Operator related fields:');
        for (const field of relevantFields) {
          const typeName =
            field.type.name || `${field.type.kind}(${field.type.ofType?.name || '?'})`;
          console.log(`  - ${field.name}: ${typeName}`);
        }
      } else {
        console.log('\nNo provider/operator related fields found. All fields:');
        for (const field of introspectResult.__type.fields) {
          const typeName =
            field.type.name || `${field.type.kind}(${field.type.ofType?.name || '?'})`;
          console.log(`  - ${field.name}: ${typeName}`);
        }
      }
    } else {
      console.log('Could not introspect Product type');
    }

    // Also check ProductDetail type if it exists
    console.log('\n--- Step 4: Check for ProductDetail type ---');
    const introspectProductDetailQuery = gql`
      query IntrospectProductDetail {
        __type(name: "ProductDetail") {
          name
          fields {
            name
            type {
              name
              kind
            }
          }
        }
      }
    `;

    const pdResult = await client.request<{
      __type: {
        name: string;
        fields: { name: string; type: { name: string; kind: string } }[];
      } | null;
    }>(introspectProductDetailQuery);

    if (pdResult.__type) {
      console.log(`ProductDetail type has ${pdResult.__type.fields.length} fields`);
      const providerField = pdResult.__type.fields.find((f) => f.name === 'provider');
      if (providerField) {
        console.log(`  Found provider field: ${providerField.type.name}`);
      }
    } else {
      console.log('ProductDetail type does not exist');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

introspectHolibob();
