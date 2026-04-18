import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

export const client = new ApolloClient({
  link: new HttpLink({ uri: "http://localhost:5000/graphql" }),
  cache: new InMemoryCache({
    typePolicies: {
      MaterialType: { keyFields: ["material"] },
      FinalProduct:  { keyFields: ["material"] },
      RawMaterial:   { keyFields: ["material"] },
    },
  }),
  defaultOptions: {
    watchQuery: { fetchPolicy: "cache-and-network" },
  },
});
