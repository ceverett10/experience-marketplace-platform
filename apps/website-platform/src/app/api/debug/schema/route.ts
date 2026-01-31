/**
 * Debug endpoint to introspect Holibob GraphQL schema
 * GET /api/debug/schema - Returns schema information for key types
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';

export async function GET(request: NextRequest) {
  try {
    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Introspect multiple types
    const introspectionQuery = `
      query IntrospectSchema {
        bookingInput: __type(name: "BookingInput") {
          name
          kind
          inputFields {
            name
            type {
              name
              kind
              ofType {
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
        bookingQuestionAnswerInput: __type(name: "BookingQuestionAnswerInput") {
          name
          kind
          inputFields {
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
        bookingAvailabilityInput: __type(name: "BookingAvailabilityInput") {
          name
          kind
          inputFields {
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
        bookingPersonInput: __type(name: "BookingPersonInput") {
          name
          kind
          inputFields {
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
        questionAnswerInput: __type(name: "QuestionAnswerInput") {
          name
          kind
          inputFields {
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

    const result = await (client as any).client.request(introspectionQuery);

    // Also get the booking query signature
    const queryIntrospection = `
      query IntrospectBookingQuery {
        __type(name: "Query") {
          fields {
            name
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
          }
        }
      }
    `;

    const queryResult = await (client as any).client.request(queryIntrospection);

    // Find the booking query specifically
    const bookingQuery = queryResult.__type?.fields?.find((f: any) => f.name === 'booking');

    return NextResponse.json({
      success: true,
      data: {
        types: result,
        bookingQueryArgs: bookingQuery?.args || [],
      },
    });
  } catch (error) {
    console.error('Schema introspection error:', error);
    return NextResponse.json(
      {
        error: 'Failed to introspect schema',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
