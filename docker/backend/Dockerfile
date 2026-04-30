FROM node:20-alpine
WORKDIR /app
COPY docker/backend/package*.json .
RUN npm ci --omit=dev
COPY docker/backend/*.js .
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
