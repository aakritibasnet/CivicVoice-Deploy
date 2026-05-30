"use client";

import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  from,
  ApolloLink,
} from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { onError } from "@apollo/client/link/error";
import { useMemo } from "react";
import { useAuthStore } from "@/src/store/auth-store";

export function ApolloProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = useAuthStore((state) => state.token);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const client = useMemo(() => {
    const errorLink = onError((errorContext) => {
      const graphQLErrors =
        "graphQLErrors" in errorContext && Array.isArray(errorContext.graphQLErrors)
          ? errorContext.graphQLErrors
          : undefined;
      const networkError =
        "networkError" in errorContext ? errorContext.networkError : undefined;

      if (graphQLErrors) {
        graphQLErrors.forEach((graphQLError) => {
          const message =
            "message" in graphQLError && typeof graphQLError.message === "string"
              ? graphQLError.message
              : "GraphQL error";
          const path =
            "path" in graphQLError && Array.isArray(graphQLError.path)
              ? graphQLError.path.join(".")
              : "";

          console.error(`[GraphQL Error]: ${message} (path: ${path})`);

          if (
            message.includes("Not authenticated") ||
            message.includes("Unauthorized")
          ) {
            if (typeof window !== "undefined") {
              clearAuth();
              window.location.href = "/auth/login";
            }
          }
        });
      }

      if (networkError) {
        console.error("[Network Error]:", networkError);
      }
    });

    const authLink = new ApolloLink((operation, forward) => {
      const persistedToken =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      operation.setContext({
        headers: {
          authorization: token || persistedToken ? `Bearer ${token ?? persistedToken}` : "",
        },
      });

      return forward(operation);
    });

    const httpLink = new HttpLink({
      uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || "/api/graphql",
    });

    return new ApolloClient({
      link: from([errorLink, authLink, httpLink]),
      cache: new InMemoryCache({
        typePolicies: {
          KanbanColumn: {
            fields: {
              reports: {
                merge: false,
              },
            },
          },
        },
      }),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: "cache-and-network",
          errorPolicy: "all",
        },
        mutate: {
          errorPolicy: "all",
        },
      },
    });
  }, [token, clearAuth]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
