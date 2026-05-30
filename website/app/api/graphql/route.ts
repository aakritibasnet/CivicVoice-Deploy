import { ApolloServer } from "@apollo/server";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { NextRequest } from "next/server";
import typeDefs from "@/src/graphql/schema";
import { resolvers } from "@/src/graphql/resolvers";
import { createContext, GQLContext } from "@/src/graphql/context";

const server = new ApolloServer<GQLContext>({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV === "development",
  formatError: (error) => {
    console.error("GraphQL Error:", error);
    return {
      message: error.message,
      locations: error.locations,
      path: error.path,
      ...(process.env.NODE_ENV === "development" && {
        extensions: error.extensions,
      }),
    };
  },
});

const handler = startServerAndCreateNextHandler<NextRequest, GQLContext>(server, {
  context: async (req) => createContext(req),
});

type RouteContext = {
  params: Promise<Record<string, never>>;
};

export async function GET(request: NextRequest, _context: RouteContext) {
  return handler(request);
}

export async function POST(request: NextRequest, _context: RouteContext) {
  return handler(request);
}
