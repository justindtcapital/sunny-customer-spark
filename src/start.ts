import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// TanStack Start expects this named export during client hydration.
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}));
