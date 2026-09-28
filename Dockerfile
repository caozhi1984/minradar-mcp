# A registry has to be able to build this and check that the server starts and
# answers introspection. Nothing is installed: the bridge has no dependencies,
# so the image is small and there is no build step to fail.
FROM node:20-alpine
WORKDIR /app
COPY index.js package.json ./
ENV MINRADAR_MCP_URL=https://minradar.com/mcp
# stdio transport: the client speaks over this container's stdin/stdout.
ENTRYPOINT ["node", "index.js"]
