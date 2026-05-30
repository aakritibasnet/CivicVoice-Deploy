import { DateTimeResolver, JSONResolver } from "graphql-scalars";
import { analyticsResolvers } from "./analytics.resolver";
import { authResolvers } from "./auth.resolver";
import { kanbanResolvers } from "./kanban.resolver";
import { municipalityResolvers } from "./municipality.resolver";
import { officerResolvers } from "./officer.resolver";
import { notificationResolvers } from "./notification.resolver";
import { reportPostsResolvers } from "./report-posts.resolver";

export const resolvers = {
  DateTime: DateTimeResolver,
  JSON: JSONResolver,

  Query: {
    ...analyticsResolvers.Query,
    ...authResolvers.Query,
    ...kanbanResolvers.Query,
    ...municipalityResolvers.Query,
    ...officerResolvers.Query,
    ...notificationResolvers.Query,
    ...reportPostsResolvers.Query,
  },

  Mutation: {
    ...analyticsResolvers.Mutation,
    ...authResolvers.Mutation,
    ...kanbanResolvers.Mutation,
    ...officerResolvers.Mutation,
    ...notificationResolvers.Mutation,
    ...reportPostsResolvers.Mutation,
  },

  KanbanColumn: kanbanResolvers.KanbanColumn,
  User: authResolvers.User,
  Ward: authResolvers.Ward,
};
