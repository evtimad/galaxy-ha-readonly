ARG BUILD_FROM
FROM ${BUILD_FROM}
RUN apk add --no-cache nodejs
COPY rootfs /
WORKDIR /app
CMD ["node", "/app/server.js"]
