/**
 * Introspect Holibob GraphQL schema to understand available queries
 * Run with: npx tsx scripts/introspect-holibob-schema.ts
 */

import { GraphQLClient, gql } from 'graphql-request';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const INTROSPECTION_QUERY = gql`
  query IntrospectProviderAndProductList {
    __type(name: "Queries") {
      fields {
        name
        description
        args {
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
        type {
          name
          kind
          ofType {
            name
          }
        }
      }
    }
  }
`;

const PROVIDER_TYPE_QUERY = gql`
  query IntrospectProviderType {
    __type(name: "Provider") {
      name
      fields {
        name
        type {
          name
          kind
          ofType {
            name
          }
        }
      }
    }
  }
`;

const PROVIDER_LIST_TYPE_QUERY = gql`
  query IntrospectProviderListType {
    __type(name: "ProviderList") {
      name
      fields {
        name
        type {
          name
          kind
          ofType {
            name
          }
        }
      }
    }
  }
`;

const PRODUCT_LIST_TYPE_QUERY = gql`
  query IntrospectProductListType {
    __type(name: "ProductList") {
      name
      fields {
        name
        type {
          name
          kind
          ofType {
            name
          }
        }
      }
    }
  }
`;

async function main() {
  const apiUrl = process.env.HOLIBOB_API_URL;
  const partnerId = process.env.HOLIBOB_PARTNER_ID;
  const apiKey = process.env.HOLIBOB_API_KEY;

  if (!apiUrl || !partnerId || !apiKey) {
    console.error('Missing Holibob API configuration');
    process.exit(1);
  }

  const client = new GraphQLClient(apiUrl, {
    headers: {
      'X-API-Key': apiKey,
      'X-Partner-Id': partnerId,
    },
  });

  console.log('='.repeat(60));
  console.log('Introspecting Holibob GraphQL Schema');
  console.log('='.repeat(60));

  // Check for providerList and productList queries
  try {
    console.log('\n--- Checking available queries containing "provider" or "product" ---\n');
    const result = await client.request<{
      __type: {
        fields: Array<{
          name: string;
          description: string;
          args: Array<{ name: string; type: { name: string; kind: string } }>;
        }>;
      };
    }>(INTROSPECTION_QUERY);

    const relevantFields = result.__type.fields.filter(
      (f) =>
        f.name.toLowerCase().includes('provider') || f.name.toLowerCase().includes('productlist')
    );

    for (const field of relevantFields) {
      console.log(`Query: ${field.name}`);
      console.log(`  Description: ${field.description || 'N/A'}`);
      console.log(`  Args:`);
      for (const arg of field.args || []) {
        console.log(`    - ${arg.name}: ${arg.type.name || arg.type.kind}`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('Error introspecting queries:', error);
  }

  // Check Provider type
  try {
    console.log('\n--- Provider Type Fields ---\n');
    const result = await client.request<{
      __type: { name: string; fields: Array<{ name: string; type: { name: string } }> };
    }>(PROVIDER_TYPE_QUERY);

    if (result.__type) {
      for (const field of result.__type.fields || []) {
        console.log(`  ${field.name}: ${field.type.name || 'unknown'}`);
      }
    } else {
      console.log('Provider type not found');
    }
  } catch (error) {
    console.error('Error introspecting Provider type:', error);
  }

  // Check ProviderList type
  try {
    console.log('\n--- ProviderList Type Fields ---\n');
    const result = await client.request<{
      __type: { name: string; fields: Array<{ name: string; type: { name: string } }> };
    }>(PROVIDER_LIST_TYPE_QUERY);

    if (result.__type) {
      for (const field of result.__type.fields || []) {
        console.log(`  ${field.name}: ${field.type.name || 'unknown'}`);
      }
    } else {
      console.log('ProviderList type not found');
    }
  } catch (error) {
    console.error('Error introspecting ProviderList type:', error);
  }

  // Check ProductList type
  try {
    console.log('\n--- ProductList Type Fields ---\n');
    const result = await client.request<{
      __type: { name: string; fields: Array<{ name: string; type: { name: string } }> };
    }>(PRODUCT_LIST_TYPE_QUERY);

    if (result.__type) {
      for (const field of result.__type.fields || []) {
        console.log(`  ${field.name}: ${field.type.name || 'unknown'}`);
      }
    } else {
      console.log('ProductList type not found');
    }
  } catch (error) {
    console.error('Error introspecting ProductList type:', error);
  }

  // Try a simple providerList query with minimal fields
  console.log('\n--- Testing Simple providerList Query ---\n');
  try {
    const simpleQuery = gql`
      query SimpleProviderList {
        providerList {
          recordCount
          nodes {
            id
            name
          }
        }
      }
    `;
    const result = await client.request<{
      providerList: { recordCount: number; nodes: Array<{ id: string; name: string }> };
    }>(simpleQuery);
    console.log(`Total providers: ${result.providerList.recordCount}`);
    console.log(`First 5 providers:`);
    for (const provider of result.providerList.nodes.slice(0, 5)) {
      console.log(`  - ${provider.name} (${provider.id})`);
    }
  } catch (error) {
    console.error(
      'Error with simple providerList query:',
      error instanceof Error ? error.message : error
    );
  }

  // Try productList query
  console.log('\n--- Testing Simple productList Query ---\n');
  try {
    const simpleQuery = gql`
      query SimpleProductList {
        productList {
          recordCount
          nodes {
            id
            name
            provider {
              id
              name
            }
          }
        }
      }
    `;
    const result = await client.request<{
      productList: {
        recordCount: number;
        nodes: Array<{ id: string; name: string; provider: { id: string; name: string } }>;
      };
    }>(simpleQuery);
    console.log(`Total products: ${result.productList.recordCount}`);
    console.log(`First 5 products:`);
    for (const product of result.productList.nodes.slice(0, 5)) {
      console.log(`  - ${product.name}`);
      console.log(
        `    Provider: ${product.provider?.name ?? 'N/A'} (${product.provider?.id ?? 'N/A'})`
      );
    }
  } catch (error) {
    console.error(
      'Error with simple productList query:',
      error instanceof Error ? error.message : error
    );
  }
}

main().catch(console.error);
